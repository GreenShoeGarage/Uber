import { APP_NAME, APP_VERSION_LABEL } from './version.js';
import { PreferenceStore } from './state.js';
import { WebUSBTransport } from './transport/webusb.js';
import { WebSerialTransport } from './transport/webserial.js';
import { SimulationTransport } from './transport/simulation.js';
import { UbertoothDevice } from './ubertooth/device.js';
import { parseUsbPacket, parseSpectrumRecords, PacketType } from './ubertooth/packets.js';
import { parseBlePacket } from './bluetooth/ble.js';
import { ingestObservedDevice, deviceActivityState } from './bluetooth/devices.js';
import { BleChannelActivity } from './bluetooth/channel-activity.js';
import { BleConnectionTracker } from './bluetooth/connections.js';
import { ClassicPiconetTracker } from './bluetooth/classic-tracker.js';
import { ClassicDecoder } from './decoder/classic-decoder.js';
import { normalizeLap } from './bluetooth/classic.js';
import { CaptureRecorder } from './capture/recorder.js';
import { captureJson, exportCaptureJson, exportCaptureDocument, exportPacketsCsv, exportRaw, exportDiagnostics, exportSpectrumCsv, exportDeviceInventoryCsv, exportEventsCsv, exportBlePcap, exportBlePcapng } from './capture/export.js';
import { validateCaptureDocument, deserializePacket, replayRange } from './capture/replay.js';
import { CaptureStore, SurveyStore } from './storage/db.js';
import { exportEvidencePackage } from './capture/evidence-package.js';
import { SpectrumModel } from './spectrum/spectrum.js';
import { SpectrumCanvasView } from './ui/charts.js';
import { renderShellNav, renderView, bleRows, bleMetrics, bleDevicePreviewContent, spectrumMetrics } from './ui/views.js';
import { toHexCompact } from './utils/binary.js';
import { runHardwareValidation, newSoakState, browserHeapBytes } from './diagnostics/hardware.js';
import { TelemetryHistory } from './analysis/telemetry.js';
import { newSurveyProject, buildSpectrumSurveySample, buildBleSurveySample, finalizeSurveyStation } from './survey/survey.js';
import { exportSurveyJson, exportSurveyCsv } from './survey/export.js';

class App {
  constructor() {
    this.prefs = new PreferenceStore();
    this.captureStore = new CaptureStore();
    this.surveyStore = new SurveyStore();
    this.recorder = new CaptureRecorder(20000);
    this.spectrum = new SpectrumModel(this.prefs.get('spectrumLow'), this.prefs.get('spectrumHigh'), {
      averaging: this.prefs.get('averaging'), persistence: this.prefs.get('spectrumPersistence'), peakHold: this.prefs.get('peakHold'),
      waterfallSpeed: this.prefs.get('waterfallSpeed'), waterfallRows: this.prefs.get('waterfallRows'),
      rssiMin: this.prefs.get('spectrumRssiMin'), rssiMax: this.prefs.get('spectrumRssiMax'),
      showBleOverlay: this.prefs.get('spectrumBleOverlay'), showWifiOverlay: this.prefs.get('spectrumWifiOverlay')
    });
    this.chart = new SpectrumCanvasView(this.spectrum, {
      onMarker: frequency => this.addSpectrumMarker(frequency),
      onViewChange: () => this.updateSpectrumViewReadout()
    });
    this.transport = null;
    this.device = null;
    this.deviceInfo = null;
    this.radioState = null;
    this.logs = [];
    this.devices = new Map();
    this.channelActivity = new BleChannelActivity(this.prefs.get('channelActivityWindowMs'));
    this.connectionTracker = new BleConnectionTracker();
    this.classicTracker = new ClassicPiconetTracker();
    this.classicDecoder = new ClassicDecoder();
    this.telemetry = new TelemetryHistory({ capacity: 600, bucketMs: 1000 });
    this.selectedDeviceAddress = null;
    this.selectedConnectionAccessAddress = null;
    this.selectedClassicLap = null;
    this.selectedEventId = null;
    this.inspectorHighlight = null;
    this.captureLibrary = [];
    this.captureSearch = '';
    this.surveyProjects = [];
    this.surveyRun = { active:false, stage:'idle', projectId:null, stationName:'', note:'', startedAt:null, phaseStartedAt:null, phaseDurationMs:0, spectrumSample:null };
    this.surveyTransitionPending = false;
    this.replay = {
      active: false,
      playing: false,
      speed: 1,
      document: null,
      range: { start: 0, end: 0, durationMs: 0 },
      index: -1,
      timer: null,
      sourceEvents: []
    };
    this.connectionState = 'DISCONNECTED';
    this.currentView = 'connect';
    this.streaming = false;
    this.simulation = false;
    this.spectrumPaused = false;
    this.lastError = null;
    this.packetSeq = 0;
    this.readToken = 0;
    this.selectedPacket = null;
    this.saveState = 'SAVED';
    this.lastFullRefresh = 0;
    this.validation = null;
    this.soak = newSoakState();
    this.soakFinishing = false;
    this.lastStreamConfig = null;
    this.lastTickAt = performance.now();
    this.resumeCheckPending = false;
    this.capabilities = {
      webusb: WebUSBTransport.supported(),
      webserial: WebSerialTransport.supported(),
      secureContext: window.isSecureContext,
      chromium: /Chrome|Chromium|Edg\//.test(navigator.userAgent)
    };
  }

  start() {
    document.title = `${APP_NAME} — Ubertooth One Browser Workbench`;
    document.getElementById('app-version').textContent = APP_VERSION_LABEL;
    this.applyTheme();
    this.bindGlobalEvents();
    this.prefs.addEventListener('save-state', e => { this.saveState = e.detail.state; this.updateStatusBar(); });
    this.renderShell();
    this.renderCurrentView();
    this.refreshCaptureLibrary().catch(error => this.log(`CAPTURE LIBRARY LOAD FAILED — ${error.message}`, 'warning'));
    this.refreshSurveyLibrary().catch(error => this.log(`SURVEY LIBRARY LOAD FAILED — ${error.message}`, 'warning'));
    setInterval(() => this.liveTick(), 200);
    this.log('APPLICATION READY');
  }

  get mode() { return this.prefs.get('mode'); }
  get prefsValue() { return this.prefs.all(); }
  get deviceList() { return Array.from(this.devices.values()); }

  state() {
    return {
      prefs: this.prefsValue,
      mode: this.mode,
      recorder: this.recorder,
      spectrum: this.spectrum,
      capabilities: this.capabilities,
      connectionState: this.connectionState,
      streaming: this.streaming,
      simulation: this.simulation,
      spectrumPaused: this.spectrumPaused,
      lastError: this.lastError,
      deviceInfo: this.deviceInfo,
      radioState: this.radioState,
      transport: this.transport,
      transportDescription: this.transport?.describe() ?? null,
      devices: this.deviceList,
      channelActivity: this.channelActivity,
      connections: this.connectionTracker.list(),
      classicObservations: this.classicTracker.list(),
      classicDecoder: { status:this.classicDecoder.status, lastError:this.classicDecoder.lastError },
      selectedClassicLap: this.selectedClassicLap,
      telemetry: this.telemetry,
      selectedDeviceAddress: this.selectedDeviceAddress,
      selectedConnectionAccessAddress: this.selectedConnectionAccessAddress,
      selectedEventId: this.selectedEventId,
      logs: this.logs,
      selectedPacket: this.selectedPacket,
      inspectorHighlight: this.inspectorHighlight,
      captureLibrary: this.captureLibrary,
      captureSearch: this.captureSearch,
      surveyProjects: this.surveyProjects,
      surveyRun: this.surveyRun,
      replay: this.replay,
      validation: this.validation,
      soak: this.soak,
      lastStreamConfig: this.lastStreamConfig
    };
  }

  bindGlobalEvents() {
    document.addEventListener('click', e => {
      const viewButton = e.target.closest('[data-view]');
      if (viewButton) { this.navigate(viewButton.dataset.view); return; }
      const deviceAction = e.target.closest('[data-device-action]');
      if (deviceAction) { this.handleDeviceAction(deviceAction.dataset.deviceAction, deviceAction.dataset.address).catch(error => this.fail(error)); return; }
      const channelSelect = e.target.closest('[data-channel-select]');
      if (channelSelect) { this.selectActivityChannel(Number(channelSelect.dataset.channelSelect)); return; }
      const captureAction = e.target.closest('[data-capture-action]');
      if (captureAction) { this.handleCaptureAction(captureAction.dataset.captureAction, captureAction.dataset.captureId).catch(error => this.fail(error)); return; }
      const byteField = e.target.closest('[data-byte-start]');
      if (byteField) { this.inspectorHighlight = { start:Number(byteField.dataset.byteStart), end:Number(byteField.dataset.byteEnd), label:byteField.dataset.byteLabel ?? 'Decoded field' }; this.renderCurrentView(); return; }
      const packetRow = e.target.closest('[data-packet-id]');
      if (packetRow) { this.selectPacket(Number(packetRow.dataset.packetId)); return; }
      const eventSelect = e.target.closest('[data-event-id]');
      if (eventSelect) { this.selectedEventId = eventSelect.dataset.eventId; this.renderCurrentView(); return; }
      const connectionSelect = e.target.closest('[data-connection-aa]');
      if (connectionSelect) { this.selectedConnectionAccessAddress = connectionSelect.dataset.connectionAa; this.renderCurrentView(); return; }
      const classicSelect = e.target.closest('[data-classic-lap]');
      if (classicSelect) { this.selectedClassicLap = classicSelect.dataset.classicLap; this.renderCurrentView(); return; }
      const deviceRow = e.target.closest('[data-device-address]');
      if (deviceRow) { this.selectedDeviceAddress = deviceRow.dataset.deviceAddress; this.renderCurrentView(); return; }
      const surveyDelete = e.target.closest('[data-survey-station-delete]');
      if (surveyDelete) { this.deleteSurveyStation(surveyDelete.dataset.surveyStationDelete).catch(error => this.fail(error)); return; }
      const markerRemove = e.target.closest('[data-marker-remove]');
      if (markerRemove) { this.removeSpectrumMarker(markerRemove.dataset.markerRemove); return; }
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action) this.handleAction(action).catch(error => this.fail(error));
    });

    document.addEventListener('input', e => {
      const filter = e.target.dataset?.filter;
      if (filter) { this.prefs.set(filter, e.target.value); this.renderCurrentView(); return; }
      const pref = e.target.dataset?.pref;
      if (pref && ['checkbox','range'].includes(e.target.type)) { this.prefs.set(pref, e.target.type === 'checkbox' ? Boolean(e.target.checked) : e.target.value); this.renderCurrentView(); return; }
      if (e.target.dataset?.captureSearch !== undefined) { this.captureSearch = e.target.value; this.renderCurrentView(); return; }
      const spectrumPref = e.target.dataset?.spectrumPref;
      if (spectrumPref && ['range','checkbox'].includes(e.target.type)) this.applySpectrumPreference(spectrumPref, e.target);
    });

