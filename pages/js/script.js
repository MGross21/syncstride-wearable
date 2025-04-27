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
const CALIB_CHARACTERISTIC_UUID = setUUID('0003');

const updateInterval = 2; // Real-time updates
const MAX_POINTS = 200;
const FRONT_SWING = 45;
const BACK_SWING = -45;

let isConnecting = false;
let lastUpdateTime = 0;
const pitchData = {
  values: new Array(MAX_POINTS).fill({ pitch: 0, frontSwing: 0, backSwing: 0, timestamp: 0 }), // Circular buffer for data
  index: 0 // Pointer to the current position in the buffer
};

let pitchCharacteristic, calibCharacteristic;

const elements = {
  pairButton: document.getElementById('pairButton'),
  calibrateButton: document.getElementById('calibrateButton'),
  BLEstatus: document.getElementById('status_text'),
  armAngle: document.getElementById('armAngle')
};

if (!navigator.bluetooth) {
  elements.BLEstatus.innerText = "Error: This browser doesn't support Web Bluetooth.";
}

// Event Listeners
elements.pairButton?.addEventListener('click', connect);
elements.calibrateButton?.addEventListener('click', handleCalibration);

async function connectDevice(auto = false) {
  try {
    let device;

    if (auto) {
      const devices = await navigator.bluetooth.getDevices();
      device = devices.find(d => d.name && d.name.startsWith('SyncStride'));

      if (!device) {
        console.log('No previously connected device found.');
        return false;
      }

      if (device.gatt.connected) {
        console.log('Device is already connected.');
        updateConnectionState('paired');
        return true;
      }
    } else {
      device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'SyncStride' },
          { services: [SERVICE_UUID] }
        ]
      });
    }

    console.log(`Connecting to device: ${device.name}`);
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    pitchCharacteristic = await service.getCharacteristic(PITCH_CHARACTERISTIC_UUID);
    await pitchCharacteristic.startNotifications();
    pitchCharacteristic.addEventListener('characteristicvaluechanged', e => handleIncomingPitch(e.target.value));

    updateConnectionState('paired');
    return true;
  } catch (err) {
    console.error('Connection failed:', err);
    updateConnectionState('failed');
    return false;
  }
}

async function connect() {
  if (isConnecting) return;
  isConnecting = true;

  try {
    updateConnectionState('pairing');
    const success = await connectDevice(false);
    if (!success) {
      console.log('No device selected or connection failed.');
    }
  } finally {
    isConnecting = false;
  }
}

async function autoConnect() {
  if (!navigator.bluetooth || !navigator.bluetooth.getDevices) {
    console.warn('navigator.bluetooth.getDevices is not supported in this browser. Skipping auto-connect.');
    return;
  }

  if (isConnecting) return;
  isConnecting = true;

  try {
    const success = await connectDevice(true);
    if (!success) {
      console.log('Auto-connect failed or no previously connected device found.');
    }
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

let calibrationStep = 0;
function handleCalibration() {
  if (!calibCharacteristic) return;

  const steps = [
    { text: 'CALIBRATE', command: null, color: '', reset: true },
    { text: 'CALIBRATE IDLE', command: 1, color: 'blue' },
    { text: 'CALIBRATE FRONT SWING', command: 2 },
    { text: 'CALIBRATE BACK SWING', command: 3 }
  ];

  const { text, command, color, reset } = steps[calibrationStep] || {};
  elements.calibrateButton.innerText = text;
  elements.calibrateButton.style.backgroundColor = color || '';
  elements.calibrateButton.style.color = color ? 'white' : '';

  if (command) calibCharacteristic.writeValue(Uint8Array.of(command));
  calibrationStep = reset ? 0 : calibrationStep + 1;
}

function handleIncomingPitch(dataReceived) {
  const dataView = new DataView(dataReceived.buffer);

  if (dataView.byteLength < 16) {
    console.error('DataView does not contain enough bytes for pitch, front swing, back swing, and timestamp values.');
    return;
  }

  const pitch = dataView.getFloat32(0, true);
  const frontSwing = dataView.getFloat32(4, true);
  const backSwing = dataView.getFloat32(8, true);
  const timestamp = dataView.getFloat32(12, true) / 1000; // Convert milliseconds to seconds

  // Update circular buffer
  pitchData.values[pitchData.index] = { pitch, frontSwing, backSwing, timestamp };
  pitchData.index = (pitchData.index + 1) % MAX_POINTS;

  // Update chart with circular buffer data
  const start = pitchData.index;
  const labels = pitchData.values.slice(start).concat(pitchData.values.slice(0, start)).map(v => v.timestamp);
  const values = pitchData.values.slice(start).concat(pitchData.values.slice(0, start)).map(v => v.pitch);

  updateChart(labels, values);
  elements.armAngle.innerText = `Arm Angle: ${pitch.toFixed(2)}°`;
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

function updateChart(timestamps, pitchValues) {
  if (!pitchChart) {
    console.error('pitchChart is not initialized.');
    return;
  }

  const start = timestamps[0] ?? 0;
  const labels = timestamps.map(t => +(t - start).toFixed(2));
  pitchChart.data.labels = labels;
  pitchChart.data.datasets[0].data = pitchValues;

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
let pitchChart; // Declare pitchChart at the top of the script

function initHumanModel() {
  const container = document.getElementById('humanModel');
  if (!container) {
    console.error('Container for human model not found.');
    return;
  }

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
  autoConnect(); // Attempt auto-connect on page load
};

window.addEventListener('resize', () => {
  const container = document.getElementById('humanModel');
  const width = container.clientWidth;
  const height = container.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});