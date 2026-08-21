# UberToothGUI v1.8.1 UI/UX Cleanup Validation

This is a presentation/workflow release. It should not change the validated WebUSB, BLE POLL, Spectrum bulk-IN, Bluetooth Classic RX_SYMBOLS, parser, capture, replay, or export semantics.

## 1. Navigation

- [ ] Start in Easy Mode and confirm the sidebar shows only Connect, Overview, Spectrum, BLE, Survey, Capture, and Settings.
- [ ] Switch to Advanced and confirm navigation is grouped as Operate, Observe, Analyze, Record, and System.
- [ ] Collapse and expand the sidebar from the sidebar control without opening Settings.
- [ ] Switch Easy ↔ Advanced during an active capture and confirm acquisition does not stop.
- [ ] If switching to Easy from Classic, Channels, Timeline, Radio, or Diagnostics, confirm the app returns to Connect rather than leaving an inaccessible advanced workspace active.

## 2. Connect

- [ ] Disconnected Easy Mode presents Connect Ubertooth and Use Simulation as the obvious actions.
- [ ] Ping, firmware reset, compile info, and diagnostics are not shown in the Easy primary path.
- [ ] Advanced Mode exposes Hardware tools through progressive disclosure.
- [ ] After connection, Overview, BLE Scan, Spectrum, and Capture quick actions are immediately visible.
- [ ] Disconnect remains visually distinct but not visually dominant.

## 3. Spectrum

- [ ] Easy Mode shows Start Scan, Stop, export, pause, peak, and zoom controls without showing the full tuning panel by default.
- [ ] Spectrum setup expands and contains range, averaging, persistence, waterfall, raw-RSSI scale, and overlays.
- [ ] Advanced Mode opens Spectrum setup by default.
- [ ] Existing range changes, zoom-without-retune behavior, markers, waterfall, pause, clear peak, and export still work.

## 4. BLE

- [ ] Easy Mode shows observed-device summaries before raw packet evidence.
- [ ] Selecting an observed-device summary opens/coordinates the same retained device evidence as before.
- [ ] Packet evidence is collapsed in Easy Mode and remains directly available.
- [ ] Advanced Mode exposes Follow/Promiscuous settings in a collapsible Advanced passive modes panel.
- [ ] Connection evidence remains marked OBSERVED vs INFERRED and can still open detailed control chronology.

## 5. Device Inventory

- [ ] Easy Mode shows the compact State / Device / RSSI / Packets / Channels / Last Seen table.
- [ ] Advanced Mode retains the complete advertiser engineering table with pin, inspect, packets, hide, and passive target actions.
- [ ] Search and activity filters continue to work in both modes.

## 6. Capture / Replay

- [ ] Save Session, Import JSON, and Evidence ZIP are the primary actions.
- [ ] Evidence ZIP still contains the canonical evidence bundle.
- [ ] Individual JSON, packet CSV, raw USB64, PCAPNG, PCAP, and event CSV exports remain available under Individual formats.
- [ ] Replay transport controls and scrub behavior are unchanged.
- [ ] Saved capture library open/rename/duplicate/delete behavior is unchanged.

## 7. Settings / Responsive Layout

- [ ] Settings contains Appearance, Privacy, Clear Local State, and About.
- [ ] Easy/Advanced is controlled only by the persistent header switch, not duplicated in Settings.
- [ ] Light/dark theme and collapsed navigation settings apply correctly.
- [ ] At desktop, tablet, and narrow widths, no page action group overlaps the title or navigation.
- [ ] Native disclosure summaries remain keyboard accessible.
- [ ] Visible keyboard focus remains clear.

## 8. Regression Gate

Run:

```bash
npm test
```

Expected for v1.8.1: **66/66 passing tests**.

Then perform one short physical check on the already validated hardware path:

**CONNECT → BLE SCAN → STOP → SPECTRUM → STOP → CLASSIC (Advanced) → STOP → SAVE SESSION → EXPORT EVIDENCE ZIP → DISCONNECT**

A UI cleanup release passes only if these operations behave the same as v1.8.0 while requiring fewer primary-screen controls to accomplish them.
