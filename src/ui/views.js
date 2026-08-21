import { formatHexDump, toHex } from '../utils/binary.js';
import { APP_VERSION_LABEL } from '../version.js';
import { commandAudit } from '../ubertooth/commands.js';
import { deviceActivityState, deviceClassifications } from '../bluetooth/devices.js';
import { renderOverview } from './overview.js';
import { renderSurvey } from './survey.js';
import { renderClassic } from './classic.js';

const COMMAND_AUDIT = commandAudit();

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const fmtTime = ms => ms ? new Date(ms).toLocaleTimeString([], {hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'}) : '—';
const fmtDur = ms => { const total=Math.max(0,Number(ms)||0); if(total<60000)return `${(total/1000).toFixed(1)} s`; const m=Math.floor(total/60000); const sec=Math.floor((total%60000)/1000); return `${m}m ${String(sec).padStart(2,'0')}s`; };
const fmtBytes = n => n===null||n===undefined ? 'N/A' : Math.abs(n)<1024 ? `${n} B` : Math.abs(n)<1048576 ? `${(n/1024).toFixed(1)} KiB` : `${(n/1048576).toFixed(1)} MiB`;
const fmtRate = n => Number.isFinite(n) ? `${n.toFixed(1)} pkt/s` : '0 pkt/s';
const fmtHex = (n, width=4) => n === null || n === undefined ? '—' : `0x${Number(n).toString(16).padStart(width,'0').toUpperCase()}`;

export function navItems(mode) {
  if (mode === 'advanced') return [
    ['connect','CONNECT','usb'], ['overview','OVERVIEW','overview'], ['survey','SURVEY','survey'],
    ['spectrum','SPECTRUM','wave'], ['ble','BLE','radio'], ['classic','CLASSIC','classic'],
    ['devices','DEVICES','devices'], ['channels','CHANNELS','channels'], ['packets','PACKETS','list'], ['timeline','TIMELINE','timeline'],
    ['capture','CAPTURE','record'], ['radio','RADIO','tune'], ['diagnostics','DIAGNOSTIC','terminal'], ['settings','SETTINGS','gear']
  ];
  // Easy Mode keeps only the core operate/observe/save workflow in primary navigation.
  // Detailed device and packet views remain reachable contextually from BLE/Overview.
  return [
    ['connect','CONNECT','usb'], ['overview','OVERVIEW','overview'], ['spectrum','SPECTRUM','wave'],
    ['ble','BLE','radio'], ['survey','SURVEY','survey'], ['capture','CAPTURE','record'], ['settings','SETTINGS','gear']
  ];
}

export function renderShellNav(mode, current) {
  const items = navItems(mode);
  if (mode !== 'advanced') return items.map(renderNavItem.bind(null,current)).join('');
  const groups = [
    ['OPERATE',['connect','overview','survey']],
    ['OBSERVE',['spectrum','ble','classic']],
    ['ANALYZE',['devices','channels','packets','timeline']],
    ['RECORD',['capture']],
    ['SYSTEM',['radio','diagnostics','settings']]
  ];
  const byId = new Map(items.map(item => [item[0],item]));
  return groups.map(([label,ids]) => `<div class="nav-group"><div class="nav-group-label">${label}</div>${ids.map(id=>byId.has(id)?renderNavItem(current,byId.get(id)):'').join('')}</div>`).join('');
}

function renderNavItem(current,[id,label,icon]) {
  return `<button type="button" class="nav-item ${current===id?'active':''}" data-view="${id}" title="${label}" ${current===id?'aria-current="page"':''}><span class="nav-icon">${iconGlyph(icon)}</span><span class="nav-label">${label}</span></button>`;
}

function iconGlyph(name) {
  return ({usb:'⇄',overview:'◇',survey:'⌖',wave:'⌁',radio:'◉',classic:'⌁',devices:'◫',channels:'▥',timeline:'↦',list:'≡',record:'●',tune:'⌘',terminal:'>_',gear:'⚙'})[name] ?? '•';
}

export function renderView(name, s) {
  switch (name) {
    case 'overview': return renderOverview(s);
    case 'survey': return renderSurvey(s);
    case 'spectrum': return spectrumView(s);
    case 'ble': return bleView(s);
    case 'classic': return renderClassic(s);
    case 'devices': return devicesView(s);
    case 'channels': return channelsView(s);
    case 'packets': return packetsView(s);
    case 'timeline': return timelineView(s);
    case 'capture': return captureView(s);
    case 'radio': return radioView(s);
    case 'diagnostics': return diagnosticsView(s);
    case 'settings': return settingsView(s);
    default: return connectView(s);
  }
}

function pageHeader(kicker, title, description, actions='') {
  return `<div class="page-header"><div><div class="eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="page-actions">${actions}</div></div>`;
}

function connectView(s) {
  const c = s.capabilities;
  const info = s.deviceInfo;
  const connected = Boolean(s.transport?.connected);
  const canReconnect = !s.simulation && s.capabilities.webusb && (!connected || s.connectionState === 'ERROR');
  const headline = connected ? (s.simulation ? 'Simulation ready' : 'Ubertooth ready') : 'Connect your Ubertooth';
  const guidance = connected
    ? 'Choose an observation mode. Switching modes stops the previous radio stream cleanly before starting the next.'
    : 'Use WebUSB for physical hardware, or Simulation to explore the complete interface without a radio.';
  const actions = connected
    ? `<button class="btn primary" data-view="overview">OPEN OVERVIEW</button><button class="btn" data-action="start-ble">BLE SCAN</button><button class="btn" data-action="start-spectrum">SPECTRUM</button><button class="btn danger quiet" data-action="disconnect">DISCONNECT</button>`
    : `<button class="btn primary" data-action="connect">CONNECT UBERTOOTH</button><button class="btn" data-action="simulation">USE SIMULATION</button>${s.mode==='advanced'?`<button class="btn quiet" data-action="reconnect" ${canReconnect?'':'disabled'}>RECONNECT AUTHORIZED</button>`:''}`;
  return `${pageHeader('START HERE', 'Ubertooth One', 'Connect, observe, inspect, and save radio evidence without a cloud service.', actions)}
    <section class="panel connection-hero">
      <div class="connection-hero-main">
        <div class="device-mark">U1</div>
        <div class="connection-copy"><div class="eyebrow">${s.simulation?'SIMULATED DEVICE':'GREAT SCOTT GADGETS'}</div><h2>${esc(headline)}</h2><p>${esc(guidance)}</p></div>
        <div class="connection-summary"><span>STATE</span><strong class="state-text ${s.connectionState.toLowerCase()}">${esc(s.connectionState)}</strong><span>SOURCE</span><strong>${s.simulation?'SIMULATION':connected?'WEBUSB':'—'}</strong></div>
      </div>
      ${s.lastError ? `<div class="alert error"><strong>CONNECTION ERROR</strong><span>${esc(s.lastError)}</span></div>` : ''}
    </section>
    ${connected ? `<section class="quick-actions"><button data-view="overview"><span>01</span><strong>Overview</strong><em>See the current RF picture</em></button><button data-action="start-ble"><span>02</span><strong>BLE Scan</strong><em>Observe advertisements</em></button><button data-action="start-spectrum"><span>03</span><strong>Spectrum</strong><em>Scan 2.4 GHz activity</em></button><button data-view="capture"><span>04</span><strong>Capture</strong><em>Save or replay evidence</em></button></section>` : `<section class="panel start-guide"><div class="panel-title"><span>QUICK START</span><span>NO CLOUD · NO TELEMETRY</span></div><div class="start-steps"><div><b>1</b><strong>Connect</strong><span>Select Ubertooth One in the browser chooser.</span></div><div><b>2</b><strong>Observe</strong><span>Start BLE, Spectrum, or a Survey.</span></div><div><b>3</b><strong>Inspect</strong><span>Open packets and retain byte-level evidence.</span></div><div><b>4</b><strong>Save</strong><span>Store or export the capture locally.</span></div></div></section>`}
    ${s.mode==='advanced' ? `<div class="instrument-grid cols-2">
      <section class="panel">
        <div class="panel-title"><span>BROWSER / USB READINESS</span><span>${c.secureContext?'READY':'ACTION REQUIRED'}</span></div>
        <div class="status-list">
          ${capRow('WebUSB', c.webusb, c.webusb ? 'Available' : 'Unavailable')}
          ${capRow('Secure context', c.secureContext, c.secureContext ? 'HTTPS / localhost' : 'Required for hardware access')}
          ${capRow('Chromium family', c.chromium, c.chromium ? 'Likely compatible' : 'Compatibility uncertain')}
          ${capRow('WebSerial bridge', c.webserial, c.webserial ? 'Available; not used by standard Ubertooth firmware' : 'Unavailable')}
        </div>
      </section>
      <section class="panel">
        <div class="panel-title"><span>DEVICE IDENTITY</span><span>${info ? esc(info.apiVersionText) : 'NOT QUERIED'}</span></div>
        <div class="kv-grid compact-kv">
          ${kv('USB', info ? `${fmtHex(info.vendorId)}:${Number(info.productId??0).toString(16).padStart(4,'0').toUpperCase()}` : '1D50:6002')}
          ${kv('Serial', info?.serialNumber ?? info?.serialNumberDescriptor ?? '—')}
          ${kv('Board', info?.boardId ?? '—')}
          ${kv('Firmware', info?.firmwareRevision ?? '—')}
          ${kv('API', info?.apiVersionText ?? '—')}
          ${kv('Compatibility', info?.apiCompatibility?.toUpperCase() ?? '—')}
        </div>
      </section>
    </div>
    <details class="panel disclosure">
      <summary><span>Hardware tools</span><em>Ping, refresh metadata, reset, compile information</em></summary>
      <div class="disclosure-body"><div class="button-row"><button class="btn" data-action="ping" ${!connected?'disabled':''}>PING</button><button class="btn" data-action="device-info" ${!connected?'disabled':''}>REFRESH DEVICE INFO</button><button class="btn warning" data-action="firmware-reset" ${!connected?'disabled':''}>RESET FIRMWARE</button><button class="btn" data-view="diagnostics">OPEN DIAGNOSTICS</button></div><div class="compile-info"><span>COMPILE INFO</span><code>${esc(info?.compileInfo ?? 'Connect to query firmware compile information.')}</code></div></div>
    </details>` : ''}`;
}

function spectrumView(s) {
  const connected = Boolean(s.transport?.connected);
  const model = s.spectrum;
  const stats = model.stats ?? {};
  const markers = model.markers.length;
  return `${pageHeader('RF OBSERVATION', 'Spectrum', 'Scan 2.4 GHz activity, inspect peaks, and retain frequency markers.', `<button class="btn primary" data-action="start-spectrum" ${!connected?'disabled':''}>START SCAN</button><button class="btn" data-action="stop-stream" ${!s.streaming?'disabled':''}>STOP</button><button class="btn quiet" data-action="export-spectrum-csv" ${!stats.records?'disabled':''}>EXPORT SPECTRUM CSV</button>`)}
    <div class="metric-grid" data-live="spectrum-metrics">${spectrumMetrics(s)}</div>
    <div class="workspace-toolbar"><div><button class="btn small" data-action="pause-spectrum">${s.spectrumPaused?'RESUME DISPLAY':'PAUSE DISPLAY'}</button><button class="btn small" data-action="clear-peak">CLEAR PEAK</button></div><div class="toolbar-spacer"></div><button class="btn small" data-action="spectrum-zoom-in">ZOOM +</button><button class="btn small" data-action="spectrum-zoom-out">ZOOM −</button><button class="btn small" data-action="spectrum-zoom-reset">RESET VIEW</button><button class="btn small quiet" data-action="clear-spectrum">CLEAR DATA</button></div>
    <details class="panel disclosure spectrum-controls" ${s.mode==='advanced'?'open':''}>
      <summary><span>Spectrum setup</span><em>${s.prefs.spectrumLow}–${s.prefs.spectrumHigh} MHz · averaging ${s.prefs.averaging}% · ${s.prefs.waterfallRows} waterfall rows</em></summary>
      <div class="disclosure-body">
        <div class="control-strip">
          <label>LOW MHz<input id="spectrum-low" type="number" min="2049" max="3072" value="${s.prefs.spectrumLow}"></label>
          <label>HIGH MHz<input id="spectrum-high" type="number" min="2049" max="3072" value="${s.prefs.spectrumHigh}"></label>
          <label>AVG RESPONSE <output data-live="averaging-value">${s.prefs.averaging}%</output><input id="spectrum-avg" data-spectrum-pref="averaging" type="range" min="2" max="100" value="${s.prefs.averaging}"></label>
          <label>PERSISTENCE <output data-live="persistence-value">${s.prefs.spectrumPersistence}%</output><input id="spectrum-persistence" data-spectrum-pref="spectrumPersistence" type="range" min="0" max="100" value="${s.prefs.spectrumPersistence}"></label>
          <label>WATERFALL SPEED<select id="waterfall-speed" data-spectrum-pref="waterfallSpeed"><option value="0.25" ${Number(s.prefs.waterfallSpeed)===0.25?'selected':''}>¼×</option><option value="0.5" ${Number(s.prefs.waterfallSpeed)===0.5?'selected':''}>½×</option><option value="1" ${Number(s.prefs.waterfallSpeed)===1?'selected':''}>1×</option><option value="2" ${Number(s.prefs.waterfallSpeed)===2?'selected':''}>2× visual</option></select></label>
          <label>HISTORY<select id="waterfall-rows" data-spectrum-pref="waterfallRows"><option value="90" ${Number(s.prefs.waterfallRows)===90?'selected':''}>90 rows</option><option value="180" ${Number(s.prefs.waterfallRows)===180?'selected':''}>180 rows</option><option value="360" ${Number(s.prefs.waterfallRows)===360?'selected':''}>360 rows</option><option value="720" ${Number(s.prefs.waterfallRows)===720?'selected':''}>720 rows</option></select></label>
        </div>
        <div class="control-strip secondary">
          <label>RSSI FLOOR<input id="spectrum-rssi-min" data-spectrum-pref="spectrumRssiMin" type="number" min="-140" max="0" value="${s.prefs.spectrumRssiMin}"></label>
          <label>RSSI CEILING<input id="spectrum-rssi-max" data-spectrum-pref="spectrumRssiMax" type="number" min="-120" max="20" value="${s.prefs.spectrumRssiMax}"></label>
          <label class="check"><input id="peak-hold" data-spectrum-pref="peakHold" type="checkbox" ${s.prefs.peakHold?'checked':''}> PEAK HOLD</label>
          <label class="check"><input id="ble-overlay" data-spectrum-pref="spectrumBleOverlay" type="checkbox" ${s.prefs.spectrumBleOverlay?'checked':''}> BLE CHANNELS</label>
          <label class="check"><input id="wifi-overlay" data-spectrum-pref="spectrumWifiOverlay" type="checkbox" ${s.prefs.spectrumWifiOverlay?'checked':''}> WI-FI CENTERS</label>
        </div>
      </div>
    </details>
    <div class="note spectrum-note"><strong>RAW RSSI:</strong> Spectrum values are signed values emitted by Ubertooth <code>SPECAN</code>; they are not presented as calibrated absolute dBm.</div>
    <section class="panel chart-panel primary-instrument"><div class="panel-title"><span>SPECTRUM</span><span data-live="spectrum-view">${formatSpectrumRange(model.viewLow,model.viewHigh)} MHz</span></div><canvas id="spectrum-canvas" class="spectrum-canvas" title="Move for cursor · click to add marker · mouse wheel to zoom · double-click to reset view"></canvas><div class="spectrum-cursor" data-live="spectrum-cursor">MOVE OVER PLOT · CLICK TO MARK · WHEEL TO ZOOM</div><div class="chart-legend"><span>LIVE</span><span>AVERAGE</span><span>PEAK HOLD</span><span class="persistence">PERSISTENCE</span><span class="marker">BLE / WI-FI / MARKERS</span></div></section>
    <section class="panel chart-panel"><div class="panel-title"><span>WATERFALL</span><span>OLDER ↑ · NEWEST ↓ · FREQUENCY →</span></div><canvas id="waterfall-canvas" class="waterfall-canvas"></canvas></section>
    ${markers || s.mode==='advanced' ? `<section class="panel"><div class="panel-title"><span>SPECTRUM MARKERS</span><span>${markers} MARKED</span></div><div class="table-wrap marker-table"><table><thead><tr><th>ID</th><th>FREQUENCY</th><th>CURRENT</th><th>STRONGEST</th><th>FIRST OBSERVED</th><th>LAST OBSERVED</th><th>DURATION</th><th>NOTE</th><th></th></tr></thead><tbody>${spectrumMarkerRows(model)}</tbody></table></div></section>` : ''}`;
}

export function spectrumMetrics(s) {
  const model = s.spectrum;
  const stats = model.stats ?? {};
  const strongest = stats.strongestRssi === null || stats.strongestRssi === undefined ? '—' : `${stats.strongestRssi} @ ${stats.strongestFrequency} MHz`;
  return metric('RAW RECORDS', Number(stats.records ?? 0).toLocaleString()) + metric('SWEEPS', Number(stats.sweeps ?? 0).toLocaleString()) + metric('SWEEP RATE', `${Number(stats.sweepRateHz ?? 0).toFixed(1)} Hz`) + metric('STRONGEST', esc(strongest));
}

function spectrumMarkerRows(model) {
  if (!model.markers.length) return emptyRow(9,'Click anywhere on the spectrum plot to create an evidence marker.');
  return model.markers.map(marker => {
    const duration = marker.firstObserved && marker.lastObserved ? fmtDur(marker.lastObserved-marker.firstObserved) : '—';
    return `<tr><td><code>${esc(marker.id)}</code></td><td>${marker.frequency} MHz</td><td>${marker.currentRssi ?? '—'}</td><td>${marker.strongestRssi ?? '—'}</td><td>${fmtTime(marker.firstObserved)}</td><td>${fmtTime(marker.lastObserved)}</td><td>${duration}</td><td><input class="marker-note-input" data-marker-note="${esc(marker.id)}" value="${esc(marker.note)}" placeholder="Add note"></td><td><button class="btn small danger" data-marker-remove="${esc(marker.id)}">REMOVE</button></td></tr>`;
  }).join('');
}

function formatSpectrumRange(low,high) {
  const f=n=>Math.abs(Number(n)-Math.round(Number(n)))<0.01?String(Math.round(Number(n))):Number(n).toFixed(1);
  return `${f(low)}–${f(high)}`;
}

function bleView(s) {
  const connected = Boolean(s.transport?.connected);
  const mode = String(s.recorder?.mode ?? 'idle');
  const packetPanel = `<section class="panel"><div class="panel-title"><span>BLE PACKET EVIDENCE</span><span>CLICK A ROW TO INSPECT</span></div><div class="filter-strip inline-filter"><input class="search" data-filter="packetSearch" placeholder="Filter address, name, service, type…" value="${esc(s.prefs.packetSearch ?? '')}"><label>PACKETS<select data-pref="packetFilter"><option value="all" ${(s.prefs.packetFilter??'all')==='all'?'selected':''}>All BLE</option><option value="advertising" ${s.prefs.packetFilter==='advertising'?'selected':''}>Advertising AA only</option><option value="data" ${s.prefs.packetFilter==='data'?'selected':''}>Data access addresses</option><option value="bookmarked" ${s.prefs.packetFilter==='bookmarked'?'selected':''}>Bookmarked</option><option value="malformed" ${s.prefs.packetFilter==='malformed'?'selected':''}>Malformed</option></select></label></div><div class="table-wrap ble-table"><table><thead><tr><th>TIME</th><th>CH</th><th>RSSI</th><th>TYPE</th><th>ADDRESS / ACCESS AA</th><th>NAME</th><th>COMPANY</th><th>SERVICES</th><th>LEN</th><th>STATUS</th></tr></thead><tbody data-live="ble-rows">${bleRows(s)}</tbody></table></div></section>`;
  return `${pageHeader('BLUETOOTH LOW ENERGY', 'BLE Monitor', 'Start a passive scan, review nearby advertisers, then drill into packet evidence only when needed.', `<button class="btn primary" data-action="start-ble" ${!connected?'disabled':''}>START BLE SCAN</button>${s.mode==='advanced'?`<button class="btn" data-action="start-ble-follow" ${!connected?'disabled':''}>FOLLOW</button><button class="btn quiet" data-action="start-ble-promisc" ${!connected?'disabled':''}>PROMISCUOUS</button>`:''}<button class="btn" data-action="stop-stream" ${!s.streaming?'disabled':''}>STOP</button><button class="btn quiet" data-view="devices" ${!s.devices.length?'disabled':''}>ALL DEVICES</button>`)}
    <div class="metric-grid" data-live="ble-metrics">${bleMetrics(s)}</div>
    ${bleDevicePreview(s)}
    ${s.mode==='advanced' ? bleAdvancedPanel(s, connected, mode) : ''}
    ${s.mode==='advanced' ? packetPanel : `<details class="panel disclosure"><summary><span>Packet evidence</span><em>${s.recorder.packets.toArray().filter(p=>p.ble).length} BLE packets retained</em></summary><div class="disclosure-body flush">${packetPanel.replace(/^<section class="panel">|<\/section>$/g,'')}</div></details>`}
    ${s.mode==='advanced' ? `<details class="panel disclosure" ${s.selectedConnectionAccessAddress?'open':''}><summary><span>CONNECTION EVIDENCE</span><em>${(s.connections??[]).length} access addresses · observed and inferred kept separate</em></summary><div class="disclosure-body flush"><div class="table-wrap"><table><thead><tr><th>EVIDENCE</th><th>ACCESS ADDRESS</th><th>INITIATOR → ADVERTISER</th><th>INTERVAL</th><th>HOP</th><th>PACKETS</th><th>CHANNELS</th><th>RSSI AVG / PEAK</th><th>STATE</th></tr></thead><tbody>${connectionRows(s)}</tbody></table></div><div class="audit-note">OBSERVED means a CONNECT_IND packet supplied the connection parameters. INFERRED means only traffic using a non-advertising access address was observed.</div></div></details>${connectionDetail(s)}` : ''}
    <div class="note">Random/private Bluetooth addresses are session observations only. The inventory does not infer that changing addresses belong to the same physical device or identify a person.</div>`;
}

function bleDevicePreview(s) {
  const rows = bleDevicePreviewRows(s);
  return `<section class="panel ble-device-panel">
    <div class="panel-title"><span>OBSERVED DEVICES</span><span data-live="ble-device-count">${s.devices.length} TOTAL · STRONGEST FIRST</span></div>
    <div class="ble-device-preview" data-live="ble-device-list">${bleDevicePreviewRowsHtml(rows)}</div>
    <div class="panel-footer-actions"><button class="btn small" data-view="devices" data-live="ble-open-devices" ${!rows.length?'disabled':''}>OPEN DEVICE INVENTORY</button><button class="btn small quiet" data-view="packets" data-live="ble-open-packets" ${!s.recorder.packets.toArray().some(p=>p.ble)?'disabled':''}>OPEN PACKET INSPECTOR</button></div>
  </section>`;
}

export function bleDevicePreviewRows(s) {
  const now = observationNow(s);
  return s.devices.slice().sort((a,b)=>(Number(b.rssi) || -999)-(Number(a.rssi) || -999)).slice(0,8).map(d=>({
    address:d.address,
    name:d.localName||d.address,
    subtitle:d.localName?d.address:(d.addressType??'Observed address'),
    rssi:d.rssi,
    state:deviceActivityState(d,now)
  }));
}

function bleDevicePreviewRowsHtml(rows) {
  if (!rows.length) return `<div class="empty-state compact ble-device-empty"><strong>NO ADVERTISERS YET</strong><span>Start BLE Scan. Observed devices will appear here first; raw packet evidence remains available below.</span></div>`;
  return rows.map(d=>`<button data-device-address="${esc(d.address)}"><div><strong data-role="device-name">${esc(d.name)}</strong><span data-role="device-subtitle">${esc(d.subtitle)}</span></div><div class="device-signal"><b data-role="device-rssi">${d.rssi??'—'} dBm</b><span data-role="device-state">${esc(d.state)}</span></div></button>`).join('');
}

function bleAdvancedPanel(s, connected, activeMode) {
  const cfg = s.lastStreamConfig ?? {};
  const target = esc(s.prefs.bleTargetAddress ?? '');
  const mask = Number(s.prefs.bleTargetMask ?? 48);
  const aa = esc(s.prefs.blePromiscAccessAddress ?? '');
  return `<details class="panel disclosure ble-mode-panel"><summary><span>Advanced passive modes</span><em>Follow targeting · promiscuous access address · firmware CRC setting</em></summary><div class="disclosure-body flush">
    <div class="ble-mode-grid">
      <div class="mode-card"><div class="mode-card-title"><strong>FOLLOW</strong><span class="tag ok">PREFERRED</span></div><p>Observe advertisements and follow a connection where firmware can synchronize. Optional target filtering persists in firmware until cleared.</p><div class="form-grid three"><label>ADV CHANNEL<select data-pref="bleFollowChannel">${[37,38,39].map(ch=>`<option value="${ch}" ${Number(s.prefs.bleFollowChannel)===ch?'selected':''}>${ch}</option>`).join('')}</select></label><label>TARGET ADDRESS<input data-pref="bleTargetAddress" value="${target}" placeholder="AA:BB:CC:DD:EE:FF"></label><label>MASK BITS<input data-pref="bleTargetMask" type="number" min="1" max="48" value="${mask}"></label></div><div class="button-row"><button class="btn small" data-action="apply-ble-target" ${!connected?'disabled':''}>APPLY TARGET</button><button class="btn small" data-action="clear-ble-target" ${!connected?'disabled':''}>CLEAR TARGET</button><button class="btn small warning" data-action="cancel-follow" ${!connected?'disabled':''}>CANCEL FOLLOW</button></div></div>
      <div class="mode-card"><div class="mode-card-title"><strong>PROMISCUOUS</strong><span class="tag warning">EXPERIMENTAL</span></div><p>Firmware-assisted passive monitoring of established traffic. This mode is not equivalent to follow and does not guarantee capture of every connection.</p><div class="form-grid"><label>ACCESS ADDRESS<input data-pref="blePromiscAccessAddress" value="${aa}" placeholder="A1B2C3D4"></label><label class="check"><input type="checkbox" data-pref="bleCrcVerify" ${s.prefs.bleCrcVerify?'checked':''}> CRC VERIFY (FW)</label></div><div class="button-row"><button class="btn small" data-action="apply-ble-access-address" ${!connected?'disabled':''}>APPLY ACCESS AA</button><button class="btn small" data-action="apply-ble-crc" ${!connected?'disabled':''}>APPLY CRC</button></div></div>
    </div>
    <div class="audit-note">FOLLOW and PROMISCUOUS are mutually exclusive acquisition modes. Starting ADVERTISEMENTS explicitly clears a persisted target filter. CRC VERIFY reflects the firmware setting; it is not proof that every retained frame passed CRC. Current stream: ${esc(streamLabel(cfg))}.</div>
  </div></details>`;
}

function connectionRows(s) {
  const rows = s.connections ?? [];
  return rows.map(c => `<tr class="clickable ${s.selectedConnectionAccessAddress===c.accessAddressHex?'selected':''}" data-connection-aa="${esc(c.accessAddressHex)}"><td><span class="tag ${c.evidence==='OBSERVED'?'ok':'warning'}">${esc(c.evidence)}</span></td><td><code>${esc(c.accessAddressHex)}</code></td><td>${c.initiator||c.advertiser?`<code>${esc(c.initiator??'—')}</code> → <code>${esc(c.advertiser??'—')}</code>`:'—'}</td><td>${c.intervalMs===null?'—':`${Number(c.intervalMs).toFixed(2)} ms`}</td><td>${c.hopIncrement??'—'}</td><td>${c.packetCount??0}</td><td>${Array.from(c.channels??[]).sort((a,b)=>a-b).join(', ')||'—'}</td><td>${c.averageRssi===null?'—':`${c.averageRssi.toFixed(1)} / ${c.peakRssi} dBm`}</td><td>${c.endedAt?'<span class="tag danger">ENDED</span>':'<span class="tag ok">ACTIVE</span>'}</td></tr>`).join('') || emptyRow(9,'No connection evidence observed yet.');
}


function connectionDetail(s) {
  const c=(s.connections??[]).find(x=>x.accessAddressHex===s.selectedConnectionAccessAddress);
  if(!c) return '<section class="panel"><div class="empty-state compact"><strong>SELECT A CONNECTION</strong><span>Click an access-address row to inspect observed connection parameters and Link Layer control chronology.</span></div></section>';
  const map=Array.from({length:37},(_,ch)=>`<span class="map-cell ${(c.channelMap??[]).includes(ch)?'on':''}">${ch}</span>`).join('');
  const controls=(c.controlHistory??[]).slice(-16).reverse().map(x=>`<tr class="clickable" data-packet-id="${x.packetId}"><td>${fmtTime(x.time)}</td><td><code>${esc(x.name)}</code></td><td>${x.packetId}</td><td><code>${esc(JSON.stringify(x.decoded??{}))}</code></td></tr>`).join('')||emptyRow(4,'No Link Layer control PDUs retained for this access address.');
  const pending=c.pendingChannelMap?`Observed LL_CHANNEL_MAP_IND → ${esc((c.pendingChannelMap.channelMap??[]).join(', '))}; Instant ${c.pendingChannelMap.instant}. Application at that Instant is not independently confirmed.`:'No pending channel-map update observed.';
  return `<section class="panel advanced-connection"><div class="panel-title"><span>CONNECTION ANALYSIS · ${esc(c.accessAddressHex)}</span><span class="tag ${c.evidence==='OBSERVED'?'ok':'warning'}">${esc(c.evidence)}</span></div><div class="detail-grid"><div class="kv-stack">${kv('Initiator',c.initiator??'—')}${kv('Advertiser',c.advertiser??'—')}${kv('Interval',c.intervalMs===null?'—':`${c.intervalMs} ms`)}${kv('Latency',c.latency??'—')}${kv('Supervision timeout',c.supervisionTimeoutMs===null?'—':`${c.supervisionTimeoutMs} ms`)}</div><div class="kv-stack">${kv('Hop increment',c.hopIncrement??'—')}${kv('Version indication',c.version?`v ${fmtHex(c.version.version,2)} · company ${fmtHex(c.version.companyId,4)}`:'—')}${kv('Length evidence',c.lengthParameters?`${c.lengthParameters.source}: RX ${c.lengthParameters.maxRxOctets??'—'} / TX ${c.lengthParameters.maxTxOctets??'—'} octets`:'—')}${kv('PHY evidence',c.phy?`${c.phy.source}: ${JSON.stringify(c.phy)}`:'—')}${kv('Termination reason',c.terminationReason===null?'—':fmtHex(c.terminationReason,2))}</div></div><h3>CONNECT_IND CHANNEL MAP</h3><div class="ll-channel-map">${map}</div><div class="audit-note">${pending}</div><h3>OBSERVED LINK LAYER CONTROL CHRONOLOGY</h3><div class="table-wrap"><table><thead><tr><th>TIME</th><th>CONTROL PDU</th><th>PACKET</th><th>DECODED EVIDENCE</th></tr></thead><tbody>${controls}</tbody></table></div></section>`;
}

export function bleRows(s) {
  const rows = filteredPackets(s, p => p.ble).slice(-300).reverse();
  return rows.map(p => `<tr class="clickable ${p.annotation?.bookmarked?'bookmarked':''}" data-packet-id="${p.id}"><td>${fmtTime(p.wallTime)}</td><td>${p.ble?.bleChannel ?? '—'}</td><td>${p.rssiMax ?? '—'} dBm</td><td>${esc(p.ble?.pduTypeName ?? p.typeName)}</td><td><code>${esc(p.ble?.address ?? p.ble?.accessAddressHex ?? '—')}</code><div class="subtle">${esc(p.ble?.addressType ?? (p.ble?.isAdvertising?'':'data access address'))}</div></td><td>${esc(p.ble?.localName ?? '—')}</td><td>${p.ble?.manufacturerCompanyId===null||p.ble?.manufacturerCompanyId===undefined?'—':fmtHex(p.ble.manufacturerCompanyId,4)}</td><td>${esc((p.ble?.serviceUuids ?? []).slice(0,3).join(', ') || '—')}</td><td>${p.ble?.length ?? '—'}</td><td>${p.ble?.malformed?'<span class="tag danger">MALFORMED</span>':p.status?`<span class="tag warning">${esc(p.statusFlags.join(','))}</span>`:'OK'}</td></tr>`).join('') || emptyRow(10,'No BLE packets observed yet.');
}

export function bleMetrics(s) {
  const stats = s.recorder.stats();
  const packets = s.recorder.packets.toArray().filter(p => p.ble);
  const adv = packets.filter(p => p.ble?.isAdvertising).length;
  const scanRsp = packets.filter(p => p.ble?.pduTypeName === 'SCAN_RSP').length;
  const malformed = packets.filter(p => p.ble?.malformed).length;
  return metric('BLE PACKETS', packets.length.toLocaleString()) + metric('RATE', fmtRate(stats.packetRate)) + metric('ADVERTISERS', s.devices.length) + metric('SCAN RESPONSES', scanRsp.toLocaleString()) + metric('ADV AA', adv.toLocaleString()) + metric('MALFORMED', malformed.toLocaleString());
}

function channelsView(s) {
  const now = observationNow(s);
  const rows = s.channelActivity.snapshot(now);
  const summary = s.channelActivity.summary(now);
  const selected = rows[Number(s.prefs.selectedBleChannel ?? 37)] ?? rows[37];
  return `${pageHeader('BLUETOOTH CHANNELS', '40-Channel Activity', 'Packet-derived BLE channel activity across data channels 0–36 and advertising channels 37–39. Relative occupancy is packet activity, not calibrated RF airtime.', `<button class="btn" data-action="view-channel-packets">VIEW FILTERED PACKETS</button><button class="btn" data-action="clear-channel-filter" ${String(s.prefs.packetChannelFilter??'all')==='all'?'disabled':''}>CLEAR PACKET FILTER</button>`)}
    <div class="metric-grid">${metric('BLE PACKETS',summary.totalPackets.toLocaleString())}${metric('ACTIVE CHANNELS',summary.activeChannels)}${metric('RECENT CHANNELS',summary.recentChannels)}${metric('BUSIEST',summary.busiestChannel===null?'—':`CH ${summary.busiestChannel}`)}${metric('WINDOW',`${(summary.windowMs/1000).toFixed(0)} s`)}${metric('PACKET FILTER',String(s.prefs.packetChannelFilter??'all')==='all'?'ALL':`CH ${esc(s.prefs.packetChannelFilter)}`)}</div>
    <section class="panel"><div class="panel-title"><span>CHANNEL MAP</span><span>DATA 0–36 · ADVERTISING 37–39</span></div><div class="channel-grid">${rows.map(row=>channelCard(row, selected?.channel===row.channel)).join('')}</div></section>
    <section class="panel"><div class="panel-title"><span>SELECTED CHANNEL</span><span>${selected.kind.toUpperCase()}</span></div><div class="detail-grid"><div class="kv-stack">${kv('Channel',selected.channel)}${kv('Center frequency',`${selected.frequency} MHz`)}${kv('Type',selected.kind)}${kv('State',selected.recentState)}</div><div class="kv-stack">${kv('Packets',selected.packetCount.toLocaleString())}${kv('Recent packets',selected.recentCount)}${kv('Recent rate',fmtRate(selected.recentRate))}${kv('Relative occupancy',`${selected.occupancyEstimate.toFixed(1)}%`)}</div><div class="kv-stack">${kv('Average RSSI',selected.averageRssi===null?'—':`${selected.averageRssi.toFixed(1)} dBm`)}${kv('Peak RSSI',selected.peakRssi===null?'—':`${selected.peakRssi} dBm`)}${kv('First seen',fmtTime(selected.firstSeen))}${kv('Last seen',fmtTime(selected.lastSeen))}</div></div><div class="button-row detail-actions"><button class="btn primary" data-channel-select="${selected.channel}">FILTER PACKETS TO CH ${selected.channel}</button></div></section>
    <div class="note">Relative occupancy = recent packet count on this channel divided by the busiest observed BLE channel during the same rolling window. It is intentionally not presented as spectrum occupancy or airtime.</div>`;
}

function channelCard(row, selected) {
  const intensity = Math.max(0,Math.min(100,row.occupancyEstimate));
  return `<button class="channel-card ${row.kind} ${selected?'selected':''} ${row.recentState.toLowerCase()}" data-channel-select="${row.channel}" title="Filter packet evidence to BLE channel ${row.channel}"><span class="channel-number">${row.channel}</span><span class="channel-kind">${row.kind==='advertising'?'ADV':'DATA'}</span><strong>${row.frequency} MHz</strong><span>${row.packetCount.toLocaleString()} pkt</span><span>${row.averageRssi===null?'—':row.averageRssi.toFixed(1)} dBm avg</span><span>${row.recentRate.toFixed(1)} pkt/s</span><i><b style="width:${intensity.toFixed(1)}%"></b></i></button>`;
}

function timelineView(s) {
  const events = timelineEvents(s);
  const selected = events.find(event=>event.id===s.selectedEventId) ?? null;
  const categories = ['SYSTEM','RF','BLE','CLASSIC','CAPTURE','REPLAY','ANNOTATION'];
  return `${pageHeader('INVESTIGATION', 'Event Timeline', 'Chronological session events with categories, annotations, bookmarks, and direct links to supporting packet evidence.', `<button class="btn" data-action="export-events-csv" ${!events.length?'disabled':''}>EXPORT EVENTS CSV</button><button class="btn" data-action="clear-event-selection" ${!selected?'disabled':''}>CLEAR SELECTION</button>`)}
    <section class="panel filter-panel"><div class="filter-strip"><input class="search" data-filter="eventSearch" placeholder="Search timeline…" value="${esc(s.prefs.eventSearch??'')}"><label>CATEGORY<select data-pref="eventCategoryFilter"><option value="all">All categories</option>${categories.map(x=>`<option value="${x}" ${s.prefs.eventCategoryFilter===x?'selected':''}>${x}</option>`).join('')}</select></label><label>LEVEL<select data-pref="eventLevelFilter"><option value="all">All levels</option>${['info','warning','error'].map(x=>`<option value="${x}" ${s.prefs.eventLevelFilter===x?'selected':''}>${x.toUpperCase()}</option>`).join('')}</select></label></div></section>
    <div class="split-grid timeline-workbench"><section class="panel timeline-list"><div class="panel-title"><span>EVENTS</span><span>${events.length} MATCH</span></div>${eventRows(events, selected?.id)}</section><section class="panel event-inspector">${selected?eventDetail(selected):'<div class="empty-state"><strong>SELECT AN EVENT</strong><span>Inspect its structured detail, annotations, and linked packet evidence.</span></div>'}</section></div>`;
}

function timelineEvents(s) {
  const all = s.replay?.active ? (s.replay.sourceEvents ?? []) : s.recorder.events.toArray();
  const q = String(s.prefs.eventSearch??'').trim().toLowerCase();
  const category = s.prefs.eventCategoryFilter??'all';
  const level = s.prefs.eventLevelFilter??'all';
  return all.filter(event=>{
    const cat=String(event.category??'SYSTEM').toUpperCase();
    if (category!=='all' && cat!==category) return false;
    if (level!=='all' && String(event.level??'info')!==level) return false;
    const hay=`${event.message??''} ${cat} ${event.level??''} ${JSON.stringify(event.detail??{})} ${(event.annotation?.tags??[]).join(' ')} ${event.annotation?.note??''}`.toLowerCase();
    return !q || hay.includes(q);
  }).slice().sort((a,b)=>Number(b.time??0)-Number(a.time??0));
}

function eventRows(events, selectedId) {
  return `<div class="timeline full">${events.map(event=>{ const category=String(event.category??'SYSTEM').toUpperCase(); return `<div class="timeline-row ${esc(event.level??'info')} ${selectedId===event.id?'selected':''}" data-event-id="${esc(event.id)}"><time>${fmtTime(event.time)}</time><span class="event-category">${esc(category)}</span><strong>${esc(event.message)}</strong>${event.annotation?.bookmarked?'★':''}${event.packetId?`<button class="evidence-link" data-packet-id="${event.packetId}">PKT ${event.packetId}</button>`:''}</div>`; }).join('') || '<div class="empty-state compact">No events match the current filters.</div>'}</div>`;
}

function eventDetail(event) {
  const annotation={bookmarked:false,note:'',tags:[],...(event.annotation??{})};
  return `<div class="inspector-title"><div><span>${esc(String(event.category??'SYSTEM').toUpperCase())}</span><strong>${esc(event.message)}</strong></div><div class="row-actions"><button class="btn small ${annotation.bookmarked?'active':''}" data-action="event-bookmark">${annotation.bookmarked?'★ BOOKMARKED':'☆ BOOKMARK'}</button>${event.packetId?`<button class="btn small primary" data-packet-id="${event.packetId}">OPEN PKT ${event.packetId}</button>`:''}</div></div><div class="kv-stack">${kv('Time',event.time?new Date(event.time).toLocaleString():'—')}${kv('Level',String(event.level??'info').toUpperCase())}${kv('Category',String(event.category??'SYSTEM').toUpperCase())}${kv('Packet evidence',event.packetId?`Packet ${event.packetId}`:'None')}</div><h3>Structured detail</h3><pre class="json-dump">${esc(JSON.stringify(event.detail??{},null,2))}</pre><h3>Annotation</h3><div class="annotation-grid"><label>NOTE<textarea data-event-note="">${esc(annotation.note)}</textarea></label><label>TAGS<input data-event-tags="" value="${esc(annotation.tags.join(', '))}" placeholder="reviewed, interference, follow-up"></label></div>`;
}

function devicesView(s) {
  const selected = s.devices.find(d => d.address === s.selectedDeviceAddress) ?? null;
  const pinned = new Set(s.prefs.pinnedDevices ?? []);
  const hidden = new Set(s.prefs.hiddenDevices ?? []);
  const filters = `<section class="panel filter-panel"><div class="filter-strip device-filters"><input class="search" data-filter="deviceSearch" placeholder="Search address, name, service, manufacturer…" value="${esc(s.prefs.deviceSearch ?? '')}"><label>STATE<select data-pref="deviceActivityFilter"><option value="all">All states</option>${['NEW','ACTIVE','QUIET','GONE','RETURNED'].map(x=>`<option value="${x}" ${s.prefs.deviceActivityFilter===x?'selected':''}>${x}</option>`).join('')}</select></label>${s.mode==='advanced'?`<label>CHANNEL<select data-pref="deviceChannelFilter"><option value="all">All channels</option>${[37,38,39].map(x=>`<option value="${x}" ${String(s.prefs.deviceChannelFilter)===String(x)?'selected':''}>${x}</option>`).join('')}</select></label><label>SORT<select data-pref="deviceSort"><option value="lastSeen" ${s.prefs.deviceSort==='lastSeen'?'selected':''}>Last seen</option><option value="strongest" ${s.prefs.deviceSort==='strongest'?'selected':''}>Strongest RSSI</option><option value="packets" ${s.prefs.deviceSort==='packets'?'selected':''}>Packet count</option><option value="name" ${s.prefs.deviceSort==='name'?'selected':''}>Name</option></select></label><label class="check"><input type="checkbox" data-pref="devicePinnedOnly" ${s.prefs.devicePinnedOnly?'checked':''}> PINNED ONLY</label><label class="check"><input type="checkbox" data-pref="deviceShowHidden" ${s.prefs.deviceShowHidden?'checked':''}> SHOW HIDDEN</label>`:''}</div></section>`;
  const table = s.mode==='advanced'
    ? `<table><thead><tr><th></th><th>STATE</th><th>ADDRESS / TYPE</th><th>NAME</th><th>LAST SEEN</th><th>PACKETS</th><th>RSSI / PEAK</th><th>CHANNELS</th><th>MANUFACTURER</th><th>SERVICES</th><th>HISTORY</th><th>ACTIONS</th></tr></thead><tbody>${deviceRows(s)}</tbody></table>`
    : `<table><thead><tr><th>STATE</th><th>DEVICE</th><th>RSSI</th><th>PACKETS</th><th>CHANNELS</th><th>LAST SEEN</th></tr></thead><tbody>${deviceRowsCompact(s)}</tbody></table>`;
  return `${pageHeader('OBSERVED INVENTORY', 'BLE Devices', 'Observed advertisers from this session. Select one to inspect the evidence accumulated for that address.', `<button class="btn quiet" data-action="export-devices-csv" ${!s.devices.length?'disabled':''}>EXPORT CSV</button>`)}
    ${filters}
    <section class="panel"><div class="panel-title"><span>OBSERVED ADVERTISERS</span><span>${s.devices.length} TOTAL${s.mode==='advanced'?` · ${pinned.size} PINNED · ${hidden.size} HIDDEN`:''}</span></div><div class="table-wrap device-table">${table}</div></section>
    ${selected ? deviceDetail(selected, s, pinned, hidden) : '<section class="panel"><div class="empty-state compact"><strong>SELECT AN ADVERTISER</strong><span>Click a row to inspect its accumulated session evidence.</span></div></section>'}
    <div class="note">Activity labels describe when an address was observed in this capture. They are not device identity or presence guarantees.</div>`;
}

function deviceRowsCompact(s) {
  const q = String(s.prefs.deviceSearch ?? '').toLowerCase().trim();
  const now = observationNow(s);
  const stateFilter = s.prefs.deviceActivityFilter ?? 'all';
  const rows = s.devices.filter(d=>{
    const text=`${d.address} ${d.localName??''} ${d.manufacturerData??''} ${Array.from(d.serviceUuids??[]).join(' ')}`.toLowerCase();
    return (!q||text.includes(q)) && (stateFilter==='all'||deviceActivityState(d,now)===stateFilter);
  }).sort((a,b)=>b.lastSeen-a.lastSeen);
  return rows.map(d=>`<tr class="clickable ${s.selectedDeviceAddress===d.address?'selected':''}" data-device-address="${esc(d.address)}"><td><span class="activity ${deviceActivityState(d,now).toLowerCase()}">${deviceActivityState(d,now)}</span></td><td><strong>${esc(d.localName??'Unnamed advertiser')}</strong><div class="subtle"><code>${esc(d.address)}</code> · ${esc(d.addressType??'observed address')}</div></td><td>${d.rssi??'—'} dBm<div class="subtle">peak ${Number.isFinite(d.strongestRssi)?d.strongestRssi:'—'}</div></td><td>${d.packetCount}</td><td>${Array.from(d.channels??[]).sort((a,b)=>a-b).join(', ')||'—'}</td><td>${fmtTime(d.lastSeen)}</td></tr>`).join('')||emptyRow(6,'No advertisers match the current filters.');
}

function deviceRows(s) {
  const q = String(s.prefs.deviceSearch ?? '').toLowerCase().trim();
  const pinned = new Set(s.prefs.pinnedDevices ?? []);
  const hidden = new Set(s.prefs.hiddenDevices ?? []);
  const now = observationNow(s);
  const stateFilter = s.prefs.deviceActivityFilter ?? 'all';
  const channelFilter = s.prefs.deviceChannelFilter ?? 'all';
  const rows = s.devices.filter(d => {
    const text = `${d.address} ${d.localName ?? ''} ${d.manufacturerData ?? ''} ${Array.from(d.serviceUuids ?? []).join(' ')}`.toLowerCase();
    if (q && !text.includes(q)) return false;
    if (!s.prefs.deviceShowHidden && hidden.has(d.address)) return false;
    if (s.prefs.devicePinnedOnly && !pinned.has(d.address)) return false;
    if (stateFilter !== 'all' && deviceActivityState(d, now) !== stateFilter) return false;
    if (channelFilter !== 'all' && !d.channels?.has(Number(channelFilter))) return false;
    return true;
  });
  const sort = s.prefs.deviceSort ?? 'lastSeen';
  rows.sort((a,b) => sort==='strongest' ? (b.strongestRssi-a.strongestRssi) : sort==='packets' ? b.packetCount-a.packetCount : sort==='name' ? String(a.localName??a.address).localeCompare(String(b.localName??b.address)) : b.lastSeen-a.lastSeen);
  return rows.map(d => {
    const state = deviceActivityState(d, now);
    const isPinned = pinned.has(d.address), isHidden = hidden.has(d.address);
    return `<tr class="clickable ${s.selectedDeviceAddress===d.address?'selected':''} ${isHidden?'muted-row':''}" data-device-address="${esc(d.address)}"><td>${isPinned?'★':'☆'}</td><td><span class="activity ${state.toLowerCase()}">${state}</span></td><td><code>${esc(d.address)}</code><div class="subtle">${esc(d.addressType ?? '')}</div></td><td>${esc(d.localName ?? '—')}${d.scanResponseSeen?'<div class="subtle">SCAN_RSP seen</div>':''}</td><td>${fmtTime(d.lastSeen)}</td><td>${d.packetCount}</td><td>${d.rssi ?? '—'} / ${Number.isFinite(d.strongestRssi)?d.strongestRssi:'—'} dBm</td><td>${Array.from(d.channels ?? []).sort((a,b)=>a-b).join(', ')}</td><td>${d.manufacturerCompanyId===null||d.manufacturerCompanyId===undefined?'—':fmtHex(d.manufacturerCompanyId,4)}</td><td>${esc(Array.from(d.serviceUuids ?? []).slice(0,3).join(', ') || '—')}</td><td>${sparkline(d.rssiHistory)}</td><td><div class="row-actions"><button class="btn tiny" data-device-action="pin" data-address="${esc(d.address)}">${isPinned?'UNPIN':'PIN'}</button><button class="btn tiny" data-device-action="inspect" data-address="${esc(d.address)}">INSPECT</button><button class="btn tiny" data-device-action="packets" data-address="${esc(d.address)}">PACKETS</button><button class="btn tiny" data-device-action="${isHidden?'unhide':'hide'}" data-address="${esc(d.address)}">${isHidden?'UNHIDE':'HIDE'}</button>${s.mode==='advanced'?`<button class="btn tiny" data-device-action="target" data-address="${esc(d.address)}" ${!s.transport?.connected?'disabled':''}>TARGET</button>`:''}</div></td></tr>`;
  }).join('') || emptyRow(12,'No advertisers match the current filters.');
}

function deviceDetail(d, s, pinned, hidden) {
  const now = observationNow(s);
  return `<section class="panel device-detail"><div class="panel-title"><span>ADVERTISER EVIDENCE</span><span class="activity ${deviceActivityState(d,now).toLowerCase()}">${deviceActivityState(d,now)}</span></div><div class="detail-grid"><div class="kv-stack">${kv('Address',d.address)}${kv('Address interpretation',d.addressType ?? '—')}${kv('Local name',d.localName ?? '—')}${kv('First seen',fmtTime(d.firstSeen))}${kv('Last seen',fmtTime(d.lastSeen))}${kv('Return count',d.returnCount ?? 0)}</div><div class="kv-stack">${kv('Current RSSI',d.rssi===null?'—':`${d.rssi} dBm`)}${kv('Average RSSI',d.averageRssi===null?'—':`${d.averageRssi.toFixed(1)} dBm`)}${kv('Peak RSSI',Number.isFinite(d.strongestRssi)?`${d.strongestRssi} dBm`:'—')}${kv('Advertised TX power',d.txPower===null||d.txPower===undefined?'—':`${d.txPower} dBm`)}${kv('Channels',Array.from(d.channels??[]).sort((a,b)=>a-b).join(', ')||'—')}${kv('PDU types',Array.from(d.pduTypes??[]).join(', ')||'—')}${kv('Radio profile',deviceClassifications(d).join(' · ')||'Observed advertising only')}${kv('Extended SIDs',Array.from(d.extendedSids??[]).join(', ')||'—')}</div><div class="kv-stack">${kv('Manufacturer company ID',d.manufacturerCompanyId===null||d.manufacturerCompanyId===undefined?'—':fmtHex(d.manufacturerCompanyId,4))}${kv('Manufacturer data',d.manufacturerData??'—')}${kv('Service UUIDs',Array.from(d.serviceUuids??[]).join(', ')||'—')}${kv('Flags',(d.flagNames??[]).join(', ')||'—')}${kv('Appearance',d.appearance??'—')}${kv('Scan response',d.scanResponseSeen?'Observed':'Not observed')}</div></div><div class="button-row detail-actions"><button class="btn" data-device-action="pin" data-address="${esc(d.address)}">${pinned.has(d.address)?'UNPIN':'PIN DEVICE'}</button><button class="btn" data-device-action="packets" data-address="${esc(d.address)}">SHOW PACKETS</button>${s.mode==='advanced'?`<button class="btn" data-device-action="target" data-address="${esc(d.address)}" ${!s.transport?.connected?'disabled':''}>SET PASSIVE TARGET</button>`:''}<button class="btn" data-device-action="${hidden.has(d.address)?'unhide':'hide'}" data-address="${esc(d.address)}">${hidden.has(d.address)?'UNHIDE':'HIDE'}</button></div></section>`;
}

function packetsView(s) {
  const p = s.selectedPacket;
  return `${pageHeader('EVIDENCE', 'Packet Inspector', 'Decoded values, byte provenance, hexadecimal evidence, raw Ubertooth structure, navigation, bookmarks, tags, notes, and channel-linked filtering.', `<input class="search" data-filter="packetSearch" placeholder="Filter packets" value="${esc(s.prefs.packetSearch ?? '')}"><select data-pref="packetFilter" class="header-select"><option value="all" ${(s.prefs.packetFilter??'all')==='all'?'selected':''}>ALL</option><option value="advertising" ${s.prefs.packetFilter==='advertising'?'selected':''}>ADVERTISING</option><option value="bookmarked" ${s.prefs.packetFilter==='bookmarked'?'selected':''}>BOOKMARKED</option><option value="malformed" ${s.prefs.packetFilter==='malformed'?'selected':''}>MALFORMED</option><option value="data" ${s.prefs.packetFilter==='data'?'selected':''}>DATA AA</option><option value="classic" ${s.prefs.packetFilter==='classic'?'selected':''}>CLASSIC BR</option></select><select data-pref="packetChannelFilter" class="header-select"><option value="all">ALL CH</option>${Array.from({length:40},(_,ch)=>`<option value="${ch}" ${String(s.prefs.packetChannelFilter)===String(ch)?'selected':''}>CH ${ch}</option>`).join('')}</select>${String(s.prefs.packetChannelFilter??'all')!=='all'?'<button class="btn small" data-action="clear-channel-filter">CLEAR CH</button>':''}`)}
    <div class="split-grid packet-workbench">
      <section class="panel packet-list"><div class="table-wrap"><table><thead><tr><th>#</th><th></th><th>TIME</th><th>TYPE</th><th>CH</th><th>RSSI</th><th>ADDRESS</th></tr></thead><tbody>${packetRows(s)}</tbody></table></div></section>
      <section class="panel inspector">${p ? packetInspector(p, s.inspectorHighlight) : '<div class="empty-state"><strong>SELECT A PACKET</strong><span>Choose a packet to inspect decoded fields and exact source bytes.</span></div>'}</section>
    </div>`;
}

function packetRows(s) {
  return filteredPackets(s).slice(-500).reverse().map(p => `<tr class="clickable ${s.selectedPacket?.id===p.id?'selected':''} ${p.annotation?.bookmarked?'bookmarked':''}" data-packet-id="${p.id}"><td>${p.id}</td><td>${p.annotation?.bookmarked?'★':''}</td><td>${fmtTime(p.wallTime)}</td><td>${esc(p.classic?.selectedHeader?.typeName ?? p.ble?.pduTypeName ?? p.typeName)}</td><td>${p.classic?.channel ?? p.ble?.bleChannel ?? '—'}</td><td>${p.rssiMax ?? '—'}</td><td><code>${esc(p.classic?.lapHex ?? p.ble?.address ?? p.ble?.accessAddressHex ?? '—')}</code></td></tr>`).join('') || emptyRow(7,'No packets match the current filters.');
}

function packetInspector(p, highlight) {
  const ble = p.ble;
  const classic = p.classic;
  const annotation = { bookmarked:false, note:'', tags:[], ...(p.annotation??{}) };
  return `<div class="inspector-title"><div><span>PACKET ${p.id}</span><strong>${esc(classic?.selectedHeader?.typeName ?? ble?.pduTypeName ?? p.typeName)}</strong></div><div class="row-actions"><button class="btn small" data-action="packet-prev">← PREV</button><button class="btn small" data-action="packet-next">NEXT →</button><button class="btn small ${annotation.bookmarked?'active':''}" data-action="packet-bookmark">${annotation.bookmarked?'★ BOOKMARKED':'☆ BOOKMARK'}</button><button class="btn small" data-action="copy-hex">COPY HEX</button></div></div>
    <div class="packet-nav-secondary"><button class="btn tiny" data-action="packet-prev-device" ${!ble?.address&&!classic?.lapHex?'disabled':''}>← ${classic?'SAME LAP':'SAME DEVICE'}</button><button class="btn tiny" data-action="packet-prev-channel" ${(ble?.bleChannel===null||ble?.bleChannel===undefined)&&(classic?.channel===null||classic?.channel===undefined)?'disabled':''}>← SAME CHANNEL</button><button class="btn tiny" data-action="packet-prev-malformed">← MALFORMED</button>${highlight?`<span class="byte-selection">BYTES ${highlight.start}–${highlight.end-1}: ${esc(highlight.label)}</span><button class="btn tiny" data-action="clear-byte-highlight">CLEAR HIGHLIGHT</button>`:'<span class="byte-selection">SELECT A DECODED FIELD TO TRACE ITS BYTES</span>'}</div>
    <div class="tabs"><span class="active">DECODED</span><span>HEX EVIDENCE</span><span>RAW STRUCTURE</span><span>ANNOTATION</span></div>
    <div class="inspector-sections">
      <div><h3>Decoded</h3><div class="kv-stack">${kv('Frequency', `${p.frequency} MHz`)}${classic?`${kv('Classic channel',classic.channel)}${kv('LAP',classic.lapHex)}${kv('Access-code errors',classic.acErrors)}${kv('Header present',classic.headerPresent?'YES':'NO')}${kv('UAP candidate',classic.selectedHeader?.uapHex??'—')}${kv('Clock-six candidate',classic.selectedHeader?.clock6??'—')}${kv('LT_ADDR',classic.selectedHeader?.ltAddr??'—')}${kv('Classic packet type',classic.selectedHeader?.typeName??'—')}${kv('Decoder engine',classic.engine??'—')}`:kv('BLE channel', ble?.bleChannel ?? '—')}${kv('RSSI', p.rssiMax===null?'—':`${p.rssiMax} dBm`)}${kv('Access address', ble?.accessAddressHex ?? '—')}${kv('PDU type', ble?.pduTypeName ?? '—')}${kv('Advertiser', ble?.address ?? '—')}${kv('Address interpretation',ble?.addressType??'—')}${kv('Local name', ble?.localName ?? '—')}${kv('Flags', ble?.flagNames?.join(', ') || '—')}${kv('Advertised TX power',ble?.txPower===null||ble?.txPower===undefined?'—':`${ble.txPower} dBm`)}${kv('Services', ble?.serviceUuids?.join(', ') || '—')}${kv('Manufacturer', ble?.manufacturerCompanyId===null||ble?.manufacturerCompanyId===undefined?'—':fmtHex(ble.manufacturerCompanyId,4))}${kv('Advertising profile',(ble?.advertisingProperties??[]).join(' · ')||'—')}${kv('Extended ADI',ble?.extendedAdvertising?.fields?.adi?`SID ${ble.extendedAdvertising.fields.adi.sid} · DID ${ble.extendedAdvertising.fields.adi.did}`:'—')}${kv('AuxPtr',ble?.extendedAdvertising?.fields?.auxPtr?`CH ${ble.extendedAdvertising.fields.auxPtr.channelIndex} · ${ble.extendedAdvertising.fields.auxPtr.offsetUs} µs · ${ble.extendedAdvertising.fields.auxPtr.phy}`:'—')}${kv('LL control',ble?.llControl?.name??'—')}${kv('LL control decoded',ble?.llControl?JSON.stringify(ble.llControl.decoded):'—')}${kv('CRC bytes',ble?.crcHex??'—')}</div>${classic?classicProvenanceRows(classic):provenanceRows(ble)}</div>
      <div><h3>Hex Evidence</h3>${hexEvidenceGrid(p.raw, highlight)}</div>
      <div><h3>Raw Ubertooth USB Structure</h3><div class="structure-grid">${structureField('0','pkt_type',p.type,0,1)}${structureField('1','status',fmtHex(p.status,2),1,2)}${structureField('2','channel',p.channelOffset,2,3)}${structureField('3','clkn_high',p.clknHigh,3,4)}${structureField('4–7','clk100ns',p.clock100ns,4,8)}${structureField('8','rssi_max',p.rssiMaxRaw,8,9)}${structureField('9','rssi_min',p.rssiMinRaw,9,10)}${structureField('10','rssi_avg',p.rssiAverageRaw,10,11)}${structureField('11','rssi_count',p.rssiCount,11,12)}${structureField('12–13','reserved',toHex(p.reserved),12,14)}${structureField('14–63','data[50]',toHex(p.payload),14,64)}</div></div>
      <div><h3>Annotation</h3><div class="annotation-grid"><label>NOTE<textarea data-packet-note="">${esc(annotation.note)}</textarea></label><label>TAGS<input data-packet-tags="" value="${esc(annotation.tags.join(', '))}" placeholder="interesting, baseline, follow-up"></label><div class="annotation-state"><span>${annotation.bookmarked?'★ BOOKMARKED':'☆ NOT BOOKMARKED'}</span><span>Annotations are stored in JSON capture evidence.</span></div></div></div>
    </div>`;
}

function provenanceRows(ble) {
  if (!ble?.provenance?.length) return '<div class="empty-state compact"><strong>NO BLE PROVENANCE</strong><span>The raw USB structure is still preserved below.</span></div>';
  return `<div class="provenance"><h3>Decoded → Source Bytes</h3>${ble.provenance.map(field=>`<button class="provenance-row" data-byte-start="${field.start}" data-byte-end="${field.end}" data-byte-label="${esc(field.label)}"><span>${field.start}–${field.end-1}</span><strong>${esc(field.label)}</strong><code>${esc(field.value)}</code></button>`).join('')}</div>`;
}

function classicProvenanceRows(classic) {
  if (!classic?.provenance) return '<div class="empty-state compact"><strong>NO CLASSIC PROVENANCE</strong><span>The raw USB structure is still preserved below.</span></div>';
  const fields=[classic.provenance.accessCode, classic.header].filter(Boolean);
  return `<div class="provenance"><h3>Decoded → Source Bytes</h3>${fields.map(field=>`<button class="provenance-row" data-byte-start="${field.start}" data-byte-end="${field.end}" data-byte-label="${esc(field.label)}"><span>${field.start}–${field.end-1}</span><strong>${esc(field.label)}</strong><code>${field===classic.provenance.accessCode?esc(classic.lapHex):esc(classic.selectedHeader?.typeName??'header symbols')}</code></button>`).join('')}</div>`;
}

function hexEvidenceGrid(raw, highlight) {
  const lines=[];
  for(let offset=0;offset<raw.length;offset+=16){
    const chunk=raw.slice(offset,offset+16);
    const hexBytes=Array.from(chunk,(byte,i)=>{const idx=offset+i;const on=highlight&&idx>=highlight.start&&idx<highlight.end;return `<span class="hex-byte ${on?'highlight':''}" title="byte ${idx}">${byte.toString(16).padStart(2,'0').toUpperCase()}</span>`}).join(' ');
    const ascii=Array.from(chunk,b=>b>=32&&b<=126?String.fromCharCode(b):'.').join('');
    lines.push(`<div class="hex-line"><span class="hex-offset">${offset.toString(16).padStart(4,'0').toUpperCase()}</span><code>${hexBytes}</code><span class="hex-ascii">|${esc(ascii)}|</span></div>`);
  }
  return `<div class="hex-evidence">${lines.join('')}</div>`;
}

function captureView(s) {
  const st = s.recorder.stats();
  const replay = s.replay ?? {active:false,index:-1,playing:false,speed:1,document:null};
  const sourcePackets = replay.document?.packets?.length ?? st.retainedPackets;
  const sourceStats = replay.active ? (replay.document?.stats ?? {}) : st;
  const progress = replay.active && sourcePackets ? Math.max(0, ((replay.index+1)/sourcePackets)*100) : 0;
  const name = replay.document?.name ?? st.sessionName ?? '';
  const sourceEvents = replay.active ? (replay.sourceEvents??[]) : s.recorder.events.toArray();
  const sourcePacketObjects = replay.active ? (replay.document?.packets ?? []) : s.recorder.packets.toArray();
  const bleExportable = sourcePacketObjects.some(p => p.ble && !p.ble.malformed && !p.ble.truncated);
  const primaryMetrics = metric('DURATION',fmtDur(replay.active?replay.range.durationMs:st.durationMs))+metric('PACKETS',sourcePackets.toLocaleString())+metric('BYTES',Number(replay.active?(sourceStats.bytesReceived??0):st.bytesReceived).toLocaleString())+metric('MODE',esc(String(replay.active?(sourceStats.mode??'replay'):st.mode).toUpperCase()));
  const healthMetrics = metric('RING DROPS',replay.active?(sourceStats.droppedPackets??0):st.droppedPackets)+metric('MALFORMED',replay.active?(sourceStats.malformedPackets??0):st.malformedPackets)+metric('USB ERRORS',replay.active?(sourceStats.usbErrors??0):st.usbErrors)+metric(replay.active?'PLAYED':'RETAINED',st.retainedPackets.toLocaleString());
  return `${pageHeader(replay.active?'REPLAY MODE':'LOCAL CAPTURE', replay.active?'Capture Replay':'Capture Session', replay.active?'Replay retained USB evidence through the same analysis pipeline used for live data.':'Save, reopen, replay, and export bounded radio evidence locally.', `<button class="btn primary" data-action="save-capture" ${!sourcePackets?'disabled':''}>SAVE SESSION</button><button class="btn" data-action="import-capture">IMPORT JSON</button><input id="capture-file" type="file" accept="application/json,.json" hidden><button class="btn" data-action="export-evidence-package" ${!sourcePackets?'disabled':''}>EVIDENCE ZIP</button>`)}
    <section class="panel capture-identity"><label>SESSION NAME<input id="capture-name" value="${esc(name)}" placeholder="Capture name"></label><div class="capture-source"><span>SOURCE</span><strong>${replay.active?'RECORDED DATA':s.streaming?'LIVE DATA':esc(st.source?.toUpperCase?.()??'LIVE')}</strong></div></section>
    <div class="metric-grid">${primaryMetrics}${s.mode==='advanced'?healthMetrics:''}</div>
    ${replay.active?`<section class="panel replay-panel"><div class="panel-title"><span>REPLAY</span><span>${replay.index+1} / ${sourcePackets}</span></div><div class="replay-controls"><button class="btn" data-action="replay-restart">|←</button><button class="btn" data-action="replay-back">← STEP</button><button class="btn primary" data-action="replay-play" ${replay.playing?'disabled':''}>PLAY</button><button class="btn" data-action="replay-pause" ${!replay.playing?'disabled':''}>PAUSE</button><button class="btn" data-action="replay-step">STEP →</button><label>SPEED<select id="replay-speed">${[0.25,0.5,1,2,4,8,16].map(x=>`<option value="${x}" ${Number(replay.speed)===x?'selected':''}>${x}×</option>`).join('')}</select></label><button class="btn quiet" data-action="replay-exit">EXIT REPLAY</button></div><div class="replay-progress"><div style="width:${progress.toFixed(2)}%"></div></div><input id="replay-scrub" class="replay-scrub" type="range" min="-1" max="${Math.max(-1,sourcePackets-1)}" value="${replay.index}" ${!sourcePackets?'disabled':''}></section>`:''}
    <div class="instrument-grid cols-2"><section class="panel"><div class="panel-title"><span>EXPORT</span><span>LOCAL ONLY</span></div><div class="export-primary"><div><strong>Evidence Package</strong><span>Recommended: one ZIP with capture JSON, tables, raw USB records, diagnostics, and eligible BLE capture files.</span></div><button class="btn primary" data-action="export-evidence-package" ${!sourcePackets?'disabled':''}>EXPORT ZIP</button></div><details class="inline-disclosure"><summary>Individual formats</summary><div class="button-row export-buttons"><button class="btn" data-action="export-json" ${!sourcePackets?'disabled':''}>JSON</button><button class="btn" data-action="export-csv" ${!sourcePackets?'disabled':''}>PACKETS CSV</button><button class="btn" data-action="export-raw" ${!sourcePackets?'disabled':''}>RAW USB64</button><button class="btn" data-action="export-pcapng" ${!bleExportable?'disabled':''}>EXPORT PCAPNG</button><button class="btn" data-action="export-pcap" ${!bleExportable?'disabled':''}>EXPORT PCAP</button><button class="btn" data-action="export-events-csv" ${!sourceEvents.length?'disabled':''}>EVENTS CSV</button></div></details>${s.mode==='advanced'?`<div class="audit-note">BLE PCAP/PCAPNG use DLT 256 / Link Layer with RF pseudoheader and include only complete BLE Link Layer packets with a known BLE channel. Spectrum, Bluetooth Classic, and malformed/truncated BLE records remain in JSON/CSV/raw evidence; Classic PCAP is not fabricated.</div>`:''}</section>
    <section class="panel"><div class="panel-title"><span>RECENT EVENTS</span><span>${sourceEvents.length} TOTAL</span></div><div class="timeline">${timelineRows(s)}</div>${s.mode==='advanced'?'<div class="panel-footer-actions"><button class="btn small" data-view="timeline">OPEN TIMELINE</button></div>':''}</section></div>
    <section class="panel"><div class="panel-title"><span>LOCAL CAPTURE LIBRARY</span><span>${s.captureLibrary?.length ?? 0} SAVED</span></div><div class="library-toolbar"><input class="search" data-capture-search placeholder="Search saved captures" value="${esc(s.captureSearch ?? '')}"><span>IndexedDB · this browser only</span></div><div class="table-wrap capture-library"><table><thead><tr><th>NAME</th><th>SAVED</th><th>MODE</th><th>PACKETS</th><th>DURATION</th><th>APP VERSION</th><th>ACTIONS</th></tr></thead><tbody>${captureLibraryRows(s)}</tbody></table></div></section>`;
}

function captureLibraryRows(s) {
  const q=String(s.captureSearch??'').toLowerCase().trim();
  const rows=(s.captureLibrary??[]).filter(row=>!q||`${row.name??''} ${row.session?.mode??''} ${row.application?.version??''}`.toLowerCase().includes(q));
  return rows.map(row=>`<tr class="${s.replay?.document?.id===row.id?'selected':''}"><td><strong>${esc(row.name??row.session?.name??row.id)}</strong><div class="subtle">${esc(row.id)}</div></td><td>${row.savedAt?new Date(row.savedAt).toLocaleString():'—'}</td><td>${esc(row.session?.mode??row.stats?.mode??'—')}</td><td>${Number(row.packets?.length??row.stats?.retainedPackets??0).toLocaleString()}</td><td>${fmtDur(row.stats?.durationMs??0)}</td><td>${esc(row.application?.version??'—')}</td><td><div class="row-actions"><button class="btn tiny primary" data-capture-action="open" data-capture-id="${esc(row.id)}">OPEN</button><button class="btn tiny" data-capture-action="rename" data-capture-id="${esc(row.id)}">RENAME</button><button class="btn tiny" data-capture-action="duplicate" data-capture-id="${esc(row.id)}">DUPLICATE</button><button class="btn tiny danger" data-capture-action="delete" data-capture-id="${esc(row.id)}">DELETE</button></div></td></tr>`).join('')||emptyRow(7,'No saved local captures match this search.');
}

function timelineRows(s) {
  const events = s.replay?.active ? (s.replay.sourceEvents ?? []) : s.recorder.events.toArray();
  return events.slice(-150).reverse().map(e => `<div class="timeline-row ${e.level}"><time>${fmtTime(e.time)}</time><span>${esc(e.message)}</span>${e.packetId?`<button class="evidence-link" data-packet-id="${e.packetId}">PKT ${e.packetId}</button>`:''}</div>`).join('') || '<div class="empty-state compact">No session events yet.</div>';
}

function observationNow(s) {
  if (s.replay?.active && s.replay.index >= 0) {
    const record=s.replay.document?.packets?.[s.replay.index];
    return Number(record?.wallTime??record?.receivedAt??Date.now());
  }
  return Date.now();
}

function radioView(s) {
  const r = s.radioState ?? {};
  const connected = Boolean(s.transport?.connected);
  return `${pageHeader('ADVANCED', 'Radio Controls', 'Read-back controls query actual device state after changes.', `<button class="btn" data-action="refresh-radio" ${!connected?'disabled':''}>REFRESH STATE</button>`)}
    <div class="instrument-grid cols-2">
      <section class="panel"><div class="panel-title"><span>RADIO</span><span>${esc(r.modulationName ?? 'NOT QUERIED')}</span></div>
        <div class="form-grid"><label>Frequency / channel MHz<input id="radio-channel" type="number" min="2049" max="3072" value="${r.channel ?? 2441}"></label><label>Modulation<select id="radio-mod"><option value="0" ${r.modulation===0?'selected':''}>Bluetooth Basic Rate</option><option value="1" ${r.modulation===1?'selected':''}>Bluetooth Low Energy</option><option value="2" ${r.modulation===2?'selected':''}>802.11 FHSS</option><option value="3" ${r.modulation===3?'selected':''}>None</option></select></label><label>Squelch<input id="radio-squelch" type="number" min="-128" max="127" value="${r.squelch ?? -40}"></label></div>
        <div class="button-row"><button class="btn primary" data-action="apply-radio" ${!connected?'disabled':''}>APPLY & READ BACK</button></div>
      </section>
      <section class="panel"><div class="panel-title"><span>FRONT END / VERIFICATION</span><span>ACTUAL STATE</span></div><div class="toggle-stack">
        ${toggle('PA enable','radio-paen',r.paen)}${toggle('High gain mode','radio-hgm',r.hgm)}${toggle('CRC verification','radio-crc',r.crcVerify)}${toggle('User LED','radio-userled',r.userLed)}${toggle('RX LED','radio-rxled',r.rxLed)}${toggle('TX LED','radio-txled',r.txLed)}
      </div><button class="btn" data-action="apply-toggles" ${!connected?'disabled':''}>APPLY & READ BACK</button></section>
    </div>
    <section class="panel"><div class="panel-title"><span>BLUETOOTH LOW ENERGY TARGET</span><span>PASSIVE FOLLOW FILTER</span></div><div class="form-grid three"><label>Target address<input id="target-mac" placeholder="AA:BB:CC:DD:EE:FF"></label><label>Mask bits<input id="target-mask" type="number" min="0" max="48" value="48"></label><label>Access address<input id="access-address" value="${r.accessAddress===null||r.accessAddress===undefined?'0x8E89BED6':fmtHex(r.accessAddress,8)}"></label></div><div class="button-row"><button class="btn" data-action="set-target">SET TARGET</button><button class="btn" data-action="set-aa">SET ACCESS ADDRESS</button><button class="btn" data-action="cancel-follow">CANCEL FOLLOW</button></div></section>
    <div class="note">Transmit test, packet injection, jamming, firmware flashing, and other disruptive/device-risk commands are intentionally not exposed in this interface.</div>`;
}

function diagnosticsView(s) {
  const d = s.transportDescription ?? {};
  const connected = Boolean(s.transport?.connected);
  const validation = s.validation;
  const soak = s.soak ?? {status:'IDLE'};
  const actions = `<button class="btn primary" data-action="validate-hardware" ${!connected||s.streaming?'disabled':''}>VALIDATE HARDWARE</button>
    <button class="btn" data-action="reconnect" ${s.simulation||(!(!connected || s.connectionState === 'ERROR'))?'disabled':''}>RECONNECT AUTHORIZED</button>
    <button class="btn" data-action="retry-stream" ${!connected||!s.lastStreamConfig||s.streaming?'disabled':''}>RETRY LAST STREAM</button>
    <button class="btn" data-action="export-diagnostics">EXPORT DIAGNOSTICS</button>`;
  return `${pageHeader('ADVANCED', 'USB Diagnostics & Validation', 'Descriptor evidence, audited command mappings, soak testing, recovery counters, and browser exceptions.', actions)}
    ${s.simulation ? '<div class="note">SIMULATION can exercise the validation and soak-test workflow, but a simulation PASS is not physical Ubertooth One validation.</div>' : ''}
    <div class="instrument-grid cols-2">
      <section class="panel"><div class="panel-title"><span>ACTIVE USB PATH</span><span>${esc(d.kind ?? 'NONE')}</span></div><div class="kv-stack">${kv('Configuration',d.configurationValue ?? '—')}${kv('Interface',d.interfaceNumber ?? '—')}${kv('Interface claimed',d.interfaceClaimed===undefined?'—':d.interfaceClaimed?'YES':'NO')}${kv('Alternate setting',d.alternateSetting ?? '—')}${kv('Bulk IN endpoint',d.inEndpoint===undefined||d.inEndpoint===null?'—':`0x8${d.inEndpoint}`)}${kv('Bulk IN packet size',d.inPacketSize ?? '—')}${kv('Bulk OUT endpoint',d.outEndpoint===undefined||d.outEndpoint===null?'—':`0x0${d.outEndpoint}`)}${kv('Bulk OUT packet size',d.outPacketSize ?? '—')}</div></section>
      <section class="panel"><div class="panel-title"><span>RECOVERY TELEMETRY</span><span>SESSION</span></div><div class="kv-stack">${kv('Bytes received',(s.transport?.bytesReceived ?? 0).toLocaleString())}${kv('Transfer errors',s.transport?.transferErrors ?? 0)}${kv('Stalls observed',s.transport?.stalls ?? 0)}${kv('Stall recoveries',s.transport?.stallRecoveries ?? 0)}${kv('Disconnects',s.transport?.disconnects ?? 0)}${kv('Reconnects',s.transport?.reconnects ?? 0)}${kv('Last stream',streamLabel(s.lastStreamConfig))}${kv('Last error',s.transport?.lastError?.message ?? '—')}</div></section>
    </div>
    <section class="panel">
      <div class="panel-title"><span>PHYSICAL HARDWARE VALIDATION</span><span class="validation-state ${String(validation?.status ?? 'idle').toLowerCase()}">${esc(validation?.status ?? 'NOT RUN')}</span></div>
      ${validationRows(validation)}
    </section>
    <section class="panel">
      <div class="panel-title"><span>CONTINUOUS RECEIVE SOAK TEST</span><span class="validation-state ${String(soak.status ?? 'idle').toLowerCase()}">${esc(soak.status ?? 'IDLE')}</span></div>
      <div class="soak-controls"><label>MODE<select id="soak-mode" ${soak.active?'disabled':''}><option value="ble" ${soak.mode==='ble'?'selected':''}>BLE advertisements (POLL)</option><option value="spectrum" ${soak.mode==='spectrum'?'selected':''}>Spectrum (bulk IN)</option><option value="classic" ${soak.mode==='classic'?'selected':''}>Bluetooth Classic (RX_SYMBOLS bulk IN)</option></select></label><label>DURATION<select id="soak-duration" ${soak.active?'disabled':''}><option value="30">30 s smoke test</option><option value="300" ${soak.targetDurationMs===300000?'selected':''}>5 min</option><option value="1800" ${soak.targetDurationMs===1800000?'selected':''}>30 min</option><option value="3600" ${soak.targetDurationMs===3600000?'selected':''}>60 min</option></select></label><div class="button-row compact"><button class="btn primary" data-action="start-soak" ${!connected||soak.active?'disabled':''}>START SOAK</button><button class="btn danger" data-action="stop-soak" ${!soak.active?'disabled':''}>STOP SOAK</button></div></div>
      ${soakPanel(soak, s.recorder.stats())}
    </section>
    <section class="panel"><div class="panel-title"><span>MOST RECENT TRANSFER</span><span>RAW</span></div><pre class="json-dump">${esc(JSON.stringify({control:s.transport?.lastControl,transfer:s.transport?.lastTransfer},null,2))}</pre></section>
    <section class="panel"><div class="panel-title"><span>DESCRIPTORS</span><span>INSPECTED, NOT HARD-CODED</span></div><pre class="json-dump tall">${esc(JSON.stringify(d.configurations ?? [],null,2))}</pre></section>
    <section class="panel"><div class="panel-title"><span>COMMAND CONTRACT AUDIT</span><span>${COMMAND_AUDIT.filter(x=>x.audited).length}/${COMMAND_AUDIT.length} AUDITED</span></div><div class="table-wrap audit-table"><table><thead><tr><th>COMMAND</th><th>ID</th><th>DIR</th><th>wValue</th><th>wIndex</th><th>PAYLOAD</th><th>RETURN</th><th>HOST WINDOW</th><th>ATTEMPTS</th><th>SOURCE</th></tr></thead><tbody>${commandAuditRows()}</tbody></table></div><div class="audit-note">Timeout values mirror upstream libusb control-transfer windows. WebUSB does not expose an equivalent cancellable per-transfer timeout parameter; elapsed time and browser exceptions are preserved in diagnostics.</div></section>
    <section class="panel"><div class="panel-title"><span>ROLLING DIAGNOSTIC LOG</span><span>${s.logs.length} ENTRIES</span></div><div class="diagnostic-log">${logRows(s)}</div></section>`;
}

function validationRows(validation) {
  if (!validation) return '<div class="empty-state compact"><strong>NOT YET VALIDATED</strong><span>Connect physical hardware and run VALIDATE HARDWARE.</span></div>';
  if (validation.status === 'RUNNING') return '<div class="empty-state compact"><strong>VALIDATION RUNNING</strong><span>Checking descriptors, three PING transfers, metadata, STOP, and safe radio readbacks.</span></div>';
  return `<div class="validation-list">${validation.rows.map(row=>`<div class="validation-row ${row.status.toLowerCase()}"><span class="validation-badge">${esc(row.status)}</span><strong>${esc(row.name)}</strong><span>${esc(row.detail)}</span><time>${row.durationMs ? `${row.durationMs.toFixed(1)} ms` : '—'}</time></div>`).join('')}</div>`;
}

function soakPanel(soak, liveStats) {
  if (!soak.startedAt) return '<div class="empty-state compact"><strong>NO SOAK RESULT</strong><span>Use the 30-second smoke test first, then 5/30/60-minute hardware runs.</span></div>';
  const r = soak.result;
  const elapsed = soak.active ? Date.now()-soak.startedAt : soak.durationMs;
  const target = soak.targetDurationMs || 1;
  const progress = Math.max(0,Math.min(100,(elapsed/target)*100));
  return `<div class="soak-progress"><div style="width:${progress.toFixed(1)}%"></div></div><div class="metric-grid embedded">${metric('ELAPSED',fmtDur(elapsed))}${metric('TARGET',fmtDur(soak.targetDurationMs))}${metric('PACKETS',(soak.active?liveStats.packetsReceived:r?.packetsReceived??0).toLocaleString())}${metric('MAX RATE',fmtRate(soak.maxPacketRate??0))}${metric('USB ERRORS',soak.active?liveStats.usbErrors:r?.usbErrors??0)}${metric('STALL RECOVERY',r?.stallRecoveries??0)}${metric('RING DROPS',soak.active?liveStats.droppedPackets:r?.ringDrops??0)}${metric('HEAP Δ',fmtBytes(r?.memoryGrowthBytes))}</div>${soak.reason?`<div class="audit-note">${esc(soak.reason)}</div>`:''}`;
}

function commandAuditRows() {
  return COMMAND_AUDIT.map(row => `<tr><td><code>${esc(row.name)}</code></td><td>${row.id}</td><td>${esc(row.direction.toUpperCase())}</td><td>${esc(row.valueUse)}</td><td>${esc(row.indexUse)}</td><td>${esc(row.payload)}</td><td>${row.returnLength} B</td><td>${row.timeout} ms</td><td>${row.attempts}</td><td><span class="tag ${row.audited?'ok':'warning'}">${row.audited?'AUDITED':'CHECK'}</span><div class="subtle">${esc(row.source)}</div>${row.note?`<div class="subtle">${esc(row.note)}</div>`:''}</td></tr>`).join('');
}

function streamLabel(cfg) {
  if (!cfg) return '—';
  if (cfg.type === 'spectrum') return `Spectrum ${cfg.low}–${cfg.high} MHz`;
  if (cfg.type === 'classic') return `Classic ${cfg.channel==='sweep'?'sweep':`CH ${cfg.channel}`} · ${cfg.knownLap?`LAP ${cfg.knownLap}`:'discover'}`;
  return cfg.promiscuous ? 'BLE promiscuous' : cfg.follow ? 'BLE follow' : 'BLE advertisements';
}

function logRows(s) {
  return s.logs.slice(-300).reverse().map(l=>`<div class="log-row ${l.level}"><time>${esc(new Date(l.time).toLocaleTimeString([], {hour12:false}))}</time><span>${esc(l.message)}</span></div>`).join('') || '<div class="empty-state compact">No diagnostics yet.</div>';
}

function settingsView(s) {
  return `${pageHeader('LOCAL-FIRST', 'Settings', 'Appearance and storage preferences stay in this browser. Easy/Advanced is always available from the header.', '')}
    <div class="instrument-grid cols-2"><section class="panel"><div class="panel-title"><span>APPEARANCE</span><span>LOCAL PREFERENCE</span></div><div class="toggle-stack">${toggle('Light theme','theme-light',s.prefs.theme==='light')}${toggle('Collapsed navigation','nav-collapsed',s.prefs.navCollapsed)}</div><div class="panel-footer-actions"><button class="btn primary" data-action="apply-settings">APPLY APPEARANCE</button></div></section>
    <section class="panel"><div class="panel-title"><span>PRIVACY</span><span>LOCAL ONLY</span></div><div class="status-list">${capRow('Cloud upload',false,'Never automatic')}${capRow('Analytics',false,'None')}${capRow('Telemetry',false,'None')}${capRow('Capture / survey storage',true,'Browser memory / IndexedDB when saved')}</div></section></div>
    <section class="panel danger-zone"><div><strong>CLEAR LOCAL STATE</strong><span>Remove saved preferences, local captures, and RF survey projects from this browser.</span></div><button class="btn danger" data-action="clear-local">CLEAR LOCAL DATA</button></section>
    <details class="panel disclosure"><summary><span>About UberToothGUI</span><em>${APP_VERSION_LABEL}</em></summary><div class="disclosure-body"><p>UberToothGUI is a browser workbench for Great Scott Gadgets Ubertooth One. It is not affiliated with or endorsed by Great Scott Gadgets. Protocol behavior is implemented from the upstream open-source Ubertooth host/firmware interface.</p></div></details>`;
}

function filteredPackets(s, predicate = () => true) {
  const q = String(s.prefs.packetSearch ?? '').toLowerCase().trim();
  const mode = s.prefs.packetFilter ?? 'all';
  return s.recorder.packets.toArray().filter(p => {
    if (!predicate(p)) return false;
    if (mode === 'advertising' && !p.ble?.isAdvertising) return false;
    if (mode === 'data' && (!p.ble || p.ble.isAdvertising)) return false;
    if (mode === 'classic' && !p.classic) return false;
    if (mode === 'bookmarked' && !p.annotation?.bookmarked) return false;
    if (mode === 'malformed' && !p.ble?.malformed) return false;
    const channelFilter = String(s.prefs.packetChannelFilter ?? 'all');
    if (channelFilter !== 'all' && !p.classic && Number(p.ble?.bleChannel) !== Number(channelFilter)) return false;
    const haystack = `${p.typeName} ${p.frequency} ${p.ble?.address ?? ''} ${p.ble?.pduTypeName ?? ''} ${p.ble?.accessAddressHex ?? ''} ${p.ble?.localName ?? ''} ${p.ble?.manufacturerData ?? ''} ${p.classic?.lapHex ?? ''} ${p.classic?.selectedHeader?.uapHex ?? ''} ${p.classic?.selectedHeader?.typeName ?? ''} ${(p.ble?.serviceUuids ?? []).join(' ')} ${(p.annotation?.tags ?? []).join(' ')} ${p.annotation?.note ?? ''}`.toLowerCase();
    return !q || haystack.includes(q);
  });
}

function capRow(label, ok, text) { return `<div class="status-row"><span class="lamp ${ok?'ok':'off'}"></span><strong>${esc(label)}</strong><span>${esc(text)}</span></div>`; }
function kv(label,value) { return `<div class="kv"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`; }
function metric(label,value) { return `<div class="metric"><span>${esc(label)}</span><strong>${value}</strong></div>`; }
function emptyRow(cols,text) { return `<tr><td colspan="${cols}"><div class="empty-state compact">${esc(text)}</div></td></tr>`; }
function structureField(bytes,name,value,start=null,end=null) { const attrs=start===null?'':` data-byte-start="${start}" data-byte-end="${end}" data-byte-label="${esc(name)}"`; return `<div class="structure-field ${start===null?'':'clickable-field'}"${attrs}><span class="byte-range">${bytes}</span><strong>${esc(name)}</strong><code>${esc(value)}</code></div>`; }
function toggle(label,id,checked) { return `<label class="switch-row"><span>${esc(label)}</span><input id="${id}" type="checkbox" ${checked?'checked':''}><i></i></label>`; }
function sparkline(values=[]) { if (!values.length) return '—'; const w=120,h=28,min=-120,max=-20; const pts=values.slice(-32).map((v,i)=>`${(i/Math.max(1,Math.min(31,values.length-1))*w).toFixed(1)},${(h-(Math.max(min,Math.min(max,v))-min)/(max-min)*h).toFixed(1)}`).join(' '); return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" /></svg>`; }
