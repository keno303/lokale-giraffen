/* ============================================================================
   GIRAFFE — a realistic, walking giraffe in Three.js
   - Fully procedural (no textures, models or build step; works from file://)
   - Articulated body: torso loft, S-curved neck, detailed head, 4 jointed
     legs (shoulder/hip, knee or hock, fetlock), segmented tail with tuft.
   - Diagonal-couplet walk gait with body bob/roll, head stabilization,
     tail wave, ear flicks, blinking, breathing; speed-blended into trot.
   - Savanna environment: tiled procedural ground, acacia trees, rocks,
     shrubs, instanced grass that scrolls past, hills, clouds, sky dome.
   ==========================================================================*/
(function () {
'use strict';

if (!window.THREE) {
  document.body.innerHTML = '<p style="color:#fff;font:16px sans-serif;padding:20px">Missing lib/three.min.js — keep the whole folder together.</p>';
  return;
}

// ---------------------------------------------------------------- utilities
const TAU = Math.PI * 2;
let _seed = 987654321;
function rnd()  { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; }
function rr(a, b) { return a + rnd() * (b - a); }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function v3(x, y, z) { return new THREE.Vector3(x, y, z); }

// ---------------------------------------------------------------- renderer
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.body.innerHTML = '<p style="color:#fff;font:16px sans-serif;padding:20px">WebGL not available in this browser.</p>';
  return;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd6c49a, 65, 330);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 900);

// ---------------------------------------------------------------- lighting
const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x8a6f47, 0.62);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffe2b0, 1.35);
sun.position.set(16, 26, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;   sun.shadow.camera.bottom = -14;
sun.shadow.camera.near = 4;   sun.shadow.camera.far = 70;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.02;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x9db8d8, 0.30);
fill.position.set(-12, 10, -14);
scene.add(fill);

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, repeatX, repeatY) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  if (repeatX) t.repeat.set(repeatX, repeatY || 1);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

