import test from 'node:test';
import assert from 'node:assert/strict';

import { SpectrumModel, BLE_CHANNELS, WIFI_24_CHANNELS, bleChannelFrequency } from '../src/spectrum/spectrum.js';
import { PacketType, parseSpectrumRecords, parseUsbPacket } from '../src/ubertooth/packets.js';

function specanPacket(records) {
  const b = new Uint8Array(64);
  const v = new DataView(b.buffer);
  b[0] = PacketType.SPECAN;
  v.setUint32(4, 123456, true);
  let o = 14;
  for (const [frequency, rssi] of records.slice(0, 16)) {
    b[o++] = frequency >> 8;
    b[o++] = frequency & 0xff;
    b[o++] = rssi & 0xff;
  }
  return b;
}

test('Batch 2 BLE and Wi-Fi overlay frequency maps are complete', () => {
  assert.equal(BLE_CHANNELS.length, 40);
  assert.equal(BLE_CHANNELS.filter(x => x.advertising).length, 3);
  assert.equal(bleChannelFrequency(0), 2404);
  assert.equal(bleChannelFrequency(10), 2424);
  assert.equal(bleChannelFrequency(11), 2428);
  assert.equal(bleChannelFrequency(36), 2478);
  assert.equal(bleChannelFrequency(37), 2402);
  assert.equal(bleChannelFrequency(38), 2426);
  assert.equal(bleChannelFrequency(39), 2480);
  assert.equal(WIFI_24_CHANNELS.length, 14);
  assert.deepEqual(WIFI_24_CHANNELS.find(x => x.channel === 1), { channel: 1, frequency: 2412 });
  assert.deepEqual(WIFI_24_CHANNELS.find(x => x.channel === 14), { channel: 14, frequency: 2484 });
});

test('SPECAN parser preserves upstream signed raw RSSI byte semantics', () => {
  const packet = parseUsbPacket(specanPacket([[2402, -91], [2480, -27]]));
  const records = parseSpectrumRecords(packet);
  assert.equal(records[0].rssi, -91);
  assert.equal(records[1].rssi, -27);
});

test('spectrum model tracks live, average, peak, persistence and sweep completion', () => {
  const model = new SpectrumModel(2402, 2404, { averaging: 50, persistence: 50, peakHold: true, waterfallRows: 90 });
  model.ingest([{frequency:2402,rssi:-90},{frequency:2403,rssi:-80},{frequency:2404,rssi:-70}], 1000);
  assert.equal(model.stats.records, 3);
  assert.equal(model.stats.sweeps, 1);
  assert.equal(model.waterfall.length, 1);
  assert.equal(model.sampleAt(2403).latest, -80);
  assert.equal(model.sampleAt(2403).average, -80);
  assert.equal(model.sampleAt(2403).peak, -80);

  model.ingest([{frequency:2402,rssi:-100},{frequency:2403,rssi:-60},{frequency:2404,rssi:-75}], 1100);
  assert.equal(model.stats.sweeps, 2);
  assert.equal(model.sampleAt(2402).peak, -90, 'peak hold must retain stronger historical value');
  assert.equal(model.sampleAt(2403).peak, -60);
  assert.equal(model.sampleAt(2403).average, -70);
  assert.ok(model.sampleAt(2402).persistence > -100, 'persistence must decay rather than immediately collapse to weaker live value');
  assert.equal(model.stats.strongestFrequency, 2403);
  assert.equal(model.stats.strongestRssi, -60);
});

test('peak clear and peak-hold disable do not affect live samples', () => {
  const model = new SpectrumModel(2402, 2402);
  model.ingest([{frequency:2402,rssi:-55}], 1000);
  model.ingest([{frequency:2402,rssi:-90}], 1100);
  assert.equal(model.sampleAt(2402).peak, -55);
  model.clearPeak();
  assert.equal(model.sampleAt(2402).peak, -90);
  model.peakHold = false;
  model.ingest([{frequency:2402,rssi:-70}], 1200);
  assert.equal(model.sampleAt(2402).peak, -70);
  assert.equal(model.sampleAt(2402).latest, -70);
});

test('waterfall history is bounded and speed changes only visual row cadence', () => {
  const model = new SpectrumModel(2402, 2402, { waterfallRows: 60, waterfallSpeed: 0.5 });
  for (let i = 0; i < 140; i += 1) model.ingest([{frequency:2402,rssi:-90 + (i % 5)}], 1000 + i * 10);
  assert.equal(model.stats.sweeps, 140);
  assert.equal(model.waterfall.length, 60, 'visual history must remain bounded');
  assert.equal(model.stats.records, 140, 'waterfall cadence must not drop acquisition records');
});

