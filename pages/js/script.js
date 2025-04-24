import * as THREE from 'https://esm.sh/three@0.174.0';
import { GLTFLoader } from 'https://esm.sh/three@0.174.0/examples/jsm/loaders/GLTFLoader.js';

function setUUID(uuid) {
  if (uuid.length !== 4) {
    throw new Error('UUID must be 4 characters long');
  }
  return `12345678-${uuid}-1000-8000-00805f9b34fb`;
}

const SERVICE_UUID = setUUID('0000');
const PITCH_CHARACTERISTIC_UUID = setUUID('0001');
const FRONT_SWING_UUID = setUUID('0004');
const BACK_SWING_UUID = setUUID('0005');
const CALIB_CHARACTERISTIC_UUID = setUUID('0003');
const BATTERY_CHARACTERISTIC_UUID = setUUID('0006');

const updateInterval = 2; // Real-time updates
const MAX_POINTS = 200;
const FRONT_SWING = 45;
const BACK_SWING = -45;

let isConnecting = false;
let lastUpdateTime = 0;
const pitchData = { values: [], timestamps: [] };

let pitchCharacteristic, frontSwingCharacteristic, backSwingCharacteristic, calibCharacteristic, batteryCharacteristic;

const elements = {
  pairButton: document.getElementById('pairButton'),
  calibrateButton: document.getElementById('calibrateButton'),
  BLEstatus: document.getElementById('status_text'),
  battery: document.getElementById('batteryPercentage'),
  armAngle: document.getElementById('armAngle'),
  frontSwing: document.getElementById('frontSwing'),
  backSwing: document.getElementById('backSwing')
};

if (!navigator.bluetooth) {
  elements.BLEstatus.innerText = "Error: This browser doesn't support Web Bluetooth.";
}

// Event Listeners
elements.pairButton?.addEventListener('click', connect);
elements.calibrateButton?.addEventListener('click', handleCalibration);

async function connect() {
  if (isConnecting) return;
  isConnecting = true;

  try {
    updateConnectionState('pairing');
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: 'SyncStride' },
        { services: [SERVICE_UUID] }
      ]
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    pitchCharacteristic = await service.getCharacteristic(PITCH_CHARACTERISTIC_UUID);
    frontSwingCharacteristic = await service.getCharacteristic(FRONT_SWING_UUID);
    backSwingCharacteristic = await service.getCharacteristic(BACK_SWING_UUID);
    calibCharacteristic = await service.getCharacteristic(CALIB_CHARACTERISTIC_UUID);
    batteryCharacteristic = await service.getCharacteristic(BATTERY_CHARACTERISTIC_UUID);

    await pitchCharacteristic.startNotifications();
    pitchCharacteristic.addEventListener('characteristicvaluechanged', e => handleIncomingPitch(e.target.value));

    updateSwingValues();
    updateBatteryPercentage();
    setInterval(updateBatteryPercentage, 2000);

    updateConnectionState('paired');
  } catch (err) {
    console.error(err);
    elements.BLEstatus.innerText = `Connection failed: ${err.message}`;
    updateConnectionState('failed');
  } finally {
    isConnecting = false;
  }
}

function updateConnectionState(state) {
  const states = {
    pairing: { text: 'PAIRING', color: 'gray', status: 'Connecting to device...' },
    paired: { text: 'PAIRED', color: 'green', status: 'Connected and receiving data.' },
    failed: { text: 'CONNECT', color: '#d8f41d', status: 'Connection failed. Try again.' }
  };

  const { text, color, status } = states[state] || {};
  if (text && color && status) {
    elements.pairButton.innerText = text;
    elements.pairButton.style.backgroundColor = color;
    elements.BLEstatus.innerText = status;
  }
}

async function updateSwingValues() {
  try {
    const frontSwingValue = await frontSwingCharacteristic.readValue();
    const backSwingValue = await backSwingCharacteristic.readValue();

    elements.frontSwing.innerText = `Front Swing: ${frontSwingValue.getFloat32(0, true).toFixed(2)}°`;
    elements.backSwing.innerText = `Back Swing: ${backSwingValue.getFloat32(0, true).toFixed(2)}°`;
  } catch (err) {
    console.error('Failed to read swing values:', err);
  }
}

async function updateBatteryPercentage() {
  if (!batteryCharacteristic) return;

  try {
    const value = await batteryCharacteristic.readValue();
    const battery = value.getFloat32(0, true);
    elements.battery.innerText = `Battery: ${battery.toFixed(2)}%`;
  } catch (err) {
    console.error('Failed to read battery percentage:', err);
  }
}