// Tileable spot pattern: every spot is drawn 9 times (wrap-around copies).
function drawSpots(g, S, opts) {
  const ox9 = [[-S,0],[0,0],[S,0],[-S,-S],[0,-S],[S,-S],[-S,S],[0,S],[S,S]];
  for (let i = 0; i < opts.count; i++) {
    const cx = rnd() * S, cy = rnd() * S;
    const R = rr(opts.r0, opts.r1);
    const lobes = 8 + (rnd() * 6 | 0);
    const wob = [];
    for (let k = 0; k < lobes; k++) wob.push(R * rr(opts.wob0, opts.wob1));
    for (const [ox, oy] of ox9) {
      const x = cx + ox, y = cy + oy;
      g.beginPath();
      for (let k = 0; k < lobes; k++) {
        const a = k / lobes * TAU + rr(-0.12, 0.12);
        const rad = wob[k];
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad * rr(0.9, 1.25);
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      const grad = g.createRadialGradient(x, y, R * 0.15, x, y, R * 1.3);
      grad.addColorStop(0, opts.inner);
      grad.addColorStop(1, opts.outer);
      g.fillStyle = grad;
      g.fill();
      g.lineWidth = rr(opts.ew0, opts.ew1);
      g.strokeStyle = opts.edge;
      g.globalAlpha = 0.85;
      g.stroke();
      g.globalAlpha = 1;
    }
  }
}

function drawMottle(g, S, colors, n, r0, r1, a0, a1) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * S, y = rnd() * S, r = rr(r0, r1);
    g.globalAlpha = rr(a0, a1);
    g.fillStyle = colors[(rnd() * colors.length) | 0];
    g.beginPath();
    g.ellipse(x, y, r, r * rr(0.4, 1), rnd() * TAU, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
}

// Adult giraffe coat — reticulated-style brown patches with cream seams,
// on a warm tan base. Patches are drawn aligned (cream halo under brown core)
// so the pale seams read as borders, exactly like a real reticulated coat.
const coatCanvas = document.createElement('canvas');
coatCanvas.width = coatCanvas.height = 1024;
(function (c) {
  const g = c.getContext('2d'), S = 1024;
  const ox9 = [[-S, 0], [0, 0], [S, 0], [-S, -S], [0, -S], [S, -S], [-S, S], [0, S], [S, S]];
  g.fillStyle = '#c1853d';
  g.fillRect(0, 0, S, S);
  drawMottle(g, S, ['#cd9449', '#b0762f', '#c78e43'], 2800, 5, 18, 0.06, 0.12);
  function patch(cx, cy, lobes, angs, wob, mult, fill, edge, ew) {
    for (const [ox, oy] of ox9) {
      const x = cx + ox, y = cy + oy;
      g.beginPath();
      for (let k = 0; k < lobes; k++) {
        const rad = wob[k] * mult;
        const px = x + Math.cos(angs[k]) * rad, py = y + Math.sin(angs[k]) * rad * 1.15;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      g.lineWidth = ew;
      g.strokeStyle = edge;
      g.globalAlpha = 0.8;
      g.stroke();
      g.globalAlpha = 1;
    }
  }
  for (let i = 0; i < 92; i++) {
    const cx = rnd() * S, cy = rnd() * S, R = rr(44, 96);
    const lobes = 8 + (rnd() * 5 | 0);
    const angs = [], wob = [];
    for (let k = 0; k < lobes; k++) {
      angs.push(k / lobes * TAU + rr(-0.14, 0.14));
      wob.push(R * rr(0.78, 1.22));
    }
    patch(cx, cy, lobes, angs, wob, 1.26, '#e9d5a6', '#dfc793', 5);   // cream seam
    const grad = g.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.4);
    grad.addColorStop(0, '#7c4a1f');
    grad.addColorStop(1, '#5c3314');
    patch(cx, cy, lobes, angs, wob, 1.0, grad, '#4a2810', 3);
  }
  drawSpots(g, S, { count: 34, r0: 15, r1: 32, wob0: 0.75, wob1: 1.15,
    inner: '#7c4a1f', outer: '#5c3314', edge: '#4a2810', ew0: 2, ew1: 3.5 });
})(coatCanvas);
function coatTexture(rx, ry) {
  const t = new THREE.CanvasTexture(coatCanvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

// Leg coat: paler than the torso, fewer and smaller spots, fading out
// on the lower leg (canvas bottom = leg bottom).
const legCanvas = document.createElement('canvas');
legCanvas.width = legCanvas.height = 1024;
(function (c) {
  const g = c.getContext('2d'), S = 1024;
  g.fillStyle = '#cf9f60';
  g.fillRect(0, 0, S, S);
  drawMottle(g, S, ['#dab27c', '#bd9050'], 1700, 5, 16, 0.05, 0.10);
  drawSpots(g, S, { count: 38, r0: 17, r1: 42, wob0: 0.7, wob1: 1.2,
    inner: '#8a5a28', outer: '#6d441f', edge: '#583315', ew0: 2, ew1: 4 });
  const gr = g.createLinearGradient(0, S * 0.52, 0, S * 0.98);
  gr.addColorStop(0, 'rgba(207,159,96,0)');
  gr.addColorStop(1, 'rgba(207,159,96,1)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
})(legCanvas);
const legTexture = new THREE.CanvasTexture(legCanvas);
legTexture.wrapS = legTexture.wrapT = THREE.RepeatWrapping;
legTexture.repeat.set(1.6, 1.6);
legTexture.encoding = THREE.sRGBEncoding;

// Savanna ground (tile ≈ 32 m)
const GROUND_TILE = 32;
const groundTexture = canvasTex(1024, 1024, function (g, S) {
  g.fillStyle = '#ad8f5e';
  g.fillRect(0, 0, S, S);
  // large soft savanna patches (tileable wrap-draw)
  const ox9 = [[-S, 0], [0, 0], [S, 0], [-S, -S], [0, -S], [S, -S], [-S, S], [0, S], [S, S]];
  const patchCols = ['rgba(108,106,62,0.16)', 'rgba(206,182,126,0.15)', 'rgba(138,106,66,0.13)', 'rgba(94,96,54,0.12)'];
  for (let i = 0; i < 14; i++) {
    const cx = rnd() * S, cy = rnd() * S, R = rr(130, 340);
    const col = patchCols[(rnd() * patchCols.length) | 0];
    for (const [ox, oy] of ox9) {
      const grd = g.createRadialGradient(cx + ox, cy + oy, R * 0.1, cx + ox, cy + oy, R);
      grd.addColorStop(0, col);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(cx + ox - R, cy + oy - R, R * 2, R * 2);
    }
  }
  drawMottle(g, S, ['#b89a68', '#9c7f50', '#c2a675', '#a3854f', '#8f744a'], 3400, 6, 26, 0.06, 0.12);
  // dry grass strokes
  g.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * S, y = rnd() * S, a = rr(-0.6, 0.6), l = rr(4, 13);
    g.strokeStyle = rnd() < 0.5 ? 'rgba(190,170,105,0.5)' : 'rgba(150,128,74,0.5)';
    g.lineWidth = rr(1, 2.4);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // pebbles
  for (let i = 0; i < 300; i++) {
    const x = rnd() * S, y = rnd() * S, r = rr(1.5, 5);
    g.fillStyle = 'rgba(120,108,88,0.5)';
    g.beginPath(); g.ellipse(x, y, r, r * 0.7, rnd() * TAU, 0, TAU); g.fill();
  }
}, 900 / GROUND_TILE, 900 / GROUND_TILE);
groundTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

// Grass blade sprite (alpha)
const grassTexture = canvasTex(128, 128, function (g, S) {
  g.clearRect(0, 0, S, S);
  g.lineCap = 'round';
  for (let i = 0; i < 22; i++) {
    const bx = 8 + rnd() * (S - 16);
    const h = S * rr(0.45, 0.95);
    const lean = rr(-S * 0.18, S * 0.18);
    const grd = g.createLinearGradient(bx, S, bx + lean, S - h);
    grd.addColorStop(0, 'rgba(106,110,52,0.95)');
    grd.addColorStop(0.6, 'rgba(158,150,78,0.9)');
    grd.addColorStop(1, 'rgba(206,190,120,0.85)');
    g.strokeStyle = grd;
    g.lineWidth = rr(2.5, 5);
    g.beginPath();
    g.moveTo(bx, S);
    g.quadraticCurveTo(bx + lean * 0.2, S - h * 0.6, bx + lean, S - h);
    g.stroke();
  }
});
grassTexture.wrapS = grassTexture.wrapT = THREE.ClampToEdgeWrapping;

// Sky dome. Measured on the rendered result: with the default flipY the
// canvas TOP maps to the zenith (v=0) and the canvas BOTTOM to the nadir.
// Deep blue at the zenith, warm fog-matched haze at the horizon/nadir.
const skyTexture = canvasTex(64, 1024, function (g, w, h) {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0.0, '#14508f');
  gr.addColorStop(0.28, '#3d84c2');
  gr.addColorStop(0.48, '#9dc3dd');
  gr.addColorStop(0.62, '#e9ddbe');
  gr.addColorStop(0.76, '#e2d3ab');
  gr.addColorStop(1.0, '#d3c193');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}, 1, 1);

// ---------------------------------------------------------------- materials
const M = {
  coat:    new THREE.MeshStandardMaterial({ map: coatTexture(1, 1),        roughness: 0.92, metalness: 0 }),
  coatBody: new THREE.MeshStandardMaterial({ map: coatTexture(1, 1),       roughness: 0.92, metalness: 0, vertexColors: true }),
  coatNk:  new THREE.MeshStandardMaterial({ map: coatTexture(1.25, 0.62),  roughness: 0.92, metalness: 0 }),
  coatHd:  new THREE.MeshStandardMaterial({ map: coatTexture(0.16, 0.16),  roughness: 0.90, metalness: 0 }),
  leg:     new THREE.MeshStandardMaterial({ map: legTexture,               roughness: 0.92, metalness: 0 }),
  muzzle:  new THREE.MeshStandardMaterial({ color: 0xdcc194, roughness: 0.9 }),
  dark:    new THREE.MeshStandardMaterial({ color: 0x3c2c1d, roughness: 0.85 }),
  mane:    new THREE.MeshStandardMaterial({ color: 0x45301e, roughness: 0.95 }),
  hoof:    new THREE.MeshStandardMaterial({ color: 0x35291f, roughness: 0.6, metalness: 0.05 }),
  eye:     new THREE.MeshStandardMaterial({ color: 0x14100b, roughness: 0.25, metalness: 0.1 }),
  eyeHi:   new THREE.MeshBasicMaterial({ color: 0xfff6e0 }),
  trunk:   new THREE.MeshStandardMaterial({ color: 0x5d4028, roughness: 1 }),
  canopy:  new THREE.MeshStandardMaterial({ color: 0x3f4e2a, roughness: 1 }),
  canopy2: new THREE.MeshStandardMaterial({ color: 0x51623a, roughness: 1 }),
  rock:    new THREE.MeshStandardMaterial({ color: 0x756d60, roughness: 1, flatShading: true }),
  shrub:   new THREE.MeshStandardMaterial({ color: 0x77773f, roughness: 1, flatShading: true }),
  hill:    new THREE.MeshStandardMaterial({ color: 0x9a8356, roughness: 1 }),
  cloud:   new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 1 }),
};

// ---------------------------------------------------------------- loft
// Loft a closed tube along a Catmull-Rom path; per-point radius + squash.
function loftGeometry(ctrl, segs, radial) {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(p => v3(p.x, p.y, p.z || 0)), false, 'catmullrom', 0.5);
  const N = segs || 40, R = radial || 18;
  const pts = curve.getPoints(N);
  const nC = ctrl.length;
  const val = i => {
    const u = i / N * (nC - 1);
    const k = Math.min(nC - 2, Math.floor(u));
    const f = clamp(u - k, 0, 1);
    const a = ctrl[k], b = ctrl[k + 1];
    return {
      r:  lerp(a.r, b.r, f),
      sx: lerp(a.sx || 1, b.sx || 1, f),
      sy: lerp(a.sy || 1, b.sy || 1, f)
    };
  };
  const frames = [];
  for (let i = 0; i <= N; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(N, i + 1)];
    const T = v3(0, 0, 0).subVectors(p1, p0).normalize();
    let U = v3(0, 1, 0);
    if (Math.abs(T.dot(U)) > 0.9) U = v3(0, 0, 1);
    const Nv = v3(0, 0, 0).crossVectors(T, U).normalize();
    const B = v3(0, 0, 0).crossVectors(Nv, T).normalize();
    frames.push({ T, N: Nv, B });
  }
  // untwist: align each frame with its predecessor in the normal plane
  for (let i = 1; i <= N; i++) {
    const f = frames[i], g = frames[i - 1];
    const gN = g.N.clone().addScaledVector(f.T, -g.N.dot(f.T)).normalize();
    const gB = g.B.clone().addScaledVector(f.T, -g.B.dot(f.T)).normalize();
    const ang = Math.atan2(gN.dot(f.B), gN.dot(f.N));
    const c = Math.cos(ang), s = Math.sin(ang);
    const nN = f.N.clone().multiplyScalar(c).addScaledVector(f.B, s).normalize();
    const nB = f.B.clone().multiplyScalar(c).addScaledVector(f.N, -s).normalize();
    f.N.copy(nN); f.B.copy(nB);
  }
  const pos = [], nrm = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const f = frames[i], v = val(i), P = pts[i];
    for (let j = 0; j <= R; j++) {
      const a = j / R * TAU;
      const ca = Math.cos(a) * v.sx, sa = Math.sin(a) * v.sy;
      const dir = f.N.clone().multiplyScalar(ca).addScaledVector(f.B, sa).normalize();
      pos.push(P.x + dir.x * v.r, P.y + dir.y * v.r, P.z + dir.z * v.r);
      nrm.push(dir.x, dir.y, dir.z);
      uv.push(i / N, j / R);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < R; j++) {
      const a = i * (R + 1) + j, b = a + R + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals(); // smooth normals (overwrites, but more robust)
  return geo;
}

