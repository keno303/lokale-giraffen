/* The Quiet Giant — an original procedural Three.js field study. */
(() => {
  'use strict';
  const container = document.getElementById('scene');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (error) {
    document.getElementById('fallback').hidden = false;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe6e3d8);
  scene.fog = new THREE.Fog(0xe6e3d8, 17, 39);
  const camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 100);
  const target = new THREE.Vector3(-1.18, 3.15, 0);
  let azimuth = 0.10, elevation = 0.105, zoom = 1;
  function positionCamera() {
    const radius = 18;
    camera.position.set(target.x + radius * Math.sin(azimuth) * Math.cos(elevation), target.y + radius * Math.sin(elevation), target.z + radius * Math.cos(azimuth) * Math.cos(elevation));
    camera.lookAt(target);
  }
  positionCamera();

  scene.add(new THREE.HemisphereLight(0xfff8e5, 0x9e9273, 1.55));
  const sunlight = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sunlight.position.set(-5, 10, 8);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, { left: -9, right: 9, top: 10, bottom: -8, near: 0.5, far: 30 });
  sunlight.shadow.bias = -0.0004;
  sunlight.shadow.normalBias = 0.025;
  sunlight.shadow.radius = 3;
  scene.add(sunlight);

  const material = (color, roughness = 1) => new THREE.MeshStandardMaterial({ color, roughness });
  const sand = material(0xc6b794);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), sand);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.025;
  ground.receiveShadow = true;
  scene.add(ground);

  // A repeatable, hand-coloured Voronoi coat: irregular russet islands and pale seams.
  function makeCoatTexture() {
    const size = 512, cells = 8;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(size, size);
    const hash = (x, y, n) => {
      const v = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453;
      return v - Math.floor(v);
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const px = x / size * cells, py = y / size * cells;
      const cx = Math.floor(px), cy = Math.floor(py);
      let first = 100, second = 100, idX = 0, idY = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const gx = cx + i, gy = cy + j;
        const wx = (gx % cells + cells) % cells, wy = (gy % cells + cells) % cells;
        const dx = gx + 0.18 + hash(wx, wy, 1) * 0.64 - px;
        const dy = gy + 0.18 + hash(wx, wy, 2) * 0.64 - py;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < first) { second = first; first = d; idX = wx; idY = wy; }
        else if (d < second) second = d;
      }
      const edge = second - first;
      const variation = hash(idX, idY, 4);
      const speckle = (hash(x, y, 7) - .5) * 7;
      const blend = THREE.MathUtils.smoothstep(edge, 0.075, 0.16);
      const pale = [218, 194, 147], spot = [139 + variation * 28, 77 + variation * 23, 38 + variation * 16];
      const k = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) image.data[k + c] = pale[c] * (1 - blend) + spot[c] * blend + speckle;
      image.data[k + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }
  const coatTexture = makeCoatTexture();
  const coat = new THREE.MeshStandardMaterial({ map: coatTexture, color: 0xffffff, roughness: 1 });
  const bodyTexture = coatTexture.clone();
  bodyTexture.repeat.set(1.25, 1.5);
  bodyTexture.needsUpdate = true;
  const bodyCoat = new THREE.MeshStandardMaterial({ map: bodyTexture, color: 0xffffff, roughness: 1 });
  const legCanvas = document.createElement('canvas');
  legCanvas.width = legCanvas.height = 512;
  const legContext = legCanvas.getContext('2d');
  legContext.drawImage(coatTexture.image, 0, 0);
  const legFade = legContext.createLinearGradient(0, 0, 0, 512);
  legFade.addColorStop(0, 'rgba(217,195,154,1)');
  legFade.addColorStop(.35, 'rgba(217,195,154,1)');
  legFade.addColorStop(.8, 'rgba(217,195,154,0)');
  legContext.fillStyle = legFade;
  legContext.fillRect(0, 0, 512, 512);
  const legTexture = new THREE.CanvasTexture(legCanvas);
  legTexture.colorSpace = THREE.SRGBColorSpace;
  const lowerCoat = new THREE.MeshStandardMaterial({ map: legTexture, roughness: 1 });
  const tan = material(0xc5a16f);
  const cream = material(0xd9c39a);
  const muzzleMat = material(0xb59a79);
  const innerEar = material(0x9c7865);
  const dark = material(0x45362b);
  const hoofMat = material(0x554739);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x211a13, roughness: 0.22 });
  const eyeGlint = new THREE.MeshBasicMaterial({ color: 0xf5e6c8 });

  const animal = new THREE.Group();
  scene.add(animal);
  const sphereGeo = new THREE.SphereGeometry(1, 32, 24);
  function ellipsoid(parent, mat, position, scale, rotation = 0) {
    const mesh = new THREE.Mesh(sphereGeo, mat);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.rotation.z = rotation;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  // A smooth elliptical tube following a line in the x/y plane. Each point is [x,y,z,radiusXY,radiusZ].
  function organicTube(parent, points, mat, sides = 20) {
    // Interpolate the profiles as well as the centreline to avoid visible joints between rings.
    const input = points;
    points = [];
    for (let i = 0; i < input.length - 1; i++) {
      const p0 = input[Math.max(0, i - 1)], p1 = input[i], p2 = input[i + 1], p3 = input[Math.min(input.length - 1, i + 2)];
      for (let step = 0; step < 4; step++) {
        const t = step / 4, t2 = t * t, t3 = t2 * t;
        points.push(p1.map((v, k) => {
          const value = .5 * ((2 * v) + (-p0[k] + p2[k]) * t + (2*p0[k] - 5*v + 4*p2[k] - p3[k]) * t2 + (-p0[k] + 3*v - 3*p2[k] + p3[k]) * t3);
          return k >= 3 ? Math.max(.005, value) : value;
        }));
      }
    }
    points.push(input[input.length - 1]);
    const vertices = [], normals = [], uvs = [], indices = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i], prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
      const dx = next[0] - prev[0], dy = next[1] - prev[1];
      const length = Math.hypot(dx, dy) || 1, nx = -dy / length, ny = dx / length;
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        vertices.push(p[0] + nx * c * p[3], p[1] + ny * c * p[3], p[2] + s * p[4]);
        normals.push(nx * c, ny * c, s);
        uvs.push(j / sides, i / (points.length - 1));
        if (i < points.length - 1 && j < sides) {
          const a0 = i * (sides + 1) + j, b = a0 + sides + 1;
          indices.push(a0, b, a0 + 1, b, b + 1, a0 + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  }

  // Deep barrel, rounded hindquarters and the characteristic high shoulder.
  organicTube(animal, [
    [-1.48,3.41,0,.06,.06],[-1.43,3.41,0,.32,.27],[-1.30,3.40,0,.55,.43],
    [-1.10,3.39,0,.70,.52],[-.85,3.38,0,.76,.56],[-.50,3.37,0,.73,.59],
    [0,3.35,0,.69,.60],[.50,3.34,0,.66,.58],[.90,3.33,0,.64,.55],
    [1.20,3.32,0,.59,.50],[1.40,3.31,0,.43,.39],[1.53,3.30,0,.21,.20],[1.56,3.30,0,.02,.02]
  ], bodyCoat, 32);

  // Neck tapers continuously from the shoulder to the poll.
  organicTube(animal, [
    [-.91,3.45,0,.56,.48],[-1.08,3.75,0,.51,.43],[-1.23,4.08,0,.43,.36],
    [-1.35,4.43,0,.36,.30],[-1.47,4.80,0,.31,.26],[-1.59,5.17,0,.27,.23],
    [-1.69,5.50,0,.25,.21],[-1.78,5.82,0,.24,.20],[-1.83,6.05,0,.23,.20]
  ], coat);
  ellipsoid(animal, coat, [-1.85, 6.04, 0], [.32, .35, .24], -.18);
  // The face narrows into a soft, dark muzzle.
  ellipsoid(animal, coat, [-2.06, 5.95, 0], [.40, .24, .21], .28);
  ellipsoid(animal, muzzleMat, [-2.36, 5.86, 0], [.24, .19, .205], .18);
  ellipsoid(animal, cream, [-2.36, 5.78, 0], [.20, .09, .18], .12);
  for (const side of [-1, 1]) {
    // Large, dark eyes with a warm rim and a tiny catchlight.
    ellipsoid(animal, cream, [-1.96, 6.13, side * .214], [.112, .10, .032]);
    ellipsoid(animal, eyeMat, [-1.98, 6.14, side * .239], [.057, .064, .026]);
    ellipsoid(animal, eyeGlint, [-1.996, 6.162, side * .26], [.014, .016, .007]);
    ellipsoid(animal, dark, [-2.46, 5.91, side * .18], [.042, .025, .014], -.25);
    // Leaf-shaped ears, held out from either side of the head.
    const ear = ellipsoid(animal, tan, [-1.65, 6.25, side * .33], [.23, .11, .15], .34);
    ear.rotation.y = side * -.5;
    const earInside = ellipsoid(animal, innerEar, [-1.64, 6.27, side * .405], [.16, .063, .035], .34);
    earInside.rotation.y = side * -.5;
    // Short fur-covered ossicones with dark, rounded tips.
    organicTube(animal, [[-1.84,6.25,side*.13,.075,.07],[-1.83,6.45,side*.15,.065,.06],[-1.85,6.59,side*.16,.055,.055]], tan, 12);
    ellipsoid(animal, dark, [-1.85, 6.61, side * .16], [.085, .09, .08]);
  }
  // A fine upright mane follows the back edge of the neck.
  organicTube(animal, [[-.60,3.78,0,.035,.045],[-.77,4.08,0,.07,.065],[-.98,4.43,0,.075,.065],[-1.15,4.80,0,.075,.06],[-1.31,5.17,0,.07,.055],[-1.44,5.50,0,.065,.05],[-1.55,5.82,0,.055,.045],[-1.61,6.08,0,.025,.025]], dark, 10);

  // Four independently articulated legs; the ankle follows a walking cycle and the knee is solved with IK.
  const legs = [];
  function makeLeg(x, z, phase, hind) {
    const upper = new THREE.Group(); animal.add(upper);
    const lower = new THREE.Group(); animal.add(lower);
    const foot = new THREE.Group(); animal.add(foot);
    const upperLength = 1.37, lowerLength = 1.49;
    organicTube(upper, [[0,0,0,.20,.17],[0,-.35,0,.17,.15],[0,-.85,0,.125,.12],[0,-upperLength,0,.11,.105]], coat);
    ellipsoid(upper, coat, [0,-.1,0], [.21,.29,.18]);
    ellipsoid(lower, coat, [0,0,0], [.13,.14,.12]);
    organicTube(lower, [[0,0,0,.13,.12],[0,-.28,0,.11,.105],[0,-.85,0,.09,.085],[0,-1.25,0,.085,.08],[0,-lowerLength,0,.105,.10]], lowerCoat);
    ellipsoid(foot, hoofMat, [-.035,-.09,0], [.17,.12,.15]);
    ellipsoid(foot, cream, [0,.005,0], [.105,.105,.10]);
    legs.push({ x, z, phase, hind, upper, lower, foot, upperLength, lowerLength });
  }
  makeLeg(-.94, -.34, Math.PI, false);
  makeLeg(1.02, -.34, 0, true);
  makeLeg(-.94, .36, 0, false);
  makeLeg(1.02, .36, Math.PI, true);

  // Flexible tail and its dark brush.
  const tail = new THREE.Group(); tail.position.set(1.32, 3.60, 0); animal.add(tail);
  organicTube(tail, [[0,0,0,.085,.085],[.17,-.18,0,.065,.065],[.27,-.43,0,.05,.05],[.33,-.70,0,.045,.045],[.38,-.95,0,.04,.04]], tan, 12);
  ellipsoid(tail, dark, [.39,-1.05,0], [.10,.24,.09], -.13);

  // Distant acacia silhouettes and small grasses give a sense of place without competing with the subject.
  const distant = material(0xaaa68d);
  function acacia(x, z, scale) {
    const tree = new THREE.Group(); tree.position.set(x, 0, z); tree.scale.setScalar(scale); scene.add(tree);
    organicTube(tree, [[0,0,0,.08,.08],[.02,.75,0,.06,.06],[.08,1.45,0,.035,.035]], distant, 8);
    organicTube(tree, [[.03,.8,0,.045,.045],[-.34,1.25,0,.03,.03],[-.67,1.45,0,.01,.01]], distant, 8);
    organicTube(tree, [[.04,1.0,0,.045,.045],[.43,1.34,0,.025,.025],[.70,1.42,0,.01,.01]], distant, 8);
    for (const p of [[-.58,1.48,0,.55,.12,.26],[-.05,1.58,0,.67,.16,.31],[.52,1.48,0,.55,.12,.26]]) ellipsoid(tree, distant, p.slice(0,3), p.slice(3));
  }
  acacia(-10.5, -10, 1.05); acacia(8.5, -13, 1.25); acacia(4.9, -16, .68);
  let seed = 27;
  function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  const grassMat = material(0x9d9876);
  const grassGeometry = new THREE.BufferGeometry();
  const grassVerts = [];
  for (let i = 0; i < 130; i++) {
    const x = (random() - .5) * 25, z = (random() - .5) * 16 - 2;
    if (Math.abs(x) < 2.5 && Math.abs(z) < 2) continue;
    const h = .10 + random() * .20;
    for (let j = 0; j < 3; j++) {
      const lean = (random() - .5) * .14;
      grassVerts.push(x-.018, .005, z, x+.018, .005, z, x+lean, h, z+(random()-.5)*.07);
    }
  }
  grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute(grassVerts, 3));
  grassGeometry.computeVertexNormals();
  grassMat.side = THREE.DoubleSide;
  scene.add(new THREE.Mesh(grassGeometry, grassMat));

  function updateLegs(time) {
    for (const leg of legs) {
      const cycle = time * 2.05 + leg.phase;
      const dx = Math.sin(cycle) * .34;
      const lift = Math.pow(Math.max(0, Math.cos(cycle)), 2) * .18;
      const hipY = 3.04;
      const ankleX = leg.x + dx, ankleY = .22 + lift;
      const vx = ankleX - leg.x, vy = ankleY - hipY;
      const dist = Math.min(Math.hypot(vx, vy), leg.upperLength + leg.lowerLength - .001);
      const ux = vx / Math.hypot(vx, vy), uy = vy / Math.hypot(vx, vy);
      const along = (leg.upperLength ** 2 - leg.lowerLength ** 2 + dist ** 2) / (2 * dist);
      const bend = Math.sqrt(Math.max(0, leg.upperLength ** 2 - along ** 2));
      const direction = leg.hind ? 1 : -1;
      const kneeX = leg.x + ux * along + (-uy) * bend * direction;
      const kneeY = hipY + uy * along + ux * bend * direction;
      leg.upper.position.set(leg.x, hipY, leg.z);
      leg.upper.rotation.z = Math.atan2(kneeX - leg.x, hipY - kneeY);
      leg.lower.position.set(kneeX, kneeY, leg.z);
      leg.lower.rotation.z = Math.atan2(ankleX - kneeX, kneeY - ankleY);
      leg.foot.position.set(ankleX, ankleY, leg.z);
    }
    tail.rotation.x = Math.sin(time * 1.5) * .13;
    tail.rotation.z = Math.sin(time * 1.3) * .09;
    animal.position.y = Math.sin(time * 4.1) * .018;
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    const aspect = w / h;
    const viewHeight = aspect < .8 ? Math.max(12.5, 5.5 / aspect) : 9.0;
    camera.left = -viewHeight * aspect / 2; camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
    // On narrow screens, keep the animal visible below the introduction.
    target.x = aspect < .8 ? -.45 : -1.18;
    target.y = aspect < .8 ? 4.7 : 3.35;
    camera.zoom = zoom; camera.updateProjectionMatrix(); positionCamera();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize); resize();

  let dragging = false, lastX = 0, lastY = 0;
  container.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; container.setPointerCapture(e.pointerId); });
  container.addEventListener('pointermove', e => {
    if (!dragging) return;
    azimuth -= (e.clientX - lastX) * .006;
    elevation = THREE.MathUtils.clamp(elevation + (e.clientY - lastY) * .004, -.03, .6);
    lastX = e.clientX; lastY = e.clientY; positionCamera();
  });
  container.addEventListener('pointerup', () => { dragging = false; });
  container.addEventListener('pointercancel', () => { dragging = false; });
  container.addEventListener('wheel', e => {
    e.preventDefault(); zoom = THREE.MathUtils.clamp(zoom * Math.exp(-e.deltaY * .001), .7, 1.65);
    camera.zoom = zoom; camera.updateProjectionMatrix();
  }, { passive: false });

  let running = true, walkTime = 0, lastTime = performance.now();
  const toggle = document.getElementById('toggle');
  toggle.addEventListener('click', () => {
    running = !running;
    document.getElementById('play-icon').textContent = running ? 'Ⅱ' : '▶';
    document.getElementById('motion-label').textContent = running ? 'IN MOTION' : 'PAUSED';
    toggle.setAttribute('aria-label', running ? 'Pause walking animation' : 'Resume walking animation');
    toggle.title = running ? 'Pause walking animation' : 'Resume walking animation';
  });
  function animate(now) {
    requestAnimationFrame(animate);
    const delta = Math.min((now - lastTime) / 1000, .05); lastTime = now;
    if (running) walkTime += delta;
    updateLegs(walkTime);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
})();
