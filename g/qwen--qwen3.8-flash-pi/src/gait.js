/* giraffe-world / gait.js — procedural quadruped locomotion.

   Approach
   --------
   * The actor root translates/turns in the world; the body only bobs inside
     the root.  So a hoof that is "planted" is described by a fixed world
     point, which in body-local space sweeps backwards at exactly the travel
     speed -> no foot slide, ever, at any frame rate.
   * Stance: the fetlock sweeps from +A to -A (A = speed*stance/(2*freq))
     with a flat sole; swing: it returns under an arc with the knee leading.
   * Bones are driven by an analytic 2-segment IK with a pole vector
     (carpus forward, stifle forward, hock bulge baked into the mesh).
   * Body bob/roll/pitch, neck bob, head counter-roll, tail swish, ear
     flicks and blinks are layered on top.

   Gait: giraffes PACE.  Ipsilateral feet move in near-unison, the hind foot
   touching down a little ahead of the fore foot on the same side, sequence
   LH -> LF -> RH -> RF.  Diagonal pairs would be wrong for this animal.   */
(function (root) {
  'use strict';
  var GW = root.GW, M = GW.math, THREE = root.THREE;
  var Gait = GW.Gait = {};
  var DIMS = GW.Giraffe.dims;
  var LEGS = ['LF', 'RF', 'LH', 'RH'];

  var GAITS = {
    walk: {
      stance: 0.62, lift: 0.155, stride: 2.60, dStride: 0.34, freqRef: 1.25,
      phases: { LH: 0.00, LF: 0.115, RH: 0.50, RF: 0.615 },
      bob: 0.055, roll: 1.5, pitch: 0.6, sway: 0.05, neck: 2.0, head: 1.6,
      lean: 0.05, support: 1.18, maxSpeed: 2.2
    },
    trot: {
      stance: 0.40, lift: 0.30, stride: 3.30, dStride: 0.30, freqRef: 4.2,
      phases: { LH: 0.00, RF: 0.03, LF: 0.50, RH: 0.53 },
      bob: 0.085, roll: 2.4, pitch: 1.6, sway: 0.075, neck: 3.6, head: 3.4,
      lean: 0.08, support: 0.80, maxSpeed: 6.5
    },
    rack: {                       /* the fast 2-beat lateral gait they really use */
      stance: 0.34, lift: 0.42, stride: 3.60, dStride: 0.30, freqRef: 7.0,
      phases: { LH: 0.00, LF: 0.10, RH: 0.50, RF: 0.60 },
      bob: 0.095, roll: 3.2, pitch: 2.4, sway: 0.10, neck: 4.5, head: 4.2,
      lean: 0.10, support: 0.68, maxSpeed: 11
    },
    idle: {
      stance: 1.0, lift: 0.0, stride: 0.0, dStride: 0.0, freqRef: 0.25,
      phases: { LH: 0.00, LF: 0.05, RH: 0.50, RF: 0.55 },
      bob: 0.012, roll: 0.35, pitch: 0.18, sway: 0.02, neck: 0.35, head: 0.3,
      lean: 0.0, support: 2.4, maxSpeed: 0.05
    }
  };
  Gait.GAITS = GAITS;

  /* --------------------------------------------------------------- create -- */
  Gait.create = function (rig, opts) {
    opts = opts || {};
    var s = {
      rig: rig,
      gait: opts.gait || 'walk',
      speed: opts.speed == null ? 1.25 : opts.speed,
      radius: opts.radius == null ? 26 : opts.radius,
      turn: 0, heading: opts.heading || 0,
      freq: 0.6, stride: 2.0, stance: 0.62, lift: 0.15,
      phase: 0, time: 0, travel: 0, steps: 0,
      params: GAITS.walk,
      blink: { t: 1.5 + Math.random() * 3, closed: 0, hold: -1 },
      ear: { L: 0, R: 0, t: 1 },
      look: { yaw: 0, yawT: 0, pitch: 0, t: 2 },
      weight: { side: 0, t: 4 },
      tail: { a: 0, a2: 0 },
      contact: {}, dust: [],
      onStep: null, onRecenter: null,
      center: new THREE.Vector3(),
      support: 0, rollSum: 0
    };
    LEGS.forEach(function (n) {
      s.contact[n] = { down: true, u: 1, since: 0, pressure: 1 };
    });
    s._tmp = { swing: false, ang: 0, sx: 0, sy: 0, sz: 0 };
    setSpeed(s, s.speed, s.gait);
    return s;
  };

  function setSpeed(s, v, gait) {
    var g = GAITS[gait || s.gait];
    s.gait = gait || s.gait;
    s.params = g;
    s.speed = v;
    s.stance = g.stance;
    if (gait === 'idle' || v <= 0.02) {
      s.stride = 0;
      s.freq = g.freqRef;
      s.lift = 0;
      s.stance = 1;
      s.speed = gait === 'idle' ? 0 : v;
    } else {
      s.stride = Math.max(1.0, g.stride + g.dStride * (v - g.freqRef));
      s.freq = v / s.stride;                 /* keeps the planted sweep exact */
      s.lift = g.lift * M.clamp(0.55 + 0.2 * v / g.freqRef, 0.5, 1.6);
    }
    s.A = s.speed * s.stance / (2 * s.freq); /* half of the planted sweep     */
  }
  Gait.setSpeed = function (s, v) { setSpeed(s, v, s.gait); };
  /* shift every planted hoof by a world delta (used when the scene recentres) */
  Gait.shiftAnchors = function (s, d) {
    LEGS.forEach(function (n) {
      var c = s.contact[n];
      if (c.anchor) c.anchor.sub(d);
    });
  };
  Gait.setGait = function (s, name) {
    var v = s.speed;
    if (name === 'idle') v = 0;
    else if (name === 'walk') v = M.clamp(v || 1.25, 0.2, GAITS.walk.maxSpeed);
    else if (name === 'trot') v = M.clamp(v || 4.2, 1.8, GAITS.trot.maxSpeed);
    else v = M.clamp(v || 7, 4, GAITS.rack.maxSpeed);
    setSpeed(s, v, name);
  };

  /* ------------------------------------------------------------ sole path --
     Describes the SOLVE point (sole of the hoof) in root space, relative to
     the leg's hip.  Planting the *sole* (not the fetlock) is what kills foot
     slide: the heel/toe pitch then only moves the fetlock fore-aft.         */
  function hoofTarget(s, L, p, out) {
    var st = s.stance, A = s.A;
    var tz = L.hipPos.z * 0.90;              /* feet track near one line     */
    out.sz = tz;
    if (s.gait === 'idle') {
      out.sx = L.front ? 0.03 : -0.04;
      out.sy = 0;
      out.ang = 0; out.swing = false;
      return out;
    }
    if (p < st) {
      var u = p / st;
      out.sx = A * (1 - 2 * u);
      out.sy = 0;
      /* heel strike, whole sole down by early mid-stance, toe lifts to go */
      out.ang = -0.24 * M.smoothstep(0, 0.16, u) + 0.28 * M.smoothstep(0.76, 1, u);
      tz += 0.010 * L.side * Math.sin(Math.PI * u);      /* splay under load */
      out.swing = false;
    } else {
      var q = (p - st) / (1 - st);
      var eq = M.smoothstep(0, 1, q);
      out.sx = -A + 2 * A * eq;
      var arc = Math.sin(Math.PI * Math.pow(q, 0.78));
      out.sy = s.lift * arc + 0.02 * Math.sin(Math.PI * q);
      out.ang = 0.30 - 0.60 * eq + 0.12 * Math.sin(Math.PI * q) * 0.5;
      tz += 0.028 * L.side * arc;
      out.swing = true;
    }
    if (s.turn) {                            /* corners: outside legs reach out */
      out.sx += s.turn * (L.front ? 0.16 : 0.10) * (L.side > 0 ? 1 : -1) * 0.6;
      tz += s.turn * 0.55 * (L.front ? 0.7 : 1.0) * L.side;
    }
    out.sz = tz;
    return out;
  }

  /* ---------------------------------------------------------------- IK ---- */
  var _bq = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  var _bodyInv = new THREE.Quaternion();
  var _latBody = new THREE.Vector3();
  var _bm = new THREE.Matrix4();
  var _bv = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function () { return new THREE.Vector3(); });
  var basisQuat = GW.Giraffe.basisQuat;

  function solveLeg(s, L, targetRoot, footAng, footYaw, latBody, poleRoot, bodyInv) {
    var body = s.rig.body;
    var T = _bv[0].copy(targetRoot).applyMatrix4(_bm.copy(body.matrix).invert());
    var hp = L.hipNow || L.hipPos;
    var H = _bv[1].set(hp.x, hp.y, hp.z);
    var d = _bv[2].subVectors(T, H);
    var A = L.A, B = L.B;
    var raw = d.length();
    var maxLen = (A + B) * 0.9995, minLen = Math.abs(A - B) + 0.02;
    var len = M.clamp(raw, minLen, maxLen);
    var e1 = _bv[3].copy(d).divideScalar(raw || 1);
    var cosA = (A * A + len * len - B * B) / (2 * A * len);
    var alpha = Math.acos(M.clamp(cosA, -1, 1));

    var pole = _bv[4].copy(poleRoot).applyQuaternion(bodyInv);
    pole.addScaledVector(e1, -pole.dot(e1));
    if (pole.lengthSq() < 1e-7) pole.set(0, 0, 1); else pole.normalize();

    var upper = _bv[5].copy(e1).multiplyScalar(Math.cos(alpha)).addScaledVector(pole, Math.sin(alpha)).normalize();
    var kneeP = _bv[6].copy(H).addScaledVector(upper, A);
    var lower = _bv[7].subVectors(T, kneeP);
    lower.divideScalar(lower.length() || 1);

    var hipQ = basisQuat(upper, latBody, _bq[0]);
    L.hip.quaternion.copy(hipQ);

    var invHip = _bq[1].copy(hipQ).invert();
    var lowLocal = lower.clone().applyQuaternion(invHip);
    var latL = latBody.clone().applyQuaternion(invHip);
    var kneeQ = basisQuat(lowLocal, latL, _bq[2]);   /* knee-local -> hip-local */
    L.knee.quaternion.copy(kneeQ);

    /* foot direction in ROOT space: plumb, pitched by footAng, yawed out by
       footYaw (giraffe toes point slightly toed-out)                        */
    _fd.set(Math.sin(footAng) * Math.cos(footYaw), -Math.cos(footAng),
      Math.sin(footAng) * Math.sin(footYaw));
    var fd = _fd2.copy(_fd).applyQuaternion(bodyInv);
    var latR = new THREE.Vector3(0, 0, 1).applyQuaternion(bodyInv);
    var ankQ = basisQuat(fd, latR, _bq[3]);
    var worldKnee = _bq[1].copy(hipQ).multiply(kneeQ);
    L.ankle.quaternion.copy(worldKnee).invert().multiply(ankQ);

    /* where the sole actually ended up, in root space (this is what the
       renderer shows, so slide and penetration are measured from it)      */
    var ankleP = _bv[8].copy(kneeP).addScaledVector(lower, B);   /* body space */
    var ankleRoot = ankleP.clone().applyMatrix4(body.matrix);
    var soleRoot = ankleRoot.clone().addScaledVector(_fd, L.footLen);
    if (L.sole == null) L.sole = new THREE.Vector3();
    L.sole.copy(soleRoot);
    L.soleY = soleRoot.y;
    L.clamped = len < raw - 1e-4;
    return soleRoot.y;
  }

  /* --------------------------------------------------------------- step ---- */
  var _rootTmp = new THREE.Vector3();
  Gait.step = function (s, dt) {
    var rig = s.rig, body = rig.body, g = s.params;
    if (dt > 0.05) dt = 0.05;
    s.time += dt;
    s.phase = M.fract(s.phase + s.freq * dt);
    s.travel += s.speed * dt;

    /* ---- actor translation + gentle cornering -------------------------- */
    if (s.speed > 0.02) {
      if (s.radius > 0) {
        s.turn = s.speed / s.radius;
        s.heading = M.fract((s.heading + s.turn * dt) / M.TAU) * M.TAU;
        rig.root.position.set(
          Math.sin(s.heading) * s.radius,
          0,
          Math.cos(s.heading) * s.radius);
      } else {
        s.turn = 0;
        rig.root.position.x += Math.cos(s.heading) * s.speed * dt;
        rig.root.position.z -= Math.sin(s.heading) * s.speed * dt;
        if (rig.root.position.length() > 90 && s.onRecenter) {   /* leash */
          var d = rig.root.position.clone();
          rig.root.position.set(0, 0, 0);
          s.onRecenter(d);
        }
      }
      rig.root.rotation.y = s.heading;
    } else {
      s.turn = 0;
      rig.root.rotation.y = s.heading;
    }
    rig.root.updateMatrix();
    rig.root.updateMatrixWorld(true);

    /* ---- support sum: vertical bob & lateral roll ---------------------- */
    var push = 0, roll = 0, pitch = 0;
    for (var i = 0; i < LEGS.length; i++) {
      var n = LEGS[i], L = rig.legs[n];
      var ph = M.fract(s.phase + g.phases[n]);
      L.phase = ph;
      var down = s.gait === 'idle' ? true : ph < s.stance;
      var c = s.contact[n];
      if (down) {
        var u = s.gait === 'idle' ? 0.5 : ph / s.stance;
        var sh = Math.sin(Math.PI * u);
        push += sh; roll += L.side * sh;
        pitch += (L.front ? 1 : -1) * sh * 0.5;
        c.u = u; c.pressure = sh;
      } else { c.u = 1; c.pressure = 0; }
      if (down && !c.down) {
        c.down = true; c.since = s.time; s.steps++;
        /* remember the touchdown point in WORLD space: while a foot is
           planted the body travels past it, so circling cannot slip it.  */
        hoofTarget(s, L, ph, s._tmp);
        c.anchor = (c.anchor || new THREE.Vector3()).set(
          L.hipPos.x + s._tmp.sx, 0, s._tmp.sz
        ).applyMatrix4(rig.root.matrixWorld);
        if (s.onStep) s.onStep(n, L, s);
      } else if (!down && c.down) { c.down = false; }
      L.contact = down;
    }
    s.support = push; s.rollSum = roll;

    /* body transform (local to root: no forward offset, that is the point) */
    var breathe = Math.sin(M.TAU * s.time * (s.speed > 0.02 ? 0.34 : 0.24)) * 0.007;
    var vy = g.bob * (push - g.support) + breathe;
    var rollA = g.roll * M.DEG * (roll * 0.42) + Math.sin(M.TAU * s.time * 0.11) * 0.0035;
    var pitchA = g.pitch * M.DEG * (pitch * 0.3 + 0.25 * Math.sin(M.TAU * s.phase + 1.1));
    if (s.gait === 'idle') {
      rollA += Math.sin(M.TAU * s.time * 0.09) * 0.006;
      vy += Math.sin(M.TAU * s.time * 0.11) * 0.004;
    }
    body.position.set(0, vy, g.sway * roll * 0.35);
    body.rotation.set(rollA, s.turn * 0.55, -pitchA + s.turn * g.lean);
    body.updateMatrix();

    var bodyInv = _bodyInv.copy(body.quaternion).invert();
    var latBody = _latBody.set(0, 0, 1).applyQuaternion(bodyInv);

    /* ---- neck + head ---------------------------------------------------- */
    var p = s.phase;
    var nAmp = g.neck * M.DEG;
    var neckBob = Math.sin(M.TAU * (p + 0.32)) * nAmp * (s.speed > 0.02 ? 1 : 0.25)
      + Math.sin(M.TAU * s.time * 0.07) * nAmp * 0.2;
    var neckSway = Math.sin(M.TAU * (p + 0.1)) * g.neck * M.DEG * 0.5 + Math.sin(M.TAU * s.time * 0.13) * 0.012;
    var lk = s.look;
    lk.t -= dt;
    if (lk.t <= 0) {
      lk.t = 1.8 + Math.random() * 5;
      lk.yawT = (Math.random() - 0.5) * (s.speed > 0.02 ? 0.28 : 0.75);
    }
    lk.yaw = M.damp(lk.yaw, lk.yawT - s.turn * 1.6, 1.6, dt);
    lk.pitch = M.damp(lk.pitch, Math.sin(M.TAU * s.time * 0.05) * 0.05, 1.2, dt);
    var seg = [0.46, 0.34, 0.22];
    var NB = DIMS.neckBase;
    rig.neck.forEach(function (j, i) {
      var f = seg[i];
      j.rotation.z = -NB[i] - neckBob * f - lk.pitch * f * 1.6;
      j.rotation.x = neckSway * f * 1.4 + lk.yaw * f * 0.7;
      j.rotation.y = lk.yaw * f * 0.25;
    });
    /* the neck chain already tips the head's frame forward by NB[0..2];
       bring it back toward horizontal, with a little give so the head
       follows the neck instead of being welded level.                     */
    var neckAccum = NB[0] + NB[1] + NB[2] + neckBob * 1.02 + lk.pitch * 0.9;
    var headLead = neckAccum * 0.78;
    rig.head.rotation.z = headLead - DIMS.headDrop
      + Math.sin(M.TAU * (p + 0.55)) * g.head * M.DEG * 0.55;
    rig.head.rotation.x = -neckSway * 0.45 + lk.yaw * 0.8;
    rig.head.rotation.y = lk.yaw * 0.35;

    /* ---- ears, eyes ----------------------------------------------------- */
    s.ear.t -= dt;
    if (s.ear.t <= 0) {
      s.ear.t = 0.7 + Math.random() * 3.5;
      s.ear[Math.random() < 0.5 ? 'L' : 'R'] = 1;
    }
    s.blink.t -= dt;
    if (s.blink.t <= 0 && s.blink.hold < 0) { s.blink.hold = 0.13; s.blink.t = 2 + Math.random() * 6; }
    if (s.blink.hold > 0) { s.blink.closed = M.damp(s.blink.closed, 1, 30, dt); s.blink.hold -= dt; }
    else if (s.blink.closed > 0.001) { s.blink.closed = M.damp(s.blink.closed, 0, 16, dt); }
    else s.blink.closed = 0;

    ['L', 'R'].forEach(function (k) {
      s.ear[k] *= Math.exp(-5.5 * dt);
      var fl = s.ear[k], e = rig.ears[k], sgn = k === 'L' ? 1 : -1;
      if (e) {
        e.rotation.z = 0.02 + sgn * 0.10 - fl * 0.40 - Math.sin(M.TAU * (p + (k === 'L' ? 0 : 0.5))) * 0.05;
        e.rotation.x = sgn * -0.10 + fl * 0.26 * sgn + lk.yaw * 0.45 * sgn;
        e.rotation.y = sgn * 1.42 + fl * 0.20 + lk.yaw * 0.16;
      }
      var eye = rig.eyes[k];
      if (eye) { eye.lid.rotation.x = -1.55 * s.blink.closed; }
    });

    /* ---- tail ---------------------------------------------------------- */
    var fly = s.gait === 'idle' ? 0.55 : 0.35;
    s.tail.a = (Math.sin(M.TAU * s.time * 0.62) * 0.55 + Math.sin(M.TAU * s.time * 1.9 + 1.1) * 0.2) * 0.5 * fly
      + Math.sin(M.TAU * p) * 0.1 * fly;
    s.tail.a2 = M.damp(s.tail.a2, s.tail.a, 6, dt);   /* follow-through lag */
    rig.tail.forEach(function (j, i) {
      var lag = Math.sin(M.TAU * s.time * 0.62 - i * 0.85) * 0.12 * fly;
      j.rotation.x = s.tail.a * (0.35 + i * 0.45) + lag;
      j.rotation.z = -0.10 - i * 0.03 + Math.sin(M.TAU * p + i * 0.6) * 0.045 * fly;
      j.rotation.y = -i * 0.04;
    });

    /* ---- legs ---------------------------------------------------------- */
    var t = s._tmp;
    for (i = 0; i < LEGS.length; i++) {
      n = LEGS[i]; L = rig.legs[n];
      hoofTarget(s, L, L.phase, t);
      if (t.swing) {
        /* swing ends must meet the world anchor of the next stance */
      } else if (s.gait !== 'idle' && L.contact && s.contact[n].anchor) {
        var w = _rootTmp.copy(s.contact[n].anchor).applyMatrix4(_invRoot.copy(rig.root.matrixWorld).invert());
        var adx = w.x - L.hipPos.x, adz = w.z - L.hipPos.z;
        /* a stale anchor (scene re-centre, teleport) would aim the leg at the
           horizon: fall back to the analytic sweep when it is out of range  */
        if (adx * adx + adz * adz < (L.A + L.B) * (L.A + L.B) * 0.34) {
          t.sx = adx; t.sz = w.z; t.sy = 0;
        }
      }
      /* the scapula and the pelvis rotate with the stride: the limb's root
         travels against the foot, which is what lets a giraffe cover more
         ground than its bone lengths alone would allow.                    */
      var sweep = M.clamp(t.sx / (s.A || 1), -1, 1);
      var rg1 = L.front ? 1 : 0.55;
      L.hipNow = L.hipNow || new THREE.Vector3();
      L.hipNow.set(
        L.hipPos.x + 0.120 * rg1 * sweep,
        L.hipPos.y - (L.front ? 0.030 : 0.022) * rg1 * Math.abs(sweep),
        L.hipPos.z + (L.front ? 0.012 : 0.022) * L.side * Math.max(0, sweep));
      L.hip.position.copy(L.hipNow);
      /* fetlock = sole pushed back up the (pitched, yawed) foot axis */
      var sa = Math.sin(t.ang), ca = Math.cos(t.ang);
      var yaw = L.side * (0.06 + (t.swing ? 0.06 : 0) + 0.05 * Math.abs(t.ang));
      /* the sole target is anchored to the *base* hip; the travelling
         shoulder only changes how the limb has to reach it               */
      _sv.set(L.hipPos.x + t.sx - sa * Math.cos(yaw) * L.footLen,
        t.sy + ca * L.footLen,
        t.sz - sa * Math.sin(yaw) * L.footLen);
      solveLeg(s, L, _sv, t.ang, yaw, latBody, L.front ? _poleF : _poleH, bodyInv);
      L.footAng = t.ang;
      L.swing = t.swing;
    }
    return s;
  };
  var _poleF = new THREE.Vector3(1, 0.12, 0);
  var _poleH = new THREE.Vector3(1, 0.05, 0);
  var _sv = new THREE.Vector3();
  var _fd = new THREE.Vector3(), _fd2 = new THREE.Vector3();
  var _invRoot = new THREE.Matrix4();

  /* world position of the hoof sole, for effects and debugging */
  Gait.hoofWorld = function (s, L, out) {
    out = out || new THREE.Vector3();
    if (L.sole) out.copy(L.sole);
    else out.set(L.hipPos.x, 0, L.hipPos.z);
    return out.applyQuaternion(s.rig.root.quaternion).add(s.rig.root.position);
  };
  Gait.summary = function (s) {
    return {
      gait: s.gait, speed: s.speed, freq: s.freq, stride: s.stride,
      steps: s.steps, travel: s.travel, stance: s.stance, A: s.A
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
