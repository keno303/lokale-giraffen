/* main.js — scene setup, environment, camera, and the giraffe's
 * patrol-walk path around a small savanna plane.
 */

(function () {
  'use strict';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe3f2);
  scene.fog = new THREE.Fog(0xbfe3f2, 18, 60);

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(6.5, 4.4, 8);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(-6, 0, -4.5); // approx giraffe's starting path position
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();

  // -------------------------------------------------------------
  // Lighting: warm sun + soft sky fill, similar to late-afternoon
  // savanna light.
  // -------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xffeec2, 0x4d5b36, 0.65);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d0, 1.15);
  sun.position.set(12, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0015;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xaecbe8, 0.25);
  fill.position.set(-10, 8, -6);
  scene.add(fill);

  // -------------------------------------------------------------
  // Ground: savanna plane with a subtle procedural grass texture.
  // -------------------------------------------------------------
  function buildGroundTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#c9b46a';
    ctx.fillRect(0, 0, size, size);
    const rng = (function (seed) {
      return function () {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
    })(7);
    for (let i = 0; i < 9000; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const l = 2 + rng() * 5;
      const shade = 90 + Math.floor(rng() * 60);
      ctx.strokeStyle = `rgb(${shade - 20},${shade + 25},${shade - 55})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 2, y - l);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(24, 24);
    tex.anisotropy = 4;
    return tex;
  }

  const groundGeo = new THREE.PlaneGeometry(220, 220, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({
    map: buildGroundTexture(),
    roughness: 1
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // A couple of simple acacia-ish trees for scene context / scale.
  function makeAcacia(x, z, scale) {
    const g = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.85 });

    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 2.4, 8);
    trunkGeo.translate(0, 1.2, 0);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.castShadow = true;
    g.add(trunk);

    const canopyGeo = new THREE.ConeGeometry(1.6, 0.6, 8);
    canopyGeo.translate(0, 2.5, 0);
    const canopy = new THREE.Mesh(canopyGeo, leafMat);
    canopy.scale.set(1, 0.55, 1);
    canopy.castShadow = true;
    g.add(canopy);

    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    return g;
  }

  scene.add(makeAcacia(-9, -6, 1.3));
  scene.add(makeAcacia(11, 5, 1.6));
  scene.add(makeAcacia(-6, 10, 1.0));

  // -------------------------------------------------------------
  // Build giraffe and set it walking on a soft looping path.
  // -------------------------------------------------------------
  const giraffe = GiraffeFactory.createGiraffe();
  giraffe.root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  scene.add(giraffe.root);

  // Path: a gentle rounded-rectangle loop.
  const pathPoints = [
    new THREE.Vector3(-6, 0, -4),
    new THREE.Vector3(6, 0, -5),
    new THREE.Vector3(8, 0, 3),
    new THREE.Vector3(2, 0, 7),
    new THREE.Vector3(-7, 0, 5),
    new THREE.Vector3(-9, 0, -1)
  ];
  const pathCurve = new THREE.CatmullRomCurve3(pathPoints, true, 'catmullrom', 0.6);
  const PATH_SPEED = 1.0; // units per second along curve (approx)
  const totalLen = pathCurve.getLength();
  let pathT = 0; // 0..1

  const tmpPos = new THREE.Vector3();
  const tmpLookAhead = new THREE.Vector3();
  const prevPos = new THREE.Vector3();
  const moveDelta = new THREE.Vector3();
  let havePrevPos = false;

  function updateGiraffeTransform(dt) {
    if (window.__freezePath) return;
    pathT += (PATH_SPEED * dt) / totalLen;
    if (pathT > 1) pathT -= 1;

    pathCurve.getPointAt(pathT, tmpPos);
    const lookAheadT = (pathT + 0.01) % 1;
    pathCurve.getPointAt(lookAheadT, tmpLookAhead);

    if (havePrevPos) {
      moveDelta.set(tmpPos.x - prevPos.x, 0, tmpPos.z - prevPos.z);
      // Keep the camera gently tracking the giraffe as it roams, while
      // preserving whatever orbit/zoom offset the user has set up (we
      // just translate both the target and the camera by the same
      // rigid delta, so relative framing is untouched).
      camera.position.add(moveDelta);
      controls.target.add(moveDelta);
    }
    prevPos.copy(tmpPos);
    havePrevPos = true;

    giraffe.root.position.set(tmpPos.x, 0, tmpPos.z);

    const dir = tmpLookAhead.clone().sub(tmpPos);
    if (dir.lengthSq() > 1e-6) {
      const angle = Math.atan2(dir.x, dir.z);
      giraffe.root.rotation.y = angle;
    }
  }

  // -------------------------------------------------------------
  // Resize handling
  // -------------------------------------------------------------
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // -------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    updateGiraffeTransform(dt);
    giraffe.update(dt, 1.0);

    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  // Exposed for debugging / inspection from devtools or test scripts.
  window.__scene = scene;
  window.__camera = camera;
  window.__controls = controls;
  window.__giraffe = giraffe;
})();
