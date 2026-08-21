import test from 'node:test';
import assert from 'node:assert/strict';

import { parseUsbPacket, PacketType } from '../src/ubertooth/packets.js';
import { BLE_ADV_ACCESS_ADDRESS, parseBlePacket, decodeAdvertisingData } from '../src/bluetooth/ble.js';
import { ingestObservedDevice, deviceActivityState } from '../src/bluetooth/devices.js';
import { CaptureRecorder } from '../src/capture/recorder.js';
import { captureJson } from '../src/capture/export.js';
import { CAPTURE_SCHEMA, LEGACY_CAPTURE_SCHEMA, deserializePacket, validateCaptureDocument } from '../src/capture/replay.js';
import { toHexCompact } from '../src/utils/binary.js';

function concat(...arrays) {
  const n=arrays.reduce((sum,a)=>sum+a.length,0), out=new Uint8Array(n); let o=0;
  for(const a of arrays){out.set(a,o);o+=a.length;} return out;
}
function ad(type, bytes){const out=new Uint8Array(bytes.length+2);out[0]=bytes.length+1;out[1]=type;out.set(bytes,2);return out;}
function macAir(){return Uint8Array.of(0x10,0x77,0x24,0x9a,0x61,0xd2);}
function packetWithAd(fields, {type=0, time=1000, id=1, rssi=-20}={}) {
  const raw=new Uint8Array(64); const v=new DataView(raw.buffer);
  raw[0]=PacketType.LE_PACKET; raw[2]=0; v.setUint32(4,123,true); v.setInt8(8,rssi); v.setInt8(9,rssi-4); v.setInt8(10,rssi-2); raw[11]=8;
  const data=raw.subarray(14); new DataView(data.buffer,data.byteOffset,data.byteLength).setUint32(0,BLE_ADV_ACCESS_ADDRESS,true);
  const payload=concat(macAir(),...fields); data[4]=0x40|type; data[5]=payload.length; data.set(payload,6); data.set([0x11,0x22,0x33],6+payload.length);
  const p=parseUsbPacket(raw,0);p.id=id;p.wallTime=time;p.ble=parseBlePacket(p);return p;
}

const flags=ad(0x01,Uint8Array.of(0x06));
const name=ad(0x09,new TextEncoder().encode('BenchTag'));
const service=ad(0x03,Uint8Array.of(0x0f,0x18));
const tx=ad(0x0a,Uint8Array.of(0xf4));
const appearance=ad(0x19,Uint8Array.of(0x41,0x03));
const mfg=ad(0xff,Uint8Array.of(0x4c,0x00,0x02,0x15));

test('Batch 3 GAP decoder exposes names, flags, services, TX power, appearance and manufacturer evidence', () => {
  const decoded=decodeAdvertisingData(concat(flags,name,service,tx,appearance,mfg),26);
  assert.equal(decoded.localName,'BenchTag');
  assert.equal(decoded.localNameComplete,true);
  assert.equal(decoded.flags,0x06);
  assert.ok(decoded.flagNames.includes('BR/EDR Not Supported'));
  assert.deepEqual(decoded.serviceUuids,['0x180F']);
  assert.equal(decoded.txPower,-12);
  assert.equal(decoded.appearance,0x0341);
  assert.equal(decoded.manufacturerCompanyId,0x004c);
  assert.match(decoded.manufacturerData,/4C 00 02 15/);
  assert.equal(decoded.fields[0].byteRange.start,26);
});

test('Batch 3 BLE parser carries decoded-to-USB byte provenance and CRC evidence', () => {
  const p=packetWithAd([flags,name,service,mfg]);
  assert.equal(p.ble.address,'D2:61:9A:24:77:10');
  assert.equal(p.ble.bleChannel,37);
  assert.equal(p.ble.crcHex,'11 22 33');
  assert.deepEqual(p.ble.provenance.find(x=>x.key==='accessAddress'), {key:'accessAddress',label:'Access address',start:14,end:18,value:'0x8E89BED6'});
  const address=p.ble.provenance.find(x=>x.key==='address');
  assert.equal(address.start,20); assert.equal(address.end,26);
  const local=p.ble.provenance.find(x=>x.label==='Complete Local Name');
  assert.ok(local.start>=26 && local.end>local.start);
});

