/* giraffe-world / geometry.js — lofted organic geometry built from scratch.
   Everything the giraffe is made of is a swept cross-section along a smooth
   path, which gives animal-like tapering with clean, unstretched UVs.      */
(function (root) {
  'use strict';
  var GW = root.GW, M = GW.math;
  var THREE = root.THREE;
  var geo = GW.geo = {};

  /* --------------------------------------------------------- cross-sections */
  /* each returns array of [x, y] in unit-ish space, ordered CCW, closed     */
  var Profiles = {
    ellipse: function (n) {
      var p = [];
      for (var i = 0; i < n; i++) {
        var a = i / n * Math.PI * 2;
        p.push([Math.sin(a), Math.cos(a)]);
      }
      return p;
    },
    /* rounded, flat-ish on one side (belly / neck front) */
    egg: function (n, flat) {
      flat = flat == null ? 0.18 : flat;
      var p = [];
      for (var i = 0; i < n; i++) {
        var a = i / n * Math.PI * 2;
        var x = Math.sin(a), y = Math.cos(a);
        y *= 1 - flat * (0.5 + 0.5 * y);      /* compress the lower side */
        p.push([x, y]);
      }
      return p;
    },
    /* squircle: legs, cannon bone */
    round: function (n, k) {
      k = k == null ? 0.55 : k;
      var p = [];
      for (var i = 0; i < n; i++) {
        var a = i / n * Math.PI * 2;
        var sx = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 1 / (1 + k));
        var sy = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 1 / (1 + k));
        p.push([sx, sy]);
      }
      return p;
    },
    /* leaf / teardrop: ears */
    leaf: function (n) {
      var p = [];
      for (var i = 0; i < n; i++) {
        var a = i / n * Math.PI * 2;
        var r = 1 - 0.55 * Math.pow(Math.max(0, Math.cos(a)), 2) * (Math.sin(a) > 0 ? 0 : 1);
        p.push([Math.sin(a) * (0.55 + 0.45 * (1 + Math.cos(a)) * 0.5), Math.cos(a) * r]);
      }
      return p;
    },
    /* heart-ish rear / ribcage with a spine ridge on top */
    ribcage: function (n, ridge) {
      ridge = ridge || 0.14;
      var p = [];
      for (var i = 0; i < n; i++) {
        var a = i / n * Math.PI * 2;
        var x = Math.sin(a) * 1.02, y = Math.cos(a);
        y *= 1 - 0.10 * Math.max(0, y);            /* flatter belly */
        if (y > 0) y += ridge * Math.pow(Math.max(0, Math.cos(a)), 6) * 1.8;  /* withers ridge */
        p.push([x, y]);
      }
      return p;
    }
  };
  geo.Profiles = Profiles;

  /* ------------------------------------------------------------- lofts ---
   o = {
     path:  [V3, ...]            control points, local space
     radii: [[rx,ry],...]        one per control point, or {a,b} endpoints
     stations, radial, profile   sampling detail
     tile:  metres per UV tile   (keeps coat blotches the same physical size)
     caps:  'both'|'start'|'end'|null
     twist: radians total along length
     scaleU: UV perimeter multiplier
   }                                                      */
  geo.loft = function (o) {
    var path = o.path;
    var curve = new THREE.CatmullRomCurve3(path.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); }), false, 'catmullrom', o.tension == null ? 0.5 : o.tension);
    var stations = o.stations || Math.max(8, path.length * 6);
    var radial = o.radial || 18;
    var pf = (typeof o.profile === 'function') ? o.profile
      : (Profiles[o.profile] || Profiles.ellipse);
    var prof = pf(radial);
    var tile = o.tile || 1;
    var pts = curve.getPoints(stations);

    var rA = o.radii || [[1, 1], [1, 1]];
    function radiusAt(t) {
      var x = M.clamp01(t) * (rA.length - 1);
      var i = Math.min(rA.length - 2, Math.floor(x));
      var f = M.clamp01(x - i);
      f = f * f * (3 - 2 * f);
      return [M.mix(rA[i][0], rA[i + 1][0], f), M.mix(rA[i][1], rA[i + 1][1], f)];
    }

    /* parallel-transport frames so the sweep never flips.
       convention: profile X runs along `n` (horizontal-ish), profile Y runs
       along `b` (the `up` hint side), so asymmetric sections read naturally. */
    var upHint = new THREE.Vector3(0, 1, 0);
    if (o.up) upHint.set(o.up[0], o.up[1], o.up[2]).normalize();
    var frames = [];
    var tan = [];
    for (var i = 0; i <= stations; i++) {
      tan.push(curve.getTangentAt(i / stations).normalize());
    }
    function perp(v, ref) {
      var p = v.clone().sub(ref.clone().multiplyScalar(v.dot(ref)));
      if (p.lengthSq() < 1e-8) { p = new THREE.Vector3(ref.y, -ref.x, ref.z); p.sub(ref.clone().multiplyScalar(p.dot(ref))); }
      return p.normalize();
    }
    var b0 = perp(upHint, tan[0]);
    for (i = 0; i <= stations; i++) {
      if (i > 0) {
        var q = new THREE.Quaternion().setFromUnitVectors(tan[i - 1], tan[i]);
        b0.applyQuaternion(q);
      }
      var n0 = new THREE.Vector3().copy(b0).cross(tan[i]).normalize();
      frames.push({ n: n0, b: b0.clone(), t: tan[i] });
    }

    var pos = [], uvs = [], idx = [];
    var vAcc = 0, prev = pts[0].clone();
    for (i = 0; i <= stations; i++) {
      var p = pts[i], f = frames[i];
      if (i > 0) vAcc += p.distanceTo(prev);
      prev = p.clone();
      var v = vAcc / tile + (o.v0 || 0);
      var rr = radiusAt(i / stations);
      var twist = (o.twist || 0) * (i / stations);
      /* perimeter estimate for even U */
      var per = Math.PI * (rr[0] + rr[1]);
      for (var j = 0; j <= radial; j++) {
        var s = prof[j % radial];
        var lx = s[0] * rr[0], ly = s[1] * rr[1];
        var ct = Math.cos(twist), st = Math.sin(twist);
        var wx = lx * ct - ly * st, wy = lx * st + ly * ct;
        var X = p.x + f.n.x * wx + f.b.x * wy;
        var Y = p.y + f.n.y * wx + f.b.y * wy;
        var Z = p.z + f.n.z * wx + f.b.z * wy;
        pos.push(X, Y, Z);
        uvs.push((j / radial) * per / tile + (o.u0 || 0), v);
      }
    }
    for (i = 0; i < stations; i++) {
      for (j = 0; j < radial; j++) {
        var a = i * (radial + 1) + j, b2 = a + radial + 1;
        idx.push(a, b2, a + 1, b2, b2 + 1, a + 1);
      }
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();

    /* caps: simple fans at either end, with a centred UV */
    if (o.caps && o.caps !== 'none') {
      var ends = [];
      if (o.caps === 'both' || o.caps === 'start') ends.push({ ring: 0, dir: -1 });
      if (o.caps === 'both' || o.caps === 'end') ends.push({ ring: stations, dir: 1 });
      var extraP = [], extraU = [], extraI = [];
      var base = pos.length / 3;
      ends.forEach(function (e) {
        var c = base + extraP.length / 3;
        var ci = e.ring * (radial + 1);
        var px = pos[ci * 3], py = pos[ci * 3 + 1], pz = pos[ci * 3 + 2];
        var tt = frames[e.ring].t.clone().multiplyScalar(e.dir);
        extraP.push(px + tt.x * 0.001, py + tt.y * 0.001, pz + tt.z * 0.001);
        extraU.push(0.5, 0.5);
        for (var j = 0; j <= radial; j++) {
          extraP.push(pos[(ci + j) * 3], pos[(ci + j) * 3 + 1], pos[(ci + j) * 3 + 2]);
          extraU.push(uvs[(ci + j) * 2], uvs[(ci + j) * 2 + 1]);
        }
        for (j = 0; j < radial; j++) {
          if (e.dir > 0) extraI.push(c, c + 1 + j, c + 2 + j);
          else extraI.push(c, c + 2 + j, c + 1 + j);
        }
      });
      var allP = pos.concat(extraP), allU = uvs.concat(extraU), allI = idx.concat(extraI);
      g.setAttribute('position', new THREE.Float32BufferAttribute(allP, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(allU, 2));
      g.setIndex(allI);
      g.computeVertexNormals();
    }
    return g;
  };

  /* convenience: straight loft between two points with a bend offset */
  geo.bone = function (a, b, bend, radii, o) {
    o = o || {};
    var mid = [(a[0] + b[0]) / 2 + bend[0], (a[1] + b[1]) / 2 + bend[1], (a[2] + b[2]) / 2 + bend[2]];
    return geo.loft(Object.assign({
      path: [a, mid, b],
      radii: radii,
      stations: o.stations || 10,
      radial: o.radial || 14,
      profile: o.profile || 'round',
      tile: o.tile || 1,
      caps: o.caps || 'both',
      u0: o.u0, v0: o.v0, up: o.up
    }, {}));
  };

  /* ------------------------------------------------------------- tufts ---
     a dense cone-based brush of hair: used for mane, tail tuft, knee tufts,
     ear fringes, ossicone caps.                                            */
  geo.tuftGeo = function (o) {
    var len = o.len || 0.1, rad = o.rad || 0.03, n = o.n || 5;
    var g = new THREE.ConeGeometry(rad, len, n, 1, false);
    g.translate(0, len / 2, 0);
    if (o.tip) {
      var p = g.attributes.position;
      for (var i = 0; i < p.count; i++) {
        var y = p.getY(i);
        var t = y / len;
        p.setX(i, p.getX(i) * (1 - 0.15 * t));
      }
      p.needsUpdate = true;
    }
    return g;
  };

  /* fill a "region" with instanced hair: fn(i, n, v, q, s, rnd) */
  geo.fillTufts = function (count, fn, geoUnit, material, jitter) {
    var im = new THREE.InstancedMesh(geoUnit, material, count);
    im.frustumCulled = false;
    im.castShadow = true;
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    var v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    var rnd = GW.Rand(jitter || 5);
    for (var i = 0; i < count; i++) {
      s.set(1, 1, 1);
      fn(i, count, v, q, s, rnd);
      m.compose(v, q, s);
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
    return im;
  };

  /* merge meshes that share a material into one geometry (static decor) */
  geo.merge = function (list) {
    var pos = [], nor = [], uv = [], idx = [], off = 0;
    var nm = new THREE.Matrix3();
    list.forEach(function (it) {
      var g = it.geometry.clone();
      g.applyMatrix4(it.matrix);
      nm.getNormalMatrix(it.matrix);
      var p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      var ix = g.index ? g.index.array : null;
      for (var i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        var nv = new THREE.Vector3(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0).applyMatrix3(nm).normalize();
        nor.push(nv.x, nv.y, nv.z);
        uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
      }
      var c = p.count;
      if (ix) for (i = 0; i < ix.length; i++) idx.push(ix[i] + off);
      else for (i = 0; i < c; i++) idx.push(i + off);
      off += c;
      g.dispose();
    });
    var G = new THREE.BufferGeometry();
    G.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    G.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    G.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    G.setIndex(idx);
    return G;
  };
})(typeof window !== 'undefined' ? window : globalThis);
