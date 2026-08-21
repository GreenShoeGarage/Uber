import { APP_NAME, APP_VERSION } from '../version.js';
import { CAPTURE_SCHEMA } from './replay.js';
import { downloadBlob, toHexCompact } from '../utils/binary.js';
import { buildBlePcap, buildBlePcapng, pcapEligiblePackets, LINKTYPE_BLUETOOTH_LE_LL_WITH_PHDR } from './pcap.js';

function serializableBle(ble) {
  if (!ble) return null;
  return {
    accessAddress: ble.accessAddress,
    accessAddressHex: ble.accessAddressHex,
    isAdvertising: ble.isAdvertising,
    pduType: ble.pduType,
    pduTypeName: ble.pduTypeName,
    llid: ble.llid,
    controlOpcode: ble.controlOpcode,
    controlName: ble.controlName,
    connection: ble.connection ? { ...ble.connection, channelMap: [...(ble.connection.channelMap ?? [])] } : null,
    txAddressRandom: ble.txAddressRandom,
    rxAddressRandom: ble.rxAddressRandom,
    length: ble.length,
    truncated: ble.truncated,
    malformed: ble.malformed,
    address: ble.address,
    addressRole: ble.addressRole,
    addressType: ble.addressType,
    localName: ble.localName,
    localNameComplete: ble.localNameComplete,
    manufacturerData: ble.manufacturerData,
    manufacturerCompanyId: ble.manufacturerCompanyId,
    serviceUuids: [...(ble.serviceUuids ?? [])],
    serviceData: (ble.serviceData ?? []).map(item => ({ uuid: item.uuid, dataHex: item.dataHex, byteRange: item.byteRange })),
    flags: ble.flags,
    flagNames: [...(ble.flagNames ?? [])],
    txPower: ble.txPower,
    appearance: ble.appearance,
    bleChannel: ble.bleChannel,
    crcHex: ble.crcHex,
    advertisingFields: (ble.advertisingData?.fields ?? []).map(field => ({
      type: field.type, typeHex: field.typeHex, name: field.name, value: field.value, rawHex: field.rawHex, byteRange: field.byteRange
    })),
    provenance: (ble.provenance ?? []).map(field => ({ ...field }))
  };
}


function serializableClassic(classic) {
  if (!classic) return null;
  return {
    engine: classic.engine, evidence: classic.evidence, lap: classic.lap, lapHex: classic.lapHex, acErrors: classic.acErrors,
    bitOffset: classic.bitOffset, channel: classic.channel, frequency: classic.frequency, localClkn: classic.localClkn, clkOffset: classic.clkOffset,
    headerPresent: Boolean(classic.headerPresent), headerCandidateCount: classic.headerCandidateCount ?? 0,
    selectedHeader: classic.selectedHeader ? { ...classic.selectedHeader } : null,
    rankedUaps: (classic.rankedUaps ?? []).map(item => ({ ...item })),
    provenance: classic.provenance ? { accessCode:{...classic.provenance.accessCode}, header:{...classic.provenance.header} } : null
  };
}

function serializablePacket(p) {
  return {
    id: p.id,
    receivedAt: p.receivedAt,
    wallTime: p.wallTime,
    type: p.type,
    typeName: p.typeName,
    status: p.status,
    statusFlags: p.statusFlags,
    channelOffset: p.channelOffset,
    frequency: p.frequency,
    clknHigh: p.clknHigh,
    clock100ns: p.clock100ns,
    rssiMaxRaw: p.rssiMaxRaw,
    rssiMinRaw: p.rssiMinRaw,
    rssiAverageRaw: p.rssiAverageRaw,
    rssiMax: p.rssiMax,
    rssiMin: p.rssiMin,
    rssiAverage: p.rssiAverage,
    rssiCount: p.rssiCount,
    rssiMetadataAvailable: Boolean(p.rssiMetadataAvailable),
    rssiCountValid: Boolean(p.rssiCountValid),
    rssiSource: p.rssiSource ?? 'Unavailable',
    ble: serializableBle(p.ble),
    classic: serializableClassic(p.classic),
    annotation: {
      bookmarked: Boolean(p.annotation?.bookmarked),
      note: String(p.annotation?.note ?? ''),
      tags: [...(p.annotation?.tags ?? [])]
    },
    rawHex: toHexCompact(p.raw)
  };
}

