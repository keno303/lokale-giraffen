/* =========================================================================
   giraffe.js — procedural giraffe: geometry, skin rig and walk cycle.

   The animal is built as a set of lofted tubes bound to a bone hierarchy
   and deformed with THREE.SkinnedMesh.  The walk cycle is solved with a
   planar CCD IK solver and baked into a cycle table at start-up, so the
   runtime is a cheap table lookup and the motion is rock steady.
   ========================================================================= */
(function (global) {
  'use strict';

  const U = global.U;
  const THREE = global.THREE;

  /* ======================================================================
     small geometry helpers
     ====================================================================== */

  function ellipseProfile(n, topExp, botExp) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const e = s >= 0 ? (topExp || 2) : (botExp || 2);
      const p = 2 / e;
      pts.push([Math.sign(c) * Math.pow(Math.abs(c), p), Math.sign(s) * Math.pow(Math.abs(s), p)]);
    }
    return pts;
  }

  /**
   * Loft a closed profile along a list of sections.
   * sections: [{ c: Vector3, rx, ry, tan?: Vector3 }]
   * profile:  array of [x,y] in normalised cross-section space
   * opts:     { uRepeat, vScale, vWarp, capStart, capEnd, colorFn }
   */
  function buildTube(sections, profile, opts) {
    opts = opts || {};
    const N = profile.length;
    const M = sections.length;
    const cols = N + 1;              // duplicated seam column

    // profile perimeter
    const per = [0];
    for (let i = 1; i <= N; i++) {
      const a = profile[i - 1], b = profile[i % N];
      per[i] = per[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const total = per[N] || 1;

    // arc length along the tube
    const arc = [0];
    for (let i = 1; i < M; i++) arc[i] = arc[i - 1] + sections[i].c.distanceTo(sections[i - 1].c);
    const arcTotal = arc[M - 1] || 1;

    // frames
    const frames = [];
    for (let i = 0; i < M; i++) {
      let t;
      if (i === 0) t = sections[1].c.clone().sub(sections[0].c);
      else if (i === M - 1) t = sections[M - 1].c.clone().sub(sections[M - 2].c);
      else {
        const a = sections[i].c.clone().sub(sections[i - 1].c);
        const b = sections[i + 1].c.clone().sub(sections[i].c);
        t = a.normalize().add(b.normalize()).normalize();
        if (!isFinite(t.x)) t = b.clone().normalize();
      }
      if (opts.tan) t = opts.tan.clone();
      const side = opts.side ? opts.side.clone() : new THREE.Vector3(0, 0, 1);
      const up = new THREE.Vector3().crossVectors(side, t).normalize();
      frames.push({ t: t.normalize(), side: side, up: up });
    }

    const pos = [], nor = [], uv = [], col = [], idx = [];
    const uRepeat = opts.uRepeat !== undefined ? opts.uRepeat : 1;
    const vScale = opts.vScale !== undefined ? opts.vScale : 1;
    const vWarp = opts.vWarp || null;

    for (let r = 0; r < M; r++) {
      const s = sections[r];
      const f = frames[r];
      const st = arc[r] / arcTotal;
      const v = vScale * (vWarp ? vWarp(st) : st);
      for (let i = 0; i < cols; i++) {
        const pi = profile[i % N];
        const px = s.c.x + f.side.x * (s.rx * pi[0]) + f.up.x * (s.ry * pi[1]);
        const py = s.c.y + f.side.y * (s.rx * pi[0]) + f.up.y * (s.ry * pi[1]);
        const pz = s.c.z + f.side.z * (s.rx * pi[0]) + f.up.z * (s.ry * pi[1]);
        pos.push(px, py, pz);
        nor.push(0, 0, 0);
        uv.push((per[i] / total) * uRepeat, v);
        if (opts.colorFn) {
          const c = opts.colorFn(i / N, st, px, py, pz);
          col.push(c[0], c[1], c[2]);
        } else {
          col.push(1, 1, 1);
        }
      }
    }
    for (let r = 0; r < M - 1; r++) {
      for (let i = 0; i < N; i++) {
        const a = r * cols + i, b = a + 1, c = a + cols, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }

    // caps (fan to a centre point)
    function addCap(r, flip) {
      const s = sections[r], f = frames[r];
      const base = pos.length / 3;
      pos.push(s.c.x, s.c.y, s.c.z); nor.push(0, 0, 0);
      uv.push(0.5, r === 0 ? 0 : vScale);
      col.push(opts.colorFn ? opts.colorFn(0.5, r === 0 ? 0 : 1)[0] : 1,
        opts.colorFn ? opts.colorFn(0.5, r === 0 ? 0 : 1)[1] : 1,
        opts.colorFn ? opts.colorFn(0.5, r === 0 ? 0 : 1)[2] : 1);
      const ringStart = r * cols;
      for (let i = 0; i < N; i++) {
        const a = ringStart + i, b = ringStart + i + 1;
        if (flip) idx.push(base, b, a); else idx.push(base, a, b);
      }
    }
    if (opts.capStart) addCap(0, true);
    if (opts.capEnd) addCap(M - 1, false);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    // weld the seam normals so the surface shades smoothly
    const nrm = geo.attributes.normal;
    for (let r = 0; r < M; r++) {
      const a = r * cols, b = r * cols + N;
      const nx = (nrm.getX(a) + nrm.getX(b)) * 0.5;
      const ny = (nrm.getY(a) + nrm.getY(b)) * 0.5;
      const nz = (nrm.getZ(a) + nrm.getZ(b)) * 0.5;
      nrm.setXYZ(a, nx, ny, nz); nrm.setXYZ(b, nx, ny, nz);
    }
    nrm.needsUpdate = true;
    geo.computeBoundingSphere();
    return geo;
  }

  /* interpolate a list of [key, ...values] with smooth interpolation */
  function curveAt(keys, x) {
    if (x <= keys[0][0]) return keys[0].slice(1);
    const last = keys[keys.length - 1];
    if (x >= last[0]) return last.slice(1);
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (x >= a[0] && x <= b[0]) {
        let t = (x - a[0]) / (b[0] - a[0]);
        t = t * t * (3 - 2 * t);
        const out = [];
        for (let k = 1; k < a.length; k++) out.push(a[k] + (b[k] - a[k]) * t);
        return out;
      }
    }
    return last.slice(1);
  }

  /* ======================================================================
     the skeleton
     ====================================================================== */
  const BONE_DEFS = [
    // name,        parent,   x,      y,     z
    ['pelvis', 'root', -0.95, 2.86, 0],
    ['spine1', 'pelvis', -0.55, 2.90, 0],
    ['spine2', 'spine1', -0.15, 2.93, 0],
    ['spine3', 'spine2', 0.30, 2.95, 0],
    ['chest', 'spine3', 0.72, 2.96, 0],
    ['neck1', 'chest', 1.05, 2.93, 0],
    ['neck2', 'neck1', 1.45, 3.42, 0],
    ['neck3', 'neck2', 1.86, 3.93, 0],
    ['neck4', 'neck3', 2.24, 4.36, 0],
    ['head', 'neck4', 2.42, 4.44, 0],
    ['tail1', 'pelvis', -1.24, 2.70, 0],
    ['tail2', 'tail1', -1.31, 2.30, 0],
    ['tail3', 'tail2', -1.33, 1.92, 0],
    // front legs
    ['FL_u', 'chest', 0.60, 2.82, 0.30],
    ['FL_l', 'FL_u', 0.56, 2.05, 0.30],
    ['FL_c', 'FL_l', 0.50, 1.50, 0.30],
    ['FL_f', 'FL_c', 0.53, 0.36, 0.30],
    ['FR_u', 'chest', 0.60, 2.82, -0.30],
    ['FR_l', 'FR_u', 0.56, 2.05, -0.30],
    ['FR_c', 'FR_l', 0.50, 1.50, -0.30],
    ['FR_f', 'FR_c', 0.53, 0.36, -0.30],
    // hind legs
    ['BL_u', 'pelvis', -0.88, 2.78, 0.27],
    ['BL_l', 'BL_u', -0.62, 2.05, 0.27],
    ['BL_c', 'BL_l', -0.88, 1.50, 0.27],
    ['BL_f', 'BL_c', -0.82, 0.36, 0.27],
    ['BR_u', 'pelvis', -0.88, 2.78, -0.27],
    ['BR_l', 'BR_u', -0.62, 2.05, -0.27],
    ['BR_c', 'BR_l', -0.88, 1.50, -0.27],
    ['BR_f', 'BR_c', -0.82, 0.36, -0.27]
  ];

  const LEGS = [
    { id: 'FL', side: 1, front: true, offset: 0.25 },
    { id: 'FR', side: -1, front: true, offset: 0.75 },
    { id: 'BL', side: 1, front: false, offset: 0.0 },
    { id: 'BR', side: -1, front: false, offset: 0.5 }
  ];

  function buildSkeleton(root) {
    const bones = [];
    const map = {};
    const rest = {};
    for (const def of BONE_DEFS) {
      const [name, parent, x, y, z] = def;
      const b = new THREE.Bone();
      b.name = name;
      const p = parent === 'root' ? new THREE.Vector3(0, 0, 0) : rest[parent];
      b.position.set(x - p.x, y - p.y, z - p.z);
      if (parent === 'root') root.add(b); else map[parent].add(b);
      map[name] = b;
      bones.push(b);
      rest[name] = new THREE.Vector3(x, y, z);
    }
    // the bind matrices have to be up to date before the skeleton inverses
    // are calculated, otherwise every bone would be bound to the origin.
    root.updateMatrixWorld(true);
    return { bones: bones, map: map, rest: rest, skeleton: new THREE.Skeleton(bones) };
  }

  /* ======================================================================
     the giraffe
     ====================================================================== */
  function createGiraffe(materials, opts) {
    opts = opts || {};
    const root = new THREE.Group();
    root.name = 'giraffe';

    const rig = buildSkeleton(root);
    const rest = rig.rest;
    const bone = rig.map;

    const GAIT = {
      cycle: 1.42,          // seconds per stride cycle
      speed: 1.30,         // metres per second
      duty: 0.62,          // stance fraction
      frontLift: 0.46,
      hindLift: 0.36
    };
    const STRIDE = GAIT.speed * GAIT.cycle;          // distance per cycle
    const FOOT_SWING = GAIT.duty * STRIDE;           // excursion of one foot
    const TSWING = (1 - GAIT.duty) * GAIT.cycle;

    /* ---------------- skin weights ------------------------------------ */
    // tent weights: influence peaks at the bone centre and reaches zero at
    // the neighbouring centres, so the deformation is continuous.
    function weightsFor(centres, t) {
      const w = new Array(centres.length).fill(0);
      if (centres.length === 1) { w[0] = 1; return w; }
      for (let i = 0; i < centres.length; i++) {
        let r;
        if (i > 0) r = Math.min(centres[i] - centres[i - 1], i < centres.length - 1 ? centres[i + 1] - centres[i] : 1) * 0.5;
        else r = (centres[1] - centres[0]) * 0.5 + centres[0];
        if (i === centres.length - 1) r = (centres[i] - centres[i - 1]) * 0.5 + (1 - centres[i]);
        const d = Math.abs(t - centres[i]);
        w[i] = Math.max(0, 1 - d / Math.max(r, 1e-4));
      }
      let s = 0; for (let i = 0; i < w.length; i++) s += w[i];
      if (s < 1e-6) { w[centres.length - 1] = 1; s = 1; }
      for (let i = 0; i < w.length; i++) w[i] /= s;
      return w;
    }

    function applySkin(geo, entries, centres, boneIdx) {
      const n = geo.attributes.position.count;
      const si = new Uint16Array(n * 4);
      const sw = new Float32Array(n * 4);
      // entries: array of { t: param per vertex? } -> we sample per vertex using uv.x? no:
      for (let i = 0; i < n; i++) {
        const t = entries[i];
        const w = weightsFor(centres, t);
        let top = 0; for (let k = 1; k < w.length; k++) if (w[k] > w[top]) top = k;
        si[i * 4] = boneIdx[top];
        sw[i * 4] = w[top];
        // second influence
        let second = -1, secondW = 0;
        for (let k = 0; k < w.length; k++) if (k !== top && w[k] > secondW) { secondW = w[k]; second = k; }
        if (second >= 0 && secondW > 0.001) {
          si[i * 4 + 1] = boneIdx[second];
          sw[i * 4 + 1] = secondW;
        }
      }
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      geo.userData.skinParam = entries;
    }

    const boneIndex = {};
    rig.bones.forEach((b, i) => { boneIndex[b.name] = i; });

    /* ---------------- body ------------------------------------------- */
    const SPINE_KEYS = [
      [-1.20, 2.74], [-1.02, 2.83], [-0.80, 2.88], [-0.45, 2.90],
      [-0.05, 2.91], [0.28, 2.93], [0.52, 2.99], [0.72, 2.96],
      [0.88, 2.90], [1.02, 2.84]
    ];
    const BELLY_KEYS = [
      [-1.20, 2.62], [-1.02, 2.44], [-0.80, 2.30], [-0.45, 2.24],
      [-0.05, 2.21], [0.28, 2.20], [0.52, 2.25], [0.72, 2.37],
      [0.88, 2.52], [1.02, 2.70]
    ];
    const WIDTH_KEYS = [
      [-1.20, 0.07], [-1.10, 0.17], [-0.95, 0.26], [-0.70, 0.33],
      [-0.35, 0.375], [0.05, 0.385], [0.35, 0.375], [0.58, 0.34],
      [0.80, 0.27], [1.02, 0.175]
    ];

    const bodyProfile = ellipseProfile(28, 2.35, 3.0);
    const bodySections = [];
    const bodyT = [];
    const XS = [-1.20, -1.14, -1.06, -0.94, -0.80, -0.62, -0.42, -0.20, 0.04, 0.28, 0.44, 0.56, 0.68, 0.80, 0.92, 1.02];
    let arcAcc = 0, prevX = XS[0];
    for (let i = 0; i < XS.length; i++) {
      const x = XS[i];
      if (i > 0) arcAcc += Math.abs(x - prevX);
      prevX = x;
      const top = curveAt(SPINE_KEYS, x)[0];
      const bot = curveAt(BELLY_KEYS, x)[0];
      const w = curveAt(WIDTH_KEYS, x)[0];
      bodySections.push({
        c: new THREE.Vector3(x, (top + bot) * 0.5, 0),
        rx: w,
        ry: (top - bot) * 0.5
      });
      bodyT.push(arcAcc);
    }
    const bodyArcTotal = bodyT[bodyT.length - 1];
    for (let i = 0; i < bodyT.length; i++) bodyT[i] /= bodyArcTotal;

    const bodyGeo = buildTube(bodySections, bodyProfile, {
      uRepeat: 2.0, vScale: bodyArcTotal / 1.32,
      colorFn: function (u, t, px, py, pz) {
        // slightly paler belly, deeper tone along the spine
        const up = U.clamp((py - 2.15) / 0.85, 0, 1);
        const k = 0.88 + 0.22 * up;
        return [k * 1.02, k, k * 0.97];
      }
    });
    // rebuild parameter array matching the vertex order
    {
      const cols = bodyProfile.length + 1;
      const params = [];
      for (let r = 0; r < bodySections.length; r++)
        for (let i = 0; i < cols; i++) params.push(bodyT[r]);
      params.push(0, 1);   // the two cap centre vertices
      applySkin(bodyGeo, params, [0.113, 0.293, 0.473, 0.676, 0.865],
        [boneIndex.pelvis, boneIndex.spine1, boneIndex.spine2, boneIndex.spine3, boneIndex.chest]);
    }

    /* ---------------- neck -------------------------------------------- */
    const neckP0 = new THREE.Vector3(1.00, 2.86, 0);
    const neckP1 = new THREE.Vector3(1.58, 3.78, 0);
    const neckP2 = new THREE.Vector3(2.30, 4.38, 0);
    function bez(t, p0, p1, p2) {
      const it = 1 - t;
      return new THREE.Vector3(
        it * it * p0.x + 2 * it * t * p1.x + t * t * p2.x,
        it * it * p0.y + 2 * it * t * p1.y + t * t * p2.y,
        0);
    }
    const NECK_N = 26;
    const neckSections = [], neckT = [];
    let nArc = 0, nPrev = bez(0, neckP0, neckP1, neckP2);
    for (let i = 0; i < NECK_N; i++) {
      const t = i / (NECK_N - 1);
      const p = bez(t, neckP0, neckP1, neckP2);
      nArc += p.distanceTo(nPrev); nPrev = p;
      neckSections.push({
        c: p,
        rx: U.lerp(0.215, 0.126, Math.pow(t, 0.80)),
        ry: U.lerp(0.345, 0.178, Math.pow(t, 0.86))
      });
      neckT.push(nArc);
    }
    const neckArcTotal = nArc;
    for (let i = 0; i < neckT.length; i++) neckT[i] /= neckArcTotal;
    const neckProfile = ellipseProfile(24, 2.25, 2.5);
    const neckGeo = buildTube(neckSections, neckProfile, {
      uRepeat: 1.30, vScale: neckArcTotal / 0.95,
      vWarp: function (t) { return Math.pow(t, 1.30); },
      capStart: true,
      colorFn: function (u, t, px, py, pz) { const k = 0.94 + 0.10 * (1 - t); return [k, k, k * 0.98]; }
    });
    {
      const cols = neckProfile.length + 1;
      const params = [];
      for (let r = 0; r < neckSections.length; r++)
        for (let i = 0; i < cols; i++) params.push(neckT[r]);
      params.push(0);
      applySkin(neckGeo, params, [0.02, 0.33, 0.65, 0.965],
        [boneIndex.neck1, boneIndex.neck2, boneIndex.neck3, boneIndex.neck4]);
    }

    /* ---------------- head -------------------------------------------- */
    const headProfile = ellipseProfile(22, 2.3, 2.9);
    const headPath = [
      [2.24, 4.420, 0.125, 0.145],
      [2.31, 4.430, 0.155, 0.175],
      [2.40, 4.405, 0.163, 0.180],
      [2.51, 4.360, 0.157, 0.168],
      [2.62, 4.305, 0.146, 0.146],
      [2.73, 4.248, 0.132, 0.126],
      [2.81, 4.200, 0.118, 0.108],
      [2.87, 4.160, 0.100, 0.092],
      [2.92, 4.125, 0.078, 0.074]
    ];
    const headSections = [], headT = [];
    let hArc = 0, hPrev = new THREE.Vector3(headPath[0][0], headPath[0][1], 0);
    for (let i = 0; i < headPath.length; i++) {
      const p = new THREE.Vector3(headPath[i][0], headPath[i][1], 0);
      hArc += p.distanceTo(hPrev); hPrev = p;
      headSections.push({ c: p, rx: headPath[i][2], ry: headPath[i][3] });
      headT.push(hArc);
    }
    const headArcTotal = hArc;
    for (let i = 0; i < headT.length; i++) headT[i] /= headArcTotal;
    const headGeo = buildTube(headSections, headProfile, {
      uRepeat: 1.05, vScale: 1.0,
      capStart: true, capEnd: true
    });
    {
      const cols = headProfile.length + 1;
      const params = [];
      for (let r = 0; r < headSections.length; r++)
        for (let i = 0; i < cols; i++) params.push(headT[r]);
      params.push(0, 1);
      applySkin(headGeo, params, [0.5], [boneIndex.head]);
    }

    /* ---------------- tail -------------------------------------------- */
    const tailPath = [
      [-1.20, 2.78, 0.075], [-1.26, 2.58, 0.062], [-1.30, 2.36, 0.050],
      [-1.32, 2.12, 0.042], [-1.33, 1.92, 0.038], [-1.33, 1.78, 0.030]
    ];
    const tailSections = [], tailT = [];
    let tArc = 0, tPrev = new THREE.Vector3(tailPath[0][0], tailPath[0][1], 0);
    for (let i = 0; i < tailPath.length; i++) {
      const p = new THREE.Vector3(tailPath[i][0], tailPath[i][1], 0);
      tArc += p.distanceTo(tPrev); tPrev = p;
      tailSections.push({ c: p, rx: tailPath[i][2], ry: tailPath[i][2] });
      tailT.push(tArc);
    }
    const tailArcTotal = tArc;
    for (let i = 0; i < tailT.length; i++) tailT[i] /= tailArcTotal;
    const tailProfile = ellipseProfile(12, 2, 2);
    const tailGeo = buildTube(tailSections, tailProfile, {
      uRepeat: 0.4, vScale: tailArcTotal / 0.5, capEnd: true
    });
    {
      const cols = tailProfile.length + 1;
      const params = [];
      for (let r = 0; r < tailSections.length; r++)
        for (let i = 0; i < cols; i++) params.push(tailT[r]);
      params.push(1);
      applySkin(tailGeo, params, [0.12, 0.5, 0.85], [boneIndex.tail1, boneIndex.tail2, boneIndex.tail3]);
    }

    /* ---------------- mane -------------------------------------------- */
    // an upright crest running along the back of the neck
    function buildMane() {
      const cols = 5, rows = 22;
      const pos = [], nor = [], uv = [], idx = [];
      for (let r = 0; r < rows; r++) {
        const t = r / (rows - 1);
        const p = bez(t, neckP0, neckP1, neckP2);
        const p2 = bez(Math.min(1, t + 0.01), neckP0, neckP1, neckP2);
        const tan = p2.clone().sub(p).normalize();
        const side = new THREE.Vector3(0, 0, 1);
        const up = new THREE.Vector3().crossVectors(side, tan).normalize();
        // base sits on the upper-rear edge of the neck
        const base = p.clone().add(up.clone().multiplyScalar(0.285 - 0.14 * t)).add(tan.clone().multiplyScalar(-0.035));
        const h = 0.066 * (0.40 + 0.60 * Math.sin(Math.PI * Math.pow(t, 0.8)));
        for (let i = 0; i < cols; i++) {
          const s = (i / (cols - 1)) * 2 - 1;                 // -1 .. 1 across the crest
          const off = base.clone()
            .add(up.clone().multiplyScalar(h * (1 - Math.abs(s) * 0.15)))
            .add(side.clone().multiplyScalar(s * 0.068))
            .add(tan.clone().multiplyScalar(-h * 0.35 * Math.abs(s)));
          pos.push(off.x, off.y, off.z);
          nor.push(tan.x, tan.y, tan.z);
          uv.push((s + 1) * 0.5, t * 2.2);
        }
      }
      for (let r = 0; r < rows - 1; r++) {
        for (let i = 0; i < cols - 1; i++) {
          const a = r * cols + i, b = a + 1, c = a + cols, d = c + 1;
          idx.push(a, b, c, b, d, c);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const params = [];
      for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) params.push(r / (rows - 1));
      applySkin(geo, params, [0.02, 0.33, 0.65, 0.965],
        [boneIndex.neck1, boneIndex.neck2, boneIndex.neck3, boneIndex.neck4]);
      return geo;
    }

    /* ---------------- legs -------------------------------------------- */
    function buildLeg(leg) {
      const id = leg.id;
      const j0 = rest[id + '_u'], j1 = rest[id + '_l'], j2 = rest[id + '_c'], j3 = rest[id + '_f'];
      // hoof tip
      const tip = new THREE.Vector3(j3.x + (leg.front ? 0.02 : 0.02), 0.0, j3.z);
      const joints = [j0, j1, j2, j3, tip];
      const radii = leg.front
        ? [[0.198, 0.138], [0.134, 0.088], [0.088, 0.065], [0.076, 0.080]]
        : [[0.228, 0.152], [0.150, 0.088], [0.088, 0.065], [0.074, 0.080]];

      const sections = [];
      const segParams = [];        // arc parameter per ring
      const SUB = 5;
      let arc = 0;
      const segLens = [];
      for (let j = 0; j < 4; j++) segLens.push(joints[j].distanceTo(joints[j + 1]));
      const total = segLens.reduce((a, b) => a + b, 0);
      for (let j = 0; j < 4; j++) {
        for (let k = 0; k <= SUB; k++) {
          if (j > 0 && k === 0) continue;
          const f = k / SUB;
          const p = joints[j].clone().lerp(joints[j + 1], f);
          const r = U.lerp(radii[j][0], radii[j][1], f);
          sections.push({ c: p, rx: r, ry: r });
          segParams.push((arc + segLens[j] * f) / total);
        }
        arc += segLens[j];
      }
      const profile = ellipseProfile(14, 2, 2);
      const geo = buildTube(sections, profile, {
        uRepeat: 1.0, vScale: total / 0.80,
        vWarp: function (t) { return Math.pow(t, 1.25); },
        capEnd: false,
        colorFn: function (u, t, px, py, pz) {
          // the lower leg darkens towards the hoof
          const d = U.smoothstep((t - 0.55) / 0.45);
          const k = U.lerp(1.0, 0.34, d);
          return [k, k * 0.98, k * 0.96];
        }
      });
      const cols = profile.length + 1;
      const params = [];
      for (let r = 0; r < sections.length; r++)
        for (let i = 0; i < cols; i++) params.push(segParams[r]);
      // bone centres along the parameter: segment mid points
      const centres = [];
      let acc = 0;
      for (let j = 0; j < 4; j++) {
        const a = acc / total, b = (acc + segLens[j]) / total;
        centres.push((a + b) * 0.5);
        acc += segLens[j];
      }
      applySkin(geo, params, centres,
        [boneIndex[id + '_u'], boneIndex[id + '_l'], boneIndex[id + '_c'], boneIndex[id + '_f']]);
      return geo;
    }

    function buildHoof(leg) {
      const id = leg.id;
      const j3 = rest[id + '_f'];
      const tip = new THREE.Vector3(j3.x + 0.02, 0.0, j3.z);
      const mid = j3.clone().lerp(tip, 0.45);
      const sections = [
        { c: j3.clone().lerp(tip, 0.18), rx: 0.082, ry: 0.088 },
        { c: j3.clone().lerp(tip, 0.6), rx: 0.090, ry: 0.080 },
        { c: tip.clone().lerp(j3, 0.12), rx: 0.085, ry: 0.066 },
        { c: tip, rx: 0.058, ry: 0.043 }
      ];
      const profile = ellipseProfile(14, 2.2, 2.6);
      const geo = buildTube(sections, profile, { uRepeat: 0.5, vScale: 0.6, capEnd: true });
      const cols = profile.length + 1;
      const params = [];
      for (let r = 0; r < sections.length; r++) for (let i = 0; i < cols; i++) params.push(r / (sections.length - 1));
      params.push(1);
      applySkin(geo, params, [0.5], [boneIndex[id + '_f']]);
      return geo;
    }

    /* ================================================================== *
     *  assemble the meshes
     * ================================================================== */
    function skinned(geo, material, castShadow) {
      const m = new THREE.SkinnedMesh(geo, material);
      m.castShadow = castShadow !== false;
      m.receiveShadow = true;
      m.frustumCulled = false;
      root.add(m);
      root.updateMatrixWorld(true);
      m.bind(rig.skeleton);
      return m;
    }

    const meshes = [];
    meshes.push(skinned(bodyGeo, materials.coat));
    meshes.push(skinned(neckGeo, materials.coat));
    meshes.push(skinned(headGeo, materials.head));
    meshes.push(skinned(tailGeo, materials.coat));
    meshes.push(skinned(buildMane(), materials.mane));
    for (const leg of LEGS) {
      meshes.push(skinned(buildLeg(leg), materials.coat));
      meshes.push(skinned(buildHoof(leg), materials.hoof));
    }

    /* ---------------- head furniture ---------------------------------- */
    // local offset helper
    function localTo(boneName, x, y, z) {
      const p = rest[boneName];
      return new THREE.Vector3(x - p.x, y - p.y, z - p.z);
    }

    const headBone = bone.head;
    const lids = [];

    // eyes
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.060, 20, 14), materials.eye);
      eye.position.copy(localTo('head', 2.398, 4.452, 0.124 * s));
      eye.scale.set(1, 0.96, 0.86);
      headBone.add(eye);
      // upper lid (a spherical cap that swings down over the eye)
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.064, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.40), materials.lid);
      lid.position.copy(localTo('head', 2.398, 4.452, 0.124 * s));
      lid.scale.set(1.05, 1.0, 0.90);
      lid.rotation.x = s > 0 ? 0.42 : -0.42;
      lid.userData.side = s;
      headBone.add(lid);
      lids.push(lid);
      // brow ridge
      const brow = new THREE.Mesh(new THREE.SphereGeometry(0.080, 16, 10), materials.head);
      brow.position.copy(localTo('head', 2.396, 4.524, 0.094 * s));
      brow.scale.set(1.18, 0.40, 0.80);
      headBone.add(brow);
    }
    // nostrils
    for (const s of [1, -1]) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), materials.nostril);
      n.position.copy(localTo('head', 2.858, 4.178, 0.076 * s));
      n.scale.set(1.6, 0.60, 0.55);
      headBone.add(n);
    }
    // mouth line
    {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 8), materials.nostril);
      m.position.copy(localTo('head', 2.800, 4.112, 0));
      m.scale.set(2.4, 0.20, 1.55);
      headBone.add(m);
    }
    // ossicones
    for (const s of [1, -1]) {
      const base = new THREE.Vector3(2.232, 4.492, 0.072 * s);
      const tip = new THREE.Vector3(2.196, 4.700, 0.084 * s);
      const dir = tip.clone().sub(base);
      const len = dir.length();
      const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.038, len, 14, 1), materials.horn);
      horn.position.copy(localTo('head', base.x + dir.x * 0.5, base.y + dir.y * 0.5, base.z));
      horn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      headBone.add(horn);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.040, 14, 10), materials.horn);
      knob.position.copy(localTo('head', tip.x, tip.y + 0.020, tip.z));
      knob.scale.set(1, 1.15, 1);
      headBone.add(knob);
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), materials.mane);
      tuft.position.copy(localTo('head', tip.x - 0.004, tip.y + 0.066, tip.z));
      tuft.scale.set(1, 1.7, 1);
      headBone.add(tuft);
    }
    // ears
    const ears = [];
    for (const s of [1, -1]) {
      const e0 = new THREE.Vector3(2.262, 4.452, 0.104 * s);
      const e1 = new THREE.Vector3(2.070, 4.505, 0.312 * s);
      const sections = [];
      for (let i = 0; i <= 10; i++) {
        const f = i / 10;
        const p = e0.clone().lerp(e1, f);
        p.y += Math.sin(f * Math.PI) * 0.035;
        p.z += s * Math.sin(f * Math.PI) * 0.022;
        const w = 0.080 * Math.sin(Math.PI * Math.pow(f, 0.55)) * (1 - f * 0.10);
        // local coordinates relative to the ear root
        sections.push({ c: p.clone().sub(e0), rx: 0.013 + 0.014 * Math.sin(Math.PI * f), ry: w });
      }
      const geo = buildTube(sections, ellipseProfile(12, 2, 2), { uRepeat: 0.6, vScale: 0.9, capStart: true, capEnd: true });
      const ear = new THREE.Mesh(geo, materials.ear);
      ear.position.copy(localTo('head', e0.x, e0.y, e0.z));
      ear.userData.side = s;
      headBone.add(ear);
      ears.push(ear);
      // inner ear
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.040, 12, 8), materials.lid);
      inner.position.copy(localTo('head', 2.232, 4.452, 0.136 * s));
      inner.scale.set(1.4, 1.0, 0.30);
      headBone.add(inner);
    }
    // tail tuft
    {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.30, 12), materials.mane);
      const p = rest.tail3;
      tuft.position.set(-0.02, -0.12, 0);
      tuft.rotation.z = 0.15;
      bone.tail3.add(tuft);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 9), materials.mane);
      knot.position.set(0, -0.02, 0);
      knot.scale.set(1, 0.9, 1);
      bone.tail3.add(knot);
    }
    // tail root tuft (short hair at the base)
    {
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.10, 12, 9), materials.mane);
      tuft.position.set(0.02, 0.05, 0);
      tuft.scale.set(1.6, 0.8, 1.1);
      bone.tail1.add(tuft);
    }

    /* ================================================================== *
     *  gait
     * ================================================================== */
    // 2-D planar CCD IK
    function solveLeg(angles, chain, base, baseAng, target, limits, iters) {
      // chain: array of {len, restAng}
      const P = [base.clone()];
      for (let it = 0; it < iters; it++) {
        // forward kinematics
        P.length = 1; P[0] = base.clone();
        let ang = baseAng;
        for (let j = 0; j < chain.length; j++) {
          ang += chain[j].restAng + angles[j];
          P.push(new THREE.Vector2(
            P[j].x + Math.cos(ang) * chain[j].len,
            P[j].y + Math.sin(ang) * chain[j].len));
        }
        const end = P[P.length - 1];
        for (let j = chain.length - 1; j >= 0; j--) {
          const jd = P[j];
          const a1 = Math.atan2(end.y - jd.y, end.x - jd.x);
          const a2 = Math.atan2(target.y - jd.y, target.x - jd.x);
          let d = a2 - a1;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          d = U.clamp(d, -0.5, 0.5);
          angles[j] = U.clamp(angles[j] + d, limits[j][0], limits[j][1]);
        }
      }
      return angles;
    }

    // rest geometry of each leg chain
    const legData = {};
    for (const leg of LEGS) {
      const id = leg.id;
      const j0 = rest[id + '_u'], j1 = rest[id + '_l'], j2 = rest[id + '_c'], j3 = rest[id + '_f'];
      const tip = new THREE.Vector3(j3.x + 0.02, 0.0, j3.z);
      const chain = [
        { len: j0.distanceTo(j1), restAng: Math.atan2(j1.y - j0.y, j1.x - j0.x) },
        { len: j1.distanceTo(j2), restAng: Math.atan2(j2.y - j1.y, j2.x - j1.x) },
        { len: j2.distanceTo(j3), restAng: Math.atan2(j3.y - j2.y, j3.x - j2.x) },
        { len: j3.distanceTo(tip), restAng: Math.atan2(tip.y - j3.y, tip.x - j3.x) }
      ];
      const limits = leg.front
        ? [[-0.60, 0.60], [-0.95, 0.55], [-0.80, 0.55], [-0.55, 0.75]]
        : [[-0.65, 0.65], [-0.55, 0.95], [-0.95, 0.45], [-0.55, 0.75]];
      legData[id] = { chain: chain, limits: limits, hip: j0, parent: leg.front ? 'chest' : 'pelvis' };
    }

    // foot path
    function footTarget(leg, phase) {
      const p = (phase + leg.offset) % 1;
      const half = FOOT_SWING * 0.5;
      const Ts = TSWING;
      let x, y;
      if (p < GAIT.duty) {
        const u = p / GAIT.duty;
        x = U.lerp(half, -half, u);
        y = 0;
      } else {
        const u = (p - GAIT.duty) / (1 - GAIT.duty);
        // cubic hermite: leaves the ground moving backwards, lands moving forwards
        const m0 = -GAIT.speed * Ts;
        const m1 = -0.35 * GAIT.speed * Ts;
        const h00 = 2 * u * u * u - 3 * u * u + 1;
        const h10 = u * u * u - 2 * u * u + u;
        const h01 = -2 * u * u * u + 3 * u * u;
        const h11 = u * u * u - u * u;
        x = h00 * (-half) + h10 * m0 + h01 * (half) + h11 * m1;
        const lift = leg.front ? GAIT.frontLift : GAIT.hindLift;
        y = lift * Math.pow(Math.sin(Math.PI * u), 0.72);
      }
      return { x: x, y: y, p: p };
    }

    /* ---- bake the walk cycle ---------------------------------------- */
    const SAMPLES = 120;
    const table = {
      legAngles: new Float32Array(SAMPLES * LEGS.length * 4),
      rootY: new Float32Array(SAMPLES),
      rootPitch: new Float32Array(SAMPLES),
      spine: new Float32Array(SAMPLES * 5),      // pelvis..chest
      neck: new Float32Array(SAMPLES * 4),       // neck1..neck4
      head: new Float32Array(SAMPLES),
      tail: new Float32Array(SAMPLES * 3)
    };
    const TAIL_NAMES = ['tail1', 'tail2', 'tail3'];

    // simpler, explicit: compute the world transforms for the spine/neck chain
    function computeSpinePose(angles) {
      const pose = {};
      let ang = 0;
      let parentPos = new THREE.Vector3(0, 0, 0);
      let parentRest = new THREE.Vector3(0, 0, 0);
      const order = ['pelvis', 'spine1', 'spine2', 'spine3', 'chest', 'neck1', 'neck2', 'neck3', 'neck4', 'head'];
      for (const name of order) {
        const p = rest[name];
        const local = angles[name] || 0;
        ang += local;
        const dx = p.x - parentRest.x, dy = p.y - parentRest.y;
        const pos = new THREE.Vector3(
          parentPos.x + Math.cos(ang) * dx - Math.sin(ang) * dy,
          parentPos.y + Math.sin(ang) * dx + Math.cos(ang) * dy,
          p.z);
        pose[name] = { ang: ang, pos: pos };
        parentPos = pos; parentRest = p;
      }
      // the tail hangs off the pelvis
      let tang = 0, tpos = new THREE.Vector3(0, 0, 0), trest = new THREE.Vector3(0, 0, 0);
      const pp = pose.pelvis;
      tang = pp.ang; tpos = new THREE.Vector3(pp.pos.x, pp.pos.y, pp.pos.z); trest = rest.pelvis;
      for (const name of TAIL_NAMES) {
        const p = rest[name];
        const local = angles[name] || 0;
        tang += local;
        const dx = p.x - trest.x, dy = p.y - trest.y;
        const pos = new THREE.Vector3(
          tpos.x + Math.cos(tang) * dx - Math.sin(tang) * dy,
          tpos.y + Math.sin(tang) * dx + Math.cos(tang) * dy,
          p.z);
        pose[name] = { ang: tang, pos: pos };
        tpos = pos; trest = p;
      }
      return pose;
    }

    function bakeCycle() {
      const legAngles = {};
      for (const leg of LEGS) legAngles[leg.id] = [0, 0, 0, 0];
      for (let s = 0; s < SAMPLES; s++) {
        const phase = s / SAMPLES;
        const TAU = Math.PI * 2;

        // --- body motion -------------------------------------------------
        const bob = 0.022 * Math.sin(TAU * 2 * phase - 0.6) + 0.010 * Math.sin(TAU * 4 * phase);
        const pitch = 0.016 * Math.sin(TAU * 2 * phase + 0.9);
        const sway = 0.020 * Math.sin(TAU * phase + 0.4);

        // spine angles (a gentle wave travelling down the back)
        const spineA = [];
        for (let i = 0; i < 5; i++) {
          const w = (i / 4);
          spineA.push(pitch * (0.6 + 0.8 * w) + 0.012 * Math.sin(TAU * (phase * 2 + w * 0.22)));
        }
        // neck: the base follows the chest, the head bobs with the stride
        const headWave = Math.sin(TAU * (2 * phase) + 1.15);
        const neckA = [];
        for (let i = 0; i < 4; i++) {
          const w = (i + 1) / 4;
          neckA.push(-0.030 * w * (0.6 + 0.6 * headWave) - 0.018 * w * headWave + 0.010 * Math.sin(TAU * phase + i * 0.5));
        }
        const headA = 0.045 * headWave - 0.02;
        // tail
        const tailA = [
          0.05 * Math.sin(TAU * phase * 0.5 + 0.8),
          0.05 * Math.sin(TAU * phase * 0.5 + 1.6),
          0.06 * Math.sin(TAU * phase * 0.5 + 2.4)
        ];

        const angles = {
          pelvis: spineA[0], spine1: spineA[1], spine2: spineA[2], spine3: spineA[3], chest: spineA[4],
          neck1: neckA[0], neck2: neckA[1], neck3: neckA[2], neck4: neckA[3],
          head: headA,
          tail1: tailA[0], tail2: tailA[1], tail3: tailA[2]
        };
        const pose = computeSpinePose(angles);

        table.rootY[s] = bob;
        table.rootPitch[s] = pitch;
        for (let i = 0; i < 5; i++) table.spine[s * 5 + i] = spineA[i];
        for (let i = 0; i < 4; i++) table.neck[s * 4 + i] = neckA[i];
        table.head[s] = headA;
        for (let i = 0; i < 3; i++) table.tail[s * 3 + i] = tailA[i];

        // --- legs ---------------------------------------------------------
        for (let li = 0; li < LEGS.length; li++) {
          const leg = LEGS[li];
          const ld = legData[leg.id];
          const hipPose = pose[ld.parent];
          const base = new THREE.Vector2(hipPose.pos.x, hipPose.pos.y);
          const baseAng = hipPose.ang;
          const ft = footTarget(leg, phase);
          const target = new THREE.Vector2(base.x + ft.x, base.y + ft.y - bob);
          const a = legAngles[leg.id];
          solveLeg(a, ld.chain, base, baseAng, target, ld.limits, 4);
          // ease the foot towards a natural angle
          const desired = leg.front ? -0.10 * Math.sin(Math.PI * Math.min(1, ft.p / GAIT.duty)) : 0;
          a[3] = U.lerp(a[3], desired, 0.12);
          for (let k = 0; k < 4; k++) table.legAngles[(s * LEGS.length + li) * 4 + k] = a[k];
        }
      }
    }
    bakeCycle();

    /* ---------------- runtime ------------------------------------------ */
    const state = {
      phase: 0.0,
      speedScale: 1.0,
      paused: false,
      time: 0
    };

    function sample(arr, offset, count, stride, p, out) {
      const x = p * SAMPLES;
      const i0 = Math.floor(x) % SAMPLES;
      const i1 = (i0 + 1) % SAMPLES;
      const f = x - Math.floor(x);
      for (let k = 0; k < count; k++) {
        out[k] = arr[i0 * stride + offset + k] * (1 - f) + arr[i1 * stride + offset + k] * f;
      }
      return out;
    }

    const tmp = [0, 0, 0, 0, 0];
    function applyPose(phase) {
      const rootY = sample(table.rootY, 0, 1, 1, phase, tmp)[0];
      const spine = sample(table.spine, 0, 5, 5, phase, [0, 0, 0, 0, 0]);
      const neck = sample(table.neck, 0, 4, 4, phase, [0, 0, 0, 0]);
      const headA = sample(table.head, 0, 1, 1, phase, tmp)[0];
      const tail = sample(table.tail, 0, 3, 3, phase, [0, 0, 0]);

      root.position.y = rootY;
      bone.pelvis.rotation.z = spine[0];
      bone.spine1.rotation.z = spine[1];
      bone.spine2.rotation.z = spine[2];
      bone.spine3.rotation.z = spine[3];
      bone.chest.rotation.z = spine[4];
      bone.neck1.rotation.z = neck[0];
      bone.neck2.rotation.z = neck[1];
      bone.neck3.rotation.z = neck[2];
      bone.neck4.rotation.z = neck[3];
      bone.head.rotation.z = headA;
      bone.tail1.rotation.z = tail[0];
      bone.tail2.rotation.z = tail[1];
      bone.tail3.rotation.z = tail[2];

      for (let li = 0; li < LEGS.length; li++) {
        const leg = LEGS[li];
        const a = sample(table.legAngles, li * 4, 4, LEGS.length * 4, phase, [0, 0, 0, 0]);
        bone[leg.id + '_u'].rotation.z = a[0];
        bone[leg.id + '_l'].rotation.z = a[1];
        bone[leg.id + '_c'].rotation.z = a[2];
        bone[leg.id + '_f'].rotation.z = a[3];
      }
    }

    applyPose(0);

    /* ---------------- extras: blink, ears, dust ----------------------- */
    const extras = { blink: 0, nextBlink: 2.5, earPhase: [0, 0], nextEar: [1, 2] };

    function updateExtras(dt) {
      extras.time += dt;
      // blink
      if (extras.time > extras.nextBlink) {
        extras.blink = 1;
        extras.nextBlink = extras.time + 2.5 + Math.random() * 4;
      }
      if (extras.blink > 0) extras.blink = Math.max(0, extras.blink - dt * 7);
      const lidClose = Math.sin(Math.min(1, extras.blink) * Math.PI);
      for (const lid of lids) {
        const s = lid.userData.side;
        lid.rotation.x = s > 0 ? (0.25 + lidClose * 1.25) : (-0.25 - lidClose * 1.25);
      }
      // ear flicks
      for (let i = 0; i < 2; i++) {
        if (extras.time > extras.nextEar[i]) {
          extras.earPhase[i] = 1;
          extras.nextEar[i] = extras.time + 2 + Math.random() * 5;
        }
        if (extras.earPhase[i] > 0) extras.earPhase[i] = Math.max(0, extras.earPhase[i] - dt * 2.2);
      }
      for (let i = 0; i < ears.length; i++) {
        const ear = ears[i];
        const ph = extras.earPhase[i] || 0;
        const flick = Math.sin(ph * Math.PI * 3) * ph;
        ear.rotation.z = flick * 0.22;
        ear.rotation.x = flick * 0.16;
      }
      return lidClose;
    }

    const api = {
      group: root,
      rig: rig,
      materials: materials,
      meshes: meshes,
      state: state,
      gait: GAIT,
      update: function (dt) {
        if (!state.paused) {
          state.phase = (state.phase + (dt * state.speedScale) / GAIT.cycle) % 1;
          state.time += dt;
        }
        applyPose(state.phase);
        updateExtras(dt);
        // slow lateral drift of the whole body
        const sway = 0.020 * Math.sin(Math.PI * 2 * state.phase + 0.4);
        root.position.z = sway;
        root.rotation.y = 0.0;
        root.updateMatrixWorld(true);
      },
      setPhase: function (p) { state.phase = p % 1; applyPose(state.phase); }
    };
    return api;
  }

  global.Giraffe = { create: createGiraffe, buildTube: buildTube, ellipseProfile: ellipseProfile };
})(window);
