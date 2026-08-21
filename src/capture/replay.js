import { parseUsbPacket, PacketType } from '../ubertooth/packets.js';
import { parseBlePacket } from '../bluetooth/ble.js';
import { parseClassicPacketJs } from '../bluetooth/classic.js';

export const CAPTURE_SCHEMA = 'ubertoothgui.capture.v3';
export const LEGACY_CAPTURE_SCHEMA = 'ubertoothgui.capture.v1';
export const LEGACY_CAPTURE_SCHEMA_V2 = 'ubertoothgui.capture.v2';

export function bytesFromHex(hex) {
  const clean = String(hex ?? '').replace(/[^0-9a-f]/gi, '');
  if (clean.length % 2) throw new Error('Capture contains malformed hexadecimal packet data.');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function validateCaptureDocument(input) {
  if (!input || typeof input !== 'object') throw new Error('Capture document must be a JSON object.');
  if (![CAPTURE_SCHEMA, LEGACY_CAPTURE_SCHEMA_V2, LEGACY_CAPTURE_SCHEMA].includes(input.schema)) throw new Error(`Unsupported capture schema: ${input.schema ?? 'missing'}`);
  if (!Array.isArray(input.packets)) throw new Error('Capture document has no packet array.');
  const bad = input.packets.findIndex(packet => typeof packet.rawHex !== 'string' || bytesFromHex(packet.rawHex).byteLength !== 64);
  if (bad >= 0) throw new Error(`Capture packet ${bad + 1} does not contain one complete 64-byte Ubertooth USB record.`);
  return input;
}

export function deserializePacket(record) {
  const raw = bytesFromHex(record.rawHex);
  const packet = parseUsbPacket(raw, Number(record.receivedAt ?? 0));
  packet.id = Number(record.id ?? 0);
  packet.wallTime = Number(record.wallTime ?? record.receivedAt ?? Date.now());
  packet.receivedAt = Number(record.receivedAt ?? packet.receivedAt);
  if (packet.type === PacketType.LE_PACKET || packet.type === PacketType.LE_PROMISC) packet.ble = parseBlePacket(packet);
  if (packet.type === PacketType.BR_PACKET) packet.classic = parseClassicPacketJs(packet, { knownLap:record.classic?.lap ?? null, maxErrors:record.classic?.acErrors ?? 0 });
  packet.annotation = {
    bookmarked: Boolean(record.annotation?.bookmarked),
    note: String(record.annotation?.note ?? ''),
    tags: Array.isArray(record.annotation?.tags) ? record.annotation.tags.map(String) : []
  };
  return packet;
}

export function replayRange(document) {
  const packets = document?.packets ?? [];
  if (!packets.length) return { start: 0, end: 0, durationMs: 0 };
  const start = Number(packets[0].wallTime ?? packets[0].receivedAt ?? 0);
  const end = Number(packets.at(-1).wallTime ?? packets.at(-1).receivedAt ?? start);
  return { start, end, durationMs: Math.max(0, end - start) };
}
