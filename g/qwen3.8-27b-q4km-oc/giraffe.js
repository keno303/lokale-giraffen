/* =====================================================================
   A realistic, walking giraffe in Three.js.
   - Fully procedural model (lofted torso & neck, articulated legs)
   - Procedural coat textures (irregular reticulated spots)
   - Procedural walk cycle (diagonal gait, knee/hock flexion, body bob)
   - Savanna environment: gradient sky, sun, ground, acacias, rocks
   Open index.html directly — no server, no build step.
   ===================================================================== */
'use strict';

/* ----------------------------- helpers ----------------------------- */
const rand  = (a, b) => a + Math.random() * (b - a);
const pick  = arr => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function makeTex(c, rx, ry) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 8;
  return t;
}

/* ------------------------ procedural textures ----------------------- */

// Paints the classic reticulated giraffe coat onto a 2D canvas.
// `bands`: light belly / dark back bands (only meaningful on the body).
function drawCoat(g, W, H, opts) {
  g.fillStyle = '#d2a267';
  g.fillRect(0, 0, W, H);

  // soft mottling
  for (let i = 0; i < 900; i++) {
    g.globalAlpha = rand(0.03, 0.09);
    g.fillStyle = Math.random() < 0.5 ? '#8a5a2b' : '#ecd6a8';
    const r = rand(3, 16);
    g.beginPath();
    g.ellipse(rand(0, W), rand(0, H), r, r * rand(0.5, 1.2), rand(0, 6.283), 0, 6.283);
    g.fill();
  }
  g.globalAlpha = 1;

  // irregular reticulated spots, drawn with horizontal wrapping so the seam is invisible
  const spots = [];
  const n = Math.round(140 * (W * H) / (1024 * 512));
  for (let i = 0; i < n; i++) {
    spots.push({
      x: rand(0, W), y: rand(14, H - 14),
      r: rand(16, 44) * Math.sqrt((W * H) / (1024 * 512)),
      rot: rand(0, 6.283),
      // uniform chestnut brown, slight per-spot variation
      col: 'hsl(' + (19 + Math.random() * 7) + ',' +
                (42 + Math.random() * 22) + '%,' +
                (23 + Math.random() * 13) + '%)',
      wf: 2 + ((Math.random() * 3) | 0),  // edge wave frequency
      ph: rand(0, 6.283)                  // edge wave phase
    });
  }
  const drawSpot = (s, dx) => {
    g.save();
    g.translate(s.x + dx, s.y);
    g.rotate(s.rot);
    g.fillStyle = s.col;
    g.beginPath();
    const k = 14;
    for (let i = 0; i < k; i++) {
      const a = (i / k) * 6.2832;
      const rr = s.r * (0.82 + 0.22 * Math.sin(a * s.wf + s.ph) + rand(-0.07, 0.07));
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr * 0.92;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
    g.fill();
    g.lineWidth = 2.5;
    g.strokeStyle = 'rgba(56,28,8,0.4)';
    g.stroke();
    g.restore();
  };
  for (const s of spots) {
    drawSpot(s, 0);
    if (s.x < s.r + 8)  drawSpot(s, W);
    if (s.x > W - s.r - 8) drawSpot(s, -W);
  }

  if (opts.bands) {
    const band = (xc, color, alpha) => {
      const grad = g.createLinearGradient(xc - W * 0.13, 0, xc + W * 0.13, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = alpha;
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    };
    band(W * 0.25, 'rgba(238,216,172,1)', 0.20); // cream belly
    band(W * 0.75, 'rgba(84,52,22,1)',    0.22); // darker back
  }
  g.globalAlpha = 1;
}

function coatTexture(bands) {
  const c = canvas2d(1024, 512);
  drawCoat(c.getContext('2d'), 1024, 512, { bands: !!bands });
  return makeTex(c);
}

function legTexture() {
  const W = 256, H = 512;
  const c = canvas2d(W, H), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.00, '#d2a267');
  grad.addColorStop(0.45, '#a4713a');
  grad.addColorStop(0.80, '#5f4020');
  grad.addColorStop(1.00, '#3c2914');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // a few spots on the upper leg, fading out lower
  for (let i = 0; i < 22; i++) {
    const y = rand(6, 240);
    g.globalAlpha = Math.max(0, 1 - y / 280) * rand(0.5, 0.9);
    g.fillStyle = 'rgb(' + ((90 + Math.random() * 50) | 0) + ',' +
                     ((52 + Math.random() * 30) | 0) + ',' +
                     ((20 + Math.random() * 18) | 0) + ')';
    g.beginPath();
    const r = rand(8, 20);
    g.ellipse(rand(0, W), y, r, r * rand(0.6, 1), rand(0, 6.283), 0, 6.283);
    g.fill();
  }
  g.globalAlpha = 1;
  return makeTex(c);
}

function groundTexture() {
  const W = 512, H = 512;
  const c = canvas2d(W, H), g = c.getContext('2d');
  g.fillStyle = '#87794a';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    g.globalAlpha = rand(0.10, 0.26);
    g.fillStyle = Math.random() < 0.5 ? '#685f36' : '#a8945c';
    g.beginPath();
    g.ellipse(rand(0, W), rand(0, H), rand(18, 110), rand(14, 70), rand(0, 3), 0, 6.283);
    g.fill();
  }
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    g.strokeStyle = pick(['#7c6f3e', '#94844c', '#615830', '#a3925a', '#5a5230']);
    g.globalAlpha = rand(0.3, 0.65);
    g.lineWidth = 1;
    const l = rand(3, 10);
    const a = (Math.random() - 0.5) * 1.1 + Math.PI / 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y - Math.sin(a) * l);
    g.stroke();
  }
  g.globalAlpha = 1;
  return makeTex(c, 18, 18);
}

