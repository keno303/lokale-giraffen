'use strict';
/* Small math / helper toolbox (no modules: must run from file://) */
const U = {
  TAU: Math.PI * 2,
  clamp(x, a, b) { return x < a ? a : (x > b ? b : x); },
  lerp(a, b, t) { return a + (b - a) * t; },
  invLerp(a, b, x) { return b === a ? 0 : U.clamp((x - a) / (b - a), 0, 1); },
  smooth(t) { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); },
  smoother(t) { t = U.clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); },
  ease(t) { t = U.clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
  frac(x) { return x - Math.floor(x); },
  deg: d => d * Math.PI / 180,
  /* deterministic rng */
  rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  },
  /* smooth 1d value noise, useful for procedural jitter */
  vnoise(x, seed) {
    const i = Math.floor(x), f = x - i;
    const h = n => {
      let t = (n * 374761393 + (seed || 0) * 668265263) >>> 0;
      t = (t ^ (t >> 13)) >>> 0; t = Math.imul(t, 1274126177) >>> 0;
      return ((t ^ (t >> 16)) >>> 0) / 4294967296;
    };
    const a = h(i), b = h(i + 1);
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  }
};

/* --- tiny geometry helpers shared by model builders --- */
const GEO = {};

/* point on a superellipse: p=2 -> ellipse, p>2 -> boxier */
GEO.se = function (theta, rx, ry, p) {
  p = p || 2;
  const e = 2 / p;
  const c = Math.cos(theta), s = Math.sin(theta);
  return [
    Math.sign(c) * Math.pow(Math.abs(c), e) * rx,
    Math.sign(s) * Math.pow(Math.abs(s), e) * ry
  ];
};

/*
 * Parallel-transport frames along a polyline.
 * returns [{t:Vector3 tangent, up:Vector3, side:Vector3}]
 * side = cross(tangent, up)  (right handed: for t=+X, up=+Y -> side=+Z)
 */
GEO.frames = function (pts) {
  const n = pts.length;
  const out = [];
  const tangents = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a);
    if (t.lengthSq() < 1e-12) t.set(1, 0, 0);
    tangents.push(t.normalize());
  }
  // initial up: world up projected perpendicular to first tangent
  let up = new THREE.Vector3(0, 1, 0);
  if (Math.abs(up.dot(tangents[0])) > 0.95) up.set(1, 0, 0);
  up.addScaledVector(tangents[0], -up.dot(tangents[0])).normalize();
  const q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      q.setFromUnitVectors(tangents[i - 1], tangents[i]);
      up = up.clone().applyQuaternion(q);
      // re-orthogonalise
      up.addScaledVector(tangents[i], -up.dot(tangents[i])).normalize();
    }
    const side = new THREE.Vector3().crossVectors(tangents[i], up);
    out.push({ t: tangents[i].clone(), up: up.clone(), side: side });
  }
  return out;
};

/*
 * Sweep a tube through stations.
 * stations: [{p:Vector3, rx, ry, se? (superellipse exponent), scale?}]
 */
GEO.tube = function (stations, radial, opts) {
  opts = opts || {};
  radial = radial || 24;
  const n = stations.length;
  const pts = stations.map(s => s.p);
  const fr = GEO.frames(pts);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    const s = stations[i], f = fr[i];
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * U.TAU;
      const [a, b] = GEO.se(th, s.rx, s.ry, s.se || 2);
      pos.push(
        s.p.x + f.side.x * a + f.up.x * b,
        s.p.y + f.side.y * a + f.up.y * b,
        s.p.z + f.side.z * a + f.up.z * b
      );
      uv.push(j / radial, i / (n - 1));
    }
  }
  const row = radial + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

/* Lathe around the Y axis. rings: [{y, r, sx?, sz?}] (sx/sz scale, default 1) */
GEO.lathe = function (rings, radial, opts) {
  opts = opts || {};
  radial = radial || 20;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < rings.length; i++) {
    const R = rings[i];
    const sx = R.sx === undefined ? 1 : R.sx;
    const sz = R.sz === undefined ? 1 : R.sz;
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * U.TAU;
      pos.push(Math.cos(th) * R.r * sx, R.y, Math.sin(th) * R.r * sz);
      uv.push(j / radial, i / (rings.length - 1));
    }
  }
  const row = radial + 1;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      // wind so the face normal points away from the axis (rings run top -> bottom)
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};

/*
 * A bone segment: geometry runs from the origin down the -Y axis for `len`,
 * with optional hemispherical caps at both ends.
 * profile(t) -> radius for t in [0,1]
 */
GEO.bone = function (len, r0, r1, radial, opts) {
  opts = opts || {};
  radial = radial || 14;
  const capSeg = opts.capSeg === undefined ? 4 : opts.capSeg;
  const rings = [];
  const bulge = opts.bulge || 0; // extra radius in the middle (muscle)
  const prof = t => {
    let r = U.lerp(r0, r1, t);
    if (bulge) r += bulge * Math.sin(Math.PI * t);
    if (opts.profile) r = opts.profile(t);
    return r;
  };
  // top cap
  if (opts.capTop !== false) {
    for (let k = capSeg; k >= 1; k--) {
      const a = (k / capSeg) * (Math.PI / 2);
      rings.push({ y: r0 * Math.sin(a), r: Math.max(1e-4, r0 * Math.cos(a)) });
    }
  }
  const body = opts.rings || 8;
  for (let i = 0; i <= body; i++) {
    const t = i / body;
    rings.push({ y: -len * t, r: Math.max(1e-4, prof(t)) });
  }
  if (opts.capBottom !== false) {
    const rb = opts.capBottomR === undefined ? r1 : opts.capBottomR;
    for (let k = 1; k <= capSeg; k++) {
      const a = (k / capSeg) * (Math.PI / 2);
      rings.push({ y: -len - rb * Math.sin(a), r: Math.max(1e-4, rb * Math.cos(a)) });
    }
  }
  return GEO.lathe(rings, radial, opts);
};

/* rounded flattened ellipsoid (sphere scaled) */
GEO.ellipsoid = function (rx, ry, rz, wSeg, hSeg) {
  const g = new THREE.SphereGeometry(1, wSeg || 20, hSeg || 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * rx, p.getY(i) * ry, p.getZ(i) * rz);
  }
  g.computeVertexNormals();
  return g;
};
