/*
 * Giraffe — a walking giraffe in Three.js
 * Procedural giraffe (geometry + canvas textures), savanna scene,
 * gait animation, follow camera. No server, no build step: open index.html.
 */
"use strict";

// ============================================================
// Setup
// ============================================================
const loaderEl = document.getElementById("loading");
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe6d6b4, 16, 70);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
document.body.appendChild(renderer.domElement);

// Sky gradient as background
{
  const c = document.createElement("canvas");
  c.width = 4; c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, "#5da9e6");
  g.addColorStop(0.45, "#a9d4ef");
  g.addColorStop(0.85, "#ecd9ae");
  g.addColorStop(1.0, "#e8d6b0");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
  scene.background = new THREE.CanvasTexture(c);
}

// Lights
const sun = new THREE.DirectionalLight(0xffe3b0, 2.6);
sun.position.set(14, 18, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.camera.left = -16; sun.shadow.camera.right = 16;
sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -16;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xcfe4f5, 0x8a7048, 0.75));

// ============================================================
// Procedural textures (canvas)
// ============================================================
function rand(seed) { // mulberry32
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t ^ (t >>> 13)) ^ (t >>> Math.imul(t ^ (t >>> 7), 61 | t));
    return ((t ^ (t >>> 14)) >>> 0) / 42967296100;
  };
}

function makeTexture(w, h, draw, repeat = 1) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

/** Giraffe spot pattern: base coat + mottled spots + subtle coat noise. */
function giraffeSpotsTexture(seed, opts = {}) {
  const {
    base = "#c99e5c", dark = "#7d5a2b", light = "#e8d6a6",
    spots = 64, minR = 5, maxR = 22,
    spotTintDark = "#5c3f1c", spotTintLight = "#8a6a35",
    edge = "#4e3517"
  } = opts;
  return makeTexture(512, 512, (ctx, w, h) => {
    const rnd = rand(seed);
    // base coat
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    // soft blotches (uneven coat)
    for (let i = 0; i < 60; i++) {
      const g = ctx.createRadialGradient(rnd() * w, rnd() * h, 0, rnd() * w, rnd() * h, 40 + rnd() * 90);
      g.addColorStop(0, rnd() < 0.5 ? "rgba(255,240,200,0.06)" : "rgba(90,60,25,0.07)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // spots
    for (let i = 0; i < spots; i++) {
      const cx = rnd() * w, cy = rnd() * h;
      const r = minR + rnd() * (maxR - minR);
      const ang = rnd() * Math.PI;
      const verts = 9 + (rnd() * 5 | 0);
      ctx.beginPath();
      for (let v = 0; v <= verts; v++) {
        const a = (v / verts) * Math.PI * 2;
        const rr = r * (0.55 + rnd() * 0.7);
        const x = cx + Math.cos(a + ang) * rr * 0.8;
        const y = cy + Math.sin(a + ang) * rr * 1.15;
        v === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = rnd() < 0.72 ? spotTintDark : spotTintLight;
      ctx.fill();
      // darker rim
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = edge;
      ctx.globalAlpha = 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // fine grain
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rnd() - 0.5) * 10;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  });
}

/** Dry savanna grass ground. */
function grassTexture() {
  return makeTexture(512, 512, (ctx, w, h) => {
    const rnd = rand(777);
    ctx.fillStyle = "#9a8a52";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * w, y = rnd() * h, r = 2 + rnd() * 16;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rnd() < 0.5 ? "rgba(154,122,60,0.35)" : "rgba(104,118,52,0.30)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // grass tufts
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * w, y = rnd() * h;
      ctx.strokeStyle = rnd() < 0.72 ? "#6f7d3c" : "#b09a5a";
      ctx.lineWidth = 1;
      const len = 3 + rnd() * 7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 3, y - len);
      ctx.stroke();
    }
  }, 14);
}

// ============================================================
// Giraffe materials
// ============================================================
const texBody = giraffeSpotsTexture(101, {});
const texNeck = giraffeSpotsTexture(202, { base: "#d9b878", spots: 26, minR: 4, maxR: 12 });
const texLegs = giraffeSpotsTexture(303, { base: "#c4a05f", spots: 40, minR: 4, maxR: 14 });
const texHead = giraffeSpotsTexture(404, { base: "#d6b273", spots: 18, minR: 3, maxR: 9 });
texBody.repeat.set(1, 1); texNeck.repeat.set(1, 1);
texLegs.repeat.set(0.6, 1); texHead.repeat.set(0.7, 1);

const M = {
  body: new THREE.MeshStandardMaterial({ map: texBody, roughness: 0.92, metalness: 0.0 }),
  neck: new THREE.MeshStandardMaterial({ map: texNeck, roughness: 0.92 }),
  legs: new THREE.MeshStandardMaterial({ map: texLegs, roughness: 0.95 }),
  head: new THREE.MeshStandardMaterial({ map: texHead, roughness: 0.9 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.85 }),
  mane: new THREE.MeshStandardMaterial({ color: 0x35261a, roughness: 0.95 }),
  eye: new THREE.MeshStandardMaterial({ color: 0x3a2410, roughness: 0.35, metalness: 0.1 }),
  sclera: new THREE.MeshStandardMaterial({ color: 0xd9c9a8, roughness: 0.4 }),
};

// ============================================================
// Giraffe construction (faces +Z at rest)
// ============================================================
const GIRAFFE = new THREE.Group();
const root = new THREE.Group(); // animated body (bob/roll), inside GIRAFFE
GIRAFFE.add(root);

// --- legs ---
function makeLeg(matLeg, isFront) {
  const hip = new THREE.Group();
  // thigh
  const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.34, 6, 12), matLeg);
  thigh.position.y = -0.22;
  hip.add(thigh);
  const knee = new THREE.Group();
  knee.position.y = -0.42;
  hip.add(knee);
  // shin (hock / front knee)
  const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.30, 6, 12), matLeg);
  shin.position.y = -0.17;
  knee.add(shin);
  const ankle = new THREE.Group();
  ankle.position.y = -0.40;
  knee.add(ankle);
  // lower leg
  const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.30, 6, 12), matLeg);
  lower.position.y = -0.17;
  ankle.add(lower);
  // hoof
  const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.20, 0.16), M.dark);
  hoof.position.y = -0.40;
  ankle.add(hoof);
  // rest pose
  if (isFront) {
    hip.rotation.x = 0.02;
    knee.rotation.x = 0.06;
  } else {
    hip.rotation.x = -0.06;
    knee.rotation.x = 0.28; // hock flexion at rest
  }
  return { hip, knee, hoof };
}

