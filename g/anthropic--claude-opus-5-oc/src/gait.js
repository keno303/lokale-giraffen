/* Locomotion: footfall timing, non-slipping foot placement, analytic leg IK
   and the secondary body / neck / tail motion.

   Giraffes do not trot. They walk in a lateral sequence so pronounced that
   both legs on one side swing almost together, and at speed they switch to an
   amble (a true pace). The neck swings fore and aft once per stride to shift
   the centre of mass over the supporting pair. Both are modelled here. */
(function (global) {
  'use strict';

  const U = global.GU;
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const Z_AXIS = new THREE.Vector3(0, 0, 1);
  const _tmpA = new THREE.Vector3();
  const _tmpB = new THREE.Vector3();

  const GAITS = {
    stand: { duty: 1.0, offsets: [0, 0, 0, 0], lift: 0 },
    // index order is [frontL, hindL, frontR, hindR]
    walk: { duty: 0.655, offsets: [0.17, 0.00, 0.67, 0.50], lift: 0.22 },
    amble: { duty: 0.545, offsets: [0.08, 0.00, 0.58, 0.50], lift: 0.32 }
  };

  function Gait(giraffe) {
    this.g = giraffe;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.yawRate = 0;
    this.speed = 0;
    this.targetSpeed = 1.25;
    this.phase = 0;
    this.time = 0;
    this.rootDrop = 0.18;
    this.gait = 'walk';
    this.wander = true;
    this.obstacles = [];          // { x, z, r } — acacias to walk around
    this.headTarget = null;
    this._wanderSeed = 0.37;

    this.bindRoot = giraffe.bindPos['pelvis'].clone();
    this.legs = giraffe.legs.map((leg) => this._prepLeg(leg));
    // Order the legs as [FL, HL, FR, HR] for the gait offset table.
    const order = ['FL', 'HL', 'FR', 'HR'];
    this.legs.sort((a, b) => order.indexOf(a.leg.name) - order.indexOf(b.leg.name));
    this.neckBones = ['neck1', 'neck2', 'neck3', 'neck4', 'neck5', 'neck6', 'neck7']
      .map((n) => giraffe.byName[n]);
    this.spineBones = ['spine1', 'spine2', 'chest', 'neckBase'].map((n) => giraffe.byName[n]);
    this.tailBones = ['tail1', 'tail2', 'tail3'].map((n) => giraffe.byName[n]);
    this.headBone = giraffe.byName['head'];
    this.earBones = [giraffe.byName['earL'], giraffe.byName['earR']];
    this.scapulae = { FL: giraffe.byName['scapulaL'], FR: giraffe.byName['scapulaR'] };

    this.reset();
  }

  /* Pre-compute the flexion lookup table for one leg. The three upper
     segments flex together along an anatomically fixed pattern (`c`), so a
     single scalar controls how much the limb is folded. */
  Gait.prototype._prepLeg = function (leg) {
    const c = leg.front ? [-1.0, 1.6, -1.4] : [1.0, -1.8, 1.5];
    const phis = [], lens = [], angs = [];
    const N = 220;
    for (let i = 0; i < N; i++) {
      const phi = -0.08 + (1.18 + 0.08) * (i / (N - 1));
      let y = 0, z = 0;
      for (let k = 0; k < 3; k++) {
        const a = leg.alpha[k] + phi * c[k];
        y += -leg.len[k] * Math.cos(a);
        z += leg.len[k] * Math.sin(a);
      }
      phis.push(phi); lens.push(Math.hypot(y, z)); angs.push(Math.atan2(z, -y));
    }
    // Only the monotonically shortening branch past the maximum is usable.
    let m = 0;
    for (let i = 1; i < N; i++) if (lens[i] > lens[m]) m = i;
    return {
      leg: leg, c: c,
      phis: phis.slice(m), lens: lens.slice(m), angs: angs.slice(m),
      lenMax: lens[m] * 0.9995,
      lenMin: lens[N - 1],
      mode: 'stance', plant: new THREE.Vector3(), liftoff: new THREE.Vector3(),
      foot: new THREE.Vector3(), lastPhase: 0, load: 1
    };
  };

  Gait.prototype._solvePhi = function (L, D) {
    const lens = L.lens;
    let lo = 0, hi = lens.length - 1;
    if (D >= lens[0]) return { phi: L.phis[0], ang: L.angs[0] };
    if (D <= lens[hi]) return { phi: L.phis[hi], ang: L.angs[hi] };
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (lens[mid] > D) lo = mid; else hi = mid;
    }
    const t = U.invLerp(lens[lo], lens[hi], D);
    return {
      phi: U.lerp(L.phis[lo], L.phis[hi], t),
      ang: U.lerp(L.angs[lo], L.angs[hi], t)
    };
  };

  Gait.prototype.reset = function () {
    this.g.group.position.copy(this.pos);
    this.g.group.rotation.y = this.yaw;
    this.g.group.updateMatrixWorld(true);
    const m = this.g.group.matrixWorld;
    for (const L of this.legs) {
      L.foot.copy(L.leg.rest).applyMatrix4(m);
      L.foot.y = 0;
      L.plant.copy(L.foot);
      L.liftoff.copy(L.foot);
      L.mode = 'stance';
    }
  };

  Gait.prototype.strideFreq = function () {
    const s = Math.max(this.speed, 0.0001);
    return U.clamp(0.42 + 0.40 * s, 0.42, 1.25);
  };

  Gait.prototype.stepLength = function () {
    return U.clamp(this.speed / this.strideFreq(), 0, 1.38);
  };

  /* --------------------------------------------------------------------- */

  Gait.prototype.update = function (dt) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    const g = this.g;

    /* --- steering ----------------------------------------------------- */
    let desiredYawRate = 0;
    if (this.wander) {
      const n = U.tileFbm(this.time * 0.055, this._wanderSeed, 64, 3, 7) - 0.5;
      desiredYawRate = n * 0.42;
      // Keep the animal inside the visible plain.
      const r = Math.hypot(this.pos.x, this.pos.z);
      if (r > 42) {
        const inward = Math.atan2(-this.pos.x, -this.pos.z);
        let d = inward - this.yaw;
        while (d > Math.PI) d -= U.TAU;
        while (d < -Math.PI) d += U.TAU;
        desiredYawRate = U.lerp(desiredYawRate, U.clamp(d * 0.7, -0.45, 0.45),
          U.smoothstep((r - 42) / 14));
      }
      // Steer around the trees rather than through them.
      for (const o of this.obstacles) {
        const dx = o.x - this.pos.x, dz = o.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        const range = o.r + 7;
        if (d > range || d < 0.001) continue;
        let a = Math.atan2(dx, dz) - this.yaw;
        while (a > Math.PI) a -= U.TAU;
        while (a < -Math.PI) a += U.TAU;
        if (Math.abs(a) > 1.25) continue;             // already past it
        const urgency = (1 - d / range) * (1 - Math.abs(a) / 1.25);
        desiredYawRate -= Math.sign(a || 1) * urgency * 1.7;
      }
    }
    const maxYaw = 0.30 / Math.max(this.speed * 0.6 + 0.4, 0.45);
    desiredYawRate = U.clamp(desiredYawRate, -maxYaw, maxYaw);
    this.yawRate += (desiredYawRate - this.yawRate) * Math.min(1, dt * 1.4);

    /* --- speed & phase ------------------------------------------------- */
    const accel = this.targetSpeed > this.speed ? 0.9 : 1.6;
    this.speed += U.clamp(this.targetSpeed - this.speed, -accel * dt, accel * dt);
    if (this.speed < 0.02) this.speed = Math.max(0, this.speed);

    const moving = this.speed > 0.06;
    const gaitName = !moving ? 'stand' : this.gait;
    const G = GAITS[gaitName];
    const freq = this.strideFreq();
    if (moving) this.phase = U.frac(this.phase + freq * dt);

    this.yaw += this.yawRate * this.speed * dt * 1.1;
    this.pos.x += Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * this.speed * dt;

    g.group.position.copy(this.pos);
    g.group.rotation.y = this.yaw;

    /* --- body posture --------------------------------------------------- */
    const ph = this.phase * U.TAU;
    const sp = U.smoothstep(this.speed / 1.3);
    const root = g.byName['pelvis'];
    const idle = 1 - sp;
    const bob = Math.sin(ph * 2 + 0.8) * 0.022 * sp +
      Math.sin(this.time * 0.63) * 0.007 * idle;
    const sway = Math.sin(ph + 0.4) * 0.030 * sp +
      Math.sin(this.time * 0.41) * 0.024 * idle;
    const breath = Math.sin(this.time * 1.05) * 0.008;
    root.position.set(
      this.bindRoot.x + sway,
      this.bindRoot.y - this.rootDrop + bob + breath,
      this.bindRoot.z + Math.sin(ph * 2 + 2.2) * 0.012 * sp
    );
    const lean = -this.yawRate * this.speed * 0.30;
    root.rotation.set(
      Math.sin(ph * 2 + 1.4) * 0.016 * sp,
      Math.sin(ph + 1.1) * 0.020 * sp,
      Math.sin(ph + 0.2) * 0.026 * sp + lean +
        Math.sin(this.time * 0.41 + 1.2) * 0.014 * idle
    );

    // Spine: a little lateral flex into the turn plus a shallow back wave.
    const turn = this.yawRate * this.speed * 0.55;
    for (let i = 0; i < this.spineBones.length; i++) {
      const b = this.spineBones[i];
      b.rotation.y = turn * 0.22;
      b.rotation.x = Math.sin(ph * 2 + 1.0 - i * 0.5) * 0.009 * sp;
      b.rotation.z = -turn * 0.06;
    }

    // Neck: the signature fore/aft pendulum, strongest at the base.
    const neckSwing = Math.sin(ph - 0.55) * 0.055 * sp;
    const neckBob = Math.sin(ph * 2 + 0.3) * 0.012 * sp;
    let neckSum = 0;
    const look = this._lookAngles();
    for (let i = 0; i < this.neckBones.length; i++) {
      const b = this.neckBones[i];
      const taper = 1 - i / this.neckBones.length * 0.45;
      const a = (neckSwing * taper + neckBob * taper * 0.4) + look.pitch / 9;
      b.rotation.x = a;
      b.rotation.y = turn * 0.16 + look.yaw / 9;
      b.rotation.z = Math.sin(ph + 0.9) * 0.010 * sp * taper - turn * 0.10;
      neckSum += a;
    }
    // Head counter-rotates so the gaze stays level while the neck swings.
    this.headBone.rotation.x = -neckSum * 0.55 + look.pitch * 0.35 + 0.02;
    this.headBone.rotation.y = look.yaw * 0.3;
    this.headBone.rotation.z = Math.sin(ph + 2.0) * 0.012 * sp;

    // Ears: idle swivel with the odd quick flick.
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;
      const t = this.time * 0.8 + i * 2.1;
      const flick = Math.max(0, Math.sin(t * 0.33) - 0.95) * 14;
      this.earBones[i].rotation.y = s * (0.16 + Math.sin(t) * 0.12 + flick * 0.5);
      this.earBones[i].rotation.z = s * (-0.16 + Math.sin(t * 1.7) * 0.07 - flick * 0.6);
      this.earBones[i].rotation.x = s * 0.22;
    }

    // Tail: hangs and swishes, more when standing still.
    const swish = Math.sin(this.time * 1.6) * (0.10 + 0.18 * (1 - sp)) +
      Math.sin(this.time * 0.43) * 0.22;
    for (let i = 0; i < this.tailBones.length; i++) {
      const b = this.tailBones[i];
      const k = (i + 1) / this.tailBones.length;
      b.rotation.z = swish * 0.45 * k + Math.sin(ph + i) * 0.03 * sp;
      // A giraffe pushing on lifts the tail clear of the hindquarters.
      b.rotation.x = Math.sin(this.time * 1.1 + i * 0.7) * 0.05 +
        0.06 * sp + 0.42 * U.smoothstep((this.speed - 1.45) / 0.8);
      b.rotation.y = Math.sin(this.time * 0.9 + i) * 0.04;
    }

    /* --- shoulders ------------------------------------------------------ */
    for (const L of this.legs) {
      if (!L.leg.front) continue;
      const pl = U.frac(this.phase - G.offsets[this.legs.indexOf(L)]);
      const sc = this.scapulae[L.leg.name];
      if (sc) sc.rotation.x = Math.sin(pl * U.TAU + 1.2) * 0.075 * sp;
    }

    g.group.updateMatrixWorld(true);

    /* --- feet ----------------------------------------------------------- */
    const stepLen = this.stepLength();
    const half = stepLen * 0.5;
    const lift = G.lift * (0.55 + 0.45 * sp);
    const strideTime = 1 / freq;
    const tmp = _tmpA, fwd = _tmpB;

    for (let i = 0; i < this.legs.length; i++) {
      const L = this.legs[i];
      const leg = L.leg;
      const pl = moving ? U.frac(this.phase - G.offsets[i]) : 0;
      const stance = !moving || pl < G.duty;
      let hoofA = leg.alpha[3];

      if (stance) {
        if (L.mode !== 'stance') { L.mode = 'stance'; L.plant.copy(L.foot); L.plant.y = 0; }
        L.foot.copy(L.plant);
        const s = moving ? pl / G.duty : 0;
        L.load = Math.sin(Math.PI * U.clamp(s, 0, 1)) * 0.6 + 0.4;
        // Fetlock sinks under load, then the heel lifts at toe-off.
        hoofA += 0.10 * Math.sin(Math.PI * s) * sp +
          0.26 * U.smoothstep((s - 0.70) / 0.30) * sp;
      } else {
        const w = (pl - G.duty) / (1 - G.duty);
        if (L.mode !== 'swing') { L.mode = 'swing'; L.liftoff.copy(L.plant); }
        L.load = 0;
        // Predict where the body will be when this foot touches down again.
        const tRemain = (1 - pl) * strideTime;
        const futureYaw = this.yaw + this.yawRate * this.speed * tRemain * 1.1;
        const midYaw = (this.yaw + futureYaw) * 0.5;
        fwd.set(Math.sin(midYaw), 0, Math.cos(midYaw));
        tmp.copy(leg.rest);
        tmp.z += half;
        tmp.applyAxisAngle(Y_AXIS, futureYaw);
        tmp.add(this.pos).addScaledVector(fwd, this.speed * tRemain);
        tmp.y = 0;

        const e = U.smootherstep(w);
        L.foot.lerpVectors(L.liftoff, tmp, e);
        L.foot.y = lift * Math.pow(Math.sin(Math.PI * Math.pow(w, 0.86)), 0.9);
        hoofA -= 0.24 * Math.sin(Math.PI * w);
      }
      L.lastPhase = pl;
      this._solveLeg(L, L.foot, hoofA);
    }

    g.group.updateMatrixWorld(true);
  };

  /* Slow, idle head motion: the animal scans the horizon. */
  Gait.prototype._lookAngles = function () {
    const t = this.time;
    const yaw = (U.tileFbm(t * 0.09, 3.1, 64, 2, 13) - 0.5) * 0.9;
    const pitch = (U.tileFbm(t * 0.07, 8.4, 64, 2, 29) - 0.5) * 0.5;
    return { yaw: yaw, pitch: pitch };
  };

  const _m = new THREE.Matrix4();
  const _v = new THREE.Vector3();
  const _qz = new THREE.Quaternion();
  const _qx = new THREE.Quaternion();

  Gait.prototype._solveLeg = function (L, footWorld, hoofAlpha) {
    const leg = L.leg;
    _m.copy(leg.parent.matrixWorld).invert();
    _v.copy(footWorld).applyMatrix4(_m).sub(leg.hipLocal);

    const hyp = Math.hypot(_v.x, _v.y);
    const gamma = Math.atan2(_v.x, -_v.y);
    const ty = -hyp, tz = _v.z;

    // Fetlock position implied by the chosen hoof angle.
    const qy = ty + leg.len[3] * Math.cos(hoofAlpha);
    const qz = tz - leg.len[3] * Math.sin(hoofAlpha);
    const D = U.clamp(Math.hypot(qy, qz), L.lenMin, L.lenMax);

    const sol = this._solvePhi(L, D);
    const delta = Math.atan2(qz, -qy) - sol.ang;

    let acc = 0;
    for (let i = 0; i < 4; i++) {
      const target = i === 3 ? hoofAlpha : leg.alpha[i] + sol.phi * L.c[i] + delta;
      const Theta = leg.alpha[i] - target;
      const theta = Theta - acc;
      acc = Theta;
      const b = leg.bones[i];
      if (i === 0) {
        _qz.setFromAxisAngle(Z_AXIS, gamma);
        _qx.setFromAxisAngle(X_AXIS, theta);
        b.quaternion.copy(_qz).multiply(_qx);
      } else {
        b.quaternion.setFromAxisAngle(X_AXIS, theta);
      }
    }
  };

  Gait.prototype.setGait = function (name) {
    if (name === 'stand') { this.targetSpeed = 0; return; }
    this.gait = name;
  };

  global.Gait = Gait;
  global.GAITS = GAITS;
})(window);
