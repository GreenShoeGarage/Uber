import { Transport } from './transport.js';
import { CMD } from '../ubertooth/commands.js';
import { PacketType } from '../ubertooth/packets.js';
import { BLE_ADV_ACCESS_ADDRESS, bleChannelToFrequency } from '../bluetooth/ble.js';
import { buildClassicSymbolPayload, classicChannelToFrequency } from '../bluetooth/classic.js';

const enc = new TextEncoder();

function dataView(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

function u32Bytes(value) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, value >>> 0, true);
  return b;
}

function stringRecord(text, prefixBytes) {
  const s = enc.encode(text);
  const out = new Uint8Array(prefixBytes + s.length);
  if (prefixBytes === 1) out[0] = s.length;
  if (prefixBytes === 3) out[2] = s.length;
  out.set(s, prefixBytes);
  return out;
}

function macToAirBytes(mac) {
  return Uint8Array.from(mac.split(':').map(x => parseInt(x, 16)).reverse());
}

function adField(type, bytes) {
  const out = new Uint8Array(bytes.length + 2);
  out[0] = bytes.length + 1;
  out[1] = type;
  out.set(bytes, 2);
  return out;
}

function concat(...arrays) {
  const len = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrays) { out.set(a, o); o += a.length; }
  return out;
}

export class SimulationTransport extends Transport {
  constructor() {
    super('simulation');
    this.mode = 'idle';
    this.low = 2402;
    this.high = 2480;
    this.specanCursor = this.low;
    this.clock = 1_000_000;
    this.seq = 0;
    this.channel = 2441;
    this.crcVerify = false;
    this.modulation = 1;
    this.classicSweep = true;
    this.classicLap = 0x9e8b33;
    this.classicUap = 0x4a;
    this.accessAddress = BLE_ADV_ACCESS_ADDRESS;
    this.simConnectionAccessAddress = 0xA1B2C3D4;
    this.advertisers = [
      { mac: 'D2:61:9A:24:77:10', name: 'BenchTag', company: [0x4c,0x00,0x02,0x15] },
      { mac: 'F4:0A:22:BC:11:09', name: 'Sensor-09', company: [0x59,0x00,0x01,0x02] },
      { mac: 'C8:44:73:62:2A:EE', name: 'ToolBeacon', company: [0xff,0xff,0x42,0x10] }
    ];
  }

  async connect() {
    this.connected = true;
    this.log('SIMULATION CONNECTED');
    return this.describe();
  }

  async disconnect() {
    this.mode = 'idle';
    this.connected = false;
    this.log('SIMULATION DISCONNECTED');
  }

  async controlIn(request, value = 0, index = 0, length = 0, options = {}) {
    this.lastControl = { direction: 'in', request, value, index, length, time: new Date().toISOString() };
    let out = new Uint8Array(length);
    switch (request) {
      case CMD.PING: out = new Uint8Array(); break;
      case CMD.GET_SERIAL: out = concat(Uint8Array.of(0), Uint8Array.from({length:16}, (_,i)=>0xA0+i)); break;
      case CMD.GET_PARTNUM: out = concat(Uint8Array.of(0), u32Bytes(0x00000001)); break;
      case CMD.GET_REV_NUM: out = stringRecord('sim-2026.08', 3); break;
      case CMD.GET_COMPILE_INFO: out = stringRecord('ubertooth simulation (UberToothGUI)', 1); break;
      case CMD.GET_BOARD_ID: out = Uint8Array.of(1); break;
      case CMD.GET_CHANNEL: out = Uint8Array.of(this.channel & 0xff, this.channel >> 8); break;
      case CMD.GET_USRLED: case CMD.GET_RXLED: case CMD.GET_TXLED: out = Uint8Array.of(0); break;
      case CMD.GET_PAEN: case CMD.GET_HGM: out = Uint8Array.of(1); break;
      case CMD.GET_PALEVEL: out = Uint8Array.of(4); break;
      case CMD.GET_MOD: out = Uint8Array.of(this.modulation); break;
      case CMD.GET_SQUELCH: out = Uint8Array.of(0xd8); break;
      case CMD.GET_CLOCK: out = u32Bytes(this.clock >>> 0); break;
      case CMD.GET_ACCESS_ADDRESS: out = u32Bytes(this.accessAddress); break;
      case CMD.GET_CRC_VERIFY: out = Uint8Array.of(this.crcVerify ? 1 : 0); break;
      case CMD.POLL:
        if (this.mode.startsWith('ble')) {
          await new Promise(r => setTimeout(r, 28));
          out = this.#blePacket();
        } else {
          out = Uint8Array.of(0);
        }
        break;
      default: break;
    }
    this.lastTransfer = { kind: 'control-in', status: 'ok', bytes: out.length, time: new Date().toISOString() };
    this.bytesReceived += out.length;
    return dataView(out);
  }

