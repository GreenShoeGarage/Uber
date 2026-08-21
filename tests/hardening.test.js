import test from 'node:test';
import assert from 'node:assert/strict';

import { COMMANDS, commandAudit, CMD } from '../src/ubertooth/commands.js';
import { WebUSBTransport } from '../src/transport/webusb.js';
import { SimulationTransport } from '../src/transport/simulation.js';
import { UbertoothDevice } from '../src/ubertooth/device.js';
import { runHardwareValidation } from '../src/diagnostics/hardware.js';

function view(bytes = []) {
  const b = Uint8Array.from(bytes);
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

test('audited command contract pins Batch 1 timeout and retry behavior', () => {
  const audit = commandAudit();
  assert.ok(audit.length >= 30);
  assert.ok(audit.every(row => row.audited), 'every exposed command must carry an upstream audit source');
  assert.equal(COMMANDS.POLL.length, 64);
  assert.equal(COMMANDS.POLL.attempts, 3);
  assert.equal(COMMANDS.GET_SQUELCH.timeout, 3000);
  assert.equal(COMMANDS.SET_SQUELCH.timeout, 3000);
  assert.equal(COMMANDS.GET_ACCESS_ADDRESS.timeout, 3000);
  assert.equal(COMMANDS.GET_CLOCK.timeout, 3000);
  assert.equal(COMMANDS.SPECAN.valueUse, 'low MHz');
  assert.equal(COMMANDS.SPECAN.indexUse, 'high MHz');
  assert.equal(COMMANDS.SET_ACCESS_ADDRESS.payload, '4 bytes LE');
});

test('signed squelch decoder reflects firmware int8 threshold semantics', () => {
  assert.equal(COMMANDS.GET_SQUELCH.decode(view([0xd8])), -40);
});

test('simulation passes the repeatable hardware validation sequence', async () => {
  const transport = new SimulationTransport();
  await transport.connect();
  const device = new UbertoothDevice(transport);
  const report = await runHardwareValidation(device, transport);
  assert.equal(report.status, 'PASS');
  assert.equal(report.failures, 0);
  assert.equal(report.rows.filter(row => row.name.startsWith('PING')).length, 3);
  assert.ok(report.rows.some(row => row.name === 'API version' && row.status === 'PASS'));
  assert.ok(report.rows.some(row => row.name === 'Bulk IN endpoint' && row.status === 'PASS'));
  await transport.disconnect();
});

test('WebUSB POLL retries control-endpoint stalls and records recovery', async () => {
  const transport = new WebUSBTransport();
  let calls = 0;
  transport.connected = true;
  transport.device = {
    opened: true,
    async controlTransferIn() {
      calls += 1;
      if (calls < 3) return { status: 'stall', data: null };
      return { status: 'ok', data: view(new Uint8Array(64)) };
    }
  };
  const result = await transport.controlIn(CMD.POLL, 0, 0, 64, { attempts: 3, timeout: 1000 });
  assert.equal(result.byteLength, 64);
  assert.equal(calls, 3);
  assert.equal(transport.stalls, 2);
  assert.equal(transport.stallRecoveries, 1);
  assert.equal(transport.transferErrors, 0);
});

test('WebUSB bulk receive clears a stalled endpoint and retries once', async () => {
  const transport = new WebUSBTransport();
  let calls = 0;
  let clears = 0;
  transport.connected = true;
  transport.inEndpoint = 2;
  transport.device = {
    opened: true,
    async transferIn() {
      calls += 1;
      return calls === 1
        ? { status: 'stall', data: null }
        : { status: 'ok', data: view(new Uint8Array(64)) };
    },
    async clearHalt(direction, endpoint) {
      assert.equal(direction, 'in');
      assert.equal(endpoint, 2);
      clears += 1;
    }
  };
  const result = await transport.transferIn(64);
  assert.equal(result.byteLength, 64);
  assert.equal(calls, 2);
  assert.equal(clears, 1);
  assert.equal(transport.stalls, 1);
  assert.equal(transport.stallRecoveries, 1);
  assert.equal(transport.transferErrors, 0);
});

test('firmware reset accepts a detach-style stall as an expected outcome', async () => {
  const stall = new Error('endpoint stalled during reset');
  stall.name = 'StallError';
  const transport = {
    connected: true,
    async controlOut(request) {
      assert.equal(request, CMD.RESET);
      throw stall;
    }
  };
  const device = new UbertoothDevice(transport);
  await assert.doesNotReject(() => device.resetFirmware());
  assert.equal(device.mode, 'idle');
});


test('Batch 1 diagnostic view renders validation, soak and audit controls without duplicate IDs', async () => {
  const { renderView } = await import('../src/ui/views.js');
  const { CaptureRecorder } = await import('../src/capture/recorder.js');
  const recorder = new CaptureRecorder();
  const transport = new SimulationTransport();
  await transport.connect();
  const html = renderView('diagnostics', {
    prefs: {}, mode: 'advanced', recorder, capabilities: { webusb: true },
    connectionState: 'CONNECTED', streaming: false, simulation: true,
    transport, transportDescription: transport.describe(), deviceInfo: null,
    radioState: null, devices: [], logs: [], selectedPacket: null,
    validation: null, soak: { active: false, status: 'IDLE', startedAt: null },
    lastStreamConfig: null
  });
  assert.match(html, /VALIDATE HARDWARE/);
  assert.match(html, /CONTINUOUS RECEIVE SOAK TEST/);
  assert.match(html, /COMMAND CONTRACT AUDIT/);
  assert.match(html, /30 s smoke test/);
  assert.match(html, /60 min/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, `duplicate IDs: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`);
  await transport.disconnect();
});
