// ---------------------------------------------------------------------------
// 30_giraffe.js -- procedural giraffe: anatomy tables, rig, gait, rebuild.
// Units are metres.  +Z forward, +Y up, +X is the animal's left.
// Every organic part is a Loft whose stations are recomputed each frame, so
// the animal flexes as one body instead of hinging rigid boxes.
// ---------------------------------------------------------------------------
window.G = window.G || {};
(function (G) {
  'use strict';
  const D = G.deg;

  // =====================  anatomy tables  =================================
  // dorsal line of the trunk [y, z], sacrum .. neck root
  const SPINE = [
    [3.13, -1.06], [3.20, -0.55], [3.28, 0.05], [3.40, 0.62],
    [3.53, 1.08], [3.50, 1.44], [3.42, 1.72]
  ];
  // trunk sections: [t, halfWidth, riseAboveDorsal, bellyDepth, taper]
  const TPRO = [
    [0.00, 0.292, 0.12, 0.58, -0.06],
    [0.12, 0.352, 0.13, 0.92, -0.10],
    [0.30, 0.400, 0.15, 1.16, -0.08],
    [0.50, 0.418, 0.19, 1.30, 0.02],
    [0.70, 0.402, 0.29, 1.40, 0.10],
    [0.86, 0.356, 0.24, 1.32, 0.09],
    [1.00, 0.338, 0.17, 1.06, 0.05]
  ];
  // neck axis [y, z] and sections [t, halfWidth, halfDepth]
  const NECK = [[3.32, 1.71], [3.56, 1.74], [3.86, 1.80], [4.16, 1.87],
  [4.46, 1.96], [4.72, 2.06], [4.95, 2.16], [5.14, 2.26]];
  const NPRO = [[0.00, 0.286, 0.306], [0.20, 0.252, 0.272], [0.50, 0.206, 0.234],
  [0.75, 0.168, 0.196], [0.90, 0.142, 0.166], [1.00, 0.122, 0.143]];
  // head, skull-local [z, y, halfWidth, halfHeight]
  const HEAD = [
    [0.000, -0.010, 0.056, 0.064],
    [0.075, 0.010, 0.074, 0.085],
    [0.160, 0.020, 0.077, 0.084],
    [0.250, 0.010, 0.070, 0.071],
    [0.340, -0.006, 0.060, 0.059],
    [0.430, -0.022, 0.055, 0.054],
    [0.510, -0.034, 0.053, 0.053],
    [0.575, -0.042, 0.050, 0.049],
    [0.620, -0.048, 0.043, 0.041],
    [0.650, -0.052, 0.032, 0.030]
  ];
  // limb sections [t, halfWidth(sideways), halfDepth(in the limb plane)]
  const P_FUP = [[0, 0.165, 0.205], [0.22, 0.170, 0.225], [0.5, 0.140, 0.190], [0.78, 0.100, 0.135], [1, 0.088, 0.112]];
  const P_FLO = [[0, 0.092, 0.118], [0.14, 0.104, 0.126], [0.5, 0.082, 0.102], [0.86, 0.063, 0.077], [1, 0.062, 0.074]];
  const P_CAN = [[0, 0.070, 0.083], [0.2, 0.062, 0.072], [0.6, 0.056, 0.065], [0.9, 0.053, 0.060], [1, 0.058, 0.064]];
  const P_FOOT = [[0, 0.058, 0.064], [0.35, 0.065, 0.071], [0.72, 0.071, 0.071], [1, 0.063, 0.059]];
  const P_HUP = [[0, 0.215, 0.200], [0.28, 0.228, 0.212], [0.58, 0.180, 0.170], [0.84, 0.120, 0.120], [1, 0.098, 0.102]];
  const P_HLO = [[0, 0.108, 0.118], [0.22, 0.100, 0.114], [0.6, 0.074, 0.088], [0.88, 0.058, 0.068], [1, 0.057, 0.065]];

  function seg(P, t, i1, i2) {
    for (let i = 0; i < P.length - 1; i++) {
      if (t <= P[i + 1][0] || i === P.length - 2) {
        const a = P[i], b = P[i + 1], k = G.clamp(G.inv(a[0], b[0], t), 0, 1);
        return [G.lerp(a[i1], b[i1], k), G.lerp(a[i2], b[i2], k)];
      }
    }
  }
  function tab(P, t, c) {
    for (let i = 0; i < P.length - 1; i++) {
      if (t <= P[i + 1][0] || i === P.length - 2) {
        const a = P[i], b = P[i + 1];
        return G.lerp(a[c], b[c], G.clamp(G.inv(a[0], b[0], t), 0, 1));
      }
    }
    return P[P.length - 1][c];
  }
  function plen(P) { let L = 0; for (let i = 1; i < P.length; i++) L += P[i].distanceTo(P[i - 1]); return L; }

  // four limbs.  neutral = preferred joint angles, degrees from straight down,
  // positive toward +Z; limits keep the joints inside a plausible range.
  const LEGDEF = [
    { name: 'FL', side: 1, front: true, st: 0.80, off: [0.145, -0.05, -0.26], L: [1.07, 0.62, 0.73, 0.66], neutral: [-3, 11, -5, 9], lim: [26, 32, 30], prof: [P_FUP, P_FLO, P_CAN, P_FOOT], phase: 0.50, joint: [0.100, 0.080, 0.060], footZ: 1.30, footX: 0.185 },
    { name: 'FR', side: -1, front: true, st: 0.80, off: [0.145, -0.05, -0.26], L: [1.07, 0.62, 0.73, 0.66], neutral: [-3, 11, -5, 9], lim: [26, 32, 30], prof: [P_FUP, P_FLO, P_CAN, P_FOOT], phase: 0.00, joint: [0.100, 0.080, 0.060], footZ: 1.30, footX: 0.185 },
    { name: 'HL', side: 1, front: false, st: 0.05, off: [0.155, -0.16, 0.06], L: [0.80, 0.68, 0.72, 0.68], neutral: [10, -31, 19, 11], lim: [24, 32, 28], prof: [P_HUP, P_HLO, P_CAN, P_FOOT], phase: 0.58, joint: [0.105, 0.084, 0.060], footZ: -1.00, footX: 0.205 },
    { name: 'HR', side: -1, front: false, st: 0.05, off: [0.155, -0.16, 0.06], L: [0.80, 0.68, 0.72, 0.68], neutral: [10, -31, 19, 11], lim: [24, 32, 28], prof: [P_HUP, P_HLO, P_CAN, P_FOOT], phase: 0.08, joint: [0.105, 0.084, 0.060], footZ: -1.00, footX: 0.205 }
  ];

  const TORSO_ROWS = 18, NECK_ROWS = 15, TAIL_ROWS = 10, MANE_ROWS = 30, LEG_ROWS = 7;

  G.buildGiraffe = function (coatTex, opts) {
    opts = opts || {};
    const rnd = G.rng(opts.seed || 2024);
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';

    const skin = G.makeSkinMaterial(coatTex);
    const hair = G.makeHairMaterial(0x5c3a1d, 0.62);
    const hairDark = G.makeHairMaterial(0x23150a);
    const plain = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x7d5334).convertSRGBToLinear(), roughness: 0.85 });
    const hoofMat = G.makeHoofMaterial();
    const eyeMat = G.makeEyeMaterial();
    const darkSkin = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2a1c12).convertSRGBToLinear(), roughness: 0.7 });

    const lofts = [];
    function addLoft(rows, radial, o) {
      o = o || {};
      const L = new G.Loft(rows, radial, o);
      const m = new THREE.Mesh(L.geometry, o.material || skin);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      (o.parent || root).add(m);
      lofts.push({ loft: L, st: G.stations(rows), mesh: m });
      return lofts[lofts.length - 1];
    }
    function mesh(geo, mat, parent) {
      const m = new THREE.Mesh(geo, mat || skin);
      m.castShadow = true; m.receiveShadow = true;
      (parent || root).add(m);
      return m;
    }
    const sphereGeo = new THREE.SphereGeometry(1, 16, 12);
    // sphere with a small window of the coat atlas baked into its uv, so small
    // parts (knees, lids) continue the pattern instead of sampling all of it
    function winSphere(s, around, wS, wA) {
      const g = sphereGeo.clone();
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (s + (uv.getX(i) - 0.5) * wS) / G.ATLAS_LEN,
          (around + (uv.getY(i) - 0.5) * wA) / G.ATLAS_AROUND);
      }
      return g;
    }

    // ---- body parts --------------------------------------------------------
    const torso = addLoft(TORSO_ROWS, 18);
    const neck = addLoft(NECK_ROWS, 16);
    const tail = addLoft(TAIL_ROWS, 9, { capEnd: true });
    const mane = addLoft(MANE_ROWS, 6, { material: hair });

    // ---- head: rigid, built once, driven by the neck's end frame ----------
    const head = new THREE.Group();
    root.add(head);
    const headParts = { ears: [], eyes: [] };
    (function buildHead() {
      const hl = addLoft(HEAD.length, 16, { capStart: true, capEnd: true, parent: head });
      const sHead = 6.55;                       // metres along the body path
      for (let i = 0; i < HEAD.length; i++) {
        const S = hl.st[i], H = HEAD[i], t = i / (HEAD.length - 1);
        S.c.set(0, H[1], H[0]);
        S.dt.set(0, 0, 1); S.dr.set(1, 0, 0); S.du.set(0, 1, 0);
        S.rx = H[2]; S.ry = H[3]; S.p = 2.3; S.taper = -0.04;
        S.u0 = sHead + t * 0.60; S.v0 = 0.0;
        const f = G.mix(0.95, 0.55, G.smooth(0.2, 1.0, t));
        S.topFade = f; S.bellyFade = f * 0.92;
        S.topTone = G.mix(1.0, 0.70, G.smooth(0.42, 1.0, t));
        S.bellyTone = S.topTone * 0.96;
      }
      hl.loft.update(hl.st);

      // ears: flattened leaf lofts, one per side
      function earGeom(side) {
        const rows = 9;
        const L = new G.Loft(rows, 10, { capStart: true, capEnd: true });
        const st = G.stations(rows);
        const pr = [[0, 0.011, 0.026], [0.28, 0.016, 0.052], [0.6, 0.017, 0.060], [0.85, 0.012, 0.048], [1, 0.005, 0.028]];
        for (let i = 0; i < rows; i++) {
          const t = i / (rows - 1), S = st[i], rr = seg(pr, t, 1, 2);
          S.c.set(0, Math.pow(t, 1.6) * 0.045, t * 0.195);
          S.dt.set(0, 0.55, 1).normalize(); S.dr.set(1, 0, 0); S.du.set(0, 1, 0);
          S.rx = rr[0]; S.ry = rr[1]; S.p = 2.0;
          S.u0 = 6.35 + t * 0.22; S.v0 = 0.06;
          const f = G.mix(0.9, 0.55, t);
          S.topFade = f; S.bellyFade = f;
          S.topTone = G.mix(0.95, 0.55, G.smooth(0.35, 1, t));
          S.bellyTone = S.topTone;
        }
        L.update(st);
        return L.geometry;
      }
      const eg = earGeom(1);
      const Z = new THREE.Vector3(), Y = new THREE.Vector3(), X = new THREE.Vector3(), M4 = new THREE.Matrix4();
      for (const sgn of [1, -1]) {
        const g = new THREE.Group();
        const em = new THREE.Mesh(eg, skin);
        em.castShadow = true;
        // local blade: length +z, thin along x, wide along y -> point it out/back
        Z.set(sgn * 0.86, 0.16, -0.48).normalize();
        Y.set(sgn * 0.30, 0.92, 0.25).normalize();
        Y.addScaledVector(Z, -Y.dot(Z)).normalize();
        X.crossVectors(Y, Z);
        g.quaternion.setFromRotationMatrix(M4.makeBasis(X, Y, Z));
        g.add(em);
        const pivot = new THREE.Group();
        pivot.position.set(sgn * 0.062, 0.030, 0.100);
        pivot.add(g);
        head.add(pivot);
        headParts.ears.push({ pivot, g, sgn, ph: rnd() * 6.28, flick: 0 });
      }

      // ossicones
      for (const sgn of [1, -1]) {
        const g = new THREE.Group();
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.032, 0.082, 12), skin);
        stalk.position.y = 0.041; stalk.castShadow = true;
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 10), hairDark);
        knob.position.y = 0.090; knob.scale.set(1, 0.82, 1); knob.castShadow = true;
        const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), hair);
        tuft.position.set(0, 0.082, -0.020); tuft.scale.set(1.05, 0.7, 1.15);
        g.add(stalk, knob, tuft);
        g.position.set(sgn * 0.042, 0.058, 0.110);
        g.rotation.set(D(-15), 0, sgn * D(8));
        head.add(g);
      }
      // eyes
      for (const sgn of [1, -1]) {
        const socket = mesh(winSphere(6.72, 0.30, 0.26, 0.26), skin, head);
        socket.position.set(sgn * 0.049, 0.004, 0.172); socket.scale.set(0.058, 0.066, 0.056);
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.0225, 16, 12), eyeMat);
        e.position.set(sgn * 0.0645, 0.006, 0.186); e.scale.set(1, 1.05, 0.72);
        head.add(e);
        const lid = mesh(winSphere(6.70, 0.22, 0.2, 0.2), skin, head);
        lid.position.set(sgn * 0.056, 0.028, 0.180); lid.scale.set(0.046, 0.026, 0.044);
        headParts.eyes.push(e);
      }
      // nostrils + mouth
      for (const sgn of [1, -1]) {
        const nz = mesh(sphereGeo, darkSkin, head);
        nz.position.set(sgn * 0.020, -0.010, 0.610); nz.scale.set(0.010, 0.020, 0.008);
      }
      const mouth = mesh(sphereGeo, darkSkin, head);
      mouth.position.set(0, -0.072, 0.600); mouth.scale.set(0.034, 0.008, 0.018);
    })();

    // tail brush
    const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.062, 0.46, 10), hairDark);
    brush.castShadow = true;
    root.add(brush);

    // ---- limbs -------------------------------------------------------------
    const legs = LEGDEF.map((def) => {
      const parts = [addLoft(LEG_ROWS, 10), addLoft(LEG_ROWS, 10), addLoft(LEG_ROWS, 10), addLoft(LEG_ROWS, 10)];
      const sJ = def.front ? 3.80 : 1.62;
      const joints = [0, 1, 2].map((k) => mesh(winSphere(sJ + 0.10 + k * 0.30, 0.34, 0.24, 0.24), skin));
      const hg = new THREE.CylinderGeometry(0.066, 0.090, 0.17, 16);
      hg.translate(0, -0.085, 0); hg.scale(1, 1, 1.14);
      const hoof = new THREE.Mesh(hg, hoofMat);
      hoof.castShadow = true; hoof.receiveShadow = true;
      root.add(hoof);
      return {
        def, parts, joints, hoof,
        a: def.neutral.slice(0, 3).map((v) => D(v)),
        anchor: new THREE.Vector3(), sAnchor: 0, stance: 1, prevStance: 1, land: 0,
        jp: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
        jpL: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
      };
    });

    // =====================  rig  ==========================================
    const spineXYZ = SPINE.map((p) => new THREE.Vector3(0, p[0], p[1]));
    const neckXYZ = NECK.map((p) => new THREE.Vector3(0, p[0], p[1]));
    const S_SPINE = 1.50;                       // tail length ahead of sacrum
    const S_NECK = S_SPINE + plen(spineXYZ);
    const NECK_LEN = plen(neckXYZ);

    const rig = {
      root, skin, head, headParts, legs, lofts, meshes: [],
      t: 0, phase: 0, stride: 2.2, duty: 0.62, speed: 0,
      heading: 0, px: 0, pz: 0, bend: 0, bendT: 0,
      breath: 0, tailSway: 0, tailSwayV: 0, flick: 0,
      glance: 0, glanceT: 3, glanceTarget: 0,
      M: new THREE.Matrix4(), Mi: new THREE.Matrix4(), MY: new THREE.Matrix4(),
      landed: []
    };

    // scratch
    const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _r = new THREE.Vector3(),
      _u = new THREE.Vector3(), _d = new THREE.Vector3(), _side = new THREE.Vector3(), _sl = new THREE.Vector3(),
      _fwd = new THREE.Vector3(), _perp = new THREE.Vector3(), _w = new THREE.Vector3(),
      UP = new THREE.Vector3(0, 1, 0), _m4 = new THREE.Matrix4(), _e = new THREE.Euler(),
      _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _aa = new THREE.Vector3();

    // resample control points into loft stations with orthonormal frames
    function resample(ctrl, part, profFn, sAt) {
      const out = part.st, rows = out.length;
      const cv = G.curve(ctrl, false);
      for (let i = 0; i < rows; i++) {
        const t = i / (rows - 1), S = out[i];
        cv.at(t, S.c);
        cv.at(Math.min(1, t + 0.012), _p);
        cv.at(Math.max(0, t - 0.012), _q);
        S.dt.copy(_p).sub(_q);
        if (S.dt.lengthSq() < 1e-10) S.dt.set(0, 0, 1);
        S.dt.normalize();
        _r.set(UP.y * S.dt.z - UP.z * S.dt.y, UP.z * S.dt.x - UP.x * S.dt.z, UP.x * S.dt.y - UP.y * S.dt.x).normalize();
        S.dr.copy(_r);
        S.du.set(S.dt.y * _r.z - S.dt.z * _r.y, S.dt.z * _r.x - S.dt.x * _r.z, S.dt.x * _r.y - S.dt.y * _r.x).normalize();
        profFn(S, t, i);
        S.u0 = sAt + arcAt(cv, t);
      }
    }
    const _sa = new THREE.Vector3(), _sb = new THREE.Vector3();
    function arcAt(cv, t) {
      let L = 0; cv.at(0, _sa);
      for (let i = 1; i <= 10; i++) { cv.at((i / 10) * t, _sb); L += _sa.distanceTo(_sb); _sa.copy(_sb); }
      return L;
    }

    // ---------------------------------------------------------------------
    rig.update = function (dt, A) {
      rig.t += dt;
      const spd = A.speed, walk = A.walk;
      rig.landed.length = 0;

      // ---- gait clock
      const freq = 0.50 * (0.62 + 0.62 * (spd / 1.5));
      const targetStride = spd > 0.02 ? spd / Math.max(0.08, freq) : 2.2;
      rig.stride += (targetStride - rig.stride) * Math.min(1, dt * 3);
      rig.phase += dt * freq * walk;
      const ph = rig.phase;

      // ---- travel
      rig.heading += A.turn * dt;
      rig.speed += (spd - rig.speed) * Math.min(1, dt * 4);
      rig.px += Math.sin(rig.heading) * rig.speed * walk * dt;
      rig.pz += Math.cos(rig.heading) * rig.speed * walk * dt;
      rig.bendT += (A.turn * 1.9 - rig.bendT) * Math.min(1, dt * 2.2);
      rig.bend += (rig.bendT - rig.bend) * Math.min(1, dt * 5.5);

      // ---- whole-body motion driven by the footfalls
      const bob = (-0.024 * Math.cos(4 * Math.PI * ph) - 0.010 * Math.cos(2 * Math.PI * ph)) * walk;
      const roll = 0.030 * Math.sin(2 * Math.PI * ph + 0.3) * walk;
      const pitch = 0.014 * Math.cos(2 * Math.PI * ph - 1.0) * walk;
      const yawW = 0.011 * Math.sin(2 * Math.PI * ph + 1.2) * walk;

      rig.root.position.set(rig.px, bob, rig.pz);
      rig.root.rotation.set(pitch, rig.heading + yawW, roll);
      rig.root.updateMatrixWorld(true);
      rig.M.copy(rig.root.matrixWorld);
      rig.Mi.copy(rig.M).invert();
      rig.MY.compose(_aa.set(rig.px, 0, rig.pz), _qa.setFromEuler(_e.set(0, rig.heading + yawW, 0)), _w.set(1, 1, 1));

      rig.breath += dt * 0.42;
      const br = Math.sin(rig.breath * G.TAU) * 0.006 * (1 - 0.5 * walk);

      // ---- trunk
      const ctrl = [];
      for (let i = 0; i < SPINE.length; i++) {
        const z = SPINE[i][1] - 0.4;
        ctrl.push(new THREE.Vector3(rig.bend * 0.055 * z * Math.abs(z), SPINE[i][0], SPINE[i][1]));
      }
      resample(ctrl, torso, (S, t) => {
        S.rx = tab(TPRO, t, 1) + br * (1 - 0.4 * t);
        const hTop = tab(TPRO, t, 2), hBot = tab(TPRO, t, 3) + br * 2.4;
        S.ry = (hTop + hBot) / 2;
        S.c.addScaledVector(S.du, hTop - S.ry);
        S.p = 2.3;
        S.taper = tab(TPRO, t, 4);
        S.yShift = hTop - S.ry;          // dorsal line = c - du*yShift
        S.topFade = 1.0;
        S.bellyFade = G.mix(0.10, 0.45, G.smooth(0.75, 1.0, t));
        S.topTone = G.mix(0.95, 1.0, G.bump(t, 0.55, 0.4));
        S.bellyTone = 1.05;
        S.v0 = 0.0;
      }, S_SPINE);

      // ---- neck (base frame rides on the last trunk station)
      const nb = torso.st[TORSO_ROWS - 1];
      _w.copy(nb.c).addScaledVector(nb.du, -nb.yShift - 0.10);   // on the crest
      const nbase = _w.clone();
      const neckPitch = -2.2 * Math.sin(2 * Math.PI * ph + 0.6) * walk + (A.neckPitch || 0);
      const neckSway = 1.6 * Math.sin(2 * Math.PI * ph + 1.9) * walk + (A.neckYaw || 0);
      // the neck table is authored in body axes, so only the animated delta
      // rotation is applied here (not the tilted trunk frame)
      _qa.setFromEuler(_e.set(D(neckPitch), D(neckSway), 0, 'YXZ'));
      const nctrl = [];
      for (let i = 0; i < NECK.length; i++) {
        const k = i / (NECK.length - 1);
        _d.set(0, NECK[i][0] - NECK[0][0], NECK[i][1] - NECK[0][1]);
        _d.y -= 0.022 * Math.sin(Math.PI * k) * (1 + 0.6 * Math.sin(2 * Math.PI * ph)) * walk;
        _d.applyQuaternion(_qa);
        nctrl.push(_d.clone().add(nbase));
      }
      resample(nctrl, neck, (S, t) => {
        S.rx = tab(NPRO, t, 1) + br * 1.1;
        S.ry = tab(NPRO, t, 2) + br * 1.3;
        S.p = 2.25; S.taper = 0.05; S.v0 = 0.0;
        S.topFade = 1.0;
        S.bellyFade = G.mix(0.8, 0.10, G.smooth(0.0, 0.5, t));
        S.topTone = G.mix(0.95, 1.03, t); S.bellyTone = 1.05;
      }, 0);
      for (let i = 0; i < NECK_ROWS; i++) neck.st[i].u0 += S_NECK;

      // ---- tail (hangs from the sacrum, lags and flicks)
      rig.tailSwayV += ((Math.sin(rig.t * 0.63) * 0.45 + rig.flick * 2.4) - rig.tailSway * 5.5 - rig.tailSwayV * 2.2) * dt * 3.2;
      rig.tailSway += rig.tailSwayV * dt;
      rig.flick *= Math.pow(0.3, dt);
      if (rnd() < dt * 0.10) rig.flick = 1;
      const rb = torso.st[0];
      const TL = [[0, -0.02, -0.05], [0, -0.17, -0.15], [0, -0.42, -0.23], [0, -0.70, -0.27], [0, -0.99, -0.25], [0, -1.26, -0.17], [0, -1.47, -0.09]];
      const tctrl = [];
      for (let i = 0; i < TL.length; i++) {
        const k = i / (TL.length - 1);
        _d.set(rig.tailSway * 0.30 * k + Math.sin(rig.t * 1.9 + k * 2.2) * 0.015 * k,
          TL[i][1], TL[i][2] - 0.10 * k * k * rig.speed * 0.6);
        _d.add(rb.c).addScaledVector(rb.du, -0.03).addScaledVector(rb.dt, -0.03);
        tctrl.push(_d.clone());
      }
      resample(tctrl, tail, (S, t) => {
        S.rx = G.lerp(0.070, 0.019, Math.pow(t, 0.7));
        S.ry = S.rx * 1.06; S.p = 2.1; S.v0 = 0.14;
        S.topFade = G.mix(0.9, 0.30, t); S.bellyFade = S.topFade;
        S.topTone = G.mix(0.92, 0.55, G.smooth(0.35, 1, t)); S.bellyTone = S.topTone;
      }, 0);
      let acc = 0; const tl = [0];
      for (let i = 1; i < TAIL_ROWS; i++) { acc += tail.st[i].c.distanceTo(tail.st[i - 1].c); tl[i] = acc; }
      const tlen = acc || 1.5;
      for (let i = 0; i < TAIL_ROWS; i++) tail.st[i].u0 = S_SPINE - tlen + tl[i];

      // ---- dorsal crest (mane) from mid-back over the neck to the poll
      for (let i = 0; i < MANE_ROWS; i++) {
        const S = mane.st[i], t = i / (MANE_ROWS - 1);
        let src, k;
        if (t < 0.30) { src = torso.st; k = G.lerp(0.40, 1.0, t / 0.30) * (TORSO_ROWS - 1.001); }
        else { src = neck.st; k = ((t - 0.30) / 0.70) * (NECK_ROWS - 1.001); }
        const i0 = Math.floor(k), i1 = Math.min(src.length - 1, i0 + 1), kk = k - i0;
        const A0 = src[i0], A1 = src[i1];
        S.c.copy(A0.c).lerp(A1.c, kk);
        S.du.copy(A0.du).lerp(A1.du, kk).normalize();
        S.dr.copy(A0.dr).lerp(A1.dr, kk).normalize();
        S.dt.copy(A0.dt).lerp(A1.dt, kk).normalize();
        const top = A0.ry * (1 + (A0.taper || 0)) * (1 - kk) + A1.ry * (1 + (A1.taper || 0)) * kk;
        let hh = G.mix(0.014, 0.055, G.smooth(0.0, 0.26, t)) * G.mix(1, 0.7, G.smooth(0.84, 1, t));
        hh *= 0.82 + 0.36 * G.noise2(t * 40, 3.5, 8);        // ragged crest
        S.c.addScaledVector(S.du, top + hh * 0.10);
        S.rx = 0.011; S.ry = hh; S.p = 3.2; S.u0 = 0; S.v0 = 0;
      }

      // ---- head frame: face stays level while the neck bobs
      const nEnd = neck.st[NECK_ROWS - 1];
      _m4.makeBasis(nEnd.dr, nEnd.du, nEnd.dt);
      _qa.setFromRotationMatrix(_m4);
      const hPitch = 82 + 2.6 * Math.sin(2 * Math.PI * ph + 1.4) * walk + (A.headPitch || 0);
      const hRoll = -1.5 * Math.sin(2 * Math.PI * ph + 1.9) * walk;
      rig.glanceT -= dt * (0.4 + walk);
      if (rig.glanceT < 0) { rig.glanceT = G.rand(2.5, 7); rig.glanceTarget = G.rand(-0.40, 0.40); }
      if (A.lookAt) {
        // slowly aim at something interesting (the camera)
        _d.copy(A.lookAt).applyMatrix4(rig.Mi);
        const want = G.clamp(Math.atan2(_d.x, _d.z) - rig.neckEndYaw(), -0.55, 0.55);
        rig.glanceTarget = rig.glanceTarget * 0.9 + want * 0.1;
      }
      rig.glance += (rig.glanceTarget * (0.35 + 0.65 * walk) - rig.glance) * Math.min(1, dt * 1.5);
      _qb.setFromEuler(_e.set(D(hPitch), rig.glance, D(hRoll), 'ZYX'));
      head.position.copy(nEnd.c).addScaledVector(nEnd.dt, -0.015).addScaledVector(nEnd.du, 0.01);
      head.quaternion.copy(_qa.multiply(_qb));
      head.updateMatrixWorld(true);
      for (const ear of headParts.ears) {
        ear.flick *= Math.pow(0.2, dt);
        if (rnd() < dt * 0.35) ear.flick = 1;
        const fl = Math.sin(rig.t * 22 + ear.ph) * 0.20 * ear.flick;
        ear.pivot.rotation.x = Math.sin(rig.t * 0.9 + ear.ph) * 0.08 + fl;
        ear.pivot.rotation.z = Math.sin(rig.t * 0.7 + ear.ph * 1.7) * 0.06;
      }

      // ---- limbs
      for (let li = 0; li < 4; li++) {
        const leg = legs[li], def = leg.def;
        // shoulder / hip anchor, carried by the trunk
        const si = G.clamp(def.st * (TORSO_ROWS - 1), 0, TORSO_ROWS - 1.001);
        const i0 = Math.floor(si), i1 = i0 + 1, kk = si - i0;
        const A0 = torso.st[i0], A1 = torso.st[i1];
        _side.copy(A0.dr).lerp(A1.dr, kk).normalize();
        _fwd.copy(A0.du).lerp(A1.du, kk).normalize();
        _perp.copy(A0.dt).lerp(A1.dt, kk).normalize();
        leg.anchor.copy(A0.c).lerp(A1.c, kk)
          .addScaledVector(_side, def.side * def.off[0])
          .addScaledVector(_fwd, def.off[1])
          .addScaledVector(_perp, def.off[2]);
        leg.sAnchor = G.lerp(A0.u0, A1.u0, kk);

        // foot path: planted during stance, arcs forward during swing
        const p = G.fract(ph + def.phase);
        const duty = rig.duty, Str = rig.stride * walk;
        let fz, fy, a4, stance;
        if (p < duty) {
          const u = p / duty;
          fz = Str * duty * (0.5 - u); fy = 0; a4 = def.neutral[3]; stance = 1;
        } else {
          const u = (p - duty) / (1 - duty), es = u * u * (3 - 2 * u);
          fz = Str * duty * (es - 0.5);
          fy = Math.sin(Math.PI * Math.pow(u, 0.8)) * (0.085 + 0.075 * G.clamp(Str / 2.4, 0, 1));
          a4 = def.neutral[3] + 14 * Math.sin(Math.PI * u) * (u < 0.3 ? u / 0.3 : 1);
          stance = 0;
        }
        leg.prevStance = leg.stance;
        leg.stance += (stance - leg.stance) * Math.min(1, dt * 12);
        if (leg.prevStance < 0.5 && leg.stance >= 0.5) { leg.land = 1; rig.landed.push(leg); }
        leg.land *= Math.pow(0.02, dt);

        // world-space foot target on the flat ground plane
        _d.set(def.footX * def.side, fy + 0.004, def.footZ + fz);
        const footW = _d.clone().applyMatrix4(rig.MY);
        const anchW = leg.anchor.clone().applyMatrix4(rig.M);
        const dx = footW.x - anchW.x, dz = footW.z - anchW.z;
        const yaw = Math.atan2(dx, dz);
        _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
        _side.set(_fwd.z, 0, -_fwd.x);
        // plane coordinates measured from the anchor (u forward, v up)
        const uT = dx * _fwd.x + dz * _fwd.z, vT = footW.y - anchW.y;
        const L = def.L;
        // plane -> root space helpers
        _m4.extractRotation(rig.Mi);
        const sideL = _sl.copy(_side).applyMatrix4(_m4).normalize();
        const toLocal = (v, out) => {
          _w.set(anchW.x + _fwd.x * v.x, anchW.y + v.y, anchW.z + _fwd.z * v.x);
          return out.copy(_w).applyMatrix4(rig.Mi);
        };
        const jpL = leg.jpL;
        const tU = uT - L[3] * Math.sin(D(a4)), tV = vT + L[3] * Math.cos(D(a4));

        // ---- 3 joint CCD in the limb plane, biased toward the neutral pose
        const ang = leg.a, neu = def.neutral, lim = def.lim;
        for (let it = 0; it < 16; it++) {
          for (let i = 2; i >= 0; i--) {
            let cu = 0, cv = 0, cum = 0;
            for (let k = 0; k <= 2; k++) { cum += ang[k]; cu += L[k] * Math.sin(cum); cv -= L[k] * Math.cos(cum); }
            let ju = 0, jv = 0; cum = 0;
            for (let k = 0; k < i; k++) { cum += ang[k]; ju += L[k] * Math.sin(cum); jv -= L[k] * Math.cos(cum); }
            const vx = cu - ju, vy = cv - jv, wx = tU - ju, wy = tV - jv;
            ang[i] += Math.atan2(vx * wy - vy * wx, vx * wx + vy * wy) * 0.68;
            const lm = D(lim[i]);
            ang[i] = G.clamp(ang[i], -lm, lm);
            ang[i] -= (ang[i] - D(neu[i])) * (it > 8 ? 0.10 : 0.03);
          }
        }
        // joint positions in plane coords
        let cu = 0, cv = 0, cum = 0;
        const cums = [0, 0, 0, 0, 0];
        leg.jp[0].set(0, 0, 0);
        for (let k = 0; k <= 2; k++) {
          cum += ang[k]; cums[k + 1] = cum;
          cu += L[k] * Math.sin(cum); cv -= L[k] * Math.cos(cum);
          leg.jp[k + 1].set(cu, cv, 0);
        }
        leg.jp[4].set(uT, vT, 0);
        cums[4] = Math.atan2(uT - cu, vT - cv);
        for (let k = 0; k < 5; k++) toLocal(leg.jp[k], jpL[k]);

        for (let pi = 0; pi < 4; pi++) {
          const A = jpL[pi], B = jpL[pi + 1];
          _d.copy(B).sub(A);
          const len = _d.length() || 1e-3; _d.multiplyScalar(1 / len);
          _perp.crossVectors(_d, sideL);                 // in-plane, toward the front
          const pr = def.prof[pi], part = leg.parts[pi];
          const u0 = leg.sAnchor + (def.front ? 0.05 : -0.30) + pi * 0.12;
          for (let i = 0; i < LEG_ROWS; i++) {
            const t = i / (LEG_ROWS - 1), S = part.st[i], rr = seg(pr, t, 1, 2);
            S.c.copy(A).addScaledVector(_d, len * t);
            S.dt.copy(_d); S.dr.copy(sideL); S.du.copy(_perp);
            S.rx = rr[0]; S.ry = rr[1]; S.p = 2.2; S.taper = 0;
            S.u0 = u0 + t * len * 0.8; S.v0 = 0.30;
            const fade = pi === 0 ? G.mix(0.95, 0.88, t)
              : pi === 1 ? G.mix(0.9, 0.72, t)
                : pi === 2 ? G.mix(0.72, 0.32, t) : G.mix(0.32, 0.16, t);
            S.topFade = fade; S.bellyFade = fade;
            const tone = pi >= 2 ? G.mix(1.0, 0.80, t) : 1.0;
            S.topTone = tone; S.bellyTone = tone;
          }
          part.loft.update(part.st);
        }
        for (let k = 0; k < 3; k++) {
          const j = leg.joints[k], rr = def.joint[k];
          j.position.copy(jpL[k + 1]);
          j.scale.set(rr, rr * 1.05, rr * 1.10);
        }
        _d.copy(jpL[4]).sub(jpL[3]).normalize();
        leg.hoof.position.copy(jpL[3]).addScaledVector(_d, L[3] - 0.085);
        leg.hoof.quaternion.setFromUnitVectors(UP, _d.clone().negate());
      }

      // ---- commit lofts
      torso.loft.update(torso.st);
      neck.loft.update(neck.st);
      tail.loft.update(tail.st);
      mane.loft.update(mane.st);
      // tail brush follows the last tail segment
      const b0 = tail.st[TAIL_ROWS - 3].c, b1 = tail.st[TAIL_ROWS - 1].c;
      _d.copy(b1).sub(b0).normalize();
      brush.position.copy(b1).addScaledVector(_d, 0.20);
      brush.quaternion.setFromUnitVectors(UP, _d.clone().negate());
    };

    rig.neckEndYaw = function () {
      _d.copy(head.position).sub(rig.root.position);
      return Math.atan2(_d.x, _d.z) - rig.heading;
    };
    rig.headWorld = function (out) { return out.copy(head.position).applyMatrix4(rig.M); };
    rig.heightAt = () => 5.55;

    return rig;
  };
})(window.G);
