/* geom.js — parametric tube builder with UVs (world-scaled) and vertex colours */
'use strict';

const DOWN_VEC = new THREE.Vector3(0, -1, 0);

/* orientation that points local -Y along dir */
function quatAlong(dir) {
  return new THREE.Quaternion().setFromUnitVectors(DOWN_VEC, dir);
}

/* Build parallel-transport-ish frames along a polyline.
   side: preferred "normal" (the tube's side direction). b = t x side (the tube's up/dorsal). */
function framesFromPoints(pts, side) {
  const frames = [];
  const sideV = side ? side.clone().normalize() : new THREE.Vector3(1, 0, 0);
  let arc = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const t = new THREE.Vector3();
    if (i === 0) t.subVectors(pts[1], pts[0]);
    else if (i === pts.length - 1) t.subVectors(pts[i], pts[i - 1]);
    else t.subVectors(pts[i + 1], pts[i - 1]);
    t.normalize();
    if (i > 0) arc += p.distanceTo(pts[i - 1]);
    const n = sideV.clone().addScaledVector(t, -sideV.dot(t));
    if (n.lengthSq() < 1e-8) n.set(1, 0, 0).addScaledVector(t, -t.x);
    n.normalize();
    const b = new THREE.Vector3().crossVectors(t, n).normalize();
    frames.push({ p: p.clone(), t: t, n: n, b: b, arc: arc });
  }
  /* normalise arc to [0,1] */
  const total = arc || 1;
  frames.forEach(f => f.s = f.arc / total);
  return frames;
}

function framesFromCurve(curve, segs, side) {
  const pts = [];
  for (let i = 0; i <= segs; i++) pts.push(curve.getPoint(i / segs));
  return framesFromPoints(pts, side);
}

function straightFrames(a, b, rows, side) {
  const pts = [];
  for (let i = 0; i <= rows; i++) {
    pts.push(new THREE.Vector3().lerpVectors(a, b, i / rows));
  }
  return framesFromPoints(pts, side);
}

/* profileFn(t, frame) -> {rx, ry, oy}   oy offsets the centre along b.
   colorFn(t, frame, a) -> THREE.Color | {r,g,b} | null   (a = angle around tube)
   uTiles: number of texture tiles around the circumference (integer, seamless)
   vScale: texture tiles per 1.0 of arc length (1/texScale)                        */
function buildTube(frames, profileFn, radialSegs, colorFn, uTiles, vScale, opts) {
  opts = opts || {};
  const rows = frames.length, cols = radialSegs + 1;
  const pos = new Float32Array(rows * cols * 3);
  const nor = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const col = new Float32Array(rows * cols * 3);
  const idx = [];
  const tmp = new THREE.Vector3();
  const nrm = new THREE.Vector3();

  for (let i = 0; i < rows; i++) {
    const f = frames[i], tt = rows > 1 ? i / (rows - 1) : 0;
    const pr = profileFn(tt, f);
    const rx = Math.max(pr.rx, 1e-5), ry = Math.max(pr.ry, 1e-5);
    const oy = pr.oy || 0;
    const cx = f.p.x + f.b.x * oy, cy = f.p.y + f.b.y * oy, cz = f.p.z + f.b.z * oy;
    const v = f.s * (opts.vTiles !== undefined ? opts.vTiles : 1) * (vScale !== undefined ? vScale : 1);
    for (let j = 0; j < cols; j++) {
      const a = (j / radialSegs) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const k = (i * cols + j);
      tmp.set(cx + f.n.x * rx * ca + f.b.x * ry * sa,
        cy + f.n.y * rx * ca + f.b.y * ry * sa,
        cz + f.n.z * rx * ca + f.b.z * ry * sa);
      pos[k * 3] = tmp.x; pos[k * 3 + 1] = tmp.y; pos[k * 3 + 2] = tmp.z;
      /* analytic ellipse normal */
      nrm.set(f.n.x * (ca / rx) + f.b.x * (sa / ry),
        f.n.y * (ca / rx) + f.b.y * (sa / ry),
        f.n.z * (ca / rx) + f.b.z * (sa / ry)).normalize();
      nor[k * 3] = nrm.x; nor[k * 3 + 1] = nrm.y; nor[k * 3 + 2] = nrm.z;
      uv[k * 2] = (j / radialSegs) * uTiles;
      uv[k * 2 + 1] = v;
      let cr = 1, cg = 1, cb = 1;
      if (colorFn) {
        const c = colorFn(tt, f, a);
        if (c) { cr = c.r; cg = c.g; cb = c.b; }
      }
      col[k * 3] = cr; col[k * 3 + 1] = cg; col[k * 3 + 2] = cb;
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  if (opts.flatShading) geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/* integer tile count around a tube so the pattern wraps seamlessly */
function circumTiles(avgRadius, texScale) {
  const circ = TAU * avgRadius;
  return Math.max(1, Math.round(circ / texScale));
}

/* convenience: sample a polyline curve through control points */
function catmullPoints(ctrl, samples) {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  curve.curveType = 'catmullrom';
  curve.tension = 0.5;
  const pts = [];
  for (let i = 0; i <= samples; i++) pts.push(curve.getPoint(i / samples));
  return pts;
}

/* Sphere geometry with per-vertex tint function (for heads/details) */
function tintedSphere(radius, wSeg, hSeg, tintFn) {
  const geo = new THREE.SphereGeometry(radius, wSeg, hSeg);
  if (tintFn) {
    const p = geo.attributes.position, n = geo.attributes.normal;
    const arr = new Float32Array(p.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
      const c = tintFn(v, i);
      arr[i * 3] = c ? c.r : 1; arr[i * 3 + 1] = c ? c.g : 1; arr[i * 3 + 2] = c ? c.b : 1;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return geo;
}

/* merge indexed geometries that share position/normal/uv layout */
function mergeGeos(geos) {
  let vCount = 0, iCount = 0;
  geos.forEach(g => { vCount += g.attributes.position.count; iCount += g.index ? g.index.count : g.attributes.position.count; });
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3),
    uv = new Float32Array(vCount * 2), col = new Float32Array(vCount * 3);
  const idx = (vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount));
  let vo = 0, io = 0;
  geos.forEach(g => {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv,
      c = g.attributes.color;
    pos.set(p.array, vo * 3);
    nor.set(n.array, vo * 3);
    if (u) uv.set(u.array, vo * 2);
    if (c) col.set(c.array, vo * 3);
    else col.fill(1, vo * 3, (vo + p.count) * 3);
    if (g.index) {
      const gi = g.index.array;
      for (let k = 0; k < gi.length; k++) idx[io + k] = gi[k] + vo;
      io += gi.length;
    } else {
      for (let k = 0; k < p.count; k++) idx[io + k] = k + vo;
      io += p.count;
    }
    vo += p.count;
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/* tint a geometry's colour attribute with a flat colour */
function tintGeo(geo, r, g, b) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = r; arr[i * 3 + 1] = g; arr[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
