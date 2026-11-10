/* anim.js — quadruped gait, 2-bone IK, secondary motion */
'use strict';

const GAIT = { T: 1.25, duty: 0.60, reach: 0.40, liftF: 0.26, liftH: 0.32 };
GAIT.v = 2 * GAIT.reach / (GAIT.duty * GAIT.T);      /* m/s ~1.07 */
const PHASES = [0.0, 0.5, 0.25, 0.75];                /* LH, RH, LF, RF — lateral walk */

/* ---- foot trajectory in root space ---- */
function footTarget(leg, i, t, out) {
  const ph = fract(t / GAIT.T + PHASES[i]);
  const hipZ = leg.pivot.z, hipY = leg.pivot.y;
  const fore = leg.fore;
  if (ph < GAIT.duty) {                                /* stance — planted */
    const u = ph / GAIT.duty;
    out.set(leg.pivot.x, 0, hipZ + GAIT.reach - 2 * GAIT.reach * u);
    return { stance: true, u: u, w: 0 };
  }
  const w = (ph - GAIT.duty) / (1 - GAIT.duty);        /* swing */
  const swingDur = (1 - GAIT.duty) * GAIT.T;
  const m = -GAIT.v * swingDur;
  const z = hermite(hipZ - GAIT.reach, hipZ + GAIT.reach, m, m, w);
  const lift = fore ? GAIT.liftF : GAIT.liftH;
  const y = lift * Math.pow(Math.sin(PI * w), 1.15);
  out.set(leg.pivot.x, y, z);
  return { stance: false, u: 1, w: w };
}

/* ---- 2-bone IK: rootPos -> target, bones l1,l2, bend hint ---- */
const _d = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3(),
  _dir1 = new THREE.Vector3(), _elbow = new THREE.Vector3(), _dir2 = new THREE.Vector3();

function solveTwoBone(rootPos, targetPos, l1, l2, bend, out) {
  _d.subVectors(targetPos, rootPos);
  const distRaw = _d.length() || 1e-5;
  _u.copy(_d).divideScalar(distRaw);
  const dist = clamp(distRaw, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  let c = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  c = clamp(c, -1, 1);
  const th = Math.acos(c);
  _p.copy(bend).addScaledVector(_u, -bend.dot(_u));
  if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1).addScaledVector(_u, -_u.z);
  if (_p.lengthSq() < 1e-8) _p.set(1, 0, 0).addScaledVector(_u, -_u.x);
  _p.normalize();
  _dir1.copy(_u).multiplyScalar(Math.cos(th)).addScaledVector(_p, Math.sin(th));
  _elbow.copy(rootPos).addScaledVector(_dir1, l1);
  _dir2.subVectors(targetPos, _elbow);
  if (_dir2.lengthSq() < 1e-8) _dir2.copy(_u); else _dir2.normalize();
  out.dir1 = out.dir1 || new THREE.Vector3();
  out.dir2 = out.dir2 || new THREE.Vector3();
  out.dir1.copy(_dir1); out.dir2.copy(_dir2);
  out.unreachable = distRaw > l1 + l2 + 1e-3;
}

/* ---- body transform (bob, sway, roll, pitch) ---- */
function applyBodyMotion(t) {
  const w = TAU * t / GAIT.T;
  const b = G.body;
  b.position.y = -0.012 * (1 - Math.cos(2 * w));
  b.position.x = 0.022 * Math.sin(w + 0.5);
  b.position.z = 0;
  b.rotation.x = 0.010 * Math.sin(2 * w + 1.2);
  b.rotation.y = 0.008 * Math.sin(w);
  b.rotation.z = 0.017 * Math.sin(w + 0.4);
  b.updateMatrixWorld(true);
}

const _sol = {};
const _footRoot = new THREE.Vector3(), _footBody = new THREE.Vector3(),
  _carpus = new THREE.Vector3(), _n = new THREE.Vector3();