function sunSpriteTexture() {
  const c = canvas2d(128, 128), g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,252,235,1)');
  grad.addColorStop(0.25, 'rgba(255,244,200,0.85)');
  grad.addColorStop(0.6, 'rgba(255,230,160,0.22)');
  grad.addColorStop(1, 'rgba(255,230,160,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return makeTex(c);
}

/* ------------------------ lofted tube geometry ----------------------
   Sweeps a circular cross-section along a chain of points with a
   per-point radius. Exact radial normals (no computeVertexNormals).   */
function loftGeometry(points, radii, radial) {
  radial = radial || 20;
  const n = points.length;
  const pos = [], uv = [], nrm = [], idx = [];

  const tangent = (i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a);
    if (t.lengthSq() < 1e-10) t.set(0, 0, 1);
    return t.normalize();
  };

  for (let i = 0; i < n; i++) {
    const p = points[i], r = radii[i];
    const t = tangent(i);
    const upRef = Math.abs(t.y) > 0.94 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(t, upRef).normalize();
    const v = new THREE.Vector3().crossVectors(t, u).normalize();
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(
        p.x + (ca * u.x + sa * v.x) * r,
        p.y + (ca * u.y + sa * v.y) * r,
        p.z + (ca * u.z + sa * v.z) * r
      );
      nrm.push(ca * u.x + sa * v.x, ca * u.y + sa * v.y, ca * u.z + sa * v.z);
      uv.push(j / radial, i / (n - 1));
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + (radial + 1);
      const c2 = a + 1;
      const d = b + 1;
      idx.push(a, c2, b, b, c2, d);
    }
  }
  // end caps
  const cap0 = pos.length / 3;
  pos.push(points[0].x, points[0].y, points[0].z);
  const t0 = tangent(0);
  nrm.push(-t0.x, -t0.y, -t0.z);
  uv.push(0.5, 0);
  const cap1 = pos.length / 3;
  pos.push(points[n - 1].x, points[n - 1].y, points[n - 1].z);
  const t1 = tangent(n - 1);
  nrm.push(t1.x, t1.y, t1.z);
  uv.push(0.5, 1);
  for (let j = 0; j < radial; j++) {
    idx.push(cap0, j, j + 1);
    idx.push(cap1, (n - 1) * (radial + 1) + j + 1, (n - 1) * (radial + 1) + j);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

/* ------------------------- renderer & scene ------------------------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  document.getElementById('nogl').style.display = 'grid';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdce5d5, 70, 300);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 900);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* -------------------------------- sky ------------------------------- */
{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top:    { value: new THREE.Color(0x5f9fd6) },
      bottom: { value: new THREE.Color(0xdce5d5) }
    },
    vertexShader: [
      'varying vec3 vP;',
      'void main() {',
      '  vP = position;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 top; uniform vec3 bottom; varying vec3 vP;',
      'void main() {',
      '  float h = clamp(normalize(vP).y, 0.0, 1.0);',
      '  gl_FragColor = vec4(mix(bottom, top, pow(h, 0.75)), 1.0);',
      '}'
    ].join('\n')
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), skyMat);
  scene.add(sky);
}

