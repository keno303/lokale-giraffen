/* ============================================================================
   THE WALKING GIRAFFE  -  a self-contained procedural Three.js study
   No external models/textures: every surface is generated at runtime.
   ============================================================================ */
import * as THREE from 'three';

const T = THREE;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const PI2 = Math.PI * 2;
// small seeded PRNG so the animal looks the same on every load
let _seed = 20240617;
function rnd() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; }
const rr = (a, b) => a + (b - a) * rnd();
const QS = new URLSearchParams(location.search);
const SIL = QS.get('sil');            // 'side' | '3q' | null  (debug silhouette)
const FREEZE_T = QS.has('t') ? parseFloat(QS.get('t')) : null;

const status = document.getElementById('status');
const hud = document.getElementById('hud');
function diag(extra) {
  const info = renderer ? renderer.info.render : { calls: 0, triangles: 0 };
  const s = `DIAG READY r${T.REVISION} frames=${frames} drawcalls=${info.calls} triangles=${info.triangles} errors=${window.__DIAG__.errors.length}` + (extra ? ' ' + extra : '');
  if (status) status.textContent = s;
  return s;
}

/* ---------------------------------------------------------------------------
   Configuration
   ------------------------------------------------------------------------- */
const CFG = {
  // gait (treadmill: animal stays at origin, world scrolls beneath it)
  excursion: 1.15,      // front-to-back foot travel relative to the body
  duty: 0.62,           // fraction of cycle a foot is planted
  speed: 1.35,          // world units / second
  lift: 0.30,           // hoof clearance during swing
  // leg dimensions (upper, lower bone lengths + hoof/ankle height)
  front: { hipY: 2.52, L1: 1.18, L2: 1.26, ankle: 0.17, x: 0.40, z: 0.78, sign: 1 },
  hind:  { hipY: 2.34, L1: 1.12, L2: 1.16, ankle: 0.17, x: 0.42, z: -0.86, sign: 1 },
};
// gait phase offsets per leg (4-beat walk). 0..1
const GAITS = {
  walk: { FL: 0.00, FR: 0.50, HL: 0.75, HR: 0.25 },
  pace: { FL: 0.00, FR: 0.50, HL: 0.00, HR: 0.50 },
  trot: { FL: 0.00, FR: 0.50, HL: 0.50, HR: 0.00 },
};
let gaitName = 'walk';

/* ---------------------------------------------------------------------------
   Renderer, scene, camera
   ------------------------------------------------------------------------- */
const app = document.getElementById('app');
const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
app.appendChild(renderer.domElement);

const scene = new T.Scene();
scene.fog = new T.Fog(0xd7d2b4, 34, 165);

const camera = new T.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 600);
const camTarget = new T.Vector3(0, 2.55, 0);

/* ---------------------------------------------------------------------------
   Sky: gradient dome (warm savanna haze -> blue)
   ------------------------------------------------------------------------- */
function makeSkyTexture() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.00, '#5b86b8');
  grad.addColorStop(0.35, '#8fb4d2');
  grad.addColorStop(0.62, '#c9d6cf');
  grad.addColorStop(0.82, '#e6dcc0');
  grad.addColorStop(1.00, '#efe1bd');
  g.fillStyle = grad; g.fillRect(0, 0, 16, 256);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}
const sky = new T.Mesh(
  new T.SphereGeometry(400, 32, 20),
  new T.MeshBasicMaterial({ map: makeSkyTexture(), side: T.BackSide, fog: false, depthWrite: false })
);
scene.add(sky);
// soft sun disc
const sun = new T.Mesh(
  new T.SphereGeometry(9, 20, 16),
  new T.MeshBasicMaterial({ color: 0xfff4d6, fog: false, transparent: true, opacity: 0.85, depthWrite: false })
);
sun.position.set(-90, 78, -190);
scene.add(sun);

/* ---------------------------------------------------------------------------
   Lighting
   ------------------------------------------------------------------------- */
const hemi = new T.HemisphereLight(0xcfe2ff, 0x8a6b3f, 0.85);
scene.add(hemi);
const ambient = new T.AmbientLight(0xffffff, 0.16);
scene.add(ambient);