function tube(r1, r2, len, mat) {
  const g = new THREE.CylinderGeometry(r1, r2, len, 14, 1, true);
  g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}
function ball(r, mat) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), mat);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------- giraffe
// Dimensions in metres; the giraffe faces +X, ground at y = 0.
const TORSO = [
  { x: -1.34, y: 3.36, r: 0.05, sx: 1.0, sy: 1.0 },
  { x: -1.27, y: 3.47, r: 0.30, sx: 1.0, sy: 0.98 },
  { x: -1.04, y: 3.53, r: 0.46, sx: 1.0, sy: 0.96 },
  { x: -0.62, y: 3.49, r: 0.53, sx: 1.0, sy: 0.99 },
  { x: -0.15, y: 3.51, r: 0.56, sx: 1.0, sy: 1.00 },
  { x:  0.35, y: 3.58, r: 0.57, sx: 1.0, sy: 1.02 },
  { x:  0.85, y: 3.76, r: 0.58, sx: 1.0, sy: 1.04 },
  { x:  1.20, y: 3.96, r: 0.48, sx: 1.0, sy: 1.02 },
  { x:  1.40, y: 4.10, r: 0.27, sx: 1.0, sy: 1.00 },
  { x:  1.48, y: 4.14, r: 0.05, sx: 1.0, sy: 1.00 },
];
const NECK = [
  { x: 0.00, y: 0.05, r: 0.26 },
  { x: 0.22, y: 0.62, r: 0.225 },
  { x: 0.50, y: 1.28, r: 0.195 },
  { x: 0.78, y: 1.95, r: 0.170 },
  { x: 0.98, y: 2.52, r: 0.150 },
  { x: 1.08, y: 2.86, r: 0.135 },
];
const NECK_PIVOT = v3(1.08, 4.02, 0);   // top-front of the chest (body space)
const HEAD_PIVOT = v3(1.08, 2.86, 0);   // neck local

