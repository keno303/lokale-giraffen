/* ==========================================================================
   Walking Giraffe — Three.js (classic script, no build step, runs from file://)
   Procedural geometry + canvas textures. No external assets.
   ========================================================================== */
(function () {
'use strict';

var errBox = document.getElementById('err');
function fatal(msg) {
  if (errBox) { errBox.style.display = 'flex'; errBox.textContent = msg; }
  console.error(msg);
}
window.addEventListener('error', function (e) {
  fatal('Script error: ' + e.message);
});
if (typeof THREE === 'undefined') { fatal('three.js failed to load (lib/three.min.js)'); return; }

/* ---------------- deterministic RNG ---------------- */
var SEED = 20261113;
function rnd() { SEED = (SEED * 1103515245 + 12345) & 0x7fffffff; return SEED / 0x7fffffff; }
function rr(a, b) { return a + (b - a) * rnd(); }
function pick(arr) { return arr[(rnd() * arr.length) | 0]; }

/* ---------------- canvas texture factories ---------------- */

function canvasTex(w, h, draw) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  var t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* Patches placed with rejection sampling so cream gutters stay visible */
function scatterPatches(x, W, H, count, rMin, rMax, yPow, shades, patchFn, minGap) {
  var placed = [];
  var attempts = 0;
  while (placed.length < count && attempts < count * 40) {
    attempts++;
    var cx = rnd() * W;
    var y = Math.pow(rnd(), yPow) * H;
    var topBias = 1 - y / H;
    var r = rMin + (rMax - rMin) * (0.25 + 0.75 * Math.pow(rnd(), 0.6) * (0.35 + 0.65 * topBias));
    var ok = true;
    for (var i = 0; i < placed.length; i++) {
      var dx = Math.abs(cx - placed[i].x); dx = Math.min(dx, W - dx);
      var dy = y - placed[i].y;
      var need = (r + placed[i].r) * minGap;
      if (dx * dx + dy * dy < need * need) { ok = false; break; }
    }
    if (!ok) continue;
    placed.push({ x: cx, y: y, r: r });
  }
  placed.forEach(function (p) {
    patchFn(x, p.x, p.y, p.r);
    patchFn(x, p.x - W, p.y, p.r);
    patchFn(x, p.x + W, p.y, p.r);
  });
}

/* faceted polygon plate with mottled interior + darker rim */
function makePatchFn(shades) {
  return function (x, cx, cy, r) {
    var n = 9 + ((rnd() * 5) | 0);
    var a0 = rnd() * Math.PI * 2;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = a0 + (i / n) * Math.PI * 2 + rr(-0.10, 0.10);
      var rad = r * rr(0.78, 1.0);
      pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * rr(0.8, 1.0)]);
      // occasional concave notch between vertices
      if (rnd() < 0.5) {
        var a2 = a + Math.PI / n;
        var rad2 = r * rr(0.62, 0.8);
        pts.push([cx + Math.cos(a2) * rad2, cy + Math.sin(a2) * rad2]);
      }
    }
    function tracePoly() {
      x.beginPath();
      for (var i2 = 0; i2 < pts.length; i2++) {
        if (i2) x.lineTo(pts[i2][0], pts[i2][1]); else x.moveTo(pts[i2][0], pts[i2][1]);
      }
      x.closePath();
    }
    tracePoly();
    x.fillStyle = pick(shades);
    x.fill();
    // mottled interior (clipped to the plate)
    x.save();
    x.clip();
    for (var m = 0; m < 3; m++) {
      x.fillStyle = 'rgba(40,20,6,' + rr(0.08, 0.2) + ')';
      x.beginPath();
      x.ellipse(cx + rr(-r * 0.4, r * 0.4), cy + rr(-r * 0.4, r * 0.4), rr(r * 0.2, r * 0.5), rr(r * 0.15, r * 0.4), rnd() * 3, 0, 7);
      x.fill();
    }
    x.restore();
    // rim: retrace the polygon so the stroke stays on the plate edge
    tracePoly();
    x.strokeStyle = 'rgba(50,26,8,0.45)';
    x.lineWidth = Math.max(1.5, r * 0.08);
    x.stroke();
  };
}

/* Adult giraffe coat: cream ground, angular brown plates, pale belly (bottom of canvas).
   Canvas y=0 is the top pole (back of animal) for sphere UVs. */
function makeCoatTexture() {
  var shades = ['#6f3d12', '#7d4a18', '#8a5622', '#5f3510', '#744517'];
  var patchFn = makePatchFn(shades);
  return canvasTex(1024, 1024, function (x, W, H) {
    var base = x.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, '#e9d7ae');
    base.addColorStop(1, '#e2cda1');
    x.fillStyle = base; x.fillRect(0, 0, W, H);
    for (var i = 0; i < 8000; i++) {
      x.fillStyle = rnd() < 0.5 ? 'rgba(120,84,40,0.05)' : 'rgba(255,244,214,0.06)';
      x.beginPath(); x.arc(rnd() * W, rnd() * H, rr(0.5, 2.0), 0, 7); x.fill();
    }
    scatterPatches(x, W, H, 105, 18, 56, 1.15, shades, patchFn, 0.82);
    // pale belly: opaque fade so no patch ghosts show through
    var g = x.createLinearGradient(0, H * 0.58, 0, H * 0.78);
    g.addColorStop(0, 'rgba(229,213,170,0)');
    g.addColorStop(1, 'rgba(229,213,170,1)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = '#e5d2a8';
    x.fillRect(0, H * 0.78, W, H * 0.22);
  });
}