/* ------------------------------- ground ----------------------------- */
{
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(170, 64),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

/* ------------------------------- lights ----------------------------- */
scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x8a7a50, 0.8));

const sun = new THREE.DirectionalLight(0xfff1d6, 1.65);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
sun.shadow.camera.left = -15;
sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15;
sun.shadow.camera.bottom = -15;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);

const fill = new THREE.DirectionalLight(0xbcd4e8, 0.35);
fill.position.set(-12, 8, -10);
scene.add(fill);

const SUN_DIR = new THREE.Vector3(0.55, 0.78, 0.35).normalize();
{
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunSpriteTexture(), fog: false, depthWrite: false
  }));
  spr.scale.set(46, 46, 1);
  spr.position.copy(SUN_DIR).multiplyScalar(380);
  scene.add(spr);
}

/* ----------------------------- vegetation --------------------------- */
const barkMat  = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 1 });
const leafMat  = new THREE.MeshStandardMaterial({ color: 0x4c6b3c, roughness: 1 });
const rockMat  = new THREE.MeshStandardMaterial({ color: 0x5d574c, roughness: 1 });
const bushMat  = new THREE.MeshStandardMaterial({ color: 0x4d5a33, roughness: 1 });

function makeTree(x, z, s) {
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.22 * s, 2.4 * s, 7), barkMat);
  trunk.position.y = 1.2 * s;
  trunk.rotation.z = rand(-0.1, 0.1);
  trunk.castShadow = true;
  t.add(trunk);
  const nb = 3;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * 6.283 + rand(-0.4, 0.4);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.08 * s, 1.5 * s, 5), barkMat);
    b.position.set(Math.cos(a) * 0.42 * s, 2.6 * s, Math.sin(a) * 0.42 * s);
    b.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
    b.castShadow = true;
    t.add(b);
  }
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.7 * s, 12, 8), leafMat);
  canopy.position.y = 3.35 * s;
  canopy.scale.set(1.5, 0.3, 1.5);
  canopy.castShadow = true;
  t.add(canopy);
  t.position.set(x, 0, z);
  return t;
}

const CIRCLE_R = 26; // the giraffe walks on this circle
for (let i = 0; i < 9; i++) {
  const a = rand(0, 6.283);
  const r = rand(42, 105);
  scene.add(makeTree(Math.sin(a) * r, Math.cos(a) * r, rand(0.8, 1.7)));
}
for (let i = 0; i < 22; i++) {
  const a = rand(0, 6.283);
  const r = rand(4, 120);
  const s = rand(0.4, 1.1);
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), bushMat);
  bush.position.set(Math.sin(a) * r, s * 0.4, Math.cos(a) * r);
  bush.scale.set(rand(0.8, 1.4), 0.45, rand(0.8, 1.4));
  bush.rotation.y = rand(0, 6.283);
  bush.castShadow = true;
  scene.add(bush);
}
for (let i = 0; i < 10; i++) {
  const a = rand(0, 6.283);
  const r = rand(8, 110);
  const s = rand(0.25, 0.8);
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
  rock.position.set(Math.sin(a) * r, s * 0.35, Math.cos(a) * r);
  rock.scale.y = 0.65;
  rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
  rock.castShadow = true;
  scene.add(rock);
}