function buildLeg(isFront, side) {
  // side: +1 = left (+Z), -1 = right
  const hip = new THREE.Group();
  const upLen = isFront ? 1.34 : 1.24;
  const loLen = isFront ? 1.38 : 1.34;

  const upper = tube(isFront ? 0.165 : 0.175, 0.10, upLen, M.leg);
  hip.add(upper);
  const hipBall = ball(0.16, M.leg);
  hip.add(hipBall);
  if (isFront) {
    const delto = ball(0.20, M.leg);
    delto.position.set(0.09, -0.15, 0);
    delto.scale.set(1.05, 1.15, 0.92);
    hip.add(delto);
  } else {
    const thigh = ball(0.21, M.leg);
    thigh.position.set(-0.08, -0.22, 0);
    thigh.scale.set(1.18, 1.08, 0.98);
    hip.add(thigh);
  }

  const knee = new THREE.Group();
  knee.position.y = -upLen;
  knee.position.x = isFront ? 0.05 : -0.06;     // carpus forward / stifle back
  hip.add(knee);
  knee.add(ball(isFront ? 0.10 : 0.095, M.leg));

  const lower = tube(isFront ? 0.094 : 0.10, 0.06, loLen, M.leg);
  lower.position.x = isFront ? -0.01 : 0.11;    // hock protrudes forward
  knee.add(lower);

  const fet = new THREE.Group();
  fet.position.y = -loLen;
  knee.add(fet);
  fet.add(ball(0.07, M.leg));

  const pastern = tube(0.06, 0.052, 0.08, M.leg);
  fet.add(pastern);
  const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.185), M.hoof);
  hoof.position.y = -0.145;
  hoof.castShadow = true;
  fet.add(hoof);
  const toe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.17), M.hoof);
  toe.position.set(0.055, -0.115, 0);
  toe.castShadow = true;
  fet.add(toe);

  // resting A-stance
  hip.rotation.x = -side * (isFront ? 0.045 : 0.065);
  hip.rotation.z = side * (isFront ? 0.012 : -0.012);
  knee.rotation.z = isFront ? 0.05 : -0.07;

  return { root: hip, knee, isFront, side, upLen, loLen };
}

function buildTail() {
  const root = new THREE.Group();
  root.position.set(-1.42, 3.94, 0);
  root.rotation.z = -0.30;
  const segs = [];
  let parent = root, y = 0;
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    g.position.y = y;                     // chain: attach at previous segment's end
    parent.add(g);
    const len = 0.36 - i * 0.035;
    y -= len;
    g.add(tube(0.052 - i * 0.007, 0.044 - i * 0.006, len, M.coat));
    parent = g;
    segs.push(g);
  }
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), M.mane);
  tuft.scale.set(0.8, 1.7, 0.8);
  tuft.position.y = -0.16;
  tuft.castShadow = true;
  parent.add(tuft);
  return { root, segs };
}

