// main.js — scene, savanna world, camera, HUD, animation loop.
(function () {
  'use strict';

  function fatal(msg) {
    var d = document.getElementById('err');
    d.textContent = msg;
    d.style.display = 'block';
  }
  window.onerror = function (m, s, l) { fatal('Error: ' + m + ' @' + (s || '') + ':' + l); };

  if (!window.THREE) { fatal('three.min.js failed to load.'); return; }

  // ---------- renderer / scene / camera ----------
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var skyTex = new THREE.CanvasTexture(Textures.sky());
  skyTex.encoding = THREE.sRGBEncoding;
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0xe3dabd, 34, 210);

  var camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 600);
  camera.position.set(5.2, 3.1, 9.0);

  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0.2, 2.4, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.65;
  controls.minDistance = 3.5;
  controls.maxDistance = 40;
  controls.maxPolarAngle = 1.56;

  // optional URL overrides for testing: ?cam=x,y,z[,tx,ty,tz]&still=1
  var qp = new URLSearchParams(location.search);
  if (qp.get('cam')) {
    var nums = qp.get('cam').split(',').map(Number);
    camera.position.set(nums[0], nums[1], nums[2]);
    if (nums.length >= 6) controls.target.set(nums[3], nums[4], nums[5]);
  }
  if (qp.get('still')) controls.autoRotate = false;

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xcfe2ea, 0x9a8458, 0.55));
  var sun = new THREE.DirectionalLight(0xfff1da, 1.5);
  sun.position.set(9, 15, -7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -9;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  // ---------- ground, track ----------
  function tex(canvasEl, rx, ry) {
    var t = new THREE.CanvasTexture(canvasEl);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }
  var WORLD_LEN = 220, GLEN = 250, GCX = 15;
  var gTex = tex(Textures.ground(512), GLEN / 4, 120);
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GLEN, 480),
    new THREE.MeshStandardMaterial({ map: gTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.x = GCX;
  ground.receiveShadow = true;
  scene.add(ground);

  var tTex = tex(Textures.track(512), GLEN, 3);
  var track = new THREE.Mesh(
    new THREE.PlaneGeometry(GLEN, 3.2),
    new THREE.MeshStandardMaterial({ map: tTex, roughness: 1 }));
  track.rotation.x = -Math.PI / 2;
  track.position.set(GCX, 0.02, 0);
  track.receiveShadow = true;
  scene.add(track);

  // ---------- scenery (recycled as the giraffe walks) ----------
  var scenery = new THREE.Group();
  scene.add(scenery);

  function makeAcacia() {
    var g = new THREE.Group();
    var bark = new THREE.MeshStandardMaterial({ color: 0x6b5138, roughness: 1 });
    var leaf = new THREE.MeshStandardMaterial({ color: 0x5d6b34, roughness: 1 });
    var h = 3.2 + Math.random() * 3.0;
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.22, h, 8), bark);
    trunk.position.y = h / 2;
    trunk.rotation.z = (Math.random() - 0.5) * 0.16;
    trunk.castShadow = true;
    g.add(trunk);
    var cy = h * (0.82 + Math.random() * 0.1);
    var cr = 1.6 + Math.random() * 1.4;
    var canopy = new THREE.Mesh(new THREE.SphereGeometry(cr, 14, 8), leaf);
    canopy.scale.set(1, 0.34, 1);
    canopy.position.y = cy;
    canopy.castShadow = true;
    g.add(canopy);
    if (Math.random() < 0.7) { // second, lower tier
      var c2 = new THREE.Mesh(new THREE.SphereGeometry(cr * 0.7, 12, 8), leaf);
      c2.scale.set(1, 0.3, 1);
      c2.position.set(cr * 0.4, cy - 0.7, cr * 0.3);
      c2.castShadow = true;
      g.add(c2);
    }
    return g;
  }

  function scatter(baseX, z, obj, scale) {
    obj.userData.baseX = baseX;
    obj.position.set(baseX, obj.position.y, z);
    obj.scale.multiplyScalar(scale);
    scenery.add(obj);
    return obj;
  }

  var i, s, items = [];
  for (i = 0; i < 26; i++) {
    var side = i % 2 ? 1 : -1;
    var z = side * (4.5 + Math.random() * 38);
    items.push(scatter(Math.random() * WORLD_LEN, z, makeAcacia(), 0.8 + Math.random() * 0.6));
  }
  var bushMat = new THREE.MeshStandardMaterial({ color: 0x6e6a3a, roughness: 1 });
  var rockMat = new THREE.MeshStandardMaterial({ color: 0x8f8779, roughness: 1 });
  for (i = 0; i < 70; i++) {
    var b = new THREE.Mesh(new THREE.ConeGeometry(0.26 + Math.random() * 0.3, 0.55 + Math.random() * 0.55, 7), bushMat);
    b.position.y = b.geometry.parameters.height / 2;
    b.castShadow = true;
    scatter(Math.random() * WORLD_LEN, (Math.random() < 0.5 ? -1 : 1) * (2.4 + Math.random() * 26), b, 1);
  }
  for (i = 0; i < 14; i++) {
    var r = new THREE.Mesh(new THREE.SphereGeometry(0.3 + Math.random() * 0.5, 9, 6), rockMat);
    r.scale.y = 0.5;
    r.position.y = 0.12;
    r.castShadow = true;
    scatter(Math.random() * WORLD_LEN, (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 30), r, 1);
  }

  // ---------- giraffe ----------
  var giraffe = window.Giraffe.create(THREE);
  scene.add(giraffe.root);

  // ---------- HUD ----------
  var paused = false, speedMul = 1;
  var elFps = document.getElementById('fps');
  var elSpd = document.getElementById('spd');
  document.getElementById('pause').onclick = function () {
    paused = !paused;
    this.textContent = paused ? '▶' : '⏸';
  };
  document.getElementById('orbit').onchange = function () {
    controls.autoRotate = this.checked;
  };
  var slider = document.getElementById('speed');
  slider.oninput = function () {
    speedMul = parseFloat(this.value);
    elSpd.textContent = '×' + speedMul.toFixed(1);
  };
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space') { e.preventDefault(); document.getElementById('pause').click(); }
  });

  // ---------- loop ----------
  var last = performance.now(), frames = 0, fpsTimer = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!paused) {
      var st = giraffe.update(dt * speedMul);
      var dist = st.distance;
      gTex.offset.x = dist / 4;
      tTex.offset.x = dist;
      scenery.children.forEach(function (o) {
        var x = ((o.userData.baseX - dist + WORLD_LEN / 2) % WORLD_LEN + WORLD_LEN) % WORLD_LEN - WORLD_LEN / 2;
        o.position.x = x;
      });
    }
    controls.update();
    renderer.render(scene, camera);
    frames++; fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      elFps.textContent = Math.round(frames / fpsTimer) + ' fps';
      frames = 0; fpsTimer = 0;
    }
  }
  requestAnimationFrame(frame);

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  var load = document.getElementById('loading');
  if (load) load.parentNode.removeChild(load);
})();
