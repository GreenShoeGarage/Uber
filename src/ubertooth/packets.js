export const USB_PACKET_LENGTH = 64;
export const USB_PAYLOAD_LENGTH = 50;

export const PacketType = Object.freeze({
  BR_PACKET: 0,
  LE_PACKET: 1,
  MESSAGE: 2,
  KEEP_ALIVE: 3,
  SPECAN: 4,
  LE_PROMISC: 5,
  EGO_PACKET: 6
});

export const PacketTypeName = Object.freeze({
  0: 'BR',
  1: 'BLE',
  2: 'MESSAGE',
  3: 'KEEP ALIVE',
  4: 'SPECAN',
  5: 'BLE PROMISC',
  6: 'EGO'
});

export const StatusFlags = Object.freeze({
  DMA_OVERFLOW: 0x01,
  DMA_ERROR: 0x02,
  FIFO_OVERFLOW: 0x04,
  CS_TRIGGER: 0x08,
  RSSI_TRIGGER: 0x10,
  DISCARD: 0x20
});

export function cc2400RssiToDbm(raw) {
  if (raw < -48) return -120;
  if (raw <= -45) return 6 * (raw + 28);
  if (raw <= 30) return Math.trunc((99 * (raw - 62)) / 110);
  if (raw <= 35) return Math.trunc((60 * (raw - 35)) / 11);
  return 0;
}

export function statusNames(status) {
  const names = [];
  for (const [name, bit] of Object.entries(StatusFlags)) if (status & bit) names.push(name);
  return names;
}

export function parseUsbPacket(input, receivedAt = performance.now()) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.byteLength !== USB_PACKET_LENGTH) throw new Error(`Expected 64-byte Ubertooth packet, received ${bytes.byteLength}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const channelOffset = view.getUint8(2);
  const frequency = 2402 + channelOffset;
  const raw = bytes.slice();
  const rssiMaxRaw = view.getInt8(8);
  const rssiMinRaw = view.getInt8(9);
  const rssiAverageRaw = view.getInt8(10);
  const rssiCount = view.getUint8(11);
  const type = view.getUint8(0);

  // The generic usb_pkt_rx contract says rssi_count == 0 means the RSSI
  // statistics are invalid. Current Ubertooth BLE le_phy firmware is a
  // implementation exception in practice: usb_enqueue_le() fills rssi_min,
  // rssi_max and rssi_avg from per-byte samples, then sets rssi_count to 0.
  // Upstream's own BLE host callback consumes those RSSI fields directly.
  // Preserve the strict count guard for other packet types, but accept the
  // populated BLE LE_PACKET metadata so device signal strength is not lost.
  const bleLePhyRssiCompat = type === PacketType.LE_PACKET && rssiCount === 0;
  const rssiMetadataAvailable = rssiCount > 0 || bleLePhyRssiCompat;
  const rssiSource = rssiCount > 0
    ? 'USB RSSI statistics'
    : bleLePhyRssiCompat
      ? 'BLE le_phy metadata (sample count unavailable)'
      : 'Unavailable';

  return {
    receivedAt,
    type,
    typeName: PacketTypeName[view.getUint8(0)] ?? `TYPE ${view.getUint8(0)}`,
    status: view.getUint8(1),
    statusFlags: statusNames(view.getUint8(1)),
    channelOffset,
    frequency,
    clknHigh: view.getUint8(3),
    clock100ns: view.getUint32(4, true),
    rssiMaxRaw,
    rssiMinRaw,
    rssiAverageRaw,
    rssiMax: rssiMetadataAvailable ? cc2400RssiToDbm(rssiMaxRaw) : null,
    rssiMin: rssiMetadataAvailable ? cc2400RssiToDbm(rssiMinRaw) : null,
    rssiAverage: rssiMetadataAvailable ? cc2400RssiToDbm(rssiAverageRaw) : null,
    rssiCount,
    rssiMetadataAvailable,
    rssiSource,
    rssiCountValid: rssiCount > 0,
    reserved: raw.slice(12, 14),
    payload: raw.slice(14, 64),
    raw
  };
}

export function parseSpectrumRecords(packet) {
  if (packet.type !== PacketType.SPECAN) return [];
  const records = [];
  for (let j = 0; j < 48; j += 3) {
    const frequency = (packet.payload[j] << 8) | packet.payload[j + 1];
    const rssiByte = packet.payload[j + 2];
    const rssi = rssiByte > 127 ? rssiByte - 256 : rssiByte;
    if (frequency) records.push({ frequency, rssi, clock100ns: packet.clock100ns });
  }
  return records;
}
