(function (global) {
  'use strict';

  const G = (global.GiraffeApp = global.GiraffeApp || {});
  const THREE = global.THREE;
  const { damp } = G.MathUtils;

  function init() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // Scene & Environment PMREM
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new THREE.RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.48;
    roomEnv.dispose();
    pmrem.dispose();

    const params = new URLSearchParams(window.location.search);
    const initSpecies = params.get('species') || 'reticulated';
    const initLighting = params.get('lighting') || 'golden';
    const initView = params.get('view') || 'hero';
    const initPhase = params.get('phase');
    const hideUi = params.get('ui') === '0';

    const env = G.Environment.createSavannahEnvironment(scene);
    let currentLighting = G.Environment.LIGHTING_PRESETS[initLighting] ? initLighting : 'golden';
    env.applyLighting(currentLighting, renderer);

    // Create Realistic Giraffe
    const giraffe = G.Anatomy.createGiraffe(initSpecies);
    scene.add(giraffe.group);

    const controller = new G.Gait.GiraffeController(giraffe);
    controller.onHoofStrike = (pos) => env.dust.emit(pos);
    controller.resetPose(0, 0, 0.25);
    if (initPhase !== null && !Number.isNaN(parseFloat(initPhase))) {
      controller.paused = true;
      controller.phase = parseFloat(initPhase);
      controller.initFootStates();
      controller.update(0, env.obstacles);
    }

    // Camera & OrbitControls
    const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 450);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 0.7;
    controls.maxDistance = 35;
    controls.maxPolarAngle = Math.PI * 0.495;

    const CAMERA_PRESETS = {
      hero: { offset: new THREE.Vector3(6.8, 3.0, 6.2), target: new THREE.Vector3(-0.35, 2.62, 0.45) },
      side: { offset: new THREE.Vector3(8.6, 2.7, 0.45), target: new THREE.Vector3(0, 2.62, 0.45) },
      front: { offset: new THREE.Vector3(1.6, 2.9, 8.2), target: new THREE.Vector3(0, 2.65, 0.5) },
      head: { offset: new THREE.Vector3(1.05, 4.90, 2.95), target: new THREE.Vector3(0, 4.74, 1.88) },
      hooves: { offset: new THREE.Vector3(2.8, 0.62, 1.1), target: new THREE.Vector3(0, 0.65, 0.0) }
    };

    let cameraTransition = null;
    function applyCameraPreset(name, instant = false) {
      const p = CAMERA_PRESETS[name] || CAMERA_PRESETS.hero;
      const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), controller.heading);
      const worldTarget = p.target.clone().applyQuaternion(rot).add(controller.position);
      const worldCam = p.offset.clone().applyQuaternion(rot).add(controller.position);

      if (instant) {
        camera.position.copy(worldCam);
        controls.target.copy(worldTarget);
        controls.update();
        cameraTransition = null;
      } else {
        cameraTransition = {
          localOffset: p.offset.clone(),
          localTarget: p.target.clone(),
          progress: 0
        };
      }
    }

    applyCameraPreset(initView, true);
    if (hideUi) {
      const panel = document.getElementById('hud-panel');
      if (panel) panel.style.display = 'none';
    }

    // Wire UI
    const ui = {
      speedSlider: document.getElementById('speed-slider'),
      speedVal: document.getElementById('speed-val'),
      pauseBtn: document.getElementById('pause-btn'),
      speciesSelect: document.getElementById('species-select'),
      modeSelect: document.getElementById('mode-select'),
      lightingSelect: document.getElementById('lighting-select'),
      skelToggle: document.getElementById('skel-toggle'),
      toggleHudBtn: document.getElementById('toggle-hud-btn'),
      hudPanel: document.getElementById('hud-panel'),
      presetBtns: document.querySelectorAll('[data-camera-preset]')
    };

    if (ui.speedSlider) {
      ui.speedSlider.addEventListener('input', () => {
        controller.speed = parseFloat(ui.speedSlider.value);
        if (ui.speedVal) ui.speedVal.textContent = `${controller.speed.toFixed(2)} m/s`;
      });
    }

    if (ui.pauseBtn) {
      ui.pauseBtn.addEventListener('click', () => {
        controller.paused = !controller.paused;
        ui.pauseBtn.textContent = controller.paused ? 'Resume Walk' : 'Pause Stride';
      });
    }

    if (ui.speciesSelect) {
      ui.speciesSelect.addEventListener('change', () => {
        G.CoatShader.updateCoatSpecies(giraffe.coatMaterial, ui.speciesSelect.value);
      });
    }

    if (ui.modeSelect) {
      ui.modeSelect.addEventListener('change', () => {
        controller.walkMode = ui.modeSelect.value;
        if (controller.walkMode === 'treadmill') {
          controller.resetPose(0, 0, 0.25);
          applyCameraPreset('hero', false);
        }
      });
    }

    if (ui.lightingSelect) {
      ui.lightingSelect.addEventListener('change', () => {
        currentLighting = ui.lightingSelect.value;
        env.applyLighting(currentLighting, renderer);
      });
    }

    if (ui.skelToggle) {
      ui.skelToggle.addEventListener('change', () => {
        giraffe.skeletonHelper.visible = ui.skelToggle.checked;
      });
    }

    ui.presetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        ui.presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyCameraPreset(btn.dataset.cameraPreset, false);
      });
    });

    if (ui.toggleHudBtn && ui.hudPanel) {
      ui.toggleHudBtn.addEventListener('click', () => {
        ui.hudPanel.classList.toggle('collapsed');
      });
    }

    // Cancel automatic camera glide if user grabs OrbitControls
    controls.addEventListener('start', () => {
      cameraTransition = null;
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'h' || e.key === 'H') {
        ui.hudPanel?.classList.toggle('collapsed');
      } else if (e.key === ' ') {
        e.preventDefault();
        controller.paused = !controller.paused;
        if (ui.pauseBtn) ui.pauseBtn.textContent = controller.paused ? 'Resume Walk' : 'Pause Stride';
      }
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Main Loop
    let lastTime = performance.now();
    const prevGiraffePos = controller.position.clone();

    function animate(now) {
      requestAnimationFrame(animate);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      controller.update(dt, env.obstacles);
      env.update(dt, controller.time, controller.position, currentLighting);

      // Move camera & orbit target along with giraffe
      const deltaPos = controller.position.clone().sub(prevGiraffePos);
      camera.position.add(deltaPos);
      controls.target.add(deltaPos);
      prevGiraffePos.copy(controller.position);

      if (cameraTransition) {
        const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), controller.heading);
        const desiredTarget = cameraTransition.localTarget.clone().applyQuaternion(rot).add(controller.position);
        const desiredCam = cameraTransition.localOffset.clone().applyQuaternion(rot).add(controller.position);

        camera.position.x = damp(camera.position.x, desiredCam.x, 5.5, dt);
        camera.position.y = damp(camera.position.y, desiredCam.y, 5.5, dt);
        camera.position.z = damp(camera.position.z, desiredCam.z, 5.5, dt);
        controls.target.x = damp(controls.target.x, desiredTarget.x, 6.5, dt);
        controls.target.y = damp(controls.target.y, desiredTarget.y, 6.5, dt);
        controls.target.z = damp(controls.target.z, desiredTarget.z, 6.5, dt);

        if (camera.position.distanceTo(desiredCam) < 0.03) {
          cameraTransition = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    }

    requestAnimationFrame(animate);

    // Deterministic Inspection API (also useful for automated screenshot checks)
    global.__GIRAFFE_DEBUG__ = {
      scene,
      camera,
      controls,
      controller,
      giraffe,
      setPreset: (name) => applyCameraPreset(name, true),
      setSpecies: (s) => G.CoatShader.updateCoatSpecies(giraffe.coatMaterial, s),
      setLighting: (l) => { currentLighting = l; env.applyLighting(l, renderer); },
      stepToPhase: (p) => {
        controller.paused = true;
        controller.phase = p;
        controller.initFootStates();
        controller.update(0, env.obstacles);
        prevGiraffePos.copy(controller.position);
        renderer.render(scene, camera);
      },
      renderNow: () => renderer.render(scene, camera)
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
