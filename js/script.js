const SERVICE_UUID = '19b10000-0000-537e-4f6c-d104768a1214';
const pairButton = document.getElementById('pairButton');
const BLEstatus = document.getElementById('bluetooth');
let isConnecting = false;
let lastUpdateTime = 0;
const updateInterval = 50;

const graphData = {
  accelerometer: { x: [], y: [], z: [] },
  gyroscope: { x: [], y: [], z: [] },
};

const NiclaSenseME = {
  accelerometer: {
    uuid: '19b10000-5001-537e-4f6c-d104768a1214',
    properties: ['BLENotify'],
    structure: ['Float32', 'Float32', 'Float32'],
    data: { Ax: [], Ay: [], Az: [] }
  },
  gyroscope: {
    uuid: '19b10000-6001-537e-4f6c-d104768a1214',
    properties: ['BLENotify'],
    structure: ['Float32', 'Float32', 'Float32'],
    data: { x: [], y: [], z: [] }
  }
};

if ("bluetooth" in navigator) {
  pairButton.addEventListener('click', connect);
} else {
  BLEstatus.innerHTML = "Error: This browser doesn't support Web Bluetooth.";
}

async function connect() {
  if (isConnecting) return;
  isConnecting = true;

  try {
    pairButton.style.backgroundColor = "grey";
    pairButton.innerText = "PAIRING";
    BLEstatus.innerHTML = 'Requesting device...';

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }]
    });

    BLEstatus.innerHTML = 'Connecting...';
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    for (const sensor in NiclaSenseME) {
      const sensorObj = NiclaSenseME[sensor];
      sensorObj.characteristic = await service.getCharacteristic(sensorObj.uuid);
      if (sensorObj.properties.includes("BLENotify")) {
        sensorObj.characteristic.addEventListener('characteristicvaluechanged', (event) => {
          handleIncoming(sensorObj, event.target.value);
        });
        await sensorObj.characteristic.startNotifications();
      }
    }

    pairButton.style.backgroundColor = 'green';
    pairButton.innerText = "PAIRED";
    BLEstatus.innerHTML = 'Connected and receiving data.';
  } catch (error) {
    console.error('Connection failed:', error);
    BLEstatus.innerHTML = 'Connection failed. Try again.';
    pairButton.style.backgroundColor = '#d8f41d';
    pairButton.innerText = "CONNECT";
  } finally {
    isConnecting = false;
  }
}

function handleIncoming(sensor, dataReceived) {
  const now = Date.now();
  if (now - lastUpdateTime < updateInterval) return;
  lastUpdateTime = now;

  const columns = Object.keys(sensor.data);
  const typeMap = {
    Float32: { fn: DataView.prototype.getFloat32, bytes: 4 }
  };

  let pointer = 0;
  sensor.structure.forEach((type, i) => {
    const value = typeMap[type].fn.call(dataReceived, pointer, true);
    sensor.data[columns[i]].push(value);
    if (sensor.data[columns[i]].length > 100) {
      sensor.data[columns[i]].shift();
    }
    pointer += typeMap[type].bytes;
  });

  updateGraph(sensor === NiclaSenseME.accelerometer ? 'accelerometer' : 'gyroscope', sensor.data);
  if (sensor === NiclaSenseME.accelerometer) {
    updateHumanModel(sensor.data);
  }
}

function updateGraph(type, data) {
  const graph = graphData[type];
  const now = Date.now() / 1000;

  graph.x.push(data.x?.at(-1) ?? data.Ax?.at(-1));
  graph.y.push(data.y?.at(-1) ?? data.Ay?.at(-1));
  graph.z.push(data.z?.at(-1) ?? data.Az?.at(-1));

  if (graph.x.length > 100) {
    graph.x.shift(); graph.y.shift(); graph.z.shift();
  }

  Plotly.react(type, [
    { y: graph.x, name: 'X', type: 'scatter' },
    { y: graph.y, name: 'Y', type: 'scatter' },
    { y: graph.z, name: 'Z', type: 'scatter' }
  ], {
    xaxis: { title: 'Time' },
    yaxis: { title: 'Value' }
  });
}

// Human model rendering
let shoulder, elbow;
function initHumanModel() {
  const container = document.getElementById('humanModel');
  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  const shoulderMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), shoulderMaterial);
  scene.add(shoulder);

  const upperArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 2, 32),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  upperArm.position.y = -1.5;
  shoulder.add(upperArm);

  elbow = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0x0000ff })
  );
  elbow.position.y = -2;
  upperArm.add(elbow);

  const forearm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 2, 32),
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
  const Ax = sensorData.Ax.at(-1);
  const Ay = sensorData.Ay.at(-1);
  const Az = sensorData.Az.at(-1);

  if (Ax == null || Ay == null || Az == null) return;

  const magnitude = Math.sqrt(Ax ** 2 + Ay ** 2 + Az ** 2);
  const normAx = Ax / magnitude;
  const normAy = Ay / magnitude;
  const normAz = Az / magnitude;

  const pitch = Math.atan2(normAy, normAz);
  const roll = Math.atan2(-normAx, Math.sqrt(normAy ** 2 + normAz ** 2));

  if (shoulder) {
    shoulder.rotation.x = pitch;
    shoulder.rotation.y = roll;
  }
  if (elbow) {
    elbow.rotation.z = roll;
  }
}

window.onload = () => {
  initHumanModel();
  Plotly.newPlot('accelerometer', [], { title: 'Accelerometer Data' });
  Plotly.newPlot('gyroscope', [], { title: 'Gyroscope Data' });
};
