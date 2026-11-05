'use strict';
/* ============================================================
   A walking giraffe in the savanna — pure Three.js, no server.
   Open index.html directly.
   ============================================================ */

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;

// deterministic RNG so the scene looks the same every load
let _seed = 20261104;
function rand() {
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randRange(a, b) { return a + (b - a) * rand(); }

// ---------------- renderer / scene / camera ----------------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: true });
} catch (e) {
  document.getElementById('nogl').style.display = 'block';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe9d8ae, 70, 300);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 900);

// sky: vertical gradient as screen-space background
{
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.00, '#5f97cf');
  grad.addColorStop(0.45, '#9cc0dd');
  grad.addColorStop(0.72, '#d8d3ae');
  grad.addColorStop(1.00, '#f0e0b2');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}

// ---------------- lights ----------------
const hemi = new THREE.HemisphereLight(0xbfd4f0, 0x9a7b4a, 0.85);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffe3b8, 1.6);
sun.position.set(16, 24, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -8;
sun.shadow.camera.near = 5; sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);
sun.target.position.set(0, 1.5, 0);
scene.add(sun.target);

// ---------------- canvas textures ----------------
function makeGiraffeSkinCanvas() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  // cream base
  g.fillStyle = '#e9c795';
  g.fillRect(0, 0, S, S);
  // reticulated patches: irregular polygons, cream lines between them
  const patchColors = ['#a25a28', '#9a5124', '#aa6130', '#8f4a1f', '#b06a33'];
  for (let i = 0; i < 46; i++) {
    const cx = rand() * S, cy = rand() * S;
    const n = 7 + Math.floor(rand() * 5);
    const R = 22 + rand() * 26;
    g.fillStyle = patchColors[Math.floor(rand() * patchColors.length)];
    g.globalAlpha = 0.92;
    g.beginPath();
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * TAU + rand() * 0.25;
      const r = R * (0.72 + rand() * 0.5);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * (0.8 + rand() * 0.4);
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
  // subtle grain
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(120,70,30,0.05)' : 'rgba(255,235,200,0.05)';
    const s = rand() < 0.8 ? 1 : 2;
    g.fillRect(rand() * S, rand() * S, s, s);
  }
  return c;
}

function makeLegSkinCanvas() {
  // like the body skin, but fading to a darker solid tan toward the hooves
  const S = 512;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  g.drawImage(makeGiraffeSkinCanvas(), 0, 0);
  const grad = g.createLinearGradient(0, S * 0.55, 0, S);
  grad.addColorStop(0, 'rgba(122,74,36,0)');
  grad.addColorStop(1, 'rgba(104,58,26,0.95)');
  g.fillStyle = grad;
  g.fillRect(0, S * 0.55, S, S * 0.45);
  return c;
}

function makeGroundCanvas() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#b3924f';
  g.fillRect(0, 0, S, S);
  const cols = ['#c2a05a', '#a5854a', '#d0b271', '#8f713e', '#bb9a55', '#84683a', '#d8bd80', '#9a7c42'];
  // wrapped blobs so the texture tiles seamlessly
  for (let i = 0; i < 620; i++) {
    const x = rand() * S, y = rand() * S;
    const r = 5 + rand() * 28;
    g.fillStyle = cols[Math.floor(rand() * cols.length)];
    g.globalAlpha = 0.20 + rand() * 0.34;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath();
      g.ellipse(x + ox, y + oy, r, r * (0.45 + rand() * 0.5), rand() * TAU, 0, TAU);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  // dry grass strokes
  for (let i = 0; i < 900; i++) {
    const x = rand() * S, y = rand() * S;
    const a = rand() * TAU, l = 2 + rand() * 5;
    g.strokeStyle = rand() < 0.5 ? 'rgba(96,72,36,0.22)' : 'rgba(226,204,148,0.20)';
    g.lineWidth = 1;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
      g.stroke();
    }
  }
  return c;
}

function makeContactShadowCanvas() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(40,25,10,0.42)');
  grad.addColorStop(0.6, 'rgba(40,25,10,0.18)');
  grad.addColorStop(1, 'rgba(40,25,10,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return c;
}

