(function (global) {
  'use strict';

  function createGiraffeCoatMaterial() {
    const sharedUniforms = {
      uCoatSpecies: { value: 0 }, // 0: Reticulated, 1: Masai, 2: Rothschild
      uTime: { value: 0 },
    };

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.74,
      metalness: 0.02,
    });

    material.userData.uniforms = sharedUniforms;
    material.customProgramCacheKey = function () {
      return 'giraffe-coat-v1';
    };

    material.onBeforeCompile = function (shader) {
      shader.uniforms.uCoatSpecies = sharedUniforms.uCoatSpecies;
      shader.uniforms.uTime = sharedUniforms.uTime;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec3 restPos;
          attribute vec4 coatMask;
          varying vec3 vRestPos;
          varying vec4 vCoatMask;
          varying vec3 vRestNorm;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vRestPos = restPos;
          vCoatMask = coatMask;
          vRestNorm = normal;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform int uCoatSpecies;
          uniform float uTime;
          varying vec3 vRestPos;
          varying vec4 vCoatMask;
          varying vec3 vRestNorm;

          vec3 gHash33(vec3 p) {
            p = vec3(
              dot(p, vec3(127.1, 311.7, 74.7)),
              dot(p, vec3(269.5, 183.3, 246.1)),
              dot(p, vec3(113.5, 271.9, 124.6))
            );
            return fract(sin(p) * 43758.5453123);
          }

          float gNoise3(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float n000 = fract(sin(dot(i + vec3(0,0,0), vec3(17.1, 31.7, 47.3))) * 43758.5);
            float n100 = fract(sin(dot(i + vec3(1,0,0), vec3(17.1, 31.7, 47.3))) * 43758.5);
            float n010 = fract(sin(dot(i + vec3(0,1,0), vec3(17.1, 31.7, 47.3))) * 43758.5);
            float n110 = fract(sin(dot(i + vec3(1,1,0), vec3(17.1, 31.7, 47.3))) * 43758.5);
            float n001 = fract(sin(dot(i + vec3(0,0,1), vec3(17.1, 31.7, 47.3))) * 43758.5);
            float n101 = fract(sin(dot(i + vec3(1,0,1), vec3(17.1, 31.7, 47.3))) * 43758.5);
            float n011 = fract(sin(dot(i + vec3(0,1,1), vec3(17.1, 31.7, 47.3))) * 43758.5);
            float n111 = fract(sin(dot(i + vec3(1,1,1), vec3(17.1, 31.7, 47.3))) * 43758.5);
            float nx00 = mix(n000, n100, f.x);
            float nx10 = mix(n010, n110, f.x);
            float nx01 = mix(n001, n101, f.x);
            float nx11 = mix(n011, n111, f.x);
            return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
          }

          float gFbm3(vec3 p) {
            float v = 0.0;
            v += 0.55 * gNoise3(p);
            v += 0.30 * gNoise3(p * 2.07 + 3.1);
            v += 0.15 * gNoise3(p * 4.13 + 7.7);
            return v;
          }

          // Returns vec3(edgeDist = F2 - F1, cellIdHash, F1)
          vec3 gVoronoi3(vec3 x, float jitter) {
            vec3 n = floor(x);
            vec3 f = fract(x);
            float md1 = 8.0;
            float md2 = 8.0;
            float cid = 0.0;
            for (int k = -1; k <= 1; k++) {
              for (int j = -1; j <= 1; j++) {
                for (int i = -1; i <= 1; i++) {
                  vec3 g = vec3(float(i), float(j), float(k));
                  vec3 o = gHash33(n + g);
                  vec3 r = g + (0.5 + (o - 0.5) * jitter) - f;
                  float d = dot(r, r);
                  if (d < md1) {
                    md2 = md1;
                    md1 = d;
                    cid = o.x;
                  } else if (d < md2) {
                    md2 = d;
                  }
                }
              }
            }
            float d1 = sqrt(md1);
            float d2 = sqrt(md2);
            return vec3(d2 - d1, cid, d1);
          }`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // Bilateral subtle asymmetry so left/right spots are natural yet never mirrored artificially
            vec3 p = vRestPos;
            // detailBlend: 0 = large torso/neck patches, 1 = smaller face/lower-leg spots
            float detailBlend = clamp((vCoatMask.x - 1.0) / 1.5, 0.0, 1.0);
            float belly = clamp(vCoatMask.y, 0.0, 1.0);
            float legFade = clamp(vCoatMask.z, 0.0, 1.0);
            float muzzle = clamp(vCoatMask.w, 0.0, 1.0);

            // Anisotropic short-hair grain along body
            float furGrain = gNoise3(p * vec3(52.0, 38.0, 48.0));
            float furFine = gNoise3(p * vec3(135.0, 95.0, 125.0));
            float hairShade = 0.93 + 0.12 * furGrain + 0.04 * furFine;

            vec3 warp = vec3(
              gFbm3(p * 3.1 + vec3(1.4, 5.2, 2.8)) - 0.5,
              gFbm3(p * 3.1 + vec3(7.1, 2.3, 6.4)) - 0.5,
              gFbm3(p * 3.1 + vec3(4.8, 8.9, 1.7)) - 0.5
            );

            vec3 spotColor;
            vec3 lineColor;
            float spotMask = 0.0;

            if (uCoatSpecies == 0) {
              // Reticulated Giraffe: evaluate two fixed-frequency Voronoi fields (zero coordinate-stretch artifacts!)
              vec3 vorL = gVoronoi3(p * 4.25 + warp * 0.44, 0.88);
              vec3 vorS = gVoronoi3(p * 8.40 + warp * 0.72, 0.88);
              float bwL = mix(0.11, 0.16, legFade);
              float bwS = mix(0.125, 0.18, legFade);
              float mL = smoothstep(bwL - 0.025, bwL + 0.032, vorL.x);
              float mS = smoothstep(bwS - 0.030, bwS + 0.038, vorS.x);
              spotMask = mix(mL, mS, smoothstep(0.15, 0.85, detailBlend));
              float cid = mix(vorL.y, vorS.y, detailBlend);

              vec3 darkChestnut = vec3(0.20, 0.065, 0.022);
              vec3 richSienna = vec3(0.35, 0.130, 0.040);
              float mottle = gFbm3(p * 11.0 + cid * 5.0);
              spotColor = mix(darkChestnut, richSienna, 0.32 + 0.55 * cid + 0.22 * (mottle - 0.5));
              lineColor = vec3(0.80, 0.68, 0.50);
            } else if (uCoatSpecies == 1) {
              // Masai Giraffe: jagged star/oak-leaf blotches on warm golden-buff coat
              vec3 jagWarp = vec3(
                gFbm3(p * 7.8 + vec3(2.1, 4.4, 1.2)) - 0.5,
                gFbm3(p * 7.8 + vec3(6.2, 1.9, 5.5)) - 0.5,
                gFbm3(p * 7.8 + vec3(3.3, 8.1, 9.0)) - 0.5
              );
              vec3 vorL = gVoronoi3(p * 4.55 + warp * 0.68 + jagWarp * 0.46, 0.94);
              vec3 vorS = gVoronoi3(p * 8.80 + warp * 0.95 + jagWarp * 0.75, 0.94);
              float mL = smoothstep(0.14, 0.27, vorL.x);
              float mS = smoothstep(0.15, 0.29, vorS.x);
              spotMask = mix(mL, mS, smoothstep(0.15, 0.85, detailBlend));
              float cid = mix(vorL.y, vorS.y, detailBlend);

              vec3 deepUmber = vec3(0.17, 0.072, 0.030);
              vec3 warmBrown = vec3(0.30, 0.140, 0.055);
              spotColor = mix(deepUmber, warmBrown, 0.3 + 0.6 * cid);
              lineColor = vec3(0.74, 0.57, 0.36);
            } else {
              // Rothschild Giraffe: wide cream borders, rounded golden-brown blotches, pale stockings
              vec3 vorL = gVoronoi3(p * 3.85 + warp * 0.38, 0.84);
              vec3 vorS = gVoronoi3(p * 7.60 + warp * 0.62, 0.84);
              float mL = smoothstep(0.16, 0.26, vorL.x);
              float mS = smoothstep(0.17, 0.28, vorS.x);
              spotMask = mix(mL, mS, smoothstep(0.15, 0.85, detailBlend));
              float cid = mix(vorL.y, vorS.y, detailBlend);

              vec3 amberBrown = vec3(0.38, 0.175, 0.058);
              vec3 lightHazel = vec3(0.50, 0.265, 0.098);
              spotColor = mix(amberBrown, lightHazel, 0.25 + 0.65 * cid);
              lineColor = vec3(0.82, 0.74, 0.60);
            }

            // Reduce spot contrast only near lower cannon/fetlock (stronger white stockings on Rothschild)
            float legFadeCurve = smoothstep(0.35, 1.0, legFade);
            float legSpotFade = (uCoatSpecies == 1) ? legFadeCurve * 0.32 : (uCoatSpecies == 2 ? legFade * 0.94 : legFadeCurve * 0.72);
            vec3 legCream = (uCoatSpecies == 2) ? vec3(0.84, 0.79, 0.69) : vec3(0.78, 0.66, 0.49);
            vec3 coat = mix(lineColor, spotColor, spotMask);
            coat = mix(coat, legCream, legSpotFade);

            // Creamy underbelly, inner legs, throat underside
            vec3 bellyCol = vec3(0.82, 0.74, 0.60);
            float bellySoft = smoothstep(0.12, 0.82, belly);
            coat = mix(coat, bellyCol, bellySoft * 0.88);

            // Subtle dappled shoulder/spine dorsal darkening
            float dorsalWarm = smoothstep(0.45, 0.95, vRestNorm.y) * (1.0 - muzzle) * 0.12;
            coat *= (1.0 - dorsalWarm);

            // Dark velvety muzzle & chin
            vec3 muzzleCol = vec3(0.16, 0.12, 0.105) * (0.9 + 0.2 * furFine);
            coat = mix(coat, muzzleCol, muzzle);

            // Apply short hair texture & subtle AO in underside creases
            coat *= hairShade;

            diffuseColor.rgb = coat;
          }`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          {
            float furR = gNoise3(vRestPos * vec3(95.0, 70.0, 90.0));
            roughnessFactor = clamp(mix(0.69 + 0.11 * furR, 0.89, vCoatMask.w), 0.55, 0.95);
          }`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            // Micro-fur bump in screen space from 3D restPos fur grain
            float h = gNoise3(vRestPos * vec3(110.0, 75.0, 105.0));
            vec3 dpdx = dFdx(vViewPosition);
            vec3 dpdy = dFdy(vViewPosition);
            float dhdx = dFdx(h);
            float dhdy = dFdy(h);
            vec3 r1 = cross(dpdy, normal);
            vec3 r2 = cross(normal, dpdx);
            float det = dot(dpdx, r1);
            if (abs(det) > 1e-8) {
              vec3 surfGrad = sign(det) * (dhdx * r1 + dhdy * r2);
              normal = normalize(normal - 0.14 * surfGrad);
            }
          }`
        );

      material.userData.shader = shader;
    };

    return material;
  }

  function createEyeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Dark brown sclera rim -> warm dark amber-chocolate iris -> deep horizontal-oval pupil
    const cx = 128;
    const cy = 128;

    ctx.fillStyle = '#1b110b';
    ctx.fillRect(0, 0, 256, 256);

    const irisGrad = ctx.createRadialGradient(cx, cy, 18, cx, cy, 118);
    irisGrad.addColorStop(0.0, '#2a160c');
    irisGrad.addColorStop(0.45, '#4b2712');
    irisGrad.addColorStop(0.75, '#351b0c');
    irisGrad.addColorStop(0.95, '#170c06');
    irisGrad.addColorStop(1.0, '#120905');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 120, 0, Math.PI * 2);
    ctx.fill();

    // Subtle radial iris fibers
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(130, 74, 34, 0.22)' : 'rgba(20, 10, 5, 0.25)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 34, Math.sin(a) * 34);
      ctx.lineTo(Math.cos(a) * 108, Math.sin(a) * 108);
      ctx.stroke();
    }
    ctx.restore();

    // Giraffe horizontal-elliptical dark pupil
    ctx.fillStyle = '#050404';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 52, 34, 0, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function createBarkTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#4c3b2d';
    ctx.fillRect(0, 0, 256, 512);

    const rand = global.GiraffeMath.mulberry32(91827);
    for (let i = 0; i < 650; i++) {
      const x = rand() * 256;
      const y = rand() * 512;
      const w = 2 + rand() * 5;
      const h = 24 + rand() * 80;
      const shade = rand();
      ctx.fillStyle = shade > 0.55
        ? 'rgba(112, 92, 72, 0.35)'
        : 'rgba(38, 28, 20, 0.45)';
      ctx.fillRect(x, y, w, h);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  global.GiraffeShaders = {
    createGiraffeCoatMaterial,
    createEyeTexture,
    createBarkTexture,
  };
})(window);
