import { deviceActivityState } from '../bluetooth/devices.js';
import { bleChannelToFrequency } from '../bluetooth/ble.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const fmtTime = ms => ms ? new Date(ms).toLocaleTimeString([], { hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '—';
const fmtRate = n => Number.isFinite(n) ? `${Number(n).toFixed(1)} pkt/s` : '0.0 pkt/s';
const metric = (label,value) => `<div class="metric"><span>${esc(label)}</span><strong>${value}</strong></div>`;
const kv = (label,value) => `<div class="kv"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;

export function renderOverview(s) {
  const now = observationNow(s);
  const stats = s.recorder.stats();
  const connected = Boolean(s.transport?.connected);
  const telemetry = s.telemetry?.snapshot({ limit:Number(s.prefs.overviewRateWindow ?? 120) }) ?? [];
  const latestTelemetry = telemetry.at(-1) ?? null;
  const channelRows = overviewChannelRows(s, now);
  const selectedChannel = String(s.prefs.packetChannelFilter ?? 'all') === 'all' ? null : Number(s.prefs.selectedBleChannel ?? s.prefs.packetChannelFilter);
  const selectedDevice = s.devices.find(device => device.address === s.selectedDeviceAddress) ?? null;
  const strongestDevice = s.devices.slice().filter(device=>Number.isFinite(device.rssi)).sort((a,b)=>b.rssi-a.rssi)[0] ?? null;
  const focusDevice = selectedDevice ?? strongestDevice;
  const selectedConnection = (s.connections ?? []).find(connection => connection.accessAddressHex === s.selectedConnectionAccessAddress) ?? null;
  const activeChannels = channelRows.filter(row=>row.count>0).length;
  const currentMode = s.replay?.active ? `REPLAY ${s.replay.playing?'PLAYING':'PAUSED'}` : s.streaming ? String(stats.mode ?? 'stream').toUpperCase() : connected ? 'CONNECTED / IDLE' : 'DISCONNECTED';
  const spectrumRows = s.spectrum.snapshotRows();
  const focusEvents = overviewEvents(s, { device:selectedDevice, channel:selectedChannel, connection:selectedConnection }).slice(0,8);
  const hasFocus = Boolean(selectedDevice || selectedConnection || selectedChannel !== null || s.selectedEventId);
  const actions = connected
    ? `<button class="btn primary" data-action="start-ble">BLE SCAN</button><button class="btn" data-action="start-spectrum">SPECTRUM</button><button class="btn" data-action="stop-stream" ${!s.streaming?'disabled':''}>STOP</button>`
    : `<button class="btn primary" data-view="connect">CONNECT</button>`;
  const primaryMetrics = metric('ACQUISITION',esc(currentMode))+metric('PACKET RATE',fmtRate(latestTelemetry?.packetRate ?? stats.packetRate))+metric('ADVERTISERS',s.devices.length.toLocaleString())+metric('ACTIVE CHANNELS',activeChannels);
  const advancedMetrics = metric('CONNECTIONS',(s.connections??[]).length)+metric('USB / MALFORMED',`${stats.usbErrors} / ${stats.malformedPackets}`);
  const advancedPanels = s.mode==='advanced' ? `<section class="panel overview-rate"><div class="panel-title"><span>PACKET-RATE HISTORY</span><span>1 SECOND BUCKETS · BOUNDED</span></div>${rateHistory(telemetry)}</section><section class="panel overview-connections"><div class="panel-title"><span>CONNECTION EVIDENCE</span><span>OBSERVED ≠ INFERRED</span></div>${connectionMap(s, selectedConnection, selectedDevice)}</section>` : '';

  return `<div class="page-header"><div><div class="eyebrow">CURRENT RF PICTURE</div><h1>RF Overview</h1><p>Start an observation, see the strongest evidence first, and drill down only when something deserves inspection.</p></div><div class="page-actions">${actions}</div></div>
    <div class="metric-grid overview-metrics">${primaryMetrics}${s.mode==='advanced'?advancedMetrics:''}</div>
    ${hasFocus?focusRibbon(s, selectedDevice, selectedChannel, selectedConnection):''}
    <div class="overview-layout">
      <section class="panel overview-spectrum"><div class="panel-title"><span>RF SPECTRUM</span><span>${s.streaming && stats.mode==='spectrum'?'CURRENT ACQUISITION':'RETAINED / LAST SPECTRUM'}</span></div>${miniSpectrum(s.spectrum, spectrumRows, selectedChannel, selectedDevice)}</section>
      <section class="panel overview-channels"><div class="panel-title"><span>BLE CHANNELS</span><span>CLICK TO FILTER</span></div>${channelHeatmapControls(s)}${channelHeatmap(s, channelRows, selectedChannel, selectedDevice)}</section>
      <section class="panel overview-device"><div class="panel-title"><span>DEVICE RSSI HISTORY</span><span>${focusDevice ? esc(focusDevice.localName || focusDevice.address) : 'NO ADVERTISER'}</span></div>${deviceRssiPanel(focusDevice, s, now)}</section>
      ${advancedPanels}
      <section class="panel overview-events"><div class="panel-title"><span>${hasFocus?'FOCUS-LINKED EVENTS':'RECENT EVENTS'}</span><span>${focusEvents.length} SHOWN</span></div>${overviewEventList(focusEvents, s.selectedEventId)}</section>
    </div>
    ${s.mode==='advanced'?'<div class="note">Coordinated selection never creates new evidence: device, channel, connection, timeline, and packet views remain different projections of the same retained USB records. Random/private Bluetooth addresses remain session observations, not identity claims.</div>':''}`;
}

function focusRibbon(s, device, channel, connection) {
  const event = selectedEvent(s);
  return `<section class="panel overview-focus"><div class="focus-label">FOCUS</div>${focusChip('DEVICE',device?.localName || device?.address)}${focusChip('CHANNEL',channel===null?null:`BLE ${channel}`)}${focusChip('CONNECTION',connection?.accessAddressHex)}${focusChip('EVENT',event?.message)}<div class="focus-actions">${device?'<button class="btn tiny" data-action="overview-device-packets">DEVICE PACKETS</button>':''}${channel!==null?'<button class="btn tiny" data-action="overview-channel-packets">CHANNEL PACKETS</button>':''}${connection?'<button class="btn tiny" data-action="overview-connection-packets">CONNECTION PACKETS</button>':''}</div></section>`;
}

function focusChip(label, value) {
  return `<div class="focus-chip ${value?'active':''}"><span>${esc(label)}</span><strong>${esc(value ?? '—')}</strong></div>`;
}

function channelHeatmapControls(s) {
  const metricValue = s.prefs.overviewChannelMetric ?? 'rate';
  const windowValue = String(s.prefs.overviewChannelWindow ?? '10000');
  return `<div class="overview-controls"><label>METRIC<select data-pref="overviewChannelMetric">${[['rate','Packet rate'],['count','Packet count'],['avgRssi','Average RSSI'],['peakRssi','Peak RSSI'],['advertisers','Advertisers']].map(([value,label])=>`<option value="${value}" ${metricValue===value?'selected':''}>${label}</option>`).join('')}</select></label><label>WINDOW<select data-pref="overviewChannelWindow">${[['1000','1 second'],['10000','10 seconds'],['60000','1 minute'],['capture','Capture lifetime']].map(([value,label])=>`<option value="${value}" ${windowValue===value?'selected':''}>${label}</option>`).join('')}</select></label><span class="overview-legend">DATA 0–36 · ADV 37–39</span></div>`;
}

function overviewChannelRows(s, now) {
  const windowSetting = String(s.prefs.overviewChannelWindow ?? '10000');
  const windowMs = windowSetting === 'capture' ? null : Math.max(1000, Number(windowSetting) || 10000);
  const cutoff = windowMs === null ? -Infinity : now - windowMs;
  const rows = Array.from({length:40},(_,channel)=>({ channel, count:0, rssiSum:0, rssiCount:0, avgRssi:null, peakRssi:null, advertisers:new Set(), rate:0, value:0 }));
  const packets = s.recorder.packets.toArray();
  for (const packet of packets) {
    const ch = packet?.ble?.bleChannel;
    const time = Number(packet?.wallTime ?? 0);
    if (!Number.isInteger(ch) || ch < 0 || ch > 39 || time < cutoff) continue;
    const row = rows[ch];
    row.count += 1;
    if (Number.isFinite(packet.rssiMax)) { row.rssiSum += packet.rssiMax; row.rssiCount += 1; row.peakRssi = row.peakRssi===null?packet.rssiMax:Math.max(row.peakRssi,packet.rssiMax); }
    if (packet.ble.address) row.advertisers.add(packet.ble.address);
  }
  const elapsedSeconds = windowMs === null ? Math.max(1, (Number(s.recorder.durationMs)||1000)/1000) : windowMs/1000;
  for (const row of rows) {
    row.avgRssi = row.rssiCount ? row.rssiSum/row.rssiCount : null;
    row.rate = row.count/elapsedSeconds;
  }
  const metricName = s.prefs.overviewChannelMetric ?? 'rate';
  for (const row of rows) row.value = metricName==='count'?row.count:metricName==='avgRssi'?row.avgRssi:metricName==='peakRssi'?row.peakRssi:metricName==='advertisers'?row.advertisers.size:row.rate;
  const finite = rows.map(row=>row.value).filter(Number.isFinite);
  const max = Math.max(0,...finite);
  for (const row of rows) {
    if ((metricName==='avgRssi'||metricName==='peakRssi') && Number.isFinite(row.value)) row.intensity=Math.max(0,Math.min(100,((row.value+110)/90)*100));
    else row.intensity=max>0&&Number.isFinite(row.value)?(row.value/max)*100:0;
  }
  return rows;
}

function channelHeatmap(s, rows, selectedChannel, selectedDevice) {
  const metricName=s.prefs.overviewChannelMetric??'rate';
  return `<div class="overview-channel-grid">${rows.map(row=>{
    const related=selectedDevice?.channels?.has?.(row.channel);
    const selected=selectedChannel===row.channel;
    return `<button class="overview-channel ${row.channel>=37?'advertising':'data'} ${selected?'selected':''} ${related?'related':''}" data-channel-select="${row.channel}" style="--activity:${row.intensity.toFixed(1)}%;--heat:${(row.intensity*0.18).toFixed(1)}%" title="BLE channel ${row.channel}"><strong>${row.channel}</strong><span>${channelMetricLabel(row,metricName)}</span><i><b style="width:${row.intensity.toFixed(1)}%"></b></i></button>`;
  }).join('')}</div>`;
}

function channelMetricLabel(row, metricName) {
  if (metricName==='count') return `${row.count} pkt`;
  if (metricName==='avgRssi') return row.avgRssi===null?'—':`${row.avgRssi.toFixed(0)} dBm`;
  if (metricName==='peakRssi') return row.peakRssi===null?'—':`${row.peakRssi.toFixed(0)} dBm`;
  if (metricName==='advertisers') return `${row.advertisers.size} dev`;
  return `${row.rate.toFixed(1)}/s`;
}

function miniSpectrum(model, rows, selectedChannel = null, selectedDevice = null) {
  if (!rows.length) return '<div class="overview-empty"><strong>NO SPECTRUM EVIDENCE</strong><span>Start Spectrum to populate the retained RF snapshot.</span></div>';
  const w=720,h=190,p={l:42,r:12,t:14,b:28};
  const low=model.low, high=model.high, span=Math.max(1,high-low);
  const y=v=>p.t+(h-p.t-p.b)*(1-(Math.max(model.rssiMin,Math.min(model.rssiMax,v))-model.rssiMin)/Math.max(1,model.rssiMax-model.rssiMin));
  const x=f=>p.l+((f-low)/span)*(w-p.l-p.r);
  const path=key=>rows.filter(row=>Number.isFinite(row[key])).map((row,i)=>`${i?'L':'M'}${x(row.frequencyMHz).toFixed(1)} ${y(row[key]).toFixed(1)}`).join(' ');
  const strongest=model.stats?.strongestFrequency===null?'—':`${model.stats.strongestFrequency} MHz / ${model.stats.strongestRssi} raw`;
  const relatedChannels=selectedDevice ? Array.from(selectedDevice.channels??[]) : [];
  const relatedLines=relatedChannels.map(channel=>{ const frequency=bleChannelToFrequency(Number(channel)); if(frequency<low||frequency>high)return ''; const xx=x(frequency); return `<line class="chart-related-channel" x1="${xx.toFixed(1)}" y1="${p.t}" x2="${xx.toFixed(1)}" y2="${h-p.b}"><title>Focused device observed on BLE channel ${channel}</title></line>`; }).join('');
  let focusLine=''; if(selectedChannel!==null){const frequency=bleChannelToFrequency(Number(selectedChannel)); if(frequency>=low&&frequency<=high){const xx=x(frequency);focusLine=`<line class="chart-focus-channel" x1="${xx.toFixed(1)}" y1="${p.t}" x2="${xx.toFixed(1)}" y2="${h-p.b}"><title>Focused BLE channel ${selectedChannel} · ${frequency} MHz</title></line>`;}}
  return `<div class="overview-chart-wrap"><svg class="overview-chart spectrum-mini" viewBox="0 0 ${w} ${h}" role="img" aria-label="Retained spectrum traces"><line class="chart-axis" x1="${p.l}" y1="${h-p.b}" x2="${w-p.r}" y2="${h-p.b}"/><line class="chart-axis" x1="${p.l}" y1="${p.t}" x2="${p.l}" y2="${h-p.b}"/><path class="chart-line peak" d="${path('peakRssi')}"/><path class="chart-line average" d="${path('averageRssi')}"/><path class="chart-line live" d="${path('latestRssi')}"/>${relatedLines}${focusLine}<text x="${p.l}" y="${h-8}">${low} MHz</text><text x="${w-p.r-55}" y="${h-8}">${high} MHz</text><text x="4" y="${p.t+8}">${model.rssiMax}</text><text x="4" y="${h-p.b}">${model.rssiMin}</text></svg><div class="chart-caption"><span><b class="legend live"></b>LIVE</span><span><b class="legend average"></b>AVG</span><span><b class="legend peak"></b>PEAK</span>${selectedChannel!==null?`<span><b class="legend focus"></b>FOCUS CH ${selectedChannel}</span>`:''}<span>RAW RSSI · strongest ${esc(strongest)}</span></div></div>`;
}

function rateHistory(samples) {
  if (!samples.length) return '<div class="overview-empty"><strong>NO RATE HISTORY</strong><span>Start or replay a capture to build bounded 1-second rate history.</span></div>';
  const w=720,h=190,p={l:42,r:12,t:14,b:28};
  const max=Math.max(1,...samples.map(row=>Math.max(row.packetRate,row.bleRate)));
  const x=i=>p.l+(i/Math.max(1,samples.length-1))*(w-p.l-p.r);
  const y=v=>p.t+(h-p.t-p.b)*(1-Math.min(max,v)/max);
  const path=key=>samples.map((row,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(row[key]??0).toFixed(1)}`).join(' ');
  const errorDots=samples.map((row,i)=>row.usbErrors||row.ringDrops?`<circle class="chart-error" cx="${x(i).toFixed(1)}" cy="${y(row.packetRate).toFixed(1)}" r="3"/>`:'').join('');
  const last=samples.at(-1);
  return `<div class="overview-chart-wrap"><svg class="overview-chart rate-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Packet rate history"><line class="chart-axis" x1="${p.l}" y1="${h-p.b}" x2="${w-p.r}" y2="${h-p.b}"/><line class="chart-axis" x1="${p.l}" y1="${p.t}" x2="${p.l}" y2="${h-p.b}"/><path class="chart-line packets" d="${path('packetRate')}"/><path class="chart-line ble" d="${path('bleRate')}"/>${errorDots}<text x="4" y="${p.t+8}">${max.toFixed(0)}/s</text><text x="4" y="${h-p.b}">0</text><text x="${p.l}" y="${h-8}">${fmtTime(samples[0].time)}</text><text x="${w-p.r-62}" y="${h-8}">${fmtTime(last.time)}</text></svg><div class="chart-caption"><span><b class="legend packets"></b>USB PACKETS</span><span><b class="legend ble"></b>BLE PACKETS</span><span><b class="legend error"></b>ERROR / DROP</span><span>latest ${last.packetRate.toFixed(1)} pkt/s</span></div></div>`;
}