function makeGrassCanvas() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  const cols = ['#8f8140', '#a0924c', '#7c6f36', '#b0a058', '#6f6330', '#97894a'];
  for (let i = 0; i < 22; i++) {
    const x0 = 18 + rand() * (S - 36);
    const lean = (rand() - 0.5) * 58;
    const h = 50 + rand() * 74;
    g.strokeStyle = cols[Math.floor(rand() * cols.length)];
    g.lineWidth = 3 + rand() * 3.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x0, S);
    g.quadraticCurveTo(x0 + lean * 0.3, S - h * 0.6, x0 + lean, S - h);
    g.stroke();
  }
  return c;
}

const skinCanvas = makeGiraffeSkinCanvas();
const legCanvas = makeLegSkinCanvas();
const groundCanvas = makeGroundCanvas();

function skinTexture(repU, repV) {
  const t = new THREE.CanvasTexture(skinCanvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repU, repV);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
function legTexture(repU, repV) {
  const t = new THREE.CanvasTexture(legCanvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repU, repV);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// ---------------- materials ----------------
const matBody = new THREE.MeshStandardMaterial({ map: skinTexture(3.0, 1.9), roughness: 0.82 });
const matNeck = new THREE.MeshStandardMaterial({ map: skinTexture(1.6, 3.0), roughness: 0.82 });
const matHead = new THREE.MeshStandardMaterial({ map: skinTexture(1.2, 0.9), roughness: 0.8 });
const matLegF = new THREE.MeshStandardMaterial({ map: legTexture(1.1, 2.2), roughness: 0.85 });
const matLegB = new THREE.MeshStandardMaterial({ map: legTexture(1.3, 2.0), roughness: 0.85 });
const matDark = new THREE.MeshStandardMaterial({ color: 0x241610, roughness: 0.9 });   // mane, tail tuft
const matHoof = new THREE.MeshStandardMaterial({ color: 0x37322c, roughness: 0.7 });
const matEye = new THREE.MeshStandardMaterial({ color: 0x1a100a, roughness: 0.25 });
const matNostril = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.8 });

// ---------------- giraffe ----------------
const giraffe = new THREE.Group();
const body = new THREE.Group();   // bobs & rocks with the gait
giraffe.add(body);

function mesh(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  (parent || body).add(m);
  return m;
}

// --- torso ---
const barrel = mesh(new THREE.SphereGeometry(1, 30, 22), matBody, 0, 1.75, 0);
barrel.scale.set(0.55, 0.50, 1.28);
const chest = mesh(new THREE.SphereGeometry(1, 26, 18), matBody, 0, 1.84, 0.94);
chest.scale.set(0.46, 0.44, 0.64);
const rump = mesh(new THREE.SphereGeometry(1, 26, 18), matBody, 0, 1.70, -0.88);
rump.scale.set(0.48, 0.42, 0.68);

// shoulder / hip joints: leg pivots
const LEGS = [
  { front: true,  x:  0.34, y: 2.00, z:  0.60, phase: 0 },      // FL
  { front: true,  x: -0.34, y: 2.00, z:  0.60, phase: Math.PI },// FR
  { front: false, x:  0.34, y: 1.95, z: -0.75, phase: Math.PI },// HL
  { front: false, x: -0.34, y: 1.95, z: -0.75, phase: 0 },      // HR  (diagonal gait)
];
for (const L of LEGS) {
  const bx = Math.sign(L.x) * (L.front ? 0.29 : 0.29);
  const ball = mesh(new THREE.SphereGeometry(1, 18, 14), matBody, bx, L.front ? 1.96 : 1.92, L.front ? 0.56 : -0.72);
  ball.scale.set(L.front ? 0.14 : 0.15, L.front ? 0.14 : 0.15, L.front ? 0.17 : 0.18);
}

