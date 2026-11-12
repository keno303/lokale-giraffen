(function (global) {
  'use strict';

  const G = (global.GiraffeApp = global.GiraffeApp || {});
  const THREE = global.THREE;
  const { groundHeight, groundNormal, hash2, noise2, fbm2, lerp, clamp } = G.MathUtils;

  const LIGHTING_PRESETS = {
    golden: {
      name: 'Golden Hour',
      sunDir: new THREE.Vector3(-0.62, 0.34, 0.71).normalize(),
      sunColor: 0xffe2b3,
      sunIntensity: 3.1,
      hemiSky: 0x8bb6db,
      hemiGround: 0x8a643d,
      hemiIntensity: 1.05,
      fogColor: 0xd9be93,
      fogDensity: 0.0095,
      skyZenith: new THREE.Color('#2f6499'),
      skyHorizon: new THREE.Color('#d9be93'),
      skySunGlow: new THREE.Color('#ffcf84'),
      exposure: 1.08
    },
    midday: {
      name: 'Midday Sun',
      sunDir: new THREE.Vector3(-0.35, 0.84, 0.42).normalize(),
      sunColor: 0xfff8eb,
      sunIntensity: 3.3,
      hemiSky: 0x9cd0ff,
      hemiGround: 0x9a784c,
      hemiIntensity: 1.15,
      fogColor: 0xcfe0eb,
      fogDensity: 0.0085,
      skyZenith: new THREE.Color('#276db8'),
      skyHorizon: new THREE.Color('#cfe0eb'),
      skySunGlow: new THREE.Color('#fff4d8'),
      exposure: 1.02
    },
    dawn: {
      name: 'Dawn Mist',
      sunDir: new THREE.Vector3(0.75, 0.22, 0.62).normalize(),
      sunColor: 0xffc694,
      sunIntensity: 2.5,
      hemiSky: 0x9aaec9,
      hemiGround: 0x765a44,
      hemiIntensity: 0.95,
      fogColor: 0xd9c3b8,
      fogDensity: 0.0115,
      skyZenith: new THREE.Color('#425b85'),
      skyHorizon: new THREE.Color('#d9c3b8'),
      skySunGlow: new THREE.Color('#ffb980'),
      exposure: 1.05
    }
  };

  function createSavannahGroundTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#a48351';
    ctx.fillRect(0, 0, size, size);

    const imgData = ctx.getImageData(0, 0, size, size);
    const d = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Tileable periodic coordinates
        const nx = x / size;
        const ny = y / size;
        const n1 = Math.sin(nx * Math.PI * 2) * 0.5 + Math.cos(ny * Math.PI * 2) * 0.5;
        const g1 = fbm2(nx * 14 + 3.1, ny * 14 + 7.4, 3);
        const g2 = fbm2(nx * 46 + 11.7, ny * 46 + 2.3, 2);
        const grain = (hash2(x * 1.7, y * 1.7) - 0.5) * 18;

        const patch = clamp(0.5 + g1 * 0.55 + n1 * 0.12, 0, 1);
        // Blend between warm dry ochre soil and pale golden savannah straw
        const r = lerp(142, 186, patch) + g2 * 16 + grain;
        const g = lerp(104, 152, patch) + g2 * 14 + grain * 0.85;
        const b = lerp(63, 94, patch) + g2 * 10 + grain * 0.6;

        const idx = (y * size + x) * 4;
        d[idx] = clamp(r, 0, 255);
        d[idx + 1] = clamp(g, 0, 255);
        d[idx + 2] = clamp(b, 0, 255);
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(28, 28);
    tex.anisotropy = 8;
    return tex;
  }

  function createSkyDome(preset) {
    const geo = new THREE.SphereGeometry(260, 40, 24);
    const uniforms = {
      uSunDir: { value: preset.sunDir.clone() },
      uZenith: { value: preset.skyZenith.clone() },
      uHorizon: { value: preset.skyHorizon.clone() },
      uSunGlow: { value: preset.skySunGlow.clone() }
    };

    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms,
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunGlow;
        varying vec3 vWorldDir;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uZenith, pow(h, 0.52));

          // Mie solar scattering & crisp sun disc
          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          col += uSunGlow * pow(sunDot, 7.0) * 0.42;
          col += uSunGlow * smoothstep(0.9985, 0.9996, sunDot) * 1.4;

          // Subtle high wispy savannah clouds
          if (dir.y > 0.04) {
            vec2 uv = dir.xz / (dir.y + 0.18) * 1.8;
            float c = noise(uv) * 0.6 + noise(uv * 2.3 + 5.2) * 0.4;
            float cloudMask = smoothstep(0.58, 0.85, c) * smoothstep(0.04, 0.25, dir.y);
            vec3 cloudCol = mix(uHorizon * 1.06, vec3(1.0, 0.96, 0.90), 0.55);
            col = mix(col, cloudCol, cloudMask * 0.34);
          }

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return { mesh, uniforms };
  }

  function createTerrain() {
    const size = 440;
    const segs = 200;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = groundHeight(x, z);
      pos.setY(i, y);

      // Subtle natural soil/grass tonal variation
      const n = fbm2(x * 0.08 + 4.2, z * 0.08 - 3.1, 3);
      const tone = 0.88 + n * 0.14;
      colors[i * 3] = tone;
      colors[i * 3 + 1] = tone * 0.98;
      colors[i * 3 + 2] = tone * 0.92;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const tex = createSavannahGroundTexture();
    tex.repeat.set(52, 52);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  function createSavannahGrass(obstacles) {
    // Build a 3-blade grass tuft geometry
    const blades = [];
    for (let b = 0; b < 4; b++) {
      const angle = (b / 4) * Math.PI + (b % 2) * 0.4;
      const h = 0.28 + (b % 3) * 0.08;
      const w = 0.022;
      const lean = 0.06 + (b % 2) * 0.04;
      const g = new THREE.BufferGeometry();
      const cx = Math.cos(angle);
      const cz = Math.sin(angle);
      const ox = (b - 1.5) * 0.025;
      const oz = ((b * 7) % 3 - 1) * 0.025;

      const verts = new Float32Array([
        ox - cx * w, 0, oz - cz * w,
        ox + cx * w, 0, oz + cz * w,
        ox + lean * cz, h, oz - lean * cx,

        ox - cx * w * 0.5, 0, oz - cz * w * 0.5,
        ox + cx * w * 0.5, 0, oz + cz * w * 0.5,
        ox + lean * cz * 1.25, h * 0.85, oz - lean * cx * 1.25
      ]);
      const cols = new Float32Array([
        0.38, 0.30, 0.14,
        0.38, 0.30, 0.14,
        0.72, 0.58, 0.28,
        0.36, 0.28, 0.13,
        0.36, 0.28, 0.13,
        0.68, 0.55, 0.26
      ]);
      g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      g.setIndex([0, 1, 2, 3, 4, 5]);
      g.computeVertexNormals();
      blades.push(g);
    }

    const tuftGeo = THREE.BufferGeometryUtils.mergeGeometries(blades);
    const timeUniform = { value: 0 };

    const grassMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.88,
      metalness: 0.0
    });

    grassMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec4 instPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float gust = sin(uTime * 1.9 + instPos.x * 0.25 + instPos.z * 0.18) * 0.06
                       + cos(uTime * 3.1 + instPos.x * 0.5) * 0.025;
            transformed.x += gust * pow(max(0.0, position.y * 2.8), 1.4);
            transformed.z += gust * 0.45 * pow(max(0.0, position.y * 2.8), 1.4);
          #endif
          `
        );
    };

    const count = 5200;
    const mesh = new THREE.InstancedMesh(tuftGeo, grassMat, count);
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let placed = 0;
    let seed = 1;
    while (placed < count && seed < 30000) {
      seed++;
      const r = Math.sqrt(hash2(seed, 1.7)) * 68;
      const a = hash2(seed, 9.3) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;

      // Clump grass naturally using fbm
      if (fbm2(x * 0.15 + 5.1, z * 0.15 - 2.4, 2) < -0.18) continue;

      let nearTrunk = false;
      for (const obs of obstacles) {
        if (Math.hypot(x - obs.x, z - obs.z) < obs.radius + 0.6) {
          nearTrunk = true;
          break;
        }
      }
      if (nearTrunk) continue;

      const y = groundHeight(x, z);
      dummy.position.set(x, y - 0.02, z);
      dummy.rotation.set(0, hash2(seed, 4.1) * Math.PI * 2, 0);
      const sc = 0.75 + hash2(seed, 7.7) * 1.15;
      dummy.scale.set(sc, sc * (0.85 + hash2(seed, 2.2) * 0.6), sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);

      const tint = 0.85 + hash2(seed, 5.5) * 0.3;
      color.setRGB(tint, tint * 0.96, tint * 0.86);
      mesh.setColorAt(placed, color);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    return { mesh, timeUniform };
  }

  function createAcaciaFoliageTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    // Feathery tiny acacia leaflets arranged in organic clusters
    for (let i = 0; i < 420; i++) {
      const r = Math.sqrt(hash2(i, 1.3)) * 108;
      const a = hash2(i, 5.7) * Math.PI * 2;
      const cx = 128 + Math.cos(a) * r;
      const cy = 128 + Math.sin(a) * r * 0.72;
      const shade = hash2(i, 9.1);
      ctx.fillStyle = shade > 0.55
        ? 'rgba(104, 118, 56, 0.92)'
        : shade > 0.22
          ? 'rgba(78, 94, 42, 0.94)'
          : 'rgba(54, 67, 29, 0.95)';
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(hash2(i, 3.4) * Math.PI);
      ctx.beginPath();
      ctx.ellipse(0, 0, 9 + hash2(i, 2.1) * 7, 3.2 + hash2(i, 4.9) * 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  let sharedAcaciaFoliageMat = null;

  function createAcaciaTree(seed, scale = 1.0) {
    const group = new THREE.Group();

    const barkMat = new THREE.MeshStandardMaterial({
      color: 0x4b3b2e,
      roughness: 0.94,
      metalness: 0.0
    });
    if (!sharedAcaciaFoliageMat) {
      sharedAcaciaFoliageMat = new THREE.MeshStandardMaterial({
        map: createAcaciaFoliageTexture(),
        alphaTest: 0.35,
        side: THREE.DoubleSide,
        roughness: 0.88,
        metalness: 0.0
      });
    }
    const foliageMat = sharedAcaciaFoliageMat;

    // Main gnarled trunk
    const trunkH = 3.6 * scale;
    const trunkGeo = new THREE.CylinderGeometry(0.18 * scale, 0.32 * scale, trunkH, 9, 4);
    const tPos = trunkGeo.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
      const y = tPos.getY(i);
      const frac = (y + trunkH * 0.5) / trunkH;
      tPos.setX(i, tPos.getX(i) + Math.sin(frac * 3.1 + seed) * 0.14 * scale);
      tPos.setZ(i, tPos.getZ(i) + Math.cos(frac * 2.7 + seed) * 0.10 * scale);
    }
    trunkGeo.computeVertexNormals();
    const trunk = new THREE.Mesh(trunkGeo, barkMat);
    trunk.position.y = trunkH * 0.5;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    function addCanopyCluster(cx, cy, cz, radius, subSeed) {
      for (let layer = 0; layer < 4; layer++) {
        const w = radius * (1.85 - layer * 0.18);
        const cardGeo = new THREE.PlaneGeometry(w, w * 0.82, 3, 3);
        cardGeo.rotateX(-Math.PI / 2);
        const pos = cardGeo.attributes.position;
        for (let k = 0; k < pos.count; k++) {
          const px = pos.getX(k);
          const pz = pos.getZ(k);
          const dist = Math.hypot(px, pz) / (w * 0.5);
          pos.setY(k, (1 - dist * dist) * 0.22 * scale + (hash2(subSeed + k, layer) - 0.5) * 0.14 * scale);
        }
        cardGeo.computeVertexNormals();
        const card = new THREE.Mesh(cardGeo, foliageMat);
        card.position.set(
          cx + (hash2(subSeed, layer + 1) - 0.5) * 0.8 * scale,
          cy + layer * 0.16 * scale,
          cz + (hash2(subSeed, layer + 7) - 0.5) * 0.8 * scale
        );
        card.rotation.y = hash2(subSeed, layer + 13) * Math.PI * 2;
        card.castShadow = true;
        card.receiveShadow = true;
        group.add(card);
      }
    }

    // Spreading V-limbs & layered feathery flat-topped acacia canopy
    const limbCount = 5;
    for (let i = 0; i < limbCount; i++) {
      const az = (i / limbCount) * Math.PI * 2 + hash2(seed, i) * 0.6;
      const spread = (2.8 + hash2(seed, i + 10) * 1.4) * scale;
      const topY = (5.4 + hash2(seed, i + 20) * 0.85) * scale;

      const start = new THREE.Vector3(0, trunkH * 0.82, 0);
      const mid = new THREE.Vector3(
        Math.cos(az) * spread * 0.45,
        lerp(trunkH, topY, 0.58),
        Math.sin(az) * spread * 0.45
      );
      const end = new THREE.Vector3(
        Math.cos(az) * spread,
        topY,
        Math.sin(az) * spread
      );

      const curve = new THREE.CatmullRomCurve3([start, mid, end]);
      const limbGeo = new THREE.TubeGeometry(curve, 8, 0.095 * scale, 6, false);
      const limbMesh = new THREE.Mesh(limbGeo, barkMat);
      limbMesh.castShadow = true;
      group.add(limbMesh);

      addCanopyCluster(end.x, end.y, end.z, (1.8 + hash2(seed, i + 30) * 0.8) * scale, seed + i * 17);
    }

    addCanopyCluster(0, 5.85 * scale, 0, 2.7 * scale, seed + 99);

    return group;
  }

  function createDustSystem() {
    const maxParticles = 90;
    const positions = new Float32Array(maxParticles * 3);
    const alphas = new Float32Array(maxParticles);
    const particles = [];

    for (let i = 0; i < maxParticles; i++) {
      particles.push({
        active: false,
        life: 0,
        maxLife: 1,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3()
      });
      positions[i * 3 + 1] = -999;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color('#d8b98f') }
      },
      vertexShader: `
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(240.0 / -mv.z, 3.0, 26.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c) * 2.0;
          float soft = smoothstep(1.0, 0.1, d);
          gl_FragColor = vec4(uColor, soft * vAlpha * 0.38);
        }
      `
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;

    function emit(worldPos) {
      let spawned = 0;
      for (let i = 0; i < maxParticles && spawned < 4; i++) {
        const p = particles[i];
        if (!p.active) {
          p.active = true;
          p.life = 0;
          p.maxLife = 0.8 + Math.random() * 0.6;
          p.pos.set(
            worldPos.x + (Math.random() - 0.5) * 0.18,
            worldPos.y + 0.04,
            worldPos.z + (Math.random() - 0.5) * 0.18
          );
          p.vel.set(
            (Math.random() - 0.5) * 0.35 + 0.12,
            0.22 + Math.random() * 0.25,
            (Math.random() - 0.5) * 0.35
          );
          spawned++;
        }
      }
    }

    function update(dt) {
      const posAttr = geo.attributes.position;
      const alphaAttr = geo.attributes.aAlpha;
      for (let i = 0; i < maxParticles; i++) {
        const p = particles[i];
        if (p.active) {
          p.life += dt;
          if (p.life >= p.maxLife) {
            p.active = false;
            posAttr.setXYZ(i, 0, -999, 0);
            alphaAttr.setX(i, 0);
          } else {
            const t = p.life / p.maxLife;
            p.pos.addScaledVector(p.vel, dt);
            p.vel.multiplyScalar(Math.exp(-1.5 * dt));
            posAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
            alphaAttr.setX(i, Math.sin(t * Math.PI));
          }
        }
      }
      posAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
    }

    return { points, emit, update };
  }

  function createSavannahEnvironment(scene) {
    const preset = LIGHTING_PRESETS.golden;

    scene.fog = new THREE.FogExp2(preset.fogColor, preset.fogDensity);

    // Lights
    const hemiLight = new THREE.HemisphereLight(preset.hemiSky, preset.hemiGround, preset.hemiIntensity);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(preset.sunColor, preset.sunIntensity);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 60;
    const d = 12;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.025;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // Sky
    const sky = createSkyDome(preset);
    scene.add(sky.mesh);

    // Terrain
    const terrain = createTerrain();
    scene.add(terrain);

    // Acacia Trees (scenic perimeter, keeping center clear for camera inspection)
    const treePlacements = [
      { x: -16, z: 14, s: 1.15 },
      { x: 18, z: 16, s: 1.05 },
      { x: -24, z: -15, s: 1.25 },
      { x: 22, z: -18, s: 1.10 },
      { x: -6, z: 32, s: 1.35 },
      { x: 32, z: 4, s: 1.20 },
      { x: -35, z: 3, s: 1.00 },
      { x: 10, z: -36, s: 1.30 },
      { x: -28, z: 34, s: 1.40 },
      { x: 38, z: 30, s: 1.25 },
      { x: 42, z: -32, s: 1.35 },
      { x: -45, z: -35, s: 1.45 }
    ];

    const obstacles = [];
    treePlacements.forEach((tp, idx) => {
      const tree = createAcaciaTree(idx * 13 + 5, tp.s);
      tree.position.set(tp.x, groundHeight(tp.x, tp.z) - 0.12, tp.z);
      tree.rotation.y = hash2(idx, 9.1) * Math.PI * 2;
      scene.add(tree);
      obstacles.push({ x: tp.x, z: tp.z, radius: 1.4 * tp.s });
    });

    // Grass
    const grass = createSavannahGrass(obstacles);
    scene.add(grass.mesh);

    // Hoof Dust
    const dust = createDustSystem();
    scene.add(dust.points);

    function applyLighting(presetKey, renderer) {
      const p = LIGHTING_PRESETS[presetKey] || LIGHTING_PRESETS.golden;
      sunLight.color.setHex(p.sunColor);
      sunLight.intensity = p.sunIntensity;
      hemiLight.color.setHex(p.hemiSky);
      hemiLight.groundColor.setHex(p.hemiGround);
      hemiLight.intensity = p.hemiIntensity;
      scene.fog.color.setHex(p.fogColor);
      scene.fog.density = p.fogDensity;
      sky.uniforms.uSunDir.value.copy(p.sunDir);
      sky.uniforms.uZenith.value.copy(p.skyZenith);
      sky.uniforms.uHorizon.value.copy(p.skyHorizon);
      sky.uniforms.uSunGlow.value.copy(p.skySunGlow);
      if (renderer) renderer.toneMappingExposure = p.exposure;
      return p;
    }

    let currentPreset = preset;

    function update(dt, time, giraffePos, presetKey) {
      if (presetKey && LIGHTING_PRESETS[presetKey]) {
        currentPreset = LIGHTING_PRESETS[presetKey];
      }
      grass.timeUniform.value = time;
      dust.update(dt);

      // Keep sun shadow frustum centered on the giraffe as it roams!
      sunLight.position.copy(giraffePos).addScaledVector(currentPreset.sunDir, 28);
      sunLight.target.position.copy(giraffePos).add(new THREE.Vector3(0, 2.2, 0));
      sunLight.target.updateMatrixWorld();
      sky.mesh.position.copy(giraffePos);
    }

    return {
      obstacles,
      dust,
      applyLighting,
      update
    };
  }

  G.Environment = {
    LIGHTING_PRESETS,
    createSavannahEnvironment
  };
})(window);
