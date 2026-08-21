# libbtbb WebAssembly kernel

This directory contains the narrow WebAssembly decoder kernel used by UberToothGUI for passive Bluetooth Classic Basic Rate observation.

The algorithms are derived from the GPL-2.0 `bluetooth_packet.c` implementation in Great Scott Gadgets' `libbtbb` project, particularly access-code generation/search, known-LAP matching, 1/3 Forward Error Correction (FEC) header recovery, whitening removal, and Header Error Check (HEC) reversal.

Upstream project: <https://github.com/greatscottgadgets/libbtbb>

This is **not the complete libbtbb library**. The v1.8.0 kernel is intentionally limited to the evidence needed by the browser Classic foundation:

- generate a Bluetooth access-code syncword from a LAP;
- scan a 400-symbol Ubertooth Basic Rate symbol bank;
- exact-match arbitrary/unknown LAP discovery;
- known-LAP matching with a caller-selected 0–4 bit Hamming-error threshold;
- header-presence screening;
- produce the 64 clock-six/UAP/header candidates used by the browser piconet tracker.

The browser does **not** claim full 27-bit master-clock recovery or adaptive-frequency-hopping reconstruction in this release.

The kernel is isolated behind `src/decoder/libbtbb-worker.js`. `src/decoder/classic-decoder.js` manages the worker handshake and falls back to the compatible JavaScript implementation if the worker or WebAssembly asset cannot initialize.

## Build

With a Clang toolchain that supports the `wasm32` target:

```sh
./build.sh
```

The script writes the runtime artifact to:

```text
../../assets/libbtbb-kernel.wasm
```

The browser-facing ABI is intentionally small and stable. Keep USB framing, evidence storage, user-interface state, and piconet aggregation in JavaScript; add deeper libbtbb functions only behind an explicit, testable decoder boundary.

## License

The derived kernel source is distributed under GPL-2.0. See `LICENSE` in this directory. UberToothGUI's `NOTICE.md` also records the attribution.

Do not add transmit, packet-injection, jamming, or other disruptive radio functionality to this decoder kernel.
