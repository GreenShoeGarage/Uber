import { parseClassicPacketJs, normalizeLap, lapHex, CLASSIC_PACKET_TYPE_NAMES } from '../bluetooth/classic.js';

export class ClassicDecoder extends EventTarget {
  constructor(){super();this.worker=null;this.pending=new Map();this.seq=0;this.status='javascript-fallback';this.lastError=null;}
  async initialize(){
    if(typeof Worker==='undefined'){this.status='javascript-fallback';return this.status;}
    if(this.worker && this.status==='wasm-worker-ready')return this.status;
    try{
      this.status='loading';
      this.worker=new Worker(new URL('./libbtbb-worker.js',import.meta.url),{type:'module'});
      this.worker.onmessage=e=>{const p=this.pending.get(e.data.id);if(!p)return;this.pending.delete(e.data.id);e.data.ok?p.resolve(e.data.result):p.reject(new Error(e.data.error));};
      this.worker.onerror=e=>{this.lastError=e.message||'libbtbb worker failed';this.status='javascript-fallback';this.worker?.terminate();this.worker=null;};
      const id=++this.seq;
      await new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker.postMessage({id,kind:'init'});setTimeout(()=>{if(this.pending.delete(id))reject(new Error('libbtbb worker initialization timeout'));},2000);});
      this.status='wasm-worker-ready';this.lastError=null;
    }catch(error){this.lastError=error.message;this.status='javascript-fallback';this.worker?.terminate();this.worker=null;}
    return this.status;
  }
  async decode(packet,{knownLap=null,maxErrors=0}={}){
    const lap=normalizeLap(knownLap); const options={knownLap:lap,maxErrors:Math.max(0,Math.min(4,Number(maxErrors)||0))};
    if(!this.worker)await this.initialize();
    if(this.worker){
      try{
        const id=++this.seq;const payload=packet.payload.slice().buffer;
        const raw=await new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker.postMessage({id,payload,options},[payload]);setTimeout(()=>{if(this.pending.delete(id))reject(new Error('libbtbb worker timeout'));},1500);});
        if(!raw)return null;
        const clock100ns=Number(packet.clock100ns??0)>>>0; const numerator=clock100ns+raw.bitOffset*10-4000;
        const localClkn=((((Number(packet.clknHigh??0)&0xff)<<20)+Math.floor(numerator/3125))>>>0); const clkOffset=((clock100ns+raw.bitOffset*10+6250-4000)%6250+6250)%6250;
        for(const h of raw.headerCandidates)h.typeName=CLASSIC_PACKET_TYPE_NAMES[h.type]??`TYPE ${h.type}`;
        return {engine:'libbtbb-wasm',evidence:'OBSERVED',...raw,lapHex:lapHex(raw.lap),channel:packet.channelOffset,frequency:packet.frequency,localClkn,clkOffset,headerCandidateCount:raw.headerCandidates.length,provenance:{accessCode:{start:14+Math.floor(raw.bitOffset/8),end:14+Math.floor((raw.bitOffset+63)/8)+1,label:'Classic access code'},header:{start:14+Math.floor((raw.bitOffset+68)/8),end:14+Math.floor((raw.bitOffset+121)/8)+1,label:'Classic FEC/whitened header symbols'}}};
      }catch(error){this.lastError=error.message;this.status='javascript-fallback';this.worker?.terminate();this.worker=null;}
    }
    return parseClassicPacketJs(packet,options);
  }
  destroy(){this.worker?.terminate();this.worker=null;for(const p of this.pending.values())p.reject(new Error('Classic decoder stopped'));this.pending.clear();}
}
