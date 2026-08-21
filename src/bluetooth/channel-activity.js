import { bleChannelToFrequency } from './ble.js';

export const BLE_CHANNEL_COUNT = 40;
export const DEFAULT_ACTIVITY_WINDOW_MS = 5000;

function channelKind(channel) { return channel >= 37 ? 'advertising' : 'data'; }
function prune(samples, cutoff) {
  let i = 0;
  while (i < samples.length && samples[i].time < cutoff) i += 1;
  if (i) samples.splice(0, i);
}

export class BleChannelActivity {
  constructor(windowMs = DEFAULT_ACTIVITY_WINDOW_MS) {
    this.windowMs = Math.max(1000, Number(windowMs) || DEFAULT_ACTIVITY_WINDOW_MS);
    this.reset();
  }

  reset() {
    this.channels = Array.from({ length: BLE_CHANNEL_COUNT }, (_, channel) => ({
      channel,
      frequency: bleChannelToFrequency(channel),
      kind: channelKind(channel),
      packetCount: 0,
      rssiSum: 0,
      rssiSamples: 0,
      averageRssi: null,
      peakRssi: null,
      firstSeen: null,
      lastSeen: null,
      recent: []
    }));
    this.totalPackets = 0;
  }

  ingest(packet, time = packet?.wallTime ?? Date.now()) {
    const channel = packet?.ble?.bleChannel;
    if (!Number.isInteger(channel) || channel < 0 || channel >= BLE_CHANNEL_COUNT) return null;
    const row = this.channels[channel];
    const rssi = Number.isFinite(packet.rssiMax) ? packet.rssiMax : null;
    row.packetCount += 1;
    this.totalPackets += 1;
    row.firstSeen ??= time;
    row.lastSeen = time;
    if (rssi !== null) {
      row.rssiSum += rssi;
      row.rssiSamples += 1;
      row.averageRssi = row.rssiSum / row.rssiSamples;
      row.peakRssi = row.peakRssi === null ? rssi : Math.max(row.peakRssi, rssi);
    }
    row.recent.push({ time, rssi });
    prune(row.recent, time - this.windowMs * 2);
    return row;
  }

  snapshot(now = Date.now()) {
    const cutoff = now - this.windowMs;
    const rows = this.channels.map(row => {
      prune(row.recent, cutoff);
      const recentCount = row.recent.length;
      const recentRssi = row.recent.filter(x => x.rssi !== null);
      const recentAverageRssi = recentRssi.length ? recentRssi.reduce((n, x) => n + x.rssi, 0) / recentRssi.length : null;
      return {
        ...row,
        recentCount,
        recentRate: recentCount / (this.windowMs / 1000),
        recentAverageRssi,
        ageMs: row.lastSeen === null ? null : Math.max(0, now - row.lastSeen)
      };
    });
    const busiest = Math.max(0, ...rows.map(row => row.recentCount));
    return rows.map(row => ({
      ...row,
      // Relative packet occupancy is intentionally not RF airtime. It is the
      // channel's packet count during the recent window relative to the busiest
      // observed BLE channel in that same window.
      occupancyEstimate: busiest ? (row.recentCount / busiest) * 100 : 0,
      recentState: row.ageMs === null ? 'IDLE' : row.ageMs <= 1000 ? 'HOT' : row.ageMs <= this.windowMs ? 'RECENT' : 'IDLE'
    }));
  }

  summary(now = Date.now()) {
    const rows = this.snapshot(now);
    const active = rows.filter(row => row.packetCount > 0);
    const recent = rows.filter(row => row.recentCount > 0);
    const busiest = rows.slice().sort((a,b) => b.recentCount - a.recentCount || b.packetCount - a.packetCount)[0];
    return {
      totalPackets: this.totalPackets,
      activeChannels: active.length,
      recentChannels: recent.length,
      busiestChannel: busiest?.recentCount || busiest?.packetCount ? busiest.channel : null,
      busiestRecentCount: busiest?.recentCount ?? 0,
      windowMs: this.windowMs
    };
  }
}
