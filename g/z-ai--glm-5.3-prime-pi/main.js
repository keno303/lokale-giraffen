/* ============================================================
   A realistic, procedurally-built walking giraffe.
   - Everything is generated at runtime: geometry, coat pattern,
     savanna, sky. No assets, no server, no build step.
   - Gait: pacing walk (lateral couplets, like real giraffes &
     camels) with per-leg hoof pinning so feet do not slide.
   ============================================================ */
'use strict';

/* ---------- tiny math helpers ---------- */
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp  = (a, b, t) => a + (b - a) * t;
const fract = (x) => x - Math.floor(x);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand  = (a, b) => a + (b - a) * Math.random();
const TAU = Math.PI * 2;
let lastFrame = 0; // set at loop start

/* ---------- error banner (also catches failed CDN load) ---------- */
function showErr(msg) {
  const el = document.getElementById('err');
  el.style.display = 'block';
  el.textContent = String(msg);
}
window.addEventListener('error', (e) => {
  const d = document.getElementById('err');
  if (d.style.display !== 'block') showErr('Error: ' + (e.message || e.type));
});
(function () {
  if (!/diag/.test(decodeURIComponent(location.hash || ''))) { window.L = () => {}; return; }
  const d = document.createElement('div');
  d.id = 'log';
  d.style.cssText = 'position:fixed;top:80px;left:0;color:#0f0;background:rgba(0,0,0,.8);font:11px Menlo;z-index:98;white-space:pre;padding:4px 8px;';
  document.body.appendChild(d);
  window.L = (s) => { d.textContent += s + '\n'; };
})();
if (typeof THREE === 'undefined') {
  showErr('Three.js failed to load — an internet connection is needed once to fetch it from the CDN.');
  throw new Error('THREE missing');
}

try {
/* ============================================================
   RENDERER / SCENE / CAMERA
   ============================================================ */
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xead5ad, 80, 420);
const envGroup = new THREE.Group();
scene.add(envGroup);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 1500);
camera.position.set(9.5, 4.3, 34.5);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 3.0, 26);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 3.5;
controls.maxDistance = 120;
controls.maxPolarAngle = 1.535;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ============================================================
   PROCEDURAL TEXTURES (canvas)
   ============================================================ */
function canvasTexture(size, draw, opts) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  if (opts && opts.repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
  if (opts && !opts.noSRGB) tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}

/* --- reticulated giraffe coat: cream network, chestnut polygons --- */
function drawCoat(ctx, S, o) {
  o = o || {};
  const bg = o.bg || '#f0e0bc';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  // hide micro-noise
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(120,90,50,0.05)' : 'rgba(255,250,235,0.05)';
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }

  const cols = o.grid || 6;
  const cell = S / cols;
  const palette = ['#8a5a2b', '#96652f', '#7e4f24', '#a06d33', '#8f5d2a'];
  const nBlob = (o.count != null) ? o.count : cols * cols;

  function blob(cx, cy, r) {
    const n = 5 + (Math.random() * 3 | 0);
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + rand(-0.25, 0.25);
      const rr = r * rand(0.62, 1.08);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const p = pts[k], q = pts[(k + 1) % n];
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if (k === 0) ctx.moveTo(mx, my);
      else ctx.quadraticCurveTo(p[0], p[1], mx, my);
      // next handled by following iteration's midpoint
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.lineWidth = Math.max(2, S * 0.004);
  ctx.strokeStyle = 'rgba(70,45,20,0.28)';

  // wrap-safe: draw each blob at 9 offsets
  const offs = [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S], [S, S], [S, -S], [-S, S], [-S, -S]];
  for (let i = 0; i < nBlob; i++) {
    ctx.fillStyle = palette[(Math.random() * palette.length) | 0];
    const gx = (i % cols) * cell + cell / 2 + rand(-0.16, 0.16) * cell;
    const gy = ((i / cols) | 0) * cell + cell / 2 + rand(-0.16, 0.16) * cell;
    const r = cell * (o.rMin || 0.34) + Math.random() * cell * (o.rVar || 0.10);
    for (const off of offs) blob(gx + off[0], gy + off[1], r);
  }
}
const coatTex = canvasTexture(1024, (ctx, S) => drawCoat(ctx, S, {}), { repeat: true });

/* --- savanna ground --- */
const groundTex = canvasTexture(1024, (ctx, S) => {
  ctx.fillStyle = '#c3ab7d';
  ctx.fillRect(0, 0, S, S);
  const pal = ['#7e8f52', '#b5a266', '#b99a6f', '#d6c49a', '#8a9a5e', '#c9b183'];
  const offs = [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S], [S, S], [S, -S], [-S, S], [-S, -S]];
  for (let i = 0; i < 520; i++) {
    ctx.globalAlpha = rand(0.10, 0.30);
    ctx.fillStyle = pal[(Math.random() * pal.length) | 0];
    const x = Math.random() * S, y = Math.random() * S;
    const rx = rand(5, 34), ry = rx * rand(0.4, 1);
    for (const off of offs) {
      ctx.beginPath();
      ctx.ellipse(x + off[0], y + off[1], rx, ry, Math.random() * Math.PI, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(90,70,40,0.16)' : 'rgba(240,230,200,0.16)';
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
}, { repeat: true });
groundTex.repeat.set(34, 34);

/* --- grass blade sprite (alpha-tested) --- */
const grassTex = canvasTexture(128, (ctx, S) => {
  ctx.clearRect(0, 0, S, S);
  for (let i = 0; i < 11; i++) {
    const x0 = rand(12, S - 12);
    const h = rand(S * 0.45, S * 0.95);
    const lean = rand(-14, 14);
    const g = ctx.createLinearGradient(0, S, 0, S - h);
    const c1 = ['#6f7d40', '#7c8a4a', '#5e6c36'][(Math.random() * 3) | 0];
    g.addColorStop(0, c1);
    g.addColorStop(1, '#c2b468');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 - rand(2, 4), S);
    ctx.quadraticCurveTo(x0 + lean * 0.3, S - h * 0.6, x0 + lean, S - h);
    ctx.quadraticCurveTo(x0 + lean * 0.3 + 3, S - h * 0.6, x0 + rand(2, 4), S);
    ctx.closePath();
    ctx.fill();
  }
}, { noSRGB: false });

/* --- sky gradient (sphere map) --- */
const skyTex = canvasTexture(512, (ctx, S) => {
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0.00, '#3f74b4');   // zenith
  g.addColorStop(0.25, '#5e93c4');
  g.addColorStop(0.50, '#93b8d8');
  g.addColorStop(0.60, '#c9d0c2');
  g.addColorStop(0.68, '#eed8b0');   // warm horizon haze
  g.addColorStop(0.78, '#f2d8a4');
  g.addColorStop(1.00, '#e0bf82');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // soft horizontal sun glow
  const rg = ctx.createLinearGradient(0, S * 0.78, 0, S);
  rg.addColorStop(0, 'rgba(255,214,140,0)');
  rg.addColorStop(1, 'rgba(255,214,140,0.5)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, S, S);
}, { noSRGB: true });
skyTex.wrapS = THREE.RepeatWrapping;

/* --- water normal noise --- */
const noiseTex = canvasTexture(256, (ctx, S) => {
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 380; i++) {
    ctx.fillStyle = `rgba(${(Math.random() * 255) | 0}, ${(Math.random() * 255) | 0}, 255, 0.10)`;
    ctx.beginPath();
    ctx.ellipse(Math.random() * S, Math.random() * S, rand(4, 26), rand(2, 8), Math.random() * Math.PI, 0, TAU);
    ctx.fill();
  }
}, { repeat: true });
noiseTex.encoding = THREE.LinearEncoding;

