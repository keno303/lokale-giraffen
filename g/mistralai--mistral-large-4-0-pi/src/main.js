// Walking Giraffe — Three.js (r160), no build step needed by the user:
// this file is bundled once into ../app.js (classic script) so index.html
// also works when opened directly via file://
import * as THREE from 'three';

/* ============================== params / utils ============================== */
const params = new URLSearchParams(location.search);
const FIXED_T = params.has('t') ? parseFloat(params.get('t')) : null; // freeze sim time (for testing)
const CAMSPEC = params.get('cam') || 'orbit';                           // orbit|front|back|left|right|three4|low|top
const WALK_SPEED = params.has('v') ? parseFloat(params.get('v')) : 1.15; // m/s

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261110);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

/* ============================== renderer / scene ============================== */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdcc9a0, 55, 215);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1500);

/* sky dome with gradient + sun glow */
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, fog: false, depthWrite: false,
  uniforms: {
    top: { value: new THREE.Color(0x3a6fc0) },
    mid: { value: new THREE.Color(0x9cc3e8) },
    bot: { value: new THREE.Color(0xeed9a9) },
  },
  vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `varying vec3 vP; uniform vec3 top, mid, bot;
    void main(){ float h = normalize(vP).y;
      vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.8, h)) : mix(bot, mid, smoothstep(-0.1, 0.12, h));
      gl_FragColor = vec4(c, 1.0); }`,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), skyMat));

const SUN_DIR = new THREE.Vector3(0.55, 0.55, 0.42).normalize();
{
  const [c, g] = makeCanvas(256, 256);
  const gr = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,244,214,1)');
  gr.addColorStop(0.25, 'rgba(255,232,180,0.85)');
  gr.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, transparent: true }));
  sp.position.copy(SUN_DIR).multiplyScalar(640); sp.scale.set(150, 150, 1);
  scene.add(sp);
}

/* lights */
const sun = new THREE.DirectionalLight(0xfff0d0, 3.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
sun.shadow.camera.near = 5; sun.shadow.camera.far = 110;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);
const hemi = new THREE.HemisphereLight(0xbdd6f2, 0x9c7f4e, 0.85);
scene.add(hemi);

