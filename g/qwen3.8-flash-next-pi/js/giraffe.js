/* giraffe.js - anatomy: bind-pose skeleton + procedural body construction
 *
 * Units: metres. Bind pose: animal standing square, facing +Z, up +Y, its own
 * left side at +X. Ground plane y = 0.
 *
 * Adult proportions used (Rothschild/Masai hybrid, ~5.3 m to the ossicones):
 *   withers 3.30 m, rump 3.10 m, neck ~1.9 m, head 0.9 m, foreleg 2.15 m
 */
(function (G) {
  'use strict';
  const V = THREE.Vector3;

  /* ------------------------------------------------------------------ */
  /* bind-pose skeleton                                                  */
  /* ------------------------------------------------------------------ */
  const J = {
    root:   { p: [0, 2.80, 0.00], parent: null },

    pelvis: { p: [0, 2.80, -0.95], parent: 'root' },
    chest:  { p: [0, 3.05, 0.62], parent: 'root' },

    neck0:  { p: [0, 3.20, 1.12], parent: 'chest' },
    neck1:  { p: [0, 3.83, 1.31], parent: 'neck0' },
    neck2:  { p: [0, 4.44, 1.56], parent: 'neck1' },
    neck3:  { p: [0, 4.97, 1.81], parent: 'neck2' },
    head:   { p: [0, 5.06, 2.02], parent: 'neck3' },
    muzzle: { p: [0, 4.92, 2.50], parent: 'head' },
    earL:   { p: [0.095, 5.11, 1.90], parent: 'head' },
    earR:   { p: [-0.095, 5.11, 1.90], parent: 'head' },

    tail0:  { p: [0, 2.94, -1.62], parent: 'pelvis' },
    tail1:  { p: [0, 2.70, -1.88], parent: 'tail0' },
    tail2:  { p: [0, 2.42, -2.06], parent: 'tail1' },
    tail3:  { p: [0, 2.14, -2.15], parent: 'tail2' },

    fL_up: { p: [0.275, 2.16, 0.92], parent: 'chest' },
    fL_low: { p: [0.295, 1.06, 1.02], parent: 'fL_up' },
    fL_foot: { p: [0.295, 0.34, 0.94], parent: 'fL_low' },
    fR_up: { p: [-0.275, 2.16, 0.92], parent: 'chest' },
    fR_low: { p: [-0.295, 1.06, 1.02], parent: 'fR_up' },
    fR_foot: { p: [-0.295, 0.34, 0.94], parent: 'fR_low' },

    bL_up: { p: [0.205, 2.72, -1.02], parent: 'pelvis' },
    bL_low: { p: [0.250, 1.68, -0.68], parent: 'bL_up' },
    bL_foot: { p: [0.255, 0.80, -1.34], parent: 'bL_low' },
    bR_up: { p: [-0.205, 2.72, -1.02], parent: 'pelvis' },
    bR_low: { p: [-0.250, 1.68, -0.68], parent: 'bR_up' },
    bR_foot: { p: [-0.255, 0.80, -1.34], parent: 'bR_low' }
  };
  const ORDER = Object.keys(J);
  const BIDX = {}; ORDER.forEach((n, i) => BIDX[n] = i);

  /* ------------------------------------------------------------------ */
  /* vertex-colour helpers                                               */
  /* ------------------------------------------------------------------ */
  function vc(hex) { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }
  const C_COAT = [1, 1, 1], C_PALE = vc(0xfff0d6), C_DARK = vc(0x2b2119),
    C_HOOF = vc(0x241c16), C_MUZZLE = vc(0x4f3c33), C_MANE = vc(0x6d4c2b),
    C_HORN = vc(0x7a5636), C_EARIN = vc(0xb98a76), C_TUFT = vc(0x33251a),
    C_EYE = vc(0x120d0a), C_RUMP = vc(0xb08a5c);
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  /* pale belly / darker back line, driven by absolute position */
  function belly(P, base) {
    if (P.y > 2.62) return base;
    const t = G.smoothstep((2.62 - P.y) / 0.45) * (P.z > -1.55 && P.z < 1.5 ? 1 : 0.5);
    return mix(base, C_PALE, 0.55 * t);
  }

  /* ------------------------------------------------------------------ */
  /* build                                                               */
  /* ------------------------------------------------------------------ */
  function build() {
    const raws = [];
    let tension = 0.5;

    function rigify(o, bones, joints, blend) {
      o.bones = bones;
      if (bones.length > 1) {
        const c = G.curve(o.pts, o.tension === undefined ? tension : o.tension);
        o.bounds = joints.map(p => G.uAt(c, G.v(p)));
      }
      o.blend = blend === undefined ? 0.10 : blend;
      o.bonesIndex = i => BIDX[o.bones[i]];
      return o;
    }
    function single(o, bone) { return rigify(o, [bone], null, 0); }
    function add(o, bones, joints, blend) {
      rigify(o, bones, joints, blend);
      raws.push(G.sweep(o));
    }
    function addOne(o, bone) { single(o, bone); raws.push(G.sweep(o)); }
    function addBlob(c, r, bone, o) {
      o = o || {};
      o.inf = { i0: BIDX[bone], i1: 0, i2: 0, i3: 0, w0: 1, w1: 0, w2: 0, w3: 0 };
      raws.push(G.blob(c, r, o));
    }

    /* ---------------- torso (loft of elliptical barrel stations) -------- */
    const torso = [
      { p: [0, 2.58, 1.68], rx: 0.06, rz: 0.09, exp: 2.0 },
      { p: [0, 2.66, 1.44], rx: 0.31, rz: 0.36, exp: 2.1 },
      { p: [0, 2.70, 1.16], rx: 0.43, rz: 0.56, exp: 2.2 },
      { p: [0, 2.76, 0.80], rx: 0.455, rz: 0.615, exp: 2.3 },
      { p: [0, 2.78, 0.34], rx: 0.425, rz: 0.565, exp: 2.35 },
      { p: [0, 2.73, -0.20], rx: 0.39, rz: 0.515, exp: 2.3 },
      { p: [0, 2.72, -0.72], rx: 0.365, rz: 0.46, exp: 2.25 },
      { p: [0, 2.74, -1.20], rx: 0.35, rz: 0.425, exp: 2.2 },
      { p: [0, 2.70, -1.50], rx: 0.295, rz: 0.345, exp: 2.1 },
      { p: [0, 2.58, -1.80], rx: 0.07, rz: 0.10, exp: 2.0 }
    ];
    raws.push(G.loft(torso, {
      samples: 70, radial: 28, capEnds: true, uv: [0.2, 0.2, 0.13, 0.41],
      color: (P) => belly(P, C_COAT),
      bones: ['pelvis', 'root', 'chest'], bounds: [0.30, 0.76], blend: 0.30,
      bonesIndex: i => BIDX[['pelvis', 'root', 'chest'][i]]
    }));

    /* withers ridge and croup: kept well inside the barrel so nothing pokes out */
    addBlob([0, 3.24, 0.70], [0.20, 0.115, 0.5], 'chest', { color: () => C_COAT, seg: 16, rings: 8 });


    /* ---------------- neck ------------------------------------------- */
    const neckPts = [[0, 2.70, 0.88], [0, 3.20, 1.12], [0, 3.83, 1.31], [0, 4.44, 1.56], [0, 4.97, 1.81], [0, 5.11, 1.94]];
    add({
      pts: neckPts, radial: 22, samples: 46, uv: [0.2, 0.2, 0.55, 0.11],
      keys: [
        { t: 0.00, rx: 0.30, rz: 0.38, exp: 2.2 },
        { t: 0.14, rx: 0.30, rz: 0.325, exp: 2.3 },
        { t: 0.42, rx: 0.245, rz: 0.265, exp: 2.2 },
        { t: 0.70, rx: 0.196, rz: 0.212, exp: 2.1 },
        { t: 1.00, rx: 0.152, rz: 0.162, exp: 2.0 }
      ],
      color: (P) => belly(P, C_COAT)
    }, ['chest', 'neck0', 'neck1', 'neck2', 'neck3'],
      [[0, 3.20, 1.12], [0, 3.83, 1.31], [0, 4.44, 1.56], [0, 4.97, 1.81]], 0.16);

    /* mane: thin comb along the dorsal neck ridge */
    (function () {
      const o = {
        pts: [[0, 3.30, 0.94], [0, 3.72, 1.06], [0, 4.24, 1.21], [0, 4.74, 1.42], [0, 5.14, 1.62], [0, 5.26, 1.78]],
        radial: 8, samples: 30, uv: [0.2, 0.2, 0.9, 0.9], initNormal: [1, 0, 0],
        keys: [
          { t: 0, rx: 0.018, rz: 0.045 }, { t: 0.12, rx: 0.020, rz: 0.095 },
          { t: 0.55, rx: 0.019, rz: 0.090 }, { t: 0.85, rx: 0.017, rz: 0.070 },
          { t: 1, rx: 0.014, rz: 0.035 }
        ],
        color: () => C_MANE, mat: 0
      };
      const bn = ['neck0', 'neck1', 'neck2', 'neck3', 'head'];
      const jt = [[0, 3.55, 1.02], [0, 4.16, 1.19], [0, 4.70, 1.40], [0, 5.09, 1.60]];
      rigify(o, bn, jt, 0.2);
      if (!/nomane/.test(location.search)) raws.push(G.sweep(o));
    })();

    /* ---------------- head ------------------------------------------- */
    add({
      pts: [[0, 4.98, 1.94], [0, 5.08, 2.14], [0, 5.07, 2.38], [0, 5.00, 2.62], [0, 4.91, 2.80], [0, 4.85, 2.94]],
      radial: 18, samples: 34, uv: [0.2, 0.2, 0.31, 0.66],
      keys: [
        { t: 0.0, rx: 0.142, rz: 0.158 }, { t: 0.17, rx: 0.152, rz: 0.176, oy: 0.008, exp: 2.1 },
        { t: 0.40, rx: 0.136, rz: 0.162, exp: 2.15 }, { t: 0.60, rx: 0.121, rz: 0.144, exp: 2.15 },
        { t: 0.82, rx: 0.113, rz: 0.134, exp: 2.15 }, { t: 1.0, rx: 0.112, rz: 0.128, exp: 2.3 }
      ],
      color: (P, t) => mix(belly(P, C_COAT), C_MUZZLE, G.smoothstep((t - 0.72) / 0.30) * 0.70),
      cap1: true
    }, ['neck3', 'head', 'muzzle'], [[0, 5.06, 2.02], [0, 4.92, 2.50]], 0.09);

    /* lower jaw */
    add({
      pts: [[0, 4.92, 2.14], [0, 4.89, 2.32], [0, 4.885, 2.54], [0, 4.88, 2.74], [0, 4.865, 2.88]],
      radial: 12, samples: 20, uv: [0.2, 0.2, 0.05, 0.05],
      keys: [{ t: 0, rx: 0.078, rz: 0.058 }, { t: 0.35, rx: 0.075, rz: 0.060 },
      { t: 0.72, rx: 0.068, rz: 0.054 }, { t: 1, rx: 0.054, rz: 0.042 }],
      color: (P, t) => mix(C_COAT, C_MUZZLE, G.smoothstep((t - 0.55) / 0.45) * 0.55),
      cap1: true
    }, ['head', 'muzzle'], [[0, 4.92, 2.50]], 0.10);

    /* forehead / nasal ridge */
    addBlob([0, 5.15, 2.28], [0.128, 0.082, 0.20], 'head', { color: () => C_COAT, seg: 14, rings: 8 });

    /* ossicones (horn cores) + tufts */
    for (const s of [1, -1]) {
      add({
        pts: [[s * 0.05, 5.17, 2.06], [s * 0.06, 5.26, 2.03], [s * 0.07, 5.325, 2.005]],
        radial: 10, samples: 12, uv: [0.2, 0.2, 0.7, 0.2], cap1: true,
        keys: [{ t: 0, rx: 0.030, rz: 0.030 }, { t: 0.55, rx: 0.025, rz: 0.025 }, { t: 1, rx: 0.020, rz: 0.020 }],
        color: (P, t) => mix(vc(0xb98f5c), C_COAT, 0.35)
      }, ['head'], null, 0);
      /* dark brush at the base of each horn, and a black knob on top */
      addBlob([s * 0.066, 5.185, 2.0], [0.034, 0.030, 0.034], 'head', { color: () => mix(C_TUFT, C_HORN, 0.35), seg: 10, rings: 6 });
      addBlob([s * 0.071, 5.335, 2.002], [0.024, 0.026, 0.024], 'head', { color: () => C_TUFT, seg: 10, rings: 6, mat: 1 });
    }

    /* ears */
    for (const s of [1, -1]) {
      add({
        pts: [[s * 0.088, 5.12, 1.89], [s * 0.185, 5.16, 1.81], [s * 0.285, 5.175, 1.725], [s * 0.348, 5.17, 1.66]],
        radial: 10, samples: 16, uv: [0.2, 0.2, 0.44, 0.29], initNormal: [s * 0.35, 0.92, 0.15],
        keys: [
          { t: 0, rx: 0.026, rz: 0.030 }, { t: 0.25, rx: 0.016, rz: 0.060 },
          { t: 0.66, rx: 0.011, rz: 0.066 }, { t: 1, rx: 0.004, rz: 0.014 }
        ],
        color: (P, t, f, rd) => mix(mix(C_COAT, vc(0x5a4028), G.smoothstep(t - 0.55) * 0.8), C_EARIN, G.smoothstep(rd.y * 1.7 - 0.3) * 0.6),
        cap1: false, mat: 0
      }, ['head', (s > 0 ? 'earL' : 'earR')], [[s * 0.095, 5.11, 1.90]], 0.10);
    }

    /* nostrils (the eyeballs are separate meshes on the head bone, so they
     * can blink) */
    for (const s of [1, -1]) {
      addBlob([s * 0.048, 4.955, 2.915], [0.021, 0.016, 0.012], 'muzzle',
        { color: () => C_DARK, seg: 10, rings: 6, mat: 1 });
    }

    /* ---------------- tail ------------------------------------------- */
    add({
      pts: [[0, 3.00, -1.44], [0, 2.94, -1.62], [0, 2.70, -1.88], [0, 2.42, -2.06], [0, 2.14, -2.15], [0, 1.92, -2.19]],
      radial: 10, samples: 30, uv: [0.2, 0.2, 0.72, 0.63],
      keys: [{ t: 0, rx: 0.085, rz: 0.075 }, { t: 0.18, rx: 0.058, rz: 0.055 },
      { t: 0.5, rx: 0.036, rz: 0.035 }, { t: 1, rx: 0.022, rz: 0.022 }],
      color: () => C_COAT
    }, ['pelvis', 'tail0', 'tail1', 'tail2', 'tail3'],
      [[0, 2.94, -1.62], [0, 2.70, -1.88], [0, 2.42, -2.06], [0, 2.14, -2.15]], 0.14);
    /* tail tuft */
    add({
      pts: [[0, 2.05, -2.17], [0, 1.88, -2.19], [0, 1.70, -2.20], [0, 1.58, -2.19]],
      radial: 10, samples: 14, uv: [0.2, 0.2, 0.8, 0.8], cap1: true,
      keys: [{ t: 0, rx: 0.03, rz: 0.03 }, { t: 0.3, rx: 0.062, rz: 0.055 },
      { t: 0.75, rx: 0.05, rz: 0.045 }, { t: 1, rx: 0.018, rz: 0.018 }],
      color: () => C_TUFT, mat: 1
    }, ['tail3'], null, 0);

    /* ---------------- legs ------------------------------------------- */
    function foreLeg(s, tag) {
      add({
        pts: [[s * 0.24, 3.00, 0.66], [s * 0.265, 2.30, 0.74], [s * 0.295, 1.06, 1.02],
        [s * 0.295, 0.34, 0.94], [s * 0.295, 0.16, 0.97]],
        radial: 14, samples: 40, uv: [0.2, 0.2, 0.2 * s + 0.3, 0.18],
        keys: [
          { t: 0.00, rx: 0.165, rz: 0.180, exp: 2.2 },
          { t: 0.13, rx: 0.148, rz: 0.160, exp: 2.2 },
          { t: 0.42, rx: 0.101, rz: 0.108, exp: 2.1 },
          { t: 0.60, rx: 0.076, rz: 0.081, exp: 2.0 },
          { t: 0.80, rx: 0.063, rz: 0.067 },
          { t: 0.95, rx: 0.066, rz: 0.071 },
          { t: 1.00, rx: 0.073, rz: 0.079 }
        ],
        color: (P, t) => mix(C_COAT, vc(0x8a6b45), G.smoothstep((t - 0.55) / 0.45) * 0.35),
        cap0: true, cap1: false
      }, ['chest', tag + '_up', tag + '_low', tag + '_foot'],
        [[s * 0.275, 2.16, 0.92], [s * 0.295, 1.06, 1.02], [s * 0.295, 0.34, 0.94]], 0.055);
      /* hoof: rounded wedge, flattened on the ground, glossy dark horn */
      const h = G.blob([s * 0.295, 0.088, 0.995], [0.076, 0.098, 0.106], {
        color: () => C_HOOF, seg: 14, rings: 10, mat: 1,
        inf: { i0: BIDX[tag + '_foot'], i1: 0, i2: 0, i3: 0, w0: 1, w1: 0, w2: 0, w3: 0 }
      });
      G.flatBelow(h, 0.004); raws.push(h);
      /* coronet band */
      raws.push(G.blob([s * 0.295, 0.178, 0.965], [0.072, 0.048, 0.075], {
        color: () => mix(C_COAT, C_HOOF, 0.35), seg: 12, rings: 8,
        inf: { i0: BIDX[tag + '_foot'], i1: BIDX[tag + '_low'], i2: 0, i3: 0, w0: 0.55, w1: 0.45, w2: 0, w3: 0 }
      }));
    }
    function hindLeg(s, tag) {
      add({
        pts: [[s * 0.14, 2.98, -0.84], [s * 0.205, 2.72, -1.02], [s * 0.25, 1.68, -0.68],
        [s * 0.255, 0.80, -1.34], [s * 0.255, 0.34, -1.16], [s * 0.255, 0.16, -1.11]],
        radial: 14, samples: 44, uv: [0.2, 0.2, 0.2 * s + 0.62, 0.55],
        keys: [
          { t: 0.00, rx: 0.165, rz: 0.18, exp: 2.2 },
          { t: 0.10, rx: 0.152, rz: 0.16, exp: 2.3 },
          { t: 0.34, rx: 0.108, rz: 0.112, exp: 2.2 },
          { t: 0.52, rx: 0.078, rz: 0.082 },
          { t: 0.68, rx: 0.055, rz: 0.058 },
          { t: 0.85, rx: 0.048, rz: 0.050 },
          { t: 1.00, rx: 0.054, rz: 0.057 }
        ],
        color: (P, t) => mix(C_COAT, vc(0x8a6b45), G.smoothstep((t - 0.55) / 0.45) * 0.35),
        cap0: true
      }, ['pelvis', tag + '_up', tag + '_low', tag + '_foot'],
        [[s * 0.205, 2.72, -1.02], [s * 0.25, 1.68, -0.68], [s * 0.255, 0.80, -1.34]], 0.05);
      const h = G.blob([s * 0.255, 0.085, -1.085], [0.064, 0.09, 0.092], {
        color: () => C_HOOF, seg: 14, rings: 10, mat: 1,
        inf: { i0: BIDX[tag + '_foot'], i1: 0, i2: 0, i3: 0, w0: 1, w1: 0, w2: 0, w3: 0 }
      });
      G.flatBelow(h, 0.004); raws.push(h);
      raws.push(G.blob([s * 0.255, 0.178, -1.14], [0.070, 0.048, 0.071], {
        color: () => mix(C_COAT, C_HOOF, 0.35), seg: 12, rings: 8,
        inf: { i0: BIDX[tag + '_foot'], i1: BIDX[tag + '_low'], i2: 0, i3: 0, w0: 0.55, w1: 0.45, w2: 0, w3: 0 }
      }));
    }
    foreLeg(1, 'fL'); foreLeg(-1, 'fR'); hindLeg(1, 'bL'); hindLeg(-1, 'bR');

    const geometry = G.toGeometry(raws);
    geometry.computeBoundingSphere();
    return { geometry: geometry, bones: ORDER, joints: J, tris: geometry.index.count / 3 };
  }

  G.JOINTS = J; G.BONE_ORDER = ORDER; G.BIDX = BIDX;
  G.buildGiraffe = build;
})(window.G = window.G || {});