export function captureJson(recorder, metadata = {}) {
  const stats = recorder.stats();
  const id = recorder.sessionId ?? `capture-${recorder.startedAt ?? Date.now()}`;
  const name = recorder.sessionName ?? `Capture ${new Date(recorder.startedAt ?? Date.now()).toLocaleString()}`;
  return {
    schema: CAPTURE_SCHEMA,
    application: { name: APP_NAME, version: APP_VERSION },
    id,
    name,
    session: {
      id,
      name,
      source: recorder.source ?? 'live',
      createdAt: recorder.createdAt ?? recorder.startedAt,
      startedAt: recorder.startedAt,
      stoppedAt: recorder.stoppedAt,
      mode: recorder.mode,
      selectedChannels: [...(recorder.selectedChannels ?? [])]
    },
    exportedAt: new Date().toISOString(),
    metadata,
    stats,
    events: recorder.events.toArray().map(event => ({ ...event })),
    packets: recorder.packets.toArray().map(serializablePacket)
  };
}


export function exportCaptureDocument(document) {
  const name = String(document?.name ?? 'ubertooth-capture').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'ubertooth-capture';
  downloadBlob(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }), `${name}-${timestamp()}.json`);
}
export function exportCaptureJson(recorder, metadata = {}) {
  const doc = captureJson(recorder, metadata);
  downloadBlob(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), `ubertooth-capture-${timestamp()}.json`);
}

export function exportPacketsCsv(recorder) {
  const header = ['id','receivedAt','type','frequencyMHz','bleChannel','classicChannel','rssiDbm','accessAddress','pduType','address','classicLap','classicUap','classicPacketType','addressType','localName','manufacturerCompanyId','serviceUuids','length','status','bookmarked','tags','note'];
  const rows = recorder.packets.toArray().map(p => [
    p.id, p.wallTime ?? p.receivedAt, p.typeName, p.frequency, p.ble?.bleChannel ?? '', p.classic?.channel ?? '', p.rssiMax ?? '',
    p.ble?.accessAddressHex ?? '', p.ble?.pduTypeName ?? '', p.ble?.address ?? '', p.classic?.lapHex ?? '', p.classic?.selectedHeader?.uapHex ?? '', p.classic?.selectedHeader?.typeName ?? '', p.ble?.addressType ?? '',
    p.ble?.localName ?? '', p.ble?.manufacturerCompanyId === null || p.ble?.manufacturerCompanyId === undefined ? '' : `0x${p.ble.manufacturerCompanyId.toString(16).padStart(4,'0').toUpperCase()}`,
    (p.ble?.serviceUuids ?? []).join(';'), p.ble?.length ?? '', p.status,
    p.annotation?.bookmarked ? 'yes' : 'no', (p.annotation?.tags ?? []).join(';'), p.annotation?.note ?? ''
  ]);
  const csv = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv' }), `ubertooth-packets-${timestamp()}.csv`);
}

export function exportDeviceInventoryCsv(devices, activityResolver, pinSet = new Set(), hiddenSet = new Set()) {
  const header = ['address','addressType','name','activity','firstSeen','lastSeen','packets','rssiDbm','averageRssiDbm','peakRssiDbm','channels','pduTypes','manufacturerCompanyId','manufacturerData','serviceUuids','scanResponseSeen','txPower','appearance','pinned','hidden'];
  const rows = devices.map(d => [
    d.address, d.addressType, d.localName ?? '', activityResolver(d), d.firstSeen, d.lastSeen, d.packetCount,
    d.rssi ?? '', d.averageRssi === null || d.averageRssi === undefined ? '' : d.averageRssi.toFixed(1), Number.isFinite(d.strongestRssi) ? d.strongestRssi : '',
    Array.from(d.channels ?? []).sort((a,b)=>a-b).join(';'), Array.from(d.pduTypes ?? []).join(';'),
    d.manufacturerCompanyId === null || d.manufacturerCompanyId === undefined ? '' : `0x${d.manufacturerCompanyId.toString(16).padStart(4,'0').toUpperCase()}`,
    d.manufacturerData ?? '', Array.from(d.serviceUuids ?? []).join(';'), d.scanResponseSeen ? 'yes' : 'no', d.txPower ?? '', d.appearance ?? '',
    pinSet.has(d.address) ? 'yes' : 'no', hiddenSet.has(d.address) ? 'yes' : 'no'
  ]);
  const csv = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv' }), `ubertooth-devices-${timestamp()}.csv`);
}

