const textDecoder = new TextDecoder();

export const CMD = Object.freeze({
  PING: 0,
  RX_SYMBOLS: 1,
  TX_SYMBOLS: 2,
  GET_USRLED: 3,
  SET_USRLED: 4,
  GET_RXLED: 5,
  SET_RXLED: 6,
  GET_TXLED: 7,
  SET_TXLED: 8,
  GET_1V8: 9,
  SET_1V8: 10,
  GET_CHANNEL: 11,
  SET_CHANNEL: 12,
  RESET: 13,
  GET_SERIAL: 14,
  GET_PARTNUM: 15,
  GET_PAEN: 16,
  SET_PAEN: 17,
  GET_HGM: 18,
  SET_HGM: 19,
  TX_TEST: 20,
  STOP: 21,
  GET_MOD: 22,
  SET_MOD: 23,
  SET_ISP: 24,
  FLASH: 25,
  BOOTLOADER_FLASH: 26,
  SPECAN: 27,
  GET_PALEVEL: 28,
  SET_PALEVEL: 29,
  REPEATER: 30,
  RANGE_TEST: 31,
  RANGE_CHECK: 32,
  GET_REV_NUM: 33,
  LED_SPECAN: 34,
  GET_BOARD_ID: 35,
  SET_SQUELCH: 36,
  GET_SQUELCH: 37,
  SET_BDADDR: 38,
  START_HOPPING: 39,
  SET_CLOCK: 40,
  GET_CLOCK: 41,
  BTLE_SNIFFING: 42,
  GET_ACCESS_ADDRESS: 43,
  SET_ACCESS_ADDRESS: 44,
  DO_SOMETHING: 45,
  DO_SOMETHING_REPLY: 46,
  GET_CRC_VERIFY: 47,
  SET_CRC_VERIFY: 48,
  POLL: 49,
  BTLE_PROMISC: 50,
  SET_AFHMAP: 51,
  CLEAR_AFHMAP: 52,
  READ_REGISTER: 53,
  BTLE_SLAVE: 54,
  GET_COMPILE_INFO: 55,
  BTLE_SET_TARGET: 56,
  BTLE_PHY: 57,
  WRITE_REGISTER: 58,
  JAM_MODE: 59,
  EGO: 60,
  AFH: 61,
  HOP: 62,
  TRIM_CLOCK: 63,
  WRITE_REGISTERS: 65,
  READ_ALL_REGISTERS: 66,
  RX_GENERIC: 67,
  TX_GENERIC_PACKET: 68,
  FIX_CLOCK_DRIFT: 69,
  CANCEL_FOLLOW: 70,
  LE_SET_ADV_DATA: 71,
  RFCAT_SUBCMD: 72,
  XMAS: 73
});

const u8 = data => data?.byteLength ? data.getUint8(0) : 0;
const i8 = data => data?.byteLength ? data.getInt8(0) : 0;
const u16le = data => data?.byteLength >= 2 ? data.getUint16(0, true) : 0;
const u32le = data => data?.byteLength >= 4 ? data.getUint32(0, true) : 0;
const yesNo = data => Boolean(u8(data));

