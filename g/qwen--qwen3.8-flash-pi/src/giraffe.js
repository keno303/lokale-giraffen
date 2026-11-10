/* giraffe-world / giraffe.js — the animal: anatomy, lofted parts, joint rig.
   Units are metres, the actor faces +X, Y is up.  Every animated joint is a
   plain Object3D so the gait solver in gait.js can drive it with vectors.  */
(function (root) {
  'use strict';
  var GW = root.GW, M = GW.math, THREE = root.THREE;
  var geo = GW.geo, T = GW.Textures;

  /* ==================================================== anatomy (metres) ==
     Adult reticulated giraffe, ~5.3 m to the ossicones, ~3.0 m at the shoulder */
  var SPEC = GW.Giraffe = GW.Giraffe || {};
  SPEC.dims = {
    withersY: 3.02,
    hipY: 2.88,
    fore: { x: 1.00, y: 2.84, z: 0.30, A: 1.95, B: 0.70, foot: 0.34 },
    hind: { x: -1.04, y: 2.86, z: 0.32, A: 1.30, B: 1.32, foot: 0.42 },
    neckRoot: [1.26, 2.98, 0],
    neckSegs: [
      { L: 0.86, r0: [0.315, 0.425], r1: [0.255, 0.315], bend: 0.055 },
      { L: 0.76, r0: [0.255, 0.315], r1: [0.19, 0.235], bend: 0.045 },
      { L: 0.62, r0: [0.19, 0.235], r1: [0.13, 0.158], bend: 0.03 }
    ],
    neckPitch: 24 * M.DEG,          /* lean forward off vertical            */
    neckBase: [25 * M.DEG, 2.6 * M.DEG, 1.4 * M.DEG],
    neckLap: 0.075,                 /* overlap that hides the sweep seams   */
    headDrop: 15 * M.DEG,          /* muzzle angles down off the neck axis  */
    tailRoot: [-1.44, 2.96, 0],
    tailSegs: [0.36, 0.30, 0.26]
  };
  var D = SPEC.dims;

  /* ------------------------------------------------------------ profiles - */
  function ridge(n, amt, at) {          /* at = +1 ridge on +y side, -1 below */
    var p = [];
    for (var i = 0; i < n; i++) {
      var a = i / n * M.TAU, x = Math.sin(a), y = Math.cos(a);
      var r = Math.pow(Math.max(0, y * at), 8) * amt;
      /* round the belly side a little, flatten the spine side slightly */
      var sq = 1 - 0.05 * Math.max(0, -y * at);
      p.push([x * 1.02, (y + r) * sq]);
    }
    return p;
  }
  function tube(n, k) {                  /* rounded square, k = squareness */
    return geo.Profiles.round(n, k == null ? 0.5 : k);
  }

  /* ------------------------------------------------------------ materials - */
  SPEC.makeMaterials = function (renderer) {
    var cache = {};
    function tex(canvas, tile, linear) {
      var t = new THREE.CanvasTexture(canvas);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      t.repeat.set(1 / tile, 1 / tile);      /* UVs are metres -> real scale */
      t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
      t.needsUpdate = true;
      return t;
    }
    function coat(kind, tile) {
      if (!cache[kind]) cache[kind] = T.coat[kind]();
      var c = cache[kind];
      return { map: tex(c.color, tile), bumpMap: tex(c.bump, tile, true) };
    }
    function std(o) { return new THREE.MeshStandardMaterial(o); }

    var bodyCoat = coat('body', 0.66);
    var mats = {
      body: std(Object.assign({ color: 0xffffff, roughness: 0.86, metalness: 0.0, bumpScale: 0.9 }, bodyCoat)),
      neck: std(Object.assign({ color: 0xffffff, roughness: 0.85, bumpScale: 0.8 }, coat('neck', 0.52))),
      leg: std(Object.assign({ color: 0xffffff, roughness: 0.82, bumpScale: 0.8 }, coat('leg', 0.30))),
      socks: std(Object.assign({ color: 0xffffff, roughness: 0.78, bumpScale: 0.6 }, coat('socks', 0.26))),
      face: std(Object.assign({ color: 0xffffff, roughness: 0.72, bumpScale: 0.7 }, coat('face', 0.26))),
      muzzle: std({ color: 0xeaded2, roughness: 0.55, map: tex(T.muzzle(), 0.18), bumpMap: tex(T.muzzle(), 0.18, true), bumpScale: 1.2 }),
      skin: std({ color: 0xbda28c, roughness: 0.8, map: tex(T.skin(), 0.3) }),
      hoof: std({ color: 0x4a4038, roughness: 0.38, metalness: 0.05, map: tex(T.hoof(), 0.22), bumpMap: tex(T.hoof(), 0.22, true), bumpScale: 1.0 }),
      hair: std({ color: 0x2f2419, roughness: 0.95, map: tex(T.hair(), 0.1) }),
      hairDark: std({ color: 0x1a1410, roughness: 0.95, side: THREE.DoubleSide, map: tex(T.hair(), 0.06) }),
      maneX: std({ color: 0x6a4526, roughness: 0.95, map: tex(T.hair(), 0.05) }),
      eye: std({ color: 0x120d0a, roughness: 0.12, metalness: 0.1 }),
      lid: std({ color: 0x8a6f5a, roughness: 0.7, side: THREE.DoubleSide }),
      innerEar: std({ color: 0x9c7f74, roughness: 0.75, side: THREE.DoubleSide, map: tex(T.skin(), 0.14) }),
      belly: std({ color: 0xece0cb, roughness: 0.86, map: tex(T.skin(), 0.5), bumpMap: tex(T.skin(), 0.5, true), bumpScale: 0.4 }),
      dark: std({ color: 0x40312a, roughness: 0.62 })
    };
    /* hide reads warm but never orange once lit */
    mats.body.color.setHex(0xf3ece0);
    mats.neck.color.setHex(0xf4eee3);
    mats.leg.color.setHex(0xf4eee4);
    mats.socks.color.setHex(0xfaf6ee);
    return mats;
  };

  /* ------------------------------------------------------------- helpers -- */
  function mesh(g, mat, parent, shadow) {
    var m = new THREE.Mesh(g, mat);
    m.castShadow = shadow !== false;
    m.receiveShadow = shadow !== false;
    if (parent) parent.add(m);
    return m;
  }
  function joint(parent, x, y, z) {
    var o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  }
  var UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), LAT = new THREE.Vector3(0, 0, 1);

  /* rotation that takes local -Y onto `dir`, keeping local +X fore-aft and
     local +Z on the body's lateral axis (so baked sagittal curves match on
     both sides without any mirroring).                                     */
  var _m3 = new THREE.Matrix4(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  function basisQuat(dir, latAxis, out) {
    var y = _v1.copy(dir).negate();                      /* local +Y          */
    var z = _v2.copy(latAxis).addScaledVector(dir, -latAxis.dot(dir));
    if (z.lengthSq() < 1e-9) z.set(0, 0, 1); else z.normalize();
    var x = _v3.crossVectors(y, z);
    if (x.lengthSq() < 1e-9) x.set(1, 0, 0); else x.normalize();
    _m3.makeBasis(x, y, z);
    return (out || new THREE.Quaternion()).setFromRotationMatrix(_m3);
  }
  SPEC.basisQuat = basisQuat;

  /* hair tuft helper */
  var _dirTmp = new THREE.Vector3(), _ss = new THREE.Vector3(1, 1, 1);

  /* =============================================================== build == */
  SPEC.build = function (mats) {
    var root3 = new THREE.Group();
    root3.name = 'giraffe';
    var body = joint(root3, 0, 0, 0);
    body.name = 'body';
    var rig = { root: root3, body: body, joints: [], legs: {}, parts: {} };

    /* ------------------------------------------------------------- torso -- */
    var spine = [
      [1.40, 2.72], [1.30, 2.98], [1.05, 3.07], [0.55, 3.00], [0.00, 2.93],
      [-0.58, 2.91], [-1.05, 2.94], [-1.38, 2.97], [-1.58, 2.86]
    ];
    var torsoR = [
      [0.31, 0.27], [0.36, 0.32], [0.42, 0.38], [0.44, 0.445], [0.42, 0.45],
      [0.37, 0.375], [0.375, 0.385], [0.33, 0.34], [0.17, 0.18]
    ];
    var torsoPath = spine.map(function (p) { return [p[0], p[1], 0]; });
    mesh(geo.loft({
      path: torsoPath, radii: torsoR, stations: 54, radial: 26, tile: 1,
      profile: function (n) { return ridge(n, 0.16, 1); }, up: [0, 1, 0], caps: 'both'
    }), mats.body, body);

    /* brisket / chest keel, blends the forelegs into the body */
    mesh(geo.loft({
      path: [[1.30, 2.86, 0], [1.16, 2.66, 0], [0.86, 2.58, 0]],
      radii: [[0.20, 0.16], [0.28, 0.24], [0.30, 0.22]], stations: 14, radial: 18,
      profile: function (n) { return ridge(n, 0.0, 1); }, tile: 1, up: [0, 1, 0], caps: 'both'
    }), mats.belly, body);

    /* shoulder blades and haunches: low ridges that stay inside the hide.
       Paths live in the sagittal plane; the lateral offset is carried by the
       section, which keeps the frames from twisting the plate out sideways. */
    [1, -1].forEach(function (sgn) {
      mesh(geo.loft({
        path: [[1.22, 3.00, 0], [0.92, 2.94, 0], [0.52, 2.90, 0]],
        radii: [[0.12, 0.10], [0.14, 0.09], [0.10, 0.07]], stations: 12, radial: 12,
        tile: 1, up: [0, 1, 0], caps: 'both'
      }), mats.body, body).position.z = 0.30 * sgn;
      mesh(geo.loft({
        path: [[-0.62, 2.94, 0], [-1.00, 2.88, 0], [-1.30, 2.74, 0]],
        radii: [[0.16, 0.14], [0.17, 0.15], [0.10, 0.10]], stations: 12, radial: 12,
        tile: 1, up: [0, 1, 0], caps: 'both'
      }), mats.body, body).position.z = 0.28 * sgn;
    });

    /* spine ridge crest (nuchal/supraspinous line) */
    mesh(geo.loft({
      path: [[1.22, 3.10, 0], [0.4, 3.06, 0], [-0.6, 3.02, 0], [-1.34, 3.04, 0], [-1.46, 2.92, 0]],
      radii: [[0.055, 0.06], [0.05, 0.055], [0.045, 0.05], [0.05, 0.055], [0.03, 0.035]],
      stations: 26, radial: 10, tile: 1, up: [0, 1, 0], caps: 'both'
    }), mats.neck, body);

    /* belly fold + flank definition */
    mesh(geo.loft({
      path: [[1.12, 2.56, 0], [0.4, 2.50, 0], [-0.5, 2.56, 0], [-1.02, 2.62, 0]],
      radii: [[0.32, 0.11], [0.35, 0.11], [0.30, 0.11], [0.21, 0.10]],
      stations: 18, radial: 14, tile: 1, up: [0, 1, 0], caps: 'both'
    }), mats.belly, body);

    /* shoulder yoke: blends the neck root into the chest so the sweep seam
       at the base of the neck is buried in a continuous surface           */
    mesh(geo.loft({
      path: [[0.92, 3.16, 0], [1.16, 3.06, 0], [1.34, 2.90, 0]],
      radii: [[0.30, 0.22], [0.33, 0.26], [0.30, 0.24]],
      stations: 14, radial: 18, tile: 1, up: [0, 1, 0], caps: 'both',
      profile: function (n) { return ridge(n, 0.08, 1); }
    }), mats.neck, body);

    /* -------------------------------------------------------------- neck -- */
    var neck = [];
    var np = D.neckPitch;
    var neckRoot = joint(body, D.neckRoot[0], D.neckRoot[1], D.neckRoot[2]);
    neckRoot.name = 'neck0';
    neckRoot.rotation.z = -np;                    /* lean forward           */
    rig.neck = [neckRoot];
    rig.joints.push(neckRoot);
    var parentObj = neckRoot;
    D.neckSegs.forEach(function (s, i) {
      var bend = s.bend;
      var lap = i === 0 ? 0 : D.neckLap;
      var g = geo.loft({
        path: [[0, -lap, 0], [bend * 0.5, s.L * 0.5 - lap * 0.4, 0], [0, s.L, 0]],
        radii: [[s.r0[0] * (lap ? 1.03 : 1), s.r0[1] * (lap ? 1.03 : 1)], s.r1],
        stations: 20, radial: 22, tile: 1,
        profile: function (n) { return ridge(n, 0.13, -1); },  /* nuchal crest at rear */
        up: [1, 0, 0], caps: (i === 0 ? 'start' : 'none')
      });
      mesh(g, mats.neck, parentObj);
      /* mane on the rear crest of this segment */
      var mane = geo.fillTufts(Math.round(s.L * 34), function (k, n, v, q, sc, rnd) {
        var t = (k + 0.5) / n;
        var yy = t * s.L;
        var back = -(s.r0[1] + (s.r1[1] - s.r0[1]) * t) * 0.95;
        v.set(back - 0.005, yy, (rnd() - 0.5) * 0.16);
        q.setFromUnitVectors(UP, _dirTmp.set(-0.55 + rnd() * 0.4, 0.75 + rnd() * 0.45, (rnd() - 0.5) * 0.5).normalize());
        var len = 0.04 - 0.011 * t + rnd() * 0.013;
        sc.set(1, len / 0.034, 1);
      }, geo.tuftGeo({ len: 0.034, rad: 0.006, n: 4, tip: true }), mats.mane, 3 + i);
      mane.castShadow = false;
      parentObj.add(mane);
      if (i < D.neckSegs.length - 1) {
        var j = joint(parentObj, 0, s.L, 0);
        j.name = 'neck' + (i + 1);
        rig.joints.push(j);
        rig.neck.push(j);
        parentObj = j;
      }
    });

    /* -------------------------------------------------------------- head -- */
    var head = joint(parentObj, 0, D.neckSegs[D.neckSegs.length - 1].L, 0);   /* poll joint */
    head.name = 'head';
    rig.head = head;
    rig.joints.push(head);
    /* rotate so +X of the head is forward: neck axis is local +Y, so we
       need the head geometry authored along the neck direction.            */
    /* skull: a giraffe head is ~0.6 m from poll to lips */
    var skull = mesh(geo.loft({
      path: [[-0.14, 0.05, 0], [0.05, 0.09, 0], [0.22, 0.06, 0], [0.34, 0.00, 0]],
      radii: [[0.098, 0.108], [0.126, 0.136], [0.108, 0.114], [0.088, 0.094]],
      stations: 20, radial: 20, tile: 1, up: [0, 1, 0], caps: 'start',
      profile: function (n) { return ridge(n, 0.10, 1); }
    }), mats.face, head);
    /* frontal ridge / forehead dome */
    mesh(geo.loft({
      path: [[-0.12, 0.12, 0], [0.02, 0.175, 0], [0.16, 0.14, 0]],
      radii: [[0.075, 0.048], [0.095, 0.052], [0.07, 0.042]],
      stations: 12, radial: 12, tile: 1, up: [0, 1, 0], caps: 'both'
    }), mats.face, head);
    /* muzzle: wedge that flares then rounds off at the nostrils */
    mesh(geo.loft({
      path: [[0.28, 0.005, 0], [0.38, -0.012, 0], [0.46, -0.032, 0], [0.505, -0.055, 0]],
      radii: [[0.090, 0.088], [0.092, 0.085], [0.089, 0.081], [0.072, 0.062]],
      stations: 18, radial: 18, tile: 1, up: [0, 1, 0], caps: 'both',
      profile: function (n) { return ridge(n, -0.02, 1); }
    }), mats.muzzle, head);
    /* cheeks: patterned hide wrapping forward over the jaw root, so the dark
       muzzle starts well ahead of the eye instead of at the corner of it    */
    [1, -1].forEach(function (sgn) {
      mesh(geo.loft({
        path: [[0.02, 0.005, 0.06 * sgn], [0.17, -0.005, 0.072 * sgn], [0.27, -0.02, 0.058 * sgn]],
        radii: [[0.055, 0.06], [0.058, 0.056], [0.042, 0.04]],
        stations: 10, radial: 10, tile: 1, up: [0, 1, 0], caps: 'both'
      }), mats.face, head);
    });
    /* lower jaw / chin */
    mesh(geo.loft({
      path: [[0.02, -0.055, 0], [0.20, -0.088, 0], [0.34, -0.104, 0], [0.44, -0.108, 0]],
      radii: [[0.076, 0.052], [0.078, 0.054], [0.072, 0.046], [0.05, 0.034]],
      stations: 16, radial: 14, tile: 1, up: [0, 1, 0], caps: 'both'
    }), mats.muzzle, head);
    /* lips */
    mesh(geo.loft({
      path: [[0.47, -0.045, 0], [0.515, -0.072, 0], [0.495, -0.108, 0]],
      radii: [[0.056, 0.026], [0.062, 0.024], [0.05, 0.022]],
      stations: 12, radial: 12, tile: 1, up: [0, 1, 0], caps: 'both',
      profile: function (n) { return ridge(n, 0.05, -1); }
    }), mats.dark, head);
    /* nostrils */
    [1, -1].forEach(function (sgn) {
      mesh(geo.loft({
        path: [[0.42, -0.022, 0.046 * sgn], [0.465, -0.03, 0.05 * sgn], [0.492, -0.046, 0.04 * sgn]],
        radii: [[0.022, 0.017], [0.026, 0.019], [0.017, 0.013]],
        stations: 8, radial: 10, tile: 1, up: [0, 1, 0], caps: 'both'
      }), mats.dark, head);
    });

    /* ears: broad, held out to the side, dark fringe along the rim */
    rig.ears = {};
    [1, -1].forEach(function (sgn) {
      var ear = joint(head, -0.125, 0.108, 0.105 * sgn);
      ear.name = 'ear' + (sgn > 0 ? 'L' : 'R');
      ear.rotation.y = sgn * 1.42;
      ear.rotation.z = 0.02 + sgn * 0.10;
      ear.rotation.x = sgn * -0.10;
      mesh(geo.loft({
        path: [[0.0, 0.0, 0.0], [0.06, 0.012, 0], [0.15, 0.005, 0], [0.215, -0.01, 0]],
        radii: [[0.02, 0.045], [0.062, 0.05], [0.055, 0.038], [0.016, 0.012]],
        stations: 14, radial: 14, tile: 1, up: [0, 1, 0], caps: 'both',
        profile: function (n) { return geo.Profiles.leaf(n); }
      }), mats.face, ear);
      mesh(geo.loft({
        path: [[0.01, 0.004, 0.004 * sgn], [0.09, 0.006, 0.004 * sgn], [0.18, -0.004, 0]],
        radii: [[0.04, 0.028], [0.048, 0.03], [0.02, 0.014]],
        stations: 10, radial: 10, tile: 1, up: [0, 1, 0], caps: 'both'
      }), mats.innerEar, ear);
      var fr = geo.fillTufts(9, function (i, n, v, q, sc, rnd) {
        var t = i / (n - 1);
        v.set(0.02 + t * 0.185, 0.004 + Math.sin(t * 3.1) * 0.018, -0.003);
        q.setFromUnitVectors(UP, _dirTmp.set(0.25 + rnd() * 0.3, -0.25 - rnd() * 0.35, (rnd() - 0.5) * 0.3).normalize());
        sc.set(1, 0.55 + rnd() * 0.4, 1);
      }, geo.tuftGeo({ len: 0.035, rad: 0.006, n: 3, tip: true }), mats.hair, 7 + sgn);
      fr.castShadow = false;
      ear.add(fr);
      rig.ears[sgn > 0 ? 'L' : 'R'] = ear;
      rig.joints.push(ear);
    });

    /* ossicones (the "horns"): skin-covered shaft, knobbed tip, dark tuft */
    rig.horns = [];
    [1, -1].forEach(function (sgn) {
      var h = joint(head, -0.05, 0.15, 0.066 * sgn);
      h.name = 'horn' + (sgn > 0 ? 'L' : 'R');
      h.rotation.z = -sgn * 0.06;
      h.rotation.x = sgn * 0.06;
      mesh(geo.loft({
        path: [[0, 0, 0], [0.006, 0.075, 0], [0.02, 0.15, 0]],
        radii: [[0.042, 0.042], [0.036, 0.036], [0.046, 0.046]],
        stations: 10, radial: 12, tile: 1, up: [1, 0, 0], caps: 'start'
      }), mats.skin, h);
      mesh(new THREE.SphereGeometry(0.05, 14, 12), mats.skin, h).position.set(0.02, 0.155, 0);
      var cap = geo.fillTufts(13, function (i, n, v, q, sc, rnd) {
        var a = i / n * M.TAU, r = 0.026 * rnd() + 0.006;
        v.set(0.02 + Math.cos(a) * r, 0.168 + rnd() * 0.006, Math.sin(a) * r);
        q.setFromUnitVectors(UP, _dirTmp.set(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize());
        sc.set(1, 0.5 + rnd() * 0.5, 1);
      }, geo.tuftGeo({ len: 0.04, rad: 0.007, n: 4, tip: true }), mats.hairDark, 21 + sgn);
      cap.castShadow = false;
      h.add(cap);
      rig.horns.push(h);
      rig.joints.push(h);
    });

    /* eyes + lids + lashes */
    rig.eyes = {};
    [1, -1].forEach(function (sgn) {
      var e = joint(head, 0.045, 0.055, 0.104 * sgn);
      e.name = 'eye' + (sgn > 0 ? 'L' : 'R');
      var ball = mesh(new THREE.SphereGeometry(0.041, 16, 14), mats.eye, e);
      ball.scale.set(1.02, 1.0, 0.86);
      ball.position.set(0.006 * sgn, -0.002, 0.014 * sgn);
      ball.castShadow = false;
      /* glossy catchlight */
      var hl = mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf6f2e8 }), e);
      hl.position.set(0.02, 0.016, 0.036 * sgn);
      hl.castShadow = false;
      /* lid: a shell that sweeps down over the eye */
      var lid = joint(e, 0, 0, 0.004 * sgn);
      lid.name = 'lid' + (sgn > 0 ? 'L' : 'R');
      var lidMesh = mesh(new THREE.SphereGeometry(0.0485, 16, 12, 0, M.TAU, 0, Math.PI * 0.58), mats.lid, lid);
      lidMesh.castShadow = false;
      var lash = geo.fillTufts(7, function (i, n, v, q, sc, rnd) {
        var a = (-0.4 + (i / (n - 1)) * 0.8);
        v.set(Math.sin(a) * 0.045, 0.042 * Math.cos(a * 1.2), 0.024 * sgn);
        q.setFromUnitVectors(UP, _dirTmp.set(0.2, 0.45 + rnd() * 0.3, 0.45 * sgn).normalize());
        sc.set(1, 0.8 + rnd() * 0.4, 1);
      }, geo.tuftGeo({ len: 0.03, rad: 0.004, n: 3, tip: true }), mats.hairDark, 41 + sgn);
      lash.castShadow = false;
      lid.add(lash);
      rig.eyes[sgn > 0 ? 'L' : 'R'] = { joint: e, lid: lid, ball: ball };
      rig.joints.push(lid);
    });

    /* --------------------------------------------------------------- legs - */
    function buildLeg(name, cfg, sideFront, front) {
      var hip = joint(body, cfg.x, cfg.y, cfg.z * (sideFront > 0 ? 1 : -1));
      hip.name = name;
      var A = cfg.A, B = cfg.B, foot = cfg.foot;

      /* ---- bone A ---- */
      var pathA, radA;
      if (front) {
        /* humerus back, then radius sweeping forward to the carpus */
        pathA = [[0, 0, 0], [-0.115, -A * 0.36, 0], [-0.02, -A * 0.68, 0], [0.03, -A, 0]];
        radA = [[0.19, 0.20], [0.135, 0.145], [0.10, 0.105], [0.088, 0.095]];
      } else {
        /* femur sloping back to the stifle */
        pathA = [[0, 0, 0], [-0.10, -A * 0.42, 0], [-0.06, -A * 0.76, 0], [0.02, -A, 0]];
        radA = [[0.185, 0.21], [0.14, 0.16], [0.115, 0.13], [0.10, 0.115]];
      }
      mesh(geo.loft({
        path: pathA, radii: radA, stations: 22, radial: 16, tile: 1,
        up: [1, 0, 0], profile: function (n) { return tube(n, 0.45); }, caps: 'start'
      }), mats.leg, hip);

      var knee = joint(hip, 0, -A, 0);
      knee.name = name + '_knee';
      /* ---- bone B: cannon, with a hock bulge behind for hind legs ---- */
      var pathB, radB;
      if (front) {
        pathB = [[0, 0, 0], [0.02, -B * 0.5, 0], [0.0, -B, 0]];
        radB = [[0.085, 0.09], [0.07, 0.075], [0.062, 0.068]];
      } else {
        pathB = [[0, 0, 0], [-0.16, -B * 0.32, 0], [-0.05, -B * 0.66, 0], [0.02, -B, 0]];
        radB = [[0.10, 0.115], [0.085, 0.10], [0.068, 0.08], [0.058, 0.066]];
      }
      mesh(geo.loft({
        path: pathB, radii: radB, stations: 20, radial: 14, tile: 1,
        up: [1, 0, 0], profile: function (n) { return tube(n, 0.55); }, caps: 'both'
      }), mats.socks, knee);
      if (!front) {
        /* tibia keeps the blotched coat down to the hock, like a real sock */
        mesh(geo.loft({
          path: [[0, 0.02, 0], [-0.115, -B * 0.3, 0], [-0.10, -B * 0.52, 0]],
          radii: [[0.108, 0.122], [0.098, 0.112], [0.088, 0.102]],
          stations: 12, radial: 14, tile: 1, up: [1, 0, 0],
          profile: function (n) { return tube(n, 0.55); }, caps: 'both'
        }), mats.leg, knee);
      }
      /* knee cap in front */
      var kc = mesh(geo.loft({
        path: front ? [[0.05, -0.03, 0], [0.085, 0.03, 0], [0.055, 0.09, 0]]
          : [[0.045, -0.02, 0], [0.075, 0.035, 0], [0.05, 0.085, 0]],
        radii: [[0.055, 0.05], [0.068, 0.06], [0.05, 0.045]],
        stations: 10, radial: 12, tile: 1, up: [1, 0, 0], caps: 'both'
      }), mats.socks, knee);

      /* shaggy tuft on the front of the carpus / back of the hock */
      var tuftCount = front ? 26 : 14;
      var tuft = geo.fillTufts(tuftCount, function (i, n, v, q, sc, rnd) {
        if (front) {
          v.set(0.05 + rnd() * 0.05, -0.02 + rnd() * 0.11, (rnd() - 0.5) * 0.11);
          q.setFromUnitVectors(UP, _dirTmp.set(0.55 + rnd() * 0.5, -0.75 - rnd() * 0.6, (rnd() - 0.5) * 0.8).normalize());
        } else {
          v.set(-0.13 - rnd() * 0.05, -B * 0.3 + rnd() * 0.2, (rnd() - 0.5) * 0.1);
          q.setFromUnitVectors(UP, _dirTmp.set(-0.8 - rnd() * 0.4, -0.9 - rnd() * 0.7, (rnd() - 0.5) * 0.8).normalize());
        }
        sc.set(1, 0.8 + rnd() * 0.9, 1);
      }, geo.tuftGeo({ len: 0.09, rad: 0.011, n: 4, tip: true }), mats.hair, front ? 61 : 71);
      tuft.castShadow = false;
      knee.add(tuft);

      /* ---- foot: pastern + hoof.  The sole pivot sits exactly on the bone
         axis at (0,-foot,0) so the gait solver can plant the hoof with zero
         slide; the forward toe comes from shifted sections, not a lean. ---- */
      var ankle = joint(knee, 0, -B, 0);
      ankle.name = name + '_ankle';
      mesh(geo.loft({
        path: [[0, 0, 0], [0.008, -foot * 0.42, 0], [0.004, -foot * 0.72, 0]],
        radii: [[0.062, 0.068], [0.072, 0.078], [0.084, 0.09]],
        stations: 10, radial: 14, tile: 1, up: [1, 0, 0],
        profile: function (n) { return tube(n, 0.5); }, caps: 'start'
      }), mats.socks, ankle);
      var hoofProf = function (shift) {
        return function (n) {
          return tube(n, 0.42).map(function (q) { return [q[0], q[1] + shift]; });
        };
      };
      mesh(geo.loft({
        path: [[0.004, -foot * 0.68, 0], [0, -foot * 0.87, 0], [0, -foot, 0]],
        radii: [[0.088, 0.092], [0.106, 0.114], [0.098, 0.106]],
        stations: 12, radial: 16, tile: 1, up: [1, 0, 0],
        profile: hoofProf(0.24), caps: 'both'
      }), mats.hoof, ankle);
      /* hair rim (coronet) where the hoof meets the pale sock */
      mesh(geo.loft({
        path: [[0.005, -foot * 0.6, 0], [0.004, -foot * 0.7, 0]],
        radii: [[0.094, 0.098], [0.098, 0.102]],
        stations: 5, radial: 14, tile: 1, up: [1, 0, 0],
        profile: function (n) { return tube(n, 0.5); }, caps: 'none'
      }), mats.hair, ankle);
      /* dewclaws */
      [1, -1].forEach(function (s2) {
        mesh(geo.loft({
          path: [[-0.02, -foot * 0.58, 0.055 * s2], [-0.035, -foot * 0.8, 0.08 * s2]],
          radii: [[0.026, 0.026], [0.018, 0.016]], stations: 6, radial: 8,
          tile: 1, up: [1, 0, 0], caps: 'both'
        }), mats.hoof, ankle);
      });

      rig.joints.push(hip, knee, ankle);
      var L = {
        name: name, side: sideFront, front: front, cfg: cfg,
        hip: hip, knee: knee, ankle: ankle,
        A: A, B: B, footLen: foot,
        ground: foot,                      /* fetlock height when planted   */
        hipPos: new THREE.Vector3(cfg.x, cfg.y, cfg.z * sideFront),
        phase: 0, contact: false, lift: 0, lastLift: 0
      };
      rig.legs[name] = L;
      return L;
    }
    buildLeg('LF', D.fore, 1, true);
    buildLeg('RF', D.fore, -1, true);
    buildLeg('LH', D.hind, 1, false);
    buildLeg('RH', D.hind, -1, false);

    /* hooves need a shadow catcher at ground level: none here (env does it) */

    /* -------------------------------------------------------------- tail -- */
    var tailRoot = joint(body, D.tailRoot[0], D.tailRoot[1], D.tailRoot[2]);
    tailRoot.name = 'tail0';
    rig.tail = [tailRoot];
    rig.joints.push(tailRoot);
    var tp = tailRoot, tR = [[0.075, 0.07], [0.05, 0.05]];
    D.tailSegs.forEach(function (len, i) {
      var r0 = [0.072 - i * 0.016, 0.066 - i * 0.015];
      var r1 = [0.058 - i * 0.016, 0.052 - i * 0.015];
      mesh(geo.loft({
        path: [[0, 0, 0], [-0.03 * len * 2, -len * 0.55, 0], [0, -len, 0]],
        radii: [r0, r1], stations: 10, radial: 10, tile: 1, up: [1, 0, 0],
        profile: function (n) { return tube(n, 0.3); }, caps: i === 0 ? 'start' : 'none'
      }), mats.body, tp);
      var j = joint(tp, 0, -len, 0);
      j.name = 'tail' + (i + 1);
      rig.tail.push(j);
      rig.joints.push(j);
      tp = j;
    });
    /* long dark brush at the end */
    var brush = geo.fillTufts(46, function (i, n, v, q, sc, rnd) {
      var a = i / n * M.TAU * 3.7;
      var r = 0.012 + 0.02 * rnd();
      v.set(Math.cos(a) * r, -0.02 - rnd() * 0.04, Math.sin(a) * r);
      q.setFromUnitVectors(UP, _dirTmp.set(Math.cos(a) * 0.35 + (rnd() - 0.5) * 0.4, -1 - rnd() * 0.5, Math.sin(a) * 0.35 + (rnd() - 0.5) * 0.4).normalize());
      sc.set(1, 1.4 + rnd() * 1.6, 1);
    }, geo.tuftGeo({ len: 0.16, rad: 0.010, n: 4, tip: true }), mats.hairDark, 99);
    brush.castShadow = false;
    tp.add(brush);
    rig.tailTuft = tp;

    /* short fuzzy hair over the withers / back line */
    var fuzz = geo.fillTufts(150, function (i, n, v, q, sc, rnd) {
      var t = i / n;
      var x = 1.2 - t * 2.6;
      var y = 3.06 + Math.sin(t * 3.0) * 0.02 - t * 0.02;
      v.set(x, y, (rnd() - 0.5) * 0.5 * (0.2 + 0.3 * Math.sin(t * 3.14)));
      q.setFromUnitVectors(UP, _dirTmp.set(-0.15 + (rnd() - 0.5) * 0.5, 0.9, (rnd() - 0.5) * 0.9).normalize());
      sc.set(1, 0.6 + rnd() * 0.7, 1);
    }, geo.tuftGeo({ len: 0.05, rad: 0.007, n: 3, tip: true }), mats.hair, 5);
    fuzz.castShadow = false;
    body.add(fuzz);

    /* udder / sheath hint keeps the belly from looking like a tube */
    mesh(geo.loft({
      path: [[-0.62, 2.62, 0], [-0.86, 2.60, 0], [-1.02, 2.66, 0]],
      radii: [[0.11, 0.09], [0.13, 0.11], [0.09, 0.07]],
      stations: 10, radial: 12, tile: 1, up: [0, 1, 0], caps: 'both'
    }), mats.skin, body);

    /* ---------------------------------------------------------- debug rig -- */
    var dbg = new THREE.Group();
    dbg.visible = false;
    root3.add(dbg);
    rig.debug = dbg;
    var sph = new THREE.SphereGeometry(0.05, 8, 6);
    var dm = new THREE.MeshBasicMaterial({ color: 0x00ffcc, wireframe: true, depthTest: false });
    rig.markers = rig.joints.map(function (j) {
      var s = new THREE.Mesh(sph, dm);
      s.visible = false;
      j.add(s);
      return s;
    });
    /* bones: lines along each leg so the IK can be inspected */
    rig.lines = [];
    ['LF', 'RF', 'LH', 'RH'].forEach(function (n) {
      var L = rig.legs[n];
      var g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
      var lm = new THREE.LineBasicMaterial({ color: 0xff5522, depthTest: false });
      var line = new THREE.Line(g2, lm);
      line.frustumCulled = false; line.visible = false;
      root3.add(line);
      rig.lines.push({ line: line, L: L });
    });

    /* soft contact blob: keeps distant herd-mates from looking like they
       are floating when they leave the real shadow frustum               */
    var blobTex = new THREE.CanvasTexture(T.blob());
    blobTex.colorSpace = THREE.SRGBColorSpace;
    var blob = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.9),
      new THREE.MeshBasicMaterial({
        map: blobTex, transparent: true, opacity: 0.34, depthWrite: false,
        color: 0xb9a583, fog: true
      }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(0.05, 0.012, 0);
    blob.renderOrder = 2;
    root3.add(blob);
    rig.blob = blob;

    root3.matrixAutoUpdate = true;
    return rig;
  };

  /* Deep-copy the hierarchy but keep every geometry and material shared, then
     re-derive the rig handles by name — cheap way to get a whole herd.      */
  SPEC.cloneRig = function (src, name) {
    var byName = {};
    src.root.traverse(function (o) { if (o.name) byName[o.name] = o; });
    var root3 = src.root.clone(true);
    root3.name = name || 'giraffe2';
    var get = function (n) {
      var found = null;
      root3.traverse(function (o) { if (!found && o.name === n) found = o; });
      return found;
    };
    var rig = {
      root: root3, body: get('body'), debug: null, markers: [], lines: [],
      neck: ['neck0', 'neck1', 'neck2'].map(get),
      head: get('head'),
      tail: ['tail0', 'tail1', 'tail2', 'tail3'].map(get),
      ears: { L: get('earL'), R: get('earR') },
      eyes: {
        L: { joint: get('eyeL'), lid: get('lidL') },
        R: { joint: get('eyeR'), lid: get('lidR') }
      },
      legs: {}, joints: []
    };
    ['LF', 'RF', 'LH', 'RH'].forEach(function (n) {
      var L = src.legs[n];
      rig.legs[n] = {
        name: n, side: L.side, front: L.front, cfg: L.cfg,
        A: L.A, B: L.B, footLen: L.footLen, ground: L.ground,
        hipPos: L.hipPos.clone(),
        hip: get(n), knee: get(n + '_knee'), ankle: get(n + '_ankle'),
        phase: 0, contact: true, sole: new THREE.Vector3(L.hipPos.x, 0, L.hipPos.z)
      };
      rig.joints.push(rig.legs[n].hip, rig.legs[n].knee, rig.legs[n].ankle);
    });
    /* the wireframe joint markers are debug-only: hide them on clones */
    root3.traverse(function (o) {
      if (o.isMesh && o.material && o.material.wireframe) o.visible = false;
    });
    return rig;
  };
})(typeof window !== 'undefined' ? window : globalThis);
