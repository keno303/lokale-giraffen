// giraffe-gait.js
// Biomechanically accurate Giraffe pacing gait, analytical 2-circle + distal IK solver,
// 2x-frequency cervical neck counter-pendulum, breathing, blinking, ear radar, and browsing behaviors

(function (global) {
  'use strict';

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(x, min, max) {
    return Math.max(min, Math.min(max, x));
  }

  function smoothstep(a, b, x) {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  // Rotate a 2D sagittal bind vector (dy, dz) by angle theta (around +X axis: y' = y cos - z sin, z' = y sin + z cos)
  function rotYZ(dy, dz, theta) {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return {
      y: dy * c - dz * s,
      z: dy * s + dz * c
    };
  }

  // Solve 2-circle intersection in the (Y, Z) sagittal plane from origin (y0, z0) to target (y2, z2)
  // with link lengths L1, L2.
  // signZ = +1 selects the joint vertex that bulges toward +Z (anterior, e.g., hindleg Stifle/Knee)
  // signZ = -1 selects the joint vertex that bulges toward -Z (posterior, e.g., foreleg Elbow)
  function solveSagittalTwoBonePoint(y0, z0, y2, z2, L1, L2, signZ) {
    const dy = y2 - y0;
    const dz = z2 - z0;
    let d = Math.hypot(dy, dz);
    const maxReach = (L1 + L2) * 0.9992;
    const minReach = Math.abs(L1 - L2) * 1.0008;
    d = clamp(d, minReach, maxReach);

    const ux = dy / (Math.hypot(dy, dz) || 1);
    const uz = dz / (Math.hypot(dy, dz) || 1);

    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));

    const my = y0 + a * ux;
    const mz = z0 + a * uz;

    // Two perpendicular directions in (Y, Z): (-uz, ux) and (+uz, -ux)
    // Since ux = dy/d < 0 (pointing downward), +ux in Z is negative, so -ux in Z is positive (+Z)!
    const p1y = my + h * uz * signZ;
    const p1z = mz - h * ux * signZ;

    return { y: p1y, z: p1z };
  }

  // Compute rotation angle theta around +X that maps bind vector (by, bz) to target vector (ty, tz)
  function angleBetweenYZ(by, bz, ty, tz) {
    // Since rotYZ(by, bz, theta) has:
    // by*cos - bz*sin = ty
    // by*sin + bz*cos = tz
    // theta = atan2(tz, ty) - atan2(bz, by)
    let diff = Math.atan2(tz, ty) - Math.atan2(bz, by);
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  class GiraffeGaitController {
    constructor(giraffe, options = {}) {
      this.giraffe = giraffe;
      this.rig = giraffe.rig;
      this.boneMap = giraffe.rig.boneMap;
      this.cranialRefs = giraffe.cranialRefs;

      // Gait parameters
      // Giraffes walk in a lateral pacing amble:
      // Left Hind (0.00) -> Left Fore (0.14) -> Right Hind (0.50) -> Right Fore (0.64)
      this.phases = {
        LH: 0.00,
        LF: 0.14,
        RH: 0.50,
        RF: 0.64
      };

      this.dutyFactor = 0.62;       // 62% stance phase, 38% swing phase (natural stable walk)
      this.strideLength = 1.48;     // Meters covered per full gait cycle (1.48m stride)
      this.cycleFrequency = 0.56;   // Cycles per second at 1.0x walk speed (~0.83 m/s natural walk)
      this.speedMultiplier = options.speedMultiplier !== undefined ? options.speedMultiplier : 1.0;

      this.gaitPhase = 0.0;         // Normalized [0, 1) cycle phase
      this.elapsedTime = 0.0;
      this.distanceWalked = 0.0;

      // Behavioral states (browsing acacia leaves, curious head look)
      this.browseWeight = 0.0;
      this.browseTargetWeight = 0.0;
      this.browseTimer = 0.0;
      this.blinkTimer = 2.4;
      this.blinkDuration = 0.22;
      this.blinkClock = 0.0;

      // Track footfall events for dust puffs & hoofprints
      this.prevStance = { LF: true, RF: true, LH: true, RH: true };
      this.onHoofStrike = options.onHoofStrike || null;

      // Cache bind-pose sagittal vectors for exact IK
      this._cacheBindVectors();
    }

    _cacheBindVectors() {
      const bm = this.boneMap;
      const getVec = (b) => ({
        x: b.userData.restPosition.x,
        y: b.userData.restPosition.y,
        z: b.userData.restPosition.z,
        len: Math.hypot(b.userData.restPosition.y, b.userData.restPosition.z)
      });

      this.foreBind = {
        scapula: getVec(bm['scapula_L']),
        shoulder: getVec(bm['shoulder_L']), // Scapula -> Shoulder
        elbow: getVec(bm['elbow_L']),       // Shoulder -> Elbow (Humerus)
        carpus: getVec(bm['carpus_L']),     // Elbow -> Carpus (Radius/Ulna)
        fetlock: getVec(bm['fetlock_L']),   // Carpus -> Fetlock (Metacarpus)
        pastern: getVec(bm['pastern_L']),   // Fetlock -> Pastern
        hoof: getVec(bm['hoof_L']),         // Pastern -> Hoof sole
        restHoofZ: bm['hoof_L'].userData.bindWorldPos.z,
        restHoofX: bm['hoof_L'].userData.bindWorldPos.x
      };

      this.hindBind = {
        hip: getVec(bm['hip_L']),
        stifle: getVec(bm['stifle_L']),             // Hip -> Stifle (Femur)
        hock: getVec(bm['hock_L']),                 // Stifle -> Hock (Tibia)
        fetlock: getVec(bm['hind_fetlock_L']),      // Hock -> Hind Fetlock (Metatarsus)
        pastern: getVec(bm['hind_pastern_L']),      // Hind Fetlock -> Hind Pastern
        hoof: getVec(bm['hind_hoof_L']),            // Hind Pastern -> Hind Hoof sole
        restHoofZ: bm['hind_hoof_L'].userData.bindWorldPos.z,
        restHoofX: bm['hind_hoof_L'].userData.bindWorldPos.x
      };
    }

    triggerBrowse() {
      this.browseTargetWeight = 1.0;
      this.browseTimer = 5.5;
    }

    // Evaluate foot trajectory & distal joint coordination at limb phase u in [0, 1)
    evaluateLimbTrajectory(u, isFore, walkScale) {
      const duty = this.dutyFactor;
      const halfStride = 0.5 * this.strideLength * walkScale;

      let zOffset = 0;
      let yLift = 0;
      let stanceLoad = 0;
      let isStance = true;
      let carpusFlex = 0;   // > 0 bends fore-knee (cannon bone) backward
      let pasternPitch = 0; // < 0 drops fetlock in stance, > 0 curls toe back in swing
      let hoofPitch = 0;    // 0 flat on ground in stance, > 0 tips toe down/back in swing
      let scapLift = 0;

      if (u < duty) {
        // STANCE PHASE: Hoof travels backward at constant ground speed from +halfStride to -halfStride!
        isStance = true;
        const s = u / duty; // 0 at touch-down (anterior), 1 at toe-off (posterior)
        zOffset = lerp(halfStride, -halfStride, s);
        yLift = 0.0;

        // Smooth bell curve of vertical ground reaction force
        stanceLoad = Math.sin(s * Math.PI) * walkScale;
        scapLift = stanceLoad * 0.028;

        // Fetlock spring hyperextension under weight + heel-lift preparation near toe-off (s > 0.80)
        const heelLift = smoothstep(0.80, 1.0, s) * walkScale;
        pasternPitch = -0.22 * stanceLoad + heelLift * 0.42;
        hoofPitch = heelLift * 0.50;
        if (isFore) {
          // Fore-knee stays locked straight as a weight-bearing column, unlocking just at toe-off
          carpusFlex = smoothstep(0.84, 1.0, s) * 0.36 * walkScale;
        }
      } else {
        // SWING PHASE: Hoof lifts off at -halfStride, arcs smoothly forward to +halfStride
        isStance = false;
        const sw = (u - duty) / (1.0 - duty); // 0 at lift-off, 1 at touch-down
        // Cycloidal forward progression for zero acceleration jerk at liftoff/touchdown
        const forwardProgress = sw - Math.sin(sw * Math.PI * 2.0) / (Math.PI * 2.0);
        zOffset = lerp(-halfStride, halfStride, forwardProgress);

        // Asymmetric foot clearance arc: crisp lift in early-mid swing, gentle descent into heel strike
        const liftEnvelope = Math.sin(Math.pow(sw, 0.78) * Math.PI);
        const maxClearance = (isFore ? 0.24 : 0.20) * walkScale;
        yLift = Math.max(0, liftEnvelope * maxClearance);

        // Distal joint flexion during swing (wrist/fetlock fold in early-mid swing, extending before strike)
        const flexWave = Math.sin(Math.pow(sw, 0.68) * Math.PI);
        const strikeExtend = 1.0 - smoothstep(0.75, 1.0, sw);

        if (isFore) {
          carpusFlex = (0.36 * (1.0 - smoothstep(0.0, 0.25, sw)) + 0.68 * flexWave) * strikeExtend * walkScale;
        }
        pasternPitch = (0.42 * (1.0 - smoothstep(0.0, 0.22, sw)) + 0.52 * flexWave) * strikeExtend * walkScale;
        hoofPitch = (0.50 * (1.0 - smoothstep(0.0, 0.25, sw)) + 0.62 * flexWave) * strikeExtend * walkScale;
        scapLift = -0.018 * Math.sin(sw * Math.PI) * walkScale;
      }

      return {
        zOffset,
        yLift,
        stanceLoad,
        isStance,
        carpusFlex,
        pasternPitch,
        hoofPitch,
        scapLift
      };
    }

    // Solve and apply exact joint angles for one Forelimb ('L' or 'R')
    solveForelimb(side, u, thoraxWorldY, thoraxWorldZ, thoraxPitch, walkScale) {
      const bm = this.boneMap;
      const fb = this.foreBind;
      const traj = this.evaluateLimbTrajectory(u, true, walkScale);

      const bScapula = bm[`scapula_${side}`];
      const bShoulder = bm[`shoulder_${side}`];
      const bElbow = bm[`elbow_${side}`];
      const bCarpus = bm[`carpus_${side}`];
      const bFetlock = bm[`fetlock_${side}`];
      const bPastern = bm[`pastern_${side}`];

      // 1. Scapular slide & gentle swing rotation
      bScapula.position.y = fb.scapula.y + traj.scapLift;
      const thetaScapula = thoraxPitch - 0.14 * (traj.zOffset / (0.5 * this.strideLength || 1));

      // Compute Shoulder joint world (Y, Z)
      const scapPosY = thoraxWorldY + bScapula.position.y * Math.cos(thoraxPitch) - bScapula.position.z * Math.sin(thoraxPitch);
      const scapPosZ = thoraxWorldZ + bScapula.position.y * Math.sin(thoraxPitch) + bScapula.position.z * Math.cos(thoraxPitch);
      const shOffset = rotYZ(fb.shoulder.y, fb.shoulder.z, thetaScapula);
      const shY = scapPosY + shOffset.y;
      const shZ = scapPosZ + shOffset.z;

      // 2. Target Hoof world (Y, Z)
      const targetHoofY = traj.yLift;
      const targetHoofZ = fb.restHoofZ + traj.zOffset;

      // 3. Subtract rotated Hoof and Pastern segments to get exact required Fetlock world (Y, Z)
      const thetaHoofWorld = traj.hoofPitch;
      const thetaFetlockWorld = traj.pasternPitch;
      const vHoof = rotYZ(fb.hoof.y, fb.hoof.z, thetaHoofWorld);
      const vPastern = rotYZ(fb.pastern.y, fb.pastern.z, thetaFetlockWorld);

      const fetY = targetHoofY - vHoof.y - vPastern.y;
      const fetZ = targetHoofZ - vHoof.z - vPastern.z;

      // 4. Composite lower limb vector (Elbow -> Carpus -> Fetlock) given known carpus flexion phi = traj.carpusFlex
      const carpusBent = rotYZ(fb.fetlock.y, fb.fetlock.z, traj.carpusFlex);
      const compBindY = fb.carpus.y + carpusBent.y;
      const compBindZ = fb.carpus.z + carpusBent.z;
      const L1 = fb.elbow.len;
      const L2 = Math.hypot(compBindY, compBindZ);

      // 5. Solve 2-circle IK for Elbow position (signZ = -1 so olecranon/elbow always points BACKWARD -Z!)
      const elbowWorld = solveSagittalTwoBonePoint(shY, shZ, fetY, fetZ, L1, L2, -1);

      // 6. Extract world angles for Shoulder (Humerus), Elbow (Radius), and Carpus (Metacarpus)
      const thetaShoulderWorld = angleBetweenYZ(fb.elbow.y, fb.elbow.z, elbowWorld.y - shY, elbowWorld.z - shZ);
      const thetaElbowWorld = angleBetweenYZ(compBindY, compBindZ, fetY - elbowWorld.y, fetZ - elbowWorld.z);
      const thetaCarpusWorld = thetaElbowWorld + traj.carpusFlex;

      // 7. Convert world sagittal angles into hierarchical local bone rotations
      bScapula.rotation.set(thetaScapula - thoraxPitch, 0, 0);
      bShoulder.rotation.set(thetaShoulderWorld - thetaScapula, 0, 0);
      bElbow.rotation.set(thetaElbowWorld - thetaShoulderWorld, 0, 0);
      bCarpus.rotation.set(thetaCarpusWorld - thetaElbowWorld, 0, 0);
      bFetlock.rotation.set(thetaFetlockWorld - thetaCarpusWorld, 0, 0);
      bPastern.rotation.set(thetaHoofWorld - thetaFetlockWorld, 0, 0);

      return traj;
    }

    // Solve and apply exact joint angles for one Hindlimb ('L' or 'R')
    solveHindlimb(side, u, pelvisWorldY, pelvisWorldZ, pelvisPitch, walkScale) {
      const bm = this.boneMap;
      const hb = this.hindBind;
      const traj = this.evaluateLimbTrajectory(u, false, walkScale);

      const bHip = bm[`hip_${side}`];
      const bStifle = bm[`stifle_${side}`];
      const bHock = bm[`hock_${side}`];
      const bFetlock = bm[`hind_fetlock_${side}`];
      const bPastern = bm[`hind_pastern_${side}`];

      // 1. Hip joint world (Y, Z)
      const hipOffset = rotYZ(hb.hip.y, hb.hip.z, pelvisPitch);
      const hipY = pelvisWorldY + hipOffset.y;
      const hipZ = pelvisWorldZ + hipOffset.z;

      // 2. Target Hind Hoof world (Y, Z)
      const targetHoofY = traj.yLift;
      const targetHoofZ = hb.restHoofZ + traj.zOffset;

      // 3. Subtract rotated Hind Hoof and Hind Pastern to get exact required Hind Fetlock world (Y, Z)
      const thetaHoofWorld = traj.hoofPitch;
      const thetaFetlockWorld = traj.pasternPitch;
      const vHoof = rotYZ(hb.hoof.y, hb.hoof.z, thetaHoofWorld);
      const vPastern = rotYZ(hb.pastern.y, hb.pastern.z, thetaFetlockWorld);

      const fetY = targetHoofY - vHoof.y - vPastern.y;
      const fetZ = targetHoofZ - vHoof.z - vPastern.z;

      // 4. Metatarsus (Hind Cannon bone: Hock -> Hind Fetlock) angle:
      // Tilts smoothly with the stride (negative theta = leaning forward at touchdown, positive = pushing back at toe-off)
      // plus gentle hock flexion during mid-swing
      const strideRatio = traj.zOffset / (0.5 * this.strideLength || 1);
      const swingFlex = traj.isStance ? 0.0 : Math.sin(((u - this.dutyFactor) / (1.0 - this.dutyFactor)) * Math.PI) * 0.26 * walkScale;
      const thetaHockWorld = -0.34 * strideRatio * walkScale + swingFlex;

      const vCannon = rotYZ(hb.fetlock.y, hb.fetlock.z, thetaHockWorld);
      const hockY = fetY - vCannon.y;
      const hockZ = fetZ - vCannon.z;

      // 5. Solve 2-circle IK between Hip and Hock for Stifle position (signZ = +1 so Stifle/Patella always points FORWARD +Z!)
      const L1 = hb.stifle.len; // Femur length
      const L2 = hb.hock.len;   // Tibia length
      const stifleWorld = solveSagittalTwoBonePoint(hipY, hipZ, hockY, hockZ, L1, L2, +1);

      // 6. Extract world angles for Hip (Femur) and Stifle (Tibia)
      const thetaHipWorld = angleBetweenYZ(hb.stifle.y, hb.stifle.z, stifleWorld.y - hipY, stifleWorld.z - hipZ);
      const thetaStifleWorld = angleBetweenYZ(hb.hock.y, hb.hock.z, hockY - stifleWorld.y, hockZ - stifleWorld.z);

      // 7. Convert world sagittal angles into hierarchical local bone rotations
      bHip.rotation.set(thetaHipWorld - pelvisPitch, 0, 0);
      bStifle.rotation.set(thetaStifleWorld - thetaHipWorld, 0, 0);
      bHock.rotation.set(thetaHockWorld - thetaStifleWorld, 0, 0);
      bFetlock.rotation.set(thetaFetlockWorld - thetaHockWorld, 0, 0);
      bPastern.rotation.set(thetaHoofWorld - thetaFetlockWorld, 0, 0);

      return traj;
    }

    update(dt) {
      const clampedDt = Math.min(dt, 0.1);
      this.elapsedTime += clampedDt;

      // Smoothly update browsing state if active
      if (this.browseTimer > 0) {
        this.browseTimer -= clampedDt;
        if (this.browseTimer <= 0) {
          this.browseTargetWeight = 0.0;
        }
      }
      this.browseWeight = lerp(this.browseWeight, this.browseTargetWeight, Math.min(1, clampedDt * 2.8));

      // Effective walking speed (slows down smoothly if reaching up to browse leaves)
      const activeSpeed = this.speedMultiplier * (1.0 - 0.75 * this.browseWeight);
      const walkScale = clamp(activeSpeed, 0.0, 1.45);
      const cycleRate = this.cycleFrequency * activeSpeed;

      this.gaitPhase = (this.gaitPhase + clampedDt * cycleRate) % 1.0;
      // Exact ground speed during stance so planted hooves have 0.000m slip against the ground and hoofprints
      const linearSpeed = (this.strideLength * walkScale * cycleRate) / this.dutyFactor;
      this.distanceWalked += linearSpeed * clampedDt;

      const phase = this.gaitPhase;
      const twoPi = Math.PI * 2.0;

      // 1. Axial Trunk Bob, Lateral Pacing Sway, Pelvic Tilt & Thoracic Roll
      // In a pacing gait:
      // - Left pair (LH=0.0, LF=0.14) mid-stance is around phase ~ 0.38
      // - Right pair (RH=0.50, RF=0.64) mid-stance is around phase ~ 0.88
      // Center of mass bobs at 2x stride frequency (2 * twoPi * phase)
      const doublePhase = twoPi * 2.0 * (phase - 0.12);
      const singlePhase = twoPi * (phase - 0.10);

      const pelvisBone = this.boneMap['pelvis'];
      const lumbarBone = this.boneMap['spine_lumbar'];
      const thoraxBone = this.boneMap['spine_thorax'];

      const verticalBob = Math.cos(doublePhase) * 0.034 * walkScale;
      const lateralSway = Math.sin(singlePhase) * 0.032 * walkScale; // Shifts subtly toward supporting lateral pair
      const pelvisRoll = Math.sin(singlePhase) * 0.036 * walkScale;
      const pelvisYaw = Math.cos(singlePhase) * 0.025 * walkScale;
      const pelvisPitch = Math.sin(doublePhase) * 0.016 * walkScale;

      pelvisBone.position.set(
        lateralSway,
        pelvisBone.userData.restPosition.y + verticalBob,
        pelvisBone.userData.restPosition.z
      );
      pelvisBone.rotation.set(pelvisPitch, pelvisYaw, pelvisRoll);

      // Subtle breathing expansion & counter-spine flexion in lumbar & thorax
      const breathWave = Math.sin(this.elapsedTime * 1.9);
      const lumbarPitch = -pelvisPitch * 0.45 + 0.008 * breathWave;
      const lumbarRoll = -pelvisRoll * 0.55;
      const lumbarYaw = -pelvisYaw * 0.50;
      lumbarBone.rotation.set(lumbarPitch, lumbarYaw, lumbarRoll);

      const thoraxPitch = -pelvisPitch * 0.35 + Math.cos(doublePhase + 0.5) * 0.018 * walkScale;
      const thoraxRoll = -pelvisRoll * 0.75;
      const thoraxYaw = -pelvisYaw * 0.45;
      thoraxBone.rotation.set(thoraxPitch, thoraxYaw, thoraxRoll);

      // Compute current world sagittal (Y, Z) of Pelvis and Thorax for exact limb IK
      const pWorldY = pelvisBone.position.y;
      const pWorldZ = pelvisBone.position.z;
      const lOff = rotYZ(lumbarBone.userData.restPosition.y, lumbarBone.userData.restPosition.z, pelvisPitch);
      const tTotalPitch = pelvisPitch + lumbarPitch + thoraxPitch;
      const tOff = rotYZ(thoraxBone.userData.restPosition.y, thoraxBone.userData.restPosition.z, pelvisPitch + lumbarPitch);
      const tWorldY = pWorldY + lOff.y + tOff.y;
      const tWorldZ = pWorldZ + lOff.z + tOff.z;

      // 2. Solve all 4 limbs using Exact Closed-Form Hybrid IK
      const uLH = (phase - this.phases.LH + 1.0) % 1.0;
      const uLF = (phase - this.phases.LF + 1.0) % 1.0;
      const uRH = (phase - this.phases.RH + 1.0) % 1.0;
      const uRF = (phase - this.phases.RF + 1.0) % 1.0;

      const trajLH = this.solveHindlimb('L', uLH, pWorldY - pelvisRoll * 0.21, pWorldZ, pelvisPitch, walkScale);
      const trajRH = this.solveHindlimb('R', uRH, pWorldY + pelvisRoll * 0.21, pWorldZ, pelvisPitch, walkScale);
      const trajLF = this.solveForelimb('L', uLF, tWorldY - (pelvisRoll + lumbarRoll + thoraxRoll) * 0.22, tWorldZ, tTotalPitch, walkScale);
      const trajRF = this.solveForelimb('R', uRF, tWorldY + (pelvisRoll + lumbarRoll + thoraxRoll) * 0.22, tWorldZ, tTotalPitch, walkScale);

      // Detect hoof touchdown events for savannah dust puffs & hoofprints
      const currentStance = {
        LF: trajLF.isStance,
        RF: trajRF.isStance,
        LH: trajLH.isStance,
        RH: trajRH.isStance
      };
      if (this.onHoofStrike && walkScale > 0.05) {
        for (const key of ['LF', 'RF', 'LH', 'RH']) {
          if (currentStance[key] && !this.prevStance[key]) {
            const boneName = key === 'LF' ? 'hoof_L' : (key === 'RF' ? 'hoof_R' : (key === 'LH' ? 'hind_hoof_L' : 'hind_hoof_R'));
            this.onHoofStrike(key, this.boneMap[boneName]);
          }
        }
      }
      this.prevStance = currentStance;

      // 3. Dynamic Cervical Neck Counter-Pendulum (Traveling Wave C7 -> C1 at 2x stride frequency)
      // As each lateral pair swings forward, the neck arcs backward/upward to counterbalance;
      // as hooves strike and pull over stance, the neck surges smoothly forward/downward!
      let cumulativeNeckPitch = 0;
      let cumulativeNeckYaw = 0;
      let cumulativeNeckRoll = 0;

      for (let i = 0; i < 7; i++) {
        const neckBone = this.boneMap[`neck_${i}`];
        const segNorm = i / 6.0;
        // Phase delay traveling up the cervical spine (whip-wave from base to poll)
        const waveLag = i * 0.22;
        const nodWave = Math.sin(doublePhase - waveLag);
        const lateralNeckWave = Math.cos(singlePhase - i * 0.16);

        // Per-vertebra pitch & lateral sway
        const walkPitch = nodWave * (0.022 + 0.008 * segNorm) * walkScale;
        const breathPitch = Math.sin(this.elapsedTime * 1.9 - i * 0.2) * 0.004;
        // Browsing high acacia foliage raises and stretches the upper neck
        const browsePitch = this.browseWeight * (-0.035 + 0.015 * segNorm);

        const dPitch = walkPitch + breathPitch + browsePitch;
        const dYaw = lateralNeckWave * 0.012 * walkScale + Math.sin(this.elapsedTime * 0.55) * 0.018 * (1.0 - 0.5 * this.browseWeight);
        const dRoll = -lateralNeckWave * 0.009 * walkScale;

        neckBone.rotation.set(dPitch, dYaw, dRoll);
        cumulativeNeckPitch += dPitch;
        cumulativeNeckYaw += dYaw;
        cumulativeNeckRoll += dRoll;
      }

      // 4. Head Vestibulo-Ocular Stabilization, Browsing Reach, Jaw & Prehensile Tongue
      const headBone = this.boneMap['head'];
      // Head counter-rotates against ~68% of the cumulative neck pitch with a slight phase lag so gaze stays level!
      const headLagNod = Math.sin(doublePhase - 1.75) * 0.065 * walkScale;
      const headBrowsePitch = -0.46 * this.browseWeight + Math.sin(this.elapsedTime * 4.2) * 0.05 * this.browseWeight;
      const headLookYaw = Math.sin(this.elapsedTime * 0.42) * 0.08 * (1.0 - this.browseWeight);

      headBone.rotation.set(
        -cumulativeNeckPitch * 0.72 + headLagNod + headBrowsePitch,
        -cumulativeNeckYaw * 0.35 + headLookYaw,
        -cumulativeNeckRoll * 0.65
      );

      // Jaw & Prehensile Tongue motion (subtle rumination chew + active browsing leaf strip)
      const jawBone = this.boneMap['jaw'];
      const chewWave = Math.max(0, Math.sin(this.elapsedTime * 3.6)) * 0.025;
      const browseJawOpen = this.browseWeight * (0.16 + 0.08 * Math.sin(this.elapsedTime * 5.2));
      jawBone.rotation.x = chewWave + browseJawOpen;
      jawBone.rotation.y = Math.cos(this.elapsedTime * 3.6) * (0.015 + 0.03 * this.browseWeight);

      if (this.cranialRefs && this.cranialRefs.tongue) {
        const tongue = this.cranialRefs.tongue;
        tongue.visible = this.browseWeight > 0.05;
        tongue.position.z = 0.28 + this.browseWeight * (0.16 + 0.05 * Math.sin(this.elapsedTime * 5.2));
        tongue.position.y = -0.09 - this.browseWeight * 0.04;
        tongue.rotation.x = 0.28 - this.browseWeight * 0.18 * Math.cos(this.elapsedTime * 5.2);
      }

      // 5. Natural Periodic Eyelid Blinking
      this.blinkClock += clampedDt;
      let blinkFactor = 0.0;
      if (this.blinkClock >= this.blinkTimer) {
        const bt = (this.blinkClock - this.blinkTimer) / this.blinkDuration;
        if (bt <= 1.0) {
          blinkFactor = Math.sin(bt * Math.PI);
        } else {
          this.blinkClock = 0.0;
          this.blinkTimer = 2.8 + ((Math.sin(this.elapsedTime * 17.3) * 0.5 + 0.5) * 3.4);
        }
      }
      if (this.cranialRefs && this.cranialRefs.eyelids) {
        for (const lid of this.cranialRefs.eyelids) {
          lid.rotation.x = lerp(-0.78, 0.28, blinkFactor);
        }
      }

      // 6. Independent Asynchronous Ear Radar Swivels & Flicks
      const earL = this.boneMap['ear_L'];
      const earR = this.boneMap['ear_R'];
      const flickL = Math.pow(Math.max(0, Math.sin(this.elapsedTime * 1.7 + 0.4)), 12.0) * 0.28;
      const flickR = Math.pow(Math.max(0, Math.sin(this.elapsedTime * 2.1 + 2.9)), 12.0) * 0.28;
      earL.rotation.set(
        Math.sin(this.elapsedTime * 0.9) * 0.08,
        Math.cos(this.elapsedTime * 0.7) * 0.14 - flickL,
        Math.sin(doublePhase - 0.8) * 0.05 * walkScale
      );
      earR.rotation.set(
        Math.cos(this.elapsedTime * 0.85) * 0.08,
        -Math.sin(this.elapsedTime * 0.65) * 0.14 + flickR,
        -Math.sin(doublePhase - 0.8) * 0.05 * walkScale
      );

      // 7. Multi-Segment Articulated Tail Pendulum & Fly-Swat Swish
      const swatBurst = Math.pow(Math.max(0, Math.sin(this.elapsedTime * 0.62)), 8.0);
      for (let i = 0; i < 5; i++) {
        const tailBone = this.boneMap[`tail_${i}`];
        const tLag = i * 0.48;
        const pendulumZ = Math.sin(singlePhase - tLag) * (0.06 + i * 0.035) * (0.35 + 0.65 * walkScale);
        const swatZ = Math.sin(this.elapsedTime * 6.5 - i * 0.55) * swatBurst * (0.08 + i * 0.06);
        const pendulumX = 0.04 + Math.cos(doublePhase - tLag) * (0.025 + i * 0.015) * walkScale;
        tailBone.rotation.set(pendulumX, 0, pendulumZ + swatZ);
      }

      this.rig.root.updateMatrixWorld(true);

      return {
        linearSpeed,
        distanceWalked: this.distanceWalked,
        gaitPhase: this.gaitPhase,
        stance: currentStance
      };
    }
  }

  global.GiraffeGait = {
    GiraffeGaitController
  };
})(window);
