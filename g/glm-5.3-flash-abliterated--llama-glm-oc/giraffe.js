/* ============================================================
   A realistic walking giraffe — Three.js (r159, UMD build)
   Runs from file:// — no server, no build step.
   ============================================================ */
'use strict';

/* ---------------- tiny helpers ---------------- */
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;

/* ---------------- procedural giraffe skin ---------------- */
function makeSkinCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#e8d5a8';                       // cream base
  g.fillRect(0, 0, 1024, 1024);

  // faint mottling in the base coat
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(210,186,140,${rand(0.12, 0.3)})`;
    g.beginPath();
    g.ellipse(rand(0, 1024), rand(0, 1024), rand(60, 190), rand(50, 160), rand(0, 3.14), 0, 6.3);
    g.fill();
  }

  // irregular patch grid (dense patches, narrow cream lines)
  const cols = 10, rows = 14, cw = 1024 / cols, ch = 1024 / rows;
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const cx = (q + 0.5) * cw + rand(-0.22, 0.22) * cw;
      const cy = (r + 0.5) * ch + rand(-0.22, 0.22) * ch;
      const base = Math.min(cw, ch) * rand(0.38, 0.48);
      const n = 9 + (Math.random() * 3 | 0);
      const hue = 26 + rand(0, 11), sat = 46 + rand(0, 14), lit = 35 + rand(0, 11);
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.18, 0.18);
        const rr = base * rand(0.72, 1.18);
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * rand(0.85, 1.15);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
      g.fillStyle = `hsl(${hue},${sat}%,${lit}%)`;
      g.fill();
      g.strokeStyle = `hsla(24,45%,26%,0.35)`;
      g.lineWidth = 3;
      g.stroke();
    }
  }
  return c;
}

function skinTexture(rx, ry) {
  const t = new THREE.CanvasTexture(makeSkinCanvas());
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ---------------- procedural savanna grass ---------------- */
function makeGrassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#97a55f';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 30; i++) {                     // dry / green patches
    g.fillStyle = `rgba(${160 + rand(-30, 20) | 0},${160 + rand(-40, 10) | 0},${90 + rand(-25, 15) | 0},0.14)`;
    g.beginPath();
    g.ellipse(rand(0, 512), rand(0, 512), rand(40, 140), rand(30, 110), rand(0, 3.14), 0, 6.3);
    g.fill();
  }
  for (let i = 0; i < 3200; i++) {                   // grass strokes
    const x = rand(0, 512), y = rand(0, 512);
    g.strokeStyle = ['#7c8c4e', '#a9b26b', '#8a9a55', '#b3a75f', '#6f7f45'][i % 5];
    g.lineWidth = rand(0.8, 1.8);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + rand(-3, 3), y - rand(3, 9));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(11, 11);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ---------------- renderer / scene / camera ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd7dcbe, 28, 95);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 300);

/* sky dome */
{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x9fc4de) },
      horizon: { value: new THREE.Color(0xe9e3c8) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vP;
      void main(){ float h = smoothstep(-0.05, 0.45, normalize(vP).y);
        gl_FragColor = vec4(mix(horizon, top, pow(h, 0.85)), 1.0); }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(140, 24, 12), skyMat));
}

/* lights */
const hemi = new THREE.HemisphereLight(0xcfe4f2, 0x8f8458, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d8, 1.9);
sun.position.set(10, 16, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
sun.shadow.camera.near = 4; sun.shadow.camera.far = 50;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

/* ---------------- environment ---------------- */
{
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(70, 72),
    new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b543a, roughness: 1 });
  const leafMats = [0x4d6b3d, 0x587646, 0x44603a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));

  for (const [r, a, s] of [[14, 0.4, 1.1], [18, 2.3, 1.25], [12.5, 4.1, 0.95], [20, 1.5, 1.35], [16, 5.4, 1.1], [22, 3.4, 1.2]]) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.30 * s, 3.6 * s, 8), trunkMat);
    trunk.position.y = 1.8 * s;
    trunk.rotation.z = rand(-0.06, 0.06);
    trunk.castShadow = true;
    tree.add(trunk);
    for (let i = 0; i < 3; i++) {
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(rand(1.5, 2.1) * s, 12, 8), leafMats[i % 3]);
      canopy.scale.y = rand(0.3, 0.42);
      canopy.position.set(rand(-1.1, 1.1) * s, (3.5 + rand(0, 0.9)) * s, rand(-1.1, 1.1) * s);
      canopy.castShadow = true;
      tree.add(canopy);
    }
    tree.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
    tree.rotation.y = rand(0, 6.3);
    scene.add(tree);
  }

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8579, roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.35, 0.9), 0), rockMat);
    const a = rand(0, 6.3), r = i < 3 ? rand(5.5, 7.5) : rand(10.5, 24);
    rock.position.set(Math.sin(a) * r, rand(0.1, 0.3), Math.cos(a) * r);
    rock.scale.y = rand(0.5, 0.75);
    rock.rotation.y = rand(0, 6.3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }

  const tuftMat = [0x7c8c4e, 0x9aa460, 0xb3a75f].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
  for (let i = 0; i < 55; i++) {
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(rand(0.08, 0.16), rand(0.25, 0.5), 5), tuftMat[i % 3]);
    const a = rand(0, 6.3), r = rand(4.5, 26);
    tuft.position.set(Math.sin(a) * r, 0.12, Math.cos(a) * r);
    tuft.castShadow = true;
    scene.add(tuft);
  }
}

/* ---------------- materials for the giraffe ---------------- */
const skinBodyMat = new THREE.MeshStandardMaterial({ map: skinTexture(1.8, 1.0), roughness: 0.95 });
const skinNeckMat = new THREE.MeshStandardMaterial({ map: skinTexture(1.1, 0.9), roughness: 0.95 });
const skinLegMat = new THREE.MeshStandardMaterial({ map: skinTexture(0.5, 0.6), roughness: 0.95 });
const plainMat = new THREE.MeshStandardMaterial({ color: 0xe4cfa0, roughness: 0.95 });
const maneMat = new THREE.MeshStandardMaterial({ color: 0x7a5a30, roughness: 1 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x5c4633, roughness: 0.9 });
const hoofMat = new THREE.MeshStandardMaterial({ color: 0x3b3129, roughness: 0.85 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x241a10, roughness: 0.35 });

/* ---------------- the giraffe ---------------- */
const giraffe = new THREE.Group();          // moves along the path
const legsRoot = new THREE.Group();         // legs stay glued to the ground plane
const body = new THREE.Group();             // torso/neck/tail — gets the walk bob
giraffe.add(legsRoot, body);
scene.add(giraffe);

/* torso — a tapered, slightly tilted lathe (chest higher than rump) */
{
  const prof = [
    [-1.34, 0.02], [-1.32, 0.10], [-1.22, 0.30], [-1.10, 0.40], [-0.80, 0.46], [-0.40, 0.50],
    [0.00, 0.515], [0.50, 0.52], [0.90, 0.50], [1.15, 0.42], [1.25, 0.30], [1.32, 0.16], [1.34, 0.02],
  ].map(p => new THREE.Vector2(p[1], p[0]));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), skinBodyMat);
  const tilt = new THREE.Group();
  tilt.rotation.x = -0.08;                  // sloping back: chest end rides higher
  torso.rotation.x = Math.PI / 2;           // axis Y -> Z (rump -z, chest +z)
  torso.position.y = 2.32;
  torso.scale.set(0.94, 1, 1.08);           // narrow sideways, deeper vertically
  tilt.add(torso);
  body.add(tilt);
}

/* neck: chain of 3 tapered segments with a mane ridge */
const neckRoot = new THREE.Group();
neckRoot.position.set(0, 2.52, 0.62);
neckRoot.rotation.x = 0.55;                 // ~58° from horizontal
body.add(neckRoot);

const neckSegs = [];
{
  const radii = [0.335, 0.27, 0.215, 0.175];
  const curves = [0.08, 0.05, 0.03];
  let parent = neckRoot;
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Group();
    seg.rotation.x = curves[i];
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(radii[i + 1], radii[i], 0.82, 14), skinNeckMat);
    cyl.position.y = 0.40;
    const joint = new THREE.Mesh(new THREE.SphereGeometry(radii[i + 1], 12, 10), skinNeckMat);
    joint.position.y = 0.80;
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.68, 0.06), maneMat);
    mane.position.set(0, 0.38, -(radii[i] * 0.90 + 0.015));
    mane.rotation.x = -0.12;
    seg.add(cyl, joint, mane);
    parent.add(seg);
    const next = new THREE.Group();
    next.position.y = 0.80;
    seg.add(next);
    neckSegs.push(seg);
    parent = next;
  }
}

/* head */
const head = new THREE.Group();
head.position.y = 0.80;
head.rotation.x = -0.55;
neckSegs[2].add(head);
{
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), plainMat);
  skull.scale.set(0.82, 0.88, 1.2);
  skull.position.y = 0.02;
  head.add(skull);

  const muzzleG = new THREE.Group();
  muzzleG.position.set(0, -0.02, 0.26);
  muzzleG.rotation.x = 0.20;
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.128, 0.36, 12), plainMat);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.z = 0.18;
  const noseBand = new THREE.Mesh(new THREE.CylinderGeometry(0.102, 0.112, 0.08, 12), darkMat);
  noseBand.rotation.x = Math.PI / 2;
  noseBand.position.z = 0.30;
  muzzleG.add(muzzle, noseBand);
  for (const s of [-1, 1]) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), hoofMat);
    nostril.position.set(s * 0.045, 0.045, 0.325);
    muzzleG.add(nostril);
  }
  head.add(muzzleG);

  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), plainMat);
  jaw.scale.set(0.85, 0.65, 1.25);
  jaw.position.set(0, -0.12, 0.16);
  head.add(jaw);

  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.047, 10, 8), eyeMat);
    eye.position.set(s * 0.165, 0.05, 0.10);
    head.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(s * 0.20, 0.075, 0.135);
    head.add(glint);

    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), plainMat);
    ear.scale.set(0.32, 1.0, 0.6);
    ear.position.set(s * 0.17, 0.16, -0.08);
    ear.rotation.z = s * 1.15;
    ear.rotation.y = -s * 0.25;
    head.add(ear);

    const ossi = new THREE.Group();
    ossi.position.set(s * 0.075, 0.21, 0.02);
    ossi.rotation.z = s * 0.14;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.17, 8), plainMat);
    stem.position.y = 0.085;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), darkMat);
    knob.position.y = 0.175;
    ossi.add(stem, knob);
    head.add(ossi);
  }
}

/* tail */
const tail = new THREE.Group();
tail.position.set(0, 2.46, -1.22);
tail.rotation.x = 0.42;
{
  const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.055, 0.85, 8), plainMat);
  seg.position.y = -0.42;
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), darkMat);
  tuft.scale.set(1, 2.1, 1);
  tuft.position.y = -0.88;
  tail.add(seg, tuft);
}
body.add(tail);

/* legs — 2-bone IK rigs */
const legs = [];
function buildLeg(sideX, hipY, hipZ, isFront) {
  const L1 = isFront ? 1.30 : 1.40;
  const L2 = isFront ? 1.20 : 1.02;
  const hip = new THREE.Group();
  hip.position.set(sideX, hipY, hipZ);

  const thigh = new THREE.Mesh(
    new THREE.CylinderGeometry(isFront ? 0.105 : 0.13, isFront ? 0.13 : 0.16, L1, 10),
    skinLegMat);
  thigh.position.y = -L1 / 2;
  const shoulderMass = new THREE.Mesh(new THREE.SphereGeometry(isFront ? 0.16 : 0.185, 10, 8), skinLegMat);
  shoulderMass.scale.set(0.85, 1.15, 0.9);

  const knee = new THREE.Group();
  knee.position.y = -L1;
  const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(isFront ? 0.115 : 0.135, 10, 8), plainMat);
  const shin = new THREE.Mesh(
    new THREE.CylinderGeometry(isFront ? 0.075 : 0.10, 0.068, L2, 10), plainMat);
  shin.position.y = -L2 / 2;
  const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.10, 10), hoofMat);
  hoof.position.y = -L2 + 0.05;
  knee.add(kneeBall, shin, hoof);
  hip.add(thigh, shoulderMass, knee);
  legsRoot.add(hip);
  legs.push({ hip, knee, L1, L2, k: isFront ? 1 : -1, hipX: sideX, hipY, hipZ });
}
buildLeg(0.44, 2.38, 0.75, true);   // front left
buildLeg(-0.44, 2.38, 0.75, true);  // front right
buildLeg(0.42, 2.28, -0.85, false); // hind left
buildLeg(-0.42, 2.28, -0.85, false);// hind right

giraffe.traverse(o => { if (o.isMesh) { o.castShadow = true; } });

/* ---------------- gait (lateral-sequence walk, like real giraffes) ---------------- */
const T = 1.05;          // stride period (s)
const DUTY = 0.66;       // fraction of cycle each foot is on the ground
const STRIDE = 1.6;      // metres
const SPEED = STRIDE / T;
const R_PATH = 9;        // walking circle radius
const LIFT = [0.32, 0.32, 0.28, 0.28]; // FL FR HL HR
const REST = [          // foot rest positions (giraffe space)
  { x: 0.44, z: 0.80 }, { x: -0.44, z: 0.80 },
  { x: 0.42, z: -0.90 }, { x: -0.42, z: -0.90 },
];
const OFFSET = [0.15, 0.65, 0.00, 0.50]; // footfall phase offsets: LH, LF, RH, RF order below

/* foot targets in giraffe space for each foot, given global phase p (0..1) */
function footTarget(i, p) {
  const phase = (p + OFFSET[i]) % 1;
  const rest = REST[i];
  let z, y;
  if (phase < DUTY) {                 // stance: foot sweeps back
    const s = phase / DUTY;
    z = rest.z + STRIDE * (0.5 - s);
    y = 0;
  } else {                            // swing: foot lifts and reaches forward
    const s = (phase - DUTY) / (1 - DUTY);
    z = rest.z + STRIDE * (s - 0.5);
    y = LIFT[i] * 0.5 * (1 - Math.cos(Math.PI * s));
  }
  return { x: rest.x, y, z };
}

/* 2-bone IK in the leg's vertical plane (z = forward, y = up) */
function solveLeg(leg, t) {
  const ty = t.y - leg.hipY;
  const tz = t.z - leg.hipZ;
  const dist = clamp(Math.hypot(ty, tz), 0.15, leg.L1 + leg.L2 - 0.012);
  const thetaT = Math.atan2(tz, -ty);                       // from "straight down"
  const alpha = Math.acos(clamp((leg.L1 * leg.L1 + dist * dist - leg.L2 * leg.L2) / (2 * leg.L1 * dist), -1, 1));
  const beta = Math.acos(clamp((leg.L1 * leg.L1 + leg.L2 * leg.L2 - dist * dist) / (2 * leg.L1 * leg.L2), -1, 1));
  leg.hip.rotation.x = -(thetaT + leg.k * alpha);
  leg.knee.rotation.x = leg.k * (Math.PI - beta);
}

/* ---------------- camera orbit (drag / wheel, touch friendly) ---------------- */
const orbit = { az: 2.4, el: 0.32, dist: 10.5, lastInput: -10 };
{ // optional overrides via URL hash, e.g. index.html#d=6&az=1.57&el=0.2
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.has('d')) orbit.dist = +hp.get('d');
  if (hp.has('az')) orbit.az = +hp.get('az');
  if (hp.has('el')) orbit.el = +hp.get('el');
}
let dragging = false, px = 0, py = 0;
renderer.domElement.addEventListener('pointerdown', e => { dragging = true; px = e.clientX; py = e.clientY; });
addEventListener('pointerup', () => dragging = false);
addEventListener('pointermove', e => {
  if (!dragging) return;
  orbit.az -= (e.clientX - px) * 0.005;
  orbit.el = clamp(orbit.el + (e.clientY - py) * 0.004, 0.06, 1.2);
  px = e.clientX; py = e.clientY;
  orbit.lastInput = clockT;
});
renderer.domElement.addEventListener('wheel', e => {
  orbit.dist = clamp(orbit.dist * (1 + e.deltaY * 0.001), 4.5, 30);
  orbit.lastInput = clockT;
}, { passive: true });

/* ---------------- main loop ---------------- */
const clock = new THREE.Clock();
let clockT = 0, pathAng = 0;
const camTarget = new THREE.Vector3(0, 2.3, R_PATH);   // giraffe's start position

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  clockT += dt;
  const p = (clockT / T) % 1;              // global gait phase

  /* walk along a gentle circle */
  pathAng += dt * SPEED / R_PATH;
  giraffe.position.set(Math.sin(pathAng) * R_PATH, 0, Math.cos(pathAng) * R_PATH);
  giraffe.rotation.y = Math.atan2(Math.cos(pathAng), -Math.sin(pathAng));

  /* body bob / sway / pitch (legs stay planted) */
  body.position.y = 0.032 * Math.sin(2 * Math.PI * 2 * p + 0.9);
  body.rotation.z = 0.014 * Math.sin(2 * Math.PI * p + 1.9);
  body.rotation.x = 0.014 * Math.sin(2 * Math.PI * p + 2.6);
  body.rotation.y = 0.022 * Math.sin(2 * Math.PI * p + 0.4);

  /* legs */
  for (let i = 0; i < 4; i++) solveLeg(legs[i], footTarget(i, p));

  /* neck nod + head lag (giraffes bob their heads as they stride) */
  neckRoot.rotation.x = 0.55 + 0.045 * Math.sin(2 * Math.PI * p + 1.15);
  neckRoot.rotation.z = 0.030 * Math.sin(2 * Math.PI * p + 0.3);
  head.rotation.x = -0.55 - 0.05 * Math.sin(2 * Math.PI * p + 0.55);
  head.rotation.z = -0.02 * Math.sin(2 * Math.PI * p + 0.8);

  /* tail swish, ear flicks */
  tail.rotation.z = 0.30 * Math.sin(clockT * 2.3) + 0.08 * Math.sin(clockT * 5.1);
  tail.rotation.x = 0.25 + 0.10 * Math.sin(clockT * 0.7);

  /* sun + shadow frustum follow the giraffe */
  sun.position.copy(giraffe.position).add(new THREE.Vector3(10, 16, 6));
  sun.target.position.copy(giraffe.position);

  /* camera */
  if (clockT - orbit.lastInput > 6) orbit.az += dt * 0.04;   // slow drift when idle
  const look = new THREE.Vector3(giraffe.position.x, 2.3, giraffe.position.z);
  camTarget.lerp(look, 1 - Math.exp(-dt * 3));
  const ce = Math.cos(orbit.el), se = Math.sin(orbit.el);
  camera.position.set(
    camTarget.x + orbit.dist * ce * Math.sin(orbit.az),
    camTarget.y + orbit.dist * se,
    camTarget.z + orbit.dist * ce * Math.cos(orbit.az));
  camera.lookAt(camTarget);

  renderer.render(scene, camera);
}
animate();                                  // draw one frame immediately
renderer.setAnimationLoop(animate);

/* ---------------- resize ---------------- */
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