// front legs
const legFL = makeLeg(M.legs, true);
legFL.hip.position.set(-0.26, 1.32, 0.60);
root.add(legFL.hip);
const legFR = makeLeg(M.legs, true);
legFR.hip.position.set(0.26, 1.32, 0.60);
root.add(legFR.hip);
// hind legs
const legHL = makeLeg(M.legs, false);
legHL.hip.position.set(-0.30, 1.34, -0.62);
root.add(legHL.hip);
const legHR = makeLeg(M.legs, false);
legHR.hip.position.set(0.30, 1.34, -0.62);
root.add(legHR.hip);

// --- torso ---
const bodyMat = M.body;
{
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), bodyMat);
  belly.scale.set(0.52, 0.44, 0.95);
  belly.position.set(0, 1.80, 0.02);
  root.add(belly);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), bodyMat);
  chest.scale.set(0.42, 0.40, 0.52);
  chest.position.set(0, 1.66, 0.72);
  root.add(chest);
  const rump = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), bodyMat);
  rump.scale.set(0.46, 0.42, 0.58);
  rump.position.set(0, 1.74, -0.60);
  root.add(rump);
}
// subtle underbelly shading: darkened flattened sphere on belly bottom
{
  const shade = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20),
    new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1, transparent: true, opacity: 0.35, depthWrite: false }));
  shade.scale.set(0.50, 0.30, 0.90);
  shade.position.set(0, 1.62, 0.0);
  root.add(shade);
}

// --- neck ---
const shoulder = new THREE.Group();
shoulder.position.set(0, 1.98, 0.78);
root.add(shoulder);
const neck = new THREE.Group();
shoulder.add(neck);
{
  const n1 = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.165, 0.95, 14), M.neck);
  n1.position.y = 0.48;
  neck.add(n1);
  const n2 = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 0.55, 14), M.neck);
  n2.position.y = 1.20;
  neck.add(n2);
}
neck.rotation.x = 0.45; // pitch forward
const neckTop = new THREE.Group();
neckTop.position.set(0, 1.50, 0);
neck.add(neckTop);