function deviceRssiPanel(device, s, now) {
  if (!device) return '<div class="overview-empty"><strong>NO ADVERTISER EVIDENCE</strong><span>Run BLE Scan or replay a BLE capture.</span></div>';
  const samples=device.rssiSamples??[];
  const state=deviceActivityState(device,now);
  const chart=deviceRssiChart(samples,device.averageRssi);
  const top=s.devices.slice().filter(d=>Number.isFinite(d.rssi)).sort((a,b)=>b.rssi-a.rssi).slice(0,6);
  return `${chart}<div class="device-rssi-summary"><div class="kv-stack">${kv('Address',device.address)}${kv('State',state)}${kv('Current RSSI',device.rssi===null?'—':`${device.rssi} dBm`)}${kv('Average RSSI',device.averageRssi===null?'—':`${device.averageRssi.toFixed(1)} dBm`)}${kv('Peak RSSI',Number.isFinite(device.strongestRssi)?`${device.strongestRssi} dBm`:'—')}${kv('First / last',`${fmtTime(device.firstSeen)} / ${fmtTime(device.lastSeen)}`)}</div><div class="overview-device-list">${top.map(d=>`<button class="overview-device-row ${d.address===device.address?'selected':''}" data-device-address="${esc(d.address)}"><span>${esc(d.localName||d.address)}</span><strong>${d.rssi} dBm</strong></button>`).join('')}</div></div><div class="button-row overview-inline-actions"><button class="btn small" data-action="overview-device-packets">OPEN DEVICE PACKETS</button><button class="btn small" data-view="devices">DEVICE INVENTORY</button></div>`;
}