function buildGiraffe() {
  const root = new THREE.Group();

  // body group (bob, roll, pitch, breathing) — legs stay in root space
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const torsoGeo = loftGeometry(TORSO, 56, 24);
  // subtle shading: lighten the belly, darken the back slightly
  {
    const p = torsoGeo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const belly = clamp((3.30 - y) / 0.55, 0, 1);   // below midline -> 1
      const back = clamp((y - 3.95) / 0.45, 0, 1);     // above midline -> 1
      col[i * 3]     = 1 + 0.16 * belly - 0.06 * back;
      col[i * 3 + 1] = 1 + 0.12 * belly - 0.07 * back;
      col[i * 3 + 2] = 1 + 0.05 * belly - 0.10 * back;
    }
    torsoGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const torso = new THREE.Mesh(torsoGeo, M.coatBody);
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyGroup.add(torso);

  // neck
  const neck = new THREE.Group();
  neck.position.copy(NECK_PIVOT);
  bodyGroup.add(neck);
  const neckMesh = new THREE.Mesh(loftGeometry(NECK, 40, 18), M.coatNk);
  neckMesh.castShadow = true;
  neck.add(neckMesh);

  // dorsal mane along the neck
  const manePts = [];
  for (let i = 0; i < NECK.length; i++) {
    const o = NECK[Math.max(0, i - 1)], q = NECK[Math.min(NECK.length - 1, i + 1)], p = NECK[i];
    const tx = q.x - o.x, ty = q.y - o.y, L = Math.hypot(tx, ty) || 1;
    const dx = -ty / L, dy = tx / L;                 // dorsal side
    manePts.push({ x: p.x + dx * (p.r + 0.025), y: p.y + dy * (p.r + 0.025), r: Math.max(0.024, p.r * 0.20) });
  }
  const mane = new THREE.Mesh(loftGeometry(manePts, 32, 10), M.mane);
  mane.castShadow = true;
  neck.add(mane);

  // head
  const head = new THREE.Group();
  head.position.copy(HEAD_PIVOT);
  neck.add(head);

  const skull = ball(0.155, M.coatHd);
  skull.position.set(0.13, 0.09, 0);
  skull.scale.set(1.35, 1.05, 0.95);
  head.add(skull);

  const muzzle = ball(0.125, M.muzzle);
  muzzle.position.set(0.42, -0.03, 0);
  muzzle.scale.set(1.65, 0.92, 0.85);
  head.add(muzzle);

  // the characteristic "dip" between forehead and muzzle
  const dip = ball(0.075, M.dark);
  dip.position.set(0.30, 0.075, 0);
  dip.scale.set(1.5, 0.42, 0.62);
  head.add(dip);

  const jaw = ball(0.09, M.muzzle);
  jaw.position.set(0.36, -0.13, 0);
  jaw.scale.set(1.3, 0.7, 0.7);
  head.add(jaw);

  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.016, 0.075), M.dark);
  lip.position.set(0.50, -0.115, 0);
  head.add(lip);

  for (const s of [-1, 1]) {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.021, 8, 6), M.dark);
    n.position.set(0.585, 0.055, s * 0.047);
    n.scale.set(0.8, 1.35, 1);
    head.add(n);
  }

  // eyes (+ highlight) with blink groups
  const eyes = [];
  for (const s of [-1, 1]) {
    const eg = new THREE.Group();
    eg.position.set(0.115, 0.125, s * 0.142);
    const e = ball(0.034, M.eye);
    eg.add(e);
    const hi = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), M.eyeHi);
    hi.position.set(0.014, 0.014, s * 0.02);
    eg.add(hi);
    head.add(eg);
    eyes.push(eg);
  }

  // ossicones
  for (const s of [-1, 1]) {
    const og = new THREE.Group();
    og.position.set(0.045, 0.20, s * 0.075);
    og.rotation.z = -0.12;
    og.rotation.x = s * 0.16;
    const st = tube(0.024, 0.028, 0.17, M.coatHd);
    og.add(st);
    const knob = ball(0.047, M.dark);
    knob.position.y = 0.16;
    og.add(knob);
    head.add(og);
  }

  // ears (pivot at base, for flicks)
  const ears = [];
  for (const s of [-1, 1]) {
    const eg = new THREE.Group();
    eg.position.set(-0.03, 0.16, s * 0.15);
    const e = ball(0.10, M.coatHd);
    e.position.set(-0.03, 0.02, s * 0.045);
    e.scale.set(1.45, 0.95, 0.34);
    eg.add(e);
    const e2 = ball(0.075, M.dark);
    e2.position.set(-0.045, 0.015, s * 0.075);
    e2.scale.set(1.2, 0.9, 0.3);
    eg.add(e2);
    eg.rotation.y = -s * 0.55;
    eg.rotation.z = s * 0.18;
    head.add(eg);
    ears.push(eg);
  }

  // head crest (connects to neck mane)
  const crest = new THREE.Mesh(loftGeometry([
    { x: -0.16, y: 0.20, r: 0.030 },
    { x: 0.02, y: 0.265, r: 0.034 },
    { x: 0.16, y: 0.245, r: 0.028 },
  ], 12, 8), M.mane);
  crest.castShadow = true;
  head.add(crest);

  // legs
  const legs = {
    FL: buildLeg(true,  1),  FR: buildLeg(true,  -1),
    HL: buildLeg(false, 1),  HR: buildLeg(false, -1),
  };
  legs.FL.root.position.set(0.92, 2.92, 0.30);
  legs.FR.root.position.set(0.92, 2.92, -0.30);
  legs.HL.root.position.set(-0.95, 2.90, 0.29);
  legs.HR.root.position.set(-0.95, 2.90, -0.29);
  for (const k in legs) root.add(legs[k].root);

  const tail = buildTail();
  tail.root.position.set(-1.42, 3.94, 0);
  bodyGroup.add(tail.root);

  return { root, bodyGroup, neck, head, legs, tail, eyes, ears };
}

// ---------------------------------------------------------------- savanna
function buildSky() {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(420, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, fog: false })
  );
  scene.add(dome);
  if (new URLSearchParams(location.search).has('nosky')) dome.visible = false;
  // sun disc glow
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(10, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff2cf, fog: false })
  );
  glow.position.set(300, 330, 120);
  scene.add(glow);
}

function buildClouds() {
  const grp = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Group();
    const n = 3 + (rnd() * 3 | 0);
    for (let k = 0; k < n; k++) {
      const p = ball(rr(6, 13), M.cloud);
      p.castShadow = false;
      p.position.set(rr(-14, 14), rr(-2, 3), rr(-6, 6));
      p.scale.y = 0.42;
      c.add(p);
    }
    c.position.set(rr(-260, 260), rr(70, 120), rr(-220, 220));
    grp.add(c);
  }
  scene.add(grp);
  return grp;
}

function buildHills() {
  const grp = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), M.hill);
    const s = rr(40, 90);
    h.scale.set(s * rr(1.6, 2.6), s * rr(0.16, 0.3), s);
    const a = rr(0, TAU), d = rr(230, 330);
    h.position.set(Math.cos(a) * d, -s * 0.05, Math.sin(a) * d);
    grp.add(h);
  }
  scene.add(grp);
}

