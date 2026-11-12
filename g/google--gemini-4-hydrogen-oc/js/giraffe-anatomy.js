(function (global) {
  'use strict';

  const { lerp, smoothstep, clamp } = global.GiraffeMath;

  /**
   * Builds a complete anatomical SkinnedMesh giraffe + attached detail meshes.
   * Local coordinate system at rest pose:
   *   +Z = Forward (muzzle)
   *   +Y = Up (hooves rest at y = 0)
   *   +X = Giraffe's Left (-X = Giraffe's Right)
   */
  function createGiraffeModel() {
    const rootGroup = new THREE.Group();
    rootGroup.name = 'GiraffeRoot';

    // ------------------------------------------------------------
    // 1. Skeleton Bone Hierarchy (exact rest-pose coordinates)
    // ------------------------------------------------------------
    const bones = [];
    const boneByName = {};

    function makeBone(name, parent, worldX, worldY, worldZ) {
      const b = new THREE.Bone();
      b.name = name;
      if (parent) {
        parent.add(b);
        const pWorld = parent.userData.restWorld;
        b.position.set(worldX - pWorld.x, worldY - pWorld.y, worldZ - pWorld.z);
      } else {
        b.position.set(worldX, worldY, worldZ);
      }
      b.userData.restWorld = new THREE.Vector3(worldX, worldY, worldZ);
      b.userData.index = bones.length;
      bones.push(b);
      boneByName[name] = b;
      return b;
    }

    // Spine -> Neck -> Head -> Facial/Tail
    const rootBone = makeBone('root', null, 0, 2.54, -0.05);
    const pelvis = makeBone('pelvis', rootBone, 0, 2.48, -0.74);
    const lumbar = makeBone('lumbar', rootBone, 0, 2.60, -0.24);
    const chest = makeBone('chest', lumbar, 0, 2.75, 0.34);

    const neck0 = makeBone('neck0', chest, 0, 2.86, 0.68);
    const neck1 = makeBone('neck1', neck0, 0, 3.32, 1.00);
    const neck2 = makeBone('neck2', neck1, 0, 3.80, 1.26);
    const neck3 = makeBone('neck3', neck2, 0, 4.28, 1.47);
    const head = makeBone('head', neck3, 0, 4.74, 1.64);
    const jaw = makeBone('jaw', head, 0, 4.62, 1.84);
    const earL = makeBone('earL', head, 0.132, 4.82, 1.66);
    const earR = makeBone('earR', head, -0.132, 4.82, 1.66);

    const tail0 = makeBone('tail0', pelvis, 0, 2.40, -0.98);
    const tail1 = makeBone('tail1', tail0, 0, 2.00, -1.04);
    const tail2 = makeBone('tail2', tail1, 0, 1.58, -1.06);
    const tail3 = makeBone('tail3', tail2, 0, 1.18, -1.05);

    // Forelimbs (+X Left, -X Right)
    function makeForelimb(side, sx) {
      const shoulder = makeBone('shoulder' + side, chest, sx * 0.27, 2.54, 0.57);
      const upperArm = makeBone('upperArm' + side, shoulder, sx * 0.27, 2.38, 0.62);
      const forearm = makeBone('forearm' + side, upperArm, sx * 0.25, 2.04, 0.54);
      const foreCannon = makeBone('foreCannon' + side, forearm, sx * 0.23, 1.12, 0.54);
      const forePastern = makeBone('forePastern' + side, foreCannon, sx * 0.21, 0.22, 0.53);
      return { shoulder, upperArm, forearm, foreCannon, forePastern };
    }

    // Hindlimbs (+X Left, -X Right)
    function makeHindlimb(side, sx) {
      const hip = makeBone('hip' + side, pelvis, sx * 0.27, 2.36, -0.72);
      const gaskin = makeBone('gaskin' + side, hip, sx * 0.25, 1.94, -0.56);
      const hindCannon = makeBone('hindCannon' + side, gaskin, sx * 0.22, 1.18, -0.82);
      const hindPastern = makeBone('hindPastern' + side, hindCannon, sx * 0.20, 0.22, -0.76);
      return { hip, gaskin, hindCannon, hindPastern };
    }

    const foreL = makeForelimb('L', 1);
    const foreR = makeForelimb('R', -1);
    const hindL = makeHindlimb('L', 1);
    const hindR = makeHindlimb('R', -1);

    rootGroup.add(rootBone);

    // ------------------------------------------------------------
    // 2. Geometry Accumulation Buffers for Unified SkinnedMesh
    // ------------------------------------------------------------
    const positions = [];
    const normals = [];
    const restPositions = [];
    const coatMasks = []; // (patternScale, bellyCream, legFade, muzzleMask)
    const skinIndices = [];
    const skinWeights = [];
    const indices = [];

    function pushVertex(px, py, pz, nx, ny, nz, mask4, bIdx4, bWgt4) {
      const idx = positions.length / 3;
      positions.push(px, py, pz);
      normals.push(nx, ny, nz);
      restPositions.push(px, py, pz);
      coatMasks.push(mask4[0], mask4[1], mask4[2], mask4[3]);

      // Normalize weights safely
      let w0 = bWgt4[0], w1 = bWgt4[1], w2 = bWgt4[2], w3 = bWgt4[3];
      const sum = w0 + w1 + w2 + w3;
      if (sum > 1e-6) {
        w0 /= sum; w1 /= sum; w2 /= sum; w3 /= sum;
      } else {
        w0 = 1; w1 = 0; w2 = 0; w3 = 0;
      }
      skinIndices.push(bIdx4[0], bIdx4[1], bIdx4[2], bIdx4[3]);
      skinWeights.push(w0, w1, w2, w3);
      return idx;
    }

    /**
     * Generic sculpted tube loft helper with outward-guaranteed winding.
     * `rings`: array of {
     *   center: Vector3,
     *   tangent: Vector3 (unit),
     *   upHint: Vector3,
     *   rx: number,
     *   ryTop: number,
     *   ryBot: number,
     *   radialMod?: (theta, uCos, vSin) => { dx, dy, scaleR, mask },
     *   weightFn: (px, py, pz, theta) => { idx: [i0,i1,i2,i3], wgt: [w0,w1,w2,w3] },
     *   baseMask: [scale, belly, legFade, muzzle]
     * }
     */
    function buildLoft(rings, radialSegs, capStart, capEnd) {
      const ringVerts = [];
      const _u = new THREE.Vector3();
      const _v = new THREE.Vector3();
      const _t = new THREE.Vector3();
      const _cross = new THREE.Vector3();

      for (let r = 0; r < rings.length; r++) {
        const ring = rings[r];
        _t.copy(ring.tangent).normalize();
        _u.crossVectors(ring.upHint, _t);
        if (_u.lengthSq() < 1e-5) {
          _u.set(1, 0, 0).cross(_t);
        }
        _u.normalize();
        _v.crossVectors(_t, _u).normalize();
        // Ensure right-handed frame: (_u x _v) . _t > 0
        _cross.crossVectors(_u, _v);
        if (_cross.dot(_t) < 0) {
          _v.negate();
        }

        const row = [];
        for (let s = 0; s < radialSegs; s++) {
          const theta = (s / radialSegs) * Math.PI * 2;
          const c = Math.cos(theta);
          const sn = Math.sin(theta);

          let rx = ring.rx;
          let ry = sn >= 0 ? ring.ryTop : ring.ryBot;
          let ox = c * rx;
          let oy = sn * ry;

          const mask = [ring.baseMask[0], ring.baseMask[1], ring.baseMask[2], ring.baseMask[3]];

          if (ring.radialMod) {
            const mod = ring.radialMod(theta, c, sn, ox, oy);
            if (mod) {
              if (mod.scaleX !== undefined) ox *= mod.scaleX;
              if (mod.scaleY !== undefined) oy *= mod.scaleY;
              if (mod.dx !== undefined) ox += mod.dx;
              if (mod.dy !== undefined) oy += mod.dy;
              if (mod.mask) {
                mask[0] = mod.mask[0];
                mask[1] = mod.mask[1];
                mask[2] = mod.mask[2];
                mask[3] = mod.mask[3];
              }
            }
          }

          const px = ring.center.x + _u.x * ox + _v.x * oy;
          const py = ring.center.y + _u.y * ox + _v.y * oy;
          const pz = ring.center.z + _u.z * ox + _v.z * oy;

          // Approximate outward normal (recomputed smoothly later via computeVertexNormals)
          let nx = _u.x * c + _v.x * sn;
          let ny = _u.y * c + _v.y * sn;
          let nz = _u.z * c + _v.z * sn;
          const nlen = Math.hypot(nx, ny, nz) || 1;
          nx /= nlen; ny /= nlen; nz /= nlen;

          const sw = ring.weightFn(px, py, pz, theta);
          const vIdx = pushVertex(px, py, pz, nx, ny, nz, mask, sw.idx, sw.wgt);
          row.push(vIdx);
        }
        ringVerts.push(row);
      }

      for (let r = 0; r < rings.length - 1; r++) {
        const row0 = ringVerts[r];
        const row1 = ringVerts[r + 1];
        for (let s = 0; s < radialSegs; s++) {
          const sNext = (s + 1) % radialSegs;
          const i00 = row0[s];
          const i01 = row0[sNext];
          const i11 = row1[sNext];
          const i10 = row1[s];
          indices.push(i00, i01, i11);
          indices.push(i00, i11, i10);
        }
      }

      if (capStart) {
        const ring0 = rings[0];
        const sw = ring0.weightFn(ring0.center.x, ring0.center.y, ring0.center.z, 0);
        const t = ring0.tangent;
        const cIdx = pushVertex(
          ring0.center.x, ring0.center.y, ring0.center.z,
          -t.x, -t.y, -t.z,
          ring0.baseMask, sw.idx, sw.wgt
        );
        const row0 = ringVerts[0];
        for (let s = 0; s < radialSegs; s++) {
          const sNext = (s + 1) % radialSegs;
          indices.push(cIdx, row0[sNext], row0[s]);
        }
      }

      if (capEnd) {
        const last = rings.length - 1;
        const ringL = rings[last];
        const sw = ringL.weightFn(ringL.center.x, ringL.center.y, ringL.center.z, 0);
        const t = ringL.tangent;
        const cIdx = pushVertex(
          ringL.center.x, ringL.center.y, ringL.center.z,
          t.x, t.y, t.z,
          ringL.baseMask, sw.idx, sw.wgt
        );
        const rowL = ringVerts[last];
        for (let s = 0; s < radialSegs; s++) {
          const sNext = (s + 1) % radialSegs;
          indices.push(cIdx, rowL[s], rowL[sNext]);
        }
      }
    }

    // ------------------------------------------------------------
    // 3. Helper: Chain Skinning Weights along Polyline of Bones
    // ------------------------------------------------------------
    function chainWeights(boneList, pt) {
      // Project pt onto bone segments and interpolate smoothly between 2 closest bones
      const scored = [];
      for (let i = 0; i < boneList.length; i++) {
        const b = boneList[i];
        const d = pt.distanceTo(b.userData.restWorld);
        scored.push({ idx: b.userData.index, d });
      }
      scored.sort((a, b) => a.d - b.d);
      const b0 = scored[0];
      const b1 = scored[1] || b0;
      const b2 = scored[2] || b1;
      const sigma = 0.28;
      const w0 = Math.exp(-(b0.d * b0.d) / (2 * sigma * sigma));
      const w1 = Math.exp(-(b1.d * b1.d) / (2 * sigma * sigma));
      const w2 = Math.exp(-(b2.d * b2.d) / (2 * sigma * sigma)) * 0.45;
      return {
        idx: [b0.idx, b1.idx, b2.idx, 0],
        wgt: [w0, w1, w2, 0],
      };
    }

    // ------------------------------------------------------------
    // 4. Sculpted Torso -> Neck -> Head -> Muzzle Continuous Loft
    // ------------------------------------------------------------
    const spineChain = [pelvis, lumbar, chest, neck0, neck1, neck2, neck3, head];

    // Keyframe stations along spine/neck/head:
    // [z, y, rx, ryTop, ryBot, patScale, bellyFactor, muzzleFactor, profileTag]
    const bodyStations = [
      // Tailhead / Rump
      [-1.06, 2.34, 0.05, 0.05, 0.05, 1.05, 0.0, 0.0, 'rump'],
      [-0.96, 2.40, 0.24, 0.18, 0.25, 1.02, 0.12, 0.0, 'rump'],
      [-0.78, 2.47, 0.33, 0.24, 0.39, 0.98, 0.22, 0.0, 'hip'],
      [-0.56, 2.54, 0.34, 0.24, 0.42, 0.96, 0.32, 0.0, 'flank'],
      [-0.30, 2.60, 0.36, 0.25, 0.50, 0.94, 0.40, 0.0, 'belly'],
      [-0.02, 2.66, 0.38, 0.26, 0.58, 0.92, 0.42, 0.0, 'belly'],
      [0.24, 2.72, 0.38, 0.29, 0.67, 0.92, 0.38, 0.0, 'ribcage'],
      [0.44, 2.76, 0.35, 0.35, 0.70, 0.95, 0.34, 0.0, 'withers'],
      [0.58, 2.78, 0.30, 0.37, 0.62, 1.02, 0.30, 0.0, 'withersPeak'],
      // Thoracic inlet -> Neck base
      [0.74, 2.86, 0.24, 0.32, 0.46, 1.12, 0.26, 0.0, 'neckBase'],
      [0.88, 3.06, 0.20, 0.27, 0.33, 1.20, 0.24, 0.0, 'neck'],
      [1.04, 3.34, 0.172, 0.235, 0.26, 1.28, 0.22, 0.0, 'neck'],
      [1.19, 3.64, 0.150, 0.205, 0.22, 1.35, 0.20, 0.0, 'neck'],
      [1.34, 3.94, 0.134, 0.182, 0.185, 1.42, 0.18, 0.0, 'neck'],
      [1.47, 4.24, 0.118, 0.158, 0.155, 1.50, 0.16, 0.0, 'neck'],
      [1.56, 4.50, 0.106, 0.135, 0.125, 1.58, 0.15, 0.0, 'neckUpper'],
      // Smoothly arched Nape / Occiput -> Cranium -> Brow -> Snout -> Muzzle (zero inner-bend pinching!)
      [1.65, 4.70, 0.105, 0.122, 0.098, 1.75, 0.14, 0.0, 'nape'],
      [1.76, 4.77, 0.124, 0.128, 0.108, 2.02, 0.14, 0.0, 'cranium'],
      [1.87, 4.75, 0.132, 0.128, 0.114, 2.28, 0.16, 0.02, 'brow'],
      [1.98, 4.69, 0.098, 0.098, 0.100, 2.45, 0.18, 0.12, 'cheek'],
      [2.09, 4.61, 0.078, 0.082, 0.088, 2.60, 0.20, 0.35, 'snout'],
      [2.20, 4.54, 0.070, 0.070, 0.074, 2.65, 0.16, 0.72, 'nostrils'],
      [2.29, 4.50, 0.056, 0.054, 0.052, 2.70, 0.10, 0.96, 'muzzle'],
      [2.34, 4.48, 0.024, 0.022, 0.020, 2.70, 0.05, 1.00, 'muzzleTip'],
    ];

    // Subdivide stations smoothly using Catmull-Rom for ultra-clean silhouette
    const curvePts = bodyStations.map((st) => new THREE.Vector3(0, st[1], st[0]));
    const bodyCurve = new THREE.CatmullRomCurve3(curvePts, false, 'centripetal', 0.45);
    const bodySteps = 84;
    const bodyRings = [];

    function sampleStationField(t, idx) {
      const f = t * (bodyStations.length - 1);
      const i0 = Math.min(bodyStations.length - 2, Math.floor(f));
      const frac = f - i0;
      const u = frac * frac * (3 - 2 * frac);
      return lerp(bodyStations[i0][idx], bodyStations[i0 + 1][idx], u);
    }

    for (let i = 0; i <= bodySteps; i++) {
      const t = i / bodySteps;
      const center = bodyCurve.getPoint(t);
      const tangent = bodyCurve.getTangent(t).normalize();

      const rx = sampleStationField(t, 2);
      const ryTop = sampleStationField(t, 3);
      const ryBot = sampleStationField(t, 4);
      const patScale = sampleStationField(t, 5);
      const bellyFac = sampleStationField(t, 6);
      const muzzleFac = sampleStationField(t, 7);

      // Up hint perpendicular-ish to tangent so cross-sections stay upright cleanly
      const upHint = Math.abs(tangent.y) > 0.85
        ? new THREE.Vector3(0, 0, -1)
        : new THREE.Vector3(1, 0, 0);

      // Notice: when upHint = (1, 0, 0), _u = upHint x tangent ≈ (0, +, -) = dorsal-ish!
      // Let's make _u explicitly point to giraffe's LEFT (+X) by choosing upHint = dorsal!
      const dorsalHint = new THREE.Vector3(0, 1, 0);
      if (Math.abs(tangent.dot(dorsalHint)) > 0.92) {
        dorsalHint.set(0, 0, -1);
      }

      // Compute station regions by Z/Y
      const cz = center.z;
      const cy = center.y;
      const isWithers = smoothstep(0.20, 0.56, cz) * (1 - smoothstep(0.58, 0.84, cz));
      const isNeck = smoothstep(0.70, 0.95, cz) * (1 - smoothstep(1.52, 1.72, cz));
      const isBrow = smoothstep(1.74, 1.85, cz) * (1 - smoothstep(1.88, 2.02, cz));
      const isSnout = smoothstep(1.92, 2.10, cz);

      bodyRings.push({
        center,
        tangent,
        // Wait: in buildLoft, _u = normalize(upHint x tangent), _v = normalize(tangent x _u).
        // If upHint = dorsal (0,1,0) and tangent = (0,0,1), then _u = (1,0,0) = LEFT (+X),
        // and _v = (0,0,1) x (1,0,0) = (0,1,0) = UP (+Y)!
        // Let's verify for neck where tangent ≈ (0, 0.88, 0.47):
        // upHint = (0,1,0) -> (0,1,0) x (0,0.88,0.47) = (+0.47, 0, 0) -> _u = (+1, 0, 0) LEFT!
        // _v = tangent x (+1, 0, 0) = (0, 0.47, -0.88) -> Dorsal/Up-Back!
        // What if tangent were purely vertical (0,1,0)? dorsalHint switches to (0,0,-1) -> (-Z) x (+Y) = (+X) LEFT!
        upHint: new THREE.Vector3(0, 1, 0).lerp(new THREE.Vector3(0, 0, -1), smoothstep(0.65, 0.95, Math.abs(tangent.y))).normalize(),
        rx,
        ryTop,
        ryBot,
        baseMask: [patScale, bellyFac, 0.0, muzzleFac],
        radialMod: function (theta, c, sn) {
          // Here c = left/right (_u = +X), sn = dorsal/ventral (_v = dorsal +Y)
          let scaleX = 1.0;
          let scaleY = 1.0;
          let dx = 0;
          let dy = 0;

          // Dorsal wither ridge & neck crest narrowing on top
          if (sn > 0) {
            const topPow = Math.pow(sn, 2.2);
            scaleX *= 1.0 - (0.28 * isWithers + 0.34 * isNeck) * topPow;
            dy += (0.045 * isWithers + 0.015 * isNeck) * topPow;
          }

          // Deep narrow brisket keel on chest underside
          if (sn < 0 && cz > -0.1 && cz < 0.72) {
            const chestBelly = smoothstep(-0.1, 0.35, cz) * (1 - smoothstep(0.55, 0.75, cz));
            scaleX *= 1.0 - 0.24 * Math.pow(-sn, 1.8) * chestBelly;
          }

          // Supraorbital brow ridges & median horn bump + cheek taper on head
          if (isBrow > 0.01) {
            const browSide = Math.exp(-Math.pow((sn - 0.35) / 0.38, 2)) * Math.pow(Math.abs(c), 1.6);
            scaleX *= 1.0 + 0.16 * browSide * isBrow;
            // Median forehead ossicone bump right at top-center
            const medianBump = Math.exp(-Math.pow((sn - 0.92) / 0.25, 2)) * (1 - Math.abs(c));
            dy += 0.028 * medianBump * isBrow;
          }

          // Flattened nasal bridge & slightly prehensile upper lip overhang on snout
          if (isSnout > 0.01) {
            if (sn > 0.3) {
              scaleY *= 1.0 - 0.12 * isSnout * sn;
            }
            // Subtle nostril flare near z ~ 2.18
            const nostrilZone = smoothstep(2.12, 2.19, cz) * (1 - smoothstep(2.22, 2.28, cz));
            const flare = Math.exp(-Math.pow((sn - 0.15) / 0.35, 2)) * Math.abs(c);
            scaleX *= 1.0 + 0.16 * flare * nostrilZone;
          }

          // Belly/throat cream mask: strong on underside (sn < -0.2), zero on back/sides
          const ventral = smoothstep(-0.15, -0.78, sn);
          const bellyMask = bellyFac * ventral;
          // Dark muzzle mask concentrates toward tip & upper/lower lips
          const muzMask = muzzleFac * (0.78 + 0.22 * smoothstep(-0.4, 0.5, sn));

          return {
            scaleX,
            scaleY,
            dx,
            dy,
            mask: [patScale, bellyMask, 0.0, muzMask],
          };
        },
        weightFn: function (px, py, pz) {
          const pt = new THREE.Vector3(px, py, pz);
          // Lower jaw vertices subtly blend toward jaw bone
          if (pz > 1.80 && py < 4.70) {
            const jawFactor = smoothstep(1.80, 1.98, pz) * smoothstep(4.70, 4.54, py) * 0.72;
            return {
              idx: [head.userData.index, jaw.userData.index, 0, 0],
              wgt: [1 - jawFactor, jawFactor, 0, 0],
            };
          }
          return chainWeights(spineChain, pt);
        },
      });
    }

    buildLoft(bodyRings, 28, true, true);

    // ------------------------------------------------------------
    // 5. Sculpted Continuous Limbs (4 Legs seamlessly tucked into torso)
    // ------------------------------------------------------------
    function buildLegMesh(isFore, sx, limbBones) {
      let stations;
      let legChain;

      if (isFore) {
        // Forelimb stations: Scapula tuck -> Shoulder/Deltoid -> Elbow -> Forearm -> Carpus -> Cannon -> Fetlock -> Pastern -> Hoof
        legChain = [chest, limbBones.shoulder, limbBones.upperArm, limbBones.forearm, limbBones.foreCannon, limbBones.forePastern];
        stations = [
          // [x, y, z, rx, rz, patScale, legFade, bellyInner]
          [sx * 0.14, 2.74, 0.50, 0.17, 0.25, 1.05, 0.0, 0.0],   // Scapula tucked deeply inside withers/chest
          [sx * 0.24, 2.52, 0.57, 0.175, 0.23, 1.08, 0.0, 0.05], // Shoulder blade muscle
          [sx * 0.26, 2.30, 0.61, 0.148, 0.185, 1.15, 0.0, 0.15],// Glenoid / Upper arm
          [sx * 0.25, 2.04, 0.54, 0.122, 0.145, 1.25, 0.0, 0.22],// Elbow tucked by deep brisket
          [sx * 0.24, 1.58, 0.54, 0.092, 0.104, 1.45, 0.05, 0.20],// Mid forearm
          [sx * 0.23, 1.16, 0.54, 0.072, 0.078, 1.65, 0.18, 0.15],// Above carpus
          [sx * 0.23, 1.10, 0.545, 0.076, 0.082, 1.75, 0.28, 0.12],// Carpus joint knuckle
          [sx * 0.22, 0.68, 0.535, 0.054, 0.062, 1.90, 0.52, 0.08],// Sturdy cannon bone
          [sx * 0.21, 0.26, 0.53, 0.055, 0.060, 2.00, 0.78, 0.04],// Above fetlock
          [sx * 0.21, 0.21, 0.535, 0.062, 0.067, 2.00, 0.86, 0.0], // Fetlock joint
          [sx * 0.21, 0.07, 0.58, 0.055, 0.062, 2.00, 0.92, 0.0], // Pastern sloping forward
        ];
      } else {
        // Hindlimb stations: Haunch tuck -> Hip/Thigh -> Stifle -> Gaskin -> Hock -> Cannon -> Fetlock -> Pastern
        legChain = [pelvis, limbBones.hip, limbBones.gaskin, limbBones.hindCannon, limbBones.hindPastern];
        stations = [
          [sx * 0.13, 2.54, -0.68, 0.19, 0.30, 1.00, 0.0, 0.0],   // Haunch tucked deeply into pelvis
          [sx * 0.24, 2.34, -0.71, 0.18, 0.27, 1.05, 0.0, 0.08],  // Muscular hip / thigh
          [sx * 0.25, 1.96, -0.58, 0.135, 0.185, 1.20, 0.0, 0.22],// Stifle / thigh-gaskin transition
          [sx * 0.235, 1.56, -0.70, 0.096, 0.122, 1.40, 0.05, 0.18],// Gaskin muscle
          [sx * 0.22, 1.22, -0.81, 0.072, 0.090, 1.65, 0.20, 0.14],// Above hock
          [sx * 0.22, 1.15, -0.825, 0.076, 0.096, 1.75, 0.32, 0.10],// Prominent hock joint
          [sx * 0.21, 0.70, -0.79, 0.054, 0.063, 1.90, 0.55, 0.06],// Hind cannon bone
          [sx * 0.20, 0.26, -0.76, 0.055, 0.060, 2.00, 0.78, 0.04],// Above fetlock
          [sx * 0.20, 0.21, -0.755, 0.062, 0.067, 2.00, 0.86, 0.0], // Fetlock joint
          [sx * 0.20, 0.07, -0.71, 0.055, 0.062, 2.00, 0.92, 0.0], // Pastern sloping forward
        ];
      }

      const pts = stations.map((s) => new THREE.Vector3(s[0], s[1], s[2]));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.35);
      const segs = 36;
      const rings = [];

      function interpSt(t, idx) {
        const f = t * (stations.length - 1);
        const i0 = Math.min(stations.length - 2, Math.floor(f));
        const u = f - i0;
        return lerp(stations[i0][idx], stations[i0 + 1][idx], u);
      }

      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const center = curve.getPoint(t);
        const tangent = curve.getTangent(t).normalize();
        const rx = interpSt(t, 3);
        const rz = interpSt(t, 4);
        const patScale = interpSt(t, 5);
        const legFade = interpSt(t, 6);
        const innerBelly = interpSt(t, 7);

        rings.push({
          center,
          tangent,
          upHint: new THREE.Vector3(0, 0, 1), // _u ≈ +X (lateral), _v ≈ +Z (front/back)
          rx,
          ryTop: rz,
          ryBot: rz,
          baseMask: [patScale, 0, legFade, 0],
          radialMod: function (theta, c, sn) {
            // Inner thigh/forearm faces -sx (toward midline) -> creamier inner-leg fur
            const isInner = smoothstep(0.0, 0.85, -sx * c);
            return {
              mask: [patScale, innerBelly * isInner, legFade, 0],
            };
          },
          weightFn: function (px, py, pz) {
            const pt = new THREE.Vector3(px, py, pz);
            // Very top of leg locks to chest/pelvis so no gap ever opens during extreme strides
            if (t < 0.08) {
              const rootB = legChain[0];
              const nextB = legChain[1];
              const blend = smoothstep(0.0, 0.08, t) * 0.45;
              return {
                idx: [rootB.userData.index, nextB.userData.index, 0, 0],
                wgt: [1 - blend, blend, 0, 0],
              };
            }
            return chainWeights(legChain, pt);
          },
        });
      }

      buildLoft(rings, 18, true, true);
    }

    buildLegMesh(true, 1, foreL);
    buildLegMesh(true, -1, foreR);
    buildLegMesh(false, 1, hindL);
    buildLegMesh(false, -1, hindR);

    // ------------------------------------------------------------
    // 6. Sculpted Tail Shaft (skinned along tail0..tail3)
    // ------------------------------------------------------------
    const tailChain = [pelvis, tail0, tail1, tail2, tail3];
    const tailPts = [
      new THREE.Vector3(0, 2.41, -0.96),
      new THREE.Vector3(0, 2.26, -1.03),
      new THREE.Vector3(0, 1.98, -1.06),
      new THREE.Vector3(0, 1.58, -1.07),
      new THREE.Vector3(0, 1.18, -1.05),
    ];
    const tailCurve = new THREE.CatmullRomCurve3(tailPts);
    const tailRings = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const r = lerp(0.044, 0.017, t);
      tailRings.push({
        center: tailCurve.getPoint(t),
        tangent: tailCurve.getTangent(t).normalize(),
        upHint: new THREE.Vector3(0, 0, 1),
        rx: r,
        ryTop: r,
        ryBot: r,
        baseMask: [1.8, 0.0, t * 0.55, 0.0],
        weightFn: function (px, py, pz) {
          return chainWeights(tailChain, new THREE.Vector3(px, py, pz));
        },
      });
    }
    buildLoft(tailRings, 10, true, true);

    // ------------------------------------------------------------
    // 7. Build Unified SkinnedMesh + Skeleton
    // ------------------------------------------------------------
    const bodyGeo = new THREE.BufferGeometry();
    bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    bodyGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    bodyGeo.setAttribute('restPos', new THREE.Float32BufferAttribute(restPositions, 3));
    bodyGeo.setAttribute('coatMask', new THREE.Float32BufferAttribute(coatMasks, 4));
    bodyGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    bodyGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
    bodyGeo.setIndex(indices);
    bodyGeo.computeVertexNormals();

    const coatMaterial = global.GiraffeShaders.createGiraffeCoatMaterial();
    const bodyMesh = new THREE.SkinnedMesh(bodyGeo, coatMaterial);
    bodyMesh.name = 'GiraffeBody';
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    bodyMesh.frustumCulled = false;

    rootGroup.add(bodyMesh);
    rootGroup.updateMatrixWorld(true);

    const skeleton = new THREE.Skeleton(bones);
    bodyMesh.bind(skeleton);

    // ------------------------------------------------------------
    // 8. Attached High-Detail Features (Parented to Bones)
    // ------------------------------------------------------------
    function toBoneLocal(bone, wx, wy, wz) {
      const rw = bone.userData.restWorld;
      return new THREE.Vector3(wx - rw.x, wy - rw.y, wz - rw.z);
    }

    // 8A. Cloven Hooves (2 split dark keratin digits per foot)
    const hoofMat = new THREE.MeshStandardMaterial({
      color: 0x302924,
      roughness: 0.46,
      metalness: 0.04,
    });

    function buildClovenHoof() {
      const hoofGroup = new THREE.Group();
      for (const side of [-1, 1]) {
        const toeGeo = new THREE.CylinderGeometry(0.032, 0.044, 0.11, 14, 1);
        const pos = toeGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          let x = pos.getX(i);
          let y = pos.getY(i);
          let z = pos.getZ(i);
          const botFactor = smoothstep(0.055, -0.055, y);
          // Flatten inner edge so two toes sit side-by-side with a crisp cleft
          if (side * x < 0) x *= 0.45;
          if (z > 0) z *= 1.45 + 0.35 * botFactor;
          pos.setXYZ(i, x, y, z);
        }
        toeGeo.computeVertexNormals();
        const toe = new THREE.Mesh(toeGeo, hoofMat);
        toe.position.set(side * 0.028, -0.172, 0.056);
        toe.rotation.x = 0.08; // flatter sole parallel to ground!
        toe.castShadow = true;
        toe.receiveShadow = true;
        hoofGroup.add(toe);
      }
      return hoofGroup;
    }

    [foreL.forePastern, foreR.forePastern, hindL.hindPastern, hindR.hindPastern].forEach((pBone) => {
      pBone.add(buildClovenHoof());
    });

    // 8B. Eyes + Glossy Cornea + Blinking Eyelids & Lashes
    const eyeTex = global.GiraffeShaders.createEyeTexture();
    const eyeMat = new THREE.MeshPhysicalMaterial({
      map: eyeTex,
      roughness: 0.08,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      reflectivity: 0.95,
    });
    const lidMat = new THREE.MeshStandardMaterial({
      color: 0x8a5832,
      roughness: 0.78,
    });
    const lashMat = new THREE.MeshStandardMaterial({
      color: 0x160e09,
      roughness: 0.85,
    });

    const eyelids = [];
    for (const sx of [1, -1]) {
      const eyeSocket = new THREE.Group();
      const localPos = toBoneLocal(head, sx * 0.120, 4.778, 1.855);
      eyeSocket.position.copy(localPos);
      // Slight lateral outward gaze
      eyeSocket.rotation.y = sx * 1.15;
      eyeSocket.rotation.x = 0.06;

      const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.039, 20, 16), eyeMat);
      eyeball.rotation.y = -Math.PI / 2;
      eyeSocket.add(eyeball);

      // Upper eyelid cap + dark eyelash fringe
      const lidPivot = new THREE.Group();
      const lidGeo = new THREE.SphereGeometry(0.0415, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
      const lidMesh = new THREE.Mesh(lidGeo, lidMat);
      lidPivot.add(lidMesh);

      // Long iconic giraffe eyelashes along lid rim
      for (let k = -3; k <= 3; k++) {
        const lash = new THREE.Mesh(new THREE.ConeGeometry(0.0024, 0.020, 5), lashMat);
        const ang = k * 0.22;
        lash.position.set(Math.sin(ang) * 0.041, 0.002, Math.cos(ang) * 0.041);
        lash.rotation.x = Math.PI * 0.42;
        lash.rotation.z = -ang * 0.6;
        lidPivot.add(lash);
      }

      // Open angle ~ -0.72 rad (tilted up/back), closed ~ +0.20 rad
      lidPivot.rotation.x = -0.72;
      eyeSocket.add(lidPivot);
      eyelids.push(lidPivot);
      head.add(eyeSocket);
    }

    // 8C. Ossicones (2 main backward-angled horns + dark tufted caps)
    const ossiMat = new THREE.MeshStandardMaterial({
      color: 0x9c653a,
      roughness: 0.82,
    });
    const tuftMat = new THREE.MeshStandardMaterial({
      color: 0x20130c,
      roughness: 0.92,
    });

    for (const sx of [1, -1]) {
      const ossiGroup = new THREE.Group();
      ossiGroup.position.copy(toBoneLocal(head, sx * 0.064, 4.89, 1.72));
      ossiGroup.rotation.z = -sx * 0.14;
      ossiGroup.rotation.x = -0.26;

      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.028, 0.19, 12), ossiMat);
      stalk.position.y = 0.085;
      stalk.castShadow = true;
      ossiGroup.add(stalk);

      // Tufted dark hair knob at tip
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.023, 12, 10), tuftMat);
      knob.position.y = 0.182;
      knob.scale.set(1.0, 1.2, 1.0);
      knob.castShadow = true;
      ossiGroup.add(knob);

      for (let h = 0; h < 6; h++) {
        const a = (h / 6) * Math.PI * 2;
        const bristle = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.030, 5), tuftMat);
        bristle.position.set(Math.cos(a) * 0.010, 0.200, Math.sin(a) * 0.010);
        bristle.rotation.z = -Math.cos(a) * 0.35;
        bristle.rotation.x = Math.sin(a) * 0.35;
        ossiGroup.add(bristle);
      }
      head.add(ossiGroup);
    }

    // 8D. Cupped Leaf-Shaped Ears (attached to earL / earR)
    const earOuterMat = new THREE.MeshStandardMaterial({ color: 0xc29864, roughness: 0.80 });
    const earInnerMat = new THREE.MeshStandardMaterial({ color: 0xdfb99b, roughness: 0.86, side: THREE.DoubleSide });

    function buildEar(sx) {
      const g = new THREE.Group();
      const earGeo = new THREE.SphereGeometry(0.105, 14, 12, 0, Math.PI, 0, Math.PI);
      const pos = earGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i);
        let y = pos.getY(i);
        let z = pos.getZ(i);
        const tipT = smoothstep(-0.10, 0.105, x);
        const taper = 1.0 - 0.65 * Math.pow(tipT, 1.5);
        y *= 0.46 * taper;
        z *= 0.26 * taper;
        x *= 1.65;
        pos.setXYZ(i, sx * (x + 0.11), y, z);
      }
      earGeo.computeVertexNormals();
      const outer = new THREE.Mesh(earGeo, earOuterMat);
      outer.castShadow = true;
      g.add(outer);

      const inner = new THREE.Mesh(earGeo.clone(), earInnerMat);
      inner.scale.set(0.86, 0.78, 0.75);
      inner.position.z = 0.008;
      g.add(inner);

      g.rotation.z = sx * 0.16;
      g.rotation.y = -sx * 0.32;
      return g;
    }

    earL.add(buildEar(1));
    earR.add(buildEar(-1));

    // 8E. Nostril Slits (dark recessed details on snout)
    for (const sx of [1, -1]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), tuftMat);
      nostril.position.copy(toBoneLocal(head, sx * 0.044, 4.545, 2.215));
      nostril.scale.set(0.45, 0.65, 1.45);
      nostril.rotation.y = sx * 0.35;
      nostril.rotation.x = -0.35;
      head.add(nostril);
    }

    // 8F. Dorsal Neck Mane (dense, continuous short-cropped chestnut-umber hair crest)
    const maneMat = new THREE.MeshStandardMaterial({
      color: 0x45200e,
      roughness: 0.92,
    });
    const maneMatTip = new THREE.MeshStandardMaterial({
      color: 0x261209,
      roughness: 0.94,
    });
    const maneBones = [chest, neck0, neck1, neck2, neck3, head];
    const maneStart = new THREE.Vector3(0, 2.94, 0.44);
    const maneEnd = new THREE.Vector3(0, 4.82, 1.63);
    const maneCount = 68;

    for (let i = 0; i < maneCount; i++) {
      const t = i / (maneCount - 1);
      const p = new THREE.Vector3().lerpVectors(maneStart, maneEnd, t);
      p.y += Math.sin(t * Math.PI) * 0.085;
      p.z -= Math.sin(t * Math.PI) * 0.065;

      let bestBone = maneBones[0];
      let bestDist = Infinity;
      for (const b of maneBones) {
        const d = p.distanceTo(b.userData.restWorld);
        if (d < bestDist) {
          bestDist = d;
          bestBone = b;
        }
      }

      const tuftH = lerp(0.055, 0.088, Math.sin(t * Math.PI)) * (0.90 + 0.2 * ((i * 7) % 3) / 2);
      // Soft flat cropped brush blade instead of sharp spikes
      const tuftGeo = new THREE.CylinderGeometry(0.012, 0.022, tuftH, 5);
      tuftGeo.scale(0.65, 1.0, 1.85);
      const tuft = new THREE.Mesh(tuftGeo, i % 3 === 0 ? maneMatTip : maneMat);
      tuft.position.copy(toBoneLocal(bestBone, p.x, p.y, p.z));
      tuft.rotation.x = -0.58 + (((i * 13) % 5) - 2) * 0.03;
      tuft.rotation.z = (((i * 11) % 5) - 2) * 0.04;
      tuft.castShadow = true;
      bestBone.add(tuft);
    }

    // 8G. Tail Brush Tuft (layered dark coarse hair brush at tail3)
    const tailBrush = new THREE.Group();
    tailBrush.position.copy(toBoneLocal(tail3, 0, 1.16, -1.05));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = i === 0 ? 0 : 0.015;
      const len = i === 0 ? 0.34 : 0.28 + (i % 3) * 0.03;
      const strand = new THREE.Mesh(new THREE.ConeGeometry(0.022, len, 6), tuftMat);
      strand.position.set(Math.cos(a) * r, -len * 0.48, Math.sin(a) * r);
      strand.rotation.x = Math.PI + Math.sin(a) * 0.09;
      strand.rotation.z = Math.cos(a) * 0.09;
      strand.castShadow = true;
      tailBrush.add(strand);
    }
    tail3.add(tailBrush);

    return {
      rootGroup,
      bodyMesh,
      coatMaterial,
      skeleton,
      bones: boneByName,
      eyelids,
      limbs: {
        foreL,
        foreR,
        hindL,
        hindR,
      },
    };
  }

  global.GiraffeAnatomy = {
    createGiraffeModel,
  };
})(window);
