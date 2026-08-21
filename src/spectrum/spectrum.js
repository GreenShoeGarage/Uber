import { clamp } from '../utils/binary.js';

export const SPECTRUM_MIN_MHZ = 2049;
export const SPECTRUM_MAX_MHZ = 3072;
export const DEFAULT_RSSI_MIN = -110;
export const DEFAULT_RSSI_MAX = -20;

export const BLE_CHANNELS = Object.freeze(Array.from({ length: 40 }, (_, channel) => ({
  channel,
  frequency: bleChannelFrequency(channel),
  advertising: channel >= 37
})));

export const WIFI_24_CHANNELS = Object.freeze(Array.from({ length: 14 }, (_, i) => ({
  channel: i + 1,
  frequency: i === 13 ? 2484 : 2412 + i * 5
})));

export function bleChannelFrequency(channel) {
  if (channel === 37) return 2402;
  if (channel === 38) return 2426;
  if (channel === 39) return 2480;
  if (channel >= 0 && channel <= 10) return 2404 + channel * 2;
  if (channel >= 11 && channel <= 36) return 2428 + (channel - 11) * 2;
  return null;
}

export class SpectrumModel {
  constructor(low = 2402, high = 2480, options = {}) {
    this.alpha = 0.28;
    this.persistencePercent = 40;
    this.peakHold = true;
    this.showBleOverlay = true;
    this.showWifiOverlay = true;
    this.maxWaterfallRows = 180;
    this.waterfallSpeed = 1;
    this.rssiMin = DEFAULT_RSSI_MIN;
    this.rssiMax = DEFAULT_RSSI_MAX;
    this.markers = [];
    this.markerSeq = 0;
    this.stats = this.#newStats();
    this.configure(low, high, { preserveMarkers: true });
    this.applyOptions(options);
  }

