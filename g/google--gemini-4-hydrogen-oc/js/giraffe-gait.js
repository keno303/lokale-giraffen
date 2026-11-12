(function (global) {
  'use strict';

  const { lerp, clamp, smoothstep, getTerrainHeight, solveTwoBoneIK } = global.GiraffeMath;

  function createGiraffeController(model, onHoofStep) {
    const { rootGroup, bones, eyelids, limbs } = model;

    // Precompute rest-pose lengths & basis quaternions for each leg bone
    const _vA = new THREE.Vector3();
    const _vB = new THREE.Vector3();
    const _xAxis = new THREE.Vector3();
    const _yAxis = new THREE.Vector3();
    const _zAxis = new THREE.Vector3();
    const _mat = new THREE.Matrix4();

    function buildBasisQuat(sideAxis, dirAxis, outQuat) {
      _yAxis.copy(dirAxis).normalize();
      _xAxis.copy(sideAxis);
      _xAxis.addScaledVector(_yAxis, -_xAxis.dot(_yAxis));
      if (_xAxis.lengthSq() < 1e-6) {
        _xAxis.set(1, 0, 0);
      }
      _xAxis.normalize();
      _zAxis.crossVectors(_xAxis, _yAxis).normalize();
      _mat.makeBasis(_xAxis, _yAxis, _zAxis);
      outQuat.setFromRotationMatrix(_mat);
      return outQuat;
    }

    function computeBoneRestMeta(bone, childRestPos) {
      const p = bone.userData.restWorld;
      const dir = childRestPos.clone().sub(p);
      const len = dir.length();
      dir.normalize();
      const restQuat = buildBasisQuat(new THREE.Vector3(1, 0, 0), dir, new THREE.Quaternion());
      return { len, dir, restQuatInv: restQuat.clone().invert() };
    }

    // Leg biomechanical descriptors
    function initLegData(name, isFore, sx, limbBones, phaseOffset) {
      let meta = {};
      let restHoofLocal;
      let restFetlockLocal;
      let restUpperLocal;

      if (isFore) {
        const pShoulder = limbBones.shoulder.userData.restWorld;
        const pUpper = limbBones.upperArm.userData.restWorld;
        const pElbow = limbBones.forearm.userData.restWorld;
        const pCarpus = limbBones.foreCannon.userData.restWorld;
        const pFetlock = limbBones.forePastern.userData.restWorld;
        restHoofLocal = new THREE.Vector3(sx * 0.21, 0.0, 0.60);
        restFetlockLocal = pFetlock.clone();
        restUpperLocal = pUpper.clone();

        meta = {
          shoulder: computeBoneRestMeta(limbBones.shoulder, pUpper),
          upperArm: computeBoneRestMeta(limbBones.upperArm, pElbow),
          forearm: computeBoneRestMeta(limbBones.forearm, pCarpus),
          foreCannon: computeBoneRestMeta(limbBones.foreCannon, pFetlock),
          forePastern: computeBoneRestMeta(limbBones.forePastern, restHoofLocal),
        };
      } else {
        const pHip = limbBones.hip.userData.restWorld;
        const pStifle = limbBones.gaskin.userData.restWorld;
        const pHock = limbBones.hindCannon.userData.restWorld;
        const pFetlock = limbBones.hindPastern.userData.restWorld;
        restHoofLocal = new THREE.Vector3(sx * 0.20, 0.0, -0.68);
        restFetlockLocal = pFetlock.clone();
        restUpperLocal = pHip.clone();

        meta = {
          hip: computeBoneRestMeta(limbBones.hip, pStifle),
          gaskin: computeBoneRestMeta(limbBones.gaskin, pHock),
          hindCannon: computeBoneRestMeta(limbBones.hindCannon, pFetlock),
          hindPastern: computeBoneRestMeta(limbBones.hindPastern, restHoofLocal),
        };
      }

      return {
        name,
        isFore,
        sx,
        bones: limbBones,
        meta,
        phaseOffset,
        restHoofLocal,
        restFetlockLocal,
        restUpperLocal,
        pasternOffset: restHoofLocal.clone().sub(restFetlockLocal),
        // World-space foot locking state
        plantedWorld: new THREE.Vector3(),
        liftWorld: new THREE.Vector3(),
        targetWorld: new THREE.Vector3(),
        currentHoofWorld: new THREE.Vector3(),
        wasInStance: true,
        initialized: false,
      };
    }

    // Classic giraffe lateral-sequence amble/pace offsets:
    // LH (0.00) & LF (0.14) swing together, then RH (0.50) & RF (0.64)
    const legList = [
      initLegData('LH', false, 1, limbs.hindL, 0.00),
      initLegData('LF', true, 1, limbs.foreL, 0.14),
      initLegData('RH', false, -1, limbs.hindR, 0.50),
      initLegData('RF', true, -1, limbs.foreR, 0.64),
    ];

    // Walking state
    const state = {
      pathParam: 0.0,
      worldPos: new THREE.Vector3(0, 0, 0),
      heading: 0.0, // radians (0 = +Z)
      targetSpeed: 1.55, // m/s (natural adult giraffe amble ~1.5-1.7 m/s)
      currentSpeed: 1.55,
      gaitPhase: 0.0,
      totalTime: 0.0,
      paused: false,
      treadmillMode: false,

      // Micro-behavior timers
      nextBlinkTime: 2.2,
      blinkProgress: -1,
      nextSwishTime: 4.5,
      swishProgress: -1,
      nextEarFlickL: 1.8,
      earFlickL: -1,
      nextEarFlickR: 3.1,
      earFlickR: -1,
    };

    // Path sampler: graceful wide savanna loop around radius ~14m avoiding central trees
    function sampleWalkPath(s, outPos) {
      const r = 13.5 + 2.4 * Math.sin(s * 2.0) + 1.1 * Math.cos(s * 3.0);
      const x = Math.sin(s) * r;
      const z = Math.cos(s) * r * 0.88;
      outPos.set(x, 0, z);
      return outPos;
    }

    // Initialize starting position on path
    sampleWalkPath(0, state.worldPos);
    const pAhead = sampleWalkPath(0.01, new THREE.Vector3());
    state.heading = Math.atan2(pAhead.x - state.worldPos.x, pAhead.z - state.worldPos.z);
    state.worldPos.y = getTerrainHeight(state.worldPos.x, state.worldPos.z);

    rootGroup.position.copy(state.worldPos);
    rootGroup.rotation.y = state.heading;
    rootGroup.updateMatrixWorld(true);

    // Initialize foot world locks at rest spots
    for (const leg of legList) {
      leg.plantedWorld.copy(leg.restHoofLocal).applyMatrix4(rootGroup.matrixWorld);
      leg.plantedWorld.y = getTerrainHeight(leg.plantedWorld.x, leg.plantedWorld.z);
      leg.liftWorld.copy(leg.plantedWorld);
      leg.targetWorld.copy(leg.plantedWorld);
      leg.currentHoofWorld.copy(leg.plantedWorld);
      leg.initialized = true;
    }

    // Scratch vectors/quaternions for zero-GC update loop
    const _fwd = new THREE.Vector3();
    const _right = new THREE.Vector3();
    const _localHoof = new THREE.Vector3();
    const _localFetlock = new THREE.Vector3();
    const _localRoot = new THREE.Vector3();
    const _localMid = new THREE.Vector3();
    const _clampedTarget = new THREE.Vector3();
    const _pole = new THREE.Vector3();
    const _dir = new THREE.Vector3();
    const _sideAxis = new THREE.Vector3(1, 0, 0);
    const _qTarget = new THREE.Quaternion();
    const _qParentWorld = new THREE.Quaternion();
    const _qParentInv = new THREE.Quaternion();
    const _qLocal = new THREE.Quaternion();
    const _vNext = new THREE.Vector3();
    const _vAnchor = new THREE.Vector3();

    function aimBoneChain(bone, meta, worldJointPos, worldChildPos, sideAxis) {
      _dir.subVectors(worldChildPos, worldJointPos);
      if (_dir.lengthSq() < 1e-8) return;
      _dir.normalize();
      buildBasisQuat(sideAxis, _dir, _qTarget);
      // Desired bone orientation in rootGroup-local space = _qTarget * meta.restQuatInv
      _qTarget.multiply(meta.restQuatInv);

      // Convert rootGroup-local target orientation into bone's parent-local space:
      // bone.parent.matrixWorld includes rootGroup.matrixWorld, so extract parent's rootGroup-local quat:
      bone.parent.updateMatrixWorld(true);
      bone.parent.getWorldQuaternion(_qParentWorld);
      // Convert parent world quat -> rootGroup-local quat, then invert
      _qParentInv.copy(rootGroup.quaternion).invert().multiply(_qParentWorld);
      _qParentInv.invert();

      _qLocal.copy(_qParentInv).multiply(_qTarget);
      bone.quaternion.copy(_qLocal);
      bone.updateMatrixWorld(true);
    }

    function resetRestPoses() {
      for (const key in bones) {
        bones[key].rotation.set(0, 0, 0);
        bones[key].quaternion.set(0, 0, 0, 1);
      }
      bones.root.position.set(0, 2.54, -0.05);
    }

    function update(dt) {
      if (state.paused) return;
      dt = Math.min(dt, 0.05);
      state.totalTime += dt;

      // Smooth speed acceleration/deceleration
      const speedLerp = 1.0 - Math.exp(-dt * 3.2);
      state.currentSpeed = lerp(state.currentSpeed, state.targetSpeed, speedLerp);
      const speedNorm = clamp(state.currentSpeed / 1.65, 0, 1.4);

      // Stride parameters scaled realistically to walking speed
      // Adult giraffe stride frequency ~ 0.58–0.78 Hz (1.3–1.7s per full cycle)
      const strideFreq = lerp(0.45, 0.78, clamp(speedNorm, 0, 1.2));
      const strideLen = state.currentSpeed > 0.04 ? state.currentSpeed / strideFreq : 0;
      const dutyFactor = lerp(0.67, 0.56, clamp(speedNorm, 0, 1.2));

      if (state.currentSpeed > 0.015) {
        state.gaitPhase = (state.gaitPhase + dt * strideFreq) % 1.0;

        if (!state.treadmillMode) {
          // Advance along path using approximate arc-length step
          const ds = (state.currentSpeed * dt) / 14.5;
          state.pathParam += ds;
          sampleWalkPath(state.pathParam, _vNext);
          sampleWalkPath(state.pathParam + 0.015, _vAnchor);
          const targetHeading = Math.atan2(_vAnchor.x - _vNext.x, _vAnchor.z - _vNext.z);

          // Shortest-angle heading interpolation
          let dYaw = targetHeading - state.heading;
          while (dYaw > Math.PI) dYaw -= Math.PI * 2;
          while (dYaw < -Math.PI) dYaw += Math.PI * 2;
          state.heading += dYaw * Math.min(1, dt * 4.0);

          state.worldPos.x = _vNext.x;
          state.worldPos.z = _vNext.z;
        }
      }

      // Compute average ground height under giraffe footprint for smooth body elevation
      _fwd.set(Math.sin(state.heading), 0, Math.cos(state.heading));
      _right.set(_fwd.z, 0, -_fwd.x); // Note: +X in giraffe local is Left (-_right)
      const hFront = getTerrainHeight(state.worldPos.x + _fwd.x * 0.55, state.worldPos.z + _fwd.z * 0.55);
      const hBack = getTerrainHeight(state.worldPos.x - _fwd.x * 0.72, state.worldPos.z - _fwd.z * 0.72);
      const avgGroundY = 0.5 * (hFront + hBack);
      const slopePitch = Math.atan2(hBack - hFront, 1.27); // nose up when hFront > hBack -> negative rotation.x in Three.js!

      state.worldPos.y = avgGroundY;
      rootGroup.position.copy(state.worldPos);
      rootGroup.rotation.y = state.heading;
      rootGroup.updateMatrixWorld(true);

      // ------------------------------------------------------------
      // 1. Dynamic Body Motion (Bob, Lateral Sway, Pelvis/Chest Roll)
      // ------------------------------------------------------------
      resetRestPoses();

      const phiRad = state.gaitPhase * Math.PI * 2;
      // Two vertical bobs per full cycle (left stance & right stance)
      const motionScale = smoothstep(0.05, 0.55, speedNorm);
      const bobY = -Math.cos(phiRad * 2.0 + 0.4) * 0.036 * motionScale;

      // Lateral weight shift toward stance side!
      // Left legs swing around phi ~ 0.65..1.0 (stance on Right), Right legs swing around 0.15..0.50 (stance on Left)
      const swayX = Math.sin(phiRad - 0.35) * 0.048 * motionScale;
      const bodyRoll = -Math.sin(phiRad - 0.25) * 0.032 * motionScale;
      const bodyPitch = slopePitch * 0.75 + Math.sin(phiRad * 2.0 - 0.5) * 0.018 * motionScale;

      bones.root.position.set(swayX, 2.54 + bobY, -0.05);
      bones.root.rotation.set(bodyPitch, 0, bodyRoll);

      // Subtle lumbar & chest counter-twist + breathing
      const breath = Math.sin(state.totalTime * 1.45) * 0.010;
      const hipTwistY = Math.cos(phiRad) * 0.038 * motionScale;
      bones.pelvis.rotation.set(
        Math.sin(phiRad * 2.0) * 0.020 * motionScale,
        hipTwistY,
        Math.sin(phiRad) * 0.025 * motionScale
      );
      bones.lumbar.rotation.set(0, -hipTwistY * 0.5, 0);
      bones.chest.rotation.set(
        breath * 0.4 + Math.sin(phiRad * 2.0 + 0.4) * 0.015 * motionScale,
        -hipTwistY * 0.65,
        -Math.sin(phiRad + 0.3) * 0.022 * motionScale
      );
      bones.chest.scale.set(1 + breath * 0.7, 1 + breath * 0.4, 1);

      // ------------------------------------------------------------
      // 2. Iconic Giraffe Neck Pendulum & Head Stabilization
      // ------------------------------------------------------------
      const t = state.totalTime;
      const lookYaw = (Math.sin(t * 0.38) * 0.16 + Math.sin(t * 0.17 + 1.2) * 0.12);
      const lookPitch = (Math.sin(t * 0.29 + 0.8) * 0.06);

      // Forward-backward counter-balance wave traveling up neck with phase lag
      const neckAmp = 0.058 * motionScale;
      const neckYawSway = Math.sin(phiRad + 0.6) * 0.018 * motionScale;

      bones.neck0.rotation.set(
        Math.sin(phiRad * 2.0 - 0.15) * neckAmp * 1.10,
        lookYaw * 0.14 + neckYawSway,
        -Math.sin(phiRad + 0.3) * 0.020 * motionScale
      );
      bones.neck1.rotation.set(
        Math.sin(phiRad * 2.0 - 0.45) * neckAmp * 0.95,
        lookYaw * 0.18 + neckYawSway * 0.8,
        0
      );
      bones.neck2.rotation.set(
        Math.sin(phiRad * 2.0 - 0.75) * neckAmp * 0.80,
        lookYaw * 0.22,
        0
      );
      bones.neck3.rotation.set(
        Math.sin(phiRad * 2.0 - 1.05) * neckAmp * 0.65,
        lookYaw * 0.22,
        0
      );

      // Head counter-rotates to stay level & focused ahead (vestibulo-ocular stabilization!)
      const sumNeckPitch =
        bones.neck0.rotation.x +
        bones.neck1.rotation.x +
        bones.neck2.rotation.x +
        bones.neck3.rotation.x;
      bones.head.rotation.set(
        -sumNeckPitch * 0.72 - bodyPitch * 0.65 + lookPitch,
        lookYaw * 0.38,
        -bodyRoll * 0.55
      );

      // Subtle jaw chewing / breathing motion
      bones.jaw.rotation.x = 0.025 + Math.max(0, Math.sin(t * 2.6)) * 0.015 * (0.5 + 0.5 * Math.sin(t * 0.4));

      // ------------------------------------------------------------
      // 3. Eyelid Blinks, Ear Flicks & Tail Swishes
      // ------------------------------------------------------------
      if (t >= state.nextBlinkTime && state.blinkProgress < 0) {
        state.blinkProgress = 0;
        state.nextBlinkTime = t + 2.8 + (Math.sin(t * 17.3) * 0.5 + 0.5) * 3.2;
      }
      let blinkClosed = 0;
      if (state.blinkProgress >= 0) {
        state.blinkProgress += dt / 0.22; // 220ms blink
        if (state.blinkProgress >= 1) {
          state.blinkProgress = -1;
        } else {
          const b = state.blinkProgress;
          blinkClosed = b < 0.35 ? smoothstep(0, 0.35, b) : 1 - smoothstep(0.35, 1.0, b);
        }
      }
      const lidAngle = lerp(-0.68, 0.22, blinkClosed);
      for (const lid of eyelids) {
        lid.rotation.x = lidAngle;
      }

      // Ears
      function updateEar(earBone, nextKey, progKey, side) {
        if (t >= state[nextKey] && state[progKey] < 0) {
          state[progKey] = 0;
          state[nextKey] = t + 2.2 + (Math.cos(t * 11.7 + side) * 0.5 + 0.5) * 4.5;
        }
        let flick = 0;
        if (state[progKey] >= 0) {
          state[progKey] += dt / 0.35;
          if (state[progKey] >= 1) {
            state[progKey] = -1;
          } else {
            flick = Math.sin(state[progKey] * Math.PI * 3.0) * (1 - state[progKey]) * 0.32;
          }
        }
        earBone.rotation.y = side * (0.06 * Math.sin(t * 0.8 + side) + flick * 0.5);
        earBone.rotation.z = side * (0.04 * Math.cos(t * 0.5) + flick);
      }
      updateEar(bones.earL, 'nextEarFlickL', 'earFlickL', 1);
      updateEar(bones.earR, 'nextEarFlickR', 'earFlickR', -1);

      // Tail sway + occasional swish
      if (t >= state.nextSwishTime && state.swishProgress < 0) {
        state.swishProgress = 0;
        state.nextSwishTime = t + 4.0 + (Math.sin(t * 7.1) * 0.5 + 0.5) * 5.0;
      }
      let swish = 0;
      if (state.swishProgress >= 0) {
        state.swishProgress += dt / 0.75;
        if (state.swishProgress >= 1) {
          state.swishProgress = -1;
        } else {
          swish = Math.sin(state.swishProgress * Math.PI * 3.0) * Math.sin(state.swishProgress * Math.PI) * 0.42;
        }
      }
      const tailBaseSway = Math.sin(phiRad - 0.8) * 0.08 * motionScale + Math.sin(t * 1.1) * 0.03;
      bones.tail0.rotation.set(0.08 + 0.04 * motionScale, 0, tailBaseSway + swish * 0.5);
      bones.tail1.rotation.set(0.04, 0, Math.sin(phiRad - 1.3) * 0.10 * motionScale + swish * 0.8);
      bones.tail2.rotation.set(0.02, 0, Math.sin(phiRad - 1.8) * 0.12 * motionScale + swish * 0.9);
      bones.tail3.rotation.set(0, 0, swish * 0.6);

      // Update spine world matrices before solving leg IK
      rootGroup.updateMatrixWorld(true);

      // ------------------------------------------------------------
      // 4. World-Locked Foot Trajectories & Analytic 2-Bone IK
      // ------------------------------------------------------------
      for (const leg of legList) {
        const legPhase = (state.gaitPhase + leg.phaseOffset) % 1.0;
        const inStance = state.currentSpeed < 0.04 ? true : (legPhase < dutyFactor);

        // Ideal rest anchor on current terrain directly beneath giraffe's rest hoof slot
        _vAnchor.copy(leg.restHoofLocal).applyMatrix4(rootGroup.matrixWorld);
        _vAnchor.y = getTerrainHeight(_vAnchor.x, _vAnchor.z);

        if (state.currentSpeed < 0.04) {
          // Idle: smoothly settle hooves toward neutral terrain spots
          leg.currentHoofWorld.lerp(_vAnchor, Math.min(1, dt * 6.0));
          leg.currentHoofWorld.y = getTerrainHeight(leg.currentHoofWorld.x, leg.currentHoofWorld.z);
          leg.plantedWorld.copy(leg.currentHoofWorld);
          leg.wasInStance = true;
        } else if (state.treadmillMode) {
          // Treadmill mode: slide foot backward along -_fwd during stance
          const stanceT = legPhase / dutyFactor;
          const swingT = (legPhase - dutyFactor) / (1 - dutyFactor);
          const halfStep = strideLen * 0.5;
          let fOff = 0;
          let lift = 0;
          if (inStance) {
            fOff = lerp(halfStep, -halfStep, stanceT);
          } else {
            const sSmooth = smoothstep(0, 1, swingT);
            fOff = lerp(-halfStep, halfStep, sSmooth);
            lift = Math.pow(Math.sin(swingT * Math.PI), 0.85) * lerp(0.16, 0.30, clamp(speedNorm, 0, 1));
          }
          leg.currentHoofWorld.copy(_vAnchor).addScaledVector(_fwd, fOff);
          leg.currentHoofWorld.y = getTerrainHeight(leg.currentHoofWorld.x, leg.currentHoofWorld.z) + lift;
          leg.wasInStance = inStance;
        } else {
          // True World-Space Hoof Locking (Zero Foot Sliding!)
          if (inStance) {
            if (!leg.wasInStance) {
              // Foot touchdown! Lock exact world coordinate onto terrain
              leg.plantedWorld.copy(leg.currentHoofWorld);
              leg.plantedWorld.y = getTerrainHeight(leg.plantedWorld.x, leg.plantedWorld.z);
              if (onHoofStep) {
                onHoofStep(leg.plantedWorld);
              }
            }
            leg.currentHoofWorld.copy(leg.plantedWorld);
          } else {
            // Swing phase!
            if (leg.wasInStance) {
              leg.liftWorld.copy(leg.plantedWorld);
            }
            const swingT = (legPhase - dutyFactor) / (1 - dutyFactor);
            // Predict landing target ahead of ideal anchor
            const leadDist = strideLen * 0.52;
            leg.targetWorld.copy(_vAnchor).addScaledVector(_fwd, leadDist);
            leg.targetWorld.y = getTerrainHeight(leg.targetWorld.x, leg.targetWorld.z);

            const horizT = smoothstep(0.0, 1.0, Math.pow(swingT, 0.92));
            leg.currentHoofWorld.x = lerp(leg.liftWorld.x, leg.targetWorld.x, horizT);
            leg.currentHoofWorld.z = lerp(leg.liftWorld.z, leg.targetWorld.z, horizT);

            const groundY = getTerrainHeight(leg.currentHoofWorld.x, leg.currentHoofWorld.z);
            const maxLift = lerp(0.085, 0.145, clamp(speedNorm, 0, 1.2));
            const arcY = Math.pow(Math.sin(Math.pow(swingT, 0.78) * Math.PI), 0.9) * maxLift;
            leg.currentHoofWorld.y = groundY + arcY;
          }
          leg.wasInStance = inStance;
        }

        // Convert world hoof position into giraffe rootGroup-local space for clean IK
        _localHoof.copy(leg.currentHoofWorld);
        rootGroup.worldToLocal(_localHoof);

        // Compute hoof & pastern pitch (heel-strike -> flat stance -> toe-off / swing dangle)
        let hoofPitch = 0;
        if (state.currentSpeed >= 0.04) {
          if (inStance) {
            const st = legPhase / dutyFactor;
            // Subtle heel strike early, progressive heel rise near toe-off
            hoofPitch = -0.07 * (1 - smoothstep(0, 0.16, st)) + 0.22 * smoothstep(0.78, 1.0, st);
          } else {
            const sw = (legPhase - dutyFactor) / (1 - dutyFactor);
            // Hoof trails backward gently on lift, reaches forward before heel strike
            hoofPitch = Math.sin(sw * Math.PI) * 0.18 - 0.08 * smoothstep(0.75, 1.0, sw);
          }
        }

        // Fetlock target = hoof target minus rotated pastern offset
        const baseP = leg.pasternOffset;
        const cosP = Math.cos(hoofPitch);
        const sinP = Math.sin(hoofPitch);
        // Rotate pastern offset around X (pitch)
        _localFetlock.set(
          _localHoof.x - baseP.x,
          _localHoof.y - (baseP.y * cosP - baseP.z * sinP),
          _localHoof.z - (baseP.y * sinP + baseP.z * cosP)
        );

        if (leg.isFore) {
          const bShoulder = leg.bones.shoulder;
          const bUpper = leg.bones.upperArm;
          const bForearm = leg.bones.forearm;
          const bCannon = leg.bones.foreCannon;
          const bPastern = leg.bones.forePastern;

          // Scapular / upper-arm swing tracks foot reach smoothly so forearm & carpus stay balanced
          const footDeltaZ = _localFetlock.z - leg.restFetlockLocal.z;
          const scapPitch = clamp(-footDeltaZ * 0.28, -0.22, 0.22);
          bShoulder.rotation.x = scapPitch * 0.30;
          bShoulder.updateMatrixWorld(true);

          bUpper.rotation.x = scapPitch * 0.85;
          bUpper.updateMatrixWorld(true);

          // Get Elbow position in rootGroup-local space
          bForearm.getWorldPosition(_localRoot);
          rootGroup.worldToLocal(_localRoot);

          // Solve 2-bone IK: Elbow -> Carpus -> Fetlock (Carpus bends FORWARD +Z!)
          _pole.set(0, 0.15, 1.0).normalize();
          solveTwoBoneIK(
            _localRoot,
            _localFetlock,
            leg.meta.forearm.len,
            leg.meta.foreCannon.len,
            _pole,
            _localMid,
            _clampedTarget
          );

          // Aim Forearm -> Carpus, Cannon -> Fetlock, Pastern -> Hoof
          aimBoneChain(bForearm, leg.meta.forearm, _localRoot, _localMid, _sideAxis);
          aimBoneChain(bCannon, leg.meta.foreCannon, _localMid, _clampedTarget, _sideAxis);
          aimBoneChain(bPastern, leg.meta.forePastern, _clampedTarget, _localHoof, _sideAxis);
        } else {
          const bHip = leg.bones.hip;
          const bGaskin = leg.bones.gaskin;
          const bCannon = leg.bones.hindCannon;
          const bPastern = leg.bones.hindPastern;

          // Femur / Stifle swings proportionally with hind foot reach
          const footDeltaZ = _localFetlock.z - leg.restFetlockLocal.z;
          const hipPitch = clamp(-footDeltaZ * 0.26, -0.22, 0.22);
          bHip.rotation.x = hipPitch;
          bHip.updateMatrixWorld(true);

          // Get Stifle position in rootGroup-local space
          bGaskin.getWorldPosition(_localRoot);
          rootGroup.worldToLocal(_localRoot);

          // Solve 2-bone IK: Stifle -> Hock -> Fetlock (Hock points BACKWARD -Z!)
          _pole.set(0, 0.12, -1.0).normalize();
          solveTwoBoneIK(
            _localRoot,
            _localFetlock,
            leg.meta.gaskin.len,
            leg.meta.hindCannon.len,
            _pole,
            _localMid,
            _clampedTarget
          );

          // Aim Gaskin -> Hock, HindCannon -> Fetlock, HindPastern -> Hoof
          aimBoneChain(bGaskin, leg.meta.gaskin, _localRoot, _localMid, _sideAxis);
          aimBoneChain(bCannon, leg.meta.hindCannon, _localMid, _clampedTarget, _sideAxis);
          aimBoneChain(bPastern, leg.meta.hindPastern, _clampedTarget, _localHoof, _sideAxis);
        }
      }
    }

    return {
      state,
      update,
    };
  }

  global.GiraffeGait = {
    createGiraffeController,
  };
})(window);
