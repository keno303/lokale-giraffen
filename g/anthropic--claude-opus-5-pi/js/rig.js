/* Rig: pose generation (FK + planar leg IK) and skeleton driving.
   The generator produces, for every bone, either an explicit world quaternion
   or a world target position; the driver then converts those into local bone
   rotations ("aim rig"). Because bind poses are translation-only, this is exact. */
(function (global) {
  'use strict';
  var THREE = global.THREE;
  var V3 = THREE.Vector3;
  var Q = THREE.Quaternion;

  // ---------------------------------------------------------- aim driver
  function Driver(model) {
    this.m = model;
    this.order = [];
    var self = this;
    (function walk(b) {
      self.order.push(b);
      b.children.forEach(function (c) { if (c.isBone) walk(c); });
    })(model.rootBone);
    this.aimChild = {};
    this.order.forEach(function (b) {
      var kids = b.children.filter(function (c) { return c.isBone; });
      if (kids.length) self.aimChild[b.name] = kids[0].name;
    });
    // explicit primary aim children where the first child isn't the main axis
    var over = {
      root: 'spineA', withers: 'chest', headBase: 'headTip',
      chest: 'neck1', spineC: 'withers'
    };
    for (var k in over) if (this.aimChild[k] !== undefined) this.aimChild[k] = over[k];
    this._wq = {};
    this._tmpQ = new Q(); this._tmpV = new V3(); this._tmpV2 = new V3();
  }

  Driver.prototype.apply = function (pose) {
    var m = this.m, bw = m.bindWorld, wq = this._wq;
    var pos = pose.pos, quats = pose.quat;
    var idq = new Q();
    for (var i = 0; i < this.order.length; i++) {
      var b = this.order[i];
      var pName = b.userData.parentName;
      var pq = pName ? wq[pName] : idq;
      var world;
      if (quats[b.name]) {
        world = quats[b.name];
      } else {
        var cn = this.aimChild[b.name];
        if (cn && pos[cn] && pos[b.name]) {
          var dir = this._tmpV.subVectors(pos[cn], pos[b.name]);
          if (dir.lengthSq() < 1e-10) { world = pq.clone(); }
          else {
            dir.normalize();
            var bind = this._tmpV2.subVectors(bw[cn], bw[b.name]).normalize();
            bind.applyQuaternion(pq);
            var q = new Q().setFromUnitVectors(bind, dir);
            world = q.multiply(pq);
          }
        } else {
          world = pq.clone();
        }
      }
      wq[b.name] = world;
      if (pName) b.quaternion.copy(pq).invert().multiply(world);
      else b.quaternion.copy(world);
      if (pos[b.name] && !pName) b.position.copy(pos[b.name]);
    }
    m.rootBone.updateMatrixWorld(true);
  };

  // ------------------------------------------------------------ pose data
  function Pose() { this.pos = {}; this.quat = {}; }

  // ---------------------------------------------------- planar leg solver
  // Chain described by segment lengths; angles measured from -Y, +ve tilts
  // toward +Z (forward). Solves with damped CCD + per-joint limits.
  // `rel` holds per-joint RELATIVE angles (joint 0 relative to -Y, joint j>0
  // relative to the previous segment). Rotating rel[j] therefore carries the
  // whole downstream chain, which is what makes CCD actually converge.
  function solvePlanar(lens, rel, limits, targetZ, targetY, iters) {
    var n = lens.length;
    var px = new Float64Array(n + 1), py = new Float64Array(n + 1);
    var abs = new Float64Array(n);
    function fk() {
      px[0] = 0; py[0] = 0;
      var acc = 0;
      for (var i = 0; i < n; i++) {
        acc += rel[i];
        abs[i] = acc;
        px[i + 1] = px[i] + Math.sin(acc) * lens[i];
        py[i + 1] = py[i] - Math.cos(acc) * lens[i];
      }
    }
    function clampJ(j) {
      if (!limits[j]) return;
      if (rel[j] < limits[j][0]) rel[j] = limits[j][0];
      else if (rel[j] > limits[j][1]) rel[j] = limits[j][1];
    }
    for (var c = 0; c < n; c++) clampJ(c);
    fk();
    iters = iters || 16;
    var gain = 0.72;
    for (var it = 0; it < iters; it++) {
      for (var j = n - 1; j >= 0; j--) {
        var ex = px[n] - px[j], ey = py[n] - py[j];
        var tx = targetZ - px[j], ty = targetY - py[j];
        if ((ex * ex + ey * ey) < 1e-9 || (tx * tx + ty * ty) < 1e-9) continue;
        // Signed angle that rotates the current end-effector vector onto the
        // target vector. FK uses dir = (sin a, -cos a), i.e. +a is a CCW
        // rotation in the (z, y) plane, so cross/dot gives the right sign.
        var d = Math.atan2(ex * ty - ey * tx, ex * tx + ey * ty);
        rel[j] += d * gain;
        clampJ(j);
        fk();
      }
      var dx = px[n] - targetZ, dy = py[n] - targetY;
      if (dx * dx + dy * dy < 1e-8) break;
    }
    return { px: px, py: py, abs: abs };
  }

  // ------------------------------------------------------------ the rig
  function Rig(model) {
    this.m = model;
    this.driver = new Driver(model);
    this.pose = new Pose();
    this.t = 0;
    this.distance = 0;
    this.params = {
      speed: 1.10,          // m/s forward
      cycle: 2.05,          // s per stride
      duty: 0.665,          // stance fraction
      stepLen: 1.12,        // m
      stepHeight: 0.30,
      bodyBob: 0.028,
      bodySway: 0.030,
      neckSwing: 0.055,
      tailSwing: 1.0,
      headTurn: 0,
      headPitch: 0,
      neckPitch: 0,
      stride: 1
    };
    // giraffe lateral-sequence amble: hind leads, ipsilateral fore follows
    this.phase = { 'H.L': 0.00, 'F.L': 0.17, 'H.R': 0.50, 'F.R': 0.67 };
    this.legs = {};
    this.footState = {};
    var self = this;
    ['L', 'R'].forEach(function (s) {
      self.legs['F.' + s] = self.makeLegDef('F', s);
      self.legs['H.' + s] = self.makeLegDef('H', s);
    });
    this.noise = new global.Noise.ValueNoise2D(4242);
  }

  Rig.prototype.makeLegDef = function (kind, side) {
    var sfx = '.' + side, bw = this.m.bindWorld;
    var names = kind === 'F'
      ? ['scap' + sfx, 'shldr' + sfx, 'elbow' + sfx, 'carpus' + sfx, 'fetF' + sfx, 'hoofF' + sfx, 'toeF' + sfx]
      : ['hip' + sfx, 'stifle' + sfx, 'hock' + sfx, 'fetH' + sfx, 'hoofH' + sfx, 'toeH' + sfx];
    // chain used for IK: index 1..(len-3)  (root joint -> fetlock)
    var rootName = kind === 'F' ? 'shldr' + sfx : 'hip' + sfx;
    var chain = kind === 'F'
      ? ['shldr' + sfx, 'elbow' + sfx, 'carpus' + sfx, 'fetF' + sfx]
      : ['hip' + sfx, 'stifle' + sfx, 'hock' + sfx, 'fetH' + sfx];
    var lens = [];
    for (var i = 0; i < chain.length - 1; i++) {
      lens.push(bw[chain[i]].distanceTo(bw[chain[i + 1]]));
    }
    // rest angles derived from the bind pose: absolute (from -Y, +Z positive)
    // and the corresponding relative (per-joint) angles used by the solver.
    var restAbs = [], rest = [];
    for (var j = 0; j < chain.length - 1; j++) {
      var a = bw[chain[j]], b = bw[chain[j + 1]];
      restAbs.push(Math.atan2(b.z - a.z, -(b.y - a.y)));
      rest.push(j === 0 ? restAbs[0] : restAbs[j] - restAbs[j - 1]);
    }
    // Joint limits are expressed as allowed deviation from the *bind* relative
    // angle, so they can never fight the rest pose.
    // ranges[j] = [minDelta, maxDelta] for joint j (j=0 is the girdle joint).
    var ranges = kind === 'F'
      ? [[-1.05, 0.90],    // shoulder
      // The elbow and carpus must be allowed to reach ~0 (a straight column):
      // a standing giraffe's foreleg really is almost perfectly vertical, and
      // forbidding it leaves a permanent zig-zag that shortens the limb and
      // makes the hoof float at full extension.
      [-0.88, 1.15],    // elbow
      [-1.60, 0.52]]    // carpus / knee: flexes backwards, straightens fully
      : [[-0.95, 1.05],    // hip
      [-1.25, 0.40],    // stifle: flexes (tibia folds back)
      [-0.40, 1.40]];   // hock: flexes forward (reciprocal apparatus)
    var limits = [];
    for (var L = 0; L < rest.length; L++) {
      limits.push([rest[L] + ranges[L][0], rest[L] + ranges[L][1]]);
    }
    var reach = 0;
    lens.forEach(function (v) { reach += v; });
    // Vertical drop from the girdle joint to the fetlock in the bind pose, and
    // the largest fore/aft half-step that still keeps the fetlock reachable:
    //   half_max = sqrt((0.96*reach)^2 - drop^2)
    var dropY = bw[chain[0]].y - bw[chain[chain.length - 1]].y;
    var usable = reach * 0.992;
    var maxHalf = usable > dropY ? Math.sqrt(usable * usable - dropY * dropY) : 0.05;
    return {
      reach: reach, dropY: dropY, maxHalf: maxHalf,
      minReach: Math.abs(lens[0] - lens[1]) + lens[2] * 0.25,
      kind: kind, side: side, sfx: sfx, names: names, chain: chain,
      lens: lens, rest: rest, restAbs: restAbs, limits: limits, rootName: rootName,
      x: bw[chain[chain.length - 1]].x,
      hoofName: kind === 'F' ? 'hoofF' + sfx : 'hoofH' + sfx,
      toeName: kind === 'F' ? 'toeF' + sfx : 'toeH' + sfx,
      fetName: kind === 'F' ? 'fetF' + sfx : 'fetH' + sfx,
      angles: rest.slice(),
      // ground anchor z for the current stance
      anchorZ: 0, anchorSet: false, prevStance: true
    };
  };

  function frac(x) { return x - Math.floor(x); }
  function smoothstep(a, b, x) { var t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  // swing trajectory shaping: fast pull-up, slow reach-down
  function swingZ(u) {
    // u in [0,1): foot goes from rear to front
    return -Math.cos(Math.PI * u) * 0.5 + 0.5;
  }

  Rig.prototype.update = function (dt, ctrl) {
    var P = this.params;
    if (ctrl) for (var k in ctrl) if (P[k] !== undefined) P[k] = ctrl[k];
    var speed = P.speed;
    this.cycleSpeed = speed > 1e-4 ? speed / P.stepLen : 0;
    this.t += dt * (this.cycleSpeed || 0);
    this.distance += dt * speed;
    var pose = this.pose;
    pose.pos = {}; pose.quat = {};
    var bw = this.m.bindWorld;
    var T = this.t;
    var moving = speed > 0.02;

    // ============ body ============
    // Vertical bob: four footfalls per stride -> dominant 2x component
    var bob = Math.sin(T * Math.PI * 4 + 0.6) * P.bodyBob
      + Math.sin(T * Math.PI * 2 + 1.1) * P.bodyBob * 0.45;
    var sway = Math.sin(T * Math.PI * 2) * P.bodySway;
    var roll = Math.sin(T * Math.PI * 2 + 0.35) * 0.035;
    var pitch = Math.sin(T * Math.PI * 4 - 0.4) * 0.016;
    var yaw = Math.sin(T * Math.PI * 2 + 2.2) * 0.012;
    if (!moving) { bob *= 0.12; sway *= 0.12; roll *= 0.12; pitch *= 0.12; yaw *= 0.12; }
    // idle breathing
    var breath = Math.sin(this.distance * 0.0 + performance.now() * 0.0013) * 0.006;

    var bodyQ = new Q().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'ZYX'));
    var rootPos = bw['root'].clone();
    rootPos.y += bob + breath;
    rootPos.x += sway;

    pose.pos['root'] = rootPos;
    pose.quat['root'] = bodyQ.clone();

    // ============ spine ============
    var spineNames = ['root', 'spineA', 'spineB', 'spineC', 'withers', 'chest'];
    var curQ = bodyQ.clone();
    var cur = rootPos.clone();
    for (var i = 0; i < spineNames.length - 1; i++) {
      var nm = spineNames[i], nx = spineNames[i + 1];
      // slight lateral undulation + flex
      var ph = T * Math.PI * 2 - i * 0.45;
      var bendY = Math.sin(ph + 1.9) * 0.013 * (moving ? 1 : 0.1);
      var bendX = Math.sin(T * Math.PI * 4 - i * 0.4) * 0.006 * (moving ? 1 : 0.1);
      var q = new Q().setFromEuler(new THREE.Euler(bendX, bendY, 0, 'ZYX'));
      curQ = curQ.clone().multiply(q);
      var off = new V3().subVectors(bw[nx], bw[nm]).applyQuaternion(curQ);
      cur = cur.clone().add(off);
      pose.pos[nx] = cur.clone();
      pose.quat[nx] = curQ.clone();
    }
    var chestQ = curQ.clone(), chestPos = cur.clone();

    // ============ neck + head ============
    var neckNames = ['chest', 'neck1', 'neck2', 'neck3', 'neck4', 'neck5', 'neck6', 'headBase', 'headTip', 'noseEnd'];
    curQ = chestQ.clone(); cur = chestPos.clone();
    var nSeg = neckNames.length - 1;
    // the whole neck swings fore/aft once per stride (giraffe balance pendulum)
    var swing = Math.sin(T * Math.PI * 2 + 0.9) * P.neckSwing * (moving ? 1 : 0.08);
    var lateral = Math.sin(T * Math.PI * 2 - 0.5) * 0.012 * (moving ? 1 : 0.1);
    for (var n2 = 0; n2 < nSeg; n2++) {
      var a = neckNames[n2], b2 = neckNames[n2 + 1];
      var w = n2 < 7 ? 1 : 0;        // only neck joints share the swing
      var bx = 0, by = 0, bz = 0;
      if (n2 < 7) {
        var taper = 0.55 + 0.75 * (n2 / 6);
        bx += swing * 0.22 * taper;
        by += lateral * taper;
        bx += P.neckPitch / 7;
        by += P.headTurn * 0.45 / 7;
      }
      if (a === 'headBase') {
        bx += P.headPitch - swing * 0.9;
        by += P.headTurn * 0.55;
      }
      var q2 = new Q().setFromEuler(new THREE.Euler(bx, by, bz, 'ZYX'));
      curQ = curQ.clone().multiply(q2);
      var off2 = new V3().subVectors(bw[b2], bw[a]).applyQuaternion(curQ);
      cur = cur.clone().add(off2);
      pose.pos[b2] = cur.clone();
      pose.quat[b2] = curQ.clone();
    }

    // ============ tail ============
    var tailNames = ['root', 'tail1', 'tail2', 'tail3', 'tail4', 'tailTip'];
    curQ = bodyQ.clone(); cur = rootPos.clone();
    var tw = P.tailSwing;
    for (var t2 = 0; t2 < tailNames.length - 1; t2++) {
      var ta = tailNames[t2], tb = tailNames[t2 + 1];
      var lag = t2 * 0.8;
      var sw2 = Math.sin(T * Math.PI * 2 * 1.0 - lag) * 0.10 * tw
        + this.noise.noise(T * 1.7 - lag * 0.3, t2 * 0.7) * 0.12 * tw;
      var fw = Math.cos(T * Math.PI * 2 * 1.3 - lag) * 0.05 * tw;
      var q3 = new Q().setFromEuler(new THREE.Euler(fw, sw2, 0, 'ZYX'));
      curQ = curQ.clone().multiply(q3);
      var off3 = new V3().subVectors(bw[tb], bw[ta]).applyQuaternion(curQ);
      cur = cur.clone().add(off3);
      pose.pos[tb] = cur.clone();
      pose.quat[tb] = curQ.clone();
    }

    // ============ legs ============
    for (var key in this.legs) this.solveLeg(this.legs[key], T, P, pose, moving);

    this.driver.apply(pose);
    return pose;
  };

  Rig.prototype.footTarget = function (leg, T, P, moving) {
    var ph = frac(T + this.phase[leg.kind + '.' + leg.side]);
    var duty = P.duty;
    var bw = this.m.bindWorld;
    var z0 = bw[leg.hoofName].z;     // neutral stance centre
    // NO FOOT SKATING: during stance the hoof must be stationary in the world.
    // One stride advances the body by stepLen, so while a foot is planted
    // (a fraction `duty` of the stride) the body moves duty*stepLen forward and
    // the foot must therefore travel exactly that far backward in body space.
    var half = P.stepLen * duty * 0.5 * P.stride;
    // never ask for more extension than the limb can actually deliver
    if (half > leg.maxHalf) half = leg.maxHalf;
    var z, y, lift = 0, u;
    if (!moving) {
      return { z: z0, y: 0, lift: 0, u: 0, stance: true, ph: ph };
    }
    if (ph < duty) {
      // stance: foot fixed on the ground -> slides backwards relative to body
      u = ph / duty;
      z = z0 + half - u * (half * 2);
      y = 0;
    } else {
      // swing: lifts, swings forward
      u = (ph - duty) / (1 - duty);
      z = z0 - half + swingZ(u) * (half * 2);
      var h = Math.sin(Math.PI * Math.pow(u, 0.82));
      lift = Math.pow(h, 1.25) * P.stepHeight;
      // front legs flick a touch higher mid-swing
      y = lift * (leg.kind === 'F' ? 1.0 : 0.92);
    }
    return { z: z, y: y, lift: lift, u: u, stance: ph < duty, ph: ph };
  };

  Rig.prototype.solveLeg = function (leg, T, P, pose, moving) {
    var bw = this.m.bindWorld;
    var tgt = this.footTarget(leg, T, P, moving);

    // --- hoof orientation (roll over the toe at lift-off, land toe-ish first)
    var hoofPitch;
    if (!moving) hoofPitch = 0;
    else if (tgt.stance) {
      // heel-off near the end of stance
      var e = smoothstep(0.78, 1.0, tgt.u);
      hoofPitch = e * 0.95;
      hoofPitch += smoothstep(0.12, 0.0, tgt.u) * 0.12;
    } else {
      var a0 = 0.95 * (1 - smoothstep(0.0, 0.33, tgt.u));          // from toe-off
      var a1 = -0.30 * smoothstep(0.25, 0.72, tgt.u) * (1 - smoothstep(0.72, 1.0, tgt.u));
      var a2 = 0.10 * smoothstep(0.75, 1.0, tgt.u);
      hoofPitch = a0 + a1 + a2;
    }
    if (leg.kind === 'H') hoofPitch *= 1.05;

    // --- contact point of the hoof (the toe when rolling, else the sole)
    var hoofBind = bw[leg.hoofName], toeBind = bw[leg.toeName], fetBind = bw[leg.fetName];
    // the sole sits a little below the hoof joint
    var soleDrop = hoofBind.y;
    var hoofZ = tgt.z, hoofY = tgt.y + soleDrop;
    if (tgt.stance && hoofPitch > 0.01) {
      // pivot about the toe tip so the hoof doesn't sink into the ground
      var toeVec = new V3(0, toeBind.y - hoofBind.y, toeBind.z - hoofBind.z);
      var pivot = new V3(0, tgt.y + toeBind.y, hoofZ + toeVec.z);
      var ca = Math.cos(-hoofPitch), sa = Math.sin(-hoofPitch);
      var rz = -toeVec.z, ry = -toeVec.y;
      hoofZ = pivot.z + (rz * ca - ry * sa);
      hoofY = pivot.y + (rz * sa + ry * ca);
    }

    // --- fetlock position from hoof + pastern orientation
    var pastern = new V3(0, fetBind.y - hoofBind.y, fetBind.z - hoofBind.z);
    // pastern flexes under load during stance (fetlock drops)
    var load = tgt.stance && moving ? Math.sin(Math.PI * THREE.MathUtils.clamp(tgt.u, 0, 1)) : 0;
    var pastAng = -hoofPitch * 0.55 + load * (leg.kind === 'F' ? 0.17 : 0.15);
    var cp = Math.cos(pastAng), sp = Math.sin(pastAng);
    var fz = hoofZ + (pastern.z * cp - pastern.y * sp);
    var fy = hoofY + (pastern.z * sp + pastern.y * cp);

    // --- leg root in the posed body
    var rootPos = pose.pos[leg.rootName];
    if (!rootPos) {
      // derive from the parent bone's posed transform
      var parentName = leg.kind === 'F' ? 'withers' : 'root';
      var pq = pose.quat[parentName], pp = pose.pos[parentName];
      var chainUp = leg.kind === 'F' ? ['scap' + leg.sfx, 'shldr' + leg.sfx] : ['hip' + leg.sfx];
      var cq = pq.clone(), cpos = pp.clone();
      var prev = parentName;
      for (var i = 0; i < chainUp.length; i++) {
        var nm = chainUp[i];
        var off = new V3().subVectors(bw[nm], bw[prev]).applyQuaternion(cq);
        cpos = cpos.clone().add(off);
        pose.pos[nm] = cpos.clone();
        // scapula rotation is set later by aiming; keep the parent's frame
        prev = nm;
      }
      rootPos = pose.pos[leg.rootName];
    }

    // --- scapula glide / pelvis give: the limb girdle itself rotates ~10 deg
    if (moving) {
      var gl = leg.kind === 'F' ? 0.075 : 0.045;
      var gph = tgt.stance ? (0.5 - tgt.u) : (-0.5 + tgt.u * 0.0 - 0.5 + swingZ(tgt.u));
      gph = tgt.stance ? (0.5 - tgt.u) * 1.0 : (swingZ(tgt.u) - 0.5) * 1.0;
      var anchorName = leg.kind === 'F' ? 'scap' + leg.sfx : 'root';
      var pivot = pose.pos[anchorName] || rootPos;
      var armLen = Math.max(0.05, rootPos.distanceTo(pivot));
      var gq = new Q().setFromAxisAngle(new V3(1, 0, 0), gph * (gl / armLen));
      var rel = new V3().subVectors(rootPos, pivot).applyQuaternion(gq);
      rootPos = pivot.clone().add(rel);
      pose.pos[leg.rootName] = rootPos;
    }

    // --- planar IK (plane x = leg.x, axes: +Z forward, +Y up) relative to root
    var tz = fz - rootPos.z, ty = fy - rootPos.y;
    // clamp the target inside the chain's reachable annulus so the solver can
    // always converge (otherwise the limb snaps straight and looks broken)
    var maxR = leg.reach * 0.992, minR = leg.reach * 0.40;
    var tl = Math.sqrt(tz * tz + ty * ty);
    if (tl > maxR) {
      // Out of reach: give up STRIDE LENGTH, not ground contact. Keeping ty and
      // shortening |tz| means the hoof stays planted on the ground and merely
      // doesn't reach quite as far fore/aft (uniform scaling would instead lift
      // the foot into the air, which reads as floating).
      if (Math.abs(ty) < maxR) {
        var nz = Math.sqrt(maxR * maxR - ty * ty);
        tz = (tz < 0 ? -nz : nz);
      } else {
        var kk = maxR / tl; tz *= kk; ty *= kk;
      }
    } else if (tl < minR && tl > 1e-5) {
      var k2 = minR / tl; tz *= k2; ty *= k2;
    }

    // Re-seed from the bind pose each frame (keeps the correct bend direction
    // and prevents drift/flip accumulation), then solve.
    var ang = leg.angles;
    for (var a = 0; a < ang.length; a++) ang[a] = leg.rest[a];
    var sol = solvePlanar(leg.lens, ang, leg.limits, tz, ty, 22);

    // Fixed-point correction: the fetlock target was derived from an idealised
    // (possibly out-of-reach) hoof position, so the solved toe can end up off
    // the ground. Measure the residual and re-solve against a compensated
    // target until the planted hoof sits on y = 0.
    var ca0 = Math.cos(pastAng), sa0 = Math.sin(pastAng);
    var ch0 = Math.cos(-hoofPitch), sh0 = Math.sin(-hoofPitch);
    var toeOffY = -(pastern.z * sa0 + pastern.y * ca0) + (toeBind.z - hoofBind.z) * sh0 + (toeBind.y - hoofBind.y) * ch0;
    var wantToeY = tgt.y + toeBind.y;        // ground contact while planted
    var czo = tz, cyo = ty;
    for (var fix = 0; fix < 4; fix++) {
      var gotToeY = rootPos.y + sol.py[sol.py.length - 1] + toeOffY;
      var errY = gotToeY - wantToeY;
      if (Math.abs(errY) < 0.0012) break;
      cyo -= errY;
      var tl2 = Math.sqrt(czo * czo + cyo * cyo);
      if (tl2 > maxR) { var k3 = maxR / tl2; czo *= k3; cyo *= k3; }
      for (var a2 = 0; a2 < ang.length; a2++) ang[a2] = leg.rest[a2];
      sol = solvePlanar(leg.lens, ang, leg.limits, czo, cyo, 24);
    }

    // --- write joint positions
    var chain = leg.chain;
    for (var c = 0; c < chain.length; c++) {
      pose.pos[chain[c]] = new V3(leg.x, rootPos.y + sol.py[c], rootPos.z + sol.px[c]);
    }

    // Rebuild the foot from the *solved* fetlock so every segment keeps its
    // bind length. (Deriving it from the pre-clamp ideal would stretch the
    // pastern whenever the IK target was out of reach and the hoof would then
    // visibly float above or sink below the ground.)
    var fet = pose.pos[leg.fetName];
    var ca2 = Math.cos(pastAng), sa2 = Math.sin(pastAng);
    // inverse of the pastern rotation: hoof = fet - R(pastAng) * pastern
    pose.pos[leg.hoofName] = new V3(
      leg.x,
      fet.y - (pastern.z * sa2 + pastern.y * ca2),
      fet.z - (pastern.z * ca2 - pastern.y * sa2)
    );
    var hf = pose.pos[leg.hoofName];
    // toe position encodes the hoof's rotation
    var toeVec2 = new V3(0, toeBind.y - hoofBind.y, toeBind.z - hoofBind.z);
    var ch = Math.cos(-hoofPitch), sh = Math.sin(-hoofPitch);
    pose.pos[leg.toeName] = new V3(
      leg.x,
      hf.y + (toeVec2.z * sh + toeVec2.y * ch),
      hf.z + (toeVec2.z * ch - toeVec2.y * sh)
    );
    leg._dbg = tgt;
  };

  global.Rig = { Rig: Rig, Driver: Driver };
})(window);
