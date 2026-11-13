(function () {
  'use strict';

  const GS = (window.GiraffeSim = window.GiraffeSim || {});
  const M = GS.Math;

  /**
   * Biomechanical Lateral-Sequence Walking Controller for Giraffa camelopardalis
   */
  class GiraffeGaitController {
    constructor(giraffe, options) {
      this.giraffe = giraffe;
      const opts = options || {};
      this.groundHeightFn = opts.groundHeightFn || function () { return 0; };
      this.onHoofStrike = opts.onHoofStrike || null;

      this.skelInfo = giraffe.skelInfo;
      this.boneMap = this.skelInfo.boneMap;
      this.bindPos = this.skelInfo.bindPosMap;

      // Exact bind-pose bone lengths (meters)
      this.foreLengths = {
        L1: this.bindPos.shoulderL.distanceTo(this.bindPos.elbowL),
        L2: this.bindPos.elbowL.distanceTo(this.bindPos.carpusL),
        L3: this.bindPos.carpusL.distanceTo(this.bindPos.foreFetlockL),
        L4: this.bindPos.foreFetlockL.distanceTo(this.bindPos.foreHoofL)
      };
      this.hindLengths = {
        L1: this.bindPos.hipL.distanceTo(this.bindPos.stifleL),
        L2: this.bindPos.stifleL.distanceTo(this.bindPos.hockL),
        L3: this.bindPos.hockL.distanceTo(this.bindPos.hindFetlockL),
        L4: this.bindPos.hindFetlockL.distanceTo(this.bindPos.hindHoofL)
      };

      // Cache unit local rest vectors for every parent->child bone pair
      this.restLocalDirs = {};
      const bindNames = Object.keys(this.bindPos);
      for (let i = 0; i < bindNames.length; i++) {
        const name = bindNames[i];
        this.restLocalDirs[name] = this.boneMap[name].position.clone().normalize();
      }

      // Gait parameters (Basu et al. 2019 / Dagg 1962 wild giraffe walk)
      this.strideLength = 1.92;   // meters per full 4-beat lateral cycle (clean natural reach, zero hyperextension)
      this.basePeriod = 1.78;     // seconds per stride at 1.0x natural walk (~1.08 m/s stately walk)
      this.dutyFactor = 0.64;     // 64% stance, 36% swing

      // Lateral sequence touchdown phases: LH (0.00) -> LF (0.15) -> RH (0.50) -> RF (0.65)
      this.limbDefs = [
        { key: 'hindL', isFore: false, isLeft: true,  phaseOffset: 0.00, neutralX:  0.175, neutralZ: -0.545 },
        { key: 'foreL', isFore: true,  isLeft: true,  phaseOffset: 0.15, neutralX:  0.185, neutralZ:  0.585 },
        { key: 'hindR', isFore: false, isLeft: false, phaseOffset: 0.50, neutralX: -0.175, neutralZ: -0.545 },
        { key: 'foreR', isFore: true,  isLeft: false, phaseOffset: 0.65, neutralX: -0.185, neutralZ:  0.585 }
      ];

      this.speedScale = 1.0;
      this.paused = false;
      this.phase = 0.08; // Start mid-stride in an expressive, balanced pose
      this.simTime = 0.0;

      // World path state
      this.worldPos = new THREE.Vector3(0, 0, 0);
      this.worldYaw = 0.0;

      // Track previous stance state for triggering hoofprint & dust puff on touchdown!
      this.wasInStance = { hindL: true, foreL: true, hindR: false, foreR: true };
      this.plantedWorld = {
        hindL: null,
        foreL: null,
        hindR: null,
        foreR: null
      };

      // Secondary dynamic springs (tail chain, ears, head gaze, blink)
      this.tailSpringsX = [
        new M.SpringDamper(0, 42, 7.5),
        new M.SpringDamper(0, 36, 6.8),
        new M.SpringDamper(0, 30, 6.0),
        new M.SpringDamper(0, 25, 5.2),
        new M.SpringDamper(0, 20, 4.5)
      ];
      this.tailSpringsZ = [
        new M.SpringDamper(0, 38, 7.5),
        new M.SpringDamper(0, 32, 6.8),
        new M.SpringDamper(0, 26, 6.0),
        new M.SpringDamper(0, 22, 5.2),
        new M.SpringDamper(0, 18, 4.5)
      ];
      this.earSpringL = new M.SpringDamper(0, 65, 9.0);
      this.earSpringR = new M.SpringDamper(0, 65, 9.0);
      this.gazeYawSpring = new M.SpringDamper(0, 6.5, 4.8);
      this.gazePitchSpring = new M.SpringDamper(0, 8.0, 5.2);

      this.blinkTimer = 2.8;
      this.blinkProgress = -1;
      this.tailSwishTimer = 4.2;

      // Reusable scratch math objects (zero GC churn per frame)
      this._vRoot = new THREE.Vector3();
      this._vJ1 = new THREE.Vector3();
      this._vJ2 = new THREE.Vector3();
      this._vFet = new THREE.Vector3();
      this._vFetSolved = new THREE.Vector3();
      this._vHoof = new THREE.Vector3();
      this._pole1 = new THREE.Vector3();
      this._pole2 = new THREE.Vector3();
      this._qParent = new THREE.Quaternion();
      this._qParentInv = new THREE.Quaternion();
      this._qLocal = new THREE.Quaternion();
      this._dirWorld = new THREE.Vector3();
      this._dirLocal = new THREE.Vector3();
      this._euler = new THREE.Euler(0, 0, 0, 'YXZ');

      // Diagnostic snapshot for IK / foot-contact verification
      this.debugTargets = {};
    }

    // Gentle meandering savannah path X(z) so walk feels natural rather than a laser-straight treadmill
    evalTrailX(z) {
      return Math.sin(z * 0.022) * 1.65 + Math.sin(z * 0.009 + 1.1) * 1.15;
    }

    evalTrailYaw(z) {
      const dxdz = 0.022 * 1.65 * Math.cos(z * 0.022) + 0.009 * 1.15 * Math.cos(z * 0.009 + 1.1);
      return Math.atan2(dxdz, 1.0);
    }

    setPhaseDirect(targetPhase, advanceWorldZ) {
      this.phase = ((targetPhase % 1) + 1) % 1;
      if (advanceWorldZ !== undefined) {
        this.worldPos.z = advanceWorldZ;
        this.worldPos.x = this.evalTrailX(this.worldPos.z);
        this.worldYaw = this.evalTrailYaw(this.worldPos.z);
      }
      // Reset planted locks so scrubbed pose evaluates deterministically
      this.plantedWorld.hindL = null;
      this.plantedWorld.foreL = null;
      this.plantedWorld.hindR = null;
      this.plantedWorld.foreR = null;
      this.applyPose(0.016, true);
    }

    update(dt) {
      const clampedDt = Math.min(dt, 0.05);
      this.simTime += clampedDt;

      const activeWalk = !this.paused && this.speedScale > 0.001;
      if (activeWalk) {
        // Stride length scales gently with speed (Froude biomechanics: faster walk = slightly longer & quicker stride)
        const effStrideLen = this.strideLength * (0.82 + 0.18 * this.speedScale);
        const effPeriod = this.basePeriod / Math.max(0.15, Math.pow(this.speedScale, 0.78));
        const dPhase = clampedDt / effPeriod;
        this.phase = (this.phase + dPhase) % 1.0;

        const dzForward = dPhase * effStrideLen;
        const nextZ = this.worldPos.z + dzForward * Math.cos(this.worldYaw);
        this.worldPos.z = nextZ;
        this.worldPos.x = this.evalTrailX(this.worldPos.z);
        this.worldYaw = this.evalTrailYaw(this.worldPos.z);
      }

      this.applyPose(clampedDt, !activeWalk);
    }

    applyPose(dt, deterministicMode) {
      const phi = this.phase;
      const twoPi = Math.PI * 2;
      const walkAmp = this.paused ? 1.0 : M.clamp(this.speedScale, 0.0, 1.35);
      const effStrideLen = this.strideLength * (0.82 + 0.18 * (this.paused ? 1.0 : Math.max(0.2, this.speedScale)));
      const stanceSpanZ = this.dutyFactor * effStrideLen; // exact distance body travels during stance!

      // Place giraffe root on terrain at current world position
      const baseGroundY = this.groundHeightFn(this.worldPos.x, this.worldPos.z);
      this.worldPos.y = baseGroundY;
      this.giraffe.group.position.copy(this.worldPos);
      this.giraffe.group.rotation.set(0, this.worldYaw, 0);

      // ------------------------------------------------------------------
      // 1. Trunk, Pelvis & Spine 6-DOF Oscillation
      // ------------------------------------------------------------------
      // Left couplet mid-support is around phi ~ 0.39; Right couplet mid-support is around phi ~ 0.89.
      // Weight shifts smoothly toward supporting lateral side (+X left around 0.39, -X right around 0.89)
      const latPhase = (phi - 0.39) * twoPi;
      const lateralSwayX = Math.cos(latPhase) * 0.028 * walkAmp;
      // Double-peaked vertical vault over ungulate stance limbs + natural walking knee/elbow flexion drop (-4.8 cm)
      const walkHipSink = -0.048 * walkAmp;
      const vertVaultY = walkHipSink + Math.cos(latPhase * 2.0) * 0.020 * walkAmp;

      // Subtle breathing expansion even when standing idle
      const breath = Math.sin(this.simTime * 1.45) * 0.006;

      const pelvis = this.boneMap.pelvis;
      const bindPelvis = this.bindPos.pelvis;
      pelvis.position.set(
        bindPelvis.x + lateralSwayX,
        bindPelvis.y + vertVaultY + breath * 0.4,
        bindPelvis.z
      );

      // Pelvic hip-drop roll (drops slightly toward swinging hindlimb), subtle yaw & pitch
      const pelvicRollZ = -Math.sin((phi - 0.08) * twoPi) * 0.036 * walkAmp;
      const pelvicYawY = Math.cos(phi * twoPi) * 0.038 * walkAmp;
      const pelvicPitchX = Math.sin(latPhase * 2.0) * 0.016 * walkAmp;
      this._euler.set(pelvicPitchX, pelvicYawY, pelvicRollZ, 'YXZ');
      pelvis.quaternion.setFromEuler(this._euler);

      // Counter-rotate thoracic spine slightly so chest stays poised & athletic
      const spine1 = this.boneMap.spine1;
      const spine2 = this.boneMap.spine2;
      const chest = this.boneMap.chest;

      this._euler.set(0.006 * walkAmp + breath * 0.5, -pelvicYawY * 0.38, -pelvicRollZ * 0.35, 'YXZ');
      spine1.quaternion.setFromEuler(this._euler);

      this._euler.set(-0.008 * walkAmp - breath * 0.4, -pelvicYawY * 0.38, -pelvicRollZ * 0.35, 'YXZ');
      spine2.quaternion.setFromEuler(this._euler);

      const chestRollZ = Math.sin((phi - 0.22) * twoPi) * 0.022 * walkAmp;
      this._euler.set(
        Math.cos(latPhase * 2.0 + 0.5) * 0.014 * walkAmp,
        -pelvicYawY * 0.25,
        chestRollZ,
        'YXZ'
      );
      chest.quaternion.setFromEuler(this._euler);

      // ------------------------------------------------------------------
      // 2. Iconic 2x-Frequency Cervical Neck Pendulum Wave + Stabilized Head
      // ------------------------------------------------------------------
      // Real giraffes rock their neck forward/down twice per stride (in sync with each lateral couplet's swing/touchdown)
      // to shift center of mass and smooth mechanical energy transfer!
      const neckBones = ['neck0', 'neck1', 'neck2', 'neck3', 'neck4', 'neck5'];
      let accumulatedNeckPitch = 0;
      let accumulatedNeckYaw = 0;
      let accumulatedNeckRoll = 0;

      // Subtle curious wildlife gaze (slowly scanning savannah left/right)
      const targetGazeYaw =
        deterministicMode
          ? 0
          : Math.sin(this.simTime * 0.37) * 0.14 + Math.sin(this.simTime * 0.83 + 1.7) * 0.06;
      const targetGazePitch =
        deterministicMode
          ? 0
          : Math.sin(this.simTime * 0.51 + 0.8) * 0.045;
      const gazeYaw = this.gazeYawSpring.update(targetGazeYaw, dt);
      const gazePitch = this.gazePitchSpring.update(targetGazePitch, dt);

      for (let n = 0; n < neckBones.length; n++) {
        const nb = this.boneMap[neckBones[n]];
        const uNeck = n / (neckBones.length - 1);
        // Traveling wave lag up C7 -> C1 creates fluid, organic whip-free pendulum!
        const wavePhase = latPhase * 2.0 - 0.55 - uNeck * 0.48;
        const segPitch =
          (Math.sin(wavePhase) * (0.019 - 0.004 * uNeck) * walkAmp) +
          gazePitch * 0.12 +
          Math.sin(this.simTime * 1.2 + uNeck) * 0.0025;
        // Subtle 1x lateral neck counter-sway
        const segRoll = -Math.cos(latPhase - uNeck * 0.35) * 0.010 * walkAmp;
        const segYaw = gazeYaw * (0.08 + 0.09 * uNeck);

        this._euler.set(segPitch, segYaw, segRoll, 'YXZ');
        nb.quaternion.setFromEuler(this._euler);

        accumulatedNeckPitch += segPitch;
        accumulatedNeckYaw += segYaw;
        accumulatedNeckRoll += segRoll;
      }

      // Vestibulo-ocular head stabilization: head counter-pitches ~68% of neck wave so gaze glides smoothly!
      const head = this.boneMap.head;
      const headPitch = -accumulatedNeckPitch * 0.68 + gazePitch * 0.35;
      const headYaw = gazeYaw * 0.32;
      const headRoll = -accumulatedNeckRoll * 0.55;
      this._euler.set(headPitch, headYaw, headRoll, 'YXZ');
      head.quaternion.setFromEuler(this._euler);

      // Subtle jaw chewing / breathing motion
      const jaw = this.boneMap.jaw;
      const chew = deterministicMode ? 0 : Math.max(0, Math.sin(this.simTime * 2.6)) * 0.025 * (0.5 + 0.5 * Math.sin(this.simTime * 0.31));
      this._euler.set(chew, Math.sin(this.simTime * 2.6) * chew * 0.25, 0, 'YXZ');
      jaw.quaternion.setFromEuler(this._euler);

      // Independent alert ear flicks
      if (!deterministicMode) {
        const flickL = Math.pow(Math.max(0, Math.sin(this.simTime * 1.9 + 0.3)), 18) * 0.38;
        const flickR = Math.pow(Math.max(0, Math.sin(this.simTime * 2.3 + 2.4)), 22) * -0.36;
        const eL = this.earSpringL.update(Math.sin(this.simTime * 0.6) * 0.08 + flickL, dt);
        const eR = this.earSpringR.update(Math.cos(this.simTime * 0.55) * 0.08 + flickR, dt);
        this.boneMap.earL.rotation.set(0, eL, eL * 0.35);
        this.boneMap.earR.rotation.set(0, eR, -eR * 0.35);

        // Periodic natural ungulate blinking
        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0 && this.blinkProgress < 0) {
          this.blinkProgress = 0;
          this.blinkTimer = 3.6 + ((Math.sin(this.simTime * 7.13) * 0.5 + 0.5) * 4.2);
        }
        let lidAngle = -0.34;
        if (this.blinkProgress >= 0) {
          this.blinkProgress += dt / 0.21;
          if (this.blinkProgress >= 1) {
            this.blinkProgress = -1;
          } else {
            const closeAmt = Math.sin(this.blinkProgress * Math.PI);
            lidAngle = M.lerp(-0.34, 0.52, closeAmt);
          }
        }
        for (let i = 0; i < this.giraffe.upperLids.length; i++) {
          this.giraffe.upperLids[i].rotation.x = lidAngle;
        }
      }

      // ------------------------------------------------------------------
      // 3. Dynamic Caudal Tail Chain (Pendulum Sway + Periodic Fly Swish)
      // ------------------------------------------------------------------
      this.tailSwishTimer -= dt;
      let swishImpulse = 0;
      if (!deterministicMode && this.tailSwishTimer <= 0) {
        swishImpulse = (Math.sin(this.simTime * 13.7) >= 0 ? 1 : -1) * 3.4;
        this.tailSwishTimer = 4.5 + (Math.cos(this.simTime * 3.7) * 0.5 + 0.5) * 5.0;
      }

      const tailBones = ['tail0', 'tail1', 'tail2', 'tail3', 'tail4'];
      for (let tIdx = 0; tIdx < tailBones.length; tIdx++) {
        const tb = this.boneMap[tailBones[tIdx]];
        const lag = tIdx * 0.52;
        const targetZ = Math.sin(latPhase - lag) * (0.055 + tIdx * 0.025) * walkAmp;
        // Positive +X Euler pitch swings downward-hanging tail gently BACKWARD (-Z) clear of the hocks!
        const targetX = (0.042 + 0.018 * tIdx) * walkAmp + Math.cos(latPhase * 2.0 - lag) * 0.018 * walkAmp;

        const rx = deterministicMode ? targetX : this.tailSpringsX[tIdx].update(targetX, dt, 0);
        const rz = deterministicMode
          ? targetZ
          : this.tailSpringsZ[tIdx].update(targetZ, dt, tIdx >= 1 ? swishImpulse * (0.4 + 0.25 * tIdx) : 0);

        this._euler.set(rx, 0, rz, 'YXZ');
        tb.quaternion.setFromEuler(this._euler);
      }

      // Update world matrices of entire axial skeleton so shoulder/hip roots have exact world transforms!
      this.giraffe.group.updateMatrixWorld(true);

      // ------------------------------------------------------------------
      // 4. Four Limbs: Zero-Slip World Foot Targets + Coupled 3-Link Ungulate IK
      // ------------------------------------------------------------------
      const cosYaw = Math.cos(this.worldYaw);
      const sinYaw = Math.sin(this.worldYaw);

      for (let i = 0; i < this.limbDefs.length; i++) {
        const limb = this.limbDefs[i];
        const localPhase = (((phi - limb.phaseOffset) % 1.0) + 1.0) % 1.0;
        const inStance = localPhase < this.dutyFactor;

        let localFootX = limb.neutralX;
        let localFootZ;
        let liftY = 0.0;
        let fetlockDrop = 0.0;
        let breakoverAngle = 0.0;
        let swingHoofPitch = 0.0;
        let distalFlex = 0.0;

        if (inStance) {
          const u = localPhase / this.dutyFactor; // 0 = touchdown, 1 = toe-off
          // Linear backward travel in body frame at exact body velocity => 0.000mm world slip!
          localFootZ = limb.neutralZ + (0.5 - u) * stanceSpanZ;

          // Suspensory apparatus passive elastic fetlock sink under mid-stance load
          const loadCurve = Math.sin(Math.pow(u, 0.85) * Math.PI);
          fetlockDrop = loadCurve * 0.030 * (0.35 + 0.65 * walkAmp);

          // Late-stance heel-off / toe breakover (u: 0.80 -> 1.00)
          if (u > 0.80) {
            const bu = M.smootherstep(0.80, 1.0, u);
            breakoverAngle = bu * 0.44 * walkAmp; // ~25 deg forward pivot around toe tip
          }

          // Distal joint angle in stance:
          // Forelimb carpus is locked straight (~0.015 rad); Hindlimb hock holds athletic ~0.42 rad extending to ~0.24 rad at push-off!
          if (limb.isFore) {
            distalFlex = 0.018;
          } else {
            distalFlex = M.lerp(0.44, 0.25, M.smoothstep(0.35, 0.98, u));
          }
        } else {
          const s = (localPhase - this.dutyFactor) / (1.0 - this.dutyFactor); // 0 = liftoff, 1 = touchdown

          // Smooth S-curve forward protraction from -0.5*stanceSpanZ to +0.5*stanceSpanZ
          const protract = M.smootherstep(0.0, 1.0, s);
          localFootZ = limb.neutralZ + (-0.5 + protract) * stanceSpanZ;

          // Slight lateral circumduction clearance (~1.2 cm) in mid-swing so ipsilateral hooves never brush
          const sideSign = limb.isLeft ? 1 : -1;
          localFootX += sideSign * Math.sin(s * Math.PI) * 0.012;

          // Asymmetric ungulate swing trajectory: brisk lift in early swing (peak at s ~ 0.38), soft skimming landing!
          const maxClearance = (limb.isFore ? 0.23 : 0.20) * Math.max(0.25, walkAmp);
          const liftBell = Math.sin(Math.pow(s, 0.74) * Math.PI);
          liftY = maxClearance * Math.pow(liftBell, 1.15);

          // Carpus / Hock athletic flexion bell curve peaking in early-to-mid swing
          if (limb.isFore) {
            const flexBell = Math.sin(Math.pow(s, 0.68) * Math.PI);
            distalFlex = 0.018 + 0.82 * Math.pow(flexBell, 1.2) * Math.max(0.3, walkAmp);
            // Hoof curls backward/downward in early swing, extending flat before touchdown
            swingHoofPitch = Math.sin(Math.pow(s, 0.65) * Math.PI) * 0.58 * walkAmp * (1 - M.smoothstep(0.75, 0.98, s));
          } else {
            const flexBell = Math.sin(Math.pow(s, 0.72) * Math.PI);
            distalFlex = M.lerp(0.25, 0.44, s) + 0.62 * Math.pow(flexBell, 1.15) * Math.max(0.3, walkAmp);
            swingHoofPitch = Math.sin(Math.pow(s, 0.68) * Math.PI) * 0.50 * walkAmp * (1 - M.smoothstep(0.76, 0.98, s));
          }
        }

        // Convert body-frame foot coordinates to world space
        let worldFootX = this.worldPos.x + localFootX * cosYaw + localFootZ * sinYaw;
        let worldFootZ = this.worldPos.z - localFootX * sinYaw + localFootZ * cosYaw;

        // World-space plant lock during continuous walking (eliminates even curved-path micro-drift!)
        if (!deterministicMode) {
          if (inStance) {
            if (!this.wasInStance[limb.key] || !this.plantedWorld[limb.key]) {
              this.plantedWorld[limb.key] = { x: worldFootX, z: worldFootZ };
              // Emit hoof strike event for savannah dust puff + cloven hoofprint!
              if (!this.wasInStance[limb.key] && this.onHoofStrike && walkAmp > 0.15) {
                const gy = this.groundHeightFn(worldFootX, worldFootZ);
                this.onHoofStrike(limb.key, worldFootX, gy, worldFootZ, this.worldYaw);
              }
            } else {
              // Blend 92% locked world plant (releasing smoothly only if stride speed was abruptly dragged by user)
              const drift = Math.hypot(worldFootX - this.plantedWorld[limb.key].x, worldFootZ - this.plantedWorld[limb.key].z);
              if (drift < 0.35) {
                worldFootX = this.plantedWorld[limb.key].x;
                worldFootZ = this.plantedWorld[limb.key].z;
              } else {
                this.plantedWorld[limb.key].x = worldFootX;
                this.plantedWorld[limb.key].z = worldFootZ;
              }
            }
          } else {
            // Smoothly interpolate from exact liftoff world point if needed
            this.plantedWorld[limb.key] = null;
          }
          this.wasInStance[limb.key] = inStance;
        }

        const groundY = this.groundHeightFn(worldFootX, worldFootZ);

        // During late-stance breakover, hoof pivots around toe tip (+0.058m ahead of hoof bone origin), lifting hoof ankle slightly!
        const toePivotLiftY = breakoverAngle > 0 ? Math.sin(breakoverAngle) * 0.058 : 0.0;
        const toePivotFwdZ = breakoverAngle > 0 ? (1 - Math.cos(breakoverAngle)) * 0.058 : 0.0;

        this._vHoof.set(
          worldFootX + sinYaw * toePivotFwdZ,
          groundY + liftY + toePivotLiftY,
          worldFootZ + cosYaw * toePivotFwdZ
        );

        this.solveAndApplyLimbIK(
          limb,
          this._vHoof,
          localFootZ - limb.neutralZ,
          effStrideLen,
          distalFlex,
          fetlockDrop,
          breakoverAngle,
          swingHoofPitch,
          groundY
        );
      }
    }

    solveAndApplyLimbIK(
      limb,
      hoofWorldPos,
      relReachZ,
      strideLen,
      distalFlex,
      fetlockDrop,
      breakoverAngle,
      swingHoofPitch,
      groundY
    ) {
      const suffix = limb.isLeft ? 'L' : 'R';
      const fwdX = Math.sin(this.worldYaw);
      const fwdZ = Math.cos(this.worldYaw);

      if (limb.isFore) {
        // 1) Scapula glides smoothly in pitch with forelimb protraction/retraction!
        const scapBone = this.boneMap['scapula' + suffix];
        const scapPitch = -(relReachZ / Math.max(0.5, strideLen * 0.5)) * 0.16;
        this._euler.set(scapPitch, 0, 0, 'YXZ');
        scapBone.quaternion.setFromEuler(this._euler);
        scapBone.updateMatrixWorld(true);

        const shldBone = this.boneMap['shoulder' + suffix];
        const elbBone = this.boneMap['elbow' + suffix];
        const carpBone = this.boneMap['carpus' + suffix];
        const fetBone = this.boneMap['foreFetlock' + suffix];
        const hoofBone = this.boneMap['foreHoof' + suffix];

        shldBone.getWorldPosition(this._vRoot);

        // 2) Compute Fetlock world target from Hoof world position + Pastern mechanics
        // Standing pastern leans forward from fetlock to hoof (+0.272 rad).
        // During breakover & swing curl, pastern rotates clockwise (fetlock advances / curls backward into negative tilt),
        // staying smoothly aligned with the toe-down hoof pitch!
        const pasternAngle = 0.272 - breakoverAngle - swingHoofPitch * 1.15;
        const L4 = this.foreLengths.L4;
        const rawFetY = hoofWorldPos.y + Math.cos(pasternAngle) * L4 - fetlockDrop;
        const fetY = Math.max(groundY + 0.13, rawFetY);
        const dyActual = clampAbs(fetY - hoofWorldPos.y, L4 * 0.999);
        const horizMag = Math.sqrt(Math.max(0.0, L4 * L4 - dyActual * dyActual));
        // pasternAngle > 0 => fetlock is BEHIND hoof (-fwd); pasternAngle < 0 => fetlock is AHEAD of curled hoof (+fwd)
        const fetOffsetFwd = -Math.sign(pasternAngle || 1) * horizMag;

        this._vFet.set(
          hoofWorldPos.x + fwdX * fetOffsetFwd,
          fetY,
          hoofWorldPos.z + fwdZ * fetOffsetFwd
        );

        // Forelimb poles: Elbow points BACKWARD (-fwd), Carpus bends FORWARD (+fwd)!
        this._pole1.set(-fwdX, 0.08, -fwdZ).normalize();
        this._pole2.set(fwdX, 0.05, fwdZ).normalize();

        M.solveUngulateThreeLinkIK(
          this._vRoot,
          this._vFet,
          this.foreLengths.L1,
          this.foreLengths.L2,
          this.foreLengths.L3,
          distalFlex,
          this._pole1,
          this._pole2,
          this._vJ1,
          this._vJ2,
          this._vFetSolved
        );

        // 3) Aim bones sequentially down hierarchy
        this.aimBoneToWorldPoint(shldBone, 'elbow' + suffix, this._vRoot, this._vJ1);
        this.aimBoneToWorldPoint(elbBone, 'carpus' + suffix, this._vJ1, this._vJ2);
        this.aimBoneToWorldPoint(carpBone, 'foreFetlock' + suffix, this._vJ2, this._vFetSolved);
        this.aimBoneToWorldPoint(fetBone, 'foreHoof' + suffix, this._vFetSolved, hoofWorldPos);

        // 4) Orient Cloven Hoof (flat on ground in stance, tilted by breakover / swing curl)
        this.orientHoofWorld(hoofBone, breakoverAngle + swingHoofPitch, hoofWorldPos, groundY);

        this.debugTargets[limb.key] = {
          root: this._vRoot.clone(),
          j1: this._vJ1.clone(),
          j2: this._vJ2.clone(),
          fetlock: this._vFetSolved.clone(),
          hoof: hoofWorldPos.clone()
        };
      } else {
        const hipBone = this.boneMap['hip' + suffix];
        const stifBone = this.boneMap['stifle' + suffix];
        const hockBone = this.boneMap['hock' + suffix];
        const fetBone = this.boneMap['hindFetlock' + suffix];
        const hoofBone = this.boneMap['hindHoof' + suffix];

        hipBone.getWorldPosition(this._vRoot);

        const pasternAngle = 0.272 - breakoverAngle - swingHoofPitch * 1.10;
        const L4 = this.hindLengths.L4;
        const rawFetY = hoofWorldPos.y + Math.cos(pasternAngle) * L4 - fetlockDrop;
        const fetY = Math.max(groundY + 0.13, rawFetY);
        const dyActual = clampAbs(fetY - hoofWorldPos.y, L4 * 0.999);
        const horizMag = Math.sqrt(Math.max(0.0, L4 * L4 - dyActual * dyActual));
        const fetOffsetFwd = -Math.sign(pasternAngle || 1) * horizMag;

        this._vFet.set(
          hoofWorldPos.x + fwdX * fetOffsetFwd,
          fetY,
          hoofWorldPos.z + fwdZ * fetOffsetFwd
        );

        // Hindlimb poles: Stifle points FORWARD (+fwd, slightly outward so knee clears belly!), Hock points BACKWARD (-fwd)!
        const outX = cosSign(limb.isLeft) * Math.cos(this.worldYaw);
        const outZ = -cosSign(limb.isLeft) * Math.sin(this.worldYaw);
        this._pole1.set(fwdX + outX * 0.10, 0.10, fwdZ + outZ * 0.10).normalize();
        this._pole2.set(-fwdX, 0.12, -fwdZ).normalize();

        M.solveUngulateThreeLinkIK(
          this._vRoot,
          this._vFet,
          this.hindLengths.L1,
          this.hindLengths.L2,
          this.hindLengths.L3,
          distalFlex,
          this._pole1,
          this._pole2,
          this._vJ1,
          this._vJ2,
          this._vFetSolved
        );

        this.aimBoneToWorldPoint(hipBone, 'stifle' + suffix, this._vRoot, this._vJ1);
        this.aimBoneToWorldPoint(stifBone, 'hock' + suffix, this._vJ1, this._vJ2);
        this.aimBoneToWorldPoint(hockBone, 'hindFetlock' + suffix, this._vJ2, this._vFetSolved);
        this.aimBoneToWorldPoint(fetBone, 'hindHoof' + suffix, this._vFetSolved, hoofWorldPos);

        this.orientHoofWorld(hoofBone, breakoverAngle + swingHoofPitch, hoofWorldPos, groundY);

        this.debugTargets[limb.key] = {
          root: this._vRoot.clone(),
          j1: this._vJ1.clone(),
          j2: this._vJ2.clone(),
          fetlock: this._vFetSolved.clone(),
          hoof: hoofWorldPos.clone()
        };
      }
    }

    aimBoneToWorldPoint(bone, childName, worldStart, worldEnd) {
      this._dirWorld.subVectors(worldEnd, worldStart);
      if (this._dirWorld.lengthSq() < 1e-10) return;
      this._dirWorld.normalize();

      bone.parent.getWorldQuaternion(this._qParent);
      this._qParentInv.copy(this._qParent).invert();

      this._dirLocal.copy(this._dirWorld).applyQuaternion(this._qParentInv).normalize();
      bone.quaternion.setFromUnitVectors(this.restLocalDirs[childName], this._dirLocal);
      bone.updateMatrixWorld(true);
    }

    orientHoofWorld(hoofBone, pitchDownRad, hoofPos, groundY) {
      hoofBone.parent.getWorldQuaternion(this._qParent);
      this._qParentInv.copy(this._qParent).invert();

      // Sample slight terrain forward slope under hoof for natural slope conformity
      const fwdStep = 0.08;
      const gx = hoofPos.x + Math.sin(this.worldYaw) * fwdStep;
      const gz = hoofPos.z + Math.cos(this.worldYaw) * fwdStep;
      const groundAhead = this.groundHeightFn(gx, gz);
      const slopePitch = -Math.atan2(groundAhead - groundY, fwdStep);
      const isPlanted = hoofPos.y - groundY < 0.03;

      const totalPitch = pitchDownRad + (isPlanted ? slopePitch : 0);
      this._euler.set(totalPitch, this.worldYaw, 0, 'YXZ');
      this._qLocal.setFromEuler(this._euler);
      hoofBone.quaternion.copy(this._qParentInv).multiply(this._qLocal);
      hoofBone.updateMatrixWorld(true);
    }
  }

  function cosSign(isLeft) {
    return isLeft ? 1 : -1;
  }

  function clampAbs(v, maxAbs) {
    return v < -maxAbs ? -maxAbs : v > maxAbs ? maxAbs : v;
  }

  GS.Gait = {
    GiraffeGaitController
  };
})();