/* Neck: fully patched with visible gutters */
function makeNeckTexture() {
  var shades = ['#6f3d12', '#7d4a18', '#8a5622', '#5f3510'];
  var patchFn = makePatchFn(shades);
  return canvasTex(512, 512, function (x, W, H) {
    x.fillStyle = '#e6d2a8'; x.fillRect(0, 0, W, H);
    for (var i = 0; i < 2500; i++) {
      x.fillStyle = rnd() < 0.5 ? 'rgba(120,84,40,0.05)' : 'rgba(255,244,214,0.06)';
      x.beginPath(); x.arc(rnd() * W, rnd() * H, rr(0.4, 1.6), 0, 7); x.fill();
    }
    scatterPatches(x, W, H, 34, 22, 46, 1.0, shades, patchFn, 0.8);
  });
}

/* Head: mostly pale with small patches */
function makeHeadTexture() {
  return canvasTex(256, 256, function (x, W, H) {
    x.fillStyle = '#e8d6ad'; x.fillRect(0, 0, W, H);
    for (var i = 0; i < 900; i++) {
      x.fillStyle = rnd() < 0.5 ? 'rgba(120,84,40,0.05)' : 'rgba(255,244,214,0.06)';
      x.beginPath(); x.arc(rnd() * W, rnd() * H, rr(0.3, 1.1), 0, 7); x.fill();
    }
    var shades = ['#7d4a18', '#8a5622', '#6f3d12'];
    scatterPatches(x, W, H, 26, 8, 18, 1.0, shades, makePatchFn(shades), 0.85);
  });
}

/* Dry savanna ground */
function makeGroundTexture() {
  return canvasTex(512, 512, function (x, W, H) {
    x.fillStyle = '#c3a878'; x.fillRect(0, 0, W, H);
    for (var i = 0; i < 40; i++) {
      x.fillStyle = 'rgba(' + (150 + ((rnd() * 60) | 0)) + ',' + (120 + ((rnd() * 50) | 0)) + ',' + (70 + ((rnd() * 40) | 0)) + ',0.08)';
      x.beginPath();
      x.ellipse(rnd() * W, rnd() * H, rr(14, 55), rr(10, 36), rnd() * 6.3, 0, 7);
      x.fill();
    }
    for (var s = 0; s < 4200; s++) {
      var v = rnd();
      x.fillStyle = v < 0.55 ? 'rgba(96,74,40,' + rr(0.05, 0.2) + ')'
        : (v < 0.85 ? 'rgba(232,214,160,' + rr(0.05, 0.22) + ')' : 'rgba(120,100,58,' + rr(0.05, 0.18) + ')');
      var px = rnd() * W, py = rnd() * H;
      x.beginPath(); x.arc(px, py, rr(0.5, 2.4), 0, 7); x.fill();
      // short dry-grass strokes
      if (rnd() < 0.4) {
        x.strokeStyle = 'rgba(150,128,70,0.25)';
        x.lineWidth = 1;
        x.beginPath(); x.moveTo(px, py);
        x.lineTo(px + rr(-3, 3), py - rr(3, 8));
        x.stroke();
      }
    }
  });
}

/* Grass tuft blade cluster (transparent) */
function makeGrassTexture() {
  return canvasTex(128, 128, function (x, W, H) {
    x.clearRect(0, 0, W, H);
    var cols = ['#e2d18c', '#d8c47a', '#ead9a0', '#c8b264', '#bfa960'];
    for (var i = 0; i < 84; i++) {
      var bx = W / 2 + rr(-16, 16);
      var hgt = rr(72, 118);
      x.strokeStyle = pick(cols);
      x.lineWidth = rr(1.6, 3.4);
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(bx + rr(-4, 4), H);
      x.quadraticCurveTo(bx + rr(-12, 12), H - hgt * 0.5, W / 2 + (bx - W / 2) * rr(0.5, 1.3), H - hgt);
      x.stroke();
    }
  });
}