function deviceRssiChart(samples, average) {
  if (!samples.length) return '<div class="overview-empty compact"><strong>NO RSSI SAMPLES</strong></div>';
  const rows=samples.slice(-120),w=720,h=175,p={l:42,r:12,t:14,b:28},min=-110,max=-20;
  const x=i=>p.l+(i/Math.max(1,rows.length-1))*(w-p.l-p.r);
  const y=v=>p.t+(h-p.t-p.b)*(1-(Math.max(min,Math.min(max,v))-min)/(max-min));
  const points=rows.map((row,i)=>`${x(i).toFixed(1)},${y(row.rssi).toFixed(1)}`).join(' ');
  const stride=Math.max(1,Math.ceil(rows.length/28));
  const markers=rows.map((row,i)=>i%stride===0?`<circle class="rssi-marker" ${row.packetId?`data-packet-id="${row.packetId}"`:''} cx="${x(i).toFixed(1)}" cy="${y(row.rssi).toFixed(1)}" r="2.5"><title>${fmtTime(row.time)} · ${row.rssi} dBm · CH ${row.channel??'—'}</title></circle>`:'').join('');
  const avgLine=Number.isFinite(average)?`<line class="chart-average-line" x1="${p.l}" y1="${y(average).toFixed(1)}" x2="${w-p.r}" y2="${y(average).toFixed(1)}"/>`:'';
  return `<div class="overview-chart-wrap"><svg class="overview-chart rssi-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Selected device RSSI history"><line class="chart-axis" x1="${p.l}" y1="${h-p.b}" x2="${w-p.r}" y2="${h-p.b}"/><line class="chart-axis" x1="${p.l}" y1="${p.t}" x2="${p.l}" y2="${h-p.b}"/>${avgLine}<polyline class="chart-line rssi" points="${points}"/>${markers}<text x="4" y="${p.t+8}">-20</text><text x="4" y="${h-p.b}">-110</text><text x="${p.l}" y="${h-8}">${fmtTime(rows[0].time)}</text><text x="${w-p.r-62}" y="${h-8}">${fmtTime(rows.at(-1).time)}</text></svg><div class="chart-caption"><span><b class="legend rssi"></b>RECEIVED RSSI</span><span>markers link to retained packet evidence</span></div></div>`;
}

