(function () {
  'use strict';

  const {
    clamp,
    lerp,
    smoothstep,
    sampleStationCurve,
    computeLimbWorldQuaternion
  } = window.GiraffeMath;

  function createGiraffeCharacter() {
    const group = new THREE.Group();
    group.name = 'GiraffeCharacter';

    const skinMaterial = window.GiraffeCoat.createGiraffeSkinMaterial();
    const eyeMaterial = window.GiraffeCoat.createGiraffeEyeMaterial();
    const maneMaterial = window.GiraffeCoat.createGiraffeManeMaterial();
    const darkHairMaterial = window.GiraffeCoat.createDarkHairMaterial();
    const paleEarHairMaterial = window.GiraffeCoat.createPaleEarHairMaterial();

    // =========================================================================
    // 1. OSTEOLOGICALLY ACCURATE REST-POSE SKELETON (44 BONES)
    // =========================================================================
    const bones = [];
    const boneMap = {};

    function makeBone(name, parent, worldPos, worldTargetPos, forwardHint) {
      const bone = new THREE.Bone();
      bone.name = name;
      bone.userData.restWorldPos = worldPos.clone();

      const qWorld = new THREE.Quaternion();
      if (worldTargetPos) {
        computeLimbWorldQuaternion(
          worldPos,
          worldTargetPos,
          forwardHint || new THREE.Vector3(0, 0, 1),
          qWorld
        );
      }
      bone.userData.restWorldQuat = qWorld.clone();

      if (parent) {
        parent.add(bone);
        parent.updateMatrixWorld(true);
        const invParentMat = new THREE.Matrix4().copy(parent.matrixWorld).invert();
        const localPos = worldPos.clone().applyMatrix4(invParentMat);
        const invParentQuat = new THREE.Quaternion().setFromRotationMatrix(parent.matrixWorld).invert();
        bone.position.copy(localPos);
        bone.quaternion.copy(invParentQuat).multiply(qWorld);
      } else {
        bone.position.copy(worldPos);
        bone.quaternion.copy(qWorld);
      }

      bone.updateMatrixWorld(true);
      bone.userData.restLocalPos = bone.position.clone();
      bone.userData.restLocalQuat = bone.quaternion.clone();

      bones.push(bone);
      boneMap[name] = bone;
      return bone;
    }

    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    // Axial Spine (aligned along upper-mid thorax/withers for smooth concave bend into neck)
    const root = makeBone('Root', null, V(0, 2.32, 0.0));
    const pelvis = makeBone('Pelvis', root, V(0, 2.24, -0.68));
    const spineLoins = makeBone('SpineLoins', root, V(0, 2.34, -0.32));
    const spineChest = makeBone('SpineChest', spineLoins, V(0, 2.52, 0.12));
    const spineWithers = makeBone('SpineWithers', spineChest, V(0, 2.68, 0.42));

    // 7 Cervical Vertebrae C7 -> C1
    const neckPts = [
      V(0, 2.86, 0.64),
      V(0, 3.14, 0.84),
      V(0, 3.45, 1.03),
      V(0, 3.76, 1.22),
      V(0, 4.06, 1.40),
      V(0, 4.34, 1.56),
      V(0, 4.57, 1.69)
    ];
    const neckBones = [];
    let prevNeckParent = spineWithers;
    for (let i = 0; i < neckPts.length; i++) {
      const nb = makeBone('Neck' + i, prevNeckParent, neckPts[i]);
      neckBones.push(nb);
      prevNeckParent = nb;
    }

    // Head, Jaw, Ears, Eyelids
    const headBone = makeBone('Head', neckBones[neckBones.length - 1], V(0, 4.68, 1.79));
    const jawBone = makeBone('Jaw', headBone, V(0, 4.54, 1.92));
    const earLBone = makeBone('EarL', headBone, V(0.088, 4.675, 1.80));
    const earRBone = makeBone('EarR', headBone, V(-0.088, 4.675, 1.80));
    const eyelidLBone = makeBone('EyelidL', headBone, V(0.090, 4.675, 1.955));
    const eyelidRBone = makeBone('EyelidR', headBone, V(-0.090, 4.675, 1.955));

    // 6 Articulated Tail Bones
    const tailPts = [
      V(0, 2.24, -0.93),
      V(0, 2.08, -1.00),
      V(0, 1.89, -1.03),
      V(0, 1.69, -1.04),
      V(0, 1.49, -1.04),
      V(0, 1.29, -1.03)
    ];
    const tailEndTip = V(0, 1.12, -1.02);
    const tailBones = [];
    let prevTailParent = pelvis;
    for (let i = 0; i < tailPts.length; i++) {
      const nextPt = i + 1 < tailPts.length ? tailPts[i + 1] : tailEndTip;
      const tb = makeBone('Tail' + i, prevTailParent, tailPts[i], nextPt, V(0, 0, 1));
      tailBones.push(tb);
      prevTailParent = tb;
    }

    // True Giraffe Osteological Limb Joints:
    // Humerus (2.32 -> 1.90) & Femur (2.18 -> 1.78) sit naturally in the thorax/flank,
    // while long slender Radius/Tibia & Cannon columns stand gracefully beneath!
    const limbSpecs = {
      FL: {
        side: 1,
        isFront: true,
        parent: spineWithers,
        scapulaOrHip: V(0.185, 2.74, 0.24),
        upper: V(0.232, 2.32, 0.44),     // Point of shoulder
        mid: V(0.214, 1.90, 0.25),       // Elbow tucked right beside lower brisket!
        distal: V(0.204, 1.08, 0.30),    // Carpus ("front knee")
        fetlock: V(0.200, 0.23, 0.295),  // Front fetlock
        hoofTip: V(0.200, 0.00, 0.365)   // Cloven hoof sole center
      },
      FR: {
        side: -1,
        isFront: true,
        parent: spineWithers,
        scapulaOrHip: V(-0.185, 2.74, 0.24),
        upper: V(-0.232, 2.32, 0.44),
        mid: V(-0.214, 1.90, 0.25),
        distal: V(-0.204, 1.08, 0.30),
        fetlock: V(-0.200, 0.23, 0.295),
        hoofTip: V(-0.200, 0.00, 0.365)
      },
      HL: {
        side: 1,
        isFront: false,
        parent: pelvis,
        scapulaOrHip: V(0.180, 2.36, -0.70),
        upper: V(0.216, 2.18, -0.72),        // Hip (acetabulum)
        mid: V(0.210, 1.78, -0.53),          // Stifle tucked cleanly in flank fold!
        distal: V(0.196, 1.08, -0.76),       // Hock (calcaneus pointing backward!)
        fetlock: V(0.192, 0.23, -0.73),     // Hind fetlock
        hoofTip: V(0.192, 0.00, -0.66)       // Cloven hoof sole center
      },
      HR: {
        side: -1,
        isFront: false,
        parent: pelvis,
        scapulaOrHip: V(-0.180, 2.36, -0.70),
        upper: V(-0.216, 2.18, -0.72),
        mid: V(-0.210, 1.78, -0.53),
        distal: V(-0.196, 1.08, -0.76),
        fetlock: V(-0.192, 0.23, -0.73),
        hoofTip: V(-0.192, 0.00, -0.66)
      }
    };

    const limbRig = {};
    const fwdZ = V(0, 0, 1);

    for (const key of ['FL', 'FR', 'HL', 'HR']) {
      const sp = limbSpecs[key];
      const bRoot = makeBone(key + '_Root', sp.parent, sp.scapulaOrHip, sp.upper, fwdZ);
      const bUpper = makeBone(key + '_Upper', bRoot, sp.upper, sp.mid, fwdZ);
      const bMid = makeBone(key + '_Mid', bUpper, sp.mid, sp.distal, fwdZ);
      const bCannon = makeBone(key + '_Cannon', bMid, sp.distal, sp.fetlock, fwdZ);
      const bHoof = makeBone(key + '_Hoof', bCannon, sp.fetlock, sp.hoofTip, fwdZ);

      limbRig[key] = {
        key,
        side: sp.side,
        isFront: sp.isFront,
        bones: { root: bRoot, upper: bUpper, mid: bMid, cannon: bCannon, hoof: bHoof },
        rest: {
          scapulaOrHip: sp.scapulaOrHip.clone(),
          upper: sp.upper.clone(),
          mid: sp.mid.clone(),
          distal: sp.distal.clone(),
          fetlock: sp.fetlock.clone(),
          hoofTip: sp.hoofTip.clone()
        },
        lengths: {
          rootToUpper: sp.scapulaOrHip.distanceTo(sp.upper),
          upper: sp.upper.distanceTo(sp.mid),
          mid: sp.mid.distanceTo(sp.distal),
          cannon: sp.distal.distanceTo(sp.fetlock),
          pasternHoof: sp.fetlock.distanceTo(sp.hoofTip)
        }
      };
    }

    root.updateMatrixWorld(true);
    const boneIdx = {};
    bones.forEach((b, idx) => {
      boneIdx[b.name] = idx;
    });

    const geoParts = [];
    function pushSkinnedGeometry(geom) {
      geoParts.push(geom.index ? geom.toNonIndexed() : geom);
    }

    function normalizeWeights(w) {
      const sum = w[0] + w[1] + w[2] + w[3];
      if (sum > 1e-6) {
        w[0] /= sum; w[1] /= sum; w[2] /= sum; w[3] /= sum;
      } else {
        w[0] = 1; w[1] = 0; w[2] = 0; w[3] = 0;
      }
      return w;
    }

    // =========================================================================
    // 2. CONTINUOUS AXIAL BODY LOFT (MONOTONIC CONCAVE WITHERS & CAMELOID HEAD)
    // =========================================================================
    // Note: `fine` in [0..1] controls isotropic spot size blend (0 = large torso patches, 1 = small facial spots)
    const axialStations = [
      // Rounded muscular croup / rump cap
      { s: 0.000, y: 2.18, z: -0.97, hw: 0.006, dh: 0.006, vd: 0.006, tp: 1.0, bp: 1.0, fine: 0.12, cream: 0.03, dark: 0.0 },
      { s: 0.025, y: 2.21, z: -0.92, hw: 0.195, dh: 0.165, vd: 0.215, tp: 1.04, bp: 1.05, fine: 0.08, cream: 0.03, dark: 0.0 },
      { s: 0.065, y: 2.26, z: -0.81, hw: 0.285, dh: 0.195, vd: 0.310, tp: 1.08, bp: 1.10, fine: 0.05, cream: 0.03, dark: 0.0 },
      { s: 0.110, y: 2.31, z: -0.68, hw: 0.305, dh: 0.205, vd: 0.365, tp: 1.12, bp: 1.14, fine: 0.02, cream: 0.03, dark: 0.0 },
      // Short tucked loins / flank
      { s: 0.170, y: 2.40, z: -0.42, hw: 0.308, dh: 0.215, vd: 0.465, tp: 1.16, bp: 1.12, fine: 0.00, cream: 0.03, dark: 0.0 },
      { s: 0.230, y: 2.52, z: -0.10, hw: 0.338, dh: 0.245, vd: 0.625, tp: 1.25, bp: 1.22, fine: 0.00, cream: 0.03, dark: 0.0 },
      // Towering thoracic withers (sternum bottom aligns cleanly with elbow at y=1.90m!)
      { s: 0.290, y: 2.66, z: 0.22,  hw: 0.328, dh: 0.275, vd: 0.765, tp: 1.44, bp: 1.38, fine: 0.00, cream: 0.02, dark: 0.0 },
      { s: 0.335, y: 2.74, z: 0.42,  hw: 0.292, dh: 0.245, vd: 0.715, tp: 1.46, bp: 1.40, fine: 0.02, cream: 0.02, dark: 0.0 },
      { s: 0.380, y: 2.86, z: 0.60,  hw: 0.232, dh: 0.220, vd: 0.510, tp: 1.38, bp: 1.26, fine: 0.05, cream: 0.03, dark: 0.0 },
      // Graceful 2-meter Cervical Neck C7 -> C1
      { s: 0.430, y: 3.07, z: 0.78,  hw: 0.186, dh: 0.205, vd: 0.275, tp: 1.34, bp: 1.14, fine: 0.10, cream: 0.03, dark: 0.0 },
      { s: 0.495, y: 3.40, z: 0.99,  hw: 0.156, dh: 0.185, vd: 0.205, tp: 1.30, bp: 1.10, fine: 0.18, cream: 0.04, dark: 0.0 },
      { s: 0.565, y: 3.77, z: 1.21,  hw: 0.134, dh: 0.162, vd: 0.170, tp: 1.28, bp: 1.08, fine: 0.28, cream: 0.05, dark: 0.0 },
      { s: 0.635, y: 4.14, z: 1.43,  hw: 0.116, dh: 0.144, vd: 0.145, tp: 1.24, bp: 1.06, fine: 0.42, cream: 0.06, dark: 0.0 },
      { s: 0.700, y: 4.46, z: 1.62,  hw: 0.102, dh: 0.128, vd: 0.118, tp: 1.20, bp: 1.05, fine: 0.58, cream: 0.08, dark: 0.0 },
      // Poll / Occiput smooth arc -> Noble Giraffe Skull -> Facial Dish -> Blunt Cameloid Muzzle!
      { s: 0.755, y: 4.65, z: 1.75,  hw: 0.100, dh: 0.112, vd: 0.102, tp: 1.12, bp: 1.08, fine: 0.74, cream: 0.10, dark: 0.0 },
      { s: 0.805, y: 4.71, z: 1.86,  hw: 0.110, dh: 0.100, vd: 0.132, tp: 1.04, bp: 1.12, fine: 0.86, cream: 0.14, dark: 0.0 },
      // Wide Supraorbital Brow & Deep Masseter Cheek (z ~ 1.96)
      { s: 0.850, y: 4.68, z: 1.96,  hw: 0.112, dh: 0.092, vd: 0.144, tp: 0.94, bp: 1.18, fine: 0.94, cream: 0.18, dark: 0.0 },
      // Distinct ungulate stop / concave dish ahead of eyes into narrow nasal bridge!
      { s: 0.892, y: 4.61, z: 2.07,  hw: 0.068, dh: 0.064, vd: 0.106, tp: 1.04, bp: 1.20, fine: 0.98, cream: 0.30, dark: 0.0 },
      { s: 0.935, y: 4.53, z: 2.18,  hw: 0.056, dh: 0.056, vd: 0.082, tp: 1.06, bp: 1.16, fine: 1.00, cream: 0.52, dark: 0.08 },
      // Velvety flared nostrils & blunt cameloid prehensile upper lip!
      { s: 0.968, y: 4.46, z: 2.265, hw: 0.062, dh: 0.058, vd: 0.068, tp: 1.00, bp: 1.14, fine: 1.00, cream: 0.78, dark: 0.62 },
      { s: 0.990, y: 4.42, z: 2.318, hw: 0.048, dh: 0.048, vd: 0.046, tp: 0.96, bp: 1.12, fine: 1.00, cream: 0.92, dark: 0.92 },
      { s: 1.000, y: 4.40, z: 2.338, hw: 0.006, dh: 0.006, vd: 0.006, tp: 1.00, bp: 1.00, fine: 1.00, cream: 0.98, dark: 0.98 }
    ];

    const axialBoneNodes = [
      { s: 0.06, idx: boneIdx.Pelvis },
      { s: 0.16, idx: boneIdx.SpineLoins },
      { s: 0.25, idx: boneIdx.SpineChest },
      { s: 0.33, idx: boneIdx.SpineWithers },
      { s: 0.40, idx: boneIdx.Neck0 },
      { s: 0.46, idx: boneIdx.Neck1 },
      { s: 0.52, idx: boneIdx.Neck2 },
      { s: 0.58, idx: boneIdx.Neck3 },
      { s: 0.64, idx: boneIdx.Neck4 },
      { s: 0.69, idx: boneIdx.Neck5 },
      { s: 0.74, idx: boneIdx.Neck6 },
      { s: 0.80, idx: boneIdx.Head }
    ];

    function computeAxialSkinning(s, sinTheta, outIdx, outWgt) {
      outIdx[0] = 0; outIdx[1] = 0; outIdx[2] = 0; outIdx[3] = 0;
      outWgt[0] = 1; outWgt[1] = 0; outWgt[2] = 0; outWgt[3] = 0;

      if (s <= axialBoneNodes[0].s) {
        outIdx[0] = axialBoneNodes[0].idx;
        outWgt[0] = 1;
        return;
      }
      if (s >= axialBoneNodes[axialBoneNodes.length - 1].s) {
        const jawFactor = smoothstep(0.83, 0.93, s) * smoothstep(-0.18, -0.68, sinTheta) * (1.0 - smoothstep(0.972, 0.996, s));
        outIdx[0] = boneIdx.Head;
        outIdx[1] = boneIdx.Jaw;
        outWgt[0] = 1.0 - jawFactor * 0.75;
        outWgt[1] = jawFactor * 0.75;
        normalizeWeights(outWgt);
        return;
      }

      let k = 0;
      while (k < axialBoneNodes.length - 2 && s > axialBoneNodes[k + 1].s) k++;
      const n0 = axialBoneNodes[k];
      const n1 = axialBoneNodes[k + 1];
      const t = smoothstep(n0.s, n1.s, s);
      outIdx[0] = n0.idx;
      outIdx[1] = n1.idx;
      outWgt[0] = 1.0 - t;
      outWgt[1] = t;
    }

    (function buildAxialMesh() {
      const rings = 164;
      const radialSegs = 48;
      const vertsPerRing = radialSegs + 1;

      const positions = [];
      const restPositions = [];
      const coatParams = [];
      const uvs = [];
      const skinIndices = [];
      const skinWeights = [];
      const indices = [];

      const centers = [];
      for (let i = 0; i <= rings; i++) {
        const s = i / rings;
        const cy = sampleStationCurve(axialStations, 'y', s, 2.5);
        const cz = sampleStationCurve(axialStations, 'z', s, 0.0);
        centers.push(new THREE.Vector3(0, cy, cz));
      }

      const sIdx = [0, 0, 0, 0];
      const sWgt = [1, 0, 0, 0];

      for (let i = 0; i <= rings; i++) {
        const s = i / rings;
        const c = centers[i];
        // Smooth wider-window tangent so dorsal/ventral normals rotate ultra-gradually at bends!
        const cPrev = centers[Math.max(0, i - 3)];
        const cNext = centers[Math.min(rings, i + 3)];

        const tangent = new THREE.Vector3().subVectors(cNext, cPrev).normalize();
        const right = new THREE.Vector3(1, 0, 0);
        const dorsal = new THREE.Vector3().crossVectors(tangent, right).normalize();

        const hw = sampleStationCurve(axialStations, 'hw', s, 0.1);
        const dh = sampleStationCurve(axialStations, 'dh', s, 0.1);
        const vd = sampleStationCurve(axialStations, 'vd', s, 0.1);
        const tp = sampleStationCurve(axialStations, 'tp', s, 1.0);
        const bp = sampleStationCurve(axialStations, 'bp', s, 1.0);
        const fine = sampleStationCurve(axialStations, 'fine', s, 0.2);
        const baseCream = sampleStationCurve(axialStations, 'cream', s, 0.04);
        const baseDark = sampleStationCurve(axialStations, 'dark', s, 0.0);

        for (let j = 0; j <= radialSegs; j++) {
          const u = j / radialSegs;
          const theta = u * Math.PI * 2.0;
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);

          let xOff = Math.sign(cosT) * Math.pow(Math.abs(cosT), 0.94) * hw;
          let yOff;
          if (sinT >= 0) {
            const widthTaper = 1.0 - (tp - 1.0) * 0.42 * sinT * sinT;
            xOff *= clamp(widthTaper, 0.45, 1.25);
            yOff = Math.pow(sinT, 0.92) * dh;
          } else {
            const aSin = Math.abs(sinT);
            const widthTaper = 1.0 - (bp - 1.0) * 0.46 * aSin * aSin;
            xOff *= clamp(widthTaper, 0.38, 1.25);
            yOff = -Math.pow(aSin, 0.95) * vd;
          }

          // 1) Subtle intercostal ribcage relief & sternocephalicus neck muscle cords!
          const inRibs = smoothstep(0.16, 0.20, s) * (1.0 - smoothstep(0.28, 0.32, s));
          const ribLat = Math.pow(Math.abs(cosT), 1.8) * Math.exp(-Math.pow((sinT + 0.06) / 0.38, 2));
          const ribWave = Math.sin(s * 255.0 - sinT * 1.5) * inRibs * ribLat * 0.0026;
          xOff += Math.sign(cosT) * ribWave;

          const inNeck = smoothstep(0.40, 0.46, s) * (1.0 - smoothstep(0.69, 0.75, s));
          const jugularFurrow = inNeck * Math.exp(-Math.pow((sinT + 0.30) / 0.26, 2)) * Math.abs(cosT);
          const sternoMuscle = inNeck * Math.exp(-Math.pow((sinT + 0.56) / 0.20, 2)) * Math.abs(cosT);
          xOff *= (1.0 - jugularFurrow * 0.13 + sternoMuscle * 0.065);

          // Subtle throatlatch dewlap skin fold right beneath jaw-to-neck junction (s ~ 0.73..0.81)
          const dewlapZone = Math.exp(-Math.pow((s - 0.775) / 0.032, 2)) * Math.pow(Math.max(0, -sinT), 5.0)
                           * Math.exp(-Math.pow(cosT / 0.24, 2));
          yOff -= dewlapZone * 0.015;

          // 2) Cranial sculpting: overhanging supraorbital brow + fleshy orbital rim + recessed eye socket!
          const browZone = Math.exp(-Math.pow((s - 0.848) / 0.019, 2));
          const browArch = browZone * Math.exp(-Math.pow((sinT - 0.46) / 0.22, 2)) * Math.abs(cosT);
          const dEye = Math.hypot((s - 0.852) / 0.015, (sinT - 0.12) / 0.21);
          const eyeRim = Math.exp(-Math.pow((dEye - 0.92) / 0.35, 2)) * Math.abs(cosT);
          const eyeSocket = Math.exp(-Math.pow(dEye / 0.72, 2)) * Math.abs(cosT);
          xOff += Math.sign(cosT) * (browArch * 0.021 + eyeRim * 0.009 - eyeSocket * 0.022);
          yOff += browArch * 0.011;

          // 3) Median frontal ossicone boss between eyes
          const medianBoss = Math.exp(-Math.pow((s - 0.862) / 0.019, 2)) * Math.pow(Math.max(0, sinT), 6.0);
          yOff += medianBoss * 0.022;

          // 4) Squared masseter cheek muscle fullness on lower side of skull (s ~ 0.82..0.86)
          const cheekZone = Math.exp(-Math.pow((s - 0.835) / 0.025, 2)) * Math.exp(-Math.pow((sinT + 0.48) / 0.28, 2)) * Math.abs(cosT);
          xOff += Math.sign(cosT) * cheekZone * 0.014;

          // 5) Flared comma nostril wing + indented dark nostril slit + philtrum cleft on upper lip!
          const nostrilZone = Math.exp(-Math.pow((s - 0.968) / 0.013, 2));
          const nostrilWing = nostrilZone * Math.exp(-Math.pow((sinT - 0.36) / 0.24, 2)) * Math.abs(cosT);
          const nostrilSlit = nostrilZone * Math.exp(-Math.pow((sinT - 0.18) / 0.13, 2)) * Math.abs(cosT);
          xOff += Math.sign(cosT) * (nostrilWing * 0.012 - nostrilSlit * 0.016);

          // Cameloid split upper lip philtrum groove + lateral mouth-line commissure crease!
          const philtrum = smoothstep(0.972, 0.994, s) * Math.exp(-Math.pow(cosT / 0.18, 2)) * smoothstep(-0.3, 0.3, sinT);
          const mouthLine = smoothstep(0.928, 0.962, s) * (1.0 - smoothstep(0.992, 0.999, s))
                          * Math.exp(-Math.pow((sinT + 0.24) / 0.085, 2)) * Math.abs(cosT);
          xOff -= Math.sign(cosT) * mouthLine * 0.0065;
          yOff -= philtrum * 0.006;

          const vx = c.x + right.x * xOff + dorsal.x * yOff;
          const vy = c.y + right.y * xOff + dorsal.y * yOff;
          const vz = c.z + right.z * xOff + dorsal.z * yOff;

          positions.push(vx, vy, vz);
          restPositions.push(vx, vy, vz);
          uvs.push(u, s);

          // Cream lightening ONLY on true ventral underbelly (s in 0.08..0.28, pointing straight down!),
          // keeping bold giraffe patches across the entire front chest/pectorals!
          const inUnderbelly = smoothstep(0.06, 0.12, s) * (1.0 - smoothstep(0.25, 0.32, s));
          const bellyMask = Math.pow(Math.max(0, -sinT), 3.4) * inUnderbelly * 0.88;
          const creamMask = clamp(Math.max(baseCream, bellyMask), 0, 1);
          const darkMask = clamp(baseDark + nostrilSlit * 0.92 + mouthLine * 0.78, 0, 1);

          coatParams.push(fine, creamMask, darkMask, 0.0);

          computeAxialSkinning(s, sinT, sIdx, sWgt);
          skinIndices.push(sIdx[0], sIdx[1], sIdx[2], sIdx[3]);
          skinWeights.push(sWgt[0], sWgt[1], sWgt[2], sWgt[3]);
        }
      }

      for (let i = 0; i < rings; i++) {
        for (let j = 0; j < radialSegs; j++) {
          const a = i * vertsPerRing + j;
          const b = (i + 1) * vertsPerRing + j;
          const c = (i + 1) * vertsPerRing + (j + 1);
          const d = i * vertsPerRing + (j + 1);
          indices.push(a, d, b);
          indices.push(d, c, b);
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPositions, 3));
      geom.setAttribute('aCoatParams', new THREE.Float32BufferAttribute(coatParams, 4));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
      geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
      geom.setIndex(indices);
      geom.computeVertexNormals();
      pushSkinnedGeometry(geom);
    })();

    // =========================================================================
    // 3. FOUR UNGULATE LIMBS MATCHING TRUE OSTEOLOGY + CLOVEN HOOVES
    // =========================================================================
    function buildLimbGeometry(limb) {
      const { side, isFront, bones: lb } = limb;
      const bTorsoIdx = isFront ? boneIdx.SpineWithers : boneIdx.Pelvis;
      const bTorso2Idx = isFront ? boneIdx.SpineChest : boneIdx.SpineLoins;
      const bRootIdx = boneIdx[lb.root.name];
      const bUpperIdx = boneIdx[lb.upper.name];
      const bMidIdx = boneIdx[lb.mid.name];
      const bCannonIdx = boneIdx[lb.cannon.name];
      const bHoofIdx = boneIdx[lb.hoof.name];

      let stations;
      if (isFront) {
        stations = [
          // Broad scapular muscle embedded seamlessly in chest/withers wall
          { s: 0.000, x: side * 0.135, y: 2.75, z: 0.24, rx: 0.010, rz: 0.010, groove: 0.0, cleft: 0.0, fine: 0.02, cream: 0.02, hoof: 0.0 },
          { s: 0.055, x: side * 0.195, y: 2.60, z: 0.30, rx: 0.115, rz: 0.205, groove: 0.0, cleft: 0.0, fine: 0.04, cream: 0.03, hoof: 0.0 },
          // Point of shoulder (y = 2.32, z = 0.41)
          { s: 0.155, x: side * 0.224, y: 2.32, z: 0.40, rx: 0.118, rz: 0.190, groove: 0.0, cleft: 0.0, fine: 0.08, cream: 0.04, hoof: 0.0 },
          // Broad Triceps / Humerus apron -> Elbow at y = 1.90, z = 0.26
          { s: 0.295, x: side * 0.214, y: 1.90, z: 0.27, rx: 0.092, rz: 0.152, groove: 0.0, cleft: 0.0, fine: 0.22, cream: 0.08, hoof: 0.0 },
          // Long tapering Forearm (Radius/Ulna: 1.90 -> 1.08)
          { s: 0.440, x: side * 0.209, y: 1.48, z: 0.28, rx: 0.064, rz: 0.084, groove: 0.15, cleft: 0.0, fine: 0.48, cream: 0.18, hoof: 0.0 },
          // Carpus ("Front Knee" at y = 1.08)
          { s: 0.580, x: side * 0.204, y: 1.08, z: 0.302, rx: 0.051, rz: 0.062, groove: 0.12, cleft: 0.0, fine: 0.78, cream: 0.44, hoof: 0.0 },
          // Slender Cannon Bone (Metacarpus: 1.08 -> 0.23) with flexor tendon grooves
          { s: 0.650, x: side * 0.202, y: 0.86, z: 0.298, rx: 0.036, rz: 0.048, groove: 0.95, cleft: 0.0, fine: 0.92, cream: 0.68, hoof: 0.0 },
          { s: 0.780, x: side * 0.201, y: 0.45, z: 0.296, rx: 0.034, rz: 0.045, groove: 1.00, cleft: 0.0, fine: 1.00, cream: 0.90, hoof: 0.0 },
          // Fetlock joint bulb (y = 0.23)
          { s: 0.855, x: side * 0.200, y: 0.230, z: 0.295, rx: 0.045, rz: 0.055, groove: 0.20, cleft: 0.0, fine: 1.00, cream: 0.96, hoof: 0.0 },
          // Sloped Pastern
          { s: 0.902, x: side * 0.200, y: 0.145, z: 0.320, rx: 0.041, rz: 0.050, groove: 0.0, cleft: 0.12, fine: 1.00, cream: 1.00, hoof: 0.05 },
          // Cloven Keratin Hoof -> Flat sole at y = 0.000
          { s: 0.925, x: side * 0.200, y: 0.120, z: 0.332, rx: 0.048, rz: 0.060, groove: 0.0, cleft: 0.60, fine: 1.00, cream: 1.00, hoof: 0.96 },
          { s: 0.968, x: side * 0.200, y: 0.045, z: 0.356, rx: 0.060, rz: 0.080, groove: 0.0, cleft: 1.00, fine: 1.00, cream: 1.00, hoof: 1.00 },
          { s: 0.990, x: side * 0.200, y: 0.002, z: 0.368, rx: 0.064, rz: 0.088, groove: 0.0, cleft: 1.05, fine: 1.00, cream: 1.00, hoof: 1.00 },
          { s: 1.000, x: side * 0.200, y: 0.000, z: 0.368, rx: 0.002, rz: 0.002, groove: 0.0, cleft: 0.00, fine: 1.00, cream: 1.00, hoof: 1.00 }
        ];
      } else {
        stations = [
          // Smooth broad gluteal / rump muscle origin embedded inside pelvis
          { s: 0.000, x: side * 0.125, y: 2.38, z: -0.71, rx: 0.010, rz: 0.010, groove: 0.0, cleft: 0.0, fine: 0.04, cream: 0.03, hoof: 0.0 },
          { s: 0.060, x: side * 0.182, y: 2.27, z: -0.71, rx: 0.138, rz: 0.225, groove: 0.0, cleft: 0.0, fine: 0.05, cream: 0.03, hoof: 0.0 },
          // Muscular thigh (Hip 2.18 -> Stifle 1.78 in flank fold)
          { s: 0.155, x: side * 0.208, y: 2.08, z: -0.66, rx: 0.132, rz: 0.215, groove: 0.0, cleft: 0.0, fine: 0.10, cream: 0.05, hoof: 0.0 },
          { s: 0.295, x: side * 0.208, y: 1.78, z: -0.55, rx: 0.094, rz: 0.150, groove: 0.0, cleft: 0.0, fine: 0.24, cream: 0.10, hoof: 0.0 },
          // Gaskin / Tibia tapering down-and-back toward Hock (1.78 -> 1.08)
          { s: 0.445, x: side * 0.202, y: 1.42, z: -0.66, rx: 0.064, rz: 0.096, groove: 0.25, cleft: 0.0, fine: 0.50, cream: 0.22, hoof: 0.0 },
          // Hock / Tarsus with calcaneal point at y = 1.08, z = -0.76
          { s: 0.580, x: side * 0.196, y: 1.08, z: -0.762, rx: 0.050, rz: 0.076, groove: 0.35, cleft: 0.0, fine: 0.78, cream: 0.44, hoof: 0.0 },
          // Slender Hind Cannon (Metatarsus: 1.08 -> 0.23)
          { s: 0.650, x: side * 0.194, y: 0.86, z: -0.744, rx: 0.035, rz: 0.049, groove: 0.95, cleft: 0.0, fine: 0.92, cream: 0.68, hoof: 0.0 },
          { s: 0.780, x: side * 0.193, y: 0.45, z: -0.734, rx: 0.033, rz: 0.045, groove: 1.00, cleft: 0.0, fine: 1.00, cream: 0.90, hoof: 0.0 },
          // Hind Fetlock (y = 0.23)
          { s: 0.855, x: side * 0.192, y: 0.230, z: -0.730, rx: 0.044, rz: 0.054, groove: 0.20, cleft: 0.0, fine: 1.00, cream: 0.96, hoof: 0.0 },
          // Hind Pastern & Cloven Hoof
          { s: 0.902, x: side * 0.192, y: 0.145, z: -0.705, rx: 0.040, rz: 0.049, groove: 0.0, cleft: 0.12, fine: 1.00, cream: 1.00, hoof: 0.05 },
          { s: 0.925, x: side * 0.192, y: 0.120, z: -0.694, rx: 0.046, rz: 0.058, groove: 0.0, cleft: 0.60, fine: 1.00, cream: 1.00, hoof: 0.96 },
          { s: 0.968, x: side * 0.192, y: 0.045, z: -0.671, rx: 0.058, rz: 0.078, groove: 0.0, cleft: 1.00, fine: 1.00, cream: 1.00, hoof: 1.00 },
          { s: 0.990, x: side * 0.192, y: 0.002, z: -0.660, rx: 0.062, rz: 0.086, groove: 0.0, cleft: 1.05, fine: 1.00, cream: 1.00, hoof: 1.00 },
          { s: 1.000, x: side * 0.192, y: 0.000, z: -0.660, rx: 0.002, rz: 0.002, groove: 0.0, cleft: 0.00, fine: 1.00, cream: 1.00, hoof: 1.00 }
        ];
      }

      // Keep upper shoulder/thigh (s < 0.30) weighted cleanly to Torso + Scapula + Humerus/Femur
      // so the forearm/gaskin emerges smoothly below the brisket/flank without any joint pinch!
      const limbBoneStations = [
        { s: 0.06, idx: bTorsoIdx },
        { s: 0.14, idx: bRootIdx },
        { s: 0.27, idx: bUpperIdx },
        { s: 0.39, idx: bMidIdx },
        { s: 0.61, idx: bCannonIdx },
        { s: 0.87, idx: bHoofIdx }
      ];

      function computeLimbSkinning(s, cosT, outIdx, outWgt) {
        outIdx[0] = bTorsoIdx; outIdx[1] = bTorso2Idx; outIdx[2] = 0; outIdx[3] = 0;
        outWgt[0] = 1; outWgt[1] = 0; outWgt[2] = 0; outWgt[3] = 0;

        if (s <= limbBoneStations[0].s) {
          outIdx[0] = bTorsoIdx;
          outIdx[1] = bTorso2Idx;
          outWgt[0] = 0.80;
          outWgt[1] = 0.20;
          return;
        }
        if (s >= limbBoneStations[limbBoneStations.length - 1].s) {
          outIdx[0] = bHoofIdx;
          outWgt[0] = 1.0;
          return;
        }

        let k = 0;
        while (k < limbBoneStations.length - 2 && s > limbBoneStations[k + 1].s) k++;
        const n0 = limbBoneStations[k];
        const n1 = limbBoneStations[k + 1];
        const t = smoothstep(n0.s, n1.s, s);
        outIdx[0] = n0.idx;
        outIdx[1] = n1.idx;
        outWgt[0] = 1.0 - t;
        outWgt[1] = t;

        // Smoothly anchor upper shoulder/gluteal skirt to torso so hide stretches naturally without creasing!
        if (s < 0.22) {
          const skirtBlend = smoothstep(0.22, 0.05, s) * (0.45 + 0.35 * Math.max(0, -side * cosT));
          outIdx[2] = bTorsoIdx;
          outWgt[0] *= (1.0 - skirtBlend);
          outWgt[1] *= (1.0 - skirtBlend);
          outWgt[2] = skirtBlend;
          normalizeWeights(outWgt);
        }
      }

      const rings = 78;
      const radialSegs = 34;
      const vertsPerRing = radialSegs + 1;

      const positions = [];
      const restPositions = [];
      const coatParams = [];
      const uvs = [];
      const skinIndices = [];
      const skinWeights = [];
      const indices = [];

      const sIdx = [0, 0, 0, 0];
      const sWgt = [1, 0, 0, 0];

      for (let i = 0; i <= rings; i++) {
        const s = i / rings;
        const cx = sampleStationCurve(stations, 'x', s, 0);
        const cy = sampleStationCurve(stations, 'y', s, 1);
        const cz = sampleStationCurve(stations, 'z', s, 0);
        const rx = sampleStationCurve(stations, 'rx', s, 0.04);
        const rz = sampleStationCurve(stations, 'rz', s, 0.05);
        const groove = sampleStationCurve(stations, 'groove', s, 0.0);
        const cleft = sampleStationCurve(stations, 'cleft', s, 0.0);
        const fine = sampleStationCurve(stations, 'fine', s, 0.3);
        const baseCream = sampleStationCurve(stations, 'cream', s, 0.2);
        const hoof = sampleStationCurve(stations, 'hoof', s, 0.0);

        const hockCalcaneus = !isFront ? Math.exp(-Math.pow((s - 0.578) / 0.025, 2)) : 0.0;

        for (let j = 0; j <= radialSegs; j++) {
          const u = j / radialSegs;
          const theta = u * Math.PI * 2.0;
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);

          let dx = cosT * rx;
          let dz = sinT * rz;

          if (groove > 0.01) {
            const sidePinch = Math.pow(Math.abs(cosT), 1.6) * Math.exp(-Math.pow((sinT + 0.18) / 0.42, 2));
            dx *= (1.0 - groove * sidePinch * 0.27);
          }

          if (hockCalcaneus > 0.01 && sinT < 0) {
            dz -= Math.pow(-sinT, 4.0) * hockCalcaneus * 0.032;
          }

          // Deep symmetrical cloven hoof cleft down front toe & heel bulbs
          let cleftLift = 0.0;
          if (cleft > 0.01) {
            const frontSplit = Math.exp(-Math.pow(cosT / 0.16, 2)) * smoothstep(-0.15, 0.85, sinT);
            const heelSplit = Math.exp(-Math.pow(cosT / 0.22, 2)) * smoothstep(0.1, -0.85, sinT) * 0.45;
            dz -= cleft * frontSplit * 0.036;
            dz += cleft * heelSplit * 0.016;
            cleftLift = cleft * frontSplit * 0.014 * smoothstep(0.95, 0.99, s);
          }

          const vx = cx + dx;
          const vy = Math.max(0.0, cy + cleftLift);
          const vz = cz + dz;

          positions.push(vx, vy, vz);
          restPositions.push(vx, vy, vz);
          uvs.push(u, s);

          const medialAspect = Math.max(0, -side * cosT);
          const creamVal = clamp(baseCream + medialAspect * 0.46 * (1.0 - s * 0.45), 0, 1);
          coatParams.push(fine, creamVal, 0.0, hoof);

          computeLimbSkinning(s, cosT, sIdx, sWgt);
          skinIndices.push(sIdx[0], sIdx[1], sIdx[2], sIdx[3]);
          skinWeights.push(sWgt[0], sWgt[1], sWgt[2], sWgt[3]);
        }
      }

      for (let i = 0; i < rings; i++) {
        for (let j = 0; j < radialSegs; j++) {
          const a = i * vertsPerRing + j;
          const b = (i + 1) * vertsPerRing + j;
          const c = (i + 1) * vertsPerRing + (j + 1);
          const d = i * vertsPerRing + (j + 1);
          indices.push(a, d, b);
          indices.push(d, c, b);
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPositions, 3));
      geom.setAttribute('aCoatParams', new THREE.Float32BufferAttribute(coatParams, 4));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
      geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
      geom.setIndex(indices);
      geom.computeVertexNormals();
      pushSkinnedGeometry(geom);
    }

    for (const key of ['FL', 'FR', 'HL', 'HR']) {
      buildLimbGeometry(limbRig[key]);
    }

    // =========================================================================
    // 4. PARIETAL OSSICONES + FUZZY BLACK HAIR-TUFT CROWNS
    // =========================================================================
    const ossiconeTips = [];

    function buildOssicone(side) {
      const rings = 18;
      const segs = 18;
      const vertsPerRing = segs + 1;
      const headIdx = boneIdx.Head;

      const base = new THREE.Vector3(side * 0.054, 4.745, 1.875);
      const axis = new THREE.Vector3(side * 0.05, 0.93, -0.36).normalize();
      const length = 0.175;

      const right = new THREE.Vector3(1, 0, 0);
      const ortho1 = new THREE.Vector3().crossVectors(axis, right).normalize();
      const ortho2 = new THREE.Vector3().crossVectors(axis, ortho1).normalize();

      const positions = [];
      const restPositions = [];
      const coatParams = [];
      const uvs = [];
      const skinIndices = [];
      const skinWeights = [];
      const indices = [];

      for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        let radius;
        if (t < 0.20) {
          radius = lerp(0.036, 0.020, smoothstep(0.0, 0.20, t));
        } else if (t < 0.72) {
          radius = lerp(0.020, 0.025, smoothstep(0.20, 0.72, t));
        } else {
          const capT = (t - 0.72) / 0.28;
          radius = 0.027 * Math.sqrt(Math.max(0.0004, 1.0 - capT * capT));
        }

        const c = base.clone().addScaledVector(axis, t * length);
        const darkTip = smoothstep(0.60, 0.78, t);

        for (let j = 0; j <= segs; j++) {
          const u = j / segs;
          const th = u * Math.PI * 2.0;
          const r = radius + darkTip * 0.002 * Math.sin(th * 9.0 + t * 12.0);
          const vx = c.x + (ortho2.x * Math.cos(th) + ortho1.x * Math.sin(th)) * r;
          const vy = c.y + (ortho2.y * Math.cos(th) + ortho1.y * Math.sin(th)) * r;
          const vz = c.z + (ortho2.z * Math.cos(th) + ortho1.z * Math.sin(th)) * r;

          positions.push(vx, vy, vz);
          restPositions.push(vx, vy, vz);
          coatParams.push(0.95, 0.32, darkTip * 0.96, 0.0);
          uvs.push(u, t);
          skinIndices.push(headIdx, 0, 0, 0);
          skinWeights.push(1, 0, 0, 0);
        }
      }

      for (let i = 0; i < rings; i++) {
        for (let j = 0; j < segs; j++) {
          const a = i * vertsPerRing + j;
          const b = (i + 1) * vertsPerRing + j;
          const c = (i + 1) * vertsPerRing + (j + 1);
          const d = i * vertsPerRing + (j + 1);
          indices.push(a, b, d);
          indices.push(b, c, d);
        }
      }

      ossiconeTips.push({
        pos: base.clone().addScaledVector(axis, length * 0.80),
        axis: axis.clone()
      });

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPositions, 3));
      geom.setAttribute('aCoatParams', new THREE.Float32BufferAttribute(coatParams, 4));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
      geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
      geom.setIndex(indices);
      geom.computeVertexNormals();
      pushSkinnedGeometry(geom);
    }

    buildOssicone(1);
    buildOssicone(-1);

    // =========================================================================
    // 5. SCULPTED CUPPED LEAF EARS
    // =========================================================================
    function buildEar(side) {
      const earIdx = side > 0 ? boneIdx.EarL : boneIdx.EarR;
      const headIdx = boneIdx.Head;
      const rings = 22;
      const segs = 22;
      const vertsPerRing = segs + 1;

      const base = new THREE.Vector3(side * 0.088, 4.675, 1.805);
      const axis = new THREE.Vector3(side * 0.84, 0.36, -0.40).normalize();
      const faceFwd = new THREE.Vector3(side * 0.22, -0.12, 0.96).normalize();
      const orthoUp = new THREE.Vector3().crossVectors(faceFwd, axis).normalize();
      if (orthoUp.y < 0) orthoUp.negate();
      const orthoFwd = new THREE.Vector3().crossVectors(axis, orthoUp).normalize();

      const length = 0.215;

      const positions = [];
      const restPositions = [];
      const coatParams = [];
      const uvs = [];
      const skinIndices = [];
      const skinWeights = [];
      const indices = [];

      for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        // Narrow tubular stalk -> graceful leaf pinna -> delicate pointed tip
        const stalkPinch = smoothstep(0.0, 0.24, t);
        const leafWidth = (0.014 * (1.0 - stalkPinch) + Math.sin(Math.pow(t, 0.78) * Math.PI) * 0.048 * stalkPinch);
        const thickness = 0.014 * (1.0 - 0.68 * t);
        const cupDepth = Math.sin(t * Math.PI) * 0.024 * stalkPinch;
        const tipDroop = t * t * 0.014;

        const c = base.clone()
          .addScaledVector(axis, t * length)
          .addScaledVector(orthoUp, -tipDroop);

        const wEar = smoothstep(0.02, 0.18, t);

        for (let j = 0; j <= segs; j++) {
          const u = j / segs;
          const th = u * Math.PI * 2.0;
          const cosT = Math.cos(th);
          const sinT = Math.sin(th);

          const wOff = cosT * leafWidth;
          let fOff;
          if (sinT >= 0) {
            fOff = thickness * 0.32 * sinT - cupDepth * (1.0 - cosT * cosT);
          } else {
            fOff = sinT * thickness - cupDepth * 0.55 * (1.0 - cosT * cosT);
          }

          const vx = c.x + orthoUp.x * wOff + orthoFwd.x * fOff;
          const vy = c.y + orthoUp.y * wOff + orthoFwd.y * fOff;
          const vz = c.z + orthoUp.z * wOff + orthoFwd.z * fOff;

          positions.push(vx, vy, vz);
          restPositions.push(vx, vy, vz);
          uvs.push(u, t);

          const isInner = smoothstep(-0.02, 0.38, sinT) * smoothstep(0.16, 0.32, t);
          const tipDark = smoothstep(0.76, 0.98, t) * (1.0 - isInner * 0.85);
          coatParams.push(0.95, clamp(0.32 + isInner * 0.68, 0, 1), tipDark * 0.88, 0.0);

          skinIndices.push(earIdx, headIdx, 0, 0);
          skinWeights.push(wEar, 1.0 - wEar, 0, 0);
        }
      }

      for (let i = 0; i < rings; i++) {
        for (let j = 0; j < segs; j++) {
          const a = i * vertsPerRing + j;
          const b = (i + 1) * vertsPerRing + j;
          const c = (i + 1) * vertsPerRing + (j + 1);
          const d = i * vertsPerRing + (j + 1);
          indices.push(a, d, b);
          indices.push(d, c, b);
        }
      }

      // Attach feathery cream inner-ear guard hair fringe to EarL / EarR bone!
      const earBone = side > 0 ? earLBone : earRBone;
      earBone.updateMatrixWorld(true);
      const invEar = new THREE.Matrix4().copy(earBone.matrixWorld).invert();
      const earHairPos = [];
      const earHairUvs = [];
      const earHairIdx = [];
      const hSegs = 14;
      for (const edgeSign of [-1, 1]) {
        const baseOff = earHairPos.length / 3;
        for (let i = 0; i <= hSegs; i++) {
          const u = i / hSegs;
          const t = lerp(0.22, 0.86, u);
          const stalkPinch = smoothstep(0.0, 0.24, t);
          const leafWidth = (0.014 * (1.0 - stalkPinch) + Math.sin(Math.pow(t, 0.78) * Math.PI) * 0.048 * stalkPinch);
          const tipDroop = t * t * 0.014;
          const c = base.clone().addScaledVector(axis, t * length).addScaledVector(orthoUp, -tipDroop);

          const rootW = c.clone()
            .addScaledVector(orthoUp, edgeSign * leafWidth * 0.86)
            .addScaledVector(orthoFwd, -0.002);
          const tipW = c.clone()
            .addScaledVector(orthoUp, edgeSign * leafWidth * 0.10)
            .addScaledVector(orthoFwd, 0.012);

          rootW.applyMatrix4(invEar);
          tipW.applyMatrix4(invEar);

          earHairPos.push(rootW.x, rootW.y, rootW.z, tipW.x, tipW.y, tipW.z);
          earHairUvs.push(u, 0.0, u, 1.0);
        }
        for (let i = 0; i < hSegs; i++) {
          const a = baseOff + i * 2;
          earHairIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const earHairGeo = new THREE.BufferGeometry();
      earHairGeo.setAttribute('position', new THREE.Float32BufferAttribute(earHairPos, 3));
      earHairGeo.setAttribute('uv', new THREE.Float32BufferAttribute(earHairUvs, 2));
      earHairGeo.setIndex(earHairIdx);
      earHairGeo.computeVertexNormals();
      earBone.add(new THREE.Mesh(earHairGeo, paleEarHairMaterial));

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPositions, 3));
      geom.setAttribute('aCoatParams', new THREE.Float32BufferAttribute(coatParams, 4));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
      geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
      geom.setIndex(indices);
      geom.computeVertexNormals();
      pushSkinnedGeometry(geom);
    }

    buildEar(1);
    buildEar(-1);

    // =========================================================================
    // 6. ARTICULATED 6-BONE TAIL SHAFT
    // =========================================================================
    (function buildTailShaft() {
      const rings = 28;
      const segs = 14;
      const vertsPerRing = segs + 1;

      const allPts = [...tailPts, tailEndTip];
      const curve = new THREE.CatmullRomCurve3(allPts);

      const positions = [];
      const restPositions = [];
      const coatParams = [];
      const uvs = [];
      const skinIndices = [];
      const skinWeights = [];
      const indices = [];

      for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        const c = curve.getPoint(t);
        const tan = curve.getTangent(t).normalize();
        const right = new THREE.Vector3(1, 0, 0);
        const fwd = new THREE.Vector3().crossVectors(right, tan).normalize();

        const r = lerp(0.033, 0.012, Math.pow(t, 0.72));

        const fBone = t * (tailBones.length - 0.01);
        const b0 = Math.min(tailBones.length - 1, Math.floor(fBone));
        const b1 = Math.min(tailBones.length - 1, b0 + 1);
        const frac = fBone - b0;
        const idx0 = t < 0.06 ? boneIdx.Pelvis : boneIdx[tailBones[b0].name];
        const idx1 = t < 0.06 ? boneIdx[tailBones[0].name] : boneIdx[tailBones[b1].name];
        const w1 = t < 0.06 ? smoothstep(0.0, 0.06, t) : frac;
        const w0 = 1.0 - w1;

        for (let j = 0; j <= segs; j++) {
          const u = j / segs;
          const th = u * Math.PI * 2.0;
          const vx = c.x + (right.x * Math.cos(th) + fwd.x * Math.sin(th)) * r;
          const vy = c.y + (right.y * Math.cos(th) + fwd.y * Math.sin(th)) * r;
          const vz = c.z + (right.z * Math.cos(th) + fwd.z * Math.sin(th)) * r;

          positions.push(vx, vy, vz);
          restPositions.push(vx, vy, vz);
          coatParams.push(0.85, 0.38 + t * 0.45, smoothstep(0.76, 0.98, t) * 0.92, 0.0);
          uvs.push(u, t);
          skinIndices.push(idx0, idx1, 0, 0);
          skinWeights.push(w0, w1, 0, 0);
        }
      }

      for (let i = 0; i < rings; i++) {
        for (let j = 0; j < segs; j++) {
          const a = i * vertsPerRing + j;
          const b = (i + 1) * vertsPerRing + j;
          const c = (i + 1) * vertsPerRing + (j + 1);
          const d = i * vertsPerRing + (j + 1);
          indices.push(a, b, d);
          indices.push(b, c, d);
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPositions, 3));
      geom.setAttribute('aCoatParams', new THREE.Float32BufferAttribute(coatParams, 4));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
      geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
      geom.setIndex(indices);
      geom.computeVertexNormals();
      pushSkinnedGeometry(geom);
    })();

    const mergedBodyGeo = THREE.BufferGeometryUtils.mergeGeometries(geoParts, false);
    const skeleton = new THREE.Skeleton(bones);

    const bodyMesh = new THREE.SkinnedMesh(mergedBodyGeo, skinMaterial);
    bodyMesh.name = 'GiraffeBodySkinnedMesh';
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    bodyMesh.frustumCulled = false;

    group.add(root);
    group.add(bodyMesh);
    bodyMesh.bind(skeleton, new THREE.Matrix4());

    // =========================================================================
    // 7. SKINNED DORSAL CERVICAL MANE (WITHERS -> POLL, ZERO GAP)
    // =========================================================================
    (function buildSkinnedMane() {
      const steps = 60;
      const blades = [-0.22, 0.0, 0.22];
      const positions = [];
      const uvs = [];
      const skinIndices = [];
      const skinWeights = [];
      const indices = [];

      const sIdx = [0, 0, 0, 0];
      const sWgt = [1, 0, 0, 0];

      for (let b = 0; b < blades.length; b++) {
        const tilt = blades[b];
        const baseVertOffset = positions.length / 3;

        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const s = lerp(0.285, 0.775, u);
          const cy = sampleStationCurve(axialStations, 'y', s, 3.0);
          const cz = sampleStationCurve(axialStations, 'z', s, 1.0);
          const cyPrev = sampleStationCurve(axialStations, 'y', Math.max(0, s - 0.015), 3.0);
          const czPrev = sampleStationCurve(axialStations, 'z', Math.max(0, s - 0.015), 1.0);
          const cyNext = sampleStationCurve(axialStations, 'y', Math.min(1, s + 0.015), 3.0);
          const czNext = sampleStationCurve(axialStations, 'z', Math.min(1, s + 0.015), 1.0);
          const dh = sampleStationCurve(axialStations, 'dh', s, 0.16);

          const tangent = new THREE.Vector3(0, cyNext - cyPrev, czNext - czPrev).normalize();
          const dorsal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(1, 0, 0)).normalize();

          const rootPt = new THREE.Vector3(
            tilt * 0.016,
            cy + dorsal.y * (dh - 0.012),
            cz + dorsal.z * (dh - 0.012)
          );

          const endTaper = smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.90, u);
          const maneHeight = (0.042 + 0.074 * endTaper) * (b === 1 ? 1.06 : 0.92);

          const dir = new THREE.Vector3(
            Math.sin(tilt),
            dorsal.y * Math.cos(tilt),
            dorsal.z * Math.cos(tilt)
          ).normalize();

          const tipPt = rootPt.clone().addScaledVector(dir, maneHeight);

          computeAxialSkinning(s, 1.0, sIdx, sWgt);

          positions.push(rootPt.x, rootPt.y, rootPt.z);
          uvs.push(u, 0.0);
          skinIndices.push(sIdx[0], sIdx[1], sIdx[2], sIdx[3]);
          skinWeights.push(sWgt[0], sWgt[1], sWgt[2], sWgt[3]);

          positions.push(tipPt.x, tipPt.y, tipPt.z);
          uvs.push(u, 1.0);
          skinIndices.push(sIdx[0], sIdx[1], sIdx[2], sIdx[3]);
          skinWeights.push(sWgt[0], sWgt[1], sWgt[2], sWgt[3]);
        }

        for (let i = 0; i < steps; i++) {
          const r0 = baseVertOffset + i * 2;
          const t0 = r0 + 1;
          const r1 = r0 + 2;
          const t1 = r0 + 3;
          indices.push(r0, t0, r1);
          indices.push(t0, t1, r1);
        }
      }

      const maneGeo = new THREE.BufferGeometry();
      maneGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      maneGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      maneGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
      maneGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
      maneGeo.setIndex(indices);
      maneGeo.computeVertexNormals();

      const maneMesh = new THREE.SkinnedMesh(maneGeo, maneMaterial);
      maneMesh.name = 'GiraffeManeMesh';
      maneMesh.castShadow = true;
      maneMesh.receiveShadow = true;
      maneMesh.frustumCulled = false;
      group.add(maneMesh);
      maneMesh.bind(skeleton, new THREE.Matrix4());
    })();

    // =========================================================================
    // 8. FUZZY BLACK OSSICONE HAIR-TUFT CROWNS & FLOWING TAIL SWITCH
    // =========================================================================
    headBone.updateMatrixWorld(true);
    const invHeadMat = new THREE.Matrix4().copy(headBone.matrixWorld).invert();

    for (const tip of ossiconeTips) {
      const tuftHolder = new THREE.Group();
      tuftHolder.position.copy(tip.pos.clone().applyMatrix4(invHeadMat));
      tuftHolder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.axis);

      // Fuzzy radial multi-layer dark hair tuft crown (no solid hard sphere seam!)
      const tuftPos = [];
      const tuftUvs = [];
      const tuftIdx = [];
      const ringsCount = 3;
      const petals = 18;
      for (let ring = 0; ring < ringsCount; ring++) {
        const rScale = 1.0 - ring * 0.28;
        for (let f = 0; f < petals; f++) {
          const a0 = (f / petals) * Math.PI * 2.0 + ring * 0.21;
          const a1 = a0 + (Math.PI * 2.0 / petals) * 1.45;
          const rBase = 0.024 * rScale;
          const rTip = 0.014 * rScale;
          const y0 = -0.002 + ring * 0.005;
          const y1 = 0.036 + ring * 0.006;
          const base = tuftPos.length / 3;
          tuftPos.push(
            Math.cos(a0) * rBase, y0, Math.sin(a0) * rBase,
            Math.cos(a1) * rBase, y0, Math.sin(a1) * rBase,
            Math.cos(a0) * rTip,  y1, Math.sin(a0) * rTip,
            Math.cos(a1) * rTip,  y1, Math.sin(a1) * rTip
          );
          tuftUvs.push(0, 0, 1, 0, 0, 1, 1, 1);
          tuftIdx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        }
      }
      const tuftGeo = new THREE.BufferGeometry();
      tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(tuftPos, 3));
      tuftGeo.setAttribute('uv', new THREE.Float32BufferAttribute(tuftUvs, 2));
      tuftGeo.setIndex(tuftIdx);
      tuftGeo.computeVertexNormals();
      tuftHolder.add(new THREE.Mesh(tuftGeo, darkHairMaterial));
      headBone.add(tuftHolder);
    }

    (function buildTailSwitch() {
      const tailTipBone = tailBones[tailBones.length - 1];
      const tuftGroup = new THREE.Group();
      tuftGroup.position.set(0, 0.13, 0);

      const cardCount = 10;
      const positions = [];
      const uvs = [];
      const indices = [];

      for (let c = 0; c < cardCount; c++) {
        const angle = (c / cardCount) * Math.PI;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const rows = 10;
        const baseV = positions.length / 3;

        for (let r = 0; r <= rows; r++) {
          const v = r / rows;
          const y = v * 0.42;
          const halfW = (0.014 + Math.sin(Math.pow(v, 0.65) * Math.PI) * 0.048) * (1.0 - 0.22 * v);
          const waveZ = Math.sin(v * 4.2 + c * 0.7) * 0.013 * v;

          positions.push(-cosA * halfW, y, -sinA * halfW + waveZ);
          uvs.push(0.0, v);
          positions.push(cosA * halfW, y, sinA * halfW + waveZ);
          uvs.push(1.0, v);
        }

        for (let r = 0; r < rows; r++) {
          const a = baseV + r * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }

      const switchGeo = new THREE.BufferGeometry();
      switchGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      switchGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      switchGeo.setIndex(indices);
      switchGeo.computeVertexNormals();

      const switchMesh = new THREE.Mesh(switchGeo, darkHairMaterial);
      switchMesh.castShadow = true;
      tuftGroup.add(switchMesh);
      tailTipBone.add(tuftGroup);
    })();

    // =========================================================================
    // 9. PROPERLY RECESSED SOULFUL EYES, OPEN EYELIDS & CURVED EYELASHES
    // =========================================================================
    const eyelidMeshes = [];
    const darkSkinRimMat = new THREE.MeshStandardMaterial({
      color: 0x261d17,
      roughness: 0.62,
      metalness: 0.0
    });

    function attachEyeAssembly(side) {
      // Snugly nestled inside the sculpted orbital rim beneath the overhanging brow ridge!
      const eyeWorldPos = new THREE.Vector3(side * 0.0805, 4.679, 1.964);
      const eyeHolder = new THREE.Group();
      eyeHolder.position.copy(eyeWorldPos.clone().applyMatrix4(invHeadMat));

      // Align eye local frame cleanly: +Z = outward-forward gaze, +Y = world up (so lids sit strictly top/bottom!)
      const gazeZ = new THREE.Vector3(side * 0.89, -0.10, 0.44).normalize();
      const worldUp = new THREE.Vector3(0, 1, 0);
      const eyeX = new THREE.Vector3().crossVectors(worldUp, gazeZ).normalize();
      const eyeY = new THREE.Vector3().crossVectors(gazeZ, eyeX).normalize();
      const basis = new THREE.Matrix4().makeBasis(eyeX, eyeY, gazeZ);
      eyeHolder.quaternion.setFromRotationMatrix(basis);

      const eyeRadius = 0.0245;
      const eyeGeo = new THREE.SphereGeometry(eyeRadius, 28, 22);
      const eyeMesh = new THREE.Mesh(eyeGeo, eyeMaterial);
      eyeHolder.add(eyeMesh);

      // Upper eyelid: compact northern cap (thetaLength = 0.30*PI) tilted back (-0.28 rad)
      // so its margin sits high at +42 deg above gaze axis, leaving the soulful dark-amber eye wide open!
      const upperLidGroup = new THREE.Group();
      const upperLidGeo = new THREE.SphereGeometry(eyeRadius * 1.055, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.30);
      const upperLid = new THREE.Mesh(upperLidGeo, darkSkinRimMat);
      upperLid.rotation.x = -0.28;
      upperLidGroup.add(upperLid);

      // Sweeping dark giraffe upper eyelashes emerging from the HIGH upper lid margin (y ~ +0.017)
      // and fanning outward-and-upward ABOVE the cornea (never occluding the iris!)
      const lashSegs = 22;
      const lashPos = [];
      const lashUvs = [];
      const lashIdx = [];
      for (let i = 0; i <= lashSegs; i++) {
        const u = i / lashSegs;
        const ang = lerp(-0.88, 0.88, u);
        const rimR = eyeRadius * 1.04;
        // Point on upper lid margin (~42 deg elevation above +Z equator)
        const elev = 0.72; // ~41 deg
        const rx = Math.sin(ang) * Math.cos(elev) * rimR;
        const ry = Math.sin(elev) * rimR;
        const rz = Math.cos(ang) * Math.cos(elev) * rimR;

        const lashLen = 0.032 * Math.pow(Math.sin(u * Math.PI), 0.60);
        // Fan outward, upward AND slightly backward/sideways so long dark lashes read crisply in silhouette!
        const tx = rx + Math.sin(ang) * lashLen * 0.82;
        const ty = ry + lashLen * 0.36;
        const tz = rz + lashLen * 0.78;

        lashPos.push(rx, ry, rz);
        lashUvs.push(u, 0.0);
        lashPos.push(tx, ty, tz);
        lashUvs.push(u, 1.0);
      }
      for (let i = 0; i < lashSegs; i++) {
        const a = i * 2;
        lashIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const lashGeo = new THREE.BufferGeometry();
      lashGeo.setAttribute('position', new THREE.Float32BufferAttribute(lashPos, 3));
      lashGeo.setAttribute('uv', new THREE.Float32BufferAttribute(lashUvs, 2));
      lashGeo.setIndex(lashIdx);
      lashGeo.computeVertexNormals();
      upperLidGroup.add(new THREE.Mesh(lashGeo, darkHairMaterial));

      eyeHolder.add(upperLidGroup);
      eyelidMeshes.push(upperLidGroup);

      // Lower eyelid southern cap (thetaStart = 0.72*PI, thetaLength = 0.28*PI) framing bottom of orbit cleanly
      const lowerLidGeo = new THREE.SphereGeometry(eyeRadius * 1.05, 22, 10, 0, Math.PI * 2, Math.PI * 0.72, Math.PI * 0.28);
      const lowerLid = new THREE.Mesh(lowerLidGeo, darkSkinRimMat);
      lowerLid.rotation.x = 0.24;
      eyeHolder.add(lowerLid);

      headBone.add(eyeHolder);
    }

    attachEyeAssembly(1);
    attachEyeAssembly(-1);

    const skeletonHelper = new THREE.SkeletonHelper(root);
    skeletonHelper.visible = false;
    skeletonHelper.material.depthTest = false;
    skeletonHelper.material.transparent = true;
    skeletonHelper.material.opacity = 0.85;
    skeletonHelper.renderOrder = 10;

    return {
      group,
      root,
      bones,
      boneMap,
      neckBones,
      tailBones,
      limbRig,
      eyelidMeshes,
      skeleton,
      skeletonHelper,
      bodyMesh,
      materials: {
        skin: skinMaterial,
        eye: eyeMaterial,
        mane: maneMaterial,
        darkHair: darkHairMaterial
      }
    };
  }

  window.GiraffeMesh = {
    createGiraffeCharacter
  };
})();
