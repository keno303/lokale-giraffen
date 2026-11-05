/*
 * Walking giraffe — fully procedural Three.js scene.
 *
 * Runs by opening index.html directly (file://). Classic scripts only:
 * no modules, no fetch, no build step. Depends only on three.min.js (r149).
 *
 * The giraffe is built from primitive solids with a hierarchical rig:
 *  - 4-segment neck chain with mane, animated head
 *  - four 2-bone legs driven by analytic IK; hooves are placed on the
 *    ground along a planted-foot trajectory so they never slide
 *  - lateral-sequence walk gait (giraffes move same-side legs nearly together)
 *  - body bob / roll / sway, tail swing, ear flicks, idle behaviour
 */
(function () {
'use strict';

/* r149 legacy color mode treats hex colors as linear → washed out under
   sRGB output encoding. Proper sRGB→linear conversion keeps intended tones. */
THREE.ColorManagement.legacyMode = false;

/* ---------------------------------------------------------------- utils */
var TAU = Math.PI * 2;
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(t) { return t * t * (3 - 2 * t); }
function rand(a, b) { return a + Math.random() * (b - a); }

function hsl2rgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  var p = 2 * l - q;
  function f(t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/* --------------------------------------------------------- procedural textures */

/* Reticulated giraffe coat: seamless (torus-distance) Voronoi patches with
   cream seams. One texture is generated; parts vary spot scale via repeat. */
function makeHideTexture(size, gridN, seamFrac) {
  var cv = document.createElement('canvas');
  cv.width = cv.height = size;
  var ctx = cv.getContext('2d');
  var img = ctx.createImageData(size, size);
  var data = img.data;
  var seeds = [];
  for (var gy = 0; gy < gridN; gy++) {
    for (var gx = 0; gx < gridN; gx++) {
      seeds.push({
        x: (gx + 0.06 + Math.random() * 0.88) / gridN * size,
        y: (gy + 0.06 + Math.random() * 0.88) / gridN * size,
        h: 20 + Math.random() * 14,
        s: 0.50 + Math.random() * 0.15,
        l: 0.34 + Math.random() * 0.11
      });
    }
  }
  var seam = size / gridN * seamFrac;
  var half = size / 2;
  for (var py = 0; py < size; py++) {
    for (var px = 0; px < size; px++) {
      var d1 = 1e9, d2 = 1e9, best = null;
      for (var i = 0; i < seeds.length; i++) {
        var s = seeds[i];
        var dx = Math.abs(px + 0.5 - s.x); if (dx > half) dx = size - dx;
        var dy = Math.abs(py + 0.5 - s.y); if (dy > half) dy = size - dy;
        var d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; best = s; }
        else if (d < d2) { d2 = d; }
      }
      d1 = Math.sqrt(d1); d2 = Math.sqrt(d2);
      var o = (py * size + px) * 4, r, g, b;
      if (d2 - d1 < seam) {
        var n = (Math.random() - 0.5) * 9;
        r = 236 + n; g = 223 + n; b = 194 + n;      // cream seam
      } else {
        var t = clamp((d2 - d1 - seam) / (size * 0.030), 0, 1);
        var li = best.l * (0.88 + 0.14 * t) + (Math.random() - 0.5) * 0.02;
        var rgb = hsl2rgb(best.h, best.s, clamp(li, 0, 1));
        r = rgb[0] * 255; g = rgb[1] * 255; b = rgb[2] * 255;
      }
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  var tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function makeGroundTexture(size) {
  var cv = document.createElement('canvas');
  cv.width = cv.height = size;
  var ctx = cv.getContext('2d');
  ctx.fillStyle = '#c9ab73';
  ctx.fillRect(0, 0, size, size);
  var i, x, y, r;
  for (i = 0; i < 30; i++) {                       // large soft patches
    x = Math.random() * size; y = Math.random() * size;
    r = size * (0.05 + Math.random() * 0.13);
    var grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    var c = Math.random() < 0.5 ? '138,111,66' : '226,203,146';
    grd.addColorStop(0, 'rgba(' + c + ',0.15)');
    grd.addColorStop(1, 'rgba(' + c + ',0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  ctx.lineWidth = 1;
  for (i = 0; i < 2800; i++) {                     // dry-grass strokes
    x = Math.random() * size; y = Math.random() * size;
    var len = 2 + Math.random() * 5;
    var ang = rand(-0.7, 0.7) + (Math.random() < 0.5 ? 0 : Math.PI / 2);
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(122,96,56,0.24)' : 'rgba(236,216,162,0.22)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
  var tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function makeSkyTexture() {
  var cv = document.createElement('canvas');
  cv.width = 4; cv.height = 512;
  var ctx = cv.getContext('2d');
  var g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.00, '#3e6fb2');
  g.addColorStop(0.35, '#7aa6d8');
  g.addColorStop(0.62, '#b9cfe4');
  g.addColorStop(0.82, '#eae5d3');
  g.addColorStop(1.00, '#f2e3c4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 512);
  var tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

/* ---------------------------------------------------------------- renderer */
var renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
document.body.appendChild(renderer.domElement);
var MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

var scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdfd8c3, 60, 340);

var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1500);

/* ---------------------------------------------------------------- lighting */
var hemi = new THREE.HemisphereLight(0xbdd2ec, 0x8f7a55, 0.75);
scene.add(hemi);

var sun = new THREE.DirectionalLight(0xfff1dc, 1.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
sun.shadow.camera.near = 6; sun.shadow.camera.far = 70;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);
var SUN_DIR = new THREE.Vector3(-0.5, 0.85, 0.55).normalize();

/* ------------------------------------------------------------ environment */
var skyTex = makeSkyTexture();
var sky = new THREE.Mesh(
  new THREE.SphereGeometry(480, 24, 16),
  new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
);
sky.renderOrder = -1;
scene.add(sky);

var groundTex = makeGroundTexture(512);
groundTex.repeat.set(90, 90);
groundTex.anisotropy = MAX_ANISO;
var ground = new THREE.Mesh(
  new THREE.PlaneGeometry(700, 700),
  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1.0, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* ------------------------------------------------------------------ giraffe */

var hideTex = makeHideTexture(512, 10, 0.11);

function hideMat(rx, ry, ox, oy, rough) {
  var t = hideTex.clone();
  t.needsUpdate = true;
  t.repeat.set(rx, ry);
  t.offset.set(ox, oy);
  t.anisotropy = MAX_ANISO;
  return new THREE.MeshStandardMaterial({ map: t, roughness: rough || 0.92, metalness: 0 });
}

/* NOTE: CapsuleGeometry UVs run u ALONG the axis, v around — repeats are
   chosen per part so spots stay roughly isotropic in world space. */
var matBody = hideMat(2.4, 1.7, 0.00, 0.00);   // spheres: u around, v pole-pole
var matNeck = hideMat(2.2, 1.5, 0.31, 0.00);   // cylinders: u around, v along (uniform)
var matHead = hideMat(1.6, 1.6, 0.55, 0.55);
var matLeg  = hideMat(1.5, 2.0, 0.10, 0.40);
var matDark  = new THREE.MeshStandardMaterial({ color: 0x3c332c, roughness: 0.62 });
var matMane  = new THREE.MeshStandardMaterial({ color: 0x5f3d22, roughness: 0.95 });
var matMuzzle = new THREE.MeshStandardMaterial({ color: 0x9b8168, roughness: 0.85 });
var matHorn  = new THREE.MeshStandardMaterial({ color: 0x6b5138, roughness: 0.7 });
var matEye   = new THREE.MeshStandardMaterial({ color: 0x191310, roughness: 0.25 });
var matTuft  = new THREE.MeshStandardMaterial({ color: 0x2e2118, roughness: 0.95 });

function ell(rx, ry, rz, mat, x, y, z, seg) {
  var m = new THREE.Mesh(new THREE.SphereGeometry(1, seg || 22, Math.max(10, (seg || 22) - 6)), mat);
  m.scale.set(rx, ry, rz);
  m.position.set(x, y, z);
  return m;
}

/* Bone: cylinder (clean, uniform UVs) + spherical end caps, pivot at TOP,
   extends down to y = -len. CapsuleGeometry rejected: its lathe UVs are
   non-uniform along the axis, which mangles the coat pattern. */
function boneMesh(r, len, mat, taper) {
  taper = taper || 0;
  var g = new THREE.Group();
  var cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(r * (1 + taper), r * (1 - taper), len, 14, 1),
    mat
  );
  cyl.position.y = -len / 2;
  g.add(cyl);
  var capT = new THREE.Mesh(new THREE.SphereGeometry(r * (1 + taper), 14, 10), mat);
  g.add(capT);
  var capB = new THREE.Mesh(new THREE.SphereGeometry(r * (1 - taper), 14, 10), mat);
  capB.position.y = -len;
  g.add(capB);
  return g;
}

var HOOF_H = 0.10;   // hoof block height (foot target sits this high)

function buildLeg(isFront, side) {
  var pivot = new THREE.Group();
  var a = isFront ? 1.05 : 1.06;    // upper segment (shoulder/hip -> knee)
  var b = isFront ? 0.88 : 0.88;    // lower segment (knee -> fetlock)

  var upper = new THREE.Group();
  pivot.add(upper);
  upper.add(boneMesh(isFront ? 0.125 : 0.15, a + 0.10, matLeg, 0.22));
  if (!isFront) {                   // thigh mass + hock suggest hind anatomy
    var thigh = ell(0.20, 0.34, 0.24, matLeg, 0, -0.34, 0.05);
    thigh.rotation.x = 0.35;
    upper.add(thigh);
  }

  var lower = new THREE.Group();
  lower.position.y = -a;
  upper.add(lower);
  lower.add(boneMesh(isFront ? 0.085 : 0.095, b + 0.06, matLeg, 0.28));
  if (!isFront) {
    var hock = ell(0.075, 0.11, 0.07, matLeg, 0, -0.17, -0.08);
    lower.add(hock);
  }

  var hoof = new THREE.Group();
  hoof.position.y = -b;
  lower.add(hoof);
  var hoofMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.078, HOOF_H, 10), matDark);
  hoofMesh.scale.z = 1.25;
  hoofMesh.position.y = -HOOF_H / 2;
  hoof.add(hoofMesh);

  return { pivot: pivot, upper: upper, lower: lower, hoof: hoof, a: a, b: b, isFront: isFront };
}

/* Analytic 2-bone IK in the sagittal plane. tz forward(+)/back(-), ty down(-),
   both relative to the leg pivot. Knee (stifle) bends forward for all legs,
   which matches giraffe fore- and hind-limb swing. */
function solveLeg(leg, tz, ty) {
  var a = leg.a, b = leg.b;
  var d = clamp(Math.sqrt(tz * tz + ty * ty), Math.abs(a - b) + 0.05, a + b - 0.02);
  var phi = Math.atan2(-ty, tz);                                   // hip->foot below horizon
  var alpha = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  var beta = Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
  leg.upper.rotation.x = (phi - alpha) - Math.PI / 2;
  leg.lower.rotation.x = Math.PI - beta;
}

var giraffe = new THREE.Group();
giraffe.rotation.y = Math.PI / 2;      // local +Z (forward) -> world +X
scene.add(giraffe);

var body = new THREE.Group();          // bob / sway / roll applied here
giraffe.add(body);

/* torso — deep chest, sloping back, rounded rump; narrow for its depth */
var chest = ell(0.50, 0.53, 0.85, matBody, 0, 2.02, 0.70);
var mid = ell(0.47, 0.50, 0.85, matBody, 0, 1.98, -0.05);
var rear = ell(0.44, 0.45, 0.66, matBody, 0, 1.92, -0.72);
var brisket = ell(0.26, 0.18, 0.24, matBody, 0, 1.60, 1.05);
var withers = ell(0.30, 0.26, 0.45, matBody, 0, 2.40, 0.55);   // fills neck-base notch
body.add(chest, mid, rear, brisket, withers);

/* dorsal mane crest along the spine (back slopes down toward the rump) */
var spineMane = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 1.85), matMane);
spineMane.position.set(0, 2.44, -0.20);
spineMane.rotation.x = -0.115;   // Rx(+θ) tips +Z down; we want the rump end lower
body.add(spineMane);

/* neck — 4-segment chain, each segment tilts a bit more vertical */
var NECK = [
  { l: 0.62, r: 0.265, tilt: 0.42 },
  { l: 0.60, r: 0.230, tilt: 0.28 },
  { l: 0.58, r: 0.196, tilt: 0.20 },
  { l: 0.52, r: 0.166, tilt: 0.14 }
];
var neckBase = new THREE.Group();
neckBase.position.set(0, 2.38, 0.78);
body.add(neckBase);
var neckSegs = [];
var neckParent = neckBase;
var prevLen = 0;
var cumTilt = 0;
for (var ni = 0; ni < NECK.length; ni++) {
  var ns = NECK[ni];
  var seg = new THREE.Group();
  seg.position.y = prevLen;      // chain: each segment starts at the top of the previous
  seg.rotation.x = ns.tilt;
  neckParent.add(seg);
  prevLen = ns.l;

  var overlap = ni === 0 ? 0.55 : 0.34;          // seg1 sinks deeper into the torso
  var tube = boneMesh(ns.r, ns.l + overlap, matNeck, 0.10);
  tube.rotation.z = Math.PI;                     // boneMesh points down; neck grows up
  seg.add(tube);

  var mane = new THREE.Mesh(new THREE.BoxGeometry(0.09, ns.l + 0.22, 0.06), matMane);
  mane.position.set(0, ns.l / 2, -(ns.r + 0.005));  // low crest, mostly sunk into the neck
  seg.add(mane);

  neckSegs.push({ group: seg, tilt: ns.tilt });
  cumTilt += ns.tilt;
  neckParent = seg;
}

/* head */
var head = new THREE.Group();
head.position.y = NECK[NECK.length - 1].l;   // sit at the top of the last neck segment
head.rotation.x = -(cumTilt + 0.21);   // muzzle ~12° above horizon
neckParent.add(head);

var skull = ell(0.155, 0.175, 0.26, matHead, 0, 0.03, 0.10);
var face = ell(0.125, 0.14, 0.20, matHead, 0, 0.00, 0.30);
var muzzle = ell(0.105, 0.10, 0.16, matMuzzle, 0, -0.055, 0.45);
var noseTip = ell(0.075, 0.065, 0.07, matDark, 0, -0.06, 0.56);
var jaw = ell(0.085, 0.06, 0.17, matHead, 0, -0.135, 0.35);
head.add(skull, face, muzzle, noseTip, jaw);

var eyeL = ell(0.052, 0.052, 0.045, matEye, 0.148, 0.075, 0.16, 12);
var eyeR = ell(0.052, 0.052, 0.045, matEye, -0.148, 0.075, 0.16, 12);
var glintMat = new THREE.MeshBasicMaterial({ color: 0xf5efe2 });
var glintL = ell(0.014, 0.014, 0.010, glintMat, 0.168, 0.095, 0.185, 8);
var glintR = ell(0.014, 0.014, 0.010, glintMat, -0.168, 0.095, 0.185, 8);
head.add(eyeL, eyeR, glintL, glintR);

var nostrilL = ell(0.013, 0.013, 0.013, matDark, 0.042, -0.015, 0.555, 8);
var nostrilR = ell(0.013, 0.013, 0.013, matDark, -0.042, -0.015, 0.555, 8);
head.add(nostrilL, nostrilR);

/* ossicones */
var horns = [];
[1, -1].forEach(function (s) {
  var h = new THREE.Group();
  h.position.set(0.062 * s, 0.24, 0.02);
  h.rotation.z = -0.14 * s;
  var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.030, 0.16, 8), matHorn);
  shaft.position.y = 0.08;
  h.add(shaft);
  var knob = ell(0.042, 0.046, 0.042, matDark, 0, 0.17, 0, 10);
  h.add(knob);
  head.add(h);
  horns.push(h);
});

/* ears (pivot groups so they can flick) */
var ears = [];
[1, -1].forEach(function (s) {
  var ear = new THREE.Group();
  ear.position.set(0.145 * s, 0.155, -0.04);
  ear.rotation.z = s * -1.05;                 // splay outward
  ear.rotation.x = -0.35;                     // tip backward
  var shell = ell(0.030, 0.105, 0.058, matHead, 0.02 * s, 0.07, 0, 12);
  ear.add(shell);
  var inner = ell(0.018, 0.075, 0.040, matMuzzle, 0.028 * s, 0.07, 0.012, 10);
  ear.add(inner);
  head.add(ear);
  ears.push({ group: ear, baseX: -0.35, timer: rand(1.5, 7), flick: 0, dir: s });
});

/* tail */
var tail = new THREE.Group();
tail.position.set(0, 2.28, -1.26);
tail.rotation.x = 0.22;
body.add(tail);
var tail1 = boneMesh(0.042, 0.55, matLeg, 0.3);  // spans 0..-0.55
tail.add(tail1);
var tail2Group = new THREE.Group();
tail2Group.position.y = -0.55;
tail.add(tail2Group);
var tail2 = boneMesh(0.032, 0.48, matLeg, 0.3);
tail2Group.add(tail2);
var tuft = ell(0.05, 0.15, 0.05, matTuft, 0, -0.56, 0, 10);
tail2Group.add(tuft);

/* legs — lateral-sequence walk: LH, LF, RH, RF (same-side pairs nearly together) */
var legDefs = [
  { pos: [ 0.335, 2.01, 0.68], front: true,  side: 1, phase: 0.12 },  // left front
  { pos: [-0.335, 2.01, 0.68], front: true,  side: -1, phase: 0.62 }, // right front
  { pos: [ 0.360, 1.93, -0.62], front: false, side: 1, phase: 0.00 }, // left hind
  { pos: [-0.360, 1.93, -0.62], front: false, side: -1, phase: 0.50 } // right hind
];
var legs = legDefs.map(function (d) {
  var leg = buildLeg(d.front, d.side);
  leg.pivot.position.set(d.pos[0], d.pos[1], d.pos[2]);
  leg.phase = d.phase;
  leg.tz0 = (d.front ? 0.68 : -0.78) - d.pos[2];   // neutral hoof z relative to pivot
  leg.pivotY = d.pos[1];
  body.add(leg.pivot);
  return leg;
});

giraffe.traverse(function (o) {
  if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
});
sky.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

/* ------------------------------------------------------------------- props */
var props = [];
var PROP_SPAN = 120;

function makeAcacia() {
  var g = new THREE.Group();
  var trunkMat = new THREE.MeshStandardMaterial({ color: 0x6e4e2f, roughness: 0.95 });
  var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.30, 3.2, 7), trunkMat);
  trunk.position.y = 1.6;
  g.add(trunk);
  for (var i = 0; i < 3; i++) {
    var br = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.09, 1.7, 5), trunkMat);
    br.position.set(rand(-0.5, 0.5), 2.9 + rand(0, 0.4), rand(-0.5, 0.5));
    br.rotation.set(rand(-0.7, 0.7), rand(0, TAU), rand(-0.7, 0.7));
    g.add(br);
  }
  var canopyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.21, 0.32, rand(0.30, 0.38)), roughness: 0.95 });
  var c1 = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 9), canopyMat);
  c1.scale.set(rand(2.1, 2.9), rand(0.6, 0.9), rand(2.1, 2.9));
  c1.position.y = 3.7;
  g.add(c1);
  var c2 = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), canopyMat);
  c2.scale.set(rand(1.2, 1.7), rand(0.5, 0.7), rand(1.2, 1.7));
  c2.position.set(rand(-1, 1), 3.3, rand(-1, 1));
  g.add(c2);
  return g;
}

