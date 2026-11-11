/**
 * Giraffe 3D - Biomechanical Gait Engine & Kinematics
 * Simulates the lateral pacing walk of the giraffe, including dynamic neck counter-oscillation,
 * spine roll/yaw, tail physics, breathing, ear twitches, and hoof dust particle effects.
 */

const GiraffeAnimation = (function() {
  'use strict';

  class DustParticleSystem {
    constructor(scene, maxParticles = 120) {
      this.scene = scene;
      this.maxParticles = maxParticles;
      this.particles = [];

      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(maxParticles * 3);
      const scales = new Float32Array(maxParticles);
      const alphas = new Float32Array(maxParticles);

      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
      geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

      // Custom soft particle shader material
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          color: { value: new THREE.Color(0xd5b88f) }
        },
        vertexShader: `
          attribute float scale;
          attribute float alpha;
          varying float vAlpha;
          void main() {
            vAlpha = alpha;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = scale * (260.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          precision mediump float;
          uniform vec3 color;
          varying float vAlpha;
          void main() {
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;
            float soft = smoothstep(0.5, 0.0, dist);
            gl_FragColor = vec4(color, vAlpha * soft * 0.45);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
      });

      this.mesh = new THREE.Points(geo, mat);
      this.scene.add(this.mesh);

      for (let i = 0; i < maxParticles; i++) {
        this.particles.push({
          x: 0, y: -999, z: 0,
          vx: 0, vy: 0, vz: 0,
          life: 0, maxLife: 1,
          scale: 0, alpha: 0
        });
      }
    }

    emit(pos, velocity, count = 8) {
      let emitted = 0;
      for (let i = 0; i < this.particles.length && emitted < count; i++) {
        const p = this.particles[i];
        if (p.life <= 0) {
          p.x = pos.x + (Math.random() - 0.5) * 0.18;
          p.y = 0.04 + Math.random() * 0.05;
          p.z = pos.z + (Math.random() - 0.5) * 0.18;

          p.vx = velocity.x * 0.2 + (Math.random() - 0.5) * 0.4;
          p.vy = 0.25 + Math.random() * 0.35;
          p.vz = velocity.z * 0.2 + (Math.random() - 0.5) * 0.4 - 0.2; // drifts back

          p.life = 0.8 + Math.random() * 0.6;
          p.maxLife = p.life;
          p.scale = 0.15 + Math.random() * 0.15;
          p.alpha = 0.6;
          emitted++;
        }
      }
    }

    update(dt) {
      const posAttr = this.mesh.geometry.attributes.position;
      const scaleAttr = this.mesh.geometry.attributes.scale;
      const alphaAttr = this.mesh.geometry.attributes.alpha;

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (p.life > 0) {
          p.life -= dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          p.vy -= 0.15 * dt; // gravity / air resistance
          p.scale += 0.35 * dt; // puff expands

          const progress = 1.0 - (p.life / p.maxLife);
          p.alpha = Math.max(0, (1.0 - progress) * 0.6);

          posAttr.setXYZ(i, p.x, p.y, p.z);
          scaleAttr.setX(i, p.scale);
          alphaAttr.setX(i, p.alpha);
        } else {
          posAttr.setXYZ(i, 0, -999, 0);
          alphaAttr.setX(i, 0);
        }
      }
      posAttr.needsUpdate = true;
      scaleAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
    }
  }

  class GaitController {
    constructor(giraffe, scene) {
      this.giraffe = giraffe;
      this.scene = scene;
      this.dust = new DustParticleSystem(scene);

      // Animation parameters
      this.speed = 1.0;          // Speed multiplier (0 = idle, 1 = normal walk, 1.5 = brisk)
      this.isPlaying = true;
      this.traverse = true;       // Traverse across terrain vs walk in place
      this.strideLength = 1.65;   // Distance traversed per full cycle in meters
      this.cycleTime = 1.85;      // Seconds per full stride cycle at 1.0x speed
      this.time = 0;
      this.phase = 0;

      // Limb phase offsets for the lateral (pacing) walk:
      // Sequence: Left Hind (LH) -> Left Fore (LF) -> Right Hind (RH) -> Right Fore (RF)
      this.phases = {
        LH: 0.00,
        LF: 0.20,
        RH: 0.50,
        RF: 0.70
      };

      // Foot strike tracking for dust emission
      this.wasFootGrounded = { LH: true, LF: true, RH: true, RF: true };

      // Ear twitch timers
      this.earTwitchTimerL = 2.0;
      this.earTwitchTimerR = 4.5;
      this.earTwitchValL = 0;
      this.earTwitchValR = 0;

      // Tail physics state
      this.tailRoll = 0;
      this.tailRollVel = 0;
      this.tailPitch = 0;

      // World travel position
      this.worldZ = 0;
      this.worldSpeed = 0;
    }

    setSpeed(val) {
      this.speed = Math.max(0, Math.min(2.0, val));
    }

    setTraverse(bool) {
      this.traverse = !!bool;
      if (!this.traverse) {
        this.giraffe.root.position.z = 0;
        this.worldZ = 0;
      }
    }

    /**
     * Updates kinematics for one frame
     */
    update(dt) {
      if (!this.isPlaying) return;

      // Update ear twitch timers
      this.updateEars(dt);

      // Effective time progression
      const activeSpeed = this.speed;
      if (activeSpeed > 0.02) {
        const cycleSpeed = (Math.PI * 2) / (this.cycleTime / activeSpeed);
        this.phase = (this.phase + dt * cycleSpeed) % (Math.PI * 2);
      }
      this.time += dt;

      // 1. Torso & Pelvis Dynamics
      this.updateTorso(activeSpeed);

      // 2. Forelimbs & Hindlimbs Kinematics
      this.updateLimbs(activeSpeed, dt);

      // 3. Neck & Head Counter-Balance Pendulum
      this.updateNeckAndHead(activeSpeed);

      // 4. Tail Physics
      this.updateTail(dt, activeSpeed);

      // 5. Breathing Expansion
      this.updateBreathing();

      // 6. Savanna Dust Particles
      this.dust.update(dt);

      // 7. World Space Forward Traversal
      if (this.traverse && activeSpeed > 0.02) {
        const forwardVel = (this.strideLength / this.cycleTime) * activeSpeed;
        this.worldSpeed = forwardVel;
        this.worldZ += forwardVel * dt;
        this.giraffe.root.position.z = this.worldZ;
      } else {
        this.worldSpeed = 0;
      }
    }

    /**
     * Pelvis and thorax vertical bobbing, lateral roll, and yaw
     */
    updateTorso(speedNorm) {
      const pelvis = this.giraffe.pelvis;
      const phi = this.phase;

      if (speedNorm < 0.05) {
        // Idle breathing stance
        pelvis.position.y = 2.35 + Math.sin(this.time * 1.5) * 0.008;
        pelvis.rotation.z = 0;
        pelvis.rotation.y = 0;
        pelvis.rotation.x = 0;
        return;
      }

      // Vertical body bob: double frequency (sinusoidal dip and rise twice per cycle)
      const bobAmp = 0.042 * Math.min(1.0, speedNorm);
      pelvis.position.y = 2.35 + Math.cos(phi * 2.0) * bobAmp;

      // Lateral roll towards weight-bearing side
      const rollAmp = 0.038 * Math.min(1.0, speedNorm);
      pelvis.rotation.z = Math.sin(phi) * rollAmp;

      // Subtle yaw twist as hips swing forward
      const yawAmp = 0.024 * Math.min(1.0, speedNorm);
      pelvis.rotation.y = Math.cos(phi) * yawAmp;

      // Subtle forward/backward pitch as front vs back legs take load
      const pitchAmp = 0.018 * Math.min(1.0, speedNorm);
      pelvis.rotation.x = Math.sin(phi * 2.0 - 0.5) * pitchAmp;
    }

    /**
     * Limb Kinematics (Forelegs and Hindlegs)
     */
    updateLimbs(speedNorm, dt) {
      const phi = this.phase;
      const legs = this.giraffe.legs;

      // Evaluate each limb with its pacing phase offset
      this.animateForeleg(legs.LF, (phi + this.phases.LF * Math.PI * 2) % (Math.PI * 2), speedNorm, 'LF');
      this.animateForeleg(legs.RF, (phi + this.phases.RF * Math.PI * 2) % (Math.PI * 2), speedNorm, 'RF');
      this.animateHindleg(legs.LH, (phi + this.phases.LH * Math.PI * 2) % (Math.PI * 2), speedNorm, 'LH');
      this.animateHindleg(legs.RH, (phi + this.phases.RH * Math.PI * 2) % (Math.PI * 2), speedNorm, 'RH');
    }

    /**
     * Forelimb kinematics (shoulder, humerus, carpal knee, cannon, pastern, hoof)
     */
    animateForeleg(limb, p, speedNorm, legId) {
      if (speedNorm < 0.05) {
        // Natural resting standing angles
        limb.upperArm.rotation.x = 0.20;
        limb.forearm.rotation.x  = -0.20;
        limb.knee.rotation.x     = 0.0;
        limb.cannon.rotation.x   = 0.0;
        limb.pastern.rotation.x  = 0.14;
        return;
      }

      // Normalized phase in [0, 1)
      const u = p / (Math.PI * 2);
      const stanceRatio = 0.60;
      const isStance = u < stanceRatio;

      let upperRot = 0;
      let forearmRot = 0;
      let kneeRot = 0;
      let cannonRot = 0;
      let pasternRot = 0;
      let isGrounded = true;

      const strideAmp = 0.32 * Math.min(1.2, speedNorm);

      if (isStance) {
        // STANCE PHASE: Hoof planted on ground, propelling torso forward
        const t = u / stanceRatio; // 0 to 1
        isGrounded = true;

        // Shoulder/Humerus rotates smoothly backward relative to body
        upperRot = 0.20 - (t - 0.5) * strideAmp * 1.1;

        // Forearm stays nearly vertical under load
        forearmRot = -0.20 + (t - 0.5) * strideAmp * 0.6;

        // Slight knee flexion at midstance (elastic spring shock absorption)
        kneeRot = Math.sin(t * Math.PI) * 0.08 * speedNorm;

        // Pastern flexes downward slightly at midstance load
        pasternRot = 0.14 + Math.sin(t * Math.PI) * 0.10 * speedNorm;

      } else {
        // SWING PHASE: Hoof lifts off ground, folds knee, swings forward, unfolds
        const s = (u - stanceRatio) / (1.0 - stanceRatio); // 0 to 1
        isGrounded = false;

        // Upper arm lifts and swings forward
        upperRot = 0.20 - strideAmp * 0.55 + Math.sin(s * Math.PI) * strideAmp * 1.35;

        // Forearm lifts forward
        forearmRot = -0.20 - Math.sin(s * Math.PI) * 0.22;

        // Carpal knee bends backward to raise lower leg and clear tall grass
        // Maximum knee fold at s ~ 0.45
        kneeRot = -Math.sin(s * Math.PI) * 0.68 * speedNorm;

        // Fetlock and pastern trail back as foot lifts, then extend forward before plant
        pasternRot = 0.14 - Math.sin(s * Math.PI) * 0.24;
      }

      // Apply rotations
      limb.upperArm.rotation.x = upperRot;
      limb.forearm.rotation.x  = forearmRot;
      limb.knee.rotation.x     = kneeRot;
      limb.pastern.rotation.x  = pasternRot;

      // Check foot plant event for dust puff
      if (isGrounded && !this.wasFootGrounded[legId]) {
        this.emitHoofDust(limb);
      }
      this.wasFootGrounded[legId] = isGrounded;
    }

    /**
     * Hindlimb kinematics (thigh/femur, stifle, tibia shank, hock, cannon, pastern, hoof)
     */
    animateHindleg(limb, p, speedNorm, legId) {
      if (speedNorm < 0.05) {
        limb.thigh.rotation.x   = -0.28;
        limb.stifle.rotation.x  = 0.0;
        limb.shank.rotation.x   = 0.48;
        limb.cannon.rotation.x  = -0.20;
        limb.pastern.rotation.x = 0.12;
        return;
      }

      const u = p / (Math.PI * 2);
      const stanceRatio = 0.60;
      const isStance = u < stanceRatio;

      let thighRot = 0;
      let stifleRot = 0;
      let shankRot = 0;
      let cannonRot = 0;
      let pasternRot = 0;
      let isGrounded = true;

      const strideAmp = 0.30 * Math.min(1.2, speedNorm);

      if (isStance) {
        // STANCE PHASE
        const t = u / stanceRatio;
        isGrounded = true;

        // Thigh rotates backward as body passes over
        thighRot = -0.28 + (t - 0.5) * strideAmp * 1.1;

        // Shank angles slightly
        shankRot = 0.48 - (t - 0.5) * strideAmp * 0.6;

        // Hock yields slightly under load
        cannonRot = -0.20 + Math.sin(t * Math.PI) * 0.06;

        pasternRot = 0.12 + Math.sin(t * Math.PI) * 0.08 * speedNorm;

      } else {
        // SWING PHASE
        const s = (u - stanceRatio) / (1.0 - stanceRatio);
        isGrounded = false;

        // Thigh swings forward
        thighRot = -0.28 + strideAmp * 0.55 - Math.sin(s * Math.PI) * strideAmp * 1.30;

        // Stifle and hock flex forward to clear ground
        stifleRot = -Math.sin(s * Math.PI) * 0.42 * speedNorm;
        shankRot  = 0.48 + Math.sin(s * Math.PI) * 0.28 * speedNorm;

        // Hock flexes forward
        cannonRot = -0.20 - Math.sin(s * Math.PI) * 0.38 * speedNorm;

        pasternRot = 0.12 - Math.sin(s * Math.PI) * 0.20;
      }

      limb.thigh.rotation.x   = thighRot;
      limb.stifle.rotation.x  = stifleRot;
      limb.shank.rotation.x   = shankRot;
      limb.cannon.rotation.x  = cannonRot;
      limb.pastern.rotation.x = pasternRot;

      if (isGrounded && !this.wasFootGrounded[legId]) {
        this.emitHoofDust(limb);
      }
      this.wasFootGrounded[legId] = isGrounded;
    }

    /**
     * Emits a dust puff at the hoof's world location
     */
    emitHoofDust(limb) {
      const hoofPos = new THREE.Vector3();
      limb.hoof.getWorldPosition(hoofPos);
      const vel = new THREE.Vector3(0, 0, this.worldSpeed);
      this.dust.emit(hoofPos, vel, 10);
    }

    /**
     * Signature Giraffe Motion: Dynamic Neck & Head Counter-Balance Pendulum
     */
    updateNeckAndHead(speedNorm) {
      const neckBase = this.giraffe.neckBase;
      const neckSegments = this.giraffe.neckSegments;
      const head = this.giraffe.head;
      const phi = this.phase;

      if (speedNorm < 0.05) {
        // Idle gentle breathing sway
        const idleSway = Math.sin(this.time * 1.2) * 0.02;
        neckBase.rotation.x = 0.98 + idleSway;
        neckBase.rotation.z = Math.sin(this.time * 0.8) * 0.015;
        for (let i = 0; i < neckSegments.length; i++) {
          neckSegments[i].rotation.x = 0;
          neckSegments[i].rotation.z = 0;
        }
        head.rotation.x = -0.96 - idleSway;
        return;
      }

      // The neck oscillates rhythmically with the stride:
      // When foreleg reaches forward, neck bobs down/back, then recovers.
      const neckBobAmp = 0.065 * Math.min(1.2, speedNorm);
      const neckYawAmp = 0.032 * Math.min(1.2, speedNorm);

      // Base neck angle
      neckBase.rotation.x = 0.98 + Math.sin(phi * 2.0 + 0.3) * neckBobAmp * 0.5;
      neckBase.rotation.z = Math.sin(phi) * neckYawAmp * 0.5;

      // Serpentine traveling wave down the 6 cervical vertebrae
      let accumulatedRotX = neckBase.rotation.x;
      const delayPerSeg = 0.35; // Phase lag between vertebrae

      for (let i = 0; i < neckSegments.length; i++) {
        const segPhi = phi * 2.0 - i * delayPerSeg;
        const segRotX = Math.sin(segPhi) * (neckBobAmp / neckSegments.length) * 1.2;
        const segRotZ = Math.sin(phi - i * 0.25) * (neckYawAmp / neckSegments.length);

        neckSegments[i].rotation.x = segRotX;
        neckSegments[i].rotation.z = segRotZ;
        accumulatedRotX += segRotX;
      }

      // Head Gaze Stabilization:
      // The head counter-rotates to keep the eyes looking level towards the horizon,
      // with a slight dignified downward nod at footstrike!
      const headNod = Math.sin(phi * 2.0 - 0.4) * 0.035 * speedNorm;
      head.rotation.x = -0.96 - (accumulatedRotX - 0.98) * 0.9 + headNod;
      head.rotation.z = -Math.sin(phi) * neckYawAmp * 0.6;
    }

    /**
     * Damped Pendulum Tail Dynamics
     */
    updateTail(dt, speedNorm) {
      const tailBase = this.giraffe.tailBase;
      const tailSegments = this.giraffe.tailSegments;
      const phi = this.phase;

      // Spring-mass-damper simulation for tail sway
      const targetRoll = -Math.sin(phi) * 0.22 * Math.min(1.2, speedNorm);
      const springK = 35.0;
      const damping = 5.5;

      const force = (targetRoll - this.tailRoll) * springK;
      this.tailRollVel += force * dt;
      this.tailRollVel *= Math.max(0, 1.0 - damping * dt);
      this.tailRoll += this.tailRollVel * dt;

      tailBase.rotation.z = this.tailRoll * 0.5;
      tailBase.rotation.x = 0.25 + Math.sin(phi * 2.0) * 0.05 * speedNorm;

      for (let i = 0; i < tailSegments.length; i++) {
        const factor = (i + 1) / tailSegments.length;
        tailSegments[i].rotation.z = this.tailRoll * 0.35 * factor;
      }
    }

    /**
     * Ear twitches and micro-movements
     */
    updateEars(dt) {
      const earL = this.giraffe.earLeft;
      const earR = this.giraffe.earRight;

      this.earTwitchTimerL -= dt;
      this.earTwitchTimerR -= dt;

      if (this.earTwitchTimerL <= 0) {
        this.earTwitchValL = 0.45;
        this.earTwitchTimerL = 3.5 + Math.random() * 4.5;
      }
      if (this.earTwitchTimerR <= 0) {
        this.earTwitchValR = 0.45;
        this.earTwitchTimerR = 2.5 + Math.random() * 5.0;
      }

      this.earTwitchValL = THREE.MathUtils.lerp(this.earTwitchValL, 0, dt * 8);
      this.earTwitchValR = THREE.MathUtils.lerp(this.earTwitchValR, 0, dt * 8);

      earL.rotation.y = 0.35 + Math.sin(this.time * 0.7) * 0.1 - this.earTwitchValL;
      earR.rotation.y = -0.35 - Math.sin(this.time * 0.9) * 0.1 + this.earTwitchValR;
    }

    /**
     * Rhythmic breathing (ribcage / flank expansion)
     */
    updateBreathing() {
      const breath = 1.0 + Math.sin(this.time * 1.6) * 0.015;
      this.giraffe.pelvis.scale.set(breath, breath, 1.0);
    }
  }

  return {
    GaitController
  };
})();
