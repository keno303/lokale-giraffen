/* =========================================================================
   Walking Giraffe — Three.js r149, no build step, runs from file://
   Everything (textures included) is generated procedurally at runtime.
   ========================================================================= */
(function () {
  'use strict';

  if (typeof THREE === 'undefined') return;

  // ------------------------------------------------------------ renderer
  var canvas = document.getElementById('scene');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdfe6ec, 90, 340);

  var camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 1500);

  // ------------------------------------------------------------ lights
  scene.add(new THREE.HemisphereLight(0xcfe4f5, 0x8a7a5a, 0.55));

  var sun = new THREE.DirectionalLight(0xfff1da, 1.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 220;
  sun.shadow.camera.left = -32; sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32;
  sun.shadow.bias = -0.0004;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  // ------------------------------------------------------------ helpers
  function col(hex) { var c = new THREE.Color(hex); c.convertSRGBToLinear(); return c; }

  function canvasTex(size, draw) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }

  // Giraffe coat: cream base with irregular polygonal chestnut patches.
  function makeCoatTexture(size) {
    return canvasTex(size, function (g, S) {
      g.fillStyle = '#d9b787'; g.fillRect(0, 0, S, S);
      var i, x, y, r;
      for (i = 0; i < 2600; i++) {                       // mottled base
        x = Math.random() * S; y = Math.random() * S; r = 2 + Math.random() * 14;
        g.fillStyle = Math.random() < 0.5 ? 'rgba(188,148,98,0.10)' : 'rgba(233,208,168,0.10)';
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      var cols = ['#8a5a2c', '#7c4e24', '#946230', '#6f4520', '#835428'];
      for (i = 0; i < 175; i++) {                        // polygonal patches
        var px = Math.random() * S, py = Math.random() * S, pr = 13 + Math.random() * 46;
        var n = 7 + (Math.random() * 6 | 0), k, a, rr;
        g.fillStyle = cols[(Math.random() * cols.length) | 0];
        g.globalAlpha = 0.93;
        g.beginPath();
        for (k = 0; k < n; k++) {
          a = k / n * Math.PI * 2; rr = pr * (0.55 + Math.random() * 0.65);
          var vx = px + Math.cos(a) * rr, vy = py + Math.sin(a) * rr;
          if (k === 0) g.moveTo(vx, vy); else g.lineTo(vx, vy);
        }
        g.closePath(); g.fill();
        g.globalAlpha = 0.22; g.fillStyle = '#5d3a17';   // darker core
        g.beginPath(); g.arc(px, py, pr * 0.45, 0, 7); g.fill();
        g.globalAlpha = 1;
      }
      for (i = 0; i < 2200; i++) {                       // fine speckle
        x = Math.random() * S; y = Math.random() * S; r = 0.6 + Math.random() * 2.2;
        g.fillStyle = Math.random() < 0.5 ? 'rgba(120,80,40,0.12)' : 'rgba(240,220,180,0.12)';
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
    });
  }

  function makeGroundTexture(size) {
    return canvasTex(size, function (g, S) {
      g.fillStyle = '#7f9250'; g.fillRect(0, 0, S, S);
      var cols = ['#74863f', '#8ba057', '#a39a5e', '#6b7c3c', '#93a45c', '#c2b478'];
      function blob(x, y, r, color, alpha, n) {
        g.fillStyle = color; g.globalAlpha = alpha;
        g.beginPath();
        for (var k = 0; k < n; k++) {
          var a = k / n * Math.PI * 2, rr = r * (0.6 + Math.random() * 0.7);
          var vx = x + Math.cos(a) * rr, vy = y + Math.sin(a) * rr;
          if (k === 0) g.moveTo(vx, vy); else g.lineTo(vx, vy);
        }
        g.closePath(); g.fill(); g.globalAlpha = 1;
      }
      for (var i = 0; i < 900; i++) {
        blob(Math.random() * S, Math.random() * S, 2 + Math.random() * 9,
             cols[(Math.random() * cols.length) | 0], 0.5, 6 + (Math.random() * 5 | 0));
      }
      for (i = 0; i < 2600; i++) {
        var x = Math.random() * S, y = Math.random() * S, r = 0.5 + Math.random() * 1.8;
        g.fillStyle = Math.random() < 0.5 ? 'rgba(60,70,30,0.18)' : 'rgba(210,200,140,0.16)';
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
    });
  }

  // ------------------------------------------------------------ sky dome
  var sky = new THREE.Mesh(
    new THREE.SphereGeometry(700, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: col(0x3d7cc4) },
        mid: { value: col(0xa9cbe4) },
        bot: { value: col(0xe9e0c9) }
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;' +
        'void main(){ float h = normalize(vP).y;' +
        ' vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, bot, pow(-h, 0.5));' +
        ' gl_FragColor = vec4(c, 1.0); }'
    })
  );
  scene.add(sky);

  // ------------------------------------------------------------ ground
  var groundTex = makeGroundTexture(512);
  groundTex.repeat.set(60, 60);
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ------------------------------------------------------------ savanna props
  var barkMat = new THREE.MeshStandardMaterial({ color: col(0x6b4a2c), roughness: 1 });
  var leafMat = new THREE.MeshStandardMaterial({ color: col(0x5a7a33), roughness: 1 });
  var leafMat2 = new THREE.MeshStandardMaterial({ color: col(0x4e6b2c), roughness: 1 });
  var rockMat = new THREE.MeshStandardMaterial({ color: col(0x8b857a), roughness: 1 });

  function sph(parent, mat, r, sx, sy, sz, x, y, z, shadow) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 16), mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.castShadow = shadow !== false;
    parent.add(m);
    return m;
  }

  function makeAcacia(s) {
    var g = new THREE.Group();
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.24 * s, 2.5 * s, 7), barkMat);
    trunk.position.y = 1.25 * s; trunk.rotation.z = 0.07; trunk.castShadow = true;
    g.add(trunk);
    var b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.06 * s, 1.6 * s, 6), barkMat);
    b1.position.set(0.5 * s, 2.3 * s, 0.2 * s); b1.rotation.z = -0.9; b1.castShadow = true;
    g.add(b1);
    var b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.06 * s, 1.4 * s, 6), barkMat);
    b2.position.set(-0.45 * s, 2.35 * s, -0.25 * s); b2.rotation.z = 0.85; b2.castShadow = true;
    g.add(b2);
    sph(g, leafMat, 1, 1.8 * s, 0.42 * s, 1.25 * s, 0.4 * s, 2.95 * s, 0.2 * s);
    sph(g, leafMat2, 1, 1.5 * s, 0.38 * s, 1.1 * s, -0.6 * s, 2.85 * s, -0.2 * s);
    sph(g, leafMat, 1, 1.1 * s, 0.34 * s, 0.9 * s, 0, 3.15 * s, 0);
    return g;
  }

  var rand = (function () { var s = 1234567; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();

  for (var ti = 0; ti < 9; ti++) {
    var a = rand() * Math.PI * 2, rr = 27 + rand() * 45;
    var tree = makeAcacia(0.8 + rand() * 0.9);
    tree.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    tree.rotation.y = rand() * Math.PI * 2;
    scene.add(tree);
  }
  for (var ri = 0; ri < 12; ri++) {
    var ra = rand() * Math.PI * 2, rrr = 21 + rand() * 40;
    var rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + rand() * 0.9, 0), rockMat);
    rock.position.set(Math.cos(ra) * rrr, 0.15, Math.sin(ra) * rrr);
    rock.scale.y = 0.55 + rand() * 0.3;
    rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    rock.castShadow = true;
    scene.add(rock);
  }
  for (var bi = 0; bi < 10; bi++) {
    var ba = rand() * Math.PI * 2, br = 20 + rand() * 35;
    sph(scene, leafMat2, 0.5 + rand() * 0.55, 1, 0.5, 1, Math.cos(ba) * br, 0.25, Math.sin(ba) * br);
  }

  // grass tufts (instanced)
  var grassGeo = new THREE.ConeGeometry(0.10, 0.55, 5);
  var grassMat = new THREE.MeshStandardMaterial({ color: col(0xffffff), roughness: 1 });
  var grass = new THREE.InstancedMesh(grassGeo, grassMat, 900);
  var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  var cGrass = new THREE.Color();
  for (var gi = 0; gi < 900; gi++) {
    var ga = rand() * Math.PI * 2, gr = 3 + Math.sqrt(rand()) * 85;
    v.set(Math.cos(ga) * gr, 0.25, Math.sin(ga) * gr);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
    var gs = 0.45 + rand() * 0.9;
    sc.set(0.8 + rand() * 0.6, gs, 0.8 + rand() * 0.6);
    m4.compose(v, q, sc);
    grass.setMatrixAt(gi, m4);
    cGrass.setHSL(0.21 + rand() * 0.07, 0.35 + rand() * 0.2, 0.38 + rand() * 0.15);
    grass.setColorAt(gi, cGrass);
  }
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  scene.add(grass);

  // clouds
  var cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, fog: false });
  var clouds = [];
  for (var ci = 0; ci < 6; ci++) {
    var cg = new THREE.Group();
    var n = 3 + (rand() * 3 | 0);
    for (var cj = 0; cj < n; cj++) {
      var cm = new THREE.Mesh(new THREE.SphereGeometry(3 + rand() * 4, 12, 8), cloudMat);
      cm.position.set((cj - n / 2) * 4 + rand() * 2, rand() * 1.5, rand() * 3 - 1.5);
      cm.scale.y = 0.45;
      cg.add(cm);
    }
    cg.position.set((rand() - 0.5) * 320, 48 + rand() * 25, (rand() - 0.5) * 320);
    scene.add(cg);
    clouds.push(cg);
  }

  // ============================================================ GIRAFFE
  var coatTex = makeCoatTexture(1024);
  function coatMat(rx, ry, rough) {
    var t = coatTex.clone();
    t.needsUpdate = true;
    t.repeat.set(rx, ry);
    return new THREE.MeshStandardMaterial({ map: t, roughness: rough == null ? 0.9 : rough, metalness: 0 });
  }
  var bodyMat = coatMat(1.6, 1.0);
  var neckMat = coatMat(1.3, 2.4);
  var legMat  = coatMat(1.0, 2.6);
  var headMat = coatMat(2.6, 2.6);
  var darkMat  = new THREE.MeshStandardMaterial({ color: col(0x2e1c10), roughness: 0.65 });
  var muzzleMat = new THREE.MeshStandardMaterial({ color: col(0x6d5a4d), roughness: 0.75 });
  var eyeMat   = new THREE.MeshStandardMaterial({ color: col(0x120b07), roughness: 0.12, metalness: 0.15 });
  var maneMat  = new THREE.MeshStandardMaterial({ color: col(0x4a2f16), roughness: 1 });

  function cyl(parent, mat, rTop, rBot, h, x, y, z, seg) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg || 12), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  function buildGiraffe() {
    var root = new THREE.Group();     // moves along the path
    var body = new THREE.Group();     // bobs / pitches / rolls
    root.add(body);
    var chest = new THREE.Group();    // breathing
    body.add(chest);

    // torso (overlapping spheres read as one body)
    var belly   = sph(chest, bodyMat, 1, 0.47, 0.56, 0.98,  0, 2.40, -0.05);
    var chestM  = sph(chest, bodyMat, 1, 0.50, 0.60, 0.58,  0, 2.48,  0.52);
    var rump    = sph(chest, bodyMat, 1, 0.50, 0.58, 0.68,  0, 2.44, -0.85);
    var hump    = sph(chest, bodyMat, 1, 0.38, 0.27, 0.42,  0, 2.82,  0.36);
    var neckBul = sph(chest, bodyMat, 1, 0.33, 0.36, 0.42,  0, 2.68,  0.78);

    // neck: 3 articulated segments + mane along the dorsal edge
    var neck = new THREE.Group();
    neck.position.set(0, 2.70, 0.80);
    body.add(neck);

    function neckSeg(parent, len, rB, rT) {
      var g = new THREE.Group();
      parent.add(g);
      cyl(g, neckMat, rT, rB, len, 0, len / 2, 0, 14);
      var mane = new THREE.Mesh(new THREE.BoxGeometry(0.10, len * 1.10, 0.07), maneMat);
      mane.position.set(0, len / 2, -(rB + rT) / 2 - 0.02);
      g.add(mane);
      var joint = new THREE.Group();
      joint.position.y = len;
      g.add(joint);
      return joint;
    }
    var n1 = neckSeg(neck, 0.70, 0.27, 0.225);
    var n2 = neckSeg(n1, 0.65, 0.225, 0.185);
    var n3 = neckSeg(n2, 0.55, 0.185, 0.145);

    // head
    var head = new THREE.Group();
    n3.add(head);
    sph(head, headMat, 1, 0.165, 0.18, 0.26, 0, 0, 0);                     // skull
    var muzzle = cyl(head, muzzleMat, 0.058, 0.085, 0.34, 0, -0.02, 0.30, 12);
    muzzle.rotation.x = Math.PI / 2;                                        // nose toward +Z
    var jaw = cyl(head, headMat, 0.048, 0.068, 0.24, 0, -0.075, 0.25, 10);
    jaw.rotation.x = Math.PI / 2;
    sph(head, eyeMat, 0.046, 1, 1, 1, -0.112, 0.045, 0.12);                 // eyes
    sph(head, eyeMat, 0.046, 1, 1, 1,  0.112, 0.045, 0.12);
    sph(head, darkMat, 0.013, 1, 0.7, 1, -0.028, 0.045, 0.455);             // nostrils
    sph(head, darkMat, 0.013, 1, 0.7, 1,  0.028, 0.045, 0.455);
    var ossicones = [];
    [-1, 1].forEach(function (s) {
      var o = new THREE.Group();
      o.position.set(s * 0.055, 0.155, -0.05);
      o.rotation.x = -0.12;
      cyl(o, headMat, 0.021, 0.025, 0.15, 0, 0.075, 0, 8);
      sph(o, darkMat, 0.038, 1, 1, 1, 0, 0.155, 0);
      head.add(o);
      ossicones.push(o);
    });
    sph(head, darkMat, 0.022, 1, 0.8, 1, 0, 0.178, 0.03);                  // median bump
    var ears = [];
    [-1, 1].forEach(function (s) {
      var e = new THREE.Group();
      e.position.set(s * 0.145, 0.09, -0.06);
      var cone = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.21, 8), headMat);
      cone.scale.z = 0.45;
      cone.rotation.set(0, s * -0.45, s * 1.75);   // out, back and slightly up
      cone.castShadow = true;
      e.add(cone);
      head.add(e);
      ears.push(e);
    });

    // legs
    function makeLeg(side, front) {
      var hip = new THREE.Group();
      var hipY = 1.96;
      hip.position.set(side * 0.27, hipY, front ? 0.62 : -0.78);
      hip.rotation.z = side * 0.045;
      body.add(hip);
      var uLen = front ? 0.62 : 0.65;
      var lLen = front ? 1.16 : 1.13;
      cyl(hip, legMat, front ? 0.14 : 0.185, front ? 0.10 : 0.115, uLen, 0, -uLen / 2, 0, 12);
      if (!front) sph(hip, legMat, 1, 0.20, 0.27, 0.23, side * 0.02, -0.18, 0.02); // thigh muscle
      var knee = new THREE.Group();
      knee.position.y = -uLen;
      hip.add(knee);
      cyl(knee, legMat, 0.075, 0.052, lLen, 0, -lLen / 2, 0, 10);
      var ankle = new THREE.Group();
      ankle.position.y = -lLen;
      knee.add(ankle);
      cyl(ankle, darkMat, 0.088, 0.098, 0.18, 0, -0.09, 0, 12);             // hoof
      return { hip: hip, knee: knee, ankle: ankle, front: front, hipY: hipY, phase: 0 };
    }
    var legs = {
      FL: makeLeg(-1, true), FR: makeLeg(1, true),
      HL: makeLeg(-1, false), HR: makeLeg(1, false)
    };

    // tail
    var tail = new THREE.Group();
    tail.position.set(0, 2.62, -1.42);
    body.add(tail);
    cyl(tail, legMat, 0.024, 0.016, 0.75, 0, -0.375, 0, 8);
    var tailMid = new THREE.Group();
    tailMid.position.y = -0.75;
    tail.add(tailMid);
    cyl(tailMid, legMat, 0.016, 0.011, 0.5, 0, -0.25, 0, 8);
    var tuft = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.34, 10), darkMat);
    tuft.rotation.x = Math.PI;
    tuft.position.y = -0.62;
    tuft.castShadow = true;
    tailMid.add(tuft);

    return {
      root: root, body: body, chest: chest, chestMesh: chestM,
      chestBase: chestM.scale.clone(),
      neck: neck, head: head, ears: ears, ossicones: ossicones,
      legs: legs, tail: tail, tailMid: tailMid
    };
  }

  var G = buildGiraffe();
  scene.add(G.root);

  // ------------------------------------------------------------ gait
  var GAITS = {
    walk:   { stride: 2.3, amp: 0.42, knee: 0.62, bob: 0.045, pitch: 0.020, roll: 0.016, neck: 0.74, neckAmp: 0.050,
              phases: { HL: 0.00, FL: 0.25, HR: 0.50, FR: 0.75 } },   // lateral sequence walk
    trot:   { stride: 3.1, amp: 0.55, knee: 0.78, bob: 0.070, pitch: 0.030, roll: 0.028, neck: 0.62, neckAmp: 0.070,
              phases: { FL: 0.00, HR: 0.00, FR: 0.50, HL: 0.50 } },   // diagonal pairs
    gallop: { stride: 4.4, amp: 0.80, knee: 1.05, bob: 0.150, pitch: 0.075, roll: 0.045, neck: 0.38, neckAmp: 0.110,
              phases: { HL: 0.00, HR: 0.12, FR: 0.50, FL: 0.62 } }    // transverse gallop
  };
  var gaitName = 'walk';
  var P = JSON.parse(JSON.stringify(GAITS.walk));   // smoothed params
  var legPhase = { FL: 0, FR: 0, HL: 0, HR: 0 };

  var speed = 1.15;          // m/s
  var phase = 0;             // gait phase (rad)
  var dist = 0;              // distance travelled along path
  var PATH_R = 16;
  var paused = false;
  var simT = 0;

  // ear twitch state
  var earState = [
    { t: 99, next: 1.5, amp: 0 },
    { t: 99, next: 3.2, amp: 0 }
  ];

  function step(dt) {
    simT += dt;

    // smooth-blend gait parameters
    var tgt = GAITS[gaitName];
    var k = Math.min(1, dt * 4);
    ['stride', 'amp', 'knee', 'bob', 'pitch', 'roll', 'neck', 'neckAmp'].forEach(function (key) {
      P[key] += (tgt[key] - P[key]) * k;
    });
    Object.keys(legPhase).forEach(function (key) {
      legPhase[key] += (tgt.phases[key] - legPhase[key]) * k;
    });

    phase += dt * (Math.PI * 2) * speed / P.stride;
    dist += speed * dt;

    // place giraffe on a circular path, heading along the tangent
    var ang = dist / PATH_R;
    var px = PATH_R * Math.sin(ang), pz = PATH_R * Math.cos(ang);
    var dx = Math.cos(ang), dz = -Math.sin(ang);
    G.root.position.set(px, 0, pz);
    G.root.rotation.y = Math.atan2(dx, dz);

    // body bob: two bobs per stride; counter-move hips so feet stay planted
    var bob = P.bob * (0.5 - 0.5 * Math.cos(2 * phase));
    G.body.position.y = bob;
    G.body.rotation.x = P.pitch * Math.sin(2 * phase + 0.7);
    G.body.rotation.z = P.roll * Math.sin(phase) - 0.03;   // lean into the turn

    // legs
    Object.keys(G.legs).forEach(function (key) {
      var leg = G.legs[key];
      var th = phase + legPhase[key] * Math.PI * 2;
      var swing = Math.sin(th);                       // + = leg back
      leg.hip.position.y = leg.hipY - bob;
      leg.hip.rotation.x = P.amp * swing;
      var flex = Math.max(0, -Math.sin(th));          // knee flexes in forward swing
      var kneeAng = (leg.front ? 0.03 : 0.20) + P.knee * flex;   // hind hock rest angle
      leg.knee.rotation.x = kneeAng;
      leg.ankle.rotation.x = -(leg.hip.rotation.x + leg.knee.rotation.x) * 0.9;
    });

    // neck & head counter-motion
    G.neck.rotation.x = P.neck + P.neckAmp * Math.sin(phase + 0.9) + 0.02 * Math.sin(2 * phase);
    G.neck.rotation.z = 0.045 * Math.sin(phase + 2.1);
    G.neck.rotation.y = 0.03 * Math.sin(phase * 0.5);
    G.head.rotation.x = 0.14 - G.neck.rotation.x + 0.05 * Math.sin(2 * phase + 1.3) + 0.02 * Math.sin(phase);

    // breathing
    var br = Math.sin(simT * Math.PI * 2 * 0.16);
    G.chestMesh.scale.set(
      G.chestBase.x * (1 + 0.012 * br),
      G.chestBase.y * (1 + 0.022 * br),
      G.chestBase.z * (1 + 0.012 * br)
    );

    // tail swish
    G.tail.rotation.x = 0.28 + 0.30 * Math.sin(2 * phase + 0.8);
    G.tail.rotation.z = 0.45 * Math.sin(phase + 1.7);
    G.tailMid.rotation.z = 0.35 * Math.sin(phase + 1.2);

    // ear twitches
    earState.forEach(function (e, i) {
      if (simT > e.next) { e.t = 0; e.next = simT + 2 + Math.random() * 4; e.amp = 0.5 + Math.random() * 0.3; }
      e.t += dt;
      var f = 0;
      if (e.t < 0.32) f = -e.amp * Math.sin(Math.PI * e.t / 0.32);
      G.ears[i].rotation.x = f;
    });

    // sun follows the giraffe so shadows stay crisp
    sun.position.set(px + 55, 75, pz + 30);
    sun.target.position.set(px, 0, pz);
    sun.target.updateMatrixWorld();

    // clouds drift
    clouds.forEach(function (c) { c.position.x += dt * 0.6; });
  }

  // ------------------------------------------------------------ camera controls
  var cam = { theta: 2.35, phi: 1.10, radius: 11, target: new THREE.Vector3(0, 2.6, 16) };
  var follow = true;

  function updateCamera(dt) {
    if (follow) {
      var desired = new THREE.Vector3(G.root.position.x, 2.7, G.root.position.z);
      cam.target.lerp(desired, 1 - Math.pow(0.002, dt));
    }
    var sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
    camera.position.set(
      cam.target.x + cam.radius * sp * Math.sin(cam.theta),
      cam.target.y + cam.radius * cp,
      cam.target.z + cam.radius * sp * Math.cos(cam.theta)
    );
    camera.lookAt(cam.target);
  }

  var dragging = false, lastX = 0, lastY = 0, pinch = 0;
  canvas.addEventListener('pointerdown', function (e) {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    cam.theta -= (e.clientX - lastX) * 0.0052;
    cam.phi -= (e.clientY - lastY) * 0.0052;
    cam.phi = Math.max(0.08, Math.min(1.52, cam.phi));
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener('pointerup', function () { dragging = false; });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    cam.radius *= 1 + e.deltaY * 0.0011;
    cam.radius = Math.max(5, Math.min(70, cam.radius));
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinch > 0) {
        cam.radius *= pinch / d;
        cam.radius = Math.max(5, Math.min(70, cam.radius));
      }
      pinch = d;
    }
  }, { passive: false });
  canvas.addEventListener('touchend', function () { pinch = 0; });

  // ------------------------------------------------------------ UI wiring
  var speedEl = document.getElementById('speed');
  var speedVal = document.getElementById('speedVal');
  speedEl.addEventListener('input', function () {
    speed = parseFloat(speedEl.value);
    speedVal.textContent = speed.toFixed(2) + ' m/s';
  });
  var followEl = document.getElementById('follow');
  followEl.addEventListener('change', function () { follow = followEl.checked; });

  function setGait(name) {
    gaitName = name;
    var btns = document.querySelectorAll('#gaits button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].getAttribute('data-gait') === name);
    }
  }
  var gaitBtns = document.querySelectorAll('#gaits button');
  for (var bi = 0; bi < gaitBtns.length; bi++) {
    gaitBtns[bi].addEventListener('click', function () { setGait(this.getAttribute('data-gait')); });
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'f' || e.key === 'F') { follow = !follow; followEl.checked = follow; }
    else if (e.key === '1') setGait('walk');
    else if (e.key === '2') setGait('trot');
    else if (e.key === '3') setGait('gallop');
    else if (e.key === ' ') { paused = !paused; e.preventDefault(); }
  });

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // URL params for reproducible views / testing: ?radius=8&theta=1.57&phi=1.2&follow=1&gait=walk&speed=1.2
  (function () {
    var qs;
    try { qs = new URLSearchParams(location.search); } catch (e) { return; }
    if (qs.has('radius')) cam.radius = Math.max(5, Math.min(70, parseFloat(qs.get('radius')) || cam.radius));
    if (qs.has('theta')) cam.theta = parseFloat(qs.get('theta')) || cam.theta;
    if (qs.has('phi')) { cam.phi = Math.max(0.08, Math.min(1.52, parseFloat(qs.get('phi')) || cam.phi)); }
    if (qs.has('follow')) { follow = qs.get('follow') === '1'; followEl.checked = follow; }
    if (qs.has('gait') && GAITS[qs.get('gait')]) setGait(qs.get('gait'));
    if (qs.has('speed')) {
      speed = Math.max(0, Math.min(4, parseFloat(qs.get('speed')) || 0));
      speedEl.value = speed;
      speedVal.textContent = speed.toFixed(2) + ' m/s';
    }
  })();

  // ------------------------------------------------------------ main loop
  var clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);
    if (!paused) step(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }
  animate();
})();
