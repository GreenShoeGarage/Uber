import test from 'node:test';
import assert from 'node:assert/strict';

import { TelemetryHistory } from '../src/analysis/telemetry.js';
import { CaptureRecorder } from '../src/capture/recorder.js';
import { BleChannelActivity } from '../src/bluetooth/channel-activity.js';
import { ingestObservedDevice } from '../src/bluetooth/devices.js';
import { SpectrumModel } from '../src/spectrum/spectrum.js';
import { renderView, navItems, renderShellNav } from '../src/ui/views.js';

function fakePacket({ id=1,time=1000,channel=37,rssi=-50,address='AA:BB:CC:DD:EE:FF',advertising=true }={}) {
  return {
    id,
    wallTime:time,
    raw:new Uint8Array(64),
    typeName:'LE_PACKET',
    rssiMax:rssi,
    ble:{
      bleChannel:channel,
      address:advertising?address:null,
      addressType:advertising?'random / resolvable-private':null,
      isAdvertising:advertising,
      pduTypeName:advertising?'ADV_IND':'DATA',
      accessAddressHex:advertising?'0x8E89BED6':'0xA1B2C3D4',
      malformed:false,
      localName:advertising?'BenchTag':null,
      serviceUuids:[],
      manufacturerData:null
    }
  };
}

test('Batch 10 telemetry history is time-bucketed and bounded', () => {
  const history=new TelemetryHistory({bucketMs:1000,capacity:60});
  history.ingestPacket(fakePacket({time:1000}));
  history.ingestPacket(fakePacket({id:2,time:1200,channel:38}));
  history.ingestPacket(fakePacket({id:3,time:2100,channel:39}));
  let rows=history.snapshot();
  assert.equal(rows[0].packets,2);
  assert.equal(rows[0].blePackets,2);
  assert.equal(rows[0].packetRate,2);
  assert.equal(rows[1].packets,1);
  for(let i=0;i<100;i++) history.ingestPacket(fakePacket({id:10+i,time:3000+i*1000}));
  rows=history.snapshot();
  assert.ok(rows.length<=60);
  assert.ok(rows.at(-1).time>=100000);
});

test('Batch 11 device evidence retains bounded timestamped RSSI samples', () => {
  const map=new Map();
  for(let i=0;i<260;i++) ingestObservedDevice(map,fakePacket({id:i+1,time:1000+i*20,rssi:-80+(i%30)}),1000+i*20);
  const device=map.get('AA:BB:CC:DD:EE:FF');
  assert.equal(device.rssiHistory.length,96);
  assert.equal(device.rssiSamples.length,240);
  assert.ok(device.rssiSamples[0].time>1000);
  assert.equal(device.rssiSamples.at(-1).packetId,260);
});

test('Batch 10 navigation exposes Overview in Easy and Advanced modes with accessible current state', () => {
  assert.ok(navItems('easy').some(item=>item[0]==='overview'));
  assert.ok(navItems('advanced').some(item=>item[0]==='overview'));
  const html=renderShellNav('easy','overview');
  assert.match(html,/data-view="overview"/);
  assert.match(html,/aria-current="page"/);
});

test('Batch 11 Overview renders coordinated spectrum, channel, device, rate, connection and event evidence', () => {
  const recorder=new CaptureRecorder(); recorder.start('ble',[],{startedAt:1000});
  const channelActivity=new BleChannelActivity();
  const devices=new Map();
  const telemetry=new TelemetryHistory();
  for(let i=0;i<6;i++) {
    const packet=fakePacket({id:i+1,time:1000+i*1000,channel:i%2?38:37,rssi:-65+i*3});
    recorder.addPacket(packet); channelActivity.ingest(packet,packet.wallTime); ingestObservedDevice(devices,packet,packet.wallTime); telemetry.ingestPacket(packet,packet.wallTime);
  }
  recorder.event('New advertiser detected',{address:'AA:BB:CC:DD:EE:FF'},'info',1,'BLE');
  const spectrum=new SpectrumModel(2402,2480); spectrum.ingest([{frequency:2402,rssi:-70},{frequency:2440,rssi:-45},{frequency:2480,rssi:-72}],5000);
  const prefs={overviewChannelMetric:'rate',overviewChannelWindow:'10000',overviewRateWindow:120,packetChannelFilter:'37',selectedBleChannel:37};
  const state={prefs,mode:'advanced',recorder,telemetry,spectrum,transport:{connected:true},streaming:false,devices:[...devices.values()],connections:[{accessAddressHex:'0xA1B2C3D4',evidence:'OBSERVED',initiator:'11:22:33:44:55:66',advertiser:'AA:BB:CC:DD:EE:FF',packetCount:4,channels:new Set([0,12]),intervalMs:30,hopIncrement:9,endedAt:null}],channelActivity,selectedDeviceAddress:'AA:BB:CC:DD:EE:FF',selectedConnectionAccessAddress:'0xA1B2C3D4',selectedEventId:null,replay:{active:false,playing:false,index:-1,sourceEvents:[],document:null},connectionState:'CONNECTED',simulation:true};
  const html=renderView('overview',state);
  assert.match(html,/RF Overview/);
  assert.match(html,/PACKET-RATE HISTORY/);
  assert.match(html,/DEVICE RSSI HISTORY/);
  assert.match(html,/CONNECTION EVIDENCE/);
  assert.match(html,/RETAINED \/ LAST SPECTRUM/);
  assert.equal((html.match(/data-channel-select=/g)||[]).length,40);
  assert.match(html,/data-device-address=/);
  assert.match(html,/data-connection-aa=/);
  assert.match(html,/data-event-id=/);
  assert.match(html,/chart-focus-channel/);
  assert.match(html,/connection-flow selected related|connection-flow related selected/);
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length,'overview duplicate IDs');
});

test('Batch 10 release version and offline asset manifest stay synchronized', async () => {
  const fs=await import('node:fs');
  const path=await import('node:path');
  const { APP_VERSION }=await import('../src/version.js');
  const root=path.resolve(new URL('..',import.meta.url).pathname);
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  assert.equal(pkg.version,APP_VERSION);
  assert.match(sw,new RegExp(`ubertoothgui-v${APP_VERSION.replaceAll('.','\\.')}`));
  const quoted=[...sw.matchAll(/'\.\/([^']+)'/g)].map(match=>match[1]).filter(item=>item && item!=='');
  for(const asset of quoted) assert.ok(fs.existsSync(path.join(root,asset)),`missing service worker asset ${asset}`);
  assert.match(sw,/src\/analysis\/telemetry\.js/);
  assert.match(sw,/src\/ui\/overview\.js/);
});
