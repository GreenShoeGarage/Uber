export class Transport extends EventTarget {
  constructor(kind) {
    super();
    this.kind = kind;
    this.connected = false;
    this.bytesReceived = 0;
    this.transferErrors = 0;
    this.stalls = 0;
    this.stallRecoveries = 0;
    this.disconnects = 0;
    this.reconnects = 0;
    this.lastControl = null;
    this.lastTransfer = null;
    this.lastError = null;
  }

  log(message, level = 'info', detail = {}) {
    this.dispatchEvent(new CustomEvent('log', { detail: { time: new Date(), level, message, ...detail } }));
  }

  emitDisconnect(reason = 'Device disconnected') {
    if (this.connected) this.disconnects += 1;
    this.connected = false;
    this.dispatchEvent(new CustomEvent('disconnect', { detail: { reason } }));
  }

  noteError(error) {
    this.lastError = {
      name: error?.name ?? 'Error',
      message: error?.message ?? String(error),
      time: new Date().toISOString()
    };
  }

  async connect() { throw new Error('connect() not implemented'); }
  async reconnect() { return this.connect(); }
  async disconnect() { throw new Error('disconnect() not implemented'); }
  async controlIn() { throw new Error('controlIn() not implemented'); }
  async controlOut() { throw new Error('controlOut() not implemented'); }
  async transferIn() { throw new Error('transferIn() not implemented'); }
  async transferOut() { throw new Error('transferOut() not implemented'); }
  describe() {
    return {
      kind: this.kind,
      connected: this.connected,
      bytesReceived: this.bytesReceived,
      transferErrors: this.transferErrors,
      stalls: this.stalls,
      stallRecoveries: this.stallRecoveries,
      disconnects: this.disconnects,
      reconnects: this.reconnects,
      lastError: this.lastError
    };
  }
}
