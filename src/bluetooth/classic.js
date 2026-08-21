import { PacketType } from '../ubertooth/packets.js';

export const CLASSIC_CHANNEL_COUNT = 79;
export const CLASSIC_SWEEP_SENTINEL = 9999;
export const CLASSIC_PACKET_TYPE_NAMES = Object.freeze([
  'NULL','POLL','FHS','DM1','DH1 / 2-DH1','HV1','HV2 / 2-EV3','HV3 / EV3 / 3-EV3',
  'DV / 3-DH1','AUX1','DM3 / 2-DH3','DH3 / 3-DH3','EV4 / 2-EV5','EV5 / 3-EV5','DM5 / 2-DH5','DH5 / 3-DH5'
]);

const INDICES = Uint8Array.from([
  99,85,17,50,102,58,108,45,92,62,32,118,88,11,80,2,37,69,55,8,20,40,74,114,15,106,30,78,53,72,28,26,
  68,7,39,113,105,77,71,25,84,49,57,44,61,117,10,1,123,124,22,125,111,23,42,126,6,112,76,24,48,43,116,0
]);
const WHITENING_DATA = Uint8Array.from([
  1,1,1,0,0,0,1,1,1,0,1,1,0,0,0,1,0,1,0,0,1,0,1,1,1,1,1,0,1,0,1,0,1,0,0,0,0,1,0,1,1,0,1,1,1,1,0,0,
  1,1,1,0,0,1,0,1,0,1,1,0,0,1,1,0,0,0,0,0,1,1,0,1,1,0,1,0,1,1,1,0,1,0,0,0,1,1,0,0,1,0,0,0,1,0,0,0,
  0,0,0,1,0,0,1,0,0,1,1,0,1,0,0,0,1,1,1,1,0,1,1,1,0,0,0,0,1,1,1
]);
const SW_MATRIX = [
  0xfe000002a0d1c014n,0x01000003f0b9201fn,0x008000033ae40edbn,0x004000035fca99b9n,
  0x002000036d5dd208n,0x00100001b6aee904n,0x00080000db577482n,0x000400006dabba41n,
  0x00020002f46d43f4n,0x000100017a36a1fan,0x00008000bd1b50fdn,0x000040029c3536aan,
  0x000020014e1a9b55n,0x0000100265b5d37en,0x0000080132dae9bfn,0x000004025bd5ea0bn,
  0x00000203ef526bd1n,0x000001033511ab3cn,0x000000819a88d59en,0x00000040cd446acfn,
  0x00000022a41aabb3n,0x0000001390b5cb0dn,0x0000000b0ae27b52n,0x0000000585713da9n
];
const DEFAULT_CODEWORD = 0xb0000002c7820e7en;

export function normalizeLap(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff) return value;
  const clean = String(value).trim().replace(/^0x/i,'').replace(/[^0-9a-f]/gi,'');
  if (!clean || clean.length > 6) return null;
  const parsed = Number.parseInt(clean,16);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 0xffffff ? parsed : null;
}

export function lapHex(lap) { return `0x${(lap >>> 0).toString(16).padStart(6,'0').toUpperCase()}`; }
export function uapHex(uap) { return uap === null || uap === undefined ? '—' : `0x${(uap & 0xff).toString(16).padStart(2,'0').toUpperCase()}`; }
export function classicChannelToFrequency(channel) { return 2402 + Math.max(0, Math.min(78, Number(channel))); }

export function unpackClassicSymbols(payload) {
  const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload ?? 0);
  const symbols = new Uint8Array(bytes.length * 8);
  for (let i=0;i<bytes.length;i++) for (let j=0;j<8;j++) symbols[i*8+j] = ((bytes[i] << j) & 0x80) >>> 7;
  return symbols;
}

export function packClassicSymbols(symbols, byteLength = 50) {
  const out = new Uint8Array(byteLength);
  const n = Math.min(symbols.length, byteLength*8);
  for (let i=0;i<n;i++) if (symbols[i] & 1) out[Math.floor(i/8)] |= 1 << (7-(i%8));
  return out;
}

export function generateClassicSyncword(lap) {
  const l = normalizeLap(lap);
  if (l === null) throw new Error('Classic LAP must be a 24-bit hexadecimal value.');
  let codeword = DEFAULT_CODEWORD;
  for (let i=0;i<24;i++) if (l & (0x800000 >>> i)) codeword ^= SW_MATRIX[i];
  return BigInt.asUintN(64, codeword);
}