    document.addEventListener('change', e => {
      if (e.target.dataset?.eventNote !== undefined) { this.updateSelectedEventAnnotation({ note:e.target.value }); return; }
      if (e.target.dataset?.eventTags !== undefined) { this.updateSelectedEventAnnotation({ tags:e.target.value.split(',').map(x=>x.trim()).filter(Boolean) }); return; }
      const markerId = e.target.dataset?.markerNote;
      if (markerId) { this.spectrum.updateMarkerNote(markerId, e.target.value); this.recorder.event('Spectrum marker note updated', { markerId }); return; }
      const pref = e.target.dataset?.pref;
      if (pref) { this.prefs.set(pref, e.target.type === 'checkbox' ? Boolean(e.target.checked) : e.target.value); this.renderCurrentView(); return; }
      if (e.target.id === 'capture-file' && e.target.files?.[0]) { this.importCaptureFile(e.target.files[0]).catch(error => this.fail(error)); e.target.value=''; return; }
      if (e.target.id === 'capture-name') { this.renameCurrentCapture(e.target.value).catch(error => this.fail(error)); return; }
      if (e.target.dataset?.packetNote !== undefined) { this.updateSelectedAnnotation({ note:e.target.value }); return; }
      if (e.target.dataset?.packetTags !== undefined) { this.updateSelectedAnnotation({ tags:e.target.value.split(',').map(x=>x.trim()).filter(Boolean) }); return; }
      if (e.target.id === 'replay-speed') { this.replay.speed = Number(e.target.value) || 1; this.renderCurrentView(); return; }
      if (e.target.id === 'replay-scrub') { this.replaySeek(Number(e.target.value)); return; }
      const spectrumPref = e.target.dataset?.spectrumPref;
      if (spectrumPref && !['range','checkbox'].includes(e.target.type)) this.applySpectrumPreference(spectrumPref, e.target);
    });

    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.navigate('connect'); }
      if (e.key === 'Escape' && this.streaming) this.handleAction('stop-stream').catch(error => this.fail(error));
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.log('BROWSER TAB HIDDEN — acquisition may be throttled by the browser', 'warning');
        this.recorder.event('Browser tab hidden', {}, 'warning');
      } else {
        this.log('BROWSER TAB VISIBLE — checking session health');
        this.recorder.event('Browser tab visible');
        this.healthCheckAfterResume().catch(error => this.log(`RESUME HEALTH CHECK FAILED — ${error.message}`, 'error'));
      }
    });
    window.addEventListener('pageshow', event => {
      if (event.persisted) this.healthCheckAfterResume().catch(error => this.log(`PAGE RESTORE HEALTH CHECK FAILED — ${error.message}`, 'error'));
    });
  }

  renderShell() {
    const nav = document.getElementById('side-nav');
    nav.innerHTML = renderShellNav(this.mode, this.currentView);
    document.getElementById('app-shell').classList.toggle('nav-collapsed', Boolean(this.prefs.get('navCollapsed')));
    const easyMode = document.getElementById('header-mode-easy');
    const advancedMode = document.getElementById('header-mode-advanced');
    easyMode.classList.toggle('active', this.mode === 'easy');
    advancedMode.classList.toggle('active', this.mode === 'advanced');
    easyMode.setAttribute('aria-pressed', String(this.mode === 'easy'));
    advancedMode.setAttribute('aria-pressed', String(this.mode === 'advanced'));
    const collapseButton = document.getElementById('nav-collapse-button');
    if (collapseButton) {
      const collapsed = Boolean(this.prefs.get('navCollapsed'));
      collapseButton.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
      collapseButton.querySelector('.collapse-glyph').textContent = collapsed ? '›' : '‹';
      const label = collapseButton.querySelector('.collapse-label');
      if (label) label.textContent = collapsed ? 'EXPAND' : 'COLLAPSE';
    }
    this.updateHeader();
    this.updateStatusBar();
  }

  renderCurrentView() {
    const main = document.getElementById('main-view');
    main.innerHTML = renderView(this.currentView, this.state());
    if (this.currentView === 'spectrum') requestAnimationFrame(() => this.chart.attach());
    this.renderShell();
  }

  navigate(view) {
    if (this.mode === 'easy' && ['channels','timeline','classic','radio','diagnostics'].includes(view)) view = 'connect';
    this.currentView = view;
    this.renderCurrentView();
    requestAnimationFrame(() => document.getElementById('main-view')?.focus({ preventScroll:true }));
  }

  updateHeader() {
    const el = document.getElementById('connection-state');
    el.textContent = this.connectionState;
    el.className = `connection-state ${this.connectionState.toLowerCase()}`;
    document.getElementById('workspace-label').textContent = ({connect:'CONNECT',overview:'RF OVERVIEW',survey:'RF SURVEY',spectrum:'SPECTRUM',ble:'BLE MONITOR',classic:'CLASSIC',devices:'DEVICES',channels:'CHANNEL ACTIVITY',packets:'PACKETS',timeline:'TIMELINE',capture:'CAPTURE',radio:'RADIO',diagnostics:'DIAGNOSTIC',settings:'SETTINGS'})[this.currentView] ?? 'WORKBENCH';
    const sim = document.getElementById('simulation-badge');
    sim.hidden = !this.simulation;
  }

  updateStatusBar() {
    const stats = this.recorder.stats();
    const newest = this.recorder.packets.at(this.recorder.packets.length - 1);
    document.getElementById('status-channel').textContent = newest?.ble?.bleChannel !== null && newest?.ble?.bleChannel !== undefined ? `CH ${newest.ble.bleChannel}` : newest ? `${newest.frequency} MHz` : 'CH —';
    document.getElementById('status-range').textContent = `${this.prefs.get('spectrumLow')}–${this.prefs.get('spectrumHigh')} MHz`;
    if (this.currentView === 'spectrum') {
      const raw = this.spectrum.stats.strongestRssi;
      document.getElementById('status-rssi').textContent = raw === null ? 'RAW —' : `RAW ${raw}`;
    } else {
      document.getElementById('status-rssi').textContent = newest?.rssiMax === null || newest?.rssiMax === undefined ? '— dBm' : `${newest.rssiMax} dBm`;
    }
    document.getElementById('status-rate').textContent = `${stats.packetRate.toFixed(1)} pkt/s`;
    const rec = document.getElementById('status-rec');
    rec.textContent = this.streaming ? 'REC ●' : this.replay.active ? (this.replay.playing ? `REPLAY ▶ ${this.replay.speed}×` : 'REPLAY ❚❚') : 'IDLE';
    rec.classList.toggle('recording', this.streaming);
    rec.classList.toggle('replaying', this.replay.active);
    const save = document.getElementById('autosave-state');
    save.textContent = `● ${this.saveState}`;
    save.className = `autosave ${this.saveState.toLowerCase()}`;
  }

  async handleAction(action) {
    this.lastError = null;
    switch (action) {
      case 'set-easy': return this.setMode('easy');
      case 'set-advanced': return this.setMode('advanced');
      case 'toggle-nav': this.prefs.set('navCollapsed', !this.prefs.get('navCollapsed')); return this.renderShell();
      case 'connect': return this.connect(false, false);
      case 'reconnect': return this.connect(false, true);
      case 'simulation': return this.connect(true, false);
      case 'disconnect': return this.disconnect();
      case 'ping': await this.requireDevice().ping(); this.log('PING → OK'); return this.toast('PING OK');
      case 'device-info': this.deviceInfo = await this.requireDevice().queryInfo(); this.log('DEVICE INFO REFRESHED'); return this.renderCurrentView();
      case 'firmware-reset': return this.resetFirmware();
      case 'start-spectrum': return this.startSpectrum();
      case 'start-ble': return this.startBle(false, false);
      case 'start-ble-follow': return this.startBle(true, false);
      case 'start-ble-promisc': return this.startBle(false, true);
      case 'start-classic': return this.startClassic();
      case 'classic-use-selected-lap': if(this.selectedClassicLap){this.prefs.set('classicKnownLap',this.selectedClassicLap.replace(/^0x/i,''));this.renderCurrentView();} return;
      case 'classic-show-packets': if(this.selectedClassicLap){this.prefs.set('packetSearch',this.selectedClassicLap);this.prefs.set('packetFilter','classic');this.currentView='packets';this.renderCurrentView();} return;
      case 'classic-clear': this.classicTracker.reset(); this.selectedClassicLap=null; return this.renderCurrentView();
      case 'stop-stream': return this.surveyRun.active ? this.cancelSurveyRun('Stopped by user') : this.soak.active ? this.finishSoak('STOPPED', 'Stopped by user') : this.stopStream();
      case 'pause-spectrum': this.spectrumPaused = !this.spectrumPaused; return this.renderCurrentView();
      case 'clear-spectrum': this.spectrum.clear(); this.recorder.event('Spectrum display cleared'); this.chart.draw(); return;
      case 'clear-peak': this.spectrum.clearPeak(); this.recorder.event('Spectrum peak hold cleared'); this.chart.draw(); return;
      case 'spectrum-zoom-in': return this.zoomSpectrum(0.65);
      case 'spectrum-zoom-out': return this.zoomSpectrum(1 / 0.65);
      case 'spectrum-zoom-reset': this.spectrum.resetView(); this.chart.draw(); return this.updateSpectrumViewReadout();
      case 'export-spectrum-csv': return exportSpectrumCsv(this.spectrum, this.exportMetadata());
      case 'export-json': return this.replay.active ? exportCaptureDocument(this.replay.document) : exportCaptureJson(this.recorder, this.exportMetadata());
      case 'export-csv': return exportPacketsCsv(this.replay.active ? { packets:{ toArray:()=>this.exportPacketsForInterop() } } : this.recorder);
      case 'export-devices-csv': return this.exportDevicesCsv();
      case 'export-raw': return exportRaw(this.replay.active ? { packets:{ toArray:()=>this.exportPacketsForInterop() } } : this.recorder);
      case 'export-events-csv': return exportEventsCsv(this.replay.active ? this.replay.sourceEvents : this.recorder.events.toArray());
      case 'export-pcap': return this.exportPcap(false);
      case 'export-pcapng': return this.exportPcap(true);
      case 'export-evidence-package': return this.exportEvidenceBundle();
      case 'export-diagnostics': return exportDiagnostics(this.diagnosticsDocument());
      case 'save-capture': return this.saveCurrentCapture();
      case 'import-capture': document.getElementById('capture-file')?.click(); return;
      case 'replay-play': return this.replayPlay();
      case 'replay-pause': return this.replayPause();
      case 'replay-step': return this.replayStep(1);
      case 'replay-back': return this.replayStep(-1);
      case 'replay-restart': return this.replaySeek(-1);
      case 'replay-exit': return this.exitReplay();
      case 'packet-prev': return this.navigatePacket(-1, 'all');
      case 'packet-next': return this.navigatePacket(1, 'all');
      case 'packet-prev-device': return this.navigatePacket(-1, 'device');
      case 'packet-prev-channel': return this.navigatePacket(-1, 'channel');
      case 'packet-prev-malformed': return this.navigatePacket(-1, 'malformed');
      case 'packet-bookmark': return this.toggleSelectedBookmark();
      case 'clear-byte-highlight': this.inspectorHighlight = null; return this.renderCurrentView();
      case 'validate-hardware': return this.validateHardware();
      case 'start-soak': return this.startSoak();
      case 'stop-soak': return this.finishSoak('STOPPED', 'Stopped by user');
      case 'retry-stream': return this.retryLastStream();
      case 'refresh-radio': this.radioState = await this.requireDevice().queryRadioState(); return this.renderCurrentView();
      case 'apply-radio': return this.applyRadio();
      case 'apply-toggles': return this.applyToggles();
      case 'set-target': return this.setTarget();
      case 'set-aa': return this.setAccessAddress();
      case 'cancel-follow': await this.requireDevice().cancelFollow(); this.recorder.event('BLE follow cancel requested', {}, 'warning'); this.log('CANCEL FOLLOW SENT'); return this.toast('Follow cancel requested');
      case 'apply-ble-target': return this.applyBleTarget();
      case 'clear-ble-target': return this.clearBleTarget();
      case 'apply-ble-access-address': return this.applyBleAccessAddress();
      case 'apply-ble-crc': return this.applyBleCrc();
      case 'view-channel-packets': this.currentView='packets'; return this.renderCurrentView();
      case 'clear-channel-filter': this.prefs.set('packetChannelFilter','all'); return this.renderCurrentView();
      case 'clear-overview-focus': this.selectedDeviceAddress=null; this.selectedConnectionAccessAddress=null; this.selectedEventId=null; this.prefs.set('packetChannelFilter','all'); return this.renderCurrentView();
      case 'overview-device-packets': if(this.selectedDeviceAddress){this.prefs.set('packetSearch',this.selectedDeviceAddress);this.currentView='packets';this.renderCurrentView();} return;
      case 'overview-connection-packets': if(this.selectedConnectionAccessAddress){this.prefs.set('packetSearch',this.selectedConnectionAccessAddress);this.currentView='packets';this.renderCurrentView();} return;
      case 'overview-channel-packets': this.currentView='packets'; return this.renderCurrentView();
      case 'survey-create': return this.createSurveyProject();
      case 'survey-delete-project': return this.deleteSurveyProject();
      case 'survey-start': return this.startSurveyStation();
      case 'survey-cancel': return this.cancelSurveyRun('Canceled by user');
      case 'survey-export-json': { const p=this.activeSurveyProject(); if(!p) throw new Error('Select a survey project first.'); return exportSurveyJson(p); }
      case 'survey-export-csv': { const p=this.activeSurveyProject(); if(!p) throw new Error('Select a survey project first.'); return exportSurveyCsv(p); }
      case 'event-bookmark': return this.toggleSelectedEventBookmark();
      case 'clear-event-selection': this.selectedEventId=null; return this.renderCurrentView();
      case 'apply-settings': return this.applySettings();
      case 'clear-local': return this.clearLocal();
      case 'copy-hex': return this.copySelectedHex();
      default: break;
    }
  }

  async connect(simulation, reconnect = false) {
    if (this.transport?.connected && !reconnect) return;
    this.connectionState = 'CONNECTING'; this.lastError = null; this.simulation = simulation; this.renderCurrentView();
    let transport = null;
    if (reconnect && this.transport?.kind === 'webusb') transport = this.transport;
    else transport = simulation ? new SimulationTransport() : new WebUSBTransport();
    if (transport !== this.transport) this.attachTransport(transport);
    try {
      if (reconnect && transport.kind === 'webusb') await transport.reconnect();
      else await transport.connect();
      this.device = new UbertoothDevice(transport);
      this.device.addEventListener('command', e => this.log(`${e.detail.name} [${e.detail.def.direction.toUpperCase()} ${e.detail.def.id}]`));
      await this.device.ping();
      this.log('PING → OK');
      this.deviceInfo = await this.device.queryInfo();
      this.connectionState = 'CONNECTED';
      this.recorder.event(simulation ? 'Simulation connected' : reconnect ? 'Ubertooth reconnected' : 'Ubertooth connected');
      this.log(`DEVICE READY — ${this.deviceInfo.boardName}`);
      this.renderCurrentView();
    } catch (error) {
      this.connectionState = 'ERROR';
      this.lastError = error.message;
      this.log(error.message, 'error');
      this.renderCurrentView();
    }
  }

  attachTransport(transport) {
    this.transport = transport;
    transport.addEventListener('log', e => this.log(e.detail.message, e.detail.level));
    transport.addEventListener('disconnect', e => {
      this.readToken += 1;
      if (this.streaming) this.recorder.stop();
      this.streaming = false; this.connectionState = 'DISCONNECTED';
      if (this.surveyRun.active) this.surveyRun = { ...this.surveyRun, active:false, stage:'canceled' };
      this.recorder.event('Device disconnected', { reason: e.detail.reason }, 'error');
      this.log(`DEVICE DISCONNECTED — ${e.detail.reason}`, 'error');
      if (this.soak.active) this.finalizeSoakState('FAIL', `Device disconnected: ${e.detail.reason}`);
      this.renderCurrentView();
    });
  }

  async disconnect() {
    if (this.surveyRun.active) await this.cancelSurveyRun('Disconnected by user');
    if (this.soak.active) await this.finishSoak('STOPPED', 'Disconnected by user');
    else if (this.streaming) await this.stopStream(false);
    else this.readToken += 1;
    if (this.device) { try { await this.device.stop(); } catch (_) {} }
    if (this.transport) { try { await this.transport.disconnect(); } catch (_) {} }
    this.streaming = false; this.connectionState = 'DISCONNECTED'; this.device = null; this.deviceInfo = null; this.radioState = null; this.simulation = false;
    this.recorder.event('Disconnected'); this.renderCurrentView();
  }

  async startSpectrum(options = {}) {
    const device = this.requireDevice();
    if (this.surveyRun.active && !options.survey) await this.cancelSurveyRun('Spectrum mode changed manually');
    if (this.replay.active) this.exitReplay(false);
    if (this.soak.active) await this.finishSoak('STOPPED', 'Spectrum started manually');
    const low = Number(document.getElementById('spectrum-low')?.value ?? this.prefs.get('spectrumLow'));
    const high = Number(document.getElementById('spectrum-high')?.value ?? this.prefs.get('spectrumHigh'));
    const avg = Number(document.getElementById('spectrum-avg')?.value ?? this.prefs.get('averaging'));
    const persistence = Number(document.getElementById('spectrum-persistence')?.value ?? this.prefs.get('spectrumPersistence'));
    const peak = Boolean(document.getElementById('peak-hold')?.checked ?? this.prefs.get('peakHold'));
    const waterfallSpeed = Number(document.getElementById('waterfall-speed')?.value ?? this.prefs.get('waterfallSpeed'));
    const waterfallRows = Number(document.getElementById('waterfall-rows')?.value ?? this.prefs.get('waterfallRows'));
    const rssiMin = Number(document.getElementById('spectrum-rssi-min')?.value ?? this.prefs.get('spectrumRssiMin'));
    const rssiMax = Number(document.getElementById('spectrum-rssi-max')?.value ?? this.prefs.get('spectrumRssiMax'));
    const showBleOverlay = Boolean(document.getElementById('ble-overlay')?.checked ?? this.prefs.get('spectrumBleOverlay'));
    const showWifiOverlay = Boolean(document.getElementById('wifi-overlay')?.checked ?? this.prefs.get('spectrumWifiOverlay'));

    // Validate the full display/acquisition configuration before touching the device.
    if (!Number.isInteger(low) || !Number.isInteger(high) || low < 2049 || high > 3072 || high < low) throw new Error('Spectrum limits must be whole MHz values ordered within 2049–3072 MHz.');
    this.spectrum.setRssiScale(rssiMin, rssiMax);
    await this.stopStream(false);
    this.spectrum.configure(low, high);
    this.spectrum.applyOptions({ averaging: avg, persistence, peakHold: peak, waterfallSpeed, waterfallRows, rssiMin, rssiMax, showBleOverlay, showWifiOverlay });
    for (const [name, value] of Object.entries({ spectrumLow: low, spectrumHigh: high, averaging: avg, spectrumPersistence: persistence, peakHold: peak, waterfallSpeed, waterfallRows, spectrumRssiMin: rssiMin, spectrumRssiMax: rssiMax, spectrumBleOverlay: showBleOverlay, spectrumWifiOverlay: showWifiOverlay })) this.prefs.set(name, value);

    await device.startSpectrum(low, high);
    this.spectrumPaused = false;
    this.lastStreamConfig = { type: 'spectrum', low, high };
    this.beginReadLoop('spectrum');
    this.recorder.event('Spectrum scan started', { low, high, rawRssi: true });
    this.renderCurrentView();
  }

  applySpectrumPreference(name, target) {
    try {
      const value = target.type === 'checkbox' ? Boolean(target.checked) : Number(target.value);
      if (name === 'spectrumRssiMin' || name === 'spectrumRssiMax') {
        const min = name === 'spectrumRssiMin' ? value : Number(this.prefs.get('spectrumRssiMin'));
        const max = name === 'spectrumRssiMax' ? value : Number(this.prefs.get('spectrumRssiMax'));
        this.spectrum.setRssiScale(min, max);
      } else if (name === 'averaging') this.spectrum.setAveraging(value);
      else if (name === 'spectrumPersistence') this.spectrum.setPersistence(value);
      else if (name === 'peakHold') this.spectrum.peakHold = value;
      else if (name === 'waterfallSpeed') this.spectrum.setWaterfallSpeed(value);
      else if (name === 'waterfallRows') this.spectrum.setWaterfallRows(value);
      else if (name === 'spectrumBleOverlay') this.spectrum.showBleOverlay = value;
      else if (name === 'spectrumWifiOverlay') this.spectrum.showWifiOverlay = value;
      else return;
      this.prefs.set(name, value);
      const avgOut = document.querySelector('[data-live="averaging-value"]');
      const persistenceOut = document.querySelector('[data-live="persistence-value"]');
      if (avgOut) avgOut.textContent = `${this.prefs.get('averaging')}%`;
      if (persistenceOut) persistenceOut.textContent = `${this.prefs.get('spectrumPersistence')}%`;
      this.chart.draw();
    } catch (error) {
      this.fail(error);
    }
  }

  addSpectrumMarker(frequency) {
    const marker = this.spectrum.addMarker(frequency);
    this.recorder.event('Spectrum marker added', { markerId: marker.id, frequencyMHz: marker.frequency, rawRssi: marker.currentRssi });
    this.log(`SPECTRUM MARKER ${marker.id} — ${marker.frequency} MHz`);
    this.renderCurrentView();
  }

  removeSpectrumMarker(id) {
    const marker = this.spectrum.markers.find(item => item.id === id);
    if (!this.spectrum.removeMarker(id)) return;
    this.recorder.event('Spectrum marker removed', { markerId: id, frequencyMHz: marker?.frequency ?? null });
    this.renderCurrentView();
  }

  zoomSpectrum(factor) {
    this.spectrum.zoom(factor, this.chart.cursor?.frequency ?? (this.spectrum.viewLow + this.spectrum.viewHigh) / 2);
    this.updateSpectrumViewReadout();
    this.chart.draw();
  }

  updateSpectrumViewReadout() {
    const el = document.querySelector('[data-live="spectrum-view"]');
    if (el) {
      const fmt = n => Math.abs(n - Math.round(n)) < 0.01 ? String(Math.round(n)) : n.toFixed(1);
      el.textContent = `${fmt(this.spectrum.viewLow)}–${fmt(this.spectrum.viewHigh)} MHz`;
    }
  }

  async startBle(follow, promiscuous, options = {}) {
    const device = this.requireDevice();
    if (this.surveyRun.active && !options.survey) await this.cancelSurveyRun('BLE mode changed manually');
    if (this.replay.active) this.exitReplay(false);
    if (this.soak.active) await this.finishSoak('STOPPED', 'BLE mode changed manually');
    await this.stopStream(false);

    const advertisingChannel = Number(this.prefs.get('bleFollowChannel') ?? 37);
    const crcVerify = Boolean(this.prefs.get('bleCrcVerify'));
    const targetAddress = String(this.prefs.get('bleTargetAddress') ?? '').trim();
    const targetMask = Math.max(1, Math.min(48, Number(this.prefs.get('bleTargetMask') ?? 48)));
    const accessText = String(this.prefs.get('blePromiscAccessAddress') ?? '').trim();

    await device.setCrcVerify(crcVerify);
    if (!promiscuous) {
      // Target filters persist in firmware. Easy/no-follow mode explicitly
      // clears them so a previous advanced session cannot silently hide ads.
      if (follow && targetAddress) await device.setTarget(targetAddress, targetMask);
      else await device.clearTarget();
    }
    if (promiscuous && accessText) {
      const clean = accessText.replace(/^0x/i, '');
      const value = Number.parseInt(clean, 16);
      if (!Number.isFinite(value) || clean.length > 8) throw new Error('Promiscuous access address must be up to 8 hexadecimal digits.');
      await device.setAccessAddress(value >>> 0);
    }

    await device.startBle({ follow, promiscuous, advertisingChannel });
    const mode = promiscuous ? 'ble-promisc' : follow ? 'ble-follow' : 'ble';
    const selectedChannels = promiscuous ? Array.from({length:37},(_,i)=>i) : follow ? Array.from({length:40},(_,i)=>i) : [advertisingChannel];
    this.lastStreamConfig = { type: 'ble', follow, promiscuous, advertisingChannel, crcVerify, targetAddress: follow ? targetAddress : '', targetMask: follow && targetAddress ? targetMask : 0, accessAddress: promiscuous ? accessText : '' };
    this.beginReadLoop(mode, selectedChannels);
    this.recorder.event('BLE scan started', { follow, promiscuous, advertisingChannel, crcVerify, targetAddress: follow ? targetAddress || null : null, targetMask: follow && targetAddress ? targetMask : 0, accessAddress: promiscuous ? accessText || null : null });
    if (options.navigate !== false) this.currentView = 'ble';
    this.renderCurrentView();
  }

  async startClassic() {
    const device = this.requireDevice();
    if (this.surveyRun.active) await this.cancelSurveyRun('Bluetooth Classic mode changed manually');
    if (this.replay.active) this.exitReplay(false);
    if (this.soak.active) await this.finishSoak('STOPPED', 'Bluetooth Classic mode started manually');
    await this.stopStream(false);
    const channelPref = String(this.prefs.get('classicChannel') ?? 'sweep');
    const channel = channelPref === 'sweep' ? 'sweep' : Number(channelPref);
    if (channel !== 'sweep' && (!Number.isInteger(channel) || channel < 0 || channel > 78)) throw new Error('Bluetooth Classic channel must be 0–78 or sweep.');
    const knownLapText = String(this.prefs.get('classicKnownLap') ?? '').trim();
    if (knownLapText && normalizeLap(knownLapText) === null) throw new Error('Known LAP must be up to six hexadecimal digits.');
    const maxErrors = Math.max(0, Math.min(4, Number(this.prefs.get('classicMaxErrors') ?? 0)));
    this.prefs.set('classicMaxErrors', maxErrors);
    await this.classicDecoder.initialize();
    await device.startClassic({ channel });
    const selectedChannels = channel === 'sweep' ? Array.from({length:79},(_,i)=>i) : [channel];
    this.lastStreamConfig = { type:'classic', channel, knownLap:knownLapText, maxErrors };
    this.beginReadLoop('classic', selectedChannels);
    this.recorder.event('Bluetooth Classic observation started', { channel, knownLap:knownLapText || null, maxErrors, decoder:this.classicDecoder.status }, 'info', null, 'CLASSIC');
    this.currentView = 'classic';
    this.renderCurrentView();
  }

  beginReadLoop(mode, selectedChannels = []) {
    if (this.replay.active) this.exitReplay(false);
    this.readToken += 1;
    const token = this.readToken;
    this.streaming = true; this.connectionState = 'STREAMING';
    this.devices.clear();
    this.channelActivity.reset();
    this.connectionTracker.reset();
    this.classicTracker.reset();
    this.telemetry.reset();
    this.selectedDeviceAddress = null;
    this.selectedConnectionAccessAddress = null;
    this.selectedClassicLap = null;
    this.selectedEventId = null;
    this.selectedPacket = null;
    this.inspectorHighlight = null;
    this.recorder.start(mode, selectedChannels);
    this.log(`${mode.toUpperCase()} STREAM STARTED`);
    this.readLoop(token);
  }

  async readLoop(token) {
    while (token === this.readToken && this.transport?.connected && this.streaming) {
      try {
        const data = await this.device.receivePacket();
        if (token !== this.readToken) break;
        if (!data) {
          await new Promise(r => setTimeout(r, 1));
          continue;
        }
        if (data.byteLength !== 64) throw new Error(`Malformed USB receive length: ${data.byteLength}`);
        const packet = parseUsbPacket(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), performance.now());
        packet.id = ++this.packetSeq;
        packet.wallTime = Date.now();
        if (packet.type === PacketType.LE_PACKET || packet.type === PacketType.LE_PROMISC) packet.ble = parseBlePacket(packet);
        if (packet.type === PacketType.BR_PACKET) packet.classic = await this.classicDecoder.decode(packet, { knownLap:this.prefs.get('classicKnownLap'), maxErrors:this.prefs.get('classicMaxErrors') });
        if (packet.ble?.malformed) this.recorder.malformed(new Error(`BLE PDU length ${packet.ble.length} exceeds retained USB payload`));
        this.recorder.addPacket(packet);
        this.telemetry.ingestPacket(packet);
        if (packet.type === PacketType.SPECAN) this.spectrum.ingest(parseSpectrumRecords(packet));
        if (packet.ble) { this.channelActivity.ingest(packet); this.updateConnection(packet); }
        if (packet.ble?.address) this.updateDevice(packet);
        if (packet.classic) this.updateClassic(packet);
      } catch (error) {
        if (token !== this.readToken) break;
        this.recorder.usbError(error); this.telemetry.noteHealth(this.recorder.stats()); this.recorder.stop(); this.log(error.message, 'error');
        this.streaming = false; this.connectionState = this.transport?.connected ? 'ERROR' : 'DISCONNECTED'; this.lastError = error.message;
        if (this.soak.active) this.finalizeSoakState('FAIL', error.message);
        this.renderCurrentView();
        break;
      }
    }
  }

  updateDevice(packet, emitEvents = true) {
    const result = ingestObservedDevice(this.devices, packet, packet.wallTime);
    if (!result.device || !emitEvents) return result.device;
    if (result.isNew) this.recorder.event('New advertiser detected', { address:result.device.address, localName:result.device.localName }, 'info', packet.id);
    else if (result.returned) this.recorder.event('Advertiser returned after quiet interval', { address:result.device.address }, 'info', packet.id);
    if (packet.ble?.pduTypeName === 'SCAN_RSP') this.recorder.event('Scan response observed', { address:result.device.address, localName:packet.ble.localName }, 'info', packet.id);
    return result.device;
  }

  updateConnection(packet, emitEvents = true) {
    const result = this.connectionTracker.ingest(packet);
    if (!emitEvents || !result.connection) return result.connection;
    const conn = result.connection;
    if (result.observedConnect) this.recorder.event('BLE connection establishment observed', { accessAddress:conn.accessAddressHex, initiator:conn.initiator, advertiser:conn.advertiser, intervalMs:conn.intervalMs, hopIncrement:conn.hopIncrement, channelMap:conn.channelMap }, 'info', packet.id, 'BLE');
    else if (result.created && conn.evidence === 'INFERRED') this.recorder.event('BLE data access address observed', { accessAddress:conn.accessAddressHex, evidence:'INFERRED', channel:packet.ble?.bleChannel }, 'info', packet.id, 'BLE');
    if (packet.ble?.llControl && !result.ended) this.recorder.event('BLE Link Layer control observed', { accessAddress:conn.accessAddressHex, control:packet.ble.llControl.name, decoded:packet.ble.llControl.decoded }, 'info', packet.id, 'BLE');
    if (result.ended) this.recorder.event('BLE termination control observed', { accessAddress:conn.accessAddressHex, reason:conn.terminationReason }, 'info', packet.id, 'BLE');
    return conn;
  }

  updateClassic(packet, emitEvents = true) {
    const result = this.classicTracker.ingest(packet);
    if (!emitEvents || !result.observation) return result.observation;
    const observation = result.observation;
    if (result.created) this.recorder.event('Bluetooth Classic LAP observed', { lap:observation.lapHex, channel:packet.classic.channel, acErrors:packet.classic.acErrors }, 'info', packet.id, 'CLASSIC');
    if (result.uapResolved) this.recorder.event('Bluetooth Classic UAP candidate stabilized', { lap:observation.lapHex, uap:`0x${observation.selectedUap.toString(16).padStart(2,'0').toUpperCase()}`, confidence:observation.uapConfidence }, 'info', packet.id, 'CLASSIC');
    return observation;
  }

  exportDevicesCsv() {
    const currentReplayRecord = this.replay.active && this.replay.index >= 0 ? this.replay.document?.packets?.[this.replay.index] : null;
    const observationTime = Number(currentReplayRecord?.wallTime ?? currentReplayRecord?.receivedAt ?? Date.now());
    return exportDeviceInventoryCsv(
      this.deviceList,
      device => deviceActivityState(device, observationTime),
      new Set(this.prefs.get('pinnedDevices') ?? []),
      new Set(this.prefs.get('hiddenDevices') ?? [])
    );
  }

  async stopStream(save = true) {
    if (!this.streaming) return;
    const token = ++this.readToken;
    this.streaming = false;
    try { await this.device?.stop(); } catch (error) { this.log(error.message, 'warning'); }
    this.recorder.stop();
    this.connectionState = this.transport?.connected ? 'CONNECTED' : 'DISCONNECTED';
    this.log(`STREAM STOPPED [${token}]`);
    if (save && this.recorder.packets.length) {
      try {
        await this.captureStore.save(captureJson(this.recorder, this.exportMetadata()));
        await this.refreshCaptureLibrary();
        this.log('CAPTURE SESSION SAVED TO INDEXEDDB');
      } catch (error) { this.log(`INDEXEDDB SAVE FAILED — ${error.message}`, 'warning'); }
    }
    this.renderCurrentView();
  }

  async resetFirmware() {
    const device = this.requireDevice();
    if (this.soak.active) await this.finishSoak('STOPPED', 'Firmware reset requested');
    else await this.stopStream(false);
    await device.resetFirmware();
    this.log('FIRMWARE RESET REQUESTED — USB re-enumeration expected', 'warning');
    this.recorder.event('Firmware reset requested', {}, 'warning');
    try { await this.transport?.disconnect(); } catch (_) {}
    this.streaming = false;
    this.connectionState = 'DISCONNECTED';
    this.device = null;
    this.deviceInfo = null;
    this.radioState = null;
    this.lastError = 'Firmware reset sent. After the device re-enumerates, use RECONNECT AUTHORIZED.';
    this.renderCurrentView();
    this.toast('Reset sent — reconnect after re-enumeration');
  }

  async validateHardware() {
    const device = this.requireDevice();
    if (this.streaming) throw new Error('Stop the active stream before running hardware validation.');
    this.validation = { status: 'RUNNING', rows: [], startedAt: Date.now(), simulated: this.simulation };
    this.renderCurrentView();
    this.log('HARDWARE VALIDATION STARTED');
    this.validation = await runHardwareValidation(device, this.transport);
    this.deviceInfo = device.info ?? this.deviceInfo;
    this.log(`HARDWARE VALIDATION ${this.validation.status} — ${this.validation.failures} failures, ${this.validation.warnings} warnings`, this.validation.status === 'FAIL' ? 'error' : this.validation.status === 'WARN' ? 'warning' : 'info');
    this.recorder.event('Hardware validation completed', { status: this.validation.status, failures: this.validation.failures, warnings: this.validation.warnings }, this.validation.status === 'FAIL' ? 'error' : this.validation.status === 'WARN' ? 'warning' : 'info');
    this.renderCurrentView();
  }

  async startSoak() {
    const device = this.requireDevice();
    if (this.soak.active) return;
    const mode = document.getElementById('soak-mode')?.value ?? 'ble';
    const durationSeconds = Number(document.getElementById('soak-duration')?.value ?? 300);
    if (![30, 300, 1800, 3600].includes(durationSeconds)) throw new Error('Unsupported soak duration.');
    await this.stopStream(false);
    const memory = browserHeapBytes();
    this.soak = {
      ...newSoakState(), active: true, status: 'RUNNING', mode,
      startedAt: Date.now(), targetDurationMs: durationSeconds * 1000,
      startTransportErrors: this.transport.transferErrors,
      startRecoveries: this.transport.stallRecoveries,
      memoryStart: memory, memoryPeak: memory
    };
    if (mode === 'spectrum') {
      const low = this.prefs.get('spectrumLow'); const high = this.prefs.get('spectrumHigh');
      await device.startSpectrum(low, high);
      this.lastStreamConfig = { type: 'spectrum', low, high };
      this.beginReadLoop('spectrum');
    } else if (mode === 'classic') {
      const channelPref=String(this.prefs.get('classicChannel')??'sweep'); const channel=channelPref==='sweep'?'sweep':Number(channelPref);
      await this.classicDecoder.initialize(); await device.startClassic({channel});
      this.lastStreamConfig={type:'classic',channel,knownLap:String(this.prefs.get('classicKnownLap')??''),maxErrors:Number(this.prefs.get('classicMaxErrors')??0)};
      this.beginReadLoop('classic',channel==='sweep'?Array.from({length:79},(_,i)=>i):[channel]);
    } else {
      await device.startBle({ follow: false, promiscuous: false, advertisingChannel: 37 });
      this.lastStreamConfig = { type: 'ble', follow: false, promiscuous: false, advertisingChannel: 37 };
      this.beginReadLoop('ble');
    }
    this.currentView = 'diagnostics';
    this.recorder.event('Soak test started', { mode, durationSeconds });
    this.log(`SOAK TEST STARTED — ${mode.toUpperCase()} / ${durationSeconds}s`);
    this.renderCurrentView();
  }

  updateSoak() {
    if (!this.soak.active || this.soakFinishing) return;
    const stats = this.recorder.stats();
    this.soak.durationMs = Date.now() - this.soak.startedAt;
    this.soak.maxPacketRate = Math.max(this.soak.maxPacketRate, stats.packetRate);
    const heap = browserHeapBytes();
    if (heap !== null) this.soak.memoryPeak = Math.max(this.soak.memoryPeak ?? heap, heap);
    if (this.soak.durationMs >= this.soak.targetDurationMs) {
      this.soakFinishing = true;
      this.finishSoak('COMPLETE', 'Target duration reached').catch(error => this.fail(error)).finally(() => { this.soakFinishing = false; });
    }
  }

  finalizeSoakState(requestedStatus = 'COMPLETE', reason = '') {
    if (!this.soak.active && this.soak.status !== 'RUNNING') return;
    const stats = this.recorder.stats();
    const transferErrorDelta = Math.max(0, (this.transport?.transferErrors ?? 0) - (this.soak.startTransportErrors ?? 0));
    const recoveryDelta = Math.max(0, (this.transport?.stallRecoveries ?? 0) - (this.soak.startRecoveries ?? 0));
    const connected = Boolean(this.transport?.connected);
    let status = requestedStatus;
    if (requestedStatus === 'COMPLETE') status = transferErrorDelta === 0 && stats.usbErrors === 0 && connected ? 'PASS' : 'FAIL';
    this.soak.active = false;
    this.soak.status = status;
    this.soak.completedAt = Date.now();
    this.soak.durationMs = this.soak.startedAt ? this.soak.completedAt - this.soak.startedAt : 0;
    this.soak.memoryEnd = browserHeapBytes();
    this.soak.reason = reason;
    this.soak.result = {
      packetsReceived: stats.packetsReceived,
      bytesReceived: stats.bytesReceived,
      ringDrops: stats.droppedPackets,
      malformedPackets: stats.malformedPackets,
      usbErrors: stats.usbErrors,
      transferErrors: transferErrorDelta,
      stallRecoveries: recoveryDelta,
      maxPacketRate: this.soak.maxPacketRate,
      connectedAtEnd: connected,
      memoryGrowthBytes: this.soak.memoryStart !== null && this.soak.memoryEnd !== null ? this.soak.memoryEnd - this.soak.memoryStart : null
    };
  }

  async finishSoak(requestedStatus = 'COMPLETE', reason = '') {
    if (!this.soak.active && this.soak.status !== 'RUNNING') return;
    if (this.streaming) await this.stopStream(false);
    this.finalizeSoakState(requestedStatus, reason);
    const level = this.soak.status === 'FAIL' ? 'error' : this.soak.status === 'STOPPED' ? 'warning' : 'info';
    this.log(`SOAK TEST ${this.soak.status} — ${reason}`, level);
    this.recorder.event('Soak test completed', { status: this.soak.status, reason, result: this.soak.result }, level);
    this.renderCurrentView();
  }

  async retryLastStream() {
    const cfg = this.lastStreamConfig;
    if (!cfg) throw new Error('No previous stream configuration is available.');
    const device = this.requireDevice();
    await this.stopStream(false);
    if (cfg.type === 'spectrum') {
      await device.startSpectrum(cfg.low, cfg.high);
      this.spectrum.configure(cfg.low, cfg.high);
      this.beginReadLoop('spectrum');
      this.currentView = 'spectrum';
    } else if (cfg.type === 'classic') {
      await this.classicDecoder.initialize();
      await device.startClassic({ channel:cfg.channel ?? 'sweep' });
      const selectedChannels = cfg.channel === 'sweep' ? Array.from({length:79},(_,i)=>i) : [Number(cfg.channel)];
      this.beginReadLoop('classic', selectedChannels);
      this.currentView = 'classic';
    } else {
      await device.setCrcVerify(Boolean(cfg.crcVerify));
      if (!cfg.promiscuous) {
        if (cfg.follow && cfg.targetAddress) await device.setTarget(cfg.targetAddress, cfg.targetMask ?? 48);
        else await device.clearTarget();
      }
      if (cfg.promiscuous && cfg.accessAddress) {
        const clean = String(cfg.accessAddress).replace(/^0x/i, '');
        const value = Number.parseInt(clean, 16);
        if (Number.isFinite(value)) await device.setAccessAddress(value >>> 0);
      }
      await device.startBle({ follow: cfg.follow, promiscuous: cfg.promiscuous, advertisingChannel: cfg.advertisingChannel ?? 37 });
      const selectedChannels = cfg.promiscuous ? Array.from({length:37},(_,i)=>i) : cfg.follow ? Array.from({length:40},(_,i)=>i) : [cfg.advertisingChannel ?? 37];
      this.beginReadLoop(cfg.promiscuous ? 'ble-promisc' : cfg.follow ? 'ble-follow' : 'ble', selectedChannels);
      this.currentView = 'ble';
    }
    this.recorder.event('Last stream configuration retried', cfg);
    this.log('LAST STREAM CONFIGURATION RETRIED');
    this.renderCurrentView();
  }

  async healthCheckAfterResume() {
    if (this.resumeCheckPending || !this.transport?.connected || !this.device || this.streaming) return;
    this.resumeCheckPending = true;
    try {
      await this.device.ping();
      if (this.connectionState === 'ERROR') this.connectionState = 'CONNECTED';
      this.log('RESUME HEALTH CHECK → PING OK');
    } catch (error) {
      this.connectionState = this.transport?.connected ? 'ERROR' : 'DISCONNECTED';
      this.lastError = error.message;
      this.log(`RESUME HEALTH CHECK FAILED — ${error.message}`, 'error');
      this.renderCurrentView();
      throw error;
    } finally {
      this.resumeCheckPending = false;
    }
  }

  async applyRadio() {
    const d=this.requireDevice();
    const channel=Number(document.getElementById('radio-channel').value); const mod=Number(document.getElementById('radio-mod').value); const squelch=Number(document.getElementById('radio-squelch').value);
    await d.setChannel(channel); await d.setModulation(mod); await d.setSquelch(squelch); this.radioState=await d.queryRadioState(); this.log('RADIO SETTINGS APPLIED AND READ BACK'); this.renderCurrentView();
  }

  async applyToggles() {
    const d=this.requireDevice();
    await d.setBool('SET_PAEN', document.getElementById('radio-paen').checked); await d.setBool('SET_HGM', document.getElementById('radio-hgm').checked); await d.setBool('SET_CRC_VERIFY', document.getElementById('radio-crc').checked);
    await d.setBool('SET_USRLED', document.getElementById('radio-userled').checked); await d.setBool('SET_RXLED', document.getElementById('radio-rxled').checked); await d.setBool('SET_TXLED', document.getElementById('radio-txled').checked);
    this.radioState=await d.queryRadioState(); this.renderCurrentView();
  }

  async setTarget() {
    const mac=document.getElementById('target-mac').value; const mask=Number(document.getElementById('target-mask').value); await this.requireDevice().setTarget(mac,mask); this.recorder.event('BLE target selected',{mac,mask}); this.toast('BLE target set');
  }

  async setAccessAddress() {
    const text=document.getElementById('access-address').value.trim().replace(/^0x/i,''); const value=parseInt(text,16); if(!Number.isFinite(value))throw new Error('Invalid access address.'); await this.requireDevice().setAccessAddress(value); this.radioState=await this.device.queryRadioState(); this.renderCurrentView();
  }


  activeSurveyProject() {
    const selected = this.surveyProjects.find(project => project.id === this.prefs.get('surveyActiveProjectId'));
    return selected ?? this.surveyProjects[0] ?? null;
  }

  async refreshSurveyLibrary() {
    this.surveyProjects = await this.surveyStore.list();
    const current = this.prefs.get('surveyActiveProjectId');
    if (this.surveyProjects.length && !this.surveyProjects.some(project => project.id === current)) this.prefs.set('surveyActiveProjectId', this.surveyProjects[0].id);
    if (this.currentView === 'survey') this.renderCurrentView();
    return this.surveyProjects;
  }

  async createSurveyProject() {
    const input = document.getElementById('survey-project-name');
    const project = newSurveyProject(input?.value?.trim() || `RF Survey ${new Date().toLocaleDateString()}`);
    await this.surveyStore.save(project);
    this.prefs.set('surveyActiveProjectId', project.id);
    this.prefs.set('surveyCompareA', ''); this.prefs.set('surveyCompareB', '');
    await this.refreshSurveyLibrary();
    this.toast('Survey project created');
  }

  async deleteSurveyProject() {
    const project = this.activeSurveyProject();
    if (!project) return;
    if (!window.confirm(`Delete local survey “${project.name}” and its stations?`)) return;
    await this.surveyStore.remove(project.id);
    this.prefs.set('surveyActiveProjectId', ''); this.prefs.set('surveyCompareA', ''); this.prefs.set('surveyCompareB', '');
    await this.refreshSurveyLibrary();
    this.toast('Survey project deleted');
  }

  async deleteSurveyStation(stationId) {
    if (this.surveyRun.active) throw new Error('Cancel the active station measurement before deleting survey data.');
    const project = this.activeSurveyProject();
    if (!project) return;
    project.stations = (project.stations ?? []).filter(station => station.id !== stationId);
    project.updatedAt = Date.now();
    await this.surveyStore.save(project);
    if (this.prefs.get('surveyCompareA') === stationId) this.prefs.set('surveyCompareA', '');
    if (this.prefs.get('surveyCompareB') === stationId) this.prefs.set('surveyCompareB', '');
    await this.refreshSurveyLibrary();
  }

  async startSurveyStation() {
    const project = this.activeSurveyProject();
    if (!project) throw new Error('Create or select an RF survey project first.');
    this.requireDevice();
    if (this.replay.active) this.exitReplay(false);
    if (this.streaming) await this.stopStream(false);
    const stationName = document.getElementById('survey-station-name')?.value?.trim() || `Station ${(project.stations?.length ?? 0) + 1}`;
    const note = document.getElementById('survey-station-note')?.value?.trim() || '';
    const seconds = Math.max(5, Math.min(300, Number(this.prefs.get('surveySampleSeconds') ?? 30)));
    const now = Date.now();
    this.surveyRun = { active:true, stage:'spectrum', projectId:project.id, stationName, note, startedAt:now, phaseStartedAt:now, phaseDurationMs:seconds*1000, spectrumSample:null };
    this.currentView = 'survey';
    this.log(`RF SURVEY STATION START — ${stationName} / spectrum ${seconds}s`);
    await this.startSpectrum({ survey:true, navigate:false });
    this.renderCurrentView();
  }

  updateSurveyRun() {
    if (!this.surveyRun.active || this.surveyTransitionPending) return;
    const elapsed = Date.now() - Number(this.surveyRun.phaseStartedAt ?? Date.now());
    if (elapsed < Number(this.surveyRun.phaseDurationMs ?? 0)) return;
    this.surveyTransitionPending = true;
    this.advanceSurveyRun().catch(error => {
      this.surveyRun.active = false;
      this.fail(error);
    }).finally(() => { this.surveyTransitionPending = false; });
  }

  async advanceSurveyRun() {
    if (!this.surveyRun.active) return;
    const now = Date.now();
    if (this.surveyRun.stage === 'spectrum') {
      this.surveyRun.spectrumSample = buildSpectrumSurveySample(this.spectrum, { startedAt:this.surveyRun.phaseStartedAt, endedAt:now });
      await this.stopStream(false);
      this.surveyRun.stage = 'ble';
      this.surveyRun.phaseStartedAt = Date.now();
      this.log(`RF SURVEY BLE PHASE — ${this.surveyRun.stationName}`);
      await this.startBle(false, false, { survey:true, navigate:false });
      this.currentView = 'survey';
      this.renderCurrentView();
      return;
    }
    if (this.surveyRun.stage === 'ble') {
      const bleSample = buildBleSurveySample(this.recorder.packets.toArray(), this.deviceList, this.connectionTracker.list(), { startedAt:this.surveyRun.phaseStartedAt, endedAt:now });
      bleSample.configuration = { advertisingChannel:Number(this.prefs.get('bleFollowChannel') ?? 37), mode:'advertisements/no-follow' };
      await this.stopStream(false);
      const project = this.surveyProjects.find(item => item.id === this.surveyRun.projectId);
      if (!project) throw new Error('Active survey project was not found while saving the station.');
      const station = finalizeSurveyStation({ name:this.surveyRun.stationName, note:this.surveyRun.note, startedAt:this.surveyRun.startedAt, endedAt:now, spectrum:this.surveyRun.spectrumSample, ble:bleSample });
      project.stations = [...(project.stations ?? []), station];
      project.updatedAt = now;
      await this.surveyStore.save(project);
      if (!this.prefs.get('surveyCompareA')) this.prefs.set('surveyCompareA', station.id);
      else if (!this.prefs.get('surveyCompareB')) this.prefs.set('surveyCompareB', station.id);
      this.surveyRun = { active:false, stage:'complete', projectId:project.id, stationName:station.name, note:station.note, startedAt:station.startedAt, phaseStartedAt:null, phaseDurationMs:0, spectrumSample:null };
      await this.refreshSurveyLibrary();
      this.log(`RF SURVEY STATION SAVED — ${station.name}`);
      this.toast(`Survey station saved: ${station.name}`);
    }
  }

  async cancelSurveyRun(reason = 'Canceled') {
    if (!this.surveyRun.active) return;
    const name=this.surveyRun.stationName;
    this.surveyRun = { ...this.surveyRun, active:false, stage:'canceled' };
    if (this.streaming) await this.stopStream(false);
    this.log(`RF SURVEY STATION CANCELED — ${name} / ${reason}`, 'warning');
    this.renderCurrentView();
  }

  async refreshCaptureLibrary() {
    this.captureLibrary = await this.captureStore.list();
    if (this.currentView === 'capture') this.renderCurrentView();
    return this.captureLibrary;
  }

  async saveCurrentCapture() {
    if (!this.recorder.packets.length && !this.replay.document?.packets?.length) throw new Error('There is no capture data to save.');
    const requested = document.getElementById('capture-name')?.value?.trim();
    if (requested) this.recorder.sessionName = requested;
    let documentToSave;
    if (this.replay.active && this.replay.document) {
      if (requested) {
        this.replay.document.name = requested;
        if (this.replay.document.session) this.replay.document.session.name = requested;
      }
      documentToSave = this.replay.document;
    } else {
      documentToSave = captureJson(this.recorder, this.exportMetadata());
    }
    await this.captureStore.save(documentToSave);
    await this.refreshCaptureLibrary();
    this.toast('Capture saved locally');
  }

  async renameCurrentCapture(name) {
    const clean = String(name ?? '').trim();
    if (!clean) return;
    this.recorder.sessionName = clean;
    if (this.replay.document) {
      this.replay.document.name = clean;
      if (this.replay.document.session) this.replay.document.session.name = clean;
    }
  }

  async handleCaptureAction(action, id) {
    if (action === 'open') {
      const doc = await this.captureStore.get(id);
      if (!doc) throw new Error('Saved capture not found.');
      await this.loadReplayDocument(doc);
      return;
    }
    if (action === 'rename') {
      const existing = this.captureLibrary.find(row => row.id === id);
      const name = window.prompt('Capture name', existing?.name ?? 'Capture');
      if (!name?.trim()) return;
      await this.captureStore.rename(id, name.trim());
      if (this.replay.document?.id === id) await this.renameCurrentCapture(name.trim());
      await this.refreshCaptureLibrary();
      return;
    }
    if (action === 'duplicate') {
      await this.captureStore.duplicate(id);
      await this.refreshCaptureLibrary();
      this.toast('Capture duplicated');
      return;
    }
    if (action === 'delete') {
      if (!window.confirm('Delete this local capture?')) return;
      await this.captureStore.remove(id);
      if (this.replay.document?.id === id) this.exitReplay(false);
      await this.refreshCaptureLibrary();
      this.renderCurrentView();
    }
  }

  async importCaptureFile(file) {
    const text = await file.text();
    let doc;
    try { doc = validateCaptureDocument(JSON.parse(text)); }
    catch (error) { throw new Error(`Capture import failed: ${error.message}`); }
    const sourceId = doc.id ?? doc.session?.id ?? null;
    const id = `capture-import-${Date.now()}`;
    doc = structuredClone(doc);
    doc.id = id;
    doc.name = doc.name ?? doc.session?.name ?? file.name.replace(/\.json$/i, '') ?? 'Imported capture';
    doc.metadata = { ...(doc.metadata ?? {}), importedFrom: file.name, sourceCaptureId: sourceId };
    doc.session = { ...(doc.session ?? {}), id, name: doc.name, source: 'imported' };
    await this.captureStore.save(doc);
    await this.refreshCaptureLibrary();
    await this.loadReplayDocument(doc);
    this.toast('Capture imported and opened in Replay Mode');
  }

  async loadReplayDocument(input) {
    if (this.streaming) await this.stopStream(true);
    this.replayPause(false);
    const doc = validateCaptureDocument(input);
    this.replay = {
      active: true,
      playing: false,
      speed: this.replay.speed || 1,
      document: doc,
      range: replayRange(doc),
      index: -1,
      timer: null,
      sourceEvents: Array.isArray(doc.events) ? doc.events : []
    };
    this.devices.clear();
    this.channelActivity.reset();
    this.connectionTracker.reset();
    this.classicTracker.reset();
    this.telemetry.reset();
    this.selectedDeviceAddress = null;
    this.selectedConnectionAccessAddress = null;
    this.selectedClassicLap = null;
    this.selectedEventId = null;
    this.selectedPacket = null;
    this.inspectorHighlight = null;
    this.spectrum.clear();
    this.recorder.clear();
    this.recorder.start('replay', [], {
      id: doc.id ?? doc.session?.id,
      name: doc.name ?? doc.session?.name,
      source: 'replay',
      startedAt: this.replay.range.start || Date.now(),
      createdAt: doc.session?.createdAt ?? this.replay.range.start,
      silent: true
    });
    this.recorder.stoppedAt = this.recorder.startedAt;
    this.currentView = 'capture';
    this.log(`REPLAY LOADED — ${doc.name ?? 'capture'} / ${doc.packets.length} packets`);
    this.renderCurrentView();
  }

  replayPause(render = true) {
    if (this.replay.timer) clearTimeout(this.replay.timer);
    this.replay.timer = null;
    this.replay.playing = false;
    if (render) this.renderCurrentView();
  }

  replayPlay() {
    if (!this.replay.active) throw new Error('Open a capture before starting replay.');
    if (this.replay.playing) return;
    if (this.replay.index >= this.replay.document.packets.length - 1) this.replaySeek(-1, false);
    this.replay.playing = true;
    this.recorder.event('Replay started', { speed: this.replay.speed });
    this.scheduleReplayPacket();
    this.renderCurrentView();
  }

  scheduleReplayPacket() {
    if (!this.replay.active || !this.replay.playing) return;
    const nextIndex = this.replay.index + 1;
    if (nextIndex >= this.replay.document.packets.length) {
      this.replayPause(false);
      this.recorder.event('Replay completed');
      this.renderCurrentView();
      return;
    }
    const currentRecord = this.replay.index >= 0 ? this.replay.document.packets[this.replay.index] : null;
    const nextRecord = this.replay.document.packets[nextIndex];
    const currentTime = Number(currentRecord?.wallTime ?? currentRecord?.receivedAt ?? nextRecord.wallTime ?? 0);
    const nextTime = Number(nextRecord.wallTime ?? nextRecord.receivedAt ?? currentTime);
    const delay = this.replay.index < 0 ? 0 : Math.max(0, (nextTime - currentTime) / Math.max(0.05, this.replay.speed));
    this.replay.timer = setTimeout(() => {
      this.replay.timer = null;
      this.appendReplayPacket(nextIndex);
      this.scheduleReplayPacket();
    }, delay);
  }

  appendReplayPacket(index) {
    const record = this.replay.document?.packets?.[index];
    if (!record) return null;
    const packet = deserializePacket(record);
    this.packetSeq = Math.max(this.packetSeq, packet.id || 0);
    this.recorder.addPacket(packet);
    this.telemetry.ingestPacket(packet, packet.wallTime);
    if (packet.ble?.malformed) this.recorder.malformedPackets += 1;
    this.recorder.stoppedAt = packet.wallTime;
    if (packet.type === PacketType.SPECAN) this.spectrum.ingest(parseSpectrumRecords(packet), packet.wallTime);
    if (packet.ble) { this.channelActivity.ingest(packet, packet.wallTime); this.updateConnection(packet, false); }
    if (packet.ble?.address) this.updateDevice(packet, false);
    if (packet.classic) this.updateClassic(packet, false);
    this.replay.index = index;
    return packet;
  }

  replayStep(direction = 1) {
    if (!this.replay.active) throw new Error('Open a capture before stepping replay.');
    this.replayPause(false);
    if (direction < 0) return this.replaySeek(this.replay.index - 1);
    if (this.replay.index < this.replay.document.packets.length - 1) this.appendReplayPacket(this.replay.index + 1);
    this.renderCurrentView();
  }

  replaySeek(index, render = true) {
    if (!this.replay.active) return;
    this.replayPause(false);
    const max = this.replay.document.packets.length - 1;
    const target = Math.max(-1, Math.min(max, Math.round(Number(index))));
    const id = this.replay.document.id ?? this.replay.document.session?.id;
    const name = this.replay.document.name ?? this.replay.document.session?.name;
    this.devices.clear();
    this.channelActivity.reset();
    this.connectionTracker.reset();
    this.classicTracker.reset();
    this.telemetry.reset();
    this.selectedDeviceAddress = null;
    this.selectedConnectionAccessAddress = null;
    this.selectedClassicLap = null;
    this.selectedEventId = null;
    this.selectedPacket = null;
    this.inspectorHighlight = null;
    this.spectrum.clear();
    this.recorder.clear();
    this.recorder.start('replay', [], { id, name, source:'replay', startedAt:this.replay.range.start || Date.now(), silent:true });
    this.recorder.stoppedAt = this.recorder.startedAt;
    this.replay.index = -1;
    for (let i = 0; i <= target; i += 1) this.appendReplayPacket(i);
    if (render) this.renderCurrentView();
  }

  exitReplay(render = true) {
    this.replayPause(false);
    this.replay = { active:false, playing:false, speed:this.replay.speed || 1, document:null, range:{start:0,end:0,durationMs:0}, index:-1, timer:null, sourceEvents:[] };
    this.recorder.clear();
    this.devices.clear();
    this.channelActivity.reset();
    this.connectionTracker.reset();
    this.classicTracker.reset();
    this.telemetry.reset();
    this.selectedDeviceAddress = null;
    this.selectedConnectionAccessAddress = null;
    this.selectedClassicLap = null;
    this.selectedEventId = null;
    this.selectedPacket = null;
    this.inspectorHighlight = null;
    this.spectrum.clear();
    if (render) this.renderCurrentView();
  }

  async handleDeviceAction(action, address) {
    if (!address) return;
    const pinned = new Set(this.prefs.get('pinnedDevices') ?? []);
    const hidden = new Set(this.prefs.get('hiddenDevices') ?? []);
    if (action === 'pin') {
      pinned.has(address) ? pinned.delete(address) : pinned.add(address);
      this.prefs.set('pinnedDevices', [...pinned]);
      this.renderCurrentView();
      return;
    }
    if (action === 'hide') {
      hidden.add(address); this.prefs.set('hiddenDevices', [...hidden]); this.renderCurrentView(); return;
    }
    if (action === 'unhide') {
      hidden.delete(address); this.prefs.set('hiddenDevices', [...hidden]); this.renderCurrentView(); return;
    }
    if (action === 'inspect') { this.selectedDeviceAddress = address; this.renderCurrentView(); return; }
    if (action === 'packets') { this.prefs.set('packetSearch', address); this.currentView = 'packets'; this.renderCurrentView(); return; }
    if (action === 'target') {
      this.prefs.set('bleTargetAddress', address);
      this.prefs.set('bleTargetMask', 48);
      await this.requireDevice().setTarget(address, 48);
      this.recorder.event('BLE target selected from device inventory', { address, mask:48 }, 'info', null, 'BLE');
      this.toast('Passive BLE target set');
      this.renderCurrentView();
    }
  }

  selectActivityChannel(channel) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 39) return;
    this.prefs.set('selectedBleChannel', channel);
    this.prefs.set('packetChannelFilter', String(channel));
    this.renderCurrentView();
  }

  selectedEvent() {
    const events = this.replay.active ? (this.replay.sourceEvents ?? []) : this.recorder.events.toArray();
    return events.find(event => event.id === this.selectedEventId) ?? null;
  }

  updateSelectedEventAnnotation(patch) {
    const event = this.selectedEvent();
    if (!event) return;
    event.annotation = { bookmarked:false,note:'',tags:[],...(event.annotation??{}),...patch };
    if (typeof event.annotation.tags === 'string') event.annotation.tags = event.annotation.tags.split(',').map(x=>x.trim()).filter(Boolean);
    event.annotation.tags = [...new Set((event.annotation.tags ?? []).map(String))];
    if (!this.replay.active) this.recorder.annotateEvent(event.id, event.annotation);
    this.renderCurrentView();
  }

  toggleSelectedEventBookmark() {
    const event = this.selectedEvent();
    if (!event) return;
    this.updateSelectedEventAnnotation({ bookmarked:!Boolean(event.annotation?.bookmarked) });
  }

  async applyBleTarget() {
    const d = this.requireDevice();
    const address = String(this.prefs.get('bleTargetAddress') ?? '').trim();
    const mask = Math.max(1, Math.min(48, Number(this.prefs.get('bleTargetMask') ?? 48)));
    if (!address) throw new Error('Enter a Bluetooth address before applying a passive target filter.');
    await d.setTarget(address, mask);
    this.recorder.event('BLE passive target filter applied', { address, mask }, 'info', null, 'BLE');
    this.toast(`Passive target ${address}/${mask} applied`);
  }

  async clearBleTarget() {
    await this.requireDevice().clearTarget();
    this.prefs.set('bleTargetAddress','');
    this.recorder.event('BLE passive target filter cleared', {}, 'info', null, 'BLE');
    this.toast('Passive target cleared');
    this.renderCurrentView();
  }

  async applyBleAccessAddress() {
    const text = String(this.prefs.get('blePromiscAccessAddress') ?? '').trim().replace(/^0x/i,'');
    if (!text || !/^[0-9a-f]{1,8}$/i.test(text)) throw new Error('Enter an access address as up to 8 hexadecimal digits.');
    const value = Number.parseInt(text,16) >>> 0;
    const readback = await this.requireDevice().setAccessAddress(value);
    this.radioState = { ...(this.radioState ?? {}), accessAddress:readback };
    this.recorder.event('BLE access address configured for passive promiscuous monitoring', { accessAddress:`0x${value.toString(16).padStart(8,'0').toUpperCase()}` }, 'info', null, 'BLE');
    this.toast('Access address applied');
  }

  async applyBleCrc() {
    const state = Boolean(this.prefs.get('bleCrcVerify'));
    const readback = await this.requireDevice().setCrcVerify(state);
    this.radioState = { ...(this.radioState ?? {}), crcVerify:readback };
    this.recorder.event('BLE CRC verification changed', { enabled:readback }, 'info', null, 'BLE');
    this.toast(`CRC verification ${readback?'enabled':'disabled'}`);
  }

  exportPacketsForInterop() {
    if (!this.replay.active) return this.recorder.packets.toArray();
    return (this.replay.document?.packets ?? []).map(deserializePacket);
  }

  exportPcap(pcapng = false) {
    const result = pcapng ? exportBlePcapng(this.exportPacketsForInterop()) : exportBlePcap(this.exportPacketsForInterop());
    this.recorder.event(`${pcapng?'PCAPNG':'PCAP'} export created`, { exported:result.exported, excluded:result.excluded, linkType:result.linkType }, 'info', null, 'CAPTURE');
    this.toast(`${pcapng?'PCAPNG':'PCAP'}: ${result.exported} BLE packets exported${result.excluded?`, ${result.excluded} excluded`:''}`);
    return result;
  }

  exportEvidenceBundle() {
    const packets = this.exportPacketsForInterop();
    if (!packets.length) throw new Error('There is no capture data to package.');
    const captureDocument = this.replay.active && this.replay.document ? this.replay.document : captureJson(this.recorder, this.exportMetadata());
    const events = this.replay.active ? (this.replay.sourceEvents ?? []) : this.recorder.events.toArray();
    const result = exportEvidencePackage({ captureDocument, packets, events, diagnostics:this.diagnosticsDocument() });
    this.recorder.event('Evidence package exported', { entries:result.entries, pcapEligible:result.manifest.packets.pcapEligible, pcapExcluded:result.manifest.packets.pcapExcluded }, 'info', null, 'CAPTURE');
    this.toast(`Evidence package exported · ${result.entries.length} files`);
    return result;
  }

  navigatePacket(direction, mode = 'all') {
    const packets = this.recorder.packets.toArray();
    if (!packets.length) return;
    let index = this.selectedPacket ? packets.findIndex(packet => packet.id === this.selectedPacket.id) : (direction > 0 ? -1 : packets.length);
    const selected = this.selectedPacket;
    const predicate = packet => {
      if (mode === 'device') return selected?.classic?.lapHex ? packet.classic?.lapHex === selected.classic.lapHex : Boolean(selected?.ble?.address) && packet.ble?.address === selected.ble.address;
      if (mode === 'channel') return selected?.classic?.channel !== null && selected?.classic?.channel !== undefined ? packet.classic?.channel === selected.classic.channel : selected?.ble?.bleChannel !== null && selected?.ble?.bleChannel !== undefined && packet.ble?.bleChannel === selected.ble.bleChannel;
      if (mode === 'malformed') return Boolean(packet.ble?.malformed);
      return true;
    };
    for (let i = index + direction; i >= 0 && i < packets.length; i += direction) {
      if (predicate(packets[i])) { this.selectedPacket = packets[i]; this.inspectorHighlight = null; this.renderCurrentView(); return; }
    }
  }

  toggleSelectedBookmark() {
    if (!this.selectedPacket) return;
    const bookmarked = !Boolean(this.selectedPacket.annotation?.bookmarked);
    this.updateSelectedAnnotation({ bookmarked });
    this.recorder.event(bookmarked ? 'Packet bookmarked' : 'Packet bookmark removed', {}, 'info', this.selectedPacket.id);
    this.renderCurrentView();
  }

  updateSelectedAnnotation(patch) {
    if (!this.selectedPacket) return;
    const annotation = this.recorder.setAnnotation(this.selectedPacket.id, patch);
    if (!annotation) return;
    this.selectedPacket.annotation = annotation;
    if (this.replay.active && this.replay.document) {
      const record = this.replay.document.packets.find(packet => Number(packet.id) === Number(this.selectedPacket.id));
      if (record) record.annotation = structuredClone(annotation);
    }
  }

  setMode(mode) {
    if (!['easy', 'advanced'].includes(mode) || mode === this.mode) return;
    this.prefs.set('mode', mode);
    if (mode === 'easy' && ['channels','timeline','classic','radio','diagnostics'].includes(this.currentView)) this.currentView = 'connect';
    this.renderCurrentView();
  }

  applySettings() {
    this.prefs.set('theme', document.getElementById('theme-light').checked ? 'light':'dark');
    this.prefs.set('navCollapsed', document.getElementById('nav-collapsed').checked);
    this.applyTheme();
    this.renderCurrentView();
  }

  async clearLocal() {
    if (!confirm('Clear UberToothGUI preferences and saved local captures?')) return;
    this.prefs.reset(); await this.captureStore.clear(); await this.surveyStore.clear(); this.exitReplay(false); this.recorder.clear(); this.captureLibrary=[]; this.surveyProjects=[]; this.surveyRun={active:false,stage:'idle',projectId:null,stationName:'',note:'',startedAt:null,phaseStartedAt:null,phaseDurationMs:0,spectrumSample:null}; this.devices.clear(); this.channelActivity.reset(); this.connectionTracker.reset(); this.telemetry.reset(); this.selectedEventId=null; this.selectedPacket=null; this.selectedDeviceAddress=null; this.selectedConnectionAccessAddress=null; this.inspectorHighlight=null; this.applyTheme(); this.renderCurrentView(); this.toast('Local state cleared');
  }

  selectPacket(id) {
    let packet = this.recorder.packets.toArray().find(p => p.id === id);
    if (!packet && this.replay.active && this.replay.document) {
      const index = this.replay.document.packets.findIndex(record => Number(record.id) === Number(id));
      if (index >= 0) {
        this.replaySeek(index, false);
        packet = this.recorder.packets.toArray().find(p => Number(p.id) === Number(id));
      }
    }
    if (!packet) return;
    this.selectedPacket = packet;
    this.inspectorHighlight = null;
    if (this.currentView !== 'packets') this.currentView = 'packets';
    this.renderCurrentView();
  }

  async copySelectedHex() {
    if(!this.selectedPacket)return; await navigator.clipboard.writeText(toHexCompact(this.selectedPacket.raw)); this.toast('Packet hex copied');
  }

  liveTick() {
    const tick = performance.now();
    const gap = tick - this.lastTickAt;
    this.lastTickAt = tick;
    if (gap > 2500) {
      this.log(`BROWSER EXECUTION GAP DETECTED — ${(gap / 1000).toFixed(1)} s`, 'warning');
      this.recorder.event('Browser execution gap detected', { gapMs: Math.round(gap) }, 'warning');
      this.healthCheckAfterResume().catch(error => this.log(`RESUME HEALTH CHECK FAILED — ${error.message}`, 'error'));
    }
    this.updateSoak();
    this.updateSurveyRun();
    this.telemetry.noteHealth(this.recorder.stats(), this.analysisTime());
    this.updateHeader(); this.updateStatusBar();
    if (this.currentView === 'spectrum') {
      if (!this.spectrumPaused) this.chart.draw();
      const metrics=document.querySelector('[data-live="spectrum-metrics"]'); if(metrics)metrics.innerHTML=spectrumMetrics(this.state());
    }
    if (this.currentView === 'ble') {
      const liveState=this.state();
      const rows=document.querySelector('[data-live="ble-rows"]'); if(rows)rows.innerHTML=bleRows(liveState);
      const metrics=document.querySelector('[data-live="ble-metrics"]'); if(metrics)metrics.innerHTML=bleMetrics(liveState);
      const preview=document.querySelector('[data-live="ble-device-preview"]'); if(preview)preview.innerHTML=bleDevicePreviewContent(liveState);
    }
    const now=performance.now();
    const activeAnalysis = this.streaming || (this.replay.active && this.replay.playing);
    const needsLifecycleRefresh = ['devices','overview'].includes(this.currentView) && !this.replay.active;
    if ((activeAnalysis || needsLifecycleRefresh) && now-this.lastFullRefresh>1000 && ['overview','survey','devices','channels','classic','timeline','packets','capture','diagnostics'].includes(this.currentView)) { this.lastFullRefresh=now; this.renderCurrentView(); }
  }

  analysisTime() {
    if (this.replay.active && this.replay.index >= 0) {
      const record = this.replay.document?.packets?.[this.replay.index];
      return Number(record?.wallTime ?? record?.receivedAt ?? Date.now());
    }
    return Date.now();
  }
  applyTheme() { document.documentElement.dataset.theme = this.prefs.get('theme'); }
  requireDevice() { if(!this.device||!this.transport?.connected)throw new Error('Connect an Ubertooth One or Simulation first.'); return this.device; }
  exportMetadata() { return { source:this.simulation?'simulation':'webusb', deviceInfo:this.deviceInfo, transport:this.transport?.describe() ?? null, spectrum:this.spectrum.summary(), classic:{decoder:this.classicDecoder.status,channel:this.prefs.get('classicChannel'),knownLap:this.prefs.get('classicKnownLap'),maxErrors:this.prefs.get('classicMaxErrors')} }; }
  diagnosticsDocument() { return { application:{name:APP_NAME,version:APP_VERSION_LABEL}, exportedAt:new Date().toISOString(), connectionState:this.connectionState, simulation:this.simulation, deviceInfo:this.deviceInfo, radioState:this.radioState, transport:this.transport?.describe()??null, spectrum:this.spectrum.summary(), channelActivity:this.channelActivity.summary(), connections:this.connectionTracker.list().map(c=>({...c,channels:Array.from(c.channels)})), classic:{decoder:{status:this.classicDecoder.status,lastError:this.classicDecoder.lastError},observations:this.classicTracker.list()}, telemetry:this.telemetry.summary(), validation:this.validation, soak:this.soak, lastStreamConfig:this.lastStreamConfig, survey:{active:this.surveyRun.active,projectCount:this.surveyProjects.length,activeProjectId:this.prefs.get('surveyActiveProjectId')}, lastControl:this.transport?.lastControl??null, lastTransfer:this.transport?.lastTransfer??null, logs:this.logs, captureStats:this.recorder.stats() }; }

  log(message, level='info') { this.logs.push({time:Date.now(),level,message}); if(this.logs.length>2000)this.logs.splice(0,this.logs.length-2000); }
  fail(error) { this.lastError=error?.message??String(error); this.log(this.lastError,'error'); this.toast(this.lastError,true); this.renderCurrentView(); }
  toast(message,error=false) { const el=document.getElementById('toast'); el.textContent=message; el.className=`toast show ${error?'error':''}`; clearTimeout(this.toastTimer); this.toastTimer=setTimeout(()=>el.className='toast',2600); }
}

const app = new App();
window.addEventListener('DOMContentLoaded', () => app.start());
