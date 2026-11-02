import { StripChart } from './chart.js';
import { DemoSource } from './demo.js';
import { DeviceSource } from './device.js';

const WINDOW_SEC = 10;
const MAX_SESSION_ROWS = 500_000;
const ZONE_HYSTERESIS = 2; // degrees the pitch must fall back before a zone can re-trigger

const $ = id => document.getElementById(id);
const el = {
  status: $('status'),
  statusText: $('statusText'),
  connectBtn: $('connectBtn'),
  exportBtn: $('exportBtn'),
  empty: $('empty'),
  emptyText: $('emptyText'),
  pitch: $('pitchValue'),
  cue: $('cue'),
  arm: $('arm3d'),
  armMsg: $('arm3dMsg'),
  idle: $('idleValue'),
  fwd: $('fwdValue'),
  back: $('backValue'),
  peaks: $('peaksValue'),
  fwdCues: $('fwdCues'),
  backCues: $('backCues'),
  session: $('sessionTime'),
  amp: $('amp'),
  ampOut: $('ampOut'),
  cadence: $('cadence'),
  cadenceOut: $('cadenceOut'),
  sound: document.querySelectorAll('[data-sound]'),
  connectLinks: document.querySelectorAll('[data-connect]'),
  calibButtons: document.querySelectorAll('[data-calib]'),
  modeButtons: document.querySelectorAll('[data-mode-btn]'),
  modeToggles: document.querySelectorAll('.segmented [data-mode-btn]')
};

const state = {
  mode: null,
  deviceState: 'idle',
  samples: [],
  session: [],
  thresholds: { fwd: 45, back: -45 },
  idle: null,
  zone: 0,
  cues: { fwd: 0, back: 0 },
  sound: false,
  dirty: true
};

const chart = new StripChart($('chart'), { windowSec: WINDOW_SEC });
const demo = new DemoSource(sample => ingest('demo', sample));
const device = new DeviceSource({
  onSample: sample => ingest('device', sample),
  onState: handleDeviceState
});

let arm = null;
import('./arm3d.js')
  .then(({ createArmView }) => createArmView(el.arm))
  .then(view => {
    arm = view;
    el.arm.classList.add('ready');
    arm.setThresholds(state.thresholds.fwd, state.thresholds.back);
  })
  .catch(err => {
    console.error('3D arm unavailable:', err);
    el.armMsg.textContent = '3D view unavailable in this browser';
  });

// ---- Data -------------------------------------------------------------------

function ingest(source, { t, pitch, fwd, back, deviceMs }) {
  if (source !== state.mode) return;

  const { samples } = state;
  // A device reset restarts millis(); start a fresh trace rather than drawing backwards.
  if (samples.length && t < samples.at(-1).t) samples.length = 0;
  samples.push({ t, p: pitch });
  while (samples.length && samples[0].t < t - WINDOW_SEC - 0.5) samples.shift();

  state.thresholds = { fwd, back };
  if (state.session.length < MAX_SESSION_ROWS) {
    state.session.push([new Date().toISOString(), pitch, fwd, back, deviceMs ?? Math.round(t * 1000)]);
  }

  const { zone } = state;
  const next =
    pitch >= fwd || (zone === 1 && pitch > fwd - ZONE_HYSTERESIS) ? 1 :
    pitch <= back || (zone === -1 && pitch < back + ZONE_HYSTERESIS) ? -1 : 0;
  if (next !== 0 && next !== zone) fireCue(next);
  state.zone = next;

  state.dirty = true;
}

function resetData() {
  state.samples = [];
  state.session = [];
  state.zone = 0;
  state.idle = null;
  state.cues = { fwd: 0, back: 0 };
  el.cue.textContent = 'No cue yet';
  el.cue.dataset.dir = '';
  state.dirty = true;
}

// ---- Cues -------------------------------------------------------------------