function bitsToBigIntAir(symbols, offset, count) {
  let v=0n;
  for (let i=0;i<count;i++) if (symbols[offset+i] & 1) v |= 1n << BigInt(i);
  return v;
}
function bitsToNumberAir(symbols, offset, count) {
  let v=0;
  for (let i=0;i<count;i++) v |= (symbols[offset+i]&1) << i;
  return v >>> 0;
}
function popcountBigInt(v) { let n=0; while(v){v &= v-1n; n++;} return n; }

export function scanClassicAccessCode(payloadOrSymbols, { knownLap=null, maxErrors=0 } = {}) {
  const symbols = payloadOrSymbols instanceof Uint8Array && payloadOrSymbols.length === 400
    ? payloadOrSymbols : unpackClassicSymbols(payloadOrSymbols);
  const known = normalizeLap(knownLap);
  const threshold = Math.max(0, Math.min(4, Number(maxErrors) || 0));
  if (known !== null) {
    const expected = generateClassicSyncword(known);
    for (let offset=0;offset<=symbols.length-64;offset++) {
      const errors = popcountBigInt(bitsToBigIntAir(symbols,offset,64) ^ expected);
      if (errors <= threshold) return { bitOffset:offset, lap:known, acErrors:errors };
    }
    return null;
  }
  // Narrow JS fallback: exact arbitrary-LAP discovery. libbtbb/WASM adds the
  // same deterministic path; arbitrary-LAP error correction remains outside
  // this browser subset for now rather than implying full libbtbb parity.
  for (let offset=0;offset<=symbols.length-64;offset++) {
    const sync = bitsToBigIntAir(symbols,offset,64);
    const candidate = Number((sync >> 34n) & 0xffffffn);
    if (generateClassicSyncword(candidate) === sync) return { bitOffset:offset, lap:candidate, acErrors:0 };
  }
  return null;
}

export function classicHeaderPresent(symbolsOrPayload, bitOffset) {
  const symbols = symbolsOrPayload instanceof Uint8Array && symbolsOrPayload.length === 400
    ? symbolsOrPayload : unpackClassicSymbols(symbolsOrPayload);
  if (bitOffset < 0 || bitOffset + 122 > symbols.length) return false;
  let p = bitOffset+63;
  const msb = symbols[p];
  let errors = 0;
  errors += symbols[p+1] ^ (!msb ? 1:0);
  errors += symbols[p+2] ^ msb;
  errors += symbols[p+3] ^ (!msb ? 1:0);
  errors += symbols[p+4] ^ msb;
  p += 5;
  for(let a=0;a<54;a+=3){ const x=symbols[p+a],y=symbols[p+a+1],z=symbols[p+a+2]; errors += ((x^y)|(y^z)|(z^x)); }
  return errors < 18;
}
function reverse8(byte) {
  let out=0; for(let i=0;i<8;i++) out |= ((byte>>>i)&1) << (7-i); return out;
}
function uapFromHec(data, hec) {
  let h=hec&0xff;
  for(let i=9;i>=0;i--){ if(h&0x80) h ^= 0x65; h=((h<<1)|(((h>>>7)^(data>>>i))&1))&0xff; }
  return reverse8(h);
}
function unfec13(symbols, offset) {
  const out = new Uint8Array(18);
  for(let i=0;i<18;i++){ const a=symbols[offset+i*3],b=symbols[offset+i*3+1],c=symbols[offset+i*3+2]; out[i]=(a&b)|(b&c)|(c&a); }
  return out;
}
function whiten(bits, clock, skip=0) {
  const out=new Uint8Array(bits.length); let idx=(INDICES[clock&0x3f]+skip)%127;
  for(let i=0;i<bits.length;i++){out[i]=bits[i]^WHITENING_DATA[idx];idx=(idx+1)%127;} return out;
}

