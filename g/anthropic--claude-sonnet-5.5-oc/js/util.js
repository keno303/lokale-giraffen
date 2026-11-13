/* Utility helpers: splines, lofted tubes, skinning weights, small RNG */
(function () {
  const V3 = THREE.Vector3;

  // Monotone cubic (PCHIP) interpolation – smooth profiles without overshoot.
  function pchip(xs, ys) {
    const n = xs.length;
    const h = [], d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) {
      h[i] = xs[i + 1] - xs[i];
      d[i] = (ys[i + 1] - ys[i]) / h[i];
    }
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) m[i] = 0;
      else {
        const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
      }
    }
    return function (x) {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0;
      while (x > xs[i + 1]) i++;
      const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] +
        (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
    };
  }

  // profile from [[s, value], ...]
  function profile(pts) {
    return pchip(pts.map(p => p[0]), pts.map(p => p[1]));
  }

  function smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Loft an elliptical tube along a path.
   *  path(s)->Vector3, rx(s) lateral (x axis) radius, ry(s) other radius, s in [0,1]
   *  skin(s, p) -> [i0,i1,w0,w1] optional
   */
  function loft(o) {
    const R = o.rings || 60, N = o.radial || 24, capN = o.cap === undefined ? 6 : o.cap;
    const st = [];
    const e = 1e-3;
    for (let i = 0; i <= R; i++) {
      const s = i / R;
      const p = o.path(s);
      const a = o.path(Math.max(0, s - e)), b = o.path(Math.min(1, s + e));
      const T = b.clone().sub(a).normalize();
      const S = new V3(1, 0, 0);
      S.addScaledVector(T, -T.x).normalize();
      const U = new V3().crossVectors(T, S);
      st.push({ p, T, S, U, rx: o.rx(s), ry: o.ry(s), s });
    }
    const rings = [];
    if (o.capA !== false) {
      const f = st[0], r = (f.rx + f.ry) * 0.5 * (o.capLenA || 1);
      for (let k = 0; k < capN; k++) {
        const al = (k / capN) * Math.PI / 2;
        rings.push({ c: f.p.clone().addScaledVector(f.T, -r * Math.cos(al)), sc: Math.sin(al), st: f, tip: k === 0 ? -1 : 0 });
      }
    }
    for (const s of st) rings.push({ c: s.p, sc: 1, st: s, tip: 0 });
    if (o.capB !== false) {
      const f = st[R], r = (f.rx + f.ry) * 0.5 * (o.capLenB || 1);
      for (let k = 1; k <= capN; k++) {
        const al = (k / capN) * Math.PI / 2;
        rings.push({ c: f.p.clone().addScaledVector(f.T, r * Math.sin(al)), sc: Math.cos(al), st: f, tip: k === capN ? 1 : 0 });
      }
    }
    const nr = rings.length;
    const pos = new Float32Array(nr * N * 3);
    const skinIdx = o.skin ? new Uint16Array(nr * N * 4) : null;
    const skinW = o.skin ? new Float32Array(nr * N * 4) : null;
    const tipN = [];
    for (let i = 0; i < nr; i++) {
      const r = rings[i], f = r.st;
      let sk = null;
      if (o.skin) sk = o.skin(f.s, r.c);
      for (let j = 0; j < N; j++) {
        const th = (j / N) * Math.PI * 2;
        const cx = Math.cos(th) * f.rx * r.sc, cy = Math.sin(th) * f.ry * r.sc;
        const k = (i * N + j) * 3;
        pos[k] = r.c.x + f.S.x * cx + f.U.x * cy;
        pos[k + 1] = r.c.y + f.S.y * cx + f.U.y * cy;
        pos[k + 2] = r.c.z + f.S.z * cx + f.U.z * cy;
        if (sk) {
          const q = (i * N + j) * 4;
          skinIdx[q] = sk[0]; skinIdx[q + 1] = sk[1];
          skinW[q] = sk[2]; skinW[q + 1] = sk[3];
        }
      }
      if (r.tip) tipN.push([i, r.tip === -1 ? f.T.clone().negate() : f.T.clone()]);
    }
    const idx = [];
    for (let i = 0; i < nr - 1; i++) {
      for (let j = 0; j < N; j++) {
        const j1 = (j + 1) % N;
        const a = i * N + j, b = i * N + j1, c = (i + 1) * N + j, d = (i + 1) * N + j1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const nrm = g.attributes.normal;
    for (const [i, n] of tipN) for (let j = 0; j < N; j++) nrm.setXYZ(i * N + j, n.x, n.y, n.z);
    if (o.skin) {
      g.setAttribute('skinIndex', new THREE.BufferAttribute(skinIdx, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4));
    }
    g.computeBoundingSphere();
    return g;
  }

  // Blend weights along a bone chain; cuts = joint coordinates (joints 1..n-1)
  function chainWeights(c, cuts, win) {
    let b = 0;
    for (let k = 0; k < cuts.length; k++) {
      const w = Array.isArray(win) ? win[k] : win;
      if (c >= cuts[k] + w) b = k + 1;
      else if (c > cuts[k] - w) {
        const t = smoothstep(cuts[k] - w, cuts[k] + w, c);
        return [k, k + 1, 1 - t, t];
      } else break;
    }
    return [b, b, 1, 0];
  }

  // Merge several BufferGeometries (same attributes, optional index)
  function mergeGeometries(list) {
    let nv = 0, ni = 0;
    for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const names = Object.keys(list[0].attributes);
    const out = {};
    for (const n of names) out[n] = new Float32Array(nv * list[0].attributes[n].itemSize);
    const idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const g of list) {
      const cnt = g.attributes.position.count;
      for (const n of names) out[n].set(g.attributes[n].array, vo * g.attributes[n].itemSize);
      if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + vo; }
      else for (let i = 0; i < cnt; i++) idx[io++] = vo + i;
      vo += cnt;
    }
    const m = new THREE.BufferGeometry();
    for (const n of names) m.setAttribute(n, new THREE.BufferAttribute(out[n], list[0].attributes[n].itemSize));
    m.setIndex(new THREE.BufferAttribute(idx, 1));
    return m;
  }

  window.GU = { pchip, profile, smoothstep, mulberry32, loft, chainWeights, mergeGeometries };
})();
