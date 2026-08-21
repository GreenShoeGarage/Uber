import { formatMac, i8, toHex } from '../utils/binary.js';

const hex = (value, width = 2) => `0x${Number(value >>> 0).toString(16).padStart(width, '0').toUpperCase()}`;
const u16 = (bytes, offset = 0) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);

export const LL_CONTROL_NAMES = Object.freeze({
  0x00:'LL_CONNECTION_UPDATE_IND', 0x01:'LL_CHANNEL_MAP_IND', 0x02:'LL_TERMINATE_IND',
  0x03:'LL_ENC_REQ', 0x04:'LL_ENC_RSP', 0x05:'LL_START_ENC_REQ', 0x06:'LL_START_ENC_RSP',
  0x07:'LL_UNKNOWN_RSP', 0x08:'LL_FEATURE_REQ', 0x09:'LL_FEATURE_RSP', 0x0A:'LL_PAUSE_ENC_REQ',
  0x0B:'LL_PAUSE_ENC_RSP', 0x0C:'LL_VERSION_IND', 0x0D:'LL_REJECT_IND', 0x0E:'LL_PERIPHERAL_FEATURE_REQ',
  0x0F:'LL_CONNECTION_PARAM_REQ', 0x10:'LL_CONNECTION_PARAM_RSP', 0x11:'LL_REJECT_EXT_IND',
  0x12:'LL_PING_REQ', 0x13:'LL_PING_RSP', 0x14:'LL_LENGTH_REQ', 0x15:'LL_LENGTH_RSP',
  0x16:'LL_PHY_REQ', 0x17:'LL_PHY_RSP', 0x18:'LL_PHY_UPDATE_IND', 0x19:'LL_MIN_USED_CHANNELS_IND',
  0x1A:'LL_CTE_REQ', 0x1B:'LL_CTE_RSP', 0x1C:'LL_PERIODIC_SYNC_IND', 0x1D:'LL_CLOCK_ACCURACY_REQ',
  0x1E:'LL_CLOCK_ACCURACY_RSP', 0x1F:'LL_CIS_REQ', 0x20:'LL_CIS_RSP', 0x21:'LL_CIS_IND',
  0x22:'LL_CIS_TERMINATE_IND', 0x23:'LL_POWER_CONTROL_REQ', 0x24:'LL_POWER_CONTROL_RSP',
  0x25:'LL_POWER_CHANGE_IND', 0x26:'LL_SUBRATE_REQ', 0x27:'LL_SUBRATE_IND', 0x28:'LL_CHANNEL_REPORTING_IND',
  0x29:'LL_CHANNEL_STATUS_IND', 0x2A:'LL_PERIODIC_SYNC_WR_IND', 0x2B:'LL_FEATURE_EXT_REQ', 0x2C:'LL_FEATURE_EXT_RSP'
});

export function channelMapFromBytes(bytes) {
  const channels = [];
  for (let channel = 0; channel < 37; channel += 1) {
    if (bytes[Math.floor(channel / 8)] & (1 << (channel % 8))) channels.push(channel);
  }
  return channels;
}

const PHY_NAMES = Object.freeze({ 1:'LE 1M', 2:'LE 2M', 3:'LE Coded' });
const AUX_PHY_NAMES = Object.freeze({ 0:'LE 1M', 1:'LE 2M', 2:'LE Coded' });
function phyMask(value) {
  const out=[];
  if (value & 0x01) out.push('LE 1M');
  if (value & 0x02) out.push('LE 2M');
  if (value & 0x04) out.push('LE Coded');
  return out;
}

