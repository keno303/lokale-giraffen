/* mesh.js — geometry builders: lofted spline "skin", ellipsoids, mane fin. */
(function (G) {
  'use strict';

  /*
   * G.loft(spine, opts)
   * spine: [{x, y, rx, rz}] — centre of an elliptical ring at each station.
   *   rx = half-size perpendicular to the path inside the XY plane,
   *   rz = half-size sideways (world Z). Rings stay perpendicular to the path.
   * opts: { seg: 18, uScale: metres->uv, cap0, cap1, colorFn(x,y) -> [r,g,b] }
   * UVs are metric: one texture repeat = 1/uScale metres, so the coat patch
   * size is identical on every body part.
   */
  G.loft = function (spine, opts) {
    opts = opts || {};
    var seg = opts.seg || 18;
    var uScale = opts.uScale !== undefined ? opts.uScale : 1 / G.COAT_TILE;
    var n = spine.length;

    // cumulative arc length for u
    var cum = [0], i, j;
    for (i = 1; i < n; i++) {
      var dx = spine[i].x - spine[i - 1].x, dy = spine[i].y - spine[i - 1].y;
      cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    var total = cum[n - 1] || 1;

    // ring vertices (indexed grid n x (seg+1)); metric UVs: u along the path,
    // v around the ring (Ramanujan ellipse perimeter keeps patches square)
    var pos = [], uvs = [], idx = [];
    var frames = [];
    for (i = 0; i < n; i++) {
      var s = spine[i];
      var prev = spine[Math.max(0, i - 1)], next = spine[Math.min(n - 1, i + 1)];
      var tx = next.x - prev.x, ty = next.y - prev.y;
      var tl = Math.sqrt(tx * tx + ty * ty) || 1; tx /= tl; ty /= tl;
      var nx = -ty, ny = tx;                               // perpendicular in XY
      frames.push({ nx: nx, ny: ny, tx: tx, ty: ty });
      var per = Math.PI * (3 * (s.rx + s.rz) - Math.sqrt((3 * s.rx + s.rz) * (s.rx + 3 * s.rz)));
      // whole texture turns around the ring => seam-free wrap
      var tiles = Math.max(1, Math.round(per * uScale));
      for (j = 0; j <= seg; j++) {
        var th = (j / seg) * Math.PI * 2;
        var st = Math.sin(th), ct = Math.cos(th);
        pos.push(s.x + nx * s.rx * st, s.y + ny * s.rx * st, s.rz * ct);
        uvs.push(cum[i] * uScale, (j / seg) * tiles + (opts.v0 || 0));
      }
    }
    function vert(i, j) { return i * (seg + 1) + (j % (seg + 1)); }
    for (i = 0; i < n - 1; i++) {
      for (j = 0; j < seg; j++) {
        var a = vert(i, j), b = vert(i + 1, j), c = vert(i + 1, j + 1), d = vert(i, j + 1);
        idx.push(a, b, d, b, c, d);
      }
    }
    var base = pos.length / 3;
    var caps = [];
    // End caps get their own ring vertices with proper 2D disc UVs (sharing
    // the body ring would smear ~3 texture turns across the cap face).
    function cap(i, dirx, diry) {
      var s = spine[i], fr = frames[i];
      var cIdx = pos.length / 3;
      pos.push(s.x, s.y, 0); uvs.push(cum[i] * uScale, 0.5);
      var r0 = pos.length / 3;
      for (var k = 0; k <= seg; k++) {
        var th = (k / seg) * Math.PI * 2;
        pos.push(s.x + fr.nx * s.rx * Math.sin(th), s.y + fr.ny * s.rx * Math.sin(th), s.rz * Math.cos(th));
        uvs.push(cum[i] * uScale + 0.25 * Math.sin(th), 0.5 + 0.25 * Math.cos(th));
      }
      // orient the fan so it faces along dir (outward for that end)
      var th2 = Math.PI * 2 / seg;
      var bx = fr.nx * s.rx * Math.sin(th2), by = fr.ny * s.rx * Math.sin(th2);
      var keep = (-s.rz * by) * dirx + (s.rz * bx) * diry > 0;   // cross((0,0,rz),b)·dir
      for (k = 0; k < seg; k++) {
        var a = r0 + k, b = r0 + k + 1;
        caps.push(keep ? [cIdx, a, b] : [cIdx, b, a]);
      }
    }
    var f0 = frames[0], fN = frames[n - 1];
    if (opts.cap0) cap(0, -f0.tx, -f0.ty);
    if (opts.cap1) cap(n - 1, fN.tx, fN.ty);
    caps.forEach(function (t) { idx.push(t[0], t[1], t[2]); });

    var geo = new THREE.BufferGeometry();
    var posArr = new Float32Array(pos);
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    // safety net: flip winding if the skin ended up inside-out
    if (idx.length) {
      var ni = geo.getAttribute('normal');
      var fi = idx[1] * 3;                                  // a non-cap face vertex
      var cx0 = spine[1] ? spine[1].x : spine[0].x;
      var cy0 = spine[1] ? spine[1].y : spine[0].y;
      var outward = (posArr[fi] - cx0) * ni.getX(fi) + (posArr[fi + 1] - cy0) * ni.getY(fi);
      if (outward < 0) {
        for (i = 0; i < idx.length; i += 3) { var t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
        geo.setIndex(idx);
        geo.computeVertexNormals();
      }
    }

    // vertex colours: always present (the coat material enables vertexColors,
    // and a missing attribute would render black), defaulting to white
    var colArr = new Float32Array(pos.length / 3 * 3);
    colArr.fill(1);
    if (opts.colorFn) {
      for (i = 0; i < spine.length; i++) {
        var c = opts.colorFn(spine[i].x, spine[i].y);
        for (j = 0; j <= seg; j++) {
          var vi = (i * (seg + 1) + j) * 3;
          colArr[vi] = c[0]; colArr[vi + 1] = c[1]; colArr[vi + 2] = c[2];
        }
      }
    }
    var vb = base * 3;
    for (i = vb; i < colArr.length; i++) colArr[i] = 1;
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    geo.computeBoundingSphere();
    return geo;
  };

  // squashed sphere with the long axis along +X, used for ears, bulges, eyes
  G.ellipsoid = function (rx, ry, rz, seg) {
    var g = new THREE.SphereGeometry(1, seg || 14, Math.max(8, (seg || 14) >> 1));
    g.scale(rx, ry, rz);
    var n = g.getAttribute('position').count;
    var col = new Float32Array(n * 3);
    col.fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };

  // triangular fringe along a spine (mane): points on the top surface + spikes
  G.fin = function (spine, opts) {
    opts = opts || {};
    var n = spine.length, pos = [];
    var top = [], tip = [];
    for (var i = 0; i < n; i++) {
      var s = spine[i];
      var prev = spine[Math.max(0, i - 1)], next = spine[Math.min(n - 1, i + 1)];
      var tx = next.x - prev.x, ty = next.y - prev.y;
      var tl = Math.hypot(tx, ty) || 1;
      var nx = -ty / tl, ny = tx / tl;
      var h = (i % 2 === 0 ? (opts.h1 || 0.11) : (opts.h2 || 0.05));
      top.push([s.x + nx * s.rx * 0.88, s.y + ny * s.rx * 0.88, 0]);
      tip.push([s.x + nx * (s.rx * 0.88 + h), s.y + ny * (s.rx * 0.88 + h), 0]);
    }
    for (i = 0; i < n - 1; i++) {
      pos.push.apply(pos, top[i]); pos.push.apply(pos, tip[i]); pos.push.apply(pos, top[i + 1]);
      pos.push.apply(pos, tip[i]); pos.push.apply(pos, tip[i + 1]); pos.push.apply(pos, top[i + 1]);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
})(window.G);