/* Legs: pale cream below, faint patches near the top */
function makeLegTexture() {
  return canvasTex(256, 256, function (x, W, H) {
    x.fillStyle = '#e6d2a8'; x.fillRect(0, 0, W, H);
    for (var i = 0; i < 700; i++) {
      x.fillStyle = rnd() < 0.5 ? 'rgba(120,84,40,0.04)' : 'rgba(255,244,214,0.05)';
      x.beginPath(); x.arc(rnd() * W, rnd() * H, rr(0.3, 1.0), 0, 7); x.fill();
    }
    var shades = ['#8a5622', '#7d4a18', '#93602c'];
    var legPatch = makePatchFn(shades);
    var placed = [];
    var attempts = 0;
    while (placed.length < 22 && attempts < 800) {
      attempts++;
      var cx = rnd() * W, cy = rnd() * H * 0.45, r = rr(8, 15);
      var ok = true;
      for (var q = 0; q < placed.length; q++) {
        var dx = cx - placed[q].x, dy = cy - placed[q].y;
        var need = (r + placed[q].r) * 0.85;
        if (dx * dx + dy * dy < need * need) { ok = false; break; }
      }
      if (!ok) continue;
      placed.push({ x: cx, y: cy, r: r });
    }
    placed.forEach(function (p) { legPatch(x, p.x, p.y, p.r); });
    // fade to pale toward the bottom (hoof end)
    var g = x.createLinearGradient(0, H * 0.42, 0, H);
    g.addColorStop(0, 'rgba(230,210,168,0)');
    g.addColorStop(0.6, 'rgba(230,210,168,0.85)');
    g.addColorStop(1, 'rgba(233,216,176,0.97)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  });
}

/* ---------------- geometry helpers ---------------- */
function mergeGeos(geos) {
  var parts = geos.map(function (g) { return g.toNonIndexed(); });
  var n = 0;
  parts.forEach(function (g) { n += g.attributes.position.count; });
  var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  var o = 0;
  parts.forEach(function (g) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  });
  var out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

function capsule(r, totalLen, mat) {
  var geo = new THREE.CapsuleGeometry(r, Math.max(0.01, totalLen - 2 * r), 5, 14);
  var m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* ==========================================================================
   THE GIRAFFE
   ========================================================================== */
var UP_L = 1.15, LO_L = 0.95, PIVOT_Y = 2.26;   // leg lengths, shoulder/hip height

function buildGiraffe(mat) {
  var root = new THREE.Group();
  var bodyGrp = new THREE.Group();
  root.add(bodyGrp);
  var P = { root: root, body: bodyGrp, legs: [], neck: [], neckBase: null, head: null, ears: null, tail: null, tail2: null };

  /* --- legs --- */
  function buildLeg(px, pz, isFront) {
    var pivot = new THREE.Group();
    pivot.position.set(px, PIVOT_Y, pz);
    var upper = new THREE.Group();
    pivot.add(upper);
    var rUp = isFront ? 0.205 : 0.22;
    var mUp = capsule(rUp, UP_L, mat.skinLeg);
    mUp.position.y = -UP_L / 2;
    upper.add(mUp);
    // shoulder/hip muscle (kept inside the silhouette)
    var mus = new THREE.Mesh(new THREE.SphereGeometry(isFront ? 0.15 : 0.16, 12, 10), mat.skinLeg);
    mus.scale.set(0.85, 1.05, 0.95);
    mus.position.set(-Math.sign(px) * 0.07, 0.09, -0.03);
    mus.castShadow = true;
    upper.add(mus);
    var knee = new THREE.Group();
    knee.position.y = -UP_L;
    pivot.add(knee);
    var rLo = isFront ? 0.135 : 0.145;
    var mLo = capsule(rLo, LO_L, mat.skinLeg);
    mLo.position.y = -LO_L / 2;
    knee.add(mLo);
    // knee/hock bump
    var kb = new THREE.Mesh(new THREE.SphereGeometry(isFront ? 0.125 : 0.135, 10, 8), mat.skinLeg);
    kb.scale.set(0.8, 1.15, 0.8);
    kb.castShadow = true;
    knee.add(kb);
    // hoof
    var hoof = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.14, 0.25), mat.hoof);
    hoof.position.set(0, -LO_L - 0.05, 0.03);
    hoof.rotation.x = 0.14;
    hoof.castShadow = true;
    knee.add(hoof);
    root.add(pivot);
    return { pivot: pivot, upper: upper, knee: knee, hoof: hoof, isFront: isFront, baseKnee: isFront ? 0.10 : -0.16 };
  }
  // diagonal walk: FL with RR, FR with RL
  P.legs.push(buildLeg(0.42, 0.78, true));
  P.legs.push(buildLeg(-0.42, 0.78, true));
  P.legs.push(buildLeg(0.50, -0.88, false));
  P.legs.push(buildLeg(-0.50, -0.88, false));
  P.phases = [0, Math.PI, Math.PI, 0];

  /* --- torso --- */
  var torso = new THREE.Mesh(new THREE.SphereGeometry(1, 30, 22), mat.skin);
  torso.scale.set(0.63, 0.57, 1.45);
  torso.position.set(0, 1.93, 0.02);
  torso.castShadow = true; torso.receiveShadow = true;
  bodyGrp.add(torso);
  var chest = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 14), mat.skin);
  chest.scale.set(0.95, 1.0, 0.95);
  chest.position.set(0, 2.0, 0.93);
  chest.castShadow = true;
  bodyGrp.add(chest);
  var rump = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), mat.skin);
  rump.scale.set(1.0, 0.95, 1.0);
  rump.position.set(0, 1.98, -0.98);
  rump.castShadow = true;
  bodyGrp.add(rump);

  /* --- neck chain: smooth tapered segments with rounded joints --- */
  var neckLens = [0.62, 0.62, 0.56, 0.50];
  var neckRads = [0.31, 0.26, 0.215, 0.185, 0.16];
  var neckTilt = [15, 10, 8, 6].map(function (d) { return THREE.MathUtils.degToRad(d); });
  var neckBase = new THREE.Group();
  neckBase.position.set(0, 2.48, 0.70);
  bodyGrp.add(neckBase);
  P.neckBase = neckBase;
  var neckParent = neckBase;
  for (var i = 0; i < neckLens.length; i++) {
    (function (i) {
      var seg = new THREE.Group();
      if (i > 0) seg.position.y = neckLens[i - 1];   // joint at the tip of the previous segment
      seg.rotation.x = neckTilt[i];
      neckParent.add(seg);
      var L = neckLens[i], r0 = neckRads[i], r1 = neckRads[i + 1];
      var cyl = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, L, 20, 1, true), mat.skinNeck);
      cyl.position.y = L / 2;
      cyl.castShadow = true; cyl.receiveShadow = true;
      seg.add(cyl);
      var j0 = new THREE.Mesh(new THREE.SphereGeometry(r0, 16, 12), mat.skinNeck);
      j0.castShadow = true;
      seg.add(j0);
      var j1 = new THREE.Mesh(new THREE.SphereGeometry(r1, 16, 12), mat.skinNeck);
      j1.position.y = L;
      j1.castShadow = true;
      seg.add(j1);
      P.neck.push({ seg: seg, base: neckTilt[i] });
      // mane: stiff dark crest down the dorsal midline
      var spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26, 6), mat.dark);
      spike.position.set(0, L * 0.52, -r0 * 0.70);
      spike.rotation.x = -Math.PI * 0.52;
      spike.castShadow = true;
      seg.add(spike);
      neckParent = seg;
    })(i);
  }

  /* --- head --- */
  var head = new THREE.Group();
  head.position.y = neckLens[neckLens.length - 1] * 0.82;
  neckParent.add(head);
  var skull = new THREE.Mesh(new THREE.SphereGeometry(0.20, 18, 14), mat.skinHead);
  skull.scale.set(0.92, 0.95, 1.35);
  skull.position.set(0, 0.03, 0.06);
  skull.castShadow = true;
  head.add(skull);
  var muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), mat.skinHead);
  muzzle.scale.set(0.68, 0.58, 1.5);
  muzzle.position.set(0, -0.07, 0.36);
  muzzle.castShadow = true;
  head.add(muzzle);
  var chin = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), mat.skinHead);
  chin.scale.set(0.8, 0.55, 0.9);
  chin.position.set(0, -0.15, 0.2);
  chin.castShadow = true;
  head.add(chin);
  // nostrils
  [-1, 1].forEach(function (s) {
    var n = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), mat.dark);
    n.position.set(0.045 * s, -0.012, 0.50);
    head.add(n);
  });
  // eyes
  var eyes = [];
  [-1, 1].forEach(function (s) {
    var eg = new THREE.Group();
    eg.position.set(0.145 * s, 0.07, 0.17);
    var e = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), mat.eye);
    e.scale.set(0.7, 1.15, 0.62);
    eg.add(e);
    var hl = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), mat.white);
    hl.position.set(0.014 * s, 0.02, 0.035);
    eg.add(hl);
    head.add(eg);
    eyes.push(eg);
  });
  // ears
  var ears = new THREE.Group();
  ears.position.set(0, 0.10, -0.05);
  [-1, 1].forEach(function (s) {
    var ea = new THREE.Group();
    ea.position.set(0.155 * s, 0.085, -0.06);
    ea.rotation.set(0, -0.55 * s, 0.40 * s);
    var es = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), mat.skinHead);
    es.scale.set(0.62, 0.30, 0.70);
    es.castShadow = true;
    ea.add(es);
    var ei = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), mat.innerEar);
    ei.scale.set(0.46, 0.2, 0.52);
    ei.position.set(0.02 * s, 0, 0.015);
    ea.add(ei);
    ears.add(ea);
  });
  head.add(ears);
  P.ears = ears;
  // ossicones
  [-1, 1].forEach(function (s) {
    var og = new THREE.Group();
    og.position.set(0.078 * s, 0.19, -0.015);
    og.rotation.z = -0.12 * s;
    var stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.036, 0.21, 8), mat.ossicone);
    stalk.position.y = 0.105;
    stalk.castShadow = true;
    og.add(stalk);
    var knob = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), mat.ossicone);
    knob.position.y = 0.215;
    knob.castShadow = true;
    og.add(knob);
    head.add(og);
  });
  // forelock
  [-0.05, 0, 0.05].forEach(function (sx, i) {
    var fl = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.12, 6), mat.dark);
    fl.position.set(sx * 1.4, 0.21, 0.03 - i * 0.02);
    fl.rotation.x = -1.1;
    head.add(fl);
  });
  P.head = head;
  P.eyes = eyes;

  /* --- withers mane along the back --- */
  for (var w = 0; w < 6; w++) {
    var sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), mat.dark);
    sp.position.set(0, 2.40 - w * 0.012, 0.55 - w * 0.27);
    sp.rotation.x = -1.2;
    sp.castShadow = true;
    bodyGrp.add(sp);
  }

  /* --- tail --- */
  var tail = new THREE.Group();
  tail.position.set(0, 2.08, -1.30);
  tail.rotation.x = 0.55;
  var t1 = new THREE.Group();
  tail.add(t1);
  var m1 = capsule(0.075, 0.44, mat.skinNeck);
  m1.position.y = -0.22;
  t1.add(m1);
  var t2 = new THREE.Group();
  t2.position.y = -0.44;
  t1.add(t2);
  var m2 = capsule(0.055, 0.38, mat.skinNeck);
  m2.position.y = -0.19;
  t2.add(m2);
  var tuft = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.30, 8), mat.dark);
  tuft.position.y = -0.38 - 0.07;
  tuft.rotation.x = Math.PI * 0.93;
  tuft.castShadow = true;
  t2.add(tuft);
  P.tail = tail;
  P.tail2 = t2;

  return P;
}