function makeAcacia() {
  const g = new THREE.Group();
  const trunk = tube(0.30, 0.16, 3.8, M.trunk);
  trunk.position.y = 1.9;
  trunk.rotation.z = rr(-0.05, 0.05);
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const b = tube(0.15, 0.06, 2.1, M.trunk);
    const a = rr(0, TAU);
    b.position.set(Math.cos(a) * 0.25, 3.4, Math.sin(a) * 0.25);
    b.rotation.z = rr(0.35, 0.75) * (i === 1 ? -1 : 1);
    b.rotation.y = a;
    b.rotation.x = rr(-0.2, 0.2);
    g.add(b);
  }
  // flat-topped, lumpy canopy (acacia umbrella)
  const disc = new THREE.Mesh(new THREE.SphereGeometry(2.9, 14, 10), M.canopy);
  disc.position.y = 4.5;
  disc.scale.set(1, 0.28, 1);
  disc.castShadow = true;
  g.add(disc);
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(rr(1.0, 2.1), 10, 8), i % 2 ? M.canopy : M.canopy2);
    const a = rr(0, TAU);
    p.position.set(Math.cos(a) * rr(0.5, 2.0), 4.45 + rr(0.1, 0.75), Math.sin(a) * rr(0.5, 2.0));
    p.scale.set(rr(0.8, 1.2), 0.30, rr(0.8, 1.2));
    p.castShadow = true;
    g.add(p);
  }
  return g;
}

function makeRock() {
  const g = new THREE.DodecahedronGeometry(rr(0.5, 1.0), 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i,
      p.getX(i) * rr(0.75, 1.25),
      p.getY(i) * rr(0.55, 0.9),
      p.getZ(i) * rr(0.75, 1.25));
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, M.rock);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function makeShrub() {
  const g = new THREE.Group();
  const n = 2 + (rnd() * 2 | 0);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(0.25, 0.55), 0), M.shrub);
    s.position.set(rr(-0.4, 0.4), rr(0.15, 0.35), rr(-0.4, 0.4));
    s.scale.y = 0.7;
    s.castShadow = true;
    g.add(s);
  }
  return g;
}

const SCROLL = 140, HALF = 70;
function wrapX(x) { return ((x % SCROLL) + SCROLL) % SCROLL - HALF; }

function buildGround() {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1, metalness: 0 }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  scene.add(g);
  return g;
}

function buildScatter() {
  const trees = [], rocks = [], shrubs = [];
  for (let i = 0; i < 15; i++) {
    const t = makeAcacia();
    t.position.set(rr(-HALF, HALF), 0, rr(-46, 46));
    const s = rr(0.8, 1.5);
    t.scale.set(s, s * rr(0.9, 1.25), s);
    t.rotation.y = rr(0, TAU);
    scene.add(t);
    trees.push(t);
  }
  for (let i = 0; i < 14; i++) {
    const r = makeRock();
    r.position.set(rr(-HALF, HALF), rr(0, 0.1), rr(-42, 42));
    r.rotation.y = rr(0, TAU);
    scene.add(r);
    rocks.push(r);
  }
  for (let i = 0; i < 22; i++) {
    const s = makeShrub();
    s.position.set(rr(-HALF, HALF), 0, rr(-40, 40));
    s.rotation.y = rr(0, TAU);
    scene.add(s);
    shrubs.push(s);
  }

  // instanced grass
  const geo = new THREE.BufferGeometry();
  const w = 0.5, h = 0.62;
  const P = [
    -w, 0, 0,   w, 0, 0,   w, h, 0,  -w, h, 0,
     0, 0, -w,   0, 0, w,   0, h, w,   0, h, -w,
  ];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 1, 1, 0, 1,  0, 0, 1, 0, 1, 1, 0, 1
  ], 2));
  geo.setIndex([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7]);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({
    map: grassTexture, alphaTest: 0.35, side: THREE.DoubleSide,
    transparent: true, depthWrite: true,
  });
  const COUNT = 750;
  const grass = new THREE.InstancedMesh(geo, mat, COUNT);
  grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  grass.castShadow = false;
  grass.receiveShadow = false;
  const gdata = [];
  for (let i = 0; i < COUNT; i++) {
    let x = 0, z = 0;
    do { x = rr(-HALF, HALF); z = rr(-44, 44); } while (Math.hypot(x, z) < 3.2);
    gdata.push({ x, z, s: rr(0.6, 1.7), ry: rr(0, TAU) });
  }
  scene.add(grass);
  return { trees, rocks, shrubs, grass, gdata };
}

// ---------------------------------------------------------------- scene setup
buildSky();
buildClouds();
buildHills();
const ground = buildGround();
const scatter = buildScatter();
const giraffe = buildGiraffe();
scene.add(giraffe.root);

// a juvenile walking with the herd — slightly faster cadence, small phase offset
const calf = buildGiraffe();
calf.root.scale.setScalar(0.62);
calf.root.position.set(-2.5, 0, -4.1);
calf.root.rotation.y = -0.07;
scene.add(calf.root);

// ---------------------------------------------------------------- camera orbit
const orbit = {
  theta: 0.85, phi: 1.16, dist: 14.0,
  tTheta: 0.85, tPhi: 1.16, tDist: 14.0,
  target: v3(0.5, 3.45, 0),
  dragging: false,
};
function applyCamera() {
  camera.position.set(
    orbit.target.x + orbit.dist * Math.sin(orbit.phi) * Math.sin(orbit.theta),
    orbit.target.y + orbit.dist * Math.cos(orbit.phi),
    orbit.target.z + orbit.dist * Math.sin(orbit.phi) * Math.cos(orbit.theta)
  );
  camera.lookAt(orbit.target);
}
const dom = renderer.domElement;
const pointers = new Map();
let pinchDist = 0;
dom.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  orbit.dragging = true;
  dom.setPointerCapture(e.pointerId);
});
dom.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  const p = pointers.get(e.pointerId);
  if (pointers.size === 1) {
    orbit.tTheta -= (e.clientX - p.x) * 0.0052;
    orbit.tPhi = clamp(orbit.tPhi - (e.clientY - p.y) * 0.0042, 0.18, 1.52);
  }
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2) {
    const pts = [...pointers.values()];
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (pinchDist) orbit.tDist = clamp(orbit.tDist * pinchDist / d, 4, 34);
    pinchDist = d;
  }
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (!pointers.size) { orbit.dragging = false; pinchDist = 0; }
}
dom.addEventListener('pointerup', endPointer);
dom.addEventListener('pointercancel', endPointer);
dom.addEventListener('wheel', e => {
  e.preventDefault();
  orbit.tDist = clamp(orbit.tDist * Math.exp(e.deltaY * 0.0011), 4, 34);
}, { passive: false });
dom.addEventListener('dblclick', () => {
  orbit.tTheta = 0.85; orbit.tPhi = 1.16; orbit.tDist = 14.0;
});

