import { APP_NAME, APP_VERSION } from '../version.js';
import { PacketType, parseSpectrumRecords } from '../ubertooth/packets.js';
import { ingestObservedDevice, deviceActivityState } from '../bluetooth/devices.js';
import { buildBlePcap, buildBlePcapng } from './pcap.js';
import { buildStoredZip } from './zip.js';
import { downloadBlob } from '../utils/binary.js';

const enc=new TextEncoder();
const csvCell=v=>/[",\n]/.test(String(v??''))?`"${String(v??'').replaceAll('"','""')}"`:String(v??'');
const csv=rows=>rows.map(row=>row.map(csvCell).join(',')).join('\n');

function packetsCsv(packets) {
  const rows=[['id','time','type','frequencyMHz','bleChannel','classicChannel','rssiDbm','accessAddress','pduType','address','classicLap','classicUap','classicPacketType','length','status','bookmarked','tags','note']];
  for(const p of packets) rows.push([p.id,p.wallTime??p.receivedAt,p.typeName,p.frequency,p.ble?.bleChannel??'',p.classic?.channel??'',p.rssiMax??'',p.ble?.accessAddressHex??'',p.ble?.pduTypeName??'',p.ble?.address??'',p.classic?.lapHex??'',p.classic?.selectedHeader?.uapHex??'',p.classic?.selectedHeader?.typeName??'',p.ble?.length??'',p.status,p.annotation?.bookmarked?'yes':'no',(p.annotation?.tags??[]).join(';'),p.annotation?.note??'']);
  return csv(rows);
}
function eventsCsv(events) {
  return csv([['id','time','category','level','message','packetId','detail','bookmarked','tags','note'],...events.map(e=>[e.id,e.time,e.category??'',e.level??'info',e.message??'',e.packetId??'',JSON.stringify(e.detail??{}),e.annotation?.bookmarked?'yes':'no',(e.annotation?.tags??[]).join(';'),e.annotation?.note??''])]);
}
function deviceInventory(packets) {
  const map=new Map(); let last=Date.now();
  for(const p of packets){ if(p.ble?.address){last=Number(p.wallTime??last);ingestObservedDevice(map,p,last);} }
  return {devices:[...map.values()],time:last};
}
function devicesCsv(packets) {
  const {devices,time}=deviceInventory(packets);
  const rows=[['address','addressType','name','activity','firstSeen','lastSeen','packets','rssiDbm','averageRssiDbm','peakRssiDbm','channels','pduTypes','manufacturerCompanyId','manufacturerData','serviceUuids','scanResponseSeen']];
  for(const d of devices) rows.push([d.address,d.addressType,d.localName??'',deviceActivityState(d,time),d.firstSeen,d.lastSeen,d.packetCount,d.rssi??'',d.averageRssi??'',d.strongestRssi??'',Array.from(d.channels??[]).sort((a,b)=>a-b).join(';'),Array.from(d.pduTypes??[]).join(';'),d.manufacturerCompanyId??'',d.manufacturerData??'',Array.from(d.serviceUuids??[]).join(';'),d.scanResponseSeen?'yes':'no']);
  return csv(rows);
}
function spectrumCsv(packets) {
  const rows=[['packetId','time','frequencyMHz','rawRssi']];
  for(const p of packets){ if(p.type!==PacketType.SPECAN)continue; for(const r of parseSpectrumRecords(p)) rows.push([p.id,p.wallTime??p.receivedAt,r.frequency,r.rssi]); }
  return csv(rows);
}
function classicCsv(packets) {
  const rows=[['packetId','time','frequencyMHz','classicChannel','rssiDbm','lap','acErrors','bitOffset','headerPresent','uapCandidate','uapConfidence','clock6Candidate','ltAddr','packetType','decoder']];
  for(const p of packets){if(!p.classic)continue;const h=p.classic.selectedHeader??{};const ranked=p.classic.rankedUaps?.[0];rows.push([p.id,p.wallTime??p.receivedAt,p.frequency,p.classic.channel,p.rssiMax??'',p.classic.lapHex,p.classic.acErrors,p.classic.bitOffset,p.classic.headerPresent?'yes':'no',h.uapHex??ranked?.uapHex??'',ranked?.confidence??'',h.clock6??'',h.ltAddr??'',h.typeName??'',p.classic.engine??'']);}
  return csv(rows);
}

function rawUsb(packets) {
  const complete=packets.filter(p=>p.raw?.byteLength===64); const out=new Uint8Array(complete.length*64); complete.forEach((p,i)=>out.set(p.raw,i*64)); return out;
}
function safeName(value){return String(value??'ubertooth-capture').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'')||'ubertooth-capture';}

export function buildEvidencePackage({captureDocument,packets=[],events=[],diagnostics={}}) {
  const pcap=buildBlePcap(packets), pcapng=buildBlePcapng(packets);
  const manifest={application:{name:APP_NAME,version:APP_VERSION},createdAt:new Date().toISOString(),captureId:captureDocument?.id??captureDocument?.session?.id??null,packets:{total:packets.length,classic:packets.filter(p=>p.classic).length,pcapEligible:pcap.exported,pcapExcluded:pcap.excluded},formats:{pcapLinkType:pcap.linkType,pcapngLinkType:pcapng.linkType,rawUsbRecordBytes:64},notes:['PCAP/PCAPNG contain only complete BLE Link Layer packets with known BLE channel metadata.','Spectrum, Bluetooth Classic, and malformed/truncated BLE records remain in capture.json/raw-usb64.bin and are not fabricated into BLE capture frames.','Bluetooth Classic observations are additionally summarized in classic.csv; standards-correct Classic PCAP is not implemented in this release.']};
  const entries=[
    {name:'capture.json',data:JSON.stringify(captureDocument,null,2)},
    {name:'manifest.json',data:JSON.stringify(manifest,null,2)},
    {name:'packets.csv',data:packetsCsv(packets)},
    {name:'devices.csv',data:devicesCsv(packets)},
    {name:'events.csv',data:eventsCsv(events)},
    {name:'spectrum.csv',data:spectrumCsv(packets)},
    {name:'classic.csv',data:classicCsv(packets)},
    {name:'raw-usb64.bin',data:rawUsb(packets)},
    {name:'diagnostics.json',data:JSON.stringify(diagnostics,null,2)}
  ];
  if(pcap.exported){entries.push({name:'capture.pcap',data:pcap.bytes},{name:'capture.pcapng',data:pcapng.bytes});}
  entries.push({name:'README.txt',data:`${APP_NAME} ${APP_VERSION} evidence package\n\nThis package is local evidence exported by the browser application.\nBLE PCAP/PCAPNG use LINKTYPE_BLUETOOTH_LE_LL_WITH_PHDR / DLT 256.\nEligible BLE frames: ${pcap.exported}\nExcluded non-BLE, malformed, truncated, or channel-unknown records: ${pcap.excluded}\nRaw Ubertooth USB evidence remains in capture.json and raw-usb64.bin.\nBluetooth Classic observations are summarized in classic.csv; no Classic PCAP/PCAPNG is fabricated by this release.\n`});
  return {bytes:buildStoredZip(entries),entries:entries.map(e=>e.name),manifest};
}

export function exportEvidencePackage(input) {
  const result=buildEvidencePackage(input);
  const name=safeName(input.captureDocument?.name??input.captureDocument?.session?.name);
  downloadBlob(new Blob([result.bytes],{type:'application/zip'}),`${name}-evidence.zip`);
  return result;
}
