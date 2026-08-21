# Notices

UberToothGUI implements browser-side compatibility with the Great Scott Gadgets Project Ubertooth USB/firmware protocol by reference to the upstream open-source host and firmware sources.

Upstream project: https://github.com/greatscottgadgets/ubertooth

Project Ubertooth is Copyright its respective contributors and is distributed under GPLv2 terms as described by the upstream `COPYING` file.

Ubertooth is a trademark of Great Scott Gadgets. This project is independent and is not affiliated with or endorsed by Great Scott Gadgets.

## libbtbb-derived WebAssembly kernel

`third_party/libbtbb-wasm/kernel.c` contains a narrow Bluetooth Basic Rate decoder kernel algorithmically derived from Great Scott Gadgets' `libbtbb` Bluetooth packet decoding implementation. It is distributed under the GNU General Public License version 2 (GPL-2.0), consistent with the upstream project. Corresponding source, build instructions, and a copy of GPL-2.0 are included in `third_party/libbtbb-wasm/`.

The compiled browser asset is `assets/libbtbb-kernel.wasm`. It implements only access-code generation/search, header-presence screening, Forward Error Correction (FEC) 1/3 recovery, whitening removal, and 64 clock-six/Upper Address Part (UAP)/basic-header candidates. It is not the complete libbtbb library.
