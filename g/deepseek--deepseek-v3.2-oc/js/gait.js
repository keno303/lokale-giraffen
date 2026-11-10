/* ==========================================================================
   gait.js — the walk.

   Giraffes are natural pacers: the lateral-sequence gait they use for normal
   walking puts the two left feet and then the two right feet down
   (LH-LF-RH-RF with the ipsilateral pair almost synchronised).  That is the
   default here, and a diagonal sequence is offered as a comparison, because
   it is visibly wrong on a giraffe.

   Approach (this is what makes it read as real):
     1. Each hoof gets an authored trajectory in the *belt* frame: a linear
        backward sweep at exactly the ground speed while planted (so the foot
        never slides), then a cycloid-like swing that reaches forward.
     2. The trunk bobs, sways, rolls and turns on top of that.
     3. A constrained planar CCD solver positions the 4-bone limb so the
        authored contact point lands where the hoof wants to be, while joint
        limits and flexion priors decide *how* it gets there.
   So feet are nailed to the ground and the body articulates over them —
   the opposite of the usual "rotate the joints on sine waves" shortcut.
   ========================================================================== */
(function (GIR) {
  'use strict';
  var P = {};
  GIR.Gait = P;
  var A = GIR.Anat, D = GIR.Deform;
  var DEG = GIR.DEG;

  /* ---------------------------------------------------------------- gaits - */
  /* phases: fraction of a full cycle at which that foot touches down.
     duty: fraction of the cycle the foot stays planted.
     stride: metres the body advances per cycle (stance travel).
     lift: hoof clearance.  The phases below are the classic 4-beat
     lateral sequence of Giraffa camelopardalis.                    */
  P.gaits = {
    walk: {
      label: 'Walk — 4-beat lateral sequence (natural)',
      speed: 1.15, stride: 1.55, duty: 0.62, lift: 0.085,
      phases: { LF: 0.00, LH: 0.955, RF: 0.50, RH: 0.455 },
      protract: { fore: 0.50, hind: 0.50 },
      scapula: { fore: 0.115, hind: 0.235 },
      body: { bob: 0.052, sway: 0.045, roll: 3.2, pitch: 1.0, yaw: 0.9, headBob: 0.030 },
      spine: { lumbar: 1.4, lateral: 1.1, twist: 0.9, neck: 2.6, neckYaw: 1.8 },
      liftFreq: 1
    },
    amble: {
      label: 'Amble — fast pace, longer stride',
      speed: 1.80, stride: 1.95, duty: 0.52, lift: 0.135,
      phases: { LF: 0.00, LH: 0.94, RF: 0.50, RH: 0.44 },
      protract: { fore: 0.60, hind: 0.60 },
      scapula: { fore: 0.15, hind: 0.30 },
      body: { bob: 0.075, sway: 0.062, roll: 4.4, pitch: 1.5, yaw: 1.3, headBob: 0.045 },
      spine: { lumbar: 2.3, lateral: 1.7, twist: 1.3, neck: 3.8, neckYaw: 2.6 },
      liftFreq: 1
    },
    slow: {
      label: 'Careful step — high knee action',
      speed: 0.50, stride: 1.05, duty: 0.70, lift: 0.115,
      phases: { LF: 0.00, LH: 0.96, RF: 0.50, RH: 0.46 },
      protract: { fore: 0.34, hind: 0.34 },
      scapula: { fore: 0.085, hind: 0.17 },
      body: { bob: 0.038, sway: 0.032, roll: 2.4, pitch: 0.8, yaw: 0.7, headBob: 0.022 },
      spine: { lumbar: 1.1, lateral: 0.9, twist: 0.7, neck: 2.0, neckYaw: 1.4 },
      liftFreq: 1
    },
    diagonal: {
      label: 'Diagonal sequence (NOT a giraffe gait — compare)',
      speed: 1.15, stride: 1.55, duty: 0.62, lift: 0.085,
      phases: { LF: 0.00, RH: 0.02, RF: 0.50, LH: 0.52 },
      protract: { fore: 0.50, hind: 0.50 },
      scapula: { fore: 0.115, hind: 0.235 },
      body: { bob: 0.058, sway: 0.05, roll: 2.0, pitch: 1.0, yaw: 0.9, headBob: 0.030 },
      spine: { lumbar: 1.2, lateral: 1.5, twist: 1.4, neck: 2.4, neckYaw: 2.0 },
      liftFreq: 1
    },
    stand: {
      label: 'Standing',
      speed: 0.0, stride: 0.0, duty: 1.0, lift: 0.0,
      phases: { LF: 0, LH: 0, RF: 0, RH: 0 },
      protract: { fore: 0.14, hind: 0.42 },
      scapula: { fore: 0.0, hind: 0.0 },
      body: { bob: 0.0, sway: 0.0, roll: 0.0, pitch: 0.0, yaw: 0.0, headBob: 0.0 },
      spine: { lumbar: 0.0, lateral: 0.0, twist: 0.0, neck: 0.0, neckYaw: 0.0 },
      liftFreq: 0
    }
  };
  P.order = ['stand', 'slow', 'walk', 'amble', 'diagonal'];

  /* ------------------------------------------------------------- create -- */
  P.create = function (rig, gaitName, opts) {
    var g = P.gaits[gaitName] || P.gaits.walk;
    var keys = ['LF', 'RF', 'LH', 'RH'];
    var st = {
      gait: g, gaitName: gaitName,
      t: 0, cycle: 0, belt: 0,
      speed: opts && opts.speed !== undefined ? opts.speed : g.speed,
      strideScale: 1, dutyScale: 1,
      stride: g.stride, duty: g.duty, f: 0, v: 0,
      limbs: {},
      spineW: {
        torso: GIR.bandWeights(rig.torso.def.rings, 0.52, 0.98, 1.2),
        torsoFwd: GIR.bandWeights(rig.torso.def.rings, 0.02, 0.42, 1.2),
        neck: GIR.bandWeights(rig.neck.def.rings, 0.25, 1.0, 1.0),
        mane: GIR.bandWeights(rig.neck.maneDef.rings, 0.25, 1.0, 1.0)
      },
      torsoSpine: GIR.Spine(rig.torso.def.rings),
      neckSpine: GIR.Spine(rig.neck.def.rings),
      maneSpine: GIR.Spine(rig.neck.maneDef.rings),
      debug: { slideMax: 0, reachMax: 0, overMax: 0, errMax: 0, hoofYMin: 0 },
      look: { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0, nextEvent: 2.5 },
      blink: { v: 0, next: 3.2, closing: false },
      ear: { ph: [0, 0], flick: [0, 0], next: 1.4 },
      tail: { ph: 0 },
      reach: {}
    };
    keys.forEach(function (k) {
      var leg = rig.legs[k];
      st.limbs[k] = {
        leg: leg, phase: g.phases[k],
        s: 0, stance: true,
        target: new THREE.Vector3(), prevTarget: new THREE.Vector3(),
        angles: [leg.restAbs[0], leg.restAbs[1], leg.restAbs[2], leg.restAbs[3]],
        hoof: new THREE.Vector3(), slide: 0, reach: 1, pitchErr: 0,
        anchor: [leg.anchor[0], leg.anchor[1], leg.anchor[2]],
        landJitter: 0, liftPeak: 0
      };
    });
    P.resize(st);
    return st;
  };

  P.setGait = function (st, name, speed) {
    var g = P.gaits[name];
    if (!g) return;
    st.gait = g; st.gaitName = name;
    st.speed = speed === undefined ? g.speed : speed;
    P.resize(st);
  };

  /* derive frequency / stride from speed, keeping the stride inside reach */
  /* For every limb: with the sole flat on the ground the fetlock has to sit at
     (gx - l4 sin th4, -rootH + l4 cos th4) and the three proximal bones must
     still reach it, so the contact point has a hard fore/aft window.  The
     stance path is centred inside that window, which is what makes the hooves
     plant without ever being dragged. */
  function placement(st, k) {
    var leg = st.limbs[k].leg, g = st.gait;
    var l4 = leg.lengths[3], th4 = leg.restAbs[3];
    var maxR = (leg.lengths[0] + leg.lengths[1] + leg.lengths[2]) * 0.995;
    var rootH = leg.anchor[1];
    var fy = -rootH + l4 * Math.cos(th4);
    var fx = Math.sqrt(Math.max(0.01, maxR * maxR - fy * fy));
    var foot = l4 * Math.sin(th4);
    /* the scapula / pelvis swings fore and back with the limb, which moves the
       whole reach window along with it */
    var sc = g.scapula[leg.kind === 'fore' ? 'fore' : 'hind'];
    var lo = foot - fx - sc, hi = foot + fx + sc;
    var rest = leg.nominal;
    var center = GIR.lerp(rest, (lo + hi) * 0.5, 0.5);
    var half = Math.min(center - lo, hi - center);
    st.limbs[k].win = [+lo.toFixed(3), +hi.toFixed(3)];
    st.limbs[k].center = center;
    st.limbs[k].half = half;
    return half;
  }

  P.resize = function (st) {
    var g = st.gait;
    st.v = st.speed;
    var half = Math.min(placement(st, 'LF'), placement(st, 'RF'),
                        placement(st, 'LH'), placement(st, 'RH'));
    if (g.stride < 1e-4) { st.stride = 0; st.duty = 1; st.f = 0; st.room = 0; return; }
    st.duty = GIR.clamp(g.duty * (1 - 0.16 * GIR.clamp((st.speed - g.speed) / Math.max(0.2, g.speed), -1, 2)), 0.35, 0.85);
    /* the planted hoof travels stride*duty; keep 8 % of margin at both ends */
    var cap = 2 * half * 0.92 / st.duty;
    st.room = cap;
    var stride = Math.min(g.stride * GIR.clamp(st.speed / g.speed, 0.35, 1.6), cap);
    st.stride = stride;
    st.f = st.speed > 1e-5 ? st.speed / stride : 0;
    st.f = GIR.clamp(st.f, 0.15, 1.6);
  };

  /* ---------------------------------------------------------- trajectories */
  function swingShape(u, m0) {
    /* cubic Hermite: S(0)=0 S(1)=1 S'(0)=m0 S'(1)=0 */
    var u2 = u * u, u3 = u2 * u;
    return m0 * (u3 - 2 * u2 + u) + (3 * u2 - 2 * u3);
  }

  /* Authored hoof contact point in the world frame + sole pitch.

     The hoof group's origin is the centre of its ground contact patch, whose
     extreme points sit at x = -0.055 (heel) and +0.095 (toe) in hoof space.
     Rolling over the foot therefore means: pitch the sole and move the origin
     so that the *instantaneous* contact stays exactly where the planted hoof
     was placed.  That yields heel-strike, flat mid-stance and toe break-over
     for free, and the hoof can never sink below the ground. */
  var HHEEL = -0.055, HTOE = 0.095;
  function hoofTrajectory(st, lb, out) {
    var g = st.gait, leg = lb.leg, isFore = leg.kind === 'fore';
    var duty = st.duty, stride = st.stride;
    var pro = g.protract[isFore ? 'fore' : 'hind'];
    /* mid-stance placement: the animal's rest position at a standstill, the
       centre of the reachable window as soon as it actually walks */
    var mid = GIR.lerp(leg.nominal, lb.center || leg.nominal, GIR.smoothstep(0.03, 0.5, stride));
    /* landing point: half a stance-travel protracted, plus a style bias */
    var xLand = leg.anchor[0] + mid + stride * duty * 0.5 + (pro - 0.5) * 0.12 * stride;
    var cx, y = 0, psi, s = lb.s, u;
    if (stride <= 1e-4 || s < duty) {
      /* stance: the contact travels backwards with the belt at ground speed */
      var t = stride > 0 ? s / duty : 0;
      cx = xLand - stride * s;
      var brk = GIR.smoothstep(0.62, 1.0, t);
      psi = (8 * DEG) * (1 - GIR.smoothstep(0.05, 0.42, t)) - (26 * DEG) * brk;
      out.stance = true;
    } else {
      u = (s - duty) / (1 - duty);
      var m0 = -(1 - duty) * 0.8;
      /* the foot lifts behind the body and has to be thrown forward again by
         exactly the distance it was carried backwards during stance */
      var span = stride * duty;
      cx = xLand - span + span * swingShape(u, m0);
      y = g.lift * Math.pow(Math.sin(Math.PI * u), 1.35);
      /* the toe clears the ground first, then the hoof flattens to land */
      psi = (-26 * DEG) + (34 * DEG) * GIR.smoothstep(0.0, 0.26, u)
            + (10 * DEG) * GIR.smoothstep(0.72, 1.0, u);
      out.stance = false;
    }
    /* pitch -> where the sole actually touches, and how much to lift */
    var xc = (psi >= 0 ? HHEEL : HTOE) * Math.cos(psi);
    var yc = -(psi >= 0 ? HHEEL : HTOE) * Math.sin(psi);
    out.x = cx - xc;
    out.y = y + yc;
    /* a little lateral placement scatter, plus the odd uneven step */
    out.z = leg.hoofZ + Math.sin(lb.phase * 7.3 + (isFore ? 0.4 : 1.9)) * 0.012;
    out.psi = psi;
    out.xLand = xLand;
    return out;
  }

  /* ------------------------------------------------------------- solver -- */
  /* Planar constrained CCD over the three proximal absolute angles.
     root pivot is the origin of the leg frame; bones point down. */
  var tmp = { };
  function solveLimb(lb, st, fx, fy) {
    var leg = lb.leg, lim = leg.limits, pri = leg.priors;
    var l1 = leg.lengths[0], l2 = leg.lengths[1], l3 = leg.lengths[2];
    /* reach clamp: pull the goal inside the usable sphere */
    var dist = Math.sqrt(fx * fx + fy * fy);
    var maxR = (l1 + l2 + l3) * 0.998;
    var minR = (l1 + l2 + l3) * 0.30;
    var reach = 1;
    var ext0 = dist / maxR;
    if (dist > maxR) { fx *= maxR / dist; fy *= maxR / dist; reach = dist / maxR; }
    else if (dist < minR) { var k = minR / (dist || 1e-6); fx *= k; fy *= k; reach = minR / dist; }
    lb.reach = ext0;                 /* how straight the limb is, 1 = locked out */
    lb.over = reach > 1 ? reach : 0; /* how far the goal was outside reach */

    var th = lb.angles;
    var it, i;
    /* joint i pivot positions, computed from the current angles */
    function fk() {
      var x1 = l1 * Math.sin(th[0]), y1 = -l1 * Math.cos(th[0]);
      var x2 = x1 + l2 * Math.sin(th[1]), y2 = y1 - l2 * Math.cos(th[1]);
      var x3 = x2 + l3 * Math.sin(th[2]), y3 = y2 - l3 * Math.cos(th[2]);
      tmp.p = [x1, y1, x2, y2, x3, y3];
      return tmp.p;
    }
    var priorRel = [pri.root * DEG, pri.elbow !== undefined ? pri.elbow * DEG : pri.knee * DEG,
                    pri.carpus !== undefined ? pri.carpus * DEG : pri.hock * DEG];
    var relLim = [lim.root, lim.elbow !== undefined ? [lim.elbow[0], lim.elbow[1]] : [lim.knee[0], lim.knee[1]],
                  lim.carpus !== undefined ? [lim.carpus[0], lim.carpus[1]] : [lim.hock[0], lim.hock[1]]];
    /* How much freedom the redundant posture angle has: a limb that is nearly
       straight (stance strut) must stay straight, a folded one (swing) can be
       arranged however it looks most natural. */
    var slack = GIR.clamp((0.86 - ext0) / 0.30, 0, 1);
    var pw = 0.05 + 0.30 * slack;
    for (it = 0; it < 18; it++) {
      for (i = 0; i < 3; i++) {
        var p = fk();
        var px = i === 0 ? 0 : p[(i - 1) * 2], py = i === 0 ? 0 : p[(i - 1) * 2 + 1];
        var ex = p[4], ey = p[5];                     /* chain end (fetlock) */
        var vx = ex - px, vy = ey - py;
        var wx = fx - px, wy = fy - py;
        var vn = Math.sqrt(vx * vx + vy * vy), wn = Math.sqrt(wx * wx + wy * wy);
        if (vn < 1e-5 || wn < 1e-5) continue;
        var dot = (vx * wx + vy * wy) / (vn * wn);
        var cross = (vx * wy - vy * wx) / (vn * wn);
        var d = Math.atan2(cross, dot);
        /* joint limits on this joint's relative angle */
        var rel = i === 0 ? th[0] : th[i] - th[i - 1];
        var lo = relLim[i][0] * DEG, hi = relLim[i][1] * DEG;
        var dlo = lo - rel - 1e-4, dhi = hi - rel + 1e-4;
        if (it < 13) { d = GIR.clamp(d, dlo, dhi); }
        else {
          /* last passes: relax towards the flexion prior, but only as far as
             the redundant direction allows so the hoof stays planted */
          var want = priorRel[i] - rel;
          d = GIR.clamp(d + want * pw, dlo, dhi);
        }
        for (var j = i; j < 3; j++) th[j] += d;
      }
    }
    /* final clamp so nothing hyperextends on the way out */
    for (i = 0; i < 3; i++) {
      var r = i === 0 ? th[0] : th[i] - th[i - 1];
      var lo2 = relLim[i][0] * DEG, hi2 = relLim[i][1] * DEG;
      if (r < lo2) { var dd = lo2 - r; for (var j2 = i; j2 < 3; j2++) th[j2] += dd; }
      if (r > hi2) { var dd2 = r - hi2; for (var j3 = i; j3 < 3; j3++) th[j3] -= dd2; }
    }
    return th;
  }

  /* --------------------------------------------------------------- apply -- */
  function setLegGroups(leg, th, psi) {
    var g = leg.joints;
    g[0].rotation.z = th[0];
    g[1].rotation.z = th[1] - th[0];
    g[2].rotation.z = th[2] - th[1];
    /* foot bone absolute angle is authored by the sole pitch */
    var th4 = leg.restAbs[3] + psi;
    g[3].rotation.z = th4 - th[2];
    return th4;
  }

  P.update = function (rig, st, dt) {
    var g = st.gait, i, k;
    st.t += dt;
    st.cycle = GIR.mod1(st.cycle + st.f * dt);
    st.belt += st.v * dt;
    var phi = st.cycle;

    /* ---------------------------------------------------------- trunk pose */
    var b = g.body;
    var rollT = Math.sin(TWOPI(phi)) * b.roll * DEG;
    var swayT = Math.sin(TWOPI(phi)) * b.sway;
    var bobT = -Math.abs(Math.sin(Math.PI * phi * 2)) * 0;
    /* two vertical beats per cycle (each footfall pair lands) */
    bobT = -b.bob * 0.5 * (1 - Math.cos(TWOPI(phi * 2 * (g.liftFreq || 1))));
    var pitchT = Math.sin(TWOPI(phi) + 1.2) * b.pitch * DEG;
    var yawT = Math.sin(TWOPI(phi) + 0.4) * b.yaw * DEG;

    /* ------------------------------------------------------- limb solving */
    var keys = ['LF', 'RF', 'LH', 'RH'];
    var outTraj = { x: 0, y: 0, z: 0, psi: 0, stance: true, xLand: 0 };
    var diagSlide = 0, diagReach = 0, diagOver = 0, diagY = 1e9, diagErr = 0;

    /* body transform first: limbs live in it */
    rig.body.position.set(0, bobT, swayT);
    rig.body.rotation.set(pitchT * 0.0, 0, 0);
    rig.body.rotation.order = 'ZYX';
    rig.body.rotation.z = pitchT;
    rig.body.rotation.y = yawT;
    rig.body.rotation.x = rollT;
    rig.body.updateMatrixWorld(true);

    var invQ = new THREE.Quaternion().copy(rig.body.quaternion).invert();
    var trunkTmp = new THREE.Vector3();

    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      var lb = st.limbs[k], leg = lb.leg;
      lb.s = GIR.mod1(phi - lb.phase);
      hoofTrajectory(st, lb, outTraj);

      /* scapula / pelvis rotation: protracted at touchdown, retracted at
         lift-off, and the joint lifts a little while the limb is unloaded */
      var sc = g.scapula[leg.kind === 'fore' ? 'fore' : 'hind'];
      var dxA = Math.cos(TWOPI(lb.s)) * sc;
      var dyA = (lb.s < g.duty ? 0 : 1) * 0;
      var swing = lb.s >= g.duty ? (lb.s - g.duty) / (1 - g.duty) : 0;
      dyA = 0.022 * Math.sin(Math.PI * swing);
      if (st.stride <= 1e-4) { dxA = 0; dyA = 0; }
      leg.root.position.set(leg.anchor[0] + dxA, leg.anchor[1] + dyA, leg.anchor[2]);

      /* mid-stance load flexion of the knee/carpus */
      var flexBias = 0;
      if (lb.s < st.duty && st.stride > 0) flexBias = 7.5 * DEG * Math.sin(Math.PI * lb.s / st.duty);
      var pri = leg.priors;
      var keyCarpus = pri.carpus !== undefined ? 'carpus' : 'hock';
      var savedPrior = pri[keyCarpus];
      pri[keyCarpus] = savedPrior + flexBias / DEG;

      /* target in belt/world frame -> body frame -> leg frame */
      trunkTmp.set(outTraj.x - leg.root.position.x, outTraj.y - leg.root.position.y, 0);
      var footWorld = new THREE.Vector3(outTraj.x, outTraj.y, outTraj.z);
      var inBody = footWorld.applyQuaternion(invQ);
      /* express relative to the (moving) root, sagittal plane only */
      var gx = inBody.x - leg.root.position.x;
      var gy = inBody.y - leg.root.position.y;
      /* the fetlock goal = contact minus the foot bone vector */
      var th4 = leg.restAbs[3] + outTraj.psi;
      var l4 = leg.lengths[3];
      var fx = gx - l4 * Math.sin(th4);
      var fy = gy + l4 * Math.cos(th4);

      solveLimb(lb, st, fx, fy);
      var th = lb.angles;
      var applied4 = setLegGroups(leg, th, outTraj.psi);
      pri[keyCarpus] = savedPrior;

      /* where did the hoof actually end up? (world) */
      leg.hoof.updateMatrixWorld(true);
      var hw = leg.hoof.getWorldPosition(new THREE.Vector3());
      lb.hoof.copy(hw);
      var slide = Math.abs(hw.x - outTraj.x) + Math.abs(hw.z - outTraj.z);
      lb.slide = slide;
      lb.target.set(outTraj.x, outTraj.y, outTraj.z);
      lb.psi = outTraj.psi;
      lb.stanceNow = outTraj.stance;
      if (outTraj.stance) {
        diagSlide = Math.max(diagSlide, slide);
        diagReach = Math.max(diagReach, lb.reach);
        diagOver = Math.max(diagOver, lb.over);
        diagY = Math.min(diagY, hw.y);
      }
      diagErr = Math.max(diagErr, lb.hoof.distanceTo(lb.target));

      /* hoof sole orientation check: normal of the sole after apply */
      lb.soleAngle = (th4 - leg.restAbs[3]) / DEG;
    }

    /* ------------------------------------------------------------- spine */
    var sw = st.spineW;
    var lumbarPhase = GIR.mod1(phi - 0.72);
    var lumbar = Math.sin(TWOPI(phi)) * g.spine.lumbar * DEG;
    var lat = Math.sin(TWOPI(phi) + 0.9) * g.spine.lateral * DEG;
    var tw = Math.sin(TWOPI(phi) + 0.2) * g.spine.twist * DEG;
    st.torsoSpine.bend(lumbar * 0.5, lat * 0.5, tw * 0.5, sw.torso);
    st.torsoSpine.pitch[0] += 0;
    D.apply(rig.torso.def, st.torsoSpine.build());

    var neckPitch = Math.sin(TWOPI(phi * 2) + 1.0) * g.spine.neck * DEG;
    var neckYaw = Math.sin(TWOPI(phi) + 2.0) * g.spine.neckYaw * DEG;
    var neckRoll = Math.sin(TWOPI(phi) + 0.7) * g.spine.neckYaw * 0.35 * DEG;
    /* slow "surveying": the animal occasionally looks around */
    if (st.t > st.look.nextEvent) {
      st.look.targetYaw = (rnd(st.t * 1.7) - 0.5) * 16 * DEG;
      st.look.targetPitch = (rnd(st.t * 3.1 + 5) - 0.5) * 10 * DEG;
      st.look.nextEvent = st.t + 3.2 + rnd(st.t * 0.9) * 5.5;
    }
    st.look.yaw += (st.look.targetYaw - st.look.yaw) * Math.min(1, dt * 1.1);
    st.look.pitch += (st.look.targetPitch - st.look.pitch) * Math.min(1, dt * 1.1);

    neckYaw += st.look.yaw * 0.55;
    neckPitch += st.look.pitch * 0.45;
    st.neckSpine.bend(neckPitch, neckYaw, neckRoll, sw.neck);
    D.apply(rig.neck.def, st.neckSpine.build());
    st.maneSpine.bend(neckPitch, neckYaw, neckRoll, sw.mane);
    D.apply(rig.neck.maneDef, st.maneSpine.build());

    /* head rides the deformed tip, then stabilises against the neck motion */
    var tipIdx = rig.neck.tipIndex;
    rig.head.joint.position.copy(rig.neck.def.pp[tipIdx]);
    var headStab = -0.38;
    var hq = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      headStab * neckRoll * 0.6,
      headStab * neckYaw * 0.5 + st.look.yaw * 0.45,
      headStab * neckPitch + st.look.pitch * 0.6, 'ZYX'));
    rig.head.joint.quaternion.copy(rig.neck.def.qp[tipIdx])
      .multiply(rig.neck.restTipQ.clone().invert())
      .multiply(rig.head.restQ).multiply(hq);

    /* -------------------------------------------------------------- ears */
    if (st.t > st.ear.next) {
      st.ear.flick = [rnd(st.t) , rnd(st.t + 13)];
      st.ear.next = st.t + 1.6 + rnd(st.t * 2.3) * 3.4;
    }
    for (i = 0; i < 2; i++) {
      var ear = rig.head.ears[i];
      st.ear.ph[i] += dt * (1.4 + i * 0.35);
      var flick = Math.max(0, 1 - Math.abs(((st.t - 0.0) % 4) - i * 0.2)) ;
      var sw2 = Math.sin(st.ear.ph[i] * 2.2) * 0.06;
      var fl = Math.sin(Math.PI * GIR.clamp(1 - Math.abs(rnd(st.t + i * 3) - 0.5) * 2, 0, 1)) ;
      ear.hinge.rotation.y = ear.base.ry + sw2 + Math.sin(st.t * 0.9 + i) * 0.05;
      ear.hinge.rotation.x = ear.base.rx + Math.sin(st.ear.ph[i] * 1.3) * 0.045;
      ear.hinge.rotation.z = Math.sin(st.ear.ph[i] * 0.7) * 0.03;
    }

    /* -------------------------------------------------------------- eyes */
    if (st.t > st.blink.next) { st.blink.closing = true; }
    if (st.blink.closing) {
      st.blink.v += dt / 0.16;
      if (st.blink.v >= 2) {
        st.blink.v = 0; st.blink.closing = false;
        st.blink.next = st.t + 2.4 + rnd(st.t * 5.1) * 5.0;
      }
    }
    var bl = st.blink.closing ? Math.sin(Math.PI * GIR.clamp(st.blink.v / 2, 0, 1)) : 0;
    for (i = 0; i < 2; i++) {
      var eye = rig.head.eyes[i];
      eye.lid.rotation.x = GIR.lerp(eye.openRot, eye.closedRot, bl);
    }

    /* -------------------------------------------------------------- tail */
    st.tail.ph += dt;
    var tp = phi;
    var swish = Math.sin(TWOPI(tp) + 0.6) * (2.5 + 6 * (g.liftFreq || 1) * 0.5) * DEG;
    var flickT = (st.t % 5.5) / 5.5;
    var tailFlick = Math.sin(Math.PI * GIR.smoothstep(0.55, 0.75, flickT) * 2) * 0.5 *
                    (rnd(st.t * 0.37) > 0.45 ? 1 : 0.2);
    /* the base is carried back almost level, then the tail hangs, so the
       joints have to add a considerable counter-flexion */
    rig.tail.root.rotation.z = -1.30 + swish * 0.5 + Math.sin(st.t * 0.8) * 0.02;
    rig.tail.root.rotation.x = Math.sin(TWOPI(tp) + 1.4) * 3.5 * DEG;
    rig.tail.mid.rotation.z = 0.78 + swish + tailFlick * 0.6;
    rig.tail.mid.rotation.x = Math.sin(TWOPI(tp) + 2.2) * 2.5 * DEG;
    rig.tail.tip.rotation.z = 0.42 + swish * 1.2 + tailFlick;
    rig.tail.tip.rotation.x = Math.sin(st.t * 1.7) * 0.05;

    /* --------------------------------------------------------- breathing */
    var br = 1 + 0.012 * Math.sin(TWOPI(st.t * 0.28)) * (1 + st.f * 0.6);
    rig.torso.def.scaleHint = br;

    st.debug.slideMax = diagSlide;
    st.debug.reachMax = diagReach;
    st.debug.overMax = diagOver;
    st.debug.hoofYMin = diagY;
    st.debug.errMax = diagErr;
    return st;
  };

  function TWOPI(x) { return x * GIR.TAU; }
  /* deterministic pseudo-random in [0,1) of a float argument */
  function rnd(x) {
    var s = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s);
  }
  P._rnd = rnd;

  /* ------------------------------------------------------------- helpers -- */
  P.hoofReport = function (st) {
    var out = {}, k;
    for (k in st.limbs) {
      var lb = st.limbs[k];
      out[k] = {
        s: +lb.s.toFixed(3), stance: lb.target.y < 1e-6,
        hoof: [+lb.hoof.x.toFixed(3), +lb.hoof.y.toFixed(3), +lb.hoof.z.toFixed(3)],
        target: [+lb.target.x.toFixed(3), +lb.target.y.toFixed(3), +lb.target.z.toFixed(3)],
        err: +(lb.hoof.distanceTo(lb.target)).toFixed(4),
        angles: lb.angles.map(function (a) { return +(a / GIR.DEG).toFixed(1); }),
        reach: +lb.reach.toFixed(3), psi: +(lb.psi / GIR.DEG).toFixed(1)
      };
    }
    return out;
  };

  P.gaitDiagram = function (st, ctx, w, h) {
    var keys = ['LF', 'RF', 'LH', 'RH'], names = { LF: 'L fore', RF: 'R fore', LH: 'L hind', RH: 'R hind' };
    var rowH = h / 4;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < 4; i++) {
      var k = keys[i], y = i * rowH;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, y + rowH * 0.25, w, rowH * 0.5);
      var d = st.gait.duty, ph = st.limbs[k].phase;
      /* draw the stance bar starting at the touchdown phase */
      var x0 = ((1 - ph) % 1);
      ctx.fillStyle = 'rgba(232,180,90,0.85)';
      var len = d * w;
      var sx = x0 * w;
      if (sx + len > w) { ctx.fillRect(sx, y + rowH * 0.25, w - sx, rowH * 0.5); ctx.fillRect(0, y + rowH * 0.25, sx + len - w, rowH * 0.5); }
      else ctx.fillRect(sx, y + rowH * 0.25, len, rowH * 0.5);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(names[k], 4, y + rowH * 0.22);
    }
    /* playhead */
    ctx.fillStyle = '#fff';
    ctx.fillRect(GIR.mod1(st.cycle) * w, 0, 1.5, h);
    ctx.restore();
  };

})(window.GIR);
