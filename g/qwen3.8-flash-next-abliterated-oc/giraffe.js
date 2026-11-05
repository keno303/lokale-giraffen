// giraffe.js — procedural giraffe model + walking gait.
// The animal paces (same-side legs move together, as giraffes do), walks
// toward +X. Feet are placed with analytic 2-bone inverse kinematics so
// they stay planted during stance instead of sliding.
(function () {
  'use strict';

  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeTexture(canvasEl, repeatX, repeatY) {
    var t = new THREE.CanvasTexture(canvasEl);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  function create(THREE, opts) {
    opts = opts || {};
    var spotCv = Textures.spot(1024);

    function spotMat(repeatX, repeatY) {
      return new THREE.MeshStandardMaterial({
        map: makeTexture(spotCv, repeatX, repeatY),
        roughness: 0.92, metalness: 0.0
      });
    }
    function plainMat(hex, rough) {
      return new THREE.MeshStandardMaterial({
        color: hex, roughness: rough === undefined ? 0.9 : rough, metalness: 0.0
      });
    }

    var matTorso = spotMat(8.2, 2.5);        // sphere UVs: 1 tile = 1 m of hide
    var matBlob = spotMat(3.6, 1.6);         // chest / hump / rump spheres
    var matTail = spotMat(0.6, 1.2);
    var matNeck = spotMat(2.0, 2.2);
    var matLeg  = spotMat(1.3, 1.1);
    var matHead = spotMat(0.55, 0.45);
    var matPale = plainMat(0xd0b184);        // plain cream (lower legs)
    var matEar  = plainMat(0xb08d5e);
    var matDark = plainMat(0x3f2d1f, 0.85);  // hooves, tails, ossicone tufts
    var matMane = plainMat(0x7a542c, 0.95);
    var matEye  = plainMat(0x241a12, 0.4);
    var matMuz  = plainMat(0x5c4d40, 0.8);

    function sphere(r, sx, sy, sz, mat) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), mat);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      return m;
    }
    // Tapered limb segment: top at local origin, extending down -Y.
    function segment(rTop, rBot, len, mat) {
      var g = new THREE.CylinderGeometry(rTop, rBot, len, 16, 1);
      g.translate(0, -len / 2, 0);
      var m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      return m;
    }

    // ---------- hierarchy ----------
    // root (on the ground) > pivot (bob/pitch/roll) > fore + rear (yaw twist)
    var root = new THREE.Group();
    var pivot = new THREE.Group();
    root.add(pivot);
    var fore = new THREE.Group();
    var rear = new THREE.Group();
    pivot.add(fore);
    pivot.add(rear);

    // ---------- torso ----------
    var torso = sphere(1, 1.85, 0.80, 0.70, matTorso);
    torso.position.set(-0.05, 2.10, 0);
    pivot.add(torso);

    var chest = sphere(0.66, 0.85, 0.90, 0.78, matBlob);
    chest.position.set(1.30, 2.35, 0);
    fore.add(chest);

    var hump = sphere(0.62, 1.20, 0.62, 0.86, matBlob);  // shoulder withers hump
    hump.position.set(1.15, 2.66, 0);
    fore.add(hump);

    var loin = sphere(0.68, 1.0, 0.92, 0.88, matBlob);   // loin filler
    loin.position.set(-0.95, 2.22, 0);
    pivot.add(loin);

    var rump = sphere(0.68, 1.02, 0.85, 0.88, matBlob);
    rump.position.set(-1.72, 2.14, 0);
    rear.add(rump);

    // ---------- neck & head ----------
    var NECK_TILT = -0.61; // ~35 deg forward of vertical
    var neck = new THREE.Group();
    neck.position.set(1.48, 2.66, 0);
    neck.rotation.z = NECK_TILT;
    fore.add(neck);

    var neckMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.34, 2.05, 20, 1), matNeck);
    neckMesh.geometry.translate(0, 2.05 / 2 - 0.06, 0);
    neckMesh.castShadow = true;
    neck.add(neckMesh);

    var neckBase = sphere(0.42, 0.95, 0.8, 0.85, matNeck); // blend into withers
    neckBase.position.set(0.02, 0.02, 0);
    neck.add(neckBase);

    var dewlap = sphere(0.16, 0.5, 0.9, 0.7, matNeck); // throat bulge
    dewlap.position.set(-0.14, 0.55, 0);
    neck.add(dewlap);

    var mane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.75, 0.09), matMane);
    mane.position.set(-0.27, 1.05, 0);
    mane.rotation.z = 0.03; // follow the neck taper so the crest stays flush
    neck.add(mane);

    var head = new THREE.Group();
    head.position.set(0, 1.94, 0);
    head.rotation.z = -NECK_TILT - 0.06; // hold the head ~horizontal
    neck.add(head);

    var poll = sphere(0.24, 1, 0.9, 1, matNeck); // blend neck top into skull
    poll.position.set(-0.02, 0.06, 0);
    head.add(poll);

    var skull = sphere(0.24, 1.25, 0.85, 0.9, matHead);
    skull.position.set(0.12, 0.04, 0);
    head.add(skull);

    var muzzleMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.13, 0.38, 20, 1), matHead);
    muzzleMesh.geometry.rotateZ(Math.PI / 2);
    muzzleMesh.position.set(0.48, 0.0, 0);
    muzzleMesh.scale.set(1, 1, 0.92);
    muzzleMesh.castShadow = true;
    head.add(muzzleMesh);

    var noseTip = sphere(0.115, 1.0, 0.85, 0.82, matMuz);
    noseTip.position.set(0.65, 0.0, 0);
    head.add(noseTip);

    [-1, 1].forEach(function (s) {
      var eye = sphere(0.047, 1, 1.15, 1, matEye);
      eye.position.set(0.24, 0.08, s * 0.175);
      head.add(eye);

      var brow = sphere(0.05, 0.7, 0.4, 0.7, matDark); // brow ridge
      brow.position.set(0.24, 0.125, s * 0.155);
      head.add(brow);

      var nostril = sphere(0.022, 1, 1, 1, matDark);
      nostril.position.set(0.66, 0.05, s * 0.055);
      head.add(nostril);

      // Ossicone: short stalk with dark knob (males' are bald-topped).
      var os = new THREE.Group();
      os.position.set(0.02, 0.26, s * 0.09);
      os.rotation.x = s * 0.16;
      os.rotation.z = -0.12;
      head.add(os);
      var stalk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.042, 0.15, 10), matHead);
      stalk.position.y = 0.075;
      os.add(stalk);
      var knob = sphere(0.048, 1, 0.9, 1, matDark);
      knob.position.y = 0.16;
      os.add(knob);

      // Ear: leaf angled out, back and slightly down.
      var ear = new THREE.Group();
      ear.position.set(-0.07, 0.13, s * 0.13);
      ear.rotation.y = -s * 1.3;
      ear.rotation.x = s * 0.5;
      head.add(ear);
      var blade = sphere(0.13, 0.5, 0.12, 0.95, matEar);
      blade.position.set(0, 0, s * 0.15);
      ear.add(blade);
    });

    // ---------- tail ----------
    var tail = new THREE.Group();
    tail.position.set(-2.42, 2.34, 0);
    tail.rotation.z = -0.5; // hangs down and back (-X is rear)
    rear.add(tail);
    var tailSeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.028, 0.95, 10), matTail);
    tailSeg.geometry.translate(0, -0.475, 0);
    tailSeg.castShadow = true;
    tail.add(tailSeg);
    var tuft = sphere(0.06, 0.9, 2.8, 0.9, matDark);    tuft.position.set(0, -1.02, 0);
    tail.add(tuft);

    // ---------- legs ----------
    // 2-bone IK in the sagittal (X-Y) plane. s = +1: middle joint bulges
    // forward (front knees/carpus); s = -1: bulges backward (hocks).
    function makeLeg(hx, hy, l1, l2, s, front) {
      var hip = new THREE.Group();
      hip.position.set(hx, hy, 0);
      var knee = new THREE.Group();
      knee.position.y = -l1;
      var ankle = new THREE.Group();
      ankle.position.y = -l2;

      var upper = segment(l1 * 0.18, l1 * 0.125, l1, matLeg);
      hip.add(upper);
      var kneeb = sphere(l2 * 0.155, 1, 1, 0.9, matLeg);
      knee.add(kneeb);
      var lower = segment(l2 * 0.145, l2 * 0.10, l2, matPale);
      knee.add(lower);
      var ankleb = sphere(0.075, 1, 1, 0.9, matPale);
      ankle.add(ankleb);
      var hoof = new THREE.Mesh(
        new THREE.CylinderGeometry(0.10, 0.115, 0.15, 14), matDark);
      hoof.geometry.translate(0, -0.085, 0);
      hoof.scale.z = 0.85;
      hoof.castShadow = true;
      ankle.add(hoof);

      hip.add(knee);
      knee.add(ankle);
      return { hip: hip, knee: knee, ankle: ankle, l1: l1, l2: l2, s: s };
    }

    var HOOF_H = 0.14; // ankle height above ground
    var legs = [
      // name, hip x, hip y, z, l1, l2, side, front, phase offset
      { n: 'LF', x: 1.18, y: 1.78, z:  0.26, l1: 0.94, l2: 0.84, s:  1, front: true,  ph: 0.00 },
      { n: 'LH', x: -1.52, y: 1.72, z:  0.30, l1: 0.90, l2: 0.82, s: -1, front: false, ph: 0.04 },
      { n: 'RF', x: 1.18, y: 1.78, z: -0.26, l1: 0.94, l2: 0.84, s:  1, front: true,  ph: 0.50 },
      { n: 'RH', x: -1.52, y: 1.72, z: -0.30, l1: 0.90, l2: 0.82, s: -1, front: false, ph: 0.54 }
    ];
    legs.forEach(function (L) {
      var rig = makeLeg(L.x, L.y, L.l1, L.l2, L.s, L.front);
      (L.front ? fore : rear).add(rig.hip);
      rig.hip.position.z = L.z;
      L.rig = rig;
    });

    // ---------- gait parameters ----------
    var SPEED = 0.82;         // m/s ground speed (a calm giraffe walk)
    var STRIDE = 1.14;        // m per foot per cycle
    var DUTY = 0.62;          // stance fraction of the cycle
    var LIFT = 0.30;          // swing foot clearance
    var CYCLE = STRIDE / SPEED;

    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

    function solveLeg(L, x, y, pitch) {
      var hipX = L.x, hipY = L.y;
      // ground-level ankle target (y already includes body bob),
      // rotated into the tilted (pitched) fore/rear frame
      var vx = x - hipX, vy = y - HOOF_H - hipY;
      var cp = Math.cos(-pitch), sp = Math.sin(-pitch);
      var rx = vx * cp - vy * sp, ry = vx * sp + vy * cp;
      var d = Math.sqrt(rx * rx + ry * ry);
      var maxD = (L.l1 + L.l2) * 0.997;
      if (d > maxD) { rx *= maxD / d; ry *= maxD / d; d = maxD; }
      d = Math.max(d, Math.abs(L.l1 - L.l2) + 0.02);
      var alpha = Math.atan2(rx, -ry);
      var b = Math.acos(clamp((L.l1 * L.l1 + d * d - L.l2 * L.l2) / (2 * L.l1 * d), -1, 1));
      var g = Math.acos(clamp((L.l1 * L.l1 + L.l2 * L.l2 - d * d) / (2 * L.l1 * L.l2), -1, 1));
      var t1 = alpha + L.s * b;
      var t2 = -L.s * (Math.PI - g);
      return [t1, t2, -(t1 + t2) - pitch];
    }

    var t = 0;
    var distance = 0;

    function update(dt) {
      t += dt;
      var u = (t % CYCLE) / CYCLE;       // cycle phase 0..1
      var w = Math.PI * 2 / CYCLE;       // rad/s
      var bob = 0.045 * Math.sin(2 * w * t + 1.1);
      var pitch = 0.020 * Math.sin(2 * w * t + 2.6);
      var roll = 0.045 * Math.sin(2 * w * t + 0.4);
      var yaw = 0.05 * Math.sin(2 * w * t);
      pivot.position.y = bob;
      // X axis = forward: rotation.x rolls sideways, rotation.z pitches fore/aft
      pivot.rotation.set(roll, 0, pitch);
      fore.rotation.y = yaw;
      rear.rotation.y = -yaw * 0.8;

      // instant speed wobbles slightly with the gait, like a real walker
      var v = SPEED * (1 + 0.10 * Math.sin(2 * w * t + 4.0));
      distance += v * dt;

      legs.forEach(function (L) {
        var p = (u + L.ph) % 1, fx, fy;
        if (p < DUTY) {                       // stance: foot planted, sliding
          fx = L.x + STRIDE * (0.5 - p / DUTY);
          fy = -bob + 0.002 * Math.sin(Math.PI * p / DUTY); // tiny give
        } else {                              // swing: foot arcs forward
          var q = (p - DUTY) / (1 - DUTY);
          fx = L.x + STRIDE * (0.5 - q);
          fy = -bob + LIFT * (1 - Math.cos(2 * Math.PI * q)) / 2;
        }
        var r = solveLeg(L, fx, fy, pitch);
        L.rig.hip.rotation.z = r[0];
        L.rig.knee.rotation.z = r[1];
        L.rig.ankle.rotation.z = r[2];
      });

      // neck follows the body with a lag; head stays level (vestibular)
      neck.rotation.z = NECK_TILT + 0.045 * Math.sin(2 * w * t + 1.9);
      head.rotation.z = -NECK_TILT - 0.06 - 0.05 * Math.sin(2 * w * t + 1.9);
      head.position.y = 1.94 + 0.012 * Math.sin(2 * w * t + 3.0);

      // tail: slow swish with the odd faster flick
      tail.rotation.x = 0.12 * Math.sin(w * t * 1.7) + 0.05 * Math.sin(w * t * 6.3 + 2);
      tail.rotation.z = -0.5 + 0.03 * Math.sin(2 * w * t + 1.3);

      return { speed: v, distance: distance };
    }

    return {
      root: root,
      update: update,
      cycle: CYCLE,
      get distance() { return distance; }
    };
  }

  window.Giraffe = { create: create };
})();
