/* ------------------------------------------------------------------
 * giraffe.js — procedural giraffe: anatomy, materials and a
 * foot-planted walking gait (analytic IK, no baked animation).
 *
 * Coordinate conventions
 *   body frame  : origin at world height BODY_Y, +x forward, +y up, +z left
 *   leg geometry: limb bones span local y = 0 .. +len (origin on the joint)
 * ------------------------------------------------------------------ */
var Giraffe = (function () {
  'use strict';

  const V = THREE.Vector3;
  const UP = new V(0, 1, 0);
  const FWD = new V(1, 0, 0);
  const LAT = new V(0, 0, 1);

  const BODY_Y = 2.40;                  // world height of the body-frame origin
  const GROUND = -BODY_Y;               // ground plane in body-local space
  const SOLE_CLEAR = 0.008;             // keeps hooves out of the floor plane

  /* ---------------- anatomy constants (metres) --------------------- */
  const LEG = {
    front: { L1: 0.56, L2: 0.82, Lp: 1.08, Lh: 0.11 },
    hind: { L1: 0.56, L2: 0.80, Lp: 1.08, Lh: 0.11 }
  };
  const ROOT = {
    LF: new V(0.92, 0.00, 0.29), RF: new V(0.92, 0.00, -0.29),
    LH: new V(-0.95, -0.04, 0.31), RH: new V(-0.95, -0.04, -0.31)
  };
  const REST = {
    LF: new V(0.86, GROUND, 0.315), RF: new V(0.86, GROUND, -0.315),
    LH: new V(-1.00, GROUND, 0.335), RH: new V(-1.00, GROUND, -0.335)
  };
  // lateral-sequence walk: LH, LF, RH, RF
  const WALK_PHASE = { LH: 0.0, LF: 0.25, RH: 0.5, RF: 0.75 };
  // pacing (giraffes switch to pacing as they speed up)
  const PACE_PHASE = { LH: 0.0, RF: 0.04, LF: 0.5, RH: 0.54 };

  const clamp = (x, a, b) => x < a ? a : (x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const easeIO = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function wrapPi(x) { while (x > Math.PI) x -= Math.PI * 2; while (x < -Math.PI) x += Math.PI * 2; return x; }

  /* ---------------- transform helpers ------------------------------ */
  const _s1 = new V(), _s2 = new V(), _s3 = new V();
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();

  /** Set an object's basis: local +x along xDir, local +y along yDir. */
  function setBasis(obj, xDir, yDir) {
    const x = _s1.copy(xDir).normalize();
    const y = _s2.copy(yDir);
    y.addScaledVector(x, -y.dot(x));
    if (y.lengthSq() < 1e-10) { y.set(0, 1, 0).addScaledVector(x, -x.y); }
    y.normalize();
    const z = _s3.crossVectors(x, y);
    _m.makeBasis(x, y, z);
    _q.setFromRotationMatrix(_m);
    obj.quaternion.copy(_q);
  }

  /* ---------------- materials -------------------------------------- */
  function makeMaterials(palKey) {
    const pal = Textures.PALETTES[palKey] || Textures.PALETTES.masai;
    const coat = Textures.giraffeCoat(palKey, palKey === 'reticulated' ? 'net' : 'blob');
    coat.repeat.set(2.0, 1.0);
    const nrm = Textures.coatNormal();
    const legTex = Textures.legSkin(pal);
    legTex.repeat.set(1.6, 3.0);
    const hoofTex = Textures.hoofTexture(pal);

    return {
      pal: pal,
      coat: new THREE.MeshStandardMaterial({
        map: coat, normalMap: nrm, normalScale: new THREE.Vector2(0.5, 0.5),
        roughness: 0.94, metalness: 0.0, vertexColors: true
      }),
      leg: new THREE.MeshStandardMaterial({
        map: legTex, normalMap: nrm, normalScale: new THREE.Vector2(0.35, 0.35),
        roughness: 0.9, metalness: 0.0, vertexColors: true
      }),
      hoof: new THREE.MeshStandardMaterial({ map: hoofTex, roughness: 0.32, metalness: 0.08 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x2b2119, roughness: 0.72 }),
      mane: new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.mane), roughness: 0.95 }),
      nose: new THREE.MeshStandardMaterial({ color: 0x1d1714, roughness: 0.45 }),
      eye: new THREE.MeshPhysicalMaterial({
        color: 0x3b2415, roughness: 0.14, metalness: 0.0,
        clearcoat: 1.0, clearcoatRoughness: 0.06
      }),
      lash: new THREE.MeshStandardMaterial({ color: 0x140d08, roughness: 0.6 })
    };
  }

  /** vertex-colour tint of one end of a geometry (belly cream, pale legs) */
  function tint(geom, from, amount, cream, dir) {
    geom.computeBoundingBox();
    const bb = geom.boundingBox, pos = geom.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color(cream), b = new THREE.Color(0xffffff), cc = new THREE.Color();
    const span = (bb.max.y - bb.min.y) || 1;
    for (let i = 0; i < pos.count; i++) {
      let t = (pos.getY(i) - bb.min.y) / span;          // 0 bottom .. 1 top
      if (dir > 0) t = 1 - t;                            // tint the top instead
      const k = smooth(clamp((t - from) / Math.max(1e-6, 1 - from), 0, 1)) * amount;
      cc.copy(b).lerp(c, k);
      col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geom;
  }

  /* ---------------- torso ------------------------------------------ */
  function buildTorso(M) {
    const path = [];
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const x = lerp(-1.30, 1.24, t);
      const y = 0.16 + 0.06 * t - 0.024 * Math.exp(-Math.pow((t - 0.56) / 0.24, 2));
      path.push(new V(x, y, 0));
    }
    const prof = Geom.superellipse(2.35, 1, 1, 30);
    const g = Geom.sweep(prof, path, {
      scale: (i, N) => {
        const t = i / (N - 1);
        const taper = smooth(clamp(Math.min(t, 1 - t) / 0.10, 0, 1));
        const sx = (0.435 - 0.05 * Math.abs(t - 0.34)) * (0.55 + 0.45 * taper);
        const sy = (0.455 - 0.045 * Math.abs(t - 0.40)) * (0.55 + 0.45 * taper);
        return { sx: sx, sy: sy, dy: -0.012 + 0.03 * Math.sin(Math.PI * t) };
      },
      uvScale: { u: 1, v: 1 }
    });
    tint(g, 0.52, 0.6, M.pal.leg, -1);
    const mesh = new THREE.Mesh(g, M.coat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  /* shoulder / hip muscle masses */
  function buildMasses(M) {
    const out = [];
    const defs = [
      [new V(0.80, -0.06, 0.0), 0.335, 0.30],
      [new V(-0.86, -0.10, 0.0), 0.345, 0.31],
      [new V(-1.16, 0.06, 0.0), 0.30, 0.26]
    ];
    for (const d of defs) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(d[1], 18, 14), M.coat);
      m.position.copy(d[0]);
      m.scale.set(1.25, 0.92, 0.86);
      m.castShadow = true; m.receiveShadow = true;
      out.push(m);
    }
    return out;
  }

  /* ---------------- neck ------------------------------------------- */
  const NECK = { base: new V(1.05, 0.58, 0), seg: [0.66, 0.63, 0.61] };

  function buildNeck(M) {
    const bones = [], joints = [];
    const rad = [[0.300, 0.255], [0.255, 0.205], [0.205, 0.160]];
    const dep = [[0.315, 0.265], [0.265, 0.215], [0.215, 0.170]];
    for (let i = 0; i < 3; i++) {
      const prof = Geom.superellipse(2.3, 1, 1, 22);
      const path = [];
      for (let k = 0; k <= 6; k++) path.push(new V(0, NECK.seg[i] * k / 6, 0));
      const g = Geom.sweep(prof, path, {
        refAxis: FWD,
        scale: (k, N) => {
          const s = smooth(k / (N - 1));
          return { sx: lerp(rad[i][0], rad[i][1], s), sy: lerp(dep[i][0], dep[i][1], s) };
        },
        uvScale: { u: 1.4, v: 1 }
      });
      const m = new THREE.Mesh(g, M.coat);
      m.castShadow = true; m.receiveShadow = true;
      bones.push(m);
      const jm = new THREE.Mesh(new THREE.SphereGeometry(rad[i][1] * 1.02, 14, 10), M.coat);
      jm.castShadow = true;
      joints.push(jm);
    }
    return { bones, joints };
  }

  function buildMane(M, neckBones) {
    for (let i = 0; i < neckBones.length; i++) {
      const L = NECK.seg[i], n = 7;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const r = 0.085 + 0.02 * (1 - t);
        const m = new THREE.Mesh(new THREE.ConeGeometry(r, 0.075 + 0.05 * (1 - t), 5), M.mane);
        m.position.set(0, L * t, -0.035);
        m.rotation.x = -0.55 - 0.25 * (1 - t);
        m.castShadow = true;
        neckBones[i].add(m);
      }
    }
  }

  /* ---------------- head ------------------------------------------- */
  const HEAD = { len: 0.62 };

  function buildHead(M) {
    const grp = new THREE.Group();
    const path = [];
    for (let i = 0; i <= 22; i++) {
      const t = i / 22;
      path.push(new V(HEAD.len * t, Math.sin(t * Math.PI) * 0.012 - 0.030 * t * t, 0));
    }
    const prof = Geom.superellipse(2.5, 1, 1, 24);
    const g = Geom.sweep(prof, path, {
      scale: (i, N) => {
        const t = i / (N - 1);
        let sx, sy;
        if (t < 0.34) { const u = t / 0.34; sx = lerp(0.088, 0.082, u); sy = lerp(0.104, 0.094, u); }
        else {
          const u = (t - 0.34) / 0.66;
          const bulge = 1 + 0.13 * Math.exp(-Math.pow((u - 0.86) / 0.13, 2));
          sx = lerp(0.078, 0.040, smooth(u)) * bulge;
          sy = lerp(0.090, 0.043, smooth(u)) * bulge;
        }
        return { sx: sx, sy: sy, dy: -0.004 };
      },
      uvScale: { u: 2.2, v: 1 }
    });
    tint(g, 0.5, 0.35, M.pal.leg, -1);
    const skull = new THREE.Mesh(g, M.coat);
    skull.castShadow = true; skull.receiveShadow = true;
    grp.add(skull);

    // dark nose / muzzle cap
    const npath = [];
    for (let i = 0; i <= 8; i++) npath.push(new V(lerp(0.40, HEAD.len + 0.004, i / 8), 0, 0));
    const nprof = Geom.superellipse(2.5, 1, 1, 20);
    const ng = Geom.sweep(nprof, npath, {
      scale: (i, N) => {
        const u = i / (N - 1) * 0.62 + 0.34;
        const bulge = 1 + 0.13 * Math.exp(-Math.pow((u - 0.86) / 0.13, 2));
        return {
          sx: lerp(0.078, 0.040, smooth(u)) * bulge * 1.06,
          sy: lerp(0.090, 0.043, smooth(u)) * bulge * 1.06,
          dy: -0.004
        };
      }
    });
    const nose = new THREE.Mesh(ng, M.nose);
    nose.castShadow = true;
    grp.add(nose);

    for (const s of [-1, 1]) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), M.lash);
      n.scale.set(0.5, 1.1, 0.8);
      n.position.set(HEAD.len - 0.014, -0.028, s * 0.021);
      grp.add(n);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.006, 0.05), M.lash);
    mouth.position.set(HEAD.len - 0.085, -0.055, 0);
    grp.add(mouth);

    const eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Group();
      const ball = new THREE.Mesh(Geom.eyeGeometry(0.034), M.eye);
      ball.rotation.y = s * 0.5;
      e.add(ball);
      for (let k = 0; k < 5; k++) {
        const a = -0.55 + k * 0.28;
        const lash = new THREE.Mesh(new THREE.ConeGeometry(0.0035, 0.030, 4), M.lash);
        lash.position.set(Math.sin(a) * 0.030, Math.cos(a) * 0.030 - 0.004, s * 0.026);
        lash.rotation.z = -a * s * 1.1 - 0.2;
        lash.rotation.x = s * 0.4;
        e.add(lash);
      }
      const lid = new THREE.Mesh(
        new THREE.SphereGeometry(0.037, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), M.dark);
      lid.rotation.z = 0.25;
      e.add(lid);
      e.position.set(0.175, 0.052, s * 0.070);
      grp.add(e);
      eyes.push({ grp: e, side: s, ball: ball });
    }

    const ossi = [];
    for (const s of [-1, 1]) {
      const o = new THREE.Group();
      const horn = new THREE.Mesh(Geom.ossicone(0.20, 0.029), M.dark);
      horn.castShadow = true;
      o.add(horn);
      const tuft = new THREE.Mesh(Geom.hairTuft(0.032, 0.085), M.lash);
      tuft.position.set(0.034, 0.180, 0);
      tuft.castShadow = true;
      o.add(tuft);
      o.position.set(0.105, 0.088, s * 0.043);
      o.rotation.set(-0.30, 0, s * 0.30);
      grp.add(o);
      ossi.push(o);
    }

    const ears = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Group();
      const outer = new THREE.Mesh(Geom.earGeometry(0.30, 0.145, 0.014), M.coat);
      outer.castShadow = true;
      e.add(outer);
      const back = new THREE.Mesh(Geom.earGeometry(0.285, 0.132, 0.008), M.dark);
      back.position.z = -s * 0.007;
      e.add(back);
      e.position.set(0.045, 0.082, s * 0.072);
      e.rotation.set(-0.55, s * 0.95, s * 0.20);
      grp.add(e);
      ears.push({ grp: e, side: s, base: e.rotation.clone(), t: Math.random() * 9 });
    }

    const beard = new THREE.Mesh(Geom.hairTuft(0.022, 0.075), M.mane);
    beard.position.set(0.30, -0.072, 0);
    beard.rotation.x = 0.5;
    grp.add(beard);

    return { grp, eyes, ears, ossi };
  }

  /* ---------------- legs ------------------------------------------- */
  function buildLeg(name, M) {
    const front = name[1] === 'F';
    const L = front ? LEG.front : LEG.hind;

    const boneA = new THREE.Group();
    const gA = Geom.limbBone(L.L1, 0.205, 0.145, 18, 0.86);
    tint(gA, 0.45, 0.55, M.pal.leg, 1);
    const mA = new THREE.Mesh(gA, M.coat);
    mA.castShadow = true; mA.receiveShadow = true;
    boneA.add(mA);

    const boneB = new THREE.Group();
    const gB = Geom.limbBone(L.L2, 0.135, 0.098, 18, 0.84);
    tint(gB, 0.35, 0.8, M.pal.leg, 1);
    const mB = new THREE.Mesh(gB, M.leg);
    mB.castShadow = true; mB.receiveShadow = true;
    boneB.add(mB);

    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.150, 16, 12), M.coat);
    knee.castShadow = true;

    const gp = Geom.limbBone(L.Lp, 0.086, 0.050, 16, 0.80);
    tint(gp, 0.25, 0.9, M.pal.leg, 1);
    const pastern = new THREE.Mesh(gp, M.leg);
    pastern.castShadow = true; pastern.receiveShadow = true;

    const fet = new THREE.Mesh(new THREE.SphereGeometry(0.078, 14, 10), M.leg);
    fet.castShadow = true;

    const hoof = new THREE.Mesh(Geom.hoof(0.062, L.Lh), M.hoof);
    hoof.castShadow = true;

    return {
      name, front, L, boneA, boneB, knee, pastern, fet, hoof,
      side: (name[0] === 'L' ? 1 : -1),
      rest: REST[name].clone(), phase: WALK_PHASE[name], lastAlpha: 0.17
    };
  }

  /* ---------------- tail ------------------------------------------- */
  function buildTail(M) {
    const base = new THREE.Group();
    base.position.set(-1.24, 0.30, 0);
    base.rotation.set(0.5, 0, 0);
    const lens = [0.26, 0.24, 0.23, 0.20];
    const rads = [[0.042, 0.032], [0.032, 0.024], [0.024, 0.018], [0.018, 0.013]];
    const segs = [];
    let parent = base;
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const geo = Geom.limbBone(lens[i], rads[i][0], rads[i][1], 12, 0.9);
      const m = new THREE.Mesh(geo, M.coat);
      m.castShadow = true;
      g.add(m);
      parent.add(g);
      parent = g;
      segs.push(g);
    }
    const tuft = new THREE.Mesh(Geom.hairTuft(0.038, 0.16), M.lash);
    tuft.position.y = lens[3];
    tuft.castShadow = true;
    parent.add(tuft);
    return { base, segs };
  }

  /* ---------------- leg IK ----------------------------------------- */
  // scratch owned by solveLeg (setBasis must never touch these)
  const kAxis = new V(), kH = new V(), kV = new V(), kU = new V(), kA = new V();
  const kDir = new V(), kDes = new V(), kPerp = new V();
  const kE1 = new V(), kCaud = new V(), kLat = new V(), kK = new V(), kTmp = new V();
  const NOMINAL_PASTERN = 0.26;      // rad, pastern lean at mid-stance

  /**
   * Place one leg so the hoof sole rests on `target` (body-local).
   * The pastern direction is solved so that the knee keeps an
   * anatomically sensible bend while the foot stays exactly put.
   */
  function solveLeg(leg, target, kneeBias, hoofTilt) {
    const L = leg.L, R = ROOT[leg.name];
    kAxis.set(Math.sin(hoofTilt), Math.cos(hoofTilt), 0);      // sole normal (up, tilted)
    kH.copy(kAxis).multiplyScalar(L.Lh).add(target);            // top of hoof
    kV.subVectors(R, kH);
    const D = kV.length();
    kU.copy(kV).divideScalar(D || 1e-6);                        // unit H -> R

    /* desired ankle distance from the root, clamped to what the chain
       can actually deliver (leg reach AND pastern length) */
    const dWanted = (L.L1 + L.L2) - kneeBias;
    const dLo = Math.max(Math.abs(L.L1 - L.L2) + 0.006, Math.abs(D - L.Lp) + 0.006);
    const dHi = Math.min(L.L1 + L.L2 - 0.006, D + L.Lp - 0.006);
    let d;
    if (dLo <= dHi) {
      d = clamp(dWanted, dLo, dHi);          // normal case
    } else {
      // target just out of reach: keep the leg as straight as it can be
      d = clamp(dWanted, Math.abs(L.L1 - L.L2) + 0.006, L.L1 + L.L2 - 0.006);
      d = Math.min(d, dLo);                  // never demand more than the chain gives
    }

    /* pastern direction:  v . dir = (D^2 + Lp^2 - d^2) / (2 Lp) */
    let m = (D * D + L.Lp * L.Lp - d * d) / (2 * L.Lp * D || 1e-6);
    m = clamp(m, -1, 1);
    kDes.set(-Math.sin(NOMINAL_PASTERN), Math.cos(NOMINAL_PASTERN), 0).normalize();
    kPerp.copy(kDes).addScaledVector(kU, -kDes.dot(kU));
    if (kPerp.lengthSq() < 1e-8) kPerp.set(0, 0, 1).addScaledVector(kU, -kU.z);
    kPerp.normalize();
    kDir.copy(kU).multiplyScalar(m)
      .addScaledVector(kPerp, Math.sqrt(Math.max(0, 1 - m * m))).normalize();
    kA.copy(kH).addScaledVector(kDir, L.Lp);                    // ankle

    /* --- knee: choose the azimuth of the 2-bone solution --- */
    kE1.subVectors(kA, R);
    const dist = kE1.length();
    kE1.divideScalar(dist || 1e-6);
    const cosR = clamp((L.L1 * L.L1 + dist * dist - L.L2 * L.L2) / (2 * L.L1 * dist), -1, 1);
    const psi = Math.acos(cosR);
    kCaud.set(-1, 0, 0).addScaledVector(kE1, -kE1.x);           // caudal, in bend plane
    if (kCaud.lengthSq() < 1e-8) kCaud.set(0, 0, -1);
    kCaud.normalize();
    kLat.crossVectors(kE1, kCaud).normalize();
    const bias = 0.42, sgn = leg.front ? 1 : -1;
    kK.copy(R)
      .addScaledVector(kE1, L.L1 * Math.cos(psi))
      .addScaledVector(kCaud, sgn * L.L1 * Math.sin(psi) * Math.cos(bias))
      .addScaledVector(kLat, leg.side * L.L1 * Math.sin(psi) * Math.sin(bias));

    leg.boneA.position.copy(R);
    setBasis(leg.boneA, FWD, kTmp.subVectors(kK, R));
    leg.boneB.position.copy(kK);
    setBasis(leg.boneB, FWD, kTmp.subVectors(kA, kK));
    leg.knee.position.copy(kK);

    leg.pastern.position.copy(kA);
    setBasis(leg.pastern, FWD, kTmp.subVectors(kH, kA));
    leg.pastern.scale.y = kA.distanceTo(kH) / L.Lp;             // never detach
    leg.fet.position.copy(kA);

    leg.hoof.position.copy(target).addScaledVector(kAxis, SOLE_CLEAR);
    setBasis(leg.hoof, FWD, kAxis);
  }

  /* ---------------- build ------------------------------------------ */
  function build(palKey) {
    const M = makeMaterials(palKey);
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    const torso = buildTorso(M);
    body.add(torso);
    buildMasses(M).forEach(m => body.add(m));

    const neck = buildNeck(M);
    neck.bones.forEach(b => body.add(b));
    neck.joints.forEach(j => body.add(j));
    buildMane(M, neck.bones);

    const head = buildHead(M);
    body.add(head.grp);

    const tail = buildTail(M);
    body.add(tail.base);

    const legs = {};
    ['LF', 'RF', 'LH', 'RH'].forEach(n => {
      legs[n] = buildLeg(n, M);
      body.add(legs[n].boneA); body.add(legs[n].boneB); body.add(legs[n].knee);
      body.add(legs[n].pastern); body.add(legs[n].fet); body.add(legs[n].hoof);
    });

    const st = {
      phase: 0, speed: 1.15, stride: 1.24, duty: 0.62, lift: 0.30,
      walking: true, time: 0,
      headYaw: 0, headPitch: 0, headTargetYaw: 0, headTargetPitch: 0,
      lookTimer: 1.5, blink: 0, breath: 0, tailPhase: Math.random() * 6.28,
      neckSway: 0, weight: 0, dust: []
    };

    const T = new V();
    const kW = new V();

    /** Desired WORLD position of a hoof sole (bob/roll compensated). */
    function footWorldTarget(leg, out, idle) {
      const u = ((st.phase - leg.phase) % 1 + 1) % 1;
      let x, h;
      if (idle) {
        x = leg.rest.x + (leg.side > 0 ? 0.05 : -0.05) * st.weight * 0.30;
        h = 0;
      } else if (u < st.duty) {
        x = leg.rest.x + st.stride * 0.5 - (u / st.duty) * st.stride;
        h = 0;
      } else {
        const t = (u - st.duty) / (1 - st.duty);
        x = leg.rest.x - st.stride * 0.5 + easeIO(t) * st.stride;
        h = st.lift * Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 0.85);
      }
      const z = leg.rest.z + st.weight * (leg.side > 0 ? 0.010 : -0.010);
      out.set(x, GROUND + h, z);
      out.applyMatrix4(root.matrixWorld);          // heading + travel of the animal
      return out;
    }
    function kneeBiasFor(u) {
      if (u < st.duty) return 0.035;
      const t = (u - st.duty) / (1 - st.duty);
      return 0.035 + 0.34 * Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 1.6);
    }
    function hoofTiltFor(u) {
      if (u >= st.duty) return 0;
      return -0.13 + 0.26 * smooth(u / st.duty);
    }

    /* neck: FABRIK with a shape bias, 3 bones */
    function solveNeck(headTarget, out) {
      const p = [
        NECK.base.clone(),
        NECK.base.clone().add(new V(0.55, 1.0, 0)),
        NECK.base.clone().add(new V(1.05, 1.65, 0)),
        headTarget.clone()
      ];
      const L = NECK.seg;
      const bias = new V(0.02, 0.10, 0);
      const mid = new V();
      for (let it = 0; it < 7; it++) {
        for (let i = 2; i >= 0; i--) {
          T.subVectors(p[i], p[i + 1]);
          const dd = T.length() || 1e-6;
          p[i].copy(p[i + 1]).addScaledVector(T, L[i] / dd);
        }
        for (let i = 1; i < 3; i++) {
          T.subVectors(p[i], p[i - 1]);
          const dd = T.length() || 1e-6;
          p[i].copy(p[i - 1]).addScaledVector(T, L[i - 1] / dd);
        }
        mid.addVectors(NECK.base, headTarget).multiplyScalar(0.5).add(bias);
        p[1].lerp(mid, 0.22);
      }
      for (let i = 0; i < 3; i++) {
        const b = neck.bones[i];
        b.position.copy(p[i]);
        setBasis(b, FWD, T.subVectors(p[i + 1], p[i]));
        neck.joints[i].position.copy(p[i + 1]);
      }
      out.copy(p[3]);
      return out;
    }

    const nEnd = new V(), nPrev = new V(), hDir = new V(), hDir2 = new V();

    function update(dt, params) {
      st.time += dt;
      const walking = params.walking;
      if (walking) {
        st.speed = params.speed;
        st.stride = clamp(0.58 + 0.46 * st.speed, 0.58, 1.16);
        st.duty = clamp(0.66 - 0.10 * (st.speed / 1.6), 0.48, 0.66);
        st.lift = clamp(0.20 + 0.13 * st.speed, 0.20, 0.34);
        const pace = clamp((st.speed - 1.05) / 0.7, 0, 1);
        for (const n of ['LH', 'LF', 'RH', 'RF']) {
          legs[n].phase = lerp(WALK_PHASE[n], PACE_PHASE[n], pace);
        }
        st.phase = (st.phase + dt * st.speed / st.stride) % 1;
      } else {
        st.speed = 0; st.stride = 1.0; st.duty = 0.62; st.lift = 0.2;
      }

      /* body bob / sway */
      const ph = st.phase * Math.PI * 2;
      const bobAmp = walking ? 0.020 + 0.012 * st.speed : 0.006;
      body.position.y = bobAmp * Math.cos(ph * 2 + 0.6) + (walking ? 0 : 0.004 * Math.sin(st.time * 1.1));
      body.rotation.z = (walking ? 0.020 : 0.004) * Math.sin(ph + 0.4) + 0.003 * Math.sin(st.time * 0.7);
      body.rotation.x = (walking ? 0.014 : 0.003) * Math.cos(ph * 2 + 0.3);
      body.rotation.y = (walking ? 0.012 : 0.002) * Math.sin(ph + 1.1);

      /* breathing */
      st.breath += dt * (walking ? 1.5 : 0.42);
      const br = Math.sin(st.breath) * (walking ? 0.006 : 0.016);
      torso.scale.set(1 + br * 0.55, 1 + br, 1 + br * 0.4);

      if (!walking) {
        st.weight = 0.5 * Math.sin(st.time * 0.31) + 0.3 * Math.sin(st.time * 0.17 + 1.2);
      } else st.weight *= 0.9;

      /* legs — targets are anchored in the world so the hooves never
         sink or slide because of the body bob / roll / travel */
      root.updateMatrixWorld(true);
      for (const n of ['LF', 'RF', 'LH', 'RH']) {
        const leg = legs[n];
        footWorldTarget(leg, kW, !walking);
        body.worldToLocal(kW);
        const u = ((st.phase - leg.phase) % 1 + 1) % 1;
        solveLeg(leg, kW, kneeBiasFor(u), hoofTiltFor(u));
      }

      /* neck + head */
      const sway = walking ? 0.055 * Math.sin(ph * 2 + 0.9) : 0.02 * Math.sin(st.time * 0.5);
      st.neckSway = lerp(st.neckSway, sway, 1 - Math.pow(0.001, dt));
      const headT = new V(2.00, 2.22, st.neckSway);
      solveNeck(headT, nEnd);

      if (!walking) {
        st.lookTimer -= dt;
        if (st.lookTimer < 0) {
          st.lookTimer = 2.2 + Math.random() * 4.0;
          st.headTargetYaw = (Math.random() - 0.5) * 0.85;
          st.headTargetPitch = (Math.random() - 0.5) * 0.30 - 0.05;
        }
      } else {
        st.headTargetYaw = 0.10 * Math.sin(ph * 2 + 1.7) + 0.05 * Math.sin(st.time * 0.6);
        st.headTargetPitch = -0.06 + 0.05 * Math.cos(ph * 2);
      }
      st.headYaw = lerp(st.headYaw, st.headTargetYaw, 1 - Math.pow(0.02, dt));
      st.headPitch = lerp(st.headPitch, st.headTargetPitch, 1 - Math.pow(0.02, dt));

      nPrev.copy(neck.joints[1].position);
      hDir.subVectors(nEnd, nPrev);
      if (hDir.lengthSq() < 1e-8) hDir.set(1, 0, 0);
      hDir.normalize();
      const dirAng = Math.atan2(hDir.y, hDir.x);
      const want = st.headPitch - body.rotation.x;
      const corr = want - dirAng;
      hDir2.set(hDir.x * Math.cos(corr) - hDir.y * Math.sin(corr),
        hDir.x * Math.sin(corr) + hDir.y * Math.cos(corr), hDir.z).normalize();
      head.grp.position.copy(nEnd);
      setBasis(head.grp, hDir2, UP);
      head.grp.rotateY(st.headYaw);

      /* ears */
      for (const e of head.ears) {
        e.t -= dt;
        if (e.t < -0.9) e.t = 1.6 + Math.random() * 5.0;
        const flick = e.t < 0 ? Math.sin(e.t * 26) * Math.exp(e.t * 2.2) * 0.5 : 0;
        e.grp.rotation.z = e.base.z + flick * 0.8 + 0.01 * Math.sin(st.time * 1.3 + e.side);
        e.grp.rotation.y = e.base.y + flick * 0.5 * e.side;
      }

      /* blink */
      st.blink -= dt;
      if (st.blink < -0.16) st.blink = 2.5 + Math.random() * 4.5;
      const blink = st.blink < 0 ? 1 - Math.pow(Math.max(0, 1 + st.blink / 0.16), 2) : 0;
      for (const e of head.eyes) {
        e.ball.scale.y = 1 - 0.92 * blink;
        e.ball.scale.z = 1 - 0.15 * blink;
      }

      /* tail */
      st.tailPhase += dt * (walking ? 1.5 : 0.5);
      for (let i = 0; i < tail.segs.length; i++) {
        const s = tail.segs[i];
        const w = st.tailPhase - i * 0.55;
        const amp = 0.05 + 0.05 * i;
        s.rotation.z = Math.sin(w) * amp + 0.06;
        s.rotation.x = Math.sin(w * 0.8 + 1.0) * amp * 0.6 - 0.05;
      }
    }

    return { root, body, legs, head, neck, tail, update, materials: M, state: st };
  }

  return { build, BODY_Y, LEG, ROOT, REST, GROUND };
})();
