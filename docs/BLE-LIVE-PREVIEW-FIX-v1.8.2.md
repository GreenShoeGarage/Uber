# UberToothGUI v1.8.2 BLE Live Preview Fix Validation

## Reproduction check

1. Connect Ubertooth One or Simulation.
2. Start **BLE Scan** and open **BLE**.
3. Wait until observed devices are changing RSSI/activity.
4. Repeatedly single-click **OPEN DEVICE INVENTORY** at normal speed.
5. Expected: every click navigates to **Devices** on the first click.
6. Return to BLE and single-click several observed-device preview rows while RSSI values are updating.
7. Expected: the selected device opens/updates on the first click; live refresh does not consume the action.

## Regression check

- BLE packet acquisition continues normally.
- RSSI and activity labels continue to update live.
- Device count updates live.
- **OPEN PACKET INSPECTOR** remains responsive.
- Easy/Advanced navigation is unchanged.

## Root cause fixed

Before v1.8.2 the complete Observed Devices panel was replaced with `innerHTML` every 200 ms. A refresh between pointer-down and click could remove the button before the browser dispatched the click. v1.8.2 keeps action buttons mounted and patches keyed device rows in place.
