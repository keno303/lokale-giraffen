/* geo.js - procedural mesh construction utilities (sweeps, lofts, merging, skin weights)
 * Everything is authored directly in BIND pose space (metres). Skin weights are
 * computed analytically from the part's curve parameter, so bending happens
 * smoothly at the joints instead of at hard "ball joint" seams.
 */
(function (G) {
  'use strict';
  const V = THREE.Vector3;

  function v(a) { return new V(a[0], a[1], a[2]); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smoothstep(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---------- frame with stable (parallel-transport-ish) normal ---------- */
  function frames(curve, n, initNormal) {
    const P = [], T = [], N = [], B = [];
    let prevN = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t).normalize();
      let nn;
      if (i === 0) {
        nn = initNormal ? v(initNormal) : Math.abs(tan.y) > 0.9 ? new V(0, 0, 1) : new V(0, 1, 0);
        nn.addScaledVector(tan, -nn.dot(tan));
        if (nn.lengthSq() < 1e-8) { nn = new V(1, 0, 0); nn.addScaledVector(tan, -nn.dot(tan)); }
        nn.normalize();
      } else {
        nn = prevN.clone();
        nn.addScaledVector(tan, -nn.dot(tan));
        if (nn.lengthSq() < 1e-6) { nn = N[i - 1].clone(); }
        nn.normalize();
      }
      const bb = new V().crossVectors(tan, nn).normalize();
      P.push(p); T.push(tan); N.push(nn); B.push(bb); prevN = nn;
    }
    return { P, T, N, B };
  }

  /* interpolate section keys [{t, r, rx, rz, ox, oy, roll, exp}] */
  function sectionAt(keys, t) {
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].t < t) i++;
    const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
    const span = Math.max(1e-6, b.t - a.t);
    const f = smoothstep(clamp((t - a.t) / span, 0, 1));
    const g = (k, d) => (a[k] !== undefined ? a[k] : d);
    const r1 = g('r', 0.1), r2 = b.r !== undefined ? b.r : r1;
    return {
      rx: lerp(a.rx !== undefined ? a.rx : r1, b.rx !== undefined ? b.rx : r2, f),
      rz: lerp(a.rz !== undefined ? a.rz : r1, b.rz !== undefined ? b.rz : r2, f),
      ox: lerp(g('ox', 0), b.ox !== undefined ? b.ox : g('ox', 0), f),
      oy: lerp(g('oy', 0), b.oy !== undefined ? b.oy : g('oy', 0), f),
      roll: lerp(g('roll', 0), b.roll !== undefined ? b.roll : g('roll', 0), f),
      exp: lerp(g('exp', 2), b.exp !== undefined ? b.exp : g('exp', 2), f)
    };
  }

  /* ---------- skin weights along a bone chain ---------- */
  function weightsAt(t, o) {
    const bones = o.bones || [o.bone];
    const w = new Array(bones.length).fill(0);
    if (bones.length === 1) { w[0] = 1; return w; }
    const bounds = o.bounds, blend = o.blend || 0.1;
    let idx = 0;
    while (idx < bounds.length && t > bounds[idx]) idx++;
    w[idx] = 1;
    if (idx > 0) {
      const d = t - bounds[idx - 1];
      if (d < blend) { const f = 0.5 + 0.5 * smoothstep(d / blend); w[idx] = f; w[idx - 1] = 1 - f; }
    }
    if (idx < bounds.length) {
      const e = bounds[idx] - t;
      if (e < blend) { const f = 0.5 + 0.5 * smoothstep(e / blend); w[idx] *= f; w[idx + 1] = (1 - f); }
    }
    let s = 0; for (const x of w) s += x;
    if (s > 0) for (let i = 0; i < w.length; i++) w[i] /= s;
    return w;
  }

  /* ---------- generic sweep along a spline ----------
   * o: {pts, sections|keys, samples, radial, cap0, cap1, initNormal,
   *     bones, bounds, blend, color(pos,t,a)->[r,g,b], uv:[su,sv,u0,v0], mat}
   */
  function sweep(o) {
    const pts = o.pts.map(v);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', o.tension === undefined ? 0.5 : o.tension);
    const len = curve.getLength();
    const n = o.samples || Math.max(14, (pts.length - 1) * 7);
    const radial = o.radial || 16;
    const fr = frames(curve, n, o.initNormal);
    const keys = o.keys || [{ t: 0, r: 0.1 }, { t: 1, r: 0.1 }];
    const su = o.uv ? o.uv[0] : 1, sv = o.uv ? o.uv[1] : 1, u0 = o.uv ? o.uv[2] : 0, v0 = o.uv ? o.uv[3] : 0;

    const pos = [], nor = [], uv = [], col = [], si = [], sw = [];
    const ring = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, s = sectionAt(keys, t);
      const C = fr.P[i].clone().addScaledVector(fr.N[i], s.ox).addScaledVector(fr.B[i], s.oy);
      const circ = 2 * Math.PI * Math.sqrt(0.5 * (s.rx * s.rx + s.rz * s.rz));
      const row = [];
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const ca = Math.cos(a + s.roll), sa = Math.sin(a + s.roll);
        const p = s.exp;
        const fx = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / p);
        const fz = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / p);
        const P = C.clone().addScaledVector(fr.N[i], s.rx * fx).addScaledVector(fr.B[i], s.rz * fz);
        row.push(pos.push(P.x, P.y, P.z) / 3 - 1);
        uv.push(u0 + (t * len) * su, v0 + (j / radial) * circ * sv);
        const rd = dirOf(P, C);
        const c = o.color ? o.color(P, t, j / radial, rd, C) : [1, 1, 1];
        col.push(c[0], c[1], c[2]);
        const w = weightsAt(t, o);
        const inf = topInfluences(w, o.bonesIndex);
        si.push(inf.i0, inf.i1, inf.i2, inf.i3);
        sw.push(inf.w0, inf.w1, inf.w2, inf.w3);
      }
      ring.push(row);
    }
    const idx = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      idx.push(ring[i][j], ring[i + 1][j2], ring[i + 1][j], ring[i][j], ring[i][j2], ring[i + 1][j2]);
    }
    let out = { pos, nor, uv, col, si, sw, idx };
    finishNormals(out, fr, n, radial, keys);
    const parts = [out];
    if (o.cap0) parts.push(capGeo(out, fr.P[0], fr.T[0], ring[0], -1, o));
    if (o.cap1) parts.push(capGeo(out, fr.P[n], fr.T[n], ring[n], 1, o));
    const merged = parts.length === 1 ? out : mergeRaw(parts);
    merged.mat = o.mat || 0;
    return merged;
  }

  function dirOf(P, C) { const d = P.clone().sub(C); return d.lengthSq() < 1e-12 ? new V(0, 1, 0) : d.normalize(); }

  /* normalised arclength (u) of the curve point closest to p */
  function uAt(curve, p, samples) {
    const n = samples || 400; let best = 1e9, bu = 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n, q = curve.getPointAt(t);
      const d = q.distanceToSquared(p);
      if (d < best) { best = d; bu = t; }
    }
    return bu;
  }
  /* bounds helper: u values of the given joint positions on the part's own curve */
  function uBounds(pts, jointPts, tension) {
    const c = new THREE.CatmullRomCurve3(jointPts.map(v), false, 'catmullrom', tension === undefined ? 0.5 : tension);
    return jointPts.map(p => uAt(c, v(p)));
  }

  function topInfluences(w, indexMap) {
    const list = [];
    for (let i = 0; i < w.length; i++) if (w[i] > 0.002) list.push([i, w[i]]);
    list.sort((a, b) => b[1] - a[1]);
    const r = { i0: 0, i1: 0, i2: 0, i3: 0, w0: 0, w1: 0, w2: 0, w3: 0 };
    const key = ['i', 'w'];
    for (let k = 0; k < Math.min(4, list.length); k++) {
      r['i' + k] = indexMap ? indexMap(list[k][0]) : list[k][0];
      r['w' + k] = list[k][1];
    }
    return r;
  }

  /* smooth normals per part, using analytic-ish approach via face accumulation */
  function finishNormals(out, fr, n, radial, keys) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
    g.setIndex(out.idx);
    g.computeVertexNormals();
    const a = g.attributes.position, nn = g.attributes.normal;
    out.nor = Array.from(nn.array);
    // seam welding: average normals of the j=0 and j=radial-1 ring neighbours
    const rows = n + 1;
    for (let i = 0; i < rows; i++) {
      const i0 = i * radial, i1 = i * radial + radial - 1;
      const nx = (nn.getX(i0) + nn.getX(i1)) * 0.5, ny = (nn.getY(i0) + nn.getY(i1)) * 0.5, nz = (nn.getZ(i0) + nn.getZ(i1)) * 0.5;
      for (const k of [i0, i1]) { out.nor[k * 3] = nx; out.nor[k * 3 + 1] = ny; out.nor[k * 3 + 2] = nz; }
    }
    // duplicate the seam column so the pattern wraps without a visible uv cut
  }

  function capGeo(out, C, T, ringRow, dir, o) {
    const base = out.pos.length / 3;
    const pos = [C.x, C.y, C.z];
    const nrm = [T.x * dir, T.y * dir, T.z * dir];
    const c = o.color ? o.color(C, dir < 0 ? 0 : 1, 0) : [1, 1, 1];
    const col = [c[0], c[1], c[2]];
    const w = weightsAt(dir < 0 ? 0 : 1, o);
    const inf = topInfluences(w, o.bonesIndex);
    const si = [inf.i0, inf.i1, inf.i2, inf.i3], sw = [inf.w0, inf.w1, inf.w2, inf.w3];
    const uv = [0, 0];
    const idx = [];
    for (let j = 0; j < ringRow.length; j++) {
      pos.push(out.pos[ringRow[j] * 3], out.pos[ringRow[j] * 3 + 1], out.pos[ringRow[j] * 3 + 2]);
      nrm.push(T.x * dir, T.y * dir, T.z * dir);
      uv.push(0.5, j / ringRow.length);
      col.push(c[0], c[1], c[2]);
      si.push(inf.i0, inf.i1, inf.i2, inf.i3);
      sw.push(inf.w0, inf.w1, inf.w2, inf.w3);
    }
    for (let j = 0; j < ringRow.length; j++) {
      const a = base, b = base + 1 + j, cIdx = base + 1 + ((j + 1) % ringRow.length);
      if (dir > 0) idx.push(a, b, cIdx); else idx.push(a, cIdx, b);
    }
    return { pos, nor: nrm, uv, col, si, sw, idx };
  }

  function mergeRaw(raws) {
    const o = { pos: [], nor: [], uv: [], col: [], si: [], sw: [], idx: [] };
    for (const r of raws) {
      const off = o.pos.length / 3;
      for (let i = 0; i < r.pos.length; i++) o.pos.push(r.pos[i]);
      for (let i = 0; i < r.nor.length; i++) o.nor.push(r.nor[i]);
      for (let i = 0; i < r.uv.length; i++) o.uv.push(r.uv[i]);
      for (let i = 0; i < r.col.length; i++) o.col.push(r.col[i]);
      for (let i = 0; i < r.si.length; i++) o.si.push(r.si[i]);
      for (let i = 0; i < r.sw.length; i++) o.sw.push(r.sw[i]);
      for (let i = 0; i < r.idx.length; i++) o.idx.push(r.idx[i] + off);
    }
    return o;
  }

  /* ---------- loft: rings perpendicular to a spine, ellipse in (X, sagittal) plane ----------
   * stations: [{p:[x,y,z], rx, rz, exp, oy, roll}] - built as a sweep whose frame normal is +X
   */
  function loft(stations, o) {
    o = o || {};
    const pts = stations.map(s => v(s.p));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    const n = o.samples || (stations.length - 1) * 6;
    const radial = o.radial || 24;
    const fr = frames(curve, n, [1, 0, 0]);   // N ~= +X  => rx is the half-width
    const keys = stations.map((s, i) => Object.assign({ t: i / (stations.length - 1) }, s));
    const su = o.uv ? o.uv[0] : 1, sv = o.uv ? o.uv[1] : 1, u0 = o.uv ? o.uv[2] : 0, v0 = o.uv ? o.uv[3] : 0;
    const pos = [], nor = [], uv = [], col = [], si = [], sw = [], idx = [], ring = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, s = sectionAt(keys, t);
      const C = fr.P[i].clone().addScaledVector(fr.B[i], s.oy);
      // vertical extent is measured along "up-ish" perpendicular: use B but force y>0
      const up = fr.B[i]; if (up.y < 0) up.multiplyScalar(-1);
      const side = fr.N[i]; if (side.x < 0) side.multiplyScalar(-1);
      const circ = 2 * Math.PI * Math.sqrt(0.5 * (s.rx * s.rx + s.rz * s.rz));
      const row = [];
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const p = s.exp || 2;
        const fx = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / p);
        const fz = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / p);
        const P = C.clone().addScaledVector(side, s.rx * fx).addScaledVector(up, s.rz * fz);
        row.push(pos.push(P.x, P.y, P.z) / 3 - 1);
        uv.push(u0 + (i / n) * s.rx * 0 + (fr.P[i].z - pts[0].z) * 0 + (t * curve.getLength()) * su,
                v0 + (j / radial) * circ * sv);
        const c = o.color ? o.color(P, t, j / radial, dirOf(P, C), C) : [1, 1, 1];
        col.push(c[0], c[1], c[2]);
        const w = weightsAt(t, o);
        const inf = topInfluences(w, o.bonesIndex);
        si.push(inf.i0, inf.i1, inf.i2, inf.i3);
        sw.push(inf.w0, inf.w1, inf.w2, inf.w3);
      }
      ring.push(row);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      idx.push(ring[i][j], ring[i + 1][j2], ring[i + 1][j], ring[i][j], ring[i][j2], ring[i + 1][j2]);
    }
    const out = { pos, nor, uv, col, si, sw, idx };
    finishNormals(out, fr, n, radial, keys);
    if (o.capEnds) {
      const parts = [out];
      parts.push(capGeo(out, fr.P[0], fr.T[0], ring[0], -1, o));
      parts.push(capGeo(out, fr.P[n], fr.T[n], ring[n], 1, o));
      const m = mergeRaw(parts); m.mat = o.mat || 0; return m;
    }
    out.mat = o.mat || 0;
    return out;
  }

  /* ---------- ellipsoid blob (for eyes, hoof coronets, muscle masses) ---------- */
  function blob(center, r, o) {
    o = o || {};
    const seg = o.seg || 16, ringC = o.rings || 10;
    const pos = [], nor = [], uv = [], col = [], si = [], sw = [], idx = [];
    const c = v(center);
    const rows = [];
    for (let i = 0; i <= ringC; i++) {
      const phi = (i / ringC) * Math.PI;
      const row = [];
      for (let j = 0; j < seg; j++) {
        const th = (j / seg) * Math.PI * 2;
        const dx = Math.sin(phi) * Math.cos(th), dy = Math.cos(phi), dz = Math.sin(phi) * Math.sin(th);
        const P = new V(c.x + dx * r[0], c.y + dy * r[1], c.z + dz * r[2]);
        row.push(pos.push(P.x, P.y, P.z) / 3 - 1);
        nor.push(dx, dy, dz);
        uv.push((j / seg) * (o.uv ? o.uv[0] : 1) + (o.uv ? o.uv[2] : 0), (i / ringC) * (o.uv ? o.uv[1] : 1) + (o.uv ? o.uv[3] : 0));
        const cc = o.color ? o.color(P, i / ringC, j / seg, new V(dx, dy, dz), c) : [1, 1, 1];
        col.push(cc[0], cc[1], cc[2]);
        const inf = o.inf || { i0: 0, i1: 0, i2: 0, i3: 0, w0: 1, w1: 0, w2: 0, w3: 0 };
        si.push(inf.i0, inf.i1, inf.i2, inf.i3);
        sw.push(inf.w0, inf.w1, inf.w2, inf.w3);
      }
      rows.push(row);
    }
    for (let i = 0; i < ringC; i++) for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      idx.push(rows[i][j], rows[i + 1][j2], rows[i + 1][j], rows[i][j], rows[i][j2], rows[i + 1][j2]);
    }
    return { pos, nor, uv, col, si, sw, idx, mat: o.mat || 0 };
  }

  function toGeometry(raws) {
    const m = mergeRaw(raws);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(m.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(m.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(m.sw, 4));
    g.setIndex(m.idx);
    g.normalizeNormals();
    // material groups: raws are merged in order, so index ranges stay contiguous
    let start = 0;
    const groups = [];
    for (const r of raws) {
      const count = r.idx.length, mat = r.mat || 0;
      if (groups.length && groups[groups.length - 1].mat === mat) groups[groups.length - 1].count += count;
      else groups.push({ start, count, mat });
      start += count;
    }
    for (const gr of groups) if (gr.count > 0) g.addGroup(gr.start, gr.count, gr.mat);
    return g;
  }

  G.clamp = clamp; G.smoothstep = smoothstep; G.lerp = lerp; G.uAt = uAt; G.uBounds = uBounds;
  G.curve = (pts, tension) => new THREE.CatmullRomCurve3(pts.map(v), false, 'catmullrom', tension === undefined ? 0.5 : tension);
  G.flatBelow = (r, y) => { for (let i = 0; i < r.pos.length; i += 3) if (r.pos[i + 1] < y) r.pos[i + 1] = y; return r; };
  G.sweep = sweep; G.loft = loft; G.blob = blob; G.mergeRaw = mergeRaw; G.toGeometry = toGeometry;
  G.frames = frames; G.v = v;
})(window.G = window.G || {});
