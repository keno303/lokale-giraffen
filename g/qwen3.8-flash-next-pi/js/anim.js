/* anim.js - rig + procedural walking gait
 *
 * The giraffe uses its real walk: a lateral sequence ("pace") gait where the
 * limbs of one side move as a couplet, the hind foot over-stepping the front
 * print.  Feet are placed with 2-bone inverse kinematics onto targets that are
 * fixed to the ground during stance, so hooves never slide.  The body height is
 * derived from the limbs (the animal physically cannot reach further than its
 * legs allow), which produces the characteristic dip at heel-strike/push-off
 * and the slow roll of the neck.
 */
(function (G) {
  'use strict';
  const V = THREE.Vector3, E = THREE.Euler, Q = THREE.Quaternion;
  const _v = new V(), _v2 = new V(), _v3 = new V(), _v4 = new V();
  const _q = new Q(), _q2 = new Q(), _m = new THREE.Matrix4();
  const _tu = new V(), _tv = new V(), _tw = new V(), _tm = new THREE.Matrix4();
  const Y = new V(0, 1, 0), X = new V(1, 0, 0), Z = new V(0, 0, 1);

  /* basis quaternion: local +Y -> yDir, local +Z as close to refDir as possible.
   * Uses private scratch so callers can pass _v2/_v3 as arguments. */
  function quatFromY(out, yDir, refDir) {
    const y = _tu.copy(yDir).normalize();
    const z = _tv.copy(refDir);
    z.addScaledVector(y, -z.dot(y));
    if (z.lengthSq() < 1e-7) { z.set(0, 0, 1); z.addScaledVector(y, -z.dot(y)); }
    z.normalize();
    const x = _tw.crossVectors(y, z).normalize();
    _tm.makeBasis(x, y, z);
    return out.setFromRotationMatrix(_tm);
  }

  /* --------------------- gaits ---------------------
   * phase: 0 = hoof-strike.  duty: fraction of the cycle the foot is on the
   * ground.  Giraffe walk = ipsilateral couplets; trot = diagonal couplets.  */
  const GAITS = {
    walk: {
      name: 'Walk (lateral pace)', duty: 0.58,
      phase: { FL: 0.00, HL: 0.055, FR: 0.50, HR: 0.555 },
      bob: 1.0, lift: 1.0, neck: 1.0, lean: 1.0, sway: 1.0, pitchNeck: 0, crouch: 0
    },
    amble: {
      name: 'Amble', duty: 0.68,
      phase: { FL: 0.00, HL: 0.13, FR: 0.50, HR: 0.63 },
      bob: 0.75, lift: 0.8, neck: 0.8, lean: 0.8, sway: 1.15, pitchNeck: 0, crouch: 0
    },
    trot: {
      name: 'Trot (diagonal)', duty: 0.36,
      phase: { FL: 0.00, HR: 0.02, FR: 0.50, HL: 0.52 },
      bob: 1.6, lift: 1.3, neck: 1.3, lean: 1.2, sway: 0.8, pitchNeck: -0.12, crouch: 0.14
    }
  };

  /* --------------------- spring helper (secondary motion) ------------- */
  function Spring(k, d) { this.k = k; this.d = d; this.x = 0; this.v = 0; this.t = 0; }
  Spring.prototype.step = function (target, dt) {
    this.t = target;
    const a = (this.t - this.x) * this.k - this.v * this.d;
    this.v += a * dt; this.x += this.v * dt;
    return this.x;
  };

  /* --------------------- keyframe helper ----------------------------- */
  function curveAt(keys, t) {
    if (t <= keys[0][0]) return keys[0][1];
    const n = keys.length;
    for (let i = 0; i < n - 1; i++) {
      if (t <= keys[i + 1][0]) {
        const f = (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
        return G.lerp(keys[i][1], keys[i + 1][1], G.smoothstep(f));
      }
    }
    return keys[n - 1][1];
  }

  /* hoof pitch through the step: toe rocker, heel strike, roll-over, push off */
  const PITCH_STANCE = [[0, 0.10], [0.14, 0.00], [0.62, -0.02], [0.86, -0.13], [1, -0.05]];
  const PITCH_SWING = [[0, 0.14], [0.35, 0.20], [0.75, 0.13], [1, 0.10]];
  const LIFT_SWING = [[0, 0.0], [0.16, 0.55], [0.45, 1.0], [0.72, 0.75], [1, 0.0]];

  /* =========================================================== */
  function Rig(boneNames, joints) {
    this.bones = {}; this.list = []; this.joints = joints;
    for (const n of boneNames) { const b = new THREE.Bone(); b.name = n; this.bones[n] = b; this.list.push(b); }
    this.rootBone = this.bones.root;
    for (const n of boneNames) {
      const j = joints[n], b = this.bones[n];
      if (j.parent) {
        const p = joints[j.parent];
        b.position.set(j.p[0] - p.p[0], j.p[1] - p.p[1], j.p[2] - p.p[2]);
        this.bones[j.parent].add(b);
      } else b.position.set(j.p[0], j.p[1], j.p[2]);
      b.userData.bind = new V(j.p[0], j.p[1], j.p[2]);
      b.userData.parent = j.parent;
      b.userData.bindPos = b.position.clone();
    }
    this.buildLegs();
    this.phase = 0; this.t = 0;
    this.tail = [new Spring(90, 11), new Spring(70, 9), new Spring(55, 8), new Spring(45, 7)];
    this.tailY = [new Spring(60, 9), new Spring(48, 8), new Spring(38, 7), new Spring(30, 6)];
    this.earL = new Spring(55, 8); this.earR = new Spring(55, 8);
    this.nextTwitch = 2 + Math.random() * 4; this.nextSwish = 8 + Math.random() * 9;
    this.swish = 0; this.nextBlink = 2 + Math.random() * 4; this.blink = 0;
    this.chew = Math.random() * 10;
    this.drop = 0;
  }

  Rig.prototype.buildLegs = function () {
    const J = this.joints, self = this;
    function mk(side, tag, poleSign) {
      const up = J[tag + '_up'], low = J[tag + '_low'], foot = J[tag + '_foot'];
      const H = new V(up.p[0], up.p[1], up.p[2]);
      const K = new V(low.p[0], low.p[1], low.p[2]);
      const A = new V(foot.p[0], foot.p[1], foot.p[2]);
      const toe = tag[0] === 'f'
        ? new V(side * 0.295, 0.01, 1.16)
        : new V(side * 0.255, 0.01, -0.94);
      const footDir = toe.clone().sub(A).normalize();
      /* bind segment directions: the bind frames are body-aligned, so these are
       * plain body-space directions and the bind pole is +Z */
      function bindQuat(dir) { const q = new Q(); quatFromY(q, dir, Z); return q; }
      const dUp = K.clone().sub(H).normalize(), dLow = A.clone().sub(K).normalize();
      return {
        tag: tag, side: side, up: self.bones[tag + '_up'], low: self.bones[tag + '_low'], footB: self.bones[tag + '_foot'],
        parent: self.bones[up.parent], H0: H, Hlocal: self.bones[tag + '_up'].position.clone(),
        l1: H.distanceTo(K), l2: K.distanceTo(A), D0: H.y - A.y,
        ankleBind: A.clone(), footDir: footDir, poleSign: poleSign,
        bindUp: bindQuat(dUp), bindLow: bindQuat(dLow), bindFoot: bindQuat(footDir),
        bind: H.clone()
      };
    }
    this.legs = {
      FL: mk(1, 'fL', 1), FR: mk(-1, 'fR', 1),
      HL: mk(1, 'bL', 1), HR: mk(-1, 'bR', 1)
    };
  };

  /* ground-anchored ankle target for one limb */
  Rig.prototype.footTarget = function (leg, u, g, A, out) {
    const duty = g.duty;
    let zOff, yLift, pitch, lat = 0;
    if (u < duty) {
      const p = u / duty;
      zOff = A * 0.5 - A * p;
      yLift = 0;
      pitch = curveAt(PITCH_STANCE, p);
      lat = -0.018 * Math.sin(Math.PI * p);
    } else {
      const p = (u - duty) / (1 - duty);
      zOff = -A * 0.5 + A * G.smoothstep(p);
      yLift = curveAt(LIFT_SWING, p) * 0.20 * g.lift;
      pitch = curveAt(PITCH_SWING, p);
      lat = 0.055 * Math.sin(Math.PI * p);
    }
    out.set(leg.ankleBind.x + leg.side * lat, leg.ankleBind.y + yLift, leg.ankleBind.z + zOff);
    return { target: out, pitch: pitch, zOff: zOff, yLift: yLift, u: u,
      stance: u < duty, p: u < duty ? u / duty : 1 };
  };

  /* --------------------- main update ----------------------------- */
  Rig.prototype.update = function (dt, opt) {
    const g = GAITS[opt.gait] || GAITS.walk, sp = opt.speed, bones = this.bones;
    const stride = G.clamp(1.0 + 1.2 * sp, 1.0, 4.2);
    const cycleT = G.clamp(stride / Math.max(0.05, sp), 0.75, 6.0);
    /* standing: below a crawl the animal stops stepping and settles on all
       four feet instead of marching on the spot */
    const standT = 1 - G.smoothstep((sp - 0.05) / 0.13);
    this.standW = (this.standW === undefined) ? standT
      : this.standW + (standT - this.standW) * Math.min(1, dt * 2.2);
    const stw = this.standW, mov = 1 - stw;
    if (!opt.paused) { this.t += dt; if (sp > 0.02) this.phase = (this.phase + dt / cycleT) % 1; }
    const phi = this.phase, A = stride * g.duty;
    this.stride = stride; this.cycleT = cycleT;

    /* --- 1. limb targets in ground-anchored space (y = 0 on the ground) --- */
    const info = {};
    for (const key of ['FL', 'FR', 'HL', 'HR']) {
      const leg = this.legs[key];
      const u = (phi + g.phase[key]) % 1;
      const i = info[key] = this.footTarget(leg, u, g, A, new V());
      if (stw > 0.001) {
        const rest = curveAt(PITCH_STANCE, 0.5);
        i.target.y = G.lerp(i.target.y, leg.ankleBind.y, stw);
        i.target.z = G.lerp(i.target.z, leg.ankleBind.z, stw);
        i.target.x = G.lerp(i.target.x, leg.ankleBind.x, stw);
        i.zOff *= (1 - stw); i.yLift *= (1 - stw);
        i.pitch = G.lerp(i.pitch, rest, stw);
        if (stw > 0.5) i.stance = true;
      }
    }

    /* --- 2. scapular / pelvic travel + the body height the legs allow --- */
    let drop = 0, anyStance = false;
    const travel = {};
    for (const key of ['FL', 'FR', 'HL', 'HR']) {
      const leg = this.legs[key], i = info[key];
      const reach = i.stance ? i.zOff : 0;
      const tr = G.clamp(reach * (leg.tag[0] === 'f' ? 0.32 : 0.15), -0.32, 0.32) * mov;
      travel[key] = tr;
      if (i.stance) {
        anyStance = true;
        const rh = Math.hypot(leg.H0.x - leg.ankleBind.x, i.zOff - tr);
        const Lmax = (leg.l1 + leg.l2) * 0.985;
        const dv = Math.sqrt(Math.max(0.01, Lmax * Lmax - rh * rh));
        const d = leg.D0 - dv + Math.max(0, -i.zOff) * 0.0;
        if (d > drop) drop = d;
      }
    }
    this.drop += (drop - this.drop) * Math.min(1, dt * 12);

    /* --- 3. body transform --- */
    const bs = (1 + 0.15 * (sp - 1.2)) * mov;
    const idleY = stw * 0.009 * Math.sin(2 * Math.PI * 0.13 * this.t);
    const idleS = stw * 0.014 * Math.sin(2 * Math.PI * 0.09 * this.t + 0.7);
    const bob = (0.030 * Math.sin(2 * Math.PI * (2 * phi + 0.13)) + 0.014 * Math.sin(2 * Math.PI * (phi + 0.35))) * g.bob * bs;
    const sway = (0.035 * Math.sin(2 * Math.PI * (phi + 0.02)) + 0.008 * Math.sin(2 * Math.PI * (2 * phi + 0.5))) * g.sway * bs;
    const roll = (0.020 * Math.sin(2 * Math.PI * (phi + 0.02)) + 0.007 * Math.sin(2 * Math.PI * (2 * phi + 0.2))) * g.lean * bs;
    const pitchB = 0.010 * Math.sin(2 * Math.PI * (2 * phi + 0.4)) * g.bob + g.pitchNeck * 0.25;
    const yawB = 0.010 * Math.sin(2 * Math.PI * (phi + 0.28)) * g.sway * bs;
    const rootBob = new V(sway + idleS, -this.drop + bob + idleY - g.crouch * (1 - stw * 0.15), 0);
    bones.root.position.copy(bones.root.userData.bindPos).add(rootBob);
    bones.root.quaternion.setFromEuler(new E(pitchB, yawB, -roll, 'ZYX'));

    /* spine: ribcage and pelvis counter-roll slightly */
    bones.chest.quaternion.setFromEuler(new E(0.010 * Math.sin(2 * Math.PI * (2 * phi + 0.5)) - g.pitchNeck * 0.35, 0, -0.010 * Math.sin(2 * Math.PI * (phi)) , 'ZYX'));
    bones.pelvis.quaternion.setFromEuler(new E(-0.010 * Math.sin(2 * Math.PI * (2 * phi + 0.5)) + g.pitchNeck * 0.15, 0, 0.008 * Math.sin(2 * Math.PI * (phi)), 'ZYX'));

    /* --- 4. neck + head: slow metronomic counter-swing, head kept level --- */
    const nSway = (0.026 * Math.sin(2 * Math.PI * (phi + 0.42)) * g.neck * bs);
    const nPitch = (0.020 * Math.sin(2 * Math.PI * (phi + 0.15)) * g.neck * bs) + g.pitchNeck * (1 - stw * 0.6);
    let neckSum = 0;
    const nk = ['neck0', 'neck1', 'neck2', 'neck3'], wgt = [0.34, 0.28, 0.22, 0.16];
    for (let i = 0; i < 4; i++) {
      neckSum += nPitch * wgt[i];
      bones[nk[i]].quaternion.setFromEuler(new E(nPitch * wgt[i], nSway * wgt[i] * 1.6, nSway * wgt[i] * 1.3, 'ZYX'));
    }
    /* vestibular-ish head stabilisation + breathing-free gentle nod */
    const headPitch = -neckSum * 0.92 + 0.014 * Math.sin(2 * Math.PI * (phi + 0.62)) + 0.02 * Math.sin(2 * Math.PI * 0.21 * this.t + 1.3);
    const headRoll = -nSway * 1.15 - roll * 0.35 + 0.010 * Math.sin(2 * Math.PI * 0.17 * this.t);
    bones.head.quaternion.setFromEuler(new E(headPitch, -nSway * 0.6, headRoll, 'ZYX'));
    this.chew += dt * (1.6 + 0.35 * Math.sin(this.t * 0.13));
    bones.muzzle.quaternion.setFromEuler(new E(0.020 * Math.sin(this.chew) + 0.010 * Math.sin(this.chew * 0.47 + 1.1) - 0.012, 0, 0.006 * Math.sin(this.chew * 0.31), 'ZYX'));

    /* --- 5. matrices up to here must be current before the tail/legs --- */
    this.rootBone.updateMatrixWorld(true);

    /* --- 6. tail: whip of lagged springs, plus an occasional fly-swish --- */
    this.nextSwish -= dt;
    if (this.nextSwish <= 0) { this.swish = 1; this.nextSwish = 7 + Math.random() * 11; }
    this.swish = Math.max(0, this.swish - dt * 0.55);
    const latAcc = -roll * 9.0 + sway * 2.0;
    for (let i = 0; i < 4; i++) {
      const amp = 0.55 + i * 0.5;
      const sw = this.swish * Math.sin(2 * Math.PI * (3.1 * this.t - i * 0.5)) * 0.30 * amp;
      const zx = this.tail[i].step(latAcc * 0.10 * amp + sw + 0.030 * Math.sin(2 * Math.PI * (phi - i * 0.09)) * amp, dt);
      const xy = this.tailY[i].step(0.05 * amp + 0.05 * Math.sin(2 * Math.PI * (2 * (phi - i * 0.07))) * 0.5 * amp, dt);
      bones['tail' + i].quaternion.setFromEuler(new E(xy, 0, zx, 'ZYX'));
    }

    /* --- 7. ears: inertia springs + random twitches --- */
    this.nextTwitch -= dt;
    if (this.nextTwitch <= 0) {
      const which = Math.random() < 0.5 ? this.earL : this.earR;
      which.v += (Math.random() * 2 - 1) * 5.0;
      this.nextTwitch = 1.6 + Math.random() * 5;
    }
    const eL = this.earL.step(-headPitch * 0.6 - 0.05, dt), eR = this.earR.step(-headPitch * 0.6 - 0.05, dt);
    bones.earL.quaternion.setFromEuler(new E(eL * 0.5, eL * 0.35, -eL * 0.3, 'ZYX'));
    bones.earR.quaternion.setFromEuler(new E(eR * 0.5, -eR * 0.35, eR * 0.3, 'ZYX'));
    this.rootBone.updateMatrixWorld(true);

    /* --- 8. legs: scapular travel + 2-bone IK onto the ground target --- */
    for (const key of ['FL', 'FR', 'HL', 'HR']) {
      const leg = this.legs[key], i = info[key];
      /* shoulder / hip travel (scapula glides, pelvis rotates) */
      const kf = leg.tag[0] === 'f' ? 0.32 : 0.15;
      const trZ = i.stance ? G.clamp(i.zOff * kf, -0.32, 0.32) : G.clamp(i.zOff * kf * 0.5, -0.16, 0.16);
      const trY = -Math.abs(trZ) * 0.30;
      leg.up.position.set(leg.Hlocal.x, leg.Hlocal.y + trY, leg.Hlocal.z + trZ);
      /* target: ground-anchored point in world space */
      _v.copy(i.target).add(opt.origin);
      this.solveLeg(leg, _v, i.pitch);
    }
    this.rootBone.updateMatrixWorld(true);

    /* --- 9. blink --- */
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) { this.blink = 1; this.nextBlink = 2.2 + Math.random() * 5.5; }
    this.blink = Math.max(0, this.blink - dt * 7.5);

    return {
      phase: phi, stride: stride, cycleT: cycleT, drop: this.drop,
      stance: ['FL', 'FR', 'HL', 'HR'].map(k => info[k].stance ? 1 : 0),
      blink: this.blink, gait: g.name, lift: 0.20 * g.lift
    };
  };

  /* 2-bone IK in the limb's parent space.  Bone bind frames are body-aligned,
   * so each joint rotation is expressed relative to its bind direction:  
   *      W = q(desiredDir) * q(bindDir)^-1                                     */
  Rig.prototype.solveLeg = function (leg, targetWorld, footPitch) {
    const parent = leg.up.parent;
    _m.copy(parent.matrixWorld).invert();
    const T = _v2.copy(targetWorld).applyMatrix4(_m);
    parent.getWorldQuaternion(_q); _q.invert();
    const pole = new V(0, 0, 1).applyQuaternion(_q);
    const H = leg.Hlocal;
    const d = _v4.copy(T).sub(H);
    let len = d.length();
    const l1 = leg.l1, l2 = leg.l2;
    const lo = Math.abs(l1 - l2) + 0.02, hi = (l1 + l2) * 0.999;
    len = G.clamp(len, lo, hi);
    const u = d.clone().normalize();
    T.copy(H).addScaledVector(u, len);   /* respect the reachable clamp */
    const a1 = Math.acos(G.clamp((len * len + l1 * l1 - l2 * l2) / (2 * len * l1), -1, 1));
    let k = new V().crossVectors(u, pole);
    if (k.lengthSq() < 1e-6) k.set(1, 0, 0);
    k.normalize();
    const duA = u.clone().applyAxisAngle(k, a1), duB = u.clone().applyAxisAngle(k, -a1);
    const du = (duA.dot(pole) >= duB.dot(pole)) ? duA : duB;
    const K = H.clone().addScaledVector(du, l1);
    const dl = T.clone().sub(K).normalize();

    const qA = new Q(), qWup = new Q(), qWlow = new Q(), qWfoot = new Q();
    quatFromY(qA, du, pole); qWup.copy(qA).multiply(leg.bindUp.clone().invert());
    quatFromY(qA, dl, pole); qWlow.copy(qA).multiply(leg.bindLow.clone().invert());
    /* foot: bind direction pitched about the body's lateral axis */
    const fd = leg.footDir.clone(); fd.applyAxisAngle(X, footPitch);
    quatFromY(qA, fd, pole); qWfoot.copy(qA).multiply(leg.bindFoot.clone().invert());

    leg.up.quaternion.copy(qWup);
    leg.low.quaternion.copy(qWup).invert().multiply(qWlow);
    leg.footB.quaternion.copy(qWlow).invert().multiply(qWfoot);
  };

  G.GAITS = GAITS;
  G.Rig = Rig;
})(window.G = window.G || {});
