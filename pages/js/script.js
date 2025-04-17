const SERVICE_UUID = '19b10000-0000-537e-4f6c-d104768a1214';
const pairButton = document.getElementById('pairButton');
const calibrateButton = document.getElementById('calibrateButton');
const BLEstatus = document.getElementById('status_text');
let isConnecting = false;
let lastUpdateTime = 0;
const updateInterval = 50;
const MAX_POINTS = 200; // ~10 seconds of data

// Store chart + sensor data
const NiclaSenseME = {
  accelerometer: {
    uuid: '19b10000-5001-537e-4f6c-d104768a1214',
    data: { Ax: [], Ay: [], Az: [], timestamps: [] },
    chart: null,
  },
  gyroscope: {
    uuid: '19b10000-6001-537e-4f6c-d104768a1214',
    data: { x: [], y: [], z: [], timestamps: [] },
    chart: null,
  }
};

if ("bluetooth" in navigator) {
  pairButton.addEventListener('click', connect);
} else {
  BLEstatus.innerText = "Error: This browser doesn't support Web Bluetooth.";
}

// ---------------- BLE Connect ----------------
async function connect() {
  if (isConnecting) return;
  isConnecting = true;

  try {
    updateConnectionState('pairing');
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }]
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    for (const name in NiclaSenseME) {
      const sensor = NiclaSenseME[name];
      sensor.characteristic = await service.getCharacteristic(sensor.uuid);
      await sensor.characteristic.startNotifications();
      sensor.characteristic.addEventListener('characteristicvaluechanged', e =>
        handleIncoming(name, e.target.value)
      );
    }

    updateConnectionState('paired');
  } catch (err) {
    console.error(err);
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

// ---------------- Calibrate Button ----------------

let calibrationStep = 0;

calibrateButton.addEventListener('click', () => {
  switch (calibrationStep) {
    case 0:
      calibrateButton.innerText = 'CALIBRATE IDLE';
      calibrateButton.style.backgroundColor = 'blue';
      calibrateButton.style.color = 'white';
      calibrationStep++;
      break;
    case 1:
      calibrateButton.innerText = 'CALIBRATE FRONT SWING';
      calibrationStep++;
      break;
    case 2:
      calibrateButton.innerText = 'CALIBRATE BACK SWING';
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

// ---------------- Sensor Data Handler ----------------
function handleIncoming(sensorName, dataReceived) {
  const now = Date.now();
  if (now - lastUpdateTime < updateInterval) return;
  lastUpdateTime = now;

  const sensor = NiclaSenseME[sensorName];
  const packet = new DataView(dataReceived.buffer);
  const keys = Object.keys(sensor.data).filter(k => k !== 'timestamps');

  let pointer = 0;
  keys.forEach((key, i) => {
    const val = packet.getFloat32(pointer, true);
    sensor.data[key].push(val);
    if (sensor.data[key].length > MAX_POINTS) sensor.data[key].shift();
    pointer += 4;
  });

  sensor.data.timestamps.push(now / 1000);
  if (sensor.data.timestamps.length > MAX_POINTS) sensor.data.timestamps.shift();

  updateChart(sensor.chart, sensor.data.timestamps, sensor.data);

  if (sensorName === 'accelerometer') updateHumanModel(sensor.data);
}

// ---------------- Chart.js Setup ----------------
function createChart(canvasId, labelPrefix) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: `${labelPrefix} X`, data: [], borderWidth: 1 },
        { label: `${labelPrefix} Y`, data: [], borderWidth: 1 },
        { label: `${labelPrefix} Z`, data: [], borderWidth: 1 }
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
          title: { display: true, text: 'Value' }
        }
      },
      plugins: {
        legend: { labels: { color: 'white' } }
      }
    }
  });
}

function updateChart(chart, timestamps, data) {
  const start = timestamps[0] ?? 0;
  const labels = timestamps.map(t => +(t - start).toFixed(2));
  chart.data.labels = labels;

  chart.data.datasets[0].data = data.x ?? data.Ax;
  chart.data.datasets[1].data = data.y ?? data.Ay;
  chart.data.datasets[2].data = data.z ?? data.Az;

  const max = labels.at(-1) ?? 10;
  chart.options.scales.x.min = Math.max(0, max - 10);
  chart.options.scales.x.max = max;
  chart.update();
}

// ---------------- Human Arm Model ----------------
let shoulder, elbow;
const swingQuat = new THREE.Quaternion();
const zAxis = new THREE.Vector3(0, 0, 1);
let lastAngle = 0;
const smoothing = 0.1;

function initHumanModel() {
  const container = document.getElementById('humanModel');
  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  shoulder = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  shoulder.position.y = 4;
  scene.add(shoulder);

  const upperArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 2, 32),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  upperArm.position.y = -1.5;
  shoulder.add(upperArm);

  elbow = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 32 , 32),
    new THREE.MeshBasicMaterial({ color: 0xffff00 })
  );
  elbow.position.y = -2;
  upperArm.add(elbow);

  const forearm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 2, 32),
    new THREE.MeshBasicMaterial({ color: 0xffff00 })
  );
  forearm.position.y = -1.5;
  elbow.add(forearm);

  camera.position.z = 10;

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();
}

function updateHumanModel(sensorData) {
  const Az = sensorData.Az.at(-1);
  if (Az == null) return;

  const normalized = Math.max(-1, Math.min(1, Az / 9.81));
  const targetAngle = normalized * (Math.PI / 4);
  const swingAngle = lastAngle * (1 - smoothing) + targetAngle * smoothing;
  lastAngle = swingAngle;

  swingQuat.setFromAxisAngle(zAxis, swingAngle);
  shoulder?.quaternion.copy(swingQuat);
  elbow?.quaternion.copy(swingQuat);
}

// ---------------- Init ----------------
window.onload = () => {
  initHumanModel();
  NiclaSenseME.accelerometer.chart = createChart('accelerometerChart', 'Accel');
  NiclaSenseME.gyroscope.chart = createChart('gyroscopeChart', 'Gyro');
};