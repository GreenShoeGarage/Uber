# Batch 11 Visualization Workbench Validation — UberToothGUI v1.1.0

The Overview is a coordinated visualization of retained evidence. It must never imply that one Ubertooth is performing Spectrum and BLE acquisition simultaneously.

## 1. Overview availability

- [ ] `OVERVIEW` appears in both Easy and Advanced navigation.
- [ ] The page contains Spectrum, BLE Channel Heatmap, Packet-Rate History, Device RSSI History, Connection Evidence, and Recent/Focus-Linked Events panels.
- [ ] When not actively running Spectrum, the spectrum panel says `RETAINED / LAST SPECTRUM` rather than implying live simultaneous spectrum data.

## 2. Spectrum snapshot

1. Start Spectrum at 2402–2480 MHz.
2. Observe several sweeps.
3. Open Overview.

- [ ] Spectrum panel says `CURRENT ACQUISITION` while Spectrum is active.
- [ ] Live, average, and peak raw-RSSI traces are visible.
- [ ] The strongest-frequency summary is plausible relative to the main Spectrum workspace.

Then stop Spectrum and start BLE Scan:

- [ ] Overview retains the most recent spectrum snapshot.
- [ ] The panel switches to `RETAINED / LAST SPECTRUM`.
- [ ] It does not label the retained spectrum as live BLE-time spectrum evidence.

## 3. 40-channel BLE heatmap

Run BLE Scan or Replay a BLE capture.

- [ ] Exactly 40 BLE channel cells are available: data 0–36 and advertising 37–39.
- [ ] Metrics can switch between Packet rate, Packet count, Average RSSI, Peak RSSI, and Advertisers.
- [ ] Time windows can switch between 1 second, 10 seconds, 1 minute, and Capture lifetime.
- [ ] Clicking a channel highlights it and applies the same channel filter used by the Packet workspace.
- [ ] `CHANNEL PACKETS` opens Packet Inspector with that filter intact.
- [ ] `CLEAR FOCUS` clears the coordinated channel filter.

## 4. Device RSSI history

- [ ] The strongest observed advertiser is shown when no explicit device is selected.
- [ ] Clicking a device in the mini-list makes it the shared device focus.
- [ ] Current, average, and peak RSSI agree with the Device Inventory for the same advertiser.
- [ ] The RSSI graph shows timestamped samples.
- [ ] Packet markers in the graph jump to retained packet evidence where a packet ID is available.
- [ ] Channels used by the focused device are visually related in the heatmap without automatically claiming identity across randomized addresses.
- [ ] `DEVICE PACKETS` opens Packet Inspector filtered to the focused observed address.

## 5. Packet-rate history

- [ ] USB packet-rate history updates in one-second buckets.
- [ ] BLE packet rate is independently shown when BLE evidence is present.
- [ ] USB-error/ring-drop buckets are visibly marked when such an event can be induced safely.
- [ ] The history remains bounded during a long session.

## 6. Connection evidence

In Advanced Mode, use a known-good passive FOLLOW capture or Replay a capture containing connection evidence.

- [ ] OBSERVED connections are visually distinct from INFERRED access-address activity.
- [ ] Initiator/advertiser are shown only when evidence actually supplies them.
- [ ] Clicking a connection makes its access address the shared focus.
- [ ] `OPEN PACKETS` filters Packet Inspector to the selected access address.
- [ ] ACTIVE/ENDED state remains separate from OBSERVED/INFERRED evidence quality.

## 7. Event coordination

- [ ] With no focus, the Overview shows recent events.
- [ ] Focusing a device, connection, or channel prefers related timeline events when matching evidence exists.
- [ ] Clicking an event updates the shared EVENT focus.
- [ ] Packet-backed event links still open the exact retained packet.
- [ ] Timeline annotations/bookmarks remain unchanged by Overview selection.

## 8. Replay

- [ ] Open a saved BLE capture and Replay it.
- [ ] Packet-rate and device RSSI graphs follow the recorded packet timestamps, not the computer's current wall clock.
- [ ] Scrubbing backward rebuilds the visual models without retaining future packets in the graphs.
- [ ] Replay speed changes playback cadence but does not alter recorded timestamps or derived evidence.

## Exit gate

Batch 11 is accepted when selection is coordinated across views, every visualization is traceable to retained packet/spectrum evidence, Replay uses recorded time correctly, and the Overview never represents mutually exclusive acquisition modes as simultaneous live measurements.
