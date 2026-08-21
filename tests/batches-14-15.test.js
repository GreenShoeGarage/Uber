import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { PacketType, parseUsbPacket } from '../src/ubertooth/packets.js';
import { buildClassicSymbolPayload, unpackClassicSymbols, packClassicSymbols, parseClassicPacketJs, scanClassicAccessCode } from '../src/bluetooth/classic.js';
import { ClassicPiconetTracker } from '../src/bluetooth/classic-tracker.js';
import { SimulationTransport } from '../src/transport/simulation.js';
import { UbertoothDevice } from '../src/ubertooth/device.js';
import { deserializePacket } from '../src/capture/replay.js';
import { renderView, navItems } from '../src/ui/views.js';
import { CaptureRecorder } from '../src/capture/recorder.js';
import { buildEvidencePackage } from '../src/capture/evidence-package.js';
import path from 'node:path';

function brPacket({lap=0x9e8b33,uap=0x4a,clock6=17,type=4,offset=20,channel=39,id=1,time=1000}={}){
  const raw=new Uint8Array(64); const v=new DataView(raw.buffer);
  raw[0]=PacketType.BR_PACKET; raw[2]=channel; raw[3]=2; v.setUint32(4,1000000+id*1000,true); v.setInt8(8,-20);v.setInt8(9,-28);v.setInt8(10,-24);raw[11]=12;
  raw.set(buildClassicSymbolPayload({lap,uap,clock6,packetType:type,bitOffset:offset}),14);
  const p=parseUsbPacket(raw,time);p.id=id;p.wallTime=time;return p;
}

test('Batch 14 JS Classic parser recovers observed LAP and intended clock-six/UAP/header candidate',()=>{
  const p=brPacket();p.classic=parseClassicPacketJs(p,{});
  assert.equal(p.classic.lapHex,'0x9E8B33'); assert.equal(p.classic.bitOffset,20); assert.equal(p.classic.headerPresent,true);
  const h=p.classic.headerCandidates.find(x=>x.clock6===17); assert.equal(h.uap,0x4a); assert.equal(h.type,4); assert.equal(h.typeName,'DH1 / 2-DH1');
  assert.deepEqual(p.classic.provenance.accessCode,{start:16,end:25,label:'Classic access code'});
});

test('Batch 14 known-LAP matching tolerates configured access-code errors while unknown discovery stays exact',()=>{
  const payload=buildClassicSymbolPayload({lap:0x123456,uap:0x7a,clock6:8,bitOffset:25}); const symbols=unpackClassicSymbols(payload); symbols[29]^=1;symbols[41]^=1; const noisy=packClassicSymbols(symbols);
  assert.equal(scanClassicAccessCode(noisy,{}),null);
  const known=scanClassicAccessCode(noisy,{knownLap:'123456',maxErrors:2}); assert.equal(known.lap,0x123456);assert.equal(known.acErrors,2);assert.equal(known.bitOffset,25);
});

test('Batch 14 piconet tracker stabilizes repeated UAP candidate without claiming full master clock',()=>{
  const tracker=new ClassicPiconetTracker();
  for(let i=0;i<6;i++){const p=brPacket({clock6:(i*9)&63,type:i%2?4:11,id:i+1,time:1000+i*50});p.classic=parseClassicPacketJs(p,{});tracker.ingest(p);}
  const o=tracker.list()[0];assert.equal(o.lapHex,'0x9E8B33');assert.equal(o.selectedUap,0x4a);assert.ok(o.uapConfidence>=0.6);assert.equal(o.packetCount,6);assert.ok(o.topPacketTypes.length>=1);
});

test('Batch 14 SimulationTransport uses RX_SYMBOLS bulk BR_PACKET path',async()=>{
  const t=new SimulationTransport();await t.connect();const d=new UbertoothDevice(t);await d.startClassic({channel:'sweep'});assert.equal(d.mode,'classic');assert.equal(t.mode,'classic');
  const dv=await d.receivePacket();const p=parseUsbPacket(new Uint8Array(dv.buffer,dv.byteOffset,dv.byteLength),0);assert.equal(p.type,PacketType.BR_PACKET);const c=parseClassicPacketJs(p,{});assert.equal(c.lapHex,'0x9E8B33');
});

