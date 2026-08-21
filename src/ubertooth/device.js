import { COMMANDS, boardName, modulationName } from './commands.js';
import { UBERTOOTH_API_VERSION } from '../version.js';

export class UbertoothDevice extends EventTarget {
  constructor(transport) {
    super();
    this.transport = transport;
    this.info = null;
    this.mode = 'idle';
  }

  async command(name, { value = 0, index = 0, data = new Uint8Array() } = {}) {
    const def = COMMANDS[name];
    if (!def) throw new Error(`Unknown or intentionally unavailable command: ${name}`);
    if (!def.quiet) this.dispatchEvent(new CustomEvent('command', { detail: { name, def, value, index } }));
    if (def.direction === 'in') {
      const result = await this.transport.controlIn(def.id, value, index, def.length ?? 0, { timeout: def.timeout, attempts: def.attempts ?? 1 });
      return def.decode ? def.decode(result) : result;
    }
    return this.transport.controlOut(def.id, value, index, data, { timeout: def.timeout, attempts: def.attempts ?? 1 });
  }

  async ping() {
    await this.command('PING');
    return true;
  }

  async queryInfo() {
    const descriptor = this.transport.describe();
    const results = {};
    for (const [key, cmd] of [
      ['serialNumber', 'GET_SERIAL'],
      ['partNumber', 'GET_PARTNUM'],
      ['firmwareRevision', 'GET_REV_NUM'],
      ['compileInfo', 'GET_COMPILE_INFO'],
      ['boardId', 'GET_BOARD_ID']
    ]) {
      try { results[key] = await this.command(cmd); }
      catch (error) { results[key] = null; results[`${key}Error`] = error.message; }
    }
    const apiVersion = descriptor.bcdDevice ?? null;
    this.info = {
      ...descriptor,
      ...results,
      boardName: results.boardId === null ? 'Unknown' : boardName(results.boardId),
      apiVersion,
      apiVersionText: apiVersion === null ? 'Unknown' : `0x${apiVersion.toString(16).padStart(4, '0')}`,
      supportedApiVersion: UBERTOOTH_API_VERSION,
      apiCompatibility: apiVersion === null ? 'unknown' : apiVersion < UBERTOOTH_API_VERSION ? 'older' : apiVersion > UBERTOOTH_API_VERSION ? 'newer' : 'match'
    };
    return this.info;
  }

  async queryRadioState() {
    const state = {};
    for (const [key, cmd] of [
      ['channel', 'GET_CHANNEL'], ['modulation', 'GET_MOD'], ['squelch', 'GET_SQUELCH'],
      ['paen', 'GET_PAEN'], ['hgm', 'GET_HGM'], ['paLevel', 'GET_PALEVEL'],
      ['crcVerify', 'GET_CRC_VERIFY'], ['accessAddress', 'GET_ACCESS_ADDRESS'], ['clock', 'GET_CLOCK'],
      ['userLed', 'GET_USRLED'], ['rxLed', 'GET_RXLED'], ['txLed', 'GET_TXLED']
    ]) {
      try { state[key] = await this.command(cmd); } catch (_) { state[key] = null; }
    }
    state.modulationName = state.modulation === null ? 'Unavailable' : modulationName(state.modulation);
    return state;
  }

  async setChannel(frequencyMhz) {
    await this.command('SET_CHANNEL', { value: frequencyMhz });
    return this.command('GET_CHANNEL');
  }

  async setModulation(value) {
    await this.command('SET_MOD', { value });
    return this.command('GET_MOD');
  }

  async setSquelch(value) {
    await this.command('SET_SQUELCH', { value: value & 0xffff });
    return this.command('GET_SQUELCH');
  }

  async setBool(name, state) {
    await this.command(name, { value: state ? 1 : 0 });
  }

