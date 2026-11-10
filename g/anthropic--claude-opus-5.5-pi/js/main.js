(function () {
  'use strict';
  const V = THREE.Vector3;

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const skyTop = new THREE.Color(0x5d8fc9), skyBot = new THREE.Color(0xe9d7b4);
  scene.fog = new THREE.Fog(0xdccfb0, 60, 260);

  // sky dome
  const skyGeo = new THREE.SphereGeometry(400, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: skyTop }, bot: { value: skyBot }, sun: { value: new V(0.5, 0.42, 0.3).normalize() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 sun; varying vec3 vP;
      void main(){ float h = clamp(vP.y, 0.0, 1.0); vec3 c = mix(bot, top, pow(h, 0.55));
      float s = max(dot(vP, sun), 0.0); c += vec3(1.0,0.9,0.7) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18);
      gl_FragColor = vec4(c, 1.0); }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(9, 4, 11);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3; controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.target.set(0, 2.6, 0);

  // lights
  scene.add(new THREE.HemisphereLight(0xbdd5f0, 0x8a6e4a, 0.75));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
  sun.position.set(25, 21, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);

  // ground: savanna dirt/grass with procedural shading
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  groundMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vW;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*n2(p); p*=2.03; a*=0.5; } return s; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec2 p = vW.xz;
        float big = fbm(p*0.05), mid = fbm(p*0.4), fine = n2(p*9.0);
        vec3 dirt = pow(vec3(0.66,0.53,0.37), vec3(2.2));
        vec3 dry = pow(vec3(0.74,0.65,0.42), vec3(2.2));
        vec3 green = pow(vec3(0.50,0.52,0.30), vec3(2.2));
        vec3 c = mix(dirt, dry, smoothstep(0.35, 0.6, big + mid*0.3));
        c = mix(c, green, smoothstep(0.55, 0.75, fbm(p*0.12+7.0))*0.6);
        c *= 0.85 + 0.25*fine;
        diffuseColor.rgb = c; }`);
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800, 1, 1), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // grass tufts (instanced crossed blades)
  (function grass() {
    const blade = new THREE.BufferGeometry();
    const verts = [], cols = [];
    for (let b = 0; b < 7; b++) {
      const a = b / 7 * Math.PI * 2 + Math.random(), lean = 0.15 + Math.random() * 0.25, h = 0.25 + Math.random() * 0.35, w = 0.025;
      const dx = Math.cos(a), dz = Math.sin(a);
      const tip = [dx * lean, h, dz * lean];
      verts.push(-dz * w, 0, dx * w, dz * w, 0, -dx * w, tip[0], tip[1], tip[2]);
      cols.push(0.45, 0.38, 0.2, 0.45, 0.38, 0.2, 0.85, 0.75, 0.48);
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    blade.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    blade.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
    const N = 9000;
    const inst = new THREE.InstancedMesh(blade, mat, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V(), p = new V();
    for (let i = 0; i < N; i++) {
      const r = Math.sqrt(Math.random()) * 120, a = Math.random() * Math.PI * 2;
      p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      q.setFromAxisAngle(new V(0, 1, 0), Math.random() * 6.28);
      const k = 0.6 + Math.random() * 1.2; s.set(k, k, k);
      inst.setMatrixAt(i, m.compose(p, q, s));
    }
    inst.receiveShadow = true;
    scene.add(inst);
  })();

  // acacia trees: flat-topped canopies on branching trunks
  function acacia(x, z, scale) {
    const g = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x55682f, roughness: 1, flatShading: true });
    const trunkH = 3.2;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, trunkH, 8), bark);
    tr.position.y = trunkH / 2; tr.castShadow = true; g.add(tr);
    const tops = [];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.random();
      const len = 2.2 + Math.random();
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, len, 6), bark);
      const dir = new V(Math.cos(a) * 0.8, 1, Math.sin(a) * 0.8).normalize();
      br.quaternion.setFromUnitVectors(new V(0, 1, 0), dir);
      br.position.set(0, trunkH, 0).addScaledVector(dir, len / 2);
      br.castShadow = true; g.add(br);
      tops.push(new V(0, trunkH, 0).addScaledVector(dir, len));
    }
    for (const t of tops) {
      for (let j = 0; j < 3; j++) {
        const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), leaf);
        c.scale.set(1.8 + Math.random(), 0.35 + Math.random() * 0.15, 1.8 + Math.random());
        c.position.copy(t).add(new V((Math.random() - 0.5) * 1.6, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 1.6));
        c.castShadow = true; g.add(c);
      }
    }
    g.position.set(x, 0, z); g.scale.setScalar(scale);
    g.rotation.y = Math.random() * 6;
    scene.add(g);
  }
  const treeSpots = [[-14, -22, 1.3], [30, -40, 1.6], [-45, 15, 1.4], [55, 30, 1.8], [-25, 60, 1.5], [10, 70, 1.2], [-70, -50, 2.0], [80, -10, 1.7], [0, -80, 1.9]];
  for (const t of treeSpots) acacia(t[0], t[1], t[2]);

  // distant hills
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2, r = 230 + Math.random() * 40;
    const h = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshStandardMaterial({ color: 0x8b8a6c, roughness: 1 }));
    h.scale.set(40 + Math.random() * 40, 8 + Math.random() * 14, 30 + Math.random() * 20);
    h.position.set(Math.cos(a) * r, -2, Math.sin(a) * r);
    scene.add(h);
  }

  // the giraffe
  const coat = makeCoatMaterial();
  const giraffe = new Giraffe(coat);
  scene.add(giraffe.root);

  // path: large circle
  const R = 22;
  let pathS = 0;
  const state = { paused: false, timeScale: 1, follow: true };
  function placeOnPath() {
    const a = pathS / R;
    giraffe.root.position.set(Math.sin(a) * R, 0, R - Math.cos(a) * R);
    giraffe.root.rotation.y = -a;  // heading tangent; local +x is forward
  }
  placeOnPath();
  giraffe.root.updateMatrixWorld(true);

  // UI
  const ui = document.getElementById('ui');
  ui.querySelector('#pause').onclick = () => { state.paused = !state.paused; ui.querySelector('#pause').textContent = state.paused ? 'Play' : 'Pause'; };
  ui.querySelector('#slow').onclick = () => { state.timeScale = state.timeScale === 1 ? 0.25 : 1; ui.querySelector('#slow').textContent = state.timeScale === 1 ? 'Slow-mo' : 'Normal speed'; };
  ui.querySelector('#follow').onclick = () => { state.follow = !state.follow; ui.querySelector('#follow').textContent = state.follow ? 'Free camera' : 'Follow'; };

  const clock = new THREE.Clock();
  let lastPos = giraffe.root.position.clone();
  function frame() {
    const rdt = Math.min(clock.getDelta(), 0.05);
    const dt = state.paused ? 0 : rdt * state.timeScale;
    pathS += giraffe.speed * dt;
    placeOnPath();
    giraffe.update(dt);
    // camera follows translation; user orbits freely
    const gp = giraffe.root.position;
    if (state.follow) {
      const d = gp.clone().sub(lastPos);
      camera.position.add(d);
      controls.target.add(d);
      controls.target.lerp(new V(gp.x, 2.6, gp.z), 0.02);
    }
    lastPos.copy(gp);
    sun.position.set(gp.x + 25, 21, gp.z + 15);
    sun.target.position.copy(gp);
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  window.__g = { giraffe, camera, controls, state, scene, renderer, step: (n, dt) => { for (let i = 0; i < n; i++) { pathS += giraffe.speed * dt; placeOnPath(); giraffe.update(dt); } } };
  frame();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
})();
