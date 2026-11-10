/* ------------------------------------------------------------------
 * main.js — renderer, camera rig, gait driver, UI.
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  const canvas = document.getElementById('view');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, powerPreference: 'high-performance'
    });
  } catch (e) {
    document.getElementById('nogl').style.display = 'flex';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  /* ---- world ---- */
  const Q = new URLSearchParams(location.search);
  const env = Environment.build();
  const scene = env.scene;
  if (Q.has('solo')) {
    env.world.visible = false;          // giraffe-only shots
    scene.fog = null;
  }
  const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 1200);

  /* ---- giraffe ---- */
  let palKey = 'masai';
  let rig = Giraffe.build(palKey);
  scene.add(rig.root);

  const PATH_R = 13.0;
  let pathAngle = 0;
  rig.root.position.set(PATH_R, Giraffe.BODY_Y, 0);

  /* ---- state ---- */
  const state = {
    walking: true, speed: 1.15, autoOrbit: true,
    preset: 'full', fps: 0, t: 0
  };

  /* ---- camera rig (custom orbit control) ---- */
  const orbit = {
    az: -1.05, pol: 1.30, dist: 15.5,
    tAz: -1.05, tPol: 1.30, tDist: 15.5,
    target: new THREE.Vector3(PATH_R, 2.6, 0),
    tTarget: new THREE.Vector3(PATH_R, 2.6, 0)
  };
  const PRESETS = {
    full: { az: -1.05, pol: 1.30, dist: 15.5, ty: 2.6, fov: 46 },
    side: { az: -1.57, pol: 1.45, dist: 12.0, ty: 2.5, fov: 40 },
    head: { az: -0.55, pol: 1.18, dist: 3.1, ty: 4.35, fov: 38 },
    top: { az: -0.9, pol: 0.35, dist: 17.0, ty: 1.4, fov: 46 },
    legs: { az: -1.4, pol: 1.42, dist: 5.2, ty: 1.0, fov: 40 }
  };

  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('pointerdown', e => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    state.autoOrbit = false; syncUI();
  });
  canvas.addEventListener('pointerup', e => {
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { }
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    orbit.tAz -= dx * 0.005;
    orbit.tPol = Math.max(0.18, Math.min(1.52, orbit.tPol - dy * 0.005));
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    orbit.tDist = Math.max(1.6, Math.min(60, orbit.tDist * (1 + Math.sign(e.deltaY) * 0.09)));
  }, { passive: false });

  function applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    state.preset = name;
    orbit.tAz = p.az; orbit.tPol = p.pol; orbit.tDist = p.dist;
    orbit.tTarget.y = p.ty;
    camera.fov = p.fov; camera.updateProjectionMatrix();
    syncUI();
  }

  /* ---- UI ---- */
  const ui = {
    walk: document.getElementById('btn-walk'),
    speed: document.getElementById('speed'),
    speedVal: document.getElementById('speed-val'),
    coat: document.getElementById('coat'),
    orbit: document.getElementById('btn-orbit'),
    fps: document.getElementById('fps'),
    presetBtns: Array.prototype.slice.call(document.querySelectorAll('[data-preset]'))
  };

  function syncUI() {
    ui.walk.classList.toggle('on', state.walking);
    ui.walk.textContent = state.walking ? 'Walking' : 'Standing';
    ui.orbit.classList.toggle('on', state.autoOrbit);
    ui.speedVal.textContent = state.speed.toFixed(2) + ' m/s';
    ui.presetBtns.forEach(b => b.classList.toggle('on', b.dataset.preset === state.preset));
  }

  ui.walk.addEventListener('click', () => {
    state.walking = !state.walking; syncUI();
  });
  ui.speed.addEventListener('input', () => {
    state.speed = parseFloat(ui.speed.value);
    if (state.speed > 0.05) state.walking = true;
    syncUI();
  });
  ui.coat.addEventListener('change', () => {
    palKey = ui.coat.value;
    scene.remove(rig.root);
    disposeDeep(rig.root);
    rig = Giraffe.build(palKey);
    rig.root.position.set(PATH_R * Math.cos(pathAngle), Giraffe.BODY_Y, PATH_R * Math.sin(pathAngle));
    scene.add(rig.root);
    syncUI();
  });
  ui.orbit.addEventListener('click', () => {
    state.autoOrbit = !state.autoOrbit; syncUI();
  });
  ui.presetBtns.forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.preset)));

  function disposeDeep(obj) {
    obj.traverse(o => {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
        const m = o.material;
        if (m) {
          const list = Array.isArray(m) ? m : [m];
          for (const mm of list) {
            for (const k in mm) {
              const v = mm[k];
              if (v && v.isTexture) v.dispose();
            }
          }
          if (!Array.isArray(m)) m.dispose();
        }
      }
    });
  }

  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { state.walking = !state.walking; syncUI(); e.preventDefault(); }
    else if (e.key === 'o' || e.key === 'O') { state.autoOrbit = !state.autoOrbit; syncUI(); }
    else if (e.key === '1') applyPreset('full');
    else if (e.key === '2') applyPreset('side');
    else if (e.key === '3') applyPreset('head');
    else if (e.key === '4') applyPreset('legs');
    else if (e.key === '5') applyPreset('top');
    else if (e.key === 'c' || e.key === 'C') {
      const keys = Object.keys(Textures.PALETTES);
      ui.coat.value = keys[(keys.indexOf(palKey) + 1) % keys.length];
      ui.coat.dispatchEvent(new Event('change'));
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ---- main loop ---- */
  const clock = new THREE.Clock();
  let fpsAcc = 0, fpsN = 0;
  const hoofPrev = {};

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    state.t += dt;

    /* walk along the circular path at exactly the gait speed */
    if (state.walking) {
      pathAngle += dt * state.speed / PATH_R;
    }
    const cx = Math.cos(pathAngle) * PATH_R, cz = Math.sin(pathAngle) * PATH_R;
    rig.root.position.set(cx, Giraffe.BODY_Y, cz);
    rig.root.rotation.y = Math.atan2(-Math.cos(pathAngle), -Math.sin(pathAngle));

    rig.update(dt, { walking: state.walking, speed: state.speed });
    rig.root.updateMatrixWorld(true);

    /* hoof-strike dust */
    if (state.walking) {
      for (const n of ['LF', 'RF', 'LH', 'RH']) {
        const leg = rig.legs[n];
        const u = ((rig.state.phase - leg.phase) % 1 + 1) % 1;
        const prev = hoofPrev[n];
        if (prev !== undefined && prev > rig.state.duty && u <= rig.state.duty) {
          const p = new THREE.Vector3();
          leg.hoof.getWorldPosition(p);
          env.spawnDust(p, 0.55);
        }
        hoofPrev[n] = u;
      }
    }

    /* shadow camera follows the animal */
    env.sun.target.position.set(cx, 1.0, cz);
    env.sun.position.set(cx, 1.0, cz).addScaledVector(
      new THREE.Vector3(0.42, 0.62, 0.66).normalize(), 60);

    /* camera: follow the animal, orbit around it */
    const bodyPos = new THREE.Vector3();
    rig.body.getWorldPosition(bodyPos);
    const preset = PRESETS[state.preset];
    const ty = preset ? preset.ty : 2.6;
    orbit.tTarget.set(cx, ty, cz);
    const k = 1 - Math.pow(0.0015, dt);
    orbit.target.lerp(orbit.tTarget, k);
    orbit.az += (orbit.tAz - orbit.az) * k;
    orbit.pol += (orbit.tPol - orbit.pol) * k;
    orbit.dist += (orbit.tDist - orbit.dist) * k;
    if (state.autoOrbit && !dragging) orbit.tAz += dt * 0.055;

    const sp = Math.sin(orbit.pol), cp = Math.cos(orbit.pol);
    camera.position.set(
      orbit.target.x + orbit.dist * sp * Math.cos(orbit.az),
      orbit.target.y + orbit.dist * cp,
      orbit.target.z + orbit.dist * sp * Math.sin(orbit.az));
    camera.lookAt(orbit.target);

    env.update(dt, state.t);
    renderer.render(scene, camera);

    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) {
      state.fps = fpsN / fpsAcc;
      ui.fps.textContent = state.fps.toFixed(0) + ' fps · ' +
        (renderer.info.render.triangles / 1000).toFixed(0) + 'k tris';
      fpsAcc = 0; fpsN = 0;
    }
    requestAnimationFrame(frame);
  }

  syncUI();
  applyPreset(Q.get('preset') || 'full');
  if (Q.has('debug')) startDebug();
  frame();

  /* ---- diagnostics: dump the giraffe's projected box + colour samples ---- */
  function startDebug() {
    let n = 0;
    const iv = setInterval(() => {
      n++;
      const box = new THREE.Box3().setFromObject(rig.root);
      const pt = p => {
        const v = p.clone().project(camera);
        return [Math.round((v.x * 0.5 + 0.5) * window.innerWidth),
        Math.round((-v.y * 0.5 + 0.5) * window.innerHeight)];
      };
      const c = new THREE.Vector3(); rig.body.getWorldPosition(c);
      const head = new THREE.Vector3(); rig.head.grp.getWorldPosition(head);
      const feet = [];
      for (const k of ['LF', 'RF', 'LH', 'RH']) {
        const p = new THREE.Vector3(); rig.legs[k].hoof.getWorldPosition(p); feet.push(pt(p));
      }
      console.log('DBG frame', n,
        'cam', camera.position.toArray().map(v => v.toFixed(1)).join(','),
        'target', orbit.target.toArray().map(v => v.toFixed(1)).join(','),
        'box', box.min.toArray().map(v => v.toFixed(2)).join(','), '->',
        box.max.toArray().map(v => v.toFixed(2)).join(','),
        'bodyScreen', pt(c), 'headScreen', pt(head),
        'feet', feet.map(f => f.join('/')).join(' '),
        'tris', renderer.info.render.triangles);
      if (n > 12) clearInterval(iv);
    }, 400);
  }
})();