/* --- dust puff sprite --- */
const dustTex = canvasTexture(64, (ctx, S) => {
  const g = ctx.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(210,190,155,0.55)');
  g.addColorStop(0.5, 'rgba(205,185,150,0.22)');
  g.addColorStop(1, 'rgba(200,180,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
});

/* ============================================================
   MATERIALS
   ============================================================ */
function coatMatFor(repeatU, repeatV) {
  const t = coatTex.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatU, repeatV);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.93, metalness: 0 });
}
const coatMat = coatMatFor(1, 1);          // for tubes (UVs already world-scaled)
const hoofMat  = new THREE.MeshStandardMaterial({ color: 0x40301c, roughness: 0.5, metalness: 0.05 });
const maneMat  = new THREE.MeshStandardMaterial({ color: 0x6b4a26, roughness: 0.95 });
const darkMat  = new THREE.MeshStandardMaterial({ color: 0x241a10, roughness: 0.6 });
const eyeMat   = new THREE.MeshStandardMaterial({ color: 0x151009, roughness: 0.25, metalness: 0.55 });
const tuftMat  = new THREE.MeshStandardMaterial({ color: 0x2b2015, roughness: 0.9 });

/* lower legs: paler (reticulated giraffe legs are cream below the knee) */
const paleLegMat = coatMatFor(1, 1);
paleLegMat.color = new THREE.Color(0xf3e8cd);
paleLegMat.map = coatTex.clone(); paleLegMat.map.needsUpdate = true;
paleLegMat.map.wrapS = paleLegMat.map.wrapT = THREE.RepeatWrapping;

/* ============================================================
   GEOMETRY HELPER: tapered tube along a curve
   (organic limbs / neck / torso / trunks)
   ============================================================ */
