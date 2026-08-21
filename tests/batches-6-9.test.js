import test from 'node:test';
import assert from 'node:assert/strict';

import { BleChannelActivity } from '../src/bluetooth/channel-activity.js';
import { BleConnectionTracker } from '../src/bluetooth/connections.js';
import { parseUsbPacket, PacketType } from '../src/ubertooth/packets.js';
import { parseBlePacket, BLE_ADV_ACCESS_ADDRESS } from '../src/bluetooth/ble.js';
import { SimulationTransport } from '../src/transport/simulation.js';
import { UbertoothDevice } from '../src/ubertooth/device.js';
import { buildBlePcap, buildBlePcapng, bleAirFrame, blePseudoheader, LINKTYPE_BLUETOOTH_LE_LL_WITH_PHDR } from '../src/capture/pcap.js';
import { CaptureRecorder } from '../src/capture/recorder.js';
import { renderView, navItems } from '../src/ui/views.js';

async function simulatedFollowPackets() {
  const transport = new SimulationTransport();
  await transport.connect();
  const device = new UbertoothDevice(transport);
  await device.startBle({ follow:true, promiscuous:false, advertisingChannel:37 });
  const out=[];
  for (let i=0;i<2;i+=1) {
    const view=await device.receivePacket();
    const p=parseUsbPacket(new Uint8Array(view.buffer,view.byteOffset,view.byteLength),i);
    p.id=i+1; p.wallTime=1000+i*30; p.ble=parseBlePacket(p); out.push(p);
  }
  await transport.disconnect();
  return out;
}

test('Batch 6 channel model represents all 40 BLE channels and packet-relative occupancy', () => {
  const model=new BleChannelActivity(5000);
  for(let i=0;i<10;i++) model.ingest({ble:{bleChannel:37},rssiMax:-40,wallTime:1000+i*10},1000+i*10);
  for(let i=0;i<5;i++) model.ingest({ble:{bleChannel:0},rssiMax:-60,wallTime:1000+i*10},1000+i*10);
  model.ingest({ble:{bleChannel:39},rssiMax:-50,wallTime:1050},1050);
  const rows=model.snapshot(1100);
  assert.equal(rows.length,40);
  assert.equal(rows[0].frequency,2404);
  assert.equal(rows[37].frequency,2402);
  assert.equal(rows[38].frequency,2426);
  assert.equal(rows[39].frequency,2480);
  assert.equal(rows[37].kind,'advertising');
  assert.equal(rows[0].kind,'data');
  assert.equal(rows[37].occupancyEstimate,100);
  assert.equal(rows[0].occupancyEstimate,50);
  assert.equal(rows[37].averageRssi,-40);
  assert.equal(model.summary(1100).activeChannels,3);
});

test('Batch 8 CONNECT_IND parser exposes observed connection parameters with byte provenance', async () => {
  const [connect]=await simulatedFollowPackets();
  assert.equal(connect.ble.pduTypeName,'CONNECT_IND');
  assert.ok(connect.ble.connection);
  assert.equal(connect.ble.connection.accessAddressHex,'0xA1B2C3D4');
  assert.equal(connect.ble.connection.intervalMs,30);
  assert.equal(connect.ble.connection.supervisionTimeoutMs,2000);
  assert.equal(connect.ble.connection.hopIncrement,9);
  assert.equal(connect.ble.connection.channelMap.length,37);
  const prov=connect.ble.provenance.find(x=>x.key==='conn-aa');
  assert.deepEqual({start:prov.start,end:prov.end,value:prov.value},{start:32,end:36,value:'0xA1B2C3D4'});
});

test('Batch 8 connection tracker distinguishes observed CONNECT_IND from inferred data access addresses', async () => {
  const [connect,data]=await simulatedFollowPackets();
  const tracker=new BleConnectionTracker();
  let r=tracker.ingest(connect);
  assert.equal(r.observedConnect,true);
  assert.equal(r.connection.evidence,'OBSERVED');
  assert.equal(r.connection.packetCount,1);
  r=tracker.ingest(data);
  assert.equal(r.connection.evidence,'OBSERVED');
  assert.equal(r.connection.packetCount,2);
  assert.ok(r.connection.channels.has(data.ble.bleChannel));

  const inferred=new BleConnectionTracker();
  const i=inferred.ingest(data);
  assert.equal(i.created,true);
  assert.equal(i.connection.evidence,'INFERRED');
  assert.equal(i.connection.initiator,null);
  assert.equal(i.connection.advertiser,null);
});