/* ============================ THE GIRAFFE ============================ */
const matCoat   = new THREE.MeshStandardMaterial({ map: coatTexture(true), roughness: 0.92, side: THREE.DoubleSide });
const matCoat2  = new THREE.MeshStandardMaterial({ map: coatTexture(false), roughness: 0.92, side: THREE.DoubleSide });
const matLeg    = new THREE.MeshStandardMaterial({ map: legTexture(), roughness: 0.95 });
const matMane   = new THREE.MeshStandardMaterial({ color: 0x3d2410, roughness: 1 });
const matDark   = new THREE.MeshStandardMaterial({ color: 0x4a2e15, roughness: 0.9 });
const matHoof   = new THREE.MeshStandardMaterial({ color: 0x241811, roughness: 0.55 });
const matMuzzle = new THREE.MeshStandardMaterial({ color: 0x7a4e2c, roughness: 0.95 });
const matNose   = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.9 });
const matEye    = new THREE.MeshStandardMaterial({ color: 0x140d07, roughness: 0.25 });
const matMouth  = new THREE.MeshStandardMaterial({ color: 0x402818, roughness: 0.9 });

const giraffe = new THREE.Group();
scene.add(giraffe);

/* torso */
const bodyGroup = new THREE.Group(); // bobs & rolls while walking
giraffe.add(bodyGroup);

const torsoPts = [
  new THREE.Vector3(0, 1.42, -1.15),
  new THREE.Vector3(0, 1.55, -0.60),
  new THREE.Vector3(0, 1.62,  0.05),
  new THREE.Vector3(0, 1.70,  0.60),
  new THREE.Vector3(0, 1.82,  1.00)
];
const torsoRadii = [0.33, 0.41, 0.45, 0.46, 0.39];
const torso = new THREE.Mesh(loftGeometry(torsoPts, torsoRadii, 22), matCoat);
torso.castShadow = true;
bodyGroup.add(torso);

/* neck — two articulated segments + head */
const NECK_TILT = 0.22, NECK_TILT2 = 0.09, HEAD_TILT = 0.10;

const neckLower = new THREE.Group();
neckLower.position.set(0, 1.84, 0.88);
neckLower.rotation.x = NECK_TILT;
bodyGroup.add(neckLower);

// collar: covers the torso/neck seam so no end cap is visible
{
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.36, 0.42, 16), matCoat2);
  collar.position.y = 0.03;
  collar.castShadow = true;
  neckLower.add(collar);
}

{
  const pts = [
    new THREE.Vector3(0, 0.00, 0.000),
    new THREE.Vector3(0, 0.55, 0.045),
    new THREE.Vector3(0, 1.08, 0.110)
  ];
  const neckMesh = new THREE.Mesh(loftGeometry(pts, [0.240, 0.210, 0.185], 16), matCoat2);
  neckMesh.castShadow = true;
  neckLower.add(neckMesh);

  const maneCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.32, -0.13),
    new THREE.Vector3(0, 0.77, -0.07),
    new THREE.Vector3(0, 1.21,  0.00)
  ]);
  const mane = new THREE.Mesh(new THREE.TubeGeometry(maneCurve, 10, 0.068, 6), matMane);
  mane.castShadow = true;
  neckLower.add(mane);
}

