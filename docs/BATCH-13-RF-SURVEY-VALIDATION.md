# Batch 13 — RF Survey Mode Validation

Release: **v1.7.0**

Survey Mode intentionally measures **Spectrum and BLE sequentially** on one Ubertooth One. It must never imply that the two datasets were acquired simultaneously.

## 1. Simulation smoke test

- [ ] Switch to Simulation.
- [ ] Open **Survey**.
- [ ] Create a project such as `Workshop Test`.
- [ ] Enter a station name such as `Bench A`.
- [ ] Choose a 10-second phase duration.
- [ ] Select BLE advertising channel 37, 38 or 39.
- [ ] Start the station.
- [ ] Confirm the sequence visibly progresses through **SPECTRUM SAMPLE → BLE SAMPLE → SAVE STATION**.
- [ ] Confirm the Spectrum phase stops before BLE begins.
- [ ] Confirm the station saves automatically when BLE sampling finishes.
- [ ] Confirm Cancel stops the active phase without saving a completed station.

## 2. Local project persistence

- [ ] Create at least two Survey projects.
- [ ] Add at least one station to each.
- [ ] Reload the application.
- [ ] Confirm projects and stations persist independently of Capture Library entries.
- [ ] Rename/recreate project names as needed without affecting capture sessions.
- [ ] Delete one station and confirm only that station is removed.
- [ ] Delete one project and confirm the other project is unchanged.

## 3. Station evidence

For a completed station verify that the stored fingerprint includes:

- [ ] station name and operator note
- [ ] Spectrum phase start/end/duration
- [ ] raw-spectrum mean/strongest evidence
- [ ] retained spectrum bins
- [ ] BLE phase start/end/duration
- [ ] selected advertising channel/configuration
- [ ] observed BLE packet rate
- [ ] observed advertiser count
- [ ] connection-evidence count
- [ ] strongest observed devices
- [ ] 40-channel BLE activity summary
- [ ] observed advertiser snapshots

The station must not claim GPS position unless the operator explicitly encoded location information in its station name/note.

## 4. Physical two-station survey

Keep the Ubertooth/antenna configuration unchanged between locations.

Suggested procedure:

1. Set Spectrum to 2402–2480 MHz.
2. Create a named Survey project.
3. At Location A, create a station with a 30- or 60-second phase duration.
4. Do not move the receiver until both Spectrum and BLE phases finish.
5. Move to Location B.
6. Repeat with the same phase duration, spectrum settings and BLE advertising channel.

Verify:

- [ ] both stations complete without an unrecovered USB error
- [ ] the app does not run SPECAN and BLE simultaneously
- [ ] the selected BLE advertising channel is recorded with each station
- [ ] packet/device counts reflect only each station's BLE sample window
- [ ] spectrum values remain labeled as raw RSSI rather than calibrated dBm

## 5. A/B comparison

Select Location A and Location B.

- [ ] raw-spectrum mean delta is shown
- [ ] BLE packet-rate delta is shown
- [ ] advertiser-count delta is shown
- [ ] connection-evidence delta is shown
- [ ] added observed Bluetooth addresses are shown
- [ ] removed observed Bluetooth addresses are shown
- [ ] the largest BLE channel activity differences are ranked
- [ ] randomized/private addresses are not described as persistent physical identity

For repeatability, optionally collect `Location A Repeat` without deliberately changing the environment and compare it with the first Location A sample before interpreting A/B differences.

## 6. Survey export

- [ ] Export Survey JSON and reopen it externally as valid JSON.
- [ ] Confirm project/station metadata and station evidence are present.
- [ ] Export station-summary CSV and confirm each station has one summary row.
- [ ] Confirm exports are user initiated and remain local.

## 7. Recovery regression

During a disposable station test:

- [ ] unplug/reconnect behavior does not silently save a partial station as complete
- [ ] a transport error marks/cancels the active survey run
- [ ] reconnecting permits a new station to be started normally
- [ ] STOP/CANCEL leaves the normal Spectrum and BLE workspaces usable

## Acceptance gate

Batch 13 passes when two named physical stations can be collected through the sequential **Spectrum → BLE → Save** workflow, persist locally, compare correctly, export locally, and retain the same evidence-quality language used elsewhere in UberToothGUI.
