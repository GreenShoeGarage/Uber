import { formatMac, i8, toHex } from '../utils/binary.js';
import { LL_CONTROL_NAMES, channelMapFromBytes, parseLlControl, parseExtendedAdvertising, observedAdvertisingProperties } from './advanced.js';

export const BLE_ADV_ACCESS_ADDRESS = 0x8e89bed6;

const PDU_NAMES = Object.freeze({
  0: 'ADV_IND',
  1: 'ADV_DIRECT_IND',
  2: 'ADV_NONCONN_IND',
  3: 'SCAN_REQ',
  4: 'SCAN_RSP',
  5: 'CONNECT_IND',
  6: 'ADV_SCAN_IND',
  7: 'ADV_EXT_IND'
});

const AD_TYPE_NAMES = Object.freeze({
  0x01: 'Flags',
  0x02: 'Incomplete 16-bit Service UUIDs',
  0x03: 'Complete 16-bit Service UUIDs',
  0x04: 'Incomplete 32-bit Service UUIDs',
  0x05: 'Complete 32-bit Service UUIDs',
  0x06: 'Incomplete 128-bit Service UUIDs',
  0x07: 'Complete 128-bit Service UUIDs',
  0x08: 'Shortened Local Name',
  0x09: 'Complete Local Name',
  0x0a: 'TX Power Level',
  0x16: 'Service Data — 16-bit UUID',
  0x19: 'Appearance',
  0x20: 'Service Data — 32-bit UUID',
  0x21: 'Service Data — 128-bit UUID',
  0xff: 'Manufacturer Specific Data'
});

const FLAG_NAMES = Object.freeze([
  [0x01, 'LE Limited Discoverable'],
  [0x02, 'LE General Discoverable'],
  [0x04, 'BR/EDR Not Supported'],
  [0x08, 'Simultaneous LE/BR-EDR Controller'],
  [0x10, 'Simultaneous LE/BR-EDR Host']
]);

function parseConnectionRequest(pdu, header0) {
  if (pdu.length < 34) return null;
  const view = new DataView(pdu.buffer, pdu.byteOffset, pdu.byteLength);
  const accessAddress = view.getUint32(12, true);
  const crcInit = pdu.slice(16, 19);
  const channelMapBytes = pdu.slice(28, 33);
  const hopSca = pdu[33];
  return {
    initiator: formatMac(pdu.slice(0, 6), true),
    initiatorAddressType: header0 & 0x40 ? 'Random/private possible' : 'Public',
    advertiser: formatMac(pdu.slice(6, 12), true),
    advertiserAddressType: header0 & 0x80 ? 'Random/private possible' : 'Public',
    accessAddress,
    accessAddressHex: hex(accessAddress, 8),
    crcInitHex: toHex(crcInit).toUpperCase(),
    windowSize: pdu[19],
    windowOffset: view.getUint16(20, true),
    intervalUnits: view.getUint16(22, true),
    intervalMs: view.getUint16(22, true) * 1.25,
    latency: view.getUint16(24, true),
    supervisionTimeoutUnits: view.getUint16(26, true),
    supervisionTimeoutMs: view.getUint16(26, true) * 10,
    channelMapHex: toHex(channelMapBytes).toUpperCase(),
    channelMap: channelMapFromBytes(channelMapBytes),
    hopIncrement: hopSca & 0x1f,
    sleepClockAccuracy: (hopSca >> 5) & 0x07
  };
}

export function frequencyToBleChannel(frequency) {
  if (frequency === 2402) return 37;
  if (frequency === 2426) return 38;
  if (frequency === 2480) return 39;
  if (frequency >= 2404 && frequency <= 2424 && frequency % 2 === 0) return (frequency - 2404) / 2;
  if (frequency >= 2428 && frequency <= 2478 && frequency % 2 === 0) return 11 + (frequency - 2428) / 2;
  return null;
}

export function bleChannelToFrequency(channel) {
  if (channel === 37) return 2402;
  if (channel === 38) return 2426;
  if (channel === 39) return 2480;
  if (channel >= 0 && channel <= 10) return 2404 + channel * 2;
  if (channel >= 11 && channel <= 36) return 2428 + (channel - 11) * 2;
  return null;
}

