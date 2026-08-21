# Batch 7 Investigation Timeline Validation — UberToothGUI v0.7.0+

## Purpose

Validate that the Timeline acts as a chronological evidence index and that packet-backed events resolve to the exact retained packet rather than a copied interpretation.

## Generate events

1. Connect the Ubertooth and start a BLE capture.
2. Allow at least one advertiser to appear.
3. Stop and restart the stream once.
4. Add a bookmark/note/tag to a packet.
5. Save the capture.
6. If practical, exercise a recoverable event such as a normal stop/reconnect rather than intentionally causing repeated USB faults.

## Timeline display

Confirm Timeline entries include appropriate categories such as:

- SYSTEM
- RF
- BLE
- CAPTURE
- REPLAY
- ANNOTATION

Verify timestamp, level, message, and structured detail are shown without replacing the underlying packet evidence.

## Search and filters

1. Search for a known event term.
2. Filter by category.
3. Filter by level.
4. Clear filters and confirm the full event sequence returns.

## Packet evidence links

1. Select an event that references a packet.
2. Use **OPEN PACKET**.
3. Confirm the Packet Inspector opens the event's exact packet ID.
4. Compare timestamp/channel/access address/rawHex to ensure the event link did not create a duplicate packet.
5. Repeat in Replay Mode for an event whose supporting packet has not yet been played; the application should seek to that evidence and open it.

## Event annotations

1. Bookmark an event.
2. Add an event note and tags.
3. Export the capture JSON.
4. Reopen/import the capture.
5. Confirm the bookmark, note, and tags survive.

## Pass criteria

- Timeline order is chronological and remains session-specific.
- Search/category/level filters do not alter captured evidence.
- Packet-backed events resolve to exact packet IDs/raw evidence.
- Event annotations survive capture persistence and replay.
- Recorded events are visibly replay evidence and never presented as new live events.
