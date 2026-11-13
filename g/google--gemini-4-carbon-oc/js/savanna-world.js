(function () {
  'use strict';

  const {
    mulberry32,
    clamp,
    lerp,
    smoothstep,
    fbm2D
  } = window.GiraffeMath;

  function createSavannaWorld(scene, renderer) {
    const worldGroup = new THREE.Group();
    worldGroup.name = 'SavannaWorld';
    scene.add(worldGroup);

    const trailRadius = 46.0;

    /**
     * Exact signed/unsigned distance approximation to the giraffe's trail loop
     * centered near (0, -trailRadius - 1.4), so trail passes near (0, 0) at s=0.
     */
    function getTrailProximity(x, z) {
      // Invert theta = atan2(x, z + R + 1.4) for one-step closest point on trail curve
      const zRel = z + trailRadius + 1.4;
      const theta = Math.atan2(x, zRel);
      const tx = Math.sin(theta) * trailRadius + Math.sin(theta * 3.0) * 1.8;
      const tz = (Math.cos(theta) - 1.0) * trailRadius + Math.cos(theta * 2.0) * 1.4 - 1.4;
      return Math.hypot(x - tx, z - tz);
    }

    const waterBasins = [
      { cx: -14.5, cz: 31.0, rx: 11.5, rz: 7.0, depth: 0.55 },
      { cx: -18.0, cz: -34.0, rx: 12.5, rz: 8.2, depth: 0.58 }
    ];

    function getBasinFactor(x, z) {
      let f = 0.0;
      for (let i = 0; i < waterBasins.length; i++) {
        const b = waterBasins[i];
        const nd = Math.hypot((x - b.cx) / b.rx, (z - b.cz) / b.rz);
        const bowl = Math.max(0.0, 1.0 - nd * nd);
        f = Math.max(f, bowl * bowl * b.depth);
      }
      return f;
    }

    /**
     * Continuous savanna terrain heightfield y(x, z) in meters.
     */
    function getGroundHeight(x, z) {
      const dTrail = getTrailProximity(x, z);
      const gentleRoll = fbm2D(x * 0.018, z * 0.018, 3) * 0.32;
      const midDetail = fbm2D(x * 0.065 + 11.3, z * 0.065 - 7.1, 3) * 0.09;
      const outerHills = smoothstep(14.0, 95.0, dTrail) * (
        Math.max(0, fbm2D(x * 0.011 - 4.2, z * 0.011 + 9.8, 4)) * 7.5 +
        fbm2D(x * 0.025, z * 0.025, 3) * 1.4
      );
      const onPathSmooth = smoothstep(0.6, 4.5, dTrail);
      const baseH = gentleRoll * (0.45 + 0.55 * onPathSmooth) + midDetail * onPathSmooth + outerHills;
      return baseH - getBasinFactor(x, z);
    }

    function isInsideWater(x, z) {
      for (let i = 0; i < waterBasins.length; i++) {
        const b = waterBasins[i];
        const baseCenter = getGroundHeight(b.cx, b.cz) + b.depth;
        const waterY = baseCenter - 0.20;
        if (Math.hypot((x - b.cx) / (b.rx * 1.05), (z - b.cz) / (b.rz * 1.05)) < 1.0 && getGroundHeight(x, z) < waterY + 0.04) {
          return true;
        }
      }
      return false;
    }

    // =========================================================================
    // 1. SKY, ATMOSPHERE, PMREM ENVIRONMENT & TEXEL-SNAPPED SUNLIGHT
    // =========================================================================
    const sky = new THREE.Sky();
    sky.scale.setScalar(1800);
    worldGroup.add(sky);

    const sunDir = new THREE.Vector3();
    const hemiLight = new THREE.HemisphereLight(0xdbeaff, 0xb88652, 0.72);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff0d6, 3.35);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    const shadowHalfExtent = 4.6;
    sunLight.shadow.camera.left = -shadowHalfExtent;
    sunLight.shadow.camera.right = shadowHalfExtent;
    sunLight.shadow.camera.top = shadowHalfExtent;
    sunLight.shadow.camera.bottom = -shadowHalfExtent;
    sunLight.shadow.camera.near = 1.0;
    sunLight.shadow.camera.far = 34.0;
    sunLight.shadow.bias = -0.00035;
    sunLight.shadow.normalBias = 0.014;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // Warm rim/fill bounce light from sunlit savanna dust opposite the sun
    const fillLight = new THREE.DirectionalLight(0xffd7a3, 0.55);
    scene.add(fillLight);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    let currentEnvRT = null;

    const lightingPresets = {
      golden: {
        elevation: 19.5,
        azimuth: 132.0,
        turbidity: 5.8,
        rayleigh: 1.85,
        mieCoefficient: 0.006,
        mieDirectionalG: 0.82,
        sunColor: 0xffdfad,
        sunIntensity: 3.45,
        hemiSky: 0xdce8ff,
        hemiGround: 0xc08850,
        hemiIntensity: 0.74,
        fogColor: 0xdcc7a6,
        fogDensity: 0.0024,
        exposure: 1.02
      },
      morning: {
        elevation: 31.0,
        azimuth: 112.0,
        turbidity: 3.8,
        rayleigh: 1.35,
        mieCoefficient: 0.004,
        mieDirectionalG: 0.78,
        sunColor: 0xfff1d6,
        sunIntensity: 3.55,
        hemiSky: 0xcfe5ff,
        hemiGround: 0xba8d5b,
        hemiIntensity: 0.82,
        fogColor: 0xd8dfd8,
        fogDensity: 0.0019,
        exposure: 0.98
      },
      midday: {
        elevation: 56.0,
        azimuth: 155.0,
        turbidity: 2.9,
        rayleigh: 1.05,
        mieCoefficient: 0.003,
        mieDirectionalG: 0.75,
        sunColor: 0xfff8eb,
        sunIntensity: 3.70,
        hemiSky: 0xc5e2ff,
        hemiGround: 0xc79b66,
        hemiIntensity: 0.90,
        fogColor: 0xdbe3e8,
        fogDensity: 0.0015,
        exposure: 0.92
      }
    };

    scene.fog = new THREE.FogExp2(0xdcc7a6, 0.0024);

    function setLightingPreset(name) {
      const p = lightingPresets[name] || lightingPresets.golden;
      const su = sky.material.uniforms;
      su.turbidity.value = p.turbidity;
      su.rayleigh.value = p.rayleigh;
      su.mieCoefficient.value = p.mieCoefficient;
      su.mieDirectionalG.value = p.mieDirectionalG;

      const phi = THREE.MathUtils.degToRad(90 - p.elevation);
      const theta = THREE.MathUtils.degToRad(p.azimuth);
      sunDir.setFromSphericalCoords(1, phi, theta);
      su.sunPosition.value.copy(sunDir);

      sunLight.color.setHex(p.sunColor);
      sunLight.intensity = p.sunIntensity;
      hemiLight.color.setHex(p.hemiSky);
      hemiLight.groundColor.setHex(p.hemiGround);
      hemiLight.intensity = p.hemiIntensity;

      fillLight.position.set(-sunDir.x * 15, 4.5, -sunDir.z * 15);
      scene.fog.color.setHex(p.fogColor);
      scene.fog.density = p.fogDensity;
      renderer.toneMappingExposure = p.exposure;

      // Bake sky + warm savanna ground hemisphere into PMREM environment for realistic eye & coat reflections
      const envScene = new THREE.Scene();
      const envSky = new THREE.Sky();
      envSky.scale.setScalar(100);
      envSky.material.uniforms.turbidity.value = p.turbidity;
      envSky.material.uniforms.rayleigh.value = p.rayleigh;
      envSky.material.uniforms.mieCoefficient.value = p.mieCoefficient;
      envSky.material.uniforms.mieDirectionalG.value = p.mieDirectionalG;
      envSky.material.uniforms.sunPosition.value.copy(sunDir);
      envScene.add(envSky);

      const groundBounceGeo = new THREE.SphereGeometry(40, 16, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
      const groundBounceMat = new THREE.MeshBasicMaterial({ color: p.hemiGround, side: THREE.BackSide });
      envScene.add(new THREE.Mesh(groundBounceGeo, groundBounceMat));

      const nextRT = pmremGenerator.fromScene(envScene, 0.03);
      if (currentEnvRT) currentEnvRT.dispose();
      currentEnvRT = nextRT;
      scene.environment = currentEnvRT.texture;
      scene.environmentIntensity = 0.52;
    }

    setLightingPreset('golden');

    // =========================================================================
    // 2. SAVANNA TERRAIN MESH WITH PROCEDURAL SANDY TRAIL & RED-OCHRE SOIL SHADER
    // =========================================================================
    (function buildTerrainMesh() {
      const size = 480;
      const segs = 280;
      const geo = new THREE.PlaneGeometry(size, size, segs, segs);
      geo.rotateX(-Math.PI / 2);

      const pos = geo.attributes.position;
      const trailAttr = new Float32Array(pos.count);

      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vz = pos.getZ(i);
        const vy = getGroundHeight(vx, vz);
        pos.setY(i, vy);
        const dTrail = getTrailProximity(vx, vz);
        // Darken/moisten shoreline mud around watering basins via negativeencoding or separate blend:
        const basinMud = clamp(getBasinFactor(vx, vz) * 2.8, 0.0, 1.0);
        trailAttr[i] = clamp((1.0 - smoothstep(0.95, 2.85, dTrail)) + basinMud * 0.75, 0.0, 1.0);
      }
      geo.setAttribute('aTrailMask', new THREE.BufferAttribute(trailAttr, 1));
      geo.computeVertexNormals();

      const terrainMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.93,
        metalness: 0.0
      });

      terrainMat.onBeforeCompile = function (shader) {
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
            attribute float aTrailMask;
            varying float vTrailMask;
            varying vec3 vTerrainWorld;`
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vTrailMask = aTrailMask;
            vTerrainWorld = position;`
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
            varying float vTrailMask;
            varying vec3 vTerrainWorld;
            float tHash(vec2 p) {
              return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
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
            }
            float tFbm(vec2 p) {
              float s = 0.0;
              float a = 0.5;
              for (int i = 0; i < 4; i++) {
                s += a * tNoise(p);
                p = p * 2.07 + vec2(13.1, 7.7);
                a *= 0.5;
              }
              return s;
            }`
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            vec2 wp = vTerrainWorld.xz;
            float macro = tFbm(wp * 0.08);
            float mid = tFbm(wp * 0.75);
            float grit = tNoise(wp * 18.0) * 0.6 + tNoise(wp * 46.0) * 0.4;

            // Sun-baked sandy red-ochre game trail vs dry savanna grass/humus soil
            vec3 trailSand = mix(vec3(0.56, 0.39, 0.23), vec3(0.68, 0.51, 0.33), mid);
            vec3 savannaSoil = mix(vec3(0.36, 0.28, 0.16), vec3(0.47, 0.39, 0.22), macro);
            savannaSoil = mix(savannaSoil, vec3(0.31, 0.30, 0.16), smoothstep(0.45, 0.80, macro) * 0.55);

            vec3 groundCol = mix(savannaSoil, trailSand, vTrailMask);
            groundCol *= (0.86 + 0.28 * grit);
            diffuseColor.rgb *= groundCol;
            float soilBump = (grit - 0.5) * 0.009 + (mid - 0.5) * 0.015;`
          )
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
            {
              vec3 dPdx = dFdx(vViewPosition);
              vec3 dPdy = dFdy(vViewPosition);
              float dHdx = dFdx(soilBump);
              float dHdy = dFdy(soilBump);
              vec3 r1 = cross(dPdy, normal);
              vec3 r2 = cross(normal, dPdx);
              float det = dot(dPdx, r1);
              if (abs(det) > 1e-10) {
                vec3 grad = sign(det) * (dHdx * r1 + dHdy * r2);
                normal = normalize(abs(det) * normal - grad * 0.85);
              }
            }`
          );
      };

      const terrain = new THREE.Mesh(geo, terrainMat);
      terrain.receiveShadow = true;
      worldGroup.add(terrain);
    })();

    // =========================================================================
    // 3. SWAYING GOLDEN SAVANNA GRASS (42,000 INSTANCED BLADES WITH WIND SHADER)
    // =========================================================================
    const grassUniforms = {
      uTime: { value: 0.0 }
    };

    (function buildSavannaGrass() {
      const rand = mulberry32(42077);
      const bladeCount = 42000;

      // 3-blade fanning savanna tussock geometry (= 126,000 swaying grass blades across 42,000 instances!)
      const segs = 4;
      const pos = [];
      const uvs = [];
      const idx = [];
      const subBlades = [
        { ox: 0.00, oz: 0.00, yaw: 0.0,   hScale: 1.00, droop: 0.12 },
        { ox: 0.03, oz: 0.02, yaw: 2.15,  hScale: 0.84, droop: 0.15 },
        { ox: -0.03, oz: 0.02, yaw: 4.25, hScale: 0.74, droop: 0.14 }
      ];
      for (let sb = 0; sb < subBlades.length; sb++) {
        const bSpec = subBlades[sb];
        const cy = Math.cos(bSpec.yaw);
        const sy = Math.sin(bSpec.yaw);
        const baseV = pos.length / 3;
        for (let i = 0; i <= segs; i++) {
          const t = i / segs;
          const w = 0.017 * (1.0 - t * 0.92);
          const y = t * 0.62 * bSpec.hScale;
          const dz = t * t * bSpec.droop;
          const lx0 = -w * cy - dz * sy + bSpec.ox;
          const lz0 = -w * sy + dz * cy + bSpec.oz;
          const lx1 =  w * cy - dz * sy + bSpec.ox;
          const lz1 =  w * sy + dz * cy + bSpec.oz;
          pos.push(lx0, y, lz0, lx1, y, lz1);
          uvs.push(0, t, 1, t);
        }
        for (let i = 0; i < segs; i++) {
          const a = baseV + i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const bladeGeo = new THREE.BufferGeometry();
      bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      bladeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      bladeGeo.setIndex(idx);
      bladeGeo.computeVertexNormals();

      const grassMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.82,
        metalness: 0.0,
        side: THREE.DoubleSide
      });

      grassMat.onBeforeCompile = function (shader) {
        shader.uniforms.uTime = grassUniforms.uTime;
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
            uniform float uTime;
            attribute vec3 aGrassTint;
            varying float vBladeH;
            varying vec3 vGrassTint;`
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vBladeH = uv.y;
            vGrassTint = aGrassTint;
            vec3 instWorld = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            float gust = sin(uTime * 1.85 + instWorld.x * 0.18 + instWorld.z * 0.14)
                       + 0.45 * sin(uTime * 3.7 + instWorld.x * 0.55 - instWorld.z * 0.42);
            float bend = vBladeH * vBladeH * 0.11 * gust;
            transformed.x += bend;
            transformed.z += bend * 0.65;`
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
            varying float vBladeH;
            varying vec3 vGrassTint;`
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            // Darker earthy olive base -> sunlit golden straw tip!
            vec3 rootC = vGrassTint * 0.48;
            vec3 tipC  = mix(vGrassTint * 1.18, vec3(0.84, 0.72, 0.42), 0.45);
            diffuseColor.rgb *= mix(rootC, tipC, smoothstep(0.05, 0.92, vBladeH));`
          );
      };

      const instMesh = new THREE.InstancedMesh(bladeGeo, grassMat, bladeCount);
      instMesh.receiveShadow = true;
      instMesh.castShadow = false;

      const dummy = new THREE.Object3D();
      const tints = new Float32Array(bladeCount * 3);
      let placed = 0;
      let attempts = 0;

      // Distribute densely in bands bordering the entire savanna loop & inner meadow
      while (placed < bladeCount && attempts < bladeCount * 5) {
        attempts++;
        // Sample around loop + wider savanna plain
        let gx, gz;
        if (placed < bladeCount * 0.72) {
          // Concentrated near the giraffe's walking loop (1.35m .. 22m off the trail)
          const th = rand() * Math.PI * 2.0;
          const baseTx = Math.sin(th) * trailRadius + Math.sin(th * 3.0) * 1.8;
          const baseTz = (Math.cos(th) - 1.0) * trailRadius + Math.cos(th * 2.0) * 1.4 - 1.4;
          const sideSign = rand() < 0.5 ? -1 : 1;
          const offsetR = 1.35 + Math.pow(rand(), 1.55) * 24.0;
          const radialAngle = th + (rand() - 0.5) * 0.25;
          gx = baseTx + Math.sin(radialAngle) * sideSign * offsetR;
          gz = baseTz + Math.cos(radialAngle) * sideSign * offsetR;
        } else {
          gx = (rand() - 0.5) * 190.0;
          gz = (rand() - 0.5) * 190.0 - 46.0;
        }

        const dTrail = getTrailProximity(gx, gz);
        if (dTrail < 1.32 || isInsideWater(gx, gz)) continue;

        // Natural clumping via noise
        const clump = fbm2D(gx * 0.22, gz * 0.22, 2);
        if (clump < -0.26 && rand() < 0.65) continue;

        const gy = getGroundHeight(gx, gz);
        const edgeShorten = smoothstep(1.32, 2.8, dTrail);
        const scaleH = (0.55 + rand() * 0.85 + Math.max(0, clump) * 0.55) * (0.45 + 0.55 * edgeShorten);
        const scaleW = 0.8 + rand() * 0.6;

        dummy.position.set(gx, gy - 0.02, gz);
        dummy.rotation.set((rand() - 0.5) * 0.22, rand() * Math.PI * 2.0, (rand() - 0.5) * 0.22);
        dummy.scale.set(scaleW, scaleH, scaleW);
        dummy.updateMatrix();
        instMesh.setMatrixAt(placed, dummy.matrix);

        // Dry golden straw + warm olive savanna grass variations
        const greenness = clamp(0.35 + clump * 0.45 + (rand() - 0.5) * 0.25, 0.0, 1.0);
        tints[placed * 3 + 0] = lerp(0.66, 0.44, greenness);
        tints[placed * 3 + 1] = lerp(0.53, 0.45, greenness);
        tints[placed * 3 + 2] = lerp(0.26, 0.18, greenness);
        placed++;
      }

      instMesh.count = placed;
      bladeGeo.setAttribute('aGrassTint', new THREE.InstancedBufferAttribute(tints, 3));
      instMesh.instanceMatrix.needsUpdate = true;
      worldGroup.add(instMesh);
    })();

    // =========================================================================
    // 4. ICONIC UMBRELLA THORN ACACIA TREES, BOULDERS & DISTANT RIFT ESCARPMENT
    // =========================================================================
    (function buildAcaciasAndRocks() {
      const rand = mulberry32(90813);

      const barkMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.94,
        metalness: 0.0
      });
      barkMat.onBeforeCompile = function (shader) {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vBarkPos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBarkPos = position;');
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
            varying vec3 vBarkPos;
            float bkHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float bkNoise(vec2 p) {
              vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
              return mix(mix(bkHash(i), bkHash(i + vec2(1,0)), f.x), mix(bkHash(i + vec2(0,1)), bkHash(i + vec2(1,1)), f.x), f.y);
            }`
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            float ang = atan(vBarkPos.z, vBarkPos.x);
            float furrow = bkNoise(vec2(ang * 9.0, vBarkPos.y * 4.5)) * 0.65
                         + bkNoise(vec2(ang * 22.0, vBarkPos.y * 12.0)) * 0.35;
            vec3 darkBark = vec3(0.085, 0.062, 0.044);
            vec3 sunBark  = vec3(0.24, 0.19, 0.145);
            diffuseColor.rgb *= mix(darkBark, sunBark, smoothstep(0.25, 0.82, furrow));`
          );
      };

      const canopyMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.88,
        metalness: 0.0,
        alphaTest: 0.25
      });

      canopyMat.onBeforeCompile = function (shader) {
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
            varying vec3 vLeafPos;
            varying vec3 vLeafNormal;`
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vLeafPos = position;
            vLeafNormal = normal;`
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
            varying vec3 vLeafPos;
            varying vec3 vLeafNormal;
            float acHash(vec3 p) {
              p = fract(p * 0.1031);
              p += dot(p, p.zyx + 31.32);
              return fract((p.x + p.y) * p.z);
            }
            float acNoise(vec3 x) {
              vec3 i = floor(x);
              vec3 f = fract(x);
              f = f * f * (3.0 - 2.0 * f);
              return mix(
                mix(
                  mix(acHash(i), acHash(i + vec3(1,0,0)), f.x),
                  mix(acHash(i + vec3(0,1,0)), acHash(i + vec3(1,1,0)), f.x),
                  f.y
                ),
                mix(
                  mix(acHash(i + vec3(0,0,1)), acHash(i + vec3(1,0,1)), f.x),
                  mix(acHash(i + vec3(0,1,1)), acHash(i + vec3(1,1,1)), f.x),
                  f.y
                ),
                f.z
              );
            }`
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            float d1 = acNoise(vLeafPos * 7.5);
            float d2 = acNoise(vLeafPos * 22.0);
            float leafCluster = d1 * 0.55 + d2 * 0.45;
            // Airy lacy umbrella acacia rim perforation
            float rimDist = length(vLeafPos.xz);
            if (rimDist > 1.35 && leafCluster < 0.34) discard;

            float topSun = clamp(vLeafNormal.y * 0.5 + 0.5, 0.0, 1.0);
            vec3 shadeOlive = vec3(0.11, 0.15, 0.055);
            vec3 sunOlive   = vec3(0.28, 0.34, 0.12);
            vec3 dryGoldTip = vec3(0.40, 0.38, 0.15);
            vec3 leafCol = mix(shadeOlive, sunOlive, topSun * 0.75 + d1 * 0.25);
            leafCol = mix(leafCol, dryGoldTip, smoothstep(0.62, 0.95, d2) * 0.45);
            diffuseColor.rgb *= leafCol;`
          );
      };

      const rockMat = new THREE.MeshStandardMaterial({
        color: 0x7c6a58,
        roughness: 0.90,
        metalness: 0.02
      });

      const termiteMat = new THREE.MeshStandardMaterial({
        color: 0x8f5532,
        roughness: 0.95,
        metalness: 0.0
      });

      function createAcaciaTree(heightScale) {
        const tree = new THREE.Group();
        const trunkH = 4.6 * heightScale;

        // Multi-forked twisted acacia trunk + spreading scaffold branches
        function addBranch(p0, p1, r0, r1) {
          const dir = new THREE.Vector3().subVectors(p1, p0);
          const len = dir.length();
          const cyl = new THREE.CylinderGeometry(r1, r0, len, 8, 1);
          const mesh = new THREE.Mesh(cyl, barkMat);
          mesh.position.copy(p0).addScaledVector(dir, 0.5);
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          tree.add(mesh);
        }

        const base = new THREE.Vector3(0, -0.1, 0);
        const fork1 = new THREE.Vector3((rand() - 0.5) * 0.4, trunkH * 0.46, (rand() - 0.5) * 0.4);
        addBranch(base, fork1, 0.28 * heightScale, 0.19 * heightScale);

        const branchCount = 5 + Math.floor(rand() * 3);
        for (let b = 0; b < branchCount; b++) {
          const ang = (b / branchCount) * Math.PI * 2.0 + (rand() - 0.5) * 0.45;
          const spread = (2.2 + rand() * 1.8) * heightScale;
          const topY = trunkH + (rand() - 0.4) * 0.45 * heightScale;
          const midPt = new THREE.Vector3(
            fork1.x + Math.cos(ang) * spread * 0.45,
            lerp(fork1.y, topY, 0.58),
            fork1.z + Math.sin(ang) * spread * 0.45
          );
          const endPt = new THREE.Vector3(
            Math.cos(ang) * spread,
            topY,
            Math.sin(ang) * spread
          );
          addBranch(fork1, midPt, 0.15 * heightScale, 0.09 * heightScale);
          addBranch(midPt, endPt, 0.09 * heightScale, 0.045 * heightScale);

          // Flat-topped Umbrella Thorn Acacia foliage pad!
          const padGeo = new THREE.IcosahedronGeometry(1.0, 3);
          const padPos = padGeo.attributes.position;
          const padW = (1.65 + rand() * 0.95) * heightScale;
          const padH = (0.28 + rand() * 0.13) * heightScale;
          for (let k = 0; k < padPos.count; k++) {
            let px = padPos.getX(k);
            let py = padPos.getY(k);
            let pz = padPos.getZ(k);
            const n = 1.0 + 0.22 * Math.sin(px * 6.0 + b) * Math.cos(pz * 6.0);
            if (py < 0) py *= 0.48;
            padPos.setXYZ(k, px * padW * n, py * padH * n, pz * padW * n);
          }
          padGeo.computeVertexNormals();
          const padMesh = new THREE.Mesh(padGeo, canopyMat);
          padMesh.position.copy(endPt).add(new THREE.Vector3(0, 0.12 * heightScale, 0));
          padMesh.castShadow = true;
          padMesh.receiveShadow = true;
          tree.add(padMesh);
        }

        // Broad central crown umbrella layer
        const crownGeo = new THREE.IcosahedronGeometry(1.0, 3);
        const cp = crownGeo.attributes.position;
        const cw = 3.1 * heightScale;
        const ch = 0.42 * heightScale;
        for (let k = 0; k < cp.count; k++) {
          let px = cp.getX(k);
          let py = cp.getY(k);
          let pz = cp.getZ(k);
          if (py < 0) py *= 0.5;
          const n = 1.0 + 0.15 * Math.cos(px * 4.3) * Math.sin(pz * 4.1);
          cp.setXYZ(k, px * cw * n, py * ch, pz * cw * n);
        }
        crownGeo.computeVertexNormals();
        const crownMesh = new THREE.Mesh(crownGeo, canopyMat);
        crownMesh.position.set(0, trunkH + 0.28 * heightScale, 0);
        crownMesh.castShadow = true;
        crownMesh.receiveShadow = true;
        tree.add(crownMesh);

        return tree;
      }

      // Place 44 scenic Umbrella Thorn Acacias in natural savanna groves safely clear of the trail
      let treesPlaced = 0;
      let tries = 0;
      while (treesPlaced < 44 && tries < 600) {
        tries++;
        const r = 16 + rand() * 125;
        const ang = rand() * Math.PI * 2.0;
        const tx = Math.cos(ang) * r;
        const tz = Math.sin(ang) * r - 46.0;
        const dTrail = getTrailProximity(tx, tz);
        if (dTrail < 7.8 || isInsideWater(tx, tz)) continue;

        if (Math.hypot(tx - 6, tz - 5) < 9.5) continue;
        // Keep the direct hero-camera backdrop corridor behind the giraffe clean so no tree sprouts from its back
        if (Math.hypot(tx + 16, tz + 14) < 11.0) continue;

        const scale = 0.72 + rand() * 0.72;
        const tree = createAcaciaTree(scale);
        tree.position.set(tx, getGroundHeight(tx, tz), tz);
        tree.rotation.y = rand() * Math.PI * 2.0;
        worldGroup.add(tree);
        treesPlaced++;
      }

      // Natural depressed-basin savanna watering holes (terrain gently slopes beneath the water surface!)
      for (const b of waterBasins) {
        const uncarvedCenter = getGroundHeight(b.cx, b.cz) + b.depth;
        const waterY = uncarvedCenter - 0.20;
        const waterGeo = new THREE.PlaneGeometry(b.rx * 2.2, b.rz * 2.2, 1, 1);
        waterGeo.rotateX(-Math.PI / 2);

        const waterMat = new THREE.MeshPhysicalMaterial({
          color: 0x2c4a5a,
          roughness: 0.06,
          metalness: 0.08,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
          reflectivity: 0.96
        });
        const waterMesh = new THREE.Mesh(waterGeo, waterMat);
        waterMesh.position.set(b.cx, waterY, b.cz);
        waterMesh.receiveShadow = true;
        worldGroup.add(waterMesh);
      }

      const oasisTree = createAcaciaTree(1.22);
      oasisTree.position.set(-24.0, getGroundHeight(-24.0, 36.5), 36.5);
      oasisTree.rotation.y = 1.1;
      worldGroup.add(oasisTree);

      // Scatter weathered savanna granite boulders & termite mounds
      for (let i = 0; i < 42; i++) {
        const r = 8 + rand() * 85;
        const ang = rand() * Math.PI * 2.0;
        const rx = Math.cos(ang) * r;
        const rz = Math.sin(ang) * r - 46.0;
        if (getTrailProximity(rx, rz) < 3.4 || isInsideWater(rx, rz)) continue;

        if (i % 7 === 0) {
          // Sculpted red-earth savanna termite mound
          const mH = 1.2 + rand() * 1.5;
          const mGeo = new THREE.ConeGeometry(0.65 + rand() * 0.35, mH, 10, 5);
          const mp = mGeo.attributes.position;
          for (let k = 0; k < mp.count; k++) {
            const vx = mp.getX(k);
            const vy = mp.getY(k);
            const vz = mp.getZ(k);
            const lump = 1.0 + 0.25 * Math.sin(vy * 4.5 + vx * 3.0);
            mp.setXYZ(k, vx * lump, vy, vz * lump);
          }
          mGeo.computeVertexNormals();
          const mound = new THREE.Mesh(mGeo, termiteMat);
          mound.position.set(rx, getGroundHeight(rx, rz) + mH * 0.42, rz);
          mound.castShadow = true;
          mound.receiveShadow = true;
          worldGroup.add(mound);
        } else {
          const bGeo = new THREE.DodecahedronGeometry(0.35 + rand() * 0.75, 1);
          const bp = bGeo.attributes.position;
          for (let k = 0; k < bp.count; k++) {
            bp.setXYZ(
              k,
              bp.getX(k) * (1.0 + (rand() - 0.5) * 0.28),
              bp.getY(k) * (0.52 + rand() * 0.22),
              bp.getZ(k) * (1.0 + (rand() - 0.5) * 0.28)
            );
          }
          bGeo.computeVertexNormals();
          const rock = new THREE.Mesh(bGeo, rockMat);
          rock.position.set(rx, getGroundHeight(rx, rz) + 0.06, rz);
          rock.rotation.set(rand() * 0.3, rand() * Math.PI * 2, rand() * 0.3);
          rock.castShadow = true;
          rock.receiveShadow = true;
          worldGroup.add(rock);
        }
      }

      // Distant East African Rift Valley tablelands & kopje horizon ring
      const ridgeSegs = 220;
      const ridgeGeo = new THREE.CylinderGeometry(310, 325, 34, ridgeSegs, 8, true);
      const rp = ridgeGeo.attributes.position;
      for (let i = 0; i < rp.count; i++) {
        const vx = rp.getX(i);
        const vy = rp.getY(i);
        const vz = rp.getZ(i);
        const ang = Math.atan2(vz, vx);
        const tTop = clamp((vy + 17.0) / 34.0, 0.0, 1.0);
        const hProfile =
          Math.max(0, fbm2D(Math.cos(ang) * 3.8 + 2.1, Math.sin(ang) * 3.8 - 1.4, 5)) * 18.0 +
          Math.max(0, fbm2D(Math.cos(ang) * 11.0, Math.sin(ang) * 11.0, 3)) * 4.5 +
          Math.pow(Math.max(0, Math.cos(ang - 2.15)), 8.0) * 16.0;
        rp.setY(i, -3.5 + tTop * (4.0 + hProfile));
      }
      ridgeGeo.computeVertexNormals();
      const ridgeMat = new THREE.MeshStandardMaterial({
        color: 0x9aa0aa,
        roughness: 1.0,
        metalness: 0.0,
        side: THREE.BackSide
      });
      ridgeMat.onBeforeCompile = function (shader) {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vRidgePos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRidgePos = position;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vRidgePos;')
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            float elev = clamp((vRidgePos.y - 1.0) / 22.0, 0.0, 1.0);
            float strata = sin(vRidgePos.y * 1.8 + vRidgePos.x * 0.05) * 0.5 + 0.5;
            vec3 baseHaze = vec3(0.58, 0.52, 0.45);
            vec3 peakBlue = vec3(0.46, 0.50, 0.58);
            vec3 c = mix(baseHaze, peakBlue, elev);
            c *= (0.94 + 0.12 * strata);
            diffuseColor.rgb = c;`
          );
      };
      const ridgeMesh = new THREE.Mesh(ridgeGeo, ridgeMat);
      ridgeMesh.position.set(0, 0, -46.0);
      worldGroup.add(ridgeMesh);
    })();

    // =========================================================================
    // 5. CLOVEN HOOFPRINT DECALS & SUNLIT SAVANNA FOOTSTEP DUST PUFFS
    // =========================================================================
    const maxPrints = 48;
    const printMeshes = [];
    let printCursor = 0;

    // Procedural cloven hoofprint alpha canvas texture (in-memory CanvasTexture: zero CORS!)
    const printCanvas = document.createElement('canvas');
    printCanvas.width = 64;
    printCanvas.height = 64;
    const pCtx = printCanvas.getContext('2d');
    pCtx.clearRect(0, 0, 64, 64);
    pCtx.fillStyle = 'rgba(42, 26, 14, 0.72)';
    // Left cleave
    pCtx.beginPath();
    pCtx.ellipse(23, 33, 8, 19, -0.10, 0, Math.PI * 2);
    pCtx.fill();
    // Right cleave
    pCtx.beginPath();
    pCtx.ellipse(41, 33, 8, 19, 0.10, 0, Math.PI * 2);
    pCtx.fill();
    const printTex = new THREE.CanvasTexture(printCanvas);

    const printGeo = new THREE.PlaneGeometry(0.18, 0.21);
    printGeo.rotateX(-Math.PI / 2);

    for (let i = 0; i < maxPrints; i++) {
      const pm = new THREE.Mesh(
        printGeo,
        new THREE.MeshBasicMaterial({
          map: printTex,
          transparent: true,
          opacity: 0.0,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2
        })
      );
      pm.visible = false;
      pm.userData.age = 999;
      worldGroup.add(pm);
      printMeshes.push(pm);
    }

    // Sunlit footstep dust puff particles
    const maxDust = 96;
    const dustData = [];
    const dustPositions = new Float32Array(maxDust * 3);
    const dustSizes = new Float32Array(maxDust);
    const dustAlphas = new Float32Array(maxDust);

    for (let i = 0; i < maxDust; i++) {
      dustData.push({
        active: false,
        age: 0,
        life: 1,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3()
      });
    }

    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dustSizes, 1));
    dustGeo.setAttribute('aAlpha', new THREE.BufferAttribute(dustAlphas, 1));

    const dustMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(0xe5c396) }
      },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (320.0 / max(0.5, -mvPosition.z));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float r2 = dot(c, c);
          if (r2 > 0.25) discard;
          float soft = pow(1.0 - r2 * 4.0, 1.8);
          gl_FragColor = vec4(uColor, vAlpha * soft);
        }
      `
    });

    const dustPoints = new THREE.Points(dustGeo, dustMat);
    dustPoints.frustumCulled = false;
    worldGroup.add(dustPoints);

    let dustCursor = 0;

    function onHoofTouchdown(limbKey, worldPos, worldFwd) {
      // 1. Stamp cloven hoofprint on the sandy trail
      const pm = printMeshes[printCursor];
      printCursor = (printCursor + 1) % maxPrints;
      pm.position.set(worldPos.x, worldPos.y + 0.006, worldPos.z);
      pm.rotation.set(0, Math.atan2(worldFwd.x, worldFwd.z), 0);
      pm.userData.age = 0.0;
      pm.material.opacity = 0.52;
      pm.visible = true;

      // 2. Emit 6 delicate golden savanna dust motes around hoof rim
      for (let k = 0; k < 6; k++) {
        const d = dustData[dustCursor];
        dustCursor = (dustCursor + 1) % maxDust;
        const ang = (k / 6) * Math.PI * 2.0 + Math.random() * 0.6;
        d.active = true;
        d.age = 0.0;
        d.life = 0.75 + Math.random() * 0.55;
        d.pos.set(
          worldPos.x + Math.cos(ang) * 0.07,
          worldPos.y + 0.03,
          worldPos.z + Math.sin(ang) * 0.07
        );
        d.vel.set(
          Math.cos(ang) * (0.18 + Math.random() * 0.16) + 0.12,
          0.16 + Math.random() * 0.18,
          Math.sin(ang) * (0.18 + Math.random() * 0.16)
        );
      }
      void limbKey;
    }

    // =========================================================================
    // 5B. DYNAMIC GROUND CONTACT-AO SHADOWS (HOOVES + TORSO) & SOARING BIRDS
    // =========================================================================
    const aoCanvas = document.createElement('canvas');
    aoCanvas.width = 64;
    aoCanvas.height = 64;
    const aoCtx = aoCanvas.getContext('2d');
    const aoGrad = aoCtx.createRadialGradient(32, 32, 2, 32, 32, 31);
    aoGrad.addColorStop(0.0, 'rgba(22, 14, 7, 0.85)');
    aoGrad.addColorStop(0.45, 'rgba(28, 18, 9, 0.42)');
    aoGrad.addColorStop(1.0, 'rgba(28, 18, 9, 0.0)');
    aoCtx.fillStyle = aoGrad;
    aoCtx.fillRect(0, 0, 64, 64);
    const aoTex = new THREE.CanvasTexture(aoCanvas);

    const hoofAoGeo = new THREE.PlaneGeometry(0.32, 0.36);
    hoofAoGeo.rotateX(-Math.PI / 2);
    const hoofAoMeshes = {};
    for (const k of ['FL', 'FR', 'HL', 'HR']) {
      const m = new THREE.Mesh(
        hoofAoGeo,
        new THREE.MeshBasicMaterial({
          map: aoTex,
          transparent: true,
          opacity: 0.44,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -3
        })
      );
      worldGroup.add(m);
      hoofAoMeshes[k] = m;
    }

    const bodyAoGeo = new THREE.PlaneGeometry(1.45, 2.35);
    bodyAoGeo.rotateX(-Math.PI / 2);
    const bodyAoMesh = new THREE.Mesh(
      bodyAoGeo,
      new THREE.MeshBasicMaterial({
        map: aoTex,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1
      })
    );
    worldGroup.add(bodyAoMesh);

    // High-soaring African savanna storks / eagles gliding in lazy thermal circles
    const birds = [];
    {
      const birdMat = new THREE.MeshBasicMaterial({ color: 0x2b2520, side: THREE.DoubleSide });
      for (let b = 0; b < 7; b++) {
        const bGroup = new THREE.Group();
        const wingGeo = new THREE.BufferGeometry();
        // Swept gull-wing stork silhouette
        const wSpan = 0.72 + (b % 3) * 0.12;
        wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([
          0.0, 0.0, 0.22,   -wSpan * 0.5, 0.06, -0.02,  0.0, 0.0, -0.18,
          -wSpan * 0.5, 0.06, -0.02, -wSpan, -0.02, -0.16, 0.0, 0.0, -0.10,
          0.0, 0.0, 0.22,   0.0, 0.0, -0.18,  wSpan * 0.5, 0.06, -0.02,
          wSpan * 0.5, 0.06, -0.02, 0.0, 0.0, -0.10, wSpan, -0.02, -0.16
        ], 3));
        bGroup.add(new THREE.Mesh(wingGeo, birdMat));
        worldGroup.add(bGroup);
        birds.push({
          mesh: bGroup,
          cx: -20.0 + (b % 2) * 38.0,
          cz: 38.0 - b * 9.0,
          radius: 18.0 + b * 4.5,
          height: 22.0 + b * 2.4,
          speed: 0.11 + (b % 3) * 0.025,
          phase: b * 1.15
        });
      }
    }

    // Shadow frustum texel-snapping scratch matrices
    const _lightViewMat = new THREE.Matrix4();
    const _lightViewInv = new THREE.Matrix4();
    const _snapTarget = new THREE.Vector3();

    function update(dt, giraffeCenterPos, footDiagnostics, giraffeYaw) {
      grassUniforms.uTime.value += dt;
      const tNow = grassUniforms.uTime.value;

      // Update soaring birds
      for (let i = 0; i < birds.length; i++) {
        const bd = birds[i];
        const ang = tNow * bd.speed + bd.phase;
        const bx = bd.cx + Math.cos(ang) * bd.radius;
        const bz = bd.cz + Math.sin(ang) * bd.radius;
        const by = bd.height + Math.sin(tNow * 0.6 + i) * 0.8;
        bd.mesh.position.set(bx, by, bz);
        bd.mesh.rotation.set(0.05, Math.atan2(-Math.sin(ang), Math.cos(ang)), -0.24);
      }

      // Update dynamic hoof & torso ground contact-AO shadows!
      if (giraffeCenterPos) {
        const bgy = getGroundHeight(giraffeCenterPos.x, giraffeCenterPos.z);
        bodyAoMesh.position.set(giraffeCenterPos.x, bgy + 0.008, giraffeCenterPos.z);
        if (giraffeYaw !== undefined) bodyAoMesh.rotation.y = giraffeYaw;
      }
      if (footDiagnostics) {
        for (const k of ['FL', 'FR', 'HL', 'HR']) {
          const fd = footDiagnostics[k];
          const m = hoofAoMeshes[k];
          if (!fd || !m) continue;
          const gy = getGroundHeight(fd.worldHoof.x, fd.worldHoof.z);
          const hClear = Math.max(0.0, fd.worldHoof.y - gy);
          m.position.set(fd.worldHoof.x, gy + 0.007, fd.worldHoof.z);
          if (giraffeYaw !== undefined) m.rotation.y = giraffeYaw;
          const spread = 1.0 + hClear * 3.8;
          m.scale.set(spread, 1.0, spread);
          m.material.opacity = 0.46 / (1.0 + hClear * 16.0);
        }
      }

      // Update hoofprint fade
      for (let i = 0; i < maxPrints; i++) {
        const pm = printMeshes[i];
        if (!pm.visible) continue;
        pm.userData.age += dt;
        if (pm.userData.age > 26.0) {
          pm.visible = false;
        } else {
          pm.material.opacity = 0.52 * (1.0 - smoothstep(14.0, 26.0, pm.userData.age));
        }
      }

      // Update dust particles
      for (let i = 0; i < maxDust; i++) {
        const d = dustData[i];
        if (!d.active) {
          dustAlphas[i] = 0.0;
          dustSizes[i] = 0.0;
          continue;
        }
        d.age += dt;
        if (d.age >= d.life) {
          d.active = false;
          dustAlphas[i] = 0.0;
          continue;
        }
        const t = d.age / d.life;
        d.pos.addScaledVector(d.vel, dt);
        d.vel.multiplyScalar(Math.pow(0.22, dt));
        d.vel.y += 0.06 * dt;

        dustPositions[i * 3 + 0] = d.pos.x;
        dustPositions[i * 3 + 1] = d.pos.y;
        dustPositions[i * 3 + 2] = d.pos.z;
        dustSizes[i] = lerp(0.14, 0.48, t);
        dustAlphas[i] = 0.34 * Math.sin(t * Math.PI) * (1.0 - t * 0.4);
      }
      dustGeo.attributes.position.needsUpdate = true;
      dustGeo.attributes.aSize.needsUpdate = true;
      dustGeo.attributes.aAlpha.needsUpdate = true;

      // Update texel-snapped directional shadow camera centered on giraffe!
      if (giraffeCenterPos) {
        _snapTarget.set(giraffeCenterPos.x, giraffeCenterPos.y + 2.35, giraffeCenterPos.z);
        _lightViewMat.lookAt(sunDir, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)).invert();
        _lightViewInv.copy(_lightViewMat).invert();

        _snapTarget.applyMatrix4(_lightViewMat);
        const texelWorld = (shadowHalfExtent * 2.0) / 2048.0;
        _snapTarget.x = Math.round(_snapTarget.x / texelWorld) * texelWorld;
        _snapTarget.y = Math.round(_snapTarget.y / texelWorld) * texelWorld;
        _snapTarget.applyMatrix4(_lightViewInv);

        sunLight.target.position.copy(_snapTarget);
        sunLight.position.copy(_snapTarget).addScaledVector(sunDir, 17.0);
        sunLight.target.updateMatrixWorld();
      }
    }

    return {
      worldGroup,
      getGroundHeight,
      onHoofTouchdown,
      setLightingPreset,
      update
    };
  }

  window.SavannaWorld = {
    createSavannaWorld
  };
})();