  async controlOut(request, value = 0, index = 0, data = new Uint8Array(), options = {}) {
    this.lastControl = { direction: 'out', request, value, index, length: data.byteLength ?? 0, time: new Date().toISOString() };
    switch (request) {
      case CMD.SPECAN: this.low = value; this.high = index; this.specanCursor = this.low; this.mode = 'specan'; break;
      case CMD.BTLE_SNIFFING: this.mode = value ? 'ble-follow' : 'ble'; break;
      case CMD.BTLE_PROMISC: this.mode = 'ble-promisc'; if (this.accessAddress === BLE_ADV_ACCESS_ADDRESS) this.accessAddress = this.simConnectionAccessAddress; break;
      case CMD.RX_SYMBOLS: this.mode = this.modulation === 0 ? 'classic' : 'raw'; break;
      case CMD.STOP: this.mode = 'idle'; break;
      case CMD.RESET: this.mode = 'idle'; break;
      case CMD.SET_CHANNEL: this.classicSweep = value > 3072; if (!this.classicSweep) this.channel = value; break;
      case CMD.SET_MOD: this.modulation = value; break;
      case CMD.SET_CRC_VERIFY: this.crcVerify = Boolean(value); break;
      case CMD.SET_ACCESS_ADDRESS: if (data.byteLength >= 4) this.accessAddress = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, true); break;
      case CMD.JAM_MODE: break; // value 0 only through the app's safe command mapping
      default: break;
    }
    this.lastTransfer = { kind: 'control-out', status: 'ok', bytes: data.byteLength ?? 0, time: new Date().toISOString() };
    return { status: 'ok', bytesWritten: data.byteLength ?? 0 };
  }

  async transferIn(length = 64) {
    if (!this.connected) throw new Error('SIMULATION DISCONNECTED');
    await new Promise(r => setTimeout(r, this.mode === 'specan' ? 18 : 28));
    const packet = this.mode === 'specan' ? this.#spectrumPacket() : this.mode === 'classic' || this.mode === 'raw' ? this.#classicPacket() : this.#blePacket();
    this.bytesReceived += packet.length;
    this.lastTransfer = { kind: 'bulk-in', endpoint: 2, status: 'ok', bytes: packet.length, time: new Date().toISOString() };
    return dataView(packet.slice(0, length));
  }

  #basePacket(type, frequency, rssiRaw = -20) {
    const b = new Uint8Array(64);
    const v = new DataView(b.buffer);
    b[0] = type;
    b[1] = this.seq % 97 === 0 ? 0x04 : 0;
    b[2] = Math.max(0, Math.min(255, frequency - 2402));
    b[3] = (this.clock >>> 20) & 0xff;
    v.setUint32(4, this.clock >>> 0, true);
    v.setInt8(8, rssiRaw);
    v.setInt8(9, rssiRaw - 6);
    v.setInt8(10, rssiRaw - 3);
    b[11] = 18;
    this.clock = (this.clock + 30000) >>> 0;
    this.seq += 1;
    if (this.seq % 600 === 0) this.log('SIMULATION LINK GLITCH — DISCONNECT / RECONNECT EVENT', 'warning');
    return b;
  }

  #spectrumPacket() {
    // Mirror the host tool's streaming shape more closely: each USB packet
    // contains 16 consecutive three-byte {frequency, raw RSSI} records and
    // a sweep continues across packets until the requested high frequency.
    const b = this.#basePacket(PacketType.SPECAN, this.specanCursor);
    let p = 14;
    for (let i = 0; i < 16; i += 1) {
      const f = this.specanCursor;
      const wifi = Math.max(Math.exp(-Math.pow((f-2437)/9,2))*42, Math.exp(-Math.pow((f-2462)/8,2))*28);
      const ble = [2402,2426,2480].reduce((m,c)=>Math.max(m, Math.exp(-Math.pow((f-c)/2.5,2))*22),0);
      const noise = -96 + Math.random()*7;
      const rssi = Math.round(Math.min(-20, noise + wifi + ble));
      b[p++] = (f >> 8) & 0xff;
      b[p++] = f & 0xff;
      b[p++] = rssi & 0xff;
      this.specanCursor = f >= this.high ? this.low : f + 1;
    }
    return b;
  }


  #classicPacket() {
    const channel = this.classicSweep ? (this.seq * 11) % 79 : Math.max(0, Math.min(78, this.channel - 2402));
    const frequency = classicChannelToFrequency(channel);
    const b = this.#basePacket(PacketType.BR_PACKET, frequency, -24 - (this.seq % 13));
    const clock6 = (this.seq * 7) & 0x3f;
    const packetTypes = [1, 4, 10, 11, 14, 15];
    const packetType = packetTypes[this.seq % packetTypes.length];
    const payload = buildClassicSymbolPayload({
      lap: this.classicLap, uap: this.classicUap, clock6, packetType, ltAddr: 1 + (this.seq % 3), flags: this.seq & 0x07, bitOffset: 18 + (this.seq % 10)
    });
    b.set(payload, 14);
    return b;
  }

  #blePacket() {
    if (this.mode === 'ble-follow') {
      if (this.seq % 23 === 0) return this.#connectIndPacket();
      return this.#dataPacket(false);
    }
    if (this.mode === 'ble-promisc') return this.#dataPacket(true);

    if (this.seq % 17 === 0) return this.#extendedAdvPacket();
    const adv = this.advertisers[this.seq % this.advertisers.length];
    const advChannels = [2402, 2426, 2480];
    const f = advChannels[this.seq % advChannels.length];
    const rawRssi = -18 - (this.seq % 12);
    const b = this.#basePacket(PacketType.LE_PACKET, f, rawRssi);
    const data = b.subarray(14);
    new DataView(data.buffer, data.byteOffset, data.byteLength).setUint32(0, BLE_ADV_ACCESS_ADDRESS, true);
    const flags = adField(0x01, Uint8Array.of(0x06));
    const service = adField(0x03, Uint8Array.of(0x0f, 0x18)); // Battery Service 0x180F
    const tx = adField(0x0a, Uint8Array.of((256 - 8 - (this.seq % 5)) & 0xff));
    const name = adField(0x09, enc.encode(adv.name));
    const mfg = adField(0xff, Uint8Array.from(adv.company));
    const scanResponse = this.seq % 9 === 0;
    const fields = scanResponse ? concat(name, service, tx) : concat(flags, service, mfg, tx);
    const payload = concat(macToAirBytes(adv.mac), fields);
    data[4] = 0x40 | (scanResponse ? 0x04 : 0x00); // random TxAdd + SCAN_RSP/ADV_IND
    data[5] = this.seq % 131 === 0 ? 63 : Math.min(payload.length, 37);
    data.set(payload.slice(0, 37), 6);
    const crcOffset = Math.min(6 + data[5], 47);
    data.set([0x55, 0x55, 0x55], crcOffset);
    return b;
  }


  #extendedAdvPacket() {
    const adv = this.advertisers[2];
    const channel = [37,38,39][this.seq % 3];
    const f = bleChannelToFrequency(channel);
    const b = this.#basePacket(PacketType.LE_PACKET, f, -27 - (this.seq % 7));
    const data = b.subarray(14);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    view.setUint32(0, BLE_ADV_ACCESS_ADDRESS, true);
    const flags = 0x59; // AdvA + ADI + AuxPtr + TxPower
    const adiValue = ((3 & 0x0f) << 12) | (this.seq & 0x0fff);
    const adi = Uint8Array.of(adiValue & 0xff, adiValue >> 8);
    const auxPtr = Uint8Array.of(15, 4, (1 << 5)); // ch15, 120 us, LE 2M indication
    const extHeader = concat(Uint8Array.of(flags), macToAirBytes(adv.mac), adi, auxPtr, Uint8Array.of(0xf4));
    const first = extHeader.length & 0x3f; // AdvMode 0: non-connectable/non-scannable
    // Primary-channel ADV_EXT_IND carries the extended header/pointer evidence.
    // Application AdvData, when used, is carried by the referenced auxiliary advertising PDU.
    const pdu = concat(Uint8Array.of(first), extHeader);
    data[4] = 0x47; // random TxAdd + ADV_EXT_IND
    data[5] = Math.min(pdu.length, 41);
    data.set(pdu.slice(0, 41), 6);
    const crcOffset = 6 + data[5];
    if (crcOffset + 3 <= data.length) data.set([0x33,0x44,0x55], crcOffset);
    return b;
  }

  #connectIndPacket() {
    const channel = [37,38,39][this.seq % 3];
    const f = bleChannelToFrequency(channel);
    const b = this.#basePacket(PacketType.LE_PACKET, f, -21 - (this.seq % 8));
    const data = b.subarray(14);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    view.setUint32(0, BLE_ADV_ACCESS_ADDRESS, true);
    data[4] = 0xC5; // CONNECT_IND, random InitA + random AdvA
    data[5] = 34;
    const initA = macToAirBytes('DA:11:22:33:44:55');
    const advA = macToAirBytes(this.advertisers[0].mac);
    data.set(initA, 6);
    data.set(advA, 12);
    view.setUint32(18, this.simConnectionAccessAddress, true);
    data.set([0xAA,0xBB,0xCC], 22); // CRC init evidence bytes
    data[25] = 2; // window size
    view.setUint16(26, 1, true); // window offset
    view.setUint16(28, 24, true); // 30 ms interval
    view.setUint16(30, 0, true); // latency
    view.setUint16(32, 200, true); // 2 s supervision timeout
    data.set([0xff,0xff,0xff,0xff,0x1f], 34); // data channels 0-36
    data[39] = (2 << 5) | 9; // SCA + hop
    data.set([0x55,0x55,0x55], 40);
    return b;
  }

  #dataPacket(promiscuous) {
    const channel = this.seq % 37;
    const f = bleChannelToFrequency(channel);
    const type = promiscuous ? PacketType.LE_PROMISC : PacketType.LE_PACKET;
    const b = this.#basePacket(type, f, -23 - (this.seq % 14));
    const data = b.subarray(14);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const aa = promiscuous ? this.accessAddress : this.simConnectionAccessAddress;
    view.setUint32(0, aa, true);
    const terminating = this.seq % 97 === 0;
    const controlVariant = !terminating && this.seq % 19 === 0 ? (this.seq % 4) : null;
    if (terminating) {
      data[4] = 0x03; data[5] = 2; data.set([0x02,0x13], 6); // LL_TERMINATE_IND + reason
    } else if (controlVariant !== null) {
      data[4] = 0x03;
      let control;
      if (controlVariant === 0) control = Uint8Array.of(0x01,0xff,0xff,0xff,0xff,0x1f,0x40,0x00); // channel map + instant 64
      else if (controlVariant === 1) control = Uint8Array.of(0x0c,0x0b,0x4c,0x00,0x34,0x12); // version/company/subversion
      else if (controlVariant === 2) control = Uint8Array.of(0x15,0xfb,0x00,0x48,0x08,0xfb,0x00,0x48,0x08); // length response
      else control = Uint8Array.of(0x16,0x03,0x03); // PHY request: 1M/2M observed
      data[5] = control.length; data.set(control, 6);
    } else {
      data[4] = 0x02; data[5] = 8; data.set([0x04,0x00,0x04,0x00,0x12,0x34,0x56,0x78], 6);
    }
    const crcOffset = 6 + data[5];
    data.set([0x12,0x34,0x56], crcOffset);
    return b;
  }

  describe() {
    return {
      ...super.describe(), vendorId: 0x1d50, productId: 0x6002,
      manufacturerName: 'Great Scott Gadgets (simulated)', productName: 'Ubertooth One (SIMULATION)',
      serialNumberDescriptor: 'SIMULATED', usbVersion: '2.0.0', deviceVersion: '1.0.7', bcdDevice: 0x0107,
      configurationValue: 1, interfaceNumber: 0, interfaceClaimed: true, alternateSetting: 0, inEndpoint: 2, outEndpoint: 5, inPacketSize: 64, outPacketSize: 64,
      configurations: [{ configurationValue: 1, configurationName: 'Simulation', interfaces: [{ interfaceNumber: 0, alternates: [{ alternateSetting: 0, interfaceClass: 255, interfaceSubclass: 0, interfaceProtocol: 0, endpoints: [{endpointNumber:2,direction:'in',type:'bulk',packetSize:64},{endpointNumber:5,direction:'out',type:'bulk',packetSize:64}] }] }] }]
    };
  }
}
