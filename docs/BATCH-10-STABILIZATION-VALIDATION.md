# Batch 10 Stabilization Validation — UberToothGUI v1.0 Baseline

This checklist validates the stabilization work that forms the v1.0 baseline and remains present in the v1.1.0 combined release.

## 1. Version / offline baseline

- [ ] Header shows `v1.1.0` in the combined Batch 10 + 11 release.
- [ ] About/exports use the same authoritative application version.
- [ ] A hard refresh does not briefly show an older application version.
- [ ] After one successful online/local load, the service worker can load all local application modules without a missing-asset error.

## 2. Known-good hardware path regression

Using the same physical Ubertooth One that passed Batch 1:

- [ ] CONNECT succeeds.
- [ ] PING succeeds three times.
- [ ] DEVICE INFO still reports expected board/firmware/API data.
- [ ] BLE Scan starts and stops normally.
- [ ] Spectrum starts and stops normally.
- [ ] STOP → restart works without page reload.
- [ ] DISCONNECT → RECONNECT AUTHORIZED works.
- [ ] Physical unplug transitions to a useful disconnected/error state rather than leaving a false STREAMING indicator.

## 3. Capture / interoperability regression

- [ ] Record a BLE capture and save it to IndexedDB.
- [ ] Reopen it in Replay Mode.
- [ ] Packet annotations still survive save/replay.
- [ ] Export JSON, Packet CSV, Raw USB64, PCAP, PCAPNG, and Evidence ZIP.
- [ ] Open at least one exported PCAP or PCAPNG independently in Wireshark and confirm it is recognized as Bluetooth Low Energy Link Layer with RF pseudoheader evidence.

## 4. UI / accessibility stabilization

- [ ] Tab through the interface and confirm focused controls receive an obvious focus outline.
- [ ] The selected navigation item exposes the current-page state to accessibility APIs.
- [ ] EASY / ADVANCED reports the active pressed state and can switch while acquisition is active without stopping it.
- [ ] At approximately 1440 px, 1024 px, 820 px, and 560 px widths, primary controls remain reachable and panels do not overlap.
- [ ] With operating-system reduced-motion preference enabled, hover/transition motion is suppressed.
- [ ] Empty, disconnected, replay, streaming, and error states remain readable in both light and dark themes.

## 5. Bounded-memory / performance checks

- [ ] BLE 5-minute soak completes without unrecovered USB errors.
- [ ] Spectrum 5-minute soak completes without unrecovered USB errors.
- [ ] If those pass, run the existing 60-minute soak for BLE and spectrum as the v1.0 release gate.
- [ ] Packet buffers remain bounded and ring-buffer drops are reported instead of allowing unbounded growth.
- [ ] Packet-rate telemetry remains bounded to the newest 10 minutes of one-second buckets.
- [ ] Per-device timestamped RSSI evidence remains bounded; long scans do not grow a per-device history indefinitely.
- [ ] During an active stream, the UI remains responsive while acquisition continues independently of display refresh.

## Exit gate

Batch 10 is accepted when the established hardware/capture path has no regression, the application remains responsive through the soak period, version/offline assets are coherent, and the accessibility/responsive checks above pass.
