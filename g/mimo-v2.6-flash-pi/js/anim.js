'use strict';
/*
 * Procedural walk cycle:
 *  - 4-beat lateral sequence walk (LH, LF, RH, RF), duty factor 0.62
 *  - feet are planted in *world* space during stance (no slipping),
 *    solved with a 3-segment IK per limb
 *  - body bob / sway / roll, travelling wave through the neck, head
 *    stabilisation, tail whip, ear flicks, nostril breathing.
 */
class GiraffeAnimator {
  constructor(rig) {
    this.rig = rig;
    this.root = new THREE.Object3D();
    this.root.add(rig.body);
    this.speed = 1.4;          // m/s
    this.pathR = 26;           // walking circle radius (m)
    this.s = 0;                // distance travelled along the path
    this.time = 0;
    this.gaitTime = 0;
    this.duty = 0.62;
    this.strideDist = 2.15;
    this.Tmin = 1.0; this.Tmax = 5.0;
    this.phaseOffsets = { HL: 0.0, FL: 0.30, HR: 0.50, FR: 0.80 };
    for (const l of rig.legs) l.phase = this.phaseOffsets[l.name];

    this.bodyWorld = new THREE.Matrix4();
    this.bodyInv = new THREE.Matrix4();
    this.bodyQuat = new THREE.Quaternion();
    this.bodyQuatInv = new THREE.Quaternion();
    this.flatQuat = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._x = new THREE.Vector3();
    this._y = new THREE.Vector3();
    this._z = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this.ikOut = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.neckPts = [];
    for (let i = 0; i < rig.neck.pts.length; i++) this.neckPts.push(new THREE.Vector3());
    this.tailPts = [];
    for (let i = 0; i < rig.tail.pts.length; i++) this.tailPts.push(new THREE.Vector3());
    this.earRest = rig.head.ears.map(e => e.quaternion.clone());
    this.earT = [];
    this.nextTwitch = 1.2;
    this.blinkT = 0;
  }

  setSpeed(v) { this.speed = U.clamp(v, 0.0, 2.8); }

  cycleTime() {
    if (this.speed < 0.02) return 6.0;
    return U.clamp(this.strideDist / this.speed, this.Tmin, this.Tmax);
  }

  /* normalised foot travel during swing (starts & ends with -v relative) */
  swingF(s) {
    const A = (1 - this.duty) / this.duty;
    const k = 6 * (1 + A);
    return -A * s + k * (0.5 * s * s - s * s * s / 3);
  }
  swingLift(s) {
    return Math.sin(Math.PI * Math.pow(U.clamp(s, 0, 1), 0.9));
  }

  update(dt) {
    const rig = this.rig;
    dt = Math.min(dt, 0.05);
    const v = this.speed;
    const T = this.cycleTime();
    this.time += dt;
    this.s += v * dt;
    // freeze the gait when standing so the giraffe does not march on the spot
    if (v > 0.05) this.gaitTime += dt;
    const p = U.frac(this.gaitTime / T);
    this.phase = p;
    const stanceTravel = v * this.duty * T;   // relative distance the foot covers while planted
    this.stanceTravel = stanceTravel;

    /* ---------- path ---------- */
    const a = this.s / this.pathR;
    const eps = 0.001;
    const px = this.pathR * Math.cos(a), pz = -this.pathR * Math.sin(a);
    const nx = this.pathR * Math.cos(a + eps), nz = -this.pathR * Math.sin(a + eps);
    const dx = nx - px, dz = nz - pz;
    const yaw = Math.atan2(-dz, dx);
    this.root.position.set(px, 0, pz);
    this.root.rotation.y = yaw;

    /* ---------- body dynamics ---------- */
    const w = U.TAU * p;
    const idle = U.clamp(1 - v / 0.45, 0, 1);          // 1 when standing still
    this.idle = idle;
    const ti = this.time;
    const bob = 0.024 * Math.sin(2 * w + 0.6) + 0.009 * Math.sin(4 * w + 1.4)
      + idle * 0.010 * Math.sin(ti * 1.15);
    const sway = 0.034 * Math.sin(2 * w + 2.0) + 0.013 * Math.sin(4 * w)
      + idle * 0.018 * Math.sin(ti * 0.63);
    const roll = 0.020 * Math.sin(2 * w + 1.1) + 0.008 * Math.sin(4 * w + 2.2)
      + idle * 0.010 * Math.sin(ti * 0.51 + 1.0);
    const pitch = 0.016 * Math.sin(2 * w + 3.1) + 0.007 * Math.sin(4 * w + 0.4)
      + idle * 0.012 * Math.sin(ti * 0.77);
    const body = rig.body;
    body.position.set(sway, bob, 0);
    body.rotation.set(pitch, 0.010 * Math.sin(2 * w) * (1 - idle), roll);
    this.root.updateMatrixWorld(true);

    body.matrixWorld.decompose(this._v2, this.bodyQuat, this._v); // reuse
    this.bodyWorld.copy(body.matrixWorld);
    this.bodyInv.copy(this.bodyWorld).invert();
    this.bodyQuatInv.copy(this.bodyQuat).invert();

    /* world-flat foot basis, expressed in body space */
    this._y.set(0, 1, 0).applyQuaternion(this.bodyQuatInv);
    this._x.set(1, 0, 0).applyQuaternion(this.bodyQuat);
    this._x.y = 0;
    if (this._x.lengthSq() < 1e-8) this._x.set(1, 0, 0);
    this._x.normalize().applyQuaternion(this.bodyQuatInv);
    this._z.crossVectors(this._x, this._y).normalize();
    this._y.crossVectors(this._z, this._x).normalize();
    this.flatQuat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(this._x, this._y, this._z));

