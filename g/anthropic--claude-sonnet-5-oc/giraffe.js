/* =========================================================================
   Walking Giraffe — Three.js (r128), no build step, runs via file://
   Procedural savanna scene with a hierarchically-rigged, animated giraffe.
   ========================================================================= */

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Renderer / Scene / Camera
  // ---------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    45, window.innerWidth / window.innerHeight, 0.1, 500
  );
  camera.position.set(12, 6.5, 15);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2.2, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 4;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------------------------------------------------------------------
  // Sky (gradient dome) + fog
  // ---------------------------------------------------------------------
  function makeSkyTexture() {
    const c = document.createElement('canvas');
    c.width = 2; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.0, '#2b5fa8');
    g.addColorStop(0.35, '#6fa6d8');
    g.addColorStop(0.62, '#cfe6ee');
    g.addColorStop(0.78, '#f4e3b2');
    g.addColorStop(1.0, '#f8d487');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog(0xcfe6ee, 35, 110);

  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(200, 24, 16),
    new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false })
  );
  scene.add(skyDome);

  // ---------------------------------------------------------------------
  // Lighting
  // ---------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xffeec2, 0x3a5a2a, 0.55);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff3d6, 1.15);
  sun.position.set(18, 28, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0015;
  scene.add(sun);

  const fillLight = new THREE.DirectionalLight(0xbcd4ff, 0.25);
  fillLight.position.set(-10, 8, -12);
  scene.add(fillLight);

  // ---------------------------------------------------------------------
  // Ground (procedural grass texture)
  // ---------------------------------------------------------------------
  function makeGrassTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#6f8f3e';
    ctx.fillRect(0, 0, size, size);
    const colors = ['#5f7f34', '#7fa047', '#8fae55', '#4f6b2a', '#a3b765', '#6a8a3a'];
    for (let i = 0; i < 11000; i++) {
      ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
      const x = Math.random() * size, y = Math.random() * size;
      const w = Math.random() * 2 + 0.5, h = Math.random() * 7 + 3;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((Math.random() - 0.5) * 0.9);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
    // sparse dry/sandy patches for savanna variety
    for (let i = 0; i < 25; i++) {
      ctx.fillStyle = 'rgba(196,168,107,0.35)';
      ctx.beginPath();
      ctx.ellipse(Math.random() * size, Math.random() * size, 20 + Math.random() * 40, 12 + Math.random() * 25, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(40, 40);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400, 1, 1),
    new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------------------------------------------------------------------
  // Simple acacia trees for savanna atmosphere
  // ---------------------------------------------------------------------
  function makeAcacia(x, z, scale) {
    const tree = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.95 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x3f5c2a, roughness: 0.9 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 2.4, 7), trunkMat);
    trunk.position.y = 1.2;
    trunk.castShadow = true;
    tree.add(trunk);

    const lean = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 1.4, 6), trunkMat);
    lean.position.set(0.3, 2.3, 0);
    lean.rotation.z = -0.5;
    lean.castShadow = true;
    tree.add(lean);

    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.35, 8), canopyMat);
    canopy.position.set(0.55, 3.05, 0);
    canopy.castShadow = true;
    tree.add(canopy);

    const canopy2 = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.3, 8), canopyMat);
    canopy2.position.set(0.3, 2.75, 0.2);
    canopy2.castShadow = true;
    tree.add(canopy2);

    tree.position.set(x, 0, z);
    tree.scale.setScalar(scale);
    return tree;
  }

  const treePositions = [
    [-9, -14, 1.1], [14, -6, 0.9], [-16, 7, 1.3], [10, 15, 1.0],
    [-6, 18, 0.85], [20, -18, 1.2], [-20, -5, 0.95]
  ];
  treePositions.forEach(([x, z, s]) => scene.add(makeAcacia(x, z, s)));

  // ---------------------------------------------------------------------
  // Procedural giraffe coat textures
  // ---------------------------------------------------------------------
  function makeCoatTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e8c27a'; // cream base between patches
    ctx.fillRect(0, 0, size, size);

    function blotch(x, y, r) {
      const spike = 6 + ((Math.random() * 4) | 0);
      ctx.beginPath();
      for (let i = 0; i <= spike; i++) {
        const a = (i / spike) * Math.PI * 2;
        const rr = r * (0.7 + Math.random() * 0.5);
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    const browns = ['#7a3e18', '#8a4720', '#6e3615', '#96521f'];
    const cols = 7, rows = 7;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (Math.random() < 0.08) continue; // network gaps
        const jitterX = (Math.random() - 0.5) * 30;
        const jitterY = (Math.random() - 0.5) * 30;
        const x = (i + 0.5) * (size / cols) + jitterX;
        const y = (j + 0.5) * (size / rows) + jitterY;
        const r = size / cols * 0.42 * (0.8 + Math.random() * 0.4);
        ctx.fillStyle = browns[(Math.random() * browns.length) | 0];
        blotch(x, y, r);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function makeCreamTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#eeddb3';
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  const coatTexture = makeCoatTexture();
  const creamMat = new THREE.MeshStandardMaterial({ map: makeCreamTexture(), roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.7 });
  const hoofMat = new THREE.MeshStandardMaterial({ color: 0x241510, roughness: 0.5 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x140d08, roughness: 0.3, metalness: 0.2 });
  const ossiconeMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.6 });

  function coatMaterial(repeatX, repeatY) {
    // Clone the coat texture with its own tiling so one canvas texture can be
    // reused (at different scales) across many body-part meshes.
    const tex = coatTexture.clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0.02 });
  }

  function shadowMesh(mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // ---------------------------------------------------------------------
  // Build the giraffe
  // ---------------------------------------------------------------------
  const giraffeRoot = new THREE.Group();
  scene.add(giraffeRoot);

  // --- Torso -------------------------------------------------------------
  // Shoulders (front, tall) slope down to hips (rear, lower) — a signature
  // giraffe silhouette. Torso visuals are independent of the leg pivots so
  // the legs keep clean, predictable hip/shoulder sockets.
  const SHOULDER_H = 3.35;
  const HIP_H = 2.85;
  const BODY_FRONT_Z = 1.25;
  const BODY_REAR_Z = -1.35;

  const torsoGroup = new THREE.Group();
  giraffeRoot.add(torsoGroup);

  // Torso built as a stack of scaled, sloped cylinder segments — gives a
  // smooth, tapered silhouette without needing a custom lathe/lofted mesh.
  const torsoCurve = [
    { t: 0.0, rx: 0.34, ry: 0.42 }, // rear (tail end)
    { t: 0.18, rx: 0.42, ry: 0.5 },
    { t: 0.4, rx: 0.5, ry: 0.56 },
    { t: 0.62, rx: 0.54, ry: 0.58 },
    { t: 0.8, rx: 0.5, ry: 0.53 },
    { t: 1.0, rx: 0.4, ry: 0.42 } // front (chest/shoulder end narrows toward neck base)
  ];
  function torsoYAt(t) { return HIP_H + (SHOULDER_H - HIP_H) * Math.pow(t, 1.15); }
  function torsoZAt(t) { return BODY_REAR_Z + (BODY_FRONT_Z - BODY_REAR_Z) * t; }

  for (let i = 0; i < torsoCurve.length - 1; i++) {
    const a = torsoCurve[i], b = torsoCurve[i + 1];
    const za = torsoZAt(a.t), zb = torsoZAt(b.t);
    const ya = torsoYAt(a.t) + 0.55, yb = torsoYAt(b.t) + 0.55;
    const len = Math.hypot(zb - za, yb - ya);
    const seg = shadowMesh(new THREE.Mesh(
      new THREE.CylinderGeometry(b.ry * 0.95, a.ry * 0.95, len * 1.08, 10),
      coatMaterial(2, 1)
    ));
    // scale x radius differently for a flattened barrel cross-section
    seg.scale.x = (a.rx + b.rx) / (a.ry + b.ry);
    seg.position.set(0, (ya + yb) / 2, (za + zb) / 2);
    const angle = Math.atan2(zb - za, yb - ya);
    seg.rotation.x = angle;
    torsoGroup.add(seg);
  }

  // Chest / belly fill (smooths the underside)
  const belly = shadowMesh(new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 10, 8),
    coatMaterial(2, 1)
  ));
  belly.scale.set(0.92, 0.65, 2.0);
  belly.position.set(0, (HIP_H + SHOULDER_H) / 2 - 0.22, (BODY_FRONT_Z + BODY_REAR_Z) / 2 + 0.1);
  torsoGroup.add(belly);

  // Rump
  const rump = shadowMesh(new THREE.Mesh(new THREE.SphereGeometry(0.44, 10, 8), coatMaterial(1.5, 1)));
  rump.scale.set(0.92, 1.05, 0.8);
  rump.position.set(0, HIP_H + 0.3, BODY_REAR_Z - 0.1);
  torsoGroup.add(rump);

  // --- Neck + Head ---------------------------------------------------------
  const NECK_BASE = new THREE.Vector3(0, SHOULDER_H + 0.55, BODY_FRONT_Z + 0.1);
  const neckGroup = new THREE.Group();
  neckGroup.position.copy(NECK_BASE);
  torsoGroup.add(neckGroup);

  const NECK_LEN = 2.65;
  const NECK_TILT = 0.34; // radians forward from vertical

  const neckSegCount = 5;
  const neckMeshes = [];
  for (let i = 0; i < neckSegCount; i++) {
    const t0 = i / neckSegCount, t1 = (i + 1) / neckSegCount;
    const r0 = 0.34 - 0.14 * t0;
    const r1 = 0.34 - 0.14 * t1;
    const segLen = NECK_LEN / neckSegCount;
    const seg = shadowMesh(new THREE.Mesh(
      new THREE.CylinderGeometry(r1, r0, segLen * 1.12, 9),
      coatMaterial(1.2, 0.6)
    ));
    seg.position.y = segLen * i + segLen / 2;
    neckMeshes.push(seg);
    neckGroup.add(seg);
  }
  neckGroup.rotation.x = NECK_TILT;

  // Mane: a short, close-cropped ridge of dark bristles along the back of the neck
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const y = t * NECK_LEN * 0.97 + 0.08;
    const r = 0.33 - 0.13 * t;
    const bristle = shadowMesh(new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 5), darkMat));
    bristle.position.set(0, y, -r - 0.01);
    bristle.rotation.x = -Math.PI / 2 + 0.55;
    neckGroup.add(bristle);
  }

  // Head group sits at the top of the neck and can nod independently
  const headGroup = new THREE.Group();
  headGroup.position.set(0, NECK_LEN, 0);
  headGroup.rotation.x = -NECK_TILT * 0.65; // tilt head back up a bit relative to neck
  neckGroup.add(headGroup);

  const skull = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.75), coatMaterial(1, 1)));
  skull.position.set(0, 0.08, 0.28);
  headGroup.add(skull);

  const snout = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.42), creamMat));
  snout.position.set(0, -0.01, 0.74);
  headGroup.add(snout);

  const muzzleTip = shadowMesh(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.17, 0.1), darkMat));
  muzzleTip.position.set(0, -0.03, 0.95);
  headGroup.add(muzzleTip);

  // nostrils
  [-0.07, 0.07].forEach((x) => {
    const nostril = shadowMesh(new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), darkMat));
    nostril.position.set(x, 0.0, 1.0);
    headGroup.add(nostril);
  });

  // eyes
  [-0.175, 0.175].forEach((x) => {
    const eye = shadowMesh(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat));
    eye.position.set(x, 0.12, 0.52);
    headGroup.add(eye);
    const brow = shadowMesh(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), coatMaterial(1, 1)));
    brow.scale.set(1, 0.5, 0.7);
    brow.position.set(x, 0.17, 0.5);
    headGroup.add(brow);
  });

  // ears
  [-1, 1].forEach((side) => {
    const ear = shadowMesh(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 6), coatMaterial(1, 1)));
    ear.position.set(side * 0.22, 0.26, 0.12);
    ear.rotation.z = side * 1.15;
    ear.rotation.x = 0.3;
    ear.scale.set(1, 1, 0.4);
    headGroup.add(ear);
  });

  // ossicones (the distinctive knobby "horns")
  [-0.1, 0.1].forEach((x) => {
    const stalk = shadowMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.26, 6), ossiconeMat));
    stalk.position.set(x, 0.42, 0.22);
    headGroup.add(stalk);
    const knob = shadowMesh(new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), darkMat));
    knob.position.set(x, 0.56, 0.22);
    headGroup.add(knob);
  });
  const ossiconeBridge = shadowMesh(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), ossiconeMat));
  ossiconeBridge.position.set(0, 0.34, 0.3);
  headGroup.add(ossiconeBridge);

  // --- Tail ------------------------------------------------------------
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, HIP_H + 0.4, BODY_REAR_Z - 0.45);
  tailGroup.rotation.x = -0.35;
  torsoGroup.add(tailGroup);

  const tailSegCount = 4;
  const TAIL_LEN = 1.3;
  for (let i = 0; i < tailSegCount; i++) {
    const segLen = TAIL_LEN / tailSegCount;
    const r0 = 0.05 - 0.012 * i;
    const r1 = 0.05 - 0.012 * (i + 1);
    const seg = shadowMesh(new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, segLen * 1.1, 6), coatMaterial(1, 1)));
    seg.position.y = -(segLen * i + segLen / 2);
    tailGroup.add(seg);
  }
  const tailTuft = shadowMesh(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 7), darkMat));
  tailTuft.position.y = -TAIL_LEN - 0.08;
  tailGroup.add(tailTuft);

  // --- Legs --------------------------------------------------------------
  // Each leg: hip/shoulder pivot -> upper leg -> knee pivot -> lower leg -> ankle pivot -> hoof
  function buildLeg(isFront, side) {
    const hipHeight = isFront ? SHOULDER_H : HIP_H;
    const upperLen = hipHeight * 0.52;
    const lowerLen = hipHeight * 0.48;

    const hipPivot = new THREE.Group();

    const upperLeg = shadowMesh(new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.115, upperLen, 8),
      coatMaterial(1, 1)
    ));
    upperLeg.position.y = -upperLen / 2;
    hipPivot.add(upperLeg);

    const kneePivot = new THREE.Group();
    kneePivot.position.y = -upperLen;
    hipPivot.add(kneePivot);

    const lowerLeg = shadowMesh(new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.115, lowerLen, 8),
      creamMat
    ));
    lowerLeg.position.y = -lowerLen / 2;
    kneePivot.add(lowerLeg);

    // dark "socks" near the hoof, a real giraffe trait
    const sock = shadowMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, lowerLen * 0.22, 8), darkMat));
    sock.position.y = -lowerLen + lowerLen * 0.11;
    kneePivot.add(sock);

    const anklePivot = new THREE.Group();
    anklePivot.position.y = -lowerLen;
    kneePivot.add(anklePivot);

    const hoof = shadowMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.09, 0.16, 8), hoofMat));
    hoof.position.y = -0.08;
    anklePivot.add(hoof);

    return { hipPivot, kneePivot, anklePivot, totalLen: upperLen + lowerLen };
  }

  const legSpreadX = 0.42;
  const legDefs = [
    { name: 'FL', front: true, x: -legSpreadX, z: BODY_FRONT_Z - 0.15, side: 'L' },
    { name: 'FR', front: true, x: legSpreadX, z: BODY_FRONT_Z - 0.15, side: 'R' },
    { name: 'BL', front: false, x: -legSpreadX * 0.95, z: BODY_REAR_Z + 0.2, side: 'L' },
    { name: 'BR', front: false, x: legSpreadX * 0.95, z: BODY_REAR_Z + 0.2, side: 'R' }
  ];

  const legs = {};
  legDefs.forEach((def) => {
    const leg = buildLeg(def.front, def.side);
    const hipHeight = def.front ? SHOULDER_H : HIP_H;
    leg.hipPivot.position.set(def.x, hipHeight + 0.55, def.z);
    torsoGroup.add(leg.hipPivot);
    leg.side = def.side;
    leg.front = def.front;
    legs[def.name] = leg;
  });

  // Lift the whole giraffe root so feet (currently computed relative to leg
  // length from hip height "hipHeight+0.55") rest at y=0 on the ground.
  // hipPivot.y = hipHeight + 0.55 and total leg length = hipHeight -> foot at
  // y = 0.55 when straight down. Shift root down by 0.55 so hooves touch ground.
  torsoGroup.position.y = -0.55;

  // ---------------------------------------------------------------------
  // Walk-cycle animation
  // ---------------------------------------------------------------------
  // Giraffes famously PACE: both legs on the same side move together
  // (front-left + back-left in sync, opposite phase from front-right + back-right).
  const STRIDE_AMPLITUDE = 0.5;   // hip swing (radians)
  const KNEE_LIFT = 0.85;         // knee bend amplitude (radians)
  const WALK_SPEED = 2.1;         // radians/sec of gait phase

  const clock = new THREE.Clock();
  let pathT = 0;
  const PATH_RADIUS = 7.5;

  function animateLeg(leg, phase) {
    const hip = Math.sin(phase) * STRIDE_AMPLITUDE;
    leg.hipPivot.rotation.x = hip;
    // Knee bends mainly during the forward swing (when the leg is moving from
    // back to front and must clear the ground), stays nearly straight on the
    // backward "stance/push" portion of the cycle.
    const swing = Math.max(0, Math.sin(phase + Math.PI * 0.55));
    leg.kneePivot.rotation.x = -swing * KNEE_LIFT * (leg.front ? 1 : 0.9);
    leg.anklePivot.rotation.x = swing * KNEE_LIFT * 0.55;
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const phase = t * WALK_SPEED;

    // Pacing gait: left side together, right side together, opposite phase.
    animateLeg(legs.FL, phase);
    animateLeg(legs.BL, phase);
    animateLeg(legs.FR, phase + Math.PI);
    animateLeg(legs.BR, phase + Math.PI);

    // Lateral body sway + vertical bob from the pacing gait (giraffes rock
    // side-to-side noticeably more than trotting animals).
    const sway = Math.sin(phase) * 0.05;
    const bob = Math.abs(Math.sin(phase * 2)) * 0.035;
    torsoGroup.position.x = sway;
    torsoGroup.position.y = -0.55 + bob;
    torsoGroup.rotation.z = Math.sin(phase) * 0.035;
    torsoGroup.rotation.x = Math.sin(phase * 2 + 0.3) * 0.015;

    // Neck counter-sway for balance + gentle head bob
    neckGroup.rotation.z = -Math.sin(phase) * 0.05;
    headGroup.rotation.z = Math.sin(phase * 2) * 0.03;
    headGroup.position.y = NECK_LEN + Math.sin(phase * 2 + 1) * 0.015;

    // Tail swish
    tailGroup.rotation.z = Math.sin(t * 1.3) * 0.25;

    // Walk forward along a big, lazy circular path across the savanna so the
    // "walking" is visible as locomotion, not just leg-waving in place.
    pathT += dt * 0.11;
    const cx = Math.cos(pathT) * PATH_RADIUS;
    const cz = Math.sin(pathT) * PATH_RADIUS;
    giraffeRoot.position.set(cx, 0, cz);
    giraffeRoot.rotation.y = -pathT - Math.PI / 2;

    controls.update();
    renderer.render(scene, camera);
  }

  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = 'none';

  animate();
})();
