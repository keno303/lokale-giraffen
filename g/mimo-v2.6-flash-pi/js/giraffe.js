'use strict';
/*
 * Anatomy of the giraffe: everything is authored in *rest body space*
 * (origin between the hips, +X forward, +Y up) so the coat pattern (aSkin)
 * is continuous from torso over neck to head and down the legs.
 *
 * Returns a rig of plain Object3Ds that js/anim.js poses every frame.
 */
const GIRAFFE = (() => {

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const R = (d) => d * Math.PI / 180;

  const D = {
    // ---- torso centreline stations (x, y, halfWidth, halfHeight) ----
    torso: [
      { x: 1.30, y: 2.72, rx: 0.13, ry: 0.24 },
      { x: 1.22, y: 2.74, rx: 0.23, ry: 0.43 },
      { x: 1.06, y: 2.74, rx: 0.27, ry: 0.53 },
      { x: 0.85, y: 2.72, rx: 0.29, ry: 0.58 },
      { x: 0.55, y: 2.70, rx: 0.30, ry: 0.60 },
      { x: 0.20, y: 2.66, rx: 0.295, ry: 0.60 },
      { x: -0.20, y: 2.62, rx: 0.28, ry: 0.58 },
      { x: -0.60, y: 2.58, rx: 0.30, ry: 0.55 },
      { x: -0.95, y: 2.56, rx: 0.33, ry: 0.52 },
      { x: -1.18, y: 2.55, rx: 0.30, ry: 0.46 },
      { x: -1.32, y: 2.54, rx: 0.18, ry: 0.28 },
      { x: -1.39, y: 2.53, rx: 0.07, ry: 0.11 }
    ],
    shoulder: V(0.62, 2.55, 0.225),
    hip: V(-0.85, 2.62, 0.27),
    fore: {
      L: [0.64, 0.80, 1.02], beta: [0.638, -0.986, 0.290], foot: 0.26,
      pole: V(-1, 0, 0),
      // radii: humerus, radius, cannon
      r: [[0.145, 0.105], [0.10, 0.078], [0.070, 0.056]],
      elbow: 0.098, knee: [0.080, 0.105, 0.080], fet: 0.070
    },
    hind: {
      L: [0.68, 0.84, 0.99], beta: [-0.525, 0.963, -0.525], foot: 0.26,
      pole: V(-1, 0, 0),
      r: [[0.165, 0.112], [0.110, 0.082], [0.072, 0.056]],
      elbow: 0.115, knee: [0.088, 0.112, 0.085], fet: 0.072
    },
    neck: {
      base: V(1.00, 3.05, 0), pitch: R(54), len: 2.10, segs: 12,
      rx0: 0.255, ry0: 0.295, rx1: 0.115, ry1: 0.13
    },
    headRestPitch: R(-17),
    tail: { root: V(-1.27, 2.70, 0), dir: V(-0.22, -0.975, 0).normalize(), len: 1.08, segs: 8 }
  };

  /* ------------------------------------------------------------------ */
  function build(opts) {
    opts = opts || {};
    const coat = COAT.make({ scale: 0.245 });
    const coatHead = COAT.make({ scale: 0.245 });          // region handled in shader
    const maneMat = COAT.make({ darken: 0.52, roughness: 0.95 });
    const eyeMat = new THREE.MeshPhysicalMaterial({
      color: 0x5e3a17, roughness: 0.11, metalness: 0.0,
      clearcoat: 1.0, clearcoatRoughness: 0.06
    });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x0a0705, roughness: 0.35 });
    const hoofMat = new THREE.MeshStandardMaterial({ color: 0x50493c, roughness: 0.5, metalness: 0.02 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1d150f, roughness: 0.7 });
    const lashMat = new THREE.MeshStandardMaterial({ color: 0x2b1f16, roughness: 0.85 });
    const ossMat = new THREE.MeshStandardMaterial({ color: 0x8d7a62, roughness: 0.92 });
    const tuftMat = new THREE.MeshStandardMaterial({ color: 0x241d17, roughness: 1.0 });
    const innerEarMat = new THREE.MeshStandardMaterial({ color: 0xd9c9ab, roughness: 0.95, side: THREE.DoubleSide });
    const earMat = new THREE.MeshStandardMaterial({ color: 0xb5966c, roughness: 0.95 });
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x3a2b22, roughness: 0.6 });

    const body = new THREE.Object3D();
    body.name = 'giraffeBody';
    const add = (m) => { body.add(m); return m; };
    const shadows = (m) => { m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return m; };

    /* ---------------- torso ---------------- */
    const torsoSt = D.torso.map(s => ({ p: V(s.x, s.y, 0), rx: s.rx, ry: s.ry, se: 2.35 }));
    const torsoGeom = GEO.tube(torsoSt, 40);
    COAT.applySkin(torsoGeom, null, 0);
    const torso = add(new THREE.Mesh(torsoGeom, coat));
    torso.name = 'torso';

    /* ---------------- legs ---------------- */
    const legs = [];
    const legDefs = [
      { name: 'FL', fore: true, sign: 1 },
      { name: 'FR', fore: true, sign: -1 },
      { name: 'HL', fore: false, sign: 1 },
      { name: 'HR', fore: false, sign: -1 }
    ];

    for (const def of legDefs) {
      const cfg = def.fore ? D.fore : D.hind;
      const pivot = (def.fore ? D.shoulder : D.hip).clone();
      pivot.z *= def.sign;
      const pole = cfg.pole.clone();
      // rest chain: straight down from the pivot (identity orientation)
      const rest = [pivot.clone()];
      let acc = pivot.y;
      for (let i = 0; i < 3; i++) { acc -= cfg.L[i]; rest.push(V(pivot.x, acc, pivot.z)); }

      const parts = { bones: [], joints: [], pivot };
      for (let i = 0; i < 3; i++) {
        const geom = GEO.bone(cfg.L[i], cfg.r[i][0], cfg.r[i][1], 16, {
          capTop: i === 0, capBottom: false, rings: 7,
          bulge: i === 0 ? 0.035 : (i === 1 ? 0.018 : 0.012)
        });
        COAT.applySkinX(geom, null, rest[i], 0);
        const m = add(new THREE.Mesh(geom, coat));
        m.name = def.name + '_bone' + i;
        parts.bones.push(m);
      }
      // joint knobs
      const knob = (geomFn, idx, name) => {
        const g = geomFn();
        COAT.applySkinX(g, null, rest[idx], 0);
        const m = add(new THREE.Mesh(g, coat));
        m.name = def.name + '_' + name;
        parts.joints.push(m);
        return m;
      };
      knob(() => GEO.ellipsoid(cfg.elbow, cfg.elbow * 1.15, cfg.elbow * 0.95, 16, 12), 1, 'elbow');
      knob(() => GEO.ellipsoid(cfg.knee[0], cfg.knee[1], cfg.knee[2], 16, 12), 2, 'knee');
      knob(() => GEO.ellipsoid(cfg.fet, cfg.fet * 1.05, cfg.fet, 14, 10), 3, 'fetlock');

      /* foot: pastern + two hooves, pivot at the fetlock */
      const foot = new THREE.Object3D();
      foot.name = def.name + '_foot';
      add(foot);
      const pastern = GEO.bone(0.13, 0.066, 0.056, 14, { capTop: false, capBottom: false, rings: 3 });
      COAT.applySkinX(pastern, null, rest[3], 0);
      foot.add(new THREE.Mesh(pastern, coat));
      const ball = GEO.ellipsoid(0.082, 0.068, 0.078, 14, 10);
      COAT.applySkinX(ball, null, rest[3], 0);
      foot.add(new THREE.Mesh(ball, coat));
      for (let t = 0; t < 2; t++) {
        const sgn = t === 0 ? 1 : -1;
        // total foot length must equal cfg.foot (0.26) so the hoof sits on y=0
        const rings = [
          { y: 0.0, r: 0.062, sx: 1.3, sz: 1.0 },
          { y: -0.045, r: 0.066, sx: 1.35, sz: 1.0 },
          { y: -0.09, r: 0.060, sx: 1.3, sz: 0.95 },
          { y: -0.115, r: 0.046, sx: 1.22, sz: 0.9 },
          { y: -0.13, r: 0.020, sx: 1.05, sz: 0.85 }
        ];
        const hg = GEO.lathe(rings, 14);
        const toe = new THREE.Mesh(hg, hoofMat);
        toe.position.set(0.016, -0.13, sgn * 0.036);
        toe.rotation.y = sgn * R(7);
        foot.add(toe);
      }
      shadows(foot);

      legs.push({
        name: def.name, fore: def.fore, sign: def.sign,
        pivot, L: cfg.L, beta: cfg.beta, footLen: cfg.foot, pole,
        bones: parts.bones, joints: parts.joints, foot,
        prevU: 0, stance: false, plant: new THREE.Vector3(),
        plantQuat: new THREE.Quaternion(),
        swingQuat: new THREE.Quaternion(),
        rest, phase: 0
      });
    }

    /* ---------------- neck ---------------- */
    const nk = D.neck;
    const dir = V(Math.cos(nk.pitch), Math.sin(nk.pitch), 0);
    const restPts = [];
    for (let i = 0; i <= nk.segs; i++) restPts.push(nk.base.clone().addScaledVector(dir, (nk.len * i) / nk.segs));
    const neckProfile = t => ({
      rx: U.lerp(nk.rx0, nk.rx1, Math.pow(t, 0.85)),
      ry: U.lerp(nk.ry0, nk.ry1, Math.pow(t, 0.85)),
      se: 2.1
    });
    const neck = new ChainMesh(restPts, neckProfile, 24, 0);
    neck.setMaterial(coat);
    add(neck.mesh);
    neck.mesh.name = 'neck';

    const restFr = GEO.frames(restPts);
    const mane = new ManeMesh(restPts, restFr, neckProfile, R(26),
      t => U.lerp(0.135, 0.08, t), 0);
    mane.setMaterial(maneMat);
    add(mane.mesh);
    mane.mesh.name = 'mane';

    /* ---------------- head (local frame: origin = poll, +X = muzzle) ---------------- */
    const head = new THREE.Object3D();
    head.name = 'head';
    add(head);

    const headSt = [
      { x: 0.00, y: 0.000, rx: 0.115, ry: 0.130 },
      { x: 0.07, y: 0.045, rx: 0.148, ry: 0.172 },
      { x: 0.16, y: 0.055, rx: 0.166, ry: 0.184 },
      { x: 0.28, y: 0.020, rx: 0.156, ry: 0.176 },
      { x: 0.40, y: -0.020, rx: 0.126, ry: 0.146 },
      { x: 0.52, y: -0.052, rx: 0.101, ry: 0.116 },
      { x: 0.60, y: -0.068, rx: 0.092, ry: 0.100 },
      { x: 0.645, y: -0.075, rx: 0.055, ry: 0.060 }
    ].map(s => ({ p: V(s.x, s.y, 0), rx: s.rx, ry: s.ry, se: 2.25 }));

    const restHeadQuat = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), D.headRestPitch);
    const headRestPos = restPts[restPts.length - 1].clone();

    const skullGeom = GEO.tube(headSt, 32);
    COAT.applySkinX(skullGeom, restHeadQuat, headRestPos, 1);
    head.add(new THREE.Mesh(skullGeom, coatHead));

    const headLocal = (geom, mat) => {
      const m = new THREE.Mesh(geom, mat);
      head.add(m);
      return m;
    };
    const headSkin = (geom) => COAT.applySkinX(geom, restHeadQuat, headRestPos, 1);

    // brow ridge
    const brow = GEO.ellipsoid(0.075, 0.045, 0.16, 16, 10);
    brow.translate(0.155, 0.10, 0);
    headSkin(brow);
    headLocal(brow, coatHead);

    // eyes + lash rings
    const eyes = [];
    for (const s of [1, -1]) {
      const eg = GEO.ellipsoid(0.062, 0.058, 0.055, 20, 14);
      const e = headLocal(eg, eyeMat);
      e.position.set(0.172, 0.030, s * 0.155);
      e.rotation.y = s * R(18);
      // horizontal slit pupil, proud of the cornea
      const pg = GEO.ellipsoid(0.024, 0.012, 0.015, 14, 10);
      const pu = new THREE.Mesh(pg, pupilMat);
      pu.position.set(0.004, 0.0, s * 0.048);
      e.add(pu);
      eyes.push(e);
      const lg = new THREE.TorusGeometry(0.062, 0.011, 8, 26);
      const l = headLocal(lg, lashMat);
      l.position.copy(e.position).add(V(0.004, 0.004, s * 0.008));
      l.rotation.y = s * R(90 - 18);
      l.rotation.x = R(6);
      // lashes: tiny fan of thin boxes above the eye
      for (let k = 0; k < 5; k++) {
        const la = R(-32 + k * 16);
        const lash = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.05), lashMat);
        lash.position.set(0.172 + 0.02 * Math.cos(la), 0.076, s * 0.162);
        lash.rotation.x = s * R(28);
        lash.rotation.z = R(10);
        lash.rotation.y = la * 0.3;
        head.add(lash);
      }
    }

    // ossicones: shaft grows *up* from the skull, tuft on top
    const oss = [];
    for (const s of [1, -1]) {
      const grp = new THREE.Object3D();
      grp.position.set(0.05, 0.180, s * 0.050);
      grp.rotation.z = R(7);
      grp.rotation.x = s * R(14);
      const g = GEO.bone(0.16, 0.031, 0.026, 12, { capTop: false, capBottom: false, rings: 4 });
      g.rotateZ(Math.PI);                 // point upwards
      const shaft = new THREE.Mesh(g, ossMat);
      grp.add(shaft);
      const tg = GEO.ellipsoid(0.036, 0.030, 0.036, 12, 9);
      const tuft = new THREE.Mesh(tg, tuftMat);
      tuft.position.y = 0.168;
      grp.add(tuft);
      head.add(grp);
      oss.push(grp);
    }

    // ears: flat leaves swept back and out
    const ears = [];
    for (const s of [1, -1]) {
      // leaf-shaped pinna (pointed tip, widest in the middle), flattened
      const earRings = [
        { y: 0.00, r: 0.024, sx: 0.34, sz: 0.72 },
        { y: 0.05, r: 0.048, sx: 0.34, sz: 0.92 },
        { y: 0.11, r: 0.064, sx: 0.34, sz: 1.00 },
        { y: 0.17, r: 0.062, sx: 0.32, sz: 0.96 },
        { y: 0.225, r: 0.046, sx: 0.30, sz: 0.78 },
        { y: 0.265, r: 0.022, sx: 0.28, sz: 0.46 },
        { y: 0.285, r: 0.004, sx: 0.26, sz: 0.20 }
      ];
      const cg = GEO.lathe(earRings, 16);
      const inner = new THREE.Mesh(cg, innerEarMat);
      const outer = new THREE.Mesh(cg.clone().scale(1.10, 1.03, 1.06), earMat);
      const grp = new THREE.Object3D();
      const axis = V(-0.66, 0.30, s * 0.69).normalize();
      const thin = new THREE.Vector3().crossVectors(axis, V(0, 1, 0)).normalize();
      const third = new THREE.Vector3().crossVectors(thin, axis).normalize();
      const m = new THREE.Matrix4().makeBasis(thin, axis, third);
      grp.quaternion.setFromRotationMatrix(m);
      grp.position.set(0.035, 0.105, s * 0.145);
      grp.add(outer);
      inner.position.set(-s * 0.016, 0.03, 0);   // opening faces forward/outward
      inner.scale.set(1, 0.86, 0.86);
      grp.add(inner);
      head.add(grp);
      ears.push(grp);
    }

    // nostrils
    const nostrils = [];
    for (const s of [1, -1]) {
      const g = GEO.ellipsoid(0.034, 0.022, 0.018, 12, 8);
      const n = headLocal(g, darkMat);
      n.position.set(0.575, -0.038, s * 0.052);
      n.rotation.z = R(-26);
      n.rotation.y = s * R(34);
      nostrils.push(n);
    }

    // mouth line (both sides) + chin crease
    for (const s of [1, -1]) {
      const curve = new THREE.CatmullRomCurve3([
        V(0.63, -0.095, s * 0.030),
        V(0.545, -0.108, s * 0.062),
        V(0.46, -0.105, s * 0.083),
        V(0.39, -0.088, s * 0.098)
      ]);
      const g = new THREE.TubeGeometry(curve, 16, 0.009, 6, false);
      headLocal(g, mouthMat);
    }
    // upper lip / muzzle pad
    const lip = GEO.ellipsoid(0.055, 0.03, 0.085, 14, 10);
    lip.translate(0.615, -0.085, 0);
    headSkin(lip);
    headLocal(lip, mouthMat);

    // forelock tuft between the ossicones
    for (let k = 0; k < 5; k++) {
      const g = new THREE.ConeGeometry(0.016, 0.07, 6);
      const m = headLocal(g, tuftMat);
      m.position.set(0.075 + (k - 2) * 0.018, 0.175, (k - 2) * 0.012);
      m.rotation.z = R(-8 + k * 4);
      m.rotation.x = R(-10);
    }

    shadows(head);
    shadows(torso);
    shadows(neck.mesh);
    shadows(mane.mesh);
    for (const l of legs) { shadows(l.bones[0]); shadows(l.bones[1]); shadows(l.bones[2]); l.joints.forEach(shadows); }

    /* ---------------- tail ---------------- */
    const tl = D.tail;
    const tRest = [];
    for (let i = 0; i <= tl.segs; i++) {
      const t = i / tl.segs;
      tRest.push(tl.root.clone().addScaledVector(tl.dir, tl.len * t)
        .add(V(0, -0.10 * t * t, 0)));
    }
    const tailProf = t => ({ rx: U.lerp(0.075, 0.032, t), ry: U.lerp(0.075, 0.032, t), se: 2 });
    const tail = new ChainMesh(tRest, tailProf, 12, 0);
    tail.setMaterial(coat);
    add(tail.mesh);
    tail.mesh.name = 'tail';
    const tuft = new THREE.Object3D();
    add(tuft);
    const tfg = new THREE.ConeGeometry(0.055, 0.36, 10, 3);
    tfg.translate(0, -0.18, 0);
    const tft = new THREE.Mesh(tfg, tuftMat);
    tft.castShadow = true;
    tuft.add(tft);
    const tfg2 = new THREE.ConeGeometry(0.03, 0.30, 8, 2);
    tfg2.translate(0, -0.34, 0);
    const tft2 = new THREE.Mesh(tfg2, tuftMat);
    tuft.add(tft2);

    return {
      body, D, legs,
      neck: { mesh: neck, mane, pts: restPts, profile: neckProfile, dir, restPts },
      head: { obj: head, restQuat: restHeadQuat, restPos: headRestPos, ears, nostrils, eyes },
      tail: { mesh: tail, pts: tRest, tuft, root: tl.root },
      materials: { coat, coatHead, maneMat }
    };
  }

  return { build, D };
})();
