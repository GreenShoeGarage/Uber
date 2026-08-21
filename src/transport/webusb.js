import { Transport } from './transport.js';

export const UBERTOOTH_VENDOR_ID = 0x1d50;
export const UBERTOOTH_ONE_PRODUCT_ID = 0x6002;
export const DATA_IN_ENDPOINT = 2;  // libusb endpoint address 0x82 -> WebUSB endpointNumber 2
export const DATA_OUT_ENDPOINT = 5; // libusb endpoint address 0x05 -> WebUSB endpointNumber 5
const UBERTOOTH_POLL_REQUEST = 49;

function transferStatusError(status, context) {
  const error = new Error(`${status.toUpperCase()} — USB transfer returned ${status}.`);
  error.name = status === 'stall' ? 'StallError' : 'USBTransferError';
  error.usbContext = context;
  return error;
}

function webUsbError(error, context) {
  if (error?.friendlyUsbError) return error;
  const name = error?.name ?? 'USBError';
  const message = error?.message ?? String(error);
  const friendly = {
    NotFoundError: 'DEVICE NOT FOUND — no Ubertooth One was selected or the previously authorized device is not present.',
    SecurityError: 'PERMISSION DENIED — browser or operating-system USB policy blocked access.',
    NetworkError: 'DEVICE BUSY OR TRANSFER FAILED — another process/driver may own the interface, or the device disconnected.',
    InvalidStateError: 'USB INVALID STATE — the device or interface is not ready.',
    AbortError: 'USB OPERATION ABORTED — the device may have reset or disconnected.',
    StallError: 'TRANSFER STALLED — the USB request stalled after recovery attempts.'
  }[name] ?? `USB ERROR — ${message}`;
  const wrapped = new Error(`${friendly} [${context}: ${name}: ${message}]`);
  wrapped.name = name;
  wrapped.cause = error;
  wrapped.usbContext = context;
  wrapped.friendlyUsbError = true;
  return wrapped;
}

export class WebUSBTransport extends Transport {
  constructor() {
    super('webusb');
    this.device = null;
    this.interfaceNumber = null;
    this.alternateSetting = 0;
    this.inEndpoint = DATA_IN_ENDPOINT;
    this.outEndpoint = DATA_OUT_ENDPOINT;
    this.inPacketSize = null;
    this.outPacketSize = null;
    this._disconnectHandler = event => {
      if (this.device && event.device === this.device) {
        this.log('USB DEVICE DISCONNECTED', 'error');
        this.emitDisconnect('Ubertooth One removed');
      }
    };
  }