// --- legs ---
function buildLeg(L) {
  const D = L.front
    ? { upperLen: 1.02, lowerLen: 0.82, upperR: 0.115, lowerR: 0.078, restUpper: 0, restLower: 0.06, flexK: 0.55 }
    : { upperLen: 0.95, lowerLen: 0.90, upperR: 0.140, lowerR: 0.072, restUpper: 0.38, restLower: -0.62, flexK: 0.50 };

  const joint = new THREE.Group();
  joint.position.set(L.x, L.y, L.z);
  body.add(joint);

  const upper = new THREE.Mesh(new THREE.CylinderGeometry(D.upperR, D.upperR * 0.72, D.upperLen, 14), L.front ? matLegF : matLegB);
  upper.position.y = -D.upperLen / 2;
  joint.add(upper);

  const knee = new THREE.Group();
  knee.position.y = -D.upperLen;
  joint.add(knee);

  const lower = new THREE.Mesh(new THREE.CylinderGeometry(D.lowerR, D.lowerR * 0.72, D.lowerLen, 14), L.front ? matLegF : matLegB);
  lower.position.y = -D.lowerLen / 2;
  knee.add(lower);

  const pastern = new THREE.Mesh(new THREE.CylinderGeometry(D.lowerR * 0.72, 0.062, 0.08, 12), L.front ? matLegF : matLegB);
  pastern.position.y = -D.lowerLen - 0.02;
  knee.add(pastern);

  const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.15, 0.18), matHoof);
  hoof.position.set(0, -D.lowerLen - 0.08, 0.03);
  knee.add(hoof);

  joint.rotation.x = D.restUpper;
  knee.rotation.x = D.restLower;
  L.joint = joint; L.knee = knee; L.D = D;
}
LEGS.forEach(buildLeg);

// --- neck (group so the whole neck+head can nod) ---
const neck = new THREE.Group();
neck.position.set(0, 2.10, 0.74);
neck.rotation.x = 0.46;
body.add(neck);

const neckCyl = mesh(new THREE.CylinderGeometry(0.20, 0.30, 1.7, 20), matNeck, 0, 0.85, 0, neck);
const neckBase = mesh(new THREE.SphereGeometry(1, 20, 14), matNeck, 0, 0.08, 0.06, neck);
neckBase.scale.set(0.28, 0.22, 0.32);
const neckTop = mesh(new THREE.SphereGeometry(1, 18, 12), matNeck, 0, 1.62, 0.02, neck);
neckTop.scale.set(0.21, 0.20, 0.24);

// mane: flattened tube down the back of the neck
{
  const pts = [
    new THREE.Vector3(0, 0.16, -0.28),
    new THREE.Vector3(0, 0.70, -0.285),
    new THREE.Vector3(0, 1.30, -0.255),
    new THREE.Vector3(0, 1.66, -0.19),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.06, 8), matDark);
  tube.scale.z = 0.55;
  neck.add(tube);
}

// --- head ---
const head = new THREE.Group();
head.position.set(0, 1.60, 0.03);
neck.add(head);

mesh(new THREE.SphereGeometry(1, 24, 18), matHead, 0, 0.06, 0.04, head).scale.set(0.175, 0.15, 0.235);   // skull
mesh(new THREE.SphereGeometry(1, 20, 14), matHead, 0, -0.02, 0.25, head).scale.set(0.11, 0.095, 0.15);   // muzzle
mesh(new THREE.SphereGeometry(1, 14, 10), matHead, 0, -0.038, 0.30, head).scale.set(0.065, 0.055, 0.075);   // nose bridge light patch
for (const s of [-1, 1]) {
  const eye = mesh(new THREE.SphereGeometry(0.027, 12, 10), matEye, s * 0.128, 0.105, 0.13, head);
  eye.scale.set(1, 1.15, 0.8);
  mesh(new THREE.SphereGeometry(0.014, 8, 8), matNostril, s * 0.042, 0.05, 0.36, head);
  // ossicone (horn)
  const os = new THREE.Group();
  os.position.set(s * 0.058, 0.215, -0.06);
  head.add(os);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.022, 0.13, 10), matHead);
  shaft.position.y = 0.065;
  os.add(shaft);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), matDark);
  knob.position.y = 0.145;
  os.add(knob);
  // ear
  const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), matHead);
  ear.scale.set(0.036, 0.07, 0.115);
  ear.position.set(s * 0.175, 0.13, -0.055);
  ear.rotation.set(0, s * 0.4, -s * 0.55);
  head.add(ear);
}
// crown of the mane
mesh(new THREE.SphereGeometry(1, 14, 10), matDark, 0, 0.185, -0.03, head).scale.set(0.09, 0.05, 0.17);