/* ==========================================================================
   SCENE
   ========================================================================== */
var canvas = document.getElementById('scene');
var renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
} catch (e) {
  fatal('WebGL is not available: ' + e.message);
  return;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

var scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe4cfa4, 70, 250);

var camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 600);

/* --- sky dome --- */
var sunDir = new THREE.Vector3(34, 26, 12).normalize();
var sky = new THREE.Mesh(
  new THREE.SphereGeometry(320, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sunDir: { value: sunDir } },
    vertexShader: [
      'varying vec3 vDir;',
      'void main(){',
      '  vDir = normalize(position);',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vDir;',
      'uniform vec3 sunDir;',
      'void main(){',
      '  vec3 d = normalize(vDir);',
      '  float h = clamp(d.y, -0.25, 1.0);',
      '  vec3 zen = vec3(0.42, 0.58, 0.78);',
      '  vec3 mid = vec3(0.70, 0.78, 0.87);',
      '  vec3 hor = vec3(0.95, 0.84, 0.63);',
      '  vec3 col = mix(hor, mid, smoothstep(0.0, 0.16, h));',
      '  col = mix(col, zen, smoothstep(0.10, 0.62, h));',
      '  float s = max(dot(d, normalize(sunDir)), 0.0);',
      '  col += vec3(1.0, 0.78, 0.50) * pow(s, 260.0) * 1.6;',
      '  col += vec3(1.0, 0.62, 0.33) * pow(s, 9.0) * 0.20;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  })
);
scene.add(sky);

/* --- ground --- */
var groundTex = makeGroundTexture();
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(16, 16);
var ground = new THREE.Mesh(
  new THREE.CircleGeometry(95, 56),
  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

/* worn dirt trail along the giraffe's walking circle */
var trail = new THREE.Mesh(
  new THREE.RingGeometry(8.1, 10.4, 72),
  new THREE.MeshStandardMaterial({ color: 0xb99f74, roughness: 1, transparent: true, opacity: 0.5, depthWrite: false })
);
trail.rotation.x = -Math.PI / 2;
trail.position.y = 0.012;
trail.receiveShadow = true;
scene.add(trail);

/* --- lights --- */
var sun = new THREE.DirectionalLight(0xffd9a8, 2.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18; sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 4; sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;
scene.add(sun);
scene.add(sun.target);
var hemi = new THREE.HemisphereLight(0xbcd4ee, 0x8a7350, 0.75);
scene.add(hemi);

/* soft high clouds (billboards, fog-exempt) */
var cloudTex = (function () {
  var c = document.createElement('canvas'); c.width = 128; c.height = 128;
  var x = c.getContext('2d');
  for (var i = 0; i < 9; i++) {
    var cx = 64 + rr(-38, 38), cy = 64 + rr(-20, 20), r = rr(18, 42);
    var g = x.createRadialGradient(cx, cy, 1, cx, cy, r);
    g.addColorStop(0, 'rgba(255,250,240,' + rr(0.10, 0.22) + ')');
    g.addColorStop(1, 'rgba(255,250,240,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
  }
  var t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
var clouds = [];
for (var cl = 0; cl < 10; cl++) {
  var cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: rr(0.5, 0.85), depthWrite: false, fog: false }));
  var ca = rnd() * Math.PI * 2, cd = rr(150, 290);
  cloud.position.set(Math.sin(ca) * cd, rr(55, 120), Math.cos(ca) * cd);
  var cs = rr(45, 110);
  cloud.scale.set(cs, cs * 0.38, 1);
  scene.add(cloud);
  clouds.push(cloud);
}

/* --- environment: acacia trees, rocks, grass --- */
var barkMat = new THREE.MeshStandardMaterial({ color: 0x77644e, roughness: 1 });
var leafMats = [0x77804a, 0x868e54, 0x6a7242].map(function (c) {
  return new THREE.MeshStandardMaterial({ color: c, roughness: 1 });
});
function makeAcacia() {
  var g = new THREE.Group();
  var h = rr(3.6, 5.2);
  var segs = 3;
  var bendX = rr(-0.5, 0.5), bendZ = rr(-0.4, 0.4);
  for (var i = 0; i < segs; i++) {
    var r0 = 0.24 * (1 - i * 0.22), r1 = 0.24 * (1 - (i + 1) * 0.22) + 0.02;
    var sh = h / segs * rr(0.9, 1.1);
    var c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, sh, 8), barkMat);
    var f = (i + 1) / segs;
    c.position.set(bendX * f * f, (i * h / segs) + sh / 2, bendZ * f * f);
    c.rotation.z = -bendX * 0.16 * f;
    c.rotation.x = bendZ * 0.16 * f;
    c.castShadow = true; c.receiveShadow = true;
    g.add(c);
  }
  // flat acacia canopy (follows the trunk's bend)
  var topY = h * 0.94;
  var nClumps = 6 + ((rnd() * 3) | 0);
  for (var j = 0; j < nClumps; j++) {
    var a = rnd() * Math.PI * 2;
    var rad = j === 0 ? 0 : rr(0.7, 2.3);
    var cl = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), leafMats[j % 3]);
    cl.scale.set(rr(1.8, 3.0), rr(0.34, 0.5), rr(1.8, 3.0));
    cl.position.set(bendX + Math.cos(a) * rad, topY + rr(-0.15, 0.35), bendZ + Math.sin(a) * rad);
    cl.castShadow = true;
    g.add(cl);
  }
  return g;
}
var treeCount = 13;
for (var t = 0; t < treeCount; t++) {
  var tr = makeAcacia();
  var a = (t / treeCount) * Math.PI * 2 + rr(-0.25, 0.25);
  var rad = rr(17, 78);
  tr.position.set(Math.sin(a) * rad, 0, Math.cos(a) * rad);
  tr.rotation.y = rnd() * Math.PI * 2;
  var sc = rr(0.8, 1.5);
  tr.scale.set(sc, sc, sc);
  scene.add(tr);
}