let calibrationStep = 0;
function handleCalibration() {
  if (!calibCharacteristic) return;

  const steps = [
    { text: 'CALIBRATE IDLE', command: 1, color: 'blue' },
    { text: 'CALIBRATE FRONT SWING', command: 2 },
    { text: 'CALIBRATE BACK SWING', command: 3 },
    { text: 'CALIBRATE', command: null, color: '', reset: true }
  ];

  const { text, command, color, reset } = steps[calibrationStep] || {};
  elements.calibrateButton.innerText = text;
  elements.calibrateButton.style.backgroundColor = color || '';
  elements.calibrateButton.style.color = color ? 'white' : '';

  if (command) calibCharacteristic.writeValue(Uint8Array.of(command));
  calibrationStep = reset ? 0 : calibrationStep + 1;
}

function handleIncomingPitch(dataReceived) {
  const now = Date.now();
  if (now - lastUpdateTime < updateInterval) return;
  lastUpdateTime = now;

  const packet = new DataView(dataReceived.buffer);
  const pitch = packet.getFloat32(0, true);

  pitchData.values.push(pitch);
  if (pitchData.values.length > MAX_POINTS) pitchData.values.shift();

  pitchData.timestamps.push(now / 1000);
  if (pitchData.timestamps.length > MAX_POINTS) pitchData.timestamps.shift();

  updateChart(pitchData.timestamps, pitchData.values);
  updateHumanModel(pitch);
}

// Ensure pitchChart remains intact and functional
function createChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.error(`Canvas element with id '${canvasId}' not found.`);
    return null;
  }

  const ctx = canvas.getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Pitch', data: [], borderWidth: 2, borderColor: 'blue', pointRadius: 0 },
        { label: 'Front Swing', data: Array(MAX_POINTS).fill(FRONT_SWING), borderWidth: 1, borderDash: [5, 5], borderColor: 'green', pointRadius: 0 },
        { label: 'Back Swing', data: Array(MAX_POINTS).fill(BACK_SWING), borderWidth: 1, borderDash: [5, 5], borderColor: 'red', pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Time (s)' }, min: 0, max: 10 },
        y: { title: { display: true, text: 'Pitch (°)' } }
      },
      plugins: { legend: { labels: { color: 'white' } } }
    }
  });
}

function updateChart(timestamps, values) {
  if (!pitchChart) {
    console.error('pitchChart is not initialized.');
    return;
  }

  const start = timestamps[0] ?? 0;
  const labels = timestamps.map(t => +(t - start).toFixed(2));
  pitchChart.data.labels = labels;
  pitchChart.data.datasets[0].data = values;

  pitchChart.data.datasets[1].data = Array(labels.length).fill(FRONT_SWING);
  pitchChart.data.datasets[2].data = Array(labels.length).fill(BACK_SWING);

  const max = labels.at(-1) ?? 10;
  pitchChart.options.scales.x.min = Math.max(0, max - 10);
  pitchChart.options.scales.x.max = max;

  pitchChart.update();
}

let shoulder, elbow;
const zAxis = new THREE.Vector3(0, 0, 1);
let lastAngle = 0;
const smoothing = 0.1;
let renderer, scene, camera;

function initHumanModel() {
  const container = document.getElementById('humanModel');
  const width = container.clientWidth;
  const height = container.clientHeight;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.innerHTML = ''; // Clear any existing content
  container.appendChild(renderer.domElement);

  const loader = new GLTFLoader();

  loader.load('./models/left_arm/left_upper_arm.glb', (gltf) => {
    shoulder = gltf.scene;
    shoulder.scale.set(1, 1, 1);
    shoulder.position.set(0, 0, 0);
    scene.add(shoulder);
  }, undefined, (error) => {
    console.error('Error loading upper arm model:', error);
  });

  loader.load('./models/left_arm/left_lower_arm.glb', (gltf) => {
    elbow = gltf.scene;
    elbow.scale.set(1, 1, 1);
    elbow.position.set(0, -1.5, 0);
    shoulder?.add(elbow);
  }, undefined, (error) => {
    console.error('Error loading lower arm model:', error);
  });

  camera.position.set(0, 0, 5);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);

  animate();
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

function updateHumanModel(pitch) {
  const normalized = Math.max(-1, Math.min(1, pitch / 90));
  const targetAngle = normalized * (Math.PI / 4);

  const shoulderQuat = new THREE.Quaternion().setFromAxisAngle(zAxis, targetAngle);
  const elbowQuat = new THREE.Quaternion().setFromAxisAngle(zAxis, targetAngle / 2);

  shoulder?.quaternion.copy(shoulderQuat);
  elbow?.quaternion.copy(elbowQuat);

  elements.armAngle.innerText = `Arm Angle: ${pitch.toFixed(2)}°`;
}

window.onload = () => {
  initHumanModel();
  pitchChart = createChart('pitchChart');
};

window.addEventListener('resize', () => {
  const container = document.getElementById('humanModel');
  const width = container.clientWidth;
  const height = container.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});