import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { SimulationTransport } from '../src/transport/simulation.js';
import { UbertoothDevice } from '../src/ubertooth/device.js';
import { parseUsbPacket, PacketType } from '../src/ubertooth/packets.js';
import { parseBlePacket } from '../src/bluetooth/ble.js';
import { parseLlControl } from '../src/bluetooth/advanced.js';
import { BleConnectionTracker } from '../src/bluetooth/connections.js';
import { ingestObservedDevice, deviceClassifications } from '../src/bluetooth/devices.js';
import { SpectrumModel } from '../src/spectrum/spectrum.js';
import { newSurveyProject, buildSpectrumSurveySample, buildBleSurveySample, finalizeSurveyStation, compareSurveyStations } from '../src/survey/survey.js';
import { renderView, navItems } from '../src/ui/views.js';
import { CaptureRecorder } from '../src/capture/recorder.js';
import { BleChannelActivity } from '../src/bluetooth/channel-activity.js';

async function nextParsed(device, predicate, limit=140) {
  for (let i=0;i<limit;i++) {
    const dv=await device.receivePacket();
    const packet=parseUsbPacket(new Uint8Array(dv.buffer,dv.byteOffset,dv.byteLength),performance.now());
    packet.id=i+1; packet.wallTime=1000+i*20;
    if (packet.type===PacketType.LE_PACKET || packet.type===PacketType.LE_PROMISC) packet.ble=parseBlePacket(packet);
    if (predicate(packet)) return packet;
  }
  throw new Error('predicate not observed');
}

test('Batch 12 extended advertising exposes AdvA, ADI, AuxPtr, properties and byte provenance', async () => {
  const t=new SimulationTransport(); await t.connect(); const d=new UbertoothDevice(t); await d.startBle({follow:false,promiscuous:false,advertisingChannel:37});
  const p=await nextParsed(d,p=>Boolean(p.ble?.extendedAdvertising));
  assert.equal(p.ble.pduTypeName,'ADV_EXT_IND');
  assert.equal(p.ble.address,'C8:44:73:62:2A:EE');
  assert.ok(p.ble.advertisingProperties.includes('EXTENDED'));
  assert.equal(p.ble.extendedAdvertising.fields.adi.sid,3);
  assert.equal(p.ble.extendedAdvertising.fields.auxPtr.channelIndex,15);
  assert.equal(p.ble.extendedAdvertising.fields.auxPtr.phy,'LE 2M');
  assert.equal(p.ble.advertisingData.fields.length,0,'primary ADV_EXT_IND must not fabricate application AdvData');
  assert.ok(p.ble.provenance.some(x=>x.key==='ext-auxptr'));
  assert.equal(p.ble.malformed,false);
});

test('Batch 12 Link Layer control parser decodes map, version, length and PHY evidence', () => {
  const map=parseLlControl(Uint8Array.of(0x01,0xff,0xff,0xff,0xff,0x1f,0x40,0x00));
  assert.equal(map.name,'LL_CHANNEL_MAP_IND'); assert.equal(map.decoded.channelMap.length,37); assert.equal(map.decoded.instant,64);
  const version=parseLlControl(Uint8Array.of(0x0c,0x0b,0x4c,0x00,0x34,0x12));
  assert.equal(version.decoded.companyId,0x004c); assert.equal(version.decoded.subversion,0x1234);
  const length=parseLlControl(Uint8Array.of(0x15,0xfb,0x00,0x48,0x08,0xfb,0x00,0x48,0x08));
  assert.equal(length.decoded.maxRxOctets,251); assert.equal(length.decoded.maxTxTimeUs,2120);
  const phy=parseLlControl(Uint8Array.of(0x16,0x03,0x05));
  assert.deepEqual(phy.decoded.txPhys,['LE 1M','LE 2M']); assert.deepEqual(phy.decoded.rxPhys,['LE 1M','LE Coded']);
});

test('Batch 12 connection tracker retains bounded control chronology without claiming pending map application', () => {
  const tracker=new BleConnectionTracker();
  const packet={id:1,wallTime:1000,rssiMax:-40,ble:{isAdvertising:false,accessAddressHex:'0xA1B2C3D4',bleChannel:12,llControl:parseLlControl(Uint8Array.of(0x01,0xff,0xff,0xff,0xff,0x1f,0x20,0x00)),controlName:'LL_CHANNEL_MAP_IND'}};
  tracker.ingest(packet);
  const c=tracker.list()[0];
  assert.equal(c.evidence,'INFERRED');
  assert.equal(c.controlHistory.length,1);
  assert.equal(c.pendingChannelMap.instant,32);
  assert.match(c.pendingChannelMap.evidence,/not independently confirmed/i);
});

