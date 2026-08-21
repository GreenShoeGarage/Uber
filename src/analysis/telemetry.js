const DEFAULT_BUCKET_MS = 1000;
const DEFAULT_CAPACITY = 600;

function newBucket(time) {
  return {
    time,
    packets: 0,
    blePackets: 0,
    spectrumPackets: 0,
    advertisingPackets: 0,
    dataPackets: 0,
    malformedPackets: 0,
    bytes: 0,
    usbErrors: 0,
    ringDrops: 0
  };
}

export class TelemetryHistory {
  constructor({ bucketMs = DEFAULT_BUCKET_MS, capacity = DEFAULT_CAPACITY } = {}) {
    this.bucketMs = Math.max(250, Number(bucketMs) || DEFAULT_BUCKET_MS);
    this.capacity = Math.max(60, Number(capacity) || DEFAULT_CAPACITY);
    this.reset();
  }

  reset() {
    this.samples = [];
    this.current = null;
    this.lastHealth = { usbErrors: 0, ringDrops: 0 };
  }

  ingestPacket(packet, time = packet?.wallTime ?? Date.now()) {
    const bucket = this.#bucketFor(time);
    bucket.packets += 1;
    bucket.bytes += packet?.raw?.byteLength ?? 0;
    if (packet?.ble) {
      bucket.blePackets += 1;
      if (packet.ble.isAdvertising) bucket.advertisingPackets += 1;
      else bucket.dataPackets += 1;
      if (packet.ble.malformed) bucket.malformedPackets += 1;
    }
    if (packet?.typeName === 'SPECAN') bucket.spectrumPackets += 1;
    return bucket;
  }

  noteHealth(stats = {}, time = Date.now()) {
    const bucket = this.#bucketFor(time);
    const usbErrors = Math.max(0, Number(stats.usbErrors) || 0);
    const ringDrops = Math.max(0, Number(stats.droppedPackets) || 0);
    bucket.usbErrors += Math.max(0, usbErrors - this.lastHealth.usbErrors);
    bucket.ringDrops += Math.max(0, ringDrops - this.lastHealth.ringDrops);
    this.lastHealth = { usbErrors, ringDrops };
  }

  snapshot({ limit = this.capacity, includeCurrent = true } = {}) {
    const rows = includeCurrent && this.current ? [...this.samples, { ...this.current }] : [...this.samples];
    return rows.slice(-Math.max(1, Number(limit) || this.capacity)).map(row => ({
      ...row,
      packetRate: row.packets / (this.bucketMs / 1000),
      bleRate: row.blePackets / (this.bucketMs / 1000),
      spectrumRate: row.spectrumPackets / (this.bucketMs / 1000)
    }));
  }

  summary() {
    const rows = this.snapshot({ limit: 60 });
    const latest = rows.at(-1) ?? null;
    const peakPacketRate = rows.reduce((max, row) => Math.max(max, row.packetRate), 0);
    const peakBleRate = rows.reduce((max, row) => Math.max(max, row.bleRate), 0);
    return { bucketMs: this.bucketMs, retainedSamples: rows.length, latest, peakPacketRate, peakBleRate };
  }

  #bucketFor(time) {
    const numeric = Number(time);
    const bucketTime = Math.floor((Number.isFinite(numeric) ? numeric : Date.now()) / this.bucketMs) * this.bucketMs;
    if (!this.current) {
      this.current = newBucket(bucketTime);
      return this.current;
    }
    if (bucketTime === this.current.time) return this.current;
    if (bucketTime < this.current.time) {
      // Replay seeks rebuild the model from the beginning. If a caller feeds an
      // older packet unexpectedly, start a fresh bounded history rather than
      // silently corrupting chronological rate plots.
      this.samples = [];
      this.current = newBucket(bucketTime);
      return this.current;
    }
    this.samples.push(this.current);
    if (this.samples.length > this.capacity) this.samples.splice(0, this.samples.length - this.capacity);
    this.current = newBucket(bucketTime);
    return this.current;
  }
}
