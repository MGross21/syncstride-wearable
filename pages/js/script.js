import * as THREE from 'https://esm.sh/three@0.174.0';
import { GLTFLoader } from 'https://esm.sh/three@0.174.0/examples/jsm/loaders/GLTFLoader.js';

const SERVICE_UUID = '12345678-0000-1000-8000-00805f9b34fb';
const PITCH_CHARACTERISTIC_UUID = '12345678-0001-1000-8000-00805f9b34fb';
const CALIB_CHARACTERISTIC_UUID = '12345678-0003-1000-8000-00805f9b34fb';

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

if ("bluetooth" in navigator) {
  pairButton.addEventListener('click', connect);
} else {
  BLEstatus.innerText = "Error: This browser doesn't support Web Bluetooth.";
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

    await pitchCharacteristic.startNotifications();
    pitchCharacteristic.addEventListener('characteristicvaluechanged', e =>
      handleIncomingPitch(e.target.value)
    );

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

function createChart(canvasId) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Pitch', data: [], borderWidth: 2 }
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

function updateChart(timestamps, values) {
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

function initHumanModel() {
  const container = document.getElementById('humanModel');
  const width = container.clientWidth;
  const height = container.clientHeight;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  const loader = new GLTFLoader();

  loader.load('./models/left_arm/left_upper_arm.glb', (gltf) => {
    shoulder = gltf.scene;
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    gltf.scene.scale.set(1 / size.x, 1 / size.y, 1 / size.z);
    shoulder.position.y = 4;
    scene.add(shoulder);
  }, undefined, (error) => {
    console.error('Error loading upper arm model:', error);
  });

  loader.load('./models/left_arm/left_lower_arm.glb', (gltf) => {
    elbow = gltf.scene;
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    gltf.scene.scale.set(1 / size.x, 1 / size.y, 1 / size.z);
    elbow.position.y = -2;
    shoulder.add(elbow);
  }, undefined, (error) => {
    console.error('Error loading lower arm model:', error);
  });

  camera.position.z = 10;

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

function updateHumanModel(pitch) {
  const normalized = Math.max(-1, Math.min(1, pitch / 90));
  const targetAngle = normalized * (Math.PI / 4);
  const swingAngle = lastAngle * (1 - smoothing) + targetAngle * smoothing;
  lastAngle = swingAngle;

  const shoulderQuat = new THREE.Quaternion().setFromAxisAngle(zAxis, swingAngle);
  const elbowQuat = new THREE.Quaternion().setFromAxisAngle(zAxis, swingAngle / 1.5);

  shoulder?.quaternion.copy(shoulderQuat);
  elbow?.quaternion.copy(elbowQuat);
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