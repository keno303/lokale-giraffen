(function (global) {
  'use strict';

  const { mulberry32, fbm2D, smoothstep, lerp, getTerrainHeight, getTerrainNormal } = global.GiraffeMath;

  function createSavannaEnvironment(scene) {
    const rand = mulberry32(42197);
    const updaters = [];

    // ------------------------------------------------------------
    // 1. Atmospheric Sky Dome
    // ------------------------------------------------------------
    const skyUniforms = {
      uSunDir: { value: new THREE.Vector3(0.72, 0.36, -0.58).normalize() },
      uZenithColor: { value: new THREE.Color(0x2867b2) },
      uMidSkyColor: { value: new THREE.Color(0x7fb3d9) },
      uHorizonColor: { value: new THREE.Color(0xf5ca8c) },
      uSunColor: { value: new THREE.Color(0xfff2cc) },
      uTime: { value: 0 },
    };

    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: skyUniforms,
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
        uniform vec3 uZenithColor;
        uniform vec3 uMidSkyColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunColor;
        uniform float uTime;
        varying vec3 vWorldDir;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }

        float fbmCloud(vec2 p) {
          float v = 0.0;
          v += 0.52 * noise2(p);
          v += 0.28 * noise2(p * 2.1 + 4.3);
          v += 0.14 * noise2(p * 4.3 + 9.1);
          v += 0.06 * noise2(p * 8.5 + 1.7);
          return v;
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, 0.0, 1.0);
          // 3-stop luminous gradient prevents blue+orange muddy brown in mid-sky
          vec3 lowSky = mix(uHorizonColor, uMidSkyColor, smoothstep(0.0, 0.24, h));
          vec3 sky = mix(lowSky, uZenithColor, smoothstep(0.18, 0.85, h));

          // Sun glow & crisp solar disc
          float sunAmt = max(dot(dir, normalize(uSunDir)), 0.0);
          sky += uSunColor * pow(sunAmt, 10.0) * 0.28;
          sky += uSunColor * pow(sunAmt, 140.0) * 0.65;
          sky += uSunColor * smoothstep(0.9988, 0.9996, sunAmt) * 1.4;

          // Subtle wispy savanna clouds above horizon
          if (dir.y > 0.04) {
            vec2 uv = dir.xz / (dir.y + 0.20) * 1.25 + vec2(uTime * 0.008, uTime * 0.003);
            float c = fbmCloud(uv);
            float cloudMask = smoothstep(0.56, 0.80, c) * smoothstep(0.04, 0.26, dir.y);
            vec3 cloudCol = mix(vec3(0.98, 0.94, 0.88), uSunColor, 0.35 * pow(sunAmt, 2.0));
            sky = mix(sky, cloudCol, cloudMask * 0.34);
          }

          // Smooth ground-haze blend below horizon
          float below = smoothstep(0.04, -0.08, dir.y);
          sky = mix(sky, uHorizonColor * 0.94, below);

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });

    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(210, 32, 20), skyMat);
    scene.add(skyDome);

    // Distant hazy escarpment / mountain silhouette ring
    const ridgeGeo = new THREE.CylinderGeometry(165, 175, 22, 96, 2, true);
    const rPos = ridgeGeo.attributes.position;
    for (let i = 0; i < rPos.count; i++) {
      const x = rPos.getX(i);
      const y = rPos.getY(i);
      const z = rPos.getZ(i);
      if (y > 0) {
        const ang = Math.atan2(z, x);
        const h =
          3.0 +
          Math.max(0, Math.sin(ang * 3.0 + 0.4)) * 6.5 +
          Math.max(0, Math.cos(ang * 7.0 - 1.1)) * 3.2 +
          fbm2D(Math.cos(ang) * 4.0, Math.sin(ang) * 4.0, 3) * 5.0;
        rPos.setY(i, h);
      } else {
        rPos.setY(i, -6);
      }
    }
    ridgeGeo.computeVertexNormals();
    const ridgeMat = new THREE.MeshBasicMaterial({
      color: 0xc29c76,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.65,
      fog: true,
    });
    const ridgeMesh = new THREE.Mesh(ridgeGeo, ridgeMat);
    scene.add(ridgeMesh);

    // ------------------------------------------------------------
    // 2. Rolling Savanna Terrain with Micro-Detail Shader
    // ------------------------------------------------------------
    const terrainSize = 230;
    const terrainSegs = 160;
    const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegs, terrainSegs);
    terrainGeo.rotateX(-Math.PI / 2);

    const tPos = terrainGeo.attributes.position;
    const tColors = new Float32Array(tPos.count * 3);
    const normTmp = new THREE.Vector3();

    const colEarth = new THREE.Color(0x9d7048);
    const colTrail = new THREE.Color(0xb38255);
    const colDryGrass = new THREE.Color(0xb59a55);
    const colOliveScrub = new THREE.Color(0x7c7e42);
    const tmpCol = new THREE.Color();

    for (let i = 0; i < tPos.count; i++) {
      const x = tPos.getX(i);
      const z = tPos.getZ(i);
      const y = getTerrainHeight(x, z);
      tPos.setY(i, y);

      const nGrass = fbm2D(x * 0.08 + 5.3, z * 0.08 - 2.1, 3);
      const nScrub = fbm2D(x * 0.16 - 8.7, z * 0.16 + 4.4, 3);
      const r = Math.hypot(x, z);
      const pathWear = 1.0 - smoothstep(0.5, 4.2, Math.abs(r - 14.0));

      tmpCol.copy(colDryGrass);
      tmpCol.lerp(colOliveScrub, smoothstep(0.42, 0.72, nScrub) * 0.68);
      tmpCol.lerp(colEarth, smoothstep(0.55, 0.25, nGrass) * 0.75);
      tmpCol.lerp(colTrail, pathWear * 0.65);

      tColors[i * 3] = tmpCol.r;
      tColors[i * 3 + 1] = tmpCol.g;
      tColors[i * 3 + 2] = tmpCol.b;
    }

    terrainGeo.setAttribute('color', new THREE.BufferAttribute(tColors, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.0,
    });

    terrainMat.onBeforeCompile = function (shader) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vTerrainWorld;
          float tHash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }
          float tNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x),
              mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x),
              f.y
            );
          }`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            float grit = tNoise(vTerrainWorld.xz * 3.8) * 0.6 + tNoise(vTerrainWorld.xz * 14.5) * 0.4;
            float pebble = smoothstep(0.76, 0.92, tNoise(vTerrainWorld.xz * 6.2));
            diffuseColor.rgb *= (0.86 + 0.28 * grit);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.44, 0.34), pebble * 0.32);
          }`
        );
    };

    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // ------------------------------------------------------------
    // 3. Umbrella Thorn Acacia Trees (Vachellia tortilis)
    // ------------------------------------------------------------
    const barkTex = global.GiraffeShaders.createBarkTexture();
    const barkMat = new THREE.MeshStandardMaterial({
      map: barkTex,
      color: 0x8f7b66,
      roughness: 0.92,
    });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x5c6e34,
      roughness: 0.88,
      flatShading: false,
    });
    const canopyMatLight = new THREE.MeshStandardMaterial({
      color: 0x708240,
      roughness: 0.86,
    });

    function buildAcaciaTree(scale, seed) {
      const tRand = mulberry32(seed);
      const tree = new THREE.Group();

      // Main gnarled trunk curving slightly up before forking
      const trunkH = (2.6 + tRand() * 0.9) * scale;
      const forkY = trunkH * 0.68;

      const trunkGeo = new THREE.CylinderGeometry(0.18 * scale, 0.30 * scale, forkY, 10, 4);
      const tp = trunkGeo.attributes.position;
      for (let i = 0; i < tp.count; i++) {
        const y = tp.getY(i);
        const t = (y + forkY * 0.5) / forkY;
        tp.setX(i, tp.getX(i) + Math.sin(t * 3.0) * 0.08 * scale);
      }
      trunkGeo.computeVertexNormals();
      const trunk = new THREE.Mesh(trunkGeo, barkMat);
      trunk.position.y = forkY * 0.5;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      tree.add(trunk);

      // Spreading primary limbs forming flat umbrella silhouette
      const limbCount = 5 + Math.floor(tRand() * 3);
      for (let b = 0; b < limbCount; b++) {
        const ang = (b / limbCount) * Math.PI * 2 + (tRand() - 0.5) * 0.45;
        const spread = (2.4 + tRand() * 1.4) * scale;
        const topY = trunkH + (0.9 + tRand() * 0.6) * scale;

        const p0 = new THREE.Vector3(0, forkY * 0.92, 0);
        const p1 = new THREE.Vector3(
          Math.cos(ang) * spread * 0.45,
          lerp(forkY, topY, 0.55),
          Math.sin(ang) * spread * 0.45
        );
        const p2 = new THREE.Vector3(Math.cos(ang) * spread, topY, Math.sin(ang) * spread);

        const branchCurve = new THREE.CatmullRomCurve3([p0, p1, p2]);
        const branchGeo = new THREE.TubeGeometry(branchCurve, 8, 0.095 * scale, 7, false);
        // Taper branch toward tip
        const bp = branchGeo.attributes.position;
        for (let i = 0; i < bp.count; i++) {
          const v = new THREE.Vector3(bp.getX(i), bp.getY(i), bp.getZ(i));
          const dist = Math.hypot(v.x, v.z) / Math.max(0.1, spread);
          const centerOnCurve = branchCurve.getPoint(Math.min(1, dist));
          v.sub(centerOnCurve).multiplyScalar(lerp(1.3, 0.35, dist)).add(centerOnCurve);
          bp.setXYZ(i, v.x, v.y, v.z);
        }
        branchGeo.computeVertexNormals();
        const branch = new THREE.Mesh(branchGeo, barkMat);
        branch.castShadow = true;
        tree.add(branch);

        // Flat layered acacia foliage discs at branch ends (watertight position-based organic shape)
        const padCount = 2 + Math.floor(tRand() * 2);
        for (let p = 0; p < padCount; p++) {
          const rx = (1.15 + tRand() * 0.75) * scale;
          const ry = (0.24 + tRand() * 0.10) * scale;
          const padGeo = new THREE.SphereGeometry(1, 16, 10);
          padGeo.scale(rx, ry, rx * (0.85 + tRand() * 0.25));
          const pp = padGeo.attributes.position;
          const seedOff = b * 3.1 + p * 7.3;
          for (let k = 0; k < pp.count; k++) {
            const vx = pp.getX(k);
            const vy = pp.getY(k);
            const vz = pp.getZ(k);
            const wave = Math.sin(vx * 2.4 + seedOff) * Math.cos(vz * 2.1 - seedOff) * 0.08 * scale;
            pp.setY(k, vy + wave);
          }
          padGeo.computeVertexNormals();
          const pad = new THREE.Mesh(padGeo, (b + p) % 2 === 0 ? canopyMat : canopyMatLight);
          pad.position.set(
            p2.x + (tRand() - 0.5) * 0.9 * scale,
            p2.y + (tRand() - 0.3) * 0.22 * scale,
            p2.z + (tRand() - 0.5) * 0.9 * scale
          );
          pad.castShadow = true;
          pad.receiveShadow = true;
          tree.add(pad);
        }
      }

      // Central crown pad
      const centerPadGeo = new THREE.SphereGeometry(1, 18, 10);
      centerPadGeo.scale(1.9 * scale, 0.30 * scale, 1.8 * scale);
      const centerPad = new THREE.Mesh(centerPadGeo, canopyMatLight);
      centerPad.position.set(0, trunkH + 1.32 * scale, 0);
      centerPad.castShadow = true;
      centerPad.receiveShadow = true;
      tree.add(centerPad);

      return tree;
    }

    // Curated & procedural tree placements avoiding walking corridor (radius ~ 10.5..18m)
    const treePlacements = [
      // Inner savanna grove (giraffe walks gracefully around this!)
      [0.8, 0.5, 1.25],
      [-3.2, 2.8, 0.95],
      // Outer savanna ring
      [23, 14, 1.35],
      [-24, 16, 1.42],
      [25, -18, 1.28],
      [-22, -20, 1.50],
      [6, 26, 1.32],
      [-8, -26, 1.20],
      [34, 2, 1.55],
      [-35, -3, 1.38],
      [18, 33, 1.45],
      [-28, 32, 1.25],
      [32, -32, 1.48],
      [-36, -28, 1.60],
      [48, 22, 1.55],
      [-48, 18, 1.65],
      [45, -24, 1.50],
      [-44, -36, 1.45],
    ];

    for (let i = 0; i < treePlacements.length; i++) {
      const [tx, tz, sc] = treePlacements[i];
      const tree = buildAcaciaTree(sc, 1000 + i * 73);
      tree.position.set(tx, getTerrainHeight(tx, tz) - 0.08, tz);
      tree.rotation.y = rand() * Math.PI * 2;
      scene.add(tree);
    }

    // ------------------------------------------------------------
    // 4. Scattered Savanna Rocks / Kopje Boulders
    // ------------------------------------------------------------
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x7e6d5d,
      roughness: 0.92,
      flatShading: true,
    });

    for (let i = 0; i < 28; i++) {
      const ang = rand() * Math.PI * 2;
      const dist = rand() < 0.25 ? 2.5 + rand() * 5.0 : 19.5 + rand() * 38.0;
      const rx = Math.cos(ang) * dist;
      const rz = Math.sin(ang) * dist;
      const size = 0.35 + rand() * 0.95;

      const rockGeo = new THREE.DodecahedronGeometry(size, 1);
      const rp = rockGeo.attributes.position;
      for (let k = 0; k < rp.count; k++) {
        rp.setXYZ(
          k,
          rp.getX(k) * (0.85 + rand() * 0.3),
          rp.getY(k) * (0.55 + rand() * 0.25),
          rp.getZ(k) * (0.85 + rand() * 0.3)
        );
      }
      rockGeo.computeVertexNormals();
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(rx, getTerrainHeight(rx, rz) + size * 0.16, rz);
      rock.rotation.set(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4);
      rock.castShadow = true;
      rock.receiveShadow = true;
      scene.add(rock);
    }

    // ------------------------------------------------------------
    // 5. Wind-Animated Instanced Savanna Grass Tufts
    // ------------------------------------------------------------
    // Build a multi-blade grass tuft geometry (5 crossed tapered blades)
    function createGrassTuftGeometry() {
      const positions = [];
      const normals = [];
      const colors = [];
      const indices = [];

      const bladeCount = 6;
      for (let b = 0; b < bladeCount; b++) {
        const ang = (b / bladeCount) * Math.PI * 2 + (b % 2) * 0.25;
        const lean = 0.14 + (b % 3) * 0.08;
        const h = 0.42 + (b % 2) * 0.14;
        const w = 0.036;

        const cx = Math.cos(ang) * 0.05;
        const cz = Math.sin(ang) * 0.05;
        const tx = Math.sin(ang) * w;
        const tz = -Math.cos(ang) * w;

        const baseIdx = positions.length / 3;
        // Bottom 2 verts, mid 2 verts, tip 1 vert
        positions.push(cx - tx, 0, cz - tz);
        positions.push(cx + tx, 0, cz + tz);
        positions.push(cx - tx * 0.55 + Math.cos(ang) * lean * 0.4, h * 0.55, cz - tz * 0.55 + Math.sin(ang) * lean * 0.4);
        positions.push(cx + tx * 0.55 + Math.cos(ang) * lean * 0.4, h * 0.55, cz + tz * 0.55 + Math.sin(ang) * lean * 0.4);
        positions.push(cx + Math.cos(ang) * lean, h, cz + Math.sin(ang) * lean);

        for (let k = 0; k < 5; k++) {
          normals.push(0, 1, 0);
        }
        // Dark olive base -> sunlit golden straw tip
        colors.push(0.32, 0.30, 0.14);
        colors.push(0.32, 0.30, 0.14);
        colors.push(0.62, 0.54, 0.24);
        colors.push(0.62, 0.54, 0.24);
        colors.push(0.82, 0.72, 0.34);

        indices.push(baseIdx, baseIdx + 1, baseIdx + 3);
        indices.push(baseIdx, baseIdx + 3, baseIdx + 2);
        indices.push(baseIdx + 2, baseIdx + 3, baseIdx + 4);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    }

    const grassUniforms = { uTime: { value: 0 } };
    const grassGeo = createGrassTuftGeometry();
    const grassMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      side: THREE.DoubleSide,
    });

    grassMat.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = grassUniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec4 instOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float hFrac = clamp(position.y / 0.55, 0.0, 1.0);
            float gust = sin(uTime * 1.8 + instOrigin.x * 0.22 + instOrigin.z * 0.18)
                       + 0.45 * sin(uTime * 3.3 + instOrigin.x * 0.55 - instOrigin.z * 0.42);
            transformed.x += gust * 0.08 * hFrac * hFrac;
            transformed.z += gust * 0.04 * hFrac * hFrac;
          #endif`
        );
    };

    const grassCount = 4200;
    const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
    grassMesh.receiveShadow = true;
    const dummy = new THREE.Object3D();
    const tintCol = new THREE.Color();

    let placed = 0;
    let attempts = 0;
    while (placed < grassCount && attempts < grassCount * 4) {
      attempts++;
      const r = Math.sqrt(rand()) * 58;
      const theta = rand() * Math.PI * 2;
      const gx = Math.cos(theta) * r;
      const gz = Math.sin(theta) * r;

      // Leave slightly clearer worn walking trail around r ~ 14m
      const distTrail = Math.abs(r - 14.0);
      if (distTrail < 1.35 && rand() < 0.78) continue;

      const gy = getTerrainHeight(gx, gz);
      getTerrainNormal(gx, gz, normTmp);

      dummy.position.set(gx, gy - 0.02, gz);
      dummy.rotation.set((rand() - 0.5) * 0.14, rand() * Math.PI * 2, (rand() - 0.5) * 0.14);
      const sc = 0.65 + rand() * 0.95;
      dummy.scale.set(sc, sc * (0.75 + rand() * 0.6), sc);
      dummy.updateMatrix();
      grassMesh.setMatrixAt(placed, dummy.matrix);

      const dryMix = 0.8 + rand() * 0.35;
      tintCol.setRGB(dryMix, dryMix * (0.94 + rand() * 0.1), dryMix * 0.82);
      grassMesh.setColorAt(placed, tintCol);
      placed++;
    }
    grassMesh.count = placed;
    grassMesh.instanceMatrix.needsUpdate = true;
    if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
    scene.add(grassMesh);

    // ------------------------------------------------------------
    // 6. Hoof Dust Puff Particle System
    // ------------------------------------------------------------
    const dustMax = 80;
    const dustParticles = [];
    const dustGroup = new THREE.Group();
    const dustGeo = new THREE.SphereGeometry(0.14, 7, 6);
    for (let i = 0; i < dustMax; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xd9b892,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const m = new THREE.Mesh(dustGeo, mat);
      m.visible = false;
      dustGroup.add(m);
      dustParticles.push({
        mesh: m,
        mat,
        vel: new THREE.Vector3(),
        age: 99,
        life: 1,
      });
    }
    scene.add(dustGroup);
    let dustCursor = 0;

    function spawnHoofDust(worldPos) {
      for (let k = 0; k < 2; k++) {
        const p = dustParticles[dustCursor];
        dustCursor = (dustCursor + 1) % dustMax;
        p.age = 0;
        p.life = 0.75 + Math.random() * 0.45;
        p.mesh.position.set(
          worldPos.x + (Math.random() - 0.5) * 0.18,
          worldPos.y + 0.06,
          worldPos.z + (Math.random() - 0.5) * 0.18
        );
        p.mesh.scale.setScalar(0.45 + Math.random() * 0.35);
        p.vel.set(
          0.35 + (Math.random() - 0.5) * 0.4,
          0.22 + Math.random() * 0.25,
          (Math.random() - 0.5) * 0.4
        );
        p.mesh.visible = true;
      }
    }

    // ------------------------------------------------------------
    // 7. Time-of-Day Presets (Lights + Sky + Fog)
    // ------------------------------------------------------------
    const hemiLight = new THREE.HemisphereLight(0xffe7c4, 0x705336, 0.75);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffdfb0, 2.8);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 75;
    sunLight.shadow.camera.left = -14;
    sunLight.shadow.camera.right = 14;
    sunLight.shadow.camera.top = 14;
    sunLight.shadow.camera.bottom = -14;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.025;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const sunOffset = new THREE.Vector3(24, 12, -20);

    function setTimeOfDay(preset) {
      if (preset === 'midday') {
        sunOffset.set(16, 34, -12);
        sunLight.color.setHex(0xfff8ea);
        sunLight.intensity = 3.1;
        hemiLight.color.setHex(0xcce6ff);
        hemiLight.groundColor.setHex(0x886c48);
        hemiLight.intensity = 0.9;
        skyUniforms.uZenithColor.value.setHex(0x1f62b5);
        skyUniforms.uMidSkyColor.value.setHex(0x7ab4e2);
        skyUniforms.uHorizonColor.value.setHex(0xd4e2eb);
        skyUniforms.uSunColor.value.setHex(0xffffff);
        ridgeMat.color.setHex(0x9fb2bf);
        scene.fog.color.setHex(0xd6e1e6);
        scene.fog.density = 0.0068;
      } else if (preset === 'dusk') {
        sunOffset.set(30, 6.5, -24);
        sunLight.color.setHex(0xff8e47);
        sunLight.intensity = 2.4;
        hemiLight.color.setHex(0x8b6a88);
        hemiLight.groundColor.setHex(0x463022);
        hemiLight.intensity = 0.68;
        skyUniforms.uZenithColor.value.setHex(0x182144);
        skyUniforms.uMidSkyColor.value.setHex(0x70506d);
        skyUniforms.uHorizonColor.value.setHex(0xe57e4c);
        skyUniforms.uSunColor.value.setHex(0xffa85a);
        ridgeMat.color.setHex(0x8a544a);
        scene.fog.color.setHex(0xd98358);
        scene.fog.density = 0.0092;
      } else {
        // Golden Hour (default)
        sunOffset.set(26, 13.5, -21);
        sunLight.color.setHex(0xffd79e);
        sunLight.intensity = 2.95;
        hemiLight.color.setHex(0xffe1b8);
        hemiLight.groundColor.setHex(0x725236);
        hemiLight.intensity = 0.78;
        skyUniforms.uZenithColor.value.setHex(0x2867b2);
        skyUniforms.uMidSkyColor.value.setHex(0x7fb3d9);
        skyUniforms.uHorizonColor.value.setHex(0xf3c68a);
        skyUniforms.uSunColor.value.setHex(0xfff0c4);
        ridgeMat.color.setHex(0xc29a72);
        scene.fog.color.setHex(0xeac08c);
        scene.fog.density = 0.0072;
      }
      skyUniforms.uSunDir.value.copy(sunOffset).normalize();
    }

    scene.fog = new THREE.FogExp2(0xe8ba86, 0.0078);
    setTimeOfDay('golden');

    function update(dt, elapsed, giraffePos) {
      skyUniforms.uTime.value = elapsed;
      grassUniforms.uTime.value = elapsed;

      // Dynamic shadow frustum tracking the giraffe for razor-sharp shadows everywhere on the loop
      sunLight.target.position.set(giraffePos.x, giraffePos.y + 2.2, giraffePos.z);
      sunLight.position.copy(sunLight.target.position).add(sunOffset);
      sunLight.target.updateMatrixWorld();

      // Update dust particles
      for (let i = 0; i < dustMax; i++) {
        const p = dustParticles[i];
        if (p.age < p.life) {
          p.age += dt;
          const f = p.age / p.life;
          p.mesh.position.addScaledVector(p.vel, dt);
          p.vel.multiplyScalar(1 - dt * 1.8);
          p.mesh.scale.addScalar(dt * 1.1);
          p.mat.opacity = Math.sin(f * Math.PI) * 0.24;
          if (p.age >= p.life) {
            p.mesh.visible = false;
            p.mat.opacity = 0;
          }
        }
      }
    }

    return {
      update,
      spawnHoofDust,
      setTimeOfDay,
      sunLight,
    };
  }

  global.SavannaEnv = {
    createSavannaEnvironment,
  };
})(window);
