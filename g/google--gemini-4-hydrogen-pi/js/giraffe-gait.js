(function (global) {
  'use strict';

  const G = (global.GiraffeApp = global.GiraffeApp || {});
  const THREE = global.THREE;
  const { clamp, lerp, smoothstep, smootherstep, damp, groundHeight, groundNormal, solveTwoBoneIK } = G.MathUtils;

  const PHASE_OFFSETS = {
    BL: 0.00,
    FL: 0.14,
    BR: 0.50,
    FR: 0.64
  };

  class GiraffeController {
    constructor(giraffe) {
      this.giraffe = giraffe;
      this.skel = giraffe.skeleton;
      this.M = G.Anatomy.MEASUREMENTS;

      // World state
      this.position = new THREE.Vector3(0, 0, 0);
      this.heading = 0; // radians, 0 = +Z
      this.speed = 1.35; // m/s
      this.strideLength = 1.48; // m
      this.dutyFactor = 0.68;
      this.phase = 0.0;
      this.time = 0.0;
      this.walkMode = 'savannah'; // 'savannah' | 'circle' | 'treadmill'
      this.paused = false;

      // Precompute rest bone local orientations & rest directions
      this.restData = this._computeRestData();

      // Foot state for zero-slide ground locking
      this.footStates = {};
      this.onHoofStrike = null; // optional callback for dust particles

      // Micro-animation timers
      this.nextBlinkTime = 2.4;
      this.blinkProgress = -1;
      this.earTimerL = 1.5;
      this.earTimerR = 3.2;
      this.tailSwatTime = 5.0;
      this.tailSwatProgress = -1;

      this.resetPose();
    }

    _computeRestData() {
      const data = { limbs: {}, tail: [] };
      const root = this.skel.root;
      root.updateMatrixWorld(true);

      const getWorldQuat = (bone) => {
        const q = new THREE.Quaternion();
        bone.getWorldQuaternion(q);
        return q;
      };

      const computeBasisQuat = (dir, lateralHint) => {
        const d = dir.clone().normalize();
        const fwd = new THREE.Vector3().crossVectors(lateralHint, d).normalize();
        const lat = new THREE.Vector3().crossVectors(d, fwd).normalize();
        const m = new THREE.Matrix4().makeBasis(lat, d, fwd);
        return new THREE.Quaternion().setFromRotationMatrix(m);
      };

      for (const key of ['FL', 'FR', 'BL', 'BR']) {
        const limb = this.skel.limbs[key];
        const [J0, J1, J2, J3, J4] = limb.restJoints;
        const lat = new THREE.Vector3(1, 0, 0);
        data.limbs[key] = {
          upperRestBasis: computeBasisQuat(J1.clone().sub(J0), lat),
          midRestBasis: computeBasisQuat(J2.clone().sub(J1), lat),
          cannonRestBasis: computeBasisQuat(J3.clone().sub(J2), lat),
          pasternRestBasis: computeBasisQuat(J4.clone().sub(J3), lat),
          upperWorldQ: getWorldQuat(limb.upper),
          midWorldQ: getWorldQuat(limb.mid),
          cannonWorldQ: getWorldQuat(limb.cannon),
          pasternWorldQ: getWorldQuat(limb.pastern)
        };
      }

      data.neckRestPos = this.skel.neckBones.map(b => b.position.clone());
      data.headRestPos = this.skel.head.position.clone();
      data.pelvisRestPos = this.skel.pelvis.position.clone();
      data.spineMidRestPos = this.skel.spineMid.position.clone();
      data.chestRestPos = this.skel.chest.position.clone();
      return data;
    }

    resetPose(x = 0, z = 0, heading = 0) {
      this.position.set(x, groundHeight(x, z), z);
      this.heading = heading;
      this.phase = 0;
      this.initFootStates();
      this.update(0);
    }

    initFootStates() {
      const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
      // In Three.js (+Y up, +Z forward), +X is Left!
      const left = new THREE.Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
      const stride = this.strideLength;

      for (const key of ['FL', 'FR', 'BL', 'BR']) {
        const limb = this.skel.limbs[key];
        const restHoof = limb.restJoints[4];
        const u = (this.phase + PHASE_OFFSETS[key]) % 1.0;

        // Place initial foot along stride relative to nominal stance center
        let zLocalOff = 0;
        if (u < this.dutyFactor) {
          const s = u / this.dutyFactor;
          zLocalOff = lerp(stride * 0.42, -stride * 0.42, s);
        } else {
          const w = (u - this.dutyFactor) / (1 - this.dutyFactor);
          zLocalOff = lerp(-stride * 0.42, stride * 0.42, smootherstep(0, 1, w));
        }

        const worldPos = this.position.clone()
          .addScaledVector(left, restHoof.x)
          .addScaledVector(fwd, restHoof.z + zLocalOff);
        worldPos.y = groundHeight(worldPos.x, worldPos.z);

        this.footStates[key] = {
          wasInStance: u < this.dutyFactor,
          plantedPos: worldPos.clone(),
          swingStartPos: worldPos.clone(),
          swingEndPos: worldPos.clone(),
          prevU: u
        };
      }
    }

    _orientBoneWorld(bone, restBasis, currentDir, lateralAxis, parentWorldQuat) {
      const d = currentDir.clone().normalize();
      const fwd = new THREE.Vector3().crossVectors(lateralAxis, d);
      if (fwd.lengthSq() < 1e-8) {
        fwd.set(0, 0, 1);
      } else {
        fwd.normalize();
      }
      const lat = new THREE.Vector3().crossVectors(d, fwd).normalize();
      const m = new THREE.Matrix4().makeBasis(lat, d, fwd);
      const currBasis = new THREE.Quaternion().setFromRotationMatrix(m);
      // Since bone rest orientation was identity in root space:
      // targetRootQuat = currBasis * restBasis^-1
      const targetRootQuat = currBasis.multiply(restBasis.clone().invert());
      const localQuat = parentWorldQuat.clone().invert().multiply(targetRootQuat);
      bone.quaternion.copy(localQuat);
      return targetRootQuat;
    }

    update(dt, obstacles = []) {
      const clampedDt = Math.min(dt, 0.05);
      if (!this.paused) {
        this.time += clampedDt;
      }

      const activeSpeed = this.paused ? 0 : this.speed;
      const moveScale = smoothstep(0.02, 0.35, activeSpeed);
      const freq = activeSpeed / this.strideLength;

      if (!this.paused && activeSpeed > 0.001) {
        this.phase = (this.phase + freq * clampedDt) % 1.0;

        // Steering by mode
        if (this.walkMode === 'savannah') {
          // Gentle scenic wandering curve + soft obstacle avoidance
          let turnRate = Math.sin(this.time * 0.14) * 0.045 + Math.cos(this.time * 0.07) * 0.025;
          // Soft boundary turn back if far from origin (> 48 m)
          const distOrigin = Math.hypot(this.position.x, this.position.z);
          if (distOrigin > 42) {
            const toOrigin = Math.atan2(-this.position.x, -this.position.z);
            let diff = toOrigin - this.heading;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            turnRate += clamp(diff * 0.25, -0.25, 0.25);
          }
          // Steer gently around acacia trunks
          for (const obs of obstacles) {
            const dx = this.position.x - obs.x;
            const dz = this.position.z - obs.z;
            const dist = Math.hypot(dx, dz);
            const safeR = obs.radius + 3.8;
            if (dist < safeR && dist > 0.01) {
              const awayAng = Math.atan2(dx, dz);
              let diff = awayAng - this.heading;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              turnRate += clamp(diff * 0.6 * (1 - dist / safeR), -0.45, 0.45);
            }
          }
          this.heading += turnRate * clampedDt;
        } else if (this.walkMode === 'circle') {
          // Walk smoothly on a 10 m radius circle
          const radius = 10.0;
          this.heading += (activeSpeed / radius) * clampedDt;
        }

        if (this.walkMode !== 'treadmill') {
          this.position.x += Math.sin(this.heading) * activeSpeed * clampedDt;
          this.position.z += Math.cos(this.heading) * activeSpeed * clampedDt;
        }
      }

      // Terrain elevation & slope adaptation under giraffe
      const hFront = groundHeight(
        this.position.x + Math.sin(this.heading) * 0.6,
        this.position.z + Math.cos(this.heading) * 0.6
      );
      const hBack = groundHeight(
        this.position.x - Math.sin(this.heading) * 0.6,
        this.position.z - Math.cos(this.heading) * 0.6
      );
      const hCenter = groundHeight(this.position.x, this.position.z);
      this.position.y = hCenter;

      const terrainPitch = -Math.atan2(hFront - hBack, 1.2) * 0.65;

      // Update root transform
      this.skel.root.position.copy(this.position);
      this.skel.root.rotation.set(0, this.heading, 0);

      // Gait harmonics (1f = full cycle, 2f = per-step cycle)
      const p2 = this.phase * Math.PI * 2;
      const p4 = this.phase * Math.PI * 4;

      // Weight shifts over planted side (Left legs swing ~0.0..0.46 -> body shifts slightly Right (-X))
      const latSway = -Math.sin(p2 - 0.35) * 0.040 * moveScale;
      const bodyRoll = -Math.sin(p2 - 0.35) * 0.028 * moveScale;
      // Lower pelvis & chest slightly during walk so limbs always maintain natural joint flexion
      const walkDrop = -0.055 * moveScale;
      const bodyBob = (Math.cos(p4 - 0.8) * 0.026 - 0.01) * moveScale + walkDrop;
      const chestBob = (Math.cos(p4 - 1.1) * 0.030 - 0.01) * moveScale + walkDrop;
      const torsoYaw = Math.sin(p2 - 0.5) * 0.040 * moveScale;
      const breath = Math.sin(this.time * 1.75) * 0.008;

      // Pelvis pose
      this.skel.pelvis.position.copy(this.restData.pelvisRestPos).add(
        new THREE.Vector3(latSway, bodyBob + breath * 0.3, 0)
      );
      this.skel.pelvis.rotation.set(
        terrainPitch * 0.8 + Math.sin(p4 - 0.6) * 0.025 * moveScale,
        torsoYaw * 0.65,
        bodyRoll
      );

      // Spine mid
      this.skel.spineMid.rotation.set(
        Math.sin(p4 - 1.0) * 0.018 * moveScale,
        -torsoYaw * 0.3,
        -bodyRoll * 0.45
      );

      // Chest / Withers
      this.skel.chest.position.copy(this.restData.chestRestPos).add(
        new THREE.Vector3(0, (chestBob - bodyBob) * 0.6 + breath, 0)
      );
      this.skel.chest.rotation.set(
        Math.sin(p4 - 1.3) * 0.025 * moveScale,
        -torsoYaw * 0.85,
        -bodyRoll * 0.6
      );

      // Neck pendulum counterbalance + subtle scanning look
      const lookYaw = Math.sin(this.time * 0.38) * 0.08 + Math.sin(this.time * 0.19) * 0.05;
      const neckBasePitch = Math.sin(p4 - 1.55) * 0.055 * moveScale;
      const neckLatSway = Math.sin(p2 - 0.4) * 0.028 * moveScale;

      let accumPitch = 0;
      let accumYaw = 0;
      for (let i = 0; i < this.skel.neckBones.length; i++) {
        const nb = this.skel.neckBones[i];
        const frac = i / (this.skel.neckBones.length - 1);
        const wave = Math.sin(p4 - 1.55 - frac * 0.85) * 0.028 * moveScale;
        const pSeg = (neckBasePitch * 0.28 + wave * 0.45) * (1 - frac * 0.35);
        const ySeg = (lookYaw * 0.14);
        const rSeg = neckLatSway * 0.22 * (1 - frac * 0.4);
        nb.rotation.set(pSeg, ySeg, rSeg);
        accumPitch += pSeg;
        accumYaw += ySeg;
      }

      // Head stabilization (counter-rotates neck pitch so eyes stay steady!)
      const headScanPitch = Math.sin(this.time * 0.55) * 0.035;
      this.skel.head.rotation.set(
        -accumPitch * 0.72 + headScanPitch - terrainPitch * 0.4,
        lookYaw * 0.35,
        -neckLatSway * 0.45
      );

      // Natural Eye Blinking
      if (!this.paused) {
        if (this.blinkProgress >= 0) {
          this.blinkProgress += clampedDt / 0.18;
          if (this.blinkProgress >= 1) {
            this.blinkProgress = -1;
            this.nextBlinkTime = this.time + 2.8 + Math.random() * 3.8;
          }
        } else if (this.time >= this.nextBlinkTime) {
          this.blinkProgress = 0;
        }
      }
      const blinkCurve = this.blinkProgress >= 0 ? Math.sin(this.blinkProgress * Math.PI) : 0;
      for (const lid of this.giraffe.eyelids) {
        lid.rotation.x = lerp(-0.52, 0.36, blinkCurve);
      }

      // Ear flicks
      if (!this.paused) {
        this.earTimerL -= clampedDt;
        this.earTimerR -= clampedDt;
      }
      const earTwitchL = Math.max(0, Math.sin(this.time * 9.0)) * (this.earTimerL < 0.35 && this.earTimerL > 0 ? 0.22 : 0);
      const earTwitchR = Math.max(0, Math.sin(this.time * 11.0)) * (this.earTimerR < 0.35 && this.earTimerR > 0 ? 0.24 : 0);
      if (this.earTimerL <= 0) this.earTimerL = 2.5 + Math.random() * 3.5;
      if (this.earTimerR <= 0) this.earTimerR = 3.0 + Math.random() * 4.0;

      const earBounce = Math.sin(p4 - 2.0) * 0.035 * moveScale;
      this.skel.earL.rotation.set(0.25 + earBounce, -0.35 + earTwitchL, -0.15 + earTwitchL * 0.6);
      this.skel.earR.rotation.set(0.25 + earBounce, 0.35 - earTwitchR, 0.15 - earTwitchR * 0.6);

      // Tail pendulum + occasional fly swat
      if (!this.paused) {
        if (this.tailSwatProgress >= 0) {
          this.tailSwatProgress += clampedDt / 0.9;
          if (this.tailSwatProgress >= 1) {
            this.tailSwatProgress = -1;
            this.tailSwatTime = this.time + 4.0 + Math.random() * 5.0;
          }
        } else if (this.time >= this.tailSwatTime) {
          this.tailSwatProgress = 0;
        }
      }
      const swat = this.tailSwatProgress >= 0
        ? Math.sin(this.tailSwatProgress * Math.PI * 3) * Math.sin(this.tailSwatProgress * Math.PI) * 0.32
        : 0;
      for (let i = 0; i < this.skel.tailBones.length; i++) {
        const tb = this.skel.tailBones[i];
        const lag = i * 0.45;
        const swingZ = Math.sin(p2 - 0.7 - lag) * 0.075 * moveScale + swat * (0.4 + i * 0.2);
        const swingX = Math.cos(p4 - 1.2 - lag) * 0.035 * moveScale + 0.03 * moveScale;
        tb.rotation.set(swingX, 0, swingZ);
      }

      // Update world matrices of root -> pelvis -> chest before solving limb IK!
      this.skel.root.updateMatrixWorld(true);

      // Solve all 4 limbs with analytical 2-bone IK + ground-locked stance
      this._solveLimbs(clampedDt, activeSpeed, moveScale);

      // Update world matrices once all bones are posed
      this.skel.root.updateMatrixWorld(true);
    }

    _solveLimbs(dt, activeSpeed, moveScale) {
      const rootInv = this.skel.root.matrixWorld.clone().invert();
      const rootQuatInv = new THREE.Quaternion().setFromRotationMatrix(rootInv);

      const worldToRoot = (v) => v.clone().applyMatrix4(rootInv);
      const rootToWorld = (v) => v.clone().applyMatrix4(this.skel.root.matrixWorld);

      const duty = this.dutyFactor;
      const swingDur = (1 - duty) / Math.max(0.15, activeSpeed / this.strideLength);
      const stride = this.strideLength * lerp(0.15, 1.0, moveScale);

      for (const key of ['FL', 'FR', 'BL', 'BR']) {
        const limb = this.skel.limbs[key];
        const rest = this.restData.limbs[key];
        const state = this.footStates[key];
        const isFore = limb.isFore;
        const s = limb.side;

        const u = (this.phase + PHASE_OFFSETS[key]) % 1.0;
        const inStance = u < duty;

        // Current socket position (shoulder or hip) in root-local space
        const socketWorld = new THREE.Vector3();
        limb.upper.getWorldPosition(socketWorld);
        const socketRoot = worldToRoot(socketWorld);

        const restHoof = limb.restJoints[4];
        const restRootSocket = limb.restJoints[0];

        // Compute desired Hoof World Position (ground-locked in stance, parabolic arc in swing!)
        let hoofWorld;
        let pasternPitchOffset = 0; // + = toe down / heel up
        let fetlockCompress = 0;

        if (activeSpeed < 0.01 && !this.paused) {
          // Standing calmly
          const standRoot = restHoof.clone();
          hoofWorld = rootToWorld(standRoot);
          hoofWorld.y = groundHeight(hoofWorld.x, hoofWorld.z);
          state.plantedPos.copy(hoofWorld);
        } else if (inStance) {
          const st = u / duty; // 0 = heel strike -> 1 = toe off

          if (!state.wasInStance) {
            // Just landed! Lock hoof to exact landing spot on terrain
            const landRoot = new THREE.Vector3(
              restHoof.x,
              0,
              restHoof.z + stride * 0.43
            );
            state.plantedPos.copy(rootToWorld(landRoot));
            state.plantedPos.y = groundHeight(state.plantedPos.x, state.plantedPos.z);

            if (this.onHoofStrike && moveScale > 0.25) {
              this.onHoofStrike(state.plantedPos);
            }
          } else if (this.walkMode === 'treadmill' && !this.paused) {
            // Treadmill scrolls ground backward under planted hoof
            const fwdWorld = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
            state.plantedPos.addScaledVector(fwdWorld, -activeSpeed * dt);
            state.plantedPos.y = groundHeight(state.plantedPos.x, state.plantedPos.z);
          }

          // Safety clamp if paused/scrubbed or extreme turn
          const nominalRoot = new THREE.Vector3(
            restHoof.x,
            0,
            restHoof.z + lerp(stride * 0.43, -stride * 0.43, st)
          );
          const nominalWorld = rootToWorld(nominalRoot);
          if (state.plantedPos.distanceTo(nominalWorld) > 1.15) {
            state.plantedPos.copy(nominalWorld);
            state.plantedPos.y = groundHeight(state.plantedPos.x, state.plantedPos.z);
          }

          hoofWorld = state.plantedPos.clone();

          // Weight absorption fetlock spring dip right after strike, then heel lift before toe-off
          fetlockCompress = Math.sin(clamp(st / 0.35, 0, 1) * Math.PI) * 0.032 * moveScale;
          const toeOff = smoothstep(0.72, 1.0, st);
          pasternPitchOffset = toeOff * 0.48 * moveScale;
          hoofWorld.y += toeOff * 0.03 * moveScale;
        } else {
          // Swing phase!
          const w = (u - duty) / (1 - duty); // 0 -> 1

          if (state.wasInStance) {
            state.swingStartPos.copy(state.plantedPos);
          }

          // Continuously predict landing target ahead of current body
          const remainingTime = (1 - w) * swingDur;
          const advanceAhead = this.walkMode === 'treadmill' ? 0 : activeSpeed * remainingTime;
          const targetRoot = new THREE.Vector3(
            restHoof.x,
            0,
            restHoof.z + stride * 0.43 + advanceAhead
          );
          state.swingEndPos.copy(rootToWorld(targetRoot));
          state.swingEndPos.y = groundHeight(state.swingEndPos.x, state.swingEndPos.z);

          const smoothW = smootherstep(0, 1, w);
          hoofWorld = state.swingStartPos.clone().lerp(state.swingEndPos, smoothW);
          const groundY = groundHeight(hoofWorld.x, hoofWorld.z);

          // Asymmetric swing arc: quick knee-lift clear at start, gentle descent onto heel
          const liftCurve = Math.sin(Math.pow(w, 0.78) * Math.PI);
          const maxLift = (isFore ? 0.27 : 0.23) * moveScale;
          hoofWorld.y = groundY + liftCurve * maxLift;

          // Pastern hangs relaxed backward in mid-swing, extends forward before landing
          pasternPitchOffset = (0.58 * Math.sin(w * Math.PI) - 0.16 * smoothstep(0.72, 1.0, w)) * moveScale;
        }

        state.wasInStance = inStance;
        state.prevU = u;

        const hoofRoot = worldToRoot(hoofWorld);

        // Compute pastern -> fetlock target from hoof position & pastern pitch
        const restPasternVec = limb.restJoints[3].clone().sub(limb.restJoints[4]); // hoof -> fetlock
        const basePasternPitch = Math.atan2(restPasternVec.z, restPasternVec.y); // negative (back/up)
        const pasternLen = isFore ? this.M.foreLengths.pastern : this.M.hindLengths.pastern;
        const effAngle = basePasternPitch - pasternPitchOffset - fetlockCompress * 2.2;
        const fetlockRoot = hoofRoot.clone().add(new THREE.Vector3(
          0,
          Math.cos(effAngle) * pasternLen - fetlockCompress,
          Math.sin(effAngle) * pasternLen
        ));

        // Upper joint (Humerus or Femur) biomechanical swing in root-local space
        const limbAnglePhase = Math.sin((u < duty ? lerp(1, -1, u / duty) : lerp(-1, 1, (u - duty) / (1 - duty))) * Math.PI * 0.5);
        const upperRestVec = limb.restJoints[1].clone().sub(restRootSocket);
        const upperLen = isFore ? this.M.foreLengths.humerus : this.M.hindLengths.femur;

        // Upper segment swings smoothly forward during late swing/early stance and backward toward toe-off
        const upperSwingAngle = (isFore ? 0.30 : 0.34) * limbAnglePhase * moveScale;
        // Slight outward swing clearance at mid-swing so ipsilateral hooves never clip
        const swingClearance = !inStance ? Math.sin(((u - duty) / (1 - duty)) * Math.PI) * 0.035 * s * moveScale : 0;

        const upperDir = upperRestVec.clone().normalize();
        upperDir.applyAxisAngle(new THREE.Vector3(1, 0, 0), -upperSwingAngle);
        upperDir.x += swingClearance;
        upperDir.normalize();

        const midJointRoot = socketRoot.clone().addScaledVector(upperDir, upperLen);

        // Solve exact 2-Bone IK for MidJoint (Elbow/Stifle) -> Hinge (Carpus/Hock) -> Fetlock
        const L1 = isFore ? this.M.foreLengths.forearm : this.M.hindLengths.gaskin;
        const L2 = isFore ? this.M.foreLengths.cannon : this.M.hindLengths.cannon;
        // Pole vector: Foreleg Carpus points FORWARD (+Z), Hindleg Hock points BACKWARD (-Z)!
        const poleDir = isFore ? new THREE.Vector3(0, 0.08, 1) : new THREE.Vector3(0, 0.08, -1);

        const hingeRoot = new THREE.Vector3();
        const clampedFetlockRoot = new THREE.Vector3();
        solveTwoBoneIK(midJointRoot, fetlockRoot, L1, L2, poleDir, hingeRoot, clampedFetlockRoot);

        // Recompute hoof from clamped fetlock so pastern never stretches
        const finalHoofRoot = clampedFetlockRoot.clone().sub(new THREE.Vector3(
          0,
          Math.cos(effAngle) * pasternLen - fetlockCompress,
          Math.sin(effAngle) * pasternLen
        ));

        // Orient the 4 bones cleanly in parent local spaces
        const latAxis = new THREE.Vector3(1, 0, 0);

        const parentBone = isFore ? this.skel.chest : this.skel.pelvis;
        const parentWorldQ = new THREE.Quaternion();
        parentBone.getWorldQuaternion(parentWorldQ);
        const parentRootQ = rootQuatInv.clone().multiply(parentWorldQ);

        const qUpper = this._orientBoneWorld(limb.upper, rest.upperRestBasis, midJointRoot.clone().sub(socketRoot), latAxis, parentRootQ);
        const qMid = this._orientBoneWorld(limb.mid, rest.midRestBasis, hingeRoot.clone().sub(midJointRoot), latAxis, qUpper);
        const qCannon = this._orientBoneWorld(limb.cannon, rest.cannonRestBasis, clampedFetlockRoot.clone().sub(hingeRoot), latAxis, qMid);
        const qPastern = this._orientBoneWorld(limb.pastern, rest.pasternRestBasis, finalHoofRoot.clone().sub(clampedFetlockRoot), latAxis, qCannon);

        // Keep hoof sole parallel to terrain during stance, pitched smoothly during swing/toe-off
        const hoofTargetPitch = inStance
          ? lerp(0, 0.42 * moveScale, smoothstep(0.72, 1.0, u / duty))
          : lerp(0.45 * moveScale, -0.18 * moveScale, smoothstep(0.25, 0.92, (u - duty) / (1 - duty)));

        // Hoof bone inherits qPastern in root space; compensate pastern pitch so hoof sole sits cleanly
        const pDir = finalHoofRoot.clone().sub(clampedFetlockRoot).normalize();
        const pFwd = new THREE.Vector3().crossVectors(latAxis, pDir).normalize();
        const pasternTilt = Math.atan2(pDir.z, -pDir.y);
        const restPasternTilt = Math.atan2(
          limb.restJoints[4].z - limb.restJoints[3].z,
          -(limb.restJoints[4].y - limb.restJoints[3].y)
        );
        limb.hoof.rotation.set(-(pasternTilt - restPasternTilt) + hoofTargetPitch, 0, 0);
      }
    }
  }

  G.Gait = {
    GiraffeController,
    PHASE_OFFSETS
  };
})(window);