let audio = null;
function beep(dir) {
  if (!state.sound) return;
  audio ??= new AudioContext();
  // Same rhythm as the haptic motor: one 100 ms pulse forward, two with a 200 ms gap backward.
  const starts = dir > 0 ? [0] : [0, 0.3];
  for (const offset of starts) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const at = audio.currentTime + offset;
    osc.frequency.value = dir > 0 ? 880 : 660;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.15, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    osc.connect(gain).connect(audio.destination);
    osc.start(at);
    osc.stop(at + 0.12);
  }
}

function fireCue(dir) {
  dir > 0 ? state.cues.fwd++ : state.cues.back++;
  el.cue.textContent = dir > 0 ? 'Forward target reached · single pulse' : 'Backward target reached · double pulse';
  el.cue.dataset.dir = dir > 0 ? 'fwd' : 'back';
  el.cue.classList.remove('pulse');
  void el.cue.offsetWidth; // restart the CSS animation
  el.cue.classList.add('pulse');
  arm?.cue(dir);
  beep(dir);
}

// ---- Rendering --------------------------------------------------------------

const fmtDeg = (v, digits = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}°`;
let lastText = 0;

function render(now) {
  requestAnimationFrame(render);
  if (!state.dirty) return;
  state.dirty = false;

  const { samples, thresholds } = state;
  chart.draw(samples, { ...thresholds, idle: state.idle });
  el.empty.hidden = samples.length > 0 || state.mode === 'demo';

  const latest = samples.at(-1);
  if (latest) arm?.setPitch(latest.p);
  arm?.setThresholds(thresholds.fwd, thresholds.back);

  // Text updates at ~10 Hz so numbers stay readable.
  if (now - lastText < 100) {
    state.dirty = true;
    return;
  }
  lastText = now;

  el.pitch.textContent = latest ? latest.p.toFixed(1) : '0.0';
  el.fwd.textContent = fmtDeg(thresholds.fwd);
  el.back.textContent = fmtDeg(thresholds.back);
  el.idle.textContent = state.idle == null ? '-' : fmtDeg(state.idle);

  let lo = Infinity, hi = -Infinity;
  for (const s of samples) { lo = Math.min(lo, s.p); hi = Math.max(hi, s.p); }
  el.peaks.textContent = samples.length ? `${fmtDeg(hi, 0)} / ${fmtDeg(lo, 0)}` : '-';
  el.fwdCues.textContent = state.cues.fwd;
  el.backCues.textContent = state.cues.back;

  const first = state.session[0]?.[4] ?? 0;
  const last = state.session.at(-1)?.[4] ?? 0;
  const secs = Math.max(0, Math.round((last - first) / 1000));
  el.session.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}
requestAnimationFrame(render);

// ---- Mode & connection ------------------------------------------------------

const STATUS = {
  demo: 'Simulated walk',
  idle: 'Not connected',
  connecting: 'Connecting…',
  connected: name => `Streaming from ${name ?? 'SyncStride'}`,
  disconnected: 'Device disconnected',
  error: 'Connection failed',
  unsupported: 'Web Bluetooth unavailable'
};

const EMPTY = {
  idle: 'No device connected.',
  connecting: 'Connecting to SyncStride…',
  connected: 'Connected. Waiting for data…',
  disconnected: 'Device disconnected. Check that it is switched on and in range.',
  error: 'Connection failed. Check that the device is switched on, then try again.',
  unsupported: 'This browser does not support Web Bluetooth. Use Chrome or Edge on desktop or Android, or run the demo.'
};

function setStatus(key, detail) {
  const text = STATUS[key];
  el.status.dataset.state = key;
  el.statusText.textContent = typeof text === 'function' ? text(detail) : text;
}

function deviceKey() {
  if (!DeviceSource.supported) return 'unsupported';
  return device.connected ? 'connected' : state.deviceState;
}

function setMode(mode) {
  if (mode === state.mode) return;
  state.mode = mode;
  document.body.dataset.mode = mode;
  el.modeToggles.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modeBtn === mode)));
  resetData();

  if (mode === 'demo') {
    demo.start();
    setStatus('demo');
  } else {
    demo.stop();
    setStatus(deviceKey(), { name: device.device?.name });
  }
  updateControls();
}

function handleDeviceState(next, detail) {
  state.deviceState = next;
  if (next === 'connected' && state.mode !== 'device') setMode('device');
  if (state.mode === 'device') setStatus(next, detail);
  if (next === 'error') console.error('Bluetooth error:', detail.error);
  updateControls();
}

function updateControls() {
  const key = deviceKey();
  const live = state.mode === 'demo' || device.connected;
  el.calibButtons.forEach(b => { b.disabled = !live; });
  el.connectBtn.disabled = key === 'unsupported' || key === 'connecting';
  el.connectBtn.textContent = device.connected ? 'Disconnect' : 'Connect';
  el.emptyText.textContent = EMPTY[key] ?? EMPTY.idle;
  el.connectLinks.forEach(b => { b.hidden = key === 'unsupported' || key === 'connecting' || key === 'connected'; });
  state.dirty = true;
}

el.modeButtons.forEach(b => b.addEventListener('click', () => setMode(b.dataset.modeBtn)));
el.connectBtn.addEventListener('click', () => (device.connected ? device.disconnect() : device.connect()));
el.connectLinks.forEach(b => b.addEventListener('click', () => device.connect()));

// ---- Calibration ------------------------------------------------------------

const CALIB_NAMES = { 1: 'idle', 2: 'forward', 3: 'backward' };

el.calibButtons.forEach(button => button.addEventListener('click', async () => {
  const command = Number(button.dataset.calib);
  el.calibButtons.forEach(b => { b.disabled = true; });
  button.classList.add('busy');
  try {
    if (state.mode === 'demo') {
      const pitch = await demo.calibrate(command);
      if (command === 1) state.idle = pitch;
    } else {
      if (command === 1) state.idle = state.samples.at(-1)?.p ?? null;
      await device.calibrate(command);
    }
    el.cue.textContent = `Calibrated ${CALIB_NAMES[command]}`;
    el.cue.dataset.dir = '';
  } catch (err) {
    console.error('Calibration failed:', err);
    el.cue.textContent = 'Calibration failed. Try again.';
  } finally {
    button.classList.remove('busy');
    updateControls();
  }
}));

// ---- Simulator controls -----------------------------------------------------

function syncSliders() {
  demo.amplitude = Number(el.amp.value);
  demo.cadence = Number(el.cadence.value);
  el.ampOut.textContent = `${el.amp.value}°`;
  el.cadenceOut.textContent = `${el.cadence.value} steps/min`;
}
el.amp.addEventListener('input', syncSliders);
el.cadence.addEventListener('input', syncSliders);
syncSliders();

el.sound.forEach(box => box.addEventListener('change', () => {
  state.sound = box.checked;
  el.sound.forEach(other => { other.checked = box.checked; });
  if (state.sound) (audio ??= new AudioContext()).resume();
}));

// ---- CSV export (same columns and file name as the desktop recorder) ---------

el.exportBtn.addEventListener('click', () => {
  const header = ['Timestamp (PC)', 'Pitch (deg)', 'Forward Swing Pitch (deg)', 'Backward Swing Pitch (deg)', 'Device Timestamp (ms)'];
  const rows = state.session.map(([pc, p, f, b, ms]) => [pc, p.toFixed(3), f.toFixed(3), b.toFixed(3), Math.round(ms)].join(','));
  const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv' });
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `SyncStride - ${stamp}.csv`
  });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

// ---- Start ------------------------------------------------------------------

setMode(new URLSearchParams(location.search).has('demo') ? 'demo' : 'device');
if (state.mode === 'device') device.reconnect();
