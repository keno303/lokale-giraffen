/* ------------------------------------------------------------------
 * giraffe.js -- anatomically-proportioned giraffe with a true
 * pacing gait driven by world-space foot targets + analytic IK.
 *
 * Axes: the giraffe faces +X, up is +Y, its right flank is +Z.
 * ------------------------------------------------------------------ */
(function (root, factory) {
  var api = factory(root.THREE, root.GX);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GIRAFFE = api;
})(typeof self !== 'undefined' ? self : globalThis, function (THREE, GX) {
  'use strict';

  var clamp = GX.clamp, lerp = GX.lerp;

  /* ================================================================
   * SKELETON -- metres, measured off a 5 m class male reticulated
   * giraffe. Everything below is expressed in the giraffe's local
   * frame (origin on the ground between the hooves).
   * ================================================================ */

  var SKEL = {
    // leg roots
    shoulder: { x: 0.98, y: 1.98 },
    hip: { x: -1.02, y: 1.92 },
    frontZ: 0.42, hindZ: 0.44,

    // neck + head
    neckBase: { x: 1.02, y: 2.86 },
    neckLen: 2.05,
    neckAngle: 0.88,      // radians away from vertical, leaning forward
    headLen: 0.62,
    // headPitch is measured in the NECK's frame. The neck is already
    // tilted forward by neckAngle, so the head needs +neckAngle-ish to
    // come out level in the body frame (headForward angle = pitch - neckAngle).
    headPitch: 0.78,
    headYaw: 0.0,

    // foot
    coronetY: 0.105,      // top of the hoof above the ground
    pastern: 0.13,        // P1 length
    pasternAngle: 0.42,   // radians forward of vertical
    hoofH: 0.105
  };

  var LEG = {
    front: {
      bones: [0.54, 0.70, 0.76],   // humerus, radius, metacarpus
      aim: -0.50,                  // humerus tilts BACK of the shoulder->fetlock line
      radii: [0.150, 0.115, 0.070, 0.055, 0.050],
      z: SKEL.frontZ
    },
    hind: {
      bones: [0.54, 0.68, 0.78],   // femur, tibia, metatarsus
      aim: 0.30,                   // femur tilts FORWARD of the hip->fetlock line
      radii: [0.165, 0.120, 0.072, 0.055, 0.050],
      z: SKEL.hindZ
    }
  };

    /* Torso loft stations: [x, top, bottom, halfWidth].
       radius = [halfWidth, halfHeight] -> rx is lateral (normal),
       rz is vertical (binormal) because the spine runs along +X. */
    var TORSO = [
      [-1.38, 2.60, 1.86, 0.055],
      [-1.28, 2.74, 1.64, 0.250],
      [-1.05, 2.88, 1.56, 0.335],
      [-0.70, 3.00, 1.51, 0.375],
      [-0.25, 3.08, 1.49, 0.385],
      [0.25, 3.11, 1.47, 0.380],
      [0.70, 3.12, 1.43, 0.352],
      [1.00, 3.05, 1.40, 0.300],
      [1.25, 2.90, 1.45, 0.215],
      [1.44, 2.76, 1.62, 0.120]
    ];

  /* Neck loft stations (neck-local): [x, y, halfDepth, halfWidth] */
  var NECK = [
    [0.00, 0.00, 0.255, 0.280],
    [0.02, 0.20, 0.240, 0.265],
    [0.05, 0.45, 0.215, 0.240],
    [0.09, 0.75, 0.185, 0.205],
    [0.14, 1.05, 0.152, 0.168],
    [0.19, 1.35, 0.120, 0.132],
    [0.235, 1.62, 0.095, 0.104],
    [0.265, 1.84, 0.075, 0.082],
    [0.278, 2.05, 0.062, 0.068]
  ];

  /* Head loft stations (head-local): [x, cy, halfDepth, halfWidth] */
  var HEAD = [
    [-0.085, 0.000, 0.120, 0.092],
    [0.000, 0.004, 0.126, 0.097],
    [0.095, 0.004, 0.124, 0.096],
    [0.195, -0.004, 0.118, 0.092],
    [0.295, -0.020, 0.108, 0.084],
    [0.390, -0.042, 0.094, 0.073],
    [0.470, -0.066, 0.077, 0.059],
    [0.535, -0.086, 0.058, 0.045],
    [0.575, -0.098, 0.041, 0.032],
    [0.595, -0.104, 0.028, 0.022]
  ];

  /* ================================================================
   * MATH
   * ================================================================ */

  var _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  var _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  var DOWN = new THREE.Vector3(0, -1, 0);
  var UP = new THREE.Vector3(0, 1, 0);

  /**
   * Classic two-bone IK. Returns the middle joint position.
   * bendDir: world-space direction the joint should bulge toward.
   */
  function twoBoneIK(R, T, b, c, bendDir, out) {
    var d = _v1.subVectors(T, R);
    var len = d.length();
    var minD = Math.abs(b - c) + 1e-5;
    var maxD = (b + c) * 0.9995;
    var clamped = false;
    if (len < minD) { len = minD; clamped = true; }
    if (len > maxD) { len = maxD; clamped = true; }
    if (len < 1e-9) len = 1e-9;
    var u = d.divideScalar(d.length() || 1); // reuse: direction R->T (unclamped dir is fine)

    // perpendicular component of bendDir relative to u
    var dot = bendDir.dot(u);
    _v2.copy(bendDir).addScaledVector(u, -dot);
    if (_v2.lengthSq() < 1e-10) {
      _v2.set(-u.y, u.x, 0);
      if (_v2.lengthSq() < 1e-10) _v2.set(0, 0, 1);
    }
    _v2.normalize();

    var x = (b * b - c * c + len * len) / (2 * len);
    var h2 = b * b - x * x;
    var h = h2 > 0 ? Math.sqrt(h2) : 0;

    out.copy(R).addScaledVector(u, x).addScaledVector(_v2, h);
    return { clamped: clamped, dist: len };
  }

  /**
   * Three-bone leg solve.
   * Returns { j1, j2, f, clamped } all in world space.
   *   j1 = elbow / stifle
   *   j2 = knee (carpus) / hock
   *   f  = fetlock
   */
  function solveLeg(R, target, def, fwd, back) {
    var a = def.bones[0], b = def.bones[1], c = def.bones[2];
    var out = { j1: new THREE.Vector3(), j2: new THREE.Vector3(), f: new THREE.Vector3(), clamped: false };

    // 1. Aim the upper bone at the target, tilted by def.aim toward fwd/back.
    _v1.subVectors(target, R);
    var dist = _v1.length() || 1e-6;
    _v1.divideScalar(dist);
    var tilt = def.aim;
    var ca = Math.cos(tilt), sa = Math.sin(tilt);
    _v3.copy(_v1).multiplyScalar(ca).addScaledVector(tilt > 0 ? fwd : back, sa);
    if (_v3.lengthSq() < 1e-10) _v3.copy(_v1);
    _v3.normalize();
    out.j1.copy(R).addScaledVector(_v3, a);

    // 2. Two-bone IK from the elbow to the fetlock, bulging backward.
    var r = twoBoneIK(out.j1, target, b, c, back, out.j2);
    out.clamped = r.clamped;
    out.f.copy(target);
    return out;
  }

  /** Orient an Object3D whose local -Y is the bone axis. */
  function aimBone(obj, from, to) {
    _v1.subVectors(to, from);
    if (_v1.lengthSq() < 1e-12) { obj.quaternion.identity(); return; }
    _v1.normalize();
    _q1.setFromUnitVectors(DOWN, _v1);
    obj.quaternion.copy(_q1);
  }

  /* ================================================================
   * MATERIALS
   * ================================================================ */

  function makeMaterials(tex) {
    var m = {};
    var coatMap = tex ? tex.coat : null;
    var legMap = tex ? tex.leg : null;
    var furMap = tex ? tex.fur : null;

    function coat(map, color, rough) {
      var p = {
        color: color === undefined ? 0xffffff : color,
        roughness: rough === undefined ? 0.92 : rough,
        metalness: 0.0,
        envMapIntensity: 0.55
      };
      if (map) { p.map = map; }
      if (furMap) { p.bumpMap = furMap; p.bumpScale = 0.012; }
      return new THREE.MeshStandardMaterial(p);
    }

    m.body = coat(coatMap, 0xffffff, 0.93);
    m.legUpper = coat(coatMap, 0xf2e2c6, 0.93);
    m.legLower = coat(legMap, 0xffffff, 0.90);
    m.mane = new THREE.MeshStandardMaterial({
      color: 0x3a2416, roughness: 0.95, metalness: 0, envMapIntensity: 0.4
    });
    m.hoof = new THREE.MeshStandardMaterial({
      map: tex ? tex.hoof : null, color: 0xffffff, roughness: 0.42,
      metalness: 0.0, envMapIntensity: 0.7
    });
    m.muzzle = new THREE.MeshStandardMaterial({
      map: tex ? tex.muzzle : null, color: 0xffffff, roughness: 0.44,
      metalness: 0.0, envMapIntensity: 0.8
    });
    m.eye = new THREE.MeshStandardMaterial({
      map: tex ? tex.eye : null, color: 0xffffff, roughness: 0.12,
      metalness: 0.0, envMapIntensity: 1.4
    });
    m.ossicone = new THREE.MeshStandardMaterial({
      color: 0x4a3524, roughness: 0.8, metalness: 0, envMapIntensity: 0.5
    });
    m.tuft = new THREE.MeshStandardMaterial({
      color: 0x1c1410, roughness: 0.95, metalness: 0, envMapIntensity: 0.3
    });
    m.ear = coat(coatMap, 0xe6d2ac, 0.9);
    return m;
  }

  /* ================================================================
   * BUILD
   * ================================================================ */

  function build(tex, opts) {
    opts = opts || {};
    var M = makeMaterials(tex);
    var root = new THREE.Group();
    root.name = 'giraffe';

    var body = new THREE.Group();
    body.name = 'body';
    root.add(body);

    var geos = [];

    /* ---------------- torso ---------------- */
    var tPts = [], tRad = [];
    for (var i = 0; i < TORSO.length; i++) {
      var s = TORSO[i];
      tPts.push([s[0], (s[1] + s[2]) * 0.5, 0]);
      // rx = lateral half-width, rz = vertical half-height
      tRad.push([s[3], (s[1] - s[2]) * 0.5]);
    }
    var torso = GX.loft({
      points: tPts, radius: tRad, samples: 56, radial: 30,
      taperStart: 0.55, taperEnd: 0.55
    });
    geos.push(torso.geometry);
    var torsoMesh = new THREE.Mesh(torso.geometry, M.body);
    torsoMesh.castShadow = true; torsoMesh.receiveShadow = true;
    torsoMesh.name = 'torso';
    body.add(torsoMesh);

    /* shoulder + haunch muscular masses */
    function massBlob(cx, cy, cz, rx, ry, rz, mat) {
      var g = new THREE.SphereGeometry(1, 22, 16);
      g.scale(rx, ry, rz);
      geos.push(g);
      var mesh = new THREE.Mesh(g, mat);
      mesh.position.set(cx, cy, cz);
      mesh.castShadow = true; mesh.receiveShadow = true;
      body.add(mesh);
      return mesh;
    }
    massBlob(0.86, 1.86, 0.34, 0.34, 0.44, 0.24, M.body);
    massBlob(0.86, 1.86, -0.34, 0.34, 0.44, 0.24, M.body);
    massBlob(-0.90, 1.80, 0.38, 0.38, 0.42, 0.26, M.body);
    massBlob(-0.90, 1.80, -0.38, 0.38, 0.42, 0.26, M.body);
    massBlob(-0.55, 2.00, 0, 0.34, 0.30, 0.30, M.body);

    /* ---------------- neck ---------------- */
    var neckGroup = new THREE.Group();
    neckGroup.name = 'neck';
    neckGroup.position.set(SKEL.neckBase.x, SKEL.neckBase.y, 0);
    // negative Z rotation tips the neck FORWARD (local +Y -> +X)
    neckGroup.rotation.z = -SKEL.neckAngle;
    body.add(neckGroup);

    var nPts = [], nRad = [];
    for (var n = 0; n < NECK.length; n++) {
      nPts.push([NECK[n][0], NECK[n][1], 0]);
      nRad.push([NECK[n][3], NECK[n][2]]);
    }
    var neck = GX.loft({ points: nPts, radius: nRad, samples: 44, radial: 26, taperStart: 0.9, taperEnd: 0.9 });
    geos.push(neck.geometry);
    var neckMesh = new THREE.Mesh(neck.geometry, M.body);
    neckMesh.castShadow = true; neckMesh.receiveShadow = true;
    neckGroup.add(neckMesh);

    /* mane: a ridge of dark hair along the dorsal (upper) neck */
    var manePts = [];
    for (var mi = 0; mi < neck.frames.length; mi += 2) {
      var fr = neck.frames[mi];
      var tan = fr.tan;
      _v1.copy(UP).addScaledVector(tan, -UP.dot(tan)).normalize();
      var r = neck.radii[mi] ? neck.radii[mi][1] : 0.1;
      manePts.push(new THREE.Vector3(
        fr.p.x + _v1.x * r, fr.p.y + _v1.y * r, fr.p.z + _v1.z * r));
    }
    var maneGeo = GX.ridge(manePts, 0.17, 0.035, 0.5, 9);
    geos.push(maneGeo);
    var maneMesh = new THREE.Mesh(maneGeo, M.mane);
    maneMesh.castShadow = true;
    maneMesh.name = 'mane';
    neckGroup.add(maneMesh);

    /* ---------------- head ---------------- */
    var headPivot = new THREE.Group();
    headPivot.name = 'headPivot';
    headPivot.position.set(0, SKEL.neckLen, 0);
    headPivot.rotation.z = SKEL.headPitch;
    neckGroup.add(headPivot);

    var headGroup = new THREE.Group();
    headGroup.name = 'head';
    // seat the occiput inside the top of the neck so there is no gap
    headGroup.position.set(0.30, 0.055, 0);
    headPivot.add(headGroup);

    var hPts = [], hRad = [];
    for (var h = 0; h < HEAD.length; h++) {
      hPts.push([HEAD[h][0], HEAD[h][1], 0]);
      hRad.push([HEAD[h][3], HEAD[h][2]]);
    }
    var head = GX.loft({ points: hPts, radius: hRad, samples: 30, radial: 24, taperStart: 0.8, taperEnd: 0.5 });
    geos.push(head.geometry);
    var headMesh = new THREE.Mesh(head.geometry, M.body);
    headMesh.castShadow = true; headMesh.receiveShadow = true;
    headGroup.add(headMesh);

    /* muzzle: darker hairless skin over the front third of the head */
    var mzPts = [], mzRad = [];
    var mzFrom = 0.34, mzTo = 0.62;
    for (var q = 0; q < 9; q++) {
      var t = q / 8;
      var mx = lerp(mzFrom, mzTo, t);
      // interpolate the head profile
      var prof = sampleProfile(HEAD, mx);
      mzPts.push([mx, prof.cy, 0]);
      mzRad.push([prof.w * 1.045, prof.d * 1.045]);
    }
    var muzzle = GX.loft({ points: mzPts, radius: mzRad, samples: 16, radial: 22, taperStart: 0.75, taperEnd: 0.4 });
    geos.push(muzzle.geometry);
    var muzzleMesh = new THREE.Mesh(muzzle.geometry, M.muzzle);
    muzzleMesh.castShadow = true;
    headGroup.add(muzzleMesh);

    /* nostrils */
    for (var side = -1; side <= 1; side += 2) {
      var ng = new THREE.SphereGeometry(0.016, 10, 8);
      ng.scale(1, 1.25, 0.55);
      geos.push(ng);
      var nostril = new THREE.Mesh(ng, M.tuft);
      var nprof = sampleProfile(HEAD, 0.545);
      nostril.position.set(0.552, nprof.cy + 0.026, side * nprof.w * 0.52);
      nostril.rotation.y = side * 0.5;
      headGroup.add(nostril);
    }

    /* eyes */
    var eyes = [];
    for (var es = -1; es <= 1; es += 2) {
      var eg = new THREE.SphereGeometry(0.043, 20, 16);
      eg.scale(0.82, 1.0, 1.0);
      geos.push(eg);
      var eye = new THREE.Mesh(eg, M.eye);
      var eprof = sampleProfile(HEAD, 0.20);
      eye.position.set(0.205, eprof.cy + 0.030, es * eprof.w * 0.99);
      eye.rotation.y = es * 0.35;
      headGroup.add(eye);
      eyes.push(eye);

      // eyelid: a slightly larger dark shell behind the globe
      var lg = new THREE.SphereGeometry(0.047, 16, 12);
      lg.scale(0.85, 1.02, 1.0);
      geos.push(lg);
      var lid = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({
        color: 0x4a3320, roughness: 0.9, metalness: 0, envMapIntensity: 0.4
      }));
      lid.position.copy(eye.position);
      lid.position.x -= 0.004;
      lid.rotation.y = es * 0.35;
      lid.scale.z = 0.55;
      headGroup.add(lid);
    }

    /* ears */
    var ears = [];
    for (var ea = -1; ea <= 1; ea += 2) {
      var earPivot = new THREE.Group();
      earPivot.position.set(0.075, 0.118, ea * 0.088);
      earPivot.rotation.y = ea * 0.55;
      earPivot.rotation.z = -0.25;
      headGroup.add(earPivot);

      var ePts = [
        [0, 0], [0.028, 0.055], [0.05, 0.115], [0.058, 0.175], [0.05, 0.215]
      ];
      // swept along +Y, so rx is LATERAL (thickness) and rz is fore/aft:
      // the ear ends up a flat flap whose broad faces point sideways.
      var eRad = [
        [0.014, 0.030], [0.013, 0.040], [0.011, 0.046], [0.008, 0.040], [0.005, 0.026]
      ];
      var ear = GX.loft({
        points: ePts.map(function (p) { return [p[0], p[1], 0]; }),
        radius: eRad, samples: 12, radial: 14, taperStart: 0.8, taperEnd: 0.35
      });
      geos.push(ear.geometry);
      var earMesh = new THREE.Mesh(ear.geometry, M.ear);
      earMesh.castShadow = true;
      earPivot.add(earMesh);

      // inner ear (pinker, slightly inset)
      var iPts = ePts.map(function (p) { return [p[0] * 0.98, p[1] * 0.96, 0]; });
      var iRad = eRad.map(function (r) { return [r[0] * 0.72, r[1] * 0.62]; });
      var inner = GX.loft({
        points: iPts, radius: iRad, samples: 12, radial: 12, taperStart: 0.8, taperEnd: 0.35
      });
      geos.push(inner.geometry);
      var innerMesh = new THREE.Mesh(inner.geometry, new THREE.MeshStandardMaterial({
        color: 0x8a5f47, roughness: 0.85, metalness: 0, envMapIntensity: 0.5
      }));
      innerMesh.position.x = -0.006;
      earPivot.add(innerMesh);

      ears.push(earPivot);
    }

    /* ossicones */
    var ossicones = [];
    for (var os = -1; os <= 1; os += 2) {
      var og = new THREE.Group();
      og.position.set(0.055, 0.128, os * 0.058);
      og.rotation.z = 0.16;
      og.rotation.y = os * 0.12;
      headGroup.add(og);

      var horn = GX.ossicone(0.155, 0.026, 0.010, 0);
      geos.push(horn);
      var hornMesh = new THREE.Mesh(horn, M.ossicone);
      hornMesh.castShadow = true;
      og.add(hornMesh);

      // black hair tuft on the tip
      var tg = new THREE.SphereGeometry(0.030, 10, 8);
      tg.scale(1, 1.35, 1);
      geos.push(tg);
      var tuft = new THREE.Mesh(tg, M.tuft);
      tuft.position.y = 0.150;
      og.add(tuft);
      ossicones.push(og);
    }

    /* ---------------- tail ---------------- */
    var tailBase = new THREE.Group();
    tailBase.name = 'tailBase';
    tailBase.position.set(-1.34, 2.28, 0);
    tailBase.rotation.z = -0.35;
    body.add(tailBase);

    var tailSegs = [];
    var parent = tailBase;
    var segLen = 0.085;
    for (var ts = 0; ts < 11; ts++) {
      var seg = new THREE.Group();
      seg.position.y = ts === 0 ? 0 : -segLen;
      parent.add(seg);
      var rTop = 0.030 * (1 - ts / 13);
      var rBot = 0.028 * (1 - (ts + 1) / 13);
      var sg = GX.lathe([[rTop, 0], [rBot, -segLen * 0.98]], 10);
      geos.push(sg);
      var sm = new THREE.Mesh(sg, M.legUpper);
      sm.castShadow = true;
      seg.add(sm);
      tailSegs.push(seg);
      parent = seg;
    }
    // terminal tuft
    var ttg = new THREE.SphereGeometry(0.055, 12, 10);
    ttg.scale(0.75, 1.9, 0.75);
    geos.push(ttg);
    var tailTuft = new THREE.Mesh(ttg, M.tuft);
    tailTuft.position.y = -0.055;
    parent.add(tailTuft);

    /* ---------------- legs ---------------- */
    function buildLeg(kind, side) {
      var def = LEG[kind];
      var rootPos = kind === 'front' ? SKEL.shoulder : SKEL.hip;
      var legRoot = new THREE.Group();
      legRoot.name = kind + (side > 0 ? 'R' : 'L');
      legRoot.position.set(rootPos.x, rootPos.y, side * def.z);
      body.add(legRoot);

      var joints = [legRoot];
      var bones = [];
      var radii = def.radii;
      for (var bi = 0; bi < 3; bi++) {
        var j = new THREE.Group();
        if (bi === 0) { j.position.set(0, -def.bones[0], 0); legRoot.add(j); }
        else { j.position.set(0, -def.bones[bi], 0); joints[bi].add(j); }
        joints.push(j);

        var rT = radii[bi], rB = radii[bi + 1];
        var prof = [];
        var ST = 9;
        for (var k = 0; k <= ST; k++) {
          var tt = k / ST;
          // slight bulge in the middle of the upper bones (muscle)
          var bulge = 1 + 0.16 * Math.sin(Math.PI * tt) * (bi === 0 ? 1 : 0.35);
          var rr = lerp(rT, rB, tt) * bulge;
          prof.push([rr, -def.bones[bi] * tt]);
        }
        var bg = GX.lathe(prof, 16);
        geos.push(bg);
        var bm = new THREE.Mesh(bg, bi < 2 ? M.legUpper : M.legLower);
        bm.castShadow = true; bm.receiveShadow = true;
        joints[bi].add(bm);
        bones.push(bm);
      }

      // fetlock joint sits at the end of the cannon
      var fetlock = joints[3];

      // pastern pivot (animated angle)
      var pasternPivot = new THREE.Group();
      fetlock.add(pasternPivot);
      var pprof = [];
      for (var pp = 0; pp <= 6; pp++) {
        var pt = pp / 6;
        pprof.push([lerp(0.048, 0.036, pt), -SKEL.pastern * pt]);
      }
      var pg = GX.lathe(pprof, 12);
      geos.push(pg);
      var pasternMesh = new THREE.Mesh(pg, M.legLower);
      pasternMesh.castShadow = true;
      pasternPivot.add(pasternMesh);

      var ankle = new THREE.Group();
      ankle.position.y = -SKEL.pastern;
      pasternPivot.add(ankle);

      // hoof: sole flat, toe toward +X. Normalised so the lowest point
      // sits exactly SKEL.hoofH below the coronet.
      var hoofPts = [
        [-0.034, 0.000, 0.040, 0.046],
        [-0.010, -0.026, 0.050, 0.055],
        [0.020, -0.056, 0.054, 0.057],
        [0.052, -0.086, 0.052, 0.054],
        [0.080, -0.104, 0.046, 0.048],
        [0.104, -0.112, 0.034, 0.036],
        [0.116, -0.114, 0.016, 0.018]
      ];
      var hPts2 = [], hRad2 = [];
      for (var hp = 0; hp < hoofPts.length; hp++) {
        hPts2.push([hoofPts[hp][0], hoofPts[hp][1], 0]);
        hRad2.push([hoofPts[hp][3], hoofPts[hp][2]]);
      }
      var hoofL = GX.loft({ points: hPts2, radius: hRad2, samples: 14, radial: 16, taperStart: 0.85, taperEnd: 0.6 });
      hoofL.geometry.computeBoundingBox();
      var hb = hoofL.geometry.boundingBox;
      hoofL.geometry.translate(0, -SKEL.hoofH - hb.min.y, 0);
      hoofL.geometry.computeBoundingBox();
      geos.push(hoofL.geometry);
      var hoofMesh = new THREE.Mesh(hoofL.geometry, M.hoof);
      hoofMesh.castShadow = true;
      ankle.add(hoofMesh);

      return {
        kind: kind, side: side, def: def, root: legRoot,
        joints: joints, fetlock: fetlock,
        pasternPivot: pasternPivot, ankle: ankle, hoof: hoofMesh
      };
    }

    var legs = [
      buildLeg('front', 1), buildLeg('front', -1),
      buildLeg('hind', 1), buildLeg('hind', -1)
    ];

    /* ---------------- shared scratch ---------------- */
    var world = {
      fwd: new THREE.Vector3(1, 0, 0),
      back: new THREE.Vector3(-1, 0, 0),
      up: new THREE.Vector3(0, 1, 0)
    };

    root.updateMatrixWorld(true);

    return {
      root: root, body: body, neck: neckGroup, headPivot: headPivot,
      head: headGroup, eyes: eyes, ears: ears, ossicones: ossicones,
      tail: { base: tailBase, segs: tailSegs }, legs: legs, materials: M,
      skel: SKEL, geometries: geos, world: world
    };
  }

  /** Linear interpolation of the head/torso profile at a given x. */
  function sampleProfile(table, x) {
    var n = table.length;
    if (x <= table[0][0]) return { cy: table[0][1], w: table[0][3], d: table[0][2] };
    if (x >= table[n - 1][0]) return { cy: table[n - 1][1], w: table[n - 1][3], d: table[n - 1][2] };
    for (var i = 0; i < n - 1; i++) {
      if (x >= table[i][0] && x <= table[i + 1][0]) {
        var t = (x - table[i][0]) / (table[i + 1][0] - table[i][0]);
        return {
          cy: lerp(table[i][1], table[i + 1][1], t),
          w: lerp(table[i][3], table[i + 1][3], t),
          d: lerp(table[i][2], table[i + 1][2], t)
        };
      }
    }
    return { cy: 0, w: 0, d: 0 };
  }

  /* ================================================================
   * GAIT CONTROLLER -- a true lateral "pace": the two legs on the
   * same side of the body swing together, the hind foot leading the
   * fore by a fraction of a cycle.
   *
   * All leg maths happens in the BODY's local frame. Because the leg
   * chain is planar, every joint is a pure rotation about local Z and
   * the child angles are expressed relative to their parent, so the
   * rotations never compound.
   * ================================================================ */

  var TAU = Math.PI * 2;
  var LEG_PHASE = { 'frontR': 0.000, 'hindR': 0.035, 'frontL': 0.500, 'hindL': 0.535 };
  var LOCAL_FWD = new THREE.Vector3(1, 0, 0);
  var LOCAL_BACK = new THREE.Vector3(-1, 0, 0);

  function controller(g, opts) {
    opts = opts || {};
    var S = {
      phase: 0,
      time: 0,
      distance: 0,
      speed: opts.speed === undefined ? 1.0 : opts.speed,
      targetSpeed: opts.speed === undefined ? 1.0 : opts.speed,
      stride: 1.35, cadence: 0.74, duty: 0.70, lift: 0.24,
      paused: false,
      lookX: 0, lookY: 0, lookTargetX: 0, lookTargetY: 0,
      bob: 0, roll: 0, yaw: 0, pitch: 0,
      footContacts: [],
      coronetY: SKEL.hoofH
    };
    var gfx = {
      R: new THREE.Vector3(), F: new THREE.Vector3(),
      j1: new THREE.Vector3(), j2: new THREE.Vector3(),
      ankleW: new THREE.Vector3(), ankleL: new THREE.Vector3(),
      bodyPos: new THREE.Vector3(), bodyQuat: new THREE.Quaternion(),
      invQ: new THREE.Quaternion(), scale: new THREE.Vector3(),
      m4: new THREE.Matrix4(), dir: new THREE.Vector3()
    };

    /* Map each leg to its phase offset + a stable key. */
    for (var i = 0; i < g.legs.length; i++) {
      var L = g.legs[i];
      L.key = L.kind + (L.side > 0 ? 'R' : 'L');
      L.phaseOffset = LEG_PHASE[L.key];
      L.hoofDrop = SKEL.hoofH;
      L.footWorld = new THREE.Vector3();
      L.lastTp = 0;
      L.relX = 0; L.lift = 0; L.stance = true; L.sp = 0; L.tp = 0;
      L.footX = undefined; L.liftoffRelX = 0;
    }

    /* ---------------- gait parameters from speed ---------------- */
    function gaitParams(v) {
      var s = clamp(v / 2.0, 0, 1);
      var cadence = clamp(0.42 + 0.66 * Math.pow(v, 0.62), 0.42, 1.25);
      var stride = v / cadence;
      var duty = 0.70 - 0.10 * s;
      var lift = clamp(0.10 + 0.11 * v, 0.12, 0.30);
      return { cadence: cadence, stride: stride, duty: duty, lift: lift };
    }

    /* ---------------- per-foot trajectory ----------------
     * The giraffe itself stays at the origin and the world scrolls, so a
     * planted foot must travel backwards at exactly the ground speed.
     * The foot's world X is therefore held as state rather than derived
     * from the phase, which keeps the contact perfectly slide-free even
     * while the speed is changing.
     */
    function footTrajectory(leg, hipX, dt) {
      var tp = (S.phase - leg.phaseOffset + 1) % 1;
      var wrapped = tp < leg.lastTp;
      leg.lastTp = tp;
      leg.tp = tp;
      leg.wrapped = wrapped;
      var duty = S.duty, stride = S.stride;

      if (tp < duty) {
        if (!leg.stance || wrapped || leg.footX === undefined) {
          // touchdown: place the foot half a step ahead of the hip
          leg.footX = hipX + stride * duty * 0.5;
          leg.stance = true;
        } else {
          leg.footX -= S.speed * dt;
        }
        leg.relX = leg.footX - hipX;
        leg.lift = 0;
        leg.sp = tp / duty;
      } else {
        if (leg.stance) {
          leg.liftoffRelX = leg.relX;
          leg.stance = false;
        }
        var p = (tp - duty) / (1 - duty);
        var e = p * p * (3 - 2 * p);
        leg.relX = lerp(leg.liftoffRelX, stride * duty * 0.5, e);
        leg.lift = S.lift * Math.pow(Math.sin(Math.PI * p), 0.78);
        leg.sp = p;
      }
    }

    /* ---------------- main update ---------------- */
    function update(dt) {
      dt = Math.min(dt, 0.05);
      S.time += dt;

      // ease the speed so stride changes never pop
      S.speed += (S.targetSpeed - S.speed) * Math.min(1, dt * 2.2);
      if (Math.abs(S.targetSpeed - S.speed) < 1e-4) S.speed = S.targetSpeed;

      var gp = gaitParams(S.speed);
      S.cadence += (gp.cadence - S.cadence) * Math.min(1, dt * 2.2);
      S.stride = S.speed / S.cadence;
      S.duty += (gp.duty - S.duty) * Math.min(1, dt * 2.2);
      S.lift += (gp.lift - S.lift) * Math.min(1, dt * 2.2);

      if (!S.paused && S.speed > 1e-4) {
        S.phase = (S.phase + dt * S.cadence) % 1;
        S.distance += S.speed * dt;
      }

      var w = TAU * S.phase;

      /* ---- body motion: bob, roll, yaw, pitch ---- */
      var bob = -0.022 * Math.cos(2 * (w - 0.35 * TAU));
      var roll = 0.030 * Math.cos(w - 0.35 * TAU);
      var yaw = 0.020 * Math.sin(w + 0.6);
      var pitch = 0.013 * Math.sin(2 * w + 0.4);
      S.bob = bob; S.roll = roll; S.yaw = yaw; S.pitch = pitch;

      g.root.position.set(0, bob, 0);
      g.root.rotation.set(-roll, yaw, pitch);

      /* ---- neck ---- */
      var sway = 0.038 * Math.sin(w + 0.9);
      var nod = 0.020 * Math.sin(2 * w - 0.3);
      g.neck.rotation.z = -g.skel.neckAngle + sway + nod;
      g.neck.rotation.x = -roll * 0.7;

      var lookBlend = 1;
      S.lookX += (S.lookTargetX - S.lookX) * Math.min(1, dt * 3.0);
      S.lookY += (S.lookTargetY - S.lookY) * Math.min(1, dt * 3.0);
      var headBob = 0.030 * Math.sin(w + 0.45);
      g.headPivot.rotation.z = g.skel.headPitch + headBob - S.lookY * 0.30;
      g.headPivot.rotation.y = S.lookX * 0.55;
      g.headPivot.rotation.x = -roll * 0.35;
      lookBlend = 0;

      // ears twitch intermittently
      for (var e = 0; e < g.ears.length; e++) {
        var tw = Math.sin(S.time * 2.1 + e * 2.3) * Math.sin(S.time * 0.63 + e);
        g.ears[e].rotation.z = -0.25 + 0.20 * tw;
        g.ears[e].rotation.x = 0.10 * Math.sin(S.time * 1.4 + e * 1.7);
      }

      /* ---- tail: travelling wave ---- */
      g.tail.base.rotation.z = -0.35 + 0.10 * Math.sin(w + 1.2) + 0.05 * Math.sin(2 * w);
      g.tail.base.rotation.x = 0.14 * Math.sin(w - 0.5);
      for (var t = 0; t < g.tail.segs.length; t++) {
        var f = t / (g.tail.segs.length - 1);
        g.tail.segs[t].rotation.x =
          (0.10 + 0.34 * f) * Math.sin(w + 1.1 - f * 1.9) +
          0.05 * Math.sin(2 * w - f * 1.2);
      }

      g.root.updateMatrixWorld(true);

      /* ---- body local frame ---- */
      gfx.m4.copy(g.body.matrixWorld);
      gfx.m4.decompose(gfx.bodyPos, gfx.bodyQuat, gfx.scale);
      gfx.invQ.copy(gfx.bodyQuat).invert();

      /* ---- legs (solved in the body's local frame) ---- */
      S.footContacts.length = 0;
      for (var i = 0; i < g.legs.length; i++) {
        var leg = g.legs[i];
        leg.root.getWorldPosition(gfx.R);
        footTrajectory(leg, gfx.R.x, dt);

        // coronet target in WORLD space (feet stay on the ground plane)
        gfx.ankleW.set(gfx.R.x + leg.relX, S.coronetY + leg.lift, gfx.R.z);
        // ...then into the body's local frame
        gfx.ankleL.copy(gfx.ankleW).sub(gfx.bodyPos).applyQuaternion(gfx.invQ);

        // pastern angle: the fetlock drops under load through mid-stance
        var pa = leg.stance
          ? g.skel.pasternAngle + 0.20 * Math.sin(Math.PI * leg.sp)
          : g.skel.pasternAngle - 0.09 * Math.sin(Math.PI * leg.sp);

        // fetlock target = coronet - pastern * dir
        gfx.F.set(
          gfx.ankleL.x - g.skel.pastern * Math.sin(pa),
          gfx.ankleL.y + g.skel.pastern * Math.cos(pa),
          gfx.ankleL.z
        );

        var sol = solveLeg(leg.root.position, gfx.F, leg.def, LOCAL_FWD, LOCAL_BACK);
        leg.clamped = sol.clamped;

        /* Each bone aims at the next joint; child angles are relative. */
        var th0 = Math.atan2(sol.j1.x - leg.root.position.x,
          -(sol.j1.y - leg.root.position.y));
        var th1 = Math.atan2(sol.j2.x - sol.j1.x, -(sol.j2.y - sol.j1.y));
        var th2 = Math.atan2(gfx.F.x - sol.j2.x, -(gfx.F.y - sol.j2.y));

        leg.root.rotation.set(0, 0, th0);
        leg.joints[1].rotation.set(0, 0, th1 - th0);
        leg.joints[2].rotation.set(0, 0, th2 - th1);
        leg.pasternPivot.rotation.set(0, 0, pa - th2);

        // keep the sole level with the ground, toe lifting through the swing
        var toe = leg.stance ? 0.10 : 0.10 + 0.48 * Math.sin(Math.PI * leg.sp);
        leg.hoof.rotation.set(0, 0, -pa + toe);

        leg.footWorld.set(gfx.ankleW.x, leg.lift, gfx.R.z);
        leg.lean = { upper: th0, mid: th1 - th0, cannon: th2 - th1, pastern: pa };

        // footfall detection (phase wrapped)
        if (leg.wrapped) {
          S.footContacts.push({ leg: leg, x: gfx.ankleW.x, z: gfx.R.z, y: 0 });
        }
        leg.lastTp = leg.tp;
      }

      /* ---- eyes: subtle independent dart ---- */
      for (var ei = 0; ei < g.eyes.length; ei++) {
        g.eyes[ei].rotation.y = S.lookX * 0.22 + Math.sin(S.time * 0.9 + ei) * 0.05;
      }

      return S;
    }

    update(0);
    return { S: S, update: update, gaitParams: gaitParams };
  }

  return {
    build: build, controller: controller, solveLeg: solveLeg,
    twoBoneIK: twoBoneIK, aimBone: aimBone,
    SKEL: SKEL, LEG: LEG, TORSO: TORSO, NECK: NECK, HEAD: HEAD,
    sampleProfile: sampleProfile
  };
});
