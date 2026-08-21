# UberToothGUI

**UberToothGUI v1.8.3** is a local-first browser workbench for the Great Scott Gadgets **Ubertooth One**. It turns the device's vendor-specific USB interface into a visual radio-frequency (RF), Bluetooth Low Energy (BLE), and Bluetooth Classic Basic Rate observation instrument without routing captures through a cloud service.

Core workflow:

**CONNECT → OBSERVE → TUNE → CAPTURE → INSPECT → ANALYZE → EXPORT**

The v1.8.3 release is a focused BLE signal-strength compatibility patch on top of the v1.8.2 live-panel reliability fix. It keeps the validated acquisition, decoder, replay, and export paths intact while correctly consuming RSSI metadata emitted by the current upstream BLE `le_phy` firmware path.

> **Status:** Batch 1 hardware validation has been completed successfully by the operator on a physical Ubertooth One. Batches 2–15 are deliberately layered on that proven WebUSB foundation rather than replacing it. BLE continues to use the upstream `POLL` path, Spectrum and Bluetooth Classic use bulk IN, and each later batch includes a focused physical/behavioral acceptance checklist.

## Highlights

## v1.8.3 BLE RSSI compatibility fix

- Fixes BLE device and packet signal strengths incorrectly rendering as **— dBm** on current Ubertooth firmware.
- The generic `usb_pkt_rx` structure describes `rssi_count == 0` as invalid RSSI statistics, but the current BLE `le_phy` path is an implementation exception: it samples RSSI while receiving each byte, fills `rssi_min`, `rssi_max`, and `rssi_avg`, and then emits `rssi_count = 0`.
- The upstream host BLE callback likewise consumes these RSSI fields directly. UberToothGUI now mirrors that behavior only for `LE_PACKET` records while preserving the strict `rssi_count` guard for other packet types.
- Packet Inspector exposes the RSSI source and whether an actual sample count was reported, so the compatibility rule remains traceable to the retained raw USB evidence.
- Capture JSON now records `rssiSource`, `rssiMetadataAvailable`, and `rssiCountValid` alongside the original raw RSSI bytes and count.

## v1.8.2 BLE live-panel navigation fix

- The BLE **Observed Devices** footer and navigation buttons now remain mounted while live RSSI/activity values refresh.
- Device preview rows are patched in place by observed address instead of replacing the complete panel every 200 ms.
- This fixes intermittent missed clicks on **OPEN DEVICE INVENTORY** and reduces the same risk on preview-device selections.
- The underlying BLE acquisition, packet parser, device inventory, and navigation model are unchanged.

## v1.8.1 UI/UX cleanup

- Easy Mode primary navigation is reduced to **Connect, Overview, Spectrum, BLE, Survey, Capture, and Settings**. Detailed device/packet views remain available contextually when evidence needs inspection.
- Advanced navigation is grouped into **Operate, Observe, Analyze, Record, and System** instead of one long undifferentiated list.
- The sidebar can be collapsed or expanded directly without visiting Settings.
- Connect is now a task-oriented start screen: connect/simulate first, then choose Overview, BLE, Spectrum, or Capture. Ping, firmware reset, compile information, and other engineering tools move into Advanced progressive disclosure.
- Spectrum keeps the live plot and common pause/zoom controls visible while range, averaging, persistence, overlays, raw-RSSI scale, and waterfall tuning live in a collapsible setup panel.
- BLE Easy Mode leads with observed advertisers rather than a raw packet table. Packet evidence remains one click away; Follow/Promiscuous configuration stays Advanced-only and collapsible.
- Easy-mode Device Inventory uses a compact evidence table; Advanced retains the full engineering table and pin/hide/target controls.
- Capture now treats **Evidence ZIP** as the recommended primary export and places individual JSON/CSV/raw/PCAP formats under a secondary disclosure.
- Settings no longer duplicates the Easy/Advanced switch that already lives in the persistent header.
- Spacing, panel shadows, button hierarchy, responsive behavior, and empty-state presentation have been tightened without changing RF acquisition or decoder behavior.

