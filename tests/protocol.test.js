import test from 'node:test';
import assert from 'node:assert/strict';

import { CMD, COMMANDS } from '../src/ubertooth/commands.js';
import { parseUsbPacket, parseSpectrumRecords, PacketType, USB_PACKET_LENGTH } from '../src/ubertooth/packets.js';
import { parseBlePacket, BLE_ADV_ACCESS_ADDRESS, frequencyToBleChannel, bleChannelToFrequency } from '../src/bluetooth/ble.js';
import { RingBuffer } from '../src/utils/ringbuffer.js';
import { UBERTOOTH_API_VERSION } from '../src/version.js';

function basePacket(type = PacketType.LE_PACKET, frequency = 2402) {
  const b = new Uint8Array(64);
  const v = new DataView(b.buffer);
  b[0] = type;
  b[1] = 0x04;
  b[2] = frequency - 2402;
  b[3] = 0x5a;
  v.setUint32(4, 0x12345678, true);
  v.setInt8(8, -20);
  v.setInt8(9, -30);
  v.setInt8(10, -25);
  b[11] = 10;
  return b;
}

test('upstream API and core command IDs are pinned', () => {
  assert.equal(UBERTOOTH_API_VERSION, 0x0107);
  assert.equal(CMD.PING, 0);
  assert.equal(CMD.GET_SERIAL, 14);
  assert.equal(CMD.SPECAN, 27);
  assert.equal(CMD.BTLE_SNIFFING, 42);
  assert.equal(CMD.BTLE_PROMISC, 50);
  assert.equal(CMD.GET_COMPILE_INFO, 55);
  assert.equal(CMD.BTLE_SET_TARGET, 56);
  assert.equal(CMD.CANCEL_FOLLOW, 70);
  assert.equal(COMMANDS.PING.direction, 'in');
  assert.equal(COMMANDS.SPECAN.direction, 'out');
});

test('64-byte receive framing parses fixed metadata and preserves raw evidence', () => {
  const b = basePacket(PacketType.LE_PACKET, 2426);
  const p = parseUsbPacket(b, 42.5);
  assert.equal(b.byteLength, USB_PACKET_LENGTH);
  assert.equal(p.type, PacketType.LE_PACKET);
  assert.equal(p.status, 0x04);
  assert.deepEqual(p.statusFlags, ['FIFO_OVERFLOW']);
  assert.equal(p.frequency, 2426);
  assert.equal(p.clock100ns, 0x12345678);
  assert.equal(p.rssiCount, 10);
  assert.equal(p.payload.byteLength, 50);
  assert.equal(p.raw.byteLength, 64);
  b[0] = 99;
  assert.equal(p.raw[0], PacketType.LE_PACKET, 'parser must preserve a copy of evidence');
});

test('spectrum packet decodes 16 big-endian frequency/RSSI triples', () => {
  const b = basePacket(PacketType.SPECAN, 2402);
  let o = 14;
  for (let i = 0; i < 16; i += 1) {
    const f = 2402 + i * 2;
    b[o++] = f >> 8;
    b[o++] = f & 0xff;
    b[o++] = (256 - 90 + i) & 0xff;
  }
  const records = parseSpectrumRecords(parseUsbPacket(b));
  assert.equal(records.length, 16);
  assert.deepEqual(records[0].frequency, 2402);
  assert.deepEqual(records[0].rssi, -90);
  assert.deepEqual(records.at(-1).frequency, 2432);
});

test('BLE advertising packet exposes access address, channel, advertiser and AD fields', () => {
  const b = basePacket(PacketType.LE_PACKET, 2480);
  const d = b.subarray(14);
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  v.setUint32(0, BLE_ADV_ACCESS_ADDRESS, true);
  d[4] = 0x40; // ADV_IND, random Tx address
  const advertiserAirOrder = [0x10, 0x77, 0x24, 0x9a, 0x61, 0xd2];
  const ad = [2, 0x01, 0x06, 9, 0x09, ...new TextEncoder().encode('BenchTag')];
  const payload = [...advertiserAirOrder, ...ad];
  d[5] = payload.length;
  d.set(payload, 6);
  const p = parseUsbPacket(b);
  p.ble = parseBlePacket(p);
  assert.equal(p.ble.accessAddress, BLE_ADV_ACCESS_ADDRESS);
  assert.equal(p.ble.bleChannel, 39);
  assert.equal(p.ble.address, 'D2:61:9A:24:77:10');
  assert.equal(p.ble.localName, 'BenchTag');
  assert.equal(p.ble.txAddressRandom, true);
  assert.equal(p.ble.malformed, false);
});

test('BLE channel/frequency mapping covers all advertising channels', () => {
  assert.equal(frequencyToBleChannel(2402), 37);
  assert.equal(frequencyToBleChannel(2426), 38);
  assert.equal(frequencyToBleChannel(2480), 39);
  assert.equal(bleChannelToFrequency(37), 2402);
  assert.equal(bleChannelToFrequency(38), 2426);
  assert.equal(bleChannelToFrequency(39), 2480);
});

test('bounded ring buffer retains newest data and counts drops', () => {
  const r = new RingBuffer(3);
  r.push('a'); r.push('b'); r.push('c'); r.push('d');
  assert.deepEqual(r.toArray(), ['b','c','d']);
  assert.equal(r.dropped, 1);
  assert.equal(r.totalPushed, 4);
});

test('simulation exercises the same device controller for BLE POLL and spectrum bulk paths', async () => {
  const { SimulationTransport } = await import('../src/transport/simulation.js');
  const { UbertoothDevice } = await import('../src/ubertooth/device.js');

  const transport = new SimulationTransport();
  await transport.connect();
  const device = new UbertoothDevice(transport);
  assert.equal(await device.ping(), true);
  const info = await device.queryInfo();
  assert.equal(info.apiCompatibility, 'match');
  assert.equal(info.boardName, 'Ubertooth One');

  await device.startBle({ follow: false });
  assert.equal(device.mode, 'ble');
  const bleView = await device.receivePacket();
  assert.equal(bleView.byteLength, 64);
  assert.equal(parseUsbPacket(new Uint8Array(bleView.buffer, bleView.byteOffset, bleView.byteLength)).type, PacketType.LE_PACKET);

  await device.stop();
  await device.startSpectrum(2402, 2480);
  assert.equal(device.mode, 'spectrum');
  const spectrumView = await device.receivePacket();
  assert.equal(spectrumView.byteLength, 64);
  assert.equal(parseUsbPacket(new Uint8Array(spectrumView.buffer, spectrumView.byteOffset, spectrumView.byteLength)).type, PacketType.SPECAN);

  await transport.disconnect();
});
