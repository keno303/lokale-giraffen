/* Procedural giraffe: CPU-deformed tube skins + analytic 2-bone IK walk cycle.
   Facing +Z, up +Y, giraffe's left = +X. Units: metres. */
(function () {
  const T = THREE;
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const P = (x, y, z, rx, ry, on) => ({ x, y, z, rx, ry, on: on || 0 });

  // ---- gait ----------------------------------------------------------------
  const DUTY = 0.64, STRIDE = 1.35;
  const LEGS = [ // name, front?, side, phase
    { n: 'LH', front: false, side: +1, phase: 0.00 },
    { n: 'LF', front: true,  side: +1, phase: 0.13 },
    { n: 'RH', front: false, side: -1, phase: 0.50 },
    { n: 'RF', front: true,  side: -1, phase: 0.63 },
  ];
  const HIP = { front: { y: 2.36, z: 0.62, x: 0.175, L1: 1.2, L2: 1.2 }, rear: { y: 2.30, z: -0.80, x: 0.175, L1: 1.25, L2: 1.12 } };
  const FOOT_Z = { front: 0.74, rear: -0.80 };

  class Giraffe {
    constructor() {
      this.group = new T.Group();
      this.mat = makeCoatMaterial();
      this.speedFactor = 1;
      this.cycleT = 2.0;          // seconds per stride cycle
      this.time = 0; this.phase = 0;
      this.v = STRIDE / (DUTY * this.cycleT);
      this._tmp = { a: new T.Vector3(), b: new T.Vector3(), c: new T.Vector3(), d: new T.Vector3(), e: new T.Vector3(), m: new T.Matrix4() };
      this.build();
      this.update(0, 0);
    }

    skinMesh(tube) {
      const m = new T.Mesh(tube.geometry, this.mat);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      this.group.add(m); return m;
    }

    build() {
      const g = this.group, mat = this.mat;
      // ---------------- torso ----------------
      this.torso = new Tube(10, { sub: 4, radial: 28 });
      this.torsoBase = [
        P(0, 2.38, -1.16, .04, .04), P(0, 2.38, -1.07, .19, .26), P(0, 2.40, -0.88, .265, .40),
        P(0, 2.46, -0.45, .285, .47, .0), P(0, 2.50, 0.0, .29, .50, .01), P(0, 2.53, 0.42, .295, .52, .03),
        P(0, 2.56, 0.78, .30, .52, .06), P(0, 2.58, 1.05, .26, .43, .03), P(0, 2.58, 1.22, .13, .21), P(0, 2.58, 1.29, .03, .05)];
      this.torsoPts = this.torsoBase.map(p => Object.assign({}, p));
      // ---------------- neck ----------------
      this.NN = 10;
      this.neck = new Tube(this.NN, { sub: 4, radial: 22 });
      this.neckPts = []; for (let i = 0; i < this.NN; i++) {
        const u = i / (this.NN - 1); const r = lerp(0.30, 0.100, Math.pow(u, 0.75));
        this.neckPts.push(P(0, 0, 0, r * (0.88), r * 1.0));
      }
      // ---------------- legs ----------------
      this.legs = LEGS.map(L => {
        const tube = new Tube(8, { sub: 4, radial: 18 });
        const f = L.front;
        const prof = f ? [[.115, .17], [.092, .125], [.085, .10], [.060, .066], [.054, .058], [.068, .080], [.052, .06], [.052, .06]]
                       : [[.135, .21], [.105, .15], [.085, .10], [.060, .066], [.054, .058], [.068, .080], [.052, .06], [.052, .06]];
        const pts = prof.map(r => P(0, 0, 0, r[0], r[1]));
        const hoofGeo = new T.CylinderGeometry(0.052, 0.078, 0.12, 14, 1);
        hoofGeo.translate(0, 0.06, 0); hoofGeo.scale(1, 1, 1.42);
        // cleft
        const hoof = new T.Mesh(hoofGeo, new T.MeshStandardMaterial({ color: 0x1b1612, roughness: 0.55 }));
        hoof.castShadow = true; g.add(hoof);
        const o = { L, tube, pts, hoof, mesh: this.skinMesh(tube), foot: new T.Vector3(), pitch: 0 };
        return o;
      });
      // ---------------- tail ----------------
      this.tail = new Tube(9, { sub: 3, radial: 12 });
      this.tailPts = [];
      for (let i = 0; i < 9; i++) { const r = lerp(0.05, 0.02, i / 8); this.tailPts.push(P(0, 0, 0, r, r)); }
      const tuftGeo = new T.SphereGeometry(1, 14, 10); tuftGeo.translate(0, -0.9, 0); tuftGeo.scale(0.06, 0.2, 0.06);
      this.tuft = new T.Mesh(tuftGeo, new T.MeshStandardMaterial({ color: 0x120c08, roughness: 0.95 }));
      this.tuft.castShadow = true; g.add(this.tuft);
      // ---------------- head ----------------
      this.headGroup = new T.Group(); this.headGroup.matrixAutoUpdate = false;
      g.add(this.headGroup);
      this.head = new Tube(9, { sub: 4, radial: 20 });
      this.headPts = [P(0, 0, -.14, .07, .07), P(0, 0, -.10, .108, .115), P(0, 0, 0.0, .122, .130, .004), P(0, 0, 0.14, .108, .118, -.004),
        P(0, 0, 0.30, .080, .092, -.016), P(0, 0, 0.46, .070, .078, -.028), P(0, 0, 0.58, .082, .076, -.036), P(0, 0, 0.665, .078, .066, -.038), P(0, 0, 0.71, .036, .034, -.038)];
      this.headMesh = new T.Mesh(this.head.geometry, mat); this.headMesh.castShadow = true; this.headMesh.receiveShadow = true;
      this.headMesh.frustumCulled = false; this.headGroup.add(this.headMesh);
      this.head.update(this.headPts, new T.Vector3(1, 0, 0));
      this.buildHeadParts();
      // ---------------- mane ----------------
      const maneGeo = new T.ConeGeometry(0.022, 0.075, 5); maneGeo.translate(0, 0.0375, 0); maneGeo.scale(0.55, 1, 1.0);
      this.maneN = 70;
      this.mane = new T.InstancedMesh(maneGeo, new T.MeshStandardMaterial({ color: 0x3b2413, roughness: 1 }), this.maneN);
      this.mane.castShadow = true; this.mane.frustumCulled = false; g.add(this.mane);
      this.maneRand = Array.from({ length: this.maneN }, () => ({ s: 0.7 + Math.random() * 0.7, a: (Math.random() - .5) * 0.5, l: (Math.random() - .5) * 0.4 }));
      // ---------------- skin meshes ----------------
      this.skinMesh(this.torso); this.skinMesh(this.neck); this.skinMesh(this.tail);

      // ---------------- rest pose + coat attributes ----------------
      this.setPose(0, 0, true);
      const dorsalFade = (s) => 1 - 0.85 * sstep(-0.35, -0.85, s);
      this.torso.finalize(this.torsoPts, (u, th, i, s, c) => [1, 0.95 * dorsalFade(s), 0]);
      this.neck.finalize(this.neckPts, (u, th, i, s, c) => [1, (0.9 - 0.2 * u) * (1 - 0.5 * sstep(-0.4, -0.95, s)), 0]);
      this.legs.forEach(l => l.tube.finalize(l.pts, (u, th, i, s, c) => [1, 0.92 - sstep(0.22, 0.5, u) * 0.8 + 0.0, 0]));
      this.tail.finalize(this.tailPts, (u) => [1.3, 0.6 - 0.5 * u, sstep(0.55, 0.85, u) * 0.95]);
      this.head.finalize(this.headPts, (u, th, i, s, c) => [1.7, 0.55 * (1 - 0.7 * sstep(-0.1, -0.8, s)), sstep(0.76, 0.86, u) * 0.92], this.headGroup.matrix);
      this.group.updateMatrixWorld(true);
    }

    buildHeadParts() {
      const hg = this.headGroup, H = this.head;
      const skin = new T.MeshStandardMaterial({ color: 0x6a4527, roughness: 0.9 });
      const earMat = new T.MeshStandardMaterial({ color: 0x7c4f2b, roughness: 0.9, side: T.DoubleSide });
      const earIn = new T.MeshStandardMaterial({ color: 0xc89a7c, roughness: 0.9 });
      const hair = new T.MeshStandardMaterial({ color: 0x23160d, roughness: 1 });
      const eyeMat = new T.MeshStandardMaterial({ color: 0x0a0605, roughness: 0.12, metalness: 0.1 });
      const irisMat = new T.MeshStandardMaterial({ color: 0x2c1507, roughness: 0.2 });
      this.ears = []; this.ossi = [];
      for (const sd of [-1, 1]) {
        // ear
        const earG = new T.Group();
        const eg = new T.SphereGeometry(1, 14, 10); eg.scale(0.036, 0.10, 0.011); eg.translate(0, 0.085, 0);
        const ear = new T.Mesh(eg, earMat); const inner = new T.Mesh(eg, earIn); inner.scale.set(0.7, 0.8, 1); inner.position.set(0, 0.012, 0.007 * -sd * 0 + 0.004);
        ear.castShadow = true; earG.add(ear); earG.add(inner);
        earG.position.set(sd * 0.095, 0.05, -0.04); earG.userData = { sd };
        hg.add(earG); this.ears.push(earG);
        // ossicone
        const og = new T.Group();
        const sh = new T.Mesh(new T.CylinderGeometry(0.017, 0.028, 0.17, 10), skin); sh.position.y = 0.085; sh.castShadow = true; og.add(sh);
        const tuft = new T.Mesh(new T.SphereGeometry(0.036, 12, 10), hair); tuft.scale.set(1, 1.6, 1); tuft.position.y = 0.19; tuft.castShadow = true; og.add(tuft);
        const tuft2 = new T.Mesh(new T.ConeGeometry(0.03, 0.06, 10), hair); tuft2.position.y = 0.255; og.add(tuft2);
        og.position.set(sd * 0.052, 0.088, -0.025); og.rotation.set(-0.22, 0, -sd * 0.12);
        hg.add(og); this.ossi.push(og);
        // eye
        const eyeP = H.surface(H.rings * 0.285, sd > 0 ? 0.42 : Math.PI - 0.42, 1.0, new T.Vector3());
        const eye = new T.Mesh(new T.SphereGeometry(0.028, 18, 14), eyeMat);
        eye.position.copy(eyeP); eye.position.x += sd * 0.004; eye.scale.set(0.8, 1, 1); hg.add(eye);
        const iris = new T.Mesh(new T.SphereGeometry(0.023, 14, 10), irisMat); iris.position.copy(eyeP); iris.position.x += sd * 0.011; iris.scale.set(0.5, 0.9, 0.9); hg.add(iris);
        // brow/lid
        const brow = new T.Mesh(new T.TorusGeometry(0.031, 0.006, 6, 18, Math.PI * 1.6), hair);
        brow.position.copy(eyeP); brow.position.x += sd * 0.002; brow.rotation.y = sd * Math.PI / 2; brow.rotation.z = 0.5;
        hg.add(brow);
        // nostril
        const nos = new T.Mesh(new T.SphereGeometry(0.014, 8, 6), hair); nos.scale.set(0.8, 0.6, 1.5);
        nos.position.set(sd * 0.038, 0.005, 0.675); hg.add(nos);
      }
      // lips line
      const lip = new T.Mesh(new T.CylinderGeometry(0.004, 0.004, 0.22, 6), hair);
      lip.rotation.x = Math.PI / 2; lip.position.set(0, -0.045, 0.56); lip.visible = false; hg.add(lip);
    }

    // ---- IK helper ----
    ik(H, A, L1, L2, bend, out) {
      const t = this._tmp; const d = t.a.copy(A).sub(H); let dist = d.length();
      const maxD = (L1 + L2) * 0.9995; if (dist > maxD) { d.multiplyScalar(maxD / dist); dist = maxD; }
      d.multiplyScalar(1 / dist);
      const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(L1 * L1 - a * a, 0));
      const perp = t.b.copy(bend).addScaledVector(d, -bend.dot(d)).normalize();
      return out.copy(H).addScaledVector(d, a).addScaledVector(perp, h);
    }

    setPose(time, phase, rest) {
      const t = this._tmp, TWO = Math.PI * 2;
      const ph = phase;
      let bobF = 0, bobR = 0, swayF = 0, swayR = 0, lookYaw = 0, headExtra = 0, neckSwing = 0, headNod = 0, headRoll = 0, tailA = 0;
      if (!rest) {
        const bob = 0.022 * Math.cos(2 * TWO * (ph - 0.2));
        const pit = 0.014 * Math.sin(2 * TWO * (ph - 0.35));
        bobF = bob + pit; bobR = bob - pit;
        const sw = 0.035 * Math.cos(TWO * (ph - 0.2));
        swayR = sw; swayF = -sw * 0.55;
        neckSwing = 0.05 * Math.sin(TWO * (ph - 0.05));
        headNod = 0.07 * Math.sin(TWO * (ph + 0.12));
        lookYaw = 0.22 * Math.sin(time * 0.27) + 0.12 * Math.sin(time * 0.71 + 1.3);
        headExtra = 0.25 * Math.sin(time * 0.43 + 0.6) * Math.max(0, Math.sin(time * 0.13));
        headRoll = 0.05 * Math.sin(time * 0.37) + sw * 0.8;
        tailA = time;
      }
      this.state = { bobF, bobR, swayF, swayR };

      // torso
      for (let i = 0; i < this.torsoPts.length; i++) {
        const b = this.torsoBase[i], p = this.torsoPts[i];
        const w = sstep(1.25, -1.1, b.z); // 1 at rear
        p.x = b.x + lerp(swayF, swayR, w) + (rest ? 0 : -0.5 * (swayR - swayF) * Math.sin((b.z + 1) * 2) * 0.0);
        p.y = b.y + lerp(bobF, bobR, w); p.z = b.z; p.rx = b.rx; p.ry = b.ry; p.on = b.on;
      }
      this.torso.update(this.torsoPts, new T.Vector3(1, 0, 0));

      // neck
      const n = this.NN, base = t.c.set(swayF, 2.63 + bobF, 0.52);
      let x = base.x, y = base.y, z = base.z; const segL = 2.45 / (n - 1);
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), p = this.neckPts[i];
        p.x = x; p.y = y; p.z = z;
        const th = (48 + 24 * sstep(0.0, 0.75, u)) * Math.PI / 180 + neckSwing * (0.4 + u) - 0.02;
        const yaw = lookYaw * u * u * 1.2 + headExtra * 0.25 * u;
        const cth = Math.cos(th);
        x += Math.sin(yaw) * cth * segL; y += Math.sin(th) * segL; z += Math.cos(yaw) * cth * segL;
        this._neckEndDir = this._neckEndDir || new T.Vector3();
        if (i === n - 1) { this._neckEndDir.set(Math.sin(yaw) * cth, Math.sin(th), Math.cos(yaw) * cth); this._neckYaw = yaw; }
      }
      this.neck.update(this.neckPts, new T.Vector3(1, 0, 0));

      // head frame
      const nl = this.neckPts[n - 1], nd = this._neckEndDir;
      const O = t.d.set(nl.x, nl.y, nl.z).addScaledVector(nd, 0.05);
      const hyaw = this._neckYaw + headExtra * 0.75, hpit = -0.20 + headNod - 0.5 * neckSwing;
      const hv = new T.Vector3(Math.sin(hyaw) * Math.cos(hpit), Math.sin(hpit), Math.cos(hyaw) * Math.cos(hpit));
      const sv = new T.Vector3(Math.cos(hyaw), 0, -Math.sin(hyaw));
      const nv = new T.Vector3().crossVectors(hv, sv).normalize();
      // roll
      const cr = Math.cos(headRoll), sr = Math.sin(headRoll);
      const s2 = sv.clone().multiplyScalar(cr).addScaledVector(nv, sr), n2 = nv.clone().multiplyScalar(cr).addScaledVector(sv, -sr);
      this.headGroup.matrix.makeBasis(s2, n2, hv).setPosition(O);
      this.headGroup.matrixWorldNeedsUpdate = true;
      this.headBasis = { s: s2, n: n2, h: hv };

      // ears (flicks)
      for (const e of this.ears) {
        const sd = e.userData.sd;
        const fl = Math.pow(Math.max(0, Math.sin(time * (sd > 0 ? 0.83 : 0.61) + sd)), 24);
        e.rotation.set(-0.55 + 0.35 * fl - 0.1 * Math.sin(time * 1.3 + sd), sd * 0.15, -sd * (1.05 - 0.3 * fl) + 0.05 * Math.sin(time * 0.9));
        if (rest) e.rotation.set(-0.55, sd * 0.15, -sd * 1.05);
      }

      // mane
      const m4 = new T.Matrix4(), q = new T.Matrix4();
      const Pp = new T.Vector3(), Tg = new T.Vector3(), Nn = new T.Vector3(), Ss = new T.Vector3(), Y2 = new T.Vector3();
      for (let i = 0; i < this.maneN; i++) {
        const f = (this.neck.rings - 1) * lerp(0.08, 0.985, i / (this.maneN - 1));
        this.neck.surface(f, Math.PI / 2, 0.97, Pp);
        this.neck.dir(f, this.neck.Tg, Tg); this.neck.dir(f, this.neck.Nn, Nn); this.neck.dir(f, this.neck.S, Ss);
        const r = this.maneRand[i];
        Y2.copy(Nn).addScaledVector(Tg, -0.45 + r.l).addScaledVector(Ss, r.a).normalize();
        const Zt = new T.Vector3().crossVectors(Ss, Y2).normalize();
        const Xt = new T.Vector3().crossVectors(Y2, Zt).normalize();
        const taper = 1 - 0.3 * (i / this.maneN);
        m4.makeBasis(Xt, Y2, Zt).setPosition(Pp.addScaledVector(Nn, -0.012));
        q.makeScale(1, r.s * taper, 1); m4.multiply(q);
        this.mane.setMatrixAt(i, m4);
      }
      this.mane.instanceMatrix.needsUpdate = true;

      // legs
      for (const l of this.legs) {
        const L = l.L, hp = L.front ? HIP.front : HIP.rear;
        const w = L.front ? 0 : 1;
        const lp = ((ph - L.phase) % 1 + 1) % 1;
        let fz, fy = 0, pitch = 0;
        const z0 = L.front ? FOOT_Z.front : FOOT_Z.rear;
        if (rest) { fz = z0; }
        else if (lp < DUTY) {
          const s = lp / DUTY; fz = z0 + STRIDE / 2 - STRIDE * s;
          pitch = lerp(-0.12, 0.38, Math.pow(s, 4)) * (s > 0.85 ? 1 : 1);
          fy = Math.max(0, Math.sin(pitch)) * 0.05;
        } else {
          const s = (lp - DUTY) / (1 - DUTY);
          const e = s * s * (3 - 2 * s) * 0.65 + s * 0.35;
          fz = z0 - STRIDE / 2 + STRIDE * e;
          fy = 0.30 * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.85)), 1.1) + Math.max(0, Math.sin(0.38)) * 0.05 * (1 - s);
          pitch = lerp(0.55, -0.15, sstep(0.0, 0.95, s)) + 0.0;
        }
        const hipX = L.side * hp.x + (L.front ? swayF : swayR);
        const H = t.e.set(hipX, hp.y + (L.front ? bobF : bobR), hp.z);
        const foot = l.foot.set(L.side * hp.x + (rest ? 0 : L.side * 0.0), fy, fz);
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        const ank = new T.Vector3(foot.x, foot.y + 0.2 * cp + 0.07 * sp, foot.z + 0.2 * sp - 0.07 * cp);
        const top = new T.Vector3(foot.x, foot.y + 0.115 * cp + 0.01 * sp, foot.z + 0.115 * sp - 0.01 * cp);
        const K = this.ik(H, ank, hp.L1, hp.L2, new T.Vector3(0, 0, L.front ? 1 : -1), new T.Vector3());
        const pts = l.pts; const dU = new T.Vector3().subVectors(K, H).normalize();
        const set = (p, v) => { p.x = v.x; p.y = v.y; p.z = v.z; };
        set(pts[0], new T.Vector3().copy(H).addScaledVector(dU, -0.10));
        set(pts[1], new T.Vector3().lerpVectors(H, K, 0.5));
        set(pts[2], K);
        set(pts[3], new T.Vector3().lerpVectors(K, ank, 0.3));
        set(pts[4], new T.Vector3().lerpVectors(K, ank, 0.78));
        set(pts[5], ank);
        set(pts[6], new T.Vector3().lerpVectors(ank, top, 0.6));
        set(pts[7], top);
        l.tube.update(pts, new T.Vector3(1, 0, 0));
        l.hoof.position.copy(foot); l.hoof.rotation.set(pitch, 0, 0);
        l.pitch = pitch; l.stance = lp < DUTY;
      }

      // tail
      const tb = t.a.set(swayR * 0.9, 2.36 + bobR, -1.07);
      let tx = tb.x, ty = tb.y, tz = tb.z; const tl = 1.0 / 8; let dir = new T.Vector3();
      for (let i = 0; i < 9; i++) {
        const p = this.tailPts[i]; p.x = tx; p.y = ty; p.z = tz;
        const bk = 0.25 + 0.035 * i + (rest ? 0 : 0.09 * Math.sin(time * 1.9 - i * 0.45) * Math.min(1, i / 3) + 0.12 * Math.sin(TWO * ph * 2 - i * 0.3) * (i / 8));
        const sd = rest ? 0 : (0.05 + 0.05 * i) * Math.sin(time * 1.15 - i * 0.5) * 0.9;
        dir.set(Math.sin(sd), -Math.cos(bk) * Math.cos(sd), -Math.sin(bk)).normalize();
        tx += dir.x * tl; ty += dir.y * tl; tz += dir.z * tl;
      }
      this.tail.update(this.tailPts, new T.Vector3(1, 0, 0));
      const tp = this.tailPts[8];
      this.tuft.position.set(tp.x, tp.y, tp.z);
      const down = new T.Vector3(0, -1, 0);
      this.tuft.quaternion.setFromUnitVectors(down, dir.clone().normalize());
    }

    update(dt, time) {
      dt *= this.speedFactor;
      this.time += dt; this.phase = (this.phase + dt / this.cycleT) % 1;
      this.setPose(this.time, this.phase, false);
    }
  }
  window.Giraffe = Giraffe;
  window.GIRAFFE_GAIT = { DUTY, STRIDE };
})();
