/* ==========================================================================
   giraffe.js — assembles the animal from the loft engine + anatomy tables.

   Exports  GIR.Giraffe.build(mats, opts) -> rig
            GIR.Giraffe.bodyBounds(rig)
            GIR.Giraffe.skeletonSummary(rig)

   Hierarchy (everything the gait solver touches is named here):

     root
      └ body                        gait.js drives position/rotation of this
         ├ torso   (deformable)     rig.torso.def
         ├ neck    (deformable)     rig.neck.def
         ├ mane    (deformable)     rig.neck.maneDef
         ├ headJoint                rig.head.joint  (parked on the neck tip)
         │   └ skull, muzzle, jaw, lips, nostrils, eyes+lids+lashes,
         │     ossicones+tufts, ears(hinged), forelock, chin tuft
         ├ tailRoot → tailMid → tailTip → switch
         └ legs[key].root = joints[0]
              ├ bone1 mesh, scapula/trochanter
              └ joints[1] ─ bone2 mesh
                  └ joints[2] ─ bone3 (cannon) mesh
                      └ joints[3] ─ hoof ─ hoofRest ─ pastern + hoof wall +
                                          coronet

   Conventions
     +X facing, +Y up, -Z = the animal's left.  Limb absolute angles are about
     +Z and follow gait.js:  a bone pointing "down and forward" is positive.
     The hoof group's origin *is* the ground contact-patch centre, whose
     extremes sit at x = -0.055 (heel) and +0.095 (toe) — gait.js's roll-over
     model depends on those two numbers, so the hoof geometry is authored
     around them.
   ========================================================================== */
