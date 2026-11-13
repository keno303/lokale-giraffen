/* Deformable elliptical "tube" skin along a Catmull-Rom spline.
   Each control point: {x,y,z, rx, ry, on}  (rx = half width along "side",
   ry = half depth along "dorsal" n = tangent x side, on = offset of the ring
   centre along n).  Used for torso, neck, legs, tail, head. */
(function () {
  const T = THREE;

  function cr(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  class Tube {
    constructor(nCtrl, opts = {}) {
      this.nCtrl = nCtrl;
      this.sub = opts.sub || 4;
      this.radial = opts.radial || 20;
      this.rings = (nCtrl - 1) * this.sub + 1;
      const R = this.radial, N = this.rings, vc = N * R;
      this.pos = new Float32Array(vc * 3);
      const geo = this.geometry = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(this.pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(new Float32Array(vc * 3), 3));
      geo.setAttribute('aRest', new T.BufferAttribute(new Float32Array(vc * 3), 3));
      geo.setAttribute('aInfo', new T.BufferAttribute(new Float32Array(vc * 3), 3));
      const idx = [];
      for (let i = 0; i < N - 1; i++) for (let j = 0; j < R; j++) {
        const a = i * R + j, b = i * R + (j + 1) % R, c = (i + 1) * R + j, d = (i + 1) * R + (j + 1) % R;
        idx.push(a, b, c, b, d, c);
      }
      geo.setIndex(idx);
      // per-ring sample data
      this.C = new Float32Array(N * 3); this.S = new Float32Array(N * 3); this.Nn = new Float32Array(N * 3);
      this.Tg = new Float32Array(N * 3); this.RX = new Float32Array(N); this.RY = new Float32Array(N); this.ON = new Float32Array(N);
      this.cos = new Float32Array(R); this.sin = new Float32Array(R);
      for (let j = 0; j < R; j++) { const a = j / R * Math.PI * 2; this.cos[j] = Math.cos(a); this.sin[j] = Math.sin(a); }
      this.sideRef = new T.Vector3(1, 0, 0);
    }

    update(pts, sideRef) {
      const n = this.nCtrl, sub = this.sub, N = this.rings, R = this.radial;
      const C = this.C, S = this.S, Nn = this.Nn, Tg = this.Tg, RX = this.RX, RY = this.RY, ON = this.ON;
      const sr = sideRef || this.sideRef;
      // sample the spline
      let ri = 0;
      for (let k = 0; k < n - 1; k++) {
        const p0 = pts[Math.max(k - 1, 0)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(k + 2, n - 1)];
        const last = (k === n - 2);
        const cnt = last ? sub + 1 : sub;
        for (let s = 0; s < cnt; s++, ri++) {
          const t = s / sub;
          C[ri * 3] = cr(p0.x, p1.x, p2.x, p3.x, t);
          C[ri * 3 + 1] = cr(p0.y, p1.y, p2.y, p3.y, t);
          C[ri * 3 + 2] = cr(p0.z, p1.z, p2.z, p3.z, t);
          RX[ri] = Math.max(0.002, cr(p0.rx, p1.rx, p2.rx, p3.rx, t));
          RY[ri] = Math.max(0.002, cr(p0.ry, p1.ry, p2.ry, p3.ry, t));
          ON[ri] = cr(p0.on || 0, p1.on || 0, p2.on || 0, p3.on || 0, t);
        }
      }
      // frames
      for (let i = 0; i < N; i++) {
        const a = Math.max(i - 1, 0), b = Math.min(i + 1, N - 1);
        let tx = C[b * 3] - C[a * 3], ty = C[b * 3 + 1] - C[a * 3 + 1], tz = C[b * 3 + 2] - C[a * 3 + 2];
        const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        const d = sr.x * tx + sr.y * ty + sr.z * tz;
        let sx = sr.x - tx * d, sy = sr.y - ty * d, sz = sr.z - tz * d;
        const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
        // n = t x s
        const nx = ty * sz - tz * sy, ny = tz * sx - tx * sz, nz = tx * sy - ty * sx;
        Tg[i * 3] = tx; Tg[i * 3 + 1] = ty; Tg[i * 3 + 2] = tz;
        S[i * 3] = sx; S[i * 3 + 1] = sy; S[i * 3 + 2] = sz;
        Nn[i * 3] = nx; Nn[i * 3 + 1] = ny; Nn[i * 3 + 2] = nz;
      }
      const pos = this.pos, co = this.cos, si = this.sin;
      for (let i = 0; i < N; i++) {
        const rx = RX[i], ry = RY[i], on = ON[i];
        const cx = C[i * 3] + Nn[i * 3] * on, cy = C[i * 3 + 1] + Nn[i * 3 + 1] * on, cz = C[i * 3 + 2] + Nn[i * 3 + 2] * on;
        for (let j = 0; j < R; j++) {
          const u = co[j] * rx, v = si[j] * ry, o = (i * R + j) * 3;
          pos[o] = cx + S[i * 3] * u + Nn[i * 3] * v;
          pos[o + 1] = cy + S[i * 3 + 1] * u + Nn[i * 3 + 1] * v;
          pos[o + 2] = cz + S[i * 3 + 2] * u + Nn[i * 3 + 2] * v;
        }
      }
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.computeVertexNormals();
    }

    /* Call once with rest pose; infoFn(u, theta01, ringIndex) -> [scale, cover, dark] */
    finalize(restPts, infoFn, restMatrix) {
      this.update(restPts);
      const g = this.geometry, R = this.radial, N = this.rings;
      const rest = g.attributes.aRest.array, info = g.attributes.aInfo.array;
      const tmp = new T.Vector3();
      for (let i = 0; i < N; i++) for (let j = 0; j < R; j++) {
        const o = (i * R + j) * 3;
        tmp.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]);
        if (restMatrix) tmp.applyMatrix4(restMatrix);
        rest[o] = tmp.x; rest[o + 1] = tmp.y; rest[o + 2] = tmp.z;
        const r = infoFn ? infoFn(i / (N - 1), j / R, i, this.sin[j], this.cos[j]) : [1, 1, 0];
        info[o] = r[0]; info[o + 1] = r[1]; info[o + 2] = r[2];
      }
      g.attributes.aRest.needsUpdate = true; g.attributes.aInfo.needsUpdate = true;
      g.computeBoundingSphere();
    }

    /* surface point on ring at fractional index, angle (radians in ring plane) */
    surface(ringF, ang, scale = 1, out = new T.Vector3()) {
      const i0 = Math.min(Math.floor(ringF), this.rings - 2), f = ringF - i0;
      const l = (arr, k) => arr[i0 * k.n + k.o] * (1 - f) + arr[(i0 + 1) * k.n + k.o] * f;
      const g3 = (arr, c) => arr[i0 * 3 + c] * (1 - f) + arr[(i0 + 1) * 3 + c] * f;
      const rx = (this.RX[i0] * (1 - f) + this.RX[i0 + 1] * f) * scale, ry = (this.RY[i0] * (1 - f) + this.RY[i0 + 1] * f) * scale;
      const on = this.ON[i0] * (1 - f) + this.ON[i0 + 1] * f;
      const cu = Math.cos(ang) * rx, sv = Math.sin(ang) * ry + on;
      out.set(g3(this.C, 0) + g3(this.S, 0) * cu + g3(this.Nn, 0) * sv,
              g3(this.C, 1) + g3(this.S, 1) * cu + g3(this.Nn, 1) * sv,
              g3(this.C, 2) + g3(this.S, 2) * cu + g3(this.Nn, 2) * sv);
      return out;
    }
    dir(ringF, arr, out = new T.Vector3()) {
      const i0 = Math.min(Math.floor(ringF), this.rings - 2), f = ringF - i0;
      out.set(arr[i0 * 3] * (1 - f) + arr[(i0 + 1) * 3] * f, arr[i0 * 3 + 1] * (1 - f) + arr[(i0 + 1) * 3 + 1] * f, arr[i0 * 3 + 2] * (1 - f) + arr[(i0 + 1) * 3 + 2] * f);
      return out.normalize();
    }
  }
  window.Tube = Tube;
})();
