import { UBERTOOTH_API_VERSION } from '../version.js';
import { UBERTOOTH_VENDOR_ID, UBERTOOTH_ONE_PRODUCT_ID, DATA_IN_ENDPOINT, DATA_OUT_ENDPOINT } from '../transport/webusb.js';

const nowMs = () => globalThis.performance?.now?.() ?? Date.now();

function result(name, status, detail, durationMs = 0) {
  return { name, status, detail, durationMs: Math.round(durationMs * 10) / 10, time: Date.now() };
}

async function check(name, fn, passDetail = value => String(value ?? 'OK'), predicate = () => true) {
  const started = nowMs();
  try {
    const value = await fn();
    const ok = predicate(value);
    return result(name, ok ? 'PASS' : 'FAIL', passDetail(value), nowMs() - started);
  } catch (error) {
    return result(name, 'FAIL', error?.message ?? String(error), nowMs() - started);
  }
}

export async function runHardwareValidation(device, transport) {
  const rows = [];
  const descriptor = transport.describe();
  const simulated = descriptor.kind === 'simulation';

  rows.push(result('Transport', transport.connected ? 'PASS' : 'FAIL', `${descriptor.kind ?? 'unknown'} / ${transport.connected ? 'connected' : 'disconnected'}`));
  rows.push(result('USB identity', descriptor.vendorId === UBERTOOTH_VENDOR_ID && descriptor.productId === UBERTOOTH_ONE_PRODUCT_ID ? 'PASS' : 'FAIL', `${hex(descriptor.vendorId)}:${hex(descriptor.productId)}`));
  rows.push(result('Configuration selected', descriptor.configurationValue !== null && descriptor.configurationValue !== undefined ? 'PASS' : simulated ? 'PASS' : 'FAIL', descriptor.configurationValue ?? 'simulation'));
  rows.push(result('Interface claimed', descriptor.interfaceClaimed === true || simulated ? 'PASS' : 'FAIL', descriptor.interfaceNumber === null || descriptor.interfaceNumber === undefined ? 'none' : `interface ${descriptor.interfaceNumber}, alt ${descriptor.alternateSetting ?? 0}`));
  rows.push(result('Bulk IN endpoint', descriptor.inEndpoint === DATA_IN_ENDPOINT ? 'PASS' : 'FAIL', descriptor.inEndpoint === null || descriptor.inEndpoint === undefined ? 'missing' : `0x8${descriptor.inEndpoint}`));
  rows.push(result('Bulk OUT endpoint', descriptor.outEndpoint === DATA_OUT_ENDPOINT ? 'PASS' : 'WARN', descriptor.outEndpoint === null || descriptor.outEndpoint === undefined ? 'not exposed by selected alternate' : `0x0${descriptor.outEndpoint}`));

  for (let i = 1; i <= 3; i += 1) {
    rows.push(await check(`PING ${i}/3`, () => device.ping(), () => 'control transfer OK', Boolean));
  }

  let info = null;
  const infoRow = await check('Device metadata', async () => { info = await device.queryInfo(); return info; }, value => `${value.boardName}; ${value.firmwareRevision ?? 'unknown firmware'}`, value => Boolean(value?.boardName));
  rows.push(infoRow);
  if (info) {
    rows.push(result('API version', info.apiVersion === UBERTOOTH_API_VERSION ? 'PASS' : info.apiVersion === null ? 'WARN' : 'FAIL', `${info.apiVersionText ?? 'unknown'} / expected 0x${UBERTOOTH_API_VERSION.toString(16).padStart(4, '0')}`));
    rows.push(result('Board identity', info.boardId === 1 || simulated ? 'PASS' : 'WARN', `${info.boardName} (ID ${info.boardId ?? 'unknown'})`));
  }

  rows.push(await check('STOP command', () => device.stop(), () => 'safe idle command accepted'));

  let radio = null;
  rows.push(await check('Radio readback', async () => { radio = await device.queryRadioState(); return radio; }, value => {
    const available = Object.entries(value).filter(([key, v]) => key !== 'modulationName' && v !== null).length;
    return `${available} state fields readable`;
  }, value => Object.values(value ?? {}).some(v => v !== null)));

  if (radio) {
    const unavailable = Object.entries(radio).filter(([key, value]) => key !== 'modulationName' && value === null).map(([key]) => key);
    if (unavailable.length) rows.push(result('Optional readbacks', 'WARN', `Unavailable/unsupported: ${unavailable.join(', ')}`));
    else rows.push(result('Optional readbacks', 'PASS', 'All requested state readbacks returned'));
  }

  const failures = rows.filter(row => row.status === 'FAIL').length;
  const warnings = rows.filter(row => row.status === 'WARN').length;
  return {
    startedAt: rows[0]?.time ?? Date.now(),
    completedAt: Date.now(),
    status: failures ? 'FAIL' : warnings ? 'WARN' : 'PASS',
    failures,
    warnings,
    simulated,
    rows
  };
}

export function newSoakState() {
  return {
    active: false,
    status: 'IDLE',
    mode: null,
    startedAt: null,
    completedAt: null,
    durationMs: 0,
    targetDurationMs: 0,
    maxPacketRate: 0,
    startTransportErrors: 0,
    startRecoveries: 0,
    memoryStart: null,
    memoryPeak: null,
    memoryEnd: null,
    result: null,
    reason: null
  };
}

export function browserHeapBytes() {
  return globalThis.performance?.memory?.usedJSHeapSize ?? null;
}

function hex(value) {
  return value === null || value === undefined ? '—' : `0x${Number(value).toString(16).padStart(4, '0').toUpperCase()}`;
}
