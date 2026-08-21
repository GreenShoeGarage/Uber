let wasm=null;
async function ensureWasm(){
  if(wasm)return wasm;
  const url=new URL('../../assets/libbtbb-kernel.wasm',import.meta.url);
  const bytes=await fetch(url).then(r=>{if(!r.ok)throw new Error(`WASM fetch ${r.status}`);return r.arrayBuffer();});
  const result=await WebAssembly.instantiate(bytes,{}); wasm=result.instance.exports; return wasm;
}
function makeResult(exp,meta){
  const offset=Number(exp.btbb_scan(meta.knownLap??0,meta.useKnown?1:0,meta.maxErrors??0)); if(offset<0)return null;
  const headerPresent=Boolean(exp.btbb_header_present()); const candidates=[];
  if(headerPresent)for(let clock6=0;clock6<64;clock6++)candidates.push({clock6,uap:Number(exp.btbb_candidate_uap(clock6)),type:Number(exp.btbb_candidate_type(clock6)),ltAddr:Number(exp.btbb_candidate_lt_addr(clock6)),flags:Number(exp.btbb_candidate_flags(clock6)),hec:Number(exp.btbb_candidate_hec(clock6))});
  return {bitOffset:offset,lap:Number(exp.btbb_last_lap()),acErrors:Number(exp.btbb_last_errors()),headerPresent,headerCandidates:candidates};
}
self.onmessage=async e=>{
  const {id,payload,options={}}=e.data;
  try{
    const exp=await ensureWasm();
    if(e.data.kind==='init'){self.postMessage({id,ok:true,result:{ready:true}});return;}
    const input=new Uint8Array(exp.memory.buffer,Number(exp.btbb_input_ptr()),50); input.fill(0);input.set(new Uint8Array(payload).subarray(0,50));
    const known=options.knownLap;
    const result=makeResult(exp,{knownLap:known??0,useKnown:known!==null&&known!==undefined,maxErrors:options.maxErrors??0});
    self.postMessage({id,ok:true,result});
  }catch(error){self.postMessage({id,ok:false,error:error?.message??String(error)});}
};