/* rocks */
var rockGeo = new THREE.DodecahedronGeometry(1, 0);
var rockMat = new THREE.MeshStandardMaterial({ color: 0x9a8d78, roughness: 1 });
var rockN = 34;
var rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockN);
var M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V3 = new THREE.Vector3(), S3 = new THREE.Vector3(), E = new THREE.Euler();
for (var rk = 0; rk < rockN; rk++) {
  var aa = rnd() * Math.PI * 2, rd = rr(5, 85);
  var s = rr(0.22, 0.85) * (rd > 40 ? 1.6 : 1);
  E.set(rnd() * 0.4, rnd() * 6.3, rnd() * 0.4);
  Q.setFromEuler(E);
  V3.set(Math.sin(aa) * rd, -s * 0.35, Math.cos(aa) * rd);
  S3.set(s * rr(0.8, 1.4), s * rr(0.5, 0.8), s * rr(0.8, 1.4));
  M4.compose(V3, Q, S3);
  rocks.setMatrixAt(rk, M4);
}
rocks.castShadow = true;
rocks.receiveShadow = true;
scene.add(rocks);

/* --- hoof dust puffs --- */
var dustTex = (function () {
  var c = document.createElement('canvas'); c.width = 64; c.height = 64;
  var x = c.getContext('2d');
  var g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(198,170,122,0.5)');
  g.addColorStop(0.55, 'rgba(190,160,110,0.22)');
  g.addColorStop(1, 'rgba(190,160,110,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
var DUST_N = 24, dustPool = [], dustIdx = 0;
for (var d = 0; d < DUST_N; d++) {
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, opacity: 0, depthWrite: false }));
  sp.scale.set(0.001, 0.001, 1);
  sp.userData.life = 99;
  scene.add(sp);
  dustPool.push(sp);
}
var _dustPos = new THREE.Vector3();
function spawnDust(p) {
  var sp = dustPool[dustIdx]; dustIdx = (dustIdx + 1) % DUST_N;
  sp.position.copy(p); sp.position.y = 0.12;
  sp.userData.life = 0;
  sp.scale.set(0.5, 0.35, 1);
  sp.material.opacity = 0.38;
}

