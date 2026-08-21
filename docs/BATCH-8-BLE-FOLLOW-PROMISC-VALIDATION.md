# Batch 8 Passive BLE Follow / Promiscuous Validation — UberToothGUI v0.8.0+

## Safety and scope

This checklist covers passive reception only. Use equipment and Bluetooth links you are authorized to observe. UberToothGUI does not expose jamming, arbitrary packet injection, or transmit-test controls in this workflow.

## Follow mode — preferred validation path

Use a controlled BLE peripheral/central pair when possible so connection establishment can be repeated on demand.

1. Connect Ubertooth One and open **Advanced → BLE**.
2. Select advertising channel 37, 38, or 39 as appropriate for the test.
3. Leave PROMISCUOUS off and select **FOLLOW**.
4. Optionally enter the controlled advertiser address and a mask from 1–48 bits.
5. Start capture, then initiate a fresh BLE connection between the controlled devices.
6. Look for a decoded `CONNECT_IND`.
7. If captured, verify the connection evidence is labeled **OBSERVED** and includes:
   - initiator address;
   - advertiser address;
   - connection access address;
   - connection interval;
   - latency;
   - supervision timeout;
   - channel map;
   - hop increment.
8. Open the `CONNECT_IND` Packet Inspector and verify each decoded connection field highlights its source bytes.
9. Confirm subsequent captured data-channel packets using that access address increment the same connection record rather than creating a duplicate.

## Target persistence / clearing

1. Apply a target address and mask in FOLLOW mode.
2. Stop and restart FOLLOW and confirm the configured target remains intentionally applied.
3. Start **ADVERTISEMENTS** mode and confirm UberToothGUI explicitly clears the persisted firmware target before advertisement-only monitoring.
4. Use **CLEAR TARGET** and verify the user-interface state also clears.

## Inferred connection evidence

If a non-advertising access address is observed without a preceding captured `CONNECT_IND`, verify the connection entry is labeled **INFERRED**.

An inferred record must not invent initiator/advertiser identities, connection-establishment timing, or other fields not supported by captured evidence.

## Cancel follow

1. While following, use **CANCEL FOLLOW**.
2. Confirm the command completes without enabling any transmit/jamming behavior.
3. Verify normal STOP/restart remains functional.

## Promiscuous mode — experimental

Current Ubertooth firmware exposes a passive promiscuous mode intended to attempt recovery of already-established BLE connections. Treat success as RF/firmware dependent rather than guaranteed.

1. Select **PROMISCUOUS** in Advanced BLE.
2. Optionally provide a known access address for a controlled connection.
3. Start capture and confirm the UI is explicitly marked PROMISCUOUS/experimental.
4. If packets are recovered, verify they are parsed as promiscuous BLE records and connection evidence remains OBSERVED only when a real establishment packet was captured; otherwise it is INFERRED.
5. If no packets are recovered, confirm the UI does not report that as proof no BLE connection exists.

## Pass criteria

- FOLLOW can passively capture a controlled connection establishment when RF/firmware conditions permit.
- `CONNECT_IND` fields and byte provenance are correct when present.
- Target mask/address behavior is deliberate and can be cleared.
- OBSERVED and INFERRED records remain visually distinct.
- PROMISCUOUS remains labeled experimental and never makes unsupported guarantees.
- No disruptive transmit/jamming operation is exposed or automatically started.