test('Batch 15 compiled WebAssembly kernel matches JS evidence for known synthetic frame',async()=>{
  const {instance}=await WebAssembly.instantiate(fs.readFileSync(new URL('../assets/libbtbb-kernel.wasm',import.meta.url)),{});const e=instance.exports;
  const input=new Uint8Array(e.memory.buffer,Number(e.btbb_input_ptr()),50);input.set(buildClassicSymbolPayload({lap:0x9e8b33,uap:0x4a,clock6:17,packetType:4,bitOffset:20}));
  assert.equal(Number(e.btbb_scan(0,0,0)),20);assert.equal(Number(e.btbb_last_lap()),0x9e8b33);assert.equal(Number(e.btbb_last_errors()),0);assert.equal(Number(e.btbb_header_present()),1);assert.equal(Number(e.btbb_candidate_uap(17)),0x4a);assert.equal(Number(e.btbb_candidate_type(17)),4);
});

test('Batch 15 replay reconstructs Classic evidence from original 64-byte raw record',()=>{
  const p=brPacket(); const record={id:7,wallTime:1234,receivedAt:1234,classic:{lap:0x9e8b33,acErrors:0},rawHex:Array.from(p.raw,b=>b.toString(16).padStart(2,'0')).join('')};
  const r=deserializePacket(record);assert.equal(r.type,PacketType.BR_PACKET);assert.equal(r.classic.lapHex,'0x9E8B33');assert.equal(r.raw.byteLength,64);
});

test('Batch 14/15 Advanced navigation and Classic workspace expose observation and decoder boundaries',()=>{
  assert.ok(navItems('advanced').some(x=>x[0]==='classic'));assert.ok(!navItems('easy').some(x=>x[0]==='classic'));
  const recorder=new CaptureRecorder();recorder.start('idle',[],{startedAt:1000});
  const state={prefs:{classicChannel:'sweep',classicKnownLap:'',classicMaxErrors:0},transport:{connected:true},streaming:false,classicObservations:[],classicDecoder:{status:'wasm-worker-ready'},selectedClassicLap:null,recorder};
  const html=renderView('classic',state);assert.match(html,/START CLASSIC/);assert.match(html,/RX_SYMBOLS/);assert.match(html,/WASM WORKER/);assert.match(html,/MASTER CLOCK/);assert.match(html,/CLASSIC PCAP/);assert.match(html,/exact-match only/i);
});


test('Batch 14 Classic-only evidence package preserves Classic evidence without fabricating BLE PCAP',()=>{
  const p=brPacket();p.classic=parseClassicPacketJs(p,{});
  const tracker=new ClassicPiconetTracker();
  for(let i=0;i<4;i++) tracker.ingest(p);
  const result=buildEvidencePackage({captureDocument:{schema:'ubertoothgui.capture.v3',id:'classic-only',name:'Classic Only'},packets:[p],events:[],diagnostics:{}});
  assert.equal(result.manifest.packets.classic,1);
  assert.ok(result.entries.includes('classic.csv'));
  assert.ok(result.entries.includes('capture.json'));
  assert.ok(result.entries.includes('raw-usb64.bin'));
  assert.ok(!result.entries.includes('capture.pcap'));
  assert.ok(!result.entries.includes('capture.pcapng'));
  assert.match(result.manifest.notes.join(' '),/Classic PCAP is not implemented/i);
});

test('Batch 15 v1.8 release packages Classic/WASM runtime assets for offline use',async()=>{
  const { APP_VERSION }=await import('../src/version.js');
  const root=path.resolve(new URL('..',import.meta.url).pathname);
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  assert.match(APP_VERSION,/^1\.8\.\d+$/);
  assert.equal(pkg.version,APP_VERSION);
  assert.match(sw,new RegExp(`ubertoothgui-v${APP_VERSION.replaceAll('.','\\.')}`));
  for(const asset of ['src/bluetooth/classic.js','src/bluetooth/classic-tracker.js','src/decoder/classic-decoder.js','src/decoder/libbtbb-worker.js','src/ui/classic.js','assets/libbtbb-kernel.wasm']){
    assert.match(sw,new RegExp(asset.replaceAll('.', '\\.')));
    assert.ok(fs.existsSync(path.join(root,asset)),asset);
  }
  assert.ok(fs.existsSync(path.join(root,'third_party/libbtbb-wasm/kernel.c')));
  assert.ok(fs.existsSync(path.join(root,'third_party/libbtbb-wasm/LICENSE')));
});