/* grass tufts */
var grassTex = makeGrassTexture();
var tuftGeo = (function () {
  var g1 = new THREE.PlaneGeometry(0.72, 0.55); g1.translate(0, 0.275, 0);
  var g2 = new THREE.PlaneGeometry(0.72, 0.55); g2.rotateY(Math.PI / 2); g2.translate(0, 0.275, 0);
  return mergeGeos([g1, g2]);
})();
var grassMat = new THREE.MeshStandardMaterial({
  map: grassTex, transparent: true, alphaTest: 0.5,
  side: THREE.DoubleSide, roughness: 1
});
var grassN = 2400;
var grass = new THREE.InstancedMesh(tuftGeo, grassMat, grassN);
for (var gi = 0; gi < grassN; gi++) {
  var ga = rnd() * Math.PI * 2, gd = Math.sqrt(rnd()) * 90 + 1.5;
  E.set(0, rnd() * 6.3, 0);
  Q.setFromEuler(E);
  V3.set(Math.sin(ga) * gd, 0, Math.cos(ga) * gd);
  var gs = rr(0.6, 2.0);
  S3.set(gs, gs * rr(0.8, 1.4), gs);
  M4.compose(V3, Q, S3);
  grass.setMatrixAt(gi, M4);
}
scene.add(grass);

/* ==========================================================================
   GIRAFFE instance + gait state
   ========================================================================== */
var coatTex = makeCoatTexture();
coatTex.wrapS = THREE.RepeatWrapping; coatTex.wrapT = THREE.ClampToEdgeWrapping;
coatTex.repeat.set(1.8, 1);
var neckTex = makeNeckTexture();
neckTex.wrapS = THREE.RepeatWrapping; neckTex.wrapT = THREE.ClampToEdgeWrapping;
neckTex.repeat.set(1.2, 1);
var headTex = makeHeadTexture();
var legTex = makeLegTexture();
legTex.wrapS = THREE.RepeatWrapping; legTex.wrapT = THREE.ClampToEdgeWrapping;
legTex.repeat.set(1.4, 1);

