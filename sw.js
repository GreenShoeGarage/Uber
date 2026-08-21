const CACHE = 'ubertoothgui-v1.8.2';
const ASSETS = [
  './','./index.html','./styles.css','./manifest.webmanifest',
  './src/app.js','./src/version.js','./src/state.js',
  './src/transport/transport.js','./src/transport/webusb.js','./src/transport/webserial.js','./src/transport/simulation.js',
  './src/ubertooth/commands.js','./src/ubertooth/device.js','./src/ubertooth/packets.js',
  './src/bluetooth/ble.js','./src/bluetooth/advanced.js','./src/bluetooth/devices.js','./src/bluetooth/channel-activity.js','./src/bluetooth/connections.js','./src/bluetooth/classic.js','./src/bluetooth/classic-tracker.js','./src/decoder/classic-decoder.js','./src/decoder/libbtbb-worker.js','./src/spectrum/spectrum.js','./src/capture/recorder.js','./src/capture/export.js','./src/capture/replay.js','./src/capture/pcap.js','./src/capture/zip.js','./src/capture/evidence-package.js','./src/diagnostics/hardware.js',
  './src/storage/db.js','./src/analysis/telemetry.js','./src/survey/survey.js','./src/survey/export.js','./src/ui/views.js','./src/ui/overview.js','./src/ui/survey.js','./src/ui/classic.js','./src/ui/charts.js','./src/utils/binary.js','./src/utils/ringbuffer.js','./assets/libbtbb-kernel.wasm'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { const copy=response.clone(); caches.open(CACHE).then(cache=>cache.put(event.request,copy)); return response; })));
});