function tubeGeo(pts, radii, opts) {
  const o = Object.assign({ radial: 12, tubular: 12, capStart: true, capEnd: true, uvWorld: 0.7 }, opts || {});
  const curve = new THREE.CatmullRomCurve3(pts);
  const frames = curve.computeFrenetFrames(o.tubular, false);
  const L = curve.getLength();

  // radii defined at control points; interpolate by chordal length
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = cum[cum.length - 1];
  function radiusAt(u) {
    const target = u * total;
    for (let i = 1; i < cum.length; i++) {
      if (cum[i] >= target) {
        const f = (target - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
        return radii[i - 1] + (radii[i] - radii[i - 1]) * f;
      }
    }
    return radii[radii.length - 1];
  }

  const radial = o.radial, cols = radial + 1;
  const pos = [], uv = [], idx = [];
  const P = new THREE.Vector3(), N = frames.normals, B = frames.binormals;
  for (let i = 0; i <= o.tubular; i++) {
    const u = i / o.tubular;
    curve.getPointAt(u, P);
    const r = radiusAt(u);
    const arclen = u * L;
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * TAU;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      pos.push(
        P.x + (N[i].x * ca + B[i].x * sa) * r,
        P.y + (N[i].y * ca + B[i].y * sa) * r,
        P.z + (N[i].z * ca + B[i].z * sa) * r
      );
      uv.push((ang * r) / o.uvWorld, arclen / o.uvWorld);
    }
  }
  for (let i = 0; i < o.tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  // end caps
  function cap(iRing, flip) {
    const centerIdx = pos.length / 3;
    curve.getPointAt(iRing / o.tubular, P);
    pos.push(P.x, P.y, P.z);
    uv.push(0.5, (iRing / o.tubular) * L / o.uvWorld);
    for (let j = 0; j < radial; j++) {
      const a = iRing * cols + j, b = a + 1;
      if (flip) idx.push(centerIdx, b, a); else idx.push(centerIdx, a, b);
    }
  }
  if (o.capStart) cap(0, true);
  if (o.capEnd) cap(o.tubular, false);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function ellip(r, sx, sy, sz, mat, uvW) {
  // sphere with coat UVs roughly world-scaled + elliptical scale
  const rep = uvW ? { u: (TAU * r) / uvW, v: (Math.PI * r) / uvW } : { u: 1, v: 1 };
  const m = mat || coatMatFor(rep.u, rep.v);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  return mesh;
}

/* ============================================================
   THE GIRAFFE
   ============================================================ */
const gir = new THREE.Group();          // root: on the ground, heading rotation
const body = new THREE.Group();         // bobs / rolls / sways
gir.add(body);
scene.add(gir);

/* ---------- torso ---------- */
{
  const torso = new THREE.Mesh(
    tubeGeo(
      [new THREE.Vector3(0, 3.02, -1.02), new THREE.Vector3(0, 3.06, -0.45),
       new THREE.Vector3(0, 3.10, 0.15), new THREE.Vector3(0, 3.02, 0.60),
       new THREE.Vector3(0, 2.88, 0.86)],
      [0.36, 0.50, 0.545, 0.50, 0.36],
      { radial: 22, tubular: 20, uvWorld: 0.95 }
    ),
    coatMat
  );
  torso.geometry.scale(0.88, 1.14, 1);   // deep, narrow chest
  torso.castShadow = true;
  body.add(torso);

  const withers = ellip(0.44, 0.72, 0.72, 0.85, coatMatFor(2.6, 1.3));
  withers.position.set(0, 3.40, 0.36);
  body.add(withers);

  const chest = ellip(0.46, 0.78, 1.05, 0.82, coatMatFor(2.8, 1.4));
  chest.position.set(0, 2.98, 0.42);
  body.add(chest);

  const belly = ellip(0.48, 0.74, 0.72, 1.25, coatMatFor(2.9, 1.45));
  belly.position.set(0, 2.72, -0.12);
  body.add(belly);

  const rump = ellip(0.46, 0.86, 1.0, 0.86, coatMatFor(2.8, 1.4));
  rump.position.set(0, 3.06, -0.86);
  body.add(rump);
}

/* ---------- neck + head ---------- */
const neckGroup = new THREE.Group();
neckGroup.position.set(0, 3.42, 0.50);
body.add(neckGroup);

{
  const neck = new THREE.Mesh(
    tubeGeo(
      [new THREE.Vector3(0, -0.14, -0.06), new THREE.Vector3(0, 0.42, 0.32),
       new THREE.Vector3(0, 0.95, 0.62), new THREE.Vector3(0, 1.50, 0.86)],
      [0.33, 0.27, 0.225, 0.185],
      { radial: 18, tubular: 20, uvWorld: 0.95, capStart: false, capEnd: false }
    ),
    coatMat
  );
  neck.geometry.scale(0.94, 1, 1.06);
  neck.castShadow = true;
  neckGroup.add(neck);

  // mane: serrated ridge along the back of the neck
  const curve = new THREE.CatmullRomCurve3(
    [new THREE.Vector3(0, -0.14, -0.06), new THREE.Vector3(0, 0.42, 0.32),
     new THREE.Vector3(0, 0.95, 0.62), new THREE.Vector3(0, 1.50, 0.86)]
  );
  const d = new THREE.Vector3(0, 0.52, -0.853).normalize(); // dorsal normal (up-back)
  const boxG = new THREE.BoxGeometry(0.035, 0.10, 0.05);
  for (let i = 0; i <= 15; i++) {
    const u = i / 15;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const n = d.clone();
    const m = new THREE.Mesh(boxG, maneMat);
    const off = 0.30 - 0.13 * u; // radius along neck
    m.position.set(p.x + n.x * off, p.y + n.y * off + 0.03, p.z + n.z * off);
    m.rotation.x = Math.atan2(t.z, t.y);           // align with neck slope
    m.scale.y = (i % 2 === 0) ? 1.0 : 0.55;        // serrated
    m.castShadow = true;
    neckGroup.add(m);
  }
}

const headGroup = new THREE.Group();
headGroup.position.set(0, 1.50, 0.86);
neckGroup.add(headGroup);
const ears = [];
{
  headGroup.rotation.x = 0.18;

  const skull = ellip(0.185, 0.85, 1.02, 1.12, coatMatFor(1.1, 0.55));
  skull.position.set(0, 0.05, -0.02);
  headGroup.add(skull);

  const face = new THREE.Mesh(
    tubeGeo(
      [new THREE.Vector3(0, 0.10, 0.05), new THREE.Vector3(0, 0.05, 0.20),
       new THREE.Vector3(0, -0.02, 0.36)],
      [0.155, 0.140, 0.122],
      { radial: 14, tubular: 8, uvWorld: 0.72, capStart: false }
    ),
    coatMat
  );
  face.castShadow = true;
  headGroup.add(face);

  const muzzle = ellip(0.132, 0.95, 0.98, 1.28, coatMatFor(0.85, 0.42));
  muzzle.position.set(0, -0.075, 0.43);
  headGroup.add(muzzle);

  const nostrilG = new THREE.SphereGeometry(0.028, 10, 8);
  for (const s of [-1, 1]) {
    const nostril = new THREE.Mesh(nostrilG, darkMat);
    nostril.scale.set(1, 1.5, 0.6);
    nostril.position.set(0.062 * s, -0.02, 0.565);
    nostril.rotation.z = 0.35 * s;
    headGroup.add(nostril);
  }

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.007, 0.03), darkMat);
  mouth.position.set(0, -0.150, 0.49);
  headGroup.add(mouth);

  // ossicones
  const hornG = new THREE.CylinderGeometry(0.020, 0.026, 0.20, 10);
  const knobG = new THREE.SphereGeometry(0.048, 12, 10);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(hornG, maneMat);
    horn.position.set(0.075 * s, 0.255, 0.02);
    horn.rotation.z = -0.14 * s;
    horn.castShadow = true;
    headGroup.add(horn);
    const knob = new THREE.Mesh(knobG, new THREE.MeshStandardMaterial({ color: 0x57391d, roughness: 0.9 }));
    knob.position.set(0.089 * s, 0.355, 0.02);
    headGroup.add(knob);
  }

  // ears
  const earG = new THREE.SphereGeometry(0.115, 14, 10);
  for (const s of [-1, 1]) {
    const eg = new THREE.Group();
    eg.position.set(0.17 * s, 0.16, -0.07);
    const ear = new THREE.Mesh(earG, coatMatFor(0.62, 0.34));
    ear.scale.set(0.42, 1.0, 0.68);
    ear.position.set(0.055 * s, 0.07, 0);
    ear.castShadow = true;
    eg.add(ear);
    eg.rotation.z = -0.55 * s;
    eg.rotation.x = -0.30;
    headGroup.add(eg);
    ears.push({ g: eg, s });
  }

  // eyes
  const eyeG = new THREE.SphereGeometry(0.034, 14, 10);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeG, eyeMat);
    eye.position.set(0.118 * s, 0.095, 0.105);
    headGroup.add(eye);
  }
}
const eyes = [];
headGroup.traverse(o => { if (o.material === eyeMat) eyes.push(o); });

/* ---------- tail ---------- */
const tailGroup = new THREE.Group();
tailGroup.position.set(0, 3.28, -1.02);
body.add(tailGroup);
{
  const tail = new THREE.Mesh(
    tubeGeo(
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.32, -0.08),
       new THREE.Vector3(0, -0.66, -0.16)],
      [0.030, 0.020, 0.012],
      { radial: 8, tubular: 10, uvWorld: 0.55 }
    ),
    coatMat
  );
  tail.castShadow = true;
  tailGroup.add(tail);
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), tuftMat);
  tuft.scale.set(0.85, 2.6, 0.85);
  tuft.position.set(0, -0.80, -0.20);
  tuft.castShadow = true;
  tailGroup.add(tuft);
  tailGroup.rotation.x = 0.28;
}

/* ============================================================
   LEGS — hierarchical chains + gait solver
   ============================================================ */
const FRONT = {
  U: 1.24, C: 1.25, P: 0.30, H: 0.13,   // segment lengths
  hipY: 2.92, hipZ: 0.55, pastSlope: 0.25
};
const HIND = {
  F: 0.77, T: 0.67, C: 1.18, P: 0.29, H: 0.13,
  hipY: 2.99, hipZ: -0.55,
  femurRest: -0.28, stifleRest: 0.55, hockRest: -0.27, pastSlope: 0.25
};