const neckUpper = new THREE.Group();
neckUpper.position.set(0, 1.08, 0.11);
neckUpper.rotation.x = NECK_TILT2;
neckLower.add(neckUpper);

{
  const pts = [
    new THREE.Vector3(0, 0.00, 0.000),
    new THREE.Vector3(0, 0.45, 0.020),
    new THREE.Vector3(0, 0.88, 0.060)
  ];
  const neckMesh = new THREE.Mesh(loftGeometry(pts, [0.180, 0.160, 0.135], 16), matCoat2);
  neckMesh.castShadow = true;
  neckUpper.add(neckMesh);

  const maneCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.20, -0.100),
    new THREE.Vector3(0, 0.63, -0.060),
    new THREE.Vector3(0, 0.97, -0.020)
  ]);
  const mane = new THREE.Mesh(new THREE.TubeGeometry(maneCurve, 8, 0.062, 6), matMane);
  mane.castShadow = true;
  neckUpper.add(mane);
}

/* head */
const head = new THREE.Group();
head.position.set(0, 0.88, 0.06);
head.rotation.x = HEAD_TILT;
head.scale.setScalar(1.25);
neckUpper.add(head);

let earL, earR;

{
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), matCoat2);
  skull.scale.set(0.85, 0.8, 1.1);
  skull.position.set(0, 0.05, 0.10);
  skull.castShadow = true;
  head.add(skull);

  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.10, 14, 10), matCoat2);
  jaw.scale.set(1.0, 0.62, 1.45);
  jaw.position.set(0, -0.05, 0.18);
  head.add(jaw);

  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.115, 0.28, 14), matMuzzle);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, -0.035, 0.30);
  head.add(muzzle);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), matNose);
  nose.scale.set(1, 0.75, 0.85);
  nose.position.set(0, -0.015, 0.44);
  head.add(nose);

  const nostrilGeo = new THREE.SphereGeometry(0.015, 8, 6);
  for (const s of [-1, 1]) {
    const nostril = new THREE.Mesh(nostrilGeo, matHoof);
    nostril.position.set(0.034 * s, 0.012, 0.505);
    head.add(nostril);
  }

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.014, 0.02), matMouth);
  mouth.position.set(0, -0.115, 0.385);
  head.add(mouth);

  const eyeGeo = new THREE.SphereGeometry(0.035, 12, 10);
  const glintGeo = new THREE.SphereGeometry(0.008, 8, 6);
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, matEye);
    eye.position.set(0.115 * s, 0.08, 0.18);
    head.add(eye);
    const glint = new THREE.Mesh(glintGeo, glintMat);
    glint.position.set(0.123 * s, 0.093, 0.205);
    head.add(glint);
  }

  // ossicones
  const ossCyl = new THREE.CylinderGeometry(0.028, 0.034, 0.16, 8);
  const ossBall = new THREE.SphereGeometry(0.055, 10, 8);
  for (const s of [-1, 1]) {
    const o = new THREE.Group();
    const stem = new THREE.Mesh(ossCyl, matDark);
    stem.position.y = 0.08;
    o.add(stem);
    const knob = new THREE.Mesh(ossBall, matDark);
    knob.position.y = 0.165;
    o.add(knob);
    o.position.set(0.055 * s, 0.175, 0.0);
    o.rotation.z = -0.09 * s;
    o.traverse(m => { if (m.isMesh) m.castShadow = true; });
    head.add(o);
  }

  // ears (kept in module scope for the twitch animation)
  const earGeo = new THREE.SphereGeometry(0.12, 12, 10);
  earL = new THREE.Mesh(earGeo, matCoat2);
  earL.scale.set(0.3, 0.55, 1.0);
  earL.position.set(-0.155, 0.16, -0.04);
  earL.rotation.set(0.15, -0.5, -0.5);
  head.add(earL);
  earR = new THREE.Mesh(earGeo, matCoat2);
  earR.scale.set(0.3, 0.55, 1.0);
  earR.position.set(0.155, 0.16, -0.04);
  earR.rotation.set(0.15, 0.5, 0.5);
  head.add(earR);

  // forelock
  const forelock = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), matMane);
  forelock.scale.set(0.7, 0.42, 1.25);
  forelock.position.set(0, 0.165, 0.02);
  head.add(forelock);
}

