/* giraffe.js — assembles the giraffe rig from lofted parts. Units: metres,
 * the animal faces +X, ground plane at y = 0. Returns a rig of named groups. */
(function (G) {
  'use strict';

  var UPPER = 0.80, LOWER = 0.92, ANKLE_G = 0.30; // hip->knee, knee->ankle, ankle height

  G.buildGiraffe = function (mats) {
    var uS = 1 / G.COAT_TILE;
    var root = new THREE.Group();
    var body = new THREE.Group();
    root.add(body);

    function mesh(geo, mat, parent) {
      var m = new THREE.Mesh(geo, mat || mats.coat);
      m.castShadow = true; m.receiveShadow = true;
      (parent || body).add(m);
      return m;
    }

    /* ---- torso: barrel rising towards the withers, lighter belly ---- */
    var torsoSpine = [
      { x: -1.82, y: 2.22, rx: 0.46, rz: 0.36 },   // rump (capped)
      { x: -1.40, y: 2.12, rx: 0.55, rz: 0.40 },
      { x: -0.70, y: 2.04, rx: 0.63, rz: 0.43 },   // belly
      { x:  0.10, y: 2.12, rx: 0.62, rz: 0.44 },
      { x:  0.85, y: 2.38, rx: 0.58, rz: 0.44 },   // rising back
      { x:  1.35, y: 2.62, rx: 0.52, rz: 0.42 }    // chest (hidden in neck base)
    ];
    var torso = mesh(G.loft(torsoSpine, {
      cap0: true, cap1: true,
      colorFn: function (x, y) {
        var t = G.smoothstep((1.95 - y) / 0.35) * 0.18;  // lighten the belly
        return [1 + t * 0.25, 1 + t * 0.15, 1 + t * 0.05];
      }
    }));
    // shoulder hump blending back into neck base
    mesh(G.ellipsoid(0.60, 0.20, 0.38), mats.coat).position.set(1.15, 2.80, 0);
    // chest mass filling the neck/torso junction
    mesh(G.ellipsoid(0.40, 0.34, 0.36), mats.coat).position.set(1.02, 2.46, 0);

    /* ---- neck (pivot at the withers) ---- */
    var neckPivot = new THREE.Group();
    neckPivot.position.set(1.30, 2.95, 0);
    neckPivot.rotation.z = 0.14;
    body.add(neckPivot);

    var neckSpine = [
      { x: -0.55, y: -0.40, rx: 0.60, rz: 0.50 },  // buried deep in the chest
      { x: -0.10, y: -0.05, rx: 0.44, rz: 0.36 },
      { x:  0.40, y:  0.30, rx: 0.30, rz: 0.25 },
      { x:  0.85, y:  0.58, rx: 0.245, rz: 0.205 },
      { x:  1.25, y:  0.83, rx: 0.21, rz: 0.18 },
      { x:  1.55, y:  0.99, rx: 0.185, rz: 0.165 }
    ];
    mesh(G.loft(neckSpine, { cap0: true, cap1: true }), mats.coat, neckPivot);
    // dewlap ridge under the neck base
    mesh(G.ellipsoid(0.30, 0.14, 0.16), mats.coat, neckPivot).position.set(-0.05, -0.36, 0);

    // mane: dark fringe along the crest
    var manePts = neckSpine.slice(1).map(function (p) { return { x: p.x, y: p.y, rx: p.rx }; });
    var mane = new THREE.Mesh(G.fin(manePts, { h1: 0.075, h2: 0.03 }), mats.mane);
    mane.castShadow = true;
    neckPivot.add(mane);

    /* ---- head (pivot at the end of the neck) ---- */
    var headPivot = new THREE.Group();
    headPivot.position.set(1.55, 0.99, 0);
    headPivot.rotation.z = -0.18;
    neckPivot.add(headPivot);

    var headSpine = [
      { x: -0.05, y:  0.000, rx: 0.200, rz: 0.185 },
      { x:  0.13, y:  0.060, rx: 0.225, rz: 0.195 },  // forehead
      { x:  0.30, y:  0.045, rx: 0.195, rz: 0.172 },
      { x:  0.46, y:  0.000, rx: 0.165, rz: 0.142 },
      { x:  0.60, y: -0.050, rx: 0.135, rz: 0.115 },
      { x:  0.71, y: -0.075, rx: 0.112, rz: 0.100 }   // muzzle tip
    ];
    mesh(G.loft(headSpine, { cap0: true, cap1: true }), mats.coat, headPivot);
    mesh(G.ellipsoid(0.13, 0.09, 0.13), mats.coat, headPivot).position.set(0.07, 0.145, 0); // poll
    mesh(G.ellipsoid(0.115, 0.078, 0.092), mats.muzzle, headPivot).position.set(0.65, -0.068, 0);

    // ossicones (knobbed horns)
    [-1, 1].forEach(function (s) {
      var g = new THREE.Group();
      g.position.set(0.10, 0.245, 0.055 * s);
      g.rotation.z = -0.12; g.rotation.x = 0.22 * s;
      var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.10, 10), mats.midDark);
      shaft.position.y = 0.05; shaft.castShadow = true;
      var knob = new THREE.Mesh(new THREE.SphereGeometry(0.040, 12, 10), mats.dark);
      knob.position.y = 0.11; knob.scale.y = 0.85; knob.castShadow = true;
      g.add(shaft, knob); headPivot.add(g);
    });

    // ears (patterned blade with dark tip)
    var ears = [];
    [-1, 1].forEach(function (s) {
      var g = new THREE.Group();
      g.position.set(-0.04, 0.115, 0.10 * s);
      g.rotation.y = -1.7 * s;
      var blade = new THREE.Mesh(G.ellipsoid(0.15, 0.024, 0.080), mats.coat);
      blade.position.x = 0.125; blade.castShadow = true;
      var tip = new THREE.Mesh(G.ellipsoid(0.045, 0.02, 0.038), mats.dark);
      tip.position.x = 0.245;
      g.add(blade, tip); headPivot.add(g);
      ears.push(g);
    });

    // eyes + nostrils
    [-1, 1].forEach(function (s) {
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.030, 12, 10), mats.eye);
      eye.position.set(0.232, 0.052, 0.156 * s);
      headPivot.add(eye);
      var glint = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), mats.glint);
      glint.position.set(0.246, 0.068, 0.174 * s);
      headPivot.add(glint);
      var nose = new THREE.Mesh(G.ellipsoid(0.020, 0.014, 0.012), mats.dark);
      nose.position.set(0.575, -0.030, 0.055 * s);
      headPivot.add(nose);
    });

    /* ---- tail (two chained segments + tuft) ---- */
    var tailPivot = new THREE.Group();
    tailPivot.position.set(-1.74, 2.52, 0);
    tailPivot.rotation.z = -0.30;
    body.add(tailPivot);
    mesh(G.loft([
      { x: 0, y: 0, rx: 0.105, rz: 0.095 },
      { x: 0, y: -0.28, rx: 0.075, rz: 0.068 },
      { x: 0, y: -0.50, rx: 0.052, rz: 0.048 }
    ], { cap0: true }), mats.coat, tailPivot);

    var tail2Pivot = new THREE.Group();
    tail2Pivot.position.set(0, -0.50, 0);
    tail2Pivot.rotation.z = -0.35;
    tailPivot.add(tail2Pivot);
    mesh(G.loft([
      { x: 0, y: 0, rx: 0.052, rz: 0.048 },
      { x: 0, y: -0.26, rx: 0.040, rz: 0.037 },
      { x: 0, y: -0.44, rx: 0.033, rz: 0.031 }
    ], { cap1: true }), mats.coat, tail2Pivot);
    var tuft = mesh(new THREE.SphereGeometry(1, 12, 10), mats.dark, tail2Pivot);
    tuft.scale.set(0.06, 0.20, 0.06);
    tuft.position.y = -0.60;

    /* ---- legs ---- */
    function buildLeg(side, front) {
      var hip = new THREE.Group();
      hip.position.set(front ? 1.05 : -1.32, 2.02, 0.26 * side);
      body.add(hip);
      // per-limb UV offset + finer coat on the slim limbs
      var v0 = (side > 0 ? 0.21 : 0.64) + (front ? 0.0 : 0.38);
      var lm = 1 / (G.COAT_TILE / 1.55);

      var upperG = G.loft([
        { x: 0, y: 0, rx: 0.165, rz: 0.150 },
        { x: 0, y: -0.30, rx: 0.148, rz: 0.136 },
        { x: 0, y: -0.55, rx: 0.122, rz: 0.112 },
        { x: 0, y: -UPPER, rx: 0.100, rz: 0.094 }
      ], { cap0: true, cap1: true, v0: v0, uScale: lm });
      mesh(upperG, mats.coat, hip);

      var knee = new THREE.Group();
      knee.position.y = -UPPER;
      hip.add(knee);
      var lowerG = G.loft([
        { x: 0, y: 0, rx: 0.098, rz: 0.093 },
        { x: 0, y: -0.35, rx: 0.082, rz: 0.077 },
        { x: 0, y: -0.65, rx: 0.066, rz: 0.061 },
        { x: 0, y: -LOWER, rx: 0.056, rz: 0.052 }
      ], { cap0: true, cap1: true, v0: v0, uScale: lm });
      mesh(lowerG, mats.coat, knee);
      // joint bulge: carpus forward on forelegs, hock backward on hindlegs
      var bulge = mesh(G.ellipsoid(0.10, 0.095, 0.095), mats.coat, knee);
      bulge.position.set(front ? 0.030 : -0.045, 0.015, 0);

      var ankle = new THREE.Group();
      ankle.position.y = -LOWER;
      knee.add(ankle);
      // pastern (built sloping forward ~35 deg) + hoof
      mesh(G.loft([
        { x: 0.00, y: 0.00, rx: 0.055, rz: 0.052 },
        { x: 0.09, y: -0.09, rx: 0.062, rz: 0.058 },
        { x: 0.155, y: -0.155, rx: 0.075, rz: 0.072 }
      ], { cap0: true }), mats.dark, ankle);
      var hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.084, 0.15, 14), mats.dark);
      hoof.position.set(0.155, -0.230, 0);
      hoof.castShadow = true; hoof.receiveShadow = true;
      ankle.add(hoof);
      var toe = mesh(G.ellipsoid(0.085, 0.07, 0.088), mats.dark, ankle);
      toe.position.set(0.225, -0.245, 0);

      return { hip: hip, knee: knee, ankle: ankle, front: front };
    }

    var legs = {
      FL: buildLeg(1, true),  FR: buildLeg(-1, true),
      RL: buildLeg(1, false), RR: buildLeg(-1, false)
    };

    return {
      root: root, body: body, torso: torso,
      neckPivot: neckPivot, headPivot: headPivot, ears: ears,
      tailPivot: tailPivot, tail2Pivot: tail2Pivot,
      legs: legs,
      dims: { upper: UPPER, lower: LOWER, ankleG: ANKLE_G }
    };
  };

  G.makeMaterials = function (tex) {
    return {
      coat: new THREE.MeshStandardMaterial({
        map: tex.coat, vertexColors: true, roughness: 0.92, metalness: 0
      }),
      mane: new THREE.MeshStandardMaterial({
        color: G.col(0x6b4623), roughness: 0.95, side: THREE.DoubleSide
      }),
      dark: new THREE.MeshStandardMaterial({ color: G.col(0x33261c), roughness: 0.7 }),
      midDark: new THREE.MeshStandardMaterial({ color: G.col(0x54402c), roughness: 0.8 }),
      muzzle: new THREE.MeshStandardMaterial({ color: G.col(0x453226), roughness: 0.75 }),
      eye: new THREE.MeshStandardMaterial({ color: G.col(0x0c0a08), roughness: 0.25 }),
      glint: new THREE.MeshBasicMaterial({ color: G.col(0xfff6e0) })
    };
  };
})(window.G);
