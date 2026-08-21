import { BleChannelActivity } from '../bluetooth/channel-activity.js';

const id = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const finite = v => Number.isFinite(v) ? v : null;

export function newSurveyProject(name='RF Survey', now=Date.now()) {
  return { format:'ubertoothgui-survey', formatVersion:1, id:id('survey'), name:String(name||'RF Survey').trim()||'RF Survey', createdAt:now, updatedAt:now, stations:[] };
}

export function buildSpectrumSurveySample(model, {startedAt=Date.now(),endedAt=Date.now()}={}) {
  const samples=Array.from({length:model.binCount??0},(_,i)=>({frequency:model.low+i,rssi:model.seenEver?.[i]?Number(model.latest[i]):null,peak:model.seenEver?.[i]?Number(model.peak[i]):null,average:model.seenEver?.[i]?Number(model.average[i]):null})).filter(row=>Number.isFinite(row.rssi));
  const strongest=samples.reduce((best,row)=>!best||row.rssi>best.rssi?row:best,null);
  const mean=samples.length?samples.reduce((sum,row)=>sum+row.rssi,0)/samples.length:null;
  const peaks=[...samples].sort((a,b)=>b.rssi-a.rssi).slice(0,8);
  return { startedAt, endedAt, durationMs:Math.max(0,endedAt-startedAt), low:model.low, high:model.high, rawRssi:true, binCount:samples.length, meanRawRssi:finite(mean), strongest:strongest?{frequency:strongest.frequency,rawRssi:strongest.rssi}:null, peaks, samples };
}

export function buildBleSurveySample(packets=[], devices=[], connections=[], {startedAt=Date.now(),endedAt=Date.now()}={}) {
  const blePackets=packets.filter(p=>p.ble);
  const activity=new BleChannelActivity(5000);
  for(const p of blePackets) activity.ingest(p,p.wallTime??endedAt);
  const channels=activity.snapshot(endedAt).map(r=>({channel:r.channel,frequency:r.frequency,packetCount:r.packetCount,averageRssi:finite(r.averageRssi),peakRssi:finite(r.peakRssi),advertiserCount:r.advertiserCount}));
  const durationMs=Math.max(1,endedAt-startedAt);
  const strongest=[...devices].filter(d=>finite(d.strongestRssi)!==null).sort((a,b)=>b.strongestRssi-a.strongestRssi).slice(0,10).map(d=>({address:d.address,name:d.localName??null,peakRssi:d.strongestRssi,packetCount:d.packetCount,channels:Array.from(d.channels??[])}));
  return { startedAt, endedAt, durationMs, packetCount:blePackets.length, packetRate:blePackets.length/(durationMs/1000), advertiserCount:devices.length, connectionCount:connections.length, channels, strongestDevices:strongest, advertisers:devices.map(d=>({address:d.address,name:d.localName??null,peakRssi:finite(d.strongestRssi),packetCount:d.packetCount})) };
}

export function finalizeSurveyStation({name,spectrum,ble,startedAt,endedAt=Date.now(),note=''}) {
  const station={id:id('station'),name:String(name||'Station').trim()||'Station',note:String(note||''),startedAt,endedAt,spectrum,ble};
  station.fingerprint=surveyFingerprint(station);
  return station;
}

export function surveyFingerprint(station) {
  const busy=[...(station?.ble?.channels??[])].filter(c=>c.packetCount>0).sort((a,b)=>b.packetCount-a.packetCount).slice(0,5).map(c=>({channel:c.channel,packetCount:c.packetCount,peakRssi:c.peakRssi}));
  return { spectrumStrongestMHz:station?.spectrum?.strongest?.frequency??null, spectrumStrongestRawRssi:station?.spectrum?.strongest?.rawRssi??null, spectrumMeanRawRssi:station?.spectrum?.meanRawRssi??null, blePacketRate:station?.ble?.packetRate??0, advertiserCount:station?.ble?.advertiserCount??0, connectionCount:station?.ble?.connectionCount??0, busiestChannels:busy };
}

export function compareSurveyStations(a,b) {
  if(!a||!b) return null;
  const aMap=new Map((a.ble?.channels??[]).map(c=>[c.channel,c])); const bMap=new Map((b.ble?.channels??[]).map(c=>[c.channel,c]));
  const channelDeltas=Array.from({length:40},(_,channel)=>({channel,packetDelta:(bMap.get(channel)?.packetCount??0)-(aMap.get(channel)?.packetCount??0),peakRssiDelta:Number.isFinite(bMap.get(channel)?.peakRssi)&&Number.isFinite(aMap.get(channel)?.peakRssi)?bMap.get(channel).peakRssi-aMap.get(channel).peakRssi:null})).sort((x,y)=>Math.abs(y.packetDelta)-Math.abs(x.packetDelta));
  const aa=new Set((a.ble?.advertisers??[]).map(x=>x.address)); const bb=new Set((b.ble?.advertisers??[]).map(x=>x.address));
  return { from:a.id,to:b.id,packetRateDelta:(b.ble?.packetRate??0)-(a.ble?.packetRate??0),advertiserDelta:(b.ble?.advertiserCount??0)-(a.ble?.advertiserCount??0),connectionDelta:(b.ble?.connectionCount??0)-(a.ble?.connectionCount??0),spectrumMeanDelta:Number.isFinite(b.spectrum?.meanRawRssi)&&Number.isFinite(a.spectrum?.meanRawRssi)?b.spectrum.meanRawRssi-a.spectrum.meanRawRssi:null,addedAdvertisers:[...bb].filter(x=>!aa.has(x)),removedAdvertisers:[...aa].filter(x=>!bb.has(x)),channelDeltas };
}
