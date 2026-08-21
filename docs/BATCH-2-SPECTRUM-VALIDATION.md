# Batch 2 Spectrum Validation — UberToothGUI v0.2.0

This checklist validates the Batch 2 spectrum workbench on a physical Ubertooth One after the Batch 1 WebUSB hardware gate has passed.

The goal is to verify **acquisition correctness, display behavior, evidence controls, and long-session stability** without changing the proven Batch 1 connection/recovery path.

> Spectrum values displayed by UberToothGUI are the signed raw RSSI bytes emitted by Ubertooth `SPECAN`, matching the semantics used by `ubertooth-specan`. Do not treat them as calibrated absolute dBm measurements.

## Acceptance gate

Batch 2 passes when the operator can complete this sequence without an unrecovered USB error:

**CONNECT → FULL-RANGE SPECAN → ZOOM/INSPECT → MARK → NARROW-RANGE SPECAN → PAUSE/RESUME DISPLAY → EXPORT → SOAK → STOP → DISCONNECT**

## 1. Connection baseline

1. Serve UberToothGUI from `localhost` or HTTPS in a Chromium-family desktop browser.
2. Connect the physical Ubertooth One.
3. Confirm the header reports **CONNECTED**.
4. In **Advanced → Diagnostic**, run **VALIDATE HARDWARE** once.
5. Confirm the Batch 1 validation still passes before judging Batch 2 spectrum behavior.

Expected result: Batch 2 has not regressed PING, metadata, descriptor inspection, interface claim, or endpoint discovery.

## 2. Full 2.4 GHz acquisition

1. Open **SPECTRUM**.
2. Set **LOW MHz = 2402**.
3. Set **HIGH MHz = 2480**.
4. Click **START**.
5. Allow several sweeps to accumulate.

Verify:

- **RAW RECORDS** increases continuously.
- **SWEEPS** increases as the requested high-frequency record is observed.
- **SWEEP RATE** becomes non-zero after multiple sweeps.
- **STRONGEST** shows a frequency and raw RSSI value after data arrives.
- Live spectrum trace renders across observed frequency bins.
- Waterfall rows scroll while acquisition remains active.
- Footer spectrum readout says `RAW …`, not `dBm`.

## 3. Overlay validation

With the 2402–2480 MHz acquisition running:

1. Enable **BLE CHANNELS**.
2. Confirm advertising channel references are visible at:
   - BLE 37 — 2402 MHz
   - BLE 38 — 2426 MHz
   - BLE 39 — 2480 MHz
3. Zoom in sufficiently and confirm BLE data-channel references become readable.
4. Enable **WI-FI CENTERS**.
5. Confirm common Wi-Fi centers such as channels 1, 6, and 11 appear at their expected positions.
6. Toggle each overlay off and back on.

Expected result: overlays change only the visualization. They must not restart or retune `SPECAN`.

## 4. Zoom must not retune the radio

1. Keep the full 2402–2480 MHz scan running.
2. Place the cursor near a visible feature.
3. Use the mouse wheel to zoom in.
4. Use **ZOOM +** and **ZOOM −**.
5. Double-click the spectrum or press **RESET VIEW**.
6. Watch the footer acquisition range and Advanced diagnostic log.

Expected result:

- The plotted **VIEW** range changes.
- The acquisition range remains **2402–2480 MHz**.
- Zoom operations do not issue a new `SPECAN` command.
- **RESET VIEW** returns the plot to the complete acquisition range.

## 5. Live / averaging / persistence / peak hold

While receiving spectrum data:

1. Move **AVG RESPONSE** from a low value to a high value.
2. Confirm the average trace responds more slowly/quickly as expected.
3. Change **PERSISTENCE** from low to high.
4. Confirm older strong values decay visually rather than being reported as new measurements.
5. Enable **PEAK HOLD**.
6. Create or wait for a strong transient.
7. Confirm the peak trace retains it.
8. Click **CLEAR PEAK**.

Expected result: all of these operations are analysis/display operations. They must not interrupt acquisition or reset the USB stream.

## 6. Display pause

