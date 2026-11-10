// Deformable "generalized tube": a skin swept along a Catmull-Rom spine through
// control points, with per-control elliptical (asymmetric up/down) cross sections.
// The mesh topology is fixed; vertex positions are recomputed every frame (CPU skinning).
// A rest-pose coordinate attribute (aRest) lets the coat shader keep the
// pattern glued to the skin while it deforms.
(function () {
  'use strict';
  const V = THREE.Vector3;
  const _t = new V(), _side = new V(), _up = new V(), _p = new V();

  function cr(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  function crd(p0, p1, p2, p3, t) {
    const t2 = t * t;
    return 0.5 * ((-p0 + p2) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2);
  }

  class Tube {
    // opts: rings, radial, ctrl: [{p:[x,y,z], r:[up,down,side]}], capStart, capEnd (fractions of length),
    // sideHint (Vector3), patFn(restPos, u) -> [cellSize, amount, tint], material, exponent
    constructor(opts) {
      this.rings = opts.rings; this.radial = opts.radial;
      this.capStart = opts.capStart || 0; this.capEnd = opts.capEnd || 0;
      this.sideHint = opts.sideHint || new V(0, 0, 1);
      this.exponent = opts.exponent || 1;
      const n = this.n = opts.ctrl.length;
      this.P = opts.ctrl.map(c => new V().fromArray(c.p));
      this.R = opts.ctrl.map(c => c.r.slice());
      // per-ring center/frame/radius outputs (useful for attachments like the mane)
      this.center = []; this.upv = []; this.sidev = []; this.tan = []; this.rad = [];
      for (let i = 0; i < this.rings; i++) {
        this.center.push(new V()); this.upv.push(new V()); this.sidev.push(new V()); this.tan.push(new V());
        this.rad.push([0, 0, 0]);
      }
      // ring distribution by rest arc length between controls
      const L = [0];
      for (let k = 1; k < n; k++) L.push(L[k - 1] + this.P[k].distanceTo(this.P[k - 1]));
      const total = L[n - 1];
      this.ringK = new Int32Array(this.rings); this.ringT = new Float32Array(this.rings); this.ringU = new Float32Array(this.rings);
      for (let i = 0; i < this.rings; i++) {
        const u = i / (this.rings - 1), s = u * total;
        let k = 0;
        while (k < n - 2 && L[k + 1] < s) k++;
        this.ringK[i] = k;
        this.ringT[i] = Math.min(1, Math.max(0, (s - L[k]) / (L[k + 1] - L[k])));
        this.ringU[i] = u;
      }
      // trig table with superellipse exponent
      this.cs = []; this.sn = [];
      for (let j = 0; j < this.radial; j++) {
        const a = j / this.radial * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), e = this.exponent;
        this.cs.push(Math.sign(c) * Math.pow(Math.abs(c), e));
        this.sn.push(Math.sign(s) * Math.pow(Math.abs(s), e));
      }
      const count = this.rings * this.radial;
      const geo = this.geometry = new THREE.BufferGeometry();
      this.pos = new Float32Array(count * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      const idx = [];
      const R = this.radial;
      for (let i = 0; i < this.rings - 1; i++) {
        for (let j = 0; j < R; j++) {
          const a = i * R + j, b = (i + 1) * R + j, c = i * R + (j + 1) % R, d = (i + 1) * R + (j + 1) % R;
          idx.push(a, b, c, b, d, c);
        }
      }
      geo.setIndex(idx);
      this.update();
      // rest attributes
      const rest = new Float32Array(count * 3), pat = new Float32Array(count * 3);
      for (let i = 0; i < this.rings; i++) {
        for (let j = 0; j < R; j++) {
          const v = i * R + j;
          _p.fromArray(this.pos, v * 3);
          const f = opts.patFn ? opts.patFn(_p, this.ringU[i], j / R) : [0.25, 1, 0];
          rest[v * 3] = _p.x / f[0] + (opts.patOffset || 0);
          rest[v * 3 + 1] = _p.y / f[0];
          rest[v * 3 + 2] = _p.z / f[0];
          pat[v * 3] = f[1]; pat[v * 3 + 1] = f[2]; pat[v * 3 + 2] = f[3] || 0;
        }
      }
      geo.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
      geo.setAttribute('aPat', new THREE.BufferAttribute(pat, 3));
      this.mesh = new THREE.Mesh(geo, opts.material);
      this.mesh.frustumCulled = false;
      this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    }

    setCtrl(k, v, r) { this.P[k].copy(v); if (r) this.R[k] = r; }

    update() {
      const P = this.P, Rr = this.R, n = this.n, pos = this.pos, Rad = this.radial;
      const ext0 = new V().copy(P[0]).multiplyScalar(2).sub(P[1]);
      const extN = new V().copy(P[n - 1]).multiplyScalar(2).sub(P[n - 2]);
      const get = k => (k < 0 ? ext0 : k >= n ? extN : P[k]);
      const getR = (k, c) => (k < 0 ? 2 * Rr[0][c] - Rr[1][c] : k >= n ? 2 * Rr[n - 1][c] - Rr[n - 2][c] : Rr[k][c]);
      for (let i = 0; i < this.rings; i++) {
        const k = this.ringK[i], t = this.ringT[i], u = this.ringU[i];
        const p0 = get(k - 1), p1 = get(k), p2 = get(k + 1), p3 = get(k + 2);
        const c = this.center[i].set(cr(p0.x, p1.x, p2.x, p3.x, t), cr(p0.y, p1.y, p2.y, p3.y, t), cr(p0.z, p1.z, p2.z, p3.z, t));
        _t.set(crd(p0.x, p1.x, p2.x, p3.x, t), crd(p0.y, p1.y, p2.y, p3.y, t), crd(p0.z, p1.z, p2.z, p3.z, t)).normalize();
        _side.copy(this.sideHint).addScaledVector(_t, -_t.dot(this.sideHint)).normalize();
        _up.crossVectors(_side, _t);
        this.tan[i].copy(_t); this.sidev[i].copy(_side); this.upv[i].copy(_up);
        let m = 1;
        if (this.capEnd && u > 1 - this.capEnd) { const q = (u - (1 - this.capEnd)) / this.capEnd; m = Math.sqrt(Math.max(0, 1 - q * q)); }
        if (this.capStart && u < this.capStart) { const q = 1 - u / this.capStart; m = Math.sqrt(Math.max(0, 1 - q * q)); }
        const rr = this.rad[i];
        for (let ci = 0; ci < 3; ci++) {
          rr[ci] = Math.max(0.004, cr(getR(k - 1, ci), getR(k, ci), getR(k + 1, ci), getR(k + 2, ci), t)) * m;
        }
        const base = i * Rad * 3;
        for (let j = 0; j < Rad; j++) {
          const s = this.sn[j], cc = this.cs[j];
          const ru = s > 0 ? rr[0] : rr[1];
          const ox = _side.x * cc * rr[2] + _up.x * s * ru;
          const oy = _side.y * cc * rr[2] + _up.y * s * ru;
          const oz = _side.z * cc * rr[2] + _up.z * s * ru;
          pos[base + j * 3] = c.x + ox; pos[base + j * 3 + 1] = c.y + oy; pos[base + j * 3 + 2] = c.z + oz;
        }
      }
      const g = this.geometry;
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
      const nrm = g.attributes.normal.array;
      const fix = (i, sign) => {
        const t = this.tan[i];
        for (let j = 0; j < Rad; j++) { const o = (i * Rad + j) * 3; nrm[o] = t.x * sign; nrm[o + 1] = t.y * sign; nrm[o + 2] = t.z * sign; }
      };
      if (this.capEnd) fix(this.rings - 1, 1);
      if (this.capStart) fix(0, -1);
      g.attributes.normal.needsUpdate = true;
    }
  }
  window.Tube = Tube;
})();