// mane: dark tuft along neck top and back
{
  const tuftGeo = new THREE.ConeGeometry(0.05, 0.14, 6);
  for (let i = 0; i < 7; i++) {
    const t = new THREE.Mesh(tuftGeo, M.mane);
    const f = i / 6;
    // place along neck in shoulder space (neck pitched +0.45 around x)
    const y = 0.15 + f * 1.45;
    const z = Math.sin(0.45) * y; // forward offset due to pitch
    t.position.set(0, Math.cos(0.45) * y + 0.02, z + 0.05);
    t.rotation.x = 0.45;
    shoulder.add(t);
  }
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(tuftGeo, M.mane);
    t.position.set(0, 2.24 - i * 0.01, 0.35 - i * 0.42);
    t.rotation.x = 0.15;
    root.add(t);
  }
}

// --- head (at neck top, faces +Z) ---
const head = new THREE.Group();
let earL, earR; // hoisted: animated in animate()
neckTop.add(head);
{
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), M.head);
  skull.scale.set(0.135, 0.125, 0.175);
  skull.position.set(0, 0.05, 0.03);
  head.add(skull);
  // forehead bump
  const fore = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), M.head);
  fore.scale.set(0.09, 0.09, 0.11);
  fore.position.set(0, 0.10, 0.10);
  head.add(fore);
  // muzzle
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), M.head);
  muzzle.scale.set(0.105, 0.095, 0.22);
  muzzle.position.set(0, -0.02, 0.22);
  head.add(muzzle);
  // nostrils
  for (const sx of [-1, 1]) {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), M.dark);
    n.position.set(sx * 0.045, 0.01, 0.345);
    head.add(n);
  }
  // mouth
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.06), M.dark);
  mouth.position.set(0, -0.095, 0.28);
  head.add(mouth);
  // ossicones (horns)
  for (const sx of [-1, 1]) {
    const oss = new THREE.Group();
    oss.position.set(sx * 0.05, 0.13, -0.01);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.13, 8), M.dark);
    stem.position.y = 0.065;
    oss.add(stem);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), M.dark);
    knob.position.y = 0.14;
    oss.add(knob);
    head.add(oss);
  }
  // ears
  const earGeo = new THREE.ConeGeometry(0.055, 0.16, 8);
  earL = new THREE.Group();
  earL.position.set(-0.13, 0.07, 0.0);
  const el = new THREE.Mesh(earGeo, M.dark);
  el.position.y = 0.08; el.rotation.z = 0.7; el.rotation.x = -0.25;
  earL.add(el);
  head.add(earL);
  earR = new THREE.Group();
  earR.position.set(0.13, 0.07, 0.0);
  const er = new THREE.Mesh(earGeo, M.dark);
  er.position.y = 0.08; er.rotation.z = -0.7; er.rotation.x = -0.25;
  earR.add(er);
  head.add(earR);
  // eyes
  for (const sx of [-1, 1]) {
    const sc = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), M.sclera);
    sc.scale.set(0.045, 0.045, 0.04);
    sc.position.set(sx * 0.085, 0.075, 0.135);
    head.add(sc);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), M.eye);
    eye.scale.set(0.028, 0.028, 0.024);
    eye.position.set(sx * 0.088, 0.075, 0.145);
    head.add(eye);
  }
}

// --- tail ---
const tail = new THREE.Group();
tail.position.set(0, 2.05, -0.92);
root.add(tail);
{
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.035, 0.5, 10), M.body);
  stem.position.y = -0.25;
  stem.rotation.x = -0.5; // angled down and away from the body
  tail.add(stem);
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), M.dark);
  tuft.scale.set(0.05, 0.09, 0.05);
  tuft.position.set(0, -0.5, -0.12);
  tail.add(tuft);
}

// cast shadows on all giraffe meshes
GIRAFFE.traverse((o) => {
  if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
});
scene.add(GIRAFFE);

// ============================================================
// Environment: ground, trees, rocks, bushes
// ============================================================
const ground = new THREE.Mesh(new THREE.CircleGeometry(55, 64),
  new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// walking path (ellipse)
const PATH = { rx: 8, rz: 5.5 };
function pathPoint(t) {
  return new THREE.Vector3(PATH.rx * Math.cos(t), 0, PATH.rz * Math.sin(t));
}
function distToPath(p) {
  let d = Infinity;
  for (let i = 0; i < 32; i++) {
    const q = pathPoint((i / 32) * Math.PI * 2);
    d = Math.min(d, p.distanceTo(q));
  }
  return d;
}

const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4527, roughness: 0.95 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x55663a, roughness: 0.9 });
const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x6d7a45, roughness: 0.9 });
const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8478, roughness: 1 });
const bushMat = new THREE.MeshStandardMaterial({ color: 0x46552e, roughness: 1 });