- WebUSB is the primary direct-to-device transport.
- Device filter: vendor ID `0x1d50`, product ID `0x6002`.
- Descriptor inspection finds the interface that actually exposes bulk IN endpoint `0x82` (WebUSB endpoint number `2`) instead of assuming an interface number.
- Bulk OUT `0x05` is represented as WebUSB endpoint number `5` when present.
- Named Ubertooth command table based on the upstream USB application programming interface (API), currently `0x0107`.
- Exact 64-byte USB receive framing with a 14-byte metadata header and 50-byte evidence payload.
- Spectrum and Bluetooth Classic use the upstream bulk-IN stream; BLE uses the upstream `POLL` control-request queue path.
- Raw packet bytes are retained alongside parsed values.
- 2.4 gigahertz spectrum instrument with live, exponential-average, persistence, and peak-hold traces; configurable raw-RSSI display scale; zoomable analysis view; and scrolling waterfall.
- Passive BLE advertisement monitoring plus firmware-supported follow and promiscuous modes in Advanced Mode.
- Live advertiser inventory, packet table, decoded/hex/raw inspectors, and RSSI history.
- Bounded ring buffers prevent capture arrays from growing without limit.
- JSON, CSV, raw 64-byte packet, and diagnostic exports.
- IndexedDB snapshots for stopped captures; localStorage is used only for small preferences.
- Easy/Advanced mode switch does not stop an active stream.
- Dark/light themes and responsive desktop layout.
- Simulation runs through the same protocol/controller path as hardware and is visibly labeled **SIMULATION**.
- No analytics, tracking, telemetry, or automatic uploads.
- Batch 1 hardware-validation runner: descriptor/endpoint checks, three PINGs, device/API identity, STOP, and safe radio readbacks.
- Audited command-contract table records request ID, USB direction, value/index use, payload/return length, source mapping, host timeout window, and retry count.
- Built-in BLE/POLL and spectrum/bulk-IN soak tests with 30-second, 5-minute, 30-minute, and 60-minute durations.
- Recovery telemetry counts stalls, successful stall recoveries, transfer errors, disconnects, and reconnects.
- `POLL` retries control-endpoint stalls up to three attempts to mirror current upstream host behavior; spectrum bulk-IN attempts a halt clear and one retry.
- Firmware RESET tolerates detach/stall-style completion and provides an authorized reconnect workflow after USB re-enumeration.
- Full BLE channel overlay (0–39) with advertising channels 37/38/39 emphasized, plus 2.4 GHz Wi-Fi channel-center overlays (1–14).
- Interactive spectrum cursor, mouse-wheel/button zoom, double-click view reset, click-to-create evidence markers, marker notes, and marker duration/strongest-value tracking.
- Waterfall history capacity and display-speed controls that do not alter radio acquisition.
- Spectrum CSV export includes live/average/peak/persistence raw RSSI values and marker annotations.
- BLE GAP advertising-data decoder covers flags, local names, 16/32/128-bit service identifiers, TX power, appearance, service data, and manufacturer-specific data.
- Advertiser inventory tracks first/last seen, packet count, current/average/peak RSSI, channel history, advertisement types, scan responses, services, manufacturer data, pin/hide state, and session-relative NEW/ACTIVE/QUIET/GONE/RETURNED activity labels.
- Packet Inspector links decoded BLE fields to the exact bytes in the retained 64-byte Ubertooth USB packet and provides synchronized decoded, hexadecimal/ASCII, and raw-structure views.
- Packet evidence supports bookmarks, tags, notes, device/channel/malformed navigation, and filtered search.
- Named capture sessions persist locally in IndexedDB and can be searched, renamed, duplicated, deleted, exported, imported, and opened in Replay Mode.
- Replay reconstructs each packet from its original raw 64-byte USB evidence and reuses the live BLE/device/spectrum analysis pipeline; playback supports play/pause, stepping, speed control, and timeline scrubbing.
- Dedicated 40-channel BLE activity workspace shows packet count, recent rate, average/peak RSSI, last activity, and a deliberately relative packet-activity estimate for every data and advertising channel.
- Channel selection is evidence-linked: clicking a channel applies the same channel filter used by the Packet workspace rather than creating a separate packet copy.
- Investigation Timeline provides event search/category/severity filters, structured details, packet evidence jumps, bookmarks, notes, and tags.
- BLE `CONNECT_IND` packets are decoded into initiator/advertiser, connection access address, interval, latency, supervision timeout, channel map, hop increment, and exact source-byte provenance.
- Connection tracking clearly labels **OBSERVED** sessions when a `CONNECT_IND` was captured and **INFERRED** sessions when only non-advertising access-address traffic was observed.
- Advanced BLE controls support the firmware's passive FOLLOW, advertisement-only, PROMISCUOUS, persistent target address/mask, access-address, CRC-verify setting, and CANCEL FOLLOW paths without exposing jamming or packet injection.
- Standards-compatible BLE PCAP and PCAPNG use `LINKTYPE_BLUETOOTH_LE_LL_WITH_PHDR` / DLT 256 and exclude incomplete, malformed, or non-BLE records instead of fabricating missing link-layer bytes.
- Evidence-package ZIP export bundles capture JSON, packet/device/event/spectrum CSVs, raw USB64 evidence, diagnostics, a manifest, README, and PCAP/PCAPNG when eligible BLE frames exist.
- v1.0 stabilization adds synchronized runtime/package/cache versioning tests, accessible navigation state, keyboard focus visibility, reduced-motion support, bounded telemetry, and service-worker asset integrity checks.
- RF Overview coordinates current/retained evidence without implying simultaneous Spectrum and BLE acquisition: spectrum snapshot, 40-channel heatmap, packet-rate history, device RSSI history, connection evidence, and timeline events share one focus model.
- Overview channel heatmap supports packet rate, packet count, average RSSI, peak RSSI, and advertiser-count metrics across 1-second, 10-second, 1-minute, or capture-lifetime windows.
- Device RSSI history retains timestamp, channel, and packet evidence links in a bounded 240-sample per-device history while preserving the existing 96-value sparkline history.
- Packet-rate telemetry uses bounded 1-second buckets and follows recorded timestamps during Replay so historical charts do not mix with wall-clock time.
- Advanced BLE decodes the common `ADV_EXT_IND` header when those bytes are actually present, including observed AdvA, Advertising Data Info (ADI), AuxPtr, extended TX-power evidence, and exact source-byte provenance. AuxPtr is presented as pointer metadata only; the application does not claim that Ubertooth followed a secondary PHY merely because an AuxPtr was observed.
- Link Layer control analysis decodes observed channel-map, connection-update, version, data-length, PHY, reject, and termination control PDUs while retaining unknown opcodes as raw evidence.
- Connection analysis keeps a bounded control chronology and labels pending channel-map/connection updates as observed requests/indications; it does not claim application at an `Instant` unless independently demonstrated.
- Device profiles use explicit evidence labels such as **CONNECTABLE OBSERVED**, **SCANNABLE OBSERVED**, and **EXTENDED ADV OBSERVED**. **BEACON-LIKE** is deliberately labeled a heuristic rather than identity.
- RF Survey Mode stores named local projects and measurement stations in a separate IndexedDB store. Every station performs sequential Spectrum then BLE sampling with the Ubertooth held in one location.
- Survey station fingerprints summarize raw spectrum strength, BLE packet rate, observed advertiser count, connection evidence, strongest devices, and busiest BLE channels; A/B comparison highlights added/removed observed addresses and channel-activity deltas without treating randomized addresses as persistent identity.
- Advanced Bluetooth Classic observation uses firmware Basic Rate modulation plus `RX_SYMBOLS`, receives 64-byte `BR_PACKET` records over bulk IN, and unpacks the 50-byte payload into the 400 one-bit symbol bank used by upstream libbtbb workflows.
- Classic has its own piconet-observation model: observed Lower Address Part (LAP), channel/RSSI history, access-code error count, repeated Upper Address Part (UAP)/header candidates, packet-type candidates, and exact raw-byte provenance.
- A worker-isolated WebAssembly kernel derived from GPL-2.0 libbtbb algorithms performs the narrow access-code/header candidate operations needed by this release; a JavaScript fallback uses the same browser-facing contract.
- Unknown-LAP survey is deliberately exact-match only in this release. A supplied known LAP can be matched with a user-selected 0–4 access-code Hamming-error threshold.
- Full 27-bit Bluetooth master-clock recovery and hop-following are **not** claimed by v1.8.2; clock-six/UAP/header results are explicitly candidate evidence.

