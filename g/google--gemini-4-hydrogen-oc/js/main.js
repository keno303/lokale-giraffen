(function (global) {
  'use strict';

  function init() {
    const container = document.getElementById('canvas-container');

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Subtle PBR environment reflections for eyes, hooves & coat sheen
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new THREE.RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.28;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(
      42,
      window.innerWidth / window.innerHeight,
      0.1,
      400
    );

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.6;
    controls.maxDistance = 32;
    controls.maxPolarAngle = Math.PI * 0.495;

    // Build Savanna Environment & Giraffe Model
    const savanna = global.SavannaEnv.createSavannaEnvironment(scene);
    const giraffe = global.GiraffeAnatomy.createGiraffeModel();
    scene.add(giraffe.rootGroup);

    const controller = global.GiraffeGait.createGiraffeController(giraffe, function (hoofWorldPos) {
      savanna.spawnHoofDust(hoofWorldPos);
    });

    // Optional Skeleton Debug Helper
    const skelHelper = new THREE.SkeletonHelper(giraffe.rootGroup);
    skelHelper.visible = false;
    scene.add(skelHelper);

    // ------------------------------------------------------------
    // Camera Presets & Smooth Tracking
    // ------------------------------------------------------------
    let activeCameraPreset = 'portrait'; // 'portrait' | 'side' | 'low' | 'closeup' | 'free'
    const prevGiraffePos = controller.state.worldPos.clone();
    const desiredCamPos = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();
    const _fwd = new THREE.Vector3();
    const _right = new THREE.Vector3();

    function computePresetVectors(preset, outPos, outTarget) {
      const pos = controller.state.worldPos;
      const yaw = controller.state.heading;
      _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
      _right.set(_fwd.z, 0, -_fwd.x); // Giraffe right side (-X local)

      if (preset === 'side') {
        outTarget.set(pos.x + _fwd.x * 0.45, pos.y + 2.65, pos.z + _fwd.z * 0.45);
        outPos.copy(outTarget)
          .addScaledVector(_right, 7.6)
          .addScaledVector(_fwd, 0.2);
        outPos.y = pos.y + 2.75;
      } else if (preset === 'low') {
        outTarget.set(pos.x + _fwd.x * 0.45, pos.y + 2.48, pos.z + _fwd.z * 0.45);
        outPos.copy(pos)
          .addScaledVector(_right, 5.4)
          .addScaledVector(_fwd, 5.6);
        outPos.y = Math.max(pos.y + 0.95, global.GiraffeMath.getTerrainHeight(outPos.x, outPos.z) + 0.70);
      } else if (preset === 'closeup') {
        outTarget.set(pos.x + _fwd.x * 1.85, pos.y + 4.45, pos.z + _fwd.z * 1.85);
        outPos.copy(outTarget)
          .addScaledVector(_right, 1.95)
          .addScaledVector(_fwd, 1.55);
        outPos.y = pos.y + 4.65;
      } else {
        // 'portrait' 3/4 view (default)
        outTarget.set(pos.x + _fwd.x * 0.45, pos.y + 2.72, pos.z + _fwd.z * 0.45);
        outPos.copy(outTarget)
          .addScaledVector(_right, 6.2)
          .addScaledVector(_fwd, 4.6);
        outPos.y = pos.y + 3.05;
      }
    }

    // Set initial camera immediately
    controller.update(0.016);
    prevGiraffePos.copy(controller.state.worldPos);
    computePresetVectors('portrait', camera.position, controls.target);
    controls.update();

    // If user drags or zooms manually, keep translating with giraffe but stop snapping back to preset
    controls.addEventListener('start', function () {
      activeCameraPreset = 'free';
      updateActiveButtons();
    });

    // ------------------------------------------------------------
    // UI Controls & Keyboard Shortcuts
    // ------------------------------------------------------------
    const uiPanel = document.getElementById('hud-panel');
    const toggleHudBtn = document.getElementById('toggle-hud-btn');
    const pauseBtn = document.getElementById('btn-pause');
    const skelBtn = document.getElementById('btn-skeleton');
    const treadmillBtn = document.getElementById('btn-treadmill');

    function updateActiveButtons() {
      document.querySelectorAll('[data-cam]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.cam === activeCameraPreset);
      });
    }

    document.querySelectorAll('[data-cam]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCameraPreset = btn.dataset.cam;
        updateActiveButtons();
      });
    });

    document.querySelectorAll('[data-speed]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-speed]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        controller.state.targetSpeed = parseFloat(btn.dataset.speed);
        if (controller.state.paused) {
          controller.state.paused = false;
          pauseBtn.textContent = 'Pause';
          pauseBtn.classList.remove('active');
        }
      });
    });

    document.querySelectorAll('[data-species]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-species]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        giraffe.coatMaterial.userData.uniforms.uCoatSpecies.value = parseInt(btn.dataset.species, 10);
      });
    });

    document.querySelectorAll('[data-tod]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-tod]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        savanna.setTimeOfDay(btn.dataset.tod);
      });
    });

    function togglePause() {
      controller.state.paused = !controller.state.paused;
      pauseBtn.textContent = controller.state.paused ? 'Resume' : 'Pause';
      pauseBtn.classList.toggle('active', controller.state.paused);
    }

    function toggleSkeleton() {
      skelHelper.visible = !skelHelper.visible;
      skelBtn.classList.toggle('active', skelHelper.visible);
    }

    function toggleTreadmill() {
      controller.state.treadmillMode = !controller.state.treadmillMode;
      treadmillBtn.classList.toggle('active', controller.state.treadmillMode);
    }

    function toggleHud() {
      const collapsed = uiPanel.classList.toggle('collapsed');
      toggleHudBtn.textContent = collapsed ? 'Show Controls (H)' : 'Hide (H)';
    }

    pauseBtn.addEventListener('click', togglePause);
    skelBtn.addEventListener('click', toggleSkeleton);
    treadmillBtn.addEventListener('click', toggleTreadmill);
    toggleHudBtn.addEventListener('click', toggleHud);

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
      } else if (e.key === 'h' || e.key === 'H') {
        toggleHud();
      } else if (e.key === 'd' || e.key === 'D') {
        toggleSkeleton();
      } else if (e.key === 't' || e.key === 'T') {
        toggleTreadmill();
      }
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Support optional URL params (e.g. ?cam=side&species=1) for direct views
    const urlParams = new URLSearchParams(window.location.search);
    const paramCam = urlParams.get('cam');
    if (paramCam && ['portrait', 'side', 'low', 'closeup'].includes(paramCam)) {
      activeCameraPreset = paramCam;
      updateActiveButtons();
    }
    const paramSpecies = urlParams.get('species');
    if (paramSpecies !== null) {
      const sp = parseInt(paramSpecies, 10);
      if (!Number.isNaN(sp)) {
        giraffe.coatMaterial.userData.uniforms.uCoatSpecies.value = sp;
        document.querySelectorAll('[data-species]').forEach((b) => {
          b.classList.toggle('active', parseInt(b.dataset.species, 10) === sp);
        });
      }
    }
    const paramTod = urlParams.get('tod');
    if (paramTod && ['golden', 'midday', 'dusk'].includes(paramTod)) {
      savanna.setTimeOfDay(paramTod);
      document.querySelectorAll('[data-tod]').forEach((b) => {
        b.classList.toggle('active', b.dataset.tod === paramTod);
      });
    }
    if (urlParams.get('skel') === '1') {
      skelHelper.visible = true;
      skelBtn.classList.add('active');
    }
    if (urlParams.get('hide') === '1') {
      toggleHud();
    }

    // Re-snap initial camera if preset changed by URL param
    computePresetVectors(activeCameraPreset, camera.position, controls.target);
    controls.update();

    // ------------------------------------------------------------
    // Main Render Loop
    // ------------------------------------------------------------
    let lastTimeMs = performance.now();
    let elapsed = 0;
    const deltaPos = new THREE.Vector3();

    function animate() {
      requestAnimationFrame(animate);
      const nowMs = performance.now();
      const dt = Math.min((nowMs - lastTimeMs) * 0.001, 0.05);
      lastTimeMs = nowMs;
      elapsed += dt;

      controller.update(dt);
      giraffe.coatMaterial.userData.uniforms.uTime.value = controller.state.totalTime;

      const curPos = controller.state.worldPos;
      deltaPos.subVectors(curPos, prevGiraffePos);
      prevGiraffePos.copy(curPos);

      // Keep camera moving along with the walking giraffe
      camera.position.add(deltaPos);
      controls.target.add(deltaPos);

      if (activeCameraPreset !== 'free') {
        computePresetVectors(activeCameraPreset, desiredCamPos, desiredTarget);
        const smooth = 1 - Math.exp(-dt * 2.8);
        camera.position.lerp(desiredCamPos, smooth);
        controls.target.lerp(desiredTarget, smooth);
      }

      // Prevent camera from dipping below terrain
      const minCamY = global.GiraffeMath.getTerrainHeight(camera.position.x, camera.position.z) + 0.35;
      if (camera.position.y < minCamY) {
        camera.position.y = minCamY;
      }

      controls.update();
      savanna.update(dt, elapsed, curPos);
      renderer.render(scene, camera);
    }

    animate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
