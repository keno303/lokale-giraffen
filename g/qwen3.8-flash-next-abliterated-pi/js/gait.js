/* gait.js -- procedural walk: body rhythm + ground-anchored leg IK
 *
 * Giraffes are pacers: both legs on one side move together, then the other
 * side.  Each limb is solved as a planar 4-link chain whose fetlock follows a
 * stance/swing path that is anchored to the ground, so the body can bob and
 * roll freely while the hooves stay planted.
 */
(function (G) {
  'use strict';
  var SM = G.SMOOTH;

  /* Planar limb solver: damped least squares on the joint's relative angles.
   * L    link lengths (upper, lower, cannon -- the hoof is posed separately)
   * ty,tz fetlock target relative to the hip, in the limb's own frame
   * r    relative joint angles (warm-started, kept between frames)
   * lim  per-joint [min,max] relative angle (flexion is negative)
   * FK: link i points along (0,-cos a_i, sin a_i) with a_i = sum(r[0..i]).
   */
  var AY = [0, 0, 0], CY = [0, 0, 0], CZ = [0, 0, 0];
  function solve(L, ty, tz, r, lim, iters, nom) {
    var n = L.length, it, i, Ey, Ez, acc, A11, A12, A22, ex, ez, det, x1, x2, d, nr;
    for (it = 0; it < (iters || 12); it++) {
      acc = 0; Ey = 0; Ez = 0;
      for (i = 0; i < n; i++) {
        acc += r[i]; AY[i] = acc;
        Ey -= L[i] * Math.cos(AY[i]); Ez += L[i] * Math.sin(AY[i]);
      }
      A11 = 0; A12 = 0; A22 = 0;
      var sy = 0, sz = 0;
      for (i = n - 1; i >= 0; i--) {
        sy += L[i] * Math.sin(AY[i]); sz += L[i] * Math.cos(AY[i]);
        CY[i] = sy; CZ[i] = sz;
      }
      for (i = 0; i < n; i++) {
        A11 += CY[i] * CY[i]; A12 += CY[i] * CZ[i]; A22 += CZ[i] * CZ[i];
      }
      ex = ty - Ey; ez = tz - Ez;
      if (ex * ex + ez * ez < 1.6e-7) break;
      A11 += 0.03; A22 += 0.03;
      det = A11 * A22 - A12 * A12;
      if (Math.abs(det) < 1e-8) det = 1e-8;
      x1 = (A22 * ex - A12 * ez) / det;
      x2 = (-A12 * ex + A11 * ez) / det;
      for (i = 0; i < n; i++) {
        d = CY[i] * x1 + CZ[i] * x2;
        if (d > 0.30) d = 0.30; else if (d < -0.30) d = -0.30;
        nr = r[i] + d + (nom ? 0.03 * (nom[i] - r[i]) : 0);
        if (nr < lim[i][0]) nr = lim[i][0];
        else if (nr > lim[i][1]) nr = lim[i][1];
        r[i] = nr;
      }
    }
    return r;
  }

  var GAIT = {
    pace: { RF: 0.00, RH: 0.085, LF: 0.50, LH: 0.585, duty: 0.62, twist: 1 },
    trot: { RF: 0.00, RH: 0.53, LF: 0.50, LH: 0.03, duty: 0.48, twist: -1 },
    still: { RF: 0, RH: 0, LF: 0, LH: 0, duty: 1.0, twist: 0 }
  };

  G.Walker = function (rig, model, opts) {
    var W = this;
    W.rig = rig; W.model = model;
    W.gait = 'pace';
    W.freq = 0.85;             // full gait cycles per second
    W.timeScale = 1;           // 0 = halted
    W.p = 0.22;                // gait phase
    W.t = 0;
    W.speed = 0;               // m/s over ground
    W.scale = model.scale.x;
    W.tmp = new THREE.Vector3();
    W.tmp2 = new THREE.Vector3();
    W.tmp3 = new THREE.Vector3();
    W.HEAD_BASE = 0.24;
    W.blink = 0; W.nextBlink = 2.5;
    rig.legs.forEach(function (l) { l.a = l.a.slice(); });
    W.params = function () {
      var f = W.freq;
      var stride = Math.max(0.45, 0.85 * Math.pow(f / 0.85, 0.62));
      return {
        stride: stride,
        lift: 0.08 + stride * 0.15,
        bob: 0.030 * (0.4 + 0.6 * stride),
        roll: 0.026,
        yaw: 0.022,
        pitch: 0.013,
        surge: 0.045,
        twist: 0.030,
        neck: 0.032,
        head: 0.030
      };
    };
    W.update = function (dt) {
      var g = GAIT[W.gait], P = W.params();
      W.t += dt;
      W.p = (W.p + dt * W.freq * W.timeScale) % 1;
      var p = W.p, w = 2 * Math.PI * p;
      var body = rig.body, bobPhase = g.RF + g.duty * 0.5;

      W.speed = W.timeScale > 0 ? P.stride * W.scale * W.freq : 0;
      if (W.gait === 'still') W.speed = 0;

      /* ---------- body rhythm ---------- */
      var dip = 0.5 + 0.5 * Math.cos(4 * Math.PI * (p - bobPhase));
      body.position.y = G.GIRAFFE_Y - P.bob * dip * W.timeScale;
      body.position.z = P.surge * Math.sin(4 * Math.PI * (p - bobPhase + 0.11)) * W.timeScale;
      body.rotation.z = P.roll * Math.sin(2 * Math.PI * (p - bobPhase + 0.25)) * W.timeScale;
      body.rotation.y = P.yaw * Math.sin(w + 1.3) * W.timeScale;
      body.rotation.x = P.pitch * Math.sin(4 * Math.PI * (p - bobPhase + 0.3)) * W.timeScale;
      rig.withers.rotation.y = P.twist * Math.sin(w + 0.2) * g.twist * W.timeScale;
      rig.haunch.rotation.y = P.twist * Math.sin(w + 0.2) * g.twist * W.timeScale;
      rig.haunch.rotation.x = 0.010 * Math.sin(2 * w) * W.timeScale;

      /* breathing */
      var br = 1 + 0.008 * Math.sin(2 * Math.PI * 0.24 * W.t);
      if (rig.torso) rig.torso.scale.set(br, 1 - 0.3 * (br - 1), br);

      /* ---------- neck, head, ears, tail ---------- */
      var nk = rig.neckBase, hd = rig.head;
      if (nk) {
        nk.rotation.x = -0.35 * body.rotation.x + P.neck * Math.sin(w + 1.0) * W.timeScale;
        nk.rotation.z = (0.018 * Math.sin(Math.PI * p) + 0.006 * Math.sin(W.t * 0.7)) * W.timeScale;
        nk.rotation.y = 0.02 * Math.sin(2 * Math.PI * 0.21 * W.t) * W.timeScale;
      }
      if (hd) {
        hd.rotation.x = W.HEAD_BASE - (nk ? nk.rotation.x : 0) * 0.85 - 0.5 * body.rotation.x +
          P.head * Math.sin(w + 2.0) * W.timeScale;
        hd.rotation.y = 0.055 * Math.sin(2 * Math.PI * 0.17 * W.t + 1) * W.timeScale;
        hd.rotation.z = 0.03 * Math.sin(w + 0.6) * W.timeScale;
      }
      var tw = 0.10 * Math.sin(W.t * 2.3) + 0.05 * Math.sin(W.t * 5.1 + 2);
      if (rig.earL) rig.earL.rotation.z = (-0.10 + tw) * W.timeScale;
      if (rig.earR) rig.earR.rotation.z = (0.10 - tw * 0.8) * W.timeScale;

      if (rig.tail.length) {
        var sw = 0.55 * Math.sin(W.t * 1.35) + 0.25 * Math.sin(W.t * 3.7 + 1) + 0.12 * Math.sin(w);
        rig.tailRoot.rotation.x = -0.06 + 0.09 * Math.sin(w + 0.4) * W.timeScale;
        rig.tailRoot.rotation.z = sw * 0.10;
        for (var ti = 0; ti < rig.tail.length; ti++) {
          var j2 = rig.tail[ti];
          j2.rotation.x = (ti === 0 ? -0.16 : 0.10) + 0.05 * Math.sin(W.t * 1.35 + ti);
          j2.rotation.z = sw * (0.12 + 0.13 * ti);
        }
      }

      /* blink */
      if (W.nextBlink > 0) W.nextBlink -= dt;
      else {
        W.blink += dt / 0.20;
        if (W.blink > 1) { W.blink = 0; W.nextBlink = 2.5 + Math.random() * 5; }
      }
      var bb = W.nextBlink > 0 ? 0 : Math.sin(Math.PI * Math.min(1, W.blink));
      if (rig.eyes) for (var ei = 0; ei < rig.eyes.length; ei++) rig.eyes[ei].scale.y = 1 - 0.88 * bb;

      /* ---------- legs ---------- */
      rig.model.updateMatrixWorld(true);
      var duty = g.duty;
      for (var li = 0; li < rig.legs.length; li++) {
        var leg = rig.legs[li];
        var ph = ((p - g[leg.name]) % 1 + 1) % 1;
        var f, fy, hoofA, u;
        if (W.gait === 'still') { ph = 0.3; }
        if (ph < duty) {
          u = ph / duty;
          f = P.stride * (0.5 - u);
          fy = 0.055 * SM(0.72, 1.0, u) * P.stride;
          hoofA = 0.55 * SM(0.70, 1.0, u);
        } else {
          u = (ph - duty) / (1 - duty);
          f = P.stride * (SM(0.04, 0.96, u) - 0.5);
          fy = P.lift * Math.sin(Math.PI * Math.pow(u, 0.82));
          hoofA = 0.5 * (1 - SM(0.05, 0.5, u)) - 0.16 * Math.sin(Math.PI * u);
        }
        if (W.gait === 'still') { f = 0; fy = 0; hoofA = 0; }

        // ground-anchored fetlock target, in model space
        var hip = W.tmp;
        leg.joints[0].getWorldPosition(hip);
        W.model.worldToLocal(hip);
        var tgt = W.tmp2.set(hip.x, G.FETLOCK + fy, hip.z + f);
        W.model.localToWorld(tgt);        // model space -> world
        rig.body.worldToLocal(tgt);       // world -> body space
        var hb = W.tmp3.copy(hip);        // the hip, in the same frame
        W.model.localToWorld(hb);
        rig.body.worldToLocal(hb);
        var ty = tgt.y - hb.y, tz = tgt.z - hb.z;
        var s = leg.root.rotation.z, cs = Math.cos(s), sn = Math.sin(s);
        var ty2 = ty * cs + tz * sn, tz2 = -ty * sn + tz * cs;

        solve(leg.L, ty2, tz2, leg.a, leg.lim, 20, leg.nom);
        var accA = 0;
        for (var i2 = 0; i2 < 3; i2++) {
          accA += leg.a[i2];
          leg.joints[i2].rotation.x = -leg.a[i2];
        }
        leg.joints[3].rotation.x = -(hoofA - accA);
        leg.contact = ph < duty;
      }
    };
    return W;
  };
})(window.G = window.G || {});
