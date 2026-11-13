(function () {
  'use strict';

  function initApp() {
    const container = document.getElementById('canvas-container');

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      40,
      window.innerWidth / window.innerHeight,
      0.08,
      900
    );

    // Build Savanna Habitat, Giraffe Skinned Character & Lateral-Sequence Gait Controller
    const world = window.SavannaWorld.createSavannaWorld(scene, renderer);
    const giraffe = window.GiraffeMesh.createGiraffeCharacter();
    scene.add(giraffe.group);
    scene.add(giraffe.skeletonHelper);

    const gait = window.GiraffeGait.createGiraffeGaitController(giraffe, world);

    // OrbitControls riding smoothly with the walking giraffe
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 0.45;
    controls.maxDistance = 28.0;
    controls.maxPolarAngle = Math.PI * 0.495; // prevent camera clipping underground

    // Camera presets in Giraffe-relative coordinates:
    // +X = animal's left (viewer's right side of animal), +Y = height above trail, +Z = ahead of animal
    const cameraPresets = {
      hero: {
        cam: new THREE.Vector3(6.45, 2.42, 6.20),
        target: new THREE.Vector3(-0.35, 2.52, 0.45),
        fov: 38
      },
      side: {
        cam: new THREE.Vector3(8.95, 2.52, 0.45),
        target: new THREE.Vector3(0.0, 2.52, 0.45),
        fov: 38
      },
      front: {
        cam: new THREE.Vector3(0.30, 2.52, 9.20),
        target: new THREE.Vector3(0.0, 2.52, 0.45),
        fov: 38
      },
      rear: {
        cam: new THREE.Vector3(5.25, 2.42, -7.15),
        target: new THREE.Vector3(0.0, 2.46, 0.15),
        fov: 38
      },
      head: {
        cam: new THREE.Vector3(1.18, 4.65, 2.50),
        target: new THREE.Vector3(0.0, 4.58, 1.96),
        fov: 34
      },
      hooves: {
        cam: new THREE.Vector3(2.55, 0.68, 0.20),
        target: new THREE.Vector3(0.0, 0.52, -0.18),
        fov: 36
      }
    };

    function giraffeLocalToWorld(relVec, outVec) {
      const base = gait.getBodyWorldPosition();
      const fwd = gait.getBodyForward();
      const left = gait.getBodyLeft();
      outVec.copy(base)
        .addScaledVector(left, relVec.x)
        .addScaledVector(fwd, relVec.z);
      outVec.y += relVec.y;
      return outVec;
    }

    let camTransition = null;

    function snapCameraPreset(name) {
      const p = cameraPresets[name] || cameraPresets.hero;
      const wCam = giraffeLocalToWorld(p.cam, new THREE.Vector3());
      const wTarget = giraffeLocalToWorld(p.target, new THREE.Vector3());
      camera.fov = p.fov;
      camera.updateProjectionMatrix();
      camera.position.copy(wCam);
      controls.target.copy(wTarget);
      controls.update();
      camTransition = null;
    }

    function animateCameraPreset(name) {
      const p = cameraPresets[name] || cameraPresets.hero;
      camTransition = {
        preset: p,
        progress: 0.0,
        duration: 0.75,
        startOffsetCam: camera.position.clone().sub(gait.getBodyWorldPosition()),
        startOffsetTarget: controls.target.clone().sub(gait.getBodyWorldPosition()),
        startFov: camera.fov
      };
    }

    // Track giraffe base movement delta so OrbitControls glides effortlessly alongside
    let lastGiraffePos = gait.getBodyWorldPosition();
    let lastGiraffeYaw = Math.atan2(gait.getBodyForward().x, gait.getBodyForward().z);

    world.update(0.016, lastGiraffePos, gait.footDiagnostics, lastGiraffeYaw);
    snapCameraPreset('hero');

    // =========================================================================
    // UI CONTROLS BINDING
    // =========================================================================
    const uiPanel = document.getElementById('hud-panel');
    const toggleBtn = document.getElementById('hud-toggle');
    const speedSlider = document.getElementById('ctrl-speed');
    const speedVal = document.getElementById('val-speed');
    const phaseSlider = document.getElementById('ctrl-phase');
    const phaseVal = document.getElementById('val-phase');
    const bobSlider = document.getElementById('ctrl-bob');
    const bobVal = document.getElementById('val-bob');
    const skelCheckbox = document.getElementById('ctrl-skeleton');

    let isPaused = false;
    let isDiagnosticMode = false;

    function setSubspecies(name) {
      const map = { reticulated: 0.0, masai: 1.0, rothschild: 2.0 };
      const val = map[name] !== undefined ? map[name] : 0.0;
      giraffe.materials.skin.userData.uniforms.uSubspecies.value = val;
      document.querySelectorAll('[data-coat]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-coat') === name);
      });
    }

    function setLightMode(name) {
      world.setLightingPreset(name);
      document.querySelectorAll('[data-light]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-light') === name);
      });
    }

    if (toggleBtn && uiPanel) {
      toggleBtn.addEventListener('click', () => {
        uiPanel.classList.toggle('collapsed');
        toggleBtn.textContent = uiPanel.classList.contains('collapsed') ? 'Controls' : 'Hide';
      });
    }

    document.querySelectorAll('[data-cam]').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-cam');
        document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('active', b === btn));
        animateCameraPreset(view);
      });
    });

    document.querySelectorAll('[data-coat]').forEach(btn => {
      btn.addEventListener('click', () => setSubspecies(btn.getAttribute('data-coat')));
    });

    document.querySelectorAll('[data-light]').forEach(btn => {
      btn.addEventListener('click', () => setLightMode(btn.getAttribute('data-light')));
    });

    if (speedSlider) {
      speedSlider.addEventListener('input', () => {
        const v = parseFloat(speedSlider.value);
        gait.config.speedMultiplier = v;
        isPaused = v <= 0.001;
        if (speedVal) speedVal.textContent = isPaused ? 'Paused' : v.toFixed(2) + 'x';
      });
    }

    if (phaseSlider) {
      phaseSlider.addEventListener('input', () => {
        const p = parseFloat(phaseSlider.value);
        gait.config.speedMultiplier = 0.0;
        isPaused = true;
        if (speedSlider) speedSlider.value = '0';
        if (speedVal) speedVal.textContent = 'Scrub';
        gait.setPhaseDirectly(p);
        const curPos = gait.getBodyWorldPosition();
        const delta = curPos.clone().sub(lastGiraffePos);
        camera.position.add(delta);
        controls.target.add(delta);
        lastGiraffePos.copy(curPos);
        lastGiraffeYaw = Math.atan2(gait.getBodyForward().x, gait.getBodyForward().z);
        if (phaseVal) phaseVal.textContent = Math.round(p * 100) + '%';
      });
    }

    if (bobSlider) {
      bobSlider.addEventListener('input', () => {
        const b = parseFloat(bobSlider.value);
        gait.config.neckBobAmount = b;
        if (bobVal) bobVal.textContent = Math.round(b * 100) + '%';
      });
    }

    if (skelCheckbox) {
      skelCheckbox.addEventListener('change', () => {
        giraffe.skeletonHelper.visible = skelCheckbox.checked;
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (isPaused) {
          isPaused = false;
          gait.config.speedMultiplier = 1.0;
          if (speedSlider) speedSlider.value = '1.0';
          if (speedVal) speedVal.textContent = '1.00x';
        } else {
          isPaused = true;
          gait.config.speedMultiplier = 0.0;
          if (speedSlider) speedSlider.value = '0.0';
          if (speedVal) speedVal.textContent = 'Paused';
        }
      } else if (e.key === 'h' || e.key === 'H') {
        if (uiPanel) uiPanel.classList.toggle('collapsed');
      }
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // =========================================================================
    // MAIN ANIMATION LOOP
    // =========================================================================
    let prevTime = performance.now();
    const _rotDelta = new THREE.Quaternion();
    const _upAxis = new THREE.Vector3(0, 1, 0);

    function tickFrame(dt) {
      if (!isPaused) {
        gait.update(dt);
      } else if (gait.config.speedMultiplier <= 0.001 && (!phaseSlider || document.activeElement !== phaseSlider)) {
        // Keep subtle breathing, blinking, ear flicks & tail sway alive while paused in live view!
        gait.update(dt);
      }

      const curPos = gait.getBodyWorldPosition();
      const curFwd = gait.getBodyForward();
      const curYaw = Math.atan2(curFwd.x, curFwd.z);

      // Keep camera & OrbitControls anchored smoothly to the walking giraffe (including gentle trail turn!)
      const moveDelta = curPos.clone().sub(lastGiraffePos);
      let dYaw = curYaw - lastGiraffeYaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;

      camera.position.add(moveDelta);
      controls.target.add(moveDelta);

      if (Math.abs(dYaw) > 1e-7) {
        _rotDelta.setFromAxisAngle(_upAxis, dYaw);
        camera.position.sub(curPos).applyQuaternion(_rotDelta).add(curPos);
        controls.target.sub(curPos).applyQuaternion(_rotDelta).add(curPos);
      }

      lastGiraffePos.copy(curPos);
      lastGiraffeYaw = curYaw;

      // Smooth preset camera transitions
      if (camTransition) {
        camTransition.progress += dt / camTransition.duration;
        const t = Math.min(1.0, camTransition.progress);
        const ease = t * t * (3.0 - 2.0 * t);

        const endCam = giraffeLocalToWorld(camTransition.preset.cam, new THREE.Vector3());
        const endTarget = giraffeLocalToWorld(camTransition.preset.target, new THREE.Vector3());
        const startCam = curPos.clone().add(camTransition.startOffsetCam);
        const startTarget = curPos.clone().add(camTransition.startOffsetTarget);

        camera.position.lerpVectors(startCam, endCam, ease);
        controls.target.lerpVectors(startTarget, endTarget, ease);
        camera.fov = camTransition.startFov + (camTransition.preset.fov - camTransition.startFov) * ease;
        camera.updateProjectionMatrix();

        if (t >= 1.0) camTransition = null;
      }

      controls.update();
      world.update(dt, curPos, gait.footDiagnostics, curYaw);

      if (!isPaused && phaseSlider && phaseVal) {
        const cp = gait.getCyclePhase();
        phaseSlider.value = cp.toFixed(3);
        phaseVal.textContent = Math.round(cp * 100) + '%';
      }

      renderer.render(scene, camera);
    }

    function animate(now) {
      requestAnimationFrame(animate);
      if (isDiagnosticMode) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - prevTime) * 0.001));
      prevTime = now;
      tickFrame(dt);
    }

    requestAnimationFrame(animate);

    // =========================================================================
    // DIAGNOSTIC & AUTOMATED VISUAL INSPECTION HOOKS
    // =========================================================================
    window.__giraffeApp = {
      setSubspecies,
      setLightMode,
      setDiagnosticPose(viewName, phase, hideUI) {
        isDiagnosticMode = true;
        isPaused = true;
        gait.setPhaseDirectly(phase);
        lastGiraffePos.copy(gait.getBodyWorldPosition());
        lastGiraffeYaw = Math.atan2(gait.getBodyForward().x, gait.getBodyForward().z);
        snapCameraPreset(viewName);
        world.update(0.016, lastGiraffePos, gait.footDiagnostics, lastGiraffeYaw);

        const hudRoot = document.getElementById('hud-root');
        if (hudRoot) hudRoot.style.display = hideUI ? 'none' : '';

        renderer.render(scene, camera);
      },
      async runDiagnostics(frameCount) {
        isDiagnosticMode = true;
        isPaused = false;
        gait.config.speedMultiplier = 1.0;
        gait.resetSlipDiagnostics();

        const dt = 1.0 / 60.0;
        const t0 = performance.now();
        let minHoofGroundOffset = Infinity;

        for (let i = 0; i < frameCount; i++) {
          tickFrame(dt);
          for (const k of ['FL', 'FR', 'HL', 'HR']) {
            const wh = gait.footDiagnostics[k].worldHoof;
            const gy = world.getGroundHeight(wh.x, wh.z);
            const clearance = wh.y - gy;
            if (clearance < minHoofGroundOffset) minHoofGroundOffset = clearance;
          }
        }
        const elapsedMs = performance.now() - t0;

        isDiagnosticMode = false;
        prevTime = performance.now();

        return {
          framesSimulated: frameCount,
          avgFrameCpuMs: +(elapsedMs / frameCount).toFixed(2),
          maxStanceSlipMeters: {
            FL: +gait.footDiagnostics.FL.maxSlip.toFixed(6),
            FR: +gait.footDiagnostics.FR.maxSlip.toFixed(6),
            HL: +gait.footDiagnostics.HL.maxSlip.toFixed(6),
            HR: +gait.footDiagnostics.HR.maxSlip.toFixed(6)
          },
          minHoofGroundClearanceMeters: +minHoofGroundOffset.toFixed(5),
          vertexCount: giraffe.bodyMesh.geometry.attributes.position.count,
          boneCount: giraffe.bones.length
        };
      }
    };

    window.__giraffeReady = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
