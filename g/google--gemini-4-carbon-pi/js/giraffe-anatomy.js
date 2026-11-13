(function () {
  'use strict';

  const GS = (window.GiraffeSim = window.GiraffeSim || {});
  const M = GS.Math;

  /**
   * Exact anatomical joint positions in standing bind pose (meters).
   * +Y = up (0.0 = ground), +Z = forward, +X = animal's LEFT side.
   */
  const BIND_JOINTS = {
    root: [0, 0, 0],
    pelvis: [0, 2.24, -0.52],
    spine1: [0, 2.40, -0.18],
    spine2: [0, 2.52, 0.18],
    chest: [0, 2.58, 0.50],

    // 6 cervical neck segments + head + jaw
    neck0: [0, 2.66, 0.62],
    neck1: [0, 3.04, 0.84],
    neck2: [0, 3.44, 1.05],
    neck3: [0, 3.84, 1.25],
    neck4: [0, 4.22, 1.43],
    neck5: [0, 4.55, 1.56],
    head: [0, 4.68, 1.63],
    jaw: [0, 4.53, 1.71],

    earL: [0.068, 4.685, 1.565],
    earR: [-0.068, 4.685, 1.565],

    // Caudal tail chain
    tail0: [0, 2.24, -0.80],
    tail1: [0, 2.02, -0.86],
    tail2: [0, 1.77, -0.88],
    tail3: [0, 1.51, -0.88],
    tail4: [0, 1.27, -0.87],

    // Forelimbs (Left = +X, Right = -X) - realistic humeral/elbow angulation reserve + sleek width
    scapulaL: [0.175, 2.54, 0.45],
    shoulderL: [0.195, 2.08, 0.61],
    elbowL: [0.195, 1.71, 0.42],
    carpusL: [0.190, 1.03, 0.51],
    foreFetlockL: [0.185, 0.27, 0.51],
    foreHoofL: [0.185, 0.0, 0.585],

    scapulaR: [-0.175, 2.54, 0.45],
    shoulderR: [-0.195, 2.08, 0.61],
    elbowR: [-0.195, 1.71, 0.42],
    carpusR: [-0.190, 1.03, 0.51],
    foreFetlockR: [-0.185, 0.27, 0.51],
    foreHoofR: [-0.185, 0.0, 0.585],

    // Hindlimbs (Left = +X, Right = -X) - realistic femoral/stifle/hock angulation reserve
    hipL: [0.185, 2.18, -0.56],
    stifleL: [0.195, 1.72, -0.37],
    hockL: [0.180, 1.07, -0.66],
    hindFetlockL: [0.175, 0.27, -0.62],
    hindHoofL: [0.175, 0.0, -0.545],

    hipR: [-0.185, 2.18, -0.56],
    stifleR: [-0.195, 1.72, -0.37],
    hockR: [-0.180, 1.07, -0.66],
    hindFetlockR: [-0.175, 0.27, -0.62],
    hindHoofR: [-0.175, 0.0, -0.545]
  };

  const BONE_PARENTS = {
    root: null,
    pelvis: 'root',
    spine1: 'pelvis',
    spine2: 'spine1',
    chest: 'spine2',
    neck0: 'chest',
    neck1: 'neck0',
    neck2: 'neck1',
    neck3: 'neck2',
    neck4: 'neck3',
    neck5: 'neck4',
    head: 'neck5',
    jaw: 'head',
    earL: 'head',
    earR: 'head',

    tail0: 'pelvis',
    tail1: 'tail0',
    tail2: 'tail1',
    tail3: 'tail2',
    tail4: 'tail3',

    scapulaL: 'chest',
    shoulderL: 'scapulaL',
    elbowL: 'shoulderL',
    carpusL: 'elbowL',
    foreFetlockL: 'carpusL',
    foreHoofL: 'foreFetlockL',

    scapulaR: 'chest',
    shoulderR: 'scapulaR',
    elbowR: 'shoulderR',
    carpusR: 'elbowR',
    foreFetlockR: 'carpusR',
    foreHoofR: 'foreFetlockR',

    hipL: 'pelvis',
    stifleL: 'hipL',
    hockL: 'stifleL',
    hindFetlockL: 'hockL',
    hindHoofL: 'hindFetlockL',

    hipR: 'pelvis',
    stifleR: 'hipR',
    hockR: 'stifleR',
    hindFetlockR: 'hockR',
    hindHoofR: 'hindFetlockR'
  };

  function createSkeletonHierarchy() {
    const bones = [];
    const boneMap = {};
    const boneIndex = {};
    const bindPosMap = {};

    const names = Object.keys(BIND_JOINTS);
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const bone = new THREE.Bone();
      bone.name = name;
      const wp = new THREE.Vector3().fromArray(BIND_JOINTS[name]);
      bindPosMap[name] = wp;
      boneMap[name] = bone;
      boneIndex[name] = i;
      bones.push(bone);
    }

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const parentName = BONE_PARENTS[name];
      const bone = boneMap[name];
      if (parentName) {
        const parentBone = boneMap[parentName];
        parentBone.add(bone);
        bone.position.copy(bindPosMap[name]).sub(bindPosMap[parentName]);
      } else {
        bone.position.copy(bindPosMap[name]);
      }
    }

    return { bones, boneMap, boneIndex, bindPosMap };
  }

  // Helper to pack top-4 normalized skin weights into skinIndices & skinWeights arrays
  function pushSkinWeights(skinIndices, skinWeights, candidates) {
    candidates.sort((a, b) => b.w - a.w);
    const i0 = candidates[0] ? candidates[0].idx : 0;
    const i1 = candidates[1] ? candidates[1].idx : 0;
    const i2 = candidates[2] ? candidates[2].idx : 0;
    const i3 = candidates[3] ? candidates[3].idx : 0;
    let w0 = candidates[0] ? Math.max(0, candidates[0].w) : 1;
    let w1 = candidates[1] ? Math.max(0, candidates[1].w) : 0;
    let w2 = candidates[2] ? Math.max(0, candidates[2].w) : 0;
    let w3 = candidates[3] ? Math.max(0, candidates[3].w) : 0;
    const sum = w0 + w1 + w2 + w3;
    if (sum > 1e-6) {
      w0 /= sum;
      w1 /= sum;
      w2 /= sum;
      w3 /= sum;
    } else {
      w0 = 1;
      w1 = w2 = w3 = 0;
    }
    skinIndices.push(i0, i1, i2, i3);
    skinWeights.push(w0, w1, w2, w3);
  }

  /**
   * Axial Body + Neck + Head + Snout Stations:
   * Each station defines center (cy, cz), cross-section dorsal normal angle `pitchRad`
   * (0 = vertical dorsal +Y, >0 tilted backward-up perpendicular to neck, <0 tilted forward-up perpendicular to skull),
   * halfWidth `w`, dorsal radius `rTop`, ventral radius `rBot`, lateral rib/cheek shape modifiers, and coat parameters!
   */
  const AXIAL_STATIONS = [
    // Tailhead / Ischium cap -> Croup -> Pelvis -> Lumbar -> Ribcage -> Withers -> Chest
    { s: 0.00, cy: 2.18, cz: -0.85, ang: -0.22, w: 0.055, rTop: 0.065, rBot: 0.075, bellyTuck: 0.0,   crest: 0.02, freq: 5.2, mask: 0.94, chan: 0.054, reg: 0.0 },
    { s: 0.04, cy: 2.22, cz: -0.78, ang: -0.10, w: 0.175, rTop: 0.175, rBot: 0.235, bellyTuck: 0.0,   crest: 0.04, freq: 4.8, mask: 0.98, chan: 0.052, reg: 0.0 },
    { s: 0.09, cy: 2.24, cz: -0.62, ang: 0.00,  w: 0.245, rTop: 0.245, rBot: 0.275, bellyTuck: 0.02,  crest: 0.05, freq: 4.5, mask: 1.00, chan: 0.050, reg: 0.0 },
    { s: 0.15, cy: 2.25, cz: -0.42, ang: 0.02,  w: 0.255, rTop: 0.265, rBot: 0.275, bellyTuck: -0.04, crest: 0.05, freq: 4.3, mask: 1.00, chan: 0.048, reg: 0.0 },
    { s: 0.22, cy: 2.26, cz: -0.14, ang: 0.04,  w: 0.285, rTop: 0.365, rBot: 0.385, bellyTuck: -0.08, crest: 0.07, freq: 4.2, mask: 1.00, chan: 0.048, reg: 0.0 },
    { s: 0.29, cy: 2.28, cz: 0.18,  ang: 0.06,  w: 0.305, rTop: 0.495, rBot: 0.505, bellyTuck: -0.14, crest: 0.11, freq: 4.2, mask: 1.00, chan: 0.048, reg: 0.0 },
    // Tall steep withers hump (y_top ~ 2.97m) & sleek athletic brisket keel!
    { s: 0.36, cy: 2.35, cz: 0.45,  ang: 0.14,  w: 0.285, rTop: 0.620, rBot: 0.565, bellyTuck: -0.22, crest: 0.16, freq: 4.3, mask: 1.00, chan: 0.048, reg: 0.0 },
    { s: 0.41, cy: 2.51, cz: 0.60,  ang: 0.42,  w: 0.228, rTop: 0.435, rBot: 0.385, bellyTuck: -0.16, crest: 0.14, freq: 4.5, mask: 1.00, chan: 0.050, reg: 0.0 },

    // Cervical Neck Base (C7) -> Mid Neck (C4) -> Upper Neck / Throatlatch (C1)
    { s: 0.47, cy: 2.78, cz: 0.76,  ang: 0.78,  w: 0.182, rTop: 0.285, rBot: 0.285, bellyTuck: -0.06, crest: 0.12, freq: 4.8, mask: 1.00, chan: 0.050, reg: 0.0 },
    { s: 0.54, cy: 3.16, cz: 0.94,  ang: 0.96,  w: 0.150, rTop: 0.215, rBot: 0.212, bellyTuck: 0.0,   crest: 0.11, freq: 5.3, mask: 1.00, chan: 0.052, reg: 0.0 },
    { s: 0.61, cy: 3.58, cz: 1.14,  ang: 1.00,  w: 0.128, rTop: 0.178, rBot: 0.170, bellyTuck: 0.0,   crest: 0.10, freq: 5.9, mask: 1.00, chan: 0.054, reg: 0.0 },
    { s: 0.68, cy: 4.00, cz: 1.34,  ang: 1.00,  w: 0.110, rTop: 0.150, rBot: 0.142, bellyTuck: 0.0,   crest: 0.09, freq: 6.7, mask: 1.00, chan: 0.056, reg: 0.0 },

    // Poll / Atlas-Occiput arch -> Cranium / Ossicone Crown -> Orbital Brow & Masseter Jowl
    { s: 0.74,  cy: 4.37, cz: 1.49, ang: 0.84,  w: 0.096, rTop: 0.132, rBot: 0.112, bellyTuck: -0.06, crest: 0.08, freq: 7.8,  mask: 0.98, chan: 0.058, reg: 0.0 },
    { s: 0.790, cy: 4.58, cz: 1.58, ang: 0.48,  w: 0.092, rTop: 0.128, rBot: 0.090, bellyTuck: -0.12, crest: 0.04, freq: 9.8,  mask: 0.95, chan: 0.062, reg: 0.0 },
    { s: 0.830, cy: 4.64, cz: 1.66, ang: 0.06,  w: 0.104, rTop: 0.116, rBot: 0.115, bellyTuck: -0.22, crest: 0.02, freq: 12.0, mask: 0.90, chan: 0.066, reg: 0.0 },
    // Orbital / Frontal Boss / Masseter Cheekbone station
    { s: 0.870, cy: 4.60, cz: 1.75, ang: -0.28, w: 0.106, rTop: 0.096, rBot: 0.116, bellyTuck: -0.28, crest: 0.06, freq: 14.2, mask: 0.84, chan: 0.072, reg: 0.0 },

    // Facial Taper (Infraorbital hollow -> Slender Nasal Bridge -> Nostril Flare -> Prehensile Upper Lip)
    { s: 0.910, cy: 4.53, cz: 1.85, ang: -0.42, w: 0.064, rTop: 0.072, rBot: 0.082, bellyTuck: -0.26, crest: 0.05, freq: 16.0, mask: 0.68, chan: 0.085, reg: 0.05 },
    { s: 0.948, cy: 4.46, cz: 1.95, ang: -0.46, w: 0.054, rTop: 0.060, rBot: 0.060, bellyTuck: -0.20, crest: 0.02, freq: 17.5, mask: 0.32, chan: 0.115, reg: 0.25 },
    // Flared comma nostrils & soft prehensile upper lip overhanging slender chin
    { s: 0.976, cy: 4.41, cz: 2.03, ang: -0.48, w: 0.061, rTop: 0.056, rBot: 0.046, bellyTuck: -0.18, crest: -0.02, freq: 18.5, mask: 0.04, chan: 0.165, reg: 0.65 },
    { s: 0.992, cy: 4.38, cz: 2.075, ang: -0.50, w: 0.046, rTop: 0.042, rBot: 0.028, bellyTuck: -0.10, crest: -0.04, freq: 19.0, mask: 0.0, chan: 0.195, reg: 0.86 },
    { s: 1.000, cy: 4.365, cz: 2.092, ang: -0.50, w: 0.010, rTop: 0.010, rBot: 0.008, bellyTuck: 0.0,  crest: 0.0,  freq: 19.0, mask: 0.0, chan: 0.200, reg: 0.92 }
  ];

  // Spine/neck/head skinning control curve along `s`
  const AXIAL_BONE_ANCHORS = [
    { s: 0.03, bone: 'pelvis' },
    { s: 0.13, bone: 'pelvis' },
    { s: 0.21, bone: 'spine1' },
    { s: 0.29, bone: 'spine2' },
    { s: 0.37, bone: 'chest' },
    { s: 0.44, bone: 'neck0' },
    { s: 0.51, bone: 'neck1' },
    { s: 0.58, bone: 'neck2' },
    { s: 0.65, bone: 'neck3' },
    { s: 0.72, bone: 'neck4' },
    { s: 0.77, bone: 'neck5' },
    { s: 0.83, bone: 'head' },
    { s: 1.00, bone: 'head' }
  ];

  function computeAxialWeights(s, theta, boneIndex) {
    const absCos = Math.cos(theta);
    const list = [];
    // Gaussian blend across neighboring axial anchors for buttery smooth cervical & spinal bending
    for (let i = 0; i < AXIAL_BONE_ANCHORS.length; i++) {
      const a = AXIAL_BONE_ANCHORS[i];
      const sigma = s > 0.76 ? 0.042 : s > 0.40 ? 0.058 : 0.075;
      const d = (s - a.s) / sigma;
      const w = Math.exp(-0.5 * d * d);
      if (w > 0.005) {
        const idx = boneIndex[a.bone];
        const existing = list.find((e) => e.idx === idx);
        if (existing) existing.w += w;
        else list.push({ idx, w });
      }
    }

    // Lower jaw & chin vertices (s in [0.85..0.985], ventral half cos(theta) < -0.18) blend onto jaw bone!
    if (s > 0.845 && s < 0.988 && absCos < -0.15) {
      const jawFactor = M.smoothstep(0.845, 0.895, s) * (1 - M.smoothstep(0.968, 0.988, s)) * M.smoothstep(-0.15, -0.58, absCos);
      if (jawFactor > 0.02) {
        for (let i = 0; i < list.length; i++) list[i].w *= 1 - jawFactor * 0.88;
        list.push({ idx: boneIndex.jaw, w: jawFactor * 1.35 });
      }
    }

    return list;
  }

  function buildAxialBodyGeometry(skelInfo) {
    const rings = 104;
    const radialSegs = 48;

    const positions = [];
    const restPositions = [];
    const coatData = [];
    const uvs = [];
    const skinIndices = [];
    const skinWeights = [];
    const indices = [];

    for (let i = 0; i <= rings; i++) {
      const u = i / rings;
      // Concentrate extra rings around head/brow/nostrils (u > 0.76) and withers (u ~ 0.36)
      const s = u < 0.75 ? u * (0.76 / 0.75) : 0.76 + Math.pow((u - 0.75) / 0.25, 0.88) * 0.24;
      const st = M.sampleProfileStations(AXIAL_STATIONS, clamp01(s));

      // Dorsal unit vector in (y, z) plane: ang=0 -> (0, +1, 0); ang>0 -> tilted back (-sin(ang) in Z, cos(ang) in Y)
      const ny = Math.cos(st.ang);
      const nz = -Math.sin(st.ang);

      for (let j = 0; j <= radialSegs; j++) {
        const v = j / radialSegs;
        const theta = v * Math.PI * 2; // 0 = dorsal ridge, PI/2 = +X left, PI = ventral keel, 3PI/2 = -X right
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const absSin = Math.abs(sinT);

        // Asymmetric vertical radius (dorsal vs ventral)
        const baseVert = cosT >= 0 ? st.rTop : st.rBot;

        // Anatomical cross-section sculpting:
        // 1) Dorsal spinous ridge / nasal bridge sharpening + ventral brisket keel narrowing
        let widthScale = 1.0;
        if (cosT > 0) {
          // Slight pear-like narrowing toward dorsal mane ridge
          widthScale -= st.crest * Math.pow(cosT, 2.2);
        } else {
          // Deep brisket keel / mandible taper ventrally
          widthScale += st.bellyTuck * Math.pow(-cosT, 1.6);
        }

        // 2) Torso ribcage spring & scapular/pelvic muscular relief
        let latBulge = 0.0;
        if (s > 0.12 && s < 0.40) {
          const torsoEnv = Math.sin(((s - 0.12) / 0.28) * Math.PI);
          // Upper-mid ribcage fullness, slight hollow at paralumbar fossa (flank triangle s ~ 0.16)
          latBulge += torsoEnv * 0.024 * Math.sin(theta * 2.0 + 0.5) * absSin;
          const fossa = Math.exp(-Math.pow((s - 0.165) / 0.032, 2)) * Math.exp(-Math.pow((cosT - 0.25) / 0.32, 2));
          latBulge -= fossa * 0.022 * absSin;
        }

        // 3) Neck jugular groove (subtle longitudinal furrow on lower-lateral neck)
        if (s > 0.45 && s < 0.77) {
          const neckEnv = Math.sin(((s - 0.45) / 0.32) * Math.PI);
          const jugGroove = Math.exp(-Math.pow((cosT + 0.42) / 0.24, 2)) * absSin;
          latBulge -= neckEnv * jugGroove * 0.014;
        }

        // 4) Cranial / Brow / Orbital Socket / Cheekbone / Nostril sculpting!
        let vertExtra = 0.0;
        let nostrilIndent = 0.0;
        if (s > 0.80) {
          // Supraorbital brow shelf (s ~ 0.865, upper-lateral cosT ~ 0.55)
          const browEnv = Math.exp(-Math.pow((s - 0.862) / 0.022, 2));
          const browAngle = Math.exp(-Math.pow((cosT - 0.52) / 0.26, 2)) * absSin;
          latBulge += browEnv * browAngle * 0.024;
          vertExtra += browEnv * browAngle * 0.012;

          // Eye socket gentle concavity right under brow shelf so eyeball sits naturally in orbit!
          const socketAngle = Math.exp(-Math.pow((cosT - 0.18) / 0.22, 2)) * absSin;
          latBulge -= browEnv * socketAngle * 0.016;

          // Median frontal boss (male giraffe central forehead calcium knob at s ~ 0.868, dorsal cosT ~ 1)
          const bossEnv = Math.exp(-Math.pow((s - 0.872) / 0.020, 2)) * Math.pow(Math.max(0, cosT), 8.0);
          vertExtra += bossEnv * 0.022;

          // Masseter cheek fullness (s ~ 0.845, lower-lateral cosT ~ -0.45)
          const cheekEnv = Math.exp(-Math.pow((s - 0.845) / 0.026, 2));
          const cheekAngle = Math.exp(-Math.pow((cosT + 0.45) / 0.34, 2)) * absSin;
          latBulge += cheekEnv * cheekAngle * 0.018;

          // Slit nostril flare + nostril opening indent (s ~ 0.968, upper-lateral cosT ~ 0.38)
          const nosFlareEnv = Math.exp(-Math.pow((s - 0.966) / 0.015, 2));
          const nosWing = Math.exp(-Math.pow((cosT - 0.42) / 0.26, 2)) * absSin;
          latBulge += nosFlareEnv * nosWing * 0.013;

          const nosPit = Math.exp(-Math.pow((s - 0.968) / 0.009, 2)) * Math.exp(-Math.pow((cosT - 0.34) / 0.14, 2)) * absSin;
          nostrilIndent = nosPit;
          latBulge -= nosPit * 0.021;

          // Subtle mouth commissure cleft separating prehensile upper lip from lower lip (s > 0.93, cosT ~ -0.32)
          const mouthLine = M.smoothstep(0.928, 0.955, s) * (1 - M.smoothstep(0.990, 0.999, s)) * Math.exp(-Math.pow((cosT + 0.30) / 0.08, 2));
          latBulge -= mouthLine * 0.009 * absSin;
          nostrilIndent = Math.max(nostrilIndent, mouthLine * 0.65);

          // Upper lip philtrum cleft at tip (s > 0.975, ventral-front)
          const philtrum = M.smoothstep(0.972, 0.995, s) * Math.pow(Math.max(0, -cosT), 6.0) * (1.0 - absSin);
          vertExtra += philtrum * 0.008;
        }

        const rx = Math.max(0.004, st.w * widthScale + latBulge);
        const ry = Math.max(0.004, baseVert) * cosT + vertExtra;

        const px = rx * sinT;
        const py = st.cy + ry * ny;
        const pz = st.cz + ry * nz;

        positions.push(px, py, pz);
        restPositions.push(px, py, pz);
        uvs.push(u, v);

        // Coat countershading: fade spots ONLY on true horizontal underbelly behind forelegs (s < 0.31), keeping front chest spotted!
        let localMask = st.mask;
        if (cosT < -0.76 && s < 0.32) {
          const sBellyFade = 1.0 - M.smoothstep(0.26, 0.32, s);
          const ventralFade = M.smoothstep(-0.76, -0.97, cosT) * sBellyFade;
          localMask *= 1.0 - ventralFade * 0.92;
        }
        // Subtle pale periocular ring right around eye socket (s ~ 0.870, cosT ~ 0.22)
        if (s > 0.84 && s < 0.90) {
          const eyeRing = Math.exp(-Math.pow((s - 0.868) / 0.015, 2)) * Math.exp(-Math.pow((cosT - 0.20) / 0.18, 2)) * absSin;
          localMask *= 1.0 - eyeRing * 0.85;
        }

        // Darken inside nostril slit via regionType -> muzzle dark skin
        const localReg = clamp01(st.reg + nostrilIndent * 0.95);
        coatData.push(st.freq, localMask, st.chan, localReg);

        const weights = computeAxialWeights(s, theta, skelInfo.boneIndex);
        pushSkinWeights(skinIndices, skinWeights, weights);
      }
    }

    const stride = radialSegs + 1;
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        const c = (i + 1) * stride + (j + 1);
        const d = i * stride + (j + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPositions, 3));
    geo.setAttribute('aCoatData', new THREE.Float32BufferAttribute(coatData, 4));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Anatomically sculpted Forelimb & Hindlimb Skinned Geometry:
   * Seamless upper muscular blend into chest/pelvis, prominent olecranon (elbow) / calcaneus (point of hock),
   * knobby carpus, slender cannon bone with posterior tendon groove, rounded fetlock, pastern, and coronet!
   */
  function buildLimbGeometry(skelInfo, isFore, isLeft) {
    const side = isLeft ? 1 : -1;
    const suffix = isLeft ? 'L' : 'R';
    const bp = skelInfo.bindPosMap;
    const bi = skelInfo.boneIndex;

    let stations;
    let boneChain;

    if (isFore) {
      const pScap = bp['scapula' + suffix];
      const pShld = bp['shoulder' + suffix];
      const pElb = bp['elbow' + suffix];
      const pCarp = bp['carpus' + suffix];
      const pFet = bp['foreFetlock' + suffix];
      const pHoof = bp['foreHoof' + suffix];

      // Exact segment intervals: each bone owns the shaft BELOW its joint down to the child joint!
      boneChain = [
        { sStart: -0.10, sEnd: 0.07, blend: 0.045, idx: bi.chest },
        { sStart: 0.07,  sEnd: 0.20, blend: 0.045, idx: bi['scapula' + suffix] },
        { sStart: 0.20,  sEnd: 0.40, blend: 0.042, idx: bi['shoulder' + suffix] },     // Humerus shaft
        { sStart: 0.40,  sEnd: 0.68, blend: 0.032, idx: bi['elbow' + suffix] },        // Forearm (Radius/Ulna) shaft
        { sStart: 0.68,  sEnd: 0.91, blend: 0.026, idx: bi['carpus' + suffix] },       // Metacarpal Cannon shaft
        { sStart: 0.91,  sEnd: 0.975, blend: 0.024, idx: bi['foreFetlock' + suffix] }, // Pastern shaft
        { sStart: 0.975, sEnd: 1.10, blend: 0.025, idx: bi['foreHoof' + suffix] }      // Coronet cuff tucked into hoof!
      ];

      // Stations from upper scapular muscle skirt down to coronet band (y=0.115m)
      stations = [
        // Top shoulder skirt tucked seamlessly inside lateral chest wall
        { s: 0.00, x: side * 0.125, y: pScap.y + 0.10, z: pScap.z - 0.01, rx: 0.075, rzF: 0.165, rzB: 0.175, groove: 0.0, freq: 4.5, mask: 1.00, chan: 0.050 },
        { s: 0.09, x: side * 0.172, y: pScap.y - 0.14, z: pScap.z + 0.05, rx: 0.092, rzF: 0.155, rzB: 0.175, groove: 0.0, freq: 4.8, mask: 1.00, chan: 0.052 },
        // Point of shoulder (glenoid / deltoid - sleek laterally!)
        { s: 0.20, x: pShld.x * 0.96, y: pShld.y, z: pShld.z, rx: 0.090, rzF: 0.122, rzB: 0.160, groove: 0.0, freq: 5.2, mask: 1.00, chan: 0.054 },
        // Humerus / Triceps -> Elbow (clean olecranon contour)
        { s: 0.34, x: pElb.x, y: pElb.y + 0.08, z: pElb.z + 0.03, rx: 0.082, rzF: 0.095, rzB: 0.132, groove: 0.0, freq: 5.8, mask: 0.98, chan: 0.058 },
        { s: 0.40, x: pElb.x, y: pElb.y, z: pElb.z, rx: 0.074, rzF: 0.084, rzB: 0.112, groove: 0.0, freq: 6.4, mask: 0.96, chan: 0.062 },
        // Upper Forearm muscular belly -> Distal Forearm taper
        { s: 0.50, x: lerpS(pElb.x, pCarp.x, 0.36), y: lerpS(pElb.y, pCarp.y, 0.36), z: lerpS(pElb.z, pCarp.z, 0.36), rx: 0.070, rzF: 0.078, rzB: 0.086, groove: 0.04, freq: 7.4, mask: 0.92, chan: 0.068 },
        { s: 0.62, x: lerpS(pElb.x, pCarp.x, 0.82), y: lerpS(pElb.y, pCarp.y, 0.82), z: lerpS(pElb.z, pCarp.z, 0.82), rx: 0.048, rzF: 0.052, rzB: 0.058, groove: 0.12, freq: 9.2, mask: 0.72, chan: 0.082 },
        // Carpus ("fore-knee" anterior bony prominence; spots fade out just below carpus!)
        { s: 0.68, x: pCarp.x, y: pCarp.y, z: pCarp.z, rx: 0.054, rzF: 0.064, rzB: 0.054, groove: 0.06, freq: 10.8, mask: 0.42, chan: 0.120 },
        { s: 0.73, x: lerpS(pCarp.x, pFet.x, 0.16), y: lerpS(pCarp.y, pFet.y, 0.16), z: pCarp.z, rx: 0.041, rzF: 0.044, rzB: 0.049, groove: 0.24, freq: 12.0, mask: 0.14, chan: 0.145 },
        // Long slender Metacarpal Cannon with crisp lateral flexor tendon groove!
        { s: 0.82, x: lerpS(pCarp.x, pFet.x, 0.62), y: lerpS(pCarp.y, pFet.y, 0.62), z: pFet.z, rx: 0.035, rzF: 0.039, rzB: 0.046, groove: 0.32, freq: 13.0, mask: 0.0, chan: 0.160 },
        // Fetlock joint knuckle + posterior sesamoid bulb
        { s: 0.91, x: pFet.x, y: pFet.y, z: pFet.z, rx: 0.046, rzF: 0.048, rzB: 0.058, groove: 0.08, freq: 13.0, mask: 0.0, chan: 0.160 },
        // Pastern sloping forward into Coronet band & tucked cleanly inside cloven hoof capsule
        { s: 0.955, x: pHoof.x, y: 0.175, z: lerpS(pFet.z, pHoof.z, 0.48), rx: 0.038, rzF: 0.041, rzB: 0.043, groove: 0.05, freq: 13.0, mask: 0.0, chan: 0.160 },
        { s: 0.982, x: pHoof.x, y: 0.120, z: lerpS(pFet.z, pHoof.z, 0.82), rx: 0.045, rzF: 0.052, rzB: 0.044, groove: 0.0, freq: 13.0, mask: 0.0, chan: 0.160 },
        { s: 1.000, x: pHoof.x, y: 0.082, z: pHoof.z - 0.006, rx: 0.036, rzF: 0.042, rzB: 0.034, groove: 0.0, freq: 13.0, mask: 0.0, chan: 0.160 }
      ];
    } else {
      const pHip = bp['hip' + suffix];
      const pStif = bp['stifle' + suffix];
      const pHock = bp['hock' + suffix];
      const pFet = bp['hindFetlock' + suffix];
      const pHoof = bp['hindHoof' + suffix];

      boneChain = [
        { sStart: -0.10, sEnd: 0.14, blend: 0.085, idx: bi.pelvis },
        { sStart: 0.14,  sEnd: 0.36, blend: 0.085, idx: bi['hip' + suffix] },          // Femur / Thigh shaft
        { sStart: 0.36,  sEnd: 0.66, blend: 0.036, idx: bi['stifle' + suffix] },       // Tibia / Gaskin shaft
        { sStart: 0.66,  sEnd: 0.91, blend: 0.026, idx: bi['hock' + suffix] },         // Metatarsal Cannon shaft
        { sStart: 0.91,  sEnd: 0.975, blend: 0.024, idx: bi['hindFetlock' + suffix] }, // Hind Pastern shaft
        { sStart: 0.975, sEnd: 1.10, blend: 0.025, idx: bi['hindHoof' + suffix] }      // Coronet cuff tucked into hoof!
      ];

      stations = [
        // Gluteal / Pelvic Haunch skirt tucked cleanly inside croup/pelvis for wrinkle-free extension
        { s: 0.00, x: side * 0.085, y: pHip.y + 0.12, z: pHip.z + 0.01, rx: 0.072, rzF: 0.145, rzB: 0.155, groove: 0.0, freq: 4.5, mask: 1.00, chan: 0.050 },
        { s: 0.12, x: pHip.x * 0.92, y: pHip.y, z: pHip.z, rx: 0.106, rzF: 0.195, rzB: 0.192, groove: 0.0, freq: 4.6, mask: 1.00, chan: 0.052 },
        // Thigh / Stifle + Flank fold web anteriorly & hamstring fullness posteriorly
        { s: 0.26, x: lerpS(pHip.x, pStif.x, 0.62), y: lerpS(pHip.y, pStif.y, 0.62), z: lerpS(pHip.z, pStif.z, 0.45), rx: 0.102, rzF: 0.165, rzB: 0.178, groove: 0.0, freq: 5.1, mask: 1.00, chan: 0.055 },
        { s: 0.36, x: pStif.x, y: pStif.y, z: pStif.z - 0.04, rx: 0.088, rzF: 0.118, rzB: 0.152, groove: 0.0, freq: 5.8, mask: 0.98, chan: 0.060 },
        // Upper Gaskin -> Distal Tibia + taut Achilles tendon sweeping to Point of Hock!
        { s: 0.50, x: lerpS(pStif.x, pHock.x, 0.44), y: lerpS(pStif.y, pHock.y, 0.44), z: lerpS(pStif.z, pHock.z, 0.44), rx: 0.076, rzF: 0.078, rzB: 0.104, groove: 0.10, freq: 7.2, mask: 0.92, chan: 0.068 },
        { s: 0.61, x: lerpS(pStif.x, pHock.x, 0.85), y: lerpS(pStif.y, pHock.y, 0.85), z: lerpS(pStif.z, pHock.z, 0.85), rx: 0.048, rzF: 0.052, rzB: 0.082, groove: 0.24, freq: 9.4, mask: 0.70, chan: 0.084 },
        // Tarsus / Hock (prominent backward calcaneal point of hock rzB = 0.095m!)
        { s: 0.66, x: pHock.x, y: pHock.y, z: pHock.z, rx: 0.054, rzF: 0.052, rzB: 0.094, groove: 0.18, freq: 10.8, mask: 0.38, chan: 0.122 },
        { s: 0.72, x: lerpS(pHock.x, pFet.x, 0.18), y: lerpS(pHock.y, pFet.y, 0.18), z: lerpS(pHock.z, pFet.z, 0.18), rx: 0.041, rzF: 0.044, rzB: 0.052, groove: 0.26, freq: 12.2, mask: 0.10, chan: 0.148 },
        // Slender Metatarsal Cannon
        { s: 0.82, x: lerpS(pHock.x, pFet.x, 0.62), y: lerpS(pHock.y, pFet.y, 0.62), z: lerpS(pHock.z, pFet.z, 0.62), rx: 0.035, rzF: 0.040, rzB: 0.047, groove: 0.32, freq: 13.0, mask: 0.0, chan: 0.160 },
        // Hind Fetlock -> Pastern -> Coronet tucked cleanly inside cloven hoof capsule
        { s: 0.91, x: pFet.x, y: pFet.y, z: pFet.z, rx: 0.046, rzF: 0.048, rzB: 0.058, groove: 0.08, freq: 13.0, mask: 0.0, chan: 0.160 },
        { s: 0.955, x: pHoof.x, y: 0.175, z: lerpS(pFet.z, pHoof.z, 0.48), rx: 0.038, rzF: 0.041, rzB: 0.043, groove: 0.05, freq: 13.0, mask: 0.0, chan: 0.160 },
        { s: 0.982, x: pHoof.x, y: 0.120, z: lerpS(pFet.z, pHoof.z, 0.82), rx: 0.043, rzF: 0.050, rzB: 0.042, groove: 0.0, freq: 13.0, mask: 0.0, chan: 0.160 },
        { s: 1.000, x: pHoof.x, y: 0.082, z: pHoof.z - 0.006, rx: 0.034, rzF: 0.040, rzB: 0.032, groove: 0.0, freq: 13.0, mask: 0.0, chan: 0.160 }
      ];
    }

    const rings = 58;
    const radialSegs = 28;
    const positions = [];
    const restPositions = [];
    const coatData = [];
    const uvs = [];
    const skinIndices = [];
    const skinWeights = [];
    const indices = [];

    for (let i = 0; i <= rings; i++) {
      const s = i / rings;
      const st = M.sampleProfileStations(stations, s);

      // Rigid-shaft + smooth joint-crease skin weights (prevents rubber-hose cannon bending!)
      const wList = [];
      for (let b = 0; b < boneChain.length; b++) {
        const seg = boneChain[b];
        const rise = b === 0 ? 1.0 : M.smoothstep(seg.sStart - seg.blend, seg.sStart + seg.blend, s);
        const fall = b === boneChain.length - 1 ? 1.0 : 1.0 - M.smoothstep(seg.sEnd - boneChain[b + 1].blend, seg.sEnd + boneChain[b + 1].blend, s);
        const w = rise * fall;
        if (w > 0.002) wList.push({ idx: seg.idx, w });
      }

      for (let j = 0; j <= radialSegs; j++) {
        const v = j / radialSegs;
        const phi = v * Math.PI * 2; // 0 = anterior (+Z), PI/2 = lateral outer, PI = posterior (-Z), 3PI/2 = medial inner
        const cosP = Math.cos(phi);
        const sinP = Math.sin(phi);

        const rz = cosP >= 0 ? st.rzF : st.rzB;
        // Sculpt lateral/medial tendon furrow slightly behind midline (cosP ~ -0.35) on cannon & distal gaskin/forearm
        const tendonIndent = 1.0 - st.groove * Math.exp(-Math.pow((cosP + 0.35) / 0.34, 2)) * Math.pow(Math.abs(sinP), 1.5);
        // Medial inner thigh/arm is slightly flatter against body wall near top
        const medialFlat = s < 0.34 && sinP * side < 0 ? 0.76 + 0.24 * (s / 0.34) : 1.0;

        const px = st.x + st.rx * tendonIndent * medialFlat * sinP;
        const py = st.y + (s < 0.08 ? (1 - s / 0.08) * 0.04 * (sinP * side < 0 ? -1 : 0.3) : 0);
        const pz = st.z + rz * cosP;

        positions.push(px, py, pz);
        restPositions.push(px, py, pz);
        uvs.push(s, v);

        // Inner upper thigh/axilla countershading
        let mask = st.mask;
        if (s < 0.42 && sinP * side < -0.25) {
          mask *= 1.0 - M.smoothstep(-0.25, -0.9, sinP * side) * (1.0 - s / 0.42) * 0.85;
        }
        coatData.push(st.freq, mask, st.chan, 0.0);

        pushSkinWeights(skinIndices, skinWeights, wList.map((e) => ({ idx: e.idx, w: e.w })));
      }
    }

    const stride = radialSegs + 1;
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        const c = (i + 1) * stride + (j + 1);
        const d = i * stride + (j + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    // Bottom cap at coronet (tucked inside hoof)
    const geo = new THREE.BufferGeometry();
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPositions, 3));
    geo.setAttribute('aCoatData', new THREE.Float32BufferAttribute(coatData, 4));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    geo.computeVertexNormals();
    return geo;
  }

  function lerpS(a, b, t) {
    return a + (b - a) * t;
  }
  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  /**
   * Sculpted Artiodactyl Cloven Hoof (paired medial + lateral keratinous digits with central cleft & flat sole)
   * Built in local space of each hoof bone (sole at y=0, coronet at y=0.125m).
   */
  function buildClovenHoofGeometry() {
    const geometries = [];
    for (let toe = -1; toe <= 1; toe += 2) {
      const rings = 10;
      const segs = 18;
      const pos = [];
      const uvs = [];
      const idx = [];

      for (let i = 0; i <= rings; i++) {
        const t = i / rings; // 0 = coronet top (y=0.122), 1 = flat ground sole (y=0.000)
        const y = (1 - t) * 0.122;
        // Hoof slopes forward toward toe tip and flares slightly toward sole
        const zCenter = -0.020 + t * 0.032;
        const xCenter = toe * (0.022 + t * 0.005);
        const rx = 0.023 + t * 0.004;
        const rzF = 0.044 + t * 0.026;
        const rzB = 0.042 - t * 0.004;

        for (let j = 0; j <= segs; j++) {
          const v = j / segs;
          const phi = v * Math.PI * 2;
          const cosP = Math.cos(phi);
          const sinP = Math.sin(phi);

          // Flatten inner wall facing the interdigital cleft (sinP * toe < 0) so two toes form a crisp cleft!
          const isInnerWall = sinP * toe < 0;
          const innerFlat = isInnerWall ? 0.42 : 1.0;
          const px = xCenter + rx * innerFlat * sinP;
          const pz = zCenter + (cosP >= 0 ? rzF : rzB) * cosP;
          // Coronet dips slightly forward like a real ungulate hoof capsule
          const py = t === 1 ? 0.0 : Math.max(0.0, y - cosP * 0.012 * (1 - t));

          pos.push(px, py, pz);
          uvs.push(v, t);
        }
      }

      const stride = segs + 1;
      for (let i = 0; i < rings; i++) {
        for (let j = 0; j < segs; j++) {
          const a = i * stride + j;
          const b = (i + 1) * stride + j;
          const c = (i + 1) * stride + (j + 1);
          const d = i * stride + (j + 1);
          idx.push(a, b, d);
          idx.push(b, c, d);
        }
      }

      // Flat sole cap at i = rings
      const soleCenterIdx = pos.length / 3;
      pos.push(toe * 0.024, 0.0, 0.012);
      uvs.push(0.5, 1.0);
      const soleRingStart = rings * stride;
      for (let j = 0; j < segs; j++) {
        idx.push(soleRingStart + j, soleCenterIdx, soleRingStart + j + 1);
      }

      const g = new THREE.BufferGeometry();
      g.setIndex(idx);
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.computeVertexNormals();
      geometries.push(g);
    }

    return mergeSimpleGeometries(geometries);
  }

  /**
   * Sculpted Paired Ossicones + Cupped Leaf-Shaped Ears + Skinned Tail Geometry (using main giraffe coat shader!)
   */
  function buildOssiconesGeometry(skelInfo) {
    const headIdx = skelInfo.boneIndex.head;
    const parts = [];

    for (let side = -1; side <= 1; side += 2) {
      const rings = 18;
      const segs = 20;
      const pos = [];
      const rest = [];
      const coat = [];
      const uvs = [];
      const sIdx = [];
      const sWgt = [];
      const idx = [];

      // Base embedded cleanly inside parietal skull dome behind/above eyes (zero gap at macro zoom!)
      const bx = side * 0.048;
      const by = 4.712;
      const bz = 1.648;
      // Angled upward and slightly backward (~18 deg) + subtle outward flare
      const dx = side * 0.012;
      const dy = 0.242;
      const dz = -0.074;

      for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        const cx = bx + dx * t;
        const cy = by + dy * t;
        const cz = bz + dz * t;

        // Broad cranial pedicle flare -> slender shaft -> rounded tufted terminal knob -> dome cap
        let r;
        if (t < 0.22) {
          r = M.lerp(0.044, 0.025, M.smoothstep(0, 0.22, t));
        } else if (t < 0.68) {
          r = M.lerp(0.025, 0.023, (t - 0.22) / 0.46);
        } else if (t < 0.86) {
          r = M.lerp(0.023, 0.032, M.smoothstep(0.68, 0.86, t));
        } else {
          const capT = (t - 0.86) / 0.14;
          r = 0.032 * Math.sqrt(Math.max(0.002, 1 - capT * capT));
        }

        // Negative regionType (-1.0) triggers dark black-brown tufted ossicone hair knob in coat shader!
        const darkKnob = -M.smoothstep(0.58, 0.78, t);

        for (let j = 0; j <= segs; j++) {
          const phi = (j / segs) * Math.PI * 2;
          // Add subtle bristly silhouette texture on terminal hair tuft
          const tuftBristle = t > 0.65 && t < 0.98 ? 1.0 + 0.08 * Math.sin(phi * 9.0 + i * 2.1) : 1.0;
          const px = cx + r * tuftBristle * Math.sin(phi);
          const py = cy + r * tuftBristle * Math.cos(phi) * 0.28;
          const pz = cz + r * tuftBristle * Math.cos(phi) * 0.96;

          pos.push(px, py, pz);
          rest.push(px, py, pz);
          uvs.push(t, j / segs);
          coat.push(13.5, 0.55 * (1 - M.smoothstep(0.45, 0.72, t)), 0.12, darkKnob);
          sIdx.push(headIdx, 0, 0, 0);
          sWgt.push(1, 0, 0, 0);
        }
      }

      const stride = segs + 1;
      for (let i = 0; i < rings; i++) {
        for (let j = 0; j < segs; j++) {
          const a = i * stride + j;
          const b = (i + 1) * stride + j;
          const c = (i + 1) * stride + (j + 1);
          const d = i * stride + (j + 1);
          idx.push(a, b, d);
          idx.push(b, c, d);
        }
      }

      parts.push({ pos, rest, coat, uvs, sIdx, sWgt, idx });
    }

    return packSkinnedParts(parts);
  }

  /**
   * Sculpted Cupped Artiodactyl Ears (concave creamy-furred interior + tawny exterior with dark-edged tip)
   */
  function buildEarsGeometry(skelInfo) {
    const parts = [];

    for (let isLeft = 0; isLeft <= 1; isLeft++) {
      const side = isLeft ? 1 : -1;
      const earIdx = skelInfo.boneIndex[isLeft ? 'earL' : 'earR'];
      const headIdx = skelInfo.boneIndex.head;
      const baseP = skelInfo.bindPosMap[isLeft ? 'earL' : 'earR'];

      const rings = 18;
      const segs = 22;
      const pos = [];
      const rest = [];
      const coat = [];
      const uvs = [];
      const sIdx = [];
      const sWgt = [];
      const idx = [];

      // Ear axis extends laterally outward, slightly upward (+22 deg), and gently backward (-12 deg)
      const dir = new THREE.Vector3(side * 0.91, 0.35, -0.21).normalize();
      const upRef = new THREE.Vector3(0, 1, 0);
      // Forward/anterior-cupping direction of ear scoop
      const cupFwd = new THREE.Vector3().crossVectors(upRef, dir).multiplyScalar(side).normalize();
      const widthVec = new THREE.Vector3().crossVectors(dir, cupFwd).normalize();

      const earLen = 0.268;

      for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        // Lanceolate leaf width profile: narrow tubular concha -> wide mid-blade -> pointed tip
        const leafWidth =
          t < 0.22
            ? M.lerp(0.022, 0.044, t / 0.22)
            : 0.052 * Math.sin(Math.pow((t - 0.12) / 0.88, 0.78) * Math.PI);
        const thickness = M.lerp(0.018, 0.0045, t);
        const cupDepth = Math.sin(t * Math.PI) * 0.026;

        const wEar = M.smoothstep(0.0, 0.18, t);

        for (let j = 0; j <= segs; j++) {
          const phi = (j / segs) * Math.PI * 2;
          const cosP = Math.cos(phi); // +1 = anterior concave inner face, -1 = posterior convex outer face
          const sinP = Math.sin(phi); // +-1 = upper/lower ear margins

          const wOff = Math.max(0.002, leafWidth) * sinP;
          // Cup cross-section into a natural C-shaped scoop opening forward-outward!
          let fOff;
          if (cosP >= 0) {
            // Concave inner ear bowl (scooped backward!)
            fOff = -cupDepth * (1 - sinP * sinP) + thickness * 0.35 * cosP;
          } else {
            // Convex outer back of ear
            fOff = -cupDepth * (1 - sinP * sinP) + thickness * cosP - 0.006 * (1 - sinP * sinP);
          }

          // Gentle upward/outward natural tip curl
          const tipLift = Math.pow(t, 2.2) * 0.016;

          const px = baseP.x + dir.x * (earLen * t) + widthVec.x * (wOff + tipLift) + cupFwd.x * fOff;
          const py = baseP.y + dir.y * (earLen * t) + widthVec.y * (wOff + tipLift) + cupFwd.y * fOff;
          const pz = baseP.z + dir.z * (earLen * t) + widthVec.z * (wOff + tipLift) + cupFwd.z * fOff;

          pos.push(px, py, pz);
          rest.push(px, py, pz);
          uvs.push(t, j / segs);

          // Inner concave face (cosP > 0.15, t > 0.15) gets pale cream inner-ear fur (regionType 1.0..2.0)
          // Extreme tip rim gets dark melanin border (-0.7)
          let reg = 0.0;
          if (t > 0.84 && cosP <= 0.2) {
            reg = -M.smoothstep(0.84, 0.96, t) * 0.75;
          } else if (cosP > 0.12 && t > 0.14) {
            reg = 1.0 + M.smoothstep(0.12, 0.55, cosP) * M.smoothstep(0.14, 0.30, t) * 0.95;
          }

          coat.push(15.0, 0.35 * (1 - M.smoothstep(0.5, 0.9, t)), 0.14, reg);
          pushSkinWeights(sIdx, sWgt, [
            { idx: earIdx, w: wEar },
            { idx: headIdx, w: 1 - wEar }
          ]);
        }
      }

      const stride = segs + 1;
      for (let i = 0; i < rings; i++) {
        for (let j = 0; j < segs; j++) {
          const a = i * stride + j;
          const b = (i + 1) * stride + j;
          const c = (i + 1) * stride + (j + 1);
          const d = i * stride + (j + 1);
          idx.push(a, b, d);
          idx.push(b, c, d);
        }
      }

      parts.push({ pos, rest, coat, uvs, sIdx, sWgt, idx });
    }

    return packSkinnedParts(parts);
  }

  /**
   * Skinned 5-Segment Caudal Tail Geometry
   */
  function buildTailGeometry(skelInfo) {
    const bp = skelInfo.bindPosMap;
    const bi = skelInfo.boneIndex;
    const chain = ['tail0', 'tail1', 'tail2', 'tail3', 'tail4'];
    const stations = [
      { s: 0.00, y: bp.tail0.y + 0.03, z: bp.tail0.z + 0.03, r: 0.044, mask: 0.88 },
      { s: 0.25, y: bp.tail1.y, z: bp.tail1.z, r: 0.030, mask: 0.78 },
      { s: 0.50, y: bp.tail2.y, z: bp.tail2.z, r: 0.023, mask: 0.55 },
      { s: 0.75, y: bp.tail3.y, z: bp.tail3.z, r: 0.019, mask: 0.25 },
      { s: 1.00, y: bp.tail4.y, z: bp.tail4.z, r: 0.015, mask: 0.0 }
    ];

    const rings = 24;
    const segs = 14;
    const pos = [];
    const rest = [];
    const coat = [];
    const uvs = [];
    const sIdx = [];
    const sWgt = [];
    const idx = [];

    for (let i = 0; i <= rings; i++) {
      const s = i / rings;
      const st = M.sampleProfileStations(stations, s);

      const wList = [{ idx: bi.pelvis, w: Math.exp(-0.5 * Math.pow(s / 0.11, 2)) }];
      for (let c = 0; c < chain.length; c++) {
        const cs = c / (chain.length - 1);
        const d = (s - cs) / 0.18;
        wList.push({ idx: bi[chain[c]], w: Math.exp(-0.5 * d * d) });
      }

      for (let j = 0; j <= segs; j++) {
        const phi = (j / segs) * Math.PI * 2;
        const px = st.r * Math.sin(phi);
        const py = st.y;
        const pz = st.z + st.r * Math.cos(phi);
        pos.push(px, py, pz);
        rest.push(px, py, pz);
        uvs.push(s, j / segs);
        coat.push(9.5, st.mask, 0.11, s > 0.82 ? -M.smoothstep(0.82, 1.0, s) * 0.9 : 0.0);
        pushSkinWeights(sIdx, sWgt, wList.map((e) => ({ idx: e.idx, w: e.w })));
      }
    }

    const stride = segs + 1;
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        const c = (i + 1) * stride + (j + 1);
        const d = i * stride + (j + 1);
        idx.push(a, b, d);
        idx.push(b, c, d);
      }
    }

    return packSkinnedParts([{ pos, rest, coat, uvs, sIdx, sWgt, idx }]);
  }

  /**
   * Skinned Upright Dorsal Neck Mane (from Poll C1 down to Withers hump)
   * Built from overlapping V-angled feathered bristle cards weighted smoothly along neck bones!
   */
  function buildNeckManeGeometry(skelInfo) {
    const pos = [];
    const uvs = [];
    const sIdx = [];
    const sWgt = [];
    const idx = [];

    const cardCount = 58;
    const rng = M.mulberry32(77531);

    for (let i = 0; i < cardCount; i++) {
      const t = i / (cardCount - 1);
      // Span axial stations s from 0.310 (behind withers peak) up to 0.802 (poll behind ears)
      const s0 = M.lerp(0.310, 0.800, t);
      const s1 = Math.min(0.812, s0 + 0.020);
      const st0 = M.sampleProfileStations(AXIAL_STATIONS, s0);
      const st1 = M.sampleProfileStations(AXIAL_STATIONS, s1);

      const ny0 = Math.cos(st0.ang);
      const nz0 = -Math.sin(st0.ang);
      const ny1 = Math.cos(st1.ang);
      const nz1 = -Math.sin(st1.ang);

      // Root implanted slightly inside dorsal ridge so zero floating gap
      const root0Y = st0.cy + (st0.rTop - 0.016) * ny0;
      const root0Z = st0.cz + (st0.rTop - 0.016) * nz0;
      const root1Y = st1.cy + (st1.rTop - 0.016) * ny1;
      const root1Z = st1.cz + (st1.rTop - 0.016) * nz1;

      // Mane height feathers smoothly from 1.2 cm on withers up to 13 cm on mid-neck, tapering to 5 cm at poll
      const withersRamp = M.smoothstep(0.0, 0.18, t);
      const pollTaper = 1.0 - 0.55 * M.smoothstep(0.86, 1.0, t);
      const maneH = (0.014 + 0.118 * withersRamp * pollTaper) * (0.94 + 0.12 * rng());

      // Two slightly splayed V-rows (+-8 deg) give realistic brush thickness from front & 3/4 views!
      for (let row = -1; row <= 1; row += 2) {
        const xRoot = row * 0.005;
        const xTip = row * (0.013 + rng() * 0.006);
        // Hair bristles sweep slightly backward along dorsal crest
        const sweepBackY = ny0 * maneH - 0.016;
        const sweepBackZ = nz0 * maneH - 0.018;

        const baseV = pos.length / 3;
        // 4 vertices of feathered bristle quad (v=1 at root, v=0 at feathered tip)
        pos.push(xRoot, root0Y, root0Z);
        pos.push(xRoot, root1Y, root1Z);
        pos.push(xTip, root1Y + sweepBackY, root1Z + sweepBackZ);
        pos.push(xTip, root0Y + sweepBackY, root0Z + sweepBackZ);

        uvs.push(0, 0, 1, 0, 1, 1, 0, 1);

        const w0 = computeAxialWeights(s0, 0, skelInfo.boneIndex);
        const w1 = computeAxialWeights(s1, 0, skelInfo.boneIndex);
        pushSkinWeights(sIdx, sWgt, w0.map((e) => ({ idx: e.idx, w: e.w })));
        pushSkinWeights(sIdx, sWgt, w1.map((e) => ({ idx: e.idx, w: e.w })));
        pushSkinWeights(sIdx, sWgt, w1.map((e) => ({ idx: e.idx, w: e.w })));
        pushSkinWeights(sIdx, sWgt, w0.map((e) => ({ idx: e.idx, w: e.w })));

        idx.push(baseV, baseV + 1, baseV + 2);
        idx.push(baseV, baseV + 2, baseV + 3);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sWgt, 4));
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Flowing Black Tail Switch / Tassel (multi-layered curved ribbons weighted to tail3 & tail4)
   */
  function buildTailTasselGeometry(skelInfo) {
    const bp = skelInfo.bindPosMap;
    const iTail3 = skelInfo.boneIndex.tail3;
    const iTail4 = skelInfo.boneIndex.tail4;

    const pos = [];
    const uvs = [];
    const sIdx = [];
    const sWgt = [];
    const idx = [];

    const ribbonCount = 20;
    const segsLen = 7;
    const rng = M.mulberry32(99123);

    const topY = bp.tail4.y + 0.04;
    const topZ = bp.tail4.z;

    for (let r = 0; r < ribbonCount; r++) {
      const ang = (r / ribbonCount) * Math.PI * 2 + rng() * 0.2;
      const layer = r % 3;
      const length = 0.40 + layer * 0.035 + rng() * 0.03;
      const maxSpread = 0.032 + layer * 0.011;
      const halfCardW = 0.024 + layer * 0.005;

      const radX = Math.sin(ang);
      const radZ = Math.cos(ang);
      const tangX = Math.cos(ang);
      const tangZ = -Math.sin(ang);

      const startV = pos.length / 3;

      for (let k = 0; k <= segsLen; k++) {
        const t = k / segsLen; // 0 = root inside tail tip, 1 = flowing hair tip
        // Swell slightly in middle of tassel then taper gently toward wavy tip
        const swell = Math.sin(Math.pow(t, 0.72) * Math.PI * 0.88);
        const rOut = 0.009 + maxSpread * swell;
        const wCard = halfCardW * (0.45 + 0.75 * swell);
        const waveZ = Math.sin(t * 4.2 + r * 0.7) * 0.012 * t;

        const cy = topY - length * t;
        const cx = radX * rOut;
        const cz = topZ + radZ * rOut + waveZ - t * 0.015;

        pos.push(cx - tangX * wCard, cy, cz - tangZ * wCard);
        pos.push(cx + tangX * wCard, cy, cz + tangZ * wCard);

        // v=0 at root, v=1 at feathered tip (matches createHairMaterial canvas where y=h is root, y=0 is tip!)
        uvs.push(0, t, 1, t);

        const w4 = M.lerp(0.75, 1.0, t);
        const w3 = 1.0 - w4;
        for (let sideV = 0; sideV < 2; sideV++) {
          sIdx.push(iTail4, iTail3, 0, 0);
          sWgt.push(w4, w3, 0, 0);
        }
      }

      for (let k = 0; k < segsLen; k++) {
        const a = startV + k * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        idx.push(a, b, d);
        idx.push(a, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sWgt, 4));
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Build Detailed Eyes, Blinking Eyelids & Lush Dark Eyelashes attached to `headBone`
   */
  function attachEyesAndLashes(headBone, bindHeadPos, eyeMat) {
    const eyelidMat = new THREE.MeshStandardMaterial({
      color: 0x241d19,
      roughness: 0.58,
      metalness: 0.02
    });
    const lashMat = new THREE.MeshStandardMaterial({
      color: 0x0e0a08,
      roughness: 0.75,
      side: THREE.DoubleSide
    });

    const eyeGeo = new THREE.SphereGeometry(0.0265, 24, 20);
    eyeGeo.rotateX(Math.PI / 2);
    // Planar-corneal UV projection on +Z front hemisphere so iris, horizontal pupil & catchlight map distortion-free!
    const ePos = eyeGeo.attributes.position;
    const eUv = eyeGeo.attributes.uv;
    for (let i = 0; i < ePos.count; i++) {
      const nx = ePos.getX(i) / 0.0265;
      const ny = ePos.getY(i) / 0.0265;
      const nz = ePos.getZ(i) / 0.0265;
      eUv.setXY(i, nz >= 0 ? 0.5 + nx * 0.48 : 0.03, nz >= 0 ? 0.5 + ny * 0.48 : 0.03);
    }

    const upperLidGeo = new THREE.SphereGeometry(0.0285, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const lowerLidGeo = new THREE.SphereGeometry(0.0280, 20, 12, 0, Math.PI * 2, Math.PI * 0.54, Math.PI * 0.46);

    // Sweeping dark upper eyelashes fan
    const lashPos = [];
    const lashIdx = [];
    const lashCount = 16;
    for (let i = 0; i < lashCount; i++) {
      const u = (i / (lashCount - 1)) * 2 - 1; // -1..1 across upper lid rim
      const ang = u * 0.95;
      const rRim = 0.0282;
      const bx = Math.sin(ang) * rRim;
      const bz = Math.cos(ang) * rRim;
      const len = 0.019 * (1 - 0.35 * u * u);

      const v0 = lashPos.length / 3;
      lashPos.push(bx - 0.0014, 0.001, bz);
      lashPos.push(bx + 0.0014, 0.001, bz);
      lashPos.push(bx * 1.38, 0.007, bz + len);
      lashIdx.push(v0, v0 + 1, v0 + 2);
    }
    const lashGeo = new THREE.BufferGeometry();
    lashGeo.setIndex(lashIdx);
    lashGeo.setAttribute('position', new THREE.Float32BufferAttribute(lashPos, 3));
    lashGeo.computeVertexNormals();

    const upperLids = [];
    for (let side = -1; side <= 1; side += 2) {
      const eyeGroup = new THREE.Group();
      // World eye socket position nestled cleanly beneath supraorbital brow shelf
      eyeGroup.position.set(
        side * 0.092 - bindHeadPos.x,
        4.606 - bindHeadPos.y,
        1.748 - bindHeadPos.z
      );
      // Giraffe eyes face laterally outward (+-X) with ~28 deg forward convergence & slight downward gaze
      eyeGroup.rotation.order = 'YXZ';
      eyeGroup.rotation.y = side * (Math.PI * 0.5 - 0.48);
      eyeGroup.rotation.x = 0.12;

      const eyeball = new THREE.Mesh(eyeGeo, eyeMat);
      eyeGroup.add(eyeball);

      const upperLidPivot = new THREE.Group();
      const upperLid = new THREE.Mesh(upperLidGeo, eyelidMat);
      upperLidPivot.add(upperLid);
      const lashes = new THREE.Mesh(lashGeo, lashMat);
      upperLidPivot.add(lashes);
      // Open resting angle leaves upper dome shading top of cornea like a real ungulate eye
      upperLidPivot.rotation.x = -0.34;
      eyeGroup.add(upperLidPivot);
      upperLids.push(upperLidPivot);

      const lowerLid = new THREE.Mesh(lowerLidGeo, eyelidMat);
      lowerLid.rotation.x = 0.24;
      eyeGroup.add(lowerLid);

      headBone.add(eyeGroup);
    }

    return upperLids;
  }

  function packSkinnedParts(parts) {
    const positions = [];
    const restPositions = [];
    const coatData = [];
    const uvs = [];
    const skinIndices = [];
    const skinWeights = [];
    const indices = [];
    let vertOffset = 0;

    for (let p = 0; p < parts.length; p++) {
      const part = parts[p];
      for (let i = 0; i < part.pos.length; i++) positions.push(part.pos[i]);
      for (let i = 0; i < part.rest.length; i++) restPositions.push(part.rest[i]);
      for (let i = 0; i < part.coat.length; i++) coatData.push(part.coat[i]);
      for (let i = 0; i < part.uvs.length; i++) uvs.push(part.uvs[i]);
      for (let i = 0; i < part.sIdx.length; i++) skinIndices.push(part.sIdx[i]);
      for (let i = 0; i < part.sWgt.length; i++) skinWeights.push(part.sWgt[i]);
      for (let i = 0; i < part.idx.length; i++) indices.push(part.idx[i] + vertOffset);
      vertOffset += part.pos.length / 3;
    }

    const geo = new THREE.BufferGeometry();
    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPositions, 3));
    geo.setAttribute('aCoatData', new THREE.Float32BufferAttribute(coatData, 4));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    geo.computeVertexNormals();
    return geo;
  }

  // Chirp-free integrated 3D Voronoi coat coordinate field (continuous everywhere in 3D bind space!)
  function localCoatFreq(y, z) {
    let f = 4.30;
    if (y < 1.95) {
      f += M.smoothstep(1.95, 0.85, y) * 4.8;
    }
    if (y > 2.75) {
      f += M.smoothstep(2.75, 4.62, y) * 5.2;
    }
    if (y > 4.15 && z > 1.50) {
      f += M.smoothstep(4.15, 4.58, y) * M.smoothstep(1.50, 1.92, z) * 8.2;
    }
    return f;
  }

  function evalCoatSpaceInto(outArr, px, py, pz) {
    const steps = 16;
    const y0 = 2.25;
    const dy = (py - y0) / steps;
    let Y = 0;
    for (let k = 0; k < steps; k++) {
      const ym = y0 + (k + 0.5) * dy;
      const zmRef = ym > 2.6 ? (ym - 2.6) * 0.52 + 0.55 : 0.0;
      Y += localCoatFreq(ym, zmRef) * dy;
    }
    const dz = pz / steps;
    let Z = 0;
    for (let k = 0; k < steps; k++) {
      const zm = (k + 0.5) * dz;
      Z += localCoatFreq(py, zm) * dz;
    }
    const X = px * localCoatFreq(py, pz);
    outArr.push(X, Y, Z);
  }

  function mergeSkinnedCoatGeometries(geos) {
    const positions = [];
    const normals = [];
    const restPositions = [];
    const coatPositions = [];
    const coatData = [];
    const uvs = [];
    const skinIndices = [];
    const skinWeights = [];
    const indices = [];
    let offset = 0;

    for (let gIdx = 0; gIdx < geos.length; gIdx++) {
      const g = geos[gIdx];
      const pos = g.attributes.position.array;
      const nrm = g.attributes.normal.array;
      const rst = g.attributes.aRestPos.array;
      const cot = g.attributes.aCoatData.array;
      const uv = g.attributes.uv.array;
      const si = g.attributes.skinIndex.array;
      const sw = g.attributes.skinWeight.array;
      const ix = g.index.array;

      for (let i = 0; i < pos.length; i += 3) {
        positions.push(pos[i], pos[i + 1], pos[i + 2]);
        normals.push(nrm[i], nrm[i + 1], nrm[i + 2]);
        restPositions.push(rst[i], rst[i + 1], rst[i + 2]);
        evalCoatSpaceInto(coatPositions, rst[i], rst[i + 1], rst[i + 2]);
      }
      for (let i = 0; i < cot.length; i++) coatData.push(cot[i]);
      for (let i = 0; i < uv.length; i++) uvs.push(uv[i]);
      for (let i = 0; i < si.length; i++) {
        skinIndices.push(si[i]);
        skinWeights.push(sw[i]);
      }
      for (let i = 0; i < ix.length; i++) indices.push(ix[i] + offset);
      offset += pos.length / 3;
    }

    const merged = new THREE.BufferGeometry();
    merged.setIndex(indices);
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPositions, 3));
    merged.setAttribute('aCoatPos', new THREE.Float32BufferAttribute(coatPositions, 3));
    merged.setAttribute('aCoatData', new THREE.Float32BufferAttribute(coatData, 4));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    merged.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    merged.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    return merged;
  }

  function mergeSimpleGeometries(geos) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    let offset = 0;
    for (let k = 0; k < geos.length; k++) {
      const g = geos[k];
      const p = g.attributes.position.array;
      const n = g.attributes.normal.array;
      const u = g.attributes.uv.array;
      const ix = g.index.array;
      for (let i = 0; i < p.length; i++) {
        positions.push(p[i]);
        normals.push(n[i]);
      }
      for (let i = 0; i < u.length; i++) uvs.push(u[i]);
      for (let i = 0; i < ix.length; i++) indices.push(ix[i] + offset);
      offset += p.length / 3;
    }
    const out = new THREE.BufferGeometry();
    out.setIndex(indices);
    out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return out;
  }

  /**
   * Master Giraffe Builder: creates `group`, full `skeleton`, unified `coatMesh`,
   * `maneMesh`, `tailSwitchMesh`, 4 `hoofMeshes`, `eyes/lashes`, and optional `skeletonHelper`.
   */
  function createGiraffe(options) {
    const opts = options || {};
    const group = new THREE.Group();
    group.name = 'GiraffeRoot';

    const skelInfo = createSkeletonHierarchy();
    const rootBone = skelInfo.boneMap.root;
    group.add(rootBone);

    const coatMaterial = GS.Coat.createGiraffeCoatMaterial(opts.subspecies || 'reticulated');
    const eyeMaterial = GS.Coat.createEyeMaterial();
    const hoofMaterial = GS.Coat.createHoofMaterial();
    const maneMaterial = GS.Coat.createHairMaterial({
      baseColor: '#481f0d',
      tipColor: '#240e05',
      isTail: false
    });
    const tailHairMaterial = GS.Coat.createHairMaterial({
      baseColor: '#191412',
      tipColor: '#0b0908',
      isTail: true
    });

    // Build & merge all coat-shaded skinned meshes into a single draw call!
    const axialGeo = buildAxialBodyGeometry(skelInfo);
    const foreLGeo = buildLimbGeometry(skelInfo, true, true);
    const foreRGeo = buildLimbGeometry(skelInfo, true, false);
    const hindLGeo = buildLimbGeometry(skelInfo, false, true);
    const hindRGeo = buildLimbGeometry(skelInfo, false, false);
    const ossiconeGeo = buildOssiconesGeometry(skelInfo);
    const earsGeo = buildEarsGeometry(skelInfo);
    const tailGeo = buildTailGeometry(skelInfo);

    const fullHideGeo = mergeSkinnedCoatGeometries([
      axialGeo,
      foreLGeo,
      foreRGeo,
      hindLGeo,
      hindRGeo,
      ossiconeGeo,
      earsGeo,
      tailGeo
    ]);

    // Generous bounding sphere so SkinnedMesh is never frustum-culled prematurely
    fullHideGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.5, 0.4), 4.5);

    const hideMesh = new THREE.SkinnedMesh(fullHideGeo, coatMaterial);
    hideMesh.name = 'GiraffeHide';
    hideMesh.castShadow = true;
    hideMesh.receiveShadow = true;
    hideMesh.frustumCulled = false;
    group.add(hideMesh);

    const maneGeo = buildNeckManeGeometry(skelInfo);
    const maneMesh = new THREE.SkinnedMesh(maneGeo, maneMaterial);
    maneMesh.name = 'GiraffeNeckMane';
    maneMesh.castShadow = true;
    maneMesh.frustumCulled = false;
    group.add(maneMesh);

    const tasselGeo = buildTailTasselGeometry(skelInfo);
    const iT2 = skelInfo.boneIndex.tail2;
    const iT3 = skelInfo.boneIndex.tail3;
    // Note: tail3 drives the segment from tail3 down to tail4!
    const tsIdx = tasselGeo.attributes.skinIndex;
    for (let k = 0; k < tsIdx.count; k++) {
      tsIdx.setXY(k, iT3, iT2);
    }
    const tasselMesh = new THREE.SkinnedMesh(tasselGeo, tailHairMaterial);
    tasselMesh.name = 'GiraffeTailSwitch';
    tasselMesh.castShadow = true;
    tasselMesh.frustumCulled = false;
    group.add(tasselMesh);

    // Compute exact bind matrices with group at origin
    group.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(skelInfo.bones);
    hideMesh.bind(skeleton);
    maneMesh.bind(skeleton);
    tasselMesh.bind(skeleton);

    // Attach sculpted cloven hooves directly to the 4 hoof bones
    const hoofGeo = buildClovenHoofGeometry();
    const hoofBoneNames = ['foreHoofL', 'foreHoofR', 'hindHoofL', 'hindHoofR'];
    const hoofMeshes = {};
    for (let i = 0; i < hoofBoneNames.length; i++) {
      const bName = hoofBoneNames[i];
      const hm = new THREE.Mesh(hoofGeo, hoofMaterial);
      hm.castShadow = true;
      hm.receiveShadow = true;
      if (bName.startsWith('hind')) {
        // Hind hooves are slightly narrower/more oval than fore hooves in real giraffes
        hm.scale.set(0.92, 0.96, 0.95);
      }
      skelInfo.boneMap[bName].add(hm);
      hoofMeshes[bName] = hm;
    }

    // Attach glossy eyes, eyelids, and sweeping eyelashes to headBone
    const upperLids = attachEyesAndLashes(
      skelInfo.boneMap.head,
      skelInfo.bindPosMap.head,
      eyeMaterial
    );

    const skeletonHelper = new THREE.SkeletonHelper(rootBone);
    skeletonHelper.material.depthTest = false;
    skeletonHelper.material.transparent = true;
    skeletonHelper.material.opacity = 0.85;
    skeletonHelper.renderOrder = 998;
    skeletonHelper.visible = false;

    return {
      group,
      skeleton,
      skelInfo,
      hideMesh,
      maneMesh,
      tasselMesh,
      hoofMeshes,
      upperLids,
      coatMaterial,
      skeletonHelper
    };
  }

  GS.Anatomy = {
    BIND_JOINTS,
    BONE_PARENTS,
    AXIAL_STATIONS,
    createGiraffe
  };
})();
