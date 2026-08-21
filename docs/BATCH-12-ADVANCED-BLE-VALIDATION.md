# Batch 12 — Advanced BLE Validation

Release family: **v1.2.0**  
Integrated release: **v1.7.0**

This checklist validates the deeper Bluetooth Low Energy (BLE) interpretation added in Batch 12 without treating inferred state as observed fact.

## 1. Regression gate

- [ ] Connect the same Ubertooth One that passed the earlier hardware batches.
- [ ] PING succeeds and device/firmware information is unchanged.
- [ ] Advertisement-only BLE monitoring still starts and stops cleanly.
- [ ] Spectrum acquisition still starts and stops cleanly after BLE monitoring.
- [ ] A saved/replayed pre-v1.2 capture still opens and renders.
- [ ] JSON, CSV and supported PCAP/PCAPNG exports still complete.

## 2. Extended-advertising evidence

Use Simulation first because it deliberately emits an `ADV_EXT_IND` example. Then repeat with physical RF evidence if such packets are actually received by the Ubertooth.

- [ ] `ADV_EXT_IND` is identified in the Packet workspace.
- [ ] The inspector shows the extended-header length/mode when present.
- [ ] Observed AdvA is decoded when the header actually contains one.
- [ ] Advertising Data Info (ADI) exposes SID/DID when present.
- [ ] AuxPtr exposes channel index, offset metadata and PHY indication when present.
- [ ] Extended TX-power evidence is shown when present.
- [ ] Residual advertising data is decoded only from bytes remaining after the extended header.
- [ ] Clicking decoded extended fields highlights the source bytes in the packet inspector.
- [ ] An observed AuxPtr is described as pointer metadata, not as proof that its auxiliary packet was captured.
- [ ] A 2M/Coded PHY value in AuxPtr is not presented as proof that the Ubertooth received that secondary-PHY transmission.

## 3. Device radio profile

Observe several advertisers.

- [ ] Device details show observed advertisement properties such as CONNECTABLE, SCANNABLE, DIRECTED, NON-CONNECTABLE or EXTENDED only when supported by captured PDU evidence.
- [ ] Extended advertising SID values are listed only when observed.
- [ ] `BEACON-LIKE` is visibly marked as a heuristic rather than identity or device-class certainty.
- [ ] Random/private Bluetooth addresses remain described as session observations rather than persistent identity.

## 4. Link Layer control evidence

Use FOLLOW or PROMISCUOUS only in the passive modes already exposed by UbertoothGUI. Availability of particular control PDUs depends on nearby traffic and what the Ubertooth can actually capture.

When examples are observed, verify:

- [ ] `LL_CONNECTION_UPDATE_IND` decodes window size/offset, interval, latency, timeout and Instant.
- [ ] `LL_CHANNEL_MAP_IND` decodes the 37-channel map and Instant.
- [ ] `LL_TERMINATE_IND` retains the reason code.
- [ ] `LL_VERSION_IND` retains version, company ID and subversion.
- [ ] `LL_LENGTH_REQ/RSP` retains RX/TX octet/time limits.
- [ ] `LL_PHY_REQ/RSP/UPDATE_IND` retains the observed PHY fields.
- [ ] Reject/unknown control PDUs remain inspectable rather than being discarded.
- [ ] Every decoded field links back to its raw evidence bytes.

## 5. Connection chronology

Select a connection with captured data-channel control evidence.

- [ ] The connection detail shows a bounded chronological list of observed Link Layer controls.
- [ ] Each chronology entry can jump to the source packet.
- [ ] OBSERVED and INFERRED connection evidence remain distinct.
- [ ] A channel-map or connection-parameter update carrying an `Instant` is labeled as an observed pending indication.
- [ ] The UI does **not** claim the update was applied unless later evidence independently establishes that state.
- [ ] Termination evidence ends the connection state when an `LL_TERMINATE_IND` is actually observed.

## 6. Replay parity

- [ ] Capture a session containing advanced BLE evidence and save it.
- [ ] Open it in Replay Mode.
- [ ] The same extended-advertising and control-PDU fields decode from the preserved 64-byte packet evidence.
- [ ] Byte provenance matches live interpretation.
- [ ] Connection chronology rebuilds from replayed packets rather than a separately stored interpretation.

## Acceptance gate

Batch 12 passes when the normal v1.1 acquisition/replay/export paths remain stable, advanced fields are traceable to original bytes, and the UI consistently distinguishes **OBSERVED**, **INFERRED**, **HEURISTIC**, and **not independently confirmed applied** conclusions.
