(function (global) {
  'use strict';

  const G = (global.GiraffeApp = global.GiraffeApp || {});
  const THREE = global.THREE;
  const { clamp, lerp, smoothstep, sampleProfile } = G.MathUtils;

  // Canonical rest-pose anatomical dimensions (meters, +Z forward, +Y up, +X left)
  const MEASUREMENTS = {
    pelvisPos: new THREE.Vector3(0, 2.15, -0.58),
    spineMidPos: new THREE.Vector3(0, 2.38, -0.05),
    chestPos: new THREE.Vector3(0, 2.58, 0.46),

    // Neck chain (6 bones from chest/withers to head)
    neckPoints: [
      new THREE.Vector3(0, 2.66, 0.72),
      new THREE.Vector3(0, 3.04, 0.94),
      new THREE.Vector3(0, 3.44, 1.15),
      new THREE.Vector3(0, 3.84, 1.34),
      new THREE.Vector3(0, 4.24, 1.50),
      new THREE.Vector3(0, 4.62, 1.64)
    ],
    headPos: new THREE.Vector3(0, 4.86, 1.70),

    // Foreleg rest joints (X = side * x)
    fore: {
      shoulder: new THREE.Vector3(0.25, 2.34, 0.57),
      elbow: new THREE.Vector3(0.225, 1.84, 0.43),
      carpus: new THREE.Vector3(0.21, 1.04, 0.48),
      fetlock: new THREE.Vector3(0.20, 0.24, 0.45),
      hoof: new THREE.Vector3(0.20, 0.0, 0.55)
    },

    // Hindleg rest joints (X = side * x)
    hind: {
      hip: new THREE.Vector3(0.245, 2.10, -0.62),
      stifle: new THREE.Vector3(0.225, 1.56, -0.42),
      hock: new THREE.Vector3(0.21, 0.96, -0.68),
      fetlock: new THREE.Vector3(0.20, 0.24, -0.62),
      hoof: new THREE.Vector3(0.20, 0.0, -0.52)
    },

    tailPoints: [
      new THREE.Vector3(0, 2.23, -0.92),
      new THREE.Vector3(0, 1.94, -0.98),
      new THREE.Vector3(0, 1.61, -1.01),
      new THREE.Vector3(0, 1.28, -1.02)
    ]
  };

  // Precompute exact bone segment lengths for IK
  MEASUREMENTS.foreLengths = {
    humerus: MEASUREMENTS.fore.shoulder.distanceTo(MEASUREMENTS.fore.elbow),
    forearm: MEASUREMENTS.fore.elbow.distanceTo(MEASUREMENTS.fore.carpus),
    cannon: MEASUREMENTS.fore.carpus.distanceTo(MEASUREMENTS.fore.fetlock),
    pastern: MEASUREMENTS.fore.fetlock.distanceTo(MEASUREMENTS.fore.hoof)
  };
  MEASUREMENTS.hindLengths = {
    femur: MEASUREMENTS.hind.hip.distanceTo(MEASUREMENTS.hind.stifle),
    gaskin: MEASUREMENTS.hind.stifle.distanceTo(MEASUREMENTS.hind.hock),
    cannon: MEASUREMENTS.hind.hock.distanceTo(MEASUREMENTS.hind.fetlock),
    pastern: MEASUREMENTS.hind.fetlock.distanceTo(MEASUREMENTS.hind.hoof)
  };

  // Keyframe profile for unified Torso -> Neck -> Head centerline & cross-section radii
  // t in [0, 1]: 0 = tailhead, 0.48 = withers/chest, 0.89 = occiput/skull, 1.0 = muzzle tip
  const SPINE_KEYS = [
    { t: 0.00, y: 2.22, z: -0.94, rx: 0.11, ry: 0.12, yOff: 0.00, muzzle: 0.0, bone: 0.0 }, // tailhead
    { t: 0.06, y: 2.24, z: -0.78, rx: 0.26, ry: 0.28, yOff: -0.02, muzzle: 0.0, bone: 0.2 }, // croup
    { t: 0.14, y: 2.27, z: -0.54, rx: 0.30, ry: 0.33, yOff: -0.04, muzzle: 0.0, bone: 0.5 }, // pelvis/hips
    { t: 0.24, y: 2.34, z: -0.22, rx: 0.31, ry: 0.36, yOff: -0.05, muzzle: 0.0, bone: 1.0 }, // loin/flank
    { t: 0.35, y: 2.43, z: 0.12, rx: 0.35, ry: 0.47, yOff: -0.05, muzzle: 0.0, bone: 1.6 }, // mid ribcage
    { t: 0.44, y: 2.52, z: 0.42, rx: 0.35, ry: 0.51, yOff: -0.04, muzzle: 0.0, bone: 2.0 }, // chest/withers
    { t: 0.51, y: 2.62, z: 0.64, rx: 0.30, ry: 0.45, yOff: -0.02, muzzle: 0.0, bone: 2.3 }, // shoulder/brisket front
    { t: 0.56, y: 2.74, z: 0.76, rx: 0.225, ry: 0.34, yOff: 0.00, muzzle: 0.0, bone: 3.0 }, // neck base
    { t: 0.64, y: 3.14, z: 0.98, rx: 0.175, ry: 0.265, yOff: 0.00, muzzle: 0.0, bone: 4.1 }, // lower neck
    { t: 0.72, y: 3.56, z: 1.20, rx: 0.148, ry: 0.215, yOff: 0.00, muzzle: 0.0, bone: 5.3 }, // mid neck
    { t: 0.80, y: 4.02, z: 1.41, rx: 0.125, ry: 0.175, yOff: 0.00, muzzle: 0.0, bone: 6.5 }, // upper neck
    { t: 0.87, y: 4.50, z: 1.60, rx: 0.104, ry: 0.132, yOff: 0.00, muzzle: 0.0, bone: 7.6 }, // throatlatch
    { t: 0.905, y: 4.78, z: 1.71, rx: 0.114, ry: 0.124, yOff: 0.01, muzzle: 0.0, bone: 8.6 }, // occiput
    { t: 0.925, y: 4.86, z: 1.81, rx: 0.130, ry: 0.132, yOff: 0.00, muzzle: 0.0, bone: 9.0 }, // cranium/jaw
    { t: 0.948, y: 4.81, z: 1.93, rx: 0.120, ry: 0.124, yOff: 0.00, muzzle: 0.06, bone: 9.0 }, // brow/eyes
    { t: 0.972, y: 4.70, z: 2.11, rx: 0.086, ry: 0.092, yOff: 0.00, muzzle: 0.42, bone: 9.0 }, // nasal bridge
    { t: 0.989, y: 4.60, z: 2.26, rx: 0.075, ry: 0.074, yOff: 0.00, muzzle: 0.84, bone: 9.0 }, // nostril flare
    { t: 0.996, y: 4.565, z: 2.32, rx: 0.056, ry: 0.054, yOff: 0.00, muzzle: 0.96, bone: 9.0 }, // upper lip curve
    { t: 1.000, y: 4.550, z: 2.342, rx: 0.022, ry: 0.020, yOff: 0.00, muzzle: 1.00, bone: 9.0 } // soft rounded nose tip
  ];

  // Spine bone indices in skeleton:
  // 0: pelvis, 1: spineMid, 2: chest, 3..8: neck0..neck5, 9: head
  function createBone(name, worldPos, parentBone, parentWorldPos) {
    const b = new THREE.Bone();
    b.name = name;
    if (parentBone) {
      parentBone.add(b);
      b.position.copy(worldPos).sub(parentWorldPos);
    } else {
      b.position.copy(worldPos);
    }
    return b;
  }

  function buildSkeleton() {
    const M = MEASUREMENTS;
    const bones = [];
    const byName = {};

    function reg(bone) {
      bones.push(bone);
      byName[bone.name] = bone;
      return bone;
    }

    const root = reg(createBone('root', new THREE.Vector3(0, 0, 0), null, null));
    const pelvis = reg(createBone('pelvis', M.pelvisPos, root, new THREE.Vector3(0, 0, 0)));
    const spineMid = reg(createBone('spineMid', M.spineMidPos, pelvis, M.pelvisPos));
    const chest = reg(createBone('chest', M.chestPos, spineMid, M.spineMidPos));

    let prevNeck = chest;
    let prevPos = M.chestPos;
    const neckBones = [];
    for (let i = 0; i < M.neckPoints.length; i++) {
      const nb = reg(createBone(`neck${i}`, M.neckPoints[i], prevNeck, prevPos));
      neckBones.push(nb);
      prevNeck = nb;
      prevPos = M.neckPoints[i];
    }

    const head = reg(createBone('head', M.headPos, prevNeck, prevPos));
    const earL = reg(createBone('earL', new THREE.Vector3(0.125, 4.91, 1.66), head, M.headPos));
    const earR = reg(createBone('earR', new THREE.Vector3(-0.125, 4.91, 1.66), head, M.headPos));
    const jaw = reg(createBone('jaw', new THREE.Vector3(0, 4.74, 1.84), head, M.headPos));

    // Tail chain
    const tailBones = [];
    let prevTail = pelvis;
    let prevTailPos = M.pelvisPos;
    for (let i = 0; i < M.tailPoints.length; i++) {
      const tb = reg(createBone(`tail${i}`, M.tailPoints[i], prevTail, prevTailPos));
      tailBones.push(tb);
      prevTail = tb;
      prevTailPos = M.tailPoints[i];
    }

    // 4 Limbs
    const limbs = {};
    for (const sideName of ['L', 'R']) {
      const s = sideName === 'L' ? 1 : -1;

      // Forelimb (child of chest)
      const fS = M.fore.shoulder.clone().setX(s * M.fore.shoulder.x);
      const fE = M.fore.elbow.clone().setX(s * M.fore.elbow.x);
      const fC = M.fore.carpus.clone().setX(s * M.fore.carpus.x);
      const fF = M.fore.fetlock.clone().setX(s * M.fore.fetlock.x);
      const fH = M.fore.hoof.clone().setX(s * M.fore.hoof.x);

      const upperArm = reg(createBone(`foreUpper_${sideName}`, fS, chest, M.chestPos));
      const forearm = reg(createBone(`foreArm_${sideName}`, fE, upperArm, fS));
      const foreCannon = reg(createBone(`foreCannon_${sideName}`, fC, forearm, fE));
      const forePastern = reg(createBone(`forePastern_${sideName}`, fF, foreCannon, fC));
      const foreHoof = reg(createBone(`foreHoof_${sideName}`, fH, forePastern, fF));

      limbs[`F${sideName}`] = {
        isFore: true,
        side: s,
        upper: upperArm,
        mid: forearm,
        cannon: foreCannon,
        pastern: forePastern,
        hoof: foreHoof,
        restJoints: [fS, fE, fC, fF, fH]
      };

      // Hindlimb (child of pelvis)
      const hH = M.hind.hip.clone().setX(s * M.hind.hip.x);
      const hSt = M.hind.stifle.clone().setX(s * M.hind.stifle.x);
      const hHk = M.hind.hock.clone().setX(s * M.hind.hock.x);
      const hF = M.hind.fetlock.clone().setX(s * M.hind.fetlock.x);
      const hHo = M.hind.hoof.clone().setX(s * M.hind.hoof.x);

      const thigh = reg(createBone(`hindThigh_${sideName}`, hH, pelvis, M.pelvisPos));
      const gaskin = reg(createBone(`hindGaskin_${sideName}`, hSt, thigh, hH));
      const hindCannon = reg(createBone(`hindCannon_${sideName}`, hHk, gaskin, hSt));
      const hindPastern = reg(createBone(`hindPastern_${sideName}`, hF, hindCannon, hHk));
      const hindHoof = reg(createBone(`hindHoof_${sideName}`, hHo, hindPastern, hF));

      limbs[`B${sideName}`] = {
        isFore: false,
        side: s,
        upper: thigh,
        mid: gaskin,
        cannon: hindCannon,
        pastern: hindPastern,
        hoof: hindHoof,
        restJoints: [hH, hSt, hHk, hF, hHo]
      };
    }

    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);
    const boneIndex = {};
    bones.forEach((b, idx) => { boneIndex[b.name] = idx; });

    return {
      root,
      pelvis,
      spineMid,
      chest,
      neckBones,
      head,
      earL,
      earR,
      jaw,
      tailBones,
      limbs,
      bones,
      byName,
      boneIndex,
      skeleton
    };
  }

  // Sample dorsal spine surface point & frame at parameter s in [0, 1] (used for body + mane!)
  function sampleSpineCenter(t) {
    return sampleProfile(SPINE_KEYS, t, ['y', 'z', 'rx', 'ry', 'yOff', 'muzzle', 'bone']);
  }

  // Evaluate anatomical surface point for torso/neck/head at spine parameter t and radial angle theta
  // theta = 0 is dorsal top, pi/2 is left (+X), pi is ventral bottom
  function evalBodySurface(t, theta) {
    const p = sampleSpineCenter(t);
    const c = Math.cos(theta); // +1 dorsal, -1 ventral
    const s = Math.sin(theta); // +1 left, -1 right

    let rx = p.rx;
    let ry = p.ry;
    let yOff = p.yOff;

    // Anatomical shaping by region
    const sin2 = Math.sin(theta * 2);
    const cos2 = Math.cos(theta * 2);

    // 1. Withers crest (smooth monotonic shoulder-to-neck ridge) & Brisket keel
    const withersMask = Math.exp(-Math.pow((t - 0.43) / 0.12, 2));
    const dorsalMask = smoothstep(0.15, 0.95, c);
    const ventralMask = smoothstep(0.15, 0.95, -c);

    // Smooth muscular withers ridge flowing seamlessly into neck base
    ry += withersMask * dorsalMask * 0.036;
    // Deep sternum/brisket keel dropping smoothly between forelegs
    const brisketMask = Math.exp(-Math.pow((t - 0.43) / 0.105, 2));
    ry += brisketMask * ventralMask * 0.082;
    // Slight lateral ribcage flattening + shoulder blade fullness
    const torsoMask = (1 - smoothstep(0.50, 0.58, t)) * smoothstep(0.04, 0.14, t);
    rx *= 1.0 - torsoMask * 0.05 * Math.pow(s, 2);
    // Subtle abdominal tuck before hind flank
    const tuckMask = Math.exp(-Math.pow((t - 0.21) / 0.08, 2));
    ry -= tuckMask * ventralMask * 0.045;
    // Slight croup/pelvis iliac crest prominence
    const croupMask = Math.exp(-Math.pow((t - 0.11) / 0.06, 2));
    rx += croupMask * Math.pow(Math.abs(s), 1.5) * 0.03;

    // 2. Neck teardrop cross-section: narrower dorsal ridge (nuchal ligament), fuller ventral throat
    const neckMask = smoothstep(0.53, 0.60, t) * (1 - smoothstep(0.87, 0.91, t));
    if (neckMask > 0.001) {
      const pinchDorsal = smoothstep(0.0, 0.95, c);
      rx *= 1.0 - neckMask * pinchDorsal * 0.34;
      rx *= 1.0 + neckMask * ventralMask * 0.10;
      // Subtle ventral trachea/muscle ridge
      ry += neckMask * ventralMask * 0.018;
    }

    // 3. Head sculpting (t = 0.90 .. 1.00)
    const headMask = smoothstep(0.89, 0.915, t);
    if (headMask > 0.001) {
      // Cheek / masseter muscle fullness on lower sides of skull
      const cheekMask = Math.exp(-Math.pow((t - 0.928) / 0.018, 2));
      const lowerSide = Math.exp(-Math.pow((Math.abs(theta) - 2.05) / 0.55, 2));
      rx += cheekMask * lowerSide * 0.025;

      // Bony brow ridge & recessed eye socket around t ~ 0.946
      const eyeZMask = Math.exp(-Math.pow((t - 0.946) / 0.013, 2));
      const socketZone = Math.exp(-Math.pow((Math.abs(theta) - 1.25) / 0.28, 2));
      const browZone = Math.exp(-Math.pow((Math.abs(theta) - 0.72) / 0.26, 2));
      rx -= eyeZMask * socketZone * 0.024; // socket recess
      rx += eyeZMask * browZone * 0.022;   // overhanging brow bone

      // Characteristic median forehead boss (dorsal bump between eyes)
      const bossZMask = Math.exp(-Math.pow((t - 0.948) / 0.015, 2));
      ry += bossZMask * Math.pow(Math.max(0, c), 3) * 0.032;

      // Narrow nasal bridge, slightly concave dorsal face profile
      const bridgeMask = Math.exp(-Math.pow((t - 0.972) / 0.014, 2));
      rx *= 1.0 - bridgeMask * Math.pow(Math.max(0, c), 1.5) * 0.18;

      // Flared nostril wings + subtle nostril dimple near t ~ 0.988
      const nostrilZ = Math.exp(-Math.pow((t - 0.986) / 0.008, 2));
      const nostrilWing = Math.exp(-Math.pow((Math.abs(theta) - 0.85) / 0.30, 2));
      const nostrilPit = Math.exp(-Math.pow((Math.abs(theta) - 0.78) / 0.14, 2));
      rx += nostrilZ * nostrilWing * 0.016;
      rx -= nostrilZ * nostrilPit * 0.011;

      // Upper lip overhang at tip
      const lipMask = smoothstep(0.988, 1.0, t);
      ry += lipMask * Math.max(0, c) * 0.012;
    }

    // Compute local tangent for smooth perpendicular cross-section tilt
    const dt = 0.004;
    const pA = sampleSpineCenter(clamp(t - dt, 0, 1));
    const pB = sampleSpineCenter(clamp(t + dt, 0, 1));
    const dz = pB.z - pA.z;
    const dy = pB.y - pA.y;
    const len = Math.hypot(dz, dy) || 1;
    // Tangent in YZ plane: (0, ty, tz); Normal Up in YZ plane: (0, tz, -ty)
    const ty = dy / len;
    const tz = dz / len;
    const uy = tz;
    const uz = -ty;

    const x = s * rx;
    const uCoord = c * ry + yOff;
    const y = p.y + uCoord * uy;
    const z = p.z + uCoord * uz;

    // Region & muzzle metadata + AO
    const ao = 1.0 - 0.16 * ventralMask * (torsoMask + neckMask * 0.5);
    return {
      pos: new THREE.Vector3(x, y, z),
      muzzle: p.muzzle,
      boneFloat: p.bone,
      ao
    };
  }

  // Spine skinning weight helper from continuous boneFloat in [0..9]
  // Bones: 0=pelvis, 1=spineMid, 2=chest, 3..8=neck0..neck5, 9=head
  function getSpineSkinWeights(boneFloat, boneIndicesList) {
    const f = clamp(boneFloat, 0, 9);
    const i0 = Math.floor(f);
    const i1 = Math.min(9, i0 + 1);
    const w1 = smoothstep(0, 1, f - i0);
    const w0 = 1 - w1;
    return {
      indices: [boneIndicesList[i0], boneIndicesList[i1], 0, 0],
      weights: [w0, w1, 0, 0]
    };
  }

  function buildBodySkinnedMesh(skel, coatMat) {
    const spineBoneIndices = [
      skel.boneIndex.pelvis,
      skel.boneIndex.spineMid,
      skel.boneIndex.chest,
      skel.boneIndex.neck0,
      skel.boneIndex.neck1,
      skel.boneIndex.neck2,
      skel.boneIndex.neck3,
      skel.boneIndex.neck4,
      skel.boneIndex.neck5,
      skel.boneIndex.head
    ];

    // Dense non-uniform t sampling for high detail on chest, neck, and head
    const tSamples = [];
    const addRange = (t0, t1, steps) => {
      for (let i = 0; i < steps; i++) {
        tSamples.push(lerp(t0, t1, i / steps));
      }
    };
    addRange(0.00, 0.52, 42); // tailhead -> chest
    addRange(0.52, 0.89, 34); // neck
    addRange(0.89, 1.00, 32); // head -> muzzle
    tSamples.push(1.0);

    const radialSegs = 44;
    const ringVerts = radialSegs + 1;

    const positions = [];
    const restPos = [];
    const regionAttr = [];
    const colors = [];
    const skinIndices = [];
    const skinWeights = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i < tSamples.length; i++) {
      const t = tSamples[i];
      for (let j = 0; j < ringVerts; j++) {
        const u = j / radialSegs;
        const theta = u * Math.PI * 2;
        const sample = evalBodySurface(t, theta);

        positions.push(sample.pos.x, sample.pos.y, sample.pos.z);
        restPos.push(sample.pos.x, sample.pos.y, sample.pos.z);
        regionAttr.push(0, t, Math.cos(theta), sample.muzzle);
        colors.push(sample.ao, sample.ao, sample.ao);
        uvs.push(u, t);

        const sw = getSpineSkinWeights(sample.boneFloat, spineBoneIndices);
        skinIndices.push(...sw.indices);
        skinWeights.push(...sw.weights);
      }
    }

    for (let i = 0; i < tSamples.length - 1; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * ringVerts + j;
        const b = (i + 1) * ringVerts + j;
        const c = (i + 1) * ringVerts + (j + 1);
        const d = i * ringVerts + (j + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    // Cap tailhead (t=0) and muzzle tip (t=1) cleanly
    const tailCenterIdx = positions.length / 3;
    const tailCenter = sampleSpineCenter(0);
    positions.push(0, tailCenter.y, tailCenter.z - 0.03);
    restPos.push(0, tailCenter.y, tailCenter.z - 0.03);
    regionAttr.push(0, 0, 0, 0);
    colors.push(0.85, 0.85, 0.85);
    uvs.push(0.5, 0);
    skinIndices.push(spineBoneIndices[0], 0, 0, 0);
    skinWeights.push(1, 0, 0, 0);
    for (let j = 0; j < radialSegs; j++) {
      indices.push(tailCenterIdx, j, j + 1);
    }

    const tipCenterIdx = positions.length / 3;
    const muzzleEnd = evalBodySurface(1.0, 0);
    positions.push(0, muzzleEnd.pos.y - 0.002, muzzleEnd.pos.z + 0.005);
    restPos.push(0, muzzleEnd.pos.y - 0.002, muzzleEnd.pos.z + 0.005);
    regionAttr.push(0, 1, 0, 1);
    colors.push(0.9, 0.9, 0.9);
    uvs.push(0.5, 1);
    skinIndices.push(spineBoneIndices[9], 0, 0, 0);
    skinWeights.push(1, 0, 0, 0);
    const lastRingStart = (tSamples.length - 1) * ringVerts;
    for (let j = 0; j < radialSegs; j++) {
      indices.push(tipCenterIdx, lastRingStart + j + 1, lastRingStart + j);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPos, 3));
    geo.setAttribute('aRegion', new THREE.Float32BufferAttribute(regionAttr, 4));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.SkinnedMesh(geo, coatMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.bind(skel.skeleton);
    return mesh;
  }

  // Build one continuous high-res anatomical SkinnedMesh leg (fore or hind)
  // Top cuff overlaps cleanly inside chest/pelvis and shares chest/pelvis skin weights!
  function buildLegSkinnedMesh(limb, skel, coatMat) {
    const isFore = limb.isFore;
    const s = limb.side;
    const [J0, J1, J2, J3, J4] = limb.restJoints;
    // J0=shoulder/hip, J1=elbow/stifle, J2=carpus/hock, J3=fetlock, J4=hoofBase

    // Extend cuff slightly above J0 into torso so shoulder/thigh blends organically
    const cuffTop = isFore
      ? J0.clone().add(new THREE.Vector3(-s * 0.095, 0.25, -0.09))
      : J0.clone().add(new THREE.Vector3(-s * 0.095, 0.18, -0.04));

    // Pastern stops at coronet band (y = 0.085) just above the cloven hoof
    const coronet = J3.clone().lerp(J4, 0.68);

    // Key stations along leg parameter u in [0, 1]
    const stations = isFore
      ? [
          { u: 0.00, pos: cuffTop, rx: 0.118, rz: 0.185, zOff: 0.02, bone: 0.0 },
          { u: 0.08, pos: J0.clone().lerp(cuffTop, 0.35), rx: 0.125, rz: 0.168, zOff: 0.015, bone: 0.45 },
          { u: 0.15, pos: J0, rx: 0.120, rz: 0.145, zOff: 0.01, bone: 1.0 }, // shoulder
          { u: 0.24, pos: J0.clone().lerp(J1, 0.55), rx: 0.102, rz: 0.125, zOff: -0.005, bone: 1.45 },
          { u: 0.32, pos: J1, rx: 0.082, rz: 0.105, zOff: -0.018, bone: 2.0 }, // elbow (olecranon back)
          { u: 0.42, pos: J1.clone().lerp(J2, 0.32), rx: 0.068, rz: 0.085, zOff: 0.0, bone: 2.35 },
          { u: 0.52, pos: J1.clone().lerp(J2, 0.78), rx: 0.050, rz: 0.060, zOff: 0.0, bone: 2.75 },
          { u: 0.58, pos: J2, rx: 0.052, rz: 0.064, zOff: 0.010, bone: 3.0 }, // carpus (knee forward)
          { u: 0.65, pos: J2.clone().lerp(J3, 0.20), rx: 0.036, rz: 0.044, zOff: 0.0, bone: 3.22 },
          { u: 0.78, pos: J2.clone().lerp(J3, 0.65), rx: 0.032, rz: 0.040, zOff: 0.0, bone: 3.50 },
          { u: 0.87, pos: J3.clone().lerp(J2, 0.06), rx: 0.035, rz: 0.043, zOff: -0.004, bone: 3.78 },
          { u: 0.91, pos: J3, rx: 0.044, rz: 0.054, zOff: -0.008, bone: 4.0 }, // fetlock
          { u: 0.955, pos: J3.clone().lerp(coronet, 0.5), rx: 0.034, rz: 0.042, zOff: 0.0, bone: 4.25 },
          { u: 1.00, pos: coronet, rx: 0.040, rz: 0.049, zOff: 0.0, bone: 4.5 } // coronet
        ]
      : [
          { u: 0.00, pos: cuffTop, rx: 0.125, rz: 0.205, zOff: -0.01, bone: 0.0 },
          { u: 0.09, pos: J0.clone().lerp(cuffTop, 0.35), rx: 0.135, rz: 0.185, zOff: 0.0, bone: 0.45 },
          { u: 0.16, pos: J0, rx: 0.130, rz: 0.175, zOff: 0.0, bone: 1.0 }, // hip
          { u: 0.26, pos: J0.clone().lerp(J1, 0.55), rx: 0.112, rz: 0.155, zOff: 0.01, bone: 1.45 },
          { u: 0.34, pos: J1, rx: 0.088, rz: 0.125, zOff: 0.022, bone: 2.0 }, // stifle
          { u: 0.43, pos: J1.clone().lerp(J2, 0.35), rx: 0.068, rz: 0.095, zOff: 0.005, bone: 2.35 },
          { u: 0.52, pos: J1.clone().lerp(J2, 0.80), rx: 0.048, rz: 0.068, zOff: -0.008, bone: 2.75 },
          { u: 0.58, pos: J2, rx: 0.048, rz: 0.072, zOff: -0.022, bone: 3.0 }, // hock (calcaneus jutting back!)
          { u: 0.65, pos: J2.clone().lerp(J3, 0.20), rx: 0.036, rz: 0.046, zOff: 0.0, bone: 3.22 },
          { u: 0.78, pos: J2.clone().lerp(J3, 0.65), rx: 0.032, rz: 0.042, zOff: 0.0, bone: 3.50 },
          { u: 0.87, pos: J3.clone().lerp(J2, 0.06), rx: 0.035, rz: 0.044, zOff: -0.004, bone: 3.78 },
          { u: 0.91, pos: J3, rx: 0.044, rz: 0.054, zOff: -0.008, bone: 4.0 }, // fetlock
          { u: 0.955, pos: J3.clone().lerp(coronet, 0.5), rx: 0.034, rz: 0.042, zOff: 0.0, bone: 4.25 },
          { u: 1.00, pos: coronet, rx: 0.040, rz: 0.049, zOff: 0.0, bone: 4.5 } // coronet
        ];

    const parentTorsoBone = isFore ? skel.boneIndex.chest : skel.boneIndex.pelvis;
    const limbBoneChain = [
      parentTorsoBone,
      skel.boneIndex[limb.upper.name],
      skel.boneIndex[limb.mid.name],
      skel.boneIndex[limb.cannon.name],
      skel.boneIndex[limb.pastern.name]
    ];

    // Smooth Catmull-Rom curve through station positions
    const curvePts = stations.map(st => st.pos);
    const legCurve = new THREE.CatmullRomCurve3(curvePts, false, 'catmullrom', 0.35);

    const axialSegs = 72;
    const radialSegs = 28;
    const ringVerts = radialSegs + 1;

    const positions = [];
    const restPos = [];
    const regionAttr = [];
    const colors = [];
    const uvs = [];
    const skinIndices = [];
    const skinWeights = [];
    const indices = [];

    const stationKeys = stations.map(st => ({
      t: st.u,
      rx: st.rx,
      rz: st.rz,
      zOff: st.zOff,
      bone: st.bone
    }));

    for (let i = 0; i <= axialSegs; i++) {
      const u = i / axialSegs;
      const center = legCurve.getPoint(u);
      const tangent = legCurve.getTangent(u).normalize();
      const props = sampleProfile(stationKeys, u, ['rx', 'rz', 'zOff', 'bone']);

      // Build stable frame: +X lateral, Z forward-ish perpendicular to tangent
      const lateral = new THREE.Vector3(1, 0, 0);
      const fwd = new THREE.Vector3().crossVectors(lateral, tangent).normalize();
      const rightLat = new THREE.Vector3().crossVectors(tangent, fwd).normalize();

      // Bone blend along chain [0..4]
      const bf = clamp(props.bone, 0, 4);
      const b0 = Math.floor(bf);
      const b1 = Math.min(4, b0 + 1);
      const bw1 = smoothstep(0, 1, bf - b0);
      const bw0 = 1 - bw1;

      for (let j = 0; j < ringVerts; j++) {
        const v = j / radialSegs;
        const ang = v * Math.PI * 2;
        const ca = Math.cos(ang); // +1 front (+Z), -1 back (-Z)
        const sa = Math.sin(ang); // +1 outer/left

        // Subtle cannon posterior tendon groove
        const cannonZone = smoothstep(0.60, 0.68, u) * (1 - smoothstep(0.84, 0.90, u));
        const backGroove = cannonZone * Math.exp(-Math.pow((Math.abs(sa) - 0.55) / 0.28, 2)) * Math.max(0, -ca) * 0.005;

        const rLat = props.rx - backGroove;
        const rFwd = props.rz;

        const p = center.clone()
          .addScaledVector(rightLat, sa * rLat)
          .addScaledVector(fwd, ca * rFwd + props.zOff);

        positions.push(p.x, p.y, p.z);
        restPos.push(p.x, p.y, p.z);
        regionAttr.push(1.0, u, ca, 0.0);

        // Subtle inner-leg AO shading
        const innerSide = sa * s < 0 ? Math.abs(sa) : 0;
        const ao = 1.0 - innerSide * 0.16 * (1 - smoothstep(0.15, 0.65, u));
        colors.push(ao, ao, ao);
        uvs.push(v, u);

        skinIndices.push(limbBoneChain[b0], limbBoneChain[b1], 0, 0);
        skinWeights.push(bw0, bw1, 0, 0);
      }
    }

    for (let i = 0; i < axialSegs; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * ringVerts + j;
        const b = (i + 1) * ringVerts + j;
        const c = (i + 1) * ringVerts + (j + 1);
        const d = i * ringVerts + (j + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPos, 3));
    geo.setAttribute('aRegion', new THREE.Float32BufferAttribute(regionAttr, 4));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.SkinnedMesh(geo, coatMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.bind(skel.skeleton);
    return mesh;
  }

  // Cloven Hoof Mesh (2 distinct toes attached cleanly to pastern bone)
  function buildClovenHoof(hoofMat) {
    const group = new THREE.Group();

    function buildClaw(sideSign) {
      // Sculpted ungual claw: broad rounded front wall, flat ground sole, cleft inner wall
      const segsR = 16;
      const segsY = 8;
      const positions = [];
      const uvs = [];
      const indices = [];

      for (let iy = 0; iy <= segsY; iy++) {
        const ty = iy / segsY; // 0 = sole (y=0), 1 = coronet (y=0.095)
        const y = ty * 0.095;
        // Hoof flares outward slightly toward ground
        const rx = lerp(0.023, 0.017, ty);
        const rz = lerp(0.052, 0.036, ty);
        const zShift = lerp(0.018, -0.008, ty); // slopes forward at ground

        for (let ir = 0; ir <= segsR; ir++) {
          const ang = (ir / segsR) * Math.PI * 2;
          let x = Math.sin(ang) * rx;
          let z = Math.cos(ang) * rz + zShift;

          // Flatten inner interdigital cleft side
          if (x * sideSign < 0) {
            x *= 0.42;
          }
          // Taper front toe cleanly
          if (z > zShift) {
            x *= lerp(1.0, 0.78, (z - zShift) / rz);
          }

          positions.push(x + sideSign * 0.020, y, z);
          uvs.push(ir / segsR, ty);
        }
      }

      const ring = segsR + 1;
      for (let iy = 0; iy < segsY; iy++) {
        for (let ir = 0; ir < segsR; ir++) {
          const a = iy * ring + ir;
          const b = (iy + 1) * ring + ir;
          const c = (iy + 1) * ring + ir + 1;
          const d = iy * ring + ir + 1;
          indices.push(a, d, b);
          indices.push(b, d, c);
        }
      }

      // Close bottom sole
      const soleIdx = positions.length / 3;
      positions.push(sideSign * 0.018, 0.0, 0.015);
      uvs.push(0.5, 0);
      for (let ir = 0; ir < segsR; ir++) {
        indices.push(soleIdx, ir, ir + 1);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const claw = new THREE.Mesh(geo, hoofMat);
      claw.castShadow = true;
      claw.receiveShadow = true;
      return claw;
    }

    group.add(buildClaw(-1));
    group.add(buildClaw(1));

    return group;
  }

  // Sculpted Head Appendages: Ossicones, Ears, Eyes + Eyelids + Eyelashes, Nostrils
  function buildHeadAppendages(skel, coatMat, eyeMat, corneaMat, hairMat) {
    const headBone = skel.head;
    const M = MEASUREMENTS;
    const toHeadLocal = (worldV) => worldV.clone().sub(M.headPos);

    // Helper to add aRegion/aRestPos/color attributes to regular head meshes sharing coatMat
    function prepCoatGeometry(geo, worldOffset, regionZFunc) {
      const pos = geo.attributes.position;
      const count = pos.count;
      const rest = new Float32Array(count * 3);
      const reg = new Float32Array(count * 4);
      const col = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        rest[i * 3] = vx + worldOffset.x;
        rest[i * 3 + 1] = vy + worldOffset.y;
        rest[i * 3 + 2] = vz + worldOffset.z;
        const zVal = regionZFunc ? regionZFunc(vx, vy, vz) : 0;
        reg[i * 4] = 2.0; // head appendage
        reg[i * 4 + 1] = 1.0;
        reg[i * 4 + 2] = zVal;
        reg[i * 4 + 3] = 0.0;
        col[i * 3] = 0.95;
        col[i * 3 + 1] = 0.95;
        col[i * 3 + 2] = 0.95;
      }
      geo.setAttribute('aRestPos', new THREE.BufferAttribute(rest, 3));
      geo.setAttribute('aRegion', new THREE.BufferAttribute(reg, 4));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }

    // 1. Pair of Ossicones + subtle median frontal ossicone bump
    for (const side of [-1, 1]) {
      const ossiGroup = new THREE.Group();
      const baseWorld = new THREE.Vector3(side * 0.055, 4.95, 1.75);
      ossiGroup.position.copy(toHeadLocal(baseWorld));
      ossiGroup.rotation.set(-0.34, 0, -side * 0.16);

      // Lathe sculpted ossicone shaft + flared base + bulbous dark tufted knob
      const pts = [
        new THREE.Vector2(0.036, -0.02),
        new THREE.Vector2(0.026, 0.03),
        new THREE.Vector2(0.019, 0.11),
        new THREE.Vector2(0.018, 0.175),
        new THREE.Vector2(0.025, 0.205),
        new THREE.Vector2(0.022, 0.228),
        new THREE.Vector2(0.002, 0.240)
      ];
      const geo = new THREE.LatheGeometry(pts, 16);
      prepCoatGeometry(geo, baseWorld, (x, y, z) => -smoothstep(0.06, 0.22, y));
      const mesh = new THREE.Mesh(geo, coatMat);
      mesh.castShadow = true;
      ossiGroup.add(mesh);

      // Dark fuzzy hair cap blending seamlessly over the ossicone knob
      const tuftGeo = new THREE.SphereGeometry(0.027, 14, 10);
      tuftGeo.scale(1.0, 1.15, 1.0);
      const tuft = new THREE.Mesh(tuftGeo, new THREE.MeshStandardMaterial({
        color: 0x221610,
        roughness: 0.95,
        metalness: 0.0
      }));
      tuft.position.set(0, 0.214, 0);
      ossiGroup.add(tuft);

      headBone.add(ossiGroup);
    }

    // Median frontal ossicone bump
    const medianGeo = new THREE.SphereGeometry(0.024, 12, 10);
    medianGeo.scale(0.85, 1.0, 1.35);
    const medianWorld = new THREE.Vector3(0, 4.86, 1.91);
    prepCoatGeometry(medianGeo, medianWorld, () => 0.0);
    const medianMesh = new THREE.Mesh(medianGeo, coatMat);
    medianMesh.position.copy(toHeadLocal(medianWorld));
    headBone.add(medianMesh);

    // 2. Sculpted Cupped Ears (parented to earL, earR)
    function buildEar(earBone, side) {
      const segU = 14;
      const segV = 12;
      const positions = [];
      const restPos = [];
      const regionAttr = [];
      const colors = [];
      const uvs = [];
      const indices = [];

      const earWorld = new THREE.Vector3(side * 0.125, 4.91, 1.66);

      for (let iu = 0; iu <= segU; iu++) {
        const u = iu / segU; // 0 = base at skull, 1 = pointed ear tip
        const len = u * 0.27;
        const width = Math.sin(Math.pow(u, 0.72) * Math.PI) * 0.062 + (1 - u) * 0.015;
        const thickness = lerp(0.014, 0.003, u);

        for (let iv = 0; iv <= segV; iv++) {
          const v = iv / segV;
          const ang = v * Math.PI * 2;
          const ca = Math.cos(ang); // +1 front/inner concave side, -1 back outer side
          const sa = Math.sin(ang); // width across ear blade

          // Cupped pinna shape: front side is concave, back side convex
          const cupDepth = Math.pow(1 - Math.abs(sa), 1.4) * 0.020 * Math.sin(u * Math.PI);
          const xLocal = side * len;
          const yLocal = sa * width;
          const zLocal = ca * thickness - cupDepth + Math.sin(u * Math.PI) * 0.018;

          positions.push(xLocal, yLocal, zLocal);
          restPos.push(earWorld.x + xLocal, earWorld.y + yLocal, earWorld.z + zLocal);

          const isInner = ca > 0.15 ? smoothstep(0.15, 0.85, ca) * Math.sin(u * Math.PI) : 0.0;
          regionAttr.push(2.0, u, isInner, 0.0);
          const ao = 1.0 - isInner * 0.18;
          colors.push(ao, ao, ao);
          uvs.push(v, u);
        }
      }

      const ring = segV + 1;
      for (let iu = 0; iu < segU; iu++) {
        for (let iv = 0; iv < segV; iv++) {
          const a = iu * ring + iv;
          const b = (iu + 1) * ring + iv;
          const c = (iu + 1) * ring + iv + 1;
          const d = iu * ring + iv + 1;
          if (side > 0) {
            indices.push(a, d, b);
            indices.push(b, d, c);
          } else {
            indices.push(a, b, d);
            indices.push(b, c, d);
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPos, 3));
      geo.setAttribute('aRegion', new THREE.BufferAttribute(new Float32Array(regionAttr), 4));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const earMesh = new THREE.Mesh(geo, coatMat);
      earMesh.castShadow = true;
      // Natural outward-and-slightly-back ear pose
      earBone.rotation.set(0.25, -side * 0.35, -side * 0.15);
      earBone.add(earMesh);
    }

    buildEar(skel.earL, 1);
    buildEar(skel.earR, -1);

    // 3. Multi-layered Glossy Eyes + Blinking Eyelids + Long Dark Eyelashes
    const eyelids = [];
    const darkSkinMat = new THREE.MeshStandardMaterial({
      color: 0x261d17,
      roughness: 0.72,
      metalness: 0.02
    });
    const lashMat = new THREE.MeshStandardMaterial({
      color: 0x120c08,
      roughness: 0.85
    });

    for (const side of [-1, 1]) {
      const eyeGroup = new THREE.Group();
      const eyeWorld = new THREE.Vector3(side * 0.098, 4.815, 1.915);
      eyeGroup.position.copy(toHeadLocal(eyeWorld));
      // Orient eye laterally + slightly forward so iris looks outward/forward naturally
      eyeGroup.rotation.y = side * 1.05;
      eyeGroup.rotation.x = 0.08;

      // Inner textured eyeball (iris faces +Z of eyeGroup)
      const eyeGeo = new THREE.SphereGeometry(0.027, 22, 18);
      eyeGeo.rotateY(-Math.PI / 2); // center UV iris at +Z
      const eyeball = new THREE.Mesh(eyeGeo, eyeMat);
      eyeGroup.add(eyeball);

      // Outer glossy cornea dome
      const corneaGeo = new THREE.SphereGeometry(0.0282, 20, 16);
      const cornea = new THREE.Mesh(corneaGeo, corneaMat);
      eyeGroup.add(cornea);

      // Upper blinking eyelid hood
      const lidPivot = new THREE.Group();
      const upperLidGeo = new THREE.SphereGeometry(0.0305, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
      const upperLid = new THREE.Mesh(upperLidGeo, darkSkinMat);
      upperLid.rotation.x = -0.35;
      lidPivot.add(upperLid);

      // Fan of long curved giraffe eyelashes along upper eyelid rim
      for (let k = -6; k <= 6; k++) {
        const t = k / 6;
        const lashGeo = new THREE.ConeGeometry(0.0014, 0.017 - Math.abs(t) * 0.005, 4);
        lashGeo.translate(0, 0.0085, 0);
        const lash = new THREE.Mesh(lashGeo, lashMat);
        const az = t * 0.78;
        lash.position.set(
          Math.sin(az) * 0.030,
          0.007 - Math.abs(t) * 0.005,
          Math.cos(az) * 0.030
        );
        lash.rotation.set(1.05, az * 0.6, -t * 0.25);
        lidPivot.add(lash);
      }

      // Open rest angle for upper eyelid
      lidPivot.rotation.x = -0.52;
      eyeGroup.add(lidPivot);
      eyelids.push(lidPivot);

      // Subtle lower eyelid rim
      const lowerLidGeo = new THREE.SphereGeometry(0.0302, 16, 8, 0, Math.PI * 2, Math.PI * 0.56, Math.PI * 0.44);
      const lowerLid = new THREE.Mesh(lowerLidGeo, darkSkinMat);
      lowerLid.rotation.x = 0.25;
      eyeGroup.add(lowerLid);

      headBone.add(eyeGroup);
    }

    // 4. Sculpted Dark Nostril Cavities recessed neatly on Muzzle
    for (const side of [-1, 1]) {
      const nosGeo = new THREE.SphereGeometry(0.013, 10, 8);
      nosGeo.scale(0.45, 0.85, 1.5);
      const nosWorld = new THREE.Vector3(side * 0.042, 4.612, 2.252);
      const nosMesh = new THREE.Mesh(nosGeo, lashMat);
      nosMesh.position.copy(toHeadLocal(nosWorld));
      nosMesh.rotation.set(0.32, side * 0.55, side * 0.25);
      headBone.add(nosMesh);
    }

    return { eyelids };
  }

  // Dorsal Neck Mane SkinnedMesh (stiff upright chestnut-umber bristle tufts along neck dorsal crest)
  function buildManeSkinnedMesh(skel, hairMat) {
    const spineBoneIndices = [
      skel.boneIndex.pelvis,
      skel.boneIndex.spineMid,
      skel.boneIndex.chest,
      skel.boneIndex.neck0,
      skel.boneIndex.neck1,
      skel.boneIndex.neck2,
      skel.boneIndex.neck3,
      skel.boneIndex.neck4,
      skel.boneIndex.neck5,
      skel.boneIndex.head
    ];

    const tuftCount = 130;
    const positions = [];
    const uvs = [];
    const skinIndices = [];
    const skinWeights = [];
    const indices = [];

    for (let i = 0; i < tuftCount; i++) {
      const frac = i / (tuftCount - 1);
      const t = lerp(0.47, 0.895, frac); // withers up to nuchal crest
      const surf = evalBodySurface(t, 0.0); // dorsal crest

      // Tangent direction along neck
      const pA = sampleSpineCenter(t - 0.004);
      const pB = sampleSpineCenter(t + 0.004);
      const tangent = new THREE.Vector3(0, pB.y - pA.y, pB.z - pA.z).normalize();
      const dorsalUp = new THREE.Vector3(0, tangent.z, -tangent.y).normalize();

      const tuftHeight = lerp(0.055, 0.105, Math.sin(frac * Math.PI * 0.88)) *
        (0.88 + ((i * 37) % 10) * 0.025);
      const tuftWidth = 0.068;
      const latOffset = ((i % 2 === 0 ? 1 : -1) * 0.006) + (((i * 19) % 7) - 3) * 0.0012;
      const leanAngle = ((i % 3) - 1) * 0.12;

      const root = surf.pos.clone()
        .add(new THREE.Vector3(latOffset, 0, 0))
        .addScaledVector(dorsalUp, -0.022);

      const dir = dorsalUp.clone()
        .addScaledVector(tangent, -0.35)
        .add(new THREE.Vector3(leanAngle * 0.35, 0, 0))
        .normalize();

      const tip = root.clone().addScaledVector(dir, tuftHeight);

      // Build crossed two-plane hair card per tuft for 3D fullness from every angle
      const planes = [
        tangent.clone().multiplyScalar(tuftWidth * 0.52),
        new THREE.Vector3(tuftWidth * 0.30, 0, 0)
      ];

      const sw = getSpineSkinWeights(surf.boneFloat, spineBoneIndices);

      for (const halfSpan of planes) {
        const baseIdx = positions.length / 3;
        const p0 = root.clone().sub(halfSpan);
        const p1 = root.clone().add(halfSpan);
        const p2 = tip.clone().addScaledVector(halfSpan, 0.72);
        const p3 = tip.clone().addScaledVector(halfSpan, -0.72);

        for (const pt of [p0, p1, p2, p3]) {
          positions.push(pt.x, pt.y, pt.z);
          skinIndices.push(...sw.indices);
          skinWeights.push(...sw.weights);
        }
        uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
        indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
        indices.push(baseIdx, baseIdx + 2, baseIdx + 3);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.SkinnedMesh(geo, hairMat);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.bind(skel.skeleton);
    return mesh;
  }

  // Tail Dock + Terminal Black Tassel (skinned to pelvis & tail0..tail3)
  function buildTailSkinnedMeshes(skel, coatMat, hairMat) {
    const tailBoneIndices = [
      skel.boneIndex.pelvis,
      skel.boneIndex.tail0,
      skel.boneIndex.tail1,
      skel.boneIndex.tail2,
      skel.boneIndex.tail3
    ];

    const pts = [
      new THREE.Vector3(0, 2.23, -0.90),
      ...MEASUREMENTS.tailPoints
    ];
    const curve = new THREE.CatmullRomCurve3(pts);

    const segsY = 26;
    const segsR = 12;
    const ring = segsR + 1;

    const positions = [];
    const restPos = [];
    const regionAttr = [];
    const colors = [];
    const uvs = [];
    const skinIndices = [];
    const skinWeights = [];
    const indices = [];

    for (let i = 0; i <= segsY; i++) {
      const u = i / segsY;
      const c = curve.getPoint(u);
      const r = lerp(0.036, 0.013, Math.pow(u, 0.7));
      const bf = u * 4.0;
      const b0 = Math.min(4, Math.floor(bf));
      const b1 = Math.min(4, b0 + 1);
      const w1 = bf - b0;
      const w0 = 1 - w1;

      for (let j = 0; j <= segsR; j++) {
        const v = j / segsR;
        const ang = v * Math.PI * 2;
        const x = c.x + Math.sin(ang) * r;
        const z = c.z + Math.cos(ang) * r;
        positions.push(x, c.y, z);
        restPos.push(x, c.y, z);
        regionAttr.push(0, 0, 0, u > 0.72 ? smoothstep(0.72, 1.0, u) : 0);
        colors.push(0.92, 0.92, 0.92);
        uvs.push(v, u);
        skinIndices.push(tailBoneIndices[b0], tailBoneIndices[b1], 0, 0);
        skinWeights.push(w0, w1, 0, 0);
      }
    }

    for (let i = 0; i < segsY; i++) {
      for (let j = 0; j < segsR; j++) {
        const a = i * ring + j;
        const b = (i + 1) * ring + j;
        const c = (i + 1) * ring + j + 1;
        const d = i * ring + j + 1;
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const dockGeo = new THREE.BufferGeometry();
    dockGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    dockGeo.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPos, 3));
    dockGeo.setAttribute('aRegion', new THREE.Float32BufferAttribute(regionAttr, 4));
    dockGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    dockGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    dockGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    dockGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    dockGeo.setIndex(indices);
    dockGeo.computeVertexNormals();

    const dockMesh = new THREE.SkinnedMesh(dockGeo, coatMat);
    dockMesh.castShadow = true;
    dockMesh.frustumCulled = false;
    dockMesh.bind(skel.skeleton);

    // Terminal coarse black hair tassel attached to tail3
    const tasselGroup = new THREE.Group();
    const cardCount = 10;
    const tPos = [];
    const tUvs = [];
    const tIdx = [];
    for (let k = 0; k < cardCount; k++) {
      const ang = (k / cardCount) * Math.PI;
      const wTop = 0.011;
      const wBot = 0.038;
      const len = 0.40 + (k % 3) * 0.04;
      const cx = Math.cos(ang);
      const cz = Math.sin(ang);
      const base = tPos.length / 3;
      tPos.push(-cx * wTop, 0.03, -cz * wTop);
      tPos.push(cx * wTop, 0.03, cz * wTop);
      tPos.push(cx * wBot, -len, cz * wBot);
      tPos.push(-cx * wBot, -len, -cz * wBot);
      // flipY=true: v=0 is canvas bottom (dense root), v=1 is canvas top (wispy hair tips)
      tUvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      tIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const tasselGeo = new THREE.BufferGeometry();
    tasselGeo.setAttribute('position', new THREE.Float32BufferAttribute(tPos, 3));
    tasselGeo.setAttribute('uv', new THREE.Float32BufferAttribute(tUvs, 2));
    tasselGeo.setIndex(tIdx);
    tasselGeo.computeVertexNormals();
    const tasselMesh = new THREE.Mesh(tasselGeo, hairMat);
    tasselMesh.castShadow = true;
    tasselGroup.add(tasselMesh);
    skel.tailBones[3].add(tasselGroup);

    return { dockMesh };
  }

  function createGiraffe(species = 'reticulated') {
    const skel = buildSkeleton();
    const coatMat = G.CoatShader.createCoatMaterial(species);
    const hoofMat = G.CoatShader.createHoofMaterial();
    const maneMat = G.CoatShader.createHairMaterial('#4a2611', '#1b0d06');
    const tailHairMat = G.CoatShader.createHairMaterial('#1d140e', '#090604');
    const eyeTex = G.CoatShader.createEyeTexture();
    const eyeMat = new THREE.MeshStandardMaterial({
      map: eyeTex,
      roughness: 0.35,
      metalness: 0.0
    });
    const corneaMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.07,
      roughness: 0.02,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      depthWrite: false
    });

    const giraffeGroup = new THREE.Group();
    giraffeGroup.name = 'Giraffe';
    giraffeGroup.add(skel.root);

    const bodyMesh = buildBodySkinnedMesh(skel, coatMat);
    giraffeGroup.add(bodyMesh);

    const legMeshes = [];
    for (const key of ['FL', 'FR', 'BL', 'BR']) {
      const limb = skel.limbs[key];
      const legMesh = buildLegSkinnedMesh(limb, skel, coatMat);
      giraffeGroup.add(legMesh);
      legMeshes.push(legMesh);

      const hoofMesh = buildClovenHoof(hoofMat);
      limb.hoof.add(hoofMesh);
    }

    const { eyelids } = buildHeadAppendages(skel, coatMat, eyeMat, corneaMat, maneMat);
    const maneMesh = buildManeSkinnedMesh(skel, maneMat);
    giraffeGroup.add(maneMesh);

    const { dockMesh } = buildTailSkinnedMeshes(skel, coatMat, tailHairMat);
    giraffeGroup.add(dockMesh);

    // Optional debug skeleton helper
    const skeletonHelper = new THREE.SkeletonHelper(skel.root);
    skeletonHelper.visible = false;
    giraffeGroup.add(skeletonHelper);

    return {
      group: giraffeGroup,
      skeleton: skel,
      coatMaterial: coatMat,
      eyelids,
      skeletonHelper
    };
  }

  G.Anatomy = {
    MEASUREMENTS,
    createGiraffe
  };
})(window);