// --- tail ---
const tail = new THREE.Group();
tail.position.set(0, 2.02, -1.00);
body.add(tail);
{
  const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.026, 0.50, 10), matBody);
  seg1.position.y = -0.25;
  tail.add(seg1);
  const seg2 = new THREE.Group();
  seg2.position.y = -0.50;
  seg2.rotation.x = 0.35;
  tail.add(seg2);
  const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.018, 0.44, 10), matBody);
  s2.position.y = -0.22;
  seg2.add(s2);
  const tuftG = new THREE.Group();
  tuftG.position.y = -0.44;
  tuftG.rotation.x = 0.2;
  seg2.add(tuftG);
  const tuft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.052, 0.26, 10), matDark);
  tuft.position.y = -0.12;
  tuftG.add(tuft);
  const tuftTip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), matDark);
  tuftTip.scale.set(1, 1.3, 1);
  tuftTip.position.y = -0.24;
  tuftG.add(tuftTip);
}

// all giraffe meshes cast shadows
giraffe.traverse(o => { if (o.isMesh) o.castShadow = true; });

// stand the giraffe exactly on the ground (feet may be a few cm off)
{
  const bb = new THREE.Box3().setFromObject(giraffe);
  giraffe.position.y = -bb.min.y;
}

// soft contact shadow under the body
{
  const t = new THREE.CanvasTexture(makeContactShadowCanvas());
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(1.3, 32),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.scale.set(0.72, 1.0, 1.55);
  m.position.y = 0.015;
  giraffe.add(m);
  m.castShadow = false;
}

scene.add(giraffe);

// ---------------- environment (scrolls past to fake the walk) ----------------
const world = new THREE.Group();   // rotates with the giraffe's heading
scene.add(world);

// ground
const groundTex = new THREE.CanvasTexture(groundCanvas);
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(100, 100);
groundTex.colorSpace = THREE.SRGBColorSpace;
groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(400, 48),
  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
world.add(ground);
const GROUND_TILE = (400 * 2) / 100; // world size of one texture tile (repeat 100)

const scrollers = []; // { obj, wrap: ()=>void }

const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x5a683c, roughness: 1 });
const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x66744a, roughness: 1 });
function makeTree(s) {
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.10 * s, 0.22 * s, 2.0 * s, 8), barkMat);
  trunk.position.y = 1.0 * s;
  trunk.rotation.z = (rand() - 0.5) * 0.12;
  t.add(trunk);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.07 * s, 1.3 * s, 7), barkMat);
    b.position.set((rand() - 0.5) * 0.7 * s, (1.8 + rand() * 0.5) * s, (rand() - 0.5) * 0.7 * s);
    b.rotation.set((rand() - 0.5) * 1.1, 0, (rand() - 0.5) * 1.1);
    t.add(b);
  }
  // flat acacia-style canopy
  const n = 3 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 9), i % 2 ? leafMat : leafMat2);
    const r = (1.3 + rand() * 1.1) * s;
    c.scale.set(r, (0.30 + rand() * 0.18) * s, r);
    c.position.set((rand() - 0.5) * 1.6 * s, (2.3 + rand() * 0.6) * s, (rand() - 0.5) * 1.6 * s);
    t.add(c);
  }
  t.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return t;
}

for (let i = 0; i < 20; i++) {
  const s = randRange(0.9, 2.3);
  const t = makeTree(s);
  t.position.set(randRange(-48, 48), 0, randRange(-320, 140));
  t.rotation.y = rand() * TAU;
  // keep a clear "path" in the middle
  if (Math.abs(t.position.x) < 7) t.position.x += (t.position.x >= 0 ? 1 : -1) * 9;
  world.add(t);
  scrollers.push({ obj: t, re: () => { t.position.x = randRange(-48, 48); if (Math.abs(t.position.x) < 7) t.position.x += (t.position.x >= 0 ? 1 : -1) * 9; } });
}

const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8271, roughness: 1 });
for (let i = 0; i < 16; i++) {
  const r = randRange(0.18, 0.65);
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
  rock.scale.set(1, randRange(0.5, 0.8), randRange(0.8, 1.3));
  rock.position.set(randRange(-40, 40), r * 0.35, randRange(-320, 140));
  rock.rotation.set(rand() * TAU, rand() * TAU, rand() * TAU);
  rock.castShadow = true;
  rock.receiveShadow = true;
  world.add(rock);
  scrollers.push({ obj: rock, re: () => { rock.position.x = randRange(-40, 40); if (Math.abs(rock.position.x) < 4) rock.position.x += 6; } });
}