test('Batch 3 device inventory correlates scan response and derives session activity state', () => {
  const map=new Map();
  const advPacket=packetWithAd([flags,mfg],{time:1000,id:1});
  let result=ingestObservedDevice(map,advPacket,1000);
  assert.equal(result.isNew,true);
  assert.equal(deviceActivityState(result.device,1500),'NEW');
  const scan=packetWithAd([name,service],{type:4,time:40000,id:2,rssi:-18});
  result=ingestObservedDevice(map,scan,40000);
  assert.equal(result.returned,true);
  assert.equal(result.device.scanResponseSeen,true);
  assert.equal(result.device.localName,'BenchTag');
  assert.equal(deviceActivityState(result.device,40001),'RETURNED');
  assert.equal(deviceActivityState({...result.device,returnedAt:null,firstSeen:0,lastSeen:1000,packetCount:50},32000),'GONE');
});

test('Batch 5 capture v2 preserves raw evidence and packet annotations through replay reconstruction', () => {
  const recorder=new CaptureRecorder(20); recorder.start('ble',[],{id:'capture-test',name:'Lab baseline',startedAt:1000});
  const packet=packetWithAd([flags,name,service,mfg],{time:1100,id:7});
  recorder.addPacket(packet); recorder.setAnnotation(7,{bookmarked:true,note:'baseline advertisement',tags:['baseline','interesting']}); recorder.stop({stoppedAt:1200,silent:true});
  const doc=captureJson(recorder,{deviceInfo:{board:'test'}});
  assert.equal(doc.schema,CAPTURE_SCHEMA); assert.equal(doc.id,'capture-test'); assert.equal(doc.name,'Lab baseline'); assert.equal(doc.packets.length,1);
  assert.equal(doc.packets[0].rawHex.length,128); assert.equal(doc.packets[0].annotation.bookmarked,true);
  validateCaptureDocument(doc);
  const rebuilt=deserializePacket(doc.packets[0]);
  assert.equal(toHexCompact(rebuilt.raw),doc.packets[0].rawHex);
  assert.equal(rebuilt.ble.localName,'BenchTag');
  assert.equal(rebuilt.annotation.note,'baseline advertisement');
  assert.deepEqual(rebuilt.annotation.tags,['baseline','interesting']);
});

test('Batch 5 replay accepts legacy v1 captures but rejects truncated raw evidence', () => {
  const packet=packetWithAd([flags],{id:2});
  const legacy={schema:LEGACY_CAPTURE_SCHEMA,packets:[{id:2,receivedAt:1,rawHex:toHexCompact(packet.raw)}],events:[]};
  assert.equal(validateCaptureDocument(legacy),legacy);
  assert.throws(()=>validateCaptureDocument({...legacy,packets:[{rawHex:'AA'}]}),/64-byte/);
});

test('Batch 3–5 views expose filters, byte provenance, annotations, replay and local library without duplicate IDs', async () => {
  const {renderView}=await import('../src/ui/views.js');
  const recorder=new CaptureRecorder(); recorder.start('ble',[],{id:'view-test',name:'View Test',startedAt:1000});
  const packet=packetWithAd([flags,name,service,mfg],{time:1100,id:1}); recorder.addPacket(packet);
  const devices=new Map(); ingestObservedDevice(devices,packet,1100);
  const base={prefs:{packetSearch:'',packetFilter:'all',deviceSearch:'',deviceSort:'lastSeen',deviceActivityFilter:'all',deviceChannelFilter:'all',devicePinnedOnly:false,deviceShowHidden:false,pinnedDevices:[],hiddenDevices:[]},mode:'advanced',recorder,transport:{connected:true},streaming:false,devices:[...devices.values()],selectedDeviceAddress:packet.ble.address,selectedPacket:packet,inspectorHighlight:{start:20,end:26,label:'Advertiser'},captureLibrary:[],captureSearch:'',replay:{active:false,playing:false,speed:1,index:-1,document:null,sourceEvents:[],range:{durationMs:0}},spectrum:{},capabilities:{},connectionState:'CONNECTED',simulation:true,logs:[],validation:null,soak:{},lastStreamConfig:null};
  for(const view of ['ble','devices','packets','capture']){
    const html=renderView(view,base);
    const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(new Set(ids).size,ids.length,`${view} duplicate IDs`);
    if(view==='devices') assert.match(html,/PIN DEVICE|UNPIN/);
    if(view==='packets'){assert.match(html,/Decoded → Source Bytes/);assert.match(html,/baseline|ANNOTATION/i);}
    if(view==='capture'){assert.match(html,/LOCAL CAPTURE LIBRARY/);assert.match(html,/IMPORT JSON/);}
  }
});