// ---------------------------------------------------------------- UI
const speedSlider = document.getElementById('speed');
const speedVal = document.getElementById('speedVal');
const stat = document.getElementById('stat');
const bStand = document.getElementById('bStand');
const bWalk = document.getElementById('bWalk');
const bTrot = document.getElementById('bTrot');
const orbitChk = document.getElementById('orbit');
const btns = [bStand, bWalk, bTrot];
const PRESET = { stand: 0, walk: 1.6, trot: 3.35 };

let speedTarget = 1.6;
function sliderToSpeed(v) { return Math.pow(v / 100, 1.45) * 3.9; }
function speedToSlider(s) { return Math.round(Math.pow(s / 3.9, 1 / 1.45) * 100); }
function setActive(name) {
  btns.forEach(b => b.classList.remove('active'));
  ({ stand: bStand, walk: bWalk, trot: bTrot })[name].classList.add('active');
}
speedSlider.addEventListener('input', () => {
  speedTarget = sliderToSpeed(+speedSlider.value);
  setActive(speedTarget < 0.15 ? 'stand' : (speedTarget < 2.3 ? 'walk' : 'trot'));
});
function preset(name) {
  speedTarget = PRESET[name];
  speedSlider.value = speedToSlider(speedTarget);
  setActive(name);
}
bStand.addEventListener('click', () => preset('stand'));
bWalk.addEventListener('click', () => preset('walk'));
bTrot.addEventListener('click', () => preset('trot'));

// ---------------------------------------------------------------- gait
// Diagonal couplet: FL+HR in phase, FR+HL anti-phase.
const state = { speed: 1.6, phase: 0, scroll: 0 };
const LEG_CFG = [
  ['FL', 0.0, 1.00, 1.00],
  ['FR', Math.PI, 1.00, 1.00],
  ['HL', Math.PI, 0.82, 1.18],
  ['HR', 0.0, 0.82, 1.18],
];

function blinkAt(t) {
  const k = Math.floor(t / 4.2);
  const f = t % 4.2;
  const start = (Math.abs(Math.sin(k * 127.1) * 43758.5453) % 1) * 3.7;
  if (f > start && f < start + 0.14) return Math.sin(Math.PI * (f - start) / 0.14);
  return 0;
}

function updateGait(G, t, dt, phaseAdd, freqMul) {
  const s = state.speed;
  const sn = clamp(s / 3.5, 0, 1);
  const w = smoothstep(0.04, 0.7, s);            // standing -> walking blend
  if (s > 0.04 && dt > 0) state.phase += TAU * (0.34 + 0.40 * s) * dt;
  const ph = state.phase * (freqMul || 1) + (phaseAdd || 0);
  const idle = 1 - w;

  // --- body: bob, roll, pitch, breathing
  const bobAmp = 0.05 + 0.06 * sn;
  G.bodyGroup.position.y = w * bobAmp * (0.5 - 0.5 * Math.cos(2 * ph)) * 2 * 0.5
    - w * bobAmp * 0.5 * (1 + Math.cos(2 * ph)) * 0;
  // lowest when diagonal pair passes vertical (ph = 0, pi/2, ...)
  G.bodyGroup.position.y = -w * bobAmp * 0.5 * (1 + Math.cos(2 * ph));
  G.bodyGroup.position.x = w * 0.03 * Math.sin(2 * ph + Math.PI / 2) * sn;
  G.bodyGroup.rotation.x = w * 0.022 * Math.sin(2 * ph + 0.5)      // roll
    + idle * 0.006 * Math.sin(t * 0.5);
  G.bodyGroup.rotation.z = -w * 0.020 * Math.sin(2 * ph + 1.1)     // pitch
    - 0.028 * sn * w
    + idle * 0.008 * Math.sin(t * 0.43);
  const breath = 1 + 0.007 * Math.sin(t * 1.7) * idle + 0.004 * Math.sin(2 * ph) * w;
  G.bodyGroup.scale.set(1, breath, 1);

  // --- legs
  const hipAmp = (0.21 + 0.27 * sn) * w;
  const kneeAmp = (0.42 + 0.40 * sn) * w;
  for (const [name, phi, hm, km] of LEG_CFG) {
    const L = G.legs[name];
    const p = ph + phi;
    const swing = Math.sin(p);
    const lift = Math.pow(Math.max(0, Math.sin(p + 1.25)), 1.35);
    const restHipX = -L.side * (L.isFront ? 0.045 : 0.065);
    const restHipZ = L.side * (L.isFront ? 0.012 : -0.012);
    const restKnee = L.isFront ? 0.05 : -0.07;
    L.root.rotation.x = lerp(restHipX, restHipX * 0.6, w) + w * 0.05 * Math.sin(p + 1.6);
    L.root.rotation.z = lerp(restHipZ, 0, w) + hipAmp * hm * swing;
    const kneeSign = L.isFront ? 1 : -1;
    L.knee.rotation.z = lerp(restKnee, 0, w) + kneeSign * kneeAmp * km * lift;
    L.knee.rotation.x = w * 0.04 * Math.sin(p + 0.8) * L.side;
  }

  // --- neck & head (stay calm, counter the body)
  // (positive rotation.z raises the neck toward vertical; negative lowers it)
  G.neck.rotation.z = -0.25 * idle - 0.045 * sn * w
    + w * 0.035 * Math.sin(ph + 0.9)
    + idle * 0.03 * Math.sin(t * 0.55);
  G.neck.rotation.x = w * 0.02 * Math.sin(ph * 0.5 + 1.7) + idle * 0.02 * Math.sin(t * 0.35);
  G.head.rotation.z = -0.12 * idle + 0.055 * Math.sin(ph + 2.1) * w
    + idle * 0.05 * Math.sin(t * 0.42 + 1);
  G.head.rotation.y = idle * 0.12 * Math.sin(t * 0.31) + w * 0.05 * Math.sin(ph + 0.6);
  G.head.rotation.x = idle * 0.04 * Math.sin(t * 0.6 + 2) + w * 0.02 * Math.sin(ph + 3.0);

  // --- ears (occasional flick)
  for (let i = 0; i < 2; i++) {
    const e = G.ears[i];
    const base = i ? -0.55 : 0.55;
    const flick = Math.pow(Math.max(0, Math.sin(t * 0.47 + i * 2.4)), 14) * 0.55;
    e.rotation.y = base + 0.10 * Math.sin(t * 1.1 + i * 2) * (0.4 + 0.6 * idle) + flick;
  }

  // --- blink
  const bl = blinkAt(t);
  for (const eg of G.eyes) eg.scale.y = 1 - 0.88 * bl;

  // --- tail: wave travels down it; slow sway when standing
  for (let i = 0; i < G.tail.segs.length; i++) {
    const seg = G.tail.segs[i];
    seg.rotation.z = w * 0.14 * Math.sin(ph - i * 1.05)
      + idle * 0.10 * Math.sin(t * 0.9 + i * 0.85);
    seg.rotation.x = w * 0.05 * Math.sin(ph * 0.7 - i * 0.7)
      + idle * 0.06 * Math.sin(t * 0.7 + i * 0.6);
  }
}

