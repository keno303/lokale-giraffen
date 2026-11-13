/* geom.js — geometry helpers: lofted tubes, tapered bones, noisy blobs */
(function (global) {
  'use strict';

  const V3 = THREE.Vector3;

  /**
   * Loft a closed tube along a curve.
   *  center : THREE.Curve
   *  radii  : function(t) -> {x: lateral radius, y: in-plane radius}   (or a number)
   *  ref    : initial reference vector (the "lateral" axis seed)
   *  shade  : function(color, t, angle) -> multiply vertex colour (belly/back shading)
   */
  function loftGeometry(opts) {
    const center = opts.center;
    const n = opts.sections || 32;
    const radial = opts.radial || 16;
    const radiiFn = opts.radii;
    const ref = (opts.ref || new V3(0, 0, 1)).clone().normalize();
    const shade = opts.shade || null;
    const capStart = opts.capStart !== false;
    const capEnd = opts.capEnd !== false;
    const vScale = opts.vScale || 1;
    const t0 = opts.t0 === undefined ? 0 : opts.t0;
    const t1 = opts.t1 === undefined ? 1 : opts.t1;
    const span = t1 - t0;

    const C = [], T = [], R = [], N = [];
    for (let i = 0; i < n; i++) C.push(center.getPoint(t0 + span * (i / (n - 1))));
    for (let i = 0; i < n; i++) {
      const a = C[Math.max(0, i - 1)], b = C[Math.min(n - 1, i + 1)];
      T.push(new V3().subVectors(b, a).normalize());
    }
    let r0 = ref.clone().sub(T[0].clone().multiplyScalar(ref.dot(T[0])));
    if (r0.lengthSq() < 1e-8) r0 = new V3(0, 1, 0).sub(T[0].clone().multiplyScalar(T[0].y));
    r0.normalize();
    R.push(r0);
    N.push(new V3().crossVectors(T[0], R[0]).normalize());
    for (let i = 1; i < n; i++) {
      const r = R[i - 1].clone().sub(T[i].clone().multiplyScalar(R[i - 1].dot(T[i])));
      if (r.lengthSq() < 1e-8) r.set(1, 0, 0).sub(T[i].clone().multiplyScalar(T[i].x));
      r.normalize();
      R.push(r);
      N.push(new V3().crossVectors(T[i], r).normalize());
    }

    const pos = [], uvs = [], cols = [];
    const col = new THREE.Color();
    const ring = radial + 1;
    for (let i = 0; i < n; i++) {
      const t = t0 + span * (i / (n - 1));
      const rad = (typeof radiiFn === 'function') ? radiiFn(t) : { x: radiiFn, y: radiiFn };
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const p = new V3().copy(C[i])
          .addScaledVector(R[i], rad.x * Math.cos(a))
          .addScaledVector(N[i], rad.y * Math.sin(a));
        pos.push(p.x, p.y, p.z);
        uvs.push(j / radial, t * vScale);
        if (shade) { shade(col, t, a); cols.push(col.r, col.g, col.b); }
        else cols.push(1, 1, 1);
      }
    }

    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * ring + j, b = a + ring, c = b + 1, d = a + 1;
        idx.push(a, b, d, b, c, d);
      }
    }

    const g = new THREE.BufferGeometry();
    const vcount = n * ring;
    let extra = 0;
    if (capStart) extra++;
    if (capEnd) extra++;

    const posArr = new Float32Array((vcount + extra) * 3);
    const uvArr = new Float32Array((vcount + extra) * 2);
    const colArr = new Float32Array((vcount + extra) * 3);
    posArr.set(pos); uvArr.set(uvs); colArr.set(cols);

    let vi = vcount;
    if (capStart) {
      const p = C[0];
      posArr[vi * 3] = p.x; posArr[vi * 3 + 1] = p.y; posArr[vi * 3 + 2] = p.z;
      uvArr[vi * 2] = 0.5; uvArr[vi * 2 + 1] = 0;
      colArr[vi * 3] = 1; colArr[vi * 3 + 1] = 1; colArr[vi * 3 + 2] = 1;
      for (let j = 0; j < radial; j++) idx.push(vi, j + 1, j);
      vi++;
    }
    if (capEnd) {
      const p = C[n - 1];
      posArr[vi * 3] = p.x; posArr[vi * 3 + 1] = p.y; posArr[vi * 3 + 2] = p.z;
      uvArr[vi * 2] = 0.5; uvArr[vi * 2 + 1] = vScale;
      colArr[vi * 3] = 1; colArr[vi * 3 + 1] = 1; colArr[vi * 3 + 2] = 1;
      const base = (n - 1) * ring;
      for (let j = 0; j < radial; j++) idx.push(vi, base + j, base + j + 1);
      vi++;
    }

    g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** tapered limb bone pointing down (-Y) with a slight forward bow */
  function boneGeometry(length, r0, r1, opts) {
    opts = opts || {};
    const bow = opts.bow || 0;
    const bulge = opts.bulge || 0;
    const flat = opts.flat || 1;         // lateral/length squash of the cross section
    const curve = new THREE.CatmullRomCurve3([
      new V3(0, 0, 0),
      new V3(bow * 0.3, -length * 0.34, 0),
      new V3(bow * 0.78, -length * 0.68, 0),
      new V3(bow, -length, 0),
    ], false, 'catmullrom', 0.4);
    return loftGeometry({
      center: curve,
      sections: opts.sections || 14,
      radial: opts.radial || 12,
      radii: (t) => {
        const r = r0 + (r1 - r0) * t;
        const b = 1 + bulge * Math.sin(Math.PI * t);
        return { x: r * b * flat, y: r * b };
      },
      shade: opts.shade,
      capStart: true,
      capEnd: true,
    });
  }

  /** sphere pushed around by pseudo noise – used for foliage / rocks */
  function blobGeometry(radius, detail, amount, seed, scale) {
    const g = new THREE.IcosahedronGeometry(radius, detail);
    const pos = g.attributes.position;
    const rnd = global.Patterns.mulberry32(seed || 11);
    const v = new V3();
    const s = scale || new V3(1, 1, 1);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = 1 + amount * (Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7) * 0.5 +
        Math.sin(v.z * 4.3 + seed * 0.7) * 0.5);
      v.multiplyScalar(n);
      v.x *= s.x; v.y *= s.y; v.z *= s.z;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    // spherical UVs so textured materials wrap the blob correctly
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const len = Math.max(1e-5, Math.sqrt(x * x + y * y + z * z));
      uv[i * 2] = 0.5 + Math.atan2(z, x) / (Math.PI * 2);
      uv[i * 2 + 1] = 0.5 - Math.asin(Math.max(-1, Math.min(1, y / len))) / Math.PI;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // neutral vertex colours so materials with vertexColors stay usable
    const col = new Float32Array(pos.count * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }

  global.Geom = { loftGeometry, boneGeometry, blobGeometry };
})(window);