  async setAccessAddress(value) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
    await this.command('SET_ACCESS_ADDRESS', { data: bytes });
    return this.command('GET_ACCESS_ADDRESS');
  }

  async setCrcVerify(state) {
    await this.command('SET_CRC_VERIFY', { value: state ? 1 : 0 });
    return this.command('GET_CRC_VERIFY');
  }

  async setTarget(mac, mask = 48) {
    const clean = mac.replace(/[^0-9a-f]/gi, '');
    if (clean.length !== 12) throw new Error('Target Bluetooth address must contain 12 hexadecimal digits.');
    const bytes = new Uint8Array(7);
    for (let i = 0; i < 6; i += 1) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    bytes[6] = Math.max(0, Math.min(48, mask));
    await this.command('BTLE_SET_TARGET', { data: bytes });
  }

  async clearTarget() {
    await this.command('BTLE_SET_TARGET', { data: new Uint8Array(7) });
  }

  async startSpectrum(low = 2402, high = 2480) {
    if (low < 2049 || high > 3072 || high < low) throw new Error('Spectrum limits must be ordered within Ubertooth firmware bounds (2049–3072 MHz).');
    await this.stop();
    await this.command('SPECAN', { value: low, index: high });
    this.mode = 'spectrum';
  }

  async startBle({ follow = false, promiscuous = false, advertisingChannel = 37 } = {}) {
    await this.stop();
    // Match the upstream passive BLE setup: explicitly disable jamming, select
    // BLE modulation, and choose an advertising frequency for follow/no-follow.
    await this.command('JAM_MODE_SAFE', { value: 0 });
    await this.setModulation(1);
    if (promiscuous) {
      await this.command('BTLE_PROMISC');
      this.mode = 'ble-promisc';
    } else {
      const frequencies = { 37: 2402, 38: 2426, 39: 2480 };
      const frequency = frequencies[advertisingChannel];
      if (!frequency) throw new Error('Advertising channel must be 37, 38, or 39.');
      await this.setChannel(frequency);
      await this.command('BTLE_SNIFFING', { value: follow ? 1 : 0 });
      this.mode = follow ? 'ble-follow' : 'ble';
    }
  }

  async receivePacket() {
    if (this.mode.startsWith('ble')) {
      const polled = await this.command('POLL');
      // Firmware returns a single zero byte when the BLE queue is empty.
      if (!polled || polled.byteLength === 0) return null;
      if (polled.byteLength === 1 && polled.getUint8(0) === 0) return null;
      return polled;
    }
    return this.transport.transferIn(64);
  }

  async startClassic({ channel = null } = {}) {
    await this.stop();
    await this.command('JAM_MODE_SAFE', { value: 0 });
    await this.setModulation(0);
    if (channel === null || channel === 'sweep') {
      // Upstream firmware interprets a channel value beyond MAX_FREQ as HOP_SWEEP.
      await this.command('SET_CHANNEL', { value: 9999 });
    } else {
      const ch = Number(channel);
      if (!Number.isInteger(ch) || ch < 0 || ch > 78) throw new Error('Bluetooth Classic channel must be 0–78 or sweep.');
      await this.command('SET_CHANNEL', { value: 2402 + ch });
    }
    await this.command('RX_SYMBOLS');
    this.mode = 'classic';
  }

  async startRaw() {
    await this.stop();
    await this.command('RX_SYMBOLS');
    this.mode = 'raw';
  }

  async cancelFollow() {
    await this.command('CANCEL_FOLLOW');
  }

  async stop() {
    if (!this.transport.connected) return;
    try { await this.command('STOP'); } finally { this.mode = 'idle'; }
  }

  async resetFirmware() {
    try {
      await this.command('RESET');
    } catch (error) {
      // Upstream treats PIPE/OTHER/NO_DEVICE as expected because RESET may
      // tear down USB before the control transfer completes.
      if (!['NetworkError', 'NotFoundError', 'AbortError', 'StallError'].includes(error?.name)) throw error;
    } finally {
      this.mode = 'idle';
    }
  }
}