function makeTree(scale) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.12 * scale, 2.0 * scale, 8), treeTrunkMat);
  trunk.position.y = scale;
  trunk.castShadow = true;
  g.add(trunk);
  // acacia-style flat crown
  const blobs = 3 + (Math.random() * 2 | 0);
  for (let i = 0; i < blobs; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry((0.9 + Math.random() * 0.8) * scale, 1),
      i % 2 ? leafMat : leafMat2);
    b.scale.set(1.6, 0.45, 1.4);
    b.position.set((Math.random() - 0.5) * 2.2 * scale, (2.0 + Math.random() * 0.5) * scale, (Math.random() - 0.5) * 1.6 * scale);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

function placeOnGround(obj, minPathDist) {
  for (let tries = 0; tries < 200; tries++) {
    const r = 7 + Math.random() * 38;
    const a = Math.random() * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (distToPath(p) < minPathDist) continue;
    obj.position.copy(p);
    obj.rotation.y = Math.random() * Math.PI * 2;
    return true;
  }
  return false;
}

for (let i = 0; i < 14; i++) {
  const t = makeTree(0.8 + Math.random() * 0.9);
  if (placeOnGround(t, 5.5)) scene.add(t);
}
for (let i = 0; i < 10; i++) {
  const s = 0.25 + Math.random() * 0.4;
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
  if (placeOnGround(rock, 4.5)) {
    rock.position.y = s * 0.6;
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    scene.add(rock);
  }
}
for (let i = 0; i < 16; i++) {
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + Math.random() * 0.3, 1), bushMat);
  b.scale.set(1.4, 0.6, 1.3);
  if (placeOnGround(b, 4.0)) {
    b.position.y = 0.22;
    b.castShadow = true;
    scene.add(b);
  }
}

