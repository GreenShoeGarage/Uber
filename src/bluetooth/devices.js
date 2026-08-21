export const DEVICE_ACTIVITY = Object.freeze({ NEW: 'NEW', ACTIVE: 'ACTIVE', QUIET: 'QUIET', GONE: 'GONE', RETURNED: 'RETURNED' });

export function deviceActivityState(device, now = Date.now()) {
  if (!device) return DEVICE_ACTIVITY.GONE;
  if (device.returnedAt && now - device.returnedAt < 10000) return DEVICE_ACTIVITY.RETURNED;
  if (now - device.firstSeen < 10000 && device.packetCount <= 8) return DEVICE_ACTIVITY.NEW;
  const age = now - device.lastSeen;
  if (age <= 5000) return DEVICE_ACTIVITY.ACTIVE;
  if (age <= 30000) return DEVICE_ACTIVITY.QUIET;
  return DEVICE_ACTIVITY.GONE;
}

export function ingestObservedDevice(map, packet, now = packet.wallTime ?? Date.now()) {
  const b = packet.ble;
  if (!b?.address) return { device: null, isNew: false, returned: false };
  let device = map.get(b.address);
  const isNew = !device;
  let returned = false;
  if (!device) {
    device = {
      address: b.address,
      addressType: b.addressType,
      firstSeen: now,
      lastSeen: now,
      packetCount: 0,
      rssi: null,
      averageRssi: null,
      strongestRssi: -Infinity,
      channels: new Set(),
      pduTypes: new Set(),
      pduCounts: new Map(),
      advertisingProperties: new Set(),
      extendedSids: new Set(),
      manufacturerData: null,
      manufacturerCompanyId: null,
      serviceUuids: new Set(),
      serviceData: new Map(),
      localName: null,
      localNameComplete: false,
      flags: null,
      flagNames: [],
      txPower: null,
      appearance: null,
      scanResponseSeen: false,
      rssiHistory: [],
      rssiSamples: [],
      returnCount: 0,
      returnedAt: null,
      lastPacketId: null
    };
    map.set(b.address, device);
  } else if (now - device.lastSeen > 30000) {
    returned = true;
    device.returnCount += 1;
    device.returnedAt = now;
  }

  device.lastSeen = now;
  device.lastPacketId = packet.id ?? null;
  device.packetCount += 1;
  device.addressType = b.addressType ?? device.addressType;
  if (packet.rssiMax !== null && packet.rssiMax !== undefined) {
    device.rssi = packet.rssiMax;
    device.strongestRssi = Math.max(device.strongestRssi, packet.rssiMax);
    device.rssiHistory.push(packet.rssiMax);
    if (device.rssiHistory.length > 96) device.rssiHistory.shift();
    device.rssiSamples.push({ time: now, rssi: packet.rssiMax, packetId: packet.id ?? null, channel: b.bleChannel ?? null });
    if (device.rssiSamples.length > 240) device.rssiSamples.shift();
    device.averageRssi = device.rssiHistory.reduce((sum, value) => sum + value, 0) / device.rssiHistory.length;
  }
  if (b.bleChannel !== null && b.bleChannel !== undefined) device.channels.add(b.bleChannel);
  if (b.pduTypeName) { device.pduTypes.add(b.pduTypeName); device.pduCounts.set(b.pduTypeName, (device.pduCounts.get(b.pduTypeName) ?? 0) + 1); }
  for (const property of b.advertisingProperties ?? []) device.advertisingProperties.add(property);
  if (Number.isInteger(b.extendedAdvertising?.fields?.adi?.sid)) device.extendedSids.add(b.extendedAdvertising.fields.adi.sid);
  if (b.localName && (b.localNameComplete || !device.localName)) {
    device.localName = b.localName;
    device.localNameComplete = Boolean(b.localNameComplete);
  }
  if (b.manufacturerData) device.manufacturerData = b.manufacturerData;
  if (b.manufacturerCompanyId !== null && b.manufacturerCompanyId !== undefined) device.manufacturerCompanyId = b.manufacturerCompanyId;
  for (const uuid of b.serviceUuids ?? []) device.serviceUuids.add(uuid);
  for (const service of b.serviceData ?? []) device.serviceData.set(service.uuid, service.dataHex);
  if (b.flags !== null && b.flags !== undefined) { device.flags = b.flags; device.flagNames = [...(b.flagNames ?? [])]; }
  if (b.txPower !== null && b.txPower !== undefined) device.txPower = b.txPower;
  if (b.appearance !== null && b.appearance !== undefined) device.appearance = b.appearance;
  if (b.pduTypeName === 'SCAN_RSP') device.scanResponseSeen = true;
  return { device, isNew, returned };
}

export function rebuildDeviceInventory(packets, map = new Map()) {
  map.clear();
  for (const packet of packets) ingestObservedDevice(map, packet, packet.wallTime ?? Date.now());
  return map;
}


export function deviceClassifications(device) {
  if (!device) return [];
  const props = device.advertisingProperties ?? new Set();
  const labels=[];
  if (props.has('CONNECTABLE')) labels.push('CONNECTABLE OBSERVED');
  if (props.has('SCANNABLE')) labels.push('SCANNABLE OBSERVED');
  if (props.has('DIRECTED')) labels.push('DIRECTED OBSERVED');
  if (props.has('NON-CONNECTABLE')) labels.push('NON-CONNECTABLE OBSERVED');
  if (props.has('EXTENDED')) labels.push('EXTENDED ADV OBSERVED');
  if (props.has('NON-CONNECTABLE') && (device.manufacturerData || device.serviceUuids?.size)) labels.push('BEACON-LIKE HEURISTIC');
  return labels;
}