test('view zoom stays inside acquisition range and reset restores full range', () => {
  const model = new SpectrumModel(2402, 2480);
  model.zoom(0.5, 2426);
  assert.ok(model.viewLow >= 2402);
  assert.ok(model.viewHigh <= 2480);
  assert.ok(model.viewHigh - model.viewLow < 78);
  const acquisition = [model.low, model.high];
  model.zoom(0.5, 2479);
  assert.ok(model.viewHigh <= 2480);
  assert.deepEqual([model.low, model.high], acquisition, 'zoom must not mutate radio acquisition limits');
  model.resetView();
  assert.equal(model.viewLow, 2402);
  assert.equal(model.viewHigh, 2480);
});

test('spectrum evidence markers retain observations and notes', () => {
  const model = new SpectrumModel(2402, 2480);
  model.ingest([{frequency:2426,rssi:-75},{frequency:2480,rssi:-80}], 1000);
  const marker = model.addMarker(2426.2, 'initial');
  assert.equal(marker.frequency, 2426);
  assert.equal(marker.currentRssi, -75);
  assert.equal(marker.strongestRssi, -75);
  model.ingest([{frequency:2426,rssi:-62},{frequency:2480,rssi:-82}], 1100);
  assert.equal(marker.currentRssi, -62);
  assert.equal(marker.strongestRssi, -62);
  assert.ok(marker.lastObserved >= marker.firstObserved);
  assert.equal(model.updateMarkerNote(marker.id, 'bench beacon'), true);
  assert.equal(model.markers[0].note, 'bench beacon');
  assert.equal(model.removeMarker(marker.id), true);
  assert.equal(model.markers.length, 0);
});


test('sweep boundary commits immediately when next sweep starts in same USB payload', () => {
  const model = new SpectrumModel(2402, 2404, { waterfallRows: 90 });
  model.ingest([
    {frequency:2402,rssi:-90},
    {frequency:2403,rssi:-80},
    {frequency:2404,rssi:-70},
    {frequency:2402,rssi:-60}
  ], 1000);
  assert.equal(model.stats.sweeps, 1);
  assert.equal(model.waterfall.length, 1);
  assert.equal(model.waterfall[0].values[0], -90, 'completed row must not be contaminated by the next sweep');
  assert.equal(model.sampleAt(2402).latest, -60, 'next-sweep live sample should remain current');
});

test('simulation SPECAN stream advances consecutively across USB packets', async () => {
  const { SimulationTransport } = await import('../src/transport/simulation.js');
  const { CMD } = await import('../src/ubertooth/commands.js');
  const sim = new SimulationTransport();
  await sim.connect();
  await sim.controlOut(CMD.SPECAN, 2402, 2480);
  const first = parseSpectrumRecords(parseUsbPacket(new Uint8Array((await sim.transferIn(64)).buffer)));
  const second = parseSpectrumRecords(parseUsbPacket(new Uint8Array((await sim.transferIn(64)).buffer)));
  assert.deepEqual(first.slice(0, 4).map(x => x.frequency), [2402,2403,2404,2405]);
  assert.equal(first.at(-1).frequency, 2417);
  assert.equal(second[0].frequency, 2418);
  await sim.disconnect();
});

test('spectrum view renders Batch 2 controls without duplicate IDs', async () => {
  const { renderView } = await import('../src/ui/views.js');
  const { CaptureRecorder } = await import('../src/capture/recorder.js');
  const recorder = new CaptureRecorder();
  const spectrum = new SpectrumModel(2402, 2480);
  const prefs = {
    spectrumLow:2402,spectrumHigh:2480,averaging:28,spectrumPersistence:40,peakHold:true,
    waterfallSpeed:1,waterfallRows:180,spectrumRssiMin:-110,spectrumRssiMax:-20,
    spectrumBleOverlay:true,spectrumWifiOverlay:true,packetSearch:'',deviceSearch:''
  };
  const html = renderView('spectrum', {
    prefs, mode:'advanced', recorder, spectrum, capabilities:{}, connectionState:'CONNECTED',
    streaming:false, simulation:true, spectrumPaused:false, transport:{connected:true},
    deviceInfo:null, radioState:null, devices:[], logs:[], selectedPacket:null, validation:null,
    soak:{active:false}, lastStreamConfig:null
  });
  assert.match(html, /RAW RSSI/);
  assert.match(html, /EXPORT SPECTRUM CSV/);
  assert.match(html, /BLE CHANNELS/);
  assert.match(html, /WI-FI CENTERS/);
  assert.match(html, /CLICK TO MARK/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, `duplicate IDs: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`);
});
