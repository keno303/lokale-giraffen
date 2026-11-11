// Signed-distance-field modelling + surface-nets meshing.
// The giraffe body is described as a smooth union of round cones / ellipsoids,
// each bound to a bone, and is turned into a single skinned mesh at load time.
(function () {
  'use strict';
  const GIR = (window.GIR = window.GIR || {});

  function norm3(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  class SdfModel {
    constructor() {
      this.prims = [];
      this.boneIndex = {};
      this.boneCount = 0;
    }

    // Generic primitive: a round cone (a,ra)-(b,rb) living in a local frame.
    // world -> local:  l = S^-1 * R^T * (p - c)
    _push(c, axes, scale, a, b, ra, rb, o) {
      const p = {
        cx: c[0], cy: c[1], cz: c[2],
        m00: axes[0][0] / scale[0], m01: axes[0][1] / scale[0], m02: axes[0][2] / scale[0],
        m10: axes[1][0] / scale[1], m11: axes[1][1] / scale[1], m12: axes[1][2] / scale[1],
        m20: axes[2][0] / scale[2], m21: axes[2][1] / scale[2], m22: axes[2][2] / scale[2],
        ax: a[0], ay: a[1], az: a[2],
        bax: b[0] - a[0], bay: b[1] - a[1], baz: b[2] - a[2],
        ra, rb,
        ds: Math.min(scale[0], scale[1], scale[2]),
        k: o.k !== undefined ? o.k : 0.05,
        sub: !!o.sub,
        bone: o.bone,
        mat: o.mat || 'skin',
        sig: 0,
      };
      p.l2 = p.bax * p.bax + p.bay * p.bay + p.baz * p.baz;
      p.sphere = p.l2 < 1e-10;
      p.rr = ra - rb;
      p.a2 = p.l2 - p.rr * p.rr;
      p.il2 = p.sphere ? 0 : 1 / p.l2;
      const maxS = Math.max(scale[0], scale[1], scale[2]);
      const len = Math.sqrt(p.l2);
      // world-space bounding sphere
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      p.bx = c[0] + axes[0][0] * mid[0] * scale[0] + axes[1][0] * mid[1] * scale[1] + axes[2][0] * mid[2] * scale[2];
      p.by = c[1] + axes[0][1] * mid[0] * scale[0] + axes[1][1] * mid[1] * scale[1] + axes[2][1] * mid[2] * scale[2];
      p.bz = c[2] + axes[0][2] * mid[0] * scale[0] + axes[1][2] * mid[1] * scale[1] + axes[2][2] * mid[2] * scale[2];
      p.br = (len / 2 + Math.max(ra, rb)) * maxS;
      p.aniso = maxS / p.ds;
      const rMean = 0.5 * (ra + rb) * p.ds;
      p.sig = o.sig !== undefined ? o.sig : Math.min(0.09, Math.max(0.012, 0.3 * rMean));
      this.prims.push(p);
      return p;
    }

    // round cone between world points a,b. opts.s = axis aligned scale about the midpoint
    rc(a, b, ra, rb, o = {}) {
      const s = o.s || [1, 1, 1];
      const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const la = [(a[0] - c[0]) / s[0], (a[1] - c[1]) / s[1], (a[2] - c[2]) / s[2]];
      const lb = [(b[0] - c[0]) / s[0], (b[1] - c[1]) / s[1], (b[2] - c[2]) / s[2]];
      this._push(c, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], s, la, lb, ra, rb, o);
      if (o.mirror) this._mirror(() => this.rc([a[0], a[1], -a[2]], [b[0], b[1], -b[2]], ra, rb, this._mo(o)));
      return this;
    }

    // ellipsoid; opts.z = direction of the local z axis, opts.x = hint for local x axis
    ell(c, r, o = {}) {
      let axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      if (o.z) {
        const z = norm3(o.z);
        let y = norm3(cross(z, o.x || [1, 0, 0]));
        const x = cross(y, z);
        axes = [x, y, z];
      }
      this._push(c, axes, r, [0, 0, 0], [0, 0, 0], 1, 1, o);
      if (o.mirror) {
        const o2 = this._mo(o);
        if (o.z) o2.z = [o.z[0], o.z[1], -o.z[2]];
        if (o.x) o2.x = [o.x[0], o.x[1], -o.x[2]];
        this._mirror(() => this.ell([c[0], c[1], -c[2]], r, o2));
      }
      return this;
    }

    _mo(o) {
      const o2 = Object.assign({}, o);
      o2.mirror = false;
      if (o.bone && /R$/.test(o.bone)) o2.bone = o.bone.slice(0, -1) + 'L';
      return o2;
    }
    _mirror(fn) { fn(); }

    primDist(p, x, y, z) {
      const px = x - p.cx, py = y - p.cy, pz = z - p.cz;
      const lx = p.m00 * px + p.m01 * py + p.m02 * pz - p.ax;
      const ly = p.m10 * px + p.m11 * py + p.m12 * pz - p.ay;
      const lz = p.m20 * px + p.m21 * py + p.m22 * pz - p.az;
      if (p.sphere) return (Math.sqrt(lx * lx + ly * ly + lz * lz) - p.ra) * p.ds;
      const l2 = p.l2;
      const yy = lx * p.bax + ly * p.bay + lz * p.baz;
      const zz = yy - l2;
      const qx = lx * l2 - p.bax * yy, qy = ly * l2 - p.bay * yy, qz = lz * l2 - p.baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2, z2 = zz * zz * l2;
      const rr = p.rr;
      const k = (rr > 0 ? 1 : rr < 0 ? -1 : 0) * rr * rr * x2;
      let d;
      if ((zz > 0 ? 1 : -1) * p.a2 * z2 > k) d = Math.sqrt(x2 + z2) * p.il2 - p.rb;
      else if ((yy > 0 ? 1 : -1) * p.a2 * y2 < k) d = Math.sqrt(x2 + y2) * p.il2 - p.ra;
      else d = (Math.sqrt(x2 * p.a2 * p.il2) + yy * rr) * p.il2 - p.ra;
      return d * p.ds;
    }

    // Build the coarse acceleration grid.
    prepare(bounds, h) {
      this.h = h;
      this.b = bounds;
      // additive first, subtractive afterwards
      this.prims = this.prims.filter(p => !p.sub).concat(this.prims.filter(p => p.sub));
      const cs = (this.cs = 0.1);
      const cnx = (this.cnx = Math.ceil((bounds.max[0] - bounds.min[0]) / cs) + 1);
      const cny = (this.cny = Math.ceil((bounds.max[1] - bounds.min[1]) / cs) + 1);
      const cnz = (this.cnz = Math.ceil((bounds.max[2] - bounds.min[2]) / cs) + 1);
      const lists = (this.lists = new Array(cnx * cny * cnz).fill(null));
      this.prims.forEach((p, idx) => {
        const m = p.br + (p.k + 3 * h) * p.aniso + 0.02;
        const i0 = Math.max(0, Math.floor((p.bx - m - bounds.min[0]) / cs)), i1 = Math.min(cnx - 1, Math.floor((p.bx + m - bounds.min[0]) / cs));
        const j0 = Math.max(0, Math.floor((p.by - m - bounds.min[1]) / cs)), j1 = Math.min(cny - 1, Math.floor((p.by + m - bounds.min[1]) / cs));
        const k0 = Math.max(0, Math.floor((p.bz - m - bounds.min[2]) / cs)), k1 = Math.min(cnz - 1, Math.floor((p.bz + m - bounds.min[2]) / cs));
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
          // sphere / box rejection
          const x = Math.max(bounds.min[0] + i * cs, Math.min(p.bx, bounds.min[0] + (i + 1) * cs));
          const y = Math.max(bounds.min[1] + j * cs, Math.min(p.by, bounds.min[1] + (j + 1) * cs));
          const z = Math.max(bounds.min[2] + k * cs, Math.min(p.bz, bounds.min[2] + (k + 1) * cs));
          if ((x - p.bx) ** 2 + (y - p.by) ** 2 + (z - p.bz) ** 2 > m * m) continue;
          const ci = (i * cny + j) * cnz + k;
          (lists[ci] || (lists[ci] = [])).push(p);
        }
      });
    }

    listAt(x, y, z) {
      const b = this.b.min, cs = this.cs;
      const i = Math.floor((x - b[0]) / cs), j = Math.floor((y - b[1]) / cs), k = Math.floor((z - b[2]) / cs);
      if (i < 0 || j < 0 || k < 0 || i >= this.cnx || j >= this.cny || k >= this.cnz) return null;
      return this.lists[(i * this.cny + j) * this.cnz + k];
    }

    dist(x, y, z) {
      const list = this.listAt(x, y, z);
      if (!list) return Math.max(1, -y);
      let d = 10;
      for (let n = 0; n < list.length; n++) {
        const p = list[n];
        const dj = this.primDist(p, x, y, z);
        const k = p.k;
        if (!p.sub) {
          const hh = k - Math.abs(d - dj);
          d = (d < dj ? d : dj) - (hh > 0 ? hh * hh / (4 * k) : 0);
        } else {
          const e = -dj;
          const hh = k - Math.abs(d - e);
          d = (d > e ? d : e) + (hh > 0 ? hh * hh / (4 * k) : 0);
        }
      }
      return d > -y ? d : -y; // flat cut at the ground plane
    }

    grad(x, y, z, e, out) {
      out[0] = this.dist(x + e, y, z) - this.dist(x - e, y, z);
      out[1] = this.dist(x, y + e, z) - this.dist(x, y - e, z);
      out[2] = this.dist(x, y, z + e) - this.dist(x, y, z - e);
      const l = Math.hypot(out[0], out[1], out[2]) || 1;
      out[0] /= l; out[1] /= l; out[2] /= l;
      return l / (2 * e);
    }

    // Naive surface nets, processed slice by slice along x.
    mesh() {
      const h = this.h, b = this.b;
      const x0 = b.min[0], y0 = b.min[1], z0 = b.min[2];
      const nx = Math.ceil((b.max[0] - x0) / h) + 1, ny = Math.ceil((b.max[1] - y0) / h) + 1, nz = Math.ceil((b.max[2] - z0) / h) + 1;
      const sl = ny * nz;
      let va = new Float32Array(sl), vb = new Float32Array(sl);
      let cPrev = new Int32Array(sl), cCur = new Int32Array(sl);
      const pos = [], idx = [];
      const self = this;

      function slice(i, out) {
        const x = x0 + i * h;
        const cs = self.cs, cny = self.cny, cnz = self.cnz, lists = self.lists;
        const ci = Math.min(self.cnx - 1, Math.floor((x - x0) / cs));
        for (let j = 0; j < ny; j++) {
          const y = y0 + j * h;
          const cj = Math.min(cny - 1, Math.floor((y - y0) / cs));
          const rowBase = (ci * cny + cj) * cnz;
          for (let k = 0; k < nz; k++) {
            const z = z0 + k * h;
            const ck = Math.min(cnz - 1, Math.floor((z - z0) / cs));
            out[j * nz + k] = lists[rowBase + ck] ? self.dist(x, y, z) : 1;
          }
        }
      }

      function quad(a, b2, c, d, flip) {
        if (a < 0 || b2 < 0 || c < 0 || d < 0) return;
        // pick the shorter diagonal
        const d1 = (pos[a * 3] - pos[c * 3]) ** 2 + (pos[a * 3 + 1] - pos[c * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[c * 3 + 2]) ** 2;
        const d2 = (pos[b2 * 3] - pos[d * 3]) ** 2 + (pos[b2 * 3 + 1] - pos[d * 3 + 1]) ** 2 + (pos[b2 * 3 + 2] - pos[d * 3 + 2]) ** 2;
        if (d1 <= d2) {
          if (!flip) idx.push(a, b2, c, a, c, d); else idx.push(a, c, b2, a, d, c);
        } else {
          if (!flip) idx.push(a, b2, d, b2, c, d); else idx.push(a, d, b2, b2, d, c);
        }
      }

      const cv = new Float32Array(8);
      slice(0, vb);
      for (let i = 0; i < nx - 1; i++) {
        const t = va; va = vb; vb = t;
        slice(i + 1, vb);
        const tc = cPrev; cPrev = cCur; cCur = tc;
        cCur.fill(-1);
        for (let j = 0; j < ny - 1; j++) {
          for (let k = 0; k < nz - 1; k++) {
            const o = j * nz + k;
            cv[0] = va[o]; cv[1] = va[o + 1]; cv[2] = va[o + nz]; cv[3] = va[o + nz + 1];
            cv[4] = vb[o]; cv[5] = vb[o + 1]; cv[6] = vb[o + nz]; cv[7] = vb[o + nz + 1];
            let neg = 0;
            for (let c = 0; c < 8; c++) if (cv[c] < 0) neg++;
            if (neg === 0 || neg === 8) continue;
            // corners: bit0 = z, bit1 = y, bit2 = x
            let sx = 0, sy = 0, sz = 0, cnt = 0;
            for (let c = 0; c < 8; c++) {
              for (let ax = 0; ax < 3; ax++) {
                const bit = 1 << ax;
                if (c & bit) continue;
                const c2 = c | bit;
                const v0 = cv[c], v1 = cv[c2];
                if ((v0 < 0) === (v1 < 0)) continue;
                const tt = v0 / (v0 - v1);
                let ex = (c >> 2) & 1, ey = (c >> 1) & 1, ez = c & 1;
                if (ax === 0) ez += tt; else if (ax === 1) ey += tt; else ex += tt;
                sx += ex; sy += ey; sz += ez; cnt++;
              }
            }
            cCur[o] = pos.length / 3;
            pos.push(x0 + (i + sx / cnt) * h, y0 + (j + sy / cnt) * h, z0 + (k + sz / cnt) * h);
          }
        }
        for (let j = 1; j < ny - 1; j++) {
          for (let k = 1; k < nz - 1; k++) {
            const o = j * nz + k;
            const v0 = va[o];
            const in0 = v0 < 0;
            // x edge
            if (in0 !== (vb[o] < 0)) quad(cCur[o - nz - 1], cCur[o - 1], cCur[o], cCur[o - nz], !in0);
            if (i > 0) {
              // y edge
              if (in0 !== (va[o + nz] < 0)) quad(cPrev[o - 1], cPrev[o], cCur[o], cCur[o - 1], !in0);
              // z edge
              if (in0 !== (va[o + 1] < 0)) quad(cPrev[o - nz], cCur[o - nz], cCur[o], cPrev[o], !in0);
            }
          }
        }
      }

      // project vertices onto the true iso-surface and compute normals
      const n = pos.length / 3;
      const P = new Float32Array(pos), N = new Float32Array(n * 3);
      const g = [0, 0, 0];
      const e = h * 0.4;
      for (let v = 0; v < n; v++) {
        let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
        for (let it = 0; it < 2; it++) {
          const d = this.dist(x, y, z);
          const gl = this.grad(x, y, z, e, g);
          const st = Math.max(-h, Math.min(h, d / Math.max(gl, 0.3)));
          x -= g[0] * st; y -= g[1] * st; z -= g[2] * st;
        }
        if (y < 0) y = 0;
        this.grad(x, y, z, e, g);
        P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
        N[v * 3] = g[0]; N[v * 3 + 1] = g[1]; N[v * 3 + 2] = g[2];
      }
      return { position: P, normal: N, index: new Uint32Array(idx), count: n };
    }

    // Skin weights + material mix at a surface point.
    // Returns arrays through the passed accumulator objects.
    influences(x, y, z, boneW, matW, boneD) {
      const list = this.listAt(x, y, z);
      if (!list) return;
      for (let n = 0; n < list.length; n++) {
        const p = list[n];
        if (p.sub) continue;
        const dj = Math.max(0, this.primDist(p, x, y, z));
        if (dj > 0.5) continue;
        if (boneD && !(dj >= boneD[p.bone])) boneD[p.bone] = dj;
        const w = Math.exp(-dj / p.sig);
        if (w > (boneW[p.bone] || 0)) boneW[p.bone] = w;
        const wm = Math.exp(-dj / 0.012);
        if (wm > (matW[p.mat] || 0)) matW[p.mat] = wm;
      }
    }
  }

  GIR.SdfModel = SdfModel;
})();