const sunLight = new T.DirectionalLight(0xfff0cf, 2.35);
sunLight.position.set(-9, 16, 10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 60;
const sc = sunLight.shadow.camera;
sc.left = -9; sc.right = 9; sc.top = 11; sc.bottom = -6;
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.02;
sunLight.target.position.set(0, 2.2, 0);
scene.add(sunLight, sunLight.target);

const fill = new T.DirectionalLight(0x9fb8d8, 0.42);
fill.position.set(8, 6, -8);
scene.add(fill);
const rim = new T.DirectionalLight(0xffe0a8, 0.35);
rim.position.set(4, 5, -12);
scene.add(rim);

/* ---------------------------------------------------------------------------
   Procedural textures (canvas). Spots use a jittered-grid of irregular
   polygonal blotches -> convincingly giraffe-like, and tileable.
   ------------------------------------------------------------------------- */
function blotchPath(g, cx, cy, r, n, jitter, rot) {
  g.beginPath();
  for (let k = 0; k <= n; k++) {
    const a = rot + (k % n) / n * PI2;
    const rad = r * (1 - jitter / 2 + rnd() * jitter);
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad * (0.86 + rnd() * 0.28);
    if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

function makeCoatTexture(opts) {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const base = opts.base;
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  // subtle mottling / hide grain
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${opts.grain[0]},${opts.grain[1]},${opts.grain[2]},${rnd() * 0.05})`;
    g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 3, 2 + rnd() * 3);
  }
  const N = opts.cells;                 // spots per axis
  const cell = S / N;
  const shades = opts.shades;
  // draw each blotch 9x (toroidal wrap) so the texture tiles seamlessly
  for (let iy = -1; iy <= N; iy++) {
    for (let ix = -1; ix <= N; ix++) {
      const cx = (ix + 0.5) * cell + (rnd() - 0.5) * cell * 0.62;
      const cy = (iy + 0.5) * cell + (rnd() - 0.5) * cell * 0.62;
      const r = cell * rr(opts.rmin, opts.rmax);
      const col = shades[(rnd() * shades.length) | 0];
      for (let wy = -1; wy <= 1; wy++) for (let wx = -1; wx <= 1; wx++) {
        const px = cx + wx * S, py = cy + wy * S;
        if (px < -r * 1.6 || px > S + r * 1.6 || py < -r * 1.6 || py > S + r * 1.6) continue;
        // radial gradient gives a dark core + soft irregular edge
        const grad = g.createRadialGradient(px, py, r * 0.15, px, py, r * 1.05);
        grad.addColorStop(0, col[0]);
        grad.addColorStop(0.72, col[1]);
        grad.addColorStop(1, col[2]);
        g.fillStyle = grad;
        g.save(); g.translate(px, py);
        blotchPath(g, 0, 0, r, 9 + ((rnd() * 3) | 0), 0.42, rnd() * PI2);
        g.fill();
        // faint darker rim for definition
        g.lineWidth = 1.4; g.strokeStyle = col[0]; g.globalAlpha = 0.35; g.stroke(); g.globalAlpha = 1;
        g.restore();
      }
    }
  }
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const coatTex = makeCoatTexture({
  base: '#e7c98d',
  grain: [120, 80, 40],
  cells: 9,
  rmin: 0.40, rmax: 0.58,
  shades: [
    ['#7a4a22', '#8a5628', '#a06a34'],
    ['#6e3f1c', '#7d4a20', '#925a2a'],
    ['#8b5a2c', '#9a6631', '#b07a3c'],
    ['#5f3617', '#6d4120', '#83532a'],
    ['#94632f', '#a67037', '#b98443'],
  ],
});
// paler, smaller/fainter spotting for the lower legs
const legTex = makeCoatTexture({
  base: '#ecdcb4',
  grain: [150, 120, 70],
  cells: 13,
  rmin: 0.28, rmax: 0.42,
  shades: [
    ['#c39a63', '#cbA671', '#dcbd8a'],
    ['#b98c53', '#c39c66', '#d4b483'],
    ['#c8a06a', '#d2ad78', '#e2c795'],
  ],
});

function makeGroundTexture() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#b7a066'; g.fillRect(0, 0, S, S);
  // dry earth mottling
  for (let i = 0; i < 16000; i++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? `rgba(90,72,40,${rnd() * 0.10})` : `rgba(210,190,140,${rnd() * 0.12})`;
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 4, 1 + rnd() * 5);
  }
  // sparse dry grass strokes (tileable via wrap)
  for (let i = 0; i < 900; i++) {
    const x = rnd() * S, y = rnd() * S, len = 4 + rnd() * 8, a = -Math.PI / 2 + (rnd() - 0.5);
    g.strokeStyle = `rgba(${140 + rnd() * 40 | 0},${120 + rnd() * 40 | 0},${60 + rnd() * 30 | 0},${0.25 + rnd() * 0.3})`;
    g.lineWidth = 1;
    for (let wy = -1; wy <= 1; wy++) for (let wx = -1; wx <= 1; wx++) {
      g.beginPath(); g.moveTo(x + wx * S, y + wy * S);
      g.lineTo(x + wx * S + Math.cos(a) * len, y + wy * S + Math.sin(a) * len); g.stroke();
    }
  }
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}
const groundTex = makeGroundTexture();

/* ---------------------------------------------------------------------------
   Shared materials
   ------------------------------------------------------------------------- */
const MAT = {
  coat: new T.MeshStandardMaterial({ map: coatTex, roughness: 0.92, metalness: 0.0, side: T.DoubleSide, bumpMap: coatTex, bumpScale: 0.012 }),
  pale: new T.MeshStandardMaterial({ map: legTex, roughness: 0.94, metalness: 0.0, side: T.DoubleSide, bumpMap: legTex, bumpScale: 0.01 }),
  cream: new T.MeshStandardMaterial({ color: 0xe9d7ad, roughness: 0.9, side: T.DoubleSide }),
  creamDark: new T.MeshStandardMaterial({ color: 0xcdb182, roughness: 0.9, side: T.DoubleSide }),
  muzzle: new T.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.85 }),
  dark: new T.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.78 }),
  mane: new T.MeshStandardMaterial({ color: 0x4a2c17, roughness: 0.9, side: T.DoubleSide }),
  hoof: new T.MeshStandardMaterial({ color: 0x241812, roughness: 0.6, metalness: 0.05 }),
  eye: new T.MeshStandardMaterial({ color: 0x140c07, roughness: 0.15, metalness: 0.05 }),
  glint: new T.MeshBasicMaterial({ color: 0xffffff }),
  iris: new T.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.4 }),
  earInner: new T.MeshStandardMaterial({ color: 0x9c6b45, roughness: 0.95, side: T.DoubleSide }),
};

/* ---------------------------------------------------------------------------
   Geometry helpers
   ------------------------------------------------------------------------- */
function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

// Parallel-transport frames along a polyline -> twist-free tube frames.
function computeFrames(points) {
  const n = points.length, tangents = [];
  for (let i = 0; i < n; i++) {
    const a = points[i === 0 ? 0 : i - 1];
    const b = points[i === n - 1 ? n - 1 : i + 1];
    tangents.push(new T.Vector3().subVectors(b, a).normalize());
  }
  const ref = Math.abs(tangents[0].y) < 0.9 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0);
  const N = new T.Vector3().crossVectors(tangents[0], ref).normalize();
  const frames = [];
  for (let i = 0; i < n; i++) {
    const tg = tangents[i];
    if (i > 0) N.applyQuaternion(new T.Quaternion().setFromUnitVectors(tangents[i - 1], tg));
    N.addScaledVector(tg, -N.dot(tg)).normalize();
    const b = new T.Vector3().crossVectors(tg, N).normalize();
    frames.push({ t: tg, n: N.clone(), b });
  }
  return frames;
}

// Build a smooth tube from centerline points + per-point radii (number or {x,y}
// for an elliptical cross-section). Normals are analytic -> no seam artefacts.
function makeTube(points, radii, opts = {}) {
  const seg = opts.seg ?? 16;
  const uRepeat = opts.uRepeat ?? 2.0;
  const vRepeat = opts.vRepeat ?? 2.0;
  const n = points.length;
  const frames = computeFrames(points);
  const pos = [], nor = [], uv = [], idx = [];
  const getR = (i) => typeof radii[i] === 'number' ? { x: radii[i], y: radii[i] } : radii[i];
  for (let i = 0; i < n; i++) {
    const f = frames[i], R = getR(i), vB = i / (n - 1) * vRepeat;
    for (let j = 0; j <= seg; j++) {
      const th = j / seg * PI2, ct = Math.cos(th), st = Math.sin(th);
      const ox = R.x * ct, oy = R.y * st;
      pos.push(points[i].x + f.n.x * ox + f.b.x * oy,
               points[i].y + f.n.y * ox + f.b.y * oy,
               points[i].z + f.n.z * ox + f.b.z * oy);
      let nx = f.n.x * (ct / R.x) + f.b.x * (st / R.y);
      let ny = f.n.y * (ct / R.x) + f.b.y * (st / R.y);
      let nz = f.n.z * (ct / R.x) + f.b.z * (st / R.y);
      const l = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / l, ny / l, nz / l);
      uv.push(j / seg * uRepeat, vB);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + 1, c = a + (seg + 1), d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  if (opts.cap !== false) {
    addFlatCap(0, frames[0], getR(0), -1);
    addFlatCap(n - 1, frames[n - 1], getR(n - 1), 1);
  }
  function addFlatCap(ri, f, R, dir) {
    const c = points[ri], ci = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    nor.push(dir * f.t.x, dir * f.t.y, dir * f.t.z);
    uv.push(0.5, 0.5);
    const ring = ri * (seg + 1);
    for (let j = 0; j < seg; j++) {
      const a = ring + j, b = ring + j + 1;
      if (dir < 0) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  }
  return geo;
}

// Sample a Catmull-Rom curve and interpolate a radius profile along it.
function sampleCurve(cps, crs, N) {
  const curve = new T.CatmullRomCurve3(cps.map((p) => new T.Vector3(p[0], p[1], p[2])));
  const points = [], radii = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    points.push(curve.getPoint(t));
    const f = t * (crs.length - 1), k = Math.min(crs.length - 2, Math.floor(f)), s = smooth(f - k);
    const r0 = crs[k], r1 = crs[k + 1];
    radii.push(typeof r0 === 'number'
      ? lerp(r0, r1, s)
      : { x: lerp(r0.x, r1.x, s), y: lerp(r0.y, r1.y, s) });
  }
  return { points, radii, curve };
}

// Ellipsoid from a plain sphere: object-level scale keeps normals perfect.
function ellipsoid(mat, rx, ry, rz, o = {}) {
  const geo = new T.SphereGeometry(1, o.seg ?? 28, o.segV ?? 18);
  scaleUV(geo, o.su ?? 2.2, o.sv ?? 1.7);
  const m = new T.Mesh(geo, mat);
  m.scale.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Tapered bone aligned along -Y with its pivot at the top (y=0).
function boneGeo(rTop, rBottom, L, uRep, vRep, seg = 14) {
  const g = new T.CylinderGeometry(rTop, rBottom, L, seg, 1, false);
  g.translate(0, -L / 2, 0);
  scaleUV(g, uRep, vRep);
  return g;
}

function mesh(geo, mat, parent) {
  const m = new T.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

/* ===========================================================================
   THE GIRAFFE
   ========================================================================= */
const giraffe = new T.Group();
scene.add(giraffe);
const bodyGroup = new T.Group();          // carries the torso + secondary sway
giraffe.add(bodyGroup);
const neckGroup = new T.Group();          // pivots at the base of the neck
bodyGroup.add(neckGroup);
const headGroup = new T.Group();          // pivots at the top of the neck
const jawGroup = new T.Group();
const tailGroup = new T.Group();
const tailMid = new T.Group();
const ears = [];
const legs = [];

// short tapered "hair" used for the mane, tail tuft and eyelashes
function hair(parent, base, dir, len, r, mat) {
  const g = new T.ConeGeometry(r, len, 5);
  g.translate(0, len / 2, 0);
  const m = mesh(g, mat, parent);
  m.position.copy(base);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.clone().normalize());
  return m;
}

/* ---- Torso: a tapered, sloping barrel (elliptical tube along +Z) --------- */
const torsoCps = [
  [0, 2.30, -1.30],
  [0, 2.38, -0.86],
  [0, 2.46, -0.20],
  [0, 2.56,  0.46],
  [0, 2.66,  0.96],
  [0, 2.68,  1.24],
];
const torsoR = [
  { x: 0.26, y: 0.30 },
  { x: 0.47, y: 0.54 },
  { x: 0.53, y: 0.61 },
  { x: 0.52, y: 0.61 },
  { x: 0.47, y: 0.56 },
  { x: 0.30, y: 0.40 },
];
{
  const { points, radii } = sampleCurve(torsoCps, torsoR, 24);
  mesh(makeTube(points, radii, { seg: 24, uRepeat: 2.4, vRepeat: 2.2 }), MAT.coat, bodyGroup);
  // round off the two open ends with blended lobes
  const rump = ellipsoid(MAT.coat, 0.46, 0.50, 0.46, { su: 2.0, sv: 1.6 });
  rump.position.set(0, 2.34, -1.12); bodyGroup.add(rump);
  const chest = ellipsoid(MAT.coat, 0.44, 0.50, 0.42, { su: 2.0, sv: 1.6 });
  chest.position.set(0, 2.60, 1.00); bodyGroup.add(chest);
  // withers / shoulder hump
  const withers = ellipsoid(MAT.coat, 0.40, 0.30, 0.52, { su: 1.8, sv: 1.4 });
  withers.position.set(0, 3.00, 0.72); bodyGroup.add(withers);
  // lighter belly / brisket hint
  const belly = ellipsoid(MAT.cream, 0.40, 0.20, 0.95, { su: 2.0, sv: 2.0 });
  belly.position.set(0, 2.10, 0.0); belly.scale.multiplyScalar(1); bodyGroup.add(belly);
}

/* ---- Neck ---------------------------------------------------------------- */
const NECK_BASE = new T.Vector3(0, 2.66, 0.70);
let neckPoints, neckRadii;
{
  const cps = [
    [0, 2.60, 0.62],
    [0, 3.02, 0.78],
    [0, 3.52, 0.98],
    [0, 4.02, 1.20],
    [0, 4.50, 1.42],
  ];
  const crs = [0.52, 0.46, 0.40, 0.33, 0.27];
  const s = sampleCurve(cps, crs, 20);
  neckPoints = s.points; neckRadii = s.radii;
  neckGroup.position.copy(NECK_BASE);
  const local = neckPoints.map((p) => p.clone().sub(NECK_BASE));
  mesh(makeTube(local, neckRadii, { seg: 20, uRepeat: 2.2, vRepeat: 2.6 }), MAT.coat, neckGroup);
  // mane: a ridge of short dark hairs along the dorsal (rear) edge
  const n = neckPoints.length;
  for (let i = 1; i < n - 1; i++) {
    const p = neckPoints[i].clone().sub(NECK_BASE);
    const ta = neckPoints[Math.min(n - 1, i + 1)].clone().sub(neckPoints[Math.max(0, i - 1)]).normalize();
    const dorsal = new T.Vector3(0, ta.z, -ta.y).normalize(); // backward + up
    const r = (typeof neckRadii[i] === 'number' ? neckRadii[i] : neckRadii[i].x);
    const base = p.clone().addScaledVector(dorsal, r * 0.92);
    base.x += rr(-0.02, 0.02);
    const dir = new T.Vector3(rr(-0.12, 0.12), rr(-0.35, -0.15), -1).normalize();
    hair(neckGroup, base, dir, rr(0.16, 0.24), rr(0.022, 0.035), MAT.mane);
    // occasional longer fly-away hair
    if (rnd() < 0.35) hair(neckGroup, base, dir.clone().add(new T.Vector3(0, 0.25, 0)), rr(0.24, 0.32), 0.018, MAT.mane);
  }
  // a thin dark crest ridge beneath the hairs
  const crest = neckPoints.map((p, i) => {
    const ta = neckPoints[Math.min(n - 1, i + 1)].clone().sub(neckPoints[Math.max(0, i - 1)]).normalize();
    const dorsal = new T.Vector3(0, ta.z, -ta.y).normalize();
    const r = (typeof neckRadii[i] === 'number' ? neckRadii[i] : neckRadii[i].x);
    return p.clone().sub(NECK_BASE).addScaledVector(dorsal, r * 0.86);
  });
  mesh(makeTube(crest, crest.map(() => 0.045), { seg: 8, uRepeat: 1, vRepeat: 3, cap: false }), MAT.mane, neckGroup);
}

/* ---- Head ---------------------------------------------------------------- */
const HEAD_POS = neckPoints[neckPoints.length - 1].clone().sub(NECK_BASE);
headGroup.position.copy(HEAD_POS);
headGroup.rotation.x = 0.14;           // muzzle tipped slightly down
neckGroup.add(headGroup);
headGroup.add(jawGroup);
jawGroup.position.set(0, -0.06, 0.12);
{
  // skull: tapering tube from cranium to muzzle
  const cps = [
    [0, 0.02, -0.20],
    [0, 0.04, -0.02],
    [0, 0.02,  0.20],
    [0, -0.01, 0.38],
    [0, -0.03, 0.52],
  ];
  const crs = [
    { x: 0.19, y: 0.21 },
    { x: 0.20, y: 0.21 },
    { x: 0.155, y: 0.165 },
    { x: 0.145, y: 0.15 },
    { x: 0.12, y: 0.125 },
  ];
  const s = sampleCurve(cps, crs, 14);
  mesh(makeTube(s.points, s.radii, { seg: 16, uRepeat: 1.5, vRepeat: 1.3 }), MAT.coat, headGroup);
  // forehead / brow mass
  const brow = ellipsoid(MAT.coat, 0.19, 0.10, 0.20, { su: 1.4, sv: 1.2 });
  brow.position.set(0, 0.14, 0.02); headGroup.add(brow);
  // muzzle (darker, bulbous)
  const muzzle = ellipsoid(MAT.muzzle, 0.152, 0.132, 0.145, { su: 1.2, sv: 1.2, seg: 22 });
  muzzle.position.set(0, -0.028, 0.46); headGroup.add(muzzle);
  // nostrils
  for (const sgn of [-1, 1]) {
    const n = ellipsoid(MAT.dark, 0.028, 0.020, 0.018, { seg: 12 });
    n.position.set(sgn * 0.075, 0.015, 0.565); headGroup.add(n);
  }
  // mouth line
  const mouth = mesh(new T.BoxGeometry(0.16, 0.008, 0.02), MAT.dark, headGroup);
  mouth.position.set(0, -0.095, 0.52);

  // lower jaw (chews gently)
  const jaw = ellipsoid(MAT.creamDark, 0.135, 0.05, 0.22, { su: 1.2, sv: 1.0 });
  jaw.position.set(0, -0.03, 0.19); jawGroup.add(jaw);

  // eyes
  for (const sgn of [-1, 1]) {
    const eg = new T.Group();
    eg.position.set(sgn * 0.185, 0.085, 0.10);
    headGroup.add(eg);
    const ball = ellipsoid(MAT.eye, 0.075, 0.075, 0.075, { seg: 16 });
    ball.position.set(sgn * 0.01, 0, 0); eg.add(ball);
    const iris = ellipsoid(MAT.iris, 0.050, 0.050, 0.030, { seg: 14 });
    iris.position.set(sgn * 0.068, 0.004, 0.012); eg.add(iris);
    const glint = ellipsoid(MAT.glint, 0.016, 0.016, 0.010, { seg: 8 });
    glint.position.set(sgn * 0.086, 0.025, 0.028); glint.castShadow = false; eg.add(glint);
    // brow ridge + lashes
    const browR = ellipsoid(MAT.coat, 0.10, 0.045, 0.10, { su: 1.0, sv: 0.8 });
    browR.position.set(0, 0.085, 0); eg.add(browR);
    for (let k = 0; k < 5; k++) {
      const a = -0.5 + k * 0.25;
      hair(eg, new T.Vector3(sgn * 0.05, 0.06 + Math.cos(a) * 0.01, Math.sin(a) * 0.06),
        new T.Vector3(sgn * 0.5, 0.55, -0.1), 0.075, 0.006, MAT.dark);
    }
  }

  // ears (leaf-like, angled out & back)
  for (const sgn of [-1, 1]) {
    const ear = new T.Group();
    ear.position.set(sgn * 0.15, 0.14, -0.13);
    ear.rotation.set(-0.22, sgn * 2.0, sgn * 0.28);
    headGroup.add(ear);
    const outer = ellipsoid(MAT.coat, 0.05, 0.115, 0.165, { su: 1.2, sv: 1.0 });
    ear.add(outer);
    const inner = ellipsoid(MAT.earInner, 0.03, 0.085, 0.125, { su: 1.0, sv: 1.0 });
    inner.position.set(0, 0, 0.028); ear.add(inner);
    ears.push({ group: ear, side: sgn, baseRot: ear.rotation.clone() });
  }

  // ossicones (horn knobs with dark tufts)
  for (const sgn of [-1, 1]) {
    const og = new T.Group();
    og.position.set(sgn * 0.10, 0.20, -0.04);
    og.rotation.z = sgn * 0.14;
    headGroup.add(og);
    const stalk = mesh(new T.CylinderGeometry(0.04, 0.052, 0.22, 10), MAT.coat, og);
    stalk.position.y = 0.11;
    const tuft = ellipsoid(MAT.mane, 0.082, 0.082, 0.082, { seg: 12 });
    tuft.position.y = 0.235; og.add(tuft);
  }
  // small median ossicone
  const med = mesh(new T.CylinderGeometry(0.032, 0.045, 0.10, 8), MAT.coat, headGroup);
  med.position.set(0, 0.215, 0.14);
  const medTuft = ellipsoid(MAT.mane, 0.06, 0.055, 0.06, { seg: 10 });
  medTuft.position.set(0, 0.27, 0.14); headGroup.add(medTuft);
}

/* ---- Tail (two-segment whip + dark tuft) -------------------------------- */
tailGroup.position.set(0, 2.50, -1.32);
bodyGroup.add(tailGroup);
{
  const s1 = sampleCurve([[0, 0, 0], [0, -0.26, -0.10], [0, -0.46, -0.16]], [0.055, 0.045, 0.035], 8);
  mesh(makeTube(s1.points, s1.radii, { seg: 10, uRepeat: 1.2, vRepeat: 1.4 }), MAT.coat, tailGroup);
  tailMid.position.set(0, -0.46, -0.16);
  tailGroup.add(tailMid);
  const s2 = sampleCurve([[0, 0, 0], [0, -0.22, -0.06], [0, -0.36, -0.05]], [0.035, 0.028, 0.022], 8);
  mesh(makeTube(s2.points, s2.radii, { seg: 10, uRepeat: 1.0, vRepeat: 1.2 }), MAT.pale, tailMid);
  // tuft
  const tip = new T.Vector3(0, -0.36, -0.05);
  const core = ellipsoid(MAT.dark, 0.05, 0.075, 0.05, { seg: 10 });
  core.position.copy(tip); tailMid.add(core);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * PI2;
    const off = new T.Vector3(Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03);
    const dir = new T.Vector3(Math.cos(a) * 0.35, -1, Math.sin(a) * 0.35 - 0.1).normalize();
    hair(tailMid, tip.clone().add(off), dir, rr(0.20, 0.30), 0.012, MAT.dark);
  }
}

/* ---- Legs ---------------------------------------------------------------- */
function buildHoof(parent, rA) {
  const coronet = ellipsoid(MAT.pale, rA * 1.15, rA * 0.9, rA * 1.2, { seg: 12, su: 1, sv: 1 });
  coronet.position.set(0, -0.015, 0); parent.add(coronet);
  for (const sgn of [-1, 1]) {
    const toe = ellipsoid(MAT.hoof, 0.062, 0.085, 0.108, { seg: 12 });
    toe.position.set(sgn * 0.055, -0.095, 0.022); parent.add(toe);
  }
  const cleft = mesh(new T.BoxGeometry(0.012, 0.10, 0.14), MAT.hoof, parent);
  cleft.position.set(0, -0.095, 0.045);
}

function buildLeg(name, cfg, sgn, isFront) {
  const root = new T.Group();
  root.position.set(sgn * cfg.x, cfg.hipY, cfg.z);
  giraffe.add(root);
  const rU = isFront ? 0.205 : 0.225, rK = 0.135, rA = 0.088;
  const hip = ellipsoid(MAT.coat, rU, rU, rU, { su: 1.6, sv: 1.4 });
  hip.position.set(sgn * 0.03, 0.02, 0); root.add(hip);

  const upperPivot = new T.Group(); root.add(upperPivot);
  mesh(boneGeo(rU, rK, cfg.L1, 1.7, 2.0, 16), MAT.coat, upperPivot);

  const kneePivot = new T.Group(); kneePivot.position.y = -cfg.L1; upperPivot.add(kneePivot);
  const knee = ellipsoid(MAT.coat, rK * 1.12, rK * 1.12, rK * 1.12, { seg: 14, su: 1.2, sv: 1.0 });
  kneePivot.add(knee);
  mesh(boneGeo(rK, rA, cfg.L2, 1.5, 1.8, 14), MAT.pale, kneePivot);

  const anklePivot = new T.Group(); anklePivot.position.y = -cfg.L2; kneePivot.add(anklePivot);
  buildHoof(anklePivot, rA);

  legs.push({ name, cfg, root, upperPivot, kneePivot, anklePivot, sign: cfg.sign });
}
buildLeg('FL', CFG.front, +1, true);
buildLeg('FR', CFG.front, -1, true);
buildLeg('HL', CFG.hind, +1, false);
buildLeg('HR', CFG.hind, -1, false);

/* ===========================================================================
   ENVIRONMENT
   ========================================================================= */
MAT.bark = new T.MeshStandardMaterial({ color: 0x5a4326, roughness: 1.0 });
MAT.leaf = [
  new T.MeshStandardMaterial({ color: 0x55642f, roughness: 1.0, flatShading: true }),
  new T.MeshStandardMaterial({ color: 0x47562a, roughness: 1.0, flatShading: true }),
  new T.MeshStandardMaterial({ color: 0x65733a, roughness: 1.0, flatShading: true }),
  new T.MeshStandardMaterial({ color: 0x3e4d26, roughness: 1.0, flatShading: true }),
];
MAT.grass = new T.MeshStandardMaterial({ color: 0x9a8a48, roughness: 1.0, flatShading: true });
MAT.grass2 = new T.MeshStandardMaterial({ color: 0xb0a05a, roughness: 1.0, flatShading: true });
MAT.rock = new T.MeshStandardMaterial({ color: 0x8c8474, roughness: 1.0, flatShading: true });

const SCENE_LEN = 96;                 // recycling length in Z
const props = [];                     // { obj, x, y, z, ry }
const wrap = (v, L) => ((v % L) + L) % L;
function addProp(obj, x, y, z, ry) {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  scene.add(obj);
  props.push({ obj, x, y, z, ry });
}

/* ---- Ground -------------------------------------------------------------- */
const GROUND_SIZE = 340, TILE_WORLD = 9;
groundTex.repeat.set(GROUND_SIZE / TILE_WORLD, GROUND_SIZE / TILE_WORLD);
const ground = new T.Mesh(
  new T.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
  new T.MeshStandardMaterial({ map: groundTex, roughness: 1.0, color: 0xf3e6c8 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* ---- Acacia trees -------------------------------------------------------- */
function makeAcacia(s, dark) {
  const g = new T.Group();
  const bark = dark
    ? new T.MeshStandardMaterial({ color: 0x3a3524, roughness: 1 })
    : MAT.bark;
  const trunk = mesh(new T.CylinderGeometry(0.075 * s, 0.17 * s, 2.7 * s, 7), bark, g);
  trunk.position.y = 1.35 * s;
  for (let b = 0; b < 3; b++) {
    const br = mesh(new T.CylinderGeometry(0.03 * s, 0.065 * s, 1.2 * s, 5), bark, g);
    const a = b / 3 * PI2 + rr(-0.3, 0.3);
    br.position.set(Math.cos(a) * 0.45 * s, 2.0 * s, Math.sin(a) * 0.45 * s);
    br.rotation.z = Math.cos(a) * 0.7;
    br.rotation.x = -Math.sin(a) * 0.7;
  }
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * PI2 + rr(-0.4, 0.4);
    const rad = rr(0.7, 1.5) * s;
    const leaf = ellipsoid(MAT.leaf[k % MAT.leaf.length], rr(0.95, 1.6) * s, rr(0.26, 0.42) * s, rr(0.95, 1.5) * s, { seg: 10, su: 1, sv: 1 });
    leaf.position.set(Math.cos(a) * rad, (2.55 + rr(-0.15, 0.22)) * s, Math.sin(a) * rad);
    g.add(leaf);
  }
  const crown = ellipsoid(MAT.leaf[1], 1.7 * s, 0.32 * s, 1.7 * s, { seg: 14, su: 1, sv: 1 });
  crown.position.y = 2.62 * s; g.add(crown);
  return g;
}
// near trees (kept clear of the walking lane at |x| < ~3.5)
for (let i = 0; i < 12; i++) {
  // keep tall trees well clear of the camera's lateral position (x ~ 8)
  const x = rnd() < 0.7 ? rr(-17, -6) : rr(20, 34);
  const z = rr(-SCENE_LEN / 2, SCENE_LEN / 2);
  const s = rr(0.85, 1.7);
  addProp(makeAcacia(s, false), x, 0, z, rr(0, PI2));
}
// distant hazy acacias for depth
for (let i = 0; i < 8; i++) {
  const x = rnd() < 0.5 ? rr(-58, -30) : rr(30, 58), z = rr(-SCENE_LEN / 2, SCENE_LEN / 2);
  addProp(makeAcacia(rr(1.6, 2.8), true), x, 0, z, rr(0, PI2));
}

/* ---- Rocks & scrub ------------------------------------------------------- */
for (let i = 0; i < 26; i++) {
  const r = rr(0.18, 0.6);
  const rock = mesh(new T.DodecahedronGeometry(r, 0), MAT.rock);
  rock.scale.set(rr(0.8, 1.5), rr(0.5, 0.9), rr(0.8, 1.4));
  rock.rotation.set(rnd(), rnd() * PI2, rnd());
  const x = rr(-24, 24), z = rr(-SCENE_LEN / 2, SCENE_LEN / 2);
  addProp(rock, x, r * 0.35, z, rr(0, PI2));
}
for (let i = 0; i < 16; i++) {
  const g = new T.Group();
  const bush = ellipsoid(MAT.leaf[(rnd() * 4) | 0], rr(0.5, 1.0), rr(0.35, 0.6), rr(0.5, 1.0), { seg: 9, su: 1, sv: 1 });
  g.add(bush);
  const x = rr(-24, 24), z = rr(-SCENE_LEN / 2, SCENE_LEN / 2);
  addProp(g, x, 0.3, z, rr(0, PI2));
}

/* ---- Grass tufts --------------------------------------------------------- */
const grassGeo = new T.ConeGeometry(0.085, 0.42, 4);
grassGeo.translate(0, 0.21, 0);
for (let i = 0; i < 150; i++) {
  const g = new T.Group();
  for (let k = 0; k < 3; k++) {
    const blade = new T.Mesh(grassGeo, rnd() < 0.5 ? MAT.grass : MAT.grass2);
    blade.position.set(rr(-0.1, 0.1), 0, rr(-0.1, 0.1));
    blade.rotation.set(rr(-0.25, 0.25), rr(0, PI2), rr(-0.25, 0.25));
    blade.scale.set(rr(0.7, 1.3), rr(0.7, 1.5), rr(0.7, 1.3));
    g.add(blade);
  }
  const x = rr(-22, 22), z = rr(-SCENE_LEN / 2, SCENE_LEN / 2);
  addProp(g, x, 0, z, rr(0, PI2));
}

/* ===========================================================================
   WALK CYCLE  (2-bone analytic IK per leg + planted-foot trajectory)
   ========================================================================= */
function solveLeg(leg, tz, ty) {
  const { L1, L2 } = leg.cfg;
  const d = Math.hypot(tz, ty) || 0.0001;
  const dc = clamp(d, Math.abs(L1 - L2) + 0.02, L1 + L2 - 0.02);
  const ux = tz / d, uy = ty / d;               // unit hip->ankle in (z,y)
  const ax = ux * dc, ay = uy * dc;             // reachable ankle
  const a = (L1 * L1 - L2 * L2 + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const s = leg.sign;
  const kz = a * ux + s * h * (-uy);           // knee, forward-bending
  const ky = a * uy + s * h * (ux);
  const a1 = Math.atan2(-kz, -ky);             // hip->knee bone angle (about X)
  const lowerAbs = Math.atan2(-(ax - kz), -(ay - ky));
  const a2 = lowerAbs - a1;                    // knee bend
  leg.upperPivot.rotation.x = a1;
  leg.kneePivot.rotation.x = a2;
  leg.anklePivot.rotation.x = -(a1 + a2);      // keep hoof flat on the ground
}

function footTarget(phase, stanceY, bob) {
  const E = CFG.excursion, duty = CFG.duty;
  if (phase < duty) {                          // stance: foot planted, moves back
    const p = phase / duty;
    return { z: E / 2 - E * p, y: stanceY - bob };
  } else {                                     // swing: foot lifts, swings forward
    const p = (phase - duty) / (1 - duty);
    return { z: -E / 2 + E * p, y: stanceY - bob + CFG.lift * Math.sin(Math.PI * p) };
  }
}
for (const leg of legs) leg.stanceY = -(leg.cfg.hipY - leg.cfg.ankle);

/* ===========================================================================
   CAMERA / CONTROLS
   ========================================================================= */
const cam = { az: 0.62, el: 0.22, dist: 13.6 };
const PRESETS = [
  { name: 'THREE-QUARTER', az: 0.62, el: 0.22, dist: 13.6, ty: 2.55 },
  { name: 'SIDE',          az: Math.PI / 2, el: 0.10, dist: 12.8, ty: 2.60 },
  { name: 'FRONT',         az: 0.02, el: 0.13, dist: 12.4, ty: 2.60 },
  { name: 'LOW ANGLE',     az: 0.95, el: 0.02, dist: 11.2, ty: 2.15 },
  { name: 'HIGH',          az: 0.70, el: 0.62, dist: 15.2, ty: 2.20 },
];
let presetIdx = 0;
function setPreset(i) {
  presetIdx = (i + PRESETS.length) % PRESETS.length;
  const p = PRESETS[presetIdx];
  cam.az = p.az; cam.el = p.el; cam.dist = p.dist; camTarget.y = p.ty;
}

const dom = renderer.domElement;
let dragging = false, lastX = 0, lastY = 0;
dom.addEventListener('pointerdown', (e) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  dom.setPointerCapture(e.pointerId);
});
dom.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  cam.az -= (e.clientX - lastX) * 0.005;
  cam.el = clamp(cam.el - (e.clientY - lastY) * 0.004, -0.06, 1.30);
  lastX = e.clientX; lastY = e.clientY;
});
dom.addEventListener('pointerup', () => { dragging = false; });
dom.addEventListener('wheel', (e) => {
  cam.dist = clamp(cam.dist * (1 + e.deltaY * 0.0011), 6.5, 42);
  e.preventDefault();
}, { passive: false });

const GAIT_NAMES = ['walk', 'pace', 'trot'];
let paused = false;
const panel = document.getElementById('panel');
let hudVisible = true;
function updateHUD() {
  if (!hud) return;
  hud.innerHTML =
    `<b>Giraffa camelopardalis</b> &nbsp;·&nbsp; procedural walk study<br>` +
    `gait <b>${gaitName.toUpperCase()}</b> &nbsp; speed <b>${CFG.speed.toFixed(2)}</b> &nbsp; view <b>${PRESETS[presetIdx].name}</b> &nbsp; ${paused ? '<b>PAUSED</b>' : 'walking'}<br>` +
    `<span class="keys">drag orbit &nbsp;·&nbsp; wheel zoom &nbsp;·&nbsp; [G] gait &nbsp;·&nbsp; [C] view &nbsp;·&nbsp; [space] pause &nbsp;·&nbsp; [+/-] speed &nbsp;·&nbsp; [H] hide &nbsp;·&nbsp; [R] reset</span>`;
}
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === ' ' || e.code === 'Space') { paused = !paused; e.preventDefault(); }
  else if (k === 'g') { gaitName = GAIT_NAMES[(GAIT_NAMES.indexOf(gaitName) + 1) % GAIT_NAMES.length]; }
  else if (k === 'c') { setPreset(presetIdx + 1); }
  else if (k === 'r') { setPreset(0); CFG.speed = 1.35; gaitName = 'walk'; }
  else if (k === 'h') { hudVisible = !hudVisible; if (hud) hud.style.display = hudVisible ? '' : 'none'; if (panel) panel.style.display = hudVisible ? '' : 'none'; }
  else if (k === '+' || k === '=' || e.code === 'ArrowUp') { CFG.speed = clamp(CFG.speed + 0.15, 0.3, 3.0); }
  else if (k === '-' || k === '_' || e.code === 'ArrowDown') { CFG.speed = clamp(CFG.speed - 0.15, 0.3, 3.0); }
  updateHUD();
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ===========================================================================
   LOOP
   ========================================================================= */
let frames = 0, t = 0, scroll = 0, last = performance.now(), hudTick = 0;
updateHUD();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  dt = clamp(dt, 0, 0.05);
  if (!paused) { t += dt; scroll += CFG.speed * dt; }
  frames++;

  const cycleT = CFG.excursion / (CFG.duty * Math.max(0.0001, CFG.speed));
  const omega = PI2 / cycleT;

  // --- secondary body motion (small, about the ground pivot) ---
  const bob = 0.030 * Math.sin(2 * omega * t + 0.4);
  giraffe.position.y = bob;
  giraffe.rotation.set(
    0.012 * Math.sin(2 * omega * t + 0.6),   // pitch
    0.010 * Math.sin(0.5 * omega * t),        // yaw
    0.018 * Math.sin(omega * t)              // roll
  );

  // --- legs: planted-foot IK ---
  const phaseOf = (name) => wrap(t / cycleT + GAITS[gaitName][name], 1);
  for (const leg of legs) {
    const ft = footTarget(phaseOf(leg.name), leg.stanceY, bob);
    solveLeg(leg, ft.z, ft.y);
  }

  // --- neck, head, jaw, ears, tail ---
  neckGroup.rotation.x = 0.038 * Math.sin(omega * t + 0.7) + 0.014 * Math.sin(t * 0.7);
  neckGroup.rotation.z = 0.020 * Math.sin(0.5 * omega * t);
  headGroup.rotation.x = 0.14 + 0.030 * Math.sin(omega * t + 1.1);
  headGroup.rotation.y = 0.055 * Math.sin(t * 0.35) + 0.02 * Math.sin(omega * t);
  jawGroup.rotation.x = 0.030 * (0.5 + 0.5 * Math.sin(t * 2.3));
  for (const e of ears) {
    const flick = Math.pow(Math.max(0, Math.sin(t * 0.9 + (e.side > 0 ? 0 : 1.7))), 8);
    e.group.rotation.z = e.baseRot.z + e.side * 0.32 * flick;
    e.group.rotation.x = e.baseRot.x + 0.06 * Math.sin(t * 1.3 + e.side);
  }
  tailGroup.rotation.y = 0.34 * Math.sin(t * 1.6);
  tailGroup.rotation.x = 0.14 * Math.sin(t * 2.1 + 0.5);
  tailMid.rotation.y = 0.30 * Math.sin(t * 1.6 - 0.75);
  tailMid.rotation.x = 0.13 * Math.sin(t * 2.1 - 0.4);

  // --- camera ---
  const az = cam.az + (SIL ? 0 : 0.10 * Math.sin(t * 0.07));
  const el = cam.el + (SIL ? 0 : 0.015 * Math.sin(t * 0.11));
  const ce = Math.cos(el), se = Math.sin(el);
  camera.position.set(
    camTarget.x + cam.dist * ce * Math.sin(az),
    camTarget.y + cam.dist * se,
    camTarget.z + cam.dist * ce * Math.cos(az)
  );
  camera.lookAt(camTarget);

  // --- world scroll: ground texture + recycling props ---
  groundTex.offset.y = -scroll / TILE_WORLD;
  for (const p of props) {
    p.obj.position.z = wrap(p.z - scroll + SCENE_LEN / 2, SCENE_LEN) - SCENE_LEN / 2;
    // cull anything that wanders right up to the camera (would fill the frame)
    if (!SIL) {
      const dx = p.obj.position.x - camera.position.x;
      const dy = p.obj.position.y - camera.position.y;
      const dz = p.obj.position.z - camera.position.z;
      p.obj.visible = (dx * dx + dy * dy + dz * dz) > 12.25;
    }
  }

  renderer.render(scene, camera);
  diag(`t=${t.toFixed(1)} legs=${legs.length} props=${props.length} gait=${gaitName} ik=${IK_OK} meshes=${MESH_COUNT} box=${BBOX}`);
  if (hudVisible && ++hudTick % 20 === 0) {
    const el2 = document.getElementById('gaitstat');
    if (el2) el2.textContent = `${gaitName.toUpperCase()} · ${CFG.speed.toFixed(2)} u/s`;
  }
}
// Debug silhouette mode: flat white animal on black, locked camera.
if (SIL) {
  scene.background = new T.Color(0x05070a);
  scene.fog = null;
  sky.visible = false; sun.visible = false; ground.visible = false;
  for (const p of props) p.obj.visible = false;
  const flat = new T.MeshBasicMaterial({ color: 0xffffff });
  giraffe.traverse((o) => { if (o.isMesh) { o.material = flat; o.castShadow = false; o.receiveShadow = false; } });
  sunLight.castShadow = false;
  cam.az = SIL === '3q' ? 0.62 : Math.PI / 2;
  cam.el = 0.03; cam.dist = 12.6; camTarget.y = 2.7;
}
if (QS.has('d')) cam.dist = parseFloat(QS.get('d'));
if (QS.has('az')) cam.az = parseFloat(QS.get('az'));
if (QS.has('el')) cam.el = parseFloat(QS.get('el'));
if (QS.has('ty')) camTarget.y = parseFloat(QS.get('ty'));
if (FREEZE_T !== null && !isNaN(FREEZE_T)) { t = FREEZE_T; paused = true; }
if (SIL || QS.get('ui') === '0') {
  if (panel) panel.style.display = 'none';
  if (hud) hud.style.display = 'none';
}
// --- one-time assembly / math self-test ---
let IK_OK = true, MESH_COUNT = 0;
giraffe.traverse((o) => { if (o.isMesh) MESH_COUNT++; });
for (const leg of legs) for (let k = 0; k <= 48; k++) {
  const ft = footTarget(k / 48, leg.stanceY, 0);
  solveLeg(leg, ft.z, ft.y);
  const ok = [leg.upperPivot.rotation.x, leg.kneePivot.rotation.x, leg.anklePivot.rotation.x].every(Number.isFinite);
  if (!ok) IK_OK = false;
}
const _box = new T.Box3().setFromObject(giraffe);
const BBOX = `[${_box.min.x.toFixed(1)},${_box.min.y.toFixed(1)},${_box.min.z.toFixed(1)}]..[${_box.max.x.toFixed(1)},${_box.max.y.toFixed(1)},${_box.max.z.toFixed(1)}]`;
diag('init');
requestAnimationFrame(frame);