## Safety scope

UberToothGUI v1.8.2 is an **observation and analysis instrument**. The normal interface intentionally does **not** expose continuous jamming, interference, arbitrary packet injection, transmit tests, firmware flashing, or other disruptive/device-risk commands. The command enumeration retains upstream identifiers for protocol traceability, but only the receive/diagnostic/control subset used by this release is invokable by the application.

Use radio equipment only on systems and spectrum you are authorized to observe and in accordance with applicable law.

## Browser requirements

Use a desktop Chromium-family browser with WebUSB support, such as a current Chrome or Chromium build.

Hardware access requires a **secure context**:

- `https://...`
- `http://localhost/...` for local development

Opening `index.html` directly as a `file://` page is not the recommended hardware path because module/service-worker/security behavior differs from a served origin.

WebSerial is detected and represented as a transport abstraction, but standard Ubertooth firmware does **not** expose a conventional serial port. The current `WebSerialTransport` is therefore an explicit future bridge hook rather than a fake direct-Ubertooth serial implementation.

## Run locally

No build step and no runtime package dependencies are required.

From the repository directory:

```bash
python3 -m http.server 8000
```

or:

```bash
npm run serve
```

Then open:

```text
http://localhost:8000
```

For hardware access, click **CONNECT UBERTOOTH**. WebUSB device selection must be initiated by the user, so the application never tries to open USB automatically.

## First hardware connection

1. Close native tools that may already have the Ubertooth open, including `ubertooth-*`, Wireshark capture helpers, or other libusb applications.
2. Plug in the Ubertooth One.
3. Serve UberToothGUI from localhost or HTTPS.
4. Open it in a compatible Chromium-family desktop browser.
5. Click **CONNECT UBERTOOTH**.
6. Select the device with vendor/product `1d50:6002` in the browser chooser.
7. The application opens the device, selects a configuration if necessary, inspects all interface alternate settings, finds bulk IN endpoint 2, claims that interface, sends `PING`, and queries device metadata.
8. Confirm the connection screen shows the board, serial, part number, firmware revision, compile information, and API version.
9. Use **SPECTRUM** or **BLE** to begin passive observation.

## Batch 1 hardware hardening (v0.1.1–v0.1.4)

Batch 1 deliberately concentrates on the real-hardware path rather than adding decorative analysis screens. The **Advanced → Diagnostic** workspace now contains:

- **VALIDATE HARDWARE** — checks the selected transport, `1d50:6002` identity, active configuration, claimed interface, expected bulk endpoints, three consecutive PING requests, metadata/API identity, STOP, and safe radio readbacks.
- **RECONNECT AUTHORIZED** — reopens a previously granted Ubertooth through `navigator.usb.getDevices()` after an unplug/reset/re-enumeration event; it does not bypass browser permission.
- **RETRY LAST STREAM** — restores the last BLE or spectrum acquisition settings after an idle recoverable error.
- **SOAK TEST** — runs BLE/POLL or spectrum/bulk-IN for 30 seconds, 5 minutes, 30 minutes, or 60 minutes and reports retained packets, bytes, peak packet rate, ring drops, malformed records, USB errors, stall recoveries, and heap growth where Chromium exposes it.
- **COMMAND CONTRACT AUDIT** — exposes the browser-side command map with upstream source symbol, direction, request ID, `wValue`/`wIndex` meaning, payload/return length, configured host timeout window, and retries.

WebUSB itself does not expose a standards-defined cancellable timeout argument for `controlTransferIn()`/`controlTransferOut()`, so the timeout values shown in the audit are the **upstream host-library contract/reference windows**, not a false promise that the browser can interrupt a pending USB promise at exactly that millisecond.

Current recovery behavior:

- BLE `POLL` retries stalls up to three attempts, matching the current host library's special POLL behavior.
- Spectrum bulk-IN clears a halted IN endpoint and retries once before surfacing the failure.
- USB removal immediately invalidates the stream state through the WebUSB disconnect event.
- Firmware RESET accepts stall/detach-style completion as expected re-enumeration behavior.
- Returning to a visible tab after a long execution gap triggers an idle PING health check so stale **CONNECTED** state is not trusted blindly.

A repeatable physical acceptance procedure is included in [`docs/BATCH-1-HARDWARE-VALIDATION.md`](docs/BATCH-1-HARDWARE-VALIDATION.md). Batch 1 has now been physically validated by the operator on a real Ubertooth One; the checklist remains as the regression gate for later releases.

## Batch 2 spectrum instrument (v0.2.0)

Batch 2 keeps the validated WebUSB transport and `SPECAN` command contract intact while substantially upgrading how spectrum evidence is displayed and inspected.

Implemented spectrum controls and analysis behavior:

