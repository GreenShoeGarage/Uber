# Batch 14 — Bluetooth Classic Foundation Validation

Release target: **UberToothGUI v1.8.0**

This checklist validates the passive Bluetooth Classic Basic Rate foundation. It does not validate full piconet following or 27-bit master-clock recovery; those are deliberately not implemented in this release.

## 1. Simulation gate

1. Serve the repository from `http://localhost:8000` or HTTPS.
2. Click **USE SIMULATION**.
3. Switch to **ADVANCED** and open **CLASSIC**.
4. Leave **CHANNEL** at `SWEEP 0–78`, **KNOWN LAP** empty, and **MAX AC ERRORS** at `0`.
5. Click **START CLASSIC**.

Expected:

- connection state becomes STREAMING;
- the mode/status bar identifies Classic rather than BLE or Spectrum;
- at least one observed LAP appears;
- the synthetic fixture includes LAP `0x9E8B33`;
- channels change during sweep mode;
- BR packet count increases;
- the selected piconet detail eventually stabilizes UAP `0x4A` after repeated matching header evidence;
- the UI continues to say **MASTER CLOCK NOT RECOVERED**.

## 2. Fixed-channel behavior

1. Stop the stream.
2. Select a Classic channel from `0–78`.
3. Start Classic observation again.

Expected:

- the device is configured for Basic Rate modulation;
- `RX_SYMBOLS` is started;
- received Classic observations remain on the selected channel;
- the corresponding frequency is `2402 + channel` MHz.

## 3. Unknown vs. known LAP behavior

### Unknown-LAP survey

1. Clear **KNOWN LAP**.
2. Run sweep mode with **MAX AC ERRORS** set to any value.

Expected: unknown-LAP discovery remains exact-match only. The UI must not imply that the error threshold applies to arbitrary-LAP discovery.

### Known LAP

1. Enter an observed LAP, for example `9E8B33` in Simulation.
2. Set **MAX AC ERRORS** to `0`, then repeat with `1–4` as needed.
3. Restart observation after each configuration change.

Expected:

- the supplied LAP is normalized consistently;
- access-code error count is retained as evidence;
- the chosen threshold changes known-LAP acceptance only;
- invalid LAP input produces a useful validation error instead of silently changing the radio.

## 4. Piconet-candidate evidence

For a selected LAP verify:

- first/last seen;
- packet count;
- header packet count;
- channels observed;
- average/peak RSSI;
- minimum access-code errors;
- top UAP candidate rankings;
- candidate confidence;
- clock-six candidate;
- Logical Transport Address (LT_ADDR);
- candidate packet type;
- evidence label.

A UAP must not be labeled stabilized before at least three matching header results and at least 60% confidence.

## 5. Packet inspector and provenance

1. Click **SHOW LAP PACKETS**.
2. Select a Classic packet.
3. Inspect Decoded / Hex / Raw views.

Expected:

- packet filtering uses the Classic LAP rather than a BLE address;
- Classic channel and LAP are visible;
- access-code bit offset and access-code error count are visible;
- candidate UAP/header information is visible where available;
- selecting provenance-backed fields highlights the bytes from the original retained 64-byte USB record;
- the original raw bytes remain intact.

## 6. Capture and Replay

1. Record a Classic session.
2. Stop it and save/open it from the Capture library.
3. Enter Replay Mode and step through the capture.

Expected:

- BR records reconstruct from their original `rawHex` bytes;
- Classic parsing runs again during replay;
- LAP/piconet observations repopulate from replay evidence;
- replay does not require attached hardware;
- the capture is never reclassified as BLE.

## 7. Export behavior

Export a Classic-only session.

Expected:

- canonical JSON contains the raw evidence and Classic summaries;
- packet CSV contains Classic channel/LAP/UAP/type columns;
- evidence ZIP contains `classic.csv` and `raw-usb64.bin`;
- no BLE `capture.pcap` or `capture.pcapng` is created for a Classic-only session;
- the manifest explicitly says standards-correct Classic PCAP is unavailable rather than fabricated.

## 8. Physical Ubertooth One gate

With authorized nearby Bluetooth Classic traffic:

1. Connect the physical Ubertooth One.
2. Run a sweep observation for at least 5 minutes.
3. Stop, then repeat on one fixed channel where activity was observed.
4. If a LAP is found, use it as **KNOWN LAP** and observe for another 5 minutes.
5. Export diagnostics and evidence.

Pass criteria:

- no unrecovered USB failure;
- Classic uses bulk IN rather than BLE `POLL`;
- BR packet evidence is retained as 64-byte records;
- observed LAPs and decoder candidates are clearly distinguished;
- STOP and mode-switch recovery remain clean;
- no transmit, jamming, or injection operation is exposed or started.

## 9. Soak test

Advanced → Diagnostic → Soak:

- select **Classic RX_SYMBOLS / bulk IN**;
- run 5 minutes first;
- then run 30 minutes if the short soak is clean.

Record packet count, ring drops, USB errors, stalls/recoveries, and browser heap growth where available.
