/* Procedural giraffe: skeleton definition + skinned surface generation.
   Convention: Y up, +Z forward (walk direction), +X = animal's LEFT.
   All bones have identity rest rotations (translation-only bind pose), which
   makes the runtime "aim" rig in rig.js exact and simple. */
(function (global) {
  'use strict';
  var THREE = global.THREE;
  var V3 = THREE.Vector3;

  // ---------------------------------------------------------------- skeleton
  // [name, parent, x, y, z]
  function skeletonSpec() {
    var S = [
      ['root', null, 0, 2.600, -1.050],

      ['spineA', 'root', 0, 2.700, -0.700],
      ['spineB', 'spineA', 0, 2.800, -0.200],
      ['spineC', 'spineB', 0, 2.885, 0.300],
      ['withers', 'spineC', 0, 2.975, 0.720],
      ['chest', 'withers', 0, 2.920, 1.000],

      ['neck1', 'chest', 0, 3.225, 1.105],
      ['neck2', 'neck1', 0, 3.550, 1.210],
      ['neck3', 'neck2', 0, 3.880, 1.310],
      ['neck4', 'neck3', 0, 4.210, 1.408],
      ['neck5', 'neck4', 0, 4.520, 1.492],
      ['neck6', 'neck5', 0, 4.800, 1.562],
      ['headBase', 'neck6', 0, 4.995, 1.618],
      ['headTip', 'headBase', 0, 4.845, 2.012],
      ['noseEnd', 'headTip', 0, 4.800, 2.112],

      ['tail1', 'root', 0, 2.620, -1.215],
      ['tail2', 'tail1', 0, 2.430, -1.370],
      ['tail3', 'tail2', 0, 2.060, -1.432],
      ['tail4', 'tail3', 0, 1.700, -1.455],
      ['tailTip', 'tail4', 0, 1.410, -1.465]
    ];
    // Legs: side L = +X, R = -X
    [['L', 1], ['R', -1]].forEach(function (p) {
      var sfx = '.' + p[0], s = p[1];
      S.push(
        // foreleg: scapula high on the ribcage, glenoid deep inside the chest.
        // The elbow sits just below the brisket, the carpus ("knee") near
        // mid-leg; the humerus slopes back and the forearm forward, which both
        // matches anatomy and leaves the IK chain ~8% of slack to flex into.
        ['scap' + sfx, 'withers', 0.250 * s, 2.800, 0.840],
        ['shldr' + sfx, 'scap' + sfx, 0.318 * s, 2.450, 0.710],
        ['elbow' + sfx, 'shldr' + sfx, 0.340 * s, 1.880, 0.400],
        ['carpus' + sfx, 'elbow' + sfx, 0.350 * s, 1.070, 0.730],
        // long pastern: the fetlock sits well clear of the ground, which both
        // matches giraffe anatomy and shortens the shoulder->fetlock drop so a
        // near-straight limb still has reach to spare fore and aft
        ['fetF' + sfx, 'carpus' + sfx, 0.350 * s, 0.395, 0.628],
        ['hoofF' + sfx, 'fetF' + sfx, 0.350 * s, 0.120, 0.690],
        ['toeF' + sfx, 'hoofF' + sfx, 0.350 * s, 0.006, 0.772],

        // hind leg: femur forward-down, tibia back-down, cannon forward-down
        ['hip' + sfx, 'root', 0.285 * s, 2.450, -0.950],
        ['stifle' + sfx, 'hip' + sfx, 0.325 * s, 1.730, -0.600],
        ['hock' + sfx, 'stifle' + sfx, 0.330 * s, 0.990, -1.015],
        ['fetH' + sfx, 'hock' + sfx, 0.330 * s, 0.395, -0.890],
        ['hoofH' + sfx, 'fetH' + sfx, 0.330 * s, 0.120, -0.828],
        ['toeH' + sfx, 'hoofH' + sfx, 0.330 * s, 0.006, -0.735],

        ['oss' + sfx, 'headBase', 0.072 * s, 5.075, 1.572],
        ['ossTip' + sfx, 'oss' + sfx, 0.094 * s, 5.285, 1.540],
        // ears sweep out, back and slightly up from behind the ossicones
        ['ear' + sfx, 'headBase', 0.098 * s, 5.000, 1.520],
        ['earTip' + sfx, 'ear' + sfx, 0.300 * s, 5.075, 1.268]
      );
    });
    return S;
  }

  function buildSkeleton() {
    var spec = skeletonSpec();
    var bones = [], byName = {}, world = {}, order = [];
    spec.forEach(function (d) {
      var b = new THREE.Bone();
      b.name = d[0];
      byName[d[0]] = b;
      world[d[0]] = new V3(d[2], d[3], d[4]);
      bones.push(b);
      order.push(d);
    });
    order.forEach(function (d) {
      var b = byName[d[0]];
      if (d[1]) {
        byName[d[1]].add(b);
        b.position.copy(world[d[0]]).sub(world[d[1]]);
        b.userData.parentName = d[1];
      } else {
        b.position.copy(world[d[0]]);
      }
      b.userData.bindWorld = world[d[0]].clone();
    });
    var rootBone = byName['root'];
    rootBone.updateMatrixWorld(true);
    var skeleton = new THREE.Skeleton(bones);
    var index = {};
    bones.forEach(function (b, i) { index[b.name] = i; });
    return { skeleton: skeleton, bones: bones, byName: byName, index: index, world: world, root: rootBone };
  }

  // ------------------------------------------------------------- merge utils
  var ATTRS = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight', 'aPattern', 'aFur'];
  var SIZES = { position: 3, normal: 3, uv: 2, skinIndex: 4, skinWeight: 4, aPattern: 1, aFur: 1 };

  function mergeGeos(list) {
    var totalV = 0, totalI = 0;
    list.forEach(function (g) { totalV += g.attributes.position.count; totalI += g.index.count; });
    var out = new THREE.BufferGeometry();
    var buf = {};
    ATTRS.forEach(function (a) {
      buf[a] = a === 'skinIndex' ? new Uint16Array(totalV * SIZES[a]) : new Float32Array(totalV * SIZES[a]);
    });
    var idx = (totalV > 65535) ? new Uint32Array(totalI) : new Uint16Array(totalI);
    var vo = 0, io = 0;
    list.forEach(function (g) {
      var c = g.attributes.position.count;
      ATTRS.forEach(function (a) {
        var src = g.attributes[a], sz = SIZES[a];
        if (!src) return;
        for (var i = 0; i < c * sz; i++) buf[a][vo * sz + i] = src.array[i];
      });
      var gi = g.index.array;
      for (var j = 0; j < gi.length; j++) idx[io + j] = gi[j] + vo;
      vo += c; io += gi.length;
    });
    ATTRS.forEach(function (a) {
      out.setAttribute(a, new THREE.BufferAttribute(buf[a], SIZES[a]));
    });
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }

  // --------------------------------------------------------------- the model
  function build(opts) {
    opts = opts || {};
    var detail = opts.detail === undefined ? 1 : opts.detail;
    var sk = buildSkeleton();
    var W = sk.world, IDX = sk.index;
    var group = new THREE.Group();

    function jp(name) { return W[name].clone(); }
    function jl(names) { return names.map(jp); }
    function bi(names) { return names.map(function (n) { return IDX[n]; }); }

    var coatParts = [], darkParts = [], blackParts = [], hornParts = [], eyeParts = [];

    // ===== pattern mask: 1 = patched coat, 0 = plain cream/tan =====
    // Giraffe: patches cover body, neck, upper legs; lower legs, belly and
    // face are plain; muzzle/eye region unpatterned.
    var noise = new global.Noise.ValueNoise2D(90210);
    function patternMask(x, y, z) {
      // Patches run almost all the way down the legs (only the pasterns and
      // the hooves are plain), so keep the leg fade low and late.
      // patches reach right down to the pasterns, fading only over the fetlock
      var legFade = 0.55 + 0.45 * THREE.MathUtils.smoothstep(y, 0.34, 0.80);
      // Ventral (belly) fade. This must only affect the UNDERSIDE OF THE BARREL:
      // the legs pass through the same z range, so gating on z alone would also
      // wash out the legs. Restrict it to the torso's own height band.
      var bellyY = 2.30 + 0.10 * Math.cos(z * 1.1);
      var inBarrel = (z > -1.25 && z < 1.15 && y > bellyY - 0.45) ? 1 : 0;
      var belly = inBarrel
        ? (0.40 + 0.60 * THREE.MathUtils.smoothstep(y, bellyY - 0.26, bellyY + 0.26))
        : 1;
      // the face is plain; the fade starts above the eyes
      var headFade = 1 - THREE.MathUtils.smoothstep(y + z * 0.45, 5.42, 5.80);
      var p = Math.min(legFade, belly);
      p = Math.min(p, Math.max(0.0, headFade));
      // ragged boundary
      p += 0.14 * noise.fbm(x * 6 + z * 3, y * 6, 3);
      return THREE.MathUtils.clamp(p, 0, 1);
    }
    function furMask(x, y) {
      // hooves/muzzle are smooth; rest furry
      return THREE.MathUtils.clamp(THREE.MathUtils.smoothstep(y, 0.10, 0.45), 0.15, 1);
    }

    // ============================ TORSO ============================
    (function () {
      var names = ['tail1', 'root', 'spineA', 'spineB', 'spineC', 'withers', 'chest'];
      var joints = jl(names);
      // shift centreline down so the spine sits near the dorsal surface
      var drop = [0.10, 0.17, 0.20, 0.22, 0.22, 0.20, 0.16];
      joints.forEach(function (p, i) { p.y -= drop[i]; });
      // rump slightly forward-shifted for a rounded croup
      var radii = [
        { rx: 0.175, ryUp: 0.195, ryDown: 0.215, k: 1.0 },  // tail1 / rump end
        { rx: 0.300, ryUp: 0.300, ryDown: 0.355, k: 0.88 }, // pelvis
        { rx: 0.335, ryUp: 0.315, ryDown: 0.420, k: 0.86 },
        { rx: 0.350, ryUp: 0.330, ryDown: 0.510, k: 0.84 }, // flank
        { rx: 0.365, ryUp: 0.345, ryDown: 0.570, k: 0.84 }, // ribcage
        { rx: 0.350, ryUp: 0.340, ryDown: 0.575, k: 0.86 }, // withers / deep chest
        { rx: 0.245, ryUp: 0.245, ryDown: 0.430, k: 0.92 }  // chest front
      ];
      var g = global.Geom.buildTube({
        joints: joints, radii: radii, radial: Math.round(44 * detail), spacing: 0.045,
        refAxis: new V3(0, 1, 0), capStart: true, capEnd: true, capScale: 0.85,
        boneIndices: bi(names), blend: 1.35,
        pattern: patternMask, fur: furMask,
        profile: function (s, ang, R) {
          // ang: 0 = +up, PI = down ; sin(ang) = side
          var up = Math.cos(ang), side = Math.sin(ang);
          var e = 0;
          // withers hump (dorsal ridge between s=4.2..5.6)
          var wq = Math.exp(-Math.pow((s - 4.85) / 0.95, 2));
          e += 0.085 * wq * Math.max(0, up) * Math.max(0, up);
          // dorsal spine ridge
          e += 0.018 * Math.pow(Math.max(0, up), 6);
          // belly crease / sternum keel
          var dn = Math.max(0, -up);
          e += 0.030 * Math.pow(dn, 5) * Math.exp(-Math.pow((s - 4.6) / 1.6, 2));
          // shoulder/haunch muscle bulges on the sides
          var sideAmt = Math.abs(side);
          e += 0.055 * Math.exp(-Math.pow((s - 1.15) / 0.75, 2)) * Math.pow(sideAmt, 2) * THREE.MathUtils.smoothstep(up, -0.9, 0.5);
          e += 0.045 * Math.exp(-Math.pow((s - 4.55) / 0.70, 2)) * Math.pow(sideAmt, 2);
          // slight rib undulation
          e += 0.006 * Math.sin(s * 11.0) * Math.pow(sideAmt, 2) * Math.exp(-Math.pow((s - 3.6) / 1.3, 2));
          return e;
        }
      });
      coatParts.push(g);
    })();

    // ============================= NECK =============================
    var neckNames = ['chest', 'neck1', 'neck2', 'neck3', 'neck4', 'neck5', 'neck6', 'headBase'];
    (function () {
      var joints = jl(neckNames);
      var radii = [
        { rx: 0.280, ryUp: 0.270, ryDown: 0.330, k: 0.92 },
        { rx: 0.235, ryUp: 0.230, ryDown: 0.250, k: 0.95 },
        { rx: 0.205, ryUp: 0.215, ryDown: 0.205, k: 0.97 },
        { rx: 0.185, ryUp: 0.205, ryDown: 0.180, k: 1.0 },
        { rx: 0.170, ryUp: 0.195, ryDown: 0.162, k: 1.0 },
        { rx: 0.158, ryUp: 0.183, ryDown: 0.148, k: 1.0 },
        { rx: 0.145, ryUp: 0.165, ryDown: 0.132, k: 1.0 },
        { rx: 0.120, ryUp: 0.130, ryDown: 0.112, k: 1.0 }
      ];
      var g = global.Geom.buildTube({
        joints: joints, radii: radii, radial: Math.round(36 * detail), spacing: 0.05,
        // cap the top: it is hidden inside the head but must not leave a hole
        refAxis: new V3(0, 1, 0), capStart: false, capEnd: true, capScale: 0.5,
        boneIndices: bi(neckNames), blend: 1.3,
        pattern: patternMask, fur: furMask,
        profile: function (s, ang) {
          var up = Math.cos(ang), side = Math.sin(ang);
          var e = 0;
          // nuchal ligament crest along the dorsal line
          e += 0.030 * Math.pow(Math.max(0, up), 3) * THREE.MathUtils.smoothstep(s, 0.4, 1.6);
          // trapezius flare where the neck meets the withers
          e += 0.075 * Math.exp(-Math.pow(s / 0.75, 2)) * Math.pow(Math.abs(side), 1.5);
          // throat / jugular groove
          e -= 0.012 * Math.pow(Math.max(0, -up), 4) * THREE.MathUtils.smoothstep(s, 4.0, 6.5);
          return e;
        }
      });
      coatParts.push(g);
    })();

    // ============================= MANE =============================
    (function () {
      // The mane stops at the nape; it must not run onto the face.
      var maneBones = ['chest', 'neck1', 'neck2', 'neck3', 'neck4', 'neck5', 'neck6'];
      var pts = jl(maneBones);
      // last point pulled back toward neck6 so the brush ends behind the poll
      pts[6] = pts[5].clone().lerp(pts[6], 0.82);
      // Offset along dorsal normal of the neck tube
      var rUp = [0.265, 0.228, 0.212, 0.202, 0.192, 0.180, 0.158];
      var joints = [], radii = [];
      for (var i = 0; i < pts.length; i++) {
        var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        var tan = new V3().subVectors(b, a).normalize();
        var side = new V3().crossVectors(tan, new V3(0, 1, 0)).normalize();
        var up = new V3().crossVectors(side, tan).normalize();
        // Centre the brush ON the neck surface and let most of its section sit
        // inside the neck, so only a low crest shows. Both ends taper to zero
        // so no cylinder cap is ever visible.
        joints.push(pts[i].clone().add(up.clone().multiplyScalar(rUp[i] * 0.92)));
        var t = i / (pts.length - 1);
        var env = Math.pow(Math.sin(Math.PI * THREE.MathUtils.clamp(t * 0.88 + 0.10, 0, 1)), 0.6);
        radii.push({
          rx: 0.004 + 0.030 * env,     // narrow front-to-back
          ryUp: 0.004 + 0.052 * env,   // low crest above the skin
          ryDown: 0.070,               // buried in the neck
          k: 0.85
        });
      }
      var g = global.Geom.buildTube({
        joints: joints, radii: radii, radial: Math.round(18 * detail), spacing: 0.028,
        refAxis: new V3(0, 1, 0), capStart: false, capEnd: false,
        boneIndices: bi(maneBones), blend: 1.3,
        pattern: 0.0, fur: 1.0,
        profile: function (s, ang) {
          // ragged hair tufts along the crest (kept subtle so it stays a brush)
          var up = Math.cos(ang);
          return 0.010 * Math.max(0, up) * (Math.sin(s * 30.0) * 0.5 + 0.5);
        }
      });
      darkParts.push(g);
    })();

    // ============================= HEAD =============================
    (function () {
      // The head is built as one smooth tube running along the SKULL axis
      // (headBase -> noseEnd). It starts behind headBase, buried inside the
      // top of the neck, so the two surfaces simply intersect instead of
      // forming a crease at the poll.
      var hb = jp('headBase'), ne = jp('noseEnd'), ht = jp('headTip');
      var axis = new V3().subVectors(ne, hb).normalize();
      var back = hb.clone().addScaledVector(axis, -0.185);   // inside the neck
      var occ = hb.clone().addScaledVector(axis, -0.045);    // occiput
      var mid = hb.clone().lerp(ht, 0.55);                   // orbits / cheek
      var joints = [back, occ, hb, mid, ht, ne];
      var boneNames = ['neck6', 'headBase', 'headBase', 'headBase', 'headTip', 'noseEnd'];
      var radii = [
        { rx: 0.082, ryUp: 0.090, ryDown: 0.088, k: 1.0 },   // buried root
        { rx: 0.108, ryUp: 0.126, ryDown: 0.116, k: 1.0 },   // occiput
        { rx: 0.113, ryUp: 0.133, ryDown: 0.130, k: 0.97 },  // cranium / orbits
        { rx: 0.098, ryUp: 0.104, ryDown: 0.122, k: 0.95 },  // cheek + jaw
        { rx: 0.064, ryUp: 0.070, ryDown: 0.082, k: 0.98 },  // muzzle
        { rx: 0.053, ryUp: 0.052, ryDown: 0.057, k: 1.0 }    // nose
      ];
      var gh = global.Geom.buildTube({
        joints: joints, radii: radii, radial: Math.round(34 * detail), spacing: 0.022,
        refAxis: new V3(0, 1, 0), capStart: false, capEnd: true, capScale: 0.80,
        boneIndices: bi(boneNames), blend: 1.3,
        pattern: function (x, y, z) {
          // tan over the cranium and cheeks, fading to a pale muzzle
          return 0.52 * (1 - THREE.MathUtils.smoothstep(z - (y - 4.9) * 0.35, 1.66, 1.97));
        },
        fur: function (x, y, z) {
          // bare leathery muzzle around the nostrils/lips
          return THREE.MathUtils.clamp(1.0 - 0.75 * THREE.MathUtils.smoothstep(z, 1.90, 2.05), 0.3, 1);
        },
        profile: function (s, ang) {
          var up = Math.cos(ang), side = Math.sin(ang), sideA = Math.abs(side);
          var e = 0;
          // orbital bulges: giraffe eyes sit in prominent lateral sockets
          e += 0.034 * Math.exp(-Math.pow((s - 1.78) / 0.32, 2)) * Math.pow(Math.max(0, sideA - 0.26), 0.70) * (0.55 + 0.45 * up);
          // masseter / cheek
          e += 0.022 * Math.exp(-Math.pow((s - 2.75) / 0.60, 2)) * Math.pow(sideA, 2.0);
          // lower jaw depth
          e += 0.026 * Math.exp(-Math.pow((s - 2.95) / 0.75, 2)) * Math.pow(Math.max(0, -up), 1.8);
          // slight dip of the nasal bridge, then nostril flare
          e -= 0.010 * Math.exp(-Math.pow((s - 3.55) / 0.45, 2)) * Math.pow(Math.max(0, up), 2);
          e += 0.014 * Math.exp(-Math.pow((s - 4.35) / 0.40, 2)) * Math.pow(sideA, 2);
          // chin / lower lip
          e += 0.012 * Math.exp(-Math.pow((s - 4.5) / 0.45, 2)) * Math.pow(Math.max(0, -up), 2.5);
          return e;
        }
      });
      coatParts.push(gh);
    })();

    // ====================== OSSICONES / EARS / EYES ======================
    [['L', 1], ['R', -1]].forEach(function (p) {
      var sfx = '.' + p[0], s = p[1];

      // ossicone: short bony horn with a tufted knob
      var on = ['headBase', 'oss' + sfx, 'ossTip' + sfx];
      var oj = jl(on);
      oj[0] = jp('headBase').clone().lerp(oj[1], 0.35);
      var og = global.Geom.buildTube({
        joints: oj,
        radii: [{ rx: 0.062, ryUp: 0.062, ryDown: 0.062 }, { rx: 0.036, ryUp: 0.036, ryDown: 0.036 }, { rx: 0.040, ryUp: 0.040, ryDown: 0.040 }],
        radial: Math.round(18 * detail), spacing: 0.03, refAxis: new V3(0, 0, 1),
        capStart: false, capEnd: true, capScale: 1.1,
        boneIndices: bi(on), blend: 1.2, pattern: 0.0, fur: 1.0
      });
      hornParts.push(og);

      // ear: a broad cupped leaf. The tube axis runs out along the ear, the
      // cross-section is a thin wide lens (the ear blade) that is cupped by the
      // profile function so it is concave on the inner (forward) face.
      var en = ['headBase', 'ear' + sfx, 'earTip' + sfx];
      var ej = jl(en);
      ej[0] = jp('headBase').clone().lerp(ej[1], 0.45);
      // add a mid sample so the blade can widen then taper
      // sample the blade densely so the outline can be a smooth rounded leaf
      var ejoints = [ej[0]], enames = ['headBase'], eradii = [
        { rx: 0.046, ryUp: 0.046, ryDown: 0.046, k: 1.0 }   // fleshy root
      ];
      var NB = 6;
      for (var q = 0; q <= NB; q++) {
        var t = q / NB;
        var pnt = ej[1].clone().lerp(ej[2], t);
        pnt.y += Math.sin(Math.PI * t) * 0.030 - t * t * 0.028;  // gentle droop
        ejoints.push(pnt);
        enames.push(t < 0.5 ? 'ear' + sfx : 'earTip' + sfx);
        // rounded leaf envelope: widest at ~45 % of the length
        var env = Math.pow(Math.sin(Math.PI * Math.pow(THREE.MathUtils.clamp(t * 0.90 + 0.10, 0, 1), 0.78)), 0.72);
        eradii.push({
          rx: 0.006 + 0.005 * env,
          ryUp: 0.012 + 0.064 * env,
          ryDown: 0.012 + 0.060 * env,
          k: 1.30
        });
      }
      // cup the blade: bow the whole ear toward the front of the head so it
      // forms a shallow dish instead of a flat plank
      var earAxis = new V3().subVectors(ej[2], ej[1]).normalize();
      var earCupDir = new V3().crossVectors(earAxis, new V3(0, 1, 0)).normalize();
      if (earCupDir.z < 0) earCupDir.negate();
      for (var cq = 1; cq < ejoints.length; cq++) {
        var ct = (cq - 1) / NB;
        ejoints[cq].addScaledVector(earCupDir, Math.sin(Math.PI * ct) * 0.026);
      }
      var eg = global.Geom.buildTube({
        joints: ejoints, radii: eradii,
        radial: Math.round(20 * detail), spacing: 0.018,
        refAxis: new V3(0, 1, 0),
        capStart: false, capEnd: true, capScale: 0.45,
        boneIndices: bi(enames), blend: 1.25, pattern: 0.0, fur: 1.0
      });
      coatParts.push(eg);

      // eye: large dark glossy globe, set high and wide on the skull and
      // angled outwards (giraffes have near-panoramic vision)
      // Giraffe eyes sit far back and high, on the WIDEST part of the skull,
      // almost laterally -> each eye should read as a profile dome, not a
      // forward-facing pair.
      var eyePos = new V3(0.122 * s, 4.998, 1.648);
      var lookDir = new V3(0.95 * s, 0.14, 0.28).normalize();
      // sink the globe slightly into the socket so only the cornea shows
      var eyeC = eyePos.clone().addScaledVector(lookDir, -0.012);
      var eyeG = new THREE.SphereGeometry(0.040, 22, 18);
      eyeG.scale(1.0, 0.95, 1.0);
      eyeG.translate(eyeC.x, eyeC.y, eyeC.z);
      addSkinAttrs(eyeG, IDX['headBase']);
      eyeParts.push(eyeG);

      // eyelid: a thin ring around the globe, tilted to the eye's axis and
      // pulled back so it reads as a rim rather than a pair of spikes.
      var lid = new THREE.TorusGeometry(0.0400, 0.0055, 8, 28);
      lid.scale(1.0, 0.90, 1.0);
      var lq = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), lookDir);
      lid.applyQuaternion(lq);
      // sit the rim just OUTSIDE the globe's equator; burying it in the skull
      // makes the intersection show up as dark spikes
      var lc = eyeC.clone().addScaledVector(lookDir, 0.006);
      lid.translate(lc.x, lc.y, lc.z);
      addSkinAttrs(lid, IDX['headBase']);
      darkParts.push(lid);

      // nostril: slit-like depression on the side of the muzzle
      var nos = new THREE.SphereGeometry(0.017, 12, 10);
      nos.scale(0.75, 0.85, 1.35);
      nos.translate(0.044 * s, 4.858, 2.055);
      addSkinAttrs(nos, IDX['headTip']);
      darkParts.push(nos);
    });

    // ============================= LEGS =============================
    [['L', 1], ['R', -1]].forEach(function (p) {
      var sfx = '.' + p[0], s = p[1];

      // ---- foreleg ----
      (function () {
        var names = ['scap' + sfx, 'shldr' + sfx, 'elbow' + sfx, 'carpus' + sfx, 'fetF' + sfx, 'hoofF' + sfx];
        var joints = jl(names);
        var radii = [
          { rx: 0.155, ryUp: 0.205, ryDown: 0.220, k: 0.88 },  // scapula blade
          { rx: 0.158, ryUp: 0.200, ryDown: 0.212, k: 0.90 },  // shoulder mass
          { rx: 0.122, ryUp: 0.140, ryDown: 0.150, k: 0.93 },  // elbow
          { rx: 0.082, ryUp: 0.092, ryDown: 0.096, k: 0.98 },  // carpus
          { rx: 0.060, ryUp: 0.065, ryDown: 0.067, k: 1.0 },   // fetlock
          { rx: 0.058, ryUp: 0.060, ryDown: 0.062, k: 1.0 }
        ];
        var g = global.Geom.buildTube({
          joints: joints, radii: radii, radial: Math.round(22 * detail), spacing: 0.04,
          refAxis: new V3(0, 0, 1), capStart: true, capEnd: false, capScale: 0.6,
          boneIndices: bi(names), blend: 1.3,
          pattern: patternMask, fur: furMask,
          profile: function (s2, ang) {
            // ang measured about the leg axis; refAxis +Z so "up"~forward
            var fwd = Math.cos(ang), side = Math.abs(Math.sin(ang));
            var e = 0;
            // triceps bulge behind the shoulder
            e += 0.055 * Math.exp(-Math.pow((s2 - 1.0) / 0.55, 2)) * Math.pow(Math.max(0, -fwd), 1.5);
            // forearm muscle
            e += 0.038 * Math.exp(-Math.pow((s2 - 2.05) / 0.40, 2)) * (0.4 + 0.6 * side);
            // carpus (knee) knob
            e += 0.022 * Math.exp(-Math.pow((s2 - 3.0) / 0.18, 2));
            e += 0.016 * Math.exp(-Math.pow((s2 - 3.02) / 0.22, 2)) * Math.max(0, -fwd);
            // tendon ridge down the back of the cannon
            e += 0.012 * Math.pow(Math.max(0, -fwd), 4) * THREE.MathUtils.smoothstep(s2, 3.1, 3.6);
            // fetlock knob
            e += 0.016 * Math.exp(-Math.pow((s2 - 4.0) / 0.22, 2));
            return e;
          }
        });
        coatParts.push(g);
      })();

      // ---- hind leg ----
      (function () {
        var names = ['hip' + sfx, 'stifle' + sfx, 'hock' + sfx, 'fetH' + sfx, 'hoofH' + sfx];
        var joints = jl(names);
        var radii = [
          { rx: 0.185, ryUp: 0.232, ryDown: 0.252, k: 0.86 },  // haunch
          { rx: 0.128, ryUp: 0.150, ryDown: 0.164, k: 0.92 },  // stifle
          { rx: 0.076, ryUp: 0.090, ryDown: 0.096, k: 0.99 },  // hock
          { rx: 0.058, ryUp: 0.063, ryDown: 0.065, k: 1.0 },
          { rx: 0.056, ryUp: 0.058, ryDown: 0.060, k: 1.0 }
        ];
        var g = global.Geom.buildTube({
          joints: joints, radii: radii, radial: Math.round(22 * detail), spacing: 0.04,
          refAxis: new V3(0, 0, 1), capStart: true, capEnd: false, capScale: 0.6,
          boneIndices: bi(names), blend: 1.3,
          pattern: patternMask, fur: furMask,
          profile: function (s2, ang) {
            var fwd = Math.cos(ang), side = Math.abs(Math.sin(ang));
            var e = 0;
            // hamstring / thigh mass at the back
            e += 0.075 * Math.exp(-Math.pow((s2 - 0.55) / 0.55, 2)) * Math.pow(Math.max(0, -fwd), 1.2);
            e += 0.030 * Math.exp(-Math.pow((s2 - 0.7) / 0.6, 2)) * side;
            // gaskin
            e += 0.038 * Math.exp(-Math.pow((s2 - 1.55) / 0.40, 2)) * (0.3 + 0.7 * Math.max(0, -fwd));
            // hock point (calcaneus) sticking out backwards
            e += 0.030 * Math.exp(-Math.pow((s2 - 2.0) / 0.16, 2)) * (0.3 + 0.9 * Math.max(0, -fwd));
            // tendon
            e += 0.011 * Math.pow(Math.max(0, -fwd), 4) * THREE.MathUtils.smoothstep(s2, 2.1, 2.6);
            e += 0.015 * Math.exp(-Math.pow((s2 - 3.0) / 0.22, 2));
            return e;
          }
        });
        coatParts.push(g);
      })();

      // ---- hooves (cloven, dark keratin) ----
      [['F', 'hoofF' + sfx, 'toeF' + sfx], ['H', 'hoofH' + sfx, 'toeH' + sfx]].forEach(function (h) {
        var a = jp(h[1]), b = jp(h[2]);
        var dir = new V3().subVectors(b, a).normalize();
        var joints = [a.clone().addScaledVector(dir, -0.055), a.clone(), b.clone().addScaledVector(dir, -0.012)];
        var g = global.Geom.buildTube({
          joints: joints,
          radii: [{ rx: 0.060, ryUp: 0.062, ryDown: 0.066, k: 0.95 },
          { rx: 0.070, ryUp: 0.072, ryDown: 0.078, k: 0.85 },
          { rx: 0.072, ryUp: 0.060, ryDown: 0.075, k: 0.75 }],
          radial: Math.round(20 * detail), spacing: 0.02, refAxis: new V3(0, 0, 1),
          capStart: false, capEnd: true, capScale: 0.35,
          boneIndices: bi([h[1], h[1], h[2]]), blend: 1.2, pattern: 0.0, fur: 0.0,
          profile: function (s2, ang) {
            // cleft between the two toes along the front centre
            var side = Math.sin(ang);
            return -0.020 * Math.exp(-Math.pow(side / 0.22, 2)) * THREE.MathUtils.smoothstep(s2, 0.6, 1.4);
          }
        });
        blackParts.push(g);
      });
    });

    // ============================= TAIL =============================
    (function () {
      var names = ['root', 'tail1', 'tail2', 'tail3', 'tail4'];
      var joints = jl(names);
      var g = global.Geom.buildTube({
        joints: joints,
        radii: [{ rx: 0.105, ryUp: 0.105, ryDown: 0.115 }, { rx: 0.062, ryUp: 0.062, ryDown: 0.066 },
        { rx: 0.036, ryUp: 0.036, ryDown: 0.038 }, { rx: 0.024, ryUp: 0.024, ryDown: 0.025 },
        { rx: 0.019, ryUp: 0.019, ryDown: 0.019 }],
        radial: Math.round(16 * detail), spacing: 0.04, refAxis: new V3(0, 0, 1),
        capStart: false, capEnd: false,
        boneIndices: bi(names), blend: 1.25, pattern: patternMask, fur: 1.0
      });
      coatParts.push(g);

      // black tail tuft (long hair switch)
      var tn = ['tail3', 'tail4', 'tailTip'];
      var tj = jl(tn);
      tj.push(jp('tailTip').clone().add(new V3(0, -0.30, -0.01)));
      var tg = global.Geom.buildTube({
        joints: tj,
        radii: [{ rx: 0.026, ryUp: 0.026, ryDown: 0.026 }, { rx: 0.055, ryUp: 0.058, ryDown: 0.058 },
        { rx: 0.064, ryUp: 0.068, ryDown: 0.068 }, { rx: 0.020, ryUp: 0.020, ryDown: 0.020 }],
        radial: Math.round(16 * detail), spacing: 0.025, refAxis: new V3(0, 0, 1),
        capStart: false, capEnd: true, capScale: 0.6,
        boneIndices: bi(['tail3', 'tail4', 'tailTip', 'tailTip']), blend: 1.25,
        pattern: 0.0, fur: 1.0
      });
      blackParts.push(tg);
    })();

    // ---------------------------------------------------------- assemble
    function addSkinAttrs(geo, boneIndex) {
      var c = geo.attributes.position.count;
      var si = new Uint16Array(c * 4), sw = new Float32Array(c * 4);
      var ap = new Float32Array(c), af = new Float32Array(c);
      for (var i = 0; i < c; i++) {
        si[i * 4] = boneIndex; sw[i * 4] = 1;
        ap[i] = 0; af[i] = 0;
      }
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      geo.setAttribute('aPattern', new THREE.BufferAttribute(ap, 1));
      geo.setAttribute('aFur', new THREE.BufferAttribute(af, 1));
      if (!geo.attributes.normal) geo.computeVertexNormals();
      if (!geo.index) {
        var n = c, arr = new Uint16Array(n);
        for (var j = 0; j < n; j++) arr[j] = j;
        geo.setIndex(new THREE.BufferAttribute(arr, 1));
      }
      return geo;
    }

    var coatMat = global.Mat.makeCoatMaterial(opts.coat);
    var darkMat = global.Mat.makeCoatMaterial({
      patchA: 0x55401f, patchB: 0x6b5229, cream: 0x5e4824, cell: 6.0, edge: 0.22,
      furScale: 260, furAmp: 0.6
    });
    darkMat.roughness = 0.85;
    var hornMat = global.Mat.makeCoatMaterial({
      patchA: 0x4b382a, patchB: 0x5c4531, cream: 0x6d5540, cell: 9.0, edge: 0.3,
      furScale: 200, furAmp: 0.35
    });
    // the tail switch and the hooves really are near-black
    var blackMat = global.Mat.makeCoatMaterial({
      patchA: 0x241a12, patchB: 0x2f2318, cream: 0x291e14, cell: 7.0, edge: 0.25,
      furScale: 240, furAmp: 0.55
    });
    var eyeMat = new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 0.08, metalness: 0.0 });

    var meshes = [];
    function addMesh(parts, mat, castS) {
      if (!parts.length) return null;
      var geo = mergeGeos(parts.map(function (g) {
        if (!g.attributes.normal) g.computeVertexNormals();
        return g;
      }));
      geo.computeVertexNormals();
      var m = new THREE.SkinnedMesh(geo, mat);
      m.frustumCulled = false;
      m.castShadow = castS !== false;
      m.receiveShadow = true;
      m.add(sk.root.parent ? sk.root : sk.root);
      m.bind(sk.skeleton);
      meshes.push(m);
      group.add(m);
      return m;
    }

    // the root bone must live in the scene graph exactly once
    group.add(sk.root);
    function addMesh2(parts, mat) {
      if (!parts.length) return null;
      var geo = mergeGeos(parts);
      geo.computeVertexNormals();
      var m = new THREE.SkinnedMesh(geo, mat);
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      m.bind(sk.skeleton, new THREE.Matrix4());
      meshes.push(m);
      group.add(m);
      return m;
    }

    addMesh2(coatParts, coatMat);
    addMesh2(darkParts, darkMat);
    addMesh2(blackParts, blackMat);
    addMesh2(hornParts, hornMat);
    addMesh2(eyeParts, eyeMat);

    return {
      group: group, skeleton: sk.skeleton, bones: sk.bones, byName: sk.byName,
      index: sk.index, bindWorld: sk.world, rootBone: sk.root, meshes: meshes,
      materials: [coatMat, darkMat, blackMat, hornMat]
    };
  }

  global.Giraffe = { build: build };
})(window);
