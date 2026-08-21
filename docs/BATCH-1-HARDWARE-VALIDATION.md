# Batch 1 — Physical Ubertooth One Validation

This checklist is for **UberToothGUI v0.1.4**. It turns the remaining physical-hardware verification into a repeatable acceptance test rather than an informal “it connected once” check.

> The automated simulation and protocol tests can validate browser-side logic without hardware. A PASS on physical USB behavior must come from a real Ubertooth One attached to the browser host.

## Preconditions

- Serve the repository from `http://localhost` or HTTPS.
- Use a Chromium-family desktop browser with WebUSB.
- Close native `ubertooth-*`, Wireshark extcap, or other libusb clients that may own the device.
- Connect an Ubertooth One running firmware whose USB device/API version is compatible with `0x0107`.
- Open **Advanced → Diagnostic**.

## A. Connection validation

1. Click **CONNECT UBERTOOTH** and select `1d50:6002`.
2. Confirm the connection state becomes **CONNECTED**.
3. In **Active USB Path**, verify:
   - a configuration is selected;
   - an interface is claimed;
   - bulk IN is endpoint `2` (`0x82` in libusb notation);
   - bulk OUT is endpoint `5` (`0x05`) when advertised by the selected alternate;
   - endpoint packet sizes are reported from the descriptor.
4. Click **VALIDATE HARDWARE**.
5. Save/export the validation result.

Expected acceptance criteria:

- 3/3 PING requests pass.
- Device metadata returns without a browser reload.
- Board identity is reported.
- API is shown and compared against `0x0107`.
- STOP is accepted.
- At least one radio-state readback succeeds; unavailable optional getters are WARN, not silently fabricated.

## B. Stream / stop / restart gate

Perform the sequence below at least **five times** without reloading the page:

```text
CONNECT
  → PING / DEVICE INFO
  → BLE ADVERTISEMENTS (10–30 s)
  → STOP
  → SPECTRUM (10–30 s)
  → STOP
  → BLE ADVERTISEMENTS (10–30 s)
  → STOP
  → DISCONNECT
  → RECONNECT AUTHORIZED
```

Acceptance criteria:

- No stale **STREAMING** state after STOP.
- Packet counters stop increasing after STOP.
- A second stream starts without unplugging the device.
- Disconnect closes the claimed interface cleanly.
- **RECONNECT AUTHORIZED** can reopen an already granted device without reopening the chooser, as long as the OS still exposes it.

## C. Soak tests

The Diagnostic workspace provides built-in soak durations:

- 30 seconds — smoke test
- 5 minutes — short acceptance run
- 30 minutes — stability run
- 60 minutes — extended stability run

Run both transport paths where practical:

### BLE / POLL

Uses the vendor-control `POLL` path used by the upstream BLE host tool.

Record:

- packets retained;
- bytes received;
- peak packet rate;
- malformed BLE records;
- ring-buffer drops;
- USB errors;
- control stalls and successful stall retries;
- browser heap growth when Chromium exposes `performance.memory`.

### Spectrum / bulk IN

Uses bulk IN endpoint 2.

Record the same metrics plus bulk endpoint stall recovery.

Acceptance criteria for a clean run:

- no unrecovered USB errors;
- no unexpected disconnect;
- no unbounded capture growth (ring buffer remains bounded);
- UI remains responsive;
- STOP completes and returns to **CONNECTED**;
- a subsequent stream can start.

Ring-buffer drops are an evidence-retention capacity signal, not automatically a USB failure. If they occur, note the acquisition rate and retained-buffer capacity.

## D. Recovery tests

### Unplug during BLE

1. Start BLE advertisements.
2. Remove the Ubertooth.
3. Confirm state becomes **DISCONNECTED** and the event is logged.
4. Reinsert the device.
5. Click **RECONNECT AUTHORIZED**.
6. Restart BLE.

### Unplug during spectrum

Repeat the procedure while spectrum is running.

### Firmware RESET

1. Stop streaming.
2. Click **RESET**.
3. A control stall/detach during RESET may be expected while firmware re-enumerates.
4. Wait for the OS to expose the device again.
5. Click **RECONNECT AUTHORIZED**.
6. Run **VALIDATE HARDWARE** again.

### Suspend / resume

1. Connect and leave the instrument idle.
2. Hide/background the tab or suspend/resume the host.
3. Return to the tab.
4. UberToothGUI performs an idle PING health check after a long execution gap/visibility restore.
5. If the device is no longer usable, reconnect rather than trusting stale UI state.

## E. Evidence to export for a failure

Before restarting the browser, export **Diagnostics JSON**. Include:

- operating system;
- browser/version;
- Ubertooth firmware revision;
- API value;
- exact action that failed;
- validation table;
- descriptor/configuration/interface/endpoint details;
- last control request;
- last transfer result;
- transfer-error count;
- stall/recovery counters;
- disconnect/reconnect counters;
- soak result if applicable;
- rolling diagnostic log.

## Batch 1 exit criterion

Batch 1 is physically accepted when the following is repeatable on the target host without a browser reload:

**CONNECT → PING → DEVICE INFO → STREAM → STOP → STREAM → DISCONNECT → RECONNECT**

and at least one 5-minute BLE soak plus one 5-minute spectrum soak completes without an unrecovered USB error.
