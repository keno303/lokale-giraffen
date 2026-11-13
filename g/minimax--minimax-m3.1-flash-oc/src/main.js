/* =========================================================================
   main.js — renderer, materials, camera, animation loop and UI.
   ========================================================================= */
(function () {
  'use strict';

  const U = window.U;
  const THREE = window.THREE;

  /* ---------------- renderer ------------------------------------------ */
  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas, antialias: true, powerPreference: 'high-performance', stencil: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(11, 4.4, 9);

  const world = window.World.create(renderer, scene);

  /* ---------------- materials ----------------------------------------- */
  function tex(canvasImage, rx, ry, srgb) {
    const t = new THREE.CanvasTexture(canvasImage);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 8;
    if (srgb !== false) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  const texT0 = performance.now();
  const coatC = window.Tex.makeCoat({ size: 1024, cells: 9, seed: 3 });
  const coatMap = tex(coatC.canvas, 1, 1, true);
  const coatNrm = tex(coatC.normalCanvas, 1, 1, false);
  const coatRgh = tex(coatC.roughCanvas, 1, 1, false);

  const headC = window.Tex.makeHead({ size: 768, cells: 12, seed: 41 });
  const headMap = tex(headC.canvas, 1, 1, true);
  const headNrm = tex(headC.normalCanvas, 1, 1, false);

  const materials = {    coat: new THREE.MeshPhysicalMaterial({
      map: coatMap, normalMap: coatNrm, roughnessMap: coatRgh,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughness: 1.0, metalness: 0.0,
      vertexColors: true,
      envMapIntensity: 0.45,
      sheen: 0.34, sheenColor: U.srgb(0x6b5940), sheenRoughness: 0.78
    }),
    head: new THREE.MeshPhysicalMaterial({
      map: headMap, normalMap: headNrm,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.92, metalness: 0.0,
      envMapIntensity: 0.42,
      sheen: 0.16, sheenColor: U.srgb(0x6b573c), sheenRoughness: 0.8
    }),
    ear: new THREE.MeshPhysicalMaterial({
      map: headMap, normalMap: headNrm,
      normalScale: new THREE.Vector2(0.7, 0.7),
      color: U.srgb(0x9c7b52),
      roughness: 0.94, metalness: 0.0,
      envMapIntensity: 0.4, side: THREE.DoubleSide
    }),
    hoof: new THREE.MeshPhysicalMaterial({
      color: U.srgb(0x2b211a), roughness: 0.6, metalness: 0.0,
      envMapIntensity: 0.6,
      clearcoat: 0.25, clearcoatRoughness: 0.6
    }),
    eye: new THREE.MeshPhysicalMaterial({
      color: U.srgb(0x120c08), roughness: 0.1, metalness: 0.0,
      envMapIntensity: 1.0,
      clearcoat: 1.0, clearcoatRoughness: 0.04
    }),
    horn: new THREE.MeshStandardMaterial({ color: U.srgb(0x2e231a), roughness: 0.68, metalness: 0.0, envMapIntensity: 0.5 }),
    lid: new THREE.MeshStandardMaterial({ color: U.srgb(0x241a12), roughness: 0.55, envMapIntensity: 0.6 }),
    nostril: new THREE.MeshStandardMaterial({ color: U.srgb(0x18110c), roughness: 0.5, envMapIntensity: 0.4 }),
    mane: new THREE.MeshStandardMaterial({
      color: U.srgb(0x4a3524), roughness: 0.92, metalness: 0.0, envMapIntensity: 0.4,
      normalMap: coatNrm, normalScale: new THREE.Vector2(0.6, 0.6), side: THREE.DoubleSide
    }),
    skin: new THREE.MeshStandardMaterial({ color: U.srgb(0x7d5c3b), roughness: 0.85, envMapIntensity: 0.45 })
  };

  console.log('[giraffe] textures generated in ' + Math.round(performance.now() - texT0) + ' ms');

  /* ---------------- the giraffe --------------------------------------- */
  const t0 = performance.now();
  const giraffe = window.Giraffe.create(materials);
  scene.add(giraffe.group);
  const buildMs = Math.round(performance.now() - t0);
  console.log('[giraffe] geometry + rig + walk cycle baked in ' + buildMs + ' ms');

  /* ---------------- dust particles ------------------------------------ */
  const DUST = 160;
  const dustPos = new Float32Array(DUST * 3);
  const dustLife = new Float32Array(DUST);
  const dustVel = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) { dustPos[i * 3 + 1] = -100; dustLife[i] = 0; }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustCanvas = U.canvas(64, 64);
  {
    const c = dustCanvas.getContext('2d');
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.30)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  }
  const dustTex = new THREE.CanvasTexture(dustCanvas);
  const dustMat = new THREE.PointsMaterial({
    size: 0.42, map: dustTex, transparent: true, depthWrite: false,
    opacity: 0.5, sizeAttenuation: true, color: U.srgb(0xd8c49c)
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);
  let dustCursor = 0;
  function spawnDust(x, y, z, amount) {
    const n = amount || 6;
    for (let i = 0; i < n; i++) {
      const k = dustCursor = (dustCursor + 1) % DUST;
      dustPos[k * 3] = x + (Math.random() - 0.5) * 0.22;
      dustPos[k * 3 + 1] = y + Math.random() * 0.08;
      dustPos[k * 3 + 2] = z + (Math.random() - 0.5) * 0.22;
      dustVel[k * 3] = (Math.random() - 0.5) * 0.5 - 0.25;
      dustVel[k * 3 + 1] = Math.random() * 0.55 + 0.12;
      dustVel[k * 3 + 2] = (Math.random() - 0.5) * 0.5;
      dustLife[k] = 1.0;
    }
  }
  function updateDust(dt) {
    for (let i = 0; i < DUST; i++) {
      if (dustLife[i] <= 0) continue;
      dustLife[i] -= dt * 0.75;
      const k = i * 3;
      dustPos[k] += dustVel[k] * dt;
      dustPos[k + 1] += dustVel[k + 1] * dt;
      dustPos[k + 2] += dustVel[k + 2] * dt;
      dustVel[k] *= 0.965; dustVel[k + 1] = dustVel[k + 1] * 0.97 + 0.06 * dt; dustVel[k + 2] *= 0.965;
      if (dustLife[i] <= 0) dustPos[k + 1] = -100;
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  /* ---------------- camera rig ---------------------------------------- */
  const VIEWS = {
    wide: { r: 13.2, theta: 0.82, phi: 1.36, target: [0.5, 2.45, 0], fov: 36, name: 'WIDE 3/4' },
    profile: { r: 10.8, theta: 1.5708, phi: 1.46, target: [0.35, 2.55, 0], fov: 32, name: 'PROFILE' },
    head: { r: 3.6, theta: 1.05, phi: 1.42, target: [1.95, 4.22, 0], fov: 32, name: 'HEAD' },
    low: { r: 8.0, theta: 0.55, phi: 1.94, target: [0.9, 3.05, 0], fov: 46, name: 'LOW ANGLE' },
    orbit: { r: 12.5, theta: 0.9, phi: 1.38, target: [0.4, 2.5, 0], fov: 36, name: 'ORBIT' }
  };
  const viewKeys = Object.keys(VIEWS);
  let viewIndex = 0;
  let view = VIEWS.wide;

  const camTarget = new THREE.Vector3(0.2, 2.55, 0);
  const camPos = new THREE.Vector3(11, 4.4, 9);
  let camTheta = view.theta, camPhi = view.phi, camR = view.r;
  let userTheta = 0, userPhi = 0, userZoom = 0;

  /* mouse look: drag with the left button to orbit, wheel to zoom */
  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('pointerdown', function (e) {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    userTheta -= (e.clientX - lastX) * 0.006;
    userPhi = U.clamp(userPhi - (e.clientY - lastY) * 0.005, -0.75, 0.75);
    lastX = e.clientX; lastY = e.clientY;
  });
  function endDrag(e) {
    dragging = false;
    canvas.style.cursor = 'grab';
    if (e && e.pointerId !== undefined && canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    userZoom = U.clamp(userZoom + e.deltaY * 0.012, -6, 14);
  }, { passive: false });
  canvas.style.cursor = 'grab';

  function applyCamera(dt) {
    const v = view;
    const orbit = (v.name === 'ORBIT');
    if (orbit) {
      v.theta += dt * 0.13;
    }
    // damped follow
    const gx = giraffe.group.position.x;
    const want = new THREE.Vector3(gx + v.target[0], v.target[1], v.target[2]);
    camTarget.lerp(want, 1 - Math.pow(0.0025, dt));
    const wantTheta = v.theta + userTheta;
    const wantPhi = U.clamp(v.phi + userPhi, 0.35, 2.55);
    const wantR = v.r + userZoom;
    camTheta += (wantTheta - camTheta) * (1 - Math.pow(0.02, dt));
    camPhi += (wantPhi - camPhi) * (1 - Math.pow(0.02, dt));
    camR += (wantR - camR) * (1 - Math.pow(0.02, dt));
    camera.fov += (v.fov - camera.fov) * (1 - Math.pow(0.05, dt));
    camera.updateProjectionMatrix();
    const sp = Math.sin(camPhi), cp = Math.cos(camPhi);
    camPos.set(
      camTarget.x + Math.cos(camTheta) * sp * camR,
      camTarget.y + cp * camR,
      camTarget.z + Math.sin(camTheta) * sp * camR);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
  }

  /* ---------------- UI -------------------------------------------------- */
  const el = function (id) { return document.getElementById(id); };
  const fpsEl = el('fps');
  const viewEl = el('viewname');
  const loaderEl = el('loader');
  const speedEl = el('speedval');

  function setView(i, immediate) {
    viewIndex = ((i % viewKeys.length) + viewKeys.length) % viewKeys.length;
    view = VIEWS[viewKeys[viewIndex]];
    viewEl.textContent = view.name;
    userTheta = 0; userPhi = 0; userZoom = 0;
    if (immediate) {
      camTheta = view.theta; camPhi = view.phi; camR = view.r;
      camera.fov = view.fov; camera.updateProjectionMatrix();
      camTarget.set(giraffe.group.position.x + view.target[0], view.target[1], view.target[2]);
    }
  }
  setView(0, true);

  window.addEventListener('keydown', function (e) {
    const k = e.key.toLowerCase();
    if (k === ' ') { giraffe.state.paused = !giraffe.state.paused; el('pausetag').textContent = giraffe.state.paused ? 'PAUSED' : ''; e.preventDefault(); }
    else if (k === 'c') setView(viewIndex + 1);
    else if (k === '[') { giraffe.state.speedScale = Math.max(0, giraffe.state.speedScale - 0.15); speedEl.textContent = giraffe.state.speedScale.toFixed(2) + 'x'; }
    else if (k === ']') { giraffe.state.speedScale = Math.min(2.5, giraffe.state.speedScale + 0.15); speedEl.textContent = giraffe.state.speedScale.toFixed(2) + 'x'; }
    else if (k === 'h') document.body.classList.toggle('hide-ui');
    else if (k === 'r') { giraffe.setPhase(0); }
  });
  el('speedval').textContent = giraffe.state.speedScale.toFixed(2) + 'x';

  /* ---------------- foot-fall detection ------------------------------- */
  const LEG_OFFSETS = { FL: 0.25, FR: 0.75, BL: 0.0, BR: 0.5 };
  const lastP = {};
  function checkFootfalls(prevPhase) {
    const duty = giraffe.gait.duty;
    for (const id in LEG_OFFSETS) {
      const off = LEG_OFFSETS[id];
      const p = (giraffe.state.phase + off) % 1;
      const prev = (prevPhase + off) % 1;
      // crossed the stance boundary -> the foot has just landed
      if (prev < duty && p >= duty && p - prev < 0.5) {
        const bone = giraffe.rig.map[id + '_f'];
        if (bone) {
          const v = new THREE.Vector3(0.02, -0.34, 0).applyMatrix4(bone.matrixWorld);
          spawnDust(v.x, 0.02, v.z, id[0] === 'F' ? 5 : 7);
        }
      }
    }
  }

  /* ---------------- loop ----------------------------------------------- */
  const clock = new THREE.Clock();
  let prevPhase = 0;
  let frames = 0, fpsTime = 0, fps = 0;
  let started = false;

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, clock.getDelta());

    const before = giraffe.state.phase;
    giraffe.update(dt);
    if (!giraffe.state.paused) {
      giraffe.group.position.x += giraffe.gait.speed * giraffe.state.speedScale * dt;
    }
    checkFootfalls(before);
    updateDust(dt);
    world.setCentre(giraffe.group.position.x);
    applyCamera(dt);

    renderer.render(scene, camera);

    frames++; fpsTime += dt;
    if (fpsTime >= 0.5) {
      fps = Math.round(frames / fpsTime);
      frames = 0; fpsTime = 0;
      fpsEl.textContent = fps + ' FPS';
    }
    if (!started) {
      started = true;
      if (loaderEl) {
        loaderEl.classList.add('gone');
        setTimeout(function () { if (loaderEl.parentNode) loaderEl.parentNode.removeChild(loaderEl); }, 600);
      }
    }
  }

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ---------------- url options: #view=profile&phase=0.3&paused -------- */
  (function parseHash() {
    const h = (location.hash || '').replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (part) {
      const kv = part.split('=');
      const k = kv[0], v = kv[1];
      if (k === 'view') {
        const i = viewKeys.findIndex(function (kk) { return kk.toUpperCase() === String(v).toUpperCase(); });
        if (i >= 0) setView(i, true);
      } else if (k === 'phase') {
        giraffe.setPhase(parseFloat(v) || 0);
      } else if (k === 'speed') {
        giraffe.state.speedScale = parseFloat(v) || 1;
        speedEl.textContent = giraffe.state.speedScale.toFixed(2) + 'x';
      } else if (k === 'paused') {
        giraffe.state.paused = true;
        el('pausetag').textContent = 'PAUSED';
      }
    });
  })();

  animate();

  // expose a little API for debugging / screenshots
  window.__giraffe = {
    giraffe: giraffe, renderer: renderer, scene: scene, camera: camera,
    setView: setView, setPhase: function (p) { giraffe.setPhase(p); }
  };
})();
