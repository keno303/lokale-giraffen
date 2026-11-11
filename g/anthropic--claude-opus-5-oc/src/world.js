/* The savanna: sky dome, sun, dry grass plain, acacias, rocks and haze. */
(function (global) {
  'use strict';

  const U = global.GU;

  function buildWorld(scene, renderer) {
    const world = {};
    const rnd = U.makeRandom(20260411);

    /* --- sky ----------------------------------------------------------- */
    const skyGeo = new THREE.SphereGeometry(600, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x2f6ebd) },
        midColor: { value: new THREE.Color(0x8db6de) },
        horizon: { value: new THREE.Color(0xd9cdae) },
        sunDir: { value: new THREE.Vector3(0.45, 0.42, -0.79).normalize() }
      },
      vertexShader: [
        'varying vec3 vDir;',
        'void main() {',
        '  vDir = normalize( position );',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 topColor; uniform vec3 midColor; uniform vec3 horizon;',
        'uniform vec3 sunDir; varying vec3 vDir;',
        'void main() {',
        '  float h = clamp( vDir.y, -1.0, 1.0 );',
        '  vec3 c = mix( horizon, midColor, smoothstep( -0.02, 0.26, h ) );',
        '  c = mix( c, topColor, smoothstep( 0.18, 0.78, h ) );',
        '  float sd = max( dot( normalize( vDir ), sunDir ), 0.0 );',
        '  c += vec3( 1.0, 0.82, 0.55 ) * pow( sd, 9.0 ) * 0.33;',
        '  c += vec3( 1.0, 0.95, 0.85 ) * pow( sd, 900.0 ) * 6.0;',
        '  gl_FragColor = vec4( c, 1.0 );',
        '}'
      ].join('\n')
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.frustumCulled = false;
    scene.add(sky);
    world.sky = sky;

    scene.fog = new THREE.Fog(new THREE.Color(0xc9bda2), 70, 460);

    /* --- light ---------------------------------------------------------- */
    const sunDir = skyMat.uniforms.sunDir.value.clone();
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    sun.position.copy(sunDir).multiplyScalar(60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.near = 1; sc.far = 160;
    sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -14;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    scene.add(sun.target);
    world.sun = sun;

    const hemi = new THREE.HemisphereLight(0x9cc0e6, 0xc09a63, 0.85);
    scene.add(hemi);
    // A dim fill from the opposite side keeps the shaded flank readable.
    const fill = new THREE.DirectionalLight(0xc3d6f2, 0.38);
    fill.position.set(-40, 24, 48);
    scene.add(fill);

    /* --- ground ---------------------------------------------------------- */
    const groundTex = global.Coat.buildGround(256, 5);
    groundTex.repeat.set(150, 150);
    const gmat = new THREE.MeshStandardMaterial({
      map: groundTex, roughness: 0.97, metalness: 0.0, vertexColors: true
    });
    const gGeo = new THREE.PlaneGeometry(1200, 1200, 120, 120);
    {
      // Large scale colour drift plus gentle relief that starts well outside
      // the area the giraffe walks on (which must stay flat for the IK).
      const pa = gGeo.attributes.position;
      const col = new Float32Array(pa.count * 3);
      const c1 = new THREE.Color(0xe2d8b4), c2 = new THREE.Color(0x9aa066);
      const c3 = new THREE.Color(0xb59a62), tc = new THREE.Color();
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), z = -pa.getY(i);
        const r = Math.hypot(x, z);
        const n = U.tileFbm(x * 0.012 + 40, z * 0.012 + 40, 64, 4, 101);
        const n2 = U.tileFbm(x * 0.045 + 7, z * 0.045 + 7, 64, 3, 211);
        tc.copy(c1).lerp(c2, U.smoothstep((n - 0.52) * 3.2) * 0.55)
          .lerp(c3, U.smoothstep((n2 - 0.58) * 3.0) * 0.5);
        col[i * 3] = tc.r; col[i * 3 + 1] = tc.g; col[i * 3 + 2] = tc.b;
        const relief = (n - 0.5) * 7.0 + (n2 - 0.5) * 1.6;
        pa.setZ(i, relief * U.smoothstep((r - 62) / 120));
      }
      gGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      gGeo.computeVertexNormals();
    }
    const ground = new THREE.Mesh(gGeo, gmat);
    ground.castShadow = false;
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    world.ground = ground;

    /* --- grass tufts ------------------------------------------------------ */
    {
      const tex = global.Coat.buildGrassTuft(192, 12);
      const mat = new THREE.MeshStandardMaterial({
        map: tex, alphaTest: 0.30, side: THREE.DoubleSide,
        roughness: 1.0, metalness: 0.0
      });
      const quad = new THREE.PlaneGeometry(1, 1);
      quad.translate(0, 0.5, 0);
      const cross = mergeGeometries([
        quad.clone(),
        quad.clone().rotateY(Math.PI / 2)
      ]);
      const COUNT = 4200;
      const grass = new THREE.InstancedMesh(cross, mat, COUNT);
      grass.castShadow = false;
      grass.receiveShadow = false;
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      const p = new THREE.Vector3();
      for (let i = 0; i < COUNT; i++) {
        const a = rnd() * U.TAU;
        const r = 2 + Math.pow(rnd(), 0.55) * 94;
        p.set(Math.cos(a) * r, -0.02, Math.sin(a) * r);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * U.TAU);
        const h = 0.17 + rnd() * 0.26;
        s.set(h * (1.1 + rnd() * 1.0), h, h);
        grass.setMatrixAt(i, m4.compose(p, q, s));
      }
      grass.instanceMatrix.needsUpdate = true;
      scene.add(grass);
      world.grass = grass;
    }

    /* --- acacias ----------------------------------------------------------- */
    const leafTex = global.Coat.buildLeafCluster(128, 31);
    const barkTex = global.Coat.buildBark(256, 3);
    barkTex.repeat.set(3, 2);
    const barkMat = new THREE.MeshStandardMaterial({
      map: barkTex, roughness: 0.95, metalness: 0.0
    });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x495d2c, roughness: 0.93, metalness: 0.0, flatShading: true
    });
    const leafMat = new THREE.MeshStandardMaterial({
      map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide,
      roughness: 0.9, metalness: 0.0, color: 0xa9bf86
    });

    world.trees = new THREE.Group();
    scene.add(world.trees);
    const treeSpots = [
      [-26, -34, 1.25], [34, -18, 1.0], [-44, 22, 1.15], [18, 46, 0.9],
      [58, 14, 1.3], [-62, -16, 1.05], [6, -62, 1.2], [-14, 70, 1.0],
      [74, -52, 1.35], [-80, 48, 1.1]
    ];
    world.obstacles = [];
    for (const spot of treeSpots) {
      world.trees.add(makeAcacia(spot[0], spot[1], spot[2], barkMat, canopyMat, leafMat, rnd));
      world.obstacles.push({ x: spot[0], z: spot[1], r: 1.1 * spot[2] });
    }

    /* --- rocks & shrubs ------------------------------------------------------ */
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x5a554d, roughness: 0.99, flatShading: true
    });
    for (let i = 0; i < 22; i++) {
      const a = rnd() * U.TAU, r = 14 + rnd() * 82;
      const sz = 0.13 + rnd() * 0.30;
      const geo = new THREE.IcosahedronGeometry(sz, 1);
      const pa = geo.attributes.position;
      const k = [0.78 + rnd() * 0.5, 0.42 + rnd() * 0.22, 0.78 + rnd() * 0.5];
      for (let v = 0; v < pa.count; v++) {
        const j = 0.86 + rnd() * 0.24;
        pa.setXYZ(v, pa.getX(v) * k[0] * j, pa.getY(v) * k[1] * j, pa.getZ(v) * k[2] * j);
      }
      geo.computeVertexNormals();
      const rock = new THREE.Mesh(geo, rockMat);
      rock.position.set(Math.cos(a) * r, sz * 0.06, Math.sin(a) * r);
      rock.rotation.y = rnd() * U.TAU;
      rock.castShadow = true; rock.receiveShadow = true;
      scene.add(rock);
    }

    /* --- distant hills --------------------------------------------------- */
    {
      const g = new THREE.BufferGeometry();
      const pos = [], idx = [];
      const SEG = 160, R = 420;
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * U.TAU;
        const hgt = 10 + U.tileFbm(i * 0.11, 0.5, 64, 4, 77) * 52;
        pos.push(Math.cos(a) * R, -2, Math.sin(a) * R);
        pos.push(Math.cos(a) * R, hgt, Math.sin(a) * R);
      }
      for (let i = 0; i < SEG; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const hills = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x9fa68c),
        side: THREE.DoubleSide, fog: true
      }));
      hills.frustumCulled = false;
      scene.add(hills);
    }

    /* --- time of day ------------------------------------------------------ */
    const C = (hex) => new THREE.Color(hex);
    const tmpA = new THREE.Color(), tmpB = new THREE.Color();
    world.setTimeOfDay = function (t) {
      t = U.clamp(t, 0, 1);
      const el = Math.sin(t * Math.PI) * 1.12 + 0.045;      // radians above horizon
      const az = U.lerp(-1.95, 1.95, t);
      const dir = new THREE.Vector3(
        Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)
      ).normalize();
      skyMat.uniforms.sunDir.value.copy(dir);
      sun.position.copy(dir).multiplyScalar(70);

      const low = 1 - U.smoothstep(el / 0.42);              // 1 at the horizon
      const night = 1 - U.smoothstep(el / 0.10);
      sun.color.copy(tmpA.copy(C(0xfff3e0)).lerp(tmpB.copy(C(0xff8233)), Math.pow(low, 1.25)));
      sun.intensity = U.lerp(2.75, 0.25, Math.pow(low, 1.7));
      hemi.intensity = U.lerp(0.88, 0.34, low);
      hemi.color.copy(tmpA.copy(C(0x9cc0e6)).lerp(tmpB.copy(C(0x7e86a4)), low));
      hemi.groundColor.copy(tmpA.copy(C(0xc09a63)).lerp(tmpB.copy(C(0x7d5c3c)), low));
      fill.intensity = U.lerp(0.40, 0.16, low);

      skyMat.uniforms.topColor.value.copy(
        tmpA.copy(C(0x2f6ebd)).lerp(tmpB.copy(C(0x27437d)), low * 0.85));
      skyMat.uniforms.midColor.value.copy(
        tmpA.copy(C(0x8db6de)).lerp(tmpB.copy(C(0xc98a63)), low));
      const horiz = tmpA.copy(C(0xd9cdae)).lerp(tmpB.copy(C(0xff9b52)), low * 0.92);
      skyMat.uniforms.horizon.value.copy(horiz);
      scene.fog.color.copy(horiz).multiplyScalar(U.lerp(1.0, 0.72, night));
      world.sunElevation = el;
    };
    world.setTimeOfDay(0.34);

    return world;
  }

  /* Minimal geometry merge (only positions / normals / uvs). */
  function mergeGeometries(list) {
    const pos = [], nor = [], uv = [], idx = [];
    let off = 0;
    for (const g of list) {
      const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        nor.push(n.getX(i), n.getY(i), n.getZ(i));
        uv.push(t.getX(i), t.getY(i));
      }
      const ix = g.index;
      for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
      off += p.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.setIndex(idx);
    return out;
  }

  function makeAcacia(x, z, scale, barkMat, canopyMat, leafMat, rnd) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rnd() * U.TAU;
    g.scale.setScalar(scale);

    // Trunk as a lathe: flared base, slight taper.
    const prof = [];
    const H = 4.6;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const y = t * H;
      const r = 0.52 * Math.pow(1 - t, 0.55) + 0.16 + (i === 0 ? 0.12 : 0);
      prof.push(new THREE.Vector2(r, y));
    }
    const trunk = new THREE.Mesh(new THREE.LatheGeometry(prof, 14), barkMat);
    trunk.castShadow = true; trunk.receiveShadow = true;
    g.add(trunk);

    // Three or four limbs fanning up and out to the flat crown.
    const limbs = 3 + ((rnd() * 2) | 0);
    for (let i = 0; i < limbs; i++) {
      const a = (i / limbs) * U.TAU + rnd() * 0.6;
      const len = 2.6 + rnd() * 1.0;
      const geo = new THREE.CylinderGeometry(0.07, 0.19, len, 8, 1);
      geo.translate(0, len / 2, 0);
      const limb = new THREE.Mesh(geo, barkMat);
      limb.position.set(0, H * 0.78, 0);
      limb.rotation.set(0, a, 0.52 + rnd() * 0.22);
      limb.rotateOnAxis(new THREE.Vector3(0, 0, 1), 0);
      limb.castShadow = true;
      g.add(limb);
    }

    // Flat-topped crown: overlapping squashed domes plus leaf billboards.
    const crownY = H + 1.5;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * U.TAU + rnd();
      const r = i === 0 ? 0 : 1.5 + rnd() * 1.3;
      const rad = 2.5 - (i === 0 ? 0 : 0.7) + rnd() * 0.7;
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(rad, 14, 7, 0, U.TAU, 0, Math.PI * 0.62), canopyMat);
      dome.position.set(Math.cos(a) * r, crownY - rnd() * 0.3, Math.sin(a) * r);
      dome.scale.set(1, 0.34 + rnd() * 0.1, 1);
      dome.castShadow = true;
      g.add(dome);
    }
    const quad = new THREE.PlaneGeometry(1, 1);
    const N = 54;
    const leaves = new THREE.InstancedMesh(quad, leafMat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(),
      s = new THREE.Vector3(), p = new THREE.Vector3(),
      e = new THREE.Euler();
    for (let i = 0; i < N; i++) {
      const a = rnd() * U.TAU;
      const r = Math.pow(rnd(), 0.45) * 3.9;
      p.set(Math.cos(a) * r, crownY + 0.1 + (rnd() - 0.3) * 0.55 - r * 0.07, Math.sin(a) * r);
      e.set((rnd() - 0.5) * 0.7, rnd() * U.TAU, (rnd() - 0.5) * 0.6);
      q.setFromEuler(e);
      const sz = 1.5 + rnd() * 1.5;
      s.set(sz, sz * 0.7, sz);
      leaves.setMatrixAt(i, m4.compose(p, q, s));
    }
    leaves.instanceMatrix.needsUpdate = true;
    leaves.castShadow = true;
    g.add(leaves);
    return g;
  }

  global.buildWorld = buildWorld;
})(window);