function makeRock() {
  var m = new THREE.Mesh(
    new THREE.IcosahedronGeometry(rand(0.3, 1.15), 0),
    new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.09, 0.10, rand(0.42, 0.55)), roughness: 1, flatShading: true })
  );
  m.scale.y = rand(0.45, 0.65);
  m.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
  m.position.y = 0.05;
  var g = new THREE.Group();
  g.add(m);
  return g;
}

function makeGrassTuft() {
  var g = new THREE.Group();
  var mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.13, 0.38, rand(0.38, 0.52)), roughness: 1 });
  for (var i = 0; i < 3; i++) {
    var blade = new THREE.Mesh(new THREE.ConeGeometry(0.05, rand(0.35, 0.6), 5), mat);
    blade.position.set(rand(-0.1, 0.1), 0.18, rand(-0.1, 0.1));
    blade.rotation.set(rand(-0.25, 0.25), 0, rand(-0.25, 0.25));
    g.add(blade);
  }
  return g;
}

function placeProp(p, ahead) {
  var minZ = p.userData.minZ;
  var z = rand(-48, 48);
  if (Math.abs(z) < minZ) z = (z < 0 ? -1 : 1) * minZ;
  p.position.set(ahead ? rand(30, 60) : rand(-60, 60), 0, z);
  p.rotation.y = rand(0, TAU);
}