var GIR = buildGiraffe({
  skin: new THREE.MeshStandardMaterial({ map: coatTex, roughness: 0.85 }),
  skinLeg: new THREE.MeshStandardMaterial({ map: legTex, roughness: 0.85 }),
  skinNeck: new THREE.MeshStandardMaterial({ map: neckTex, roughness: 0.85 }),
  skinHead: new THREE.MeshStandardMaterial({ map: headTex, roughness: 0.82 }),
  hoof: new THREE.MeshStandardMaterial({ color: 0x2b2018, roughness: 0.5 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x38220f, roughness: 0.95 }),
  ossicone: new THREE.MeshStandardMaterial({ color: 0x4d3319, roughness: 0.8 }),
  eye: new THREE.MeshStandardMaterial({ color: 0x221105, roughness: 0.25 }),
  white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  innerEar: new THREE.MeshStandardMaterial({ color: 0xc79b72, roughness: 0.9 })
});
scene.add(GIR.root);

var R_PATH = 9, V_BASE = 1.30, F_BASE = 0.62;
var state = {
  speedIdx: 1,
  speeds: [0.55, 1.0, 1.5],
  speedNames: ['slow walk', 'walk', 'brisk walk'],
  phase: 0, theta: 0.8, t: 0,
  paused: false,
  headYaw: 0, headYawTarget: 0.2, nextHeadTurn: 4,
  earTw: 0, earTwTarget: 0, nextEar: 2.5, earT: -10,
  blinkT: -10, nextBlink: 3
};