function hex(value, width) {
  return `0x${Number(value >>> 0).toString(16).padStart(width, '0').toUpperCase()}`;
}

function uuid16(bytes) {
  if (bytes.length < 2) return null;
  return hex(bytes[0] | (bytes[1] << 8), 4);
}

function uuid32(bytes) {
  if (bytes.length < 4) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  return hex(v, 8);
}

function uuid128(bytes) {
  if (bytes.length < 16) return null;
  const reversed = Array.from(bytes.slice(0, 16)).reverse();
  const h = reversed.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function decodeUuidList(bytes, width) {
  const out = [];
  for (let i = 0; i + width <= bytes.length; i += width) {
    const part = bytes.slice(i, i + width);
    const value = width === 2 ? uuid16(part) : width === 4 ? uuid32(part) : uuid128(part);
    if (value) out.push(value);
  }
  return out;
}

function text(bytes) {
  try { return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\0+$/g, ''); }
  catch (_) { return ''; }
}

function decodeFlags(value) {
  if (value === null || value === undefined) return [];
  return FLAG_NAMES.filter(([bit]) => value & bit).map(([, name]) => name);
}

function fieldRange(baseRawOffset, structureOffset, len) {
  const start = baseRawOffset + structureOffset;
  return { start, end: start + len };
}

/** Decode GAP advertising data while preserving the exact source-byte range. */
export function decodeAdvertisingData(bytes, baseRawOffset = 0) {
  const result = {
    localName: null,
    localNameComplete: false,
    manufacturerData: null,
    manufacturerCompanyId: null,
    serviceUuids: [],
    serviceData: [],
    flags: null,
    flagNames: [],
    txPower: null,
    appearance: null,
    fields: [],
    malformed: false
  };

  for (let i = 0; i < bytes.length;) {
    const len = bytes[i];
    if (!len) break;
    const structureEnd = i + 1 + len;
    if (structureEnd > bytes.length || len < 1) { result.malformed = true; break; }
    const type = bytes[i + 1];
    const value = bytes.slice(i + 2, structureEnd);
    const range = fieldRange(baseRawOffset, i, len + 1);
    const field = {
      type,
      typeHex: hex(type, 2),
      name: AD_TYPE_NAMES[type] ?? `AD type ${hex(type, 2)}`,
      rawHex: toHex(value).toUpperCase(),
      value: null,
      byteRange: range
    };

    if (type === 0x01 && value.length) {
      result.flags = value[0];
      result.flagNames = decodeFlags(value[0]);
      field.value = `${hex(value[0], 2)} · ${result.flagNames.join(', ') || 'No known flags set'}`;
    } else if (type === 0x08 || type === 0x09) {
      const name = text(value);
      if (type === 0x09 || !result.localName) {
        result.localName = name;
        result.localNameComplete = type === 0x09;
      }
      field.value = name;
    } else if (type === 0x02 || type === 0x03) {
      const uuids = decodeUuidList(value, 2); result.serviceUuids.push(...uuids); field.value = uuids.join(', ');
    } else if (type === 0x04 || type === 0x05) {
      const uuids = decodeUuidList(value, 4); result.serviceUuids.push(...uuids); field.value = uuids.join(', ');
    } else if (type === 0x06 || type === 0x07) {
      const uuids = decodeUuidList(value, 16); result.serviceUuids.push(...uuids); field.value = uuids.join(', ');
    } else if (type === 0x0a && value.length) {
      result.txPower = i8(value[0]); field.value = `${result.txPower} dBm (advertised)`;
    } else if (type === 0x19 && value.length >= 2) {
      result.appearance = value[0] | (value[1] << 8); field.value = `${result.appearance} (${hex(result.appearance, 4)})`;
    } else if (type === 0xff && value.length >= 2) {
      result.manufacturerCompanyId = value[0] | (value[1] << 8);
      result.manufacturerData = toHex(value).toUpperCase();
      field.value = `Company ${hex(result.manufacturerCompanyId, 4)} · ${toHex(value.slice(2)).toUpperCase() || 'no payload'}`;
    } else if ([0x16, 0x20, 0x21].includes(type)) {
      const width = type === 0x16 ? 2 : type === 0x20 ? 4 : 16;
      const uuid = width === 2 ? uuid16(value) : width === 4 ? uuid32(value) : uuid128(value);
      const payload = value.slice(width);
      if (uuid) {
        const service = { uuid, dataHex: toHex(payload).toUpperCase(), byteRange: range };
        result.serviceData.push(service);
        result.serviceUuids.push(uuid);
        field.value = `${uuid}${payload.length ? ` · ${service.dataHex}` : ''}`;
      }
    }

    if (field.value === null) field.value = field.rawHex || '—';
    result.fields.push(field);
    i = structureEnd;
  }
  result.serviceUuids = [...new Set(result.serviceUuids)];
  return result;
}

