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

const pairButton = document.getElementById('pairButton');
const calibrateButton = document.getElementById('calibrateButton');
const BLEstatus = document.getElementById('status_text');
let isConnecting = false;
let lastUpdateTime = 0;
const updateInterval = 50;
const MAX_POINTS = 200;

const pitchData = {
  values: [],
  timestamps: []
};

let pitchCharacteristic = null;
let calibCharacteristic = null;
let batteryCharacteristic = null;

if ("bluetooth" in navigator) {
  pairButton.addEventListener('click', connect);
} else {
  BLEstatus.innerText = "Error: This browser doesn't support Web Bluetooth.";
}

// Add a function to handle battery percentage updates
async function handleBatteryPercentage() {
  if (!batteryCharacteristic) return;

  try {
    const value = await batteryCharacteristic.readValue();
    const battery = value.getFloat32(0, true);
    document.getElementById('batteryPercentage').innerText = `Battery: ${battery.toFixed(2)}%`;
  } catch (err) {
    console.error('Failed to read battery percentage:', err);
  }
}

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
    calibCharacteristic = await service.getCharacteristic(CALIB_CHARACTERISTIC_UUID);
    batteryCharacteristic = await service.getCharacteristic('12345678-0006-1000-8000-00805f9b34fb');

    await pitchCharacteristic.startNotifications();
    pitchCharacteristic.addEventListener('characteristicvaluechanged', e =>
      handleIncomingPitch(e.target.value)
    );

    handleBatteryPercentage();
    setInterval(handleBatteryPercentage, 5000); // Update battery percentage every 5 seconds

    updateConnectionState('paired');
  } catch (err) {
    console.error(err);
    BLEstatus.innerText = `Connection failed: ${err.message}`;
    updateConnectionState('failed');
  } finally {
    isConnecting = false;
  }
}

function updateConnectionState(state) {
  switch (state) {
    case 'pairing':
      pairButton.innerText = 'PAIRING';
      pairButton.style.backgroundColor = 'gray';
      BLEstatus.innerText = 'Connecting to device...';
      break;
    case 'paired':
      pairButton.innerText = 'PAIRED';
      pairButton.style.backgroundColor = 'green';
      BLEstatus.innerText = 'Connected and receiving data.';
      break;
    case 'failed':
      pairButton.innerText = 'CONNECT';
      pairButton.style.backgroundColor = '#d8f41d';
      BLEstatus.innerText = 'Connection failed. Try again.';
      break;
  }
}

let calibrationStep = 0;
calibrateButton.addEventListener('click', () => {
  if (!calibCharacteristic) return;
  switch (calibrationStep) {
    case 0:
      calibrateButton.innerText = 'CALIBRATE IDLE';
      calibrateButton.style.backgroundColor = 'blue';
      calibrateButton.style.color = 'white';
      calibCharacteristic.writeValue(Uint8Array.of(1));
      calibrationStep++;
      break;
    case 1:
      calibrateButton.innerText = 'CALIBRATE FRONT SWING';
      calibCharacteristic.writeValue(Uint8Array.of(2));
      calibrationStep++;
      break;
    case 2:
      calibrateButton.innerText = 'CALIBRATE BACK SWING';
      calibCharacteristic.writeValue(Uint8Array.of(3));
      calibrationStep++;
      break;
    default:
      calibrateButton.innerText = 'CALIBRATE';
      calibrateButton.style.backgroundColor = '';
      calibrateButton.style.color = '';
      calibrationStep = 0;
      break;
  }
});

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

// Add constants for front and back swing values
const FRONT_SWING = 45;
const BACK_SWING = -45;

// Ensure the canvas element exists before creating the chart
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
        { label: 'Pitch', data: [], borderWidth: 2 },
        { label: 'Front Swing', data: Array(MAX_POINTS).fill(FRONT_SWING), borderWidth: 1, borderDash: [5, 5], borderColor: 'green', pointRadius: 0 },
        { label: 'Back Swing', data: Array(MAX_POINTS).fill(BACK_SWING), borderWidth: 1, borderDash: [5, 5], borderColor: 'red', pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Time (s)' },
          min: 0,
          max: 10
        },
        y: {
          title: { display: true, text: 'Pitch (°)' }
        }
      },
      plugins: {
        legend: { labels: { color: 'white' } }
      }
    }
  });
}

// Ensure pitchChart is initialized before updating it
function updateChart(timestamps, values) {
  if (!pitchChart) {
    console.error('pitchChart is not initialized.');
    return;
  }

  const start = timestamps[0] ?? 0;
  const labels = timestamps.map(t => +(t - start).toFixed(2));
  pitchChart.data.labels = labels;
  pitchChart.data.datasets[0].data = values;

  const max = labels.at(-1) ?? 10;
  pitchChart.options.scales.x.min = Math.max(0, max - 10);
  pitchChart.options.scales.x.max = max;
  pitchChart.update();
}

let shoulder, elbow;
const zAxis = new THREE.Vector3(0, 0, 1);
let lastAngle = 0;
const smoothing = 0.1;
let animationId;
let renderer, scene, camera;

// Updated the initialization of the human model to fix rendering issues and ensure proper scaling and positioning.
function initHumanModel() {
  const container = document.getElementById('humanModel');
  const width = container.clientWidth;
  const height = container.clientHeight;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.innerHTML = ''; // Clear any existing content
  container.appendChild(renderer.domElement);

  const loader = new GLTFLoader();

  loader.load('./models/left_arm/left_upper_arm.glb', (gltf) => {
    shoulder = gltf.scene;
    shoulder.scale.set(0.5, 0.5, 0.5); // Adjust scale for better fit
    shoulder.position.set(0, 2, 0); // Adjust position
    scene.add(shoulder);
  }, undefined, (error) => {
    console.error('Error loading upper arm model:', error);
  });

  loader.load('./models/left_arm/left_lower_arm.glb', (gltf) => {
    elbow = gltf.scene;
    elbow.scale.set(0.5, 0.5, 0.5); // Adjust scale for better fit
    elbow.position.set(0, -2, 0); // Adjust position relative to shoulder
    shoulder?.add(elbow);
  }, undefined, (error) => {
    console.error('Error loading lower arm model:', error);
  });

  camera.position.set(0, 0, 10); // Adjust camera position for better view

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(10, 10, 10);
  scene.add(directionalLight);

  animate();
}

function animate() {
  animationId = requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

// Update the pitch text display
function updateHumanModel(pitch) {
  const normalized = Math.max(-1, Math.min(1, pitch / 90));
  const targetAngle = normalized * (Math.PI / 4);
  const swingAngle = lastAngle * (1 - smoothing) + targetAngle * smoothing;
  lastAngle = swingAngle;

  const shoulderQuat = new THREE.Quaternion().setFromAxisAngle(zAxis, swingAngle);
  const elbowQuat = new THREE.Quaternion().setFromAxisAngle(zAxis, swingAngle / 1.5);

  shoulder?.quaternion.copy(shoulderQuat);
  elbow?.quaternion.copy(elbowQuat);

  // Update the pitch text display
  document.getElementById('armAngle').innerText = `Arm Angle: ${pitch.toFixed(2)}°`;
}

let pitchChart;
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