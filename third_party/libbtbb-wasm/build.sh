#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
clang --target=wasm32 -O3 -nostdlib -ffreestanding \
  -Wl,--no-entry -Wl,--export-memory \
  -Wl,--export=btbb_input_ptr -Wl,--export=btbb_gen_syncword -Wl,--export=btbb_scan \
  -Wl,--export=btbb_last_lap -Wl,--export=btbb_last_errors -Wl,--export=btbb_header_present \
  -Wl,--export=btbb_candidate_uap -Wl,--export=btbb_candidate_type \
  -Wl,--export=btbb_candidate_lt_addr -Wl,--export=btbb_candidate_flags -Wl,--export=btbb_candidate_hec \
  "$ROOT/third_party/libbtbb-wasm/kernel.c" -o "$ROOT/assets/libbtbb-kernel.wasm"
echo "Built assets/libbtbb-kernel.wasm"