function solveLeg(leg, i, t) {
  const st = footTarget(leg, i, t, _footRoot);
  _footBody.copy(_footRoot);
  G.body.worldToLocal(_footBody);

  /* distal (cannon) direction: foot -> carpus/hock */
  if (st.stance) {
    _n.subVectors(leg.pivot, _footBody).normalize();
  } else {
    const reach = GAIT.reach, hipY = leg.pivot.y;
    const aLift = Math.atan2(reach, hipY);
    const aTd = -aLift;
    const flex = leg.fore ? 0.17 : 0.11;
    const a = lerp(aLift, aTd, smoothstep(0, 1, st.w)) + flex * Math.sin(PI * st.w);
    _n.set(0, Math.cos(a), Math.sin(a));
  }
  _carpus.copy(_footBody).addScaledVector(_n, leg.LD);

  solveTwoBone(leg.pivot, _carpus, leg.L1, leg.L2, leg.bend, _sol);
  const q1 = quatAlong(_sol.dir1);
  const q2b = quatAlong(_sol.dir2);
  const dir3 = _n.clone().negate();
  const q3b = quatAlong(dir3);

  leg.up.quaternion.copy(q1);
  leg.lo.quaternion.copy(q1.clone().invert().multiply(q2b));
  leg.di.quaternion.copy(q2b.clone().invert().multiply(q3b));

  /* hoof roll: heel lifts at toe-off */
  let pitch = 0;
  if (st.stance) pitch = -0.32 * smoothstep(0.72, 1.0, st.u);
  else pitch = -0.32 * (1 - smoothstep(0, 0.45, st.w));
  leg.hoof.rotation.x = pitch;
}

/* ---- secondary motion ---- */
function blinkAmount(t, seedOffset) {
  const period = 4.2 + seedOffset * 1.7;
  const phase = fract((t + seedOffset * 2.3) / period);
  const at = 0.94;
  const d = Math.abs(phase - at);
  return d < 0.035 ? Math.cos(d / 0.035 * PI / 2) : 0;
}

function updateGiraffe(t) {
  applyBodyMotion(t);
  G.body.updateMatrixWorld(true);
  for (let i = 0; i < 4; i++) solveLeg(G.legs[i], i, t);

  const w = TAU * t / GAIT.T;
  const n = G.neckGroups;
  n[0].rotation.y = 0.034 * Math.sin(w + 0.1);
  n[0].rotation.z = 0.012 * Math.sin(w + 0.9);
  n[1].rotation.y = 0.026 * Math.sin(w - 0.45);
  n[1].rotation.z = 0.010 * Math.sin(w + 0.3);
  n[2].rotation.y = 0.020 * Math.sin(w - 0.95);
  n[2].rotation.x = 0.014 * Math.sin(2 * w + 0.4);

  const h = G.head;
  h.rotation.y = -0.05 * Math.sin(w - 1.35) + 0.055 * Math.sin(t * 0.37) + 0.03 * Math.sin(t * 0.83);
  h.rotation.x = 0.030 * Math.sin(2 * w + 0.8) + 0.022 * Math.sin(t * 0.61 + 1.1);
  h.rotation.z = 0.014 * Math.sin(t * 0.47);

  /* ears flick */
  for (let i = 0; i < 2; i++) {
    const base = G.earBase[i];
    const ph = fract((t + i * 3.7) / 6.1);
    const flick = ph > 0.86 && ph < 0.94 ? Math.sin((ph - 0.86) / 0.08 * PI) : 0;
    const idle = 0.05 * Math.sin(t * 1.1 + i * 2.4);
    const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1),
      (i ? -1 : 1) * (idle + flick * 0.5));
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), flick * 0.35);
    G.ears[i].quaternion.copy(base).multiply(qz).multiply(qx);
  }

  /* blink */
  for (let i = 0; i < 2; i++) {
    G.lids[i].rotation.x = 1.52 * blinkAmount(t, i);
  }

  /* tail swish */
  const tw = TAU * 0.62 * t;
  G.tail[0].rotation.z = 0.20 * Math.sin(tw) + 0.09 * Math.sin(tw * 1.7 + 1.0);
  G.tail[0].rotation.x = 0.07 * Math.sin(TAU * 0.41 * t + 0.6);
  G.tail[1].rotation.z = 0.14 * Math.sin(tw - 0.9);
  G.tail[1].rotation.x = 0.05 * Math.sin(TAU * 0.41 * t - 0.7);
  G.tail[2].rotation.z = 0.24 * Math.sin(tw - 1.9);
}