test('Batch 12 device profile is explicitly observation/heuristic based', () => {
  const map=new Map();
  const packet={id:1,wallTime:1000,rssiMax:-55,ble:{address:'AA:BB:CC:DD:EE:FF',addressType:'Random/private possible',bleChannel:37,pduTypeName:'ADV_EXT_IND',advertisingProperties:['NON-CONNECTABLE','NON-SCANNABLE','EXTENDED'],extendedAdvertising:{fields:{adi:{sid:7}}},manufacturerData:'4C00AB',manufacturerCompanyId:0x004c,serviceUuids:[],serviceData:[],flags:null,flagNames:[]}};
  ingestObservedDevice(map,packet,1000);
  const labels=deviceClassifications(map.values().next().value);
  assert.ok(labels.includes('EXTENDED ADV OBSERVED'));
  assert.ok(labels.includes('NON-CONNECTABLE OBSERVED'));
  assert.ok(labels.includes('BEACON-LIKE HEURISTIC'));
});

test('Batch 13 survey snapshots remain evidence summaries and compare stations', () => {
  const spectrum=new SpectrumModel(2402,2404); spectrum.ingest([{frequency:2402,rssi:-80},{frequency:2403,rssi:-45},{frequency:2404,rssi:-70}],1100);
  const s1=buildSpectrumSurveySample(spectrum,{startedAt:1000,endedAt:2000});
  assert.equal(s1.strongest.frequency,2403); assert.equal(s1.rawRssi,true);
  const packets=[{id:1,wallTime:2100,rssiMax:-55,ble:{bleChannel:37,address:'AA',isAdvertising:true}},{id:2,wallTime:2200,rssiMax:-45,ble:{bleChannel:38,address:'BB',isAdvertising:true}}];
  const devices=[{address:'AA',localName:'A',strongestRssi:-55,packetCount:1,channels:new Set([37])},{address:'BB',localName:'B',strongestRssi:-45,packetCount:1,channels:new Set([38])}];
  const b1=buildBleSurveySample(packets,devices,[],{startedAt:2000,endedAt:3000});
  const a=finalizeSurveyStation({name:'A',spectrum:s1,ble:b1,startedAt:1000,endedAt:3000});
  const b=structuredClone(a); b.id='station-b'; b.name='B'; b.ble.packetRate+=3; b.ble.advertiserCount+=1; b.ble.advertisers.push({address:'CC'}); b.fingerprint={...b.fingerprint,blePacketRate:b.ble.packetRate,advertiserCount:b.ble.advertiserCount};
  const c=compareSurveyStations(a,b);
  assert.equal(c.packetRateDelta,3); assert.equal(c.advertiserDelta,1); assert.deepEqual(c.addedAdvertisers,['CC']);
});

test('Batch 13 navigation and view expose sequential spectrum-to-BLE measurement and local project controls', () => {
  assert.ok(navItems('easy').some(item=>item[0]==='survey'));
  const project=newSurveyProject('Workshop',1000);
  const recorder=new CaptureRecorder(); recorder.start('idle',[],{startedAt:1000});
  const state={prefs:{surveyActiveProjectId:project.id,surveySampleSeconds:30,surveyCompareA:'',surveyCompareB:''},surveyProjects:[project],surveyRun:{active:false},transport:{connected:true},recorder,mode:'easy',streaming:false};
  const html=renderView('survey',state);
  assert.match(html,/SPECTRUM SAMPLE/); assert.match(html,/BLE SAMPLE/); assert.match(html,/does not run SPECAN and BLE acquisition simultaneously/);
  assert.match(html,/START STATION/); assert.match(html,/EXPORT JSON/); assert.match(html,/EXPORT CSV/);
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]); assert.equal(new Set(ids).size,ids.length);
});

test('Batch 13 IndexedDB schema carries a separate surveys store', () => {
  const root=path.resolve(new URL('..',import.meta.url).pathname);
  const source=fs.readFileSync(path.join(root,'src/storage/db.js'),'utf8');
  assert.match(source,/DB_VERSION = 2/); assert.match(source,/SURVEY_STORE = 'surveys'/); assert.match(source,/class SurveyStore/);
});


test('Batch 12/13 release assets and app integration are included in the offline build', async () => {
  const { APP_VERSION }=await import('../src/version.js');
  const root=path.resolve(new URL('..',import.meta.url).pathname);
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
  assert.match(APP_VERSION,/^1\.8\.\d+$/);
  assert.equal(pkg.version,APP_VERSION);
  assert.match(sw,new RegExp(`ubertoothgui-v${APP_VERSION.replaceAll('.','\\.')}`));
  for (const asset of ['src/bluetooth/advanced.js','src/survey/survey.js','src/survey/export.js','src/ui/survey.js']) {
    assert.match(sw,new RegExp(asset.replaceAll('.', '\\.')));
    assert.ok(fs.existsSync(path.join(root,asset)));
  }
  assert.match(app,/startSurveyStation\(/);
  assert.match(app,/advanceSurveyRun\(/);
  assert.match(app,/surveyStore/);
});
