/* Generic "swept tube" mesh builder.

   Every part of the giraffe (torso, neck, head, legs, tail, ossicones) is a
   tube swept along a Catmull-Rom spine with a per-section cross-section. The
   builder accumulates positions, analytic normals, UVs, skin indices/weights
   and the custom coat attribute into flat arrays which are later merged into a
   single SkinnedMesh. */
(function (global) {
  'use strict';

  const U = global.GU;

  function PartBuilder() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.skinIndex = [];
    this.skinWeight = [];
    this.coat = [];
    this.index = [];
    this.groups = [];           // { start, count, material }
    this._groupStart = 0;
    this._groupMat = 0;
  }

  PartBuilder.prototype.vertexCount = function () { return this.pos.length / 3; };

  PartBuilder.prototype.useMaterial = function (m) {
    if (m === this._groupMat) return;
    this._flushGroup();
    this._groupMat = m;
  };

  PartBuilder.prototype._flushGroup = function () {
    const count = this.index.length - this._groupStart;
    if (count > 0) {
      const last = this.groups[this.groups.length - 1];
      if (last && last.material === this._groupMat &&
          last.start + last.count === this._groupStart) {
        last.count += count;
      } else {
        this.groups.push({ start: this._groupStart, count: count, material: this._groupMat });
      }
    }
    this._groupStart = this.index.length;
  };

  PartBuilder.prototype.finish = function () {
    this._flushGroup();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.skinWeight, 4));
    g.setAttribute('aCoat', new THREE.Float32BufferAttribute(this.coat, 2));
    g.setIndex(this.index);
    for (const gr of this.groups) g.addGroup(gr.start, gr.count, gr.material);
    g.computeBoundingSphere();
    return g;
  };

  /* Resample a list of key sections into `samples` rings along a smooth curve.
     Each key section: { p:[x,y,z], rx, rUp, rDn, e, off }   (all optional but p) */
  function resample(keys, samples, refUp) {
    const pts = keys.map((k) => new THREE.Vector3(k.p[0], k.p[1], k.p[2]));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const pick = (name, dflt) => keys.map((k) => (k[name] !== undefined ? k[name] : dflt));
    const arx = pick('rx', 0.1), arUp = pick('rUp', 0.1), arDn = pick('rDn', 0.1);
    const ae = pick('e', 1.0), aoff = pick('off', 0.0), akx = pick('kx', 0.0);

    const out = [];
    const T = new THREE.Vector3(), side = new THREE.Vector3(), N = new THREE.Vector3();
    let arc = 0;
    let prev = null;
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const p = curve.getPoint(t);
      curve.getTangent(t, T).normalize();
      side.crossVectors(refUp, T);
      if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
      side.normalize();
      N.crossVectors(T, side).normalize();
      if (prev) arc += p.distanceTo(prev);
      prev = p.clone();
      const off = U.splineArray(aoff, t);
      out.push({
        p: p.clone().addScaledVector(N, off),
        T: T.clone(), side: side.clone(), N: N.clone(),
        rx: U.splineArray(arx, t),
        rUp: U.splineArray(arUp, t),
        rDn: U.splineArray(arDn, t),
        e: U.splineArray(ae, t),
        kx: U.splineArray(akx, t),
        arc: arc, t: t
      });
    }
    // Ring perimeter, used to keep the coat pattern square across the whole
    // body: v advances by (arc length / (perimeter / uTiles)).
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const sec of out) {
      let per = 0;
      const steps = 24;
      ringPoint(sec, 0, a);
      for (let k = 1; k <= steps; k++) {
        ringPoint(sec, (k / steps) * U.TAU, b);
        per += a.distanceTo(b);
        a.copy(b);
      }
      sec.perimeter = Math.max(per, 1e-4);
    }
    return out;
  }

  /* Evaluate one point of a ring. theta = 0 points along +N. */
  function ringPoint(sec, theta, out, scale) {
    const c = Math.cos(theta), s = Math.sin(theta);
    const e = sec.e;
    const w = (c + 1) * 0.5;
    const r = sec.rDn + (sec.rUp - sec.rDn) * w;
    const sx = Math.sign(s) * Math.pow(Math.abs(s), e);
    const sy = Math.sign(c) * Math.pow(Math.abs(c), e);
    const k = scale === undefined ? 1 : scale;
    // kx narrows the section towards its underside, giving the body a keel
    // instead of a barrel.
    const rxe = sec.rx * (1 - (sec.kx || 0) * Math.pow(1 - w, 1.4));
    out.copy(sec.p)
      .addScaledVector(sec.side, rxe * sx * k)
      .addScaledVector(sec.N, r * sy * k);
    return out;
  }

  /* opts:
       radial     - segments around the tube
       samples    - rings along the tube
       refUp      - reference vector used to build the frames
       uTiles     - how many texture tiles wrap around the circumference
       vScale     - metres of arc length per texture tile
       material   - group index
       capEnd     - close the far end with a flat fan
       weight(sec, theta, p) -> [ [boneIdx, w], ... ]
       coat(sec, theta, p, cosT) -> [pattern, tone]
  */
  PartBuilder.prototype.addTube = function (keys, opts) {
    const radial = opts.radial || 24;
    const samples = opts.samples || 40;
    const refUp = opts.refUp || new THREE.Vector3(0, 1, 0);
    const uTiles = opts.uTiles !== undefined ? opts.uTiles : 1;
    const vScale = opts.vScale || 1;
    const secs = resample(keys, samples, refUp);
    this.useMaterial(opts.material || 0);

    if (opts.vFromPerimeter) {
      // Tile length follows the local girth so the coat pattern stays roughly
      // square, but vPow < 1 damps how much the patches shrink on thin parts.
      const pw = opts.vPow !== undefined ? opts.vPow : 1;
      const ref = opts.vRef || 1;
      let v = 0;
      for (let i = 0; i < secs.length; i++) {
        if (i > 0) {
          const ds = secs[i].arc - secs[i - 1].arc;
          const per = (secs[i].perimeter + secs[i - 1].perimeter) * 0.5 / uTiles;
          v += ds / (Math.pow(per, pw) * Math.pow(ref, 1 - pw));
        }
        secs[i].v = v;
      }
    } else {
      for (const s of secs) s.v = s.arc / vScale;
    }

    const base = this.vertexCount();
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
    const dTheta = new THREE.Vector3(), dV = new THREE.Vector3(), nrm = new THREE.Vector3();
    const h = U.TAU / radial;

    for (let i = 0; i < samples; i++) {
      const sec = secs[i];
      for (let j = 0; j <= radial; j++) {
        const theta = (j % radial) * h;
        const p = ringPoint(sec, theta, new THREE.Vector3());

        // Analytic-ish normal: cross of the two surface derivatives, computed
        // with wrapped central differences so the UV seam matches exactly.
        ringPoint(sec, theta + h * 0.5, tmpA);
        ringPoint(sec, theta - h * 0.5, tmpB);
        dTheta.subVectors(tmpA, tmpB);
        const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, samples - 1);
        ringPoint(secs[i1], theta, tmpA);
        ringPoint(secs[i0], theta, tmpB);
        dV.subVectors(tmpA, tmpB);
        nrm.crossVectors(dV, dTheta).normalize();
        if (!isFinite(nrm.x) || nrm.lengthSq() < 0.5) nrm.copy(sec.N);
        // Keep normals pointing outwards.
        tmpA.subVectors(p, sec.p);
        if (nrm.dot(tmpA) < 0) nrm.negate();

        this.pos.push(p.x, p.y, p.z);
        this.nor.push(nrm.x, nrm.y, nrm.z);
        this.uv.push((j / radial) * uTiles, sec.v);

        const ws = opts.weight(sec, theta, p);
        let total = 0;
        for (let k = 0; k < ws.length; k++) total += ws[k][1];
        for (let k = 0; k < 4; k++) {
          const w = ws[k];
          this.skinIndex.push(w ? w[0] : 0);
          this.skinWeight.push(w ? w[1] / total : 0);
        }
        const ct = opts.coat ? opts.coat(sec, theta, p, Math.cos(theta)) : [1, 1];
        this.coat.push(ct[0], ct[1]);
      }
    }

    const stride = radial + 1;
    for (let i = 0; i < samples - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = base + i * stride + j;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        this.index.push(a, c, b, b, c, d);
      }
    }

    if (opts.capEnd) this._cap(secs[samples - 1], radial, opts, true);
    if (opts.capStart) this._cap(secs[0], radial, opts, false);
    return secs;
  };

  PartBuilder.prototype._cap = function (sec, radial, opts, far) {
    const base = this.vertexCount();
    const n = sec.T.clone();
    if (!far) n.negate();
    const h = U.TAU / radial;
    const push = (p, u, v) => {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(u, v);
      const ws = opts.weight(sec, 0, p);
      let total = 0;
      for (let k = 0; k < ws.length; k++) total += ws[k][1];
      for (let k = 0; k < 4; k++) {
        const w = ws[k];
        this.skinIndex.push(w ? w[0] : 0);
        this.skinWeight.push(w ? w[1] / total : 0);
      }
      const ct = opts.coat ? opts.coat(sec, Math.PI, p, -1) : [1, 1];
      this.coat.push(ct[0], ct[1]);
    };
    push(sec.p, 0.5, 0.5);
    const tmp = new THREE.Vector3();
    for (let j = 0; j < radial; j++) {
      ringPoint(sec, j * h, tmp, 0.985);
      push(tmp, 0.5 + Math.sin(j * h) * 0.5, 0.5 + Math.cos(j * h) * 0.5);
    }
    for (let j = 0; j < radial; j++) {
      const a = base, b = base + 1 + j, c = base + 1 + ((j + 1) % radial);
      if (far) this.index.push(a, b, c); else this.index.push(a, c, b);
    }
  };

  /* A thin double sided fin, used for the mane ridge and tail hair. */
  PartBuilder.prototype.addFin = function (spine, opts) {
    this.useMaterial(opts.material || 0);
    const base = this.vertexCount();
    const n = spine.length;
    const nrm = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const s = spine[i];
      for (let k = 0; k < 2; k++) {
        const p = k === 0 ? s.a : s.b;
        nrm.copy(s.n);
        this.pos.push(p.x, p.y, p.z);
        this.nor.push(nrm.x, nrm.y, nrm.z);
        this.uv.push(k, i / (n - 1) * (opts.vTiles || 1));
        const ws = opts.weight(s, p);
        let total = 0;
        for (let q = 0; q < ws.length; q++) total += ws[q][1];
        for (let q = 0; q < 4; q++) {
          const w = ws[q];
          this.skinIndex.push(w ? w[0] : 0);
          this.skinWeight.push(w ? w[1] / total : 0);
        }
        const ct = opts.coat ? opts.coat(s, p, k) : [1, 1];
        this.coat.push(ct[0], ct[1]);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      this.index.push(a, b, c, b, d, c);
    }
  };

  global.PartBuilder = PartBuilder;
  global.ringPoint = ringPoint;
  global.resampleSections = resample;
})(window);