function segMesh(p0, p1, r0, r1, mat, uvW) {
  const m = new THREE.Mesh(
    tubeGeo([p0, new THREE.Vector3((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2), p1],
      [r0, (r0 + r1) / 2, r1],
      { radial: 12, tubular: 10, uvWorld: uvW, capStart: false, capEnd: false }),
    mat
  );
  m.castShadow = true;
  return m;
}

function buildFrontLeg(side) {
  const F = FRONT;
  const hip = new THREE.Group();
  hip.position.set(0.335 * side, F.hipY, F.hipZ);
  body.add(hip);

  const thigh = segMesh(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -F.U, 0), 0.185, 0.085, coatMat, 0.8);
  hip.add(thigh);
  // shoulder muscle blending into torso
  const shoulder = ellip(0.30, 0.72, 1.1, 0.78, coatMatFor(2.6, 1.3));
  shoulder.position.set(0.02 * side, 0.06, 0.02);
  hip.add(shoulder);

  const knee = new THREE.Group();
  knee.position.set(0, -F.U, 0);
  hip.add(knee);
  const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.088, 12, 10), coatMat);
  kneeBall.castShadow = true;
  knee.add(kneeBall);

  const cannon = segMesh(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -F.C, 0), 0.072, 0.052, paleLegMat, 0.72);
  knee.add(cannon);

  const fetlock = new THREE.Group();
  fetlock.position.set(0, -F.C, 0);
  knee.add(fetlock);
  const fBall = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), paleLegMat);
  fBall.castShadow = true;
  fetlock.add(fBall);

  // pastern slopes back
  const pastern = segMesh(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -F.P, 0), 0.05, 0.045, paleLegMat, 0.72);
  fetlock.add(pastern);

  const hoofG = new THREE.Group();
  hoofG.position.set(0, -F.P, 0);
  fetlock.add(hoofG);
  const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.062, F.H, 12), hoofMat);
  hoof.position.y = -F.H / 2;
  hoof.castShadow = true;
  hoofG.add(hoof);

  return { front: true, side, hip, knee, fetlock, hoofG, phase: 0, prevStance: true };
}

function buildHindLeg(side) {
  const D = HIND;
  const hip = new THREE.Group();
  hip.position.set(0.325 * side, D.hipY, D.hipZ);
  body.add(hip);

  const thigh = segMesh(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -D.F, 0), 0.20, 0.115, coatMat, 0.8);
  hip.add(thigh);

  const stifle = new THREE.Group();
  stifle.position.set(0, -D.F, 0);
  hip.add(stifle);
  const stBall = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), coatMat);
  stBall.castShadow = true;
  stifle.add(stBall);

  const tibia = segMesh(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -D.T, 0), 0.10, 0.062, paleLegMat, 0.72);
  stifle.add(tibia);

  const hock = new THREE.Group();
  hock.position.set(0, -D.T, 0);
  stifle.add(hock);
  const hBall = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), paleLegMat);
  hBall.castShadow = true;
  hock.add(hBall);

  const cannon = segMesh(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -D.C, 0), 0.068, 0.052, paleLegMat, 0.72);
  hock.add(cannon);

  const fetlock = new THREE.Group();
  fetlock.position.set(0, -D.C, 0);
  hock.add(fetlock);
  const fBall = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), paleLegMat);
  fBall.castShadow = true;
  fetlock.add(fBall);

  const pastern = segMesh(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -D.P, 0), 0.05, 0.045, paleLegMat, 0.72);
  fetlock.add(pastern);

  const hoofG = new THREE.Group();
  hoofG.position.set(0, -D.P, 0);
  fetlock.add(hoofG);
  const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.060, D.H, 12), hoofMat);
  hoof.position.y = -D.H / 2;
  hoof.castShadow = true;
  hoofG.add(hoof);

  return { front: false, side, hip, stifle, hock, fetlock, hoofG, phase: 0, prevStance: true };
}

/* pacing walk: same-side legs move nearly together (giraffe signature) */
const legs = [
  Object.assign(buildFrontLeg(+1), { phase: 0.00 }),
  Object.assign(buildHindLeg(+1),  { phase: 0.12 }),
  Object.assign(buildFrontLeg(-1), { phase: 0.50 }),
  Object.assign(buildHindLeg(-1),  { phase: 0.62 }),
];

/* --- forward kinematics of a leg chain; returns hoof pos (local to hip) --- */
function legEval(leg, a, flexes) {
  let z = 0, y = 0, dz = 0;
  if (leg.front) {
    const F = FRONT;
    const t1 = -a;
    const t2 = -a + flexes.knee;
    const t3 = t2 + F.pastSlope + flexes.fet;
    const segs = [[F.U, t1], [F.C, t2], [F.P, t3], [F.H, t3]];
    for (const [len, t] of segs) { z -= len * Math.sin(t); y += len * Math.cos(t); dz += len * Math.cos(t); }
    return { z, y, dz };
  } else {
    const D = HIND;
    const tf = D.femurRest - a;
    const tt = tf + D.stifleRest + flexes.stifle;
    const tc = tt + D.hockRest + flexes.hock;
    const tp = tc + D.pastSlope + flexes.fet;
    const segs = [[D.F, tf], [D.T, tt], [D.C, tc], [D.P, tp], [D.H, tp]];
    for (const [len, t] of segs) { z -= len * Math.sin(t); y += len * Math.cos(t); dz += len * Math.cos(t); }
    return { z, y, dz };
  }
}

/* Newton solve: swing angle `a` that places the hoof at local z */
function solveA(leg, zTarget, flexes, a0) {
  let a = (a0 != null) ? a0 : clamp(zTarget / 2.6, -0.65, 0.65);
  for (let i = 0; i < 5; i++) {
    const e = legEval(leg, a, flexes);
    const step = (e.z - zTarget) / Math.max(0.3, e.dz);
    a = clamp(a - step, -0.7, 0.7);
  }
  return a;
}

function applyLeg(leg, a, flexes) {
  if (leg.front) {
    leg.hip.rotation.x = -a;
    leg.knee.rotation.x = flexes.knee;
    leg.fetlock.rotation.x = FRONT.pastSlope + flexes.fet;
  } else {
    leg.hip.rotation.x = HIND.femurRest - a;
    leg.stifle.rotation.x = HIND.stifleRest + flexes.stifle;
    leg.hock.rotation.x = HIND.hockRest + flexes.hock;
    leg.fetlock.rotation.x = HIND.pastSlope + flexes.fet;
  }
}

/* ============================================================
   ENVIRONMENT
   ============================================================ */
const PATH_R = 26;

/* sky dome */
{
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 32, 18),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.renderOrder = -1;
  envGroup.add(sky);
}

/* ground */
{
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(480, 64),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  envGroup.add(ground);
}