export function decodeClassicHeaderCandidates(payloadOrSymbols, bitOffset) {
  const symbols = payloadOrSymbols instanceof Uint8Array && payloadOrSymbols.length === 400
    ? payloadOrSymbols : unpackClassicSymbols(payloadOrSymbols);
  if (!classicHeaderPresent(symbols,bitOffset)) return [];
  const fec = unfec13(symbols,bitOffset+68);
  const out=[];
  for(let clock6=0;clock6<64;clock6++){
    const h=whiten(fec,clock6);
    const data=bitsToNumberAir(h,0,10);
    const hec=bitsToNumberAir(h,10,8);
    const type=bitsToNumberAir(h,3,4);
    out.push({
      clock6,
      uap:uapFromHec(data,hec),
      ltAddr:bitsToNumberAir(h,0,3),
      type,
      typeName:CLASSIC_PACKET_TYPE_NAMES[type] ?? `TYPE ${type}`,
      flags:bitsToNumberAir(h,7,3),
      hec
    });
  }
  return out;
}

export function parseClassicPacketJs(packet, options={}) {
  if (!packet || packet.type !== PacketType.BR_PACKET) return null;
  if ((packet.status & 0x20) !== 0 || packet.channelOffset > 78) return null;
  const symbols=unpackClassicSymbols(packet.payload);
  const ac=scanClassicAccessCode(symbols,options);
  if (!ac) return null;
  const headerPresent=classicHeaderPresent(symbols,ac.bitOffset);
  const headerCandidates=headerPresent?decodeClassicHeaderCandidates(symbols,ac.bitOffset):[];
  const clock100ns=Number(packet.clock100ns ?? 0)>>>0;
  const numerator=clock100ns + ac.bitOffset*10 - 4000;
  const localClkn=((((Number(packet.clknHigh??0)&0xff)<<20) + Math.floor(numerator/3125)) >>> 0);
  const clkOffset=((clock100ns + ac.bitOffset*10 + 6250 - 4000)%6250+6250)%6250;
  const byteStart=14+Math.floor(ac.bitOffset/8);
  const byteEnd=14+Math.floor((ac.bitOffset+63)/8)+1;
  const headerByteStart=14+Math.floor((ac.bitOffset+68)/8);
  const headerByteEnd=14+Math.floor((ac.bitOffset+121)/8)+1;
  return {
    engine:'javascript-fallback', evidence:'OBSERVED', lap:ac.lap, lapHex:lapHex(ac.lap), acErrors:ac.acErrors,
    bitOffset:ac.bitOffset, channel:packet.channelOffset, frequency:packet.frequency, localClkn, clkOffset,
    headerPresent, headerCandidates, headerCandidateCount:headerCandidates.length,
    provenance:{ accessCode:{start:byteStart,end:byteEnd,label:'Classic access code'}, header:{start:headerByteStart,end:headerByteEnd,label:'Classic FEC/whitened header symbols'} }
  };
}

function findHecForUap(data,uap){ for(let hec=0;hec<256;hec++) if(uapFromHec(data,hec)===(uap&0xff)) return hec; return 0; }
export function buildClassicSymbolPayload({lap=0x9e8b33,uap=0x4a,clock6=17,packetType=4,ltAddr=1,flags=0,bitOffset=20,byteLength=50}={}){
  const symbols=new Uint8Array(byteLength*8);
  // deterministic low-amplitude background bits to avoid accidental all-zero assumptions
  for(let i=0;i<symbols.length;i++) symbols[i]=((i*17+3)%29===0)?1:0;
  const sync=generateClassicSyncword(lap);
  for(let i=0;i<64;i++) symbols[bitOffset+i]=Number((sync>>BigInt(i))&1n);
  const msb=symbols[bitOffset+63];
  symbols[bitOffset+64]=msb?0:1; symbols[bitOffset+65]=msb; symbols[bitOffset+66]=msb?0:1; symbols[bitOffset+67]=msb;
  const header=new Uint8Array(18);
  for(let i=0;i<3;i++) header[i]=(ltAddr>>>i)&1;
  for(let i=0;i<4;i++) header[3+i]=(packetType>>>i)&1;
  for(let i=0;i<3;i++) header[7+i]=(flags>>>i)&1;
  const data=(ltAddr&7)|((packetType&15)<<3)|((flags&7)<<7);
  const hec=findHecForUap(data,uap);
  for(let i=0;i<8;i++) header[10+i]=(hec>>>i)&1;
  const whitened=whiten(header,clock6);
  let p=bitOffset+68;
  for(const bit of whitened){ symbols[p++]=bit;symbols[p++]=bit;symbols[p++]=bit; }
  return packClassicSymbols(symbols,byteLength);
}
