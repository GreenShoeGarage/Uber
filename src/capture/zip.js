const enc = new TextEncoder();

let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Uint32Array(256);
  for (let n=0;n<256;n+=1) {
    let c=n;
    for (let k=0;k<8;k+=1) c=(c&1) ? (0xedb88320 ^ (c>>>1)) : (c>>>1);
    CRC_TABLE[n]=c>>>0;
  }
  return CRC_TABLE;
}

export function crc32(bytes) {
  const table=crcTable(); let c=0xffffffff;
  for (const b of bytes) c=table[(c^b)&0xff] ^ (c>>>8);
  return (c^0xffffffff)>>>0;
}

function concat(parts) {
  const size=parts.reduce((n,p)=>n+p.byteLength,0); const out=new Uint8Array(size); let o=0;
  for (const p of parts) { out.set(p,o); o+=p.byteLength; }
  return out;
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return enc.encode(String(value ?? ''));
}

function dosDateTime(ms=Date.now()) {
  const d=new Date(ms); const year=Math.max(1980,d.getFullYear());
  const time=((d.getHours()&31)<<11)|((d.getMinutes()&63)<<5)|((Math.floor(d.getSeconds()/2))&31);
  const date=(((year-1980)&127)<<9)|(((d.getMonth()+1)&15)<<5)|(d.getDate()&31);
  return {time,date};
}

/** Build a standards-compatible ZIP using the STORE method (no compression). */
export function buildStoredZip(entries, timestamp=Date.now()) {
  if (!Array.isArray(entries) || !entries.length) throw new Error('ZIP requires at least one entry.');
  const locals=[]; const centrals=[]; let offset=0;
  const dt=dosDateTime(timestamp);
  for (const entry of entries) {
    const name=enc.encode(String(entry.name).replace(/^\/+/,''));
    const data=asBytes(entry.data);
    const crc=crc32(data);
    const local=new Uint8Array(30+name.byteLength); const lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true); lv.setUint16(4,20,true); lv.setUint16(6,0x0800,true); lv.setUint16(8,0,true);
    lv.setUint16(10,dt.time,true); lv.setUint16(12,dt.date,true); lv.setUint32(14,crc,true); lv.setUint32(18,data.byteLength,true); lv.setUint32(22,data.byteLength,true);
    lv.setUint16(26,name.byteLength,true); lv.setUint16(28,0,true); local.set(name,30);
    locals.push(local,data);

    const central=new Uint8Array(46+name.byteLength); const cv=new DataView(central.buffer);
    cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); cv.setUint16(6,20,true); cv.setUint16(8,0x0800,true); cv.setUint16(10,0,true);
    cv.setUint16(12,dt.time,true); cv.setUint16(14,dt.date,true); cv.setUint32(16,crc,true); cv.setUint32(20,data.byteLength,true); cv.setUint32(24,data.byteLength,true);
    cv.setUint16(28,name.byteLength,true); cv.setUint16(30,0,true); cv.setUint16(32,0,true); cv.setUint16(34,0,true); cv.setUint16(36,0,true); cv.setUint32(38,0,true); cv.setUint32(42,offset,true); central.set(name,46);
    centrals.push(central);
    offset += local.byteLength + data.byteLength;
  }
  const centralData=concat(centrals);
  const eocd=new Uint8Array(22); const ev=new DataView(eocd.buffer);
  ev.setUint32(0,0x06054b50,true); ev.setUint16(4,0,true); ev.setUint16(6,0,true); ev.setUint16(8,entries.length,true); ev.setUint16(10,entries.length,true);
  ev.setUint32(12,centralData.byteLength,true); ev.setUint32(16,offset,true); ev.setUint16(20,0,true);
  return concat([...locals,centralData,eocd]);
}