/* trampled dirt path (soft-edged ring texture) */
{
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0.72, 'rgba(0,0,0,0)');
  g.addColorStop(0.80, 'rgba(196,163,112,0.85)');
  g.addColorStop(0.92, 'rgba(190,158,108,0.85)');
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  // dirt speckle inside the ring band
  for (let i = 0; i < 700; i++) {
    const ang = Math.random() * TAU;
    const rr = 92 + Math.random() * 34;
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(150,120,80,0.25)' : 'rgba(215,190,145,0.25)';
    ctx.fillRect(128 + Math.cos(ang) * rr, 128 + Math.sin(ang) * rr, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(19.5, 32.5, 96, 1),
    new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.receiveShadow = true;
  envGroup.add(ring);
}

/* water hole */
let water;
{
  const mud = new THREE.Mesh(
    new THREE.RingGeometry(8.4, 11.6, 48),
    new THREE.MeshStandardMaterial({ color: 0x95754d, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 })
  );
  mud.rotation.x = -Math.PI / 2;
  mud.position.y = 0.012;
  envGroup.add(mud);

  water = new THREE.Mesh(
    new THREE.CircleGeometry(8.4, 48),
    new THREE.MeshStandardMaterial({
      color: 0x4d7e97, roughness: 0.14, metalness: 0.1,
      normalMap: noiseTex, normalScale: new THREE.Vector2(0.35, 0.35),
      transparent: true, opacity: 0.94, polygonOffset: true, polygonOffsetFactor: -2
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.03;
  envGroup.add(water);

  // reeds around the water
  const reedMat = new THREE.MeshStandardMaterial({ color: 0x6b7a3c, roughness: 1 });
  const reedG = new THREE.CylinderGeometry(0.012, 0.022, 1, 5);
  for (let i = 0; i < 26; i++) {
    const ang = Math.random() * TAU;
    const rr = rand(8.8, 11.2);
    const h = rand(0.5, 1.0);
    const reed = new THREE.Mesh(reedG, reedMat);
    reed.scale.y = h;
    reed.position.set(Math.cos(ang) * rr, h / 2, Math.sin(ang) * rr);
    reed.rotation.z = rand(-0.12, 0.12);
    reed.rotation.x = rand(-0.12, 0.12);
    reed.castShadow = true;
    envGroup.add(reed);
  }
}

/* grass tufts (instanced crossed quads) */
{
  const quad = new THREE.BufferGeometry();
  const pos = new Float32Array([
    -0.55, 0, 0, 0.55, 0, 0, 0.55, 0.85, 0, -0.55, 0.85, 0,
    0, 0, -0.55, 0, 0, 0.55, 0, 0.85, 0.55, 0, 0.85, -0.55
  ]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]);
  quad.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  quad.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  quad.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  quad.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    map: grassTex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 1
  });
  const COUNT = 420;
  const grass = new THREE.InstancedMesh(quad, mat, COUNT);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const col = new THREE.Color();
  let placed = 0, guard = 0;
  while (placed < COUNT && guard++ < 20000) {
    const ang = Math.random() * TAU;
    const rr = Math.sqrt(Math.random()) * 130;
    if (rr < 12.5 || (rr > 21.5 && rr < 31)) continue;
    const s = rand(0.6, 1.5);
    e.set(rand(-0.08, 0.08), Math.random() * TAU, rand(-0.08, 0.08));
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(Math.cos(ang) * rr, 0, Math.sin(ang) * rr), q, new THREE.Vector3(s, s, s));
    grass.setMatrixAt(placed, m);
    col.setHSL(0.16 + Math.random() * 0.06, 0.32 + Math.random() * 0.2, 0.32 + Math.random() * 0.18);
    grass.setColorAt(placed, col);
    placed++;
  }
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  envGroup.add(grass);
}

/* rocks & bushes */
{
  const rockG = new THREE.DodecahedronGeometry(0.5, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8175, roughness: 1, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const ang = Math.random() * TAU;
    const rr = rand(15, 110);
    if (rr > 21.5 && rr < 31) { i--; continue; }
    const rock = new THREE.Mesh(rockG, rockMat);
    const s = rand(0.35, 1.2);
    rock.scale.set(s * rand(0.8, 1.4), s * rand(0.5, 0.8), s * rand(0.8, 1.4));
    rock.position.set(Math.cos(ang) * rr, s * 0.2, Math.sin(ang) * rr);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rock.castShadow = rock.receiveShadow = true;
    envGroup.add(rock);
  }
  const bushG = new THREE.SphereGeometry(1, 12, 9);
  for (let i = 0; i < 20; i++) {
    const ang = Math.random() * TAU;
    const rr = rand(14, 120);
    if (rr > 21.5 && rr < 31) { i--; continue; }
    const bush = new THREE.Mesh(bushG, new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.23 + Math.random() * 0.04, 0.35, 0.24 + Math.random() * 0.08), roughness: 1
    }));
    const s = rand(0.45, 1.0);
    bush.scale.set(s, s * 0.65, s);
    bush.position.set(Math.cos(ang) * rr, s * 0.45, Math.sin(ang) * rr);
    bush.castShadow = true;
    envGroup.add(bush);
  }
}

/* acacia trees */
{
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6e5b3f, roughness: 1 });
  const canopyG = new THREE.SphereGeometry(1, 14, 10);
  for (let i = 0; i < 26; i++) {
    const ang = Math.random() * TAU;
    const rr = rand(17, 150);
    if (rr > 21.5 && rr < 31.5) { i--; continue; }
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    const tree = new THREE.Group();
    const h = rand(4.5, 8.5);
    const lean = new THREE.Vector3(rand(-0.6, 0.6), 0, rand(-0.6, 0.6));
    const trunk = new THREE.Mesh(
      tubeGeo(
        [new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean.x * 0.35, h * 0.45, lean.z * 0.35),
         new THREE.Vector3(lean.x * 0.8, h * 0.8, lean.z * 0.8), new THREE.Vector3(lean.x, h, lean.z)],
        [0.30, 0.19, 0.11, 0.05],
        { radial: 10, tubular: 10, uvWorld: 1.4, capEnd: false }
      ),
      trunkMat
    );
    trunk.castShadow = true;
    tree.add(trunk);
    // branch
    const bx = lean.x + rand(-1.2, 1.2), bz = lean.z + rand(-1.2, 1.2);
    const branch = new THREE.Mesh(
      tubeGeo(
        [new THREE.Vector3(lean.x, h * 0.7, lean.z),
         new THREE.Vector3((lean.x + bx) / 2, h * 0.78 + rand(0, 0.6), (lean.z + bz) / 2),
         new THREE.Vector3(bx, h * 0.85, bz)],
        [0.08, 0.05, 0.025],
        { radial: 7, tubular: 6, uvWorld: 1.2, capEnd: false }
      ),
      trunkMat
    );
    branch.castShadow = true;
    tree.add(branch);
    // flat-topped canopy
    const n = 3 + (Math.random() * 3 | 0);
    for (let k = 0; k < n; k++) {
      const c = new THREE.Mesh(canopyG, new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.24 + Math.random() * 0.03, 0.34, 0.22 + Math.random() * 0.08), roughness: 1
      }));
      const cr = rand(1.1, 2.2);
      c.scale.set(cr, cr * 0.38, cr * 0.8);
      c.position.set(lean.x + rand(-1.4, 1.4), h + rand(-0.3, 0.5), lean.z + rand(-1.4, 1.4));
      c.castShadow = true;
      tree.add(c);
    }
    tree.position.set(x, 0, z);
    envGroup.add(tree);
  }
}