1. With spectrum acquisition active, click **PAUSE DISPLAY**.
2. Wait several seconds.
3. Observe the acquisition counters.
4. Resume display.

Expected result: acquisition continues while drawing is paused; RAW RECORDS/SWEEPS continue to advance. Pausing the display must not send STOP to the Ubertooth.

## 7. Waterfall controls

Exercise:

- history = 90 rows
- history = 180 rows
- history = 360 rows
- history = 720 rows
- speed = ¼×
- speed = ½×
- speed = 1×
- speed = 2× visual

Expected result:

- History remains bounded at the selected capacity.
- Changing speed changes visual row cadence/duplication only.
- RAW RECORDS does not drop merely because the waterfall is slowed.
- The app stays responsive at 720 rows.

## 8. Evidence markers

1. Move over the spectrum and observe the cursor frequency/raw-RSSI readout.
2. Click a frequency to create a marker.
3. Create at least three markers.
4. Let acquisition continue.
5. Confirm each marker tracks:
   - frequency
   - current raw RSSI
   - strongest raw RSSI
   - first observed
   - last observed
   - duration
6. Add a note to one marker.
7. Remove another marker.

Expected result: marker evidence updates without changing radio acquisition. Notes remain associated with their markers until removed or the acquisition range excludes them.

## 9. Clear behavior

1. Create at least one marker.
2. Click **CLEAR DATA**.

Expected result:

- traces, waterfall, and spectrum statistics clear;
- evidence markers remain;
- acquisition continues if it was active.

Then retune to a range that excludes an existing marker.

Expected result: markers outside the new acquisition range are removed from the active model rather than displayed at impossible frequencies.

## 10. Narrow-range acquisition

1. Stop the full-range scan.
2. Choose a smaller range, for example **2420–2440 MHz**.
3. Start spectrum acquisition.

Verify:

- acquisition range updates to 2420–2440 MHz;
- plotted view resets to the new acquisition range;
- sweep counter continues to recognize the configured high-frequency delimiter;
- BLE/Wi-Fi overlays outside the view are not drawn into the plot;
- zoom never escapes the acquisition bounds.

## 11. Spectrum CSV evidence export

1. Let a scan accumulate data.
2. Create and annotate at least one marker.
3. Click **EXPORT SPECTRUM CSV**.
4. Open the exported file.

Verify that it contains:

- frequency MHz
- latest raw RSSI
- average raw RSSI
- peak raw RSSI
- persistence raw RSSI
- marker association
- marker note
- metadata explaining that the values are raw SPECAN RSSI rather than calibrated dBm

## 12. Recovery regression

During a spectrum stream:

1. Stop normally and restart.
2. If practical, unplug/replug the Ubertooth and use **RECONNECT AUTHORIZED**.
3. Use **RETRY LAST STREAM** after a recoverable stream error.

Expected result: Batch 1 recovery behavior remains intact and the last spectrum range can be restored.

## 13. Soak test

Run **Advanced → Diagnostic → SOAK TEST** in Spectrum mode:

Minimum acceptance run:

- **5 minutes** at 2402–2480 MHz

Recommended extended run:

- **30 minutes** with waterfall history set to 720 rows

Record:

- packets/records received
- peak packet rate
- ring drops
- malformed records
- USB errors
- stall recoveries
- browser heap growth if available

Expected result: no unrecovered USB error, no unbounded waterfall growth, and the interface remains responsive.

## Batch 2 sign-off

Record the physical result here if desired:

```text
Date:
Browser/version:
Operating system:
Ubertooth firmware revision:
Compile info:
API version:
2402–2480 scan: PASS / FAIL
2420–2440 scan: PASS / FAIL
Zoom without retune: PASS / FAIL
Raw RSSI labeling: PASS / FAIL
Overlays: PASS / FAIL
Peak/average/persistence: PASS / FAIL
Waterfall controls: PASS / FAIL
Markers: PASS / FAIL
Spectrum CSV: PASS / FAIL
5-minute soak: PASS / FAIL
30-minute soak: PASS / FAIL / NOT RUN
Recovery regression: PASS / FAIL
Notes:
```