/* --- camera orbit (custom, damped; yaw is relative to the giraffe's heading) --- */
var CAM_HOME = { yaw: 2.55, pitch: 0.40, dist: 9.0 };
var cam = { yaw: CAM_HOME.yaw, pitch: CAM_HOME.pitch, dist: CAM_HOME.dist, tYaw: CAM_HOME.yaw, tPitch: CAM_HOME.pitch, tDist: CAM_HOME.dist };
function resetCam() { cam.tYaw = CAM_HOME.yaw; cam.tPitch = CAM_HOME.pitch; cam.tDist = CAM_HOME.dist; }
var dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('pointerdown', function (e) { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', function (e) {
  if (!dragging) return;
  cam.tYaw -= (e.clientX - lastX) * 0.005;
  cam.tPitch = THREE.MathUtils.clamp(cam.tPitch + (e.clientY - lastY) * 0.0038, -0.05, 1.25);
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('pointerup', function () { dragging = false; });
canvas.addEventListener('wheel', function (e) {
  e.preventDefault();
  cam.tDist = THREE.MathUtils.clamp(cam.tDist * (1 + e.deltaY * 0.001), 4.5, 22);
}, { passive: false });

/* --- UI keys --- */
var gaitEl = document.getElementById('gait');
function setSpeed(i) {
  state.speedIdx = i;
  gaitEl.innerHTML = 'gait: <b>' + state.speedNames[i] + '</b>';
}
window.addEventListener('keydown', function (e) {
  if (e.code === 'Space') {
    e.preventDefault();
    state.paused = !state.paused;
  } else if (e.key === '1' || e.key === '2' || e.key === '3') {
    setSpeed(parseInt(e.key, 10) - 1);
  } else if (e.key === 'r' || e.key === 'R') {
    resetCam();
  }
});
setSpeed(1);

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* debug hook (harmless; used by the headless test harness) */
window.__giraffe = { root: GIR.root, gir: GIR, state: state, cam: cam, camera: camera, scene: scene, renderer: renderer };

/* ==========================================================================
   ANIMATION LOOP
   ========================================================================== */
var clock = new THREE.Clock();
var _dir = new THREE.Vector3(), _target = new THREE.Vector3();

function tick() {
  requestAnimationFrame(tick);
  var dt = Math.min(clock.getDelta(), 0.05);
  state.t += dt;
  var t = state.t;
  var s = state.speeds[state.speedIdx];
  var ph = state.phase;

  if (!state.paused) {
    state.phase += 2 * Math.PI * F_BASE * s * dt;
    state.theta += (V_BASE * s / R_PATH) * dt;
  }

  /* locomotion: circle path */
  var th = state.theta;
  GIR.root.position.set(Math.sin(th) * R_PATH, 0, Math.cos(th) * R_PATH);
  _dir.set(Math.cos(th), 0, -Math.sin(th));
  GIR.root.rotation.y = Math.atan2(_dir.x, _dir.z);

  /* legs: diagonal walk gait (stride lengthens with speed) */
  var swingAmp = 0.36 * (0.82 + 0.28 * s);
  for (var i = 0; i < 4; i++) {
    var leg = GIR.legs[i];
    var p = ph + GIR.phases[i];
    leg.upper.rotation.x = swingAmp * Math.sin(p);
    var kneeAmp = (leg.isFront ? 0.32 : 0.28) * (0.82 + 0.28 * s);
    var kneeLag = leg.isFront ? 0.55 : 0.40;
    leg.knee.rotation.x = leg.baseKnee + kneeAmp * Math.sin(p - kneeLag);
    // footfall dust
    leg.hoof.getWorldPosition(_dustPos);
    if (leg._prevY !== undefined && leg._prevY > 0.17 && _dustPos.y < 0.11) {
      spawnDust(_dustPos);
    }
    leg._prevY = _dustPos.y;
  }

  /* body: bob (2x stride), roll, pitch */
  var bob = 0.035 * 0.5 * (1 + Math.cos(2 * ph));
  GIR.body.position.y = bob;
  GIR.body.rotation.z = 0.02 * Math.sin(2 * ph);
  GIR.body.rotation.x = 0.014 * Math.sin(ph + 0.6);

  /* neck: slow sway + per-segment wave */
  for (var n = 0; n < GIR.neck.length; n++) {
    GIR.neck[n].seg.rotation.x = GIR.neck[n].base + 0.032 * Math.sin(0.5 * ph + n * 0.55 + 1.0);
  }
  GIR.neckBase.rotation.z = 0.02 * Math.sin(0.4 * ph + 2.0);
  GIR.neckBase.rotation.x = 0.02 * Math.sin(0.5 * ph + 0.7);

  /* head: gentle bob + look-around events (sometimes glances at the camera) */
  if (t > state.nextHeadTurn) {
    if (!cam.frozen && rnd() < 0.3) {
      _dir.set(camera.position.x - GIR.root.position.x, 0, camera.position.z - GIR.root.position.z);
      var bearing = Math.atan2(_dir.x, _dir.z) - GIR.root.rotation.y;
      while (bearing > Math.PI) bearing -= 2 * Math.PI;
      while (bearing < -Math.PI) bearing += 2 * Math.PI;
      state.headYawTarget = THREE.MathUtils.clamp(bearing, -0.9, 0.9);
    } else {
      state.headYawTarget = rr(-0.75, 0.95);
    }
    state.nextHeadTurn = t + rr(5, 11);
  }
  state.headYaw += (state.headYawTarget - state.headYaw) * Math.min(1, dt * 0.7);
  GIR.head.rotation.y = state.headYaw;
  GIR.head.rotation.x = 0.16 + 0.05 * Math.sin(0.5 * ph + 2.2);
  GIR.head.rotation.z = 0.035 * Math.sin(0.5 * ph + 1.1);

  /* blink */
  if (t > state.nextBlink) {
    state.blinkT = t;
    state.nextBlink = t + rr(2.5, 6.5);
  }
  var blink = 0;
  if (t - state.blinkT < 0.14) blink = Math.sin(((t - state.blinkT) / 0.14) * Math.PI);
  var eyeY = 1.1 * (1 - 0.88 * blink);
  GIR.eyes.forEach(function (eg) { eg.children[0].scale.y = eyeY; });

  /* dust puffs update */
  for (var dd = 0; dd < DUST_N; dd++) {
    var dsp = dustPool[dd];
    if (dsp.userData.life < 0.8) {
      dsp.userData.life += dt;
      var dk = dsp.userData.life / 0.8;
      var ds = 0.5 + dk * 1.7;
      dsp.scale.set(ds, ds * 0.72, 1);
      dsp.material.opacity = 0.38 * (1 - dk);
    } else if (dsp.userData.life < 98) {
      dsp.userData.life = 99;
    }
  }

  /* ears: occasional twitch (~0.4 s each) */
  if (t > state.nextEar) {
    state.earTwTarget = rr(0.5, 1.2) * (rnd() < 0.5 ? -1 : 1);
    state.earT = t;
    state.nextEar = t + rr(2.5, 7);
  }
  if (t > state.earT + 0.4) state.earTwTarget = 0;
  state.earTw += (state.earTwTarget - state.earTw) * Math.min(1, dt * 8);
  if (GIR.ears) {
    GIR.ears.children.forEach(function (ea) {
      ea.rotation.x = 0.08 * Math.sin(0.5 * ph + 1.7) + 0.15 * state.earTw * (ea.position.x > 0 ? 1 : -1);
    });
  }

  /* tail: lazy sway */
  GIR.tail.rotation.x = 0.55 + 0.26 * Math.sin(0.5 * ph + 0.9);
  GIR.tail.rotation.z = 0.16 * Math.sin(0.5 * ph * 1.31 + 0.4);
  GIR.tail2.rotation.x = 0.22 * Math.sin(0.5 * ph - 0.6);

  /* sun follows giraffe so shadows stay sharp */
  sun.position.set(GIR.root.position.x + 34, 26, GIR.root.position.z + 12);
  sun.target.position.copy(GIR.root.position);

  /* clouds drift slowly */
  for (var cld = 0; cld < clouds.length; cld++) {
    clouds[cld].position.x += dt * 0.35;
    if (clouds[cld].position.x > 310) clouds[cld].position.x = -310;
  }

  /* camera: damped orbit around giraffe (skip while frozen, e.g. for inspection) */
  if (!cam.frozen) {
    var k = 1 - Math.exp(-6 * dt);
    cam.yaw += (cam.tYaw - cam.yaw) * k;
    cam.pitch += (cam.tPitch - cam.pitch) * k;
    cam.dist += (cam.tDist - cam.dist) * k;
    var worldYaw = GIR.root.rotation.y + cam.yaw;
    _target.set(GIR.root.position.x, 2.45, GIR.root.position.z);
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    camera.position.set(
      _target.x + cam.dist * cp * Math.sin(worldYaw),
      _target.y + cam.dist * sp,
      _target.z + cam.dist * cp * Math.cos(worldYaw)
    );
    camera.lookAt(_target);
  }

  renderer.render(scene, camera);
}
tick();

})();