function decodeSerial(data) {
  if (!data || data.byteLength < 17 || data.getUint8(0) !== 0) return null;
  const bytes = new Uint8Array(data.buffer, data.byteOffset + 1, 16);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function decodePartnum(data) {
  if (!data || data.byteLength < 5 || data.getUint8(0) !== 0) return null;
  return data.getUint32(1, true);
}

function decodeRevision(data) {
  if (!data || data.byteLength < 2) return 'unknown';
  if (data.byteLength === 2) return String(data.getUint16(0, true));
  const len = Math.min(data.getUint8(2), Math.max(0, data.byteLength - 3));
  return textDecoder.decode(new Uint8Array(data.buffer, data.byteOffset + 3, len));
}

function decodeCompileInfo(data) {
  if (!data?.byteLength) return 'unknown';
  const len = Math.min(data.getUint8(0), Math.max(0, data.byteLength - 1));
  return textDecoder.decode(new Uint8Array(data.buffer, data.byteOffset + 1, len));
}

const host = (symbol, extra = {}) => ({ source: `host/libubertooth/src/ubertooth_control.c:${symbol}`, audited: true, ...extra });
const firmware = (symbol, extra = {}) => ({ source: `firmware/bluetooth_rxtx/bluetooth_rxtx.c:${symbol}`, audited: true, ...extra });

// Command metadata is intentionally verbose. It is the browser-side protocol
// contract and doubles as the Advanced-mode command audit table.
export const COMMANDS = Object.freeze({
  PING: { id: CMD.PING, direction: 'in', length: 0, timeout: 1000, decode: () => true, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_ping') },
  RX_SYMBOLS: { id: CMD.RX_SYMBOLS, direction: 'out', timeout: 1000, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_rx_syms') },
  STOP: { id: CMD.STOP, direction: 'out', timeout: 1000, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_stop') },
  RESET: { id: CMD.RESET, direction: 'out', timeout: 1000, valueUse: '0', indexUse: '0', payload: 'none', resetMayDetach: true, ...host('cmd_reset') },
  GET_SERIAL: { id: CMD.GET_SERIAL, direction: 'in', length: 17, timeout: 1000, decode: decodeSerial, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_get_serial') },
  GET_PARTNUM: { id: CMD.GET_PARTNUM, direction: 'in', length: 5, timeout: 1000, decode: decodePartnum, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_get_partnum') },
  GET_REV_NUM: { id: CMD.GET_REV_NUM, direction: 'in', length: 258, timeout: 1000, decode: decodeRevision, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_get_rev_num') },
  GET_COMPILE_INFO: { id: CMD.GET_COMPILE_INFO, direction: 'in', length: 256, timeout: 1000, decode: decodeCompileInfo, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_get_compile_info') },
  GET_BOARD_ID: { id: CMD.GET_BOARD_ID, direction: 'in', length: 1, timeout: 1000, decode: u8, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_get_board_id') },
  GET_CHANNEL: { id: CMD.GET_CHANNEL, direction: 'in', length: 2, timeout: 1000, decode: u16le, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_get_channel') },
  SET_CHANNEL: { id: CMD.SET_CHANNEL, direction: 'out', timeout: 1000, valueUse: 'frequency MHz', indexUse: '0', payload: 'none', ...host('cmd_set_channel') },
  GET_USRLED: { id: CMD.GET_USRLED, direction: 'in', length: 1, timeout: 1000, decode: yesNo, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_get_usrled') },
  SET_USRLED: { id: CMD.SET_USRLED, direction: 'out', timeout: 1000, valueUse: '0/1', indexUse: '0', payload: 'none', ...host('cmd_set_usrled') },
  GET_RXLED: { id: CMD.GET_RXLED, direction: 'in', length: 1, timeout: 1000, decode: yesNo, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_get_rxled') },
  SET_RXLED: { id: CMD.SET_RXLED, direction: 'out', timeout: 1000, valueUse: '0/1', indexUse: '0', payload: 'none', ...host('cmd_set_rxled') },
  GET_TXLED: { id: CMD.GET_TXLED, direction: 'in', length: 1, timeout: 1000, decode: yesNo, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_get_txled') },
  SET_TXLED: { id: CMD.SET_TXLED, direction: 'out', timeout: 1000, valueUse: '0/1', indexUse: '0', payload: 'none', ...host('cmd_set_txled') },
  GET_PAEN: { id: CMD.GET_PAEN, direction: 'in', length: 1, timeout: 1000, decode: yesNo, valueUse: '0', indexUse: '0', payload: 'none', ...firmware('UBERTOOTH_GET_PAEN', { note: 'Firmware-supported readback; no dedicated current host wrapper.' }) },
  SET_PAEN: { id: CMD.SET_PAEN, direction: 'out', timeout: 1000, valueUse: '0/1', indexUse: '0', payload: 'none', ...host('cmd_set_paen') },
  GET_HGM: { id: CMD.GET_HGM, direction: 'in', length: 1, timeout: 1000, decode: yesNo, valueUse: '0', indexUse: '0', payload: 'none', ...firmware('UBERTOOTH_GET_HGM', { note: 'Firmware-supported readback; no dedicated current host wrapper.' }) },
  SET_HGM: { id: CMD.SET_HGM, direction: 'out', timeout: 1000, valueUse: '0/1', indexUse: '0', payload: 'none', ...host('cmd_set_hgm') },
  GET_PALEVEL: { id: CMD.GET_PALEVEL, direction: 'in', length: 1, timeout: 3000, decode: u8, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_get_palevel') },
  SET_PALEVEL: { id: CMD.SET_PALEVEL, direction: 'out', timeout: 3000, valueUse: '0–7', indexUse: '0', payload: 'none', ...host('cmd_set_palevel') },
  GET_MOD: { id: CMD.GET_MOD, direction: 'in', length: 1, timeout: 1000, decode: u8, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_get_modulation') },
  SET_MOD: { id: CMD.SET_MOD, direction: 'out', timeout: 1000, valueUse: 'modulation enum', indexUse: '0', payload: 'none', ...host('cmd_set_modulation') },
  GET_SQUELCH: { id: CMD.GET_SQUELCH, direction: 'in', length: 1, timeout: 3000, decode: i8, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_get_squelch', { note: 'Firmware stores signed int8 threshold; host wrapper returns raw u8.' }) },
  SET_SQUELCH: { id: CMD.SET_SQUELCH, direction: 'out', timeout: 3000, valueUse: 'signed int8 encoded in wValue low byte', indexUse: '0', payload: 'none', ...host('cmd_set_squelch') },
  GET_CLOCK: { id: CMD.GET_CLOCK, direction: 'in', length: 4, timeout: 3000, decode: u32le, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_get_clock') },
  GET_ACCESS_ADDRESS: { id: CMD.GET_ACCESS_ADDRESS, direction: 'in', length: 4, timeout: 3000, decode: u32le, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_get_access_address') },
  SET_ACCESS_ADDRESS: { id: CMD.SET_ACCESS_ADDRESS, direction: 'out', timeout: 1000, valueUse: '0', indexUse: '0', payload: '4 bytes LE', ...host('cmd_set_access_address') },
  GET_CRC_VERIFY: { id: CMD.GET_CRC_VERIFY, direction: 'in', length: 1, timeout: 1000, decode: yesNo, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_get_crc_verify') },
  SET_CRC_VERIFY: { id: CMD.SET_CRC_VERIFY, direction: 'out', timeout: 1000, valueUse: '0/1', indexUse: '0', payload: 'none', ...host('cmd_set_crc_verify') },
  POLL: { id: CMD.POLL, direction: 'in', length: 64, timeout: 1000, attempts: 3, quiet: true, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_poll', { note: 'Upstream retries up to three attempts on PIPE/stall.' }) },
  JAM_MODE_SAFE: { id: CMD.JAM_MODE, direction: 'out', timeout: 1000, valueUse: '0 (JAM_NONE only)', indexUse: '0', payload: 'none', ...host('cmd_set_jam_mode', { note: 'Application exposes only JAM_NONE.' }) },
  SPECAN: { id: CMD.SPECAN, direction: 'out', timeout: 1000, valueUse: 'low MHz', indexUse: 'high MHz', payload: 'none', ...host('cmd_specan') },
  BTLE_SNIFFING: { id: CMD.BTLE_SNIFFING, direction: 'out', timeout: 1000, valueUse: '0=no-follow, 1=follow', indexUse: '0', payload: 'none', ...host('cmd_btle_sniffing') },
  BTLE_PROMISC: { id: CMD.BTLE_PROMISC, direction: 'out', timeout: 1000, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_btle_promisc') },
  BTLE_SET_TARGET: { id: CMD.BTLE_SET_TARGET, direction: 'out', timeout: 1000, valueUse: '0', indexUse: '0', payload: '6-byte address + 1-byte mask', ...host('cmd_btle_set_target') },
  CANCEL_FOLLOW: { id: CMD.CANCEL_FOLLOW, direction: 'out', timeout: 1000, valueUse: '0', indexUse: '0', payload: 'none', ...host('cmd_cancel_follow') }
});

export function commandAudit() {
  return Object.entries(COMMANDS).map(([name, def]) => ({
    name,
    id: def.id,
    direction: def.direction,
    valueUse: def.valueUse ?? '0',
    indexUse: def.indexUse ?? '0',
    payload: def.payload ?? 'none',
    returnLength: def.direction === 'in' ? (def.length ?? 0) : 0,
    timeout: def.timeout ?? 1000,
    attempts: def.attempts ?? 1,
    audited: Boolean(def.audited),
    source: def.source ?? '—',
    note: def.note ?? ''
  }));
}

export function boardName(id) {
  return ({0: 'Ubertooth Zero', 1: 'Ubertooth One', 2: 'TC13 Badge'})[id] ?? `Unknown (${id})`;
}

export function modulationName(id) {
  return ['Bluetooth Basic Rate', 'Bluetooth Low Energy', '802.11 FHSS', 'None'][id] ?? `Unknown (${id})`;
}