/* distant hills */
{
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x93a081, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * TAU + rand(-0.15, 0.15);
    const rr = rand(290, 400);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), hillMat);
    hill.scale.set(rand(90, 170), rand(16, 38), rand(70, 130));
    hill.position.set(Math.cos(ang) * rr, 0, Math.sin(ang) * rr);
    envGroup.add(hill);
  }
}

/* clouds */
const cloudGroup = new THREE.Group();
envGroup.add(cloudGroup);
{
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xfdf6e7, roughness: 1, transparent: true, opacity: 0.92, fog: true });
  const puffG = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 11; i++) {
    const ang = Math.random() * TAU;
    const rr = rand(70, 360);
    const y = rand(55, 95);
    const cl = new THREE.Group();
    const n = 3 + (Math.random() * 3 | 0);
    for (let k = 0; k < n; k++) {
      const puff = new THREE.Mesh(puffG, cloudMat);
      const s = rand(6, 15);
      puff.scale.set(s, s * 0.35, s * 0.7);
      puff.position.set(rand(-12, 12), rand(-1.5, 1.5), rand(-6, 6));
      cl.add(puff);
    }
    cl.position.set(Math.cos(ang) * rr, y, Math.sin(ang) * rr);
    cloudGroup.add(cl);
  }
}

/* ---------- lights ---------- */
const hemi = new THREE.HemisphereLight(0xbcd4e8, 0xc9ae7e, 0.55);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffe0b0, 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -17; sun.shadow.camera.right = 17;
sun.shadow.camera.top = 17; sun.shadow.camera.bottom = -17;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 160;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);
const sunOffset = new THREE.Vector3(24, 44, -26);

/* ============================================================
   DUST PUFFS at hoof-fall
   ============================================================ */
const dustPool = [];
{
  for (let i = 0; i < 30; i++) {
    const m = new THREE.SpriteMaterial({ map: dustTex, transparent: true, opacity: 0, depthWrite: false });
    const s = new THREE.Sprite(m);
    s.visible = false;
    scene.add(s);
    dustPool.push({ s, life: 0, ttl: 1, vx: 0, vy: 0, vz: 0, rot: Math.random() * TAU });
  }
}
function spawnDust(pos, n) {
  let spawned = 0;
  for (const d of dustPool) {
    if (spawned >= n) break;
    if (d.life > 0) continue;
    d.life = d.ttl = rand(0.55, 0.9);
    d.s.visible = true;
    d.s.position.set(pos.x + rand(-0.08, 0.08), 0.06 + rand(0, 0.08), pos.z + rand(-0.08, 0.08));
    d.vx = rand(-0.35, 0.35); d.vy = rand(0.15, 0.5); d.vz = rand(-0.35, 0.35);
    d.s.material.rotation = Math.random() * TAU;
    spawned++;
  }
}
function updateDust(dt) {
  for (const d of dustPool) {
    if (d.life <= 0) continue;
    d.life -= dt;
    if (d.life <= 0) { d.s.visible = false; d.s.material.opacity = 0; continue; }
    const t = 1 - d.life / d.ttl;
    d.s.position.x += d.vx * dt;
    d.s.position.y += d.vy * dt;
    d.s.position.z += d.vz * dt;
    d.vy *= (1 - 1.5 * dt);
    const sc = 0.22 + t * 0.85;
    d.s.scale.set(sc, sc, 1);
    d.s.material.opacity = 0.34 * (1 - t);
  }
}

/* ============================================================
   ANIMATION
   ============================================================ */
const GAIT = {
  duty: 0.63,            // fraction of cycle a hoof is on the ground
  phases: { FL: 0.00, HL: 0.12, FR: 0.50, HR: 0.62 },
};
let gaitPhi = 0;         // global gait phase
let speed = 1.5;         // m/s (slider)
let pathAng = 0;         // angle on the walking circle