/* legs — root at shoulder/hip, knee/hock group, hoof */
const FRONT_REST = 0.06, REAR_REST = -0.13;
function buildLeg(front, side) {
  const L1 = front ? 1.00 : 0.98; // upper (thigh / shoulder)
  const L2 = front ? 0.86 : 0.76; // lower (shin / metatarsal)
  const root = new THREE.Group();
  root.position.set(side * (front ? 0.42 : 0.40), front ? 1.94 : 1.82, front ? 0.95 : -1.00);
  root.rotation.x = front ? FRONT_REST : REAR_REST;

  const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(front ? 0.145 : 0.175, front ? 0.10 : 0.10, L1, 12), matLeg);
  upper.position.y = -L1 / 2;
  upper.castShadow = true;
  root.add(upper);

  // shoulder / hip mass, mostly buried in the torso so it reads as body, not a ball
  const bulge = new THREE.Mesh(new THREE.SphereGeometry(front ? 0.21 : 0.24, 12, 10), matLeg);
  bulge.position.set(-side * (front ? 0.09 : 0.05), front ? -0.10 : -0.16, 0);
  bulge.scale.set(0.7, 0.85, 1.15);
  bulge.castShadow = true;
  root.add(bulge);

  const knee = new THREE.Group();
  knee.position.y = -L1;
  root.add(knee);

  if (!front) {
    const hock = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), matLeg);
    hock.position.set(0, 0.02, -0.045);
    hock.castShadow = true;
    knee.add(hock);
  }

  const lower = new THREE.Mesh(
    new THREE.CylinderGeometry(front ? 0.075 : 0.065, front ? 0.055 : 0.048, L2, 10), matLeg);
  lower.position.y = -L2 / 2;
  lower.castShadow = true;
  knee.add(lower);

  const hoof = new THREE.Mesh(new THREE.SphereGeometry(0.078, 10, 8), matHoof);
  hoof.scale.set(0.9, 0.62, 1.15);
  hoof.position.y = -L2 - 0.03;
  knee.add(hoof);

  return { root, knee, front };
}

const legLF = buildLeg(true, -1);
const legRF = buildLeg(true, +1);
const legLR = buildLeg(false, -1);
const legRR = buildLeg(false, +1);
giraffe.add(legLF.root, legRF.root, legLR.root, legRR.root);

/* tail */
const tail = new THREE.Group();
tail.position.set(0, 1.46, -0.98);
tail.rotation.x = 0.45;
{
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.045, 0.85, 8), matLeg);
  stem.position.y = -0.42;
  stem.castShadow = true;
  tail.add(stem);
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.17, 8), matDark);
  tuft.position.y = -0.94;
  tuft.rotation.x = Math.PI;
  tail.add(tuft);
}
bodyGroup.add(tail);

/* ============================ ANIMATION ============================= */
const anim = {
  mode: 'walk',
  freq: 0, amp: 0,
  phase: 0,
  walkFreq: 0.62, walkAmp: 0.42,
  trotFreq: 1.12, trotAmp: 0.72,
  speed: 0,
  walkAngle: 0,
  headYaw: 0, headYawTarget: 0, nextHeadMove: 2.5,
  earTwitch: 0, earSide: 1, nextEar: 2,
  tailSwish: 0
};
const REAR_LAG = 0.5; // diagonal gait: hind legs trail their diagonal fore-leg

function setMode(m) {
  if (anim.mode === m) return;
  anim.mode = m;
  anim.tailSwish = 1;
}
window.addEventListener('keydown', (e) => {
  if (e.key === '1') setMode('stand');
  else if (e.key === '2') setMode('walk');
  else if (e.key === '3') setMode('trot');
});