export function exportSpectrumCsv(model, metadata = {}) {
  const markerByFrequency = new Map(model.markers.map(marker => [marker.frequency, marker]));
  const header = ['frequencyMHz','latestRawRssi','averageRawRssi','peakRawRssi','persistenceRawRssi','marker','markerNote'];
  const rows = model.snapshotRows().map(row => {
    const marker = markerByFrequency.get(row.frequencyMHz);
    return [row.frequencyMHz, row.latestRssi, row.averageRssi, row.peakRssi, row.persistenceRssi, marker?.id ?? '', marker?.note ?? ''];
  });
  const preamble = [
    ['# UberToothGUI spectrum snapshot'],
    [`# Range ${model.low}-${model.high} MHz`],
    ['# RSSI values are the signed raw values emitted by Ubertooth SPECAN; they are not presented as calibrated absolute dBm.'],
    [`# Metadata ${JSON.stringify(metadata)}`]
  ];
  const csv = [...preamble, header, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv' }), `ubertooth-spectrum-${timestamp()}.csv`);
}

export function exportRaw(recorder) {
  const packets = recorder.packets.toArray().filter(p => p.raw?.byteLength === 64);
  const out = new Uint8Array(packets.length * 64);
  packets.forEach((p, i) => out.set(p.raw, i * 64));
  downloadBlob(new Blob([out], { type: 'application/octet-stream' }), `ubertooth-usb64-${timestamp()}.bin`);
}


export function exportEventsCsv(events = []) {
  const header = ['id','time','category','level','message','packetId','detail','bookmarked','tags','note'];
  const rows = events.map(event => [
    event.id, event.time, event.category ?? '', event.level ?? 'info', event.message ?? '', event.packetId ?? '',
    JSON.stringify(event.detail ?? {}), event.annotation?.bookmarked ? 'yes' : 'no', (event.annotation?.tags ?? []).join(';'), event.annotation?.note ?? ''
  ]);
  const csv = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv' }), `ubertooth-events-${timestamp()}.csv`);
}

export function pcapCompatibility(packets = []) {
  const { eligible, excluded } = pcapEligiblePackets(packets);
  return {
    linkType: LINKTYPE_BLUETOOTH_LE_LL_WITH_PHDR,
    eligible: eligible.length,
    excluded: excluded.length,
    total: (packets ?? []).length,
    note: 'Only complete BLE link-layer packets with a known BLE channel are exported; spectrum, malformed, and truncated records remain in JSON/raw evidence.'
  };
}

export function exportBlePcap(packets = []) {
  const result = buildBlePcap(packets);
  if (!result.exported) throw new Error('No complete BLE packets are eligible for PCAP export.');
  downloadBlob(new Blob([result.bytes], { type: 'application/vnd.tcpdump.pcap' }), `ubertooth-ble-${timestamp()}.pcap`);
  return result;
}

export function exportBlePcapng(packets = []) {
  const result = buildBlePcapng(packets);
  if (!result.exported) throw new Error('No complete BLE packets are eligible for PCAPNG export.');
  downloadBlob(new Blob([result.bytes], { type: 'application/octet-stream' }), `ubertooth-ble-${timestamp()}.pcapng`);
  return result;
}

export function exportDiagnostics(diag) {
  downloadBlob(new Blob([JSON.stringify(diag, null, 2)], { type: 'application/json' }), `ubertooth-diagnostics-${timestamp()}.json`);
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
