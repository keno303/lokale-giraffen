// Walking giraffe — scene setup and render loop.
// Runs from file:// with no build step (classic scripts + local three.js).




const container = document.getElementById('app');

// --------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// ------------------------------------------------------------------ scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbcd7ea);
scene.fog = new THREE.Fog(0xbcd7ea, 40, 140);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(9.5, 5.6, 10.5);

// ------------------------------------------------------------------ lights
const hemi = new THREE.HemisphereLight(0xcfe6f5, 0x8a7a52, 0.85);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2dc, 2.1);
sun.position.set(-14, 18, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 70;
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.02;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xbdd7ee, 0.55);
fill.position.set(12, 8, -12);
scene.add(fill);

// ------------------------------------------------------------------ ground
const groundTex = buildGroundTexture();
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(90, 64),
  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1.0, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// soft radial patch of drier grass under the giraffe
const patch = new THREE.Mesh(
  new THREE.CircleGeometry(16, 48),
  new THREE.MeshStandardMaterial({ color: 0xa8a066, roughness: 1, transparent: true, opacity: 0.18 }),
);
patch.rotation.x = -Math.PI / 2;
patch.position.y = 0.012;
scene.add(patch);

// ------------------------------------------------------------- background
// simple stylized acacia-ish trees and rocks for depth
function makeTree(x, z, scale, hue) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4b2c, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: hue, roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, 4.2, 8), trunkMat);
  trunk.position.y = 2.1;
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const ang = i * 2.1;
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.13, 2.4, 6), trunkMat);
    branch.position.set(Math.cos(ang) * 0.8, 3.9, Math.sin(ang) * 0.8);
    branch.rotation.set(Math.sin(ang) * 0.7, 0, -Math.cos(ang) * 0.7);
    branch.castShadow = true;
    g.add(branch);
  }
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 9), leafMat);
  canopy.position.y = 5.3;
  canopy.scale.set(1.55, 0.55, 1.55);
  canopy.castShadow = true;
  g.add(canopy);
  const canopy2 = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), leafMat);
  canopy2.position.set(1.4, 4.7, -0.9);
  canopy2.scale.set(1.3, 0.5, 1.3);
  g.add(canopy2);
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  return g;
}

scene.add(makeTree(-22, -18, 1.35, 0x5d7a34));
scene.add(makeTree(26, -26, 1.7, 0x53702c));
scene.add(makeTree(-32, 8, 1.1, 0x6a8438));
scene.add(makeTree(34, 12, 1.25, 0x5b7530));
scene.add(makeTree(-14, -42, 1.5, 0x587431));
scene.add(makeTree(10, -52, 1.9, 0x4f6c2c));

const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a8f7c, roughness: 1 });
for (let i = 0; i < 14; i++) {
  const a = i * 2.399963;
  const r = 12 + (i * 7919) % 30;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + ((i * 31) % 7) * 0.14, 0), rockMat);
  rock.position.set(Math.cos(a) * r, 0.25, Math.sin(a) * r);
  rock.rotation.set(i * 0.7, i * 1.3, i * 0.4);
  rock.scale.y = 0.55;
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
}

// grass tufts near the path
const grassMat = new THREE.MeshStandardMaterial({ color: 0x7a8f42, roughness: 1, side: THREE.DoubleSide });
for (let i = 0; i < 60; i++) {
  const a = i * 2.399963;
  const r = 6 + ((i * 2671) % 40);
  const tuft = new THREE.Group();
  const blades = 3 + (i % 3);
  for (let b = 0; b < blades; b++) {
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.9 + ((i + b) % 4) * 0.18, 4), grassMat);
    blade.position.set((b - blades / 2) * 0.12, 0.45, ((b * 7) % 5) * 0.08);
    blade.rotation.z = (b - blades / 2) * 0.22;
    tuft.add(blade);
  }
  tuft.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
  scene.add(tuft);
}

// ---------------------------------------------------------------- giraffe
const giraffe = buildGiraffe();
const walker = new THREE.Group();
walker.add(giraffe.group);
scene.add(walker);

// cast shadows on everything in the model
giraffe.group.traverse((o) => {
  if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
});

const animate = makeAnimator(giraffe.parts);

// --------------------------------------------------------------- controls
// compact orbit controls (no external dependency)
const orbit = {
  target: new THREE.Vector3(0, 3.6, 0),
  theta: 0.72, phi: 1.22, radius: 15.5,
  minRadius: 5, maxRadius: 60,
  minPhi: 0.15, maxPhi: Math.PI / 2 - 0.02,
};
function applyCamera() {
  const sp = Math.sin(orbit.phi), cp = Math.cos(orbit.phi);
  camera.position.set(
    orbit.target.x + orbit.radius * sp * Math.sin(orbit.theta),
    orbit.target.y + orbit.radius * cp,
    orbit.target.z + orbit.radius * sp * Math.cos(orbit.theta),
  );
  camera.lookAt(orbit.target);
}
applyCamera();

let dragging = false, dragButton = 0;
let lastX = 0, lastY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true;
  dragButton = e.button;
  lastX = e.clientX; lastY = e.clientY;
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointerup', (e) => {
  dragging = false;
  renderer.domElement.releasePointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  if (dragButton === 2) {
    // pan
    const panSpeed = orbit.radius * 0.0012;
    const forward = new THREE.Vector3().subVectors(orbit.target, camera.position);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    orbit.target.addScaledVector(right, dx * panSpeed);
    orbit.target.y += dy * panSpeed;
    orbit.target.y = Math.max(0.5, Math.min(12, orbit.target.y));
  } else {
    orbit.theta -= dx * 0.0052;
    orbit.phi = Math.max(orbit.minPhi, Math.min(orbit.maxPhi, orbit.phi - dy * 0.0052));
  }
  applyCamera();
});
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  orbit.radius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.radius * (1 + e.deltaY * 0.0011)));
  applyCamera();
}, { passive: false });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// --------------------------------------------------------------- keyboard
let paused = false;
let speed = 1.0;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { paused = !paused; e.preventDefault(); }
  else if (e.code === 'ArrowUp') speed = Math.min(3.0, speed + 0.15);
  else if (e.code === 'ArrowDown') speed = Math.max(0.25, speed - 0.15);
});

// -------------------------------------------------------------- animation
const clock = new THREE.Clock();
let simTime = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!paused) simTime += dt;

  animate(simTime, speed);

  // the giraffe ambles forward along +Z; recycle far ahead of the camera
  const v = 1.15 * speed; // matches WALK.strideSpeed (keeps hooves planted)
  if (!paused) walker.position.z += v * dt;
  if (walker.position.z > 60) walker.position.z -= 120;
  if (walker.position.z < -60) walker.position.z += 120;

  // keep the walk root at a steady height (animator bobs the inner group)
  giraffe.group.position.x = Math.sin(simTime * 0.7) * 0.02;

  renderer.render(scene, camera);
}
frame();

// ----------------------------------------------------------------- resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// idle camera drift for a bit of life before user interaction
let drift = 0;
setInterval(() => {
  if (dragging) return;
  if (window.__giraffe && window.__giraffe.autoDrift === false) return;
  drift += 0.0035;
  orbit.theta += 0.00045 * Math.sin(drift * 0.7);
  applyCamera();
}, 32);

// expose for debugging
window.__giraffe = {
  scene, camera, renderer, giraffe, DIMS,
  setSimTime: (t) => { simTime = t; },
  setSpeed: (s) => { speed = s; },
};