function poseLeg(leg, phase) {
  const s = Math.sin(phase);
  const rest = leg.front ? FRONT_REST : REAR_REST;
  leg.root.rotation.x = rest + anim.amp * s;
  // flex the knee/hock while the limb swings forward (foot in the air).
  // The limb is at its rearmost position at phase = pi/2, forward at 3*pi/2,
  // so -cos(phase) peaks exactly mid forward-swing.
  const off = leg.front ? 0.0 : 0.35;
  const swing = Math.max(0, -Math.cos(phase - off));
  const bend = (leg.front ? 0.5 : 0.68) * 1.35 * anim.amp * swing;
  leg.knee.rotation.x = (leg.front ? 1 : -1) * bend;
}

function update(dt, t) {
  /* gait parameters ease toward the mode target */
  const tf = anim.mode === 'stand' ? 0 : anim.mode === 'trot' ? anim.trotFreq : anim.walkFreq;
  const ta = anim.mode === 'stand' ? 0 : anim.mode === 'trot' ? anim.trotAmp  : anim.walkAmp;
  anim.freq += (tf - anim.freq) * Math.min(1, dt * 2.2);
  anim.amp  += (ta - anim.amp)  * Math.min(1, dt * 2.2);
  anim.phase += dt * anim.freq * Math.PI * 2;
  const p = anim.phase;
  const moving = ta > 0 ? clamp(anim.amp / ta, 0, 1) : 0; // 0 at stand, 1 at full gait

  /* legs: diagonal pairing (LF+RR, RF+LR), hind legs trail */
  poseLeg(legLF, p);
  poseLeg(legRR, p - REAR_LAG);
  poseLeg(legRF, p + Math.PI);
  poseLeg(legLR, p + Math.PI - REAR_LAG);

  /* torso bob, roll, pitch (2x stride frequency) */
  bodyGroup.position.y = 0.045 * moving * Math.sin(2 * p);
  bodyGroup.rotation.z = 0.020 * moving * Math.sin(2 * p + Math.PI / 2);
  bodyGroup.rotation.x = 0.012 * moving * Math.sin(2 * p + 1.2);

  /* breathing while standing */
  const breathe = (1 - moving) * Math.sin(t * 1.8) * 0.012;
  torso.scale.y = 1 + breathe;

  /* neck sway & head motion */
  neckLower.rotation.x = NECK_TILT + 0.05 * moving * Math.sin(2 * p + 0.8) +
                         (1 - moving) * 0.02 * Math.sin(t * 0.7);
  neckUpper.rotation.x = NECK_TILT2 + 0.04 * moving * Math.sin(2 * p + 1.6);
  head.rotation.x = HEAD_TILT + 0.05 * moving * Math.sin(p + 2.1) +
                    (1 - moving) * 0.035 * Math.sin(t * 0.5);

  // occasional head turn
  if (t > anim.nextHeadMove) {
    anim.nextHeadMove = t + rand(3, 9);
    anim.headYawTarget = rand(-0.55, 0.55);
  }
  if (Math.abs(anim.headYawTarget) < 0.12 && Math.random() < dt * 0.4) anim.headYawTarget = 0;
  anim.headYaw += (anim.headYawTarget - anim.headYaw) * Math.min(1, dt * 1.2);
  head.rotation.y = anim.headYaw;

  /* ear twitch */
  if (t > anim.nextEar) {
    anim.nextEar = t + rand(2, 7);
    anim.earTwitch = 1;
    anim.earSide = Math.random() < 0.5 ? 1 : -1;
  }
  anim.earTwitch *= Math.exp(-dt * 6);
  const tw = anim.earTwitch * Math.sin(t * 22) * 0.4;
  earL.rotation.z = earLBaseRz + (anim.earSide === -1 ? tw : 0);
  earR.rotation.z = earRBaseRz - (anim.earSide === 1 ? tw : 0);

  /* tail */
  anim.tailSwish *= Math.exp(-dt * 1.4);
  tail.rotation.x = 0.45 + 0.12 * moving * Math.sin(2 * p + 2.4) +
                    anim.tailSwish * Math.sin(t * 9) * 0.5;
  tail.rotation.z = 0.07 * moving * Math.sin(2 * p + 1.0);

  /* walk along a circle */
  const maxSpeed = anim.mode === 'trot' ? 3.4 : 1.5;
  const targetSpeed = (anim.mode === 'stand' ? 0 : 1) * moving * maxSpeed;
  anim.speed += (targetSpeed - anim.speed) * Math.min(1, dt * 1.6);
  anim.walkAngle += dt * anim.speed / CIRCLE_R;
  giraffe.position.set(
    Math.sin(anim.walkAngle) * CIRCLE_R,
    0,
    Math.cos(anim.walkAngle) * CIRCLE_R
  );
  giraffe.rotation.y = Math.atan2(Math.cos(anim.walkAngle), -Math.sin(anim.walkAngle));

  /* sun follows the giraffe so shadows stay in the shadow frustum */
  sun.position.copy(giraffe.position).addScaledVector(SUN_DIR, 30);
  sun.target.position.copy(giraffe.position);
}