function updateScroll(dt) {
  state.scroll += state.speed * dt;
  const D = state.scroll;
  groundTexture.offset.x = D / GROUND_TILE;
  for (const t of scatter.trees) t.position.x = wrapX(t.position.x - state.speed * dt);
  for (const r of scatter.rocks) r.position.x = wrapX(r.position.x - state.speed * dt);
  for (const s of scatter.shrubs) s.position.x = wrapX(s.position.x - state.speed * dt);
  // grass: recompute from base positions so wrapping stays exact
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(),
        e = new THREE.Euler(), sc = new THREE.Vector3(), pp = new THREE.Vector3();
  for (let i = 0; i < scatter.gdata.length; i++) {
    const gd = scatter.gdata[i];
    e.set(0, gd.ry, 0);
    q.setFromEuler(e);
    sc.setScalar(gd.s);
    pp.set(wrapX(gd.x - D), 0, gd.z);
    m.compose(pp, q, sc);
    scatter.grass.setMatrixAt(i, m);
  }
  scatter.grass.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- debug query params (also handy for screenshots)
const qp = new URLSearchParams(location.search);
if (qp.has('theta')) { orbit.tTheta = orbit.theta = +qp.get('theta'); }
if (qp.has('phi'))   { orbit.tPhi = orbit.phi = clamp(+qp.get('phi'), 0.18, 1.52); }
if (qp.has('dist'))  { orbit.tDist = orbit.dist = clamp(+qp.get('dist'), 4, 34); }
if (qp.has('phase')) state.phase = +qp.get('phase');
if (qp.has('sp')) {
  speedTarget = clamp(+qp.get('sp'), 0, 3.9);
  state.speed = speedTarget;
  speedSlider.value = speedToSlider(speedTarget);
  setActive(speedTarget < 0.15 ? 'stand' : (speedTarget < 2.3 ? 'walk' : 'trot'));
}
if (qp.has('orbit')) orbitChk.checked = qp.get('orbit') === '1';
const frozen = qp.has('freeze');   // deterministic pose for screenshots

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let hudTimer = 0;
let animT = frozen ? 2.0 : 0;      // animation clock (idle wiggles, blinks)

function refreshHud() {
  speedVal.textContent = state.speed.toFixed(1) + ' m/s';
  stat.textContent = state.speed < 0.15 ? 'Standing'
    : state.speed < 2.3 ? 'Walking' : 'Trotting';
}
refreshHud();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // ease speed toward target
  state.speed = lerp(state.speed, speedTarget, 1 - Math.exp(-dt * 2.6));
  if (Math.abs(state.speed - speedTarget) < 0.002) state.speed = speedTarget;

  const adt = frozen ? 0 : dt;
  if (!frozen) animT += dt;
  updateGait(giraffe, animT, adt, 0, 1);
  updateGait(calf, animT + 1.37, adt, 0.7, 1.18);   // +t offset: independent blinks/ears
  if (!frozen) updateScroll(dt);

  // camera
  if (orbitChk.checked && !orbit.dragging) orbit.tTheta += dt * 0.055;
  const k = 1 - Math.exp(-dt * 7);
  orbit.theta += (orbit.tTheta - orbit.theta) * k;
  orbit.phi += (orbit.tPhi - orbit.phi) * k;
  orbit.dist += (orbit.tDist - orbit.dist) * k;
  applyCamera();

  // HUD readout
  hudTimer += dt;
  if (hudTimer > 0.2) {
    hudTimer = 0;
    refreshHud();
  }

  renderer.render(scene, camera);
}
applyCamera();
frame();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

})();
