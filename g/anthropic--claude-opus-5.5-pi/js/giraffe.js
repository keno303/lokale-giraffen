// Procedural giraffe: anatomy built from deformable tubes, driven by a
// lateral-sequence walk (giraffes walk almost like a pace), with analytic
// 2-bone IK + joint-flex profiles for each leg, world-locked hoof plants,
// neck counter-bobbing, body sway, swinging tail and an idle head look-around.
(function () {
  'use strict';
  const V = THREE.Vector3;
  const D2R = Math.PI / 180;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpV = (a, b, t) => new V().lerpVectors(a, b, t);

  // Two-bone IK in a 2D plane. Returns joint and (possibly clamped) end.
  function ik2(ax, ay, tx, ty, l1, l2, bend) {
    let dx = tx - ax, dy = ty - ay, d = Math.hypot(dx, dy);
    const maxd = (l1 + l2) * 0.9995, mind = Math.abs(l1 - l2) + 1e-3;
    let clamped = false;
    if (d > maxd) { dx *= maxd / d; dy *= maxd / d; d = maxd; clamped = true; }
    if (d < mind) { dx *= mind / d; dy *= mind / d; d = mind; }
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const base = Math.atan2(dy, dx) + bend * a;
    return { jx: ax + l1 * Math.cos(base), jy: ay + l1 * Math.sin(base), ex: ax + dx, ey: ay + dy, clamped };
  }
  // Split the second bone of a chain (virtual segment J->E of length Lv) into two bones (r, c) with a mid joint.
  function midJoint(jx, jy, ex, ey, r, c, bend) {
    const dx = ex - jx, dy = ey - jy, Lv = Math.hypot(dx, dy);
    const a = Math.acos(clamp((r * r + Lv * Lv - c * c) / (2 * r * Lv), -1, 1));
    const base = Math.atan2(dy, dx) + bend * a;
    return [jx + r * Math.cos(base), jy + r * Math.sin(base)];
  }

  const P = (x, y, z) => new V(x, y, z || 0);

  class Giraffe {
    constructor(coat) {
      this.root = new THREE.Group();
      this.coat = coat;
      this.time = 0;
      this.cycle = 1.75;      // seconds per stride at time-scale 1
      this.speed = 1.5;       // m/s
      this.duty = 0.6;
      this.hoofH = 0.1;
      this.stanceLen = this.speed * this.cycle * this.duty;

      // lengths
      this.L = {
        hum: 0.55, rad: 0.9, mc: 0.78, pas: 0.2,     // fore
        fem: 0.62, tib: 0.84, mt: 0.80,              // hind
      };
      // body-local joint anchors (z = left side positive)
      this.anch = {
        scap: P(0.52, 2.98), sho: P(0.84, 2.28), hip: P(-0.92, 2.26), ili: P(-0.76, 2.62),
      };
      // legs: phase offsets (lateral sequence), side
      this.legs = [
        { name: 'LH', hind: true, side: 1, off: 0.0 },
        { name: 'LF', hind: false, side: 1, off: 0.15 },
        { name: 'RH', hind: true, side: -1, off: 0.5 },
        { name: 'RF', hind: false, side: -1, off: 0.65 },
      ];
      for (const lg of this.legs) {
        lg.baseX = lg.hind ? -0.86 : 0.62;
        lg.hz = lg.side * (lg.hind ? 0.2 : 0.21);
        lg.topZ = lg.side * (lg.hind ? 0.25 : 0.25);
        lg.inStance = null; lg.plant = new V(); lg.lift = new V(); lg.liftAlpha = 55;
      }
      this.bodyM = new THREE.Matrix4();
      this.look = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, timer: 2 };
      this.headM = new THREE.Matrix4();

      this._build();
    }

    // -------------------------------------------------------- rest shapes
    _bodyCtrl() {
      return [
        { p: [-1.32, 2.52], r: [0.10, 0.14, 0.12] },
        { p: [-1.20, 2.47], r: [0.25, 0.34, 0.27] },
        { p: [-0.92, 2.42], r: [0.32, 0.46, 0.35] },
        { p: [-0.45, 2.45], r: [0.33, 0.52, 0.39] },
        { p: [0.05, 2.55], r: [0.43, 0.61, 0.44] },
        { p: [0.52, 2.66], r: [0.52, 0.64, 0.41] },
        { p: [0.92, 2.48], r: [0.36, 0.56, 0.33] },
        { p: [1.18, 2.30], r: [0.20, 0.30, 0.24] },
      ];
    }
    _neckCtrl() {
      return [
        { p: [0.66, 2.70], r: [0.38, 0.46, 0.30] },
        { p: [0.98, 3.06], r: [0.27, 0.33, 0.235] },
        { p: [1.25, 3.50], r: [0.20, 0.24, 0.175] },
        { p: [1.50, 3.95], r: [0.155, 0.18, 0.14] },
        { p: [1.72, 4.38], r: [0.125, 0.145, 0.115] },
        { p: [1.87, 4.70], r: [0.11, 0.125, 0.10] },
      ];
    }
    // head-local: x forward along the face, y dorsal, origin at the poll/atlas
    _headCtrl() {
      return [
        { p: [-0.10, -0.02], r: [0.09, 0.10, 0.09] },
        { p: [0.0, 0.0], r: [0.125, 0.13, 0.105] },
        { p: [0.12, 0.0], r: [0.125, 0.135, 0.115] },
        { p: [0.27, -0.02], r: [0.10, 0.115, 0.085] },
        { p: [0.42, -0.035], r: [0.08, 0.09, 0.068] },
        { p: [0.55, -0.045], r: [0.074, 0.088, 0.068] },
        { p: [0.62, -0.05], r: [0.065, 0.08, 0.062] },
      ];
    }
    _tailCtrl() {
      return [
        { p: [-1.24, 2.56], r: [0.06, 0.06, 0.05] },
        { p: [-1.38, 2.50], r: [0.045, 0.045, 0.04] },
        { p: [-1.46, 2.25], r: [0.032, 0.032, 0.03] },
        { p: [-1.50, 1.90], r: [0.024, 0.024, 0.022] },
        { p: [-1.52, 1.55], r: [0.018, 0.018, 0.017] },
        { p: [-1.53, 1.30], r: [0.014, 0.014, 0.014] },
      ];
    }
    _foreR() {
      return [
        [0.22, 0.24, 0.10], [0.27, 0.27, 0.135], [0.21, 0.22, 0.14], [0.17, 0.17, 0.12],
        [0.12, 0.14, 0.10], [0.10, 0.085, 0.08], [0.06, 0.055, 0.055], [0.068, 0.062, 0.066],
        [0.046, 0.046, 0.045], [0.042, 0.042, 0.042], [0.058, 0.056, 0.052], [0.047, 0.047, 0.046], [0.055, 0.055, 0.054],
      ];
    }
    _hindR() {
      return [
        [0.20, 0.22, 0.10], [0.30, 0.31, 0.17], [0.27, 0.25, 0.15], [0.16, 0.18, 0.12],
        [0.11, 0.13, 0.09], [0.06, 0.075, 0.055], [0.06, 0.085, 0.058],
        [0.048, 0.048, 0.046], [0.043, 0.043, 0.043], [0.058, 0.056, 0.052], [0.047, 0.047, 0.046], [0.055, 0.055, 0.054],
      ];
    }

    _build() {
      const coat = this.coat;
      const pose = this._pose(0, true);
      const toCtrl = (pts, rs) => pts.map((p, i) => ({ p: p.toArray(), r: rs[i] }));
      const leftOnly = (p) => p; // pattern uses actual rest position

      const bodyPat = (p) => [0.3, 1, 0.55 * smooth(2.2, 1.95, p.y), 0];
      this.body = new Tube({ rings: 64, radial: 36, ctrl: toCtrl(pose.body, this._bodyCtrl().map(c => c.r)), capStart: 0.06, capEnd: 0.12, material: coat, patFn: bodyPat });
      this.neck = new Tube({ rings: 56, radial: 28, ctrl: toCtrl(pose.neck, this._neckCtrl().map(c => c.r)), capEnd: 0.0, material: coat, patFn: (p, u) => [0.3 - 0.06 * u, 1, 0.15 * u, 0] });
      this.head = new Tube({
        rings: 40, radial: 28, ctrl: toCtrl(pose.head, this._headCtrl().map(c => c.r)), capStart: 0.12, capEnd: 0.14, material: coat, exponent: 0.9,
        patFn: (p, u) => [0.1, 0.9 * (1 - smooth(0.45, 0.75, u)), 0.55, 0.55 + 0.35 * smooth(0.55, 1.0, u)],
      });
      this.tail = new Tube({ rings: 30, radial: 10, ctrl: toCtrl(pose.tail, this._tailCtrl().map(c => c.r)), capEnd: 0.05, material: coat, patFn: () => [0.14, 0.5, 0.2, 0] });
      const legPat = (p) => [lerp(0.13, 0.3, smooth(0.9, 2.1, p.y)), smooth(0.25, 1.3, p.y), 0.35 * (1 - smooth(1.0, 1.9, p.y)), 0];
      for (const lg of this.legs) {
        const pts = pose.legs[lg.name].pts;
        lg.tube = new Tube({ rings: lg.hind ? 80 : 86, radial: 16, ctrl: toCtrl(pts, lg.hind ? this._hindR() : this._foreR()), capStart: 0.02, material: coat, patFn: legPat });
      }
      for (const t of [this.body, this.neck, this.head, this.tail, ...this.legs.map(l => l.tube)]) this.root.add(t.mesh);

      // hooves
      const hoofGeo = new THREE.CylinderGeometry(0.052, 0.075, 0.105, 18, 2);
      const hp = hoofGeo.attributes.position;
      for (let i = 0; i < hp.count; i++) {
        let x = hp.getX(i), y = hp.getY(i) - 0.0525, z = hp.getZ(i);
        x += -y * 0.55 + 0.01;              // sloped dorsal wall: toe ahead of coronet
        if (x > 0.02 && Math.abs(z) < 0.012 && y < -0.02) x -= 0.02; // cleft between the two claws
        hp.setXYZ(i, x, y, z * 0.92);
      }
      hoofGeo.computeVertexNormals();
      const hoofMat = new THREE.MeshStandardMaterial({ color: 0x2b241f, roughness: 0.55 });
      for (const lg of this.legs) {
        lg.hoof = new THREE.Mesh(hoofGeo, hoofMat);
        lg.hoof.castShadow = true;
        this.root.add(lg.hoof);
      }

      // tail switch (tuft of long dark hair)
      const tuftGeo = new THREE.SphereGeometry(1, 14, 10);
      const tp = tuftGeo.attributes.position;
      for (let i = 0; i < tp.count; i++) {
        const y = tp.getY(i); const k = y < 0 ? 1 - 0.6 * (-y) : 1;
        tp.setXYZ(i, tp.getX(i) * 0.06 * k, y * 0.26 - 0.2, tp.getZ(i) * 0.06 * k);
      }
      tuftGeo.computeVertexNormals();
      this.hairMat = new THREE.MeshStandardMaterial({ color: 0x1c130d, roughness: 0.95 });
      this.tuft = new THREE.Mesh(tuftGeo, this.hairMat);
      this.tuft.castShadow = true;
      this.root.add(this.tuft);

      // mane: a thin wedge-shaped ribbon on the dorsal line of the neck
      this.maneN = 46;
      this.maneGeo = new THREE.BufferGeometry();
      this.manePos = new Float32Array(this.maneN * 3 * 3);
      this.maneGeo.setAttribute('position', new THREE.BufferAttribute(this.manePos, 3));
      const mi = [];
      for (let i = 0; i < this.maneN - 1; i++) {
        const a = i * 3, b = (i + 1) * 3;
        // left face (a0 base-left, a1 top, a2 base-right)
        mi.push(a, b, a + 1, b, b + 1, a + 1);
        mi.push(a + 2, a + 1, b + 2, b + 2, a + 1, b + 1);
      }
      this.maneGeo.setIndex(mi);
      this.maneMat = new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: 1, side: THREE.DoubleSide });
      this.mane = new THREE.Mesh(this.maneGeo, this.maneMat);
      this.mane.castShadow = true; this.mane.frustumCulled = false;
      this.root.add(this.mane);

      // head accessories in a head-local group
      this.headGroup = new THREE.Group();
      this.headGroup.matrixAutoUpdate = false;
      this.root.add(this.headGroup);
      this._buildHeadParts();

      this.update(0);
    }

    _coatify(geo, cell, amount, pale, tint, offset) {
      const n = geo.attributes.position.count, pos = geo.attributes.position;
      const rest = new Float32Array(n * 3), pat = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        rest[i * 3] = pos.getX(i) / cell + offset; rest[i * 3 + 1] = pos.getY(i) / cell; rest[i * 3 + 2] = pos.getZ(i) / cell;
        pat[i * 3] = amount; pat[i * 3 + 1] = pale; pat[i * 3 + 2] = typeof tint === 'function' ? tint(pos.getX(i), pos.getY(i), pos.getZ(i)) : tint;
      }
      geo.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
      geo.setAttribute('aPat', new THREE.BufferAttribute(pat, 3));
      return geo;
    }

    _buildHeadParts() {
      const g = this.headGroup, coat = this.coat;
      const add = (m) => { m.castShadow = true; g.add(m); return m; };
      // ossicones: skin-covered horns with black hair tufts on top
      for (const s of [1, -1]) {
        const og = new THREE.CylinderGeometry(0.022, 0.034, 0.15, 12, 4);
        og.translate(0, 0.075, 0);
        this._coatify(og, 0.05, 0.0, 0.5, 0.3, 3);
        const o = add(new THREE.Mesh(og, coat));
        o.position.set(0.0, 0.1, s * 0.048);
        o.rotation.set(s * 0.25, 0, 0.42);
        const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), this.hairMat);
        tuft.scale.set(1, 0.85, 1);
        tuft.position.set(0, 0.155, 0);
        tuft.castShadow = true;
        o.add(tuft);
      }
      // median ossicone bump on the forehead
      const mb = new THREE.SphereGeometry(0.05, 14, 10);
      mb.scale(1.3, 0.7, 0.9);
      this._coatify(mb, 0.05, 0.0, 0.5, 0.2, 5);
      add(new THREE.Mesh(mb, coat)).position.set(0.2, 0.068, 0);

      // ears: leaf-shaped, angled out sideways and back
      for (const s of [1, -1]) {
        const eg = new THREE.SphereGeometry(1, 16, 12);
        const ep = eg.attributes.position;
        for (let i = 0; i < ep.count; i++) {
          const x = ep.getX(i), y = ep.getY(i), z = ep.getZ(i);
          const t = (y + 1) / 2;                                // 0 base .. 1 tip
          const w = Math.sin(Math.PI * Math.pow(t, 0.75)) * 0.045 + 0.008;
          let zz = z * 0.016;
          if (z > 0) zz -= w * 0.35;                              // cupped inner face
          ep.setXYZ(i, x * w, t * 0.17, zz);
        }
        eg.computeVertexNormals();
        this._coatify(eg, 0.05, 0.0, 0.6, (x, y, z) => (z < -0.004 ? 0.0 : 0.15), 7);
        const ear = add(new THREE.Mesh(eg, coat));
        ear.position.set(-0.03, 0.06, s * 0.08);
        // point the ear out sideways, a bit back and up; the cupped face looks forward/out
        const dir = new V(-0.35, 0.3, s * 0.89).normalize();
        ear.quaternion.setFromUnitVectors(new V(0, 1, 0), dir);
        ear.rotateY(s * -1.2);
        ear.scale.set(1.25, 1.25, 1.25);
      }
      // eyes: large dark glossy eyes, with brow/lids
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0b0705, roughness: 0.15, metalness: 0.0 });
      const lidGeo = this._coatify(new THREE.TorusGeometry(0.03, 0.011, 8, 20), 0.04, 0.0, 0.5, 0.35, 9);
      for (const s of [1, -1]) {
        const e = add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), eyeMat));
        e.position.set(0.12, 0.045, s * 0.098);
        e.scale.set(1.15, 1, 0.8);
        const lid = add(new THREE.Mesh(lidGeo, coat));
        lid.position.copy(e.position); lid.position.z += s * 0.006;
        lid.rotation.y = s * 0.25;
        lid.scale.set(1.15, 1, 1);
        const brow = new THREE.SphereGeometry(0.04, 12, 8); brow.scale(1.3, 0.55, 0.8);
        this._coatify(brow, 0.05, 0.0, 0.5, 0.3, 11);
        add(new THREE.Mesh(brow, coat)).position.set(0.115, 0.085, s * 0.082);
      }
      // nostrils and lip line
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x24170f, roughness: 0.7 });
      for (const s of [1, -1]) {
        const n = add(new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), darkMat));
        n.scale.set(1.8, 0.6, 0.6);
        n.position.set(0.6, 0.0, s * 0.04);
        n.rotation.set(0, s * 0.35, 0.5);
      }
      const lip = add(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.005, 6, 24, Math.PI * 0.9), darkMat));
      lip.position.set(0.6, -0.08, 0);
      lip.rotation.set(Math.PI / 2, 0, Math.PI / 2 + Math.PI * 0.05);
      lip.scale.set(1.0, 1.2, 1);
    }

    // -------------------------------------------------------- pose
    // Returns all control points in root space. neutral=true gives the rest stance.
    _pose(dt, neutral) {
      const t = this.time;
      const ph = neutral ? 0 : (t / this.cycle) % 1;
      const out = { legs: {} };
      // body motion
      const bob = neutral ? 0 : 0.022 * Math.cos(4 * Math.PI * (ph - 0.12));
      const pitch = neutral ? 0 : 0.012 * Math.sin(4 * Math.PI * (ph - 0.05));
      const roll = neutral ? 0 : 0.028 * Math.sin(2 * Math.PI * (ph - 0.2));
      const sway = neutral ? 0 : 0.035 * Math.sin(2 * Math.PI * (ph - 0.2));
      const yawW = neutral ? 0 : 0.015 * Math.sin(2 * Math.PI * (ph - 0.1));
      const pivot = P(0, 2.4, 0);
      const m = this.bodyM.identity();
      const tmp = new THREE.Matrix4();
      m.makeTranslation(0, bob, sway);
      m.multiply(tmp.makeTranslation(pivot.x, pivot.y, pivot.z));
      m.multiply(tmp.makeRotationFromEuler(new THREE.Euler(roll, yawW, pitch, 'YZX')));
      m.multiply(tmp.makeTranslation(-pivot.x, -pivot.y, -pivot.z));
      const B = (v) => v.clone().applyMatrix4(m);

      out.body = this._bodyCtrl().map(c => B(P(c.p[0], c.p[1])));

      // neck: rigid swing around its base, counter-phased to the forelimb strides, plus idle look-around
      const lk = this.look;
      if (!neutral) {
        lk.timer -= dt;
        if (lk.timer < 0) {
          lk.timer = 3 + Math.random() * 5;
          lk.tYaw = (Math.random() - 0.5) * 0.5; lk.tPitch = (Math.random() - 0.4) * 0.16;
          if (Math.random() < 0.35) { lk.tYaw = 0; lk.tPitch = 0; }
        }
        const k = 1 - Math.exp(-dt * 0.9);
        lk.yaw += (lk.tYaw - lk.yaw) * k; lk.pitch += (lk.tPitch - lk.pitch) * k;
      }
      const nb = neutral ? 0 : 0.045 * Math.sin(4 * Math.PI * (ph - 0.27)); // neck bob (radians)
      const nctrl = this._neckCtrl();
      const base = P(nctrl[0].p[0], nctrl[0].p[1]);
      out.neck = nctrl.map((c, i) => {
        const u = i / (nctrl.length - 1);
        const v = P(c.p[0], c.p[1]).sub(base);
        v.applyAxisAngle(new V(0, 0, 1), -(nb + lk.pitch) * (0.4 + 0.6 * u));
        v.applyAxisAngle(new V(0, 1, 0), lk.yaw * u * u + roll * 0.4 * u);
        return B(v.add(base));
      });
      // head frame: at the end of the neck, pitched forward/down; counter-rotates neck bob
      const nEnd = out.neck[out.neck.length - 1], nPrev = out.neck[out.neck.length - 2];
      const ndir = nEnd.clone().sub(nPrev).normalize();
      const headPitch = -38 * D2R + nb * 0.6 + lk.pitch * 0.5 + pitch;
      const hq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, lk.yaw * 1.15, headPitch, 'YZX'));
      const hpos = nEnd.clone().addScaledVector(ndir, 0.03);
      this.headM.compose(hpos, hq, new V(1, 1, 1));
      out.head = this._headCtrl().map(c => P(c.p[0], c.p[1]).applyMatrix4(this.headM));

      // tail: hanging, swishing with stride and lazily
      const tc = this._tailCtrl();
      const tsw = neutral ? 0 : Math.sin(t * 1.9) * 0.18 + Math.sin(2 * Math.PI * ph) * 0.08;
      const tsw2 = neutral ? 0 : Math.sin(t * 1.3 + 1.0) * 0.08;
      out.tail = tc.map((c, i) => {
        const u = i / (tc.length - 1);
        const v = P(c.p[0], c.p[1], tsw * u * u * 1.2);
        v.x += tsw2 * u * u * 0.6 - (neutral ? 0 : Math.abs(tsw) * 0.08 * u);
        return B(v);
      });

      // legs
      const L = this.L;
      for (const lg of this.legs) {
        const lp = neutral ? lg.off * 0 : (ph - lg.off + 1) % 1;
        const top = B(lg.hind ? P(this.anch.hip.x, this.anch.hip.y, lg.topZ) : P(this.anch.sho.x, this.anch.sho.y, lg.topZ));
        const top2 = B(lg.hind ? P(this.anch.ili.x, this.anch.ili.y, lg.topZ * 0.8) : P(this.anch.scap.x, this.anch.scap.y, lg.topZ * 0.75));
        let C, alpha, flex, hoofRot = 0;
        const E = this.stanceLen;
        const restAlpha = 55;
        if (neutral) {
          C = P(lg.baseX, this.hoofH, lg.hz); alpha = restAlpha; flex = lg.hind ? 30 : 0;
          lg.neutral = true;
        } else {
          const stance = lp < this.duty;
          if (stance) {
            const s = lp / this.duty;
            if (lg.inStance !== true) {
              // touchdown: lock the hoof in world space
              const local = P(lg.baseX + E * (0.5 - s), this.hoofH, lg.hz);
              lg.plant.copy(this.root.localToWorld(local));
              lg.inStance = true;
            }
            const loc = this.root.worldToLocal(lg.plant.clone());
            const heel = smooth(0.8, 1.0, s);
            const rho = heel * 38;                          // breakover around the toe
            const toeX = loc.x + 0.1, toeY = 0.0;
            const ang = -rho * D2R;
            const dx = loc.x - toeX, dy = loc.y - toeY;
            C = P(toeX + dx * Math.cos(ang) - dy * Math.sin(ang), toeY + dx * Math.sin(ang) + dy * Math.cos(ang), loc.z);
            const load = Math.sin(Math.PI * clamp(s * 1.25, 0, 1));
            alpha = restAlpha - 6 * load + rho;
            hoofRot = -rho;
            flex = lg.hind ? 28 + 4 * load + 12 * heel : 22 * heel;
            lg.liftAlpha = alpha; lg.lift.copy(C); lg.liftFlex = flex;
          } else {
            const s = (lp - this.duty) / (1 - this.duty);
            if (lg.inStance !== false) {
              if (lg.inStance === null) { lg.lift.set(lg.baseX - E * 0.5, this.hoofH, lg.hz); lg.liftAlpha = 93; lg.liftFlex = lg.hind ? 40 : 22; }
              lg.inStance = false;
            }
            const tdX = lg.baseX + E * 0.5;
            const e = s * s * s * (s * (s * 6 - 15) + 10);
            const ex = smooth(0.0, 0.92, s);
            const x = lerp(lg.lift.x, tdX, (e + ex) * 0.5);
            const lift = (lg.hind ? 0.2 : 0.28) * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.85)), 1.2);
            const y = lerp(lg.lift.y, this.hoofH, smooth(0, 0.7, s)) + lift;
            C = P(x, y, lerp(lg.lift.z, lg.hz, s));
            const fold = Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.3)), 1.1);
            alpha = restAlpha + (lg.liftAlpha - restAlpha) * (1 - smooth(0, 0.85, s)) + 62 * fold;
            hoofRot = -(alpha - restAlpha);
            if (lg.hind) flex = 28 + (lg.liftFlex - 28) * (1 - smooth(0, 0.7, s)) + 38 * fold;
            else flex = lg.liftFlex * (1 - smooth(0, 0.5, s)) + 82 * fold;
          }
        }
        // fetlock from coronet + pastern
        const a = alpha * D2R;
        let Fx = C.x - Math.cos(a) * L.pas, Fy = C.y + Math.sin(a) * L.pas;
        const th = flex * D2R;
        let pts;
        if (!lg.hind) {
          const Lv = Math.sqrt(L.rad * L.rad + L.mc * L.mc + 2 * L.rad * L.mc * Math.cos(th));
          const r = ik2(top.x, top.y, Fx, Fy, L.hum, Lv, -1);
          if (r.clamped) { const dx = r.ex - Fx, dy = r.ey - Fy; Fx += dx; Fy += dy; C.x += dx; C.y += dy; }
          const [kx, ky] = midJoint(r.jx, r.jy, Fx, Fy, L.rad, L.mc, 1);
          const zAt = (y) => lerp(lg.hz, lg.topZ, clamp(y / top.y, 0, 1));
          const Sh = P(top.x, top.y, top.z), El = P(r.jx, r.jy, zAt(r.jy)), K = P(kx, ky, zAt(ky)), F = P(Fx, Fy, zAt(Fy));
          C.z = lg.hz + (C.z - lg.hz);
          // scapula rotates a little with the humerus
          const humAng = Math.atan2(r.jy - top.y, r.jx - top.x);
          const sc = top2.clone().sub(Sh); sc.applyAxisAngle(new V(0, 0, 1), (humAng + 2.35) * 0.35);
          const Sc = Sh.clone().add(sc);
          pts = [Sc, lerpV(Sc, Sh, 0.5), Sh, lerpV(Sh, El, 0.5), El, lerpV(El, K, 0.28), lerpV(El, K, 0.72), K,
            lerpV(K, F, 0.22), lerpV(K, F, 0.75), F, lerpV(F, C, 0.5), C.clone()];
        } else {
          const Lv = Math.sqrt(L.tib * L.tib + L.mt * L.mt + 2 * L.tib * L.mt * Math.cos(th));
          const r = ik2(top.x, top.y, Fx, Fy, L.fem, Lv, 1);
          if (r.clamped) { const dx = r.ex - Fx, dy = r.ey - Fy; Fx += dx; Fy += dy; C.x += dx; C.y += dy; }
          const [hx, hy] = midJoint(r.jx, r.jy, Fx, Fy, L.tib, L.mt, -1);
          const zAt = (y) => lerp(lg.hz, lg.topZ, clamp(y / top.y, 0, 1));
          const H = P(top.x, top.y, top.z), St = P(r.jx, r.jy, zAt(r.jy) + lg.side * 0.03), Ho = P(hx, hy, zAt(hy)), F = P(Fx, Fy, zAt(Fy));
          const Il = top2.clone();
          pts = [Il, H, lerpV(H, St, 0.5), St, lerpV(St, Ho, 0.33), lerpV(St, Ho, 0.75), Ho,
            lerpV(Ho, F, 0.22), lerpV(Ho, F, 0.75), F, lerpV(F, C, 0.5), C.clone()];
        }
        out.legs[lg.name] = { pts, C: C.clone(), hoofRot };
      }
      return out;
    }

    update(dt) {
      this.time += dt;
      this.root.updateMatrixWorld(true);
      const pose = this._pose(dt, false);
      const setAll = (tube, pts) => { for (let i = 0; i < pts.length; i++) tube.P[i].copy(pts[i]); tube.update(); };
      setAll(this.body, pose.body);
      setAll(this.neck, pose.neck);
      setAll(this.head, pose.head);
      setAll(this.tail, pose.tail);
      for (const lg of this.legs) {
        const L = pose.legs[lg.name];
        setAll(lg.tube, L.pts);
        lg.hoof.position.copy(L.C);
        lg.hoof.rotation.set(0, 0, L.hoofRot * D2R);
      }
      // tail tuft at tail tip
      const tt = this.tail.center[this.tail.rings - 1], tp = this.tail.center[this.tail.rings - 4];
      this.tuft.position.copy(tt).addScaledVector(tt.clone().sub(tp).normalize(), 0.03);
      this.tuft.quaternion.setFromUnitVectors(new V(0, -1, 0), tt.clone().sub(tp).normalize());
      // head parts
      this.headGroup.matrix.copy(this.headM);
      this.headGroup.matrixWorldNeedsUpdate = true;
      this._updateMane();
    }

    _updateMane() {
      const nk = this.neck, N = this.maneN, pos = this.manePos;
      const r0 = 0.12, r1 = nk.rings - 1;
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        const f = lerp(r0 * r1, r1, u);
        const k = Math.min(r1 - 1, Math.floor(f)), t = f - k;
        const c = new V().lerpVectors(nk.center[k], nk.center[k + 1], t);
        const up = new V().lerpVectors(nk.upv[k], nk.upv[k + 1], t).normalize();
        const sd = new V().lerpVectors(nk.sidev[k], nk.sidev[k + 1], t).normalize();
        const ru = lerp(nk.rad[k][0], nk.rad[k + 1][0], t);
        const h = (0.05 + 0.06 * Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.05))) * (u < 0.08 ? u / 0.08 : 1) * (u > 0.96 ? (1 - u) / 0.04 + 0.2 : 1);
        const w = 0.022 * (1 - 0.4 * u);
        const b = c.clone().addScaledVector(up, ru * 0.93);
        const tip = b.clone().addScaledVector(up, h + 0.004 * Math.sin(i * 2.3));
        const o = i * 9;
        pos[o] = b.x + sd.x * w; pos[o + 1] = b.y + sd.y * w; pos[o + 2] = b.z + sd.z * w;
        pos[o + 3] = tip.x; pos[o + 4] = tip.y; pos[o + 5] = tip.z;
        pos[o + 6] = b.x - sd.x * w; pos[o + 7] = b.y - sd.y * w; pos[o + 8] = b.z - sd.z * w;
      }
      this.maneGeo.attributes.position.needsUpdate = true;
      this.maneGeo.computeVertexNormals();
    }
  }
  window.Giraffe = Giraffe;
})();
