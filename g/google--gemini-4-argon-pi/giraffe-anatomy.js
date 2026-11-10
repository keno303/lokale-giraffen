// giraffe-anatomy.js
// Anatomically sculpted continuous SkinnedMesh & hierarchical Skeleton builder for Giraffa camelopardalis

(function (global) {
  'use strict';

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(x, min, max) {
    return Math.max(min, Math.min(max, x));
  }

  // Evaluate smooth Catmull-Rom spline through control points of arbitrary dimension
  function sampleCatmullRom(points, t) {
    const n = points.length - 1;
    const scaled = Math.max(0, Math.min(n - 0.00001, t * n));
    const i = Math.floor(scaled);
    const f = scaled - i;

    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[Math.min(n, i + 1)];
    const p3 = points[Math.min(n, i + 2)];

    const f2 = f * f;
    const f3 = f2 * f;

    const out = {};
    for (const key of Object.keys(p1)) {
      const v0 = p0[key];
      const v1 = p1[key];
      const v2 = p2[key];
      const v3 = p3[key];
      out[key] = 0.5 * (
        (2 * v1) +
        (-v0 + v2) * f +
        (2 * v0 - 5 * v1 + 4 * v2 - v3) * f2 +
        (-v0 + 3 * v1 - 3 * v2 + v3) * f3
      );
    }
    return out;
  }

  // Convert continuous bone float coordinate into 4 bone indices & normalized Hermite weights
  function computeSkinWeightsFromSegment(segFloat, boneIndexList) {
    const maxSeg = boneIndexList.length - 1;
    const clamped = Math.max(0, Math.min(maxSeg - 0.0001, segFloat));
    const i0 = Math.floor(clamped);
    const i1 = Math.min(maxSeg, i0 + 1);
    const frac = clamped - i0;
    const w1 = frac * frac * (3 - 2 * frac);
    const w0 = 1.0 - w1;
    return {
      indices: [boneIndexList[i0], boneIndexList[i1], 0, 0],
      weights: [w0, w1, 0, 0]
    };
  }

  // Build the complete hierarchical THREE.Bone rig in standing anatomical bind pose
  function createGiraffeSkeleton() {
    const bones = [];
    const boneMap = {};

    function makeBone(name, parent, worldPos) {
      const b = new THREE.Bone();
      b.name = name;
      b.userData.bindWorldPos = worldPos.clone();
      if (parent) {
        parent.add(b);
        const parentWorld = parent.userData.bindWorldPos;
        b.position.copy(worldPos).sub(parentWorld);
      } else {
        b.position.copy(worldPos);
      }
      b.userData.restPosition = b.position.clone();
      b.userData.restQuaternion = b.quaternion.clone();
      boneMap[name] = b;
      bones.push(b);
      return b;
    }

    // 1. Root & Axial Spine (Pelvis -> Lumbar -> Thorax/Withers)
    const root = makeBone('root', null, new THREE.Vector3(0, 0, 0));
    const pelvis = makeBone('pelvis', root, new THREE.Vector3(0, 2.28, -0.64));
    const spineLumbar = makeBone('spine_lumbar', pelvis, new THREE.Vector3(0, 2.54, -0.12));
    const spineThorax = makeBone('spine_thorax', spineLumbar, new THREE.Vector3(0, 2.74, 0.46));

    // 2. Cervical Neck Chain (7 segments C7 -> C1 along the 53-degree giraffe neck)
    const neckCoords = [
      new THREE.Vector3(0, 2.86, 0.56), // neck_0 (C7 base at withers/chest)
      new THREE.Vector3(0, 3.17, 0.76), // neck_1 (C6)
      new THREE.Vector3(0, 3.49, 0.96), // neck_2 (C5)
      new THREE.Vector3(0, 3.81, 1.15), // neck_3 (C4 mid-neck)
      new THREE.Vector3(0, 4.12, 1.33), // neck_4 (C3)
      new THREE.Vector3(0, 4.41, 1.49), // neck_5 (C2 axis)
      new THREE.Vector3(0, 4.66, 1.62)  // neck_6 (C1 atlas / throatlatch)
    ];
    let prevNeck = spineThorax;
    for (let i = 0; i < neckCoords.length; i++) {
      prevNeck = makeBone(`neck_${i}`, prevNeck, neckCoords[i]);
    }

    // 3. Head, Jaw & Ears
    const head = makeBone('head', prevNeck, new THREE.Vector3(0, 4.72, 1.66));
    makeBone('jaw', head, new THREE.Vector3(0, 4.61, 1.75));
    makeBone('ear_L', head, new THREE.Vector3(0.105, 4.73, 1.66));
    makeBone('ear_R', head, new THREE.Vector3(-0.105, 4.73, 1.66));

    // 4. Articulated Tail (5 coccygeal bones hanging from sacrum/rump to hock level)
    const tailCoords = [
      new THREE.Vector3(0, 2.34, -0.88),
      new THREE.Vector3(0, 2.08, -0.94),
      new THREE.Vector3(0, 1.78, -0.97),
      new THREE.Vector3(0, 1.48, -0.98),
      new THREE.Vector3(0, 1.18, -0.98)
    ];
    let prevTail = pelvis;
    for (let i = 0; i < tailCoords.length; i++) {
      prevTail = makeBone(`tail_${i}`, prevTail, tailCoords[i]);
    }

    // 5. Forelimbs (Left +X, Right -X)
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const scapula = makeBone(`scapula_${side}`, spineThorax, new THREE.Vector3(s * 0.21, 2.66, 0.48));
      const shoulder = makeBone(`shoulder_${side}`, scapula, new THREE.Vector3(s * 0.22, 2.24, 0.60));
      const elbow = makeBone(`elbow_${side}`, shoulder, new THREE.Vector3(s * 0.22, 1.80, 0.42));
      const carpus = makeBone(`carpus_${side}`, elbow, new THREE.Vector3(s * 0.215, 1.02, 0.47));
      const fetlock = makeBone(`fetlock_${side}`, carpus, new THREE.Vector3(s * 0.21, 0.24, 0.48));
      const pastern = makeBone(`pastern_${side}`, fetlock, new THREE.Vector3(s * 0.21, 0.10, 0.54));
      makeBone(`hoof_${side}`, pastern, new THREE.Vector3(s * 0.21, 0.0, 0.58));
    }

    // 6. Hindlimbs (Left +X, Right -X)
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const hip = makeBone(`hip_${side}`, pelvis, new THREE.Vector3(s * 0.20, 2.22, -0.66));
      const stifle = makeBone(`stifle_${side}`, hip, new THREE.Vector3(s * 0.22, 1.66, -0.44));
      const hock = makeBone(`hock_${side}`, stifle, new THREE.Vector3(s * 0.205, 0.98, -0.72));
      const fetlock = makeBone(`hind_fetlock_${side}`, hock, new THREE.Vector3(s * 0.20, 0.23, -0.70));
      const pastern = makeBone(`hind_pastern_${side}`, fetlock, new THREE.Vector3(s * 0.20, 0.10, -0.64));
      makeBone(`hind_hoof_${side}`, pastern, new THREE.Vector3(s * 0.20, 0.0, -0.60));
    }

    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(bones);

    const boneIndexMap = {};
    bones.forEach((b, idx) => {
      boneIndexMap[b.name] = idx;
    });

    return { root, bones, boneMap, boneIndexMap, skeleton };
  }

  // Build the unified continuous Axial Body + Neck + Head + Muzzle SkinnedMesh
  // Uses strictly monotonic Z stations and vertical (X, Y) cross-section slices so rings NEVER fold or self-intersect!
  function buildAxialBodyGeometry(boneIndexMap) {
    const axialBones = [
      boneIndexMap['pelvis'],       // 0
      boneIndexMap['spine_lumbar'], // 1
      boneIndexMap['spine_thorax'], // 2
      boneIndexMap['neck_0'],       // 3
      boneIndexMap['neck_1'],       // 4
      boneIndexMap['neck_2'],       // 5
      boneIndexMap['neck_3'],       // 6
      boneIndexMap['neck_4'],       // 7
      boneIndexMap['neck_5'],       // 8
      boneIndexMap['neck_6'],       // 9
      boneIndexMap['head']          // 10
    ];

    // Note: Because cross-sections are vertical (X, Y) slices at each Z, along the 54-deg inclined neck
    // a vertical slice height ry = r_perp / cos(54 deg) = 1.68 * r_perp gives the exact perpendicular neck thickness!
    const stations = [
      // Rump & Croup (z = -0.90 .. -0.64) - closed watertight start at v=0.00
      { v: 0.00, y: 2.33, z: -0.90, rx: 0.001, ryTop: 0.001, ryBot: 0.001, dorsalPinch: 0.0, ventralPinch: 0.0, sideBulge: 0.00, eyeSocket: 0.0, boneSeg: 0.0 },
      { v: 0.04, y: 2.33, z: -0.82, rx: 0.22, ryTop: 0.23, ryBot: 0.23, dorsalPinch: -0.10, ventralPinch: 0.00, sideBulge: 0.14, eyeSocket: 0.0, boneSeg: 0.0 },
      { v: 0.09, y: 2.33, z: -0.64, rx: 0.31, ryTop: 0.28, ryBot: 0.27, dorsalPinch: -0.08, ventralPinch: 0.04, sideBulge: 0.18, eyeSocket: 0.0, boneSeg: 0.1 },

      // Abdomen / Flank / Lumbar (z = -0.38 .. -0.10) - athletic tucked-up waist rising into sloping back
      { v: 0.15, y: 2.38, z: -0.38, rx: 0.33, ryTop: 0.34, ryBot: 0.29, dorsalPinch: 0.10, ventralPinch: -0.04, sideBulge: 0.14, eyeSocket: 0.0, boneSeg: 0.6 },
      { v: 0.22, y: 2.45, z: -0.10, rx: 0.36, ryTop: 0.42, ryBot: 0.36, dorsalPinch: 0.18, ventralPinch: 0.06, sideBulge: 0.16, eyeSocket: 0.0, boneSeg: 1.1 },

      // Ribcage / Deep Thorax / Steeply Sloping Withers Hump (z = 0.20 .. 0.56)
      { v: 0.29, y: 2.53, z: 0.20,  rx: 0.37, ryTop: 0.52, ryBot: 0.43, dorsalPinch: 0.28, ventralPinch: 0.18, sideBulge: 0.14, eyeSocket: 0.0, boneSeg: 1.65 },
      { v: 0.36, y: 2.63, z: 0.45,  rx: 0.34, ryTop: 0.55, ryBot: 0.49, dorsalPinch: 0.35, ventralPinch: 0.22, sideBulge: 0.12, eyeSocket: 0.0, boneSeg: 2.05 },
      { v: 0.41, y: 2.82, z: 0.59,  rx: 0.25, ryTop: 0.42, ryBot: 0.40, dorsalPinch: 0.30, ventralPinch: 0.18, sideBulge: 0.04, eyeSocket: 0.0, boneSeg: 2.75 },

      // Cervical Neck C7 -> C1 (z = 0.71 .. 1.63) - subtle graceful S-curve (steep mid-neck arching into poll)
      { v: 0.46, y: 3.04, z: 0.71,  rx: 0.20,  ryTop: 0.34, ryBot: 0.31, dorsalPinch: 0.25, ventralPinch: 0.14, sideBulge: -0.04, eyeSocket: 0.0, boneSeg: 3.4 },
      { v: 0.52, y: 3.32, z: 0.86,  rx: 0.172, ryTop: 0.29, ryBot: 0.26, dorsalPinch: 0.22, ventralPinch: 0.12, sideBulge: -0.05, eyeSocket: 0.0, boneSeg: 4.4 },
      { v: 0.58, y: 3.63, z: 1.03,  rx: 0.152, ryTop: 0.26, ryBot: 0.23, dorsalPinch: 0.20, ventralPinch: 0.10, sideBulge: -0.05, eyeSocket: 0.0, boneSeg: 5.4 },
      { v: 0.64, y: 3.95, z: 1.20,  rx: 0.136, ryTop: 0.23, ryBot: 0.20, dorsalPinch: 0.18, ventralPinch: 0.10, sideBulge: -0.04, eyeSocket: 0.0, boneSeg: 6.4 },
      { v: 0.70, y: 4.26, z: 1.37,  rx: 0.124, ryTop: 0.205, ryBot: 0.18, dorsalPinch: 0.16, ventralPinch: 0.08, sideBulge: -0.03, eyeSocket: 0.0, boneSeg: 7.5 },
      { v: 0.75, y: 4.51, z: 1.52,  rx: 0.114, ryTop: 0.185, ryBot: 0.155, dorsalPinch: 0.12, ventralPinch: 0.06, sideBulge: -0.02, eyeSocket: 0.0, boneSeg: 8.6 },
      { v: 0.79, y: 4.66, z: 1.63,  rx: 0.112, ryTop: 0.155, ryBot: 0.125, dorsalPinch: 0.04, ventralPinch: 0.04, sideBulge: 0.02, eyeSocket: 0.0, boneSeg: 9.4 },

      // Cranium, Poll, Supraorbital Eye Ridges, Nasal Bridge & Blunt Prehensile Muzzle (z = 1.72 .. 2.18)
      { v: 0.82, y: 4.68, z: 1.72,  rx: 0.126, ryTop: 0.125, ryBot: 0.105, dorsalPinch: -0.18, ventralPinch: 0.05, sideBulge: 0.10, eyeSocket: 0.30, boneSeg: 9.95 },
      { v: 0.86, y: 4.66, z: 1.82,  rx: 0.132, ryTop: 0.112, ryBot: 0.095, dorsalPinch: -0.16, ventralPinch: 0.06, sideBulge: 0.12, eyeSocket: 1.00, boneSeg: 10.0 },
      { v: 0.90, y: 4.61, z: 1.93,  rx: 0.088, ryTop: 0.090, ryBot: 0.072, dorsalPinch: 0.10,  ventralPinch: 0.04, sideBulge: 0.04, eyeSocket: 0.15, boneSeg: 10.0 },
      { v: 0.94, y: 4.55, z: 2.04,  rx: 0.066, ryTop: 0.072, ryBot: 0.055, dorsalPinch: 0.06,  ventralPinch: -0.06, sideBulge: 0.04, eyeSocket: 0.0, boneSeg: 10.0 },
      { v: 0.975, y: 4.50, z: 2.14, rx: 0.068, ryTop: 0.062, ryBot: 0.046, dorsalPinch: -0.12, ventralPinch: -0.16, sideBulge: 0.20, eyeSocket: 0.0, boneSeg: 10.0 },
      { v: 0.992, y: 4.485, z: 2.175, rx: 0.044, ryTop: 0.040, ryBot: 0.030, dorsalPinch: -0.16, ventralPinch: -0.18, sideBulge: 0.16, eyeSocket: 0.0, boneSeg: 10.0 },
      { v: 1.00, y: 4.475, z: 2.186, rx: 0.0005, ryTop: 0.0005, ryBot: 0.0005, dorsalPinch: 0.0, ventralPinch: 0.0, sideBulge: 0.0, eyeSocket: 0.0, boneSeg: 10.0 }
    ];

    const numRings = 88;
    const radialSegs = 44;

    const ringFrames = [];
    for (let i = 0; i <= numRings; i++) {
      const t = i / numRings;
      ringFrames.push(sampleCatmullRom(stations, t));
    }

    const positions = [];
    const uvs = [];
    const skinIndices = [];
    const skinWeights = [];
    const indices = [];

    for (let i = 0; i <= numRings; i++) {
      const st = ringFrames[i];
      const sw = computeSkinWeightsFromSegment(st.boneSeg, axialBones);

      for (let j = 0; j <= radialSegs; j++) {
        const u = j / radialSegs;
        const theta = (u - 0.5) * Math.PI * 2.0; // theta=0 is dorsal top (+Y), theta=+-PI is ventral bottom (-Y)
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const isDorsal = cosT >= 0;
        const baseRy = isDorsal ? st.ryTop : st.ryBot;
        const pinch = isDorsal ? st.dorsalPinch : st.ventralPinch;

        const absSin = Math.abs(sinT);
        const widthMod = 1.0 + st.sideBulge * Math.sin(absSin * Math.PI) - pinch * 0.26 * Math.pow(Math.abs(cosT), 1.5);
        const heightMod = 1.0 + pinch * 0.20 * Math.pow(Math.abs(cosT), 2.0);

        // Supraorbital brow ridge flare at upper-lateral cranium
        const browAngle = Math.exp(-Math.pow((Math.abs(theta) - 0.95) / 0.36, 2.0));
        const browFlare = st.eyeSocket * 0.024 * browAngle;

        // Subtle neck jugular furrow & sternocephalicus muscle cord along mid-neck (v in 0.42..0.76)
        let neckDetail = 0.0;
        if (st.v > 0.42 && st.v < 0.76) {
          const neckMask = Math.sin(((st.v - 0.42) / 0.34) * Math.PI);
          const groove = -0.014 * Math.exp(-Math.pow((Math.abs(theta) - 2.05) / 0.30, 2.0));
          const sternoMuscle = 0.009 * Math.exp(-Math.pow((Math.abs(theta) - 1.55) / 0.32, 2.0));
          const trachea = 0.009 * Math.exp(-Math.pow((Math.abs(theta) - Math.PI) / 0.30, 2.0));
          neckDetail = (groove + sternoMuscle + trachea) * neckMask;
        }

        // Subtle scapular spine ridge over shoulder (v in 0.27..0.39) & gluteal contour on croup (v in 0.04..0.15)
        let torsoMuscle = 0.0;
        if (st.v > 0.27 && st.v < 0.39) {
          const scapMask = Math.sin(((st.v - 0.27) / 0.12) * Math.PI);
          const scapAngle = Math.exp(-Math.pow((Math.abs(theta) - 1.38) / 0.34, 2.0));
          torsoMuscle += 0.016 * scapMask * scapAngle;
        } else if (st.v > 0.04 && st.v < 0.15) {
          const glutMask = Math.sin(((st.v - 0.04) / 0.11) * Math.PI);
          const glutGroove = -0.012 * Math.exp(-Math.pow((Math.abs(theta) - 1.65) / 0.28, 2.0));
          torsoMuscle += glutGroove * glutMask;
        }

        // Nostril slit indentation near muzzle tip
        let nostrilIndent = 0.0;
        if (st.v > 0.945 && st.v < 0.992) {
          const nMask = Math.sin(((st.v - 0.945) / 0.047) * Math.PI);
          const nAngle = Math.exp(-Math.pow((Math.abs(theta) - 0.92) / 0.22, 2.0));
          nostrilIndent = -0.013 * nMask * nAngle;
        }

        const wx = sinT * (st.rx * widthMod + browFlare + neckDetail + torsoMuscle + nostrilIndent);
        const wy = st.y + cosT * (baseRy * heightMod + browFlare * 0.45 + neckDetail * 0.5 + torsoMuscle * 0.35);
        const wz = st.z;

        positions.push(wx, wy, wz);
        uvs.push(u, st.v);
        skinIndices.push(sw.indices[0], sw.indices[1], sw.indices[2], sw.indices[3]);
        skinWeights.push(sw.weights[0], sw.weights[1], sw.weights[2], sw.weights[3]);
      }
    }

    const stride = radialSegs + 1;
    for (let i = 0; i < numRings; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        const c = (i + 1) * stride + (j + 1);
        const d = i * stride + (j + 1);
        indices.push(a, b, d);
        indices.push(d, b, c);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    geom.userData.ringFrames = ringFrames;
    geom.userData.axialBones = axialBones;
    return geom;
  }

  // Build a continuous, anatomically sculpted SkinnedMesh for one Forelimb or Hindlimb
  // Upper rings originate inside the thorax/pelvis contour and slope smoothly downward with blended normals!
  function buildLimbGeometry(isFore, side, boneIndexMap) {
    const s = side === 'L' ? 1 : -1;

    let limbBones, stations;
    if (isFore) {
      limbBones = [
        boneIndexMap['spine_thorax'],       // 0: torso anchor
        boneIndexMap[`scapula_${side}`],    // 1: scapula
        boneIndexMap[`shoulder_${side}`],   // 2: humerus
        boneIndexMap[`elbow_${side}`],      // 3: radius/ulna
        boneIndexMap[`carpus_${side}`],     // 4: metacarpus
        boneIndexMap[`fetlock_${side}`],    // 5: pastern
        boneIndexMap[`pastern_${side}`],    // 6: coronet
        boneIndexMap[`hoof_${side}`]        // 7: cloven hoof
      ];

      stations = [
        // Top cap tucked cleanly inside the thorax so outer shoulder slopes downward without a horizontal shelf
        { v: 0.00, x: s * 0.10, y: 2.68, z: 0.46, rx: 0.04, rzFront: 0.12, rzBack: 0.12, cleft: 0.0, tendon: 0.0, boneSeg: 0.0 },
        { v: 0.06, x: s * 0.17, y: 2.48, z: 0.50, rx: 0.125, rzFront: 0.18, rzBack: 0.19, cleft: 0.0, tendon: 0.0, boneSeg: 0.7 },
        { v: 0.14, x: s * 0.21, y: 2.28, z: 0.56, rx: 0.128, rzFront: 0.16, rzBack: 0.17, cleft: 0.0, tendon: 0.0, boneSeg: 1.6 },
        { v: 0.22, x: s * 0.22, y: 2.08, z: 0.53, rx: 0.118, rzFront: 0.135, rzBack: 0.16, cleft: 0.0, tendon: 0.0, boneSeg: 2.3 },
        // Elbow & Olecranon point
        { v: 0.32, x: s * 0.22, y: 1.80, z: 0.43, rx: 0.102, rzFront: 0.100, rzBack: 0.150, cleft: 0.0, tendon: 0.1, boneSeg: 2.95 },
        // Upper Forearm
        { v: 0.41, x: s * 0.218, y: 1.50, z: 0.45, rx: 0.080, rzFront: 0.085, rzBack: 0.098, cleft: 0.0, tendon: 0.25, boneSeg: 3.35 },
        { v: 0.50, x: s * 0.216, y: 1.20, z: 0.465, rx: 0.058, rzFront: 0.062, rzBack: 0.070, cleft: 0.0, tendon: 0.40, boneSeg: 3.78 },
        // Carpus (Fore-knee joint - distinct rounded anterior dome & posterior accessory carpal)
        { v: 0.56, x: s * 0.215, y: 1.02, z: 0.472, rx: 0.056, rzFront: 0.068, rzBack: 0.064, cleft: 0.0, tendon: 0.20, boneSeg: 4.0 },
        // Metacarpus (Cannon bone - slender, sinewy shaft with posterior flexor tendon groove)
        { v: 0.64, x: s * 0.212, y: 0.78, z: 0.475, rx: 0.037, rzFront: 0.039, rzBack: 0.049, cleft: 0.0, tendon: 0.95, boneSeg: 4.30 },
        { v: 0.76, x: s * 0.210, y: 0.44, z: 0.478, rx: 0.035, rzFront: 0.037, rzBack: 0.047, cleft: 0.0, tendon: 0.95, boneSeg: 4.72 },
        // Fetlock joint
        { v: 0.84, x: s * 0.210, y: 0.24, z: 0.480, rx: 0.048, rzFront: 0.050, rzBack: 0.058, cleft: 0.0, tendon: 0.30, boneSeg: 5.0 },
        // Pastern & Coronary band
        { v: 0.90, x: s * 0.210, y: 0.12, z: 0.530, rx: 0.043, rzFront: 0.047, rzBack: 0.045, cleft: 0.12, tendon: 0.0, boneSeg: 5.85 },
        // Cloven Hoof
        { v: 0.95, x: s * 0.210, y: 0.05, z: 0.568, rx: 0.065, rzFront: 0.082, rzBack: 0.058, cleft: 0.65, tendon: 0.0, boneSeg: 6.85 },
        { v: 0.99, x: s * 0.210, y: 0.004, z: 0.585, rx: 0.071, rzFront: 0.094, rzBack: 0.062, cleft: 0.85, tendon: 0.0, boneSeg: 7.0 },
        { v: 1.00, x: s * 0.210, y: 0.00, z: 0.585, rx: 0.012, rzFront: 0.015, rzBack: 0.012, cleft: 0.20, tendon: 0.0, boneSeg: 7.0 }
      ];
    } else {
      limbBones = [
        boneIndexMap['pelvis'],               // 0: pelvis anchor
        boneIndexMap[`hip_${side}`],          // 1: femur
        boneIndexMap[`stifle_${side}`],       // 2: tibia
        boneIndexMap[`hock_${side}`],         // 3: metatarsus
        boneIndexMap[`hind_fetlock_${side}`], // 4: hind pastern
        boneIndexMap[`hind_pastern_${side}`], // 5: hind coronet
        boneIndexMap[`hind_hoof_${side}`]     // 6: cloven hind hoof
      ];

      stations = [
        // Top cap tucked inside pelvis/croup contour so outer thigh emerges smoothly without a ridge
        { v: 0.00, x: s * 0.09, y: 2.44, z: -0.64, rx: 0.04, rzFront: 0.12, rzBack: 0.12, cleft: 0.0, tendon: 0.0, boneSeg: 0.0 },
        { v: 0.06, x: s * 0.16, y: 2.26, z: -0.62, rx: 0.132, rzFront: 0.20, rzBack: 0.21, cleft: 0.0, tendon: 0.0, boneSeg: 0.45 },
        { v: 0.15, x: s * 0.205, y: 2.00, z: -0.55, rx: 0.135, rzFront: 0.19, rzBack: 0.19, cleft: 0.0, tendon: 0.0, boneSeg: 1.15 },
        // Stifle joint (anterior patella dome & flank fold)
        { v: 0.26, x: s * 0.22, y: 1.66, z: -0.45, rx: 0.112, rzFront: 0.142, rzBack: 0.122, cleft: 0.0, tendon: 0.15, boneSeg: 1.95 },
        // Tibia / Gaskin
        { v: 0.40, x: s * 0.212, y: 1.32, z: -0.58, rx: 0.080, rzFront: 0.082, rzBack: 0.108, cleft: 0.0, tendon: 0.55, boneSeg: 2.48 },
        // Hock / Tarsus (prominent calcaneal tuber point)
        { v: 0.54, x: s * 0.205, y: 0.98, z: -0.71, rx: 0.053, rzFront: 0.058, rzBack: 0.112, cleft: 0.0, tendon: 0.45, boneSeg: 2.98 },
        // Metatarsus (Hind cannon bone - slender vertical shaft)
        { v: 0.64, x: s * 0.202, y: 0.74, z: -0.705, rx: 0.036, rzFront: 0.038, rzBack: 0.048, cleft: 0.0, tendon: 0.95, boneSeg: 3.30 },
        { v: 0.76, x: s * 0.200, y: 0.42, z: -0.702, rx: 0.034, rzFront: 0.036, rzBack: 0.046, cleft: 0.0, tendon: 0.95, boneSeg: 3.72 },
        // Hind Fetlock
        { v: 0.84, x: s * 0.200, y: 0.23, z: -0.700, rx: 0.046, rzFront: 0.048, rzBack: 0.056, cleft: 0.0, tendon: 0.30, boneSeg: 4.0 },
        // Hind Pastern
        { v: 0.90, x: s * 0.200, y: 0.11, z: -0.648, rx: 0.041, rzFront: 0.045, rzBack: 0.043, cleft: 0.12, tendon: 0.0, boneSeg: 4.85 },
        // Cloven Hind Hoof
        { v: 0.95, x: s * 0.200, y: 0.05, z: -0.612, rx: 0.061, rzFront: 0.077, rzBack: 0.055, cleft: 0.65, tendon: 0.0, boneSeg: 5.85 },
        { v: 0.99, x: s * 0.200, y: 0.004, z: -0.596, rx: 0.067, rzFront: 0.089, rzBack: 0.058, cleft: 0.85, tendon: 0.0, boneSeg: 6.0 },
        { v: 1.00, x: s * 0.200, y: 0.00, z: -0.596, rx: 0.012, rzFront: 0.015, rzBack: 0.012, cleft: 0.20, tendon: 0.0, boneSeg: 6.0 }
      ];
    }

    const numRings = 56;
    const radialSegs = 32;

    const positions = [];
    const uvs = [];
    const skinIndices = [];
    const skinWeights = [];
    const indices = [];

    for (let i = 0; i <= numRings; i++) {
      const t = i / numRings;
      const st = sampleCatmullRom(stations, t);
      const sw = computeSkinWeightsFromSegment(st.boneSeg, limbBones);

      for (let j = 0; j <= radialSegs; j++) {
        const u = j / radialSegs;
        const theta = u * Math.PI * 2.0;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const baseRz = sinT >= 0 ? st.rzFront : st.rzBack;
        const tendonIndent = -st.tendon * 0.0085 * Math.exp(-Math.pow((sinT + 0.35) / 0.28, 2.0));

        let cleftIndentZ = 0.0;
        let cleftBulgeX = 1.0;
        if (st.cleft > 0.01 && sinT > -0.2) {
          const anteriorMidline = Math.exp(-Math.pow(cosT / 0.26, 2.0)) * Math.max(0, sinT);
          cleftIndentZ = -st.cleft * 0.032 * anteriorMidline;
          cleftBulgeX = 1.0 + st.cleft * 0.16 * Math.sin(Math.abs(cosT) * Math.PI);
        }

        const localX = -s * cosT * (st.rx * cleftBulgeX + tendonIndent);
        const localZ = sinT * baseRz + cleftIndentZ;

        const wy = Math.max(0.0, st.y);
        const wx = st.x + localX;
        const wz = st.z + localZ;

        positions.push(wx, wy, wz);
        uvs.push(u, st.v);
        skinIndices.push(sw.indices[0], sw.indices[1], sw.indices[2], sw.indices[3]);
        skinWeights.push(sw.weights[0], sw.weights[1], sw.weights[2], sw.weights[3]);
      }
    }

    const stride = radialSegs + 1;
    for (let i = 0; i < numRings; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        const c = (i + 1) * stride + (j + 1);
        const d = i * stride + (j + 1);
        if (s > 0) {
          indices.push(a, b, d);
          indices.push(d, b, c);
        } else {
          indices.push(a, d, b);
          indices.push(d, c, b);
        }
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    // Smoothly blend upper shoulder/hip normals (i <= 10) with outward lateral body normal so limb-to-torso lighting is seamless!
    const normAttr = geom.attributes.normal;
    for (let i = 0; i <= 10; i++) {
      const blend = 1.0 - (i / 10);
      for (let j = 0; j <= radialSegs; j++) {
        const idx = i * stride + j;
        const nx = lerp(normAttr.getX(idx), s * 0.92, blend * 0.65);
        const ny = lerp(normAttr.getY(idx), 0.15, blend * 0.65);
        const nz = normAttr.getZ(idx) * (1.0 - blend * 0.35);
        const len = Math.hypot(nx, ny, nz) || 1;
        normAttr.setXYZ(idx, nx / len, ny / len, nz / len);
      }
    }
    normAttr.needsUpdate = true;

    return geom;
  }

  // Build erect cervical mane locked 1:1 to the exact dorsal ridge & skin weights of GiraffeAxialBody!
  // Combines a continuous 3D sculpted brush-wedge core with serrated bristle tufts along the crest
  function buildManeGeometry(axialGeom) {
    const ringFrames = axialGeom.userData.ringFrames;
    const axialBones = axialGeom.userData.axialBones;

    const dorsalSamples = [];
    for (let i = 0; i < ringFrames.length; i++) {
      const st = ringFrames[i];
      if (st.v >= 0.31 && st.v <= 0.81) {
        const heightMod = 1.0 + st.dorsalPinch * 0.20;
        const dorsalY = st.y + st.ryTop * heightMod;
        const vNorm = (st.v - 0.31) / (0.81 - 0.31);
        const env = Math.sin(Math.pow(clamp(vNorm, 0, 1), 0.72) * Math.PI);
        const h = 0.035 + 0.105 * Math.pow(env, 0.52);
        const w = lerp(0.022, 0.013, vNorm);
        dorsalSamples.push({
          y: dorsalY,
          z: st.z,
          h,
          w,
          boneSeg: st.boneSeg
        });
      }
    }

    const numSteps = 96;
    const positions = [];
    const uvs = [];
    const skinIndices = [];
    const skinWeights = [];
    const indices = [];

    // Smooth normal direction along the mane so there is no abrupt fan jump at the base of the neck
    const pts = [];
    for (let i = 0; i <= numSteps; i++) {
      const t = i / numSteps;
      pts.push(sampleCatmullRom(dorsalSamples, t));
    }
    for (let i = 0; i <= numSteps; i++) {
      const pPrev = pts[Math.max(0, i - 4)];
      const pNext = pts[Math.min(numSteps, i + 4)];
      const dy = pNext.y - pPrev.y;
      const dz = pNext.z - pPrev.z;
      const dLen = Math.hypot(dy, dz) || 1;
      pts[i].ny = dz / dLen;
      pts[i].nz = -dy / dLen;
    }

    // Part A: Continuous 3D Brush-Wedge Ribbon (4 vertices per station: Left Base, Left Crest, Right Crest, Right Base)
    for (let i = 0; i <= numSteps; i++) {
      const p = pts[i];
      const sw = computeSkinWeightsFromSegment(p.boneSeg, axialBones);
      // Serrated bristle tooth modulation along the top crest
      const bristle = 0.84 + 0.22 * Math.abs(Math.sin(i * 1.85)) + 0.08 * Math.cos(i * 4.3);
      const h = p.h * bristle;

      const baseY = p.y - p.ny * 0.022;
      const baseZ = p.z - p.nz * 0.022;
      const crestY = p.y + p.ny * h;
      const crestZ = p.z + p.nz * h;

      // 4 cross-section points: 0: Left Base (+w), 1: Left Crest (+w*0.22), 2: Right Crest (-w*0.22), 3: Right Base (-w)
      const ringVerts = [
        [p.w, baseY, baseZ, 0.0],
        [p.w * 0.22, crestY, crestZ, 1.0],
        [-p.w * 0.22, crestY, crestZ, 1.0],
        [-p.w, baseY, baseZ, 0.0]
      ];
      for (const rv of ringVerts) {
        positions.push(rv[0], rv[1], rv[2]);
        uvs.push(i / numSteps, rv[3]);
        skinIndices.push(sw.indices[0], sw.indices[1], sw.indices[2], sw.indices[3]);
        skinWeights.push(sw.weights[0], sw.weights[1], sw.weights[2], sw.weights[3]);
      }
    }

    for (let i = 0; i < numSteps; i++) {
      const base = i * 4;
      const next = (i + 1) * 4;
      // Left side wall (0 -> 1), Top crest (1 -> 2), Right side wall (2 -> 3)
      for (let k = 0; k < 3; k++) {
        const a = base + k;
        const b = next + k;
        const c = next + k + 1;
        const d = base + k + 1;
        indices.push(a, b, d, d, b, c);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  // Build articulated Tail SkinnedMesh (bony coccygeal shaft + flowing black tail tassel)
  function buildTailGeometry(boneIndexMap) {
    const tailBones = [
      boneIndexMap['pelvis'],
      boneIndexMap['tail_0'],
      boneIndexMap['tail_1'],
      boneIndexMap['tail_2'],
      boneIndexMap['tail_3'],
      boneIndexMap['tail_4']
    ];

    const shaftStations = [
      { v: 0.00, y: 2.35, z: -0.85, r: 0.040, seg: 0.2 },
      { v: 0.18, y: 2.08, z: -0.94, r: 0.025, seg: 1.2 },
      { v: 0.36, y: 1.78, z: -0.97, r: 0.019, seg: 2.4 },
      { v: 0.54, y: 1.48, z: -0.98, r: 0.015, seg: 3.6 },
      { v: 0.68, y: 1.24, z: -0.98, r: 0.014, seg: 4.6 }
    ];

    const tasselStations = [
      { v: 0.00, y: 1.28, z: -0.98, rx: 0.017, rz: 0.019, seg: 4.3 },
      { v: 0.25, y: 1.12, z: -0.99, rx: 0.042, rz: 0.048, seg: 4.7 },
      { v: 0.55, y: 0.94, z: -1.00, rx: 0.048, rz: 0.056, seg: 4.95 },
      { v: 0.82, y: 0.78, z: -0.99, rx: 0.032, rz: 0.038, seg: 5.0 },
      { v: 1.00, y: 0.66, z: -0.97, rx: 0.004, rz: 0.005, seg: 5.0 }
    ];

    function buildTube(stList, rings, radSegs, wavy) {
      const pos = [];
      const uv = [];
      const sIdx = [];
      const sWgt = [];
      const idx = [];

      for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        const st = sampleCatmullRom(stList, t);
        const sw = computeSkinWeightsFromSegment(st.seg, tailBones);
        for (let j = 0; j <= radSegs; j++) {
          const u = j / radSegs;
          const a = u * Math.PI * 2;
          const rx = st.rx !== undefined ? st.rx : st.r;
          const rz = st.rz !== undefined ? st.rz : st.r;
          const strandFlute = wavy ? (1.0 + 0.22 * Math.sin(a * 9.0 + t * 8.0) * Math.sin(t * Math.PI)) : 1.0;
          const wx = Math.cos(a) * rx * strandFlute;
          const wy = st.y;
          const wz = st.z + Math.sin(a) * rz * strandFlute;
          pos.push(wx, wy, wz);
          uv.push(u, st.v);
          sIdx.push(sw.indices[0], sw.indices[1], sw.indices[2], sw.indices[3]);
          sWgt.push(sw.weights[0], sw.weights[1], sw.weights[2], sw.weights[3]);
        }
      }
      const stride = radSegs + 1;
      for (let i = 0; i < rings; i++) {
        for (let j = 0; j < radSegs; j++) {
          const a = i * stride + j;
          const b = (i + 1) * stride + j;
          const c = (i + 1) * stride + (j + 1);
          const d = i * stride + (j + 1);
          idx.push(a, b, d, d, b, c);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sWgt, 4));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }

    return {
      shaftGeom: buildTube(shaftStations, 24, 14, false),
      tasselGeom: buildTube(tasselStations, 26, 20, true)
    };
  }

  // Build detailed Cranial Appendages (Ossicones, Median Frontal Boss, Eyes, Eyelids, Ears, Lower Jaw & Tongue)
  function attachCranialStructures(boneMap, materials) {
    const headBone = boneMap['head'];
    const jawBone = boneMap['jaw'];
    const earLBone = boneMap['ear_L'];
    const earRBone = boneMap['ear_R'];

    const headWorld = headBone.userData.bindWorldPos; // (0, 4.72, 1.66)
    const cranialRefs = { eyelids: [] };

    // 1. Pair of Parietal Ossicones — sunk into the skull roof with flared conical skin bases so there is zero gap
    for (const side of [-1, 1]) {
      const ossGroup = new THREE.Group();
      ossGroup.position.set(side * 0.056, 4.75 - headWorld.y, 1.72 - headWorld.z);
      ossGroup.rotation.x = -0.38;
      ossGroup.rotation.z = side * 0.07;

      const shaftGeom = new THREE.CylinderGeometry(0.020, 0.036, 0.165, 18, 8);
      shaftGeom.translate(0, 0.062, 0); // Bottom extends -0.02m deep into skull
      // Map UVs to upper neck/head coat region (v in 0.72..0.85) so ossicone skin is warm tan/spotted
      const sUv = shaftGeom.attributes.uv;
      for (let k = 0; k < sUv.count; k++) {
        sUv.setY(k, 0.75 + sUv.getY(k) * 0.12);
      }
      const shaftMesh = new THREE.Mesh(shaftGeom, materials.bodyMaterial);
      shaftMesh.castShadow = true;
      ossGroup.add(shaftMesh);

      // Tufted dark hair knob at the apex of each ossicone
      const knobGeom = new THREE.SphereGeometry(0.029, 16, 12);
      knobGeom.scale(1.0, 1.22, 1.0);
      knobGeom.translate(0, 0.152, 0);
      const knobMesh = new THREE.Mesh(knobGeom, materials.ossiconeTipMaterial);
      knobMesh.castShadow = true;
      ossGroup.add(knobMesh);

      headBone.add(ossGroup);
    }

    // 2. Median Frontal Boss — distinct bony horn prominence between/ahead of the eyes
    const bossGeom = new THREE.SphereGeometry(0.040, 16, 12);
    bossGeom.scale(0.84, 0.76, 1.55);
    const bUv = bossGeom.attributes.uv;
    for (let k = 0; k < bUv.count; k++) {
      bUv.setY(k, 0.84 + bUv.getY(k) * 0.05);
    }
    const bossMesh = new THREE.Mesh(bossGeom, materials.bodyMaterial);
    bossMesh.position.set(0, 4.685 - headWorld.y, 1.855 - headWorld.z);
    bossMesh.rotation.x = 0.32;
    headBone.add(bossMesh);

    // 2b. Sculpted Flared Nostrils embedded flush on the upper-lateral muzzle
    for (const side of [-1, 1]) {
      const nostrilGeom = new THREE.SphereGeometry(0.018, 12, 10);
      nostrilGeom.scale(0.45, 0.48, 1.45);
      const nostrilMesh = new THREE.Mesh(nostrilGeom, materials.eyelidMaterial);
      nostrilMesh.position.set(side * 0.052, 4.534 - headWorld.y, 2.125 - headWorld.z);
      nostrilMesh.rotation.y = side * 0.42;
      nostrilMesh.rotation.x = 0.40;
      nostrilMesh.rotation.z = side * -0.25;
      headBone.add(nostrilMesh);
    }

    // 3. Large Soulful Lateral Eyes + Upper Eyelid Hoods + Delicate Eyelash Canopy
    for (const side of [-1, 1]) {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * 0.118, 4.652 - headWorld.y, 1.82 - headWorld.z);
      eyeGroup.rotation.y = side * 1.22;

      const eyeballGeom = new THREE.SphereGeometry(0.032, 24, 20);
      eyeballGeom.rotateY(-Math.PI * 0.5);
      const eyeballMesh = new THREE.Mesh(eyeballGeom, materials.eyeMaterial);
      eyeGroup.add(eyeballMesh);

      // Upper eyelid hood: hemisphere rotated back so in open state (rot.x = -0.78) it sits cleanly above the pupil
      const upperLidGeom = new THREE.SphereGeometry(0.0345, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.48);
      const upperLidMesh = new THREE.Mesh(upperLidGeom, materials.eyelidMaterial);
      upperLidMesh.rotation.x = -0.78;
      eyeGroup.add(upperLidMesh);

      // Fanned individual 3D upper eyelash filaments attached to upperLidMesh so they blink in unison!
      const lashFilGeom = new THREE.ConeGeometry(0.0018, 0.019, 5);
      lashFilGeom.translate(0, 0.0095, 0);
      for (let f = -4; f <= 4; f++) {
        const ang = f * 0.16;
        const fil = new THREE.Mesh(lashFilGeom, materials.maneMaterial);
        // Position along the leading equatorial rim of the upperLidMesh hemisphere
        fil.position.set(Math.sin(ang) * 0.033, 0.002, Math.cos(ang) * 0.033);
        fil.rotation.x = Math.PI * 0.46;
        fil.rotation.z = -ang * 0.65;
        upperLidMesh.add(fil);
      }

      // Upper eyelash eave (curved awning projecting from the upper margin of the upper eyelid)
      const lashGeom = new THREE.CylinderGeometry(0.034, 0.043, 0.006, 16, 1, true, -Math.PI * 0.35, Math.PI * 0.7);
      lashGeom.rotateZ(Math.PI * 0.5);
      lashGeom.rotateY(Math.PI * 0.5);
      const lashMesh = new THREE.Mesh(lashGeom, materials.maneMaterial);
      lashMesh.position.set(0, 0.022, 0.018);
      lashMesh.rotation.x = 0.35;
      eyeGroup.add(lashMesh);

      cranialRefs.eyelids.push(upperLidMesh);
      headBone.add(eyeGroup);
    }

    // 3b. Fine tactile Muzzle Vibrissae (sensory bristles used when browsing thorny Acacia shoots)
    const vibGeom = new THREE.ConeGeometry(0.0009, 0.024, 4);
    vibGeom.translate(0, 0.012, 0);
    const vibCoords = [
      [0.056, 4.505, 2.135, 1.25, 0.25],
      [0.048, 4.492, 2.155, 1.15, 0.40],
      [0.036, 4.482, 2.168, 1.05, 0.55],
      [0.052, 4.520, 2.105, 1.32, 0.15]
    ];
    for (const side of [-1, 1]) {
      for (const vc of vibCoords) {
        const vib = new THREE.Mesh(vibGeom, materials.maneMaterial);
        vib.position.set(side * vc[0], vc[1] - headWorld.y, vc[2] - headWorld.z);
        vib.rotation.z = -side * vc[3];
        vib.rotation.x = vc[4];
        headBone.add(vib);
      }
    }

    // 4. Articulated Mandible (Lower Jaw) + Retractable Prehensile Tongue
    const jawGroup = new THREE.Group();

    // Sculpted lower jaw & chin tucked cleanly inside upper cheek/muzzle width
    const jawStations = [
      { y: -0.01, z: 0.00, rx: 0.070, ry: 0.048 },
      { y: -0.045, z: 0.13, rx: 0.054, ry: 0.038 },
      { y: -0.085, z: 0.26, rx: 0.040, ry: 0.028 },
      { y: -0.118, z: 0.36, rx: 0.038, ry: 0.022 },
      { y: -0.126, z: 0.40, rx: 0.010, ry: 0.008 }
    ];
    const jPos = [];
    const jUv = [];
    const jIdx = [];
    const jRings = 18;
    const jSegs = 18;
    for (let i = 0; i <= jRings; i++) {
      const t = i / jRings;
      const st = sampleCatmullRom(jawStations, t);
      for (let j = 0; j <= jSegs; j++) {
        const u = j / jSegs;
        const theta = (u - 0.5) * Math.PI * 2.0; // theta=0 top, +-PI bottom
        const wx = Math.sin(theta) * st.rx;
        const wy = st.y + (Math.cos(theta) >= 0 ? Math.cos(theta) * st.ry * 0.25 : Math.cos(theta) * st.ry);
        const wz = st.z;
        jPos.push(wx, wy, wz);
        // Map UVs to the warm tan/muzzle region (u around 0.5, v in 0.86..0.98) so there is zero white seam
        jUv.push(0.35 + u * 0.30, 0.86 + t * 0.12);
      }
    }
    const jStride = jSegs + 1;
    for (let i = 0; i < jRings; i++) {
      for (let j = 0; j < jSegs; j++) {
        const a = i * jStride + j;
        const b = (i + 1) * jStride + j;
        const c = (i + 1) * jStride + (j + 1);
        const d = i * jStride + (j + 1);
        jIdx.push(a, b, d, d, b, c);
      }
    }
    const jawGeom = new THREE.BufferGeometry();
    jawGeom.setAttribute('position', new THREE.Float32BufferAttribute(jPos, 3));
    jawGeom.setAttribute('uv', new THREE.Float32BufferAttribute(jUv, 2));
    jawGeom.setIndex(jIdx);
    jawGeom.computeVertexNormals();
    const jawMesh = new THREE.Mesh(jawGeom, materials.bodyMaterial);
    jawMesh.castShadow = true;
    jawGroup.add(jawMesh);

    // Prehensile dark blue-slate tongue oriented along +Z (tucked inside mouth at rest, extends when browsing!)
    const tongueGeom = new THREE.CapsuleGeometry(0.015, 0.18, 8, 12);
    tongueGeom.rotateX(Math.PI * 0.5); // Align capsule axis along +Z
    tongueGeom.scale(1.0, 0.55, 1.0);
    const tongueMesh = new THREE.Mesh(tongueGeom, materials.tongueMaterial);
    tongueMesh.position.set(0, -0.08, 0.24);
    tongueMesh.rotation.x = 0.28; // Slopes downward with the jaw
    tongueMesh.visible = false;   // Only visible when jaw opens to browse leaves!
    jawGroup.add(tongueMesh);
    cranialRefs.tongue = tongueMesh;

    jawBone.add(jawGroup);

    // 5. Sculpted Concave Lance/Leaf-Shaped Pinnae (Left & Right Ears)
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const earBone = side === 'L' ? earLBone : earRBone;

      const earRings = 16;
      const earSegs = 16;
      const ePos = [];
      const eUv = [];
      const eIdx = [];

      for (let i = 0; i <= earRings; i++) {
        const v = i / earRings;
        const width = 0.044 * Math.sin(Math.pow(v, 0.75) * Math.PI) + 0.005 * (1 - v);
        const depth = 0.022 * Math.sin(v * Math.PI);
        const length = v * 0.23;
        const droop = -Math.pow(v, 1.8) * 0.022;

        for (let j = 0; j <= earSegs; j++) {
          const u = j / earSegs;
          const a = u * Math.PI * 2;
          const cup = Math.sin(a) > 0 ? -Math.sin(a) * depth * 0.65 : Math.sin(a) * depth;
          const lx = length;
          const ly = droop + cup;
          const lz = Math.cos(a) * width;
          ePos.push(s * lx, ly, lz);
          eUv.push(0.35 + u * 0.30, 0.82 + v * 0.12);
        }
      }
      const eStride = earSegs + 1;
      for (let i = 0; i < earRings; i++) {
        for (let j = 0; j < earSegs; j++) {
          const a = i * eStride + j;
          const b = (i + 1) * eStride + j;
          const c = (i + 1) * eStride + (j + 1);
          const d = i * eStride + (j + 1);
          if (s > 0) {
            eIdx.push(a, b, d, d, b, c);
          } else {
            eIdx.push(a, d, b, d, c, b);
          }
        }
      }

      const earGeom = new THREE.BufferGeometry();
      earGeom.setAttribute('position', new THREE.Float32BufferAttribute(ePos, 3));
      earGeom.setAttribute('uv', new THREE.Float32BufferAttribute(eUv, 2));
      earGeom.setIndex(eIdx);
      earGeom.computeVertexNormals();

      const earContainer = new THREE.Group();
      earContainer.rotation.z = s * 0.34;
      earContainer.rotation.y = -s * 0.50;
      earContainer.rotation.x = -0.22;

      const earMesh = new THREE.Mesh(earGeom, materials.bodyMaterial);
      earMesh.castShadow = true;
      earContainer.add(earMesh);

      const innerGeom = new THREE.PlaneGeometry(0.13, 0.038);
      const innerMesh = new THREE.Mesh(innerGeom, materials.innerEarMaterial);
      innerMesh.position.set(s * 0.11, -0.008, 0.004);
      innerMesh.rotation.x = Math.PI * 0.55;
      earContainer.add(innerMesh);

      earBone.add(earContainer);
      earBone.userData.restRotation = earBone.rotation.clone();
    }

    return cranialRefs;
  }

  // Assemble the complete Giraffe model
  function createGiraffe(materials) {
    const giraffeGroup = new THREE.Group();
    giraffeGroup.name = 'GiraffeRoot';

    const rig = createGiraffeSkeleton();
    giraffeGroup.add(rig.root);
    rig.root.updateMatrixWorld(true);

    const bindMatrix = new THREE.Matrix4();

    // 1. Unified Axial Body + Neck + Head SkinnedMesh
    const axialGeom = buildAxialBodyGeometry(rig.boneIndexMap);
    const axialMesh = new THREE.SkinnedMesh(axialGeom, materials.bodyMaterial);
    axialMesh.name = 'GiraffeAxialBody';
    axialMesh.castShadow = true;
    axialMesh.receiveShadow = true;
    axialMesh.frustumCulled = false;
    axialMesh.bind(rig.skeleton, bindMatrix);
    giraffeGroup.add(axialMesh);

    // 2. Four Continuous Limb SkinnedMeshes (Fore L/R, Hind L/R)
    const limbDefs = [
      { isFore: true, side: 'L', name: 'Forelimb_L' },
      { isFore: true, side: 'R', name: 'Forelimb_R' },
      { isFore: false, side: 'L', name: 'Hindlimb_L' },
      { isFore: false, side: 'R', name: 'Hindlimb_R' }
    ];
    for (const def of limbDefs) {
      const lGeom = buildLimbGeometry(def.isFore, def.side, rig.boneIndexMap);
      const lMesh = new THREE.SkinnedMesh(lGeom, materials.limbMaterial);
      lMesh.name = def.name;
      lMesh.castShadow = true;
      lMesh.receiveShadow = true;
      lMesh.frustumCulled = false;
      lMesh.bind(rig.skeleton, bindMatrix);
      giraffeGroup.add(lMesh);
    }

    // 3. Erect Cervical Mane SkinnedMesh
    const maneGeom = buildManeGeometry(axialGeom);
    const maneMesh = new THREE.SkinnedMesh(maneGeom, materials.maneMaterial);
    maneMesh.name = 'GiraffeMane';
    maneMesh.castShadow = true;
    maneMesh.frustumCulled = false;
    maneMesh.bind(rig.skeleton, bindMatrix);
    giraffeGroup.add(maneMesh);

    // 4. Articulated Tail Shaft + Flowing Black Tail Tassel SkinnedMeshes
    const tailGeoms = buildTailGeometry(rig.boneIndexMap);
    const tailShaftMesh = new THREE.SkinnedMesh(tailGeoms.shaftGeom, materials.bodyMaterial);
    tailShaftMesh.castShadow = true;
    tailShaftMesh.frustumCulled = false;
    tailShaftMesh.bind(rig.skeleton, bindMatrix);
    giraffeGroup.add(tailShaftMesh);

    const tailTasselMesh = new THREE.SkinnedMesh(tailGeoms.tasselGeom, materials.tailHairMaterial);
    tailTasselMesh.castShadow = true;
    tailTasselMesh.frustumCulled = false;
    tailTasselMesh.bind(rig.skeleton, bindMatrix);
    giraffeGroup.add(tailTasselMesh);

    // 5. Cranial Appendages
    const cranialRefs = attachCranialStructures(rig.boneMap, materials);

    // 6. Optional Skeleton Helper
    const skeletonHelper = new THREE.SkeletonHelper(rig.root);
    skeletonHelper.visible = false;
    giraffeGroup.add(skeletonHelper);

    return {
      group: giraffeGroup,
      rig,
      cranialRefs,
      skeletonHelper
    };
  }

  global.GiraffeAnatomy = {
    createGiraffe
  };
})(window);
