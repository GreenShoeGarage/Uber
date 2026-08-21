# Batch 4 Packet Inspector Validation — UberToothGUI v0.4.0+

## Acceptance sequence

1. Capture live BLE advertisements and open **Packets**.
2. Select a packet with a recognizable advertiser address and advertising-data fields.
3. Verify the **Decoded**, **Hex**, and **Raw Ubertooth** representations refer to the same 64-byte packet.
4. Click the access address, link-layer header, advertiser address, local name, service identifier, manufacturer data, and CRC rows where present.
5. Confirm the corresponding raw byte range highlights in the hexadecimal evidence view.
6. Check the raw structure mappings for packet type/status/channel/clocks/RSSI metadata/data payload.
7. Exercise next/previous packet navigation plus same-device, same-channel, and malformed navigation.
8. Search/filter by advertiser, name, PDU type, bookmark, malformed state, and data-access-address state where available.
9. Add a bookmark, tags, and a note to a packet.
10. Export JSON and verify those annotations are present without altering raw packet bytes.

## Pass criteria

- Every decoded field that advertises provenance highlights the exact bytes that produced it.
- Raw evidence remains 64 bytes and unchanged by annotation or filtering.
- Inspector navigation never changes acquisition state.
- Malformed packets remain inspectable rather than disappearing from evidence.