const earLBaseRz = earL.rotation.z;
const earRBaseRz = earR.rotation.z;

/* ========================= CAMERA & CONTROLS ======================== */
const cam = { az: 0.62, el: 0.30, dist: 8.5 };
const camTarget = new THREE.Vector3(0, 1.55, CIRCLE_R);
const camPos = new THREE.Vector3();
{
  const off = new THREE.Vector3(
    Math.sin(cam.az) * Math.cos(cam.el),
    Math.sin(cam.el),
    Math.cos(cam.az) * Math.cos(cam.el)
  ).multiplyScalar(cam.dist);
  camPos.copy(camTarget).add(off);
}
camera.position.copy(camPos);
camera.lookAt(camTarget);
let dragging = false, px = 0, py = 0, lastInteract = 0;

const el = renderer.domElement;
el.addEventListener('pointerdown', (e) => {
  dragging = true; px = e.clientX; py = e.clientY; lastInteract = clockT;
});
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  cam.az -= (e.clientX - px) * 0.005;
  cam.el = clamp(cam.el + (e.clientY - py) * 0.004, 0.05, 1.25);
  px = e.clientX; py = e.clientY;
  lastInteract = clockT;
});
window.addEventListener('pointerup', () => { dragging = false; });
el.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.dist = clamp(cam.dist * (1 + e.deltaY * 0.001), 3.5, 24);
  lastInteract = clockT;
}, { passive: false });

function updateCamera(dt, t) {
  // cinematic override: window.__camOverride = { pos: Vector3, at: Vector3 }
  if (window.__camOverride) {
    camera.position.copy(window.__camOverride.pos);
    camera.lookAt(window.__camOverride.at);
    return;
  }
  if (t - lastInteract > 6) cam.az += dt * 0.05; // gentle auto-orbit when idle
  const focus = giraffe.position.clone().add(new THREE.Vector3(0, 1.55, 0));
  const off = new THREE.Vector3(
    Math.sin(cam.az) * Math.cos(cam.el),
    Math.sin(cam.el),
    Math.cos(cam.az) * Math.cos(cam.el)
  ).multiplyScalar(cam.dist);
  const desired = focus.add(off);
  const k = 1 - Math.exp(-dt * 4);
  camPos.lerp(desired, k);
  camTarget.lerp(focus, k);
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
}

/* ============================== MAIN LOOP =========================== */
const clock = new THREE.Clock();
let clockT = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  clockT += dt;
  update(dt, clockT);
  updateCamera(dt, clockT);
  renderer.render(scene, camera);
});
