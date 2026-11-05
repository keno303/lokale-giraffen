/* giraffe.js -- procedural giraffe model + limb kinematics
 *
 * Everything is built from lofted, elliptical cross-sections along a planar
 * spine curve, so the coat texture keeps one consistent scale over the whole
 * animal (u = metres along the surface, v = metres around it).
 *
 * Space:  +Z = forward (the animal walks toward +Z), +Y = up, +X = animal's left.
 */
(function (G) {
  'use strict';

  var SMOOTH = function (a, b, v) {
    var t = (v - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  };
  G.SMOOTH = SMOOTH;

  // ---- catmull-rom over control-point index -------------------------------
  function cr(a, b, c, d, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 +
      (-a + 3 * b - 3 * c + d) * t3);
  }
  function crAt(arr, s, key) {
    var n = arr.length, i = Math.floor(s), f = s - i;
    function g(k) { return arr[k < 0 ? 0 : k > n - 1 ? n - 1 : k][key]; }
    return cr(g(i - 1), g(i), g(i + 1), g(i + 2), f);
  }

  var GROUND_TONE = [0.96, 0.93, 0.88];
  // one texture tile spans this many metres of hide (about 4 patches across)
  G.UV = 1 / 0.62;

  /* loft: ctrl = [{y,z,rw,rd,n}] in the local YZ plane.
   *   rw = half width (lateral), rd = half thickness (perpendicular, in-plane)
   *   n  = super-ellipse exponent (2 = ellipse, 3 = fuller / squarer)
   * opts: rings, radial, uvFreq, cap (bool on both ends), tone(t,th,p,c)
   */
  G.loft = function (ctrl, o) {
    o = o || {};
    var rings = o.rings || 40, radial = o.radial || 18, uvF = o.uvFreq || G.UV;
    var N = rings + 1, i, j, k;

    var cy = [], cz = [], rw = [], rd = [], ex = [], arc = [], U = [];
    for (i = 0; i < N; i++) {
      var s = i / (N - 1) * (ctrl.length - 1);
      cy.push(crAt(ctrl, s, 'y')); cz.push(crAt(ctrl, s, 'z'));
      rw.push(crAt(ctrl, s, 'rw')); rd.push(crAt(ctrl, s, 'rd'));
      ex.push(o.round ? 2 : crAt(ctrl, s, 'n'));
      arc.push(0); U.push([0, -1, 0]);
    }
    for (i = 1; i < N; i++) {
      arc[i] = arc[i - 1] + Math.sqrt((cz[i] - cz[i - 1]) * (cz[i] - cz[i - 1]) +
        (cy[i] - cy[i - 1]) * (cy[i] - cy[i - 1]));
    }
    // in-plane normal U = X x T  (always perpendicular to the spine tangent)
    for (i = 0; i < N; i++) {
      var a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
      var dy = cy[b] - cy[a], dz = cz[b] - cz[a];
      var L = Math.sqrt(dy * dy + dz * dz) || 1;
      dy /= L; dz /= L;
      U[i] = [0, -dz, dy];
    }

    var cols = radial + 1;
    var pos = [], uvs = [], tones = [];
    for (i = 0; i < N; i++) {
      var per = Math.PI * (3 * (rw[i] + rd[i]) - Math.sqrt((3 * rw[i] + rd[i]) * (rw[i] + 3 * rd[i])));
      var e2 = 2 / ex[i];
      for (j = 0; j < cols; j++) {
        var th = j / radial * Math.PI * 2;
        var ct = Math.cos(th), st = Math.sin(th);
        var sx = (ct < 0 ? -1 : 1) * Math.pow(Math.abs(ct), e2);
        var sy = (st < 0 ? -1 : 1) * Math.pow(Math.abs(st), e2);
        var px = rw[i] * sx;
        var py = cy[i] + U[i][1] * rd[i] * sy;
        var pz = cz[i] + U[i][2] * rd[i] * sy;
        pos.push(px, py, pz);
        uvs.push(arc[i] * uvF, (j / radial) * per * uvF);
        var tn = o.tone ? o.tone(i / (N - 1), th,
          { x: px, y: py, z: pz }, { y: cy[i], z: cz[i], rd: rd[i], rw: rw[i] }) : 1;
        if (tn === null) tn = 1;
        tones.push(tn);
      }
    }

    var idx = [];
    for (i = 0; i < rings; i++) {
      for (j = 0; j < radial; j++) {
        var A = i * cols + j, B = (i + 1) * cols + j, C = (i + 1) * cols + j + 1, D = i * cols + j + 1;
        idx.push(A, B, D, B, C, D);
      }
    }

    // soft rounded caps: a pole pushed out along the spine tangent
    var poleStart = -1, poleEnd = -1;
    if (o.cap) {
      var d0y = cy[0] - cy[1], d0z = cz[0] - cz[1];
      var l0 = Math.sqrt(d0y * d0y + d0z * d0z) || 1;
      poleStart = pos.length / 3;
      pos.push(0, cy[0] + d0y / l0 * rd[0] * 0.55, cz[0] + d0z / l0 * rd[0] * 0.55);
      uvs.push(0, 0); tones.push(tones[0]);

      var d1y = cy[N - 1] - cy[N - 2], d1z = cz[N - 1] - cz[N - 2];
      var l1 = Math.sqrt(d1y * d1y + d1z * d1z) || 1;
      poleEnd = pos.length / 3;
      pos.push(0, cy[N - 1] + d1y / l1 * rd[N - 1] * 0.55, cz[N - 1] + d1z / l1 * rd[N - 1] * 0.55);
      uvs.push(arc[N - 1] * uvF, 0); tones.push(tones[tones.length - 1]);

      for (j = 0; j < radial; j++) {
        idx.push(poleStart, j, j + 1);
        idx.push(poleEnd, rings * cols + j + 1, rings * cols + j);
      }
    }

    // winding sanity: make sure faces point away from the spine
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    var p0 = idx[0] * 3, p1 = idx[1] * 3, p2 = idx[2] * 3;
    var ax = pos[p1] - pos[p0], ay = pos[p1 + 1] - pos[p0 + 1], az = pos[p1 + 2] - pos[p0 + 2];
    var bx = pos[p2] - pos[p0], by = pos[p2 + 1] - pos[p0 + 1], bz = pos[p2 + 2] - pos[p0 + 2];
    var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    var ox = pos[p0] - 0, oy = pos[p0] - cy[0], oz = pos[p0] - cz[0];
    if (nx * ox + ny * oy + nz * oz < 0) {
      for (i = 0; i < idx.length; i += 3) { var t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    }
    g.setIndex(idx);
    g.computeVertexNormals();

    // weld the seam normals (column 0 and column `radial` share a UV seam)
    var na = g.attributes.normal.array;
    for (i = 0; i < N; i++) {
      var ia = i * cols * 3, ib = (i * cols + radial) * 3;
      var vx = na[ia] + na[ib], vy = na[ia + 1] + na[ib + 1], vz = na[ia + 2] + na[ib + 2];
      var l = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      vx /= l; vy /= l; vz /= l;
      na[ia] = na[ib] = vx; na[ia + 1] = na[ib + 1] = vy; na[ia + 2] = na[ib + 2] = vz;
    }
    // ground-to-dust gradient (baked once, no extra shader)
    var col = [];
    for (i = 0; i < tones.length; i++) {
      var t2 = tones[i];
      if (o.dust) {
        var yy = pos[i * 3 + 1];
        var d = SMOOTH(0.05, 0.75, yy) * 0.22;
        col.push(t2 * (GROUND_TONE[0] + d), t2 * (GROUND_TONE[1] + d * 0.9), t2 * (GROUND_TONE[2] + d * 0.6));
      } else {
        col.push(t2, t2, t2);
      }
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  };

  G.ellip = function (rx, ry, rz, seg) {
    var g = new THREE.SphereGeometry(1, seg || 14, (seg || 14) >> 1);
    g.scale(rx, ry, rz);
    return g;
  };

  function mesh(geo, mat, parent, x, y, z) {
    var m = new THREE.Mesh(geo, mat);
    if (x !== undefined) m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    (parent || G.sceneGroup).add(m);
    return m;
  }
  G.mesh = mesh;

  /* ------------------------------------------------------------------ *
   *  proportions, in metres, at the model's own scale (scaled x SCALE) *
   * ------------------------------------------------------------------ */
  var BODY_Y = 1.55;
  var FETLOCK = 0.165;      // fetlock height when the hoof is flat

  var TORSO = [
    { y: 1.28, z: -1.44, rw: 0.20, rd: 0.20, n: 2.3 },
    { y: 1.38, z: -1.32, rw: 0.35, rd: 0.34, n: 2.6 },
    { y: 1.45, z: -1.10, rw: 0.43, rd: 0.43, n: 2.8 },
    { y: 1.51, z: -0.74, rw: 0.41, rd: 0.43, n: 2.9 },
    { y: 1.57, z: -0.30, rw: 0.39, rd: 0.44, n: 2.9 },
    { y: 1.65, z: 0.14, rw: 0.44, rd: 0.50, n: 3.0 },
    { y: 1.72, z: 0.53, rw: 0.49, rd: 0.59, n: 3.1 },
    { y: 1.74, z: 0.83, rw: 0.49, rd: 0.61, n: 3.2 },
    { y: 1.63, z: 1.00, rw: 0.41, rd: 0.51, n: 3.0 },
    { y: 1.58, z: 1.10, rw: 0.31, rd: 0.38, n: 2.6 },
    { y: 1.53, z: 1.16, rw: 0.20, rd: 0.25, n: 2.3 }
  ];
  var NECK = [
    { y: 1.68, z: 0.70, rw: 0.35, rd: 0.37, n: 2.9 },
    { y: 1.86, z: 0.98, rw: 0.32, rd: 0.33, n: 2.7 },
    { y: 2.22, z: 1.20, rw: 0.27, rd: 0.27, n: 2.5 },
    { y: 2.60, z: 1.44, rw: 0.23, rd: 0.23, n: 2.4 },
    { y: 3.02, z: 1.70, rw: 0.195, rd: 0.19, n: 2.3 },
    { y: 3.36, z: 1.92, rw: 0.165, rd: 0.16, n: 2.2 },
    { y: 3.50, z: 2.03, rw: 0.14, rd: 0.14, n: 2.2 }
  ];
  var HEAD = [
    { y: -0.04, z: -0.09, rw: 0.062, rd: 0.062, n: 2.2 },
    { y: -0.01, z: -0.02, rw: 0.084, rd: 0.084, n: 2.4 },
    { y: 0.030, z: 0.07, rw: 0.096, rd: 0.094, n: 2.5 },
    { y: 0.020, z: 0.19, rw: 0.090, rd: 0.082, n: 2.2 },
    { y: -0.005, z: 0.32, rw: 0.078, rd: 0.070, n: 2.1 },
    { y: -0.030, z: 0.44, rw: 0.074, rd: 0.068, n: 2.2 },
    { y: -0.038, z: 0.53, rw: 0.068, rd: 0.060, n: 2.3 },
    { y: -0.032, z: 0.585, rw: 0.036, rd: 0.032, n: 2.2 },
    { y: -0.02, z: 0.605, rw: 0.010, rd: 0.010, n: 2.2 }
  ];

  // coat tone modulation (belly & throat pale, back a shade darker)
  function bodyTone(top, belly) {
    return function (t, th, p, c) {
      var rel = (p.y - c.y) / (c.rd || 0.001);
      var k = 1;
      if (rel < -0.2) k *= 1 - belly * SMOOTH(-0.2, -1.0, rel);
      if (rel > 0.45) k *= 1 + top * SMOOTH(0.45, 1.0, rel) * 0.35;
      return k;
    };
  }

  /* ------------------------------------------------------------------ *
   *  limb definitions                                                    *
   * ------------------------------------------------------------------ */
  function seg(L, prof, rings) {
    var ctrl = [], i;
    for (i = 0; i < prof.length; i++) {
      ctrl.push({ y: -L * prof[i][0], z: 0, rw: prof[i][1], rd: prof[i][2], n: prof[i][3] || 2.1 });
    }
    return G.loft(ctrl, { rings: rings || 16, radial: 12 });
  }

  var FORE = {
    hip: { y: 1.70, z: 0.80 }, splay: -0.018,
    L: [0.66, 0.60, 0.32],
    lim: [[-0.75, 0.62], [-1.00, 0.14], [-0.55, 0.60]],
    rest: [-0.05, 0.03, 0.06],
    nom: [-0.02, 0.02, 0.02],
    mats: ['coat', 'coat', 'pale', 'dark'],
    geos: function () {
      return [
        seg(0.66, [[0, 0.165, 0.150, 2.3], [0.3, 0.118, 0.108, 2.2], [0.62, 0.088, 0.082, 2.1], [1, 0.074, 0.070, 2.0]], 18),
        seg(0.60, [[0, 0.080, 0.076, 2.1], [0.45, 0.064, 0.060, 2.0], [1, 0.052, 0.049, 2.0]], 14),
        seg(0.32, [[0, 0.053, 0.050, 2.0], [0.5, 0.044, 0.042, 2.0], [1, 0.036, 0.034, 2.0]], 12),
        seg(0.16, [[0, 0.040, 0.038, 2.0], [0.55, 0.047, 0.045, 2.0], [1, 0.040, 0.036, 2.0]], 10)
      ];
    }
  };
  var HIND = {
    hip: { y: 1.56, z: -1.34 }, splay: 0.028,
    L: [0.56, 0.58, 0.40],
    lim: [[-0.95, 0.70], [-1.20, 0.16], [-0.60, 0.55]],
    rest: [0.42, -0.56, 0.24],
    nom: [0.34, -0.44, 0.16],
    mats: ['coat', 'coat', 'pale', 'dark'],
    geos: function () {
      return [
        seg(0.56, [[0, 0.185, 0.170, 2.4], [0.32, 0.128, 0.118, 2.3], [0.66, 0.096, 0.090, 2.1], [1, 0.086, 0.082, 2.0]], 18),
        seg(0.58, [[0, 0.092, 0.088, 2.1], [0.35, 0.078, 0.074, 2.1], [1, 0.053, 0.051, 2.0]], 14),
        seg(0.40, [[0, 0.056, 0.053, 2.0], [0.5, 0.045, 0.043, 2.0], [1, 0.037, 0.035, 2.0]], 12),
        seg(0.16, [[0, 0.040, 0.038, 2.0], [0.55, 0.047, 0.045, 2.0], [1, 0.040, 0.036, 2.0]], 10)
      ];
    }
  };

  function hoofMesh(parent, mat) {
    // wedge: flat sole at y = -FETLOCK, toe toward +Z
    var m = mesh(G.ellip(0.052, 0.075, 0.070, 14), mat, parent, 0, -0.098, 0.012);
    var toe = mesh(G.ellip(0.048, 0.058, 0.048, 12), mat, parent, 0, -0.112, 0.048);
    return [m, toe];
  }

  /* ------------------------------------------------------------------ *
   *  build                                                              *
   * ------------------------------------------------------------------ */
  G.buildGiraffe = function (mats) {
    var model = new THREE.Group();
    model.name = 'giraffe';
    var body = new THREE.Group();
    body.position.y = BODY_Y;
    model.add(body);

    var rig = { model: model, body: body, legs: [] };

    // ---- torso ----
    var torsoG = G.loft(TORSO, {
      rings: 72, radial: 26, cap: true, dust: true,
      tone: bodyTone(0.16, 0.55)
    });
    torsoG.translate(0, -BODY_Y, 0);
    rig.torso = mesh(torsoG, mats.coat, body);

    // ---- withers / haunch sub-groups (spinal twist carries the limbs) ----
    var withers = new THREE.Group(); withers.position.set(0, 0, 0.55); body.add(withers);
    var haunch = new THREE.Group(); haunch.position.set(0, 0, -0.78); body.add(haunch);
    rig.withers = withers; rig.haunch = haunch;

    // ---- neck ----
    var neckBase = new THREE.Group();
    neckBase.position.set(0, 1.82 - BODY_Y, 0.92 - 0.55);
    withers.add(neckBase);
    var neckG = G.loft(NECK, { __neck: true,
      rings: 44, radial: 20, cap: true,
      tone: function (t, th, p, c) {
        var rel = (p.y - c.y) / (c.rd || 0.001);
        var k = 1;
        if (rel < -0.15) k *= 1 - 0.5 * SMOOTH(-0.15, -1, rel);      // pale throat
        if (rel > 0.55) k *= 1 + 0.22 * SMOOTH(0.55, 1, rel);        // darker crest
        return k;
      }
    });
    neckG.translate(0, -1.82, -0.92);   // built in giraffe space, hung under neckBase
    mesh(neckG, mats.coat, neckBase);
    rig.neckBase = neckBase;

    // ---- head ----
    var head = new THREE.Group();
    head.position.set(0, 3.46 - 1.82, 2.03 - 0.92);
    head.rotation.x = 0.30;
    neckBase.add(head);
    rig.head = head;
    var headG = G.loft(HEAD, {
      rings: 34, radial: 18, cap: true,
      tone: function (t, th, p, c) {
        var rel = (p.y - c.y) / (c.rd || 0.001);
        var k = 1;
        if (rel < -0.1) k *= 1 - 0.42 * SMOOTH(-0.1, -1, rel);
        if (t > 0.62) k *= 1 - 0.30 * SMOOTH(0.62, 1.0, t);          // dark muzzle
        return k;
      }
    });
    mesh(headG, mats.coat, head);
    // jaw
    var jawG = seg(0.30, [[0.06, 0.048, 0.036], [0.5, 0.052, 0.036], [1, 0.046, 0.030]], 10);
    jawG.rotateX(-Math.PI / 2);
    jawG.translate(0, -0.062, 0.14);
    mesh(jawG, mats.coat, head);
    // eyes (dark, with a faint highlight)
    rig.eyes = [];
    [-1, 1].forEach(function (s) {
      var e = mesh(G.ellip(0.020, 0.026, 0.026, 12), mats.eye, head, s * 0.080, 0.026, 0.152);
      rig.eyes.push(e);
    });
    // ossicones
    [-1, 1].forEach(function (s) {
      var og = G.loft([
        { y: 0, z: 0.010, rw: 0.028, rd: 0.028, n: 2.2 },
        { y: 0.05, z: -0.005, rw: 0.023, rd: 0.023, n: 2.2 },
        { y: 0.092, z: -0.020, rw: 0.030, rd: 0.030, n: 2.2 },
        { y: 0.118, z: -0.028, rw: 0.034, rd: 0.034, n: 2.2 },
        { y: 0.142, z: -0.032, rw: 0.016, rd: 0.016, n: 2.2 }
      ], { rings: 14, radial: 10 });
      mesh(og, mats.dark, head, s * 0.043, 0.082, -0.005);
      // ear
      var eg = G.loft([
        { y: 0, z: 0, rw: 0.008, rd: 0.026, n: 2.0 },
        { y: 0.004, z: 0.06, rw: 0.010, rd: 0.060, n: 2.2 },
        { y: 0.008, z: 0.14, rw: 0.011, rd: 0.076, n: 2.4 },
        { y: 0.004, z: 0.21, rw: 0.008, rd: 0.056, n: 2.2 },
        { y: -0.002, z: 0.252, rw: 0.004, rd: 0.020, n: 2.0 }
      ], { rings: 14, radial: 8 });
      var ear = new THREE.Group();
      ear.position.set(s * 0.075, 0.030, -0.040);
      ear.rotation.set(-0.06, s * 2.12, s * 0.10);
      head.add(ear);
      mesh(eg, mats.coat, ear);
      if (s < 0) rig.earL = ear; else rig.earR = ear;
    });
    // nostrils + mouth
    [-1, 1].forEach(function (s) {
      mesh(G.ellip(0.012, 0.016, 0.020, 8), mats.dark, head, s * 0.042, 0.006, 0.472);
    });
    mesh(G.ellip(0.040, 0.010, 0.030, 10), mats.dark, head, 0, -0.070, 0.470);

    // ---- mane: neck crest + dorsal stripe ----
    rig.manels = [];
    var ng2 = G.mane(NECK, 0.092, -0.30, { rings: 40 });
    ng2.translate(0, -1.82, -0.92);
    rig.manels.push(mesh(ng2, mats.mane, neckBase));
    var mg = G.mane(TORSO.slice(2, TORSO.length - 2), 0.058, -0.55, { rings: 40 });
    mg.translate(0, -BODY_Y, 0);
    rig.manels.push(mesh(mg, mats.mane, body));

    // ---- tail ----
    var tailRoot = new THREE.Group();
    tailRoot.position.set(0, 1.50 - BODY_Y, -1.36 + 0.78);
    haunch.add(tailRoot);
    rig.tailRoot = tailRoot;
    rig.tail = [];
    var tl = [0.26, 0.24, 0.20], tj = tailRoot, i;
    var tailGeo = [
      seg(0.26, [[0, 0.048, 0.044], [0.6, 0.032, 0.030], [1, 0.026, 0.025]], 8),
      seg(0.24, [[0, 0.026, 0.025], [1, 0.021, 0.020]], 8),
      seg(0.20, [[0, 0.021, 0.020], [1, 0.017, 0.016]], 8)
    ];
    for (i = 0; i < 3; i++) {
      var j = new THREE.Group();
      j.position.y = i === 0 ? 0 : -tl[i - 1];
      tj.add(j);
      mesh(tailGeo[i], mats.coat, j);
      rig.tail.push(j);
      tj = j;
    }
    var tuft = G.loft([
      { y: -0.02, z: 0, rw: 0.030, rd: 0.028, n: 2.2 },
      { y: -0.13, z: -0.01, rw: 0.055, rd: 0.052, n: 2.4 },
      { y: -0.26, z: -0.03, rw: 0.042, rd: 0.040, n: 2.4 },
      { y: -0.34, z: -0.045, rw: 0.012, rd: 0.012, n: 2.2 }
    ], { rings: 14, radial: 10 });
    mesh(tuft, mats.dark, tj, 0, -0.18, 0);
    rig.tailTip = tj;

    // ---- legs ----
    var defs = [
      { n: 'RF', x: 0.205, d: FORE, ph: 0.00, par: withers },
      { n: 'LF', x: -0.205, d: FORE, ph: 0.50, par: withers },
      { n: 'RH', x: 0.235, d: HIND, ph: 0.09, par: haunch },
      { n: 'LH', x: -0.235, d: HIND, ph: 0.59, par: haunch }
    ];
    defs.forEach(function (d) {
      var root = new THREE.Group();
      root.position.set(d.x, d.d.hip.y - BODY_Y, d.d.hip.z - d.par.position.z);
      root.rotation.z = d.d.splay * (d.x > 0 ? 1 : -1);
      d.par.add(root);
      var j0 = new THREE.Group(); root.add(j0);
      var geos = d.d.geos();
      var joints = [j0], jointsParent = [root];
      var acc = 0, chain = j0, i2;
      for (i2 = 0; i2 < 4; i2++) {
        var mat = mats[d.d.mats[i2]];
        mesh(geos[i2], mat, chain);
        if (i2 === 3) hoofMesh(chain, mats.hoof || mats.dark);
        var nj = new THREE.Group();
        nj.position.y = i2 < 3 ? -d.d.L[i2] : -0.16;
        chain.add(nj);
        if (i2 < 3) { joints.push(nj); chain = nj; }
      }
      rig.legs.push({
        name: d.n, side: d.x > 0 ? 1 : -1, kind: d.d === FORE ? 'f' : 'h',
        root: root, joints: joints, L: d.d.L.slice(), lim: d.d.lim,
        nom: d.d.nom, a: d.d.rest.slice(), phase: d.ph, par: d.par
      });
    });

    model.updateMatrixWorld(true);
    return rig;
  };

  /* mane ribbon along a spine: height h, leaning back by lean */
  G.mane = function (ctrl, h, lean, o) {
    o = o || {};
    var n = o.rings || 32, i;
    var pos = [], uvs = [], col = [], idx = [];
    for (i = 0; i <= n; i++) {
      var s = i / n * (ctrl.length - 1);
      var y = crAt(ctrl, s, 'y'), z = crAt(ctrl, s, 'z');
      var rd = crAt(ctrl, s, 'rd');
      var a = Math.max(0, i - 1), b = Math.min(n, i + 1);
      var ya = crAt(ctrl, a, 'y'), za = crAt(ctrl, a, 'z');
      var yb = crAt(ctrl, b, 'y'), zb = crAt(ctrl, b, 'z');
      var dy = yb - ya, dz = zb - za, L = Math.sqrt(dy * dy + dz * dz) || 1;
      dy /= L; dz /= L;
      var uy = -dz, uz = dy;               // in-plane normal (X x T)
      var dorsi = (dz > 0.05) ? -1 : 1;    // neck: crest is on the -U side, back: +U
      var hh = h * Math.pow(Math.sin(Math.PI * Math.min(1, 0.02 + 0.96 * i / n)), 0.5);
      if (o.flatTop) hh = h;
      var bx = 0, by = y + rd * 0.9 * dorsi * uy, bz = z + rd * 0.9 * dorsi * uz;
      var tx = 0, tyy = by + hh * (dorsi * uy - lean * dy), tz2 = bz + hh * (dorsi * uz - lean * dz);
      var j = Math.sin(i * 2.7) * 0.008;
      pos.push(bx, by, bz, tx + j, tyy, tz2);
      uvs.push(0, i * 0.02, 0.04, i * 0.02);
      var t = 0.72 + 0.28 * Math.sin(i * 1.7);
      col.push(t, t, t, t, t, t);
    }
    for (i = 0; i < n; i++) {
      var A = i * 2;
      idx.push(A, A + 1, A + 2, A + 1, A + 3, A + 2);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  G.GIRAFFE_Y = BODY_Y;
  G.FETLOCK = FETLOCK;
  G.foreDef = FORE;
  G.hindDef = HIND;

})(window.G = window.G || {});