(function (GIR) {
  'use strict';
  var A = GIR.Anat, L = GIR.Loft, D = GIR.Deform;
  var G = {};
  GIR.Giraffe = G;

  var DEG = GIR.DEG, TILE = GIR.Skin.TILE;
  var HHEEL = -0.055, HTOE = 0.095;

  /* ------------------------------------------------------------- plumbing */
  function mesh(geo, mat, tag, parent) {
    var m = new THREE.Mesh(geo, mat);
    m.userData.tag = tag || 'other';
    m.castShadow = true;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function node(parent, x, y, z, name, order) {
    var o = new THREE.Object3D();
    o.name = name || '';
    o.position.set(x || 0, y || 0, z || 0);
    if (order) o.rotation.order = order;
    if (parent) parent.add(o);
    return o;
  }
  /* absolute sagittal angle of a bone that runs from joint a to joint b */
  function boneAngle(a, b) { return Math.atan2(b[0] - a[0], a[1] - b[1]); }
  /* world vector -> the frame of a bone whose absolute angle is th */
  function inBone(wx, wy, th) {
    var c = Math.cos(th), s = Math.sin(th);
    return [wx * c + wy * s, -wx * s + wy * c];
  }

  /* ============================================================== the body */
  function buildTorso(mats, opts) {
    var S = A.torsoStations, n = S.length, xs = [], top = [], bot = [],
        hw = [], sq = [], fd = [], fv = [], i;
    for (i = 0; i < n; i++) {
      xs.push(S[i][0]); top.push(S[i][1]); bot.push(S[i][2]); hw.push(S[i][3]);
      sq.push(S[i][4]); fd.push(S[i][5]); fv.push(S[i][6]);
    }
    var x0 = xs[0], x1 = xs[n - 1], count = opts.torsoRings;
    var rings = [];
    for (i = 0; i < count; i++) {
      var t = i / (count - 1), x = GIR.lerp(x0, x1, t);
      var yc = GIR.lerp(A.spline1(xs, top, x), A.spline1(xs, bot, x), 0.5);
      var w = A.spline1(xs, hw, x);
      /* faint rib ridges on the false-rib band, baked into the section so
         they travel with the surface when the spine bends */
      var rib = (t > 0.30 && t < 0.72) ? 1 + 0.030 * Math.sin((t - 0.30) * 22) : 1;
      rings.push({
        x: x, y: yc, z: 0,
        w: w * rib,
        hi: (A.spline1(xs, top, x) - yc) * rib,
        lo: (yc - A.spline1(xs, bot, x)) * (2 - rib),
        sq: A.spline1(xs, sq, x),
        fade: A.spline1(xs, fd, x),
        fadeV: A.spline1(xs, fv, x),
        side: [0, 0, 1]
      });
    }
    /* a caudal-dorsal wedge: the rump slopes, so pull the last rings' centres
       down a touch and keep the tail head distinct from the croup */
    var geo = L.build(rings, {
      seg: opts.seg, tile: TILE, side: [0, 0, 1],
      capRings: 4, capScale: 0.55, uShift: 0.0, name: 'torso'
    });
    var def = D.create(geo);
    /* breathing: the widest place is the false-rib band, the shoulders and
       the rump barely move */
    var breathW = new Float32Array(def.rings);
    for (i = 0; i < def.rings; i++) {
      var tb = i / (def.rings - 1);
      breathW[i] = GIR.gauss((tb - 0.46) / 0.24, 1);
    }
    def.breathW = breathW;
    return { geo: geo, def: def, rings: rings };
  }

  function buildNeck(mats, opts) {
    var T = A.neckSpine, n = T.length, ts = [], px = [], py = [];
    var P = A.neckProfile, m = P.length, pt = [], w = [], hi = [], lo = [],
        sq = [], fv = [];
    var i;
    for (i = 0; i < n; i++) { ts.push(T[i][0]); px.push(T[i][1][0]); py.push(T[i][1][1]); }
    for (i = 0; i < m; i++) {
      pt.push(P[i][0]); w.push(P[i][1]); hi.push(P[i][2]); lo.push(P[i][3]);
      sq.push(P[i][4]); fv.push(P[i][5]);
    }
    function at(t) {
      return {
        x: A.spline1(ts, px, t), y: A.spline1(ts, py, t),
        w: A.spline1(pt, w, t), hi: A.spline1(pt, hi, t), lo: A.spline1(pt, lo, t),
        sq: A.spline1(pt, sq, t), fv: A.spline1(pt, fv, t)
      };
    }
    var count = opts.neckRings, rings = [], mane = [];
    for (i = 0; i < count; i++) {
      var t2 = i / (count - 1), f = at(t2);
      rings.push({ x: f.x, y: f.y, z: 0, w: f.w, hi: f.hi, lo: f.lo, sq: f.sq,
                   fade: t2 > 0.55 ? 0.10 * (t2 - 0.55) : 0, fadeV: f.fv, side: [0, 0, 1] });
      /* dorsal normal of a planar (X-Y) curve */
      var e = 0.012, a = at(t2 - e), b = at(t2 + e);
      var tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
      var nx = -ty / tl, ny = tx / tl;               /* BB in D.apply's sense */
      var mh = 0.155 * (1 - 0.72 * t2) * (0.55 + 0.45 * GIR.hump(GIR.clamp(t2 * 1.15, 0, 1)));
      mane.push({ x: f.x + nx * (f.hi + 0.005), y: f.y + ny * (f.hi + 0.005), z: 0,
                  w: 0.016, hi: mh, lo: 0.030, sq: 2.85, fade: 0, fadeV: 0, side: [0, 0, 1] });
    }
    var geo = L.build(rings, { seg: opts.seg, tile: TILE, capRings: 2, capScale: 0.5,
                               name: 'neck' });
    var maneGeo = L.build(mane, { seg: 8, tile: TILE, capRings: 2, capScale: 0.35,
                                  name: 'mane' });
    return { geo: geo, maneGeo: maneGeo, def: D.create(geo), maneDef: D.create(maneGeo) };
  }

  /* ============================================================ the head === */
  /* authored in head space: +X along the face, +Y up, +Z to the LEFT
     (restQ below turns the neck-tip frame into this one) */
  function buildHead(mats, opts) {
    var head = node(null, 0, 0, 0, 'head');
    var out = { obj: head, ears: [], eyes: [] };
    var seg = opts.segHead;

    function profileGeo(rows, colCount, opts2) {
      var xs = [], w = [], hi = [], lo = [], sq = [], fd = [];
      var i;
      for (i = 0; i < rows.length; i++) {
        xs.push(rows[i][0]); w.push(rows[i][1]); hi.push(rows[i][2]);
        lo.push(rows[i][3]); sq.push(rows[i][4] === undefined ? 2.4 : rows[i][4]);
        fd.push(rows[i][5] === undefined ? 0 : rows[i][5]);
      }
      var count = colCount || rows.length * 2, rings = [];
      for (i = 0; i < count; i++) {
        var t = i / (count - 1), x = GIR.lerp(xs[0], xs[xs.length - 1], t);
        var yc = opts2 && opts2.yc ? opts2.yc(t) : 0;
        rings.push({
          x: x, y: yc, z: 0,
          w: A.spline1(xs, w, x),
          hi: A.spline1(xs, hi, x),
          lo: A.spline1(xs, lo, x),
          sq: A.spline1(xs, sq, x),
          fade: A.spline1(xs, fd, x),
          side: [0, 0, 1]
        });
      }
      if (opts2 && opts2.last) {
        var r = rings[rings.length - 1];
        r.x = opts2.last[0]; r.y = opts2.last[1];
      }
      return L.build(rings, { seg: seg, tile: TILE, capRings: 3, capScale: opts2 && opts2.capScale || 0.6,
                              name: 'head' });
    }

    /* skull + poll: the axis dips slightly so the face declines off the atlas */
    mesh(profileGeo(A.headProfile, 14, { capScale: 0.42,
      yc: function (t) { return -0.02 - 0.075 * t; } }), mats.coat, 'head', head);

    /* muzzle: continues the profile, ends blunt at the lips */
    mesh(profileGeo(A.muzzleProfile, 10, { capScale: 0.45,
      yc: function (t) { return -0.055 - 0.055 * t; } }), mats.coat, 'muzzle', head);

    /* lower jaw, hinged at the mandible */
    var jaw = node(head, 0.30, -0.115, 0, 'jaw', 'ZYX');
    var jawGeo = profileGeo(A.jawProfile, 9, { capScale: 0.4,
      yc: function (t) { return -0.012 - 0.03 * t; } });
    jawGeo.translate(-0.30, 0.115, 0);
    mesh(jawGeo, mats.coat, 'head', jaw);
    /* the chin tuft that every mature bull grows */
    var chin = L.boneY(0.10, [0.055, 0.010], { samples: 6, seg: 10, tile: TILE,
      sq: 2.7, knob: 0.02, fade: 0 });
    var chinN = node(jaw, 0.40, -0.125, 0, 'chinTuft');
    chinN.rotation.z = 0.45;
    mesh(chin, mats.hairDark, 'hair', chinN);
    out.jaw = jaw;
    jaw.rotation.z = -0.055;

    /* lips: a soft, prehensile front */
    var lips = L.bone([0, 0, 0], [0.055, -0.035, 0], function (t) {
      return { w: 0.085 * (1 - 0.35 * t) + 0.02, hi: 0.05 * (1 - 0.5 * t), lo: 0.055 * (1 - 0.3 * t),
               sq: 2.2, fade: 0.15 };
    }, { samples: 6, seg: 12, tile: TILE, side: [0, 0, 1] });
    lips.translate(0.76, -0.09, 0);
    mesh(lips, mats.leather, 'muzzle', head);

    /* nostrils: slits set in a raised nose bed, they flare on exertion */
    out.nostrils = [];
    for (var s = -1; s <= 1; s += 2) {
      var bed = new THREE.SphereGeometry(0.052, 12, 10);
      bed.scale(0.9, 0.7, 1.0);
      var bn = node(head, 0.60, -0.005, s * 0.072, 'nose');
      bn.rotation.z = -0.5;
      mesh(bed, mats.coat, 'head', bn);
      var ring = new THREE.TorusGeometry(0.026, 0.010, 6, 14);
      var rn = node(bn, 0.012, 0.012, 0.02, 'nostril', 'ZYX');
      rn.rotation.set(0.25, 1.35, 0.35);
      mesh(ring, mats.nostril, 'nostril', rn);
      out.nostrils.push(rn);
      /* the flap of skin that half-covers each hole */
      var flap = L.leaf(0.035, function (t) { return 0.020 * GIR.hump(t * 0.9 + 0.1) + 0.004; },
        { thick: 0.006, samples: 5, seg: 8, tile: TILE, side: [0, 0, 1] });
      var fn = node(bn, 0.030, 0.006, 0.030, 'nostrilFlap', 'ZYX');
      fn.rotation.set(-0.2, 0, 1.4);
      mesh(flap, mats.leather, 'nostril', fn);
    }

    /* eyes: on the side of the head, low on the skull, with a real lid */
    for (s = -1; s <= 1; s += 2) {
      var ex = -0.035, ey = 0.045, ez = s * 0.150;
      var socket = new THREE.SphereGeometry(0.034, 16, 12);
      var ball = node(head, ex, ey, ez, 'eyeball');
      mesh(socket, mats.eye, 'eye', ball);
      var irisG = new THREE.SphereGeometry(0.0165, 14, 10);
      var iris = node(ball, 0.006, 0, s * 0.026, 'iris');
      iris.scale.set(0.7, 0.9, 0.55);
      mesh(irisG, mats.sclera, 'eye', iris);
      var pupG = new THREE.SphereGeometry(0.0085, 12, 8);
      var pup = node(iris, 0.002, 0, s * 0.010, 'pupil');
      pup.scale.set(0.7, 1.0, 0.5);
      mesh(pupG, mats.nostril, 'eye', pup);
      var glintG = new THREE.SphereGeometry(0.004, 8, 6);
      var gl = node(iris, -0.004, 0.008, s * 0.014, 'glint');
      mesh(glintG, mats.pale, 'eye', gl);

      /* brow bulge so the eye sits under the zygomatic ridge */
      var brow = new THREE.SphereGeometry(0.062, 12, 10);
      brow.scale(1.0, 0.62, 0.5);
      var bn2 = node(head, ex - 0.015, ey + 0.045, ez * 1.02, 'brow');
      bn2.rotation.z = s * 0.15;
      mesh(brow, mats.coat, 'head', bn2);

      /* lid: a dome hinged at the top of the orbit, sweeps down over the eye */
      var lidG = new THREE.SphereGeometry(0.0405, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52);
      var lid = node(head, ex, ey, ez, 'lid', 'YXZ');
      mesh(lidG, mats.lid, 'lid', lid);
      var lashG = L.leaf(0.055, function (t) { return 0.006 + 0.010 * GIR.hump(t); },
        { thick: 0.0035, samples: 5, seg: 6, tile: TILE, sq: 3.0 });
      var lash = node(lid, 0.014, -0.004, s * 0.024, 'lashes', 'ZYX');
      lash.rotation.set(s * 1.15, 0, -0.55);
      mesh(lashG, mats.lash, 'lash', lash);
      out.eyes.push({ ball: ball, lid: lid, side: s, openRot: s * -0.25, closedRot: s * 1.55 });
    }

    /* ossicones: the knobs every giraffe is born with, hair over bare bone */
    for (s = -1; s <= 1; s += 2) {
      var og = node(head, -0.135, 0.115, s * 0.052, 'ossicone', 'ZYX');
      og.rotation.set(s * 0.22, 0, 0.34);
      var shaft = L.bone([0, 0, 0], [0.010, 0.150, 0], function (t) {
        return { w: GIR.lerp(0.033, 0.026, t), hi: GIR.lerp(0.034, 0.027, t),
                 lo: GIR.lerp(0.036, 0.028, t), sq: 2.1, fade: 0.05 };
      }, { samples: 7, seg: 12, tile: TILE, side: [0, 0, 1] });
      mesh(shaft, mats.coat, 'horn', og);
      var capG = new THREE.SphereGeometry(0.034, 12, 10);
      capG.scale(1, 0.85, 1);
      var cap = node(og, 0.012, 0.152, 0, 'ossTip');
      mesh(capG, mats.hairDark, 'hair', cap);
      var sw = L.bone([0, 0, 0], [0.006, 0.075, 0], function (t) {
        return { w: 0.026 * (1 - 0.75 * t) + 0.004, hi: 0.028 * (1 - 0.8 * t) + 0.004,
                 lo: 0.024 * (1 - 0.7 * t) + 0.003, sq: 2.6, fade: 0 };
      }, { samples: 6, seg: 9, tile: TILE, side: [0, 0, 1] });
      var tw = node(og, 0.014, 0.165, 0, 'ossSwitch', 'ZYX');
      tw.rotation.z = 0.5;
      mesh(sw, mats.hairDark, 'hair', tw);
    }

    /* ears: broad, held out and back, the classic satellite dish */
    for (s = -1; s <= 1; s += 2) {
      var hinge = node(head, -0.115, 0.075, s * 0.118, 'ear' + (s > 0 ? 'L' : 'R'), 'ZYX');
      var base = { rx: s * 1.58, ry: -s * 0.38 };
      hinge.rotation.set(base.rx, base.ry, 0.05);
      var blade = L.leaf(0.235, function (t) {
        return 0.024 + 0.062 * Math.sin(Math.PI * GIR.clamp(0.12 + t * 0.88, 0, 1)) * (1 - 0.25 * t);
      }, { thick: 0.016, rim: 0.35, samples: 9, seg: 12, tile: TILE, side: [0, 0, 1], fade: 0.05 });
      mesh(blade, mats.coat, 'ear', hinge);
      var inner = L.leaf(0.185, function (t) {
        return 0.014 + 0.044 * Math.sin(Math.PI * GIR.clamp(0.16 + t * 0.84, 0, 1)) * (1 - 0.3 * t);
      }, { thick: 0.010, samples: 8, seg: 10, tile: TILE, side: [0, 0, 1], fade: 1 });
      var inN = node(hinge, 0, 0.012, 0, 'earInner', 'ZYX');
      inN.rotation.x = -0.10;
      mesh(inner, mats.earInner, 'ear', inN);
      var fringe = L.bone([0, 0, 0], [0.020, 0.205, 0], function (t) {
        return { w: 0.012 + 0.030 * GIR.hump(t), hi: 0.022 * (1 - 0.55 * t), lo: 0.010,
                 sq: 2.6, fade: 0 };
      }, { samples: 7, seg: 8, tile: TILE, side: [1, 0, 0] });
      mesh(fringe, mats.hairDark, 'hair', hinge);
      out.ears.push({ hinge: hinge, base: base, side: s });
    }

    /* forelock + the ridge of hair that runs onto the poll */
    var fore = L.bone([0, 0, 0], [-0.075, -0.085, 0], function (t) {
      return { w: 0.045 * (1 - 0.6 * t) + 0.008, hi: 0.030 * (1 - 0.5 * t), lo: 0.024 * (1 - 0.6 * t),
               sq: 2.7, fade: 0 };
    }, { samples: 7, seg: 10, tile: TILE, side: [0, 0, 1] });
    var fg = node(head, -0.150, 0.070, 0, 'forelock', 'ZYX');
    mesh(fore, mats.hairDark, 'hair', fg);
    return out;
  }

  /* ============================================================= the legs == */
  var HOOF = {
    /* [x, topY, bottomY, halfWidthZ] — sole flat over HHEEL..HTOE */
    fore: [
      [-0.086, 0.100, 0.030, 0.046],
      [-0.055, 0.126, 0.000, 0.060],
      [-0.010, 0.170, 0.000, 0.073],
      [0.045, 0.212, 0.000, 0.080],
      [0.095, 0.186, 0.000, 0.070],
      [0.118, 0.128, 0.022, 0.044]
    ],
    hind: [
      [-0.088, 0.104, 0.026, 0.044],
      [-0.055, 0.128, 0.000, 0.056],
      [-0.010, 0.166, 0.000, 0.068],
      [0.045, 0.202, 0.000, 0.074],
      [0.095, 0.176, 0.000, 0.065],
      [0.116, 0.120, 0.020, 0.041]
    ]
  };

  function hoofGeo(kind, seg) {
    var rows = HOOF[kind === 'fore' ? 'fore' : 'hind'], n = rows.length, rings = [], i;
    for (i = 0; i < n; i++) {
      var yc = (rows[i][1] + rows[i][2]) * 0.5;
      rings.push({
        x: rows[i][0], y: yc, z: 0,
        w: rows[i][3],
        hi: rows[i][1] - yc,
        lo: yc - rows[i][2],
        sq: 2.35, fade: 0, side: [0, 0, 1]
      });
    }
    return L.build(rings, { seg: seg, tile: TILE, capRings: 3, capScale: 0.42, name: 'hoof' });
  }

  function buildLeg(mats, opts, key, kind, J) {
    var joints = [J.a, J.b, J.c, J.d, J.e], lens = [], abs = [], i; /* authored world joint points */
    for (i = 0; i < 4; i++) {
      var p0 = joints[i], p1 = joints[i + 1];
      lens.push(A.drop(p0, p1));
      abs.push(boneAngle(p0, p1));
    }
    var r = A.limbRadii[kind];
    var lim = A.limits[kind], pri = A.priors[kind];
    var seg = opts.segLeg, front = kind === 'fore';

    var leg = {
      key: key, kind: kind, lengths: lens, restAbs: abs,
      limits: lim, priors: pri,
      anchor: [J.a[0], J.a[1], J.side * J.a[2]],
      hoofZ: J.side * J.a[2],
      nominal: front ? A.nominalContact.fore : A.nominalContact.hind,
      joints: [], nodes: {}
    };

    var root = node(opts.parent, leg.anchor[0], leg.anchor[1], leg.anchor[2], 'leg' + key, 'ZYX');
    leg.root = root; leg.joints[0] = root;

    /* --- bone 1: humerus / femur --- */
    var b1 = L.boneY(lens[0], front ? r.upper : [r.upper[0] * 0.98, r.upper[1]], {
      samples: 12, seg: seg, tile: TILE, sq: 2.05, knob: front ? 0.12 : 0.16,
      muscle: front ? 0.10 : 0.42, back: front ? 0.22 : 0.20, sideBulge: front ? 0.12 : 0.16,
      taperPow: front ? 1.0 : 0.85, fade: 0.05, fadeV: 0.10
    });
    mesh(b1, mats.coat, front ? 'upperArm' : 'thigh', root);

    if (front) {
      /* scapula: a blade under the coat, carried by the limb.  The authored
         vector is in body space, so pull it into the limb's own frame. */
      var sc = inBone(0.03, 0.84, abs[0]);
      var blade = L.bone([0, 0, 0], [sc[0], sc[1], 0], function (t) {
        return { w: GIR.lerp(0.020, 0.036, GIR.smoothstep(0.1, 0.9, t)),
                 hi: GIR.lerp(0.145, 0.075, t), lo: GIR.lerp(0.045, 0.085, t),
                 sq: 2.3, fade: 0.04, fadeD: 0.10 };
      }, { samples: 11, seg: Math.max(10, seg - 4), tile: TILE, side: [0, 0, 1] });
      mesh(blade, mats.coat, 'shoulder', root);
      /* the ridge at the point of the shoulder */
      var delt = new THREE.SphereGeometry(0.10, 12, 10);
      delt.scale(1.0, 0.85, 0.85);
      var dn = node(root, -0.02, -0.06, J.side * 0.075, 'deltoid');
      mesh(delt, mats.coat, 'shoulder', dn);
    } else {
      /* greater trochanter + the rounded buttock, both on the femur */
      var tro = new THREE.SphereGeometry(0.095, 12, 10);
      tro.scale(1.15, 1.0, 0.8);
      var tn = node(root, -0.03, -0.045, J.side * 0.088, 'trochanter');
      mesh(tro, mats.coat, 'thigh', tn);
      var butt = new THREE.SphereGeometry(0.16, 14, 12);
      butt.scale(0.85, 1.15, 0.75);
      var bn3 = node(root, -0.075, -0.16, J.side * 0.06, 'buttock');
      bn3.rotation.z = -0.35;
      mesh(butt, mats.coat, 'thigh', bn3);
    }

    /* --- bone 2: radio-ulna / tibia --- */
    var j1 = node(root, 0, -lens[0], 0, 'j2', 'ZYX');
    leg.joints[1] = j1;
    var b2 = L.boneY(lens[1], r.fore, {
      samples: 12, seg: seg, tile: TILE, sq: 2.05, knob: front ? 0.14 : 0.17,
      muscle: front ? 0.06 : 0.50, back: front ? 0.30 : 0.46, sideBulge: front ? 0.10 : 0.14,
      taperPow: front ? 0.95 : 0.8, fade: 0.06, fadeV: 0.14
    });
    mesh(b2, mats.coat, front ? 'upperArm' : 'thigh', j1);

    if (front) {
      /* the extensor ridge on the fore side of the forearm */
      var ex = L.boneY(lens[1] * 0.55, [0.045, 0.030], {
        samples: 7, seg: Math.max(8, seg - 6), tile: TILE, knob: 0.05, sq: 2.2,
        fade: 0.10, back: -0.5
      });
      var exn = node(j1, 0.028, 0, J.side * 0.032, 'extensor');
      exn.rotation.z = -0.04;
      mesh(ex, mats.coat, 'upperArm', exn);
    } else {
      /* patella at the stifle */
      var pat = new THREE.SphereGeometry(0.072, 12, 10);
      pat.scale(1.25, 1.0, 0.75);
      var pn = node(j1, 0.045, 0.020, 0, 'patella');
      mesh(pat, mats.leather, 'knee', pn);
      /* gastrocnemius: the calf muscle you can see through the skin */
      var gas = L.boneY(lens[1] * 0.62, [0.085, 0.035], {
        samples: 8, seg: Math.max(8, seg - 5), tile: TILE, knob: 0.06, sq: 2.3,
        muscle: 0.3, fade: 0.05
      });
      var gn = node(j1, -0.075, -0.05, J.side * 0.055, 'gastrocnemius');
      gn.rotation.z = -0.10;
      mesh(gas, mats.coat, 'thigh', gn);
    }

    /* --- bone 3: metapodium (cannon) --- */
    var j2 = node(j1, 0, -lens[1], 0, 'j3', 'ZYX');
    leg.joints[2] = j2;
    var b3 = L.boneY(lens[2], r.cannon, {
      samples: 10, seg: Math.max(10, seg - 2), tile: TILE, sq: 2.1, knob: 0.12,
      muscle: 0.02, back: 0.44, sideBulge: 0.04, taperPow: 0.9, fade: 0.35, fadeV: 0.10
    });
    mesh(b3, mats.hairDark, 'cannon', j2);
    /* the flexor tendon cord down the back of the leg */
    var cord = L.boneY(lens[2] * 0.86, [0.026, 0.019], {
      samples: 6, seg: 9, tile: TILE, knob: 0.03, sq: 2.2, fade: 0.4
    });
    var cn = node(j2, -0.035, -lens[2] * 0.06, 0, 'flexorCord');
    cn.rotation.z = 0.06;
    mesh(cord, mats.hairDark, 'cannon', cn);

    if (front) {
      /* carpus: two rows of short bones + the calloused kneeling pad */
      var carp = new THREE.SphereGeometry(0.088, 14, 10);
      carp.scale(1.0, 0.72, 0.95);
      var kn = node(j2, 0.010, 0.006, 0, 'kneecap');
      mesh(carp, mats.leather, 'knee', kn);
      var pad = new THREE.SphereGeometry(0.055, 12, 10);
      pad.scale(1.15, 0.85, 0.9);
      var pd = node(j2, 0.055, -0.012, 0, 'kneepad');
      pd.rotation.z = 0.2;
      mesh(pad, mats.leatherDark, 'knee', pd);
    } else {
      /* the point of the hock sticks caudal */
      var hockP = new THREE.SphereGeometry(0.062, 12, 10);
      hockP.scale(0.9, 1.15, 0.85);
      var hp = node(j2, -0.050, 0.022, 0, 'hockPoint');
      hp.rotation.z = -0.5;
      mesh(hockP, mats.leather, 'hock', hp);
      /* chestnut: the vestigial digit on the back of the pastern */
      var ches = L.bone([0, 0, 0], [-0.030, -0.055, 0], function (t) {
        return { w: 0.020 * (1 - 0.6 * t) + 0.006, hi: 0.024 * (1 - 0.5 * t), lo: 0.018 * (1 - 0.5 * t),
                 sq: 2.3, fade: 0 };
      }, { samples: 5, seg: 8, tile: TILE, side: [0, 0, 1] });
      var chn = node(j2, -0.030, -lens[2] * 0.42, J.side * 0.010, 'chestnut', 'ZYX');
      chn.rotation.z = -0.5;
      mesh(ches, mats.hoof, 'hock', chn);
    }

    /* --- bone 4: pastern + hoof, all authored in the flat-sole frame --- */
    var j3 = node(j2, 0, -lens[2], 0, 'j4', 'ZYX');
    leg.joints[3] = j3;
    var hoofN = node(j3, 0, -lens[3], 0, 'hoof');
    leg.hoof = hoofN;
    var rest = node(hoofN, 0, 0, 0, 'hoofRest', 'ZYX');
    rest.rotation.z = -abs[3];

    var f = [lens[3] * Math.sin(abs[3]), lens[3] * Math.cos(abs[3])];   /* fetlock, sole frame */
    var past = L.bone(f, [0.052 * (front ? 1 : 0.95), 0.205], function (t) {
      return { w: GIR.lerp(r.foot[0], r.foot[1], t * t), hi: GIR.lerp(r.foot[0], r.foot[1] * 0.95, t),
               lo: GIR.lerp(r.foot[0], r.foot[1], t) * 1.04, sq: 2.05, fade: 0.4 };
    }, { samples: 8, seg: Math.max(10, seg - 3), tile: TILE, side: [0, 0, 1] });
    mesh(past, mats.hairDark, 'pastern', rest);

    mesh(hoofGeo(kind, Math.max(10, seg - 2)), mats.hoof, 'hoof', rest);

    /* coronary band where the skin meets the wall */
    var cor = new THREE.TorusGeometry(0.072, 0.016, 6, 16);
    cor.scale(1.0, 1.15, 0.95);
    var corn = node(rest, 0.045, 0.200, 0, 'coronet', 'ZYX');
    corn.rotation.set(0, 1.30, 0.30);
    mesh(cor, mats.hairDark, 'hoof', corn);

    /* heel bulbs: the two rounded pads a giraffe kneels on */
    var bulb = new THREE.SphereGeometry(0.046, 12, 10);
    bulb.scale(1.05, 0.85, 1.0);
    var bulbN = node(rest, -0.070, 0.052, 0, 'heelBulb');
    mesh(bulb, mats.hoof, 'hoof', bulbN);
    return leg;
  }

  /* ================================================================ build == */
  G.build = function (mats, opts) {
    opts = opts || {};
    var root = node(null, 0, 0, 0, 'giraffe');
    var body = node(root, 0, 0, 0, 'body', 'ZYX');

    /* ---- trunk ---- */
    var T = buildTorso(mats, opts);
    var torso = node(body, 0, 0, 0, 'torso');
    mesh(T.geo, mats.coat, 'body', torso);
    torso.def = T.def;

    var N = buildNeck(mats, opts);
    var neck = node(body, 0, 0, 0, 'neck');
    mesh(N.geo, mats.coat, 'neck', neck);
    neck.def = N.def;
    var mane = node(body, 0, 0, 0, 'mane');
    mesh(N.maneGeo, mats.mane, 'hair', mane);
    neck.maneDef = N.maneDef;
    neck.tipIndex = N.def.rings - 1;
    neck.restTipQ = N.def.restQ[neck.tipIndex].clone();

    /* ---- head ---- */
    var H = buildHead(mats, opts);
    var headJoint = node(body, 0, 0, 0, 'headJoint', 'ZYX');
    headJoint.add(H.obj);
    /* tip frame (X lateral, Y dorsal, Z along the neck axis) -> head space.
       +90 deg about Y brings the neck axis onto the face axis; the small X
       turn declines the face ~29 deg off the neck line. */
    var restQ = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-0.50, -Math.PI / 2, 0, 'XYZ'));

    /* ---- tail ---- */
    var tr = A.joints.tailRoot;
    var tailRoot = node(body, tr[0], tr[1], 0, 'tailRoot', 'ZYX');
    var t1 = L.boneY(0.36, [0.058, 0.044], { samples: 7, seg: 10, tile: TILE, sq: 2.2,
      knob: 0.07, fade: 0.05 });
    mesh(t1, mats.coat, 'tail', tailRoot);
    var tailMid = node(tailRoot, 0, -0.36, 0, 'tailMid', 'ZYX');
    var t2 = L.boneY(0.33, [0.044, 0.030], { samples: 7, seg: 10, tile: TILE, sq: 2.2,
      knob: 0.05, fade: 0 });
    mesh(t2, mats.coat, 'tail', tailMid);
    var tailTip = node(tailMid, 0, -0.33, 0, 'tailTip', 'ZYX');
    var t3 = L.boneY(0.26, [0.030, 0.017], { samples: 6, seg: 9, tile: TILE, sq: 2.2,
      knob: 0.04, fade: 0 });
    mesh(t3, mats.coat, 'tail', tailTip);
    var switchGeo = L.bone([0, 0, 0], [-0.045, -0.34, 0], function (t) {
      return { w: 0.055 * (1 - 0.80 * t) * GIR.hump(t * 0.75 + 0.24) + 0.004,
               hi: 0.05 * (1 - 0.75 * t) + 0.003, lo: 0.045 * (1 - 0.7 * t) + 0.003,
               sq: 2.7, fade: 0 };
    }, { samples: 9, seg: 10, tile: TILE, side: [0, 0, 1] });
    var switchN = node(tailTip, 0, -0.25, 0, 'switch', 'ZYX');
    switchN.rotation.z = 0.22;
    mesh(switchGeo, mats.hairDark, 'tuft', switchN);
    var sw2 = L.bone([0, 0, 0], [0.030, -0.30, 0], function (t) {
      return { w: 0.042 * (1 - 0.85 * t) * GIR.hump(t * 0.8 + 0.2) + 0.003,
               hi: 0.036 * (1 - 0.7 * t) + 0.002, lo: 0.03 * (1 - 0.7 * t) + 0.002,
               sq: 2.7, fade: 0 };
    }, { samples: 8, seg: 9, tile: TILE, side: [1, 0, 0] });
    var sw2N = node(tailTip, 0, -0.24, 0.012, 'switch2', 'ZYX');
    sw2N.rotation.z = -0.15;
    mesh(sw2, mats.hairDark, 'tuft', sw2N);

    /* ---- limbs ---- */
    opts.parent = body;
    var J = A.joints;
    var legs = {};
    legs.LF = buildLeg(mats, opts, 'LF', 'fore', { a: J.shoulder, b: J.elbow, c: J.carpus, d: J.fetlockF, e: J.toeF, side: -1 });
    legs.RF = buildLeg(mats, opts, 'RF', 'fore', { a: J.shoulder, b: J.elbow, c: J.carpus, d: J.fetlockF, e: J.toeF, side: 1 });
    legs.LH = buildLeg(mats, opts, 'LH', 'hind', { a: J.hip, b: J.stifle, c: J.hock, d: J.fetlockH, e: J.toeH, side: -1 });
    legs.RH = buildLeg(mats, opts, 'RH', 'hind', { a: J.hip, b: J.stifle, c: J.hock, d: J.fetlockH, e: J.toeH, side: 1 });
    delete opts.parent;

    var rig = {
      root: root, body: body,
      torso: torso, neck: neck,
      head: {
        joint: headJoint, obj: H.obj, restQ: restQ,
        ears: H.ears, eyes: H.eyes, jaw: H.jaw, nostrils: H.nostrils
      },
      tail: { root: tailRoot, mid: tailMid, tip: tailTip, switch: switchN },
      legs: legs,
      measures: null, info: { tris: 0, meshes: 0 }
    };
    root.updateMatrixWorld(true);
    rig.measures = measure(rig);
    root.traverse(function (o) {
      if (o.isMesh) {
        rig.info.meshes++;
        var g = o.geometry;
        rig.info.tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      }
    });
    return rig;
  };

  /* ------------------------------------------------------------ measures -- */
  function measure(rig) {
    var J = A.joints, box = G.bodyBounds(rig), sz = box.getSize(new THREE.Vector3());
    var fore = rig.legs.LF.lengths, hind = rig.legs.LH.lengths;
    return {
      withersHeight: +J.withers[1].toFixed(2),
      totalHeight: +box.max.y.toFixed(2),
      bodyLength: +sz.x.toFixed(2),
      breadth: +sz.z.toFixed(2),
      neckLength: +(A.drop(J.withers, J.headRoot)).toFixed(2),
      headLength: 0.80,
      foreColumn: +(fore[0] + fore[1] + fore[2] + fore[3]).toFixed(2),
      hindColumn: +(hind[0] + hind[1] + hind[2] + hind[3]).toFixed(2),
      carpusHeight: +J.carpus[1].toFixed(2),
      fetlockHeight: +J.fetlockF[1].toFixed(2),
      hoofContact: { heel: HHEEL, toe: HTOE }
    };
  }
  G.measure = measure;

  G.bodyBounds = function (rig) {
    var box = new THREE.Box3(), v = new THREE.Vector3();
    rig.root.updateMatrixWorld(true);
    rig.root.traverse(function (o) {
      if (!o.isMesh || !o.visible) return;
      var geo = o.geometry, pos = geo.attributes && geo.attributes.position;
      if (!pos) return;
      var n = pos.count, step = n > 1500 ? 3 : 1;
      for (var i = 0; i < n; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        box.expandByPoint(v);
      }
    });
    return box;
  };

  G.skeletonSummary = function (rig) {
    var out = {};
    for (var k in rig.legs) {
      var l = rig.legs[k];
      out[k] = {
        kind: l.kind,
        lengths: l.lengths.map(function (x) { return +x.toFixed(3); }),
        restDeg: l.restAbs.map(function (x) { return +(x / DEG).toFixed(1); }),
        reach: +(l.lengths[0] + l.lengths[1] + l.lengths[2]).toFixed(3),
        anchor: l.anchor.map(function (x) { return +x.toFixed(3); }),
        nominal: l.nominal
      };
    }
    out.measures = rig.measures;
    out.tris = Math.round(rig.info.tris);
    out.meshes = rig.info.meshes;
    return out;
  };

})(window.GIR);