// dust puff texture
const dustTex = (() => {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(196,174,132,0.55)");
  g.addColorStop(1, "rgba(196,174,132,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const dustPool = [];
{
  const smProto = new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false });
  for (let i = 0; i < 28; i++) {
    const s = new THREE.Sprite(smProto.clone()); // per-sprite material so puffs fade independently
    s.visible = false;
    scene.add(s);
    dustPool.push({ s, life: 0, max: 1 });
  }
}
function spawnDust(x, z) {
  const p = dustPool.find((d) => !d.s.visible);
  if (!p) return;
  p.s.position.set(x, 0.05, z);
  p.s.scale.setScalar(0.25);
  p.s.material.opacity = 0.55;
  p.s.visible = true;
  p.life = 0;
}

// ============================================================
// Animation
// ============================================================
const clock = new THREE.Clock();
let simTime = 0;
let paused = false;
let theta = Math.PI * 0.6; // path angle
const SPEED = 0.85; // m/s (walk)
const STEP_PERIOD = 1.15; // s per full cycle (2 steps)

const headWorld = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const camTarget = new THREE.Vector3(0, 2.2, -10);
let yaw = 0, pitch = 0.32, dist = 9.5;
let dragging = false;
let lastX = 0, lastY = 0;

renderer.domElement.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
addEventListener("pointerup", () => { dragging = false; });
addEventListener("pointermove", (e) => {
  if (!dragging) return;
  yaw += (e.clientX - lastX) * 0.005;
  pitch = THREE.MathUtils.clamp(pitch + (e.clientY - lastY) * 0.004, 0.08, 0.85);
  lastX = e.clientX; lastY = e.clientY;
});
renderer.domElement.addEventListener("wheel", (e) => {
  dist = THREE.MathUtils.clamp(dist + e.deltaY * 0.005, 5, 18);
}, { passive: true });
addEventListener("keydown", (e) => {
  if (e.code === "Space") { paused = !paused; e.preventDefault(); }
  if (e.code === "KeyR") { yaw = 0; pitch = 0.32; dist = 9.5; }
});

// per-leg foot tracking for dust
const footTrack = new Map();
[legFL, legFR, legHL, legHR].forEach((l, i) => {
  footTrack.set(l, { y: 10, i });
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!paused) simTime += dt;
  const t = simTime;
  const phase = (t * Math.PI * 2) / STEP_PERIOD;

  // --- move along path ---
  theta += dt * (SPEED / PATH.rx) * (paused ? 0 : 1);
  const pos = pathPoint(theta);
  const tang = pathPoint(theta + 0.001).sub(pos).normalize();
  GIRAFFE.position.copy(pos);
  GIRAFFE.rotation.y = Math.atan2(tang.x, tang.z);

  // --- gait ---
  const legs = [
    { l: legFL, ph: 0, front: true },
    { l: legHR, ph: 0, front: false },
    { l: legFR, ph: Math.PI, front: true },
    { l: legHL, ph: Math.PI, front: false },
  ];
  for (const { l, ph } of legs) {
    const p = phase + ph;
    const hip = Math.sin(p);
    // hip swing
    const swing = 0.38 * hip;
    const rest = l.front ? 0.02 : -0.06;
    // +x rotation sweeps the hanging leg (pointing -y) toward -z (backward), so forward = negative
    l.hip.rotation.x = rest - swing;
    l.hip.rotation.z = 0.05 * Math.sin(p * 0.5 + 1.3);
    // knee / hock: flex during stance (hip sweeping back, i.e. swing < 0)
    const flex = Math.max(0, -hip);
    if (l.front) {
      l.knee.rotation.x = 0.06 + flex * 0.55 + 0.03 * Math.sin(p + 0.9);
    } else {
      l.knee.rotation.x = 0.28 + flex * 0.8 + 0.05 * Math.sin(p + 0.9);
    }
    // dust on touchdown
    const ft = footTrack.get(l);
    const wp = l.hoof.getWorldPosition(tmpV);
    if (ft.y > 0.12 && wp.y <= 0.11 && Math.abs(hip) > 0.15 && !paused) {
      spawnDust(wp.x, wp.z);
    }
    ft.y = wp.y;
  }

  // body bob (2 beats per cycle), roll, slight pitch
  root.position.y = 0.03 * Math.sin(2 * phase + 0.8);
  root.rotation.z = 0.012 * Math.sin(2 * phase);
  root.rotation.x = 0.015 * Math.sin(2 * phase + 1.2);

  // neck & head
  neck.rotation.x = 0.45 + 0.035 * Math.sin(2 * phase + 0.5) + 0.015 * Math.sin(t * 0.6);
  neck.rotation.z = 0.02 * Math.sin(t * 0.45);
  head.rotation.x = 0.06 * Math.sin(2 * phase + 1.6) + 0.02 * Math.sin(t * 0.7);
  head.rotation.y = 0.08 * Math.sin(t * 0.3);
  // ear twitch (periodic)
  const tw = Math.max(0, Math.sin(t * 0.55)) ** 10 * 0.5;
  earR.rotation.z = -tw;
  // tail sway + occasional flick
  tail.rotation.z = 0.18 * Math.sin(t * 1.25) + 0.35 * Math.max(0, Math.sin(t * 0.45 + 2)) ** 8;
  tail.rotation.x = 0.12 * Math.sin(t * 0.8 + 1);

  // dust update
  for (const d of dustPool) {
    if (!d.s.visible) continue;
    d.life += dt;
    if (d.life > d.max) { d.s.visible = false; continue; }
    const f = d.life / d.max;
    d.s.scale.setScalar(0.25 + f * 0.7);
    d.s.material.opacity = 0.55 * (1 - f);
  }

  // --- camera follows behind the giraffe ---
  const behind = new THREE.Vector3().subVectors(pos, tang).normalize();
  const desired = pos.clone()
    .add(behind.multiplyScalar(dist * Math.cos(pitch)))
    .add(new THREE.Vector3(0, dist * Math.sin(pitch), 0));
  camTarget.lerp(desired, 1 - Math.exp(-4 * dt));
  camera.position.copy(camTarget);
  GIRAFFE.updateMatrixWorld();
  headWorld.copy(head.position).applyMatrix4(neckTop.matrixWorld);
  camera.lookAt(headWorld);

  renderer.render(scene, camera);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// hide loading once first frame is up
requestAnimationFrame(() => requestAnimationFrame(() => {
  loaderEl.style.opacity = "0";
  setTimeout(() => loaderEl.remove(), 550);
}));