/* per-frame gait */
const flexTmp = { knee: 0, stifle: 0, hock: 0, fet: 0 };
function updateGiraffe(dt, t) {
  const v = speed;
  const T_s = clamp(1.1 / Math.max(v, 0.15), 0.5, 1.35); // stance duration (stride ~1.1 m)
  const T = T_s / GAIT.duty;                       // full cycle
  const z0 = v * T_s * 0.5;                        // hoof target at touchdown
  const swingAmt = smoothstep(0.08, 0.45, v);

  gaitPhi = fract(gaitPhi + dt / T);
  const sp = smoothstep(0.15, 1.1, v);

  /* --- legs --- */
  const stanceData = [];
  for (const leg of legs) {
    const f = fract(gaitPhi + leg.phase);
    let a, flexes;
    const stance = f < GAIT.duty;
    if (stance) {
      const s = f / GAIT.duty;
      const zTarget = z0 * (1 - 2 * s);
      if (leg.front) {
        flexTmp.knee = 0.15 * Math.sin(Math.PI * s);
        flexTmp.stifle = 0; flexTmp.hock = 0;
        flexTmp.fet = 0.09 * Math.sin(Math.PI * s) - 0.05;
      } else {
        flexTmp.knee = 0;
        flexTmp.stifle = 0.05 * Math.sin(Math.PI * s);
        flexTmp.hock = -0.06 * Math.sin(Math.PI * s);
        flexTmp.fet = 0.08 * Math.sin(Math.PI * s) - 0.04;
      }
      a = solveA(leg, zTarget, flexTmp, leg._a);
      leg._a = a;
      // hoof-fall dust
      if (!leg.prevStance && v > 0.5) {
        const p = new THREE.Vector3();
        leg.hoofG.getWorldPosition(p);
        spawnDust(p, 2);
      }
      leg.prevStance = true;
      const e = legEval(leg, a, flexTmp);
      stanceData.push({ leg, reach: e.y, hipY: leg.front ? FRONT.hipY : HIND.hipY });
      flexes = flexTmp;
    } else {
      const s = (f - GAIT.duty) / (1 - GAIT.duty);
      const ease = 0.5 - 0.5 * Math.cos(Math.PI * s);
      // boundary angles (solve with boundary flexes)
      const bFlex = leg.front
        ? { knee: 0, stifle: 0, hock: 0, fet: -0.05 }
        : { knee: 0, stifle: 0, hock: 0, fet: -0.04 };
      const aStart = solveA(leg, z0, bFlex, leg._aS);
      const aEnd = solveA(leg, -z0, bFlex, leg._aE);
      leg._aS = aStart; leg._aE = aEnd;
      a = lerp(aEnd, aStart, ease);
      const S = Math.sin(Math.PI * s) * swingAmt;
      if (leg.front) {
        flexes = { knee: 0.95 * S, stifle: 0, hock: 0, fet: -0.05 - 0.28 * S };
      } else {
        flexes = { knee: 0, stifle: 0.45 * S, hock: -0.85 * S, fet: -0.04 - 0.20 * S };
      }
      leg.prevStance = false;
    }
    applyLeg(leg, a, flexes);
  }

  /* --- body: height from grounded legs (natural bob), sway & roll --- */
  let B = 0;
  if (stanceData.length > 0) {
    let sum = 0, mn = 1;
    for (const sd of stanceData) { const d = sd.reach - sd.hipY; sum += d; mn = Math.min(mn, d); }
    const mean = sum / stanceData.length;
    B = clamp(mn, mean - 0.035, mean);
  }
  B = clamp(B, -0.26, 0.05);
  const breathe = 0.006 * Math.sin(t * 1.4);
  body.position.y = B + breathe;
  body.position.x = 0.05 * sp * Math.cos(TAU * gaitPhi);
  body.rotation.z = sp * (-0.034 * Math.cos(TAU * gaitPhi) - 0.012) + 0.008 * Math.sin(t * 0.9);
  body.rotation.x = 0.006 * sp * Math.sin(2 * TAU * gaitPhi + 0.8);
  body.rotation.y = 0.008 * sp * Math.sin(TAU * gaitPhi + 1.3);

  /* --- neck & head --- */
  const neckOscX = 0.035 * sp * Math.cos(2 * TAU * gaitPhi + 2.0) + 0.01 * Math.sin(t * 0.31);
  neckGroup.rotation.x = neckOscX;
  neckGroup.rotation.y = 0.05 * sp * Math.sin(TAU * gaitPhi + 0.9) + 0.03 * Math.sin(t * 0.17);
  headGroup.rotation.x = 0.18 - 0.5 * neckOscX + 0.006 * Math.sin(2 * TAU * gaitPhi + 2.6) * sp;
  headGroup.rotation.y = 0.10 * Math.sin(t * 0.23) + 0.02 * Math.sin(t * 0.11);

  return T;
}

/* --- tail pendulum --- */
let tailTheta = 0, tailOmega = 0;
function updateTail(dt, t) {
  const drive = 0.9 * smoothstep(0.15, 1.1, speed) * Math.cos(TAU * gaitPhi + 0.5)
              + 0.35 * Math.sin(t * 2.1) * (0.3 + 0.7 * Math.sin(t * 0.37));
  tailOmega += (-9.5 * Math.sin(tailTheta) - 1.9 * tailOmega + drive) * dt;
  tailTheta += tailOmega * dt;
  tailTheta = clamp(tailTheta, -1.1, 1.1);
  tailGroup.rotation.z = tailTheta * 0.55;
  tailGroup.rotation.x = 0.28 + 0.05 * Math.sin(t * 1.9);
}

/* --- blink & ear flicks --- */
let blinkT = rand(1, 4), blinkPhase = -1;
let flickT = rand(2, 6), flickEar = 0, flickPhase = -1;
function updateFace(dt) {
  blinkT -= dt;
  if (blinkT <= 0 && blinkPhase < 0) { blinkPhase = 0; blinkT = rand(2.2, 6.5); }
  if (blinkPhase >= 0) {
    blinkPhase += dt / 0.16;
    const k = blinkPhase < 1 ? Math.sin(Math.PI * blinkPhase) : 0;
    for (const e of eyes) e.scale.y = 1 - 0.92 * k;
    if (blinkPhase >= 1) blinkPhase = -1;
  }
  flickT -= dt;
  if (flickT <= 0 && flickPhase < 0) { flickPhase = 0; flickEar = Math.random() < 0.5 ? 0 : 1; flickT = rand(2.5, 8); }
  if (flickPhase >= 0) {
    flickPhase += dt / 0.4;
    const k = flickPhase < 1 ? Math.sin(Math.PI * flickPhase) : 0;
    const ear = ears[flickEar];
    ear.g.rotation.x = -0.30 + 0.55 * k;
    if (flickPhase >= 1) { ear.g.rotation.x = -0.30; flickPhase = -1; }
  }
}

/* --- movement along the circle --- */
function moveGiraffe(dt) {
  pathAng += (speed * dt) / PATH_R;
  gir.position.set(Math.sin(pathAng) * PATH_R, 0, Math.cos(pathAng) * PATH_R);
  gir.rotation.y = Math.atan2(Math.cos(pathAng), -Math.sin(pathAng));
}

/* --- camera follow --- */
const followTarget = new THREE.Vector3(0, 3.0, 26);
function updateCamera(dt) {
  const desired = new THREE.Vector3(gir.position.x, 3.15, gir.position.z);
  const k = 1 - Math.pow(0.0008, dt);
  const next = followTarget.clone().lerp(desired, k);
  camera.position.add(next.clone().sub(followTarget));
  followTarget.copy(next);
  controls.target.copy(followTarget);
}

/* ============================================================
   UI
   ============================================================ */
const speedInput = document.getElementById('speed');
const speedVal = document.getElementById('speedval');
speedInput.addEventListener('input', () => {
  speed = parseFloat(speedInput.value);
  speedVal.textContent = speed.toFixed(2) + ' m/s';
});
setTimeout(() => { document.getElementById('hint').style.opacity = 0; }, 8000);

/* debug camera presets via URL hash (#view=side|front|head|legs|far) */
(function debugViews() {
  const h = decodeURIComponent(location.hash || '');
  const m = h.match(/view=(\w+)/);
  if (!m) return;
  const presets = {
    side:   { pos: [3.0, 2.6, 44.0], tgt: [1.5, 2.9, 26] },
    front:  { pos: [34, 3.8, 26.5], tgt: [1.5, 3.2, 26] },
    head:   { pos: [8.0, 5.6, 29.8], tgt: [1.6, 4.6, 26.4] },
    legs:   { pos: [4.5, 1.0, 33.0], tgt: [1.0, 1.5, 26] },
    far:    { pos: [40, 14, 70], tgt: [0, 2.5, 20] },
  };
  const p = presets[m[1]];
  if (p) {
    camera.position.set(...p.pos);
    controls.target.set(...p.tgt);
    followTarget.copy(controls.target);
  }
})();