test('Batch 8 simulation exercises passive promiscuous packet type and configured access address', async () => {
  const transport=new SimulationTransport(); await transport.connect();
  const device=new UbertoothDevice(transport);
  await device.setAccessAddress(0x11223344);
  await device.startBle({follow:false,promiscuous:true,advertisingChannel:37});
  const view=await device.receivePacket();
  const packet=parseUsbPacket(new Uint8Array(view.buffer,view.byteOffset,view.byteLength));
  packet.ble=parseBlePacket(packet);
  assert.equal(packet.type,PacketType.LE_PROMISC);
  assert.equal(packet.ble.accessAddressHex,'0x11223344');
  assert.equal(packet.ble.isAdvertising,false);
  await transport.disconnect();
});

test('Batch 9 PCAP emits DLT 256 BLE LL with RF pseudoheader and exact air frame', async () => {
  const [connect,data]=await simulatedFollowPackets();
  const result=buildBlePcap([connect,data]);
  assert.equal(result.linkType,LINKTYPE_BLUETOOTH_LE_LL_WITH_PHDR);
  assert.equal(result.exported,2);
  const v=new DataView(result.bytes.buffer,result.bytes.byteOffset,result.bytes.byteLength);
  assert.equal(v.getUint32(20,true),256);
  const firstRecordOffset=24;
  const incl=v.getUint32(firstRecordOffset+8,true);
  const firstPayload=result.bytes.slice(firstRecordOffset+16,firstRecordOffset+16+incl);
  assert.equal(firstPayload[0],37); // RF channel in pseudoheader
  const flags=new DataView(firstPayload.buffer,firstPayload.byteOffset,firstPayload.byteLength).getUint16(8,true);
  assert.equal(flags & 0x0001,0x0001); // dewhitened
  assert.equal(flags & 0x0002,0x0002); // signal power valid
  const air=bleAirFrame(connect);
  assert.deepEqual(Array.from(firstPayload.slice(10)),Array.from(air));
  assert.equal(new DataView(firstPayload.buffer,firstPayload.byteOffset+10,4).getUint32(0,true),BLE_ADV_ACCESS_ADDRESS);
});

test('Batch 9 PCAPNG uses SHB + IDB DLT 256 + enhanced packet blocks', async () => {
  const [connect,data]=await simulatedFollowPackets();
  const result=buildBlePcapng([connect,data]);
  assert.equal(result.exported,2);
  const v=new DataView(result.bytes.buffer,result.bytes.byteOffset,result.bytes.byteLength);
  assert.equal(v.getUint32(0,true),0x0a0d0d0a);
  const shbLen=v.getUint32(4,true);
  assert.equal(v.getUint32(shbLen,true),1);
  assert.equal(v.getUint16(shbLen+8,true),256);
  const idbLen=v.getUint32(shbLen+4,true);
  assert.equal(v.getUint32(shbLen+idbLen,true),6);
});

test('Batch 9 excludes malformed/truncated/non-BLE records instead of fabricating capture packets', async () => {
  const [connect]=await simulatedFollowPackets();
  const malformed={...connect,ble:{...connect.ble,malformed:true}};
  const spectrum={...connect,type:PacketType.SPECAN,typeName:'SPECAN',ble:null};
  const result=buildBlePcap([connect,malformed,spectrum]);
  assert.equal(result.exported,1);
  assert.equal(result.excluded,2);
  assert.equal(blePseudoheader(spectrum),null);
});

