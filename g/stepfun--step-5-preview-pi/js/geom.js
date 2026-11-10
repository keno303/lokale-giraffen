/* ------------------------------------------------------------------
 * geom.js — small procedural geometry helpers built on THREE.
 * Everything here is dependency-free apart from the global THREE object.
 * ------------------------------------------------------------------ */
var Geom = (function () {
  'use strict';

  const UP = new THREE.Vector3(0, 1, 0);

  /* super-ellipse cross-section, returns array of {x,y} in the local
   * (side, up) plane.  n = 2 -> ellipse, n -> 4 -> squircler.        */
  function superellipse(n, a, b, seg) {
    const pts = [];
    for (let i = 0; i < seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      const e = 2 / n;
      pts.push({
        x: a * Math.sign(c) * Math.pow(Math.abs(c), e),
        y: b * Math.sign(s) * Math.pow(Math.abs(s), e)
      });
    }
    return pts;
  }

  /* Smooth, tileable value noise in 1D/2D (deterministic). */
  function makeRand(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* Transport frames along a polyline.  refAxis is the axis used to
   * define "side" — pass UP for horizontal spines, a forward axis for
   * vertical limbs.                                                 */
  function framesAlong(path, refAxis) {
    const n = path.length;
    const frames = [];
    let ref = refAxis.clone().normalize();
    for (let i = 0; i < n; i++) {
      const prev = path[Math.max(0, i - 1)];
      const next = path[Math.min(n - 1, i + 1)];
      const t = new THREE.Vector3().subVectors(next, prev);
      if (t.lengthSq() < 1e-12) t.set(0, 1, 0);
      t.normalize();
      let side = new THREE.Vector3().crossVectors(ref, t);
      if (side.lengthSq() < 1e-8) {            // ref parallel to tangent
        const alt = new THREE.Vector3(1, 0, 0);
        side.crossVectors(alt, t);
        if (side.lengthSq() < 1e-8) side.crossVectors(new THREE.Vector3(0, 0, 1), t);
      }
      side.normalize();
      const upv = new THREE.Vector3().crossVectors(t, side).normalize();
      frames.push({ pos: path[i].clone(), t: t, side: side, up: upv });
    }
    return frames;
  }

  /**
   * Sweep a closed 2D profile (array of {x,y}) along a path of Vector3.
   * opts.scale(i) -> {sx, sy, dy}  scales / offsets the cross-section.
   * Returns a BufferGeometry with position, normal and uv attributes.
   */
  function sweep(profile, path, opts) {
    opts = opts || {};
    const ref = opts.refAxis || UP;
    const capStart = opts.capStart !== false;
    const capEnd = opts.capEnd !== false;
    const scale = opts.scale || (i => ({ sx: 1, sy: 1, dy: 0 }));
    const uvScale = opts.uvScale || { u: 1, v: 1 };
    const frames = framesAlong(path, ref);
    const P = profile.length;
    const N = path.length;
    const pos = [], nor = [], uv = [], idx = [];

    // vertex grid
    for (let i = 0; i < N; i++) {
      const f = frames[i];
      const s = scale(i, N);
      const cx = f.pos.x + f.up.x * (s.dy || 0);
      const cy = f.pos.y + f.up.y * (s.dy || 0);
      const cz = f.pos.z + f.up.z * (s.dy || 0);
      for (let j = 0; j < P; j++) {
        const p = profile[j];
        const px = p.x * (s.sx === undefined ? 1 : s.sx);
        const py = p.y * (s.sy === undefined ? 1 : s.sy);
        pos.push(cx + f.side.x * px + f.up.x * py,
          cy + f.side.y * px + f.up.y * py,
          cz + f.side.z * px + f.up.z * py);
        nor.push(0, 0, 0);
        uv.push(j / P * uvScale.u, i / (N - 1) * uvScale.v);
      }
    }
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < P; j++) {
        const j2 = (j + 1) % P;
        const a = i * P + j, b = i * P + j2, c = (i + 1) * P + j, d = (i + 1) * P + j2;
        idx.push(a, b, c, b, d, c);
      }
    }
    // caps: reuse the existing ring vertices, add one centre vertex each
    const addCap = (ringOffset, start) => {
      const base = pos.length / 3;
      const f = frames[start ? 0 : N - 1], s = scale(start ? 0 : N - 1, N);
      pos.push(f.pos.x + f.up.x * (s.dy || 0), f.pos.y + f.up.y * (s.dy || 0), f.pos.z + f.up.z * (s.dy || 0));
      nor.push(0, 0, 0); uv.push(0.5, 0.5);
      for (let j = 0; j < P; j++) {
        const j2 = (j + 1) % P;
        const r0 = ringOffset + j, r1 = ringOffset + j2;
        if (start) idx.push(base, r1, r0);   // normal along -tangent
        else idx.push(base, r0, r1);         // normal along +tangent
      }
    };
    if (capStart) addCap(0, true);
    if (capEnd) addCap((N - 1) * P, false);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** Straight tapered bone: elliptical cross section, radius profile r(t).
   *  Geometry spans local y = 0 .. +length (origin sits on the joint). */
  function limbBone(length, r0, r1, seg, flatten, power) {
    power = power === undefined ? 2 : power;
    flatten = flatten === undefined ? 0.82 : flatten;
    const prof = superellipse(power, 1, flatten, seg);
    const path = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) path.push(new THREE.Vector3(0, length * i / steps, 0));
    return sweep(prof, path, {
      refAxis: new THREE.Vector3(1, 0, 0),
      scale: (i, N) => {
        const t = i / (N - 1);
        // smoothstep taper
        const k = t * t * (3 - 2 * t);
        const r = r0 + (r1 - r0) * k;
        return { sx: r, sy: r };
      },
      uvScale: { u: 2, v: 1 }
    });
  }

  /** Hoof: lathe profile squashed front-to-back (cloven hint).
   *  Sole sits at y = 0, wall rises to y = height. */
  function hoof(radius, height) {
    const pts = [];
    const prof = [
      [0.00, 0.00], [0.72, 0.005], [0.95, 0.02], [1.00, 0.06],
      [0.99, 0.16], [0.94, 0.34], [0.86, 0.62], [0.78, 0.84],
      [0.72, 0.95], [0.70, 1.0]
    ];
    for (const p of prof) pts.push(new THREE.Vector2(p[0] * radius, p[1] * height));
    const g = new THREE.LatheGeometry(pts, 18);
    g.scale(1, 1, 0.78);
    // a shallow groove down the front to suggest the cleft
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const t = y / height;
      const groove = 0.055 * Math.max(0, 1 - Math.abs(x) / (radius * 0.9)) * (1 - t) * (0.4 + 0.6 * t);
      pa.setZ(i, z - groove * Math.sign(z || 1) * 0.5);
    }
    g.computeVertexNormals();
    return g;
  }

  /** Ossicone (horn) with a blunt tip. */
  function ossicone(len, r) {
    const prof = superellipse(2.4, 1, 0.92, 12);
    const path = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      path.push(new THREE.Vector3(Math.sin(t * 0.5) * len * 0.16, t * len, Math.cos(t * 0.5) * len * 0.02 - len * 0.01));
    }
    return sweep(prof, path, {
      refAxis: new THREE.Vector3(1, 0, 0),
      scale: (i, N) => { const t = i / (N - 1); return { sx: r * (1 - 0.72 * t), sy: r * (1 - 0.72 * t) }; }
    });
  }

  /** Leaf-shaped ear: extruded outline, then cupped + bent. */
  function earGeometry(len, wid, thick) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(wid * 0.75, len * 0.16, wid * 0.82, len * 0.68, wid * 0.30, len * 0.98);
    s.bezierCurveTo(wid * 0.12, len * 1.06, -wid * 0.12, len * 1.06, -wid * 0.30, len * 0.98);
    s.bezierCurveTo(-wid * 0.82, len * 0.68, -wid * 0.75, len * 0.16, 0, 0);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: thick, bevelEnabled: true, bevelThickness: thick * 0.45,
      bevelSize: wid * 0.06, bevelSegments: 2, curveSegments: 14
    });
    g.translate(0, 0, -thick * 0.5);
    // cup the ear around its long axis and give it a gentle forward sweep
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const t = y / len;
      const cup = -0.42 * t * t;
      const nx = x * Math.cos(cup) - z * Math.sin(cup);
      const nz = x * Math.sin(cup) + z * Math.cos(cup);
      pa.setX(i, nx);
      pa.setZ(i, nz + t * t * len * 0.16);
      pa.setY(i, y + t * t * t * len * 0.05);
    }
    g.computeVertexNormals();
    return g;
  }

  /** Eye: sphere + a slightly bulged cornea for a glossy catch-light. */
  function eyeGeometry(r) {
    const g = new THREE.SphereGeometry(r, 20, 14);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const l = Math.hypot(x, y, z);
      const nx = x / l, ny = y / l, nz = z / l;
      const bulge = 1 + 0.10 * Math.max(0, nz) * Math.max(0, 1 - Math.abs(nx) * 1.6);
      pa.setXYZ(i, nx * r * bulge, ny * r * bulge * 0.97, nz * r * bulge);
    }
    g.computeVertexNormals();
    return g;
  }

  /** Black tuft of hair (ossicone tip, tail switch). */
  function hairTuft(r, h) {
    const prof = superellipse(2.6, 1, 1, 9);
    const path = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      path.push(new THREE.Vector3(
        Math.sin(t * 2.2) * r * 0.55,
        t * h,
        Math.cos(t * 1.7) * r * 0.35 - r * 0.12
      ));
    }
    return sweep(prof, path, {
      refAxis: new THREE.Vector3(1, 0, 0),
      scale: (i, N) => {
        const t = i / (N - 1);
        const k = Math.sin(Math.PI * Math.min(1, t * 1.25)) * (1 - 0.35 * t);
        return { sx: r * (0.55 + 0.75 * k), sy: r * (0.55 + 0.75 * k) };
      }
    });
  }

  /** Grass tuft: a few crossed blades. */
  function grassTuft(w, h, blades) {
    const geo = [];
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2 + 0.3;
      const g = new THREE.PlaneGeometry(w, h, 1, 3);
      const pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i);
        const t = (y + h / 2) / h;
        pa.setX(i, x * (0.35 + 0.9 * t));
        pa.setZ(i, Math.sin(t * 2.4) * w * 0.55 * t);
      }
      g.computeVertexNormals();
      g.rotateY(a);
      g.rotateZ((Math.random() - 0.5) * 0.3);
      geo.push(g);
    }
    return mergeGeometries(geo);
  }

  /** Minimal geometry merge (positions/normals/uvs, non-indexed input). */
  function mergeGeometries(list) {
    const pos = [], nor = [], uv = [];
    for (const g of list) {
      const gg = g.index ? g.toNonIndexed() : g;
      const p = gg.attributes.position, n = gg.attributes.normal, u = gg.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        nor.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
        uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return out;
  }

  return {
    superellipse, sweep, framesAlong, limbBone, hoof, ossicone,
    earGeometry, eyeGeometry, hairTuft, grassTuft, mergeGeometries, makeRand
  };
})();