/* ---------- debug diagnostics (URL hash: #diag, #plain) ---------- */
const DBG = { diag: /diag/.test(decodeURIComponent(location.hash || '')), plain: /plain/.test(decodeURIComponent(location.hash || '')) };
if (DBG.plain) {
  envGroup.visible = false;
  scene.fog = null;
  scene.background = new THREE.Color(0xff00aa);
  for (const id of ['ctrl', 'hint', 'hud', 'log', 'err']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
}
DBG.samples = [];
DBG.done = false;
const rec_heading = (run) => run[0] != null && run[0].h != null ? run[0].h : 0;
DBG.project = function (name, worldPos) {
  const v = worldPos.clone().project(camera);
  const x = Math.round((v.x + 1) / 2 * window.innerWidth);
  const y = Math.round((1 - v.y) / 2 * window.innerHeight);
  L('PT ' + name + ' ' + x + ',' + y + (v.z > 1 ? ' BEHIND' : ''));
};

/* ============================================================
   MAIN LOOP
   ============================================================ */
let simT = 0;

function animate() {
  try {
    frame(dt0());
  } catch (e) {
    showErr('frame: ' + e.message + '\n' + (e.stack || ''));
  }
}

function dt0() {
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  return dt;
}

function frame(dt0in) {
  const dt = DBG.diag ? 0.033 : dt0in;
  simT += dt;

  moveGiraffe(dt);
  updateGiraffe(dt, simT);
  updateTail(dt, simT);
  updateFace(dt);
  updateDust(dt);
  updateCamera(dt);

  if (DBG.diag && !DBG.done) {
    const rec = { t: simT, legs: [], heading: gir.rotation.y };
    const wp = new THREE.Vector3(), dq = new THREE.Quaternion(), dn = new THREE.Vector3();
    for (const leg of legs) {
      leg.hoofG.getWorldPosition(wp);
      leg.hoofG.getWorldQuaternion(dq);
      dn.set(0, -1, 0).applyQuaternion(dq).multiplyScalar(leg.front ? FRONT.H : HIND.H);
      rec.legs.push({ x: wp.x + dn.x, y: wp.y + dn.y, z: wp.z + dn.z, stance: leg.prevStance, h: rec.heading });
    }
    rec.bodyY = body.position.y;
    DBG.samples.push(rec);
    if (DBG.samples.length > 260) DBG.done = true;
  }

  // sun & shadow frustum track the giraffe
  sun.position.copy(gir.position).add(sunOffset);
  sun.target.position.copy(gir.position);
  sun.target.updateMatrixWorld();

  // ambience
  cloudGroup.rotation.y += 0.004 * dt;
  noiseTex.offset.x += 0.012 * dt;
  noiseTex.offset.y += 0.007 * dt;

  if (!DBG.diag) {
    controls.update();
    renderer.render(scene, camera);
  }

  if (DBG.diag && DBG.done && !DBG.reported) {
    DBG.reported = true;
    const S = DBG.samples;
    L('frames=' + S.length + ' simT=' + simT.toFixed(2));
    for (let li = 0; li < legs.length; li++) {
      const leg = legs[li];
      // stance runs
      let runs = [], cur = [];
      for (const s of S) {
        if (s.legs[li].stance) cur.push(s.legs[li]);
        else if (cur.length) { runs.push(cur); cur = []; }
      }
      if (cur.length) runs.push(cur);
      let slideMax = 0, yMin = 99, yMax = -99, nRuns = 0;
      for (const run of runs) {
        if (run.length < 5) continue;
        nRuns++;
        let sMin = 1e9, sMax = -1e9;
        const hd = rec_heading(run);
        for (const p of run) {
          const t = p.x * Math.sin(hd) + p.z * Math.cos(hd); // tangential coord
          sMin = Math.min(sMin, t); sMax = Math.max(sMax, t);
          yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
        }
        slideMax = Math.max(slideMax, sMax - sMin);
      }
      L('LEG' + li + (leg.front ? 'F' : 'H') + (leg.side > 0 ? '+' : '-') +
        ' runs=' + nRuns + ' slide=' + slideMax.toFixed(3) + 'm yMin=' + yMin.toFixed(3) + ' yMax=' + yMax.toFixed(3));
    }
    // body bob
    let bMin = 99, bMax = -99;
    for (const s of S) { bMin = Math.min(bMin, s.bodyY); bMax = Math.max(bMax, s.bodyY); }
    L('bodyY ' + bMin.toFixed(3) + ' .. ' + bMax.toFixed(3));
    // projected anatomy
    gir.updateMatrixWorld(true);
    const wDump = [];
    const wOf = (n, p) => { wDump.push(n + ' ' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ',' + p.z.toFixed(2)); return p; };
    DBG.project('ossicone', wOf('ossicone', headGroup.localToWorld(new THREE.Vector3(0.08, 0.36, 0.02))));
    DBG.project('muzzleTip', wOf('muzzleTip', headGroup.localToWorld(new THREE.Vector3(0, -0.09, 0.58))));
    DBG.project('withers', wOf('withers', body.localToWorld(new THREE.Vector3(0, 3.55, 0.38))));
    DBG.project('tailBase', wOf('tailBase', body.localToWorld(new THREE.Vector3(0, 3.28, -1.02))));
    DBG.project('chestBot', body.localToWorld(new THREE.Vector3(0, 2.45, 0.45)));
    for (let li = 0; li < legs.length; li++) {
      const wp = new THREE.Vector3();
      legs[li].hoofG.getWorldPosition(wp);
      DBG.project('hoof' + li, wp);
    }
    const wp = new THREE.Vector3();
    legs[0].knee.getWorldPosition(wp); DBG.project('kneeFL', wp);
    legs[2].hoofG.getWorldPosition(wp); DBG.project('hoofFR', wp);
    L('gir pos ' + gir.position.x.toFixed(1) + ',' + gir.position.z.toFixed(1) + ' rotY=' + gir.rotation.y.toFixed(2));
    L('WORLD ' + wDump.join(' | '));
  }
}

lastFrame = performance.now();
if (DBG.diag) {
  (function diagLoop() { animate(); setTimeout(diagLoop, 16); })();
} else {
  (function rafLoop() { animate(); requestAnimationFrame(rafLoop); })();
}
window.__status = 'booted';

} catch (e) {
  showErr(e.message + '\n' + (e.stack || ''));
}

