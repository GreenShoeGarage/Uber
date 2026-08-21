const DEFAULTS = Object.freeze({
  mode: 'easy',
  theme: 'dark',
  navCollapsed: false,
  spectrumLow: 2402,
  spectrumHigh: 2480,
  averaging: 28,
  spectrumPersistence: 40,
  peakHold: true,
  waterfallSpeed: 1,
  waterfallRows: 180,
  spectrumRssiMin: -110,
  spectrumRssiMax: -20,
  spectrumBleOverlay: true,
  spectrumWifiOverlay: true,
  packetSearch: '',
  packetFilter: 'all',
  packetChannelFilter: 'all',
  deviceSearch: '',
  deviceSort: 'lastSeen',
  deviceActivityFilter: 'all',
  deviceChannelFilter: 'all',
  devicePinnedOnly: false,
  deviceShowHidden: false,
  selectedBleChannel: 37,
  channelActivityWindowMs: 5000,
  overviewChannelMetric: 'rate',
  overviewChannelWindow: '10000',
  overviewRateWindow: 120,
  eventSearch: '',
  eventCategoryFilter: 'all',
  eventLevelFilter: 'all',
  bleFollowChannel: 37,
  bleTargetAddress: '',
  bleTargetMask: 48,
  bleCrcVerify: false,
  blePromiscAccessAddress: '',
  classicChannel: 'sweep',
  classicKnownLap: '',
  classicMaxErrors: 0,
  surveyActiveProjectId: '',
  surveySampleSeconds: 30,
  surveyCompareA: '',
  surveyCompareB: '',
  pinnedDevices: [],
  hiddenDevices: []
});

export class PreferenceStore extends EventTarget {
  constructor(key = 'ubertoothgui.preferences') {
    super();
    this.key = key;
    this.value = { ...DEFAULTS, ...this.#load() };
    this.timer = null;
  }

  get(name) { return this.value[name]; }
  all() { return { ...this.value }; }

  set(name, value) {
    this.value[name] = value;
    this.dispatchEvent(new CustomEvent('save-state', { detail: { state: 'UNSAVED' } }));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.dispatchEvent(new CustomEvent('save-state', { detail: { state: 'SAVING' } }));
      localStorage.setItem(this.key, JSON.stringify(this.value));
      setTimeout(() => this.dispatchEvent(new CustomEvent('save-state', { detail: { state: 'SAVED' } })), 120);
    }, 180);
  }

  reset() {
    this.value = { ...DEFAULTS };
    localStorage.removeItem(this.key);
    this.dispatchEvent(new CustomEvent('save-state', { detail: { state: 'SAVED' } }));
  }

  #load() {
    try { return JSON.parse(localStorage.getItem(this.key) ?? '{}'); }
    catch (_) { return {}; }
  }
}
