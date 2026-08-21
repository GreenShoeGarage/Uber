import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { renderView, navItems, renderShellNav } from '../src/ui/views.js';
import { CaptureRecorder } from '../src/capture/recorder.js';
import { SpectrumModel } from '../src/spectrum/spectrum.js';

function prefs(mode='easy') {
  return {
    mode, theme:'dark', navCollapsed:false,
    spectrumLow:2402, spectrumHigh:2480, averaging:28, spectrumPersistence:40, peakHold:true,
    waterfallSpeed:1, waterfallRows:180, spectrumRssiMin:-110, spectrumRssiMax:-20,
    spectrumBleOverlay:true, spectrumWifiOverlay:true,
    packetSearch:'', packetFilter:'all', packetChannelFilter:'all',
    deviceSearch:'', deviceSort:'lastSeen', deviceActivityFilter:'all', deviceChannelFilter:'all',
    devicePinnedOnly:false, deviceShowHidden:false, pinnedDevices:[], hiddenDevices:[],
    selectedBleChannel:37, channelActivityWindowMs:5000,
    overviewChannelMetric:'rate', overviewChannelWindow:'10000', overviewRateWindow:120,
    bleFollowChannel:37, bleTargetAddress:'', bleTargetMask:48, bleCrcVerify:false, blePromiscAccessAddress:'',
    classicChannel:'sweep', classicKnownLap:'', classicMaxErrors:0,
    eventSearch:'', eventCategoryFilter:'all', eventLevelFilter:'all'
  };
}

function baseState(mode='easy') {
  const recorder=new CaptureRecorder(100);
  return {
    mode, prefs:prefs(mode), recorder, spectrum:new SpectrumModel(2402,2480), spectrumPaused:false,
    capabilities:{webusb:true,webserial:true,secureContext:true,chromium:true},
    connectionState:'DISCONNECTED', transport:null, simulation:false, streaming:false, lastError:null, deviceInfo:null,
    devices:[], connections:[], classicObservations:[], classicDecoder:{status:'not-initialized',lastError:null},
    selectedClassicLap:null, selectedDeviceAddress:null, selectedConnectionAccessAddress:null, selectedEventId:null,
    selectedPacket:null, inspectorHighlight:null, captureLibrary:[], captureSearch:'', replay:{active:false,playing:false,index:-1,document:null,sourceEvents:[],range:{durationMs:0}},
    surveyProjects:[], surveyRun:{active:false,stage:'idle'}, logs:[], validation:null, soak:{status:'IDLE'}, lastStreamConfig:null
  };
}

test('v1.8.1 Easy navigation keeps the primary workflow compact while Advanced is grouped', () => {
  assert.deepEqual(navItems('easy').map(x=>x[0]), ['connect','overview','spectrum','ble','survey','capture','settings']);
  const advanced=renderShellNav('advanced','overview');
  for (const label of ['OPERATE','OBSERVE','ANALYZE','RECORD','SYSTEM']) assert.match(advanced,new RegExp(label));
  assert.match(advanced,/data-view="classic"/);
  assert.match(advanced,/aria-current="page"/);
});

test('v1.8.1 Connect and Spectrum use progressive disclosure for secondary controls', () => {
  const easy=baseState('easy');
  const connectEasy=renderView('connect',easy);
  assert.match(connectEasy,/QUICK START/);
  assert.doesNotMatch(connectEasy,/>PING</);
  const advanced=baseState('advanced');
  const connectAdvanced=renderView('connect',advanced);
  assert.match(connectAdvanced,/Hardware tools/);
  assert.match(connectAdvanced,/>PING</);
  const spectrumEasy=renderView('spectrum',easy);
  assert.match(spectrumEasy,/class="panel disclosure spectrum-controls"/);
  assert.doesNotMatch(spectrumEasy,/class="panel disclosure spectrum-controls" open/);
  const spectrumAdvanced=renderView('spectrum',advanced);
  assert.match(spectrumAdvanced,/class="panel disclosure spectrum-controls" open/);
});

test('v1.8.1 BLE and Capture lead with primary evidence instead of expert controls', () => {
  const easy=baseState('easy');
  const bleEasy=renderView('ble',easy);
  assert.match(bleEasy,/NO ADVERTISERS YET/);
  assert.match(bleEasy,/Packet evidence/);
  assert.doesNotMatch(bleEasy,/Advanced passive modes/);
  const advanced=baseState('advanced');
  const bleAdvanced=renderView('ble',advanced);
  assert.match(bleAdvanced,/Advanced passive modes/);
  assert.match(bleAdvanced,/CONNECTION EVIDENCE/);
  const capture=renderView('capture',advanced);
  assert.match(capture,/Evidence Package/);
  assert.match(capture,/Individual formats/);
  assert.match(capture,/EVIDENCE ZIP/);
});

test('v1.8.1 Settings removes duplicate mode control and shell exposes persistent nav collapse', () => {
  const html=renderView('settings',baseState('advanced'));
  assert.doesNotMatch(html,/settings-mode-advanced/);
  assert.match(html,/Easy\/Advanced is always available from the header/);
  const root=path.resolve(new URL('..',import.meta.url).pathname);
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
  assert.match(index,/data-action="toggle-nav"/);
  assert.match(app,/case 'toggle-nav'/);
});
