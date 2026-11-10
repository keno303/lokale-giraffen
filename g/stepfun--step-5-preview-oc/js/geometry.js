/* ------------------------------------------------------------------
 * geometry.js -- procedural mesh helpers (loft, lathe, ridge, tuft)
 * No dependencies beyond THREE. Pure geometry, safe in Node.
 * ------------------------------------------------------------------ */
(function (root, factory) {
  var api = factory(root.THREE);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GX = api;
})(typeof self !== 'undefined' ? self : globalThis, function (THREE) {
  'use strict';

  var EPS = 1e-7;

  /* ---------------- small math helpers ---------------- */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  /* Catmull-Rom interpolation of a scalar list at parameter t (0..n-1). */
  function catmull(values, t) {
    var n = values.length;
    if (n === 0) return 0;
    if (n === 1) return values[0];
    t = clamp(t, 0, n - 1);
    var i = Math.floor(t);
    if (i >= n - 1) return values[n - 1];
    var f = t - i;
    var p0 = values[Math.max(0, i - 1)];
    var p1 = values[i];
    var p2 = values[i + 1];
    var p3 = values[Math.min(n - 1, i + 2)];
    return 0.5 * ((2 * p1) + (-p0 + p2) * f +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f +
      (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
  }

  /* ---------------- loft: sweep an ellipse along a polyline ---------------- */

  /**
   * Build a smooth tube by sweeping an elliptical cross-section along a
   * Catmull-Rom spline through the supplied spine points.
   *
   * opts.points      : Array<[x,y,z]> centre-line stations (>= 2)
   * opts.radius      : Array<[rx, rz]> half-extents per station (same length)
   * opts.samples     : longitudinal resolution (default 40)
   * opts.radial      : radial resolution (default 24)
   * opts.caps        : close the two ends (default true)
   * opts.taperStart  : multiply the first/last station radius (default 1)
   * opts.taperEnd
   * opts.twist       : optional function(stationT, stationIndex) -> z-rotation
   *                    applied to the cross-section frame (radians)
   * Returns { geometry, frames } where frames are the computed station
   * transforms (useful for attaching things like manes / ridges).
   */
  function loft(opts) {
    var pts = opts.points || [];
    var rad = opts.radius || [];
    var n = pts.length;
    if (n < 2) throw new Error('loft needs >= 2 stations');

    var samples = opts.samples || 40;
    var radial = opts.radial || 24;
    var caps = opts.caps !== false;

    // Densify the spine with a Catmull-Rom pass so the loft is smooth.
    var spine = [];
    var sub = opts.smooth === false ? 1 : 3;
    for (var i = 0; i < n - 1; i++) {
      for (var s = 0; s < sub; s++) {
        var t = i + s / sub;
        var p = new THREE.Vector3(
          catmull(pts.map(function (q) { return q[0]; }), t),
          catmull(pts.map(function (q) { return q[1]; }), t),
          catmull(pts.map(function (q) { return q[2]; }), t)
        );
        spine.push(p);
      }
    }
    var last = pts[n - 1];
    spine.push(new THREE.Vector3(last[0], last[1], last[2]));

    // Resample radii along the densified spine.
    var radii = [];
    for (var k = 0; k < spine.length; k++) {
      var tt = (k / (spine.length - 1)) * (n - 1);
      radii.push([
        catmull(rad.map(function (q) { return q[0]; }), tt),
        catmull(rad.map(function (q) { return q[1]; }), tt)
      ]);
    }
    if (opts.taperStart !== undefined) {
      radii[0][0] *= opts.taperStart; radii[0][1] *= opts.taperStart;
    }
    if (opts.taperEnd !== undefined) {
      var e = radii.length - 1;
      radii[e][0] *= opts.taperEnd; radii[e][1] *= opts.taperEnd;
    }

    // Build a rotation-minimising frame along the spine.
    var frames = [];
    var up = new THREE.Vector3(0, 1, 0);
    var prevTan = new THREE.Vector3();
    for (var a = 0; a < spine.length; a++) {
      var p0 = spine[Math.max(0, a - 1)];
      var p1 = spine[a];
      var p2 = spine[Math.min(spine.length - 1, a + 1)];
      var tan = new THREE.Vector3().subVectors(p2, p0);
      if (tan.lengthSq() < EPS) tan.copy(prevTan);
      if (tan.lengthSq() < EPS) tan.set(0, 1, 0);
      tan.normalize();
      prevTan.copy(tan);

      var normal;
      if (a === 0) {
        normal = new THREE.Vector3().crossVectors(tan, up);
        if (normal.lengthSq() < EPS) normal.set(1, 0, 0);
        normal.normalize();
      } else {
        // Project the previous normal onto the plane perpendicular to tan.
        var prevN = frames[a - 1].normal;
        normal = prevN.clone().addScaledVector(tan, -prevN.dot(tan));
        if (normal.lengthSq() < EPS) {
          normal = new THREE.Vector3().crossVectors(tan, up);
          if (normal.lengthSq() < EPS) normal.set(1, 0, 0);
        }
        normal.normalize();
      }
      var binormal = new THREE.Vector3().crossVectors(tan, normal).normalize();
      frames.push({ p: p1, tan: tan, normal: normal, binormal: binormal });
    }

    // Optional twist of the cross-section frame.
    if (opts.twist) {
      for (var b = 0; b < frames.length; b++) {
        var ang = opts.twist(b / (frames.length - 1), b);
        if (ang !== 0) {
          var ca = Math.cos(ang), sa = Math.sin(ang);
          var nrm = frames[b].normal, bin = frames[b].binormal;
          var nn = nrm.clone().multiplyScalar(ca).addScaledVector(bin, sa);
          var bb = bin.clone().multiplyScalar(ca).addScaledVector(nrm, -sa);
          frames[b].normal.copy(nn);
          frames[b].binormal.copy(bb);
        }
      }
    }

    var positions = [];
    var uvs = [];
    var indices = [];

    for (var c = 0; c < frames.length; c++) {
      var fr = frames[c];
      var rx = Math.max(EPS, radii[c][0]);
      var rz = Math.max(EPS, radii[c][1]);
      for (var r = 0; r <= radial; r++) {
        var th = (r / radial) * Math.PI * 2;
        var cx = Math.cos(th), sy = Math.sin(th);
        var px = fr.p.x + fr.normal.x * cx * rx + fr.binormal.x * sy * rz;
        var py = fr.p.y + fr.normal.y * cx * rx + fr.binormal.y * sy * rz;
        var pz = fr.p.z + fr.normal.z * cx * rx + fr.binormal.z * sy * rz;
        positions.push(px, py, pz);
        uvs.push(r / radial, c / (frames.length - 1));
      }
    }

    var stride = radial + 1;
    for (var d = 0; d < frames.length - 1; d++) {
      for (var q = 0; q < radial; q++) {
        var i0 = d * stride + q;
        var i1 = i0 + 1;
        var i2 = (d + 1) * stride + q;
        var i3 = i2 + 1;
        indices.push(i0, i2, i1);
        indices.push(i1, i2, i3);
      }
    }

    if (caps) {
      // Fan caps using the centroid of each end ring.
      var capIdx = positions.length / 3;
      for (var e2 = 0; e2 < 2; e2++) {
        var ring = e2 === 0 ? 0 : (frames.length - 1) * stride;
        var frr = frames[e2 === 0 ? 0 : frames.length - 1];
        var cx2 = 0, cy2 = 0, cz2 = 0;
        for (var w = 0; w < radial; w++) {
          cx2 += positions[(ring + w) * 3 + 0];
          cy2 += positions[(ring + w) * 3 + 1];
          cz2 += positions[(ring + w) * 3 + 2];
        }
        cx2 /= radial; cy2 /= radial; cz2 /= radial;
        positions.push(cx2, cy2, cz2);
        uvs.push(0.5, e2 === 0 ? 0 : 1);
        for (var w2 = 0; w2 < radial; w2++) {
          var ia = ring + w2;
          var ib = ring + ((w2 + 1) % radial);
          if (e2 === 0) indices.push(capIdx, ib, ia);
          else indices.push(capIdx, ia, ib);
        }
        capIdx++;
      }
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return { geometry: geo, frames: frames, radii: radii, spine: spine };
  }

  /* ---------------- lathe helper ---------------- */

  /** Revolve a 2D profile (array of [x=radius, y]) around the Y axis. */
  function lathe(profile, segments) {
    var pts = profile.map(function (p) { return new THREE.Vector2(p[0], p[1]); });
    var geo = new THREE.LatheGeometry(pts, segments || 20);
    geo.computeVertexNormals();
    return geo;
  }

  /* ---------------- ridge: a thin wavy strip along a path ---------------- */

  /**
   * A thin vertical "fin" used for the neck mane. Walks along the supplied
   * points, extruding a strip of height h with a wavy top edge.
   */
  function ridge(points, h, width, wave, waveFreq) {
    var pos = [];
    var idx = [];
    var uv = [];
    wave = wave === undefined ? 0.35 : wave;
    waveFreq = waveFreq || 7;
    for (var i = 0; i < points.length; i++) {
      var t = i / (points.length - 1);
      var p = points[i];
      var dir = new THREE.Vector3();
      if (i === 0) dir.subVectors(points[1], points[0]);
      else if (i === points.length - 1) dir.subVectors(points[i], points[i - 1]);
      else dir.subVectors(points[i + 1], points[i - 1]);
      dir.normalize();
      // Side vector: perpendicular in the XZ plane.
      var side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
      var hh = h * (0.72 + 0.28 * Math.sin(t * Math.PI * waveFreq + i * 1.7) * wave + 0.28 * (1 - t) * 0.2);
      hh = Math.max(0.02, hh);
      var w = width * (0.6 + 0.4 * Math.sin(t * Math.PI * 1.5));
      pos.push(p.x + side.x * w, p.y, p.z + side.z * w);
      pos.push(p.x - side.x * w, p.y, p.z - side.z * w);
      pos.push(p.x + side.x * w, p.y + hh, p.z + side.z * w);
      pos.push(p.x - side.x * w, p.y + hh, p.z - side.z * w);
      uv.push(0, t, 1, t, 0, t, 1, t);
      if (i < points.length - 1) {
        var a = i * 4, b = (i + 1) * 4;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
        idx.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
        idx.push(a + 3, b + 3, a + 2, a + 2, b + 3, b + 2);
        idx.push(a + 2, b + 2, b, a, b, b + 2);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* ---------------- ossicone / horn ---------------- */

  function ossicone(len, baseR, tipR, tilt) {
    var pts = [];
    var steps = 10;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      // Slight backward curve.
      var y = t * len;
      var r = lerp(baseR, tipR, t) * (1 - 0.25 * t * t);
      pts.push([r, y]);
    }
    var g = lathe(pts, 14);
    if (tilt) g.rotateX(tilt);
    return g;
  }

  return {
    clamp: clamp, lerp: lerp, smoothstep: smoothstep, catmull: catmull,
    loft: loft, lathe: lathe, ridge: ridge, ossicone: ossicone
  };
});
