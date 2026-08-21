# Batch 3 BLE Validation — UberToothGUI v0.3.0+

Use this checklist with the same physical Ubertooth One that passed the Batch 1 hardware gate.

## Acceptance sequence

1. Connect the Ubertooth and confirm device/API metadata.
2. Open **BLE** and start **ADVERTISEMENTS**.
3. Confirm packets arrive without changing the validated WebUSB/POLL path.
4. Verify multiple observed advertisers populate **Devices**.
5. Confirm advertisement types such as ADV_IND / ADV_NONCONN_IND / SCAN_RSP appear when present in real traffic.
6. For packets that contain them, verify local names, flags, service identifiers, TX power, appearance, service data, and manufacturer-specific data decode plausibly.
7. Select an advertiser and confirm first/last seen, packet count, RSSI history, peak/average RSSI, channel set, and PDU types update.
8. Verify search, activity-state filter, channel filter, sort, **PIN**, **HIDE**, and **SHOW HIDDEN** controls.
9. Stop scanning and leave the Devices view open long enough to observe ACTIVE → QUIET → GONE aging where appropriate.
10. Restart scanning and verify a previously quiet observed address can become RETURNED without the UI claiming persistent physical identity.
11. Export the device inventory CSV and compare several rows with the live table.
12. Run at least a 5-minute BLE soak and confirm no unrecovered USB error.

## Pass criteria

- Easy Mode still supports CONNECT → BLE SCAN with no obscure configuration.
- Real BLE advertisements populate packet/device views.
- Parsed GAP fields agree with retained packet bytes for spot-checked frames.
- Filters/pins/hiding affect presentation only and do not interrupt acquisition.
- Random/private address wording never implies person-level or persistent-device identity.
