export const LINKTYPE_BLUETOOTH_LE_LL = 251;
export const LINKTYPE_BLUETOOTH_LE_LL_WITH_PHDR = 256;

const PCAP_MAGIC = 0xa1b2c3d4;
const PCAPNG_SHB = 0x0a0d0d0a;
const PCAPNG_IDB = 0x00000001;
const PCAPNG_EPB = 0x00000006;
const PCAPNG_BYTE_ORDER_MAGIC = 0x1a2b3c4d;

function concatBytes(parts) {
  const size = parts.reduce((n, part) => n + part.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
  return out;
}

function pad4(bytes) {
  const padding = (4 - (bytes.byteLength % 4)) % 4;
  return padding ? concatBytes([bytes, new Uint8Array(padding)]) : bytes;
}

function pcapngBlock(type, body) {
  const padded = pad4(body);
  const total = 12 + padded.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, type, true);
  view.setUint32(4, total, true);
  out.set(padded, 8);
  view.setUint32(total - 4, total, true);
  return out;
}

function clampI8(value) {
  if (!Number.isFinite(value)) return -128;
  return Math.max(-128, Math.min(127, Math.round(value)));
}

export function bleAirFrame(packet) {
  const ble = packet?.ble;
  if (!ble || ble.malformed || ble.truncated || ble.bleChannel === null || ble.bleChannel === undefined) return null;
  const length = Number(ble.length);
  if (!Number.isInteger(length) || length < 0) return null;
  const needed = 4 + 2 + length + 3;
  if (needed > packet.payload?.byteLength) return null;
  return packet.payload.slice(0, needed);
}

export function blePseudoheader(packet) {
  const ble = packet?.ble;
  if (!ble || ble.bleChannel === null || ble.bleChannel === undefined) return null;
  const out = new Uint8Array(10);
  const view = new DataView(out.buffer);
  out[0] = ble.bleChannel & 0xff;
  view.setInt8(1, clampI8(packet.rssiMax));
  view.setInt8(2, -128); // noise power unavailable from usb_pkt_rx
  out[3] = 0; // access-address offenses unavailable
  view.setUint32(4, 0, true); // no per-packet reference AA claim
  let flags = 0x0001; // LE packet is de-whitened by the Ubertooth BLE path
  if (Number.isFinite(packet.rssiMax)) flags |= 0x0002; // signal-power field valid
  view.setUint16(8, flags, true);
  return out;
}

export function pcapEligiblePackets(packets) {
  const eligible = [], excluded = [];
  for (const packet of packets ?? []) {
    const air = bleAirFrame(packet);
    const phdr = blePseudoheader(packet);
    if (air && phdr) eligible.push({ packet, bytes: concatBytes([phdr, air]) });
    else excluded.push(packet);
  }
  return { eligible, excluded };
}

export function buildBlePcap(packets) {
  const { eligible, excluded } = pcapEligiblePackets(packets);
  const header = new Uint8Array(24);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, PCAP_MAGIC, true);
  hv.setUint16(4, 2, true);
  hv.setUint16(6, 4, true);
  hv.setInt32(8, 0, true);
  hv.setUint32(12, 0, true);
  hv.setUint32(16, 65535, true);
  hv.setUint32(20, LINKTYPE_BLUETOOTH_LE_LL_WITH_PHDR, true);
  const records = [header];
  for (const { packet, bytes } of eligible) {
    const rec = new Uint8Array(16);
    const rv = new DataView(rec.buffer);
    const ms = Number(packet.wallTime ?? Date.now());
    const sec = Math.floor(ms / 1000);
    const usec = Math.floor((ms - sec * 1000) * 1000);
    rv.setUint32(0, sec >>> 0, true);
    rv.setUint32(4, usec >>> 0, true);
    rv.setUint32(8, bytes.byteLength, true);
    rv.setUint32(12, bytes.byteLength, true);
    records.push(rec, bytes);
  }
  return { bytes: concatBytes(records), exported: eligible.length, excluded: excluded.length, linkType: LINKTYPE_BLUETOOTH_LE_LL_WITH_PHDR };
}

export function buildBlePcapng(packets) {
  const { eligible, excluded } = pcapEligiblePackets(packets);
  const shbBody = new Uint8Array(16);
  const shb = new DataView(shbBody.buffer);
  shb.setUint32(0, PCAPNG_BYTE_ORDER_MAGIC, true);
  shb.setUint16(4, 1, true);
  shb.setUint16(6, 0, true);
  shb.setBigInt64(8, -1n, true);

  const idbBody = new Uint8Array(8);
  const idb = new DataView(idbBody.buffer);
  idb.setUint16(0, LINKTYPE_BLUETOOTH_LE_LL_WITH_PHDR, true);
  idb.setUint16(2, 0, true);
  idb.setUint32(4, 65535, true);

  const blocks = [pcapngBlock(PCAPNG_SHB, shbBody), pcapngBlock(PCAPNG_IDB, idbBody)];
  for (const { packet, bytes } of eligible) {
    const data = pad4(bytes);
    const body = new Uint8Array(20 + data.byteLength);
    const view = new DataView(body.buffer);
    const micros = BigInt(Math.max(0, Math.round(Number(packet.wallTime ?? Date.now()) * 1000)));
    view.setUint32(0, 0, true); // interface id
    view.setUint32(4, Number((micros >> 32n) & 0xffffffffn), true);
    view.setUint32(8, Number(micros & 0xffffffffn), true);
    view.setUint32(12, bytes.byteLength, true);
    view.setUint32(16, bytes.byteLength, true);
    body.set(data, 20);
    blocks.push(pcapngBlock(PCAPNG_EPB, body));
  }
  return { bytes: concatBytes(blocks), exported: eligible.length, excluded: excluded.length, linkType: LINKTYPE_BLUETOOTH_LE_LL_WITH_PHDR };
}
