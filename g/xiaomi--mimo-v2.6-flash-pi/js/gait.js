'use strict';
/* ============================================================
   gait.js – procedural locomotion
   * world-locked feet (no skating) + 3-bone IK per leg
   * body height derived from the legs so nothing over-extends
   * pacing gait (what giraffes actually use) with a walk option
   ============================================================ */

const GAITS = {
  pace: { FR: 0.00, FL: 0.50, HR: 0.06, HL: 0.56, duty: 0.62 },
  walk: { FL: 0.25, FR: 0.75, HL: 0.00, HR: 0.50, duty: 0.60 }
};

/* hoof geometry (must match giraffe.js): the toe contact point is
   offset forward of the fetlock, so rolling the hoof lifts the fetlock */
const TOE_LEN = Math.hypot(0.155, 0.30);
const TOE_ANG = Math.atan2(-0.30, 0.155);

class Walker {

  constructor(model) {
    this.model = model;
    this.time = 0;
    this.cycle = 0;
    this.speed = 1.45;          // m/s
    this.gaitName = 'pace';
    this.gait = GAITS.pace;
    this.duty = this.gait.duty;
    this.stride = 1.42;         // m per full cycle
    this.bodyY = model.bodyNominalY;
    this.paused = false;
    this.slow = 1;

    const root = model.root;
    this.feet = model.legs.map(leg => ({
      leg, plant: new THREE.Vector3(), nextPlant: new THREE.Vector3(),
      target: new THREE.Vector3(), wasStance: true, lift: 0.30,
      ph: 0, inStance: true, tSwing: 0
    }));
    for (const f of this.feet) { f.leg.phase = this.gait[f.leg.id]; this.resetFoot(f); }

    this._tmp = new THREE.Vector3();
    this.pts = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    this.flex = 0.075;          // keeps a little bend in every joint
  }

  /* place a foot's plant / next-plant consistently with the current
     cycle phase (used at start-up and whenever the gait changes) */
  resetFoot(f) {
    const leg = f.leg;
    const root = this.model.root;
    const ph = (this.cycle + leg.phase) % 1;
    const z = leg.hipLocal.z, hx = leg.hipLocal.x, fy = leg.fetlockY;
    if (ph < this.duty) {                       // mid-stance
      const s = this.stride * 0.5 - this.stride * (ph / this.duty);
      f.plant.set(root.position.x + hx + s, fy, z);
      f.nextPlant.copy(f.plant).add(V(this.stride, 0, 0));
      f.wasStance = true;
    } else {                                    // airborne
      const rem = (1 - ph) * this.stride / Math.max(this.speed, 0.2);
      const xTouch = root.position.x + this.speed * rem + hx + this.stride * 0.5;
      f.nextPlant.set(xTouch, fy, z);
      f.plant.copy(f.nextPlant).add(V(-this.stride, 0, 0));
      f.wasStance = false;
    }
    f.target.copy(f.plant);
    f.ph = ph; f.inStance = ph < this.duty;
    f.tSwing = f.inStance ? 0 : (ph - this.duty) / (1 - this.duty);
  }

  setGait(name) {
    if (!GAITS[name] || name === this.gaitName) return;
    this.gaitName = name;
    this.gait = GAITS[name];
    this.duty = this.gait.duty;
    for (const f of this.feet) {
      f.leg.phase = this.gait[f.leg.id];
      this.resetFoot(f);
    }
  }

