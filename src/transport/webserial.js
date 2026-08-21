import { Transport } from './transport.js';

export class WebSerialTransport extends Transport {
  constructor() {
    super('webserial');
    this.port = null;
  }

  static supported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.serial);
  }

  async connect() {
    throw new Error('WebSerial transport is an architecture hook only. Standard Ubertooth firmware does not expose a serial protocol. Use WebUSB or Simulation.');
  }

  async disconnect() {
    if (this.port?.readable || this.port?.writable) await this.port.close();
    this.connected = false;
  }
}