for (var ti = 0; ti < 9; ti++) {
  var tr = makeAcacia();
  tr.userData = { minZ: 6.5 };
  placeProp(tr, false);
  scene.add(tr); props.push(tr);
}
for (var ri = 0; ri < 12; ri++) {
  var rk = makeRock();
  rk.userData = { minZ: 4.5 };
  placeProp(rk, false);
  scene.add(rk); props.push(rk);
}
for (var gi = 0; gi < 55; gi++) {
  var gr = makeGrassTuft();
  gr.userData = { minZ: 2.0 };
  placeProp(gr, false);
  scene.add(gr); props.push(gr);
}

/* ------------------------------------------------------------------- state */
var GAIT = { T: 1.25, duty: 0.62, L: 0.78, lift: 0.22 };
var state = {
  walking: true,
  mult: 1.0,
  walkBlend: 0.0,   // eases 0..1; scales stride, lift and speed together
  p: 0,             // walk-cycle phase 0..1
  idleT: 0
};

/* ------------------------------------------------------------------ camera */
var camYaw = 0.95, camPitch = 0.17, camDist = 10.5;
var follow = true;
var camPos = new THREE.Vector3(-30, 6, 20);
var lookTarget = new THREE.Vector3();
var anchor = new THREE.Vector3();

function updateCamera(dt) {
  anchor.copy(follow ? giraffe.position : anchor);
  lookTarget.lerp(new THREE.Vector3(giraffe.position.x, 2.35, giraffe.position.z), 1 - Math.exp(-dt * 6));
  var cp = Math.cos(camPitch), sp = Math.sin(camPitch);
  var desired = new THREE.Vector3(
    anchor.x + Math.sin(camYaw) * cp * camDist,
    anchor.y + sp * camDist,
    anchor.z + Math.cos(camYaw) * cp * camDist
  );
  camPos.lerp(desired, 1 - Math.exp(-dt * 5));
  camera.position.copy(camPos);
  camera.lookAt(lookTarget);
}

