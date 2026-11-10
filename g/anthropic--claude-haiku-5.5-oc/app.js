(function () {
  'use strict';

  const TAU = Math.PI * 2;

  // ---- Tunables -----------------------------------------------------------
  const CIRCLE_RADIUS = 12;     // metres; the giraffe walks a loop around the savanna
  const STRIDE_CYCLE = 1.1;     // seconds per full stride cycle of one leg
  const HIP_AMP = 0.2;          // hip swing amplitude (rad)
  const KNEE_LIFT = 0.9;        // knee flexion during swing (rad)
  const LEG_LEN = 2.0;          // hip pivot to hoof base (m)
  const WALK_SPEED = (2 * LEG_LEN * HIP_AMP) / (STRIDE_CYCLE / 2); // m/s, matches stance foot slip
  const NECK_TILT = 0.6;        // neck angle from vertical (rad)
  const NECK_LEN = 2.1;
  const HEAD_PITCH = -0.45;     // keeps the muzzle roughly level with the ground

  // Deterministic random so the scene looks the same every load.
  let seed = 1337;
  function rnd() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  // ---- Renderer / scene / camera -------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog(0xcfe3ef, 70, 220);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 600);

  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x6b5a33, 0.9));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(8, 16, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -22;
  sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // ---- Environment -----------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  for (let i = 0; i < 16; i++) {
    const a = rnd() * TAU;
    const d = 24 + rnd() * 50;
    scene.add(makeAcacia(Math.cos(a) * d, Math.sin(a) * d, 0.8 + rnd() * 0.6));
  }

  // ---- Materials ---------------------------------------------------------------
  const coatTex = makeCoatTexture();
  coatTex.colorSpace = THREE.SRGBColorSpace;
  const coatMat = new THREE.MeshStandardMaterial({ map: coatTex, roughness: 0.85 });
  const creamMat = new THREE.MeshStandardMaterial({ color: 0xe9d7ab, roughness: 0.8 });
  const muzzleMat = new THREE.MeshStandardMaterial({ color: 0xc9a27a, roughness: 0.9 });
  const hoofMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1d1510, roughness: 0.6 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x140b06, roughness: 0.25 });

  function mesh(geo, mat, pos, scale) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    return m;
  }

  // ---- Giraffe rig -----------------------------------------------------------
  const giraffe = new THREE.Group();   // placed on the walking loop; y clamped to the ground
  scene.add(giraffe);

  const torso = new THREE.Group();     // carries body, neck, head, tail; bobs with the gait
  torso.position.set(0, 2.6, 0);
  giraffe.add(torso);

  const sphere = new THREE.SphereGeometry(1, 40, 28);
  torso.add(mesh(sphere, coatMat, [0, 0, 0], [0.72, 0.78, 1.75]));
  torso.add(mesh(sphere, coatMat, [0, -0.05, 0.9], [0.62, 0.7, 0.8]));   // chest
  torso.add(mesh(sphere, coatMat, [0, -0.02, -0.85], [0.6, 0.66, 0.7]));  // rump

  // Neck: pivot at the withers, tapered cylinder rising forward.
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0, 0.3, 1.3);
  neckPivot.rotation.x = NECK_TILT;
  torso.add(neckPivot);
  neckPivot.add(mesh(new THREE.CylinderGeometry(0.2, 0.36, NECK_LEN, 20, 1), coatMat, [0, NECK_LEN / 2, 0]));
  neckPivot.add(mesh(new THREE.SphereGeometry(0.38, 20, 14), coatMat, [0, 0.05, 0]));

  // Head: pivot at the top of the neck.
  const headPivot = new THREE.Group();
  headPivot.position.set(0, NECK_LEN, 0);
  headPivot.rotation.x = HEAD_PITCH;
  neckPivot.add(headPivot);
  headPivot.add(mesh(sphere, coatMat, [0, 0.04, 0.08], [0.2, 0.18, 0.27]));          // skull
  headPivot.add(mesh(sphere, muzzleMat, [0, -0.03, 0.4], [0.12, 0.115, 0.2]));       // muzzle
  headPivot.add(mesh(sphere, muzzleMat, [0, -0.02, 0.58], [0.1, 0.07, 0.06]));       // nose
  headPivot.add(mesh(sphere, muzzleMat, [0, -0.1, 0.3], [0.1, 0.06, 0.16]));         // jaw
  headPivot.add(mesh(sphere, eyeMat, [-0.165, 0.1, 0.02], [0.045, 0.045, 0.045]));
  headPivot.add(mesh(sphere, eyeMat, [0.165, 0.1, 0.02], [0.045, 0.045, 0.045]));
  headPivot.add(mesh(sphere, coatMat, [-0.24, 0.1, -0.03], [0.13, 0.045, 0.07]));   // ears
  headPivot.add(mesh(sphere, coatMat, [0.24, 0.1, -0.03], [0.13, 0.045, 0.07]));
  for (const side of [-1, 1]) {
    const ossicone = mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.2, 8), coatMat, [side * 0.085, 0.27, -0.02]);
    ossicone.rotation.z = -side * 0.12;
    headPivot.add(ossicone);
    headPivot.add(mesh(sphere, darkMat, [side * 0.09, 0.38, -0.02], [0.04, 0.04, 0.04]));
  }

  // Tail: pivot at the rump, switches gently.
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.15, -1.72);
  tailPivot.rotation.x = 0.25;
  torso.add(tailPivot);
  tailPivot.add(mesh(new THREE.CylinderGeometry(0.025, 0.02, 1.0, 8), darkMat, [0, -0.5, 0]));
  tailPivot.add(mesh(sphere, darkMat, [0, -1.02, 0], [0.07, 0.09, 0.07]));

  // Legs: hip -> knee -> ankle (hoof). Each leg is hung from the torso's underside.
  const legs = [];
  function buildLeg(x, z, offset) {
    const hip = new THREE.Group();
    hip.position.set(x, 2.15, z);
    giraffe.add(hip);
    hip.add(mesh(new THREE.CylinderGeometry(0.2, 0.15, 1.0, 16), coatMat, [0, -0.5, 0]));

    const knee = new THREE.Group();
    knee.position.set(0, -1.0, 0);
    hip.add(knee);
    knee.add(mesh(new THREE.CylinderGeometry(0.14, 0.1, 1.0, 14), creamMat, [0, -0.5, 0]));

    const ankle = new THREE.Group();
    ankle.position.set(0, -1.0, 0);
    knee.add(ankle);
    const hoof = mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.14, 14), hoofMat, [0, -0.07, 0]);
    ankle.add(hoof);

    legs.push({ hip, knee, ankle, hoof, offset });
  }
  // Lateral-sequence walk: left hind, left fore, right hind, right fore, a quarter cycle apart.
  buildLeg(-0.42, -1.0, 0.00);  // left hind
  buildLeg(-0.42, 1.1, 0.25);   // left fore
  buildLeg(0.42, -1.0, 0.50);   // right hind
  buildLeg(0.42, 1.1, 0.75);    // right fore

  // ---- Animation -------------------------------------------------------------
  let walkPhase = 0;      // radians, advances with stride
  let loopAngle = 0;      // position on the walking circle
  let elapsed = 0;
  let paused = false;
  let speedMul = 1;

  const box = new THREE.Box3();

  function animateGiraffe(dt) {
    walkPhase += dt * speedMul * TAU / STRIDE_CYCLE;
    loopAngle += dt * speedMul * (WALK_SPEED / CIRCLE_RADIUS);
    elapsed += dt;

    giraffe.position.set(Math.cos(loopAngle) * CIRCLE_RADIUS, 0, Math.sin(loopAngle) * CIRCLE_RADIUS);
    giraffe.rotation.y = -loopAngle;

    // Legs: the hip swings the leg fore/aft, the knee lifts the hoof during swing,
    // and the ankle counter-rotates so the hoof stays flat.
    for (const leg of legs) {
      const p = walkPhase + leg.offset * TAU;
      const theta = HIP_AMP * Math.cos(p);                       // + = foot forward
      const flex = KNEE_LIFT * Math.max(0, -Math.sin(p));        // lifts during swing (p in pi..2pi)
      leg.hip.rotation.x = -theta;
      leg.knee.rotation.x = flex;
      leg.ankle.rotation.x = theta - flex;
    }

    // Torso: bobs twice per stride and rolls slightly.
    torso.position.y = 2.6 + 0.05 * Math.cos(2 * walkPhase);
    torso.rotation.z = 0.02 * Math.sin(walkPhase);

    // Neck nods with the stride; the head counter-rotates to stay level-ish.
    const nod = 0.05 * Math.sin(walkPhase);
    neckPivot.rotation.x = NECK_TILT + nod;
    headPivot.rotation.x = HEAD_PITCH - nod;
    headPivot.rotation.y = 0.06 * Math.sin(elapsed * 0.6);

    tailPivot.rotation.z = 0.25 * Math.sin(elapsed * 2.2);

    // Plant the lowest hoof on the ground every frame.
    giraffe.position.y = 0;
    giraffe.updateMatrixWorld(true);
    let minY = Infinity;
    for (const leg of legs) {
      box.setFromObject(leg.hoof);
      minY = Math.min(minY, box.min.y);
    }
    giraffe.position.y = -minY;
  }

  // ---- Camera ----------------------------------------------------------------
  const DEFAULT_PITCH = 0.3;
  const DEFAULT_DIST = 16;
  let userYaw = 0;
  let userPitch = DEFAULT_PITCH;
  let dist = DEFAULT_DIST;
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  let camReady = false;

  function updateCamera(dt) {
    // Default view sits behind the giraffe, following its heading.
    const heading = giraffe.rotation.y;
    const a = heading + Math.PI + userYaw;
    const desiredTarget = new THREE.Vector3(giraffe.position.x, 3.0, giraffe.position.z);
    const cp = Math.cos(userPitch);
    const desiredPos = new THREE.Vector3(
      desiredTarget.x + Math.sin(a) * cp * dist,
      desiredTarget.y + Math.sin(userPitch) * dist,
      desiredTarget.z + Math.cos(a) * cp * dist
    );
    if (!camReady) {
      camTarget.copy(desiredTarget);
      camPos.copy(desiredPos);
      camReady = true;
    }
    const k = 1 - Math.exp(-dt * 4);
    camTarget.lerp(desiredTarget, k);
    camPos.lerp(desiredPos, k);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
  }

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    userYaw -= (e.clientX - lastX) * 0.005;
    userPitch = Math.min(1.3, Math.max(0.05, userPitch + (e.clientY - lastY) * 0.004));
    lastX = e.clientX;
    lastY = e.clientY;
  });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    dist = Math.min(40, Math.max(5, dist * (1 + e.deltaY * 0.001)));
  }, { passive: false });
  canvas.addEventListener('dblclick', () => {
    userYaw = 0;
    userPitch = DEFAULT_PITCH;
    dist = DEFAULT_DIST;
  });

  // ---- UI --------------------------------------------------------------------
  const pauseBtn = document.getElementById('pause');
  const speedInput = document.getElementById('speed');
  const speedLabel = document.getElementById('speedLabel');
  function setPaused(p) {
    paused = p;
    pauseBtn.textContent = paused ? 'Play (Space)' : 'Pause (Space)';
  }
  pauseBtn.addEventListener('click', () => setPaused(!paused));
  speedInput.addEventListener('input', () => {
    speedMul = parseFloat(speedInput.value);
    speedLabel.textContent = speedMul.toFixed(2) + '×';
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      setPaused(!paused);
    }
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- Loop ------------------------------------------------------------------
  let last = null;
  function frame(now) {
    const dt = last === null ? 0 : Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!paused) animateGiraffe(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  animateGiraffe(0);
  updateCamera(1);
  requestAnimationFrame(frame);

  // ---- Procedural textures and props ---------------------------------------
  function makeSkyTexture() {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#6fa9d6');
    grad.addColorStop(0.6, '#cfe3ef');
    grad.addColorStop(1, '#eadcb8');
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeGroundTexture() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#9a9f56';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = 1 + rnd() * 4;
      const shade = rnd() < 0.5 ? '#7d8a42' : '#b5a966';
      g.fillStyle = shade;
      g.globalAlpha = 0.35 + rnd() * 0.35;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(120, 120);
    tex.anisotropy = 8;
    return tex;
  }

  // Giraffe coat: tan base with irregular dark-brown patches, wrapping seamlessly.
  function makeCoatTexture() {
    const W = 1024;
    const H = 512;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#e2b374');
    grad.addColorStop(1, '#c58f49');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    function blob(cx, cy, size) {
      const n = 9;
      const pts = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + rnd() * 0.3;
        const r = size * (0.65 + 0.5 * rnd());
        pts.push({ x: cx + Math.cos(a) * r * 1.25, y: cy + Math.sin(a) * r * 0.95 });
      }
      const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
      g.beginPath();
      const m0 = mid(pts[n - 1], pts[0]);
      g.moveTo(m0.x, m0.y);
      for (let k = 0; k < n; k++) {
        const m = mid(pts[k], pts[(k + 1) % n]);
        g.quadraticCurveTo(pts[k].x, pts[k].y, m.x, m.y);
      }
      g.closePath();
      g.fillStyle = rnd() < 0.5 ? '#6e4220' : '#7a4a24';
      g.fill();
      g.strokeStyle = 'rgba(90, 52, 22, 0.6)';
      g.lineWidth = 2;
      g.stroke();
    }

    for (let i = 0; i < 110; i++) {
      const cx = rnd() * W;
      const cy = H * (0.08 + 0.84 * rnd());
      const size = 22 + rnd() * 40;
      blob(cx, cy, size);
      if (cx < size * 2) blob(cx + W, cy, size);
      if (cx > W - size * 2) blob(cx - W, cy, size);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  }

  function makeAcacia(x, z, s) {
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12 * s, 0.22 * s, 3 * s, 10),
      new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 1 })
    );
    trunk.position.y = 1.5 * s;
    trunk.castShadow = true;
    tree.add(trunk);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x4f6b2e, roughness: 0.9 });
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), canopyMat);
    canopy.scale.set(2.6 * s, 0.6 * s, 2.0 * s);
    canopy.position.y = 3.3 * s;
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    tree.add(canopy);
    return tree;
  }
})();
