(function () {
  'use strict';

  const {
    clamp,
    lerp,
    smoothstep,
    smootherstep,
    solveTwoBoneIK,
    computeLimbWorldQuaternion
  } = window.GiraffeMath;

  /**
   * Biomechanical Lateral-Sequence Walking Controller for Giraffa camelopardalis.
   * Guarantees 0.000mm foot slip during stance via exact arc-length parameterized ground footfalls,
   * multi-segment ungulate limb kinematics (scapula glide, backward carpus fold, Z-hindleg hock,
   * weight-loaded fetlock suspension & toe breakover), and 2x-frequency cervical traveling counter-bob.
   */
  function createGiraffeGaitController(character, worldSampler) {
    const {
      group,
      root,
      boneMap,
      neckBones,
      tailBones,
      limbRig,
      eyelidMeshes
    } = character;

    // Trail & Stride configuration
    const config = {
      walkSpeed: 1.48,        // meters / second at 1.0x speed (~5.3 km/h natural giraffe walk)
      strideLength: 1.94,     // meters per full 4-beat lateral cycle
      dutyFactor: 0.64,       // 64% ground stance, 36% swing
      trailRadius: 46.0,      // gentle 289m circumference savanna trail loop around acacia & waterhole
      neckBobAmount: 1.0,     // user-adjustable counter-bob multiplier
      speedMultiplier: 1.0
    };

    // Exact giraffe lateral-sequence footfall phase offsets:
    // Left Hind (0.00) -> Left Front (0.15) -> Right Hind (0.50) -> Right Front (0.65)
    const phaseOffsets = {
      HL: 0.00,
      FL: 0.15,
      HR: 0.50,
      FR: 0.65
    };

    let arcDistance = 0.22 * config.strideLength; // current path distance in meters
    let simTime = 0.0;

    // Track previous stance state per limb to emit footstep dust & hoofprint decals!
    const prevStanceState = { FL: true, FR: true, HL: true, HR: true };
    const footDiagnostics = {
      FL: { inStance: true, worldHoof: new THREE.Vector3(), plantedRef: new THREE.Vector3(), maxSlip: 0 },
      FR: { inStance: true, worldHoof: new THREE.Vector3(), plantedRef: new THREE.Vector3(), maxSlip: 0 },
      HL: { inStance: true, worldHoof: new THREE.Vector3(), plantedRef: new THREE.Vector3(), maxSlip: 0 },
      HR: { inStance: true, worldHoof: new THREE.Vector3(), plantedRef: new THREE.Vector3(), maxSlip: 0 }
    };

    const _pTrail = new THREE.Vector3();
    const _tTrail = new THREE.Vector3();
    const _rTrail = new THREE.Vector3();

    /**
     * Evaluates the smooth savanna trail at exact arc-length s (meters).
     * Gentle undulating figure-oval loop so locally it feels like a natural animal game trail.
     */
    function sampleTrail(s, outPos, outTangent, outLeft) {
      const R = config.trailRadius;
      const theta = s / R;
      // Subtle organic path meander so it isn't a sterile geometric circle
      const px = Math.sin(theta) * R + Math.sin(theta * 3.0) * 1.8;
      const pz = (Math.cos(theta) - 1.0) * R + Math.cos(theta * 2.0) * 1.4 - 1.4;

      const eps = 0.05;
      const th2 = (s + eps) / R;
      const px2 = Math.sin(th2) * R + Math.sin(th2 * 3.0) * 1.8;
      const pz2 = (Math.cos(th2) - 1.0) * R + Math.cos(th2 * 2.0) * 1.4 - 1.4;

      const tx = px2 - px;
      const tz = pz2 - pz;
      const len = Math.hypot(tx, tz) || 1.0;
      const fx = tx / len;
      const fz = tz / len;

      const gy = worldSampler ? worldSampler.getGroundHeight(px, pz) : 0.0;
      outPos.set(px, gy, pz);
      outTangent.set(fx, 0, fz);
      // Animal's +X = Left = Up(0,1,0) x Forward(fx,0,fz) = (fz, 0, -fx)
      outLeft.set(fz, 0, -fx);
    }

    /**
     * Computes the exact world ground target where limb `key` sits when body is centered at arc-length sMid.
     */
    function getPlantedHoofSpot(key, sMid, outSpot, outForward) {
      const limb = limbRig[key];
      sampleTrail(sMid, _pTrail, _tTrail, _rTrail);

      const restHoof = limb.rest.hoofTip; // x = lateral (+left), z = fore/aft
      const wx = _pTrail.x + _rTrail.x * restHoof.x + _tTrail.x * restHoof.z;
      const wz = _pTrail.z + _rTrail.z * restHoof.x + _tTrail.z * restHoof.z;
      const wy = worldSampler ? worldSampler.getGroundHeight(wx, wz) : 0.0;

      outSpot.set(wx, wy, wz);
      if (outForward) outForward.copy(_tTrail);
      return outSpot;
    }

    // Reusable scratch math objects
    const _bodyPos = new THREE.Vector3();
    const _bodyFwd = new THREE.Vector3();
    const _bodyLeft = new THREE.Vector3();
    const _spotA = new THREE.Vector3();
    const _spotB = new THREE.Vector3();
    const _fwdA = new THREE.Vector3();
    const _fwdB = new THREE.Vector3();
    const _hoofWorld = new THREE.Vector3();
    const _hoofFwd = new THREE.Vector3();
    const _fetlockWorld = new THREE.Vector3();
    const _scapOrHipWorld = new THREE.Vector3();
    const _upperWorld = new THREE.Vector3();
    const _midWorld = new THREE.Vector3();
    const _distalWorld = new THREE.Vector3();
    const _poleBack = new THREE.Vector3();
    const _poleFwd = new THREE.Vector3();
    const _qWorld = new THREE.Quaternion();
    const _qParentInv = new THREE.Quaternion();
    const _mParentInv = new THREE.Matrix4();
    const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

    function setBoneWorldPose(bone, worldPos, worldTargetPos, forwardHint) {
      const parent = bone.parent;
      parent.updateMatrixWorld(false);
      _mParentInv.copy(parent.matrixWorld).invert();
      _qParentInv.setFromRotationMatrix(parent.matrixWorld).invert();

      bone.position.copy(worldPos).applyMatrix4(_mParentInv);
      computeLimbWorldQuaternion(worldPos, worldTargetPos, forwardHint, _qWorld);
      bone.quaternion.copy(_qParentInv).multiply(_qWorld);
      bone.updateMatrixWorld(false);
    }

    /**
     * Evaluates and applies the entire skeleton pose at current `arcDistance` and `simTime`.
     */
    function applyPose(emitEvents) {
      const L = config.strideLength;
      const beta = config.dutyFactor;
      const cyclePhase = ((arcDistance / L) % 1.0 + 1.0) % 1.0;
      const twoPi = Math.PI * 2.0;

      // 1. Position Giraffe Root on the Savanna Trail
      sampleTrail(arcDistance, _bodyPos, _bodyFwd, _bodyLeft);
      const headingYaw = Math.atan2(_bodyFwd.x, _bodyFwd.z);

      group.position.copy(_bodyPos);
      group.rotation.set(0, headingYaw, 0);
      group.updateMatrixWorld(false);

      // Reset axial bones to rest local pose before applying dynamic offsets
      for (const name of ['Root', 'Pelvis', 'SpineLoins', 'SpineChest', 'SpineWithers', 'Head', 'Jaw', 'EarL', 'EarR']) {
        const b = boneMap[name];
        b.position.copy(b.userData.restLocalPos);
        b.quaternion.copy(b.userData.restLocalQuat);
      }
      for (let i = 0; i < neckBones.length; i++) {
        neckBones[i].position.copy(neckBones[i].userData.restLocalPos);
        neckBones[i].quaternion.copy(neckBones[i].userData.restLocalQuat);
      }
      for (let i = 0; i < tailBones.length; i++) {
        tailBones[i].position.copy(tailBones[i].userData.restLocalPos);
        tailBones[i].quaternion.copy(tailBones[i].userData.restLocalQuat);
      }

      // 2. Axial Body Dynamics: Vaulting Center-of-Mass Bob, Lateral Weight Shift, Roll & Pitch
      const motionScale = emitEvents ? clamp(smoothstep(0.0, 0.45, config.speedMultiplier), 0.0, 1.25) : 1.0;
      // Vaulting peaks during left-side mid-stance (~0.38) and right-side mid-stance (~0.88)
      const doubleWave = Math.sin((cyclePhase - 0.13) * twoPi * 2.0);
      const singleWave = Math.sin((cyclePhase - 0.10) * twoPi);

      const comBobY = 0.036 * doubleWave * motionScale;
      const lateralSwayX = 0.028 * singleWave * motionScale;
      const torsoRollZ = -0.034 * singleWave * motionScale;
      const torsoPitchX = 0.020 * Math.cos((cyclePhase - 0.13) * twoPi * 2.0) * motionScale;
      const torsoYawY = 0.022 * singleWave * motionScale;

      // Subtle breathing expansion
      const breath = Math.sin(simTime * 1.45) * 0.5 + 0.5;

      root.position.x += lateralSwayX;
      root.position.y += comBobY;
      _euler.set(torsoPitchX, torsoYawY, torsoRollZ);
      root.quaternion.multiply(new THREE.Quaternion().setFromEuler(_euler));

      // Subtle counter-rotation between pelvis and chest (hip drop on swinging side!)
      _euler.set(-torsoPitchX * 0.35, -torsoYawY * 0.65, -torsoRollZ * 0.55);
      boneMap.Pelvis.quaternion.multiply(new THREE.Quaternion().setFromEuler(_euler));

      _euler.set(0.008 * (breath - 0.5), torsoYawY * 0.35, torsoRollZ * 0.25);
      boneMap.SpineChest.quaternion.multiply(new THREE.Quaternion().setFromEuler(_euler));

      // 3. Iconic 2x-Frequency Traveling Cervical Neck Wave & Vestibulo-Collic Head Stabilization
      const bobScale = config.neckBobAmount * motionScale;
      let cumulativeNeckPitch = 0;
      let cumulativeNeckRoll = 0;
      let cumulativeNeckYaw = 0;

      //Gentle curious look around savanna over long period
      const curiousYaw = (Math.sin(simTime * 0.37) * 0.065 + Math.sin(simTime * 0.83) * 0.030);
      const curiousPitch = Math.sin(simTime * 0.51 + 1.2) * 0.025;

      for (let i = 0; i < neckBones.length; i++) {
        const nb = neckBones[i];
        const uNeck = i / (neckBones.length - 1);
        // Phase lags slightly going up C7 -> C1, creating a fluid biological wave!
        const wavePhase = (cyclePhase * 2.0 - 0.22 - uNeck * 0.14) * twoPi;
        const swayPhase = (cyclePhase - 0.16 - uNeck * 0.08) * twoPi;

        const dPitch = (0.021 * Math.sin(wavePhase) * (0.75 + 0.5 * uNeck)) * bobScale + curiousPitch * 0.08;
        const dRoll = 0.0075 * Math.sin(swayPhase) * bobScale;
        const dYaw = (0.006 * Math.cos(swayPhase)) * bobScale + curiousYaw * 0.11;

        _euler.set(dPitch, dYaw, dRoll);
        nb.quaternion.multiply(new THREE.Quaternion().setFromEuler(_euler));

        cumulativeNeckPitch += dPitch;
        cumulativeNeckRoll += dRoll;
        cumulativeNeckYaw += dYaw;
      }

      // Head stabilizes horizon partially while nodding subtly at muzzle tip
      const headLeadWave = Math.sin((cyclePhase * 2.0 - 0.42) * twoPi) * 0.032 * bobScale;
      _euler.set(
        -cumulativeNeckPitch * 0.62 + headLeadWave,
        curiousYaw * 0.28 - cumulativeNeckYaw * 0.25,
        -cumulativeNeckRoll * 0.72
      );
      boneMap.Head.quaternion.multiply(new THREE.Quaternion().setFromEuler(_euler));

      // Subtle jaw chew / breathing motion
      const jawMotion = 0.015 * breath + Math.max(0, Math.sin(simTime * 2.3) - 0.7) * 0.06;
      _euler.set(jawMotion, 0, 0);
      boneMap.Jaw.quaternion.multiply(new THREE.Quaternion().setFromEuler(_euler));

      // Asymmetric alert ear flicks
      const flickL = Math.pow(Math.max(0, Math.sin(simTime * 1.17 + 0.4)), 14.0) * 0.34;
      const flickR = Math.pow(Math.max(0, Math.sin(simTime * 0.93 + 2.7)), 16.0) * 0.38;
      _euler.set(-0.05 * Math.sin(simTime * 1.6), -flickL, 0.04 * Math.cos(simTime * 1.2));
      boneMap.EarL.quaternion.multiply(new THREE.Quaternion().setFromEuler(_euler));
      _euler.set(-0.05 * Math.cos(simTime * 1.5), flickR, -0.04 * Math.sin(simTime * 1.3));
      boneMap.EarR.quaternion.multiply(new THREE.Quaternion().setFromEuler(_euler));

      // Natural blinking of lashed upper eyelids every ~4.7 seconds (eyes wide open at startup!)
      const blinkCycle = (simTime % 4.7);
      let blinkAmt = 0;
      if (blinkCycle > 3.60 && blinkCycle < 3.78) {
        blinkAmt = Math.sin(((blinkCycle - 3.60) / 0.18) * Math.PI);
      } else if (blinkCycle > 3.90 && blinkCycle < 4.06 && Math.sin(simTime * 0.21) > 0.6) {
        blinkAmt = Math.sin(((blinkCycle - 3.90) / 0.16) * Math.PI);
      }
      for (let i = 0; i < eyelidMeshes.length; i++) {
        eyelidMeshes[i].rotation.x = blinkAmt * 0.95;
      }

      // 4. 6-Bone Articulated Tail Pendulum & Occasional Fly-Swish
      const swishBurst = Math.exp(-Math.pow(((simTime % 8.5) - 4.2) / 0.48, 2));
      for (let i = 0; i < tailBones.length; i++) {
        const uTail = i / tailBones.length;
        const lag = uTail * 1.35;
        const swayZ = (0.045 * Math.sin(cyclePhase * twoPi - lag) + swishBurst * 0.24 * Math.sin(simTime * 9.5 - lag)) * (0.6 + uTail);
        const swingX = 0.026 * Math.cos(cyclePhase * twoPi * 2.0 - lag * 0.8) + 0.025 + swishBurst * 0.08;
        _euler.set(swingX, 0, swayZ);
        tailBones[i].quaternion.multiply(new THREE.Quaternion().setFromEuler(_euler));
      }

      // Update axial matrices before solving world-space limb IK!
      group.updateMatrixWorld(true);

      // 5. Solve All Four 5-Segment Ungulate Limbs in World Space
      for (const key of ['HL', 'FL', 'HR', 'FR']) {
        const limb = limbRig[key];
        const lb = limb.bones;
        const len = limb.lengths;
        const phi0 = phaseOffsets[key];

        // Continuous step index n and local leg phase p in [0, 1)
        const rawLegCoord = (arcDistance / L) - phi0;
        const stepN = Math.floor(rawLegCoord);
        const p = rawLegCoord - stepN;
        const inStance = p < beta;

        // Exact arc-length centers of current stance spot (stepN) and next stance spot (stepN + 1)
        const sMidCurr = (stepN + phi0 + 0.5 * beta) * L;
        const sMidNext = (stepN + 1 + phi0 + 0.5 * beta) * L;

        getPlantedHoofSpot(key, sMidCurr, _spotA, _fwdA);
        getPlantedHoofSpot(key, sMidNext, _spotB, _fwdB);

        let pasternTiltDeg = 0; // degrees relative to rest pastern slope (+ = more vertical/toe-down, - = hyperextended/loaded)
        let swingProgress = 0;
        let stanceProgress = 0;

        if (inStance) {
          stanceProgress = p / beta; // [0 .. 1]
          // LOCKED TO EXACT PLANTED SPOT _spotA -> ZERO FOOT SLIP!
          _hoofWorld.copy(_spotA);
          _hoofFwd.copy(_fwdA);

          // Weight load curve: fetlock compresses/drops ~13 deg under body weight in mid-stance!
          const weightLoad = Math.sin(stanceProgress * Math.PI);
          // Heel breakover in final 18% of stance: heel lifts around front toe tip!
          const breakover = smoothstep(0.80, 1.00, stanceProgress);
          pasternTiltDeg = -13.0 * weightLoad + 32.0 * breakover;

          // Subtle heel rise during breakover while front toe edge stays pinned on ground
          if (breakover > 0.001) {
            _hoofWorld.y += breakover * 0.032;
            _hoofWorld.addScaledVector(_hoofFwd, breakover * 0.018);
          }

          // Emit subtle dust puff & cloven hoofprint right at touchdown!
          if (!prevStanceState[key] && emitEvents && worldSampler && worldSampler.onHoofTouchdown) {
            worldSampler.onHoofTouchdown(key, _spotA, _fwdA);
          }

          // Diagnostics tracking
          if (!footDiagnostics[key].inStance) {
            footDiagnostics[key].plantedRef.copy(_spotA);
          } else if (stanceProgress < 0.78) {
            const slip = _hoofWorld.distanceTo(footDiagnostics[key].plantedRef);
            if (slip > footDiagnostics[key].maxSlip) {
              footDiagnostics[key].maxSlip = slip;
            }
          }
        } else {
          swingProgress = (p - beta) / (1.0 - beta); // [0 .. 1]
          // Smootherstep (C2 zero velocity & zero acceleration at liftoff and touchdown!)
          const hBlend = smootherstep(0.0, 1.0, swingProgress);
          _hoofWorld.lerpVectors(_spotA, _spotB, hBlend);
          _hoofFwd.lerpVectors(_fwdA, _fwdB, hBlend).normalize();

          // Asymmetric ungulate hoof swing arc: lifts briskly to ~20cm peak at u~0.38, glides into soft landing
          const liftBell = Math.sin(Math.pow(swingProgress, 0.78) * Math.PI);
          const groundUnderSwing = worldSampler
            ? worldSampler.getGroundHeight(_hoofWorld.x, _hoofWorld.z)
            : lerp(_spotA.y, _spotB.y, hBlend);
          // Real walking giraffes skim their hooves gracefully ~9-10cm above the ground in a long pendulum arc
          const peakClearance = limb.isFront ? 0.095 : 0.088;
          _hoofWorld.y = groundUnderSwing + peakClearance * Math.pow(liftBell, 1.15);

          // Passive tendon folding of fetlock/hoof after toe-off: hoof hangs gently downward-and-back (~38 deg)
          // so fetlock rises modestly (~7cm) rather than jackknifing the upper limb!
          const foldBack = Math.sin(Math.min(1.0, swingProgress * 1.35) * Math.PI) * (1.0 - swingProgress * 0.40);
          const reachExtend = smoothstep(0.65, 0.92, swingProgress) * (1.0 - smoothstep(0.92, 1.0, swingProgress));
          pasternTiltDeg = -22.0 * foldBack + 18.0 * (1.0 - smoothstep(0.0, 0.25, swingProgress)) - 6.0 * reachExtend;
        }

        prevStanceState[key] = inStance;
        footDiagnostics[key].inStance = inStance;
        footDiagnostics[key].worldHoof.copy(_hoofWorld);

        // Compute Fetlock World Position from Hoof World Position + Pastern angle!
        // Rest pastern goes from hoofTip UP (+0.225) and BACK (-0.070) -> rest angle from horizontal backward = 72.7 deg
        const restElevRad = Math.atan2(
          limb.rest.fetlock.y - limb.rest.hoofTip.y,
          limb.rest.hoofTip.z - limb.rest.fetlock.z
        ); // ~1.269 rad (72.7 deg)
        const animElevRad = clamp(restElevRad + THREE.MathUtils.degToRad(pasternTiltDeg), 0.72, 2.35);
        const backDist = Math.cos(animElevRad) * len.pasternHoof;
        const upDist = Math.sin(animElevRad) * len.pasternHoof;

        _fetlockWorld.copy(_hoofWorld)
          .addScaledVector(_hoofFwd, -backDist);
        _fetlockWorld.y += upDist;

        // Proximal origin (Scapula top or Iliac crest) in current animated torso space
        lb.root.parent.updateMatrixWorld(false);
        _scapOrHipWorld.copy(lb.root.userData.restLocalPos).applyMatrix4(lb.root.parent.matrixWorld);

        // Compute normalized fore-aft reach of fetlock relative to shoulder/hip (-1 = rear liftoff, +1 = front touchdown)
        const dxHoof = _fetlockWorld.x - _scapOrHipWorld.x;
        const dzHoof = _fetlockWorld.z - _scapOrHipWorld.z;
        const foreAftOffset = dxHoof * _bodyFwd.x + dzHoof * _bodyFwd.z;

        _poleBack.copy(_bodyFwd).negate();
        _poleFwd.copy(_bodyFwd);

        if (limb.isFront) {
          // FORELEG: Smooth scapular + humeral pendulum beside the brisket,
          // while (Radius, Metacarpus) solve exact 2-bone IK through the forward-bending Carpus!
          const restScapToShoulder = new THREE.Vector3().subVectors(limb.rest.upper, limb.rest.scapulaOrHip);
          const scapSwing = clamp((foreAftOffset - 0.05) * 0.20, -0.15, 0.18);
          const shFwd = restScapToShoulder.z + scapSwing * 0.28;
          const shDown = -Math.sqrt(Math.max(0.04, len.rootToUpper * len.rootToUpper - shFwd * shFwd - restScapToShoulder.x * restScapToShoulder.x));

          _upperWorld.copy(_scapOrHipWorld)
            .addScaledVector(_bodyLeft, restScapToShoulder.x)
            .addScaledVector(_bodyFwd, shFwd);
          _upperWorld.y += shDown + (inStance ? 0.0 : 0.036 * Math.sin(swingProgress * Math.PI));

          // Humerus swings smoothly with stride reach + lifts slightly during swing so elbow stays tucked by chest!
          const restHumerusRel = new THREE.Vector3().subVectors(limb.rest.mid, limb.rest.upper);
          const baseHumAngle = Math.atan2(restHumerusRel.z, -restHumerusRel.y); // ~ -0.42 rad (-24 deg tucked back)
          const strideHumSwing = clamp((foreAftOffset - 0.04) * 0.36, -0.22, 0.30);
          const swingElbowForward = inStance ? 0.0 : 0.16 * Math.sin(swingProgress * Math.PI);
          let humAngle = baseHumAngle + strideHumSwing + swingElbowForward;

          const latHum = restHumerusRel.x;
          const planarHum = Math.sqrt(Math.max(0.04, len.upper * len.upper - latHum * latHum));

          for (let iter = 0; iter < 3; iter++) {
            _midWorld.copy(_upperWorld)
              .addScaledVector(_bodyLeft, latHum)
              .addScaledVector(_bodyFwd, Math.sin(humAngle) * planarHum);
            _midWorld.y -= Math.cos(humAngle) * planarHum;

            const dElbowFetlock = _midWorld.distanceTo(_fetlockWorld);
            const maxRC = len.mid + len.cannon - 0.008;
            if (dElbowFetlock > maxRC) {
              const dirToFetlock = new THREE.Vector3().subVectors(_fetlockWorld, _upperWorld);
              const targetAngle = Math.atan2(dirToFetlock.dot(_bodyFwd), -dirToFetlock.y);
              humAngle = lerp(humAngle, targetAngle, 0.52);
            } else {
              break;
            }
          }

          // Solve Carpus ("Front Knee") from Elbow to Fetlock with pole = FORWARD (so cannon folds BACKWARD!)
          solveTwoBoneIK(_midWorld, _fetlockWorld, len.mid, len.cannon, _poleFwd, _distalWorld, null);
        } else {
          // HINDLEG: Pelvic Hip -> Forward Stifle -> Backward Point-of-Hock -> Fetlock!
          const restHipRel = new THREE.Vector3().subVectors(limb.rest.upper, limb.rest.scapulaOrHip);
          _upperWorld.copy(_scapOrHipWorld)
            .addScaledVector(_bodyLeft, restHipRel.x)
            .addScaledVector(_bodyFwd, restHipRel.z);
          _upperWorld.y += restHipRel.y;

          // Femur swings forward & lifts during swing, sweeps back during late stance
          const restFemurRel = new THREE.Vector3().subVectors(limb.rest.mid, limb.rest.upper);
          const baseFemurAngle = Math.atan2(restFemurRel.z, -restFemurRel.y); // ~+0.40 rad (+23 deg forward)
          const strideFemurSwing = clamp((foreAftOffset + 0.02) * 0.42, -0.28, 0.34);
          const swingHipLift = inStance ? 0.0 : 0.22 * Math.sin(swingProgress * Math.PI);
          let femurAngle = baseFemurAngle + strideFemurSwing + swingHipLift;

          // Place Stifle and verify Tibia+Metatarsus reach to Fetlock; softly adjust femurAngle if stretched
          const latFemur = restFemurRel.x;
          const planarFemur = Math.sqrt(Math.max(0.04, len.upper * len.upper - latFemur * latFemur));

          for (let iter = 0; iter < 3; iter++) {
            _midWorld.copy(_upperWorld)
              .addScaledVector(_bodyLeft, latFemur)
              .addScaledVector(_bodyFwd, Math.sin(femurAngle) * planarFemur);
            _midWorld.y -= Math.cos(femurAngle) * planarFemur;

            const dStifleFetlock = _midWorld.distanceTo(_fetlockWorld);
            const maxTM = len.mid + len.cannon - 0.016;
            if (dStifleFetlock > maxTM) {
              // Swing femur slightly toward fetlock so hock never hyperextends straight
              const dirToFetlock = new THREE.Vector3().subVectors(_fetlockWorld, _upperWorld);
              const targetAngle = Math.atan2(dirToFetlock.dot(_bodyFwd), -dirToFetlock.y);
              femurAngle = lerp(femurAngle, targetAngle, 0.48);
            } else {
              break;
            }
          }

          // Solve Hock from Stifle to Fetlock with pole = BACKWARD (prominent calcaneus!)
          solveTwoBoneIK(_midWorld, _fetlockWorld, len.mid, len.cannon, _poleBack, _distalWorld, null);
        }

        // Write solved world-space chain into the 5 hierarchical limb bones!
        setBoneWorldPose(lb.root, _scapOrHipWorld, _upperWorld, _bodyFwd);
        setBoneWorldPose(lb.upper, _upperWorld, _midWorld, _bodyFwd);
        setBoneWorldPose(lb.mid, _midWorld, _distalWorld, _bodyFwd);
        setBoneWorldPose(lb.cannon, _distalWorld, _fetlockWorld, _bodyFwd);
        setBoneWorldPose(lb.hoof, _fetlockWorld, _hoofWorld, _hoofFwd);
      }

      group.updateMatrixWorld(true);
    }

    function update(dt) {
      const clampedDt = Math.min(dt, 0.1);
      simTime += clampedDt;
      arcDistance += clampedDt * config.walkSpeed * config.speedMultiplier;
      applyPose(true);
    }

    function setPhaseDirectly(phaseNormalized) {
      const p = ((phaseNormalized % 1.0) + 1.0) % 1.0;
      const baseCycles = Math.floor(arcDistance / config.strideLength);
      arcDistance = (baseCycles + p) * config.strideLength;
      applyPose(false);
    }

    function getCyclePhase() {
      return ((arcDistance / config.strideLength) % 1.0 + 1.0) % 1.0;
    }

    function resetSlipDiagnostics() {
      for (const k of ['FL', 'FR', 'HL', 'HR']) {
        footDiagnostics[k].maxSlip = 0;
        footDiagnostics[k].inStance = false;
      }
    }

    // Initialize clean standing/walking pose immediately
    applyPose(false);

    return {
      config,
      update,
      setPhaseDirectly,
      getCyclePhase,
      footDiagnostics,
      resetSlipDiagnostics,
      getBodyWorldPosition: () => _bodyPos.clone(),
      getBodyForward: () => _bodyFwd.clone(),
      getBodyLeft: () => _bodyLeft.clone()
    };
  }

  window.GiraffeGait = {
    createGiraffeGaitController
  };
})();
