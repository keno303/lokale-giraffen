/* Procedural generalized-tube geometry builder with automatic skinning.
   Builds smooth, organic limbs/torso from a joint polyline + radius profile. */
(function (global) {
  'use strict';
  var THREE = global.THREE;

  var V = THREE.Vector3;

  function catmull(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  function sampleArr(arr, s) {
    var n = arr.length;
    var i = Math.floor(s);
    if (i < 0) i = 0;
    if (i > n - 2) i = n - 2;
    var f = s - i;
    var p0 = arr[Math.max(0, i - 1)], p1 = arr[i], p2 = arr[i + 1], p3 = arr[Math.min(n - 1, i + 2)];
    return catmull(p0, p1, p2, p3, f);
  }

  // Cache component arrays to avoid rebuilding every sample
  function makeSampler(pts) {
    var xs = [], ys = [], zs = [];
    for (var i = 0; i < pts.length; i++) { xs.push(pts[i].x); ys.push(pts[i].y); zs.push(pts[i].z); }
    return function (s, out) {
      out.set(sampleArr(xs, s), sampleArr(ys, s), sampleArr(zs, s));
      return out;
    };
  }

  function signPow(v, k) {
    if (k === 1) return v;
    var a = Math.abs(v);
    return (v < 0 ? -1 : 1) * Math.pow(a, k);
  }

  /**
   * opts:
   *   joints   : [Vector3]  skeleton joint positions (bind space)
   *   radii    : [{rx, ryUp, ryDown, k}]  per joint cross-section
   *   radial   : int  radial segments
   *   spacing  : float target ring spacing (m)
   *   refAxis  : Vector3 reference "up" for frames
   *   capStart / capEnd : bool
   *   boneOffset : int  index of joints[0]'s bone in the skeleton bone array
   *   blend    : float  skin blend width in joint units
   *   vRange   : [v0,v1] uv v mapping
   */
  function buildTube(opts) {
    var joints = opts.joints, radii = opts.radii;
    var n = joints.length;
    var radial = opts.radial || 24;
    var spacing = opts.spacing || 0.07;
    var ref = (opts.refAxis || new V(0, 1, 0)).clone().normalize();
    var blend = opts.blend || 1.0;
    var boneOffset = opts.boneOffset || 0;
    var boneIndices = opts.boneIndices || null;
    var sampler = makeSampler(joints);
    var patternFn = typeof opts.pattern === 'function' ? opts.pattern : function () { return opts.pattern === undefined ? 1 : opts.pattern; };
    var furFn = typeof opts.fur === 'function' ? opts.fur : function () { return opts.fur === undefined ? 1 : opts.fur; };
    var profileFn = opts.profile || null;   // function(s, ang, ring) -> extra radial offset

    // ---- build list of s-parameters ----
    var sList = [];
    for (var i = 0; i < n - 1; i++) {
      var len = joints[i].distanceTo(joints[i + 1]);
      var steps = Math.max(2, Math.round(len / spacing));
      for (var j = 0; j < steps; j++) sList.push(i + j / steps);
    }
    sList.push(n - 1);

    var rings = [];       // {pos, side, up, tan, s, rx, ryU, ryD, k, scale, arc}
    var tmpA = new V(), tmpB = new V();
    var kArr = radii.map(function (r) { return r.k === undefined ? 1 : r.k; });
    var rxArr = radii.map(function (r) { return r.rx; });
    var ruArr = radii.map(function (r) { return r.ryUp === undefined ? r.rx : r.ryUp; });
    var rdArr = radii.map(function (r) { return r.ryDown === undefined ? (r.ryUp === undefined ? r.rx : r.ryUp) : r.ryDown; });

    function frameAt(s) {
      var p = sampler(s, new V());
      var h = 0.01;
      var a = sampler(Math.max(0, s - h), tmpA);
      var b = sampler(Math.min(n - 1, s + h), tmpB);
      var tan = new V().subVectors(b, a).normalize();
      var side = new V().crossVectors(tan, ref);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      var up = new V().crossVectors(side, tan).normalize();
      return { pos: p, tan: tan, side: side, up: up };
    }

    for (var r = 0; r < sList.length; r++) {
      var s = sList[r];
      var f = frameAt(s);
      rings.push({
        pos: f.pos, tan: f.tan, side: f.side, up: f.up, s: s, scale: 1,
        rx: sampleArr(rxArr, s), ryU: sampleArr(ruArr, s), ryD: sampleArr(rdArr, s),
        k: sampleArr(kArr, s)
      });
    }

    // ---- caps (dome shaped extensions) ----
    function makeCap(end) {
      var base = end ? rings[rings.length - 1] : rings[0];
      var dir = base.tan.clone().multiplyScalar(end ? 1 : -1);
      var capLen = (base.rx + (base.ryU + base.ryD) * 0.5) * 0.5 * (opts.capScale || 1.0);
      var steps = 5;
      var out = [];
      for (var c = 1; c <= steps; c++) {
        var phi = (c / steps) * Math.PI * 0.5;
        var sc = Math.cos(phi);
        var off = dir.clone().multiplyScalar(capLen * Math.sin(phi));
        out.push({
          pos: base.pos.clone().add(off), tan: base.tan, side: base.side, up: base.up,
          s: base.s, scale: sc, rx: base.rx, ryU: base.ryU, ryD: base.ryD, k: base.k
        });
      }
      return out;
    }
    if (opts.capEnd) rings = rings.concat(makeCap(true));
    if (opts.capStart) rings = makeCap(false).reverse().concat(rings);

    // ---- arc length for v coordinate ----
    var arc = [0];
    for (var q = 1; q < rings.length; q++) arc.push(arc[q - 1] + rings[q].pos.distanceTo(rings[q - 1].pos));
    var total = arc[arc.length - 1] || 1;

    // ---- vertices ----
    var nv = rings.length * (radial + 1);
    var pos = new Float32Array(nv * 3);
    var uv = new Float32Array(nv * 2);
    var si = new Uint16Array(nv * 4);
    var sw = new Float32Array(nv * 4);
    var aPat = new Float32Array(nv);
    var aFur = new Float32Array(nv);
    var vi = 0;
    var vRange = opts.vRange || [0, 1];

    for (var ri = 0; ri < rings.length; ri++) {
      var R = rings[ri];
      // skin weights for this ring (same for whole ring)
      var wIdx = [0, 0, 0, 0], wVal = [0, 0, 0, 0], wc = 0, wsum = 0;
      for (var b = 0; b < n; b++) {
        var w = 1 - Math.abs(R.s - b) / blend;
        if (w > 0.0001 && wc < 4) {
          wIdx[wc] = boneIndices ? boneIndices[b] : (boneOffset + b);
          wVal[wc] = w; wsum += w; wc++;
        }
      }
      if (wsum === 0) { wIdx[0] = boneIndices ? boneIndices[0] : boneOffset; wVal[0] = 1; wsum = 1; }
      for (var wq = 0; wq < 4; wq++) wVal[wq] /= wsum;

      for (var a2 = 0; a2 <= radial; a2++) {
        var ang = (a2 / radial) * Math.PI * 2;
        var cs = Math.sin(ang), cu = Math.cos(ang);
        var px = signPow(cs, R.k), py = signPow(cu, R.k);
        var ry = cu >= 0 ? R.ryU : R.ryD;
        var exr = profileFn ? profileFn(R.s, ang, R) : 0;
        var sx = R.rx * px * R.scale + (profileFn ? exr * px : 0);
        var sy = ry * py * R.scale + (profileFn ? exr * py : 0);
        var x = R.pos.x + R.side.x * sx + R.up.x * sy;
        var y = R.pos.y + R.side.y * sx + R.up.y * sy;
        var z = R.pos.z + R.side.z * sx + R.up.z * sy;
        pos[vi * 3] = x; pos[vi * 3 + 1] = y; pos[vi * 3 + 2] = z;
        uv[vi * 2] = a2 / radial;
        uv[vi * 2 + 1] = vRange[0] + (vRange[1] - vRange[0]) * (arc[ri] / total);
        aPat[vi] = patternFn(x, y, z, R.s, ang, R);
        aFur[vi] = furFn(x, y, z, R.s, ang, R);
        for (var w2 = 0; w2 < 4; w2++) { si[vi * 4 + w2] = wIdx[w2]; sw[vi * 4 + w2] = wVal[w2]; }
        vi++;
      }
    }

    // ---- indices ----
    var idx = [];
    for (var ri2 = 0; ri2 < rings.length - 1; ri2++) {
      for (var a3 = 0; a3 < radial; a3++) {
        var i0 = ri2 * (radial + 1) + a3;
        var i1 = i0 + 1;
        var i2 = i0 + (radial + 1);
        var i3 = i2 + 1;
        idx.push(i0, i2, i1, i1, i2, i3);
      }
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setAttribute('aPattern', new THREE.BufferAttribute(aPat, 1));
    g.setAttribute('aFur', new THREE.BufferAttribute(aFur, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  global.Geom = { buildTube: buildTube, sampleArr: sampleArr };
})(typeof window !== 'undefined' ? window : globalThis);