// grass tufts: instanced crossed planes
const grass = (() => {
  const gt = new THREE.CanvasTexture(makeGrassCanvas());
  gt.colorSpace = THREE.SRGBColorSpace;
  const gm = new THREE.MeshStandardMaterial({
    map: gt, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1
  });
  const geo = new THREE.PlaneGeometry(0.75, 0.62);
  geo.translate(0, 0.31, 0);
  const geo2 = geo.clone();
  geo2.rotateY(Math.PI / 2);
  // simple merge of two crossed planes
  const mergedGeo = mergePlanes(geo.clone(), geo2.clone());
  const N = 130;
  const im = new THREE.InstancedMesh(mergedGeo, gm, N);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const data = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    const d = {
      x: randRange(-45, 45),
      z: randRange(-320, 140),
      s: randRange(0.8, 2.1),
      rot: rand() * TAU,
      tint: new THREE.Color().setHSL(0.12 + rand() * 0.05, 0.32 + rand() * 0.2, 0.34 + rand() * 0.14)
    };
    if (Math.abs(d.x) < 2.5) d.x += (d.x >= 0 ? 1 : -1) * 4;
    data.push(d);
    dummy.position.set(d.x, 0, d.z);
    dummy.rotation.set(0, d.rot, 0);
    dummy.scale.setScalar(d.s);
    dummy.updateMatrix();
    im.setMatrixAt(i, dummy.matrix);
    im.setColorAt(i, d.tint);
  }
  im.castShadow = false;
  world.add(im);
  return { im, data, dummy, N };
})();

function mergePlanes(a, b) {
  const ga = a.index ? a.toNonIndexed() : a;
  const gb = b.index ? b.toNonIndexed() : b;
  const geo = new THREE.BufferGeometry();
  const pa = ga.attributes.position.array, pb = gb.attributes.position.array;
  const ua = ga.attributes.uv.array, ub = gb.attributes.uv.array;
  const pos = new Float32Array(pa.length + pb.length);
  const uv = new Float32Array(ua.length + ub.length);
  pos.set(pa, 0); pos.set(pb, pa.length);
  uv.set(ua, 0); uv.set(ub, ua.length);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

// birds circling far above
const birds = [];
{
  const bmat = new THREE.MeshBasicMaterial({ color: 0x2b2b33, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    const bodyM = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), bmat);
    bodyM.scale.set(1, 0.8, 2.2);
    b.add(bodyM);
    const wingGeo = new THREE.PlaneGeometry(0.75, 0.22);
    wingGeo.translate(0.375, 0, 0);
    const wL = new THREE.Mesh(wingGeo, bmat);
    const wR = new THREE.Mesh(wingGeo, bmat);
    wR.rotation.y = Math.PI;
    b.add(wL, wR);
    scene.add(b);
    birds.push({ g: b, wL, wR, r: randRange(14, 30), h: randRange(9, 15), w: (0.08 + rand() * 0.1) * (i % 2 ? 1 : -1), a: rand() * TAU, flap: 5 + rand() * 3, ph: rand() * TAU });
  }
}

// ---------------- state & controls ----------------
const state = {
  speed: 0,        // eased target speed (m/s preset)
  target: 0,
  preset: 1.4,
  phase: 0,
  yaw: 0,
  yawTarget: 0,
  t: 0,
};

const PRESETS = { 1: 0.8, 2: 1.5, 3: 2.6, 4: 3.8 };
const PRESET_NAMES = { 1: 'slow walk', 2: 'walk', 3: 'trot', 4: 'fast trot' };

function setSpeed(v, name) {
  state.target = v;
  if (v > 0) state.preset = v;
  state.speedName = name || (v > 0 ? PRESET_NAMES[Object.keys(PRESETS).find(k => Math.abs(PRESETS[k] - v) < 0.01)] : '');
}
setSpeed(1.5, 'walk'); // start walking right away
// hidden debug: ?prewarm=N freezes a mid-gait pose (N = gait phase in rad)
{
  const q = parseFloat(new URLSearchParams(location.search).get('prewarm') || '0');
  if (q > 0) { state.speed = 1.5; state.phase = q; }
}

