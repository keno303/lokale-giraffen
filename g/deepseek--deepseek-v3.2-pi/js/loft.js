/* ---------------------------------------------------------------------------
 * loft.js — build organic, tapered, elliptical tube geometry along a spline.
 * This is what makes the giraffe's limbs/neck/body look fleshy instead of
 * like stacked cylinders. Classic script, depends on global THREE + U.
 * ------------------------------------------------------------------------- */
(function () {
  const G = (window.G = {});
  const V = (a, b, c) => new THREE.Vector3(a, b, c);

  /* ---- loft along a path ---------------------------------------------
   * o = {
   *   path:   [[x,y,z], ...]      control points (Catmull-Rom spline)
   *   radii:  [[rx,ry], ...]      ellipse half-axes at each control point
   *   rolls:  [rad, ...]          optional cross-section roll per control pt
   *   radial: 22                  rings around the tube
   *   sub:    8                   path samples between control points
   *   capStart/capEnd: {round:0..1, len:1}  rounded end (1 = fully round)
   *   noise:  amp                 wobble so it is not perfectly rotationally symmetric
   *   uv:     [uRepeat, vRepeat]
   *   closes  : bool              do not add caps (open tube)
   * }
   * Returns BufferGeometry (indexed internally, smoothed normals, uv, color=white)
   * ------------------------------------------------------------------- */
  G.loft = function (o) {
    const path = o.path.map(p => V(p[0], p[1], p[2]));
    const radii = o.radii.map(r => [r[0], r[1]]);
    const rolls = o.rolls || path.map(() => 0);
    const radial = o.radial || 22;
    const sub = o.sub || 8;
    const noise = o.noise || 0;
    const uvRep = o.uv || [1, 1];
    const curve = new THREE.CatmullRomCurve3(path, false, 'catmullrom', o.tension !== undefined ? o.tension : 0.5);
    const total = (path.length - 1) * sub;
    const pts = curve.getPoints(total);
    const tan = [];
    for (let i = 0; i <= total; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(total, i + 1)];
      const t = b.clone().sub(a);
      if (t.lengthSq() < 1e-12) t.set(0, 1, 0);
      tan.push(t.normalize());
    }
    // station interpolation helper (linear along control-point index)
    const lerpStation = (i, arr) => {
      const f = (i / total) * (path.length - 1);
      const k = Math.min(path.length - 2, Math.floor(f));
      const tt = U.smoothstep(f - k);
      const a = arr[k], b = arr[k + 1];
      if (Array.isArray(a)) return a.map((v, j) => U.lerp(v, b[j], tt));
      return U.lerp(a, b, tt);
    };

    // parallel-transport frames
    let normal = null;
    const frames = [];
    for (let i = 0; i <= total; i++) {
      const t = tan[i];
      if (!normal) {
        const ref = Math.abs(t.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
        normal = ref.cross(t).normalize();
      } else if (i > 0) {
        const prev = tan[i - 1];
        const axis = prev.clone().cross(t);
        if (axis.lengthSq() > 1e-12) {
          const ang = Math.acos(U.clamp(prev.dot(t), -1, 1));
          normal.applyAxisAngle(axis.normalize(), ang);
          normal = normal.clone().sub(t.clone().multiplyScalar(normal.dot(t))).normalize();
        }
      }
      frames.push({ side: normal.clone(), up: t.clone().cross(normal).normalize(), t: t });
    }

    // build rings (with rounded caps appended outside the path ends)
    const rings = [];       // each: {center:V, frame, rx, ry, roll, capScale}
    const capS = o.capStart || o.capEnd || null;
    const capRings = 5;
    const addRing = (center, fr, rx, ry, roll, squeeze) => {
      rings.push({ c: center, f: fr, rx: rx * (1 - squeeze), ry: ry * (1 - squeeze), roll, sq: squeeze });
    };
    for (let i = 0; i <= total; i++) {
      const r = lerpStation(i, radii);
      const roll = lerpStation(i, rolls);
      addRing(pts[i].clone(), frames[i], r[0], r[1], roll, 0);
    }
    // arc length along the path (used for the v coordinate)
    let arc = 0;
    for (let i = 1; i < rings.length; i++) arc += rings[i].c.distanceTo(rings[i - 1].c);
    const len0 = arc;

    // rounded caps: extend beyond the ends with elliptical profile
    function capBuild(which) {
      const cap = which === 'start' ? o.capStart : o.capEnd;
      if (!cap || !cap.round) return null;
      const base = which === 'start' ? rings[0] : rings[rings.length - 1];
      const dir = which === 'start' ? base.f.t.clone().negate() : base.f.t.clone();
      const fr = { side: base.f.side, up: base.f.up, t: dir };
      const a = Math.max(0.001, (cap.len !== undefined ? cap.len : Math.min(base.rx, base.ry)) * cap.round);
      const out = [];
      for (let k = 1; k <= capRings; k++) {
        const f = k / (capRings + 1);
        const s = Math.sqrt(Math.max(0, 1 - f * f));
        const off = a * f;
        out.push({ c: base.c.clone().add(dir.clone().multiplyScalar(off)), f: fr,
          rx: base.rx * s, ry: base.ry * s, roll: base.roll, sq: 0, end: which, t: f });
      }
      return { rings: out, len: a, dir: dir, base: base, fr: fr };
    }
    const cs = capBuild('start'), ce = capBuild('end');

    // ---- vertex grid (rows, radial) ----------------------------------
    const rows = [];
    if (cs) { for (let i = cs.rings.length - 1; i >= 0; i--) rows.push(cs.rings[i]); }
    for (const r of rings) rows.push(r);
    if (ce) for (const r of ce.rings) rows.push(r);

    const R = rows.length, C = radial;
    const P = new Array(R * C);
    const Nn = new Array(R * C);
    const UU = new Array(R * C);

    let arcLen = 0, arcRows = [0];
    for (let i = 1; i < R; i++) { arcLen += Math.max(1e-5, rows[i].c.distanceTo(rows[i - 1].c)); arcRows.push(arcLen); }

    for (let i = 0; i < R; i++) {
      const row = rows[i];
      const rollQ = new THREE.Quaternion().setFromAxisAngle(row.f.t, row.roll);
      const side = row.f.side.clone().applyQuaternion(rollQ);
      const up = row.f.up.clone().applyQuaternion(rollQ);
      for (let j = 0; j < C; j++) {
        const th = (j / C) * Math.PI * 2;
        let rr = 1;
        if (noise > 0) {
          rr = 1 + noise * (U.noise2(i * 0.35 + 7.1, th * 1.6) - 0.5) * 2 * 0.5
                 + noise * 0.35 * (U.noise2(i * 1.1, th * 3.1) - 0.5);
        }
        const p = row.c.clone()
          .add(side.clone().multiplyScalar(Math.cos(th) * row.rx * rr))
          .add(up.clone().multiplyScalar(Math.sin(th) * row.ry * rr));
        P[i * C + j] = p;
        UU[i * C + j] = [0, 0];
      }
    }
    // UV: u around (scaled with real circumference so patches stay the same size),
    //     v along the length (scaled with real arc length)
    for (let i = 0; i < R; i++) {
      for (let j = 0; j < C; j++) {
        UU[i * C + j] = [(j / C) * uvRep[0], (arcRows[i] / Math.max(1e-5, len0 > 0 ? len0 : arcLen)) * uvRep[1]];
      }
    }

    // ---- smooth normals via wrapped central differences --------------
    for (let i = 0; i < R; i++) {
      const ip = Math.max(0, i - 1), inx = Math.min(R - 1, i + 1);
      for (let j = 0; j < C; j++) {
        const jm = (j - 1 + C) % C, jp = (j + 1) % C;
        const du = P[ip * C + j].clone().sub(P[inx * C + j]);
        const dv = P[i * C + jp].clone().sub(P[i * C + jm]);
        let n = du.cross(dv);
        if (n.lengthSq() < 1e-12) n = rows[i].f.t.clone();
        Nn[i * C + j] = n.normalize();
      }
    }

    // ---- emit (with seam duplication for clean uv wrap) --------------
    const pos = [], nor = [], uv = [], idx = [];
    const push = (p, n, u) => { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(u[0], u[1]); return pos.length / 3 - 1; };
    const grid = [];
    for (let i = 0; i < R; i++) {
      grid[i] = [];
      for (let j = 0; j <= C; j++) {
        const jj = j % C;
        const uu = [j === C ? uvRep[0] : UU[i * C + jj][0], UU[i * C + jj][1]];
        grid[i][j] = push(P[i * C + jj], Nn[i * C + jj], uu);
      }
    }
    for (let i = 0; i < R - 1; i++) {
      for (let j = 0; j < C; j++) {
        const a = grid[i][j], b = grid[i][j + 1], c = grid[i + 1][j + 1], d = grid[i + 1][j];
        idx.push(a, b, c, a, c, d);
      }
    }
    // poles at rounded cap ends
    if (cs) {
      const tip = rows[0].c.clone().add(cs.dir.clone().multiplyScalar(cs.len));
      // fan: use rows[0] ring vertices (grid row 0)
      const tipI = push(tip, cs.dir.clone().negate(), [uvRep[0] * 0.5, 0]);
      for (let j = 0; j < C; j++) idx.push(grid[0][j], grid[0][j + 1], tipI);
    }
    if (ce) {
      const tip = rows[R - 1].c.clone().add(ce.dir.clone().multiplyScalar(ce.len));
      const tipI = push(tip, ce.dir.clone(), [uvRep[0] * 0.5, uvRep[1]]);
      const last = R - 1;
      for (let j = 0; j < C; j++) idx.push(grid[last][j], tipI, grid[last][j + 1]);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.userData.rows = R; g.userData.radial = C;
    g.computeBoundingSphere();
    return g;
  };

  /* ---- ellipsoid ------------------------------------------------------ */
  G.ellipsoid = function (rx, ry, rz, segU, segV) {
    const g = new THREE.SphereGeometry(1, segU || 24, segV || 16);
    g.scale(rx, ry, rz);
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      // keep uvs roughly in metres-ish space (handled by texture repeat anyway)
      uv.setXY(i, uv.getX(i), uv.getY(i));
    }
    g.computeVertexNormals();
    return g;
  };

  /* ---- merge parts into one non-indexed geometry ---------------------
   * items: [{ geo, matrix?, uvScale?, tint? }]
   * ------------------------------------------------------------------- */
  G.merge = function (items) {
    const pos = [], nor = [], uv = [];
    let uvBounds = { min: [0, 0], max: [0, 0] };
    for (const it of items) {
      let g = it.geo.index ? it.geo.toNonIndexed() : it.geo.clone();
      if (it.matrix) g.applyMatrix4(it.matrix);
      if (it.uvScale) {
        const a = g.attributes.uv;
        for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * it.uvScale[0], a.getY(i) * it.uvScale[1]);
      }
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        nor.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
        uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
      }
      g.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    return g;
  };

  /* ---- paint vertex colours by a callback ----------------------------
   * fn(x,y,z, nx,ny,nz) -> [r,g,b] in 0..1 (linear-ish multiplier)
   * ------------------------------------------------------------------- */
  G.paint = function (geo, fn) {
    const p = geo.attributes.position, n = geo.attributes.normal;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const c = fn(p.getX(i), p.getY(i), p.getZ(i), n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0, i);
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  };

  /* ---- random small hairs / fur cards helper ------------------------- */
  G.curveArc = function (a, b, bulge, seg) {
    // returns points along an arc from a to b, bulging perpendicular
    const A = V(a[0], a[1], a[2]), B = V(b[0], b[1], b[2]);
    const m = A.clone().add(B).multiplyScalar(0.5);
    const d = B.clone().sub(A);
    let perp = V(0, 1, 0).cross(d);
    if (perp.lengthSq() < 1e-6) perp = V(1, 0, 0).cross(d);
    perp.normalize().multiplyScalar(bulge);
    const c = m.add(perp);
    const q = new THREE.QuadraticBezierCurve3(A, c, B);
    return q.getPoints(seg || 8);
  };
})();
