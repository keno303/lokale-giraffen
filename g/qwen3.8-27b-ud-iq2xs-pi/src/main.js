/* ============================================================================
   GIRAFFE IN THE SAVANNA — Three.js, zero server, zero build
   Open index.html directly (file://). All assets are procedural
   (canvas textures, geometry) and the Three.js library is vendored
   in lib/three.min.js.
   Local frame: forward +Z, up +Y, right +X.
   ============================================================================ */
(function () {
  'use strict';

  const errEl = document.getElementById('err');
  const showErr = (msg) => { errEl.style.display = 'grid'; errEl.textContent = msg; };

  if (typeof window.THREE === 'undefined') {
    showErr('Failed to load lib/three.min.js (check the file path).');
    return;
  }
  const THREE = window.THREE;

  /* ---------------------------------------------------------------------------
   * Renderer / scene / camera
   * --------------------------------------------------------------------------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    showErr('WebGL is not available in this browser: ' + e.message);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); showErr('WebGL context lost.');
  });

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe3d8c4, 60, 240);

  const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 600);

  /* Sky dome */
  {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(320, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color(0x2f6cb0) },
          mid: { value: new THREE.Color(0x9dc3e4) },
          low: { value: new THREE.Color(0xe8dcc6) }
        },
        vertexShader:
          'varying vec3 vW; void main(){ vW = (modelMatrix*vec4(position,1.)).xyz; ' +
          'gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader:
          'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vW; ' +
          'void main(){ float h = normalize(vW).y; ' +
          'vec3 c = mix(low, mid, smoothstep(0.0, 0.18, h)); ' +
          'c = mix(c, top, smoothstep(0.18, 0.65, h)); ' +
          'gl_FragColor = vec4(c, 1.0); }'
      })
    );
    scene.add(sky);
  }

  /* Lights (shadow rig follows the giraffe) */
  const sun = new THREE.DirectionalLight(0xffe9c4, 3.4);
  sun.position.set(38, 52, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -24;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 180;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 2.5;
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x8a6f45, 0.65));
  const sunOffset = new THREE.Vector3(38, 52, 20);

  /* ---------------------------------------------------------------------------
   * Procedural textures
   * --------------------------------------------------------------------------- */
  function canvasTex(size, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    draw(g, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 4;
    return t;
  }

  /* Giraffe coat: tan base + bordered rosettes (tileable via 3x3 wrap copies).
     A few large rosettes + a denser layer of small ones = more giraffe-like. */
  const coatTex = canvasTex(512, (g, s) => {
    g.fillStyle = '#c8a268'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1500; i++) {           /* soft mottling */
      const x = Math.random() * s, y = Math.random() * s, r = 2 + Math.random() * 10;
      g.fillStyle = Math.random() < 0.5
        ? 'rgba(236,217,172,' + (0.04 + Math.random() * 0.10).toFixed(2) + ')'
        : 'rgba(118,86,48,' + (0.04 + Math.random() * 0.10).toFixed(2) + ')';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const mkR = (n, rmin, rmax, alpha) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const cx = Math.random() * s, cy = Math.random() * s;
        const r = rmin + Math.random() * (rmax - rmin);
        const verts = 7 + (Math.random() * 3 | 0);
        const pts = [];
        for (let k = 0; k < verts; k++) {
          const a = (k / verts) * Math.PI * 2;
          const rr = r * (0.6 + Math.random() * 0.55);
          pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92]);
        }
        out.push([cx, cy, pts, alpha]);
      }
      return out;
    };
    const big = mkR(22, 26, 60, 1.0);     /* a few large rosettes */
    const small = mkR(44, 10, 26, 0.55);  /* dense layer of small ones */
    const all = big.concat(small);
    for (let i = 0; i < all.length; i++) {
      const [cx, cy, pts, alpha] = all[i];
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        g.beginPath();
        for (let k = 0; k < pts.length; k++) {
          const X = pts[k][0] - cx + cx + ox * s, Y = pts[k][1] - cy + cy + oy * s;
          k ? g.lineTo(X, Y) : g.moveTo(X, Y);
        }
        g.closePath();
        const b = 96 + (Math.random() * 26 | 0);
        g.fillStyle = 'rgba(' + (b + 8) + ',' + (58 + (Math.random() * 20 | 0)) + ',' + (30 + (Math.random() * 14 | 0)) + ',' + (0.5 + 0.5 * alpha).toFixed(2) + ')';
        g.fill();
        g.lineWidth = 5; g.strokeStyle = 'rgba(233,216,174,' + (0.45 + 0.55 * alpha).toFixed(2) + ')'; g.stroke();
      }
    }
  }, [2, 2]);

  /* Head: cream face with dark muzzle (v=0 is the top pole of the sphere,
     which is the nose end of the head in local space) */
  const headTex = canvasTex(256, (g, s) => {
    g.fillStyle = '#cbb28a'; g.fillRect(0, 0, s, s);
    const grad = g.createRadialGradient(s / 2, s * 0.16, 4, s / 2, s * 0.16, s * 0.62);
    grad.addColorStop(0, '#4d3a26');
    grad.addColorStop(0.55, '#6d5638');
    grad.addColorStop(1, 'rgba(120,95,60,0)');
    g.fillStyle = grad; g.fillRect(0, 0, s, s * 0.62);
    g.fillStyle = 'rgba(230,215,175,0.5)';
    g.beginPath(); g.ellipse(s / 2, s * 0.5, s * 0.30, s * 0.22, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 1 + Math.random() * 3;
      g.fillStyle = 'rgba(90,66,38,' + (0.05 + Math.random() * 0.08).toFixed(2) + ')';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  });

  /* Savanna ground: mottled ochre-green, tileable */
  const groundTex = canvasTex(256, (g, s) => {
    g.fillStyle = '#a99a5c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2200; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 1 + Math.random() * 4;
      const pick = Math.random();
      g.fillStyle = pick < 0.42 ? 'rgba(125,155,74,' + (0.10 + Math.random() * 0.16).toFixed(2) + ')'
        : pick < 0.75 ? 'rgba(140,120,70,' + (0.08 + Math.random() * 0.14).toFixed(2) + ')'
        : 'rgba(214,196,140,' + (0.06 + Math.random() * 0.10).toFixed(2) + ')';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 26; i++) {      /* dry patches */
      const x = Math.random() * s, y = Math.random() * s;
      g.fillStyle = 'rgba(168,146,88,0.12)';
      g.beginPath(); g.ellipse(x, y, 18 + Math.random() * 30, 12 + Math.random() * 22, Math.random() * 3, 0, Math.PI * 2); g.fill();
    }
  }, [14, 14]);

  /* ---------------------------------------------------------------------------
   * Materials
   * --------------------------------------------------------------------------- */
  const neckTex = coatTex.clone(); neckTex.repeat.set(1.4, 0.9);
  const M = {
    coat:    new THREE.MeshStandardMaterial({ map: coatTex, roughness: 0.84, metalness: 0 }),
    neck:    new THREE.MeshStandardMaterial({ map: neckTex, roughness: 0.84, metalness: 0 }),
    head:    new THREE.MeshStandardMaterial({ map: headTex, roughness: 0.78, metalness: 0 }),
    dark:    new THREE.MeshStandardMaterial({ color: 0x5a462a, roughness: 0.85, metalness: 0 }),
    legDark: new THREE.MeshStandardMaterial({ color: 0x51402a, roughness: 0.88, metalness: 0 }),
    hoof:    new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 0.95, metalness: 0.05 }),
    ossicon: new THREE.MeshStandardMaterial({ color: 0x45321a, roughness: 0.9, metalness: 0 }),
    fur:     new THREE.MeshStandardMaterial({ color: 0xe7d8ae, roughness: 0.85, metalness: 0 }),
    eye:     new THREE.MeshStandardMaterial({ color: 0x241506, roughness: 0.25, metalness: 0.15 }),
    eyeShine: new THREE.MeshBasicMaterial({ color: 0xfff4dc }),
    ground:  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1.0, metalness: 0 }),
    trunk:   new THREE.MeshStandardMaterial({ color: 0x6f5638, roughness: 0.95 }),
    leafA:   new THREE.MeshStandardMaterial({ color: 0x7d9c50, roughness: 0.92 }),
    leafB:   new THREE.MeshStandardMaterial({ color: 0x6f8f42, roughness: 0.92 }),
    rock:    new THREE.MeshStandardMaterial({ color: 0x8d8574, roughness: 1.0 }),
  };

  /* ---------------------------------------------------------------------------
   * Ground + savanna scenery
   * --------------------------------------------------------------------------- */
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 72), M.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const rnd = (a, b) => a + Math.random() * (b - a);

  function addTree(x, z) {
    const t = new THREE.Group();
    const trunkH = rnd(2.6, 4.2);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.30, trunkH, 6), M.trunk);
    trunk.position.y = trunkH / 2; trunk.castShadow = true; trunk.receiveShadow = true;
    t.add(trunk);
    const nB = 3 + (Math.random() * 3 | 0);
    for (let i = 0; i < nB; i++) {
      const a = Math.random() * Math.PI * 2, tilt = rnd(0.5, 1.2), L = rnd(1.1, 1.9);
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, L, 5), M.trunk);
      br.position.set(Math.cos(a) * L * 0.5, trunkH - 0.2 + Math.cos(tilt) * L * 0.5, Math.sin(a) * L * 0.5);
      br.rotation.set(Math.sin(a) * tilt, 0, Math.cos(a) * tilt);
      br.castShadow = true;
      t.add(br);
    }
    const nF = 5 + (Math.random() * 3 | 0);
    const leafGeo = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < nF; i++) {
      const f = new THREE.Mesh(leafGeo, Math.random() < 0.5 ? M.leafA : M.leafB);
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.4;
      f.position.set(Math.cos(a) * r, trunkH + rnd(0.4, 1.3), Math.sin(a) * r);
      const sc = rnd(0.9, 1.7);
      f.scale.set(sc, sc * 0.55, sc);
      f.castShadow = true;
      t.add(f);
    }
    t.position.set(x, 0, z);
    scene.add(t);
  }
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rnd(30, 105);
    addTree(Math.cos(a) * r, Math.sin(a) * r);
  }
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2, r = rnd(12, 70);
    const rock = new THREE.Mesh(rockGeo, M.rock);
    const sc = rnd(0.5, 1.4);
    rock.scale.set(sc, sc * 0.75, sc);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rock.position.set(Math.cos(a) * r, sc * 0.35, Math.sin(a) * r);
    rock.castShadow = true; rock.receiveShadow = true;
    scene.add(rock);
  }
  /* grass tufts + flowers (instanced, cheap) */
  const tuftGeo = new THREE.ConeGeometry(0.06, 0.26, 4);
  const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ color: 0x77924a, roughness: 0.95 }), 320);
  tufts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3();
    for (let i = 0; i < 320; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 118;
      const sc = rnd(0.5, 1.7);
      q.setFromEuler(new THREE.Euler(rnd(-0.3, 0.3), Math.random() * 6, rnd(-0.3, 0.3)));
      v.set(Math.cos(a) * r, 0.13 * sc, Math.sin(a) * r);
      m.compose(v, q, new THREE.Vector3(sc, sc, sc));
      tufts.setMatrixAt(i, m);
    }
  }
  tufts.castShadow = true; tufts.receiveShadow = true;
  scene.add(tufts);
  const flowerGeo = new THREE.SphereGeometry(0.05, 6, 4);
  const flowers = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ color: 0xe8e2c8, roughness: 0.9 }), 60);
  {
    const m = new THREE.Matrix4();
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 115;
      m.makeTranslation(Math.cos(a) * r, 0.06, Math.sin(a) * r);
      flowers.setMatrixAt(i, m);
    }
  }
  scene.add(flowers);

  /* ---------------------------------------------------------------------------
   * GIRAFFE  (adult, ~2.8 m to the ossicons, ~1.7 m at the withers)
   * --------------------------------------------------------------------------- */
  const GIR = new THREE.Group();              /* root: positioned in the world */
  const bodyGroup = new THREE.Group();        /* bobs + pitches with the stride */
  GIR.add(bodyGroup);

  /* Body — lathe "seed" along +Z (front-back), belly ~0.9, top ~1.7 */
  const bodyPts = [
    [0, 0], [0.18, 0.20], [0.32, 0.45], [0.38, 0.72], [0.40, 1.00],
    [0.35, 1.27], [0.24, 1.47], [0.11, 1.55], [0, 1.60]
  ].map(p => new THREE.Vector3(p[0], p[1], 0));
  const bodyGeo = new THREE.LatheGeometry(bodyPts, 32);
  bodyGeo.rotateX(Math.PI / 2);               /* lathe axis +Y  ->  +Z (forward) */
  bodyGeo.scale(0.95, 1, 1);                   /* narrow the side-to-side width */
  const body = new THREE.Mesh(bodyGeo, M.coat);
  body.position.set(0, 1.3, -0.8);
  body.castShadow = true;
  bodyGroup.add(body);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 14), M.coat);
  chest.scale.set(0.85, 0.95, 1.05); chest.position.set(0, 1.48, 0.68); chest.castShadow = true;
  bodyGroup.add(chest);
  const rump = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), M.coat);
  rump.scale.set(0.9, 0.95, 1.0); rump.position.set(0, 1.45, -0.68); rump.castShadow = true;
  bodyGroup.add(rump);
  const withers = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), M.coat);
  withers.scale.set(0.95, 0.65, 0.85); withers.position.set(0, 1.64, 0.3); withers.castShadow = true;
  bodyGroup.add(withers);

  /* Tail */
  const tail = new THREE.Group();
  tail.position.set(0, 1.56, -0.84);
  {
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.26, 4, 8), M.coat);
    up.position.set(0, -0.18, 0); up.castShadow = true;
    const lo = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.18, 4, 8), M.coat);
    lo.position.set(0, -0.40, 0); lo.castShadow = true;
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), M.dark);
    tuft.scale.set(0.7, 1.25, 0.7); tuft.position.set(0, -0.56, 0); tuft.castShadow = true;
    tail.add(up, lo, tuft);
  }
  bodyGroup.add(tail);

  /* Neck + head — local frame: Y up along the neck line, X sideways,
     Z = (0,-0.84,0.54) i.e. down-and-back */
  const neck = new THREE.Group();
  neck.position.set(0, 1.7, 0.52);
  neck.rotation.x = 0.997;                    /* rise ~57 deg toward +Z */
  bodyGroup.add(neck);
  const neckMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.46, 4, 16), M.neck);
  neckMesh.position.set(0, 0.5, 0); neckMesh.castShadow = true;
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.position.set(0, 0.82, 0);               /* continues the neck line */
  neck.add(head);
  let earL, earR;
  const eyeMeshes = [];
  {
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 14), M.head);
    skull.scale.set(0.8, 1.25, 0.85); skull.position.set(0, 0.14, 0); skull.castShadow = true;
    head.add(skull);
    const snout = new THREE.Mesh(new THREE.CapsuleGeometry(0.145, 0.36, 4, 12), M.head);
    snout.position.set(0, 0.62, 0.02); snout.castShadow = true;
    head.add(snout);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), M.head);
    muzzle.scale.set(0.8, 0.65, 0.75); muzzle.position.set(0, 0.98, 0.05); muzzle.castShadow = true;
    head.add(muzzle);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.022, 0.035), M.dark);
    mouth.position.set(0, 1.05, 0.06);
    head.add(mouth);
    const brow = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), M.fur);
    brow.position.set(0, 0.47, 0.03);
    head.add(brow);
    const nostrilGeo = new THREE.SphereGeometry(0.025, 8, 6);
    const nL = new THREE.Mesh(nostrilGeo, M.dark); nL.position.set(-0.045, 1.03, 0.04);
    const nR = new THREE.Mesh(nostrilGeo, M.dark); nR.position.set(0.045, 1.03, 0.04);
    head.add(nL, nR);
    /* eyes + shine */
    const eyeGeo = new THREE.SphereGeometry(0.05, 12, 10);
    const eyeL = new THREE.Mesh(eyeGeo, M.eye); eyeL.position.set(-0.14, 0.50, 0.03);
    const eyeR = new THREE.Mesh(eyeGeo, M.eye); eyeR.position.set(0.14, 0.50, 0.03);
    head.add(eyeL, eyeR);
    eyeMeshes.push(eyeL, eyeR);
    const shineGeo = new THREE.SphereGeometry(0.018, 8, 6);
    const shineL = new THREE.Mesh(shineGeo, M.eyeShine); shineL.position.set(-0.135, 0.54, 0.07);
    const shineR = new THREE.Mesh(shineGeo, M.eyeShine); shineR.position.set(0.135, 0.54, 0.07);
    head.add(shineL, shineR);
    /* ears — flat cones, tips outwards + slightly back (rotate about Z) */
    const earGeo = new THREE.ConeGeometry(0.095, 0.26, 6);
    earGeo.scale(1, 1, 0.32);
    earL = new THREE.Mesh(earGeo, M.head);
    earL.position.set(-0.21, 0.44, -0.07); earL.rotation.z = 1.82; earL.castShadow = true;
    earR = new THREE.Mesh(earGeo, M.head);
    earR.position.set(0.21, 0.44, -0.07); earR.rotation.z = -1.82; earR.castShadow = true;
    head.add(earL, earR);
    /* ossicons (fleshy horns) */
    const ossGeo = new THREE.CylinderGeometry(0.05, 0.072, 0.2, 8);
    const ossBase = new THREE.SphereGeometry(0.08, 10, 8);
    const mkOss = (sx) => {
      const o = new THREE.Group();
      o.position.set(0.09 * sx, 0.68, -0.06);
      const base = new THREE.Mesh(ossBase, M.ossicon); base.castShadow = true;
      const col = new THREE.Mesh(ossGeo, M.ossicon);
      col.position.set(0, 0.09, 0); col.rotation.x = -0.35; col.castShadow = true;
      o.add(base, col);
      return o;
    };
    head.add(mkOss(-1), mkOss(1));
  }

  /* Legs — shoulder pivot -> upper leg -> knee pivot -> lower leg -> hoof.
     FL/FR shoulders at 1.32 (legs 1.32 below); TL/TR at 1.42 (legs 1.42). */
  function buildLeg(x, z, shoulderY, upperLen, lowerLen) {
    const sh = new THREE.Group();
    sh.position.set(x, shoulderY, z);
    GIR.add(sh);
    const upper = new THREE.Group();
    sh.add(upper);
    const uMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, upperLen - 0.38, 4, 12), M.coat);
    uMesh.position.set(0, -upperLen / 2, 0); uMesh.castShadow = true;
    upper.add(uMesh);
    const knee = new THREE.Group();
    knee.position.set(0, -upperLen, 0);
    upper.add(knee);
    const lMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, lowerLen - 0.23, 4, 10), M.legDark);
    lMesh.position.set(0, -lowerLen / 2, 0); lMesh.castShadow = true;
    knee.add(lMesh);
    const hoof = new THREE.Group();
    hoof.position.set(0, -lowerLen + 0.035, 0);
    knee.add(hoof);
    const hoofMain = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.07, 0.26), M.hoof);
    hoofMain.castShadow = true; hoof.add(hoofMain);
    const hoofToe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.15), M.hoof);
    hoofToe.position.set(0, 0, 0.125); hoofToe.castShadow = true; hoof.add(hoofToe);
    return { sh, upper, knee, hoof };
  }
  const LEGS = {
    FL: buildLeg(-0.36,  0.48, 1.32, 0.74, 0.53),
    FR: buildLeg( 0.36,  0.48, 1.32, 0.74, 0.53),
    TL: buildLeg(-0.36, -0.52, 1.42, 0.80, 0.57),
    TR: buildLeg( 0.36, -0.52, 1.42, 0.80, 0.57),
  };
  scene.add(GIR);

  /* ---------------------------------------------------------------------------
   * Trot dust (pooled)
   * --------------------------------------------------------------------------- */
  const DUST_N = 26;
  const dustGeo = new THREE.SphereGeometry(0.07, 6, 5);
  const dustMat = new THREE.MeshBasicMaterial({ color: 0x9a8a66, transparent: true, opacity: 0, depthWrite: false });
  const dust = [];
  for (let i = 0; i < DUST_N; i++) {
    const d = new THREE.Mesh(dustGeo, dustMat);
    d.visible = false; scene.add(d);
    dust.push({ m: d, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, max: 0.7 });
  }
  let dustCursor = 0;
  function spawnDust(px, pz, dirX, dirZ) {
    for (let i = 0; i < 2; i++) {
      const d = dust[dustCursor % DUST_N]; dustCursor++;
      d.life = 0; d.max = 0.6 + Math.random() * 0.4;
      d.x = px + (Math.random() - 0.5) * 1.1;
      d.z = pz + (Math.random() - 0.5) * 0.5;
      d.y = 0.05 + Math.random() * 0.05;
      d.vx = -dirX * (0.7 + Math.random()) + (Math.random() - 0.5) * 0.6;
      d.vz = -dirZ * (0.7 + Math.random()) + (Math.random() - 0.5) * 0.6;
      d.vy = 0.25 + Math.random() * 0.35;
      d.m.visible = true;
    }
  }
  function updateDust(dt, sf) {
    for (const d of dust) {
      if (d.life <= 0) continue;
      d.life += dt;
      if (d.life >= d.max) { d.m.visible = false; continue; }
      const k = d.life / d.max;
      d.vy += 2.2 * dt;
      d.vx *= (1 - 2.2 * dt); d.vz *= (1 - 2.2 * dt);
      d.x += d.vx * dt; d.y = Math.max(0.03, d.y + d.vy * dt); d.z += d.vz * dt;
      const s = 1 + k * 1.9;
      d.m.position.set(d.x, d.y, d.z);
      d.m.scale.set(s, s * 0.7, s);
      d.m.material.opacity = (1 - k) * 0.32 * Math.max(0, Math.min(1, sf - 1.2));
    }
  }

  /* ---------------------------------------------------------------------------
   * Input
   * --------------------------------------------------------------------------- */
  const SPEED_WALK = 1.35, SPEED_TROT = 3.3, SPEED_STAND = 0;
  const state = {
    yaw: Math.PI * 0.8, pitch: 0.22, radius: 7.6,
    dragging: false, dragX: 0, dragY: 0,
    userHeld: false,
    targetSpeed: SPEED_WALK, speed: SPEED_WALK,
    steer: 0,
  };
  function setSpeedTarget(s) { state.targetSpeed = Math.max(0, Math.min(4.5, s)); }
  const keys = {};
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === ' ') { state.targetSpeed = state.targetSpeed > 0.5 ? 0 : SPEED_TROT; e.preventDefault(); }
    if (k === 'w' || k === 'arrowup') setSpeedTarget(SPEED_TROT);
    if (k === 's' || k === 'arrowdown') setSpeedTarget(SPEED_STAND);
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = false;
    if ((k === 'w' || k === 'arrowup') && state.targetSpeed === SPEED_TROT) setSpeedTarget(SPEED_WALK);
    if ((k === 's' || k === 'arrowdown') && state.targetSpeed === SPEED_STAND) setSpeedTarget(SPEED_WALK);
  });
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => {
    state.dragging = true; state.dragX = e.clientX; state.dragY = e.clientY; state.userHeld = true;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    state.yaw -= (e.clientX - state.dragX) * 0.005;
    state.pitch = Math.max(-0.12, Math.min(1.1, state.pitch + (e.clientY - state.dragY) * 0.0035));
    state.dragX = e.clientX; state.dragY = e.clientY;
  });
  el.addEventListener('pointerup', () => { state.dragging = false; state.userHeld = false; });
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.radius = Math.max(3.2, Math.min(26, state.radius * (e.deltaY > 0 ? 1.1 : 0.9)));
  }, { passive: false });

  /* ---------------------------------------------------------------------------
   * Animation loop
   * --------------------------------------------------------------------------- */
  const clock = new THREE.Clock();
  const camTarget = new THREE.Vector3(0, 1.6, 0);
  const tmpV = new THREE.Vector3();
  let dist = 0;               /* stride distance accumulator */
  let tGlobal = 0;
  let blinkT = 2.5, blinkOn = 0;

  const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function tickFrame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    tGlobal += dt;

    /* --- steering & motion --- */
    if (keys['a']) state.steer = Math.min(1, state.steer + dt * 3);
    else if (keys['d']) state.steer = Math.max(-1, state.steer - dt * 3);
    else state.steer *= Math.max(0, 1 - dt * 2.5);

    state.speed += (state.targetSpeed - state.speed) * Math.min(1, dt * 3);
    const sf = Math.min(1.7, Math.max(0, state.speed / SPEED_WALK));

    let turn = 0.16 * Math.sin(tGlobal * 0.06)
             + 0.08 * Math.sin(tGlobal * 0.023 + 2.1)
             + 0.06 * Math.sin(tGlobal * 0.21 + 1.0)
             + state.steer * 1.4;
    const gx = GIR.position.x, gz = GIR.position.z;
    if (Math.hypot(gx, gz) > 24) {
      const toCenter = Math.atan2(-gz, -gx);
      turn += wrapPi(toCenter - GIR.rotation.y) * 1.6;
    }
    GIR.rotation.y += turn * dt * (0.4 + sf);
    const heading = GIR.rotation.y;
    const dirX = Math.sin(heading), dirZ = Math.cos(heading);
    GIR.position.x += dirX * state.speed * dt;
    GIR.position.z += dirZ * state.speed * dt;
    dist += state.speed * dt;

    /* --- gait: diagonal couple (LF+TR together, RF+TL together) --- */
    const stride = dist * Math.PI * 1.5;      /* ~0.75 full cycles per metre */
    const pLF = stride, pRF = stride + Math.PI;
    const setLeg = (L, ph, side) => {
      L.upper.rotation.x = Math.sin(ph) * 0.42 * sf;
      L.knee.rotation.x = Math.sin(ph + 0.85) * 0.55 * sf + 0.12 + 0.03 * (1 - sf);
      L.knee.rotation.z = side * 0.03 * sf * Math.sin(ph);
      L.upper.rotation.z = side * 0.02 * sf * Math.sin(ph + 0.4);
    };
    setLeg(LEGS.FL, pLF, 1);  setLeg(LEGS.TR, pLF, -1);
    setLeg(LEGS.FR, pRF, -1); setLeg(LEGS.TL, pRF, 1);

    /* --- body bob / pitch / sway --- */
    bodyGroup.position.y = 0.035 * sf * (0.5 - 0.5 * Math.cos(2 * stride));
    bodyGroup.rotation.x = -Math.sin(stride) * 0.035 * sf;
    bodyGroup.rotation.z = Math.sin(stride + Math.PI / 2) * 0.012 * sf;
    /* breathing when idle */
    const br = 0.5 + 0.5 * Math.sin(tGlobal * 0.8);
    chest.scale.y = 1.0 + 0.02 * br * (1 - Math.min(1, sf));

    /* --- neck & head --- */
    neck.rotation.x = 0.997 - 0.015 * sf + Math.sin(tGlobal * 0.9) * 0.02 * (1 - sf);
    neck.rotation.y = Math.sin(tGlobal * 0.5) * 0.03;
    head.rotation.x = -Math.sin(stride + 0.7) * 0.05 * sf;
    head.rotation.y = Math.sin(tGlobal * 0.4) * 0.035 * (1 - 0.6 * sf);
    const earSwing = Math.sin(stride + 1.3) * 0.12 * sf + Math.sin(tGlobal * 2.2) * 0.05 * (1 - sf);
    earL.rotation.z = 1.82 - earSwing;
    earR.rotation.z = -1.82 + earSwing;
    tail.rotation.x = 0.15 + Math.sin(tGlobal * 2.2) * 0.2 * (0.3 + 0.7 * sf);
    tail.rotation.z = Math.sin(tGlobal * 1.7) * 0.14 * sf;

    /* --- blink --- */
    blinkT -= dt;
    if (blinkOn <= 0 && blinkT <= 0) { blinkOn = 0.16; blinkT = 2.2 + Math.random() * 3; }
    if (blinkOn > 0) blinkOn -= dt;
    const open = blinkOn > 0 ? 0.15 : 1;
    for (const e of eyeMeshes) e.scale.y = open;

    /* --- trot dust --- */
    if (sf > 1.4 && Math.random() < sf * 2.2 * dt * 4) {
      spawnDust(GIR.position.x, GIR.position.z, dirX, dirZ);
    }
    updateDust(dt, sf);

    /* --- shadow rig follows the giraffe --- */
    sun.target.position.copy(GIR.position);
    sun.position.copy(GIR.position).add(sunOffset);

    /* --- chase camera --- */
    tmpV.copy(GIR.position); tmpV.y += 1.55;
    camTarget.lerp(tmpV, Math.min(1, dt * 4));
    if (!state.dragging && !state.userHeld) {
      state.yaw += wrapPi(heading + Math.PI - state.yaw) * Math.min(1, dt * 0.9);
      state.pitch += (0.24 - state.pitch) * Math.min(1, dt * 0.5);
    }
    const cp = Math.cos(state.pitch);
    tmpV.set(
      camTarget.x + Math.cos(state.yaw) * cp * state.radius,
      Math.max(0.5, camTarget.y + Math.sin(state.pitch) * state.radius),
      camTarget.z + Math.sin(state.yaw) * cp * state.radius
    );
    camera.position.lerp(tmpV, Math.min(1, dt * 6));
    camera.lookAt(camTarget);

    renderer.render(scene, camera);
  }
  /* Drive with requestAnimationFrame; if it never fires (some headless /
     embedded contexts), fall back to a timer. */
  let rafFired = false;
  const fallbackTimer = window.setInterval(() => {
    if (rafFired) { window.clearInterval(fallbackTimer); return; }
    tickFrame();
  }, 30);
  function tick() {
    rafFired = true;
    window.clearInterval(fallbackTimer);
    requestAnimationFrame(tick);
    tickFrame();
  }
  /* tiny debug API: step() renders N frames synchronously (used by
     headless screenshot tooling; harmless otherwise) */
  window.giraffe = {
    step: (n) => { for (let i = 0; i < (n || 1); i++) tickFrame(); },
    get state() { return state; },
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  tick();
})();