  #newStats() {
    return {
      records: 0,
      sweeps: 0,
      sweepRateHz: 0,
      lastSweepAt: null,
      strongestRssi: null,
      strongestFrequency: null
    };
  }

  applyOptions(options = {}) {
    if (options.averaging !== undefined) this.setAveraging(options.averaging);
    if (options.persistence !== undefined) this.setPersistence(options.persistence);
    if (options.peakHold !== undefined) this.peakHold = Boolean(options.peakHold);
    if (options.waterfallSpeed !== undefined) this.setWaterfallSpeed(options.waterfallSpeed);
    if (options.waterfallRows !== undefined) this.setWaterfallRows(options.waterfallRows);
    if (options.rssiMin !== undefined || options.rssiMax !== undefined) this.setRssiScale(options.rssiMin ?? this.rssiMin, options.rssiMax ?? this.rssiMax);
    if (options.showBleOverlay !== undefined) this.showBleOverlay = Boolean(options.showBleOverlay);
    if (options.showWifiOverlay !== undefined) this.showWifiOverlay = Boolean(options.showWifiOverlay);
  }

  configure(low, high, { preserveMarkers = true } = {}) {
    low = Math.round(Number(low));
    high = Math.round(Number(high));
    if (!Number.isFinite(low) || !Number.isFinite(high) || low < SPECTRUM_MIN_MHZ || high > SPECTRUM_MAX_MHZ || high < low) {
      throw new Error(`Spectrum limits must be ordered within ${SPECTRUM_MIN_MHZ}–${SPECTRUM_MAX_MHZ} MHz.`);
    }
    const previousMarkers = preserveMarkers ? (this.markers ?? []) : [];
    this.low = low;
    this.high = high;
    this.binCount = Math.max(1, this.high - this.low + 1);
    this.latest = new Float32Array(this.binCount).fill(DEFAULT_RSSI_MIN);
    this.average = new Float32Array(this.binCount).fill(DEFAULT_RSSI_MIN);
    this.peak = new Float32Array(this.binCount).fill(DEFAULT_RSSI_MIN);
    this.persistence = new Float32Array(this.binCount).fill(DEFAULT_RSSI_MIN);
    this.sweepSeen = new Uint8Array(this.binCount);
    this.seenEver = new Uint8Array(this.binCount);
    this.waterfall = [];
    this.pendingSweepClock = null;
    this.sweepSequence = 0;
    this.viewLow = low;
    this.viewHigh = high;
    this.markers = previousMarkers.filter(marker => marker.frequency >= low && marker.frequency <= high);
    this.stats = this.#newStats();
  }

  clear({ markers = false } = {}) {
    this.latest?.fill(DEFAULT_RSSI_MIN);
    this.average?.fill(DEFAULT_RSSI_MIN);
    this.peak?.fill(DEFAULT_RSSI_MIN);
    this.persistence?.fill(DEFAULT_RSSI_MIN);
    this.sweepSeen?.fill(0);
    this.seenEver?.fill(0);
    this.waterfall = [];
    this.stats = this.#newStats();
    if (markers) this.markers = [];
  }

  clearPeak() {
    this.peak.fill(DEFAULT_RSSI_MIN);
    for (let i = 0; i < this.latest.length; i += 1) if (this.seenEver[i]) this.peak[i] = this.latest[i];
    for (const marker of this.markers) marker.strongestRssi = this.sampleAt(marker.frequency).peak;
  }

  ingest(records, now = performance.now()) {
    let touched = 0;
    for (const record of records) {
      const frequency = Math.round(Number(record.frequency));
      const rssi = Number(record.rssi);
      if (!Number.isFinite(frequency) || !Number.isFinite(rssi) || frequency < this.low || frequency > this.high) continue;
      const i = frequency - this.low;
      const first = !this.seenEver[i];
      this.latest[i] = rssi;
      this.average[i] = first ? rssi : this.average[i] * (1 - this.alpha) + rssi * this.alpha;
      this.peak[i] = first ? rssi : this.peakHold ? Math.max(this.peak[i], rssi) : rssi;
      const decay = this.#persistenceDecayDb();
      this.persistence[i] = first ? rssi : Math.max(rssi, this.persistence[i] - decay);
      this.sweepSeen[i] = 1;
      this.seenEver[i] = 1;
      this.pendingSweepClock = record.clock100ns ?? this.pendingSweepClock;
      this.stats.records += 1;
      touched += 1;
      if (this.stats.strongestRssi === null || rssi > this.stats.strongestRssi) {
        this.stats.strongestRssi = rssi;
        this.stats.strongestFrequency = frequency;
      }
      this.#updateMarkers(frequency, rssi, now);
      // ubertooth-specan treats the requested high-frequency record as the
      // sweep delimiter. Commit immediately because a single 64-byte USB
      // packet may already contain the first records of the next sweep.
      if (frequency >= this.high) this.commitWaterfall(now);
      else if (this.sweepSeen.every(v => v)) this.commitWaterfall(now);
    }
    if (!touched) return;
  }

  commitWaterfall(now = performance.now()) {
    this.sweepSequence += 1;
    this.stats.sweeps += 1;
    if (this.stats.lastSweepAt !== null) {
      const dt = Math.max(1, now - this.stats.lastSweepAt);
      const instantaneous = 1000 / dt;
      this.stats.sweepRateHz = this.stats.sweepRateHz ? this.stats.sweepRateHz * 0.82 + instantaneous * 0.18 : instantaneous;
    }
    this.stats.lastSweepAt = now;

    const copies = this.waterfallSpeed > 1 ? Math.max(1, Math.round(this.waterfallSpeed)) : 1;
    const stride = this.waterfallSpeed < 1 ? Math.max(1, Math.round(1 / this.waterfallSpeed)) : 1;
    if (this.sweepSequence % stride === 0) {
      const row = { values: Array.from(this.latest), time: Date.now(), clock100ns: this.pendingSweepClock };
      for (let i = 0; i < copies; i += 1) this.waterfall.push({ ...row, values: row.values.slice() });
      if (this.waterfall.length > this.maxWaterfallRows) this.waterfall.splice(0, this.waterfall.length - this.maxWaterfallRows);
    }
    this.sweepSeen.fill(0);
    this.pendingSweepClock = null;
  }

  setAveraging(percent) {
    this.alpha = clamp(Number(percent) / 100, 0.02, 1);
  }

  setPersistence(percent) {
    this.persistencePercent = clamp(Number(percent), 0, 100);
  }

  #persistenceDecayDb() {
    // Persistence is visual memory, not additional RF precision. 0% decays
    // rapidly; 100% decays slowly but still eventually releases old peaks.
    return 0.4 + (100 - this.persistencePercent) * 0.18;
  }

  setWaterfallSpeed(speed) {
    const n = Number(speed);
    this.waterfallSpeed = [0.25, 0.5, 1, 2].includes(n) ? n : 1;
  }

  setWaterfallRows(rows) {
    this.maxWaterfallRows = clamp(Math.round(Number(rows)), 60, 720);
    if (this.waterfall.length > this.maxWaterfallRows) this.waterfall.splice(0, this.waterfall.length - this.maxWaterfallRows);
  }

  setRssiScale(min, max) {
    min = Number(min); max = Number(max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max || min < -140 || max > 20) throw new Error('RSSI display scale must be ordered between -140 and +20.');
    this.rssiMin = min;
    this.rssiMax = max;
  }

  sampleAt(frequency) {
    const f = clamp(Math.round(Number(frequency)), this.low, this.high);
    const i = f - this.low;
    return {
      frequency: f,
      seen: Boolean(this.seenEver[i]),
      latest: this.seenEver[i] ? this.latest[i] : null,
      average: this.seenEver[i] ? this.average[i] : null,
      peak: this.seenEver[i] ? this.peak[i] : null,
      persistence: this.seenEver[i] ? this.persistence[i] : null
    };
  }

  addMarker(frequency, note = '') {
    const sample = this.sampleAt(frequency);
    const existing = this.markers.find(marker => marker.frequency === sample.frequency);
    if (existing) return existing;
    const now = Date.now();
    const marker = {
      id: `M${++this.markerSeq}`,
      frequency: sample.frequency,
      note: String(note ?? ''),
      createdAt: now,
      firstObserved: sample.seen ? now : null,
      lastObserved: sample.seen ? now : null,
      currentRssi: sample.latest,
      strongestRssi: sample.peak
    };
    this.markers.push(marker);
    return marker;
  }

  removeMarker(id) {
    const before = this.markers.length;
    this.markers = this.markers.filter(marker => marker.id !== id);
    return this.markers.length !== before;
  }

  updateMarkerNote(id, note) {
    const marker = this.markers.find(item => item.id === id);
    if (!marker) return false;
    marker.note = String(note ?? '');
    return true;
  }

  #updateMarkers(frequency, rssi) {
    const now = Date.now();
    for (const marker of this.markers) {
      if (marker.frequency !== frequency) continue;
      if (marker.firstObserved === null) marker.firstObserved = now;
      marker.lastObserved = now;
      marker.currentRssi = rssi;
      marker.strongestRssi = marker.strongestRssi === null ? rssi : Math.max(marker.strongestRssi, rssi);
    }
  }

  resetView() {
    this.viewLow = this.low;
    this.viewHigh = this.high;
  }

  zoom(factor, center = (this.viewLow + this.viewHigh) / 2) {
    factor = Number(factor);
    if (!Number.isFinite(factor) || factor <= 0) return;
    const acquisitionSpan = Math.max(1, this.high - this.low);
    const currentSpan = Math.max(1, this.viewHigh - this.viewLow);
    const minimumSpan = Math.min(8, acquisitionSpan);
    let newSpan = clamp(currentSpan * factor, minimumSpan, acquisitionSpan);
    if (newSpan >= acquisitionSpan - 0.001) return this.resetView();
    center = clamp(Number(center), this.low, this.high);
    let low = center - newSpan / 2;
    let high = center + newSpan / 2;
    if (low < this.low) { high += this.low - low; low = this.low; }
    if (high > this.high) { low -= high - this.high; high = this.high; }
    this.viewLow = Math.max(this.low, low);
    this.viewHigh = Math.min(this.high, high);
  }

  snapshotRows() {
    const rows = [];
    for (let i = 0; i < this.binCount; i += 1) {
      if (!this.seenEver[i]) continue;
      rows.push({
        frequencyMHz: this.low + i,
        latestRssi: this.latest[i],
        averageRssi: this.average[i],
        peakRssi: this.peak[i],
        persistenceRssi: this.persistence[i]
      });
    }
    return rows;
  }

  summary() {
    return {
      low: this.low,
      high: this.high,
      viewLow: this.viewLow,
      viewHigh: this.viewHigh,
      rssiMin: this.rssiMin,
      rssiMax: this.rssiMax,
      averagingResponsePercent: Math.round(this.alpha * 100),
      persistencePercent: this.persistencePercent,
      peakHold: this.peakHold,
      waterfallRows: this.waterfall.length,
      waterfallCapacity: this.maxWaterfallRows,
      waterfallSpeed: this.waterfallSpeed,
      markers: this.markers.map(marker => ({ ...marker })),
      stats: { ...this.stats }
    };
  }
}