function addressInfo(pduType, pdu, header0) {
  if (pdu.length < 6) return { address: null, role: null, random: null, offset: null };
  // AdvA is first for legacy advertiser-originated PDUs, second for SCAN_REQ/CONNECT_IND.
  if ([0, 1, 2, 4, 6].includes(pduType)) {
    return { address: formatMac(pdu.slice(0, 6), true), role: 'Advertiser', random: Boolean(header0 & 0x40), offset: 0 };
  }
  if ([3, 5].includes(pduType) && pdu.length >= 12) {
    return { address: formatMac(pdu.slice(6, 12), true), role: 'Advertiser target', random: Boolean(header0 & 0x80), offset: 6 };
  }
  return { address: null, role: null, random: null, offset: null };
}

export function parseBlePacket(packet) {
  const data = packet.payload;
  if (data.length < 6) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const accessAddress = view.getUint32(0, true);
  const header0 = data[4];
  const header1 = data[5];
  const pduType = header0 & 0x0f;
  const isAdvertising = accessAddress === BLE_ADV_ACCESS_ADDRESS;
  const length = isAdvertising ? (header1 & 0x3f) : header1;
  const pduEnd = Math.min(6 + length, data.length);
  const pdu = data.slice(6, pduEnd);
  const truncated = (6 + length) > data.length;
  const extendedAdvertising = isAdvertising && pduType === 7 ? parseExtendedAdvertising(pdu, header0, 20) : null;
  let addressInfoValue = isAdvertising ? addressInfo(pduType, pdu, header0) : { address: null, role: null, random: null, offset: null };
  if (extendedAdvertising?.advertiserAddress) addressInfoValue = { address: extendedAdvertising.advertiserAddress, role:'Extended advertiser', random:Boolean(header0 & 0x40), offset:null };
  const address = addressInfoValue.address;
  const adEligible = isAdvertising && address && [0, 2, 4, 6].includes(pduType) && pdu.length > 6;
  // USB bytes 0–13 are usb_pkt_rx metadata. BLE bytes begin at raw byte 14.
  // AA=14–17, LL header=18–19, PDU=20…. Legacy AD structures follow AdvA at raw byte 26.
  const ad = extendedAdvertising
    ? decodeAdvertisingData(extendedAdvertising.advertisingData, extendedAdvertising.advertisingDataRawOffset ?? 21)
    : adEligible ? decodeAdvertisingData(pdu.slice(6), 26) : decodeAdvertisingData(new Uint8Array(), 26);
  const connection = isAdvertising && pduType === 5 ? parseConnectionRequest(pdu, header0) : null;
  const llid = isAdvertising ? null : (header0 & 0x03);
  const llControl = !isAdvertising && llid === 3 && pdu.length ? parseLlControl(pdu, 20) : null;
  const controlOpcode = llControl?.opcode ?? null;
  const controlName = llControl?.name ?? null;
  const crcPayloadOffset = 6 + length;
  const crcAvailable = crcPayloadOffset + 3 <= data.length;
  const crc = crcAvailable ? data.slice(crcPayloadOffset, crcPayloadOffset + 3) : new Uint8Array();

  const provenance = [
    { key: 'accessAddress', label: 'Access address', start: 14, end: 18, value: hex(accessAddress, 8) },
    { key: 'header', label: 'Link Layer header', start: 18, end: 20, value: `${hex(header0,2)} ${hex(header1,2)}` },
    { key: 'pduType', label: isAdvertising ? 'Advertising PDU type' : 'LL data header', start: 18, end: 19, value: isAdvertising ? (PDU_NAMES[pduType] ?? `PDU_${pduType}`) : hex(header0, 2) },
    { key: 'length', label: 'Payload length', start: 19, end: 20, value: String(length) }
  ];
  if (address && addressInfoValue.offset !== null) {
    provenance.push({ key: 'address', label: addressInfoValue.role ?? 'Address', start: 20 + addressInfoValue.offset, end: 26 + addressInfoValue.offset, value: address });
  }
  for (const field of ad.fields) provenance.push({ key: `ad-${field.byteRange.start}`, label: field.name, start: field.byteRange.start, end: field.byteRange.end, value: field.value });
  if (connection) {
    provenance.push(
      { key:'conn-init', label:'CONNECT_IND initiator', start:20, end:26, value:connection.initiator },
      { key:'conn-adv', label:'CONNECT_IND advertiser', start:26, end:32, value:connection.advertiser },
      { key:'conn-aa', label:'Connection access address', start:32, end:36, value:connection.accessAddressHex },
      { key:'conn-crc-init', label:'Connection CRC init', start:36, end:39, value:connection.crcInitHex },
      { key:'conn-interval', label:'Connection interval', start:42, end:44, value:`${connection.intervalMs} ms` },
      { key:'conn-latency', label:'Connection latency', start:44, end:46, value:String(connection.latency) },
      { key:'conn-timeout', label:'Supervision timeout', start:46, end:48, value:`${connection.supervisionTimeoutMs} ms` },
      { key:'conn-map', label:'Data channel map', start:48, end:53, value:connection.channelMap.join(', ') },
      { key:'conn-hop', label:'Hop increment / SCA', start:53, end:54, value:`hop ${connection.hopIncrement} / SCA ${connection.sleepClockAccuracy}` }
    );
  }
  if (extendedAdvertising) provenance.push(...extendedAdvertising.provenance);
  if (!isAdvertising) {
    provenance.push({ key:'llid', label:'LLID / data header', start:18, end:19, value:`LLID ${llid}` });
    if (llControl) provenance.push(...llControl.provenance);
  }
  if (crcAvailable) provenance.push({ key: 'crc', label: 'CRC bytes', start: 14 + crcPayloadOffset, end: 14 + crcPayloadOffset + 3, value: toHex(crc).toUpperCase() });

  return {
    accessAddress,
    accessAddressHex: hex(accessAddress, 8),
    isAdvertising,
    pduType,
    pduTypeName: isAdvertising ? (PDU_NAMES[pduType] ?? `PDU_${pduType}`) : (controlName ?? 'DATA'),
    llid,
    controlOpcode,
    controlName,
    llControl,
    connection,
    extendedAdvertising,
    txAddressRandom: Boolean(header0 & 0x40),
    rxAddressRandom: Boolean(header0 & 0x80),
    length,
    truncated,
    malformed: truncated || ad.malformed || Boolean(extendedAdvertising?.malformed) || Boolean(llControl?.malformed),
    address,
    addressRole: addressInfoValue.role,
    addressType: addressInfoValue.random === null ? 'Unknown' : addressInfoValue.random ? 'Random/private possible' : 'Public',
    localName: ad.localName,
    localNameComplete: ad.localNameComplete,
    manufacturerData: ad.manufacturerData,
    manufacturerCompanyId: ad.manufacturerCompanyId,
    serviceUuids: ad.serviceUuids,
    serviceData: ad.serviceData,
    flags: ad.flags,
    flagNames: ad.flagNames,
    txPower: ad.txPower,
    appearance: ad.appearance,
    advertisingData: ad,
    advertisingProperties: observedAdvertisingProperties({ isAdvertising, pduTypeName: PDU_NAMES[pduType] ?? `PDU_${pduType}`, extendedAdvertising }),
    bleChannel: frequencyToBleChannel(packet.frequency),
    crcHex: crcAvailable ? toHex(crc).toUpperCase() : null,
    provenance,
    pdu
  };
}

export function pduTypeName(type) {
  return PDU_NAMES[type] ?? `PDU_${type}`;
}