/* ============================== textures ============================== */
function coatTexture(size, patchiness) {
  const [c, g] = makeCanvas(size, size);
  const base = g.createLinearGradient(0, 0, 0, size);
  base.addColorStop(0, '#d6ad66'); base.addColorStop(0.5, '#cfa25e'); base.addColorStop(1, '#c69a55');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  // soft light blotches
  for (let i = 0; i < 50; i++) {
    const x = rng() * size, y = rng() * size, r = 30 + rng() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(238,214,164,${0.05 + rng() * 0.08})`);
    gr.addColorStop(1, 'rgba(238,214,164,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // jagged dark patches (Masai giraffe style): small, leaf-shaped, dense
  const n = Math.floor(size * size * patchiness / 5200);
  for (let i = 0; i < n; i++) {
    const x = rng() * size, y = rng() * size;
    const r = size * (0.012 + rng() * 0.030);
    const rot = rng() * Math.PI, ex = 1 + rng() * 0.9, ey = 0.55 + rng() * 0.6;
    const k = 7 + (rng() * 5 | 0);
    g.beginPath();
    for (let j = 0; j <= k; j++) {
      const a = (j / k) * Math.PI * 2;
      const rr = r * (0.55 + rng() * 0.7);
      const lx = Math.cos(a) * rr * ex, ly = Math.sin(a) * rr * ey;
      const px = x + lx * Math.cos(rot) - ly * Math.sin(rot);
      const py = y + lx * Math.sin(rot) + ly * Math.cos(rot);
      j === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.closePath();
    g.fillStyle = `rgba(${84 + rng() * 22 | 0},${50 + rng() * 15 | 0},${22 + rng() * 9 | 0},${0.82 + rng() * 0.18})`;
    g.fill();
    g.strokeStyle = 'rgba(58,33,13,0.45)'; g.lineWidth = Math.max(1.2, size / 500); g.stroke();
  }
  // fine speckle
  for (let i = 0; i < size * 9; i++) {
    g.fillStyle = rng() < 0.5 ? `rgba(92,62,30,${rng() * 0.09})` : `rgba(240,222,180,${rng() * 0.08})`;
    g.fillRect(rng() * size, rng() * size, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}
function legTexture(size) {
  const tex = coatTexture(size, 0.25); // much sparser patches on the legs
  return tex;
}
function groundTexture() {
  const S = 512, [c, g] = makeCanvas(S, S);
  g.fillStyle = '#a68b4e'; g.fillRect(0, 0, S, S);
  // large, very subtle tone variation
  for (let i = 0; i < 26; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(120,98,50,0.10)' : 'rgba(214,196,140,0.10)';
    g.beginPath();
    g.ellipse(rng() * S, rng() * S, 60 + rng() * 130, 40 + rng() * 90, rng() * 3, 0, 7);
    g.fill();
  }
  const cols = ['#8f7a3e', '#b3a05e', '#7d8a3f', '#c2b078', '#97814a', '#86763c'];
  for (let i = 0; i < 420; i++) {
    g.fillStyle = cols[(rng() * cols.length) | 0];
    g.globalAlpha = 0.10 + rng() * 0.18;
    g.beginPath();
    g.ellipse(rng() * S, rng() * S, 5 + rng() * 26, 4 + rng() * 18, rng() * 3, 0, 7);
    g.fill();
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 14000; i++) {
    g.fillStyle = rng() < 0.5 ? `rgba(70,54,26,${rng() * 0.12})` : `rgba(226,208,160,${rng() * 0.1})`;
    g.fillRect(rng() * S, rng() * S, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(150, 150);
  tex.anisotropy = 8;
  return tex;
}
function tuftTexture() {
  const S = 128, [c, g] = makeCanvas(S, S);
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 16; i++) {
    const tx = 20 + rng() * 88, ty = 8 + rng() * 46, lean = (tx - 64) * (0.4 + rng() * 0.8);
    const gr = g.createLinearGradient(64, S, tx, ty);
    const dry = rng() < 0.45;
    gr.addColorStop(0, dry ? '#9a8a40' : '#6d8a3a');
    gr.addColorStop(1, dry ? '#d8c878' : '#aec668');
    g.strokeStyle = gr; g.lineWidth = 4.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(64 + (rng() * 24 - 12), S);
    g.quadraticCurveTo(64 + lean * 0.4, S * 0.55, tx, ty); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function cloudTexture() {
  const S = 256, [c, g] = makeCanvas(S, S);
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 9; i++) {
    const x = S * (0.25 + rng() * 0.5), y = S * (0.4 + rng() * 0.25), r = 30 + rng() * 55;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.75)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ============================== environment ============================== */
{
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(320, 64),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

/* grass tufts (instanced crossed planes) */
{
  const tuftGeo = new THREE.PlaneGeometry(0.7, 0.6);
  tuftGeo.translate(0, 0.3, 0);
  const mat = new THREE.MeshStandardMaterial({
    map: tuftTexture(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 1,
  });
  const N = 2000, inst = new THREE.InstancedMesh(tuftGeo, mat, N * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
  const col = new THREE.Color();
  let idx = 0;
  for (let i = 0; i < N; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 150;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const sc = 0.35 + rng() * 0.55;
    const tint = rng();
    col.setHSL(0.13 + tint * 0.08, 0.35 + rng() * 0.25, 0.42 + rng() * 0.22);
    for (let k = 0; k < 2; k++) {
      e.set(0, rng() * Math.PI + k * Math.PI / 2, (rng() - 0.5) * 0.3);
      q.setFromEuler(e); s.set(sc, sc * (0.8 + rng() * 0.5), sc);
      m.compose(new THREE.Vector3(x, 0, z), q, s);
      inst.setMatrixAt(idx, m); inst.setColorAt(idx, col); idx++;
    }
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  scene.add(inst);
}

/* acacia trees */
function makeAcacia() {
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.26, 3.4, 7), bark);
  trunk.position.y = 1.7; trunk.rotation.z = 0.07; trunk.castShadow = true;
  g.add(trunk);
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 1.6, 6), bark);
  branch.position.set(0.4, 3.1, 0.2); branch.rotation.z = -0.9; branch.castShadow = true;
  g.add(branch);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x5d7031, roughness: 1, flatShading: true });
  leafMat.color.offsetHSL(0, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.1);
  const c1 = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), leafMat);
  c1.scale.set(2.6, 0.55, 2.4); c1.position.y = 3.7; c1.castShadow = true;
  const c2 = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), leafMat);
  c2.scale.set(1.7, 0.42, 1.6); c2.position.set(1.3, 3.35, 0.5); c2.castShadow = true;
  const c3 = c2.clone(); c3.position.set(-1.2, 3.45, -0.6);
  g.add(c1, c2, c3);
  return g;
}
for (let i = 0; i < 16; i++) {
  const t = makeAcacia();
  const a = rng() * Math.PI * 2, r = 34 + rng() * 150;
  t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
  const sc = 0.8 + rng() * 1.1;
  t.scale.set(sc, sc * (0.9 + rng() * 0.3), sc);
  t.rotation.y = rng() * Math.PI * 2;
  scene.add(t);
}
/* bushes + rocks */
{
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x55702f, roughness: 1, flatShading: true });
  const bushGeo = new THREE.IcosahedronGeometry(0.55, 0);
  for (let i = 0; i < 42; i++) {
    const b = new THREE.Mesh(bushGeo, bushMat);
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 160;
    b.position.set(Math.cos(a) * r, 0.25, Math.sin(a) * r);
    b.scale.set(0.5 + rng() * 1.3, 0.35 + rng() * 0.7, 0.5 + rng() * 1.3);
    b.rotation.y = rng() * 3; b.castShadow = true;
    scene.add(b);
  }
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d867a, roughness: 1, flatShading: true });
  const rockGeo = new THREE.DodecahedronGeometry(0.4, 0);
  for (let i = 0; i < 26; i++) {
    const rk = new THREE.Mesh(rockGeo, rockMat);
    const a = rng() * Math.PI * 2, r = 6 + Math.sqrt(rng()) * 140;
    rk.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
    rk.scale.set(0.4 + rng() * 1.6, 0.3 + rng() * 0.9, 0.4 + rng() * 1.6);
    rk.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    rk.castShadow = true; rk.receiveShadow = true;
    scene.add(rk);
  }
}
/* clouds */
const clouds = [];
{
  const tex = cloudTexture();
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.75, fog: false, depthWrite: false })
    );
    const w = 60 + rng() * 110;
    m.scale.set(w, w * 0.35, 1);
    m.position.set((rng() - 0.5) * 900, 55 + rng() * 45, (rng() - 0.5) * 900);
    m.lookAt(0, m.position.y, 0);
    scene.add(m); clouds.push(m);
  }
}

/* ============================== giraffe ============================== */
const giraffe = new THREE.Group();   // root: moves along a circle on the ground
scene.add(giraffe);
const bodyG = new THREE.Group();     // torso: bob / pitch / roll
bodyG.position.y = 0;
giraffe.add(bodyG);

const matBody = new THREE.MeshStandardMaterial({ map: coatTexture(1024, 1.0), roughness: 0.92, metalness: 0 });
const matNeck = new THREE.MeshStandardMaterial({ map: coatTexture(512, 0.9), roughness: 0.92 });
matNeck.map.repeat.set(2.2, 1);
const matLeg = new THREE.MeshStandardMaterial({ map: legTexture(512), roughness: 0.95 });
const matDark = new THREE.MeshStandardMaterial({ color: 0x35200f, roughness: 0.95 });
const matMuzzle = new THREE.MeshStandardMaterial({ color: 0x8f6d46, roughness: 0.9 });
const matEye = new THREE.MeshStandardMaterial({ color: 0x120d09, roughness: 0.2 });
const matHighlight = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, emissive: 0x888888 });

function ell(rx, ry, rz, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 30, 22), mat);
  m.scale.set(rx, ry, rz); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rTop, rBot, h, mat, seg = 18) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* ---- torso: lathe body of revolution along Z, back sloping down to the rump ---- */
const torsoG = new THREE.Group();
torsoG.position.set(0, 2.52, 0);
torsoG.rotation.x = -0.055; // chest end (+Z) slightly higher than rump
bodyG.add(torsoG);
const profile = [
  [0.001, -1.62], [0.28, -1.56], [0.50, -1.40], [0.585, -1.10], [0.63, -0.60],
  [0.635, -0.10], [0.61, 0.40], [0.575, 0.80], [0.50, 1.10], [0.36, 1.32], [0.001, 1.44],
].map(p => new THREE.Vector2(p[0], p[1]));
const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), matBody);
torso.rotation.x = Math.PI / 2; // lathe axis (Y) -> Z
torso.castShadow = true; torso.receiveShadow = true;
torsoG.add(torso);
torsoG.add(ell(0.38, 0.22, 0.46, matBody, 0, 0.46, 0.85));   // withers hump
torsoG.add(ell(0.40, 0.42, 0.42, matBody, 0, -0.22, 0.95));  // deep chest
torsoG.add(ell(0.32, 0.36, 0.38, matBody, 0, 0.36, 1.08));   // neck base fairing

/* ---- neck (4 segments) + head ---- */
const NECK_BASE = 0.66; // rad from vertical, tilted forward (+Z)
const NECK_LEN = 1.8, NSEG = 4, SEG_LEN = NECK_LEN / NSEG;
const neckSegs = [];
let parent = bodyG;
const neckG = new THREE.Group();
neckG.position.set(0, 2.92, 1.18);
bodyG.add(neckG);
parent = neckG;
const segAngles = [0.60, 0.65, 0.71, 0.78];
const segR = [0.235, 0.205, 0.175, 0.15, 0.125];
for (let i = 0; i < NSEG; i++) {
  const seg = new THREE.Group();
  seg.rotation.x = segAngles[i] - NECK_BASE; // relative to neckG
  parent.add(seg);
  const c = cyl(segR[i + 1], segR[i], SEG_LEN, matNeck);
  c.position.y = SEG_LEN / 2;
  seg.add(c);
  // mane ridge on the back side of each segment
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.075, SEG_LEN, 0.05), matDark);
  mane.position.set(0, SEG_LEN / 2, -segR[i] * 0.92);
  mane.castShadow = true;
  seg.add(mane);
  neckSegs.push(seg);
  const next = new THREE.Group();
  next.position.y = SEG_LEN;
  seg.add(next);
  parent = next;
}
const headG = new THREE.Group();
parent.add(headG);
const HEAD_BASE = -0.12;
headG.rotation.x = HEAD_BASE;
// skull + cheeks + muzzle
headG.add(ell(0.155, 0.165, 0.235, matBody, 0, 0.06, 0.04));
headG.add(ell(0.13, 0.13, 0.17, matBody, 0, -0.045, 0.12));
const muzzle = ell(0.105, 0.11, 0.21, matMuzzle, 0, -0.045, 0.30);
muzzle.rotation.x = 0.22;
headG.add(muzzle);
// nostrils + mouth
const nosL = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), matDark);
nosL.position.set(-0.048, 0.015, 0.475); headG.add(nosL);
const nosR = nosL.clone(); nosR.position.x = 0.048; headG.add(nosR);
const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.012, 0.035), matDark);
mouth.position.set(0, -0.135, 0.40); mouth.rotation.x = 0.22; headG.add(mouth);
// eyes (+ highlights)
for (const sx of [-1, 1]) {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 14, 10), matEye);
  eye.position.set(sx * 0.138, 0.075, 0.09);
  headG.add(eye);
  const hl = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), matHighlight);
  hl.position.set(sx * 0.152, 0.095, 0.115);
  headG.add(hl);
}
// ossicones (horn-like, with dark knobs)
for (const sx of [-1, 1]) {
  const oss = new THREE.Group();
  oss.position.set(sx * 0.058, 0.185, -0.03);
  oss.rotation.x = -0.16;
  const shaft = cyl(0.03, 0.036, 0.17, matBody, 10);
  shaft.position.y = 0.085; oss.add(shaft);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 9), matDark);
  knob.position.y = 0.175; knob.castShadow = true; oss.add(knob);
  headG.add(oss);
}
// forelock between ossicones
const forelock = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8), matDark);
forelock.position.set(0, 0.21, 0.02); headG.add(forelock);
// ears
const earL = new THREE.Group(), earR = new THREE.Group();
for (const [ear, sx] of [[earL, -1], [earR, 1]]) {
  ear.position.set(sx * 0.15, 0.10, -0.13);
  const e = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.22, 8), matBody);
  e.scale.z = 0.35; e.position.y = 0.09; e.castShadow = true;
  ear.add(e);
  ear.rotation.z = sx * 1.15; ear.rotation.x = -0.25;
  headG.add(ear);
}

/* ---- tail ---- */
const tailG = new THREE.Group();
tailG.position.set(0, 2.62, -1.48);
bodyG.add(tailG);
const tail1 = cyl(0.035, 0.028, 0.75, matBody, 8);
tail1.position.y = -0.375; tailG.add(tail1);
const tail2 = new THREE.Group(); tail2.position.y = -0.75; tailG.add(tail2);
const tailHair = cyl(0.026, 0.02, 0.45, matBody, 8);
tailHair.position.y = -0.225; tail2.add(tailHair);
const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.34, 10), matDark);
tuft.position.y = -0.62; tuft.rotation.x = Math.PI; tuft.castShadow = true;
tail2.add(tuft);

/* ---- legs (two-bone IK) ---- */
const L1 = 1.07, L2 = 1.07, HOOF_H = 0.13;
const legs = [];
function makeLeg(side, front, hipX, hipY, hipZ, phase) {
  const legRoot = new THREE.Group();
  legRoot.position.set(hipX, hipY, hipZ);
  bodyG.add(legRoot);
  const thigh = new THREE.Group(); legRoot.add(thigh);
  const thighMesh = cyl(front ? 0.135 : 0.155, 0.085, L1, matLeg);
  thighMesh.position.y = -L1 / 2; thigh.add(thighMesh);
  // muscle bulge on upper leg
  const bulge = ell(front ? 0.14 : 0.16, 0.34, front ? 0.13 : 0.15, matLeg,
    0, -L1 * 0.32, front ? 0.02 : -0.03);
  thigh.add(bulge);
  const knee = new THREE.Group(); knee.position.y = -L1; thigh.add(knee);
  const shin = cyl(0.075, 0.048, L2, matLeg);
  shin.position.y = -L2 / 2; knee.add(shin);
  const fetlock = ell(0.055, 0.06, 0.06, matLeg, 0, -L2 - 0.02, 0.01); knee.add(fetlock);
  const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.115, HOOF_H, 0.17), matDark);
  hoof.position.set(0, -L2 - HOOF_H / 2 + 0.01, 0.025);
  hoof.castShadow = true; knee.add(hoof);
  const leg = { thigh, knee, hipX, hipY, hipZ, front, phase, L1, L2 };
  legs.push(leg);
  return leg;
}
// lateral-sequence walk phases: LH, LF, RH, RF
makeLeg(-1, false, -0.32, 2.10, -0.78, 0.00);  // left hind
makeLeg(+1, false, +0.32, 2.10, -0.78, 0.75);  // right hind
makeLeg(-1, true, -0.28, 2.17, 0.85, 0.50);    // left front
makeLeg(+1, true, +0.28, 2.17, 0.85, 0.25);    // right front

/* ---- dust puffs kicked up at hoof landings ---- */
const puffTex = (() => {
  const S = 128, [c, g] = makeCanvas(S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(216,192,142,0.55)');
  gr.addColorStop(1, 'rgba(216,192,142,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const puffs = [];
for (let i = 0; i < 28; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0, depthWrite: false }));
  sp.visible = false; scene.add(sp);
  puffs.push({ sp, age: 1e9 });
}
let puffIdx = 0;
const _wp = new THREE.Vector3();
function spawnPuff(pos) {
  const p = puffs[puffIdx++ % puffs.length];
  p.sp.position.copy(pos); p.sp.position.y = 0.07;
  p.age = 0; p.sp.visible = true;
}
function updatePuffs(dt) {
  for (const p of puffs) {
    if (p.age > 1) { p.sp.visible = false; continue; }
    p.age += dt;
    const k = Math.min(p.age / 0.9, 1);
    p.sp.scale.setScalar(0.25 + k * 1.5);
    p.sp.material.opacity = 0.38 * (1 - k);
    p.sp.position.y = 0.07 + k * 0.3;
  }
}

/* ============================== gait ============================== */
const STRIDE = 1.0;                    // m per full cycle (2*A)
const A = STRIDE / 2, DUTY = 0.66, LIFT = 0.17;
function gaitOffset(p) {
  if (p < DUTY) { const q = p / DUTY; return { dz: A - 2 * A * q, y: 0 }; }
  const q = (p - DUTY) / (1 - DUTY);
  return { dz: -A + 2 * A * q, y: LIFT * Math.sin(Math.PI * q) };
}
function solveLeg(leg, Fy, Fz) {
  const Hy = leg.hipY + bodyG.position.y, Hz = leg.hipZ;
  let dz = Fz - Hz, dy = Fy - Hy;
  let d = Math.hypot(dz, dy);
  const maxD = (leg.L1 + leg.L2) * 0.9995;
  if (d > maxD) { const s = maxD / d; dz *= s; dy *= s; d = maxD; }
  const phiF = Math.atan2(dz, -dy);                       // foot direction from straight down
  const alpha = Math.acos(clamp((leg.L1 ** 2 + d * d - leg.L2 ** 2) / (2 * leg.L1 * d), -1, 1));
  const phi1 = phiF + (leg.front ? 1 : -1) * alpha;        // front knees bow forward, hocks backward
  const kz = Hz + leg.L1 * Math.sin(phi1);
  const ky = Hy - leg.L1 * Math.cos(phi1);
  const phi2 = Math.atan2(Fz - kz, -(Fy - ky));            // absolute shin angle
  leg.thigh.rotation.x = -phi1;
  leg.knee.rotation.x = -(phi2 - phi1);
}

/* ear flicking */
let nextFlick = 2.5, flickStartL = -10, flickStartR = -10;

function updateGiraffe(t) {
  const T = STRIDE / WALK_SPEED;
  const w = (Math.PI * 2) / T;
  // walk along a circle so the scene never runs out
  const R = 22, ang = (t * WALK_SPEED) / R;
  giraffe.position.set(Math.sin(ang) * R, 0, Math.cos(ang) * R);
  giraffe.rotation.y = Math.PI / 2 + ang;
  // body bob / pitch / roll (two bobs per stride)
  bodyG.position.y = 0.035 * Math.sin(2 * w * t + 0.9);
  bodyG.rotation.x = 0.012 * Math.sin(2 * w * t + 0.3);
  bodyG.rotation.z = 0.016 * Math.sin(w * t + 1.7);
  // neck sway + head counter-nod
  neckG.rotation.x = NECK_BASE + 0.030 * Math.sin(w * t + 2.2) + 0.012 * Math.sin(2 * w * t);
  neckG.rotation.z = 0.014 * Math.sin(w * t * 0.5 + 1.0);
  neckSegs.forEach((s, i) => { s.userData.base = segAngles[i] - NECK_BASE; });
  for (let i = 0; i < NSEG; i++) {
    neckSegs[i].rotation.x = neckSegs[i].userData.base + (0.008 + i * 0.007) * Math.sin(w * t + 2.2 + i * 0.45);
  }
  headG.rotation.x = HEAD_BASE - 0.055 * Math.sin(2 * w * t + 0.4) + 0.02 * Math.sin(w * t + 0.5);
  // tail swish
  tailG.rotation.y = 0.5 * Math.sin(t * 1.7) * (0.6 + 0.4 * Math.sin(w * t));
  tailG.rotation.x = -0.12 + 0.10 * Math.sin(t * 2.3 + 1.0);
  tail2.rotation.x = 0.22 * Math.sin(t * 2.3 + 1.6);
  // ears
  if (t > nextFlick) { nextFlick = t + 2 + rng() * 5; if (rng() < 0.5) flickStartL = t; else flickStartR = t; }
  for (const [ear, fs, sx] of [[earL, flickStartL, -1], [earR, flickStartR, 1]]) {
    const e = clamp(1 - (t - fs) / 0.5, 0, 1);
    ear.rotation.z = sx * 1.15 + Math.sin((t - fs) * 34) * 0.4 * e;
  }
  // legs
  for (const leg of legs) {
    const p = (t / T + leg.phase) % 1;
    if (leg.prevP !== undefined && p < leg.prevP) { // phase wrapped -> hoof just touched down
      leg.knee.getWorldPosition(_wp);
      _wp.y = 0.05;
      spawnPuff(_wp);
      if (rng() < 0.6) spawnPuff(_wp.clone().add(new THREE.Vector3((rng() - 0.5) * 0.25, 0, (rng() - 0.5) * 0.25)));
    }
    leg.prevP = p;
    const { dz, y } = gaitOffset(p);
    solveLeg(leg, -bodyG.position.y + HOOF_H + y, leg.hipZ + dz);
  }
}

/* ============================== camera ============================== */
const cam = { azOff: 0, elOff: 0, dist: 9.5, userOrbit: false, el: 0.30 };
function updateCamera(t) {
  updateGiraffe(t);
  const yaw = giraffe.rotation.y;
  let az, el = cam.el + cam.elOff, dist = cam.dist;
  const presets = {
    front: [yaw, 0.16, 7.5], back: [yaw + Math.PI, 0.30, 8.5],
    left: [yaw + Math.PI / 2, 0.22, 8.0], right: [yaw - Math.PI / 2, 0.22, 8.0],
    three4: [yaw + Math.PI * 0.72, 0.26, 9.5], low: [yaw + Math.PI * 0.85, 0.07, 6.0],
    top: [yaw + 2.4, 1.25, 15], close: [yaw + 2.6, 0.30, 4.4],
  };
  if (CAMSPEC !== 'orbit' && presets[CAMSPEC]) {
    const p = presets[CAMSPEC]; az = p[0]; el = p[1] + cam.elOff; dist = p[2];
  } else {
    az = yaw + 2.3 + t * 0.045 + cam.azOff;
  }
  el = clamp(el, -0.1, 1.45);
  const target = new THREE.Vector3(
    giraffe.position.x, giraffe.position.y + 2.65, giraffe.position.z);
  camera.position.set(
    target.x + dist * Math.cos(el) * Math.sin(az),
    target.y + dist * Math.sin(el),
    target.z + dist * Math.cos(el) * Math.cos(az));
  camera.lookAt(target);
  // keep sun + shadow frustum centered on the giraffe
  sun.position.copy(giraffe.position).addScaledVector(SUN_DIR, 45);
  sun.target.position.copy(giraffe.position);
  sun.target.updateMatrixWorld();
}

/* input */
{
  const el = renderer.domElement;
  let dragging = false, px = 0, py = 0;
  el.addEventListener('pointerdown', (e) => { dragging = true; px = e.clientX; py = e.clientY; cam.userOrbit = true; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    cam.azOff -= (e.clientX - px) * 0.005; cam.elOff = clamp(cam.elOff + (e.clientY - py) * 0.004, -0.25, 1.0);
    px = e.clientX; py = e.clientY;
  });
  el.addEventListener('pointerup', () => { dragging = false; });
  el.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = clamp(cam.dist * (1 + e.deltaY * 0.001), 3.5, 40); }, { passive: false });
}
let paused = FIXED_T != null;
addEventListener('keydown', (e) => { if (e.code === 'Space') { paused = !paused; e.preventDefault(); } });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ============================== main loop ============================== */
let last = performance.now(), simT = FIXED_T ?? 0, frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (!paused) simT += dt;
  if (FIXED_T != null) simT = FIXED_T;
  updateCamera(simT);
  updatePuffs(dt);
  for (const c of clouds) c.position.x += Math.sin(simT * 0.01 + c.position.z) * dt * 0.6;
  renderer.render(scene, camera);
  if (++frames === 3) window.__ready = true;
}
requestAnimationFrame(frame);
