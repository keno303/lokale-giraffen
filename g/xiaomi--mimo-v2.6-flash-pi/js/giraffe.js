'use strict';
/* ============================================================
   giraffe.js – procedural anatomical model
   Every part is a lofted tube swept along a path, so the body
   reads as an animal rather than a pile of primitives.
   ============================================================ */

function buildGiraffe() {

  /* ---------------- textures & materials ---------------- */
  const coatCanvas = makeCoatTexture({ size: 1024, cols: 6, rows: 6, seed: 11 });
  const legCanvas = makeLegTexture({ size: 512, cols: 4, rows: 7, seed: 4 });
  const coatTex = canvasTexture(coatCanvas, null);   // repeats are baked into the UVs
  const legTex = canvasTexture(legCanvas, null);

  const matCoat = new THREE.MeshStandardMaterial({
    map: coatTex, bumpMap: coatTex, bumpScale: 0.012,
    roughness: 0.86, metalness: 0.0, vertexColors: true
  });
  const matLeg = new THREE.MeshStandardMaterial({
    map: legTex, bumpMap: legTex, bumpScale: 0.008,
    roughness: 0.86, metalness: 0.0, vertexColors: true
  });
  const matCream = new THREE.MeshStandardMaterial({
    color: 0xe9dfc8, roughness: 0.9, metalness: 0.0
  });
  const matHoof = new THREE.MeshStandardMaterial({
    color: 0x5b544b, roughness: 0.62, metalness: 0.0
  });
  const matDarkHair = new THREE.MeshStandardMaterial({
    color: 0x2c2118, roughness: 0.95, metalness: 0.0
  });
  const matMane = new THREE.MeshStandardMaterial({
    color: 0x4a3220, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide
  });
  const matEye = new THREE.MeshStandardMaterial({
    color: 0x18110c, roughness: 0.12, metalness: 0.05
  });

  const root = new THREE.Object3D();
  root.name = 'giraffe';
  const body = new THREE.Object3D();
  body.name = 'body';
  root.add(body);

  const mesh = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  /* ------------------------------------------------------------
     TORSO
     ------------------------------------------------------------ */
  const torsoSections = [
    { c: [-1.22, 0.12, 0], ra: 0.10, rTop: 0.11, rBot: 0.12, n: 2.2 },
    { c: [-1.14, 0.13, 0], ra: 0.26, rTop: 0.24, rBot: 0.25, n: 2.6 },
    { c: [-1.02, 0.13, 0], ra: 0.35, rTop: 0.30, rBot: 0.30, n: 2.9 },
    { c: [-0.80, 0.11, 0], ra: 0.37, rTop: 0.32, rBot: 0.31, n: 3.0 },
    { c: [-0.55, 0.09, 0], ra: 0.36, rTop: 0.32, rBot: 0.33, n: 3.1 },
    { c: [-0.25, 0.10, 0], ra: 0.36, rTop: 0.33, rBot: 0.38, n: 3.2 },
    { c: [0.05, 0.13, 0], ra: 0.38, rTop: 0.35, rBot: 0.45, n: 3.3 },
    { c: [0.38, 0.17, 0], ra: 0.40, rTop: 0.36, rBot: 0.49, n: 3.4 },
    { c: [0.68, 0.20, 0], ra: 0.41, rTop: 0.35, rBot: 0.49, n: 3.4 },
    { c: [0.90, 0.22, 0], ra: 0.38, rTop: 0.31, rBot: 0.45, n: 3.2 },
    { c: [1.05, 0.24, 0], ra: 0.29, rTop: 0.25, rBot: 0.34, n: 2.9 },
    { c: [1.14, 0.26, 0], ra: 0.15, rTop: 0.16, rBot: 0.19, n: 2.5 },
    { c: [1.20, 0.28, 0], ra: 0.05, rTop: 0.05, rBot: 0.06, n: 2.2 }
  ];
  /* belly countershading: lighten the underside a little */
  const torsoColor = (P, u, v) => {
    const th = u * TAU;
    const down = -Math.sin(th);            // 1 at the very bottom (u = .75)
    const w = clamp((down - 0.35) / 0.6, 0, 1);
    const k = 1 + 0.42 * w;
    return new THREE.Color(k, k, k * 0.97);
  };
  const torsoGeo = buildLoft(torsoSections, {
    seg: 26, capStart: 'pole', capEnd: 'pole', colorFn: torsoColor
  });
  scaleUV(torsoGeo, 2.0, 2.0);
  const torso = mesh(torsoGeo, matCoat);
  body.add(torso);

  /* ------------------------------------------------------------
     NECK  (built in neckBase-local space)
     ------------------------------------------------------------ */
  const NECK_BASE = [0.90, 0.20, 0];
  const neckBase = new THREE.Object3D();
  neckBase.position.set(NECK_BASE[0], NECK_BASE[1], NECK_BASE[2]);
  body.add(neckBase);

  const neckLocal = p => [p[0] - NECK_BASE[0], p[1] - NECK_BASE[1], p[2] - NECK_BASE[2]];
  const neckSections = [
    { c: neckLocal([0.90, 0.20, 0]), ra: 0.30, rb: 0.32, n: 3.0 },
    { c: neckLocal([1.20, 0.54, 0]), ra: 0.275, rb: 0.30, n: 3.0 },
    { c: neckLocal([1.47, 0.89, 0]), ra: 0.245, rb: 0.27, n: 3.0 },
    { c: neckLocal([1.72, 1.23, 0]), ra: 0.215, rb: 0.24, n: 2.9 },
    { c: neckLocal([1.96, 1.52, 0]), ra: 0.185, rb: 0.21, n: 2.8 },
    { c: neckLocal([2.16, 1.76, 0]), ra: 0.16, rb: 0.18, n: 2.7 },
    { c: neckLocal([2.28, 1.92, 0]), ra: 0.13, rb: 0.14, n: 2.5 }
  ];
  const neckColor = (P, u) => {
    const th = u * TAU;
    const down = -Math.sin(th);
    const w = clamp((down - 0.4) / 0.6, 0, 1);
    const k = 1 + 0.22 * w;
    return new THREE.Color(k, k, k * 0.98);
  };
  const neckGeo = buildLoft(neckSections, {
    seg: 22, capStart: 'flat', capEnd: 'flat', colorFn: neckColor
  });
  scaleUV(neckGeo, 1.3, 2.6);
  const neck = mesh(neckGeo, matCoat);
  neckBase.add(neck);

  /* mane: a thin boxy ridge swept along the top edge of the neck */
  (function buildMane() {
    const frames = loftFrames(neckSections, { seg: 22 });
    const samples = 34;
    const secs = [];
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const f = sampleFrames(frames, t);
      const h = 0.085 * (1 - 0.30 * t);
      const zig = (i % 2 === 0) ? 1 : 0.72;
      const off = f.rb * 0.995 + h * 0.42 * zig;
      const c = [
        f.c.x + f.up.x * off,
        f.c.y + f.up.y * off,
        f.c.z + f.up.z * off
      ];
      secs.push({ c: c, ra: 0.012, rb: h * 0.5 * zig, n: 4 });
    }
    const maneGeo = buildLoft(secs, { seg: 6, initialSide: [0, 0, 1], shade: false });
    const mane = mesh(maneGeo, matMane);
    neckBase.add(mane);
  })();

  /* ------------------------------------------------------------
     HEAD  (headPivot sits at the top of the neck)
     ------------------------------------------------------------ */
  const headPivot = new THREE.Object3D();
  headPivot.position.set(2.28 - NECK_BASE[0], 1.92 - NECK_BASE[1], 0);
  headPivot.rotation.z = -16 * DEG;         // muzzle angled slightly down
  neckBase.add(headPivot);

  const headSections = [
    { c: [-0.04, -0.02, 0], ra: 0.09, rTop: 0.10, rBot: 0.10, n: 2.4 },
    { c: [0.05, 0.01, 0], ra: 0.145, rTop: 0.14, rBot: 0.125, n: 2.6 },
    { c: [0.15, 0.03, 0], ra: 0.17, rTop: 0.14, rBot: 0.155, n: 2.8 },
    { c: [0.26, 0.02, 0], ra: 0.155, rTop: 0.115, rBot: 0.185, n: 3.0 },
    { c: [0.37, -0.01, 0], ra: 0.115, rTop: 0.095, rBot: 0.16, n: 2.8 },
    { c: [0.47, -0.045, 0], ra: 0.092, rTop: 0.085, rBot: 0.115, n: 2.6 },
    { c: [0.56, -0.07, 0], ra: 0.077, rTop: 0.076, rBot: 0.09, n: 2.5 },
    { c: [0.615, -0.088, 0], ra: 0.05, rTop: 0.05, rBot: 0.055, n: 2.4 }
  ];
  const headColor = (P, u, v) => {
    let r = 1, g = 1, b = 1;
    /* dark muzzle */
    const m = smoothstep((P.x - 0.44) / 0.14) * smoothstep((-0.02 - P.y) / 0.06 + 0.6);
    if (m > 0) { r = lerp(1, 0.34, m); g = lerp(1, 0.32, m); b = lerp(1, 0.31, m); }
    /* a slightly darker patch around the eye socket */
    const e = clamp(1 - Math.hypot(P.x - 0.17, P.y - 0.05) / 0.13, 0, 1) * (P.z > 0 ? 1 : 1);
    const k = 1 - 0.10 * e * e;
    return new THREE.Color(r * k, g * k, b * k);
  };
  const headGeo = buildLoft(headSections, {
    seg: 24, capStart: 'pole', capEnd: 'pole', colorFn: headColor
  });
  scaleUV(headGeo, 1.15, 0.95);
  const head = mesh(headGeo, matCoat);
  headPivot.add(head);

  /* ossicones */
  const ossicone = (sgn) => {
    const dir = V(0.03 * sgn, 1, 0.06 * sgn).normalize();
    const base = V(0.10, 0.13, 0.075 * sgn);
    const secs = [];
    const L = 0.185;
    const prof = [
      [0.00, 0.048], [0.02, 0.041], [0.05, 0.036], [0.11, 0.033],
      [0.145, 0.043], [0.165, 0.046], [0.178, 0.036], [0.185, 0.012]
    ];
    for (const p of prof) {
      secs.push({
        c: [base.x + dir.x * p[0] * L / 0.185, base.y + dir.y * p[0], base.z + dir.z * p[0]],
        ra: p[1], rb: p[1], n: 2.4
      });
    }
    const colorFn = (P) => {
      const h = P.y - base.y;
      const w = smoothstep((h - 0.12) / 0.05);
      const k = lerp(1, 0.34, w);
      return new THREE.Color(k, k, k);
    };
    const g = buildLoft(secs, {
      seg: 12, capEnd: 'pole', poleOffset: 0.02, colorFn: colorFn
    });
    scaleUV(g, 1, 1);
    return mesh(g, matCoat);
  };
  headPivot.add(ossicone(1));
  headPivot.add(ossicone(-1));

  /* ears – flat leaf shaped pinnae, each on its own pivot so it can twitch */
  const ear = (sgn) => {
    const base = V(0.03, 0.065, 0.105 * sgn);
    const tip = V(-0.11, 0.135, 0.30 * sgn);
    const dir = tip.clone().sub(base);
    const L = dir.length();
    dir.normalize();
    const prof = [
      [0.00, 0.042, 0.016], [0.18, 0.062, 0.023], [0.45, 0.078, 0.026],
      [0.70, 0.066, 0.022], [0.88, 0.044, 0.016], [1.00, 0.012, 0.006]
    ];
    const secs = prof.map(p => ({
      c: [dir.x * p[0] * L, dir.y * p[0] * L, dir.z * p[0] * L],
      ra: p[1], rb: p[2], n: 2.6
    }));
    const g = buildLoft(secs, { seg: 12, capStart: 'flat', capEnd: 'pole', poleOffset: 0.03 });
    scaleUV(g, 1, 1);
    const pivot = new THREE.Object3D();
    pivot.position.copy(base);
    pivot.add(mesh(g, matCoat));
    return pivot;
  };
  const earR = ear(1), earL = ear(-1);
  headPivot.add(earR); headPivot.add(earL);

  /* eyes */
  const eyeGeo = new THREE.SphereGeometry(0.05, 20, 14);
  const eyeR = mesh(eyeGeo, matEye);
  eyeR.position.set(0.17, 0.05, 0.152);
  eyeR.scale.set(1, 1, 0.85);
  const eyeL = mesh(eyeGeo, matEye);
  eyeL.position.set(0.17, 0.05, -0.152);
  eyeL.scale.set(1, 1, 0.85);
  headPivot.add(eyeR); headPivot.add(eyeL);

  /* nostrils */
  const nostrilGeo = new THREE.SphereGeometry(0.026, 12, 10);
  for (const s of [1, -1]) {
    const n = mesh(nostrilGeo, matDarkHair);
    n.position.set(0.545, -0.05, 0.042 * s);
    n.scale.set(1.3, 0.7, 1);
    headPivot.add(n);
  }

  /* ------------------------------------------------------------
     TAIL
     ------------------------------------------------------------ */
  const tailBase = new THREE.Object3D();
  tailBase.position.set(-1.16, 0.22, 0);
  body.add(tailBase);
  const tailSections = [
    { c: [0, 0, 0], ra: 0.075, rb: 0.075, n: 2.6 },
    { c: [-0.04, -0.22, 0], ra: 0.06, rb: 0.06, n: 2.6 },
    { c: [-0.07, -0.45, 0], ra: 0.048, rb: 0.048, n: 2.5 },
    { c: [-0.09, -0.68, 0], ra: 0.04, rb: 0.04, n: 2.5 },
    { c: [-0.10, -0.88, 0], ra: 0.036, rb: 0.036, n: 2.5 },
    { c: [-0.10, -0.98, 0], ra: 0.034, rb: 0.034, n: 2.5 }
  ];
  const tailGeo = buildLoft(tailSections, { seg: 12, capEnd: 'flat' });
  scaleUV(tailGeo, 1, 1.4);
  tailBase.add(mesh(tailGeo, matCoat));

  const tuftSections = [
    { c: [-0.10, -0.96, 0], ra: 0.038, rb: 0.038, n: 2.5 },
    { c: [-0.11, -1.04, 0], ra: 0.062, rb: 0.062, n: 2.6 },
    { c: [-0.115, -1.18, 0], ra: 0.06, rb: 0.06, n: 2.6 },
    { c: [-0.118, -1.30, 0], ra: 0.045, rb: 0.045, n: 2.5 },
    { c: [-0.12, -1.38, 0], ra: 0.02, rb: 0.02, n: 2.4 },
    { c: [-0.12, -1.42, 0], ra: 0.006, rb: 0.006, n: 2.2 }
  ];
  const tuftGeo = buildLoft(tuftSections, { seg: 12, capStart: 'flat', capEnd: 'pole' });
  tailBase.add(mesh(tuftGeo, matDarkHair));

  /* ------------------------------------------------------------
     LEGS
     ------------------------------------------------------------ */
  /* gait phase per foot – default gait is the pacing gait
     giraffes actually use (both legs of one side together) */
  const GAIT_PACE = { FR: 0.00, FL: 0.50, HR: 0.06, HL: 0.56, duty: 0.62 };
  const GAIT_WALK = { FL: 0.25, FR: 0.75, HL: 0.00, HR: 0.50, duty: 0.60 };

  const LEG_DEF = [
    { id: 'FR', front: true, sgn: 1 },
    { id: 'FL', front: true, sgn: -1 },
    { id: 'HR', front: false, sgn: 1 },
    { id: 'HL', front: false, sgn: -1 }
  ];
  /* radius profile helper:  t → [ra, rb, n] */
  const frontHumerus = [
    [0.00, 0.135, 0.125, 2.6],
    [0.09, 0.155, 0.145, 2.8],
    [0.24, 0.135, 0.125, 2.8],
    [0.38, 0.105, 0.10, 2.6],
    [0.50, 0.098, 0.095, 2.6]
  ];
  const frontRadius = [
    [0.00, 0.098, 0.095, 2.6],
    [0.14, 0.113, 0.107, 2.7],
    [0.50, 0.095, 0.09, 2.6],
    [0.85, 0.078, 0.075, 2.5],
    [1.10, 0.072, 0.070, 2.5]
  ];
  const frontCannon = [
    [0.00, 0.072, 0.070, 2.7],
    [0.06, 0.087, 0.086, 2.9],
    [0.20, 0.058, 0.058, 2.5],
    [0.75, 0.053, 0.056, 2.5],
    [1.00, 0.061, 0.063, 2.6],
    [1.114, 0.051, 0.053, 2.5]
  ];
  const hindFemur = [
    [0.00, 0.155, 0.145, 2.6],
    [0.13, 0.205, 0.185, 3.0],
    [0.30, 0.17, 0.155, 2.8],
    [0.45, 0.12, 0.115, 2.6],
    [0.54, 0.106, 0.102, 2.6]
  ];
  const hindTibia = [
    [0.00, 0.106, 0.102, 2.6],
    [0.16, 0.126, 0.119, 2.8],
    [0.45, 0.095, 0.092, 2.6],
    [0.85, 0.076, 0.075, 2.5],
    [1.05, 0.072, 0.071, 2.5]
  ];
  const hindCannon = [
    [0.00, 0.072, 0.071, 2.7],
    [0.09, 0.086, 0.085, 2.9],
    [0.24, 0.057, 0.059, 2.5],
    [0.72, 0.051, 0.054, 2.5],
    [0.95, 0.059, 0.061, 2.6],
    [1.057, 0.049, 0.051, 2.5]
  ];

  const profileToSections = (prof, len) => prof.map(p => ({ c: [0, -p[0], 0], ra: p[1], rb: p[2], n: p[3] }));
  const boneLen = prof => prof[prof.length - 1][0];

  const pasternSections = [
    { c: [0, 0, 0], ra: 0.055, rb: 0.057, n: 2.5 },
    { c: [0.030, -0.050, 0], ra: 0.051, rb: 0.053, n: 2.5 },
    { c: [0.058, -0.094, 0], ra: 0.053, rb: 0.055, n: 2.5 },
    { c: [0.070, -0.113, 0], ra: 0.054, rb: 0.056, n: 2.6 }
  ];
  const hoofSections = [
    { c: [0.071, -0.111, 0], ra: 0.053, rb: 0.055, n: 2.6 },
    { c: [0.081, -0.152, 0], ra: 0.063, rb: 0.066, n: 3.0 },
    { c: [0.092, -0.228, 0], ra: 0.068, rb: 0.071, n: 3.2 },
    { c: [0.099, -0.288, 0], ra: 0.069, rb: 0.072, n: 3.3 },
    { c: [0.100, -0.300, 0], ra: 0.067, rb: 0.070, n: 3.3 }
  ];

  const legs = [];
  for (const def of LEG_DEF) {
    const F = def.front;
    const L = F ? [0.50, 1.10, 1.114] : [0.54, 1.05, 1.057];
    const profs = F ? [frontHumerus, frontRadius, frontCannon]
      : [hindFemur, hindTibia, hindCannon];
    const hipPos = F ? [0.80, 0.12, 0.29 * def.sgn] : [-0.95, 0.05, 0.30 * def.sgn];

    const hip = new THREE.Object3D();
    hip.position.set(hipPos[0], hipPos[1], hipPos[2]);
    hip.name = 'hip_' + def.id;
    body.add(hip);

    const joints = [hip];
    let parent = hip;
    const bones = [];
    for (let i = 0; i < 3; i++) {
      const geo = buildLoft(profileToSections(profs[i], L[i]), {
        seg: 14, capStart: 'pole',
        capEnd: i < 2 ? 'pole' : 'flat',
        initialSide: [1, 0, 0]
      });
      /* bake the leg texture v-range: v = 0 at the hip, 1 at the fetlock */
      const total = L[0] + L[1] + L[2];
      const start = (i === 0 ? 0 : (i === 1 ? L[0] : L[0] + L[1])) / total;
      scaleUV(geo, 1.0, L[i] / total, 0, start);
      const m = mesh(geo, matLeg);
      parent.add(m);
      bones.push(m);
      if (i < 2) {
        const j = new THREE.Object3D();
        j.position.set(0, -L[i], 0);
        j.name = 'joint' + i + '_' + def.id;
        parent.add(j);
        joints.push(j);
        parent = j;
      }
    }
    /* fetlock / hoof */
    const hoofPivot = new THREE.Object3D();
    hoofPivot.position.set(0, -L[2], 0);
    parent.add(hoofPivot);
    joints.push(hoofPivot);

    const pasternGeo = buildLoft(pasternSections, { seg: 14, capStart: 'pole', capEnd: 'flat' });
    scaleUV(pasternGeo, 1, 1);
    hoofPivot.add(mesh(pasternGeo, matCream));
    const hoofGeo = buildLoft(hoofSections, { seg: 16, capStart: 'flat', capEnd: 'flat' });
    scaleUV(hoofGeo, 1, 1);
    hoofPivot.add(mesh(hoofGeo, matHoof));

    legs.push({
      id: def.id, front: F, sgn: def.sgn,
      phase: GAIT_PACE[def.id],
      hip: hip, joints: joints, hoofPivot: hoofPivot,
      L: L, hipLocal: V(hipPos[0], hipPos[1], hipPos[2]),
      limits: F ? [[-8 * DEG, 65 * DEG], [-62 * DEG, 12 * DEG]]
        : [[-88 * DEG, -28 * DEG], [8 * DEG, 70 * DEG]],
      /* anatomical joint turns: stance pose vs folded swing pose */
      turnsStance: F ? [20 * DEG, -10 * DEG] : [-45 * DEG, 35 * DEG],
      turnsSwing: F ? [44 * DEG, -52 * DEG] : [-72 * DEG, 52 * DEG],
      fetlockY: 0.30
    });
  }

  /* everything casts shadows */
  root.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });

  return {
    root, body, torso, neckBase, headPivot, tailBase,
    legs, ears: [earR, earL], eyes: [eyeR, eyeL],
    gaits: { pace: GAIT_PACE, walk: GAIT_WALK },
    bodyNominalY: 2.80
  };
}

/* ------------------------------------------------------------
   UV helpers: bake tiling into the attribute so every coat mesh
   can share a single material.
   ------------------------------------------------------------ */
function scaleUV(geo, su, sv, ou, ov) {
  ou = ou || 0; ov = ov || 0;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
  }
  uv.needsUpdate = true;
}
