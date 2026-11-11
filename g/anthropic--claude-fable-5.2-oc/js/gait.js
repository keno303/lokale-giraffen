// Procedural walk cycle.
// Giraffes walk with a lateral-sequence, almost pace-like gait: the hind foot of one side
// lands, shortly followed by the fore foot of the same side, then the other side.
// Hooves follow planted trajectories in the travelling "gait frame" and the limbs are
// solved with analytic IK, so feet never slide.
(function () {
  'use strict';
  const GIR = (window.GIR = window.GIR || {});
  const TAU = Math.PI * 2;

  const sm = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  // piecewise smooth keyframes: keys = [[s, v], ...]
  function kf(s, keys) {
    if (s <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (s <= keys[i][0]) {
        const a = keys[i - 1], b = keys[i];
        return a[1] + (b[1] - a[1]) * sm((s - a[0]) / (b[0] - a[0]));
      }
    }
    return keys[keys.length - 1][1];
  }
  const frac = x => x - Math.floor(x);
  const rot = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };
  const ang = v => Math.atan2(v[1], v[0]);
  const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
  // cheap smooth pseudo-noise in [-1,1]
  const wob = (t, a, b, c) => (Math.sin(t * a) + Math.sin(t * b + 1.7) + Math.sin(t * c + 4.1)) / 3;

  GIR.createGait = function (gir) {
    const B = gir.bones, R = gir.rest, J = gir.J;
    const P = {
      stride: 2.25,      // metres travelled per full cycle
      period: 2.15,      // seconds per cycle
      duty: 0.66,        // fraction of the cycle a hoof is on the ground
      lagFore: 0.13,     // fore foot lands this fraction of a cycle after the same-side hind
      liftFore: 0.17, liftHind: 0.13,
      track: 0.86,       // feet are placed closer to the midline than the standing stance
    };
    const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    const qx = new THREE.Quaternion(), qy = new THREE.Quaternion(), qz = new THREE.Quaternion();
    const mRoot = new THREE.Matrix4(), mS1 = new THREE.Matrix4(), mS2 = new THREE.Matrix4(), mTmp = new THREE.Matrix4(), mInv = new THREE.Matrix4();
    const v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const setZ = (bone, a) => bone.quaternion.setFromAxisAngle(Z, a);
    const d2 = (a, b) => [R[a][0] - R[b][0], R[a][1] - R[b][1]];

    function legSetup(s) {
      const sg = s === 'R' ? 1 : -1;
      return {
        s, sg,
        fore: {
          s0: d2('hum' + s, 'scap' + s), h0: d2('rad' + s, 'hum' + s), r0: d2('mc' + s, 'rad' + s), m0: d2('ffoot' + s, 'mc' + s),
          f0: d2('ffoot' + s, 'scap' + s), zoff: (R['ffoot' + s][2] - R['scap' + s][2]),
          toeOff: [J.ffoot[0] - J.ftoe[0], J.ffoot[1] - J.ftoe[1]], toe: [J.ftoe[0], J.ftoe[2] * sg],
        },
        hind: {
          f0: d2('tib' + s, 'fem' + s), t0: d2('mt' + s, 'tib' + s), m0: d2('hfoot' + s, 'mt' + s),
          zoff: (R['hfoot' + s][2] - R['fem' + s][2]),
          toeOff: [J.hfoot[0] - J.htoe[0], J.hfoot[1] - J.htoe[1]], toe: [J.htoe[0], J.htoe[2] * sg],
        },
      };
    }
    const legs = [legSetup('L'), legSetup('R')];
    const state = { phase: 0, x: 0, t: 0 };
    const prevU = {};
    const api = { onStep: null };
    function stepEvents(key, u, fp, dt, zSide) {
      const pu = prevU[key]; prevU[key] = u;
      if (!api.onStep || !(dt > 0) || pu === undefined) return;
      if (u < pu - 0.5) api.onStep(state.x + fp.x - 0.1, zSide, 1.0, 0);            // touchdown
      else if (pu < P.duty && u >= P.duty) api.onStep(state.x + fp.x, zSide, 0.55, -1); // toe-off flick
    }

    // toe position (gait frame) + hoof pitch for local phase u
    function footPath(u, x0, lift, centre) {
      const b = P.duty, L = P.stride * b;
      let x, y = 0, pitch = 0, s = -1;
      if (u < b) {
        x = x0 + centre + L * (0.5 - u / b);
        // heel-off / breakover at the end of stance: the hoof rolls over the toe
        pitch = -0.62 * Math.pow(sm((u - (b - 0.15)) / 0.15), 1.6);
      } else {
        s = (u - b) / (1 - b);
        const p0 = x0 + centre - L / 2, p1 = x0 + centre + L / 2, m = -P.stride * (1 - b);
        const s2 = s * s, s3 = s2 * s;
        x = (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m;
        y = lift * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.85)), 1.6);
        pitch = kf(s, [[0, -0.62], [0.3, -1.25], [0.72, -0.25], [0.9, 0.14], [1, 0]]);
      }
      return { x, y, pitch, s };
    }

    function solveFore(leg, u, pitchTrunk) {
      const g = leg.fore, s = leg.s;
      const fp = footPath(u, g.toe[0], P.liftFore, 0.03);
      const off = rot(g.toeOff, fp.pitch);
      // fetlock target in the gait frame -> chest (spine2) frame
      v.set(fp.x + off[0], fp.y + off[1], g.toe[1] * P.track).applyMatrix4(mInv.copy(mS2).invert());
      const sc = R['scap' + s], s2 = R.spine2;
      const dx = v.x - (sc[0] - s2[0]), dy = v.y - (sc[1] - s2[1]), dz = v.z - (sc[2] - s2[2]);
      const r = Math.hypot(dy, dz);
      const abd = Math.asin(Math.max(-1, Math.min(1, g.zoff / r))) - Math.atan2(dz, -dy);
      const F = [dx, dy * Math.cos(abd) + dz * Math.sin(abd)];

      const gam = Math.atan2(F[0], -F[1]) - Math.atan2(g.f0[0], -g.f0[1]);
      const swing = fp.s >= 0 ? Math.sin(Math.PI * sm(fp.s)) : 0;
      const thS = 0.42 * gam + 0.05 * swing;
      const S = rot(g.s0, thS);
      // carpus ("knee") folds during the swing
      const psi = fp.s >= 0 ? kf(fp.s, [[0, 0.10], [0.36, 1.02], [0.8, 0.12], [1, 0]]) : 0.10 * Math.pow(sm((u - (P.duty - 0.1)) / 0.1), 2);
      const e = [g.r0[0] + rot(g.m0, -psi)[0], g.r0[1] + rot(g.m0, -psi)[1]];
      const l1 = Math.hypot(g.h0[0], g.h0[1]), le = Math.hypot(e[0], e[1]);
      const D = sub2(F, S);
      const d = Math.min((l1 + le) * 0.9995, Math.max(Math.abs(l1 - le) * 1.02, Math.hypot(D[0], D[1])));
      const al = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - le * le) / (2 * l1 * d))));
      const hDir = ang(D) - al;
      const thH = hDir - ang(g.h0);
      const E = [S[0] + l1 * Math.cos(hDir), S[1] + l1 * Math.sin(hDir)];
      const thR = ang(sub2(F, E)) - ang(e);
      const thM = thR - psi;
      const thFoot = fp.pitch - pitchTrunk;

      qx.setFromAxisAngle(X, abd); qz.setFromAxisAngle(Z, thS);
      B['scap' + s].quaternion.copy(qx).multiply(qz);
      setZ(B['hum' + s], thH - thS);
      setZ(B['rad' + s], thR - thH);
      setZ(B['mc' + s], thM - thR);
      setZ(B['ffoot' + s], thFoot - thM);
      return fp;
    }

    function solveHind(leg, u, pitchTrunk) {
      const g = leg.hind, s = leg.s;
      const fp = footPath(u, g.toe[0], P.liftHind, 0.02);
      const off = rot(g.toeOff, fp.pitch);
      v.set(fp.x + off[0], fp.y + off[1], g.toe[1] * P.track).applyMatrix4(mInv.copy(mRoot).invert());
      const hp = R['fem' + s], rt = R.root;
      const dx = v.x - (hp[0] - rt[0]), dy = v.y - (hp[1] - rt[1]), dz = v.z - (hp[2] - rt[2]);
      const r = Math.hypot(dy, dz);
      const abd = Math.asin(Math.max(-1, Math.min(1, g.zoff / r))) - Math.atan2(dz, -dy);
      const F = [dx, dy * Math.cos(abd) + dz * Math.sin(abd)];

      // femur and cannon bone stay roughly parallel (reciprocal apparatus); eta adds hock flexion in swing
      const eta = fp.s >= 0 ? kf(fp.s, [[0, -0.06], [0.4, 0.34], [0.85, 0.05], [1, 0]]) : -0.06 * Math.pow(sm((u - (P.duty - 0.12)) / 0.12), 2);
      const mr = rot(g.m0, eta);
      const a = [g.f0[0] + mr[0], g.f0[1] + mr[1]];
      const la = Math.hypot(a[0], a[1]), lt = Math.hypot(g.t0[0], g.t0[1]);
      const d = Math.min((la + lt) * 0.9995, Math.max(Math.abs(la - lt) * 1.02, Math.hypot(F[0], F[1])));
      const al = Math.acos(Math.max(-1, Math.min(1, (la * la + d * d - lt * lt) / (2 * la * d))));
      const aDir = ang(F) + al;
      const thF = aDir - ang(a);
      const Tv = [F[0] - la * Math.cos(aDir), F[1] - la * Math.sin(aDir)];
      const thT = ang(Tv) - ang(g.t0);
      const thM = thF + eta;
      const thFoot = fp.pitch - pitchTrunk;

      qx.setFromAxisAngle(X, abd); qz.setFromAxisAngle(Z, thF);
      B['fem' + s].quaternion.copy(qx).multiply(qz);
      setZ(B['tib' + s], thT - thF);
      setZ(B['mt' + s], thM - thT);
      setZ(B['hfoot' + s], thFoot - thM);
      return fp;
    }

    const earState = { L: { next: 2, t0: -9 }, R: { next: 3.3, t0: -9 } };
    const tailFlick = { next: 5, t0: -9, dir: 1 };
    const blink = { next: 2.5, t0: -9 };

    function update(t, dt) {
      state.t = t;
      const ph = t / P.period;
      state.phase = ph;
      state.x = ph * P.stride;
      gir.group.position.x = state.x;

      const b = P.duty;
      const pHL = frac(ph), pHR = frac(ph + 0.5);
      const pFL = frac(ph - P.lagFore), pFR = frac(ph - P.lagFore + 0.5);

      // --- trunk: vaulting over the stance limbs, weight shift, counter-rotation ---
      const hMid = b / 2;
      const yPelvis = -0.045 + 0.020 * Math.cos(2 * TAU * (ph - hMid));
      const yChest = -0.040 + 0.022 * Math.cos(2 * TAU * (ph - hMid - P.lagFore));
      const trunkLen = R.scapR[0] - R.root[0];
      const pitch = (yChest - yPelvis) / trunkLen;
      const phL = P.lagFore / 2 + hMid; // middle of left-side support
      const sway = -0.035 * Math.cos(TAU * (ph - phL));
      const roll = 0.022 * Math.cos(TAU * (ph - phL - 0.04));
      const yaw = -0.035 * Math.cos(TAU * (ph - 0.09));

      B.root.position.set(R.root[0], R.root[1] + yPelvis, R.root[2] + sway);
      qy.setFromAxisAngle(Y, yaw); qx.setFromAxisAngle(X, roll); qz.setFromAxisAngle(Z, pitch);
      B.root.quaternion.copy(qy).multiply(qx).multiply(qz);
      qy.setFromAxisAngle(Y, -yaw * 0.55); qx.setFromAxisAngle(X, -roll * 0.3);
      B.spine1.quaternion.copy(qy).multiply(qx);
      qy.setFromAxisAngle(Y, -yaw * 0.6); qx.setFromAxisAngle(X, -roll * 0.5);
      B.spine2.quaternion.copy(qy).multiply(qx);

      mRoot.compose(B.root.position, B.root.quaternion, one);
      mS1.compose(B.spine1.position, B.spine1.quaternion, one).premultiply(mRoot);
      mS2.compose(B.spine2.position, B.spine2.quaternion, one).premultiply(mS1);

      // --- limbs ---
      stepEvents('hL', pHL, solveHind(legs[0], pHL, pitch), dt, legs[0].hind.toe[1] * P.track);
      stepEvents('hR', pHR, solveHind(legs[1], pHR, pitch), dt, legs[1].hind.toe[1] * P.track);
      stepEvents('fL', pFL, solveFore(legs[0], pFL, pitch), dt, legs[0].fore.toe[1] * P.track);
      stepEvents('fR', pFR, solveFore(legs[1], pFR, pitch), dt, legs[1].fore.toe[1] * P.track);

      // --- neck: swings fore-aft twice per stride, head stays level ---
      const nPh = 2 * TAU * (ph - P.lagFore - 0.07);
      let sum = 0;
      for (let i = 1; i <= gir.NECK_N; i++) {
        const base = i === 1 ? -0.085 : i === 2 ? -0.035 : 0.004;
        const amp = i === 1 ? 0.027 : 0.010;
        const a = base + amp * Math.sin(nPh - (i - 1) * 0.42) + 0.006 * wob(t + i, 0.31, 0.53, 0.17);
        const side = (i <= 2 ? 0.012 : 0.007) * Math.sin(TAU * (ph - phL) - 0.5 - i * 0.3) + 0.01 * wob(t + i * 2.1, 0.23, 0.41, 0.13);
        sum += a;
        qz.setFromAxisAngle(Z, a); qx.setFromAxisAngle(X, side); qy.setFromAxisAngle(Y, side * 0.8);
        B['neck' + i].quaternion.copy(qy).multiply(qx).multiply(qz);
      }
      const look = 0.10 * wob(t, 0.11, 0.19, 0.07);
      qz.setFromAxisAngle(Z, -sum * 0.92 - pitch + 0.03 * Math.sin(nPh - 2.6) + 0.02 * wob(t, 0.37, 0.21, 0.6));
      qy.setFromAxisAngle(Y, look + yaw * 0.2); qx.setFromAxisAngle(X, -roll * 0.6);
      B.head.quaternion.copy(qy).multiply(qx).multiply(qz);

      // jaw: slow cud chewing in bouts
      const chewBout = sm((Math.sin(t * 0.21) - 0.15) * 4);
      const chew = t * 2.6 * TAU / 2;
      qz.setFromAxisAngle(Z, -chewBout * 0.035 * (0.5 + 0.5 * Math.sin(chew)));
      qy.setFromAxisAngle(Y, chewBout * 0.05 * Math.sin(chew * 0.5 + 0.4));
      B.jaw.quaternion.copy(qy).multiply(qz);

      // ears: mostly still, with occasional flicks
      for (const s of ['L', 'R']) {
        const es = earState[s], sg = s === 'R' ? 1 : -1;
        if (t > es.next) { es.t0 = t; es.next = t + 1.2 + 4.5 * Math.abs(wob(t * 3.7 + sg, 1.3, 2.9, 0.7)) * 2; }
        if (t < es.t0 - 0.01) { es.t0 = -9; es.next = t + 1; }
        const k = t - es.t0;
        const fl = k < 0.5 ? Math.sin(k / 0.5 * Math.PI) * Math.sin(k * 26) * 0.5 * (1 - k / 0.5) + Math.sin(k / 0.5 * Math.PI) * 0.35 : 0;
        qy.setFromAxisAngle(Y, sg * (-fl * 0.9 + 0.06 * wob(t + sg, 0.5, 0.83, 0.29)));
        qx.setFromAxisAngle(X, sg * (0.05 * Math.sin(nPh + 1) - fl * 0.25));
        B['ear' + s].quaternion.copy(qy).multiply(qx);
      }

      // tail: pendulum swing with a travelling wave, plus the odd swish
      if (t > tailFlick.next) { tailFlick.t0 = t; tailFlick.dir = Math.sin(t * 7.3) > 0 ? 1 : -1; tailFlick.next = t + 4 + 5 * Math.abs(wob(t, 1.1, 2.3, 0.37)); }
      if (t < tailFlick.t0 - 0.01) { tailFlick.t0 = -9; tailFlick.next = t + 2; }
      const fk = t - tailFlick.t0;
      const flick = fk < 1.3 ? Math.sin(fk * 9.5) * Math.exp(-fk * 2.6) * tailFlick.dir : 0;
      for (let i = 1; i <= gir.TAIL_N; i++) {
        const w = 0.02 + 0.011 * i;
        const lat = w * Math.sin(TAU * (ph - phL) + 1.2 - i * 0.8) + 0.28 * flick * Math.sin(Math.min(1, fk * 3) * 1.5 - i * 0.25 + 1.2) * (i > 1 ? 1 : 0.5)
          + 0.02 * wob(t + i, 0.7, 1.13, 0.31);
        const fa = (i === 1 ? -0.10 : -0.012) + 0.016 * Math.sin(2 * TAU * ph - i * 0.6);
        qx.setFromAxisAngle(X, lat); qz.setFromAxisAngle(Z, fa);
        B['tail' + i].quaternion.copy(qx).multiply(qz);
      }

      // blink
      if (gir.lids) {
        if (t > blink.next) { blink.t0 = t; blink.next = t + 2 + 4 * Math.abs(wob(t, 0.9, 1.7, 0.33)); }
        if (t < blink.t0 - 0.01) { blink.t0 = -9; blink.next = t + 1; }
        const bk = t - blink.t0;
        const c = bk < 0.28 ? Math.sin(bk / 0.28 * Math.PI) : 0;
        gir.setBlink(c);
      }
      return state.x;
    }

    return Object.assign(api, { update, params: P, state, legs });
  };
})();