/** Parse selected Link Layer control PDUs. Unknown opcodes remain evidence-safe raw payloads. */
export function parseLlControl(pdu, baseRawOffset = 20) {
  if (!pdu?.length) return null;
  const opcode = pdu[0];
  const name = LL_CONTROL_NAMES[opcode] ?? `LL_CONTROL_${hex(opcode)}`;
  const body = pdu.slice(1);
  const result = { opcode, opcodeHex:hex(opcode), name, rawHex:toHex(body).toUpperCase(), decoded:{}, provenance:[], malformed:false };
  const range = (key,label,start,len,value) => result.provenance.push({ key, label, start:baseRawOffset+start, end:baseRawOffset+start+len, value:String(value) });
  range('ll-control-opcode','LL control opcode',0,1,name);
  const need = n => { if (body.length < n) { result.malformed=true; result.decoded.error=`Expected at least ${n} control bytes; observed ${body.length}.`; return false; } return true; };

  if (opcode === 0x00 && need(11)) {
    const d=result.decoded;
    d.windowSize=body[0]; d.windowOffset=u16(body,1); d.intervalUnits=u16(body,3); d.intervalMs=d.intervalUnits*1.25;
    d.latency=u16(body,5); d.timeoutUnits=u16(body,7); d.timeoutMs=d.timeoutUnits*10; d.instant=u16(body,9);
    range('ll-win-size','Window size',1,1,d.windowSize); range('ll-win-offset','Window offset',2,2,d.windowOffset);
    range('ll-interval','Connection interval',4,2,`${d.intervalMs} ms`); range('ll-latency','Connection latency',6,2,d.latency);
    range('ll-timeout','Supervision timeout',8,2,`${d.timeoutMs} ms`); range('ll-instant','Instant',10,2,d.instant);
  } else if (opcode === 0x01 && need(7)) {
    const map=body.slice(0,5); result.decoded.channelMapHex=toHex(map).toUpperCase(); result.decoded.channelMap=channelMapFromBytes(map); result.decoded.instant=u16(body,5);
    range('ll-channel-map','Channel map',1,5,result.decoded.channelMap.join(', ')); range('ll-instant','Instant',6,2,result.decoded.instant);
  } else if (opcode === 0x02 && need(1)) {
    result.decoded.errorCode=body[0]; range('ll-error','Termination reason',1,1,hex(body[0]));
  } else if (opcode === 0x07 && need(1)) {
    result.decoded.unknownType=body[0]; range('ll-unknown','Unknown/rejected opcode',1,1,hex(body[0]));
  } else if ([0x08,0x09,0x0E,0x2B,0x2C].includes(opcode) && need(8)) {
    result.decoded.featuresHex=toHex(body.slice(0,8)).toUpperCase(); range('ll-features','Feature set',1,8,result.decoded.featuresHex);
  } else if (opcode === 0x0C && need(5)) {
    result.decoded.version=body[0]; result.decoded.companyId=u16(body,1); result.decoded.subversion=u16(body,3);
    range('ll-version','Link Layer version',1,1,hex(body[0])); range('ll-company','Company ID',2,2,hex(result.decoded.companyId,4)); range('ll-subversion','Subversion',4,2,hex(result.decoded.subversion,4));
  } else if (opcode === 0x0D && need(1)) {
    result.decoded.errorCode=body[0]; range('ll-error','Reject reason',1,1,hex(body[0]));
  } else if (opcode === 0x11 && need(2)) {
    result.decoded.rejectOpcode=body[0]; result.decoded.rejectName=LL_CONTROL_NAMES[body[0]]??hex(body[0]); result.decoded.errorCode=body[1];
    range('ll-reject-opcode','Rejected opcode',1,1,result.decoded.rejectName); range('ll-error','Reject reason',2,1,hex(body[1]));
  } else if ([0x14,0x15].includes(opcode) && need(8)) {
    result.decoded.maxRxOctets=u16(body,0); result.decoded.maxRxTimeUs=u16(body,2); result.decoded.maxTxOctets=u16(body,4); result.decoded.maxTxTimeUs=u16(body,6);
    range('ll-rx-octets','Max RX octets',1,2,result.decoded.maxRxOctets); range('ll-rx-time','Max RX time',3,2,`${result.decoded.maxRxTimeUs} µs`);
    range('ll-tx-octets','Max TX octets',5,2,result.decoded.maxTxOctets); range('ll-tx-time','Max TX time',7,2,`${result.decoded.maxTxTimeUs} µs`);
  } else if ([0x16,0x17].includes(opcode) && need(2)) {
    result.decoded.txPhys=phyMask(body[0]); result.decoded.rxPhys=phyMask(body[1]);
    range('ll-tx-phys','TX PHY preference',1,1,result.decoded.txPhys.join(', ')||'None'); range('ll-rx-phys','RX PHY preference',2,1,result.decoded.rxPhys.join(', ')||'None');
  } else if (opcode === 0x18 && need(4)) {
    result.decoded.masterToSlavePhy=PHY_NAMES[body[0]]??hex(body[0]); result.decoded.slaveToMasterPhy=PHY_NAMES[body[1]]??hex(body[1]); result.decoded.instant=u16(body,2);
    range('ll-m2s-phy','Central → peripheral PHY',1,1,result.decoded.masterToSlavePhy); range('ll-s2m-phy','Peripheral → central PHY',2,1,result.decoded.slaveToMasterPhy); range('ll-instant','Instant',3,2,result.decoded.instant);
  }
  return result;
}

function pushField(result,key,label,rawStart,len,value) {
  result.provenance.push({key,label,start:rawStart,end:rawStart+len,value:String(value)});
}