- Acquisition range remains a device setting and is constrained to the firmware contract of `2049–3072 MHz`.
- View zoom is independent of acquisition: mouse wheel, **ZOOM +**, **ZOOM −**, and double-click/**RESET VIEW** change only the plotted viewport and never silently retune the radio.
- **LIVE** plots the newest firmware value for each observed frequency bin.
- **AVERAGE** is an exponential moving average with user-adjustable response.
- **PERSISTENCE** is a decaying visual-memory trace; it is explicitly a display aid, not additional measurement precision.
- **PEAK HOLD** retains the strongest raw RSSI observed for each frequency until cleared.
- RSSI floor/ceiling changes only the vertical display scale.
- Waterfall history can retain 90, 180, 360, or 720 rows. The speed control changes visual row cadence/duplication and does not alter the device scan rate.
- BLE overlay shows all 40 Bluetooth Low Energy channels and gives advertising channels 37, 38, and 39 stronger full-height references.
- Wi-Fi overlay shows 2.4 GHz channel centers 1–14, with common 1/6/11 (and channel 14 when in range) emphasized.
- Hovering the spectrum provides a synchronized frequency/live/average/peak cursor.
- Clicking the spectrum creates a marker at the nearest MHz bin. Markers track current raw RSSI, strongest observed raw RSSI, first/last observation, duration, and a user note.
- **EXPORT SPECTRUM CSV** exports the current per-frequency snapshot and marker annotations.

### Spectrum RSSI semantics

The upstream `ubertooth-specan` tool reads each spectrum value as a signed `int8_t` from the frequency/RSSI triples and prints it directly. Upstream documentation describes the output as **raw RSSI values**. UberToothGUI therefore labels the spectrum axis, cursor, markers, and CSV fields as raw RSSI rather than claiming an absolute calibrated dBm measurement. BLE packet metadata continues to use the separate packet RSSI conversion path where applicable.

## Batch 3 BLE Advertisement Workbench (v0.3.0)

Batch 3 expands passive BLE observation without changing the proven `POLL` transport. The lightweight JavaScript decoder now interprets common Generic Access Profile (GAP) advertisement-data structures, including flags, shortened/complete local names, 16/32/128-bit service identifier lists, transmit power, appearance, service data, and manufacturer-specific data.

The Devices workspace is derived only from packets observed in the current live or replay session. It tracks address and address type, first/last seen, packet count, current/average/peak RSSI, channels, advertisement types, scan-response evidence, names, service identifiers, and manufacturer payloads. Pin/hide preferences remain local. Session-relative **NEW / ACTIVE / QUIET / GONE / RETURNED** labels describe observation timing only; they are not identity claims, and randomized/private Bluetooth addresses are never treated as proof of a persistent person or physical device.

A physical/behavioral acceptance procedure is included in [`docs/BATCH-3-BLE-VALIDATION.md`](docs/BATCH-3-BLE-VALIDATION.md).

## Batch 4 Packet Analysis Workbench (v0.4.0)

The Packet workspace is now evidence-oriented rather than a simple row inspector. It provides synchronized:

- **Decoded** BLE values and advertising-data fields;
- **Hex + ASCII** for the complete retained 64-byte USB packet;
- **Raw Ubertooth structure** fields for packet type, status, channel, clocks, RSSI metadata, and payload.

Decoded fields carry USB-byte provenance. Selecting an access address, link-layer header, advertiser address, advertising-data element, payload, or CRC highlights the exact source byte range in the raw packet. Packet navigation can move chronologically or by the same advertiser, channel, or malformed-record state. Bookmarks, tags, and notes remain attached to the packet in capture JSON and survive replay reconstruction.

Validation steps are in [`docs/BATCH-4-PACKET-INSPECTOR-VALIDATION.md`](docs/BATCH-4-PACKET-INSPECTOR-VALIDATION.md).

## Batch 5 Capture & Replay (v0.5.0)

Capture sessions now have stable identifiers, names, source/mode metadata, bounded packet evidence, events, and annotations. Stopped live sessions are stored in a local IndexedDB library that supports search, open, rename, duplicate, and delete. JSON capture import validates the schema and rejects packet records whose raw evidence cannot reconstruct a complete 64-byte Ubertooth USB packet. Legacy v1 JSON captures remain readable where they contain valid raw packet evidence.

**Replay Mode** is deliberately not a second decoder. Each saved `rawHex` record is reconstructed to the original 64 bytes, parsed again with the normal `parseUsbPacket`/BLE code, and then fed through the same device inventory and spectrum analysis path used for live data. Replay supports play/pause, forward/back stepping, 0.25×–16× speed, timeline scrub, jump-to-evidence, and exit back to live operation. Starting a real hardware stream automatically leaves Replay Mode first.

The local library and replay workflow are covered by [`docs/BATCH-5-CAPTURE-REPLAY-VALIDATION.md`](docs/BATCH-5-CAPTURE-REPLAY-VALIDATION.md).

## Batch 6 Channel Activity (v0.6.0)

The Advanced **Channels** workspace summarizes all 40 BLE channels without duplicating packet evidence. Each channel reports its BLE frequency, data/advertising role, packet count, recent packet rate, average/peak packet RSSI, last activity, and HOT/RECENT/IDLE state. The displayed **relative activity** is normalized from recent observed packet counts; it is intentionally described as a packet-activity estimate, not an RF airtime/occupancy measurement. Clicking a channel applies the shared packet channel filter and can jump directly to the filtered Packet workspace.

Validation is in [`docs/BATCH-6-CHANNEL-ACTIVITY-VALIDATION.md`](docs/BATCH-6-CHANNEL-ACTIVITY-VALIDATION.md).

## Batch 7 Investigation Timeline (v0.7.0)

The Advanced **Timeline** workspace turns connection, RF, BLE, capture, replay, and annotation events into a chronological evidence index. Events can be searched and filtered by category/level; events backed by a packet retain the packet identifier and jump to the exact packet evidence. Event bookmarks, notes, and tags stay in the capture document and therefore survive JSON export/import and Replay Mode. Structured event detail is shown without replacing the underlying packet record.

Validation is in [`docs/BATCH-7-TIMELINE-VALIDATION.md`](docs/BATCH-7-TIMELINE-VALIDATION.md).

## Batch 8 Passive Follow / Promiscuous Analysis (v0.8.0)

Advanced BLE now exposes the passive modes supported by current Ubertooth firmware while making their different evidence quality explicit. FOLLOW is the normal connection-following workflow and can use a persistent target Bluetooth address plus a 1–48 bit mask; advertisement-only mode clears a persisted target before scanning; PROMISCUOUS remains labeled experimental and can optionally use a known access address. `CANCEL FOLLOW` and target clearing are explicit controls.

A captured `CONNECT_IND` creates an **OBSERVED** connection record with initiator/advertiser addresses, connection access address, interval, latency, supervision timeout, channel map, hop increment, and byte provenance. Data on a previously unseen non-advertising access address creates only an **INFERRED** record with unknown endpoints; the application does not invent a connection establishment packet or identity.

Validation is in [`docs/BATCH-8-BLE-FOLLOW-PROMISC-VALIDATION.md`](docs/BATCH-8-BLE-FOLLOW-PROMISC-VALIDATION.md).

## Batch 9 Interoperability / Evidence Package (v0.9.0)

For complete, non-malformed BLE link-layer records, UberToothGUI can now emit PCAP and PCAPNG using `LINKTYPE_BLUETOOTH_LE_LL_WITH_PHDR` (DLT 256). The pseudoheader carries the observed RF channel and valid signal metadata. The writer does **not** claim CRC verification unless that evidence is available, and it excludes truncated/malformed/non-BLE records rather than padding them into a superficially valid capture. Excluded records remain preserved by JSON and raw USB64 exports.

**EXPORT EVIDENCE ZIP** creates one local package containing canonical capture JSON, packet/device/event/spectrum CSVs, concatenated raw 64-byte USB evidence, diagnostic JSON, package manifest/README, and PCAP/PCAPNG when eligible frames exist. No package is uploaded automatically.

Validation is in [`docs/BATCH-9-INTEROPERABILITY-VALIDATION.md`](docs/BATCH-9-INTEROPERABILITY-VALIDATION.md).

## Batch 10 Stabilization Baseline (v1.0.0)

The v1.0 baseline intentionally adds very little protocol surface. It freezes the proven v0.9 acquisition/evidence behavior, removes duplicated UI styling, adds explicit focus-visible/reduced-motion behavior, exposes accessible navigation state, makes the mode toggle report its pressed state, and adds automated version/service-worker asset synchronization checks. The new bounded telemetry model records packet/USB-health history without introducing unbounded arrays or per-packet full-page redraws.

Validation is in [`docs/BATCH-10-STABILIZATION-VALIDATION.md`](docs/BATCH-10-STABILIZATION-VALIDATION.md).

## Batch 11 Visualization Workbench (v1.1.0)

The **Overview** workspace coordinates six views of the same retained evidence: spectrum snapshot, BLE channel heatmap, packet-rate history, selected-device RSSI history, connection evidence, and recent/focus-linked timeline events. Clicking a channel uses the same packet-channel filter as the Packet workspace; selecting a device, connection, or event changes the shared focus rather than copying data into an independent dashboard. Packet markers in the RSSI chart can jump directly to the source packet.

Because one Ubertooth cannot perform SPECAN and BLE acquisition at the same time, the Overview explicitly labels the spectrum panel **CURRENT ACQUISITION** only during an active spectrum stream and **RETAINED / LAST SPECTRUM** otherwise. It does not imply simultaneous measurements.

Validation is in [`docs/BATCH-11-VISUALIZATION-VALIDATION.md`](docs/BATCH-11-VISUALIZATION-VALIDATION.md).

## Batch 12 Advanced BLE (v1.2.0)

Advanced BLE extends the existing byte-provenance parser rather than creating a separate decoder. When captured evidence contains `ADV_EXT_IND`, UberToothGUI decodes the common extended header and can expose observed advertiser address, Advertising Data Info (ADI), AuxPtr metadata, and extended TX-power evidence. Primary-channel `ADV_EXT_IND` simulation deliberately carries no synthetic application AdvData; Bluetooth extended advertising normally uses AuxPtr to reference the auxiliary packet that carries that data. The parser can still preserve/decode residual common-extended-payload bytes when they are actually present in captured evidence. The presence of AuxPtr is treated as pointer evidence; it is not presented as proof that a secondary advertising event or a 2M/Coded PHY was captured.

For data-channel traffic, selected Link Layer control PDUs are decoded into structured evidence: connection update, channel-map update, termination, version, feature bytes, reject, data length, and PHY negotiation/update. Each connection retains a bounded control chronology. Pending updates preserve the observed `Instant` but are explicitly labeled as **not independently confirmed applied**. Device profiles likewise use observation/heuristic labels rather than device identity claims.

Validation is in [`docs/BATCH-12-ADVANCED-BLE-VALIDATION.md`](docs/BATCH-12-ADVANCED-BLE-VALIDATION.md).

## Batch 13 RF Survey Mode (v1.7.0)

The **Survey** workspace manages local RF survey projects made of named measurement stations. Because a single Ubertooth cannot run SPECAN and BLE monitoring simultaneously, every station deliberately performs two consecutive phases using the same configured duration:

**SPECTRUM SAMPLE → BLE SAMPLE → SAVE STATION**

A saved station contains the spectrum sample summary and bins, BLE packet/activity summary, observed advertiser snapshots, connection count, strongest devices, and a compact RF-environment fingerprint. Two stations can be compared for raw-spectrum mean shifts, BLE packet-rate changes, advertiser/connection count changes, added/removed observed addresses, and the BLE channels with the largest packet-count/peak-RSSI deltas. Projects and stations remain local in IndexedDB and export to JSON or station-summary CSV.

Survey results describe observations at named locations; they do not identify people, claim persistent ownership of randomized Bluetooth addresses, or imply simultaneous spectrum/BLE measurement.

Validation is in [`docs/BATCH-13-RF-SURVEY-VALIDATION.md`](docs/BATCH-13-RF-SURVEY-VALIDATION.md).

## Batch 14 Bluetooth Classic Foundation (v1.8.0)

Advanced Mode now includes a dedicated **Classic** workspace rather than forcing Basic Rate observations into the BLE advertiser model. The device path follows upstream `ubertooth-rx`: set Basic Rate modulation, start `RX_SYMBOLS`, receive `BR_PACKET` records over bulk IN, and unpack the 50-byte radio payload into 400 symbols. Sweep mode uses the firmware channel-sweep sentinel; a fixed Classic channel 0–78 can also be selected.

The browser decoder discovers an observed Lower Address Part (LAP), records access-code bit offset/error evidence, performs the Basic Rate header-presence screen, and produces the 64 clock-six/UAP/header candidates needed by the piconet tracker. Repeated candidate evidence can stabilize a UAP after at least three matching header results with at least 60% confidence. The tracker also records channels, RSSI, header packet count, candidate packet types, and exact source-byte provenance. A stabilized UAP remains a decoder conclusion—not a device identity claim.

Unknown-LAP survey is exact-match only in v1.8.0. When a known LAP is supplied, the matcher supports a deliberate 0–4 Hamming-error threshold. Full 27-bit master-clock recovery, adaptive frequency-hopping reconstruction, and standards-correct Classic PCAP export remain intentionally unavailable rather than being approximated. Classic evidence is preserved in JSON, packet CSV, `classic.csv`, raw USB64 evidence, and Replay Mode.

Validation is in [`docs/BATCH-14-BLUETOOTH-CLASSIC-VALIDATION.md`](docs/BATCH-14-BLUETOOTH-CLASSIC-VALIDATION.md).

## Batch 15 libbtbb / WebAssembly Boundary (v1.8.0)

The first libbtbb integration is intentionally narrow. `assets/libbtbb-kernel.wasm` is a small GPL-2.0 kernel derived from the access-code/header algorithms in Great Scott Gadgets' libbtbb. It is loaded inside `src/decoder/libbtbb-worker.js`, off the main user-interface thread, through `src/decoder/classic-decoder.js`. The worker handles access-code generation/search, known-LAP matching, the header-presence test, 1/3 Forward Error Correction (FEC) recovery, whitening removal, Header Error Check reversal, and the 64 clock-six/UAP/header candidates.

The full libbtbb library is not embedded. The JavaScript layer retains USB framing, timing/provenance, evidence storage, and the piconet tracker; it also provides a compatible fallback if WebAssembly or the worker cannot initialize. The complete kernel source, build script, attribution, and GPL-2.0 license are included under `third_party/libbtbb-wasm/` so the shipped `.wasm` artifact is reproducible and auditable. No transmit, injection, or jamming functionality is present in this decoder boundary.

Validation is in [`docs/BATCH-15-LIBBTBB-WASM-VALIDATION.md`](docs/BATCH-15-LIBBTBB-WASM-VALIDATION.md).

## USB protocol implementation

The browser protocol layer is based on the Great Scott Gadgets Ubertooth sources, particularly:

- `host/libubertooth/src/ubertooth_control.c`
- `host/libubertooth/src/ubertooth_control.h`
- `host/libubertooth/src/ubertooth_interface.h`
- `host/ubertooth-tools/src/ubertooth-specan.c`
- `host/ubertooth-tools/src/ubertooth-btle.c`
- `host/ubertooth-tools/src/ubertooth-rx.c`
- `host/libubertooth/src/ubertooth_callback.c`
- `firmware/bluetooth_rxtx/`
- `libbtbb/bluetooth_packet.c` for the separately attributed WebAssembly kernel

Useful upstream facts represented in the code:

| Item | Value |
| --- | --- |
| USB vendor ID | `0x1d50` |
| Ubertooth One product ID | `0x6002` |
| libusb DATA IN | `0x82` |
| WebUSB DATA IN endpoint number | `2` |
| libusb DATA OUT | `0x05` |
| WebUSB DATA OUT endpoint number | `5` |
| Receive USB packet | `64 bytes` |
| Metadata header | `14 bytes` |
| Radio payload | `50 bytes` |
| Upstream API version targeted | `0x0107` |

The upstream `2020-12-R1` release and current upstream interface header both declare API `0x0107`. UberToothGUI reads the device's USB device version as the API value and shows whether it matches, is older, or is newer than the version this release was implemented against.

## Easy Mode

Easy Mode focuses on the shortest useful workflow:

- Connect
- RF Overview
- Spectrum
- BLE advertisements
- Devices
- Packets
- Capture/export
- RF Survey projects and station comparison

The persistent **EASY | ADVANCED** control only changes interface exposure. It does not stop an active stream.

## Advanced Mode

Advanced Mode adds read-back-oriented controls for:

- channel/frequency
- modulation
- squelch
- power amplifier enable
- high gain mode
- power amplifier level readback
- CRC verification
- access address
- BLE target/mask
- user/RX/TX LEDs
- firmware clock
- raw USB descriptor/configuration/endpoint evidence
- rolling command and transfer diagnostics
- Advanced BLE extended-header/control-PDU evidence
- RF Survey project/station controls and A/B comparison

Changes are read back from the device where an upstream getter exists rather than assuming the requested state took effect.

## Spectrum analyzer

The spectrum workspace follows the upstream `ubertooth-specan` transport pattern: `SPECAN` starts the scan and 64-byte spectrum records arrive through bulk IN endpoint 2. Each spectrum packet contains up to sixteen 3-byte frequency/RSSI records in the 50-byte data region. The browser recognizes sweep completion when the configured high-frequency record arrives, matching the host tool's sweep delimiter behavior. Capture rate remains separate from display refresh rate. Canvas rendering is used for both spectrum and waterfall views.

Default range:

```text
2402 MHz → 2480 MHz
```

The underlying firmware accepts a broader spectrum scan range; the UI validates ordered values inside `2049–3072 MHz` rather than claiming precision or capability outside the firmware contract.

BLE/Wi-Fi overlays are visual frequency references only. They do not imply protocol-specific occupancy was decoded at those frequencies. Spectrum marker values retain the raw firmware RSSI semantics described above.

A physical acceptance checklist for these controls is included in [`docs/BATCH-2-SPECTRUM-VALIDATION.md`](docs/BATCH-2-SPECTRUM-VALIDATION.md).

## BLE monitor

The BLE workspace follows current upstream `ubertooth-btle`: it starts the firmware mode, then polls the firmware queue with the `POLL` vendor request. A queued record is the same 64-byte `usb_pkt_rx`; an empty queue returns the short empty indication rather than a fabricated packet. The native JavaScript BLE layer intentionally stays lightweight but now decodes the structures needed for a useful advertisement workbench:

- BLE access address, advertising PDU type, declared length, and channel mapping
- advertiser/initiator/scanner address roles where present and public/random header indication
- flags and local name advertising data
- 16-bit, 32-bit, and 128-bit service identifier lists
- transmit power and appearance
- service data and manufacturer-specific data
- CRC evidence where retained in the packet
- exact raw-USB byte provenance for decoded fields

Raw bytes remain available in the inspector so decoded values stay traceable to evidence.

The application does not claim that a randomized Bluetooth address identifies a person or a persistent physical device.

Bluetooth Classic now uses a separate Basic Rate parser/tracker and a narrow libbtbb-derived WebAssembly worker. The release deliberately stops short of full libbtbb clock/hopping recovery; unsupported conclusions remain labeled unavailable rather than inferred.

## Capture and storage

A live stream records into a bounded ring buffer. The default retained capacity is 20,000 packets. When the buffer fills, the oldest retained packet is replaced and the **RING DROPS** counter increases; memory does not grow without bound.

Capture statistics include:

- duration
- packets received
- bytes retained from packet input
- ring-buffer drops
- malformed BLE records detected by lightweight parsing
- USB errors
- packet rate
- current mode

When a stream is explicitly stopped, UberToothGUI stores a JSON-compatible capture snapshot in IndexedDB when browser storage is available. Saved sessions appear in the **Capture** library and can be reopened in Replay Mode. Replay reconstructs packets from raw evidence rather than trusting pre-decoded fields in the JSON document.

## Export formats

Implemented through v1.8.2:

- **JSON** — canonical capture document with parsed metadata, events, annotations, and raw packet hex
- **Packet CSV** — packet table including BLE and Bluetooth Classic summary fields
- **Device CSV** — derived advertiser inventory
- **Event CSV** — investigation timeline
- **Spectrum CSV** — per-frequency live/average/peak/persistence raw RSSI plus marker annotations
- **Raw USB64 binary** — concatenated original 64-byte USB records
- **Diagnostic JSON** — device/USB state, rolling diagnostics, spectrum configuration, channel summary, and connection evidence
- **BLE PCAP** — DLT 256 / `LINKTYPE_BLUETOOTH_LE_LL_WITH_PHDR` for eligible complete BLE frames
- **BLE PCAPNG** — Section Header, DLT-256 Interface Description, and Enhanced Packet Blocks for the same eligible BLE evidence
- **Classic CSV** — one row per parsed Basic Rate observation with LAP, access-code errors, bit offset, candidate UAP/header/type, channel, RSSI, and decoder engine
- **Evidence ZIP** — local STORE-format ZIP containing the canonical evidence set and a manifest recording BLE PCAP eligibility/exclusions

BLE PCAP/PCAPNG deliberately exclude malformed, truncated, unknown-channel, spectrum, Bluetooth Classic, and other non-BLE USB records. Classic observations remain in JSON, packet CSV, `classic.csv`, and raw USB64 evidence. Standards-correct Classic PCAP is not implemented in v1.8.2; the application does not invent a link type or fabricate decoded bytes.

## Simulation Mode

Click **USE SIMULATION** on the connection page when no hardware is available. Simulation provides:

- several changing BLE advertisers
- changing RSSI
- BLE advertisement channel rotation across 37/38/39
- simulated FOLLOW establishment with `CONNECT_IND` plus data-channel traffic
- simulated PROMISCUOUS records using `LE_PROMISC`, with optional configured access address
- spectrum activity
- Bluetooth Classic Basic Rate `RX_SYMBOLS` records with a known synthetic LAP/UAP/header fixture across sweep or fixed channels
- occasional FIFO/error status
- occasional deliberately malformed BLE length declarations for parser/error UI testing
- a periodic simulated disconnect/reconnect diagnostic event

Every simulated screen remains visibly marked **SIMULATION**. Simulated packets are never presented as physical RF observations.

## Linux USB permission considerations

WebUSB still depends on the operating system allowing the browser process to access the device. If the chooser can see the Ubertooth but opening or claiming the interface fails:

- close native libusb/Ubertooth tools first;
- check device ownership with `lsusb` and your distribution's USB permission rules;
- use an appropriate `udev` rule for `1d50:6002` if your distribution requires one;
- prefer granting access to a normal user/group rather than running the browser as root;
- reconnect the device after changing rules.

The exact group/rule convention varies by distribution, so do not blindly copy a permission rule that grants world-writable USB access.

## Windows driver considerations

If the browser sees the Ubertooth but cannot claim its interface, a Windows driver may already own the device/interface. WebUSB access to vendor-specific USB hardware may require an appropriate WinUSB-compatible association. Driver reassignment tools can change how the native Ubertooth/libusb tools see the device, so record the original state before changing a driver and be prepared to restore it.

A `DEVICE BUSY` or transfer error in UberToothGUI is not proof of defective hardware; first close other capture applications and inspect the Advanced USB diagnostics.

## macOS considerations

There is no Linux-style `udev` rule. Grant the browser's USB chooser permission, close any native application using the Ubertooth, and reconnect the device if a claim fails after another process releases it. Hardware access must still originate from localhost or HTTPS.

## Troubleshooting

### DEVICE NOT FOUND

The chooser was cancelled or no matching `1d50:6002` device was selected. Reconnect the Ubertooth and click **CONNECT UBERTOOTH** again.

### PERMISSION DENIED

The browser/operating system did not grant USB access. Confirm secure-context use and OS device permissions.

### DEVICE BUSY OR TRANSFER FAILED

Another process or driver may own the interface. Close native Ubertooth/libusb capture tools, unplug/replug the device, and retry.

### No interface exposes endpoint 2

Open **Advanced → Diagnostic** if possible and inspect the descriptors. UberToothGUI deliberately does not assume interface 0; it requires an alternate setting that actually advertises the expected bulk IN endpoint.

### TRANSFER STALLED

The application clears the bulk IN halt and reports the underlying browser exception. Stop/restart the observation mode. If stalls recur, export diagnostics before reconnecting.

### API mismatch

The connection page compares the USB `bcdDevice`/device-version value to API `0x0107`. An older or newer value is shown rather than silently assuming compatibility. Match firmware and host-era expectations before debugging packet parsing.

### Spectrum works but BLE does not

Confirm the firmware mode is stopped before switching, then start **ADVERTISEMENTS** first. Follow and promiscuous modes are firmware-dependent advanced modes and have different behavior from no-follow advertisement monitoring.

## Privacy

UberToothGUI is designed to operate locally:

- no analytics
- no telemetry
- no automatic network upload
- no cloud account
- no external runtime JavaScript libraries
- preferences in localStorage
- capture snapshots in IndexedDB
- exports initiated explicitly by the user

The included service worker caches only local application assets for offline use after the app has been served from a secure context.

## Repository layout

```text
UberToothGUI/
├── index.html
├── styles.css
├── manifest.webmanifest
├── sw.js
├── package.json
├── README.md
├── NOTICE.md
├── docs/
│   ├── BATCH-1-HARDWARE-VALIDATION.md
│   ├── BATCH-2-SPECTRUM-VALIDATION.md
│   ├── BATCH-3-BLE-VALIDATION.md
│   ├── BATCH-4-PACKET-INSPECTOR-VALIDATION.md
│   ├── BATCH-5-CAPTURE-REPLAY-VALIDATION.md
│   ├── BATCH-6-CHANNEL-ACTIVITY-VALIDATION.md
│   ├── BATCH-7-TIMELINE-VALIDATION.md
│   ├── BATCH-8-BLE-FOLLOW-PROMISC-VALIDATION.md
│   ├── BATCH-9-INTEROPERABILITY-VALIDATION.md
│   ├── BATCH-10-STABILIZATION-VALIDATION.md
│   ├── BATCH-11-VISUALIZATION-VALIDATION.md
│   ├── BATCH-12-ADVANCED-BLE-VALIDATION.md
│   ├── BATCH-13-RF-SURVEY-VALIDATION.md
│   ├── BATCH-14-BLUETOOTH-CLASSIC-VALIDATION.md
│   └── BATCH-15-LIBBTBB-WASM-VALIDATION.md
├── assets/
│   └── libbtbb-kernel.wasm
├── third_party/
│   └── libbtbb-wasm/
│       ├── kernel.c
│       ├── build.sh
│       ├── README.md
│       └── LICENSE
├── src/
│   ├── app.js
│   ├── version.js
│   ├── state.js
│   ├── bluetooth/
│   ├── decoder/
│   ├── survey/
│   ├── capture/
│   ├── diagnostics/
│   ├── spectrum/
│   ├── storage/
│   ├── analysis/
│   ├── transport/
│   ├── ubertooth/
│   ├── ui/
│   └── utils/
└── tests/
    ├── protocol.test.js
    ├── hardening.test.js
    ├── spectrum.test.js
    ├── batches-3-5.test.js
    ├── batches-6-9.test.js
    ├── batches-10-11.test.js
    ├── batches-12-13.test.js
    └── batches-14-15.test.js
```

## Tests

Run protocol/parser unit tests with:

```bash
npm test
```

The automated suite currently contains **66 passing tests**. In addition to the Batch 1–13 protocol, hardening, spectrum, BLE decoding, provenance, recovery, replay, visualization, and survey checks, it verifies Classic `RX_SYMBOLS` simulation, Basic Rate access-code/header decoding, known-LAP error tolerance, repeated UAP stabilization, WebAssembly/JavaScript parity on a known fixture, Classic replay reconstruction, Classic-only evidence-package behavior, and v1.8 runtime/package/service-worker asset synchronization.

## Current v1.8.2 limitations / next work

Batches 14–15 are complete in software. The prioritized roadmap now moves to **v1.9 Developer/Firmware Lab**: a deliberately separated engineering workspace for protocol/USB/firmware compatibility inspection and safe command exploration.

Classic limitations are explicit: unknown-LAP discovery is exact-match only; known-LAP matching allows a selected 0–4 access-code error threshold; repeated UAP/header results are decoder candidates; full 27-bit master-clock recovery and hop following are not implemented; and Classic PCAP/PCAPNG is not emitted. Bluetooth Classic evidence remains available in JSON, CSV, raw USB64 data, packet provenance, and Replay Mode.

Other operational limitations remain explicit: Spectrum, BLE, and Classic are mutually exclusive acquisition modes on one Ubertooth. Survey Mode samples Spectrum and BLE sequentially. PROMISCUOUS is experimental. CRC verify is a firmware setting rather than proof that every retained frame passed CRC. An observed AuxPtr does not establish that its auxiliary packet was captured. A Link Layer update containing an `Instant` records that observed indication but does not by itself prove the later state was applied. Bluetooth random/private addresses remain session observations rather than identity.

## Upstream project and attribution

Ubertooth is an open-source Great Scott Gadgets project. Protocol behavior in UberToothGUI was implemented with the upstream project as the authoritative reference. Project Ubertooth code and documentation are published under GPLv2 terms; see the upstream repository and its `COPYING` file for details.

Ubertooth is a trademark of Great Scott Gadgets. UberToothGUI is an independent browser workbench and is not affiliated with or endorsed by Great Scott Gadgets.
