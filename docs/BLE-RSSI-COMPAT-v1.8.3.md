# UberToothGUI v1.8.3 — BLE RSSI Compatibility Validation

## Purpose

Validate the compatibility rule for current Ubertooth BLE `le_phy` packets, which populate RSSI min/max/average fields while emitting `rssi_count = 0`.

## Hardware check

1. Connect a physical Ubertooth One.
2. Start BLE Scan from Easy or Advanced mode.
3. Confirm **Observed Devices** begins showing numeric signal values such as `-55 dBm` rather than `— dBm` as packets arrive.
4. Open **Device Inventory** and confirm current/average/peak RSSI values populate for active advertisers.
5. Open **Packet Inspector** for a BLE packet.
6. Confirm the raw structure can show `rssi_count = 0` while the decoded panel reports a numeric RSSI and the source `BLE le_phy metadata (sample count unavailable)`.
7. Confirm raw bytes 8–11 remain unchanged and traceable.
8. Export capture JSON and confirm the packet contains the raw RSSI bytes/count plus `rssiSource`, `rssiMetadataAvailable`, and `rssiCountValid`.

## Regression check

- Spectrum must continue to use raw SPECAN RSSI values and must not be relabeled as BLE dBm.
- Bluetooth Classic and other non-LE packet types with `rssi_count = 0` must continue to report RSSI unavailable.
- BLE device sorting by strongest signal and RSSI history should populate normally once BLE packets arrive.
- BLE PCAP/PCAPNG signal metadata should use the recovered BLE signal value without modifying the retained 64-byte source record.

## Expected result

Current BLE `LE_PACKET` records expose signal strength even when firmware reports no RSSI sample count. Other packet types retain the generic `rssi_count == 0` invalidity rule.