/** Parse the common extended advertising header carried by ADV_EXT_IND. */
export function parseExtendedAdvertising(pdu, header0, baseRawOffset = 20) {
  const result={ advMode:null, properties:[], extendedHeaderLength:0, flags:0, fields:{}, advertiserAddress:null, advertiserAddressType:null, advertisingData:new Uint8Array(), advertisingDataRawOffset:null, provenance:[], malformed:false };
  if (!pdu?.length) { result.malformed=true; return result; }
  const first=pdu[0]; const extLen=first & 0x3f; const advMode=(first>>6)&0x03;
  result.advMode=advMode; result.extendedHeaderLength=extLen;
  result.properties = advMode===0 ? ['NON-CONNECTABLE','NON-SCANNABLE'] : advMode===1 ? ['CONNECTABLE','NON-SCANNABLE'] : advMode===2 ? ['NON-CONNECTABLE','SCANNABLE'] : ['RESERVED ADV MODE'];
  pushField(result,'ext-header','Extended header length / AdvMode',baseRawOffset,1,`${extLen} B · ${result.properties.join(' / ')}`);
  if (1+extLen > pdu.length) { result.malformed=true; return result; }
  if (!extLen) { result.advertisingData=pdu.slice(1); result.advertisingDataRawOffset=baseRawOffset+1; return result; }
  const flags=pdu[1]; result.flags=flags; pushField(result,'ext-flags','Extended header flags',baseRawOffset+1,1,hex(flags));
  let o=2; const headerEnd=1+extLen;
  const take=(len,key,label,decoder)=>{
    if (o+len>headerEnd) { result.malformed=true; return null; }
    const bytes=pdu.slice(o,o+len); const start=baseRawOffset+o; o+=len; const value=decoder(bytes,start); if(value!==undefined&&value!==null) pushField(result,key,label,start,len,typeof value==='string'?value:JSON.stringify(value)); return value;
  };
  if(flags&0x01) result.fields.advA=take(6,'ext-adva','Extended advertiser address',b=>formatMac(b,true));
  if(flags&0x02) result.fields.targetA=take(6,'ext-targeta','Extended target address',b=>formatMac(b,true));
  if(flags&0x04) result.fields.cteInfo=take(1,'ext-cte','CTE info',b=>hex(b[0]));
  if(flags&0x08) result.fields.adi=take(2,'ext-adi','Advertising Data Info',b=>{ const v=u16(b); return { sid:(v>>12)&0x0f, did:v&0x0fff, rawHex:toHex(b).toUpperCase() }; });
  if(flags&0x10) result.fields.auxPtr=take(3,'ext-auxptr','AuxPtr',b=>{ const offsetUnits=(b[0]&0x80)?300:30; const auxOffset=b[1]|((b[2]&0x1f)<<8); const phyCode=(b[2]>>5)&0x07; return { channelIndex:b[0]&0x3f, clockAccuracy:(b[0]>>6)&1, offsetUnitsUs:offsetUnits, auxOffset, offsetUs:auxOffset*offsetUnits, phy:AUX_PHY_NAMES[phyCode]??`PHY ${phyCode}` }; });
  if(flags&0x20) result.fields.syncInfo=take(18,'ext-sync','SyncInfo',b=>toHex(b).toUpperCase());
  if(flags&0x40) result.fields.txPower=take(1,'ext-txpower','Extended TX power',b=>`${i8(b[0])} dBm`);
  if (o<headerEnd) result.fields.acadHex=take(headerEnd-o,'ext-acad','Additional Controller Advertising Data',b=>toHex(b).toUpperCase());
  result.advertiserAddress=result.fields.advA??null;
  result.advertiserAddressType=result.advertiserAddress ? ((header0&0x40)?'Random/private possible':'Public') : null;
  result.advertisingData=pdu.slice(headerEnd); result.advertisingDataRawOffset=baseRawOffset+headerEnd;
  return result;
}

export function observedAdvertisingProperties(ble) {
  if (!ble?.isAdvertising) return [];
  if (ble.pduTypeName==='ADV_EXT_IND') return [...(ble.extendedAdvertising?.properties??[]),'EXTENDED'];
  return ({
    ADV_IND:['CONNECTABLE','SCANNABLE'], ADV_DIRECT_IND:['CONNECTABLE','DIRECTED'],
    ADV_NONCONN_IND:['NON-CONNECTABLE','NON-SCANNABLE'], ADV_SCAN_IND:['NON-CONNECTABLE','SCANNABLE'],
    SCAN_RSP:['SCAN RESPONSE'], SCAN_REQ:['SCAN REQUEST'], CONNECT_IND:['CONNECTION ESTABLISHMENT']
  })[ble.pduTypeName] ?? [];
}
