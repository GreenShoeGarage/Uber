# Batch 6 Channel Activity Validation — UberToothGUI v0.6.0+

## Purpose

Validate that the dedicated BLE Channel Activity workspace derives its display from real captured packet evidence and that channel filtering remains synchronized with the Packet workspace.

## Setup

1. Complete the Batch 1 connection regression gate: **CONNECT → PING → DEVICE INFO**.
2. Start **BLE → ADVERTISEMENTS** and allow several advertisers to accumulate.
3. Switch to **Advanced → Channels** without stopping acquisition.

## 40-channel model

1. Confirm all channels `0–39` are present exactly once.
2. Confirm channels `0–36` are labeled **DATA** and `37–39` are labeled **ADVERTISING**.
3. Confirm the displayed frequencies map correctly, including:
   - channel 37 → 2402 MHz
   - channel 38 → 2426 MHz
   - channel 39 → 2480 MHz
4. During advertisement-only monitoring, verify activity normally appears on 37/38/39 rather than being fabricated across data channels.

## Activity statistics

For an active channel, confirm the card updates with:

- packet count;
- recent packet rate;
- average packet RSSI;
- peak packet RSSI;
- last-activity age;
- HOT / RECENT / IDLE state.

The **relative activity** value is based on recently observed packet counts normalized to the busiest observed BLE channel. It is not RF airtime and must not be interpreted as a calibrated occupancy percentage.

## Evidence-linked filtering

1. Click a channel with captured traffic.
2. Confirm it becomes the selected channel.
3. Click **OPEN FILTERED PACKETS**.
4. Confirm the Packet workspace contains only records whose parsed BLE channel matches the selected channel.
5. Open several packets and confirm their raw packet channel byte agrees with the filter.
6. Clear the channel filter and confirm the normal packet set returns.

## Follow/replay regression

1. If a controlled BLE connection is available, run FOLLOW and confirm data-channel activity can populate channels `0–36` when such packets are actually captured.
2. Open a recorded BLE capture in Replay Mode and confirm the Channel workspace rebuilds from replayed raw packet evidence rather than retaining live-session counts.
3. Exit replay and confirm recorded channel counts do not remain displayed as live evidence.

## Pass criteria

- Exactly 40 channels are displayed with correct BLE frequency mapping.
- Counts/RSSI/activity change only when supporting packet evidence is ingested.
- Channel selection uses the shared Packet filter and does not create a parallel packet database.
- Advertisement-only monitoring does not invent data-channel activity.
- Relative activity is clearly labeled as a packet-derived estimate, not airtime.
- Live and Replay channel models reset cleanly between sessions.
