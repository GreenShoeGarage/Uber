import { lapHex, uapHex } from './classic.js';

export class ClassicPiconetTracker {
  constructor(){ this.map=new Map(); }
  reset(){ this.map.clear(); }
  ingest(packet){
    const c=packet?.classic; if(!c) return {observation:null,created:false};
    const key=lapHex(c.lap); let o=this.map.get(key); const now=Number(packet.wallTime??Date.now());
    const created=!o;
    if(!o){o={lap:c.lap,lapHex:key,firstSeen:now,lastSeen:now,packetCount:0,headerPacketCount:0,channels:new Set(),rssiSum:0,rssiCount:0,peakRssi:null,minAcErrors:null,uapVotes:new Map(),packetTypes:new Map(),selectedUap:null,uapConfidence:0,selectedHeader:null,evidence:'OBSERVED LAP'};this.map.set(key,o);}
    o.lastSeen=now;o.packetCount++;o.channels.add(c.channel);o.minAcErrors=o.minAcErrors===null?c.acErrors:Math.min(o.minAcErrors,c.acErrors);
    if(Number.isFinite(packet.rssiMax)){o.rssiSum+=packet.rssiMax;o.rssiCount++;o.peakRssi=o.peakRssi===null?packet.rssiMax:Math.max(o.peakRssi,packet.rssiMax);}
    const beforeUap=o.selectedUap;
    if(c.headerPresent && c.headerCandidates?.length){
      o.headerPacketCount++;
      const unique=new Set(c.headerCandidates.map(x=>x.uap));
      for(const uap of unique)o.uapVotes.set(uap,(o.uapVotes.get(uap)||0)+1);
      const ranked=[...o.uapVotes.entries()].sort((a,b)=>b[1]-a[1]);
      if(ranked.length){const [uap,count]=ranked[0];o.uapConfidence=o.headerPacketCount?count/o.headerPacketCount:0;o.selectedUap=count>=3&&o.uapConfidence>=0.6?uap:null;}
      if(o.selectedUap!==null){const chosen=c.headerCandidates.find(x=>x.uap===o.selectedUap);if(chosen){o.selectedHeader={...chosen,uapHex:uapHex(chosen.uap)};o.packetTypes.set(chosen.typeName,(o.packetTypes.get(chosen.typeName)||0)+1);c.selectedHeader=o.selectedHeader;c.evidence='DECODED CANDIDATE';}}
      c.rankedUaps=ranked.slice(0,5).map(([uap,count])=>({uap,uapHex:uapHex(uap),count,confidence:o.headerPacketCount?count/o.headerPacketCount:0}));
      c.headerCandidateCount=c.headerCandidates.length;
      delete c.headerCandidates;
    }
    return {observation:o,created,uapResolved:beforeUap===null&&o.selectedUap!==null};
  }
  list(){return [...this.map.values()].map(o=>({...o,channels:[...o.channels].sort((a,b)=>a-b),averageRssi:o.rssiCount?o.rssiSum/o.rssiCount:null,rankedUaps:[...o.uapVotes.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([uap,count])=>({uap,uapHex:uapHex(uap),count,confidence:o.headerPacketCount?count/o.headerPacketCount:0})),topPacketTypes:[...o.packetTypes.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,count])=>({name,count}))})).sort((a,b)=>b.lastSeen-a.lastSeen);}
}