const keys = {};
window.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (state.target > 0) setSpeed(0, 'standing');
    else setSpeed(state.preset, PRESET_NAMES[Object.keys(PRESETS).find(k => Math.abs(PRESETS[k] - state.preset) < 0.01)] || 'walk');
    return;
  }
  if (e.code >= 'Digit1' && e.code <= 'Digit4') {
    const n = +e.code.slice(5);
    setSpeed(PRESETS[n], PRESET_NAMES[n]);
  }
  keys[e.code] = true;
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// camera orbit (drag) + zoom (wheel)
const cam = { az: 0.55, el: 0.16, dist: 11.5, tAz: 0.55, tEl: 0.16, tDist: 11.5 };
// ?view=side|front|top|close — handy preset camera angles
{
  const v = new URLSearchParams(location.search).get('view');
  if (v === 'side') { cam.az = cam.tAz = Math.PI / 2; }
  else if (v === 'front') { cam.az = cam.tAz = Math.PI; }
  else if (v === 'top') { cam.az = cam.tAz = 0; cam.el = cam.tEl = 1.05; }
  else if (v === 'close') { cam.az = cam.tAz = 0.9; cam.el = cam.tEl = 0.12; cam.dist = cam.tDist = 6.5; }
}
let dragging = false, px = 0, py = 0;
const cv = renderer.domElement;
cv.addEventListener('pointerdown', e => { dragging = true; px = e.clientX; py = e.clientY; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => {
  if (!dragging) return;
  cam.tAz -= (e.clientX - px) * 0.005;
  cam.tEl = clamp(cam.tEl + (e.clientY - py) * 0.005, 0.02, 1.25);
  px = e.clientX; py = e.clientY;
});
cv.addEventListener('pointerup', e => { dragging = false; try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('wheel', e => {
  e.preventDefault();
  cam.tDist = clamp(cam.tDist * (1 + e.deltaY * 0.001), 4, 45);
}, { passive: false });

// double click / tap: toggle walk
let lastTap = 0;
cv.addEventListener('pointerup', e => {
  const now = performance.now();
  if (now - lastTap < 300 && Math.abs(e.movementX) < 4) {
    if (state.target > 0) setSpeed(0, 'standing');
    else setSpeed(state.preset, PRESET_NAMES[Object.keys(PRESETS).find(k => Math.abs(PRESETS[k] - state.preset) < 0.01)] || 'walk');
  }
  lastTap = now;
});

const statusEl = document.getElementById('status');

// ---------------- animation ----------------
const clock = new THREE.Clock();
const target = new THREE.Vector3();
const camPos = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.t += dt;
  const t = state.t;

  // ease speed and heading
  state.speed += (state.target - state.speed) * Math.min(1, dt * 2.2);
  if (Math.abs(state.speed) < 0.001) state.speed = 0;
  if (keys['ArrowLeft'] || keys['KeyA']) state.yawTarget += 0.9 * dt;
  if (keys['ArrowRight'] || keys['KeyD']) state.yawTarget -= 0.9 * dt;
  state.yaw += (state.yawTarget - state.yaw) * Math.min(1, dt * 3);
  world.rotation.y = state.yaw;
  giraffe.rotation.y = state.yaw;

  // gait envelope: 0 when standing, 1 when moving
  const e = clamp(state.speed / 0.55, 0, 1);
  const ee = e * e * (3 - 2 * e);

  const ampBase = 0.32 + 0.075 * state.speed;             // hip swing at full gait (rad)
  const amp = ampBase * ee;
  const freq = (0.55 + 0.22 * state.speed) * ee;          // steps per second (per leg pair)
  state.phase += TAU * freq * dt;
  const ph = state.phase;

  // legs — diagonal walk (FL+HR, FR+HL in phase)
  for (const L of LEGS) {
    const p = ph + L.phase;
    L.joint.rotation.x = L.D.restUpper + amp * Math.sin(p);
    const flex = L.D.flexK * Math.max(0, -Math.sin(p)) * ee; // fold lower limb while swinging forward
    L.knee.rotation.x = L.D.restLower + flex;
  }

  // body bob & sway (twice per stride)
  body.position.y = 0.055 * Math.sin(2 * ph + 0.5) * ee;
  body.rotation.x = 0.022 * Math.sin(2 * ph) * ee;
  body.rotation.z = 0.026 * Math.sin(2 * ph + 0.9) * ee;
  body.position.x = 0.03 * Math.sin(2 * ph + 0.9) * ee;

  // gentle breathing while standing
  const idle = 1 - ee;
  const br = 1 + 0.016 * Math.sin(t * 1.4) * idle;
  barrel.scale.y = 0.50 * br;
  chest.scale.y = 0.44 * br;
  rump.scale.y = 0.42 * br;

  // neck & head: counter-sway plus a slow curious look-around
  neck.rotation.x = 0.46 + 0.05 * Math.sin(2 * ph + 1.3) * ee + 0.09 * Math.sin(t * 0.33);
  neck.rotation.y = 0.10 * Math.sin(2 * ph + 2.0) * ee + 0.10 * Math.sin(t * 0.21);
  head.rotation.y = 0.38 * Math.sin(t * 0.16);
  head.rotation.x = 0.05 * Math.sin(t * 0.42) + 0.03 * Math.sin(t * 0.9);

  // tail: slow fly-swatting side swing + gait sway
  tail.rotation.x = 0.30 + 0.16 * Math.sin(ph + 0.6) * ee + 0.05 * Math.sin(t * 0.7);
  tail.rotation.y = 0.5 * Math.sin(t * 0.85) * (0.35 + 0.65 * ee) + 0.1 * Math.sin(t * 2.3);

  // world scroll: ground speed derived from the gait (feet don't slide)
  const v = 2.0 * ampBase * freq;                          // m/s (stride length ~ 2*amp*legLen, legLen≈1m)
  const dz = v * dt;
  if (dz > 0) {
    for (const s of scrollers) {
      s.obj.position.z -= dz;
      if (s.obj.position.z < -330) { s.obj.position.z += 470; s.re(); }
    }
    for (let i = 0; i < grass.N; i++) {
      const d = grass.data[i];
      d.z -= dz;
      if (d.z < -330) { d.z += 470; d.x = randRange(-42, 42); if (Math.abs(d.x) < 2.5) d.x += 5; }
      grass.dummy.position.set(d.x, 0, d.z);
      grass.dummy.rotation.set(0, d.rot, 0);
      grass.dummy.scale.setScalar(d.s);
      grass.dummy.updateMatrix();
      grass.im.setMatrixAt(i, grass.dummy.matrix);
    }
    grass.im.instanceMatrix.needsUpdate = true;
    groundTex.offset.y += dz / GROUND_TILE;
  }

  // birds
  for (const b of birds) {
    b.a += b.w * dt;
    b.g.position.set(Math.cos(b.a) * b.r, b.h + 0.4 * Math.sin(t * 0.5 + b.ph), Math.sin(b.a) * b.r);
    b.g.rotation.y = -b.a;
    const f = 0.55 + 0.45 * Math.sin(t * b.flap + b.ph);
    b.wL.rotation.z = f;
    b.wR.rotation.z = -f;
  }

  // status readout
  if (state.target === 0) statusEl.textContent = 'standing';
  else statusEl.textContent = (state.speedName || 'walk') + ' — ' + (v * 3.6).toFixed(1) + ' km/h';

  // camera: orbit around the giraffe, eased, with a touch of bob
  cam.az += (cam.tAz - cam.az) * Math.min(1, dt * 8);
  cam.el += (cam.tEl - cam.el) * Math.min(1, dt * 8);
  cam.dist += (cam.tDist - cam.dist) * Math.min(1, dt * 8);
  target.set(0, 2.25 + 0.05 * Math.sin(2 * ph + 0.5) * ee, 0.3);
  const co = Math.cos(cam.el), so = Math.sin(cam.el);
  const off = new THREE.Vector3(Math.sin(cam.az) * co * cam.dist, so * cam.dist, -Math.cos(cam.az) * co * cam.dist);
  off.applyAxisAngle(Y_AXIS, state.yaw);
  camPos.copy(target).add(off);
  camera.position.copy(camPos);
  camera.lookAt(target);

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
