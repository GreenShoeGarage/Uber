import { RingBuffer } from '../utils/ringbuffer.js';

function classifyEvent(message = '') {
  const text = String(message).toLowerCase();
  if (text.includes('replay')) return 'REPLAY';
  if (text.includes('spectrum') || text.includes('marker')) return 'RF';
  if (text.includes('classic') || text.includes('piconet') || text.includes('lap') || text.includes('uap')) return 'CLASSIC';
  if (text.includes('ble') || text.includes('advertiser') || text.includes('scan response') || text.includes('connection') || text.includes('target') || text.includes('follow')) return 'BLE';
  if (text.includes('packet bookmark') || text.includes('annotation')) return 'ANNOTATION';
  if (text.includes('capture') || text.includes('session') || text.includes('export')) return 'CAPTURE';
  if (text.includes('usb') || text.includes('device') || text.includes('firmware') || text.includes('ping') || text.includes('validation') || text.includes('soak') || text.includes('browser')) return 'SYSTEM';
  return 'SYSTEM';
}


export class CaptureRecorder {
  constructor(capacity = 20000) {
    this.packets = new RingBuffer(capacity);
    this.events = new RingBuffer(5000);
    this.sessionId = null;
    this.sessionName = null;
    this.source = 'live';
    this.createdAt = null;
    this.resetStats();
  }

  resetStats() {
    this.startedAt = null;
    this.stoppedAt = null;
    this.bytesReceived = 0;
    this.malformedPackets = 0;
    this.usbErrors = 0;
    this.mode = 'idle';
    this.selectedChannels = [];
  }

  start(mode, selectedChannels = [], options = {}) {
    this.packets.clear();
    this.events.clear();
    this.resetStats();
    this.startedAt = Number(options.startedAt ?? Date.now());
    this.createdAt = Number(options.createdAt ?? this.startedAt);
    this.sessionId = options.id ?? `capture-${this.startedAt}`;
    this.sessionName = options.name ?? defaultCaptureName(this.startedAt, mode);
    this.source = options.source ?? 'live';
    this.mode = mode;
    this.selectedChannels = selectedChannels;
    if (!options.silent) this.event('Capture started', { mode, source: this.source });
  }

  stop(options = {}) {
    this.stoppedAt = Number(options.stoppedAt ?? Date.now());
    if (!options.silent) this.event('Capture stopped');
  }

  clear() {
    this.packets.clear();
    this.events.clear();
    this.sessionId = null;
    this.sessionName = null;
    this.source = 'live';
    this.createdAt = null;
    this.resetStats();
  }

  addPacket(packet) {
    if (!packet.annotation) packet.annotation = { bookmarked: false, note: '', tags: [] };
    this.packets.push(packet);
    this.bytesReceived += packet.raw?.byteLength ?? 0;
  }

  setAnnotation(packetId, patch = {}) {
    const packet = this.packets.toArray().find(item => item.id === packetId);
    if (!packet) return null;
    packet.annotation = { bookmarked: false, note: '', tags: [], ...(packet.annotation ?? {}), ...patch };
    if (typeof packet.annotation.tags === 'string') packet.annotation.tags = packet.annotation.tags.split(',').map(x => x.trim()).filter(Boolean);
    packet.annotation.tags = [...new Set((packet.annotation.tags ?? []).map(String))];
    return packet.annotation;
  }

  malformed(error) {
    this.malformedPackets += 1;
    this.event('Malformed packet', { error: error?.message ?? String(error) }, 'warning');
  }

  usbError(error) {
    this.usbErrors += 1;
    this.event('USB transfer error', { error: error?.message ?? String(error) }, 'error');
  }

  event(message, detail = {}, level = 'info', packetId = null, category = null) {
    this.events.push({ id: `evt-${Date.now()}-${this.events.totalPushed + 1}`, time: Date.now(), message, detail, level, packetId, category: category ?? classifyEvent(message), annotation:{bookmarked:false,note:'',tags:[]} });
  }

  annotateEvent(eventId, patch = {}) {
    const event = this.events.toArray().find(item => item.id === eventId);
    if (!event) return null;
    event.annotation = { bookmarked:false, note:'', tags:[], ...(event.annotation ?? {}), ...patch };
    if (typeof event.annotation.tags === 'string') event.annotation.tags = event.annotation.tags.split(',').map(x=>x.trim()).filter(Boolean);
    event.annotation.tags = [...new Set((event.annotation.tags ?? []).map(String))];
    return event.annotation;
  }

  get durationMs() {
    if (!this.startedAt) return 0;
    return (this.stoppedAt ?? Date.now()) - this.startedAt;
  }

  stats() {
    const seconds = Math.max(0.001, this.durationMs / 1000);
    return {
      sessionId: this.sessionId,
      sessionName: this.sessionName,
      source: this.source,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      durationMs: this.durationMs,
      packetsReceived: this.packets.totalPushed,
      retainedPackets: this.packets.length,
      bytesReceived: this.bytesReceived,
      droppedPackets: this.packets.dropped,
      malformedPackets: this.malformedPackets,
      usbErrors: this.usbErrors,
      packetRate: this.packets.totalPushed / seconds,
      mode: this.mode,
      selectedChannels: this.selectedChannels
    };
  }
}

function defaultCaptureName(time, mode) {
  const stamp = new Date(time).toISOString().replace('T', ' ').slice(0, 19);
  return `${String(mode ?? 'capture').toUpperCase()} · ${stamp}Z`;
}