  static supported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.usb);
  }

  async connect({ reuseGranted = false } = {}) {
    if (!WebUSBTransport.supported()) throw new Error('UNSUPPORTED BROWSER — WebUSB is unavailable. Use a Chromium-based desktop browser over HTTPS or localhost.');
    try {
      let device = null;
      if (reuseGranted) {
        const granted = await navigator.usb.getDevices();
        device = granted.find(d => d.vendorId === UBERTOOTH_VENDOR_ID && d.productId === UBERTOOTH_ONE_PRODUCT_ID) ?? null;
        if (!device) {
          const error = new Error('Previously authorized Ubertooth One is not currently available.');
          error.name = 'NotFoundError';
          throw error;
        }
        this.log('AUTHORIZED USB DEVICE RESELECTED');
      } else {
        this.log('USB DEVICE CHOOSER OPENED');
        device = await navigator.usb.requestDevice({ filters: [{ vendorId: UBERTOOTH_VENDOR_ID, productId: UBERTOOTH_ONE_PRODUCT_ID }] });
      }

      await this.#openAndClaim(device);
      return this.describe();
    } catch (error) {
      this.transferErrors += 1;
      this.noteError(error);
      await this.#bestEffortClose();
      throw webUsbError(error, reuseGranted ? 'reconnect' : 'connect');
    }
  }

  async reconnect() {
    const hadConnection = this.connected;
    await this.#bestEffortClose();
    this.connected = false;
    const description = await this.connect({ reuseGranted: true });
    this.reconnects += 1;
    this.log(hadConnection ? 'USB CONNECTION REOPENED' : 'USB DEVICE RECONNECTED');
    return description;
  }

  async #openAndClaim(device) {
    navigator.usb.removeEventListener('disconnect', this._disconnectHandler);
    this.device = device;
    await this.device.open();
    this.log('USB DEVICE OPEN');

    if (!this.device.configuration) {
      const configValue = this.device.configurations?.[0]?.configurationValue ?? 1;
      await this.device.selectConfiguration(configValue);
      this.log(`CONFIGURATION ${configValue} SELECTED`);
    }

    const endpointChoice = this.#findBulkInterface(this.device.configuration);
    if (!endpointChoice) throw new Error('No interface exposes the expected Ubertooth bulk IN endpoint (0x82 / endpoint 2).');

    this.interfaceNumber = endpointChoice.interfaceNumber;
    this.alternateSetting = endpointChoice.alternateSetting;
    this.inEndpoint = endpointChoice.inEndpoint;
    this.outEndpoint = endpointChoice.outEndpoint ?? DATA_OUT_ENDPOINT;
    this.inPacketSize = endpointChoice.inPacketSize;
    this.outPacketSize = endpointChoice.outPacketSize;

    await this.device.claimInterface(this.interfaceNumber);
    this.log(`INTERFACE ${this.interfaceNumber} CLAIMED`);
    if (this.alternateSetting) {
      await this.device.selectAlternateInterface(this.interfaceNumber, this.alternateSetting);
      this.log(`ALTERNATE ${this.alternateSetting} SELECTED`);
    }

    navigator.usb.addEventListener('disconnect', this._disconnectHandler);
    this.connected = true;
  }

  #findBulkInterface(configuration) {
    const candidates = [];
    for (const iface of configuration?.interfaces ?? []) {
      for (const alt of iface.alternates ?? []) {
        const bulkIn = alt.endpoints?.find(ep => ep.type === 'bulk' && ep.direction === 'in' && ep.endpointNumber === DATA_IN_ENDPOINT);
        const bulkOut = alt.endpoints?.find(ep => ep.type === 'bulk' && ep.direction === 'out' && ep.endpointNumber === DATA_OUT_ENDPOINT);
        if (bulkIn) {
          candidates.push({
            interfaceNumber: iface.interfaceNumber,
            alternateSetting: alt.alternateSetting ?? 0,
            inEndpoint: bulkIn.endpointNumber,
            outEndpoint: bulkOut?.endpointNumber ?? null,
            inPacketSize: bulkIn.packetSize ?? null,
            outPacketSize: bulkOut?.packetSize ?? null
          });
        }
      }
    }
    return candidates[0] ?? null;
  }

  async controlIn(request, value = 0, index = 0, length = 0, options = {}) {
    this.#ensureConnected();
    const setup = { requestType: 'vendor', recipient: 'device', request, value, index };
    const attempts = Math.max(1, Number(options.attempts ?? 1));
    this.lastControl = { direction: 'in', request, value, index, length, timeout: options.timeout ?? null, attempts, time: new Date().toISOString() };

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const started = performance.now();
        const result = await this.device.controlTransferIn(setup, length);
        this.lastTransfer = { kind: 'control-in', status: result.status, bytes: result.data?.byteLength ?? 0, attempt, elapsedMs: Math.round((performance.now() - started) * 10) / 10, time: new Date().toISOString() };
        if (result.status === 'stall') {
          this.stalls += 1;
          if (attempt < attempts) {
            this.log(`CTRL IN 0x${request.toString(16).padStart(2, '0')} STALL — RETRY ${attempt + 1}/${attempts}`, 'warning');
            continue;
          }
          throw transferStatusError(result.status, `control IN request ${request}`);
        }
        if (result.status !== 'ok') throw transferStatusError(result.status, `control IN request ${request}`);
        if (attempt > 1) {
          this.stallRecoveries += 1;
          this.log(`CTRL IN 0x${request.toString(16).padStart(2, '0')} RECOVERED AFTER ${attempt} ATTEMPTS`, 'warning');
        }
        this.bytesReceived += result.data?.byteLength ?? 0;
        if (request !== UBERTOOTH_POLL_REQUEST) this.log(`CTRL IN 0x${request.toString(16).padStart(2, '0')} → ${result.data?.byteLength ?? 0} B`);
        return result.data ?? new DataView(new ArrayBuffer(0));
      } catch (error) {
        if (error?.name === 'StallError' && attempt < attempts) continue;
        this.transferErrors += 1;
        this.noteError(error);
        if (error?.name === 'NotFoundError') this.emitDisconnect(error.message);
        throw webUsbError(error, `control IN request ${request}`);
      }
    }
    throw webUsbError(new Error('USB control IN retry loop exhausted.'), `control IN request ${request}`);
  }

  async controlOut(request, value = 0, index = 0, data = new Uint8Array(), options = {}) {
    this.#ensureConnected();
    const setup = { requestType: 'vendor', recipient: 'device', request, value, index };
    const body = data instanceof Uint8Array ? data : new Uint8Array(data ?? 0);
    this.lastControl = { direction: 'out', request, value, index, length: body.byteLength, timeout: options.timeout ?? null, time: new Date().toISOString() };
    try {
      const started = performance.now();
      const result = await this.device.controlTransferOut(setup, body);
      this.lastTransfer = { kind: 'control-out', status: result.status, bytes: result.bytesWritten ?? 0, elapsedMs: Math.round((performance.now() - started) * 10) / 10, time: new Date().toISOString() };
      if (result.status !== 'ok') throw transferStatusError(result.status, `control OUT request ${request}`);
      this.log(`CTRL OUT 0x${request.toString(16).padStart(2, '0')} ← ${body.byteLength} B`);
      return result;
    } catch (error) {
      this.transferErrors += 1;
      this.noteError(error);
      if (error?.name === 'NotFoundError') this.emitDisconnect(error.message);
      throw webUsbError(error, `control OUT request ${request}`);
    }
  }

  async transferIn(length = 64) {
    this.#ensureConnected();
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const started = performance.now();
        const result = await this.device.transferIn(this.inEndpoint, length);
        this.lastTransfer = { kind: 'bulk-in', endpoint: this.inEndpoint, status: result.status, bytes: result.data?.byteLength ?? 0, attempt, elapsedMs: Math.round((performance.now() - started) * 10) / 10, time: new Date().toISOString() };
        if (result.status === 'stall') {
          this.stalls += 1;
          if (attempt < maxAttempts) {
            await this.device.clearHalt('in', this.inEndpoint);
            this.stallRecoveries += 1;
            this.log(`BULK IN STALL — ENDPOINT ${this.inEndpoint} HALT CLEARED; RETRYING`, 'warning');
            continue;
          }
          throw transferStatusError(result.status, `bulk IN endpoint ${this.inEndpoint}`);
        }
        if (result.status !== 'ok') throw transferStatusError(result.status, `bulk IN endpoint ${this.inEndpoint}`);
        this.bytesReceived += result.data?.byteLength ?? 0;
        return result.data;
      } catch (error) {
        if (error?.name === 'StallError' && attempt < maxAttempts) continue;
        this.transferErrors += 1;
        this.noteError(error);
        if (error?.name === 'NotFoundError') this.emitDisconnect(error.message);
        throw webUsbError(error, `bulk IN endpoint ${this.inEndpoint}`);
      }
    }
    throw webUsbError(new Error('USB bulk IN retry loop exhausted.'), `bulk IN endpoint ${this.inEndpoint}`);
  }

  async transferOut(data) {
    this.#ensureConnected();
    try {
      const result = await this.device.transferOut(this.outEndpoint, data);
      if (result.status !== 'ok') throw transferStatusError(result.status, `bulk OUT endpoint ${this.outEndpoint}`);
      return result;
    } catch (error) {
      this.transferErrors += 1;
      this.noteError(error);
      if (error?.name === 'NotFoundError') this.emitDisconnect(error.message);
      throw webUsbError(error, `bulk OUT endpoint ${this.outEndpoint}`);
    }
  }

  async reset() {
    this.#ensureConnected();
    await this.device.reset();
    this.log('WEBUSB DEVICE RESET');
  }

  async disconnect() {
    navigator.usb?.removeEventListener('disconnect', this._disconnectHandler);
    await this.#bestEffortClose();
    this.connected = false;
    this.log('USB DEVICE CLOSED');
  }

  async #bestEffortClose() {
    if (!this.device) return;
    try {
      if (this.device.opened && this.interfaceNumber !== null) await this.device.releaseInterface(this.interfaceNumber);
    } catch (_) {}
    try {
      if (this.device.opened) await this.device.close();
    } catch (_) {}
  }

  #ensureConnected() {
    if (!this.connected || !this.device?.opened) throw new Error('DEVICE DISCONNECTED — no active WebUSB device.');
  }

  describe() {
    const d = this.device;
    const selectedInterface = d?.configuration?.interfaces?.find(i => i.interfaceNumber === this.interfaceNumber) ?? null;
    return {
      ...super.describe(),
      vendorId: d?.vendorId ?? null,
      productId: d?.productId ?? null,
      manufacturerName: d?.manufacturerName ?? null,
      productName: d?.productName ?? null,
      serialNumberDescriptor: d?.serialNumber ?? null,
      usbVersion: d ? `${d.usbVersionMajor}.${d.usbVersionMinor}.${d.usbVersionSubminor}` : null,
      deviceVersion: d ? `${d.deviceVersionMajor}.${d.deviceVersionMinor}.${d.deviceVersionSubminor}` : null,
      bcdDevice: d ? ((d.deviceVersionMajor << 8) | (d.deviceVersionMinor << 4) | d.deviceVersionSubminor) : null,
      configurationValue: d?.configuration?.configurationValue ?? null,
      interfaceNumber: this.interfaceNumber,
      interfaceClaimed: selectedInterface?.claimed ?? false,
      alternateSetting: this.alternateSetting,
      inEndpoint: this.inEndpoint,
      outEndpoint: this.outEndpoint,
      inPacketSize: this.inPacketSize,
      outPacketSize: this.outPacketSize,
      configurations: (d?.configurations ?? []).map(c => ({
        configurationValue: c.configurationValue,
        configurationName: c.configurationName,
        interfaces: c.interfaces.map(i => ({
          interfaceNumber: i.interfaceNumber,
          claimed: i.claimed,
          alternates: i.alternates.map(a => ({
            alternateSetting: a.alternateSetting,
            interfaceClass: a.interfaceClass,
            interfaceSubclass: a.interfaceSubclass,
            interfaceProtocol: a.interfaceProtocol,
            endpoints: a.endpoints.map(e => ({ endpointNumber: e.endpointNumber, direction: e.direction, type: e.type, packetSize: e.packetSize }))
          }))
        }))
      }))
    };
  }
}
