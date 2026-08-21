# Batch 5 Capture & Replay Validation — UberToothGUI v0.5.0

## Live capture and library

1. Start a BLE or spectrum session, collect evidence, then stop normally.
2. Open **Capture** and give the session a recognizable name.
3. Click **SAVE SESSION** and verify it appears in the local IndexedDB library.
4. Exercise search, rename, duplicate, open, and delete on non-critical test captures.
5. Export JSON and confirm it contains application/session metadata, stats, events, packets, rawHex, and annotations.

## Replay

1. Open a saved capture from the local library.
2. Confirm the header/status clearly identifies **REPLAY** / **RECORDED DATA**.
3. Use restart, back step, play, pause, forward step, speed controls, and timeline scrub.
4. During replay, inspect BLE Devices, Packets, and Spectrum where the source capture contains those records.
5. Verify the played data is reconstructed from raw 64-byte evidence by comparing a packet rawHex before/after export/replay.
6. Confirm packet bookmarks/tags/notes survive reopen/replay.
7. Use an event's packet link and verify it opens the supporting packet where present.
8. Exit Replay and start a live hardware scan; verify the app leaves replay state before acquisition begins.

## Import validation

1. Import a valid v0.5 JSON capture and replay it.
2. Import a valid legacy v1 capture containing complete rawHex records and confirm compatibility.
3. Test a deliberately truncated packet record and confirm import is rejected rather than padded/fabricated.

## Pass criteria

- Live and replay analysis use the same packet parser and BLE/device/spectrum models.
- Saved sessions remain local to the browser unless explicitly exported.
- Replay never presents recorded packets as live hardware traffic.
- Invalid/truncated raw evidence is rejected.
- Starting live hardware acquisition cleanly exits Replay Mode.