function connectionMap(s, selected, selectedDevice = null) {
  const connections=(s.connections??[]).slice(0,8);
  if (!connections.length) return '<div class="overview-empty"><strong>NO CONNECTION EVIDENCE</strong><span>Follow/promiscuous captures may add observed or inferred access-address activity here.</span></div>';
  return `<div class="connection-map">${connections.map(connection=>{ const related=selectedDevice && [connection.initiator,connection.advertiser].includes(selectedDevice.address); return `<button class="connection-flow ${selected?.accessAddressHex===connection.accessAddressHex?'selected':''} ${related?'related':''}" data-connection-aa="${esc(connection.accessAddressHex)}"><div class="connection-node"><span>${connection.initiator?'INITIATOR':'SOURCE'}</span><strong>${esc(connection.initiator??'UNKNOWN')}</strong></div><div class="connection-edge"><span class="tag ${connection.evidence==='OBSERVED'?'ok':'warning'}">${esc(connection.evidence)}</span><code>${esc(connection.accessAddressHex)}</code><small>${connection.packetCount} pkt · ${Array.from(connection.channels??[]).length} ch</small></div><div class="connection-node"><span>${connection.advertiser?'ADVERTISER':'DESTINATION'}</span><strong>${esc(connection.advertiser??'UNKNOWN')}</strong></div></button>`; }).join('')}</div>${selected?`<div class="connection-detail-strip"><span><strong>${esc(selected.accessAddressHex)}</strong> ${esc(selected.evidence)} · ${selected.endedAt?'ENDED':'ACTIVE'}</span><span>${selected.intervalMs===null?'interval unknown':`${Number(selected.intervalMs).toFixed(2)} ms interval`} · hop ${selected.hopIncrement??'—'}</span><button class="btn tiny" data-action="overview-connection-packets">OPEN PACKETS</button></div>`:''}`;
}