/* pointer orbit + pinch zoom */
var pointers = new Map();
var lastPinch = 0;
renderer.domElement.addEventListener('contextmenu', function (e) { e.preventDefault(); });
renderer.domElement.addEventListener('pointerdown', function (e) {
  renderer.domElement.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
renderer.domElement.addEventListener('pointermove', function (e) {
  var pt = pointers.get(e.pointerId);
  if (!pt) return;
  var dx = e.clientX - pt.x, dy = e.clientY - pt.y;
  pt.x = e.clientX; pt.y = e.clientY;
  if (pointers.size === 1) {
    camYaw -= dx * 0.005;
    camPitch = clamp(camPitch + dy * 0.004, 0.04, 1.15);
  } else if (pointers.size === 2) {
    var arr = Array.from(pointers.values());
    var d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
    if (lastPinch > 0) camDist = clamp(camDist * lastPinch / d, 4, 34);
    lastPinch = d;
  }
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  lastPinch = 0;
}
renderer.domElement.addEventListener('pointerup', endPointer);
renderer.domElement.addEventListener('pointercancel', endPointer);
renderer.domElement.addEventListener('wheel', function (e) {
  e.preventDefault();
  camDist = clamp(camDist * Math.exp(e.deltaY * 0.0011), 4, 34);
}, { passive: false });

/* --------------------------------------------------------------------- HUD */
var modeBtn = document.getElementById('modeBtn');
var speedEl = document.getElementById('speed');
var speedVal = document.getElementById('speedVal');
var followEl = document.getElementById('follow');
modeBtn.addEventListener('click', function () {
  state.walking = !state.walking;
  modeBtn.textContent = state.walking ? 'Stop' : 'Walk';
});
speedEl.addEventListener('input', function () {
  state.mult = parseFloat(speedEl.value);
  speedVal.textContent = state.mult.toFixed(1) + '\u00d7';
});
followEl.addEventListener('change', function () {
  follow = followEl.checked;
  if (follow) anchor.copy(giraffe.position);
});

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------------ update */
function updateGiraffe(dt) {
  state.idleT += dt;
  var wb = state.walkBlend;
  wb = clamp(lerp(wb, state.walking ? 1 : 0, 1 - Math.exp(-dt * 1.5)), 0, 1);
  state.walkBlend = wb;

  var effT = GAIT.T / (0.55 + 0.45 * state.mult);   // faster speed -> quicker cycle
  state.p = (state.p + dt / effT) % 1;
  var p = state.p;

  var v = (GAIT.L / (GAIT.duty * effT)) * wb;       // m/s, matches planted hooves
  giraffe.position.x += v * dt;

  /* ground follows the giraffe; UV offset keeps the texture world-anchored */
  var TILE = 700 / 90;
  ground.position.x = giraffe.position.x;
  groundTex.offset.x = -giraffe.position.x / TILE;

  var idle = 1 - wb;

  /* body motion */
  var bob = (0.030 * Math.sin(TAU * 2 * p + 1.0)) * wb + idle * 0.004 * Math.sin(0.9 * state.idleT);
  body.position.y = bob;
  body.position.x = (0.022 * Math.sin(TAU * p + 0.4)) * wb + idle * 0.010 * Math.sin(0.35 * state.idleT);
  body.rotation.z = (0.028 * Math.sin(TAU * p + 0.9)) * wb + idle * 0.008 * Math.sin(0.22 * state.idleT);
  body.rotation.x = (0.010 * Math.sin(TAU * 2 * p + 2.2)) * wb;
  body.rotation.y = (0.020 * Math.sin(TAU * p + 1.7)) * wb;

  /* legs */
  for (var i = 0; i < legs.length; i++) {
    var leg = legs[i];
    var ph = (p + leg.phase) % 1;
    var relZ, lift = 0, swing = 0;
    if (ph < GAIT.duty) {
      var u = ph / GAIT.duty;
      relZ = (GAIT.L / 2 - u * GAIT.L) * wb;        // planted: moves back at body speed
    } else {
      swing = (ph - GAIT.duty) / (1 - GAIT.duty);
      relZ = (-GAIT.L / 2 + smoothstep(swing) * GAIT.L) * wb;
      lift = GAIT.lift * Math.sin(Math.PI * swing) * wb;
    }
    solveLeg(leg, leg.tz0 + relZ, HOOF_H + lift - bob - leg.pivotY);
    leg.hoof.rotation.x = 0.55 * Math.sin(Math.PI * swing) * wb;  // toe trails in swing
  }

  /* neck sway + head */
  for (var nj = 0; nj < neckSegs.length; nj++) {
    var segA = neckSegs[nj];
    segA.group.rotation.x = segA.tilt
      + wb * 0.022 * Math.sin(TAU * p + nj * 0.9 + 1.3)
      + idle * 0.030 * Math.sin(0.13 * state.idleT + nj * 1.1);
    segA.group.rotation.z = wb * 0.016 * Math.sin(TAU * p + nj * 0.7 + 0.5);
  }
  head.rotation.x = -(cumTilt + 0.21)
    + wb * 0.040 * Math.sin(TAU * 2 * p + 0.6)
    + idle * 0.05 * Math.sin(0.19 * state.idleT);
  head.rotation.y = wb * 0.055 * Math.sin(TAU * p + 0.2)
    + idle * (0.28 * Math.sin(0.21 * state.idleT) + 0.16 * Math.sin(0.47 * state.idleT + 2.0));
  head.rotation.z = wb * 0.02 * Math.sin(TAU * p + 1.1);

  /* breathing */
  chest.scale.y = 0.55 * (1 + 0.016 * Math.sin(state.idleT * 1.5));

  /* tail */
  tail.rotation.z = 0.20 * Math.sin(TAU * p + 0.7) * wb
    + idle * 0.30 * Math.sin(1.4 * state.idleT + 0.5);
  tail.rotation.x = 0.22 + wb * 0.05 * Math.sin(TAU * 2 * p);

  /* ear flicks */
  for (var ei = 0; ei < ears.length; ei++) {
    var ear = ears[ei];
    ear.timer -= dt;
    if (ear.timer <= 0 && ear.flick === 0) {
      ear.timer = rand(2.5, 9);
      ear.flick = 0.0001;
    }
    if (ear.flick > 0) {
      ear.flick += dt / 0.38;
      var k = Math.sin(Math.PI * clamp(ear.flick, 0, 1));
      ear.group.rotation.x = ear.baseX + 0.55 * k * ear.dir;
      if (ear.flick >= 1) { ear.flick = 0; ear.group.rotation.x = ear.baseX; }
    }
  }

  /* sun + shadow frustum follow the giraffe */
  sun.position.copy(giraffe.position).addScaledVector(SUN_DIR, 30);
  sun.position.y = Math.max(sun.position.y, 8);
  sun.target.position.copy(giraffe.position);
  sun.target.updateMatrixWorld();

  /* recycle props once they fall behind */
  for (var pi = 0; pi < props.length; pi++) {
    var pr = props[pi];
    if (pr.position.x - giraffe.position.x < -62) {
      placeProp(pr, true);
      pr.position.x += giraffe.position.x;   // placeProp sets absolute; shift ahead
    }
  }
}

/* -------------------------------------------------------------------- loop */
var clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  var dt = Math.min(clock.getDelta(), 0.05);
  updateGiraffe(dt);
  updateCamera(dt);
  sky.position.set(camera.position.x, 0, camera.position.z);
  renderer.render(scene, camera);
}
tick();

})();