  /* -------------------------------------------------------- */
  update(dt) {
    dt = Math.min(dt, 0.05) * this.slow;
    if (this.paused) dt = 0;
    const m = this.model;
    const root = m.root;

    this.time += dt;
    const period = this.stride / this.speed;          // seconds per cycle
    this.cycle = (this.cycle + dt / period) % 1;
    const cyc = this.cycle;

    /* ---- advance the body ---- */
    root.position.x += this.speed * dt;
    root.position.z = 0;

    /* ---- foot targets in world space ---- */
    const strideV = this.stride;
    for (const f of this.feet) {
      const leg = f.leg;
      const ph = (cyc + leg.phase) % 1;
      const inStance = ph < this.duty;
      if (inStance && !f.wasStance) {              // touchdown
        f.plant.copy(f.nextPlant);
        f.nextPlant.copy(f.plant).add(V(strideV, 0, 0));
      }
      f.wasStance = inStance;

      const tSwing = inStance ? 0 : (ph - this.duty) / (1 - this.duty);
      const pitch = this.hoofPitch(ph, inStance, tSwing);
      /* keep the toe on the ground: the fetlock lifts as the hoof rolls */
      const toeY = -TOE_LEN * Math.sin(TOE_ANG + pitch);

      if (inStance) {
        f.target.copy(f.plant);
        f.target.y = toeY;
      } else {
        f.target.lerpVectors(f.plant, f.nextPlant, smoothstep(tSwing));
        f.target.y = toeY + f.lift * Math.pow(Math.sin(Math.PI * tSwing), 0.85);
      }
      f.ph = ph; f.inStance = inStance; f.tSwing = tSwing; f.pitch = pitch;
    }

    /* ---- body height: never higher than the legs can reach ---- */
    let maxY = Infinity;
    for (const f of this.feet) {
      if (!f.inStance) continue;
      const leg = f.leg;
      const s = f.target.x - root.position.x - leg.hipLocal.x;
      const total = leg.L[0] + leg.L[1] + leg.L[2];
      const reach = Math.sqrt(Math.max(1e-4, total * total - s * s));
      const cand = reach + leg.fetlockY - leg.hipLocal.y;
      if (cand < maxY) maxY = cand;
    }
    if (!isFinite(maxY)) maxY = m.bodyNominalY;
    maxY = Math.min(maxY, m.bodyNominalY + 0.10) - this.flex;
    const k = 1 - Math.exp(-11 * dt);
    this.bodyY += (maxY - this.bodyY) * k;
    this.bodyY = clamp(this.bodyY, m.bodyNominalY - 0.10, m.bodyNominalY + 0.10);

    /* ---- sway / roll / pitch of the torso over the support legs ---- */
    const supportPhase = Math.cos(TAU * (cyc - 0.31));   // +1 = right pair supporting
    const body = m.body;
    body.position.set(0, this.bodyY, 0.030 * supportPhase);
    body.rotation.x = 0.030 * supportPhase;
    body.rotation.y = 0.018 * Math.sin(TAU * (cyc - 0.10));
    body.rotation.z = 0.014 * Math.sin(2 * TAU * cyc + 0.7);

    /* ---- secondary animation ---- */
    this.animate(dt);

    root.updateMatrixWorld(true);

    /* ---- leg IK ---- */
    const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
    for (const f of this.feet) {
      const leg = f.leg;
      const hip = leg.hipLocal;
      /* world → body local; keep the leg in its own plane (z = hip z) */
      const p = this._tmp.copy(f.target).applyMatrix4(inv);

      const pts = this.pts;
      pts[0].x = hip.x; pts[0].y = hip.y;
      pts[3].x = p.x; pts[3].y = p.y;

      /* stance pose ↔ folded swing pose */
      const w = f.inStance ? 0 : Math.pow(Math.sin(Math.PI * f.tSwing), 0.85);
      const turns = [
        lerp(leg.turnsStance[0], leg.turnsSwing[0], w),
        lerp(leg.turnsStance[1], leg.turnsSwing[1], w)
      ];

      solveChainIK(pts, leg.L, leg.limits, turns);

      const a0 = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      const a1 = Math.atan2(pts[2].y - pts[1].y, pts[2].x - pts[1].x);
      const a2 = Math.atan2(pts[3].y - pts[2].y, pts[3].x - pts[2].x);

      const J = leg.joints;
      J[0].rotation.z = angleNorm(a0 + Math.PI / 2);
      J[1].rotation.z = angleNorm(a1 - a0);
      J[2].rotation.z = angleNorm(a2 - a1);

      /* hoof stays flat while planted, rolls over the toe at push-off.
         joint rotations are measured from the bones' rest direction
         (pointing straight down = -90°), so cancel that too. */
      leg.hoofPivot.rotation.z = -a2 - Math.PI / 2 + f.pitch;
    }
  }

  /* hoof roll angle: toe-down through late stance, levels off in swing */
  hoofPitch(ph, inStance, tSwing) {
    if (inStance) {
      const u = ph / this.duty;
      return -24 * DEG * smoothstep((u - 0.40) / 0.60);
    }
    return -24 * DEG * (1 - smoothstep(tSwing / 0.6))
      + 5 * DEG * Math.sin(Math.PI * tSwing);
  }

  /* -------------------------------------------------------- */
  animate(dt) {
    const m = this.model;
    const t = this.time;
    const cyc = this.cycle;
    const sup = Math.cos(TAU * (cyc - 0.31));

    /* neck: counter-rotates a little against the body sway, plus a
       slow independent drift so it never looks mechanical */
    m.neckBase.rotation.y = 0.030 * sup + 0.022 * Math.sin(t * 0.63 + 0.4)
      + 0.014 * Math.sin(t * 1.31 + 2.1);
    m.neckBase.rotation.z = 0.026 * Math.sin(2 * TAU * cyc + 1.4)
      + 0.018 * Math.sin(t * 0.47 + 1.1);
    m.neckBase.rotation.x = 0.014 * Math.sin(t * 0.79 + 0.3);

    /* head */
    const look = Math.sin(t * 0.29) * Math.sin(t * 0.173 + 1.3);
    m.headPivot.rotation.y = 0.10 * look + 0.03 * Math.sin(t * 1.7 + 0.9);
    m.headPivot.rotation.z = -16 * DEG
      + 0.030 * Math.sin(2 * TAU * cyc + 2.6)
      + 0.020 * Math.sin(t * 0.55 + 0.2);
    m.headPivot.rotation.x = 0.03 * Math.sin(t * 0.41 + 2.2);

    /* tail: lazy swish + occasional flick */
    const flick = (t % 6.9);
    const fl = flick < 0.5 ? Math.sin(flick * 34) * Math.exp(-flick * 5.5) : 0;
    m.tailBase.rotation.y = 0.30 * Math.sin(t * 1.9 + 0.7) + 0.55 * fl;
    m.tailBase.rotation.z = 0.10 * Math.sin(t * 2.4) + 0.12 * Math.abs(fl);
    m.tailBase.rotation.x = 0.06 * Math.sin(t * 1.3 + 1.0);

    /* ears twitch independently */
    for (let i = 0; i < m.ears.length; i++) {
      const e = m.ears[i];
      const period = i === 0 ? 8.3 : 11.7;
      const ph = (t + i * 3.1) % period;
      const tw = ph < 0.45 ? Math.sin(ph * 44) * Math.exp(-ph * 7) : 0;
      const base = i === 0 ? -0.10 : 0.10;
      e.rotation.z = base * 0.4 + 0.30 * tw;
      e.rotation.y = (i === 0 ? -1 : 1) * (0.05 * Math.sin(t * 0.9 + i) + 0.22 * tw);
    }
  }

  get focus() {
    return V(this.model.root.position.x + 0.35, 2.55, 0);
  }
}
