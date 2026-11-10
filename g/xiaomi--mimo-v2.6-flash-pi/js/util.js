'use strict';
/* ============================================================
   util.js  –  math + procedural geometry helpers
   (classic script, shares global scope with the other files)
   ============================================================ */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function smootherstep(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }
function angleNorm(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
function V(x, y, z) { return new THREE.Vector3(x, y, z); }

/* deterministic pseudo random */
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------
   buildLoft(sections, opts)
   Sweeps a 2-D cross section along a path of cross sections.

   section = {
     c   : [x,y,z]   centre of the section
     ra  : radius along the section "side" axis
     rb  : radius along the section "up"   axis
     rTop/rBot : optional separate radii for the +up / -up half
     n   : superellipse exponent (2 = ellipse, 3..5 = boxier)
   }
   opts = {
     seg           : segments per ring (default 20)
     initialSide   : [x,y,z] explicit first side axis (for tubes
                     that run vertically, cross(t,up) degenerates)
     up            : reference up used when initialSide is absent
     capStart/capEnd : null | 'flat' | 'pole'
     poleOffset    : how far a pole cap sticks out
     colorFn       : (p, u, v, sectionIndex) -> THREE.Color
     shade         : true/undefined -> subtle form shading in vertex colour
   ------------------------------------------------------------ */
function buildLoft(sections, opts) {
  opts = opts || {};
  const seg = opts.seg || 20;
  const N = sections.length;
  const F = loftFrames(sections, opts);
  const C = F.C, tan = F.tan, sides = F.sides, ups = F.ups, arc = F.arc, total = F.total;

  const pos = [], uv = [], col = [], idx = [];
  const cols = seg + 1;

  const pushVert = (P, u, v, si) => {
    pos.push(P.x, P.y, P.z);
    uv.push(u, v);
    if (opts.colorFn) {
      const c = opts.colorFn(P, u, v, si);
      col.push(c.r, c.g, c.b);
    } else col.push(1, 1, 1);
  };

  for (let i = 0; i < N; i++) {
    const s = sections[i];
    const v = arc[i] / total;
    const pexp = 2 / (s.n || 2);
    const rbT = (s.rTop != null) ? s.rTop : s.rb;
    const rbB = (s.rBot != null) ? s.rBot : s.rb;
    for (let j = 0; j <= seg; j++) {
      const th = TAU * j / seg;
      const cs = Math.cos(th), sn = Math.sin(th);
      const e1 = (cs < 0 ? -1 : 1) * Math.pow(Math.abs(cs), pexp);
      const e2 = (sn < 0 ? -1 : 1) * Math.pow(Math.abs(sn), pexp);
      const rb = (e2 >= 0 ? rbT : rbB);
      const P = C[i].clone()
        .addScaledVector(sides[i], s.ra * e1)
        .addScaledVector(ups[i], rb * e2);
      pushVert(P, j / seg, v, i);
    }
  }

  for (let i = 0; i < N - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  /* caps */
  const addCap = (si, pole, end) => {
    const s = sections[si];
    let centre = C[si].clone();
    if (pole) {
      const off = (opts.poleOffset != null ? opts.poleOffset
        : 0.55 * Math.min(s.ra, (s.rTop != null ? s.rTop : s.rb)));
      centre.addScaledVector(tan[si], end ? off : -off);
    }
    const ci = pos.length / 3;
    pushVert(centre, 0.5, end ? 1 : 0, si);
    const base = si * cols;
    for (let j = 0; j < seg; j++) {
      const a = base + j, b = base + j + 1;
      /* ring order is side→up; start cap needs the reversed winding */
      if (end) idx.push(ci, a, b);
      else idx.push(ci, b, a);
    }
  };
  if (opts.capStart === 'pole') addCap(0, true, false);
  else if (opts.capStart === 'flat') addCap(0, false, false);
  if (opts.capEnd === 'pole') addCap(N - 1, true, true);
  else if (opts.capEnd === 'flat') addCap(N - 1, false, true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  /* the duplicated seam column gets the normals of column 0 */
  const nrm = geo.attributes.normal;
  for (let i = 0; i < N; i++) {
    const a = i * cols, b = i * cols + seg;
    nrm.setXYZ(b, nrm.getX(a), nrm.getY(a), nrm.getZ(a));
  }
  nrm.needsUpdate = true;

  /* subtle form shading: up-facing lighter, down-facing darker */
  if (opts.shade !== false) {
    const nA = geo.attributes.normal, cA = geo.attributes.color;
    for (let i = 0; i < nA.count; i++) {
      const ny = nA.getY(i);
      const k = 0.90 + 0.13 * (ny * 0.5 + 0.5);   // 0.90 … 1.03
      cA.setXYZ(i, cA.getX(i) * k, cA.getY(i) * k, cA.getZ(i) * k);
    }
    cA.needsUpdate = true;
  }

  return geo;
}

/* ------------------------------------------------------------
   loftFrames / sampleFrames – path + parallel transported frames
   shared by buildLoft and by things that need to ride along a
   path (the mane sweeps the top edge of the neck)
   ------------------------------------------------------------ */
function loftFrames(sections, opts) {
  opts = opts || {};
  const N = sections.length;
  const C = sections.map(s => V(s.c[0], s.c[1], s.c[2]));

  const tan = [];
  for (let i = 0; i < N; i++) {
    let t;
    if (N === 1) t = V(0, 1, 0);
    else if (i === 0) t = C[1].clone().sub(C[0]);
    else if (i === N - 1) t = C[N - 1].clone().sub(C[N - 2]);
    else t = C[i + 1].clone().sub(C[i - 1]);
    if (t.lengthSq() < 1e-12) t = V(0, 1, 0);
    tan.push(t.normalize());
  }

  const sides = [], ups = [];
  let side;
  if (opts.initialSide) {
    side = V(opts.initialSide[0], opts.initialSide[1], opts.initialSide[2]);
  } else {
    const ref = opts.up ? V(opts.up[0], opts.up[1], opts.up[2]) : V(0, 1, 0);
    side = new THREE.Vector3().crossVectors(tan[0], ref);
    if (side.lengthSq() < 1e-8) side = new THREE.Vector3().crossVectors(tan[0], V(1, 0, 0));
    if (side.lengthSq() < 1e-8) side = V(1, 0, 0);
  }
  side.normalize();
  side.addScaledVector(tan[0], -side.dot(tan[0])).normalize();
  let up = new THREE.Vector3().crossVectors(side, tan[0]).normalize();
  sides.push(side.clone()); ups.push(up.clone());

  const q = new THREE.Quaternion();
  for (let i = 1; i < N; i++) {
    q.setFromUnitVectors(tan[i - 1], tan[i]);
    side = side.clone().applyQuaternion(q);
    up = up.clone().applyQuaternion(q);
    side.addScaledVector(tan[i], -side.dot(tan[i])).normalize();
    up.addScaledVector(tan[i], -up.dot(tan[i])).normalize();
    sides.push(side.clone()); ups.push(up.clone());
  }

  const arc = [0];
  for (let i = 1; i < N; i++) arc.push(arc[i - 1] + C[i].distanceTo(C[i - 1]));
  return { C, tan, sides, ups, arc, total: (arc[N - 1] || 1), sections };
}

/* interpolate a point along a lofted path (t = 0…1 by arc length) */
function sampleFrames(F, t) {
  const arc = F.arc, N = F.C.length;
  const x = clamp(t, 0, 1) * F.total;
  let i = 0;
  while (i < N - 2 && arc[i + 1] < x) i++;
  const span = (arc[i + 1] - arc[i]) || 1;
  const a = clamp((x - arc[i]) / span, 0, 1);
  const c = F.C[i].clone().lerp(F.C[i + 1], a);
  const tan = F.tan[i].clone().lerp(F.tan[i + 1], a).normalize();
  const side = F.sides[i].clone().lerp(F.sides[i + 1], a).normalize();
  const up = F.ups[i].clone().lerp(F.ups[i + 1], a).normalize();
  const s0 = F.sections[i], s1 = F.sections[i + 1];
  const r0 = (s0.rTop != null ? s0.rTop : s0.rb);
  const r1 = (s1.rTop != null ? s1.rTop : s1.rb);
  return { c, tan, side, up, rb: lerp(r0, r1, a), ra: lerp(s0.ra, s1.ra, a) };
}

/* ------------------------------------------------------------
   analytic 3-bone planar IK
   The pose is described by (base direction b, two joint turns).
   The default turns describe the anatomical shape (stance pose or
   swing pose); a single scale k shrinks/grows those turns until the
   chain's reach matches the target distance, then b is rotated so
   the chain points at the target.  Result: always anatomical.
   pts : [{x,y} base, null, null, {x,y} target]
   L   : [l1,l2,l3]
   limits: [[min,max],[min,max]] signed turns at joint 1 & 2
   turns : [t1,t2] desired (un-scaled) turns, radians
   ------------------------------------------------------------ */
function solveChainIK(pts, L, limits, turns) {
  const bx = pts[0].x, by = pts[0].y;
  const tx = pts[3].x - bx, ty = pts[3].y - by;
  const d = Math.hypot(tx, ty);
  const dirT = Math.atan2(ty, tx);
  const T1r = clamp(turns[0], limits[0][0], limits[0][1]);
  const T2r = clamp(turns[1], limits[1][0], limits[1][1]);

  const endAt = (k, b) => {
    const T1 = clamp(T1r * k, limits[0][0], limits[0][1]);
    const T2 = clamp(T2r * k, limits[1][0], limits[1][1]);
    let x = L[0] * Math.cos(b), y = L[0] * Math.sin(b);
    x += L[1] * Math.cos(b + T1); y += L[1] * Math.sin(b + T1);
    x += L[2] * Math.cos(b + T1 + T2); y += L[2] * Math.sin(b + T1 + T2);
    return [x, y, T1, T2];
  };

  /* rotate the whole chain until it points at the target */
  const bFor = (k) => {
    let lo = dirT - Math.PI, hi = dirT + Math.PI;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) * 0.5;
      const e = endAt(k, mid);
      if (angleNorm(Math.atan2(e[1], e[0]) - dirT) < 0) lo = mid;
      else hi = mid;
    }
    return (lo + hi) * 0.5;
  };
  const mag = (k) => { const e = endAt(k, bFor(k)); return Math.hypot(e[0], e[1]); };

  let k;
  if (mag(0) <= d + 1e-6) {
    k = 0;                                   /* already short of target → straight */
  } else {
    let lo = 0, hi = 1;
    while (mag(hi) > d && hi < 8) hi *= 1.7;
    for (let i = 0; i < 34; i++) {
      const mid = (lo + hi) * 0.5;
      if (mag(mid) > d) lo = mid; else hi = mid;
    }
    k = (lo + hi) * 0.5;
  }

  const b = bFor(k);
  const e = endAt(k, b);
  pts[1] = { x: bx + L[0] * Math.cos(b), y: by + L[0] * Math.sin(b) };
  pts[2] = { x: pts[1].x + L[1] * Math.cos(b + e[2]), y: pts[1].y + L[1] * Math.sin(b + e[2]) };
  pts[3] = { x: bx + e[0], y: by + e[1] };
  return { k, b, T1: e[2], T2: e[3] };
}