    /* ---------- legs ---------- */
    for (const leg of rig.legs) {
      this.updateLeg(leg, U.frac(p - leg.phase), stanceTravel, T, w);
    }

    /* ---------- neck ---------- */
    this.updateNeck(p, w, pitch);

    /* ---------- tail ---------- */
    this.updateTail(p, w);

    /* ---------- head details ---------- */
    this.updateHeadFx(dt, p, w);
  }

  updateLeg(leg, u, S, T, w) {
    const duty = this.duty;
    const fl = leg.footLen;
    const z0 = leg.pivot.z;
    const x0 = leg.pivot.x;      // neutral foot position sits under the pivot
    const isStance = u < duty;
    const target = this._v.set(0, 0, 0);
    let footPitch = 0;
    let footQuat = this._q.copy(this.flatQuat);

    // scapula / pelvis slide
    let off;
    if (isStance) off = 0.5 * Math.cos(Math.PI * U.clamp(u / duty, 0, 1));
    else off = -0.5 * Math.cos(Math.PI * U.clamp((u - duty) / (1 - duty), 0, 1));
    const slide = (leg.fore ? 0.05 : 0.032) * off;

    if (isStance) {
      if (!leg.stance) {
        leg.stance = true;
        target.set(x0 + S * 0.5, fl, z0).applyMatrix4(this.bodyWorld);
        target.y = fl;                    // always touch down on the ground plane
        leg.plant.copy(target);
        leg.plantQuat.copy(this.flatQuat);
      }
      target.copy(leg.plant).applyMatrix4(this.bodyInv);
      footQuat = this._q.copy(this.flatQuat);
    } else {
      leg.stance = false;
      const ts = U.clamp((u - duty) / (1 - duty), 0, 1);
      const x = x0 + U.lerp(-S * 0.5, S * 0.5, this.swingF(ts));
      const lift = (leg.fore ? 0.235 : 0.265) * this.swingLift(ts);
      const zin = z0 - leg.sign * 0.035 * Math.sin(Math.PI * ts);
      // stride in body space, height measured from the *world* ground plane
      target.set(x, fl + lift, zin).applyMatrix4(this.bodyWorld);
      target.y = fl + lift;
      target.applyMatrix4(this.bodyInv);
      // toe off -> slight toe up mid swing -> level for landing
      footPitch = -0.34 * Math.max(0, 1 - ts * 3.4) + 0.16 * Math.sin(Math.PI * Math.min(1, ts * 1.1));
      footQuat = this._q.copy(this.flatQuat)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), footPitch));
    }

    // pivot (shoulder/hip) slides a little with the scapula
    const pivot = this._v2.copy(leg.pivot);
    pivot.x += slide;

    const out = this.ikOut;
    IK.solve3(pivot, target, leg.L, leg.beta, leg.pole, out, 0, 2.2);

    for (let i = 0; i < 3; i++) {
      const bone = leg.bones[i];
      bone.position.copy(out[i]);
      const dir = this._v2.subVectors(out[i + 1], out[i]).normalize();
      bone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      // joint knobs ride on the joints
      const knob = leg.joints[i];
      knob.position.copy(out[i + 1]);
    }
    const foot = leg.foot;
    foot.position.copy(out[3]);
    foot.quaternion.copy(footQuat);
    leg.lastTarget = target.clone();
  }

  updateNeck(p, w, bodyPitch) {
    const rig = this.rig;
    const nk = rig.D.neck;
    const segs = nk.segs;
    const segLen = nk.len / segs;
    const ti = this.time, idle = this.idle || 0;
    const baseYaw = 0.072 * Math.sin(2 * w + 2.1) + 0.026 * Math.sin(4 * w + 0.7)
      + idle * (0.075 * Math.sin(ti * 0.63) + 0.03 * Math.sin(ti * 1.7 + 1.2));
    const basePitch = nk.pitch + 0.030 * Math.sin(2 * w + 1.2) - bodyPitch * 0.6
      + 0.012 * Math.sin(4 * w + 2.4)
      + idle * (0.045 * Math.sin(ti * 0.51 + 0.8) + 0.015 * Math.sin(ti * 1.35));

    const pts = this.neckPts;
    pts[0].copy(nk.base);
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const pitchI = basePitch
        + 0.016 * Math.sin(2 * w - t * 3.2 + 0.5)
        + 0.010 * Math.sin(4 * w - t * 5.5);
      const yawI = baseYaw * (0.30 + 0.70 * t)
        + 0.018 * Math.sin(2 * w - t * 4.0 + 1.0);
      const cp = Math.cos(pitchI), sp = Math.sin(pitchI);
      const cy = Math.cos(yawI), sy = Math.sin(yawI);
      // Ry(yaw) * (cos(pitch), sin(pitch), 0)
      const d = this._v.set(cp * cy, sp, -cp * sy);
      pts[i + 1].copy(pts[i]).addScaledVector(d, segLen);
    }
    const fr = rig.neck.mesh.update(pts);
    rig.neck.mane.update(pts, fr);

    /* head: keep the face at a stable absolute attitude */
    const head = rig.head.obj;
    head.position.copy(pts[segs]);
    const endDir = this._v.subVectors(pts[segs], pts[segs - 1]).normalize();
    const neckEndPitch = Math.atan2(endDir.y, Math.hypot(endDir.x, endDir.z));
    const neckEndYaw = Math.atan2(-endDir.z, endDir.x);
    const hPitch = rig.D.headRestPitch + 0.035 * Math.sin(2 * w + 2.8) - bodyPitch * 0.5
      + (neckEndPitch - nk.pitch) * 0.35;
    const hYaw = neckEndYaw * 0.55 + 0.02 * Math.sin(2 * w + 1.0)
      + (this.idle || 0) * 0.16 * Math.sin(this.time * 0.42 + 0.7);
    const qPitch = this._q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), hPitch);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), hYaw);
    head.quaternion.copy(qYaw.multiply(qPitch));
    this.headPitch = hPitch;
  }

  updateTail(p, w) {
    const rig = this.rig;
    const tl = rig.D.tail;
    const segs = tl.segs;
    const segLen = tl.len / segs;
    const idle = this.idle || 0, ti = this.time;
    const swing = 0.16 * Math.sin(2 * w + 1.0) + 0.07 * Math.sin(4 * w + 2.2)
      + idle * (0.16 * Math.sin(ti * 0.9) + 0.06 * Math.sin(ti * 2.1));
    const el0 = -1.348;   // rest elevation (rad) - tail hangs close to the body
    const pts = this.tailPts;
    pts[0].copy(tl.root);
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const az = Math.PI + swing * Math.pow(t, 1.4);
      const el = el0 + 0.10 * Math.sin(2 * w + 1.0) * t + 0.06 * t;
      const ce = Math.cos(el);
      const d = this._v.set(ce * Math.cos(az), Math.sin(el), ce * Math.sin(az));
      pts[i + 1].copy(pts[i]).addScaledVector(d, segLen);
    }
    rig.tail.mesh.update(pts);
    const last = pts[segs], prev = pts[segs - 1];
    const dir = this._v.subVectors(last, prev).normalize();
    rig.tail.tuft.position.copy(last);
    rig.tail.tuft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  }

  updateHeadFx(dt, p, w) {
    const head = this.rig.head;
    // ear flicks on a jittered schedule
    this.nextTwitch -= dt;
    if (this.nextTwitch <= 0) {
      this.nextTwitch = 1.6 + Math.random() * 3.5;
      this.twitch = 0.28;
    }
    if (this.twitch > 0) {
      this.twitch -= dt;
      const k = Math.max(0, this.twitch) / 0.28;
      const f = Math.sin(k * Math.PI * 2.2) * k;
      for (let i = 0; i < head.ears.length; i++) {
        const e = head.ears[i];
        const s = i === 0 ? 1 : -1;
        e.quaternion.copy(this.earRest[i])
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), s * f * 0.5))
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), f * 0.22));
      }
    }
    // breathing through the nostrils
    const br = 1 + 0.14 * Math.sin(this.time * 1.6) + 0.05 * Math.sin(this.time * 3.2);
    for (const n of head.nostrils) n.scale.set(br, 1 + 0.10 * (br - 1) / 0.14, 1);
  }
}
