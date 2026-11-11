/**
 * Giraffe 3D - Main Application Engine
 * Integrates procedural assets, kinematics, environment, camera management, and UI.
 */

window.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const loaderOverlay = document.getElementById('loader-overlay');
  const loaderStatus = document.getElementById('loader-status');

  function setStatus(msg) {
    if (loaderStatus) loaderStatus.innerText = msg;
  }

  try {
    setStatus('Synthesizing procedural textures...');
    const textures = GiraffeTextures.initAll();

    setStatus('Constructing anatomical giraffe model...');
    // Scene & Renderer
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 400);
    camera.position.set(8.5, 3.2, -6.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    // Orbit Controls
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.5 - 0.02; // Prevent going underground
    controls.minDistance = 2.0;
    controls.maxDistance = 60.0;
    controls.target.set(0, 2.6, 0);

    setStatus('Generating African savanna environment...');
    const environment = new GiraffeEnvironment.SavannaWorld(scene, textures);

    // Giraffe Model
    const giraffe = GiraffeModel.createGiraffe(textures);
    scene.add(giraffe.root);

    setStatus('Initializing biomechanical gait kinematics...');
    const gait = new GiraffeAnimation.GaitController(giraffe, scene);

    // Camera Modes
    let cameraMode = 'follow'; // 'follow', 'orbit', 'cinematic', 'head'
    const camOffsetFollow = new THREE.Vector3(8.5, 3.2, 4.2);
    const camOffsetCinematic = new THREE.Vector3(4.8, 0.5, 3.6);
    const camOffsetHead = new THREE.Vector3(1.8, 4.8, 2.2);

    function setCameraPreset(mode) {
      cameraMode = mode;
      camButtons.forEach(b => b.classList.toggle('active', b.dataset.cam === mode));
      const gPos = giraffe.root.position;

      if (mode === 'follow') {
        controls.target.set(gPos.x - 0.5, 2.7, gPos.z);
        camera.position.set(gPos.x + camOffsetFollow.x, camOffsetFollow.y, gPos.z + camOffsetFollow.z);
      } else if (mode === 'cinematic') {
        controls.target.set(gPos.x - 0.5, 3.8, gPos.z);
        camera.position.set(gPos.x + camOffsetCinematic.x, camOffsetCinematic.y, gPos.z + camOffsetCinematic.z);
      } else if (mode === 'head') {
        const headPos = new THREE.Vector3();
        giraffe.head.getWorldPosition(headPos);
        controls.target.copy(headPos);
        camera.position.set(headPos.x + 1.1, headPos.y + 0.15, headPos.z + 1.4);
      } else if (mode === 'orbit') {
        controls.target.set(gPos.x, 2.6, gPos.z);
      }
      controls.update();
    }

    function updateCamera(dt) {
      const gPos = giraffe.root.position;

      if (cameraMode === 'follow') {
        const targetCamPos = new THREE.Vector3(
          gPos.x + camOffsetFollow.x,
          camOffsetFollow.y,
          gPos.z + camOffsetFollow.z
        );
        camera.position.lerp(targetCamPos, 0.08);
        const lookTarget = new THREE.Vector3(gPos.x - 0.5, 2.7, gPos.z);
        controls.target.lerp(lookTarget, 0.1);
      } else if (cameraMode === 'cinematic') {
        const targetCamPos = new THREE.Vector3(
          gPos.x + camOffsetCinematic.x,
          camOffsetCinematic.y,
          gPos.z + camOffsetCinematic.z
        );
        camera.position.lerp(targetCamPos, 0.08);
        const lookTarget = new THREE.Vector3(gPos.x - 0.5, 3.8, gPos.z);
        controls.target.lerp(lookTarget, 0.1);
      } else if (cameraMode === 'head') {
        const headPos = new THREE.Vector3();
        giraffe.head.getWorldPosition(headPos);
        const targetCamPos = new THREE.Vector3(
          headPos.x + 1.1,
          headPos.y + 0.15,
          headPos.z + 1.4
        );
        camera.position.lerp(targetCamPos, 0.1);
        controls.target.lerp(headPos, 0.1);
      } else {
        if (gait.traverse && gait.speed > 0.02) {
          controls.target.z = gPos.z;
        }
      }

      controls.update();
    }

    // UI Elements
    const btnPlayPause = document.getElementById('btn-play-pause');
    const speedSlider = document.getElementById('speed-slider');
    const speedValDisplay = document.getElementById('speed-val');
    const toggleTraverse = document.getElementById('toggle-traverse');
    const toggleVegetation = document.getElementById('toggle-vegetation');
    const toggleWireframe = document.getElementById('toggle-wireframe');
    const toggleDust = document.getElementById('toggle-dust');

    const hudSpeed = document.getElementById('hud-speed');
    const hudCadence = document.getElementById('hud-cadence');
    const hudDistance = document.getElementById('hud-distance');

    // Gait Presets
    const gaitButtons = document.querySelectorAll('.gait-btn');
    gaitButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        gaitButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const spd = parseFloat(btn.dataset.speed);
        gait.setSpeed(spd);
        speedSlider.value = spd;
        speedValDisplay.innerText = spd.toFixed(1) + 'x';
      });
    });

    // Speed Slider
    speedSlider.addEventListener('input', (e) => {
      const spd = parseFloat(e.target.value);
      gait.setSpeed(spd);
      speedValDisplay.innerText = spd.toFixed(1) + 'x';
      gaitButtons.forEach(b => {
        b.classList.toggle('active', parseFloat(b.dataset.speed) === spd);
      });
    });

    // Play / Pause
    btnPlayPause.addEventListener('click', () => {
      gait.isPlaying = !gait.isPlaying;
      btnPlayPause.innerText = gait.isPlaying ? '⏸ Pause' : '▶ Play';
      btnPlayPause.classList.toggle('active', !gait.isPlaying);
    });

    // Movement mode toggle
    toggleTraverse.addEventListener('change', (e) => {
      gait.setTraverse(e.target.checked);
    });

    // Camera Mode Buttons
    const camButtons = document.querySelectorAll('.cam-btn');
    camButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        setCameraPreset(btn.dataset.cam);
      });
    });

    // Lighting Preset Buttons
    const lightButtons = document.querySelectorAll('.light-btn');
    lightButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        lightButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        environment.applyLightingPreset(btn.dataset.light);
      });
    });

    // Vegetation Toggle
    toggleVegetation.addEventListener('change', (e) => {
      environment.setVegetationVisible(e.target.checked);
    });

    // Dust Toggle
    toggleDust.addEventListener('change', (e) => {
      gait.dust.mesh.visible = e.target.checked;
    });

    // Wireframe Toggle
    toggleWireframe.addEventListener('change', (e) => {
      const wf = e.target.checked;
      giraffe.materials.forEach(mat => {
        mat.wireframe = wf;
      });
    });

    // Window Resize Handler
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Check URL Hash for initial presets (e.g. #cinematic, #head, #night, #midday)
    function applyHashParams() {
      const hash = window.location.hash.toLowerCase().replace('#', '');
      if (['follow', 'orbit', 'cinematic', 'head'].includes(hash)) {
        setCameraPreset(hash);
      } else if (['sunset', 'midday', 'dawn', 'night'].includes(hash)) {
        environment.applyLightingPreset(hash);
        lightButtons.forEach(b => b.classList.toggle('active', b.dataset.light === hash));
      }
    }
    applyHashParams();
    window.addEventListener('hashchange', applyHashParams);

    // Clock & Main Loop
    const clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);

      const dt = Math.min(clock.getDelta(), 0.08); // Cap delta time to prevent hitching

      // Update Kinematics & Locomotion
      gait.update(dt);

      // Update Environment Tracking
      environment.update(giraffe.root.position.z);

      // Update Camera & Controls
      updateCamera(dt);

      // Render Scene
      renderer.render(scene, camera);

      // Update HUD Stats
      if (hudSpeed) {
        const kmh = (gait.worldSpeed * 3.6).toFixed(1);
        hudSpeed.innerText = `${kmh} km/h`;
      }
      if (hudCadence) {
        const cad = gait.speed > 0.02 ? (gait.speed / gait.cycleTime).toFixed(2) : '0.00';
        hudCadence.innerText = `${cad} Hz`;
      }
      if (hudDistance) {
        hudDistance.innerText = `${gait.worldZ.toFixed(1)} m`;
      }
    }

    // Start loop
    animate();

    // Immediately remove loading overlay
    if (loaderOverlay) {
      loaderOverlay.style.opacity = '0';
      setTimeout(() => {
        loaderOverlay.style.display = 'none';
      }, 300);
    }

  } catch (err) {
    console.error('Initialization Error:', err);
    if (loaderStatus) {
      loaderStatus.innerHTML = `<span style="color:#ff6666;">Error: ${err.message}</span>`;
    }
  }
});
