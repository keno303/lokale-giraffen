/* giraffe.js — a procedurally built, anatomically plausible giraffe with a
   walking gait driven by two-bone IK.  All units are metres. */
(function (global) {
  'use strict';

  const V3 = THREE.Vector3;
  const TAU = Math.PI * 2;

  /* ---------------------------------------------------------------- */
  /*  helpers                                                          */
  /* ---------------------------------------------------------------- */

  // ctrl rows: [x, y, radiusLateral, radiusInPlane]
  function makeProfile(ctrl) {
    const pts = ctrl.map((p) => new V3(p[0], p[1], 0));
    const rad = ctrl.map((p) => new V3(p[2], p[3], 0));
    const center = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    const rr = new THREE.CatmullRomCurve3(rad, false, 'catmullrom', 0.5);
    return {
      center,
      radii: (t) => { const v = rr.getPoint(t); return { x: v.x, y: v.y }; },
    };
  }

  function tint(base, v) {
    base.setRGB(v * 1.03, v, v * 0.95);
  }

  /* ---------------------------------------------------------------- */
  /*  build                                                            */
  /* ---------------------------------------------------------------- */

  function buildGiraffe(opts) {
    opts = opts || {};
    const rnd = Patterns.mulberry32(opts.seed || 1234);

    /* ---------- materials ---------- */
    const coatCanvas = Patterns.coatTexture({ size: 1024, count: 265, minR: 15, maxR: 33, seed: 11, outline: 3 });
    const legCanvas = Patterns.coatTexture({
      size: 512, count: 95, minR: 15, maxR: 32, seed: 23,
      base: '#b58f58', outline: 3,
    });
    const bumpCanvas = Patterns.furBumpTexture(256, 91);

    const coatTex = Patterns.tex(coatCanvas, 1, 1);
    const legTex = Patterns.tex(legCanvas, 1, 2.2);
    const bumpTex = Patterns.tex(bumpCanvas, 22, 22, false);
    const muscleTex = coatTex.clone();
    muscleTex.repeat.set(2.6, 2.6);
    muscleTex.needsUpdate = true;

    // the legs are much thinner than the body, so they need their own texel density
    function legMaterial(repY) {
      const t = legTex.clone();
      t.repeat.set(1, repY);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({
        map: t, bumpMap: bumpTex, bumpScale: 0.016,
        vertexColors: true, roughness: 0.9, metalness: 0.0,
      });
    }
    const matLegFrontUp = legMaterial(2.4);
    const matLegFrontLow = legMaterial(3.4);
    const matLegHindUp = legMaterial(1.9);
    const matLegHindLow = legMaterial(3.6);

    const matSkin = new THREE.MeshStandardMaterial({
      map: coatTex, bumpMap: bumpTex, bumpScale: 0.022,
      vertexColors: true, roughness: 0.88, metalness: 0.0,
    });
    const matMuscle = new THREE.MeshStandardMaterial({
      map: muscleTex, bumpMap: bumpTex, bumpScale: 0.022,
      vertexColors: true, roughness: 0.88, metalness: 0.0,
    });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.72 });
    const matHoof = new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.36, metalness: 0.06 });
    const matJoint = new THREE.MeshStandardMaterial({ color: 0x6a4526, roughness: 0.92 });
    const matEye = new THREE.MeshStandardMaterial({ color: 0x0a0708, roughness: 0.06, metalness: 0.1 });
    const matHorn = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.62 });
    const matEar = new THREE.MeshStandardMaterial({ color: 0x9c7358, roughness: 0.82 });
    const matEarIn = new THREE.MeshStandardMaterial({ color: 0x5e3f2f, roughness: 0.88 });
    const matMuzzle = new THREE.MeshStandardMaterial({ color: 0x3a2519, roughness: 0.62 });

    /* ---------- hierarchy ---------- */
    const root = new THREE.Group();          // world placement + heading
    const body = new THREE.Group();          // bob / pitch / roll
    root.add(body);

    /* ---------- torso ---------- */
    const torsoProfile = makeProfile([
      [-1.46, 2.07, 0.07, 0.09],
      [-1.40, 2.09, 0.15, 0.18],
      [-1.30, 2.11, 0.25, 0.30],
      [-1.14, 2.13, 0.34, 0.40],
      [-0.95, 2.11, 0.40, 0.47],
      [-0.60, 2.06, 0.42, 0.48],
      [-0.20, 2.03, 0.43, 0.50],
      [0.18, 2.04, 0.44, 0.53],
      [0.52, 2.09, 0.45, 0.55],
      [0.82, 2.13, 0.41, 0.48],
      [1.06, 2.13, 0.30, 0.36],
      [1.20, 2.09, 0.20, 0.25],
      [1.30, 2.04, 0.08, 0.10],
    ]);
    const torsoGeo = Geom.loftGeometry({
      center: torsoProfile.center,
      radii: torsoProfile.radii,
      sections: 44, radial: 22,
      shade: (col, t, a) => {
        const belly = Math.max(0, -Math.sin(a));
        const back = Math.max(0, Math.sin(a));
        tint(col, 0.91 + 0.10 * belly - 0.05 * back);
      },
    });
    const torso = new THREE.Mesh(torsoGeo, matSkin);
    torso.castShadow = true; torso.receiveShadow = true;
    body.add(torso);

    // shoulder blade & haunch masses give the silhouette some anatomy
    function muscle(pos, scale, rot) {
      const g = Geom.blobGeometry(1, 2, 0.05, 5 + Math.floor(rnd() * 20));
      const m = new THREE.Mesh(g, matMuscle);
      m.scale.set(scale[0], scale[1], scale[2]);
      m.position.set(pos[0], pos[1], pos[2]);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      m.castShadow = true;
      m.visible = false;   // blends are handled by the torso loft itself
      body.add(m);
      return m;
    }
    muscle([0.60, 2.14, 0.22], [0.20, 0.34, 0.19], [0, 0, -0.25]);
    muscle([0.60, 2.14, -0.22], [0.20, 0.34, 0.19], [0, 0, -0.25]);
    muscle([-1.00, 2.10, 0.20], [0.24, 0.38, 0.22], [0, 0, 0.25]);
    muscle([-1.00, 2.10, -0.20], [0.24, 0.38, 0.22], [0, 0, 0.25]);

    /* ---------- neck ---------- */
    const neckBase = new THREE.Group();
    neckBase.position.set(0.62, 2.38, 0);
    body.add(neckBase);

    const neckProfile = makeProfile([
      [0.00, 0.00, 0.33, 0.45],
      [0.13, 0.42, 0.27, 0.36],
      [0.31, 0.84, 0.225, 0.295],
      [0.50, 1.26, 0.19, 0.245],
      [0.64, 1.60, 0.163, 0.208],
      [0.71, 1.86, 0.146, 0.176],
      [0.73, 2.02, 0.133, 0.159],
    ]);
    const neckGeo = Geom.loftGeometry({
      center: neckProfile.center,
      radii: neckProfile.radii,
      sections: 40, radial: 20,
      shade: (col, t, a) => {
        const front = Math.max(0, Math.sin(a));
        tint(col, 0.90 + 0.20 * front - 0.04 * Math.max(0, -Math.sin(a)));
      },
    });
    const neck = new THREE.Mesh(neckGeo, matSkin);
    neck.castShadow = true; neck.receiveShadow = true;
    neckBase.add(neck);

    // anchor at the top of the neck where the head attaches
    const neckTip = neckProfile.center.getPoint(1);
    const headAnchor = new THREE.Group();
    headAnchor.position.copy(neckTip);
    headAnchor.rotation.z = -Math.atan2(neckTip.x - neckProfile.center.getPoint(0.9).x,
      neckTip.y - neckProfile.center.getPoint(0.9).y);
    neckBase.add(headAnchor);

    /* mane: short dark crest running along the back of the neck */
    const maneGeo = new THREE.ConeGeometry(0.014, 0.062, 5, 1);
    maneGeo.translate(0, 0.031, 0);
    const maneCount = 46;
    const mane = new THREE.InstancedMesh(maneGeo, matDark, maneCount);
    mane.castShadow = true;
    {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3();
      const up = new V3(0, 1, 0), dir = new V3();
      const T = new V3(), R = new V3(0, 0, 1), N = new V3();
      for (let i = 0; i < maneCount; i++) {
        const t = 0.06 + 0.9 * (i / (maneCount - 1));
        const p = neckProfile.center.getPoint(t);
        const tang = neckProfile.center.getTangent(t).normalize();
        N.crossVectors(tang, R).normalize();
        const rad = neckProfile.radii(t);
        const pos = p.clone().addScaledVector(N, -rad.y * 0.93);
        dir.copy(tang).multiplyScalar(0.62).addScaledVector(N, -0.78).normalize();
        q.setFromUnitVectors(up, dir);
        const s = 0.55 + 0.75 * Math.sin(Math.PI * Math.min(1, i / maneCount * 1.4));
        sc.set(s, s * (0.8 + 0.5 * Math.sin(Math.PI * t)), s);
        m.compose(pos, q, sc);
        mane.setMatrixAt(i, m);
      }
      mane.instanceMatrix.needsUpdate = true;
    }
    neckBase.add(mane);

    /* ---------- head ---------- */
    const head = new THREE.Group();
    headAnchor.add(head);

    const headProfile = makeProfile([
      [0.00, 0.00, 0.135, 0.150],
      [0.13, -0.02, 0.126, 0.140],
      [0.26, -0.065, 0.112, 0.122],
      [0.39, -0.115, 0.099, 0.108],
      [0.52, -0.16, 0.089, 0.097],
      [0.63, -0.20, 0.080, 0.088],
      [0.72, -0.235, 0.066, 0.074],
      [0.79, -0.255, 0.040, 0.046],
    ]);
    const headGeo = Geom.loftGeometry({
      center: headProfile.center,
      radii: headProfile.radii,
      sections: 30, radial: 18,
      t0: 0, t1: 0.66,
      capEnd: false,
      shade: (col, t, a) => {
        const under = Math.max(0, -Math.sin(a));
        let v = 0.95 + 0.16 * under;
        // the coat darkens towards the muzzle so the transition is not a hard edge
        const front = Math.min(1, Math.max(0, (t - 0.40) / 0.28));
        v *= 1 - 0.62 * front * front;
        tint(col, v);
      },
    });
    const headMesh = new THREE.Mesh(headGeo, matSkin);
    headMesh.castShadow = true;
    head.add(headMesh);

    // dark muzzle (overlaps the spotted head slightly)
    const muzzleGeo = Geom.loftGeometry({
      center: headProfile.center,
      radii: (t) => { const r = headProfile.radii(t); return { x: r.x * 1.012, y: r.y * 1.012 }; },
      sections: 24, radial: 18,
      t0: 0.63, t1: 1,
      shade: (col) => tint(col, 1.0),
    });
    const muzzle = new THREE.Mesh(muzzleGeo, matMuzzle);
    muzzle.castShadow = true;
    head.add(muzzle);

    // nose / nostril hint
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), matDark);
    nose.scale.set(1, 0.8, 1.1);
    nose.position.set(0.775, -0.252, 0);
    head.add(nose);

    // eyes
    const eyes = [];
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.027, 16, 12), matEye);
      eye.position.set(0.211, 0.006, s * 0.086);
      eye.scale.set(1, 0.95, 0.9);
      eye.castShadow = true;
      head.add(eye);
      eyes.push(eye);

      // catch light
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.0075, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xfff6e2 }));
      spark.position.set(0.222, 0.020, s * 0.104);
      head.add(spark);

      // brow ridge + eyelid
      const brow = new THREE.Mesh(Geom.blobGeometry(0.030, 2, 0.06, 61 + s), matSkin);
      brow.scale.set(1.15, 0.50, 0.62);
      brow.position.set(0.201, 0.042, s * 0.082);
      brow.rotation.z = 0.14;
      head.add(brow);

      // lashes
      const lashGeo = new THREE.ConeGeometry(0.0045, 0.024, 4);
      lashGeo.translate(0, 0.012, 0);
      for (let i = 0; i < 5; i++) {
        const a = -0.35 + (i / 4) * 2.0;
        const lash = new THREE.Mesh(lashGeo, matDark);
        lash.position.set(0.213 + Math.cos(a) * 0.026, 0.010 + Math.sin(a) * 0.026, s * 0.101);
        lash.rotation.z = -a * 0.8;
        lash.rotation.x = s > 0 ? -1.35 : 1.35;
        head.add(lash);
      }
    }

    // ossicones (horn-like) with dark tufts
    const hornGeo = Geom.loftGeometry({
      center: new THREE.CatmullRomCurve3([
        new V3(0, 0, 0), new V3(-0.012, 0.11, 0),
        new V3(-0.035, 0.22, 0.004), new V3(-0.075, 0.31, 0.008),
      ], false, 'catmullrom', 0.5),
      radii: (t) => ({ x: 0.046 - 0.016 * t, y: 0.048 - 0.017 * t }),
      sections: 10, radial: 10,
    });
    for (const s of [1, -1]) {
      const horn = new THREE.Mesh(hornGeo, matHorn);
      horn.position.set(0.055, 0.135, s * 0.072);
      horn.rotation.x = s * 0.16;
      horn.castShadow = true;
      head.add(horn);
      const tuft = new THREE.Mesh(Geom.blobGeometry(0.055, 1, 0.22, 31 + s, new V3(1, 1.25, 1)), matDark);
      tuft.position.set(-0.022, 0.455, s * 0.082);
      head.add(tuft);
    }

    // ears
    const ears = [];
    for (const s of [1, -1]) {
      const ear = new THREE.Group();
      ear.position.set(0.045, 0.052, s * 0.108);
      const outer = new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 10), matEar);
      outer.scale.set(1.28, 0.30, 0.66);
      outer.castShadow = true;
      ear.add(outer);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.050, 12, 8), matEarIn);
      inner.scale.set(1.2, 0.24, 0.50);
      inner.position.set(0.006, -0.007, s * 0.009);
      ear.add(inner);
      ear.rotation.y = s * (0.70 + rnd() * 0.1);
      ear.rotation.z = 0.28 + rnd() * 0.12;
      ear.rotation.x = -0.16;
      head.add(ear);
      ears.push(ear);
    }

    /* ---------- tail ---------- */
    const tailBase = new THREE.Group();
    tailBase.position.set(-1.30, 2.14, 0);
    body.add(tailBase);
    const tailProfile = makeProfile([
      [0.00, 0.00, 0.060, 0.065],
      [-0.03, -0.28, 0.045, 0.050],
      [-0.01, -0.60, 0.032, 0.036],
      [0.02, -0.86, 0.024, 0.027],
    ]);
    const tailGeo = Geom.loftGeometry({
      center: tailProfile.center,
      radii: tailProfile.radii,
      sections: 20, radial: 10,
      shade: (col, t) => tint(col, 0.92 + 0.2 * t),
    });
    const tail = new THREE.Mesh(tailGeo, matSkin);
    tail.castShadow = true;
    tailBase.add(tail);
    const tailTuft = new THREE.Mesh(Geom.blobGeometry(0.075, 1, 0.3, 77, new V3(0.75, 2.4, 0.75)), matDark);
    tailTuft.position.set(0.03, -0.94, 0);
    tailBase.add(tailTuft);
    // a few loose hairs at the tip of the tuft
    for (let i = 0; i < 5; i++) {
      const hair = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.16, 4), matDark);
      hair.position.set(0.03 + (rnd() - 0.5) * 0.05, -1.02 - rnd() * 0.05, (rnd() - 0.5) * 0.05);
      hair.rotation.z = (rnd() - 0.5) * 0.5;
      hair.rotation.x = (rnd() - 0.5) * 0.5;
      tailBase.add(hair);
    }

    /* ---------- legs ---------- */
    const LEGS = [
      { id: 'LF', front: true, side: 1, offset: 0.00 },
      { id: 'RF', front: true, side: -1, offset: 0.50 },
      { id: 'LH', front: false, side: 1, offset: 0.75 },
      { id: 'RH', front: false, side: -1, offset: 0.25 },
    ];

    const legs = [];
    for (const def of LEGS) {
      const front = def.front;
      let legStifle = null;
      const hip = front
        ? new V3(0.66, 2.12, def.side * 0.40)
        : new V3(-1.02, 2.06, def.side * 0.36);
      const L1 = front ? 1.06 : 1.07;     // hip -> carpus / hock
      const L2 = front ? 0.94 : 0.91;     // carpus / hock -> fetlock
      const restX = hip.x;
      const z = hip.z;

      const group = new THREE.Group();
      root.add(group);

      // upper segment
      const legShade = (col, t) => tint(col, 0.80 + 0.22 * t);
      const upperGeo = front
        ? Geom.boneGeometry(L1, 0.185, 0.086, { bow: -0.035, bulge: 0.16, flat: 0.92, sections: 14, radial: 12, shade: legShade })
        : Geom.boneGeometry(L1, 0.265, 0.076, { bow: 0.075, bulge: 0.18, flat: 0.95, sections: 14, radial: 12, shade: legShade });
      const upper = new THREE.Mesh(upperGeo, front ? matLegFrontUp : matLegHindUp);
      upper.castShadow = true;
      group.add(upper);

      // stifle mass for the hind legs
      if (!front) {
        const stifle = new THREE.Mesh(Geom.blobGeometry(0.17, 2, 0.06, 44, new V3(1, 1.25, 0.9)), matLegHindUp);
        group.add(stifle);
        legStifle = stifle;
      }

      // lower segment (cannon bone)
      const lowerGeo = Geom.boneGeometry(L2, front ? 0.082 : 0.072, 0.055, {
        bow: 0.012, bulge: 0.06, flat: 0.88, sections: 10, radial: 10, shade: legShade,
      });
      const lower = new THREE.Mesh(lowerGeo, front ? matLegFrontLow : matLegHindLow);
      lower.castShadow = true;
      group.add(lower);

      // joint knobs
      const knee = new THREE.Mesh(new THREE.SphereGeometry(front ? 0.078 : 0.070, 14, 10), matJoint);
      knee.scale.set(0.95, 1.05, 0.85);
      knee.castShadow = true;
      group.add(knee);
      const fet = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 9), matJoint);
      fet.castShadow = true;
      group.add(fet);

      // hoof — kept flat on the ground while planted
      const hoof = new THREE.Group();
      const hoofGeo = new THREE.SphereGeometry(0.062, 14, 10);
      hoofGeo.scale(1.0, 1.25, 0.86);
      const hoofMesh = new THREE.Mesh(hoofGeo, matHoof);
      hoofMesh.position.y = -0.092;
      hoofMesh.castShadow = true;
      hoof.add(hoofMesh);
      const cleft = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.10, 0.085), matHoof);
      cleft.position.set(0.044, -0.082, 0);
      hoof.add(cleft);
      group.add(hoof);

      legs.push({
        def, group, upper, lower, knee, fet, hoof, hip, L1, L2, restX, z,
        stifle: legStifle,
        prevPhase: 1, strike: 0,
      });
    }

    /* ---------- gait state ---------- */
    const state = {
      time: 0,          // accumulated walk time (seconds)
      cycle: 1.06,      // seconds per stride
      duty: 0.62,       // stance fraction
      speed: 1.05,      // m/s
      lift: 0.26,
    };

    const tmpA = new V3(), tmpB = new V3(), tmpC = new V3();
    const qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
    const IDENT = new THREE.Quaternion();
    const down = new V3(0, -1, 0);
    const UP = new V3(0, 1, 0);
    const bendBack = new V3(-1, 0, 0);

    function solveIK(A, T, L1, L2, bendDir, out) {
      const axis = tmpA.subVectors(T, A);
      let d = axis.length();
      const maxLen = (L1 + L2) * 0.999;
      if (d > maxLen) { d = maxLen; }
      if (d < 1e-4) d = 1e-4;
      axis.normalize();
      const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      const perp = tmpB.copy(bendDir).addScaledVector(axis, -bendDir.dot(axis));
      if (perp.lengthSq() < 1e-8) perp.set(0, 0, 1);
      perp.normalize();
      return out.copy(A).addScaledVector(axis, a).addScaledVector(perp, h);
    }

    const hoofWorld = new V3();

    function update(dt, walkTime) {
      state.time = walkTime;
      const t = state.time;
      const cyc = state.cycle;
      const v = state.speed;
      const S = v * cyc * state.duty;     // how far a planted hoof travels on the ground
      const half = S * 0.5;
      const phase = (t / cyc) % 1;

      /* --- body motion --- */
      const bob = 0.032 * Math.sin(TAU * 2 * phase + 0.6) - 0.012;
      body.position.y = bob;
      body.rotation.z = 0.013 * Math.sin(TAU * phase + 0.9);        // pitch
      body.rotation.x = 0.010 * Math.sin(TAU * phase + 2.1);        // roll
      body.updateMatrix();

      /* --- legs --- */
      for (const leg of legs) {
        const p = ((t / cyc) + leg.def.offset) % 1;
        let fx, fy, swingW;
        if (p < state.duty) {
          // stance: the hoof is planted and slides backwards relative to the body
          const u = p / state.duty;
          fx = leg.restX + half - S * u;
          fy = 0.17;
          swingW = 0;
        } else {
          // swing: the hoof lifts and swings forward
          const u = (p - state.duty) / (1 - state.duty);
          const e = u * u * (3 - 2 * u);
          fx = leg.restX - half + S * e;
          fy = 0.17 + state.lift * Math.sin(Math.PI * Math.min(1, u * 1.02)) * (0.55 + 0.45 * e);
          swingW = Math.sin(Math.PI * Math.min(1, u * 1.02));
        }

        // hip in root space (the body bobs, the hip follows it)
        const A = tmpC.copy(leg.hip).applyMatrix4(body.matrix);
        const T = new V3(fx, fy, leg.z);
        const J = solveIK(A, T, leg.L1, leg.L2, bendBack, new V3());

        leg.upper.position.copy(A);
        qA.setFromUnitVectors(down, tmpB.subVectors(J, A).normalize());
        leg.upper.quaternion.copy(qA);

        leg.lower.position.copy(J);
        qB.setFromUnitVectors(down, tmpB.subVectors(T, J).normalize());
        leg.lower.quaternion.copy(qB);

        // where the lower bone actually ends (the target may be marginally out of reach)
        const F = tmpA.copy(J).addScaledVector(tmpB.subVectors(T, J).normalize(), leg.L2);

        leg.knee.position.copy(J);
        leg.fet.position.copy(F);
        if (leg.stifle) {
          leg.stifle.position.lerpVectors(A, J, 0.42).addScaledVector(tmpB.set(1, 0, 0), 0.05);
          leg.stifle.quaternion.copy(qA);
        }

        // the hoof sits on the gait target and stays flat while planted
        leg.hoof.position.copy(T);
        qA.setFromUnitVectors(down, tmpB.subVectors(T, J).normalize());
        leg.hoof.quaternion.slerpQuaternions(IDENT, qA, swingW);

        // foot-strike detection for dust
        if (leg.prevPhase > 0.9 && p < 0.1) {
          leg.strike = 1;
          hoofWorld.copy(T);
          if (opts.onFootStrike) opts.onFootStrike(leg.def.id, hoofWorld);
        }
        leg.prevPhase = p;
      }

      /* --- neck & head --- */
      neckBase.rotation.z = 0.042 * Math.sin(TAU * phase + 1.25) - 0.014;
      neckBase.rotation.y = 0.032 * Math.sin(Math.PI * phase);
      head.rotation.z = -0.055 * Math.sin(TAU * phase + 0.35);
      head.rotation.y = 0.024 * Math.sin(TAU * phase + 2.0);

      /* --- tail & ears --- */
      tailBase.rotation.y = 0.26 * Math.sin(TAU * t * 0.38) + 0.05 * Math.sin(TAU * t * 0.9);
      tailBase.rotation.z = 0.09 * Math.sin(TAU * t * 0.27 + 1.0);
      for (let i = 0; i < ears.length; i++) {
        const e = ears[i];
        e.rotation.x = -0.15 + 0.10 * Math.sin(TAU * t * (0.7 + i * 0.13) + i);
      }
    }

    /* ---------- API ---------- */
    const api = {
      root, body, head, neckBase, tailBase, torso, legs, state, materials: {
        matSkin, matLeg: matLegFrontUp, matDark, matHoof, matEye, matHorn,
      },
      update,
      setSpeed: (s) => { state.speed = s; },
      setCycle: (c) => { state.cycle = c; },
      headWorldPosition: (out) => head.getWorldPosition(out),
      bodyWorldPosition: (out) => torso.getWorldPosition(out),
    };
    return api;
  }

  global.Giraffe = { build: buildGiraffe };
})(window);