test('Batch 7 recorder events carry categories and editable evidence annotations', () => {
  const r=new CaptureRecorder(); r.start('ble',[],{startedAt:1000});
  r.event('BLE connection establishment observed',{accessAddress:'0x12345678'},'info',7,'BLE');
  const event=r.events.at(r.events.length-1);
  assert.equal(event.category,'BLE');
  assert.equal(event.packetId,7);
  r.annotateEvent(event.id,{bookmarked:true,note:'Review this connection',tags:['review','baseline']});
  assert.equal(event.annotation.bookmarked,true);
  assert.equal(event.annotation.note,'Review this connection');
  assert.deepEqual(event.annotation.tags,['review','baseline']);
});

test('Batch 6–9 advanced views expose channels, timeline, passive modes and PCAP without duplicate IDs', async () => {
  const recorder=new CaptureRecorder(); recorder.start('ble',[],{startedAt:1000});
  recorder.event('BLE scan started',{follow:false},'info',null,'BLE');
  const channelActivity=new BleChannelActivity();
  channelActivity.ingest({ble:{bleChannel:37},rssiMax:-50,wallTime:1100},1100);
  const prefs={packetSearch:'',packetFilter:'all',packetChannelFilter:'all',deviceSearch:'',deviceSort:'lastSeen',deviceActivityFilter:'all',deviceChannelFilter:'all',devicePinnedOnly:false,deviceShowHidden:false,pinnedDevices:[],hiddenDevices:[],selectedBleChannel:37,eventSearch:'',eventCategoryFilter:'all',eventLevelFilter:'all',bleFollowChannel:37,bleTargetAddress:'',bleTargetMask:48,bleCrcVerify:false,blePromiscAccessAddress:''};
  const base={prefs,mode:'advanced',recorder,transport:{connected:true},streaming:false,devices:[],connections:[],channelActivity,selectedDeviceAddress:null,selectedEventId:null,selectedPacket:null,inspectorHighlight:null,captureLibrary:[],captureSearch:'',replay:{active:false,playing:false,speed:1,index:-1,document:null,sourceEvents:[],range:{durationMs:0}},spectrum:{},capabilities:{},connectionState:'CONNECTED',simulation:true,logs:[],validation:null,soak:{},lastStreamConfig:null};
  assert.ok(navItems('advanced').some(x=>x[0]==='channels'));
  assert.ok(navItems('advanced').some(x=>x[0]==='timeline'));
  assert.ok(!navItems('easy').some(x=>x[0]==='channels'));
  for (const view of ['ble','channels','packets','timeline','capture']) {
    const html=renderView(view,base);
    const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(new Set(ids).size,ids.length,`${view} duplicate IDs`);
    if(view==='ble'){assert.match(html,/PROMISCUOUS/);assert.match(html,/CONNECTION EVIDENCE/);}
    if(view==='channels'){assert.match(html,/40-Channel Activity/);assert.match(html,/Relative occupancy/);assert.match(html,/CH 37|>37</);}
    if(view==='timeline'){assert.match(html,/Event Timeline/);assert.match(html,/EXPORT EVENTS CSV/);}
    if(view==='capture'){assert.match(html,/EXPORT PCAPNG/);assert.match(html,/DLT 256|link type 256/);}
  }
});

test('Batch 9 evidence package is a standard stored ZIP with canonical evidence files', async () => {
  const { buildEvidencePackage } = await import('../src/capture/evidence-package.js');
  const [connect,data]=await simulatedFollowPackets();
  const doc={schema:'ubertoothgui.capture.v3',id:'evidence-test',name:'Evidence Test',packets:[],events:[]};
  const result=buildEvidencePackage({captureDocument:doc,packets:[connect,data],events:[{id:'e1',time:1000,category:'BLE',level:'info',message:'test'}],diagnostics:{ok:true}});
  assert.deepEqual(Array.from(result.bytes.slice(0,4)),[0x50,0x4b,0x03,0x04]);
  for(const name of ['capture.json','manifest.json','packets.csv','devices.csv','events.csv','spectrum.csv','raw-usb64.bin','diagnostics.json','capture.pcap','capture.pcapng','README.txt']) assert.ok(result.entries.includes(name),name);
  assert.equal(result.manifest.packets.pcapEligible,2);
  assert.equal(result.manifest.formats.pcapLinkType,256);
});
