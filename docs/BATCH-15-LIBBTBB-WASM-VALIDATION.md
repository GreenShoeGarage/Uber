# Batch 15 — libbtbb / WebAssembly Boundary Validation

Release target: **UberToothGUI v1.8.0**

This checklist validates the narrow, worker-isolated libbtbb-derived decoder kernel. It does not claim that the complete libbtbb library has been ported to WebAssembly.

## 1. Packaged artifacts

Confirm these files exist:

- `assets/libbtbb-kernel.wasm`
- `src/decoder/classic-decoder.js`
- `src/decoder/libbtbb-worker.js`
- `third_party/libbtbb-wasm/kernel.c`
- `third_party/libbtbb-wasm/build.sh`
- `third_party/libbtbb-wasm/README.md`
- `third_party/libbtbb-wasm/LICENSE`

The service worker must include every runtime Classic/decoder/WASM asset.

## 2. WASM worker initialization

1. Serve the application over localhost/HTTPS.
2. Use Simulation or connect an Ubertooth.
3. Open Advanced → Classic.
4. Start Classic observation.

Expected:

- decoder status becomes **WASM WORKER** when Worker + WebAssembly initialization succeeds;
- the WASM asset is fetched locally from the application origin;
- decoding occurs without blocking the user-interface thread;
- no external runtime library or cloud request is required.

## 3. JavaScript fallback

Temporarily make the WASM asset unavailable in a test copy or otherwise force worker initialization to fail.

Expected:

- Classic decoding continues with **JAVASCRIPT FALLBACK**;
- the failure reason is surfaced in the Classic decoder panel/diagnostics;
- acquisition remains usable;
- the fallback does not silently claim WebAssembly execution.

Restore the WASM asset after the check.

## 4. Known-fixture parity

The automated fixture uses:

- LAP: `0x9E8B33`
- UAP: `0x4A`
- access-code bit offset: `20`
- clock-six: `17`
- packet type: `DH1 / 2-DH1`

Expected for both JavaScript and WebAssembly paths:

- LAP recovered as `0x9E8B33`;
- access-code bit offset `20`;
- zero access-code errors;
- header-presence screen passes;
- clock-six candidate `17` yields UAP `0x4A`;
- candidate packet type is `DH1 / 2-DH1`.

## 5. Decoder boundary

Confirm the worker/kernel is limited to the intended responsibilities:

- access-code generation/search;
- exact arbitrary-LAP discovery;
- known-LAP Hamming-error matching;
- header-presence test;
- 1/3 Forward Error Correction header recovery;
- whitening removal;
- Header Error Check reversal;
- 64 clock-six/UAP/header candidates.

The following must remain explicitly unavailable/not claimed:

- full libbtbb feature parity;
- 27-bit master-clock recovery;
- adaptive frequency-hopping reconstruction/following;
- Classic payload protocol decoding beyond the implemented header evidence;
- standards-correct Classic PCAP/PCAPNG;
- transmit, injection, or jamming functionality.

## 6. Main-thread behavior

During a busy simulated or physical Classic stream:

- navigate between Classic, Packets, Capture, and Diagnostic;
- scroll tables;
- select different LAP observations;
- stop/start the stream.

Expected: decoding does not visibly freeze the main interface when the WASM worker is active.

## 7. Replay consistency

1. Save a Classic capture.
2. Open it in Replay Mode.
3. Compare LAP/UAP/header candidate results against the live capture.

Expected: replay reconstructs from raw USB evidence and reaches compatible Classic results. Stored parsed fields must not replace the raw-evidence decode path.

## 8. Source and license audit

Review `third_party/libbtbb-wasm/README.md`, `kernel.c`, and `LICENSE`.

Expected:

- libbtbb attribution is explicit;
- GPL-2.0 license text ships with the derived kernel source;
- the build script produces the browser WASM artifact from the included source;
- the repository does not describe the kernel as the complete libbtbb library.

## 9. Rebuild check

With Clang supporting `wasm32`:

```sh
cd third_party/libbtbb-wasm
./build.sh
```

Expected: `assets/libbtbb-kernel.wasm` is recreated successfully and remains a WebAssembly binary.

## 10. Release gate

Batch 15 passes when:

- WASM and JavaScript agree on the known fixture;
- Worker initialization is honest and observable;
- fallback is functional;
- runtime assets work offline after service-worker caching;
- source/license/build artifacts ship in the repository;
- unsupported deeper libbtbb functionality is labeled unavailable rather than approximated.
