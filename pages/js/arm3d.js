import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Joint centres in the CAD assembly's coordinates (metres). The elbow hinge runs
// along X, so the arm swings in the Y-Z plane with "forward" toward -Z.
const SHOULDER = new THREE.Vector3(0.046, 0.963, 0.256);
const ELBOW = new THREE.Vector3(0.07, 0.70, 0.292);
const WRIST = new THREE.Vector3(0.062, 0.49, 0.372);
const WRIST_CENTER = new THREE.Vector3(0.062, 0.49, 0.334);
const ZONE_RADIUS = 0.5;

const COLORS = { fwd: 0xd8f41d, back: 0x5cc8ff, device: 0x1b1f24, skin: 0xc4ccd6 };

// Rotation about X: positive angles carry the hand toward -Z (forward).
const toRad = deg => THREE.MathUtils.degToRad(THREE.MathUtils.clamp(deg, -90, 90));

function pivotAround(object, point) {
  const pivot = new THREE.Group();
  pivot.position.copy(point);
  object.position.sub(point);
  pivot.add(object);
  return pivot;
}

function sectorGeometry(fromDeg, toDeg, radius) {
  const steps = 48;
  const positions = [0, 0, 0];
  for (let i = 0; i <= steps; i++) {
    const a = toRad(fromDeg + (toDeg - fromDeg) * (i / steps));
    positions.push(0, -Math.cos(a) * radius, -Math.sin(a) * radius);
  }
  const index = [];
  for (let i = 1; i <= steps; i++) index.push(0, i, i + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

function makeZone(color) {
  const material = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false
  });
  return new THREE.Mesh(new THREE.BufferGeometry(), material);
}

function makeWearable() {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(0.034, 0.075, 0.032),
    new THREE.MeshStandardMaterial({ color: COLORS.device, roughness: 0.55 })
  );
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(0.036, 0.077, 0.006),
    new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4, emissive: COLORS.fwd, emissiveIntensity: 0 })
  );
  lid.position.z = 0.018;
  group.add(shell, lid);
  group.position.copy(WRIST).sub(ELBOW);
  group.userData.lid = lid;

  const strap = new THREE.Mesh(
    new THREE.TorusGeometry(0.034, 0.006, 12, 48),
    new THREE.MeshStandardMaterial({ color: COLORS.device, roughness: 0.9 })
  );
  strap.rotation.x = Math.PI / 2;
  strap.scale.set(0.9, 1, 1);
  strap.position.copy(WRIST_CENTER).sub(WRIST);
  group.add(strap);
  return group;
}

// The CAD export carries flat placeholder colours; a single matte finish reads better.
function applyClay(root) {
  const clay = new THREE.MeshStandardMaterial({ color: COLORS.skin, roughness: 0.6 });
  root.traverse(node => {
    if (node.isMesh) node.material = clay;
  });
}

export async function createArmView(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(1.5, 2, 1);
  scene.add(key);

  scene.environmentIntensity = 0.7;

  const target = new THREE.Vector3(0.05, 0.64, 0.27);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  camera.position.copy(target).add(new THREE.Vector3(1.62, 0.2, 0.7));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minPolarAngle = Math.PI * 0.3;
  controls.maxPolarAngle = Math.PI * 0.62;

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [upper, lower] = await Promise.all([
    loader.loadAsync('models/upper_arm.glb'),
    loader.loadAsync('models/lower_arm.glb')
  ]);

  applyClay(upper.scene);
  applyClay(lower.scene);

  // Shoulder pivot carries the whole arm; the elbow pivot is nested inside it.
  const elbow = pivotAround(lower.scene, ELBOW);
  const shoulder = pivotAround(upper.scene, SHOULDER);
  elbow.position.sub(SHOULDER);
  shoulder.add(elbow);
  const wearable = makeWearable();
  elbow.add(wearable);
  scene.add(shoulder);

  const zones = new THREE.Group();
  zones.position.copy(SHOULDER).add(new THREE.Vector3(-0.04, 0, 0));
  const zoneFwd = makeZone(COLORS.fwd);
  const zoneBack = makeZone(COLORS.back);
  zones.add(zoneFwd, zoneBack);
  scene.add(zones);

  let pitch = 0;
  let targetPitch = 0;
  let flash = null;
  let visible = true;
  let thresholdKey = '';

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(container);

  function flashLevel(now) {
    if (!flash) return 0;
    const t = now - flash.start;
    // Mirrors the firmware: 100 ms pulse, and for backward a 200 ms gap then a second pulse.
    const pulses = flash.dir > 0 ? [[0, 100]] : [[0, 100], [300, 400]];
    if (t > pulses.at(-1)[1] + 250) { flash = null; return 0; }
    return pulses.some(([a, b]) => t >= a && t <= b + 120) ? 1 : 0;
  }

  renderer.setAnimationLoop(now => {
    if (!visible) return;
    pitch += (targetPitch - pitch) * 0.35;
    shoulder.rotation.x = toRad(pitch);
    elbow.rotation.x = toRad(8 + Math.max(0, pitch) * 0.35);

    const level = flashLevel(now);
    const lid = wearable.userData.lid;
    lid.material.emissive.setHex(flash?.dir < 0 ? COLORS.back : COLORS.fwd);
    lid.material.emissiveIntensity += (level * 1.6 - lid.material.emissiveIntensity) * 0.4;
    zoneFwd.material.opacity = 0.1 + (flash?.dir > 0 ? level * 0.3 : 0);
    zoneBack.material.opacity = 0.1 + (flash?.dir < 0 ? level * 0.3 : 0);

    controls.update();
    renderer.render(scene, camera);
  });

  return {
    setPitch(deg) { targetPitch = deg; },
    setThresholds(fwd, back) {
      const key = `${fwd.toFixed(1)}|${back.toFixed(1)}`;
      if (key === thresholdKey) return;
      thresholdKey = key;
      zoneFwd.geometry.dispose();
      zoneBack.geometry.dispose();
      zoneFwd.geometry = sectorGeometry(fwd, 90, ZONE_RADIUS);
      zoneBack.geometry = sectorGeometry(-90, back, ZONE_RADIUS);
    },
    cue(dir) { flash = { dir, start: performance.now() }; }
  };
}