function overviewEvents(s, focus) {
  const events=(s.replay?.active?(s.replay.sourceEvents??[]):s.recorder.events.toArray()).slice().sort((a,b)=>Number(b.time??0)-Number(a.time??0));
  const needle=focus.device?.address??focus.connection?.accessAddressHex??null;
  const channel=focus.channel;
  if (!needle && channel===null) return events;
  const filtered=events.filter(event=>{
    const text=`${event.message??''} ${JSON.stringify(event.detail??{})}`.toLowerCase();
    if (needle && text.includes(String(needle).toLowerCase())) return true;
    if (channel!==null && (Number(event.detail?.channel)===Number(channel) || text.includes(`ch ${channel}`) || text.includes(`channel ${channel}`))) return true;
    return false;
  });
  return filtered.length?filtered:events;
}

function overviewEventList(events, selectedId) {
  if (!events.length) return '<div class="overview-empty"><strong>NO EVENTS</strong><span>Session activity will appear here.</span></div>';
  return `<div class="overview-event-list">${events.map(event=>`<button class="overview-event ${selectedId===event.id?'selected':''} ${esc(event.level??'info')}" data-event-id="${esc(event.id)}"><time>${fmtTime(event.time)}</time><span>${esc(String(event.category??'SYSTEM').toUpperCase())}</span><strong>${esc(event.message)}</strong>${event.packetId?`<em>PKT ${event.packetId}</em>`:''}</button>`).join('')}</div><div class="button-row overview-inline-actions"><button class="btn small" data-view="timeline">OPEN TIMELINE</button></div>`;
}

function selectedEvent(s) {
  const events=s.replay?.active?(s.replay.sourceEvents??[]):s.recorder.events.toArray();
  return events.find(event=>event.id===s.selectedEventId)??null;
}

function observationNow(s) {
  if (s.replay?.active && s.replay.index >= 0) {
    const record=s.replay.document?.packets?.[s.replay.index];
    return Number(record?.wallTime??record?.receivedAt??Date.now());
  }
  return Date.now();
}
