// ---------------------------------------------------------------------------
// 20_loft.js -- lofted tube geometry rebuilt each frame from station frames.
// Everything organic (torso, neck, tail, limbs, muzzle) is a loft, so the
// whole animal can flex continuously instead of being a bag of rigid boxes.
// ---------------------------------------------------------------------------
window.G = window.G || {};
(function (G) {
  'use strict';

  // metres of body surface spanned by the coat atlas in U (along the body)
  G.ATLAS_LEN = 7.4;
  // metres of body surface spanned by the coat atlas in V (around the body)
  G.ATLAS_AROUND = 5.2;

  const _v = new THREE.Vector3();

  /**
   * A loft: rows cross-sections of `radial`+1 vertices each, superellipse
   * profile, optional pole caps.  Positions / uvs / coat attributes are
   * rewritten every frame; the index buffer never changes.
   *
   * station = {c, dt, dr, du, rx, ry, p, u0, v0,
   *            topFade, bellyFade, topTone, bellyTone}
   */
  class Loft {
    constructor(rows, radial, opts) {
      opts = opts || {};
      this.rows = rows;
      this.radial = radial || 16;
      this.capStart = !!opts.capStart;
      this.capEnd = !!opts.capEnd;
      const cols = this.radial + 1;
      this.cols = cols;
      this.poleStart = this.capStart ? cols : 0;
      this.nV = rows * cols + this.poleStart + (this.capEnd ? cols : 0);
      this.position = new Float32Array(this.nV * 3);
      this.normal = new Float32Array(this.nV * 3);
      this.uv = new Float32Array(this.nV * 2);
      this.coat = new Float32Array(this.nV * 2);
      const idx = [];
      const rowOff = (r) => this.poleStart + r * cols;
      if (this.capStart) for (let i = 0; i < this.radial; i++) idx.push(i, rowOff(0) + i + 1, rowOff(0) + i);
      for (let r = 0; r < rows - 1; r++) {
        for (let i = 0; i < this.radial; i++) {
          const a = rowOff(r) + i, b = rowOff(r) + i + 1, c = rowOff(r + 1) + i + 1, d = rowOff(r + 1) + i;
          idx.push(a, b, c, a, c, d);
        }
      }
      if (this.capEnd) {
        const pole = this.nV - cols, last = rowOff(rows - 1);
        for (let i = 0; i < this.radial; i++) idx.push(last + i, last + i + 1, pole + i);
      }
      const g = new THREE.BufferGeometry();
      this.aPos = new THREE.BufferAttribute(this.position, 3);
      this.aNor = new THREE.BufferAttribute(this.normal, 3);
      this.aUv = new THREE.BufferAttribute(this.uv, 2);
      this.aCoat = new THREE.BufferAttribute(this.coat, 2);
      g.setAttribute('position', this.aPos);
      g.setAttribute('normal', this.aNor);
      g.setAttribute('uv', this.aUv);
      g.setAttribute('aCoat', this.aCoat);
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
      this.geometry = g;
    }

    update(stations) {
      const rows = this.rows, cols = this.cols, radial = this.radial;
      if (stations.length !== rows) throw new Error('loft stations ' + stations.length + ' != ' + rows);
      const P = this.position, UV = this.uv, CO = this.coat, N = this.normal;
      const invL = 1 / G.ATLAS_LEN, invA = 1 / G.ATLAS_AROUND;
      const base = this.poleStart;
      let w = base * 3;
      for (let r = 0; r < rows; r++) {
        const S = stations[r];
        const p = S.p === undefined ? 2.15 : S.p;
        const circ = G.ellipCirc(S.rx, S.ry);
        const vSpan = circ * invA * (S.vScale === undefined ? 1 : S.vScale);
        const u = S.u0 * invL;
        for (let i = 0; i < cols; i++) {
          const t = i / radial;
          const ang = Math.PI / 2 + t * G.TAU;
          const cx = Math.cos(ang), cy = Math.sin(ang);
          // taper: + widens the top of the section, - widens the bottom
          const tw = 1 + (S.taper || 0) * cy;
          const wr = G.se(cx, p) * S.rx * tw, wu = G.se(cy, p) * S.ry;
          P[w] = S.c.x + S.dr.x * wr + S.du.x * wu;
          P[w + 1] = S.c.y + S.dr.y * wr + S.du.y * wu;
          P[w + 2] = S.c.z + S.dr.z * wr + S.du.z * wu;
          UV[(w / 3) * 2] = u;
          UV[(w / 3) * 2 + 1] = S.v0 + t * vSpan;
          const bn = Math.exp(-Math.pow((t - 0.5) / 0.17, 2));   // 1 at the belly line
          CO[(w / 3) * 2] = G.mix(S.topFade === undefined ? 1 : S.topFade, S.bellyFade === undefined ? 1 : S.bellyFade, bn);
          CO[(w / 3) * 2 + 1] = G.mix(S.topTone === undefined ? 1 : S.topTone, S.bellyTone === undefined ? 1 : S.bellyTone, bn);
          w += 3;
        }
      }
      // ---- normals from the parametric derivatives, seam welded afterwards
      const dv = [0, 0, 0], dn = [0, 0, 0], nn = [0, 0, 0];
      for (let r = 0; r < rows; r++) {
        const r0 = Math.max(0, r - 1), r1 = Math.min(rows - 1, r + 1);
        const c = stations[r].c;
        for (let i = 0; i < cols; i++) {
          const i0 = Math.max(0, i - 1), i1 = Math.min(cols - 1, i + 1);
          const a0 = (base + r * cols + i0) * 3, a1 = (base + r * cols + i1) * 3;
          const b0 = (base + r0 * cols + i) * 3, b1 = (base + r1 * cols + i) * 3;
          dv[0] = P[a1] - P[a0]; dv[1] = P[a1 + 1] - P[a0 + 1]; dv[2] = P[a1 + 2] - P[a0 + 2];
          dn[0] = P[b1] - P[b0]; dn[1] = P[b1 + 1] - P[b0 + 1]; dn[2] = P[b1 + 2] - P[b0 + 2];
          nn[0] = dv[1] * dn[2] - dv[2] * dn[1];
          nn[1] = dv[2] * dn[0] - dv[0] * dn[2];
          nn[2] = dv[0] * dn[1] - dv[1] * dn[0];
          let l = Math.hypot(nn[0], nn[1], nn[2]);
          if (l < 1e-12) { nn[0] = c.x || 0; nn[1] = 1; nn[2] = 0; l = 1; }
          const k = (base + r * cols + i) * 3;
          _v.set(P[k] - c.x, P[k + 1] - c.y, P[k + 2] - c.z);
          if (_v.x * nn[0] + _v.y * nn[1] + _v.z * nn[2] < 0) { nn[0] = -nn[0]; nn[1] = -nn[1]; nn[2] = -nn[2]; }
          N[k] = nn[0] / l; N[k + 1] = nn[1] / l; N[k + 2] = nn[2] / l;
        }
      }
      for (let r = 0; r < rows; r++) {           // weld the v = 0 / 1 seam
        const a = (base + r * cols) * 3, b = a + (cols - 1) * 3;
        const nx = N[a] + N[b], ny = N[a + 1] + N[b + 1], nz = N[a + 2] + N[b + 2];
        const l = Math.hypot(nx, ny, nz) || 1;
        N[a] = N[b] = nx / l; N[a + 1] = N[b + 1] = ny / l; N[a + 2] = N[b + 2] = nz / l;
      }
      if (this.capStart) {
        const S0 = stations[0];
        for (let i = 0; i < cols; i++) { const k = i * 3; N[k] = -S0.dt.x; N[k + 1] = -S0.dt.y; N[k + 2] = -S0.dt.z; }
        const e0 = stations[0].c;
        for (let i = 0; i < cols; i++) {
          const k = i * 3;
          P[k] = e0.x; P[k + 1] = e0.y; P[k + 2] = e0.z;
          UV[i * 2] = stations[0].u0 / G.ATLAS_LEN; UV[i * 2 + 1] = stations[0].v0;
          CO[i * 2] = stations[0].topFade === undefined ? 1 : stations[0].topFade;
          CO[i * 2 + 1] = stations[0].topTone === undefined ? 1 : stations[0].topTone;
        }
      }
      if (this.capEnd) {
        const SE = stations[rows - 1], pb = this.nV - cols;
        for (let i = 0; i < cols; i++) {
          const k = (pb + i) * 3;
          N[k] = SE.dt.x; N[k + 1] = SE.dt.y; N[k + 2] = SE.dt.z;
          P[k] = SE.c.x; P[k + 1] = SE.c.y; P[k + 2] = SE.c.z;
          UV[(pb + i) * 2] = SE.u0 / G.ATLAS_LEN; UV[(pb + i) * 2 + 1] = SE.v0;
          CO[(pb + i) * 2] = SE.topFade === undefined ? 1 : SE.topFade;
          CO[(pb + i) * 2 + 1] = SE.topTone === undefined ? 1 : SE.topTone;
        }
      }
      this.aPos.needsUpdate = true;
      this.aUv.needsUpdate = true;
      this.aCoat.needsUpdate = true;
      this.aNor.needsUpdate = true;
      this.geometry.computeBoundingSphere();
    }
  }

  G.Loft = Loft;

  // -- station helpers ------------------------------------------------------
  G.station = function () {
    return {
      c: new THREE.Vector3(), dt: new THREE.Vector3(0, 0, 1),
      dr: new THREE.Vector3(1, 0, 0), du: new THREE.Vector3(0, 1, 0),
      rx: 0.1, ry: 0.1, p: 2.15, taper: 0, u0: 0, v0: 0,
      topFade: 1, bellyFade: 1, topTone: 1, bellyTone: 1
    };
  };
  G.stations = function (n) { const a = []; for (let i = 0; i < n; i++) a.push(G.station()); return a; };
})(window.G);
