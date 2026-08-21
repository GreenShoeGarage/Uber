# Batch 9 Interoperability & Evidence Package Validation — UberToothGUI v0.9.0

## Purpose

Validate binary capture interoperability independently of UberToothGUI and verify that an evidence package preserves both exportable BLE frames and records intentionally excluded from PCAP/PCAPNG.

## Create a mixed evidence capture

1. Capture several valid BLE advertisements.
2. If available, include a valid `CONNECT_IND`/data record.
3. Retain at least one malformed test record in Simulation Mode or an existing test capture.
4. Stop the session so a stable capture document is available.

## BLE PCAP

1. Click **EXPORT BLE PCAP**.
2. Open the file in an independent analyzer such as Wireshark.
3. Confirm the capture uses `LINKTYPE_BLUETOOTH_LE_LL_WITH_PHDR` / DLT 256.
4. Inspect multiple frames and compare against UberToothGUI:
   - BLE RF channel;
   - access address;
   - link-layer header/PDU length;
   - payload bytes;
   - CRC bytes when present;
   - signal metadata.
5. Confirm malformed/truncated/non-BLE records are absent rather than padded into valid-looking frames.

## BLE PCAPNG

1. Click **EXPORT BLE PCAPNG**.
2. Open the file independently.
3. Confirm the Section Header Block, Interface Description Block, and Enhanced Packet Blocks are accepted without repair warnings.
4. Confirm the interface link type is DLT 256 and packet contents agree with the corresponding PCAP/raw evidence.

## Evidence ZIP

1. Click **EXPORT EVIDENCE ZIP**.
2. Open/unzip it with an independent ZIP utility.
3. Confirm the package contains at minimum:
   - `capture.json`
   - `manifest.json`
   - `packets.csv`
   - `devices.csv`
   - `events.csv`
   - `spectrum.csv`
   - `raw-usb64.bin`
   - `diagnostics.json`
   - `README.txt`
4. When eligible BLE frames exist, confirm `capture.pcap` and `capture.pcapng` are also present.
5. Inspect `manifest.json` and verify eligible/excluded PCAP counts agree with the capture contents.
6. Confirm malformed/non-BLE evidence excluded from PCAP remains represented in canonical JSON/raw evidence as appropriate.

## Replay/export consistency

1. Open the same capture in Replay Mode.
2. Export PCAP, PCAPNG, raw USB, and Evidence ZIP before replay reaches the end.
3. Confirm exports represent the complete selected recorded capture rather than only the subset already played.

## Empty/unsupported export handling

1. Use a capture containing no eligible complete BLE link-layer frames.
2. Request BLE PCAP/PCAPNG.
3. Confirm UberToothGUI refuses or clearly reports that there are no eligible frames rather than generating a misleading Bluetooth capture.

## Pass criteria

- Independent tools accept PCAP/PCAPNG without structural repair.
- DLT/link type is 256 (`BLUETOOTH_LE_LL_WITH_PHDR`).
- Exported link-layer bytes match retained Ubertooth evidence exactly for eligible frames.
- Ineligible records are excluded explicitly and never fabricated.
- Evidence ZIP opens in an independent ZIP tool and its manifest matches its contents.
- Replay exports operate on the complete selected recording.
