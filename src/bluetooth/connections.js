function makeConnection(accessAddressHex, time, evidence = 'INFERRED') {
  return {
    accessAddressHex,
    evidence,
    startedAt: time,
    lastSeen: time,
    endedAt: null,
    packetCount: 0,
    channels: new Set(),
    initiator: null,
    advertiser: null,
    intervalMs: null,
    latency: null,
    supervisionTimeoutMs: null,
    hopIncrement: null,
    channelMap: [],
    connectPacketId: null,
    terminatePacketId: null,
    averageRssi: null,
    peakRssi: null,
    rssiSum: 0,
    rssiSamples: 0,
    controlHistory: [],
    controlCounts: new Map(),
    pendingChannelMap: null,
    pendingConnectionUpdate: null,
    version: null,
    lengthParameters: null,
    phy: null,
    terminationReason: null
  };
}

export class BleConnectionTracker {
  constructor() { this.reset(); }
  reset() { this.connections = new Map(); }

  ingest(packet) {
    const ble = packet?.ble;
    if (!ble) return { connection: null, created: false, ended: false, observedConnect: false };
    const time = packet.wallTime ?? Date.now();
    let created = false;
    let observedConnect = false;
    let ended = false;
    let key = null;

    if (ble.connection?.accessAddressHex) {
      key = ble.connection.accessAddressHex;
      let conn = this.connections.get(key);
      if (!conn) { conn = makeConnection(key, time, 'OBSERVED'); this.connections.set(key, conn); created = true; }
      Object.assign(conn, {
        evidence: 'OBSERVED',
        startedAt: Math.min(conn.startedAt ?? time, time),
        lastSeen: time,
        initiator: ble.connection.initiator,
        advertiser: ble.connection.advertiser,
        intervalMs: ble.connection.intervalMs,
        latency: ble.connection.latency,
        supervisionTimeoutMs: ble.connection.supervisionTimeoutMs,
        hopIncrement: ble.connection.hopIncrement,
        channelMap: [...ble.connection.channelMap],
        connectPacketId: packet.id
      });
      conn.packetCount += 1;
      if (ble.bleChannel !== null && ble.bleChannel !== undefined) conn.channels.add(ble.bleChannel);
      if (Number.isFinite(packet.rssiMax)) {
        conn.rssiSum += packet.rssiMax;
        conn.rssiSamples += 1;
        conn.averageRssi = conn.rssiSum / conn.rssiSamples;
        conn.peakRssi = conn.peakRssi === null ? packet.rssiMax : Math.max(conn.peakRssi, packet.rssiMax);
      }
      observedConnect = true;
      return { connection: conn, created, ended, observedConnect };
    }

    if (!ble.isAdvertising && ble.accessAddressHex) {
      key = ble.accessAddressHex;
      let conn = this.connections.get(key);
      if (!conn) { conn = makeConnection(key, time, 'INFERRED'); this.connections.set(key, conn); created = true; }
      conn.packetCount += 1;
      conn.lastSeen = time;
      if (ble.bleChannel !== null && ble.bleChannel !== undefined) conn.channels.add(ble.bleChannel);
      if (Number.isFinite(packet.rssiMax)) {
        conn.rssiSum += packet.rssiMax;
        conn.rssiSamples += 1;
        conn.averageRssi = conn.rssiSum / conn.rssiSamples;
        conn.peakRssi = conn.peakRssi === null ? packet.rssiMax : Math.max(conn.peakRssi, packet.rssiMax);
      }
      if (ble.llControl) {
        const control = { time, packetId:packet.id, name:ble.llControl.name, opcode:ble.llControl.opcode, decoded:structuredClone(ble.llControl.decoded ?? {}) };
        conn.controlHistory.push(control);
        if (conn.controlHistory.length > 64) conn.controlHistory.shift();
        conn.controlCounts.set(control.name, (conn.controlCounts.get(control.name) ?? 0) + 1);
        if (control.name === 'LL_CHANNEL_MAP_IND') conn.pendingChannelMap = { ...control.decoded, packetId:packet.id, observedAt:time, evidence:'OBSERVED CONTROL PDU — application at Instant not independently confirmed' };
        if (control.name === 'LL_CONNECTION_UPDATE_IND') conn.pendingConnectionUpdate = { ...control.decoded, packetId:packet.id, observedAt:time, evidence:'OBSERVED CONTROL PDU — application at Instant not independently confirmed' };
        if (control.name === 'LL_VERSION_IND') conn.version = { ...control.decoded, packetId:packet.id };
        if (control.name === 'LL_LENGTH_REQ' || control.name === 'LL_LENGTH_RSP') conn.lengthParameters = { ...control.decoded, packetId:packet.id, source:control.name };
        if (control.name === 'LL_PHY_REQ' || control.name === 'LL_PHY_RSP' || control.name === 'LL_PHY_UPDATE_IND') conn.phy = { ...control.decoded, packetId:packet.id, source:control.name };
        if (control.name === 'LL_TERMINATE_IND') {
          conn.endedAt = time;
          conn.terminatePacketId = packet.id;
          conn.terminationReason = control.decoded?.errorCode ?? null;
          ended = true;
        }
      }
      return { connection: conn, created, ended, observedConnect };
    }
    return { connection: null, created, ended, observedConnect };
  }

  list() {
    return Array.from(this.connections.values()).sort((a,b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
  }
}
