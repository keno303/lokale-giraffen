(function () {
  'use strict';

  function createGiraffeSkinMaterial() {
    const uniforms = {
      uSubspecies: { value: 0.0 } // 0 = Reticulated, 1 = Masai, 2 = Rothschild's
    };

    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.0,
      sheen: 0.62,
      sheenRoughness: 0.74,
      sheenColor: new THREE.Color(0xf5d6ad),
      ior: 1.45
    });

    mat.userData.uniforms = uniforms;

    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uSubspecies = uniforms.uSubspecies;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec3 aRestPos;
          attribute vec4 aCoatParams;
          varying vec3 vRestPos;
          varying vec4 vCoatParams;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vRestPos = aRestPos;
          vCoatParams = aCoatParams;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vRestPos;
          varying vec4 vCoatParams;
          uniform float uSubspecies;

          vec3 gHash33(vec3 p) {
            p = vec3(
              dot(p, vec3(127.1, 311.7, 74.7)),
              dot(p, vec3(269.5, 183.3, 246.1)),
              dot(p, vec3(113.5, 271.9, 124.6))
            );
            return fract(sin(p) * 43758.5453123);
          }

          float gHash31(vec3 p) {
            p = fract(p * 0.1031);
            p += dot(p, p.zyx + 31.32);
            return fract((p.x + p.y) * p.z);
          }

          float gNoise3(vec3 x) {
            vec3 i = floor(x);
            vec3 f = fract(x);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(
                mix(gHash31(i + vec3(0,0,0)), gHash31(i + vec3(1,0,0)), f.x),
                mix(gHash31(i + vec3(0,1,0)), gHash31(i + vec3(1,1,0)), f.x),
                f.y
              ),
              mix(
                mix(gHash31(i + vec3(0,0,1)), gHash31(i + vec3(1,0,1)), f.x),
                mix(gHash31(i + vec3(0,1,1)), gHash31(i + vec3(1,1,1)), f.x),
                f.y
              ),
              f.z
            );
          }

          float gFbm3(vec3 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 4; i++) {
              v += a * gNoise3(p);
              p = p * 2.03 + vec3(17.1, 31.4, 11.7);
              a *= 0.5;
            }
            return v;
          }

          // Exact 3D Voronoi returning (f1Dist, exactBisectorDist, cellHash, 0)
          vec4 giraffeVoronoi(vec3 x, float jitter) {
            vec3 n = floor(x);
            vec3 f = fract(x);

            vec3 mr = vec3(0.0);
            vec3 mg = vec3(0.0);
            float md = 8.0;
            float cellId = 0.0;

            for (int k = -1; k <= 1; k++) {
              for (int j = -1; j <= 1; j++) {
                for (int i = -1; i <= 1; i++) {
                  vec3 g = vec3(float(i), float(j), float(k));
                  vec3 rnd = gHash33(n + g);
                  vec3 o = 0.5 + jitter * (rnd - 0.5);
                  vec3 r = g + o - f;
                  float d = dot(r, r);
                  if (d < md) {
                    md = d;
                    mr = r;
                    mg = g;
                    cellId = rnd.x * 0.63 + rnd.y * 0.37;
                  }
                }
              }
            }

            float minEdgeDist = 8.0;
            for (int k = -1; k <= 1; k++) {
              for (int j = -1; j <= 1; j++) {
                for (int i = -1; i <= 1; i++) {
                  vec3 g = vec3(float(i), float(j), float(k));
                  vec3 diffG = g - mg;
                  if (dot(diffG, diffG) > 0.0001) {
                    vec3 rnd = gHash33(n + g);
                    vec3 o = 0.5 + jitter * (rnd - 0.5);
                    vec3 r = g + o - f;
                    vec3 mid = 0.5 * (mr + r);
                    vec3 dir = normalize(r - mr);
                    float dEdge = dot(mid, dir);
                    minEdgeDist = min(minEdgeDist, dEdge);
                  }
                }
              }
            }

            return vec4(sqrt(md), minEdgeDist, cellId, atan(mr.y + mr.z * 0.7, mr.x - mr.z * 0.5));
          }`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>

          // Unpack vertex anatomical coat parameters:
          // x: fineSpotBlend [0 = coarse torso/neck polygons, 0.5 = mid neck/upper limb, 1.0 = fine facial/knee spots]
          // y: creamFade [0 = full coat, 1 = clean lower stocking / belly center]
          // z: darkSkinMask [0..1 velvety dark muzzle / nostril / lip / ossicone hair tuft]
          // w: hoofMask [0..1 keratin cloven hoof]
          float fineBlend = clamp(vCoatParams.x, 0.0, 1.0);
          float creamFade = clamp(vCoatParams.y, 0.0, 1.0);
          float darkSkinMask = clamp(vCoatParams.z, 0.0, 1.0);
          float hoofMask = clamp(vCoatParams.w, 0.0, 1.0);

          float isMasai = clamp(1.0 - abs(uSubspecies - 1.0), 0.0, 1.0);
          float isRothschild = clamp(1.0 - abs(uSubspecies - 2.0), 0.0, 1.0);
          float isRetic = clamp(1.0 - isMasai - isRothschild, 0.0, 1.0);

          // CRITICAL: Evaluate CONSTANT-FREQUENCY 3D Voronoi octaves so Jacobian is 100% isotropic
          // everywhere on the body, neck, cheeks, and limbs (ZERO stretching / striping!).
          float warpAmp = 0.22 * isRetic + 0.58 * isMasai + 0.36 * isRothschild;

          vec3 pCoarse = vRestPos * 4.75;
          vec3 wCoarse = vec3(
            gFbm3(pCoarse * 0.65 + vec3(3.1, 7.4, 1.9)),
            gFbm3(pCoarse * 0.65 + vec3(15.2, 2.8, 9.3)),
            gFbm3(pCoarse * 0.65 + vec3(8.7, 19.1, 4.6))
          ) - 0.5;
          vec4 vorCoarse = giraffeVoronoi(pCoarse + wCoarse * warpAmp, 0.86);

          vec3 pMid = vRestPos * 8.4 + vec3(11.3, 4.7, 19.2);
          vec3 wMid = vec3(
            gFbm3(pMid * 0.65 + vec3(5.4, 1.2, 8.8)),
            gFbm3(pMid * 0.65 + vec3(12.1, 9.4, 3.7)),
            gFbm3(pMid * 0.65 + vec3(2.9, 16.5, 7.1))
          ) - 0.5;
          vec4 vorMid = giraffeVoronoi(pMid + wMid * warpAmp, 0.86);

          vec3 pFine = vRestPos * 16.5 + vec3(23.7, 9.1, 5.4);
          vec3 wFine = vec3(
            gFbm3(pFine * 0.65 + vec3(9.1, 4.2, 2.5)),
            gFbm3(pFine * 0.65 + vec3(1.8, 13.4, 6.2)),
            gFbm3(pFine * 0.65 + vec3(7.3, 8.5, 14.9))
          ) - 0.5;
          vec4 vorFine = giraffeVoronoi(pFine + wFine * (warpAmp * 0.85), 0.88);

          // Blend seamlessly across coarse (torso/lower-neck) -> mid (upper-neck/forearms/thighs) -> fine (head/knees)
          float wToMid = smoothstep(0.05, 0.52, fineBlend);
          float wToFine = smoothstep(0.50, 0.95, fineBlend);

          float borderDist = mix(mix(vorCoarse.y, vorMid.y, wToMid), vorFine.y, wToFine);
          float cellHash = mix(mix(vorCoarse.z, vorMid.z, wToMid), vorFine.z, wToFine);
          float cellAngle = mix(mix(vorCoarse.w, vorMid.w, wToMid), vorFine.w, wToFine);
          float f1Dist = mix(mix(vorCoarse.x, vorMid.x, wToMid), vorFine.x, wToFine);

          float fineRagged = gFbm3(vRestPos * 24.0) - 0.5;
          // Authentic Masai stellate "oak-leaf / vine-leaf" radial indentations!
          float starLobes = sin(cellAngle * 5.0 + cellHash * 6.283) * 0.55
                          + cos(cellAngle * 8.0 - cellHash * 11.0) * 0.45;
          float masaiLeafIndent = isMasai * (starLobes * 0.085 * smoothstep(0.05, 0.35, f1Dist) - f1Dist * 0.14);

          float baseChannel = 0.056 * isRetic + 0.115 * isMasai + 0.092 * isRothschild;
          baseChannel += fineBlend * 0.038;

          float stockingBreakup = creamFade * (0.25 + 0.24 * isRothschild);
          float effectiveBorder = borderDist
            + fineRagged * (0.026 + 0.075 * isMasai)
            + masaiLeafIndent
            - stockingBreakup;

          float edgeSoftness = 0.020 * isRetic + 0.035 * isMasai + 0.040 * isRothschild;
          float inPatch = smoothstep(baseChannel - edgeSoftness, baseChannel + edgeSoftness, effectiveBorder);

          float stockingClean = smoothstep(0.62 - 0.22 * isRothschild, 0.95 - 0.12 * isRothschild, creamFade);
          inPatch *= (1.0 - stockingClean);

          // Base ground hair colors (warm tawny-cream on Reticulated/Masai, brighter ivory on Rothschild stockings)
          vec3 reticCream = vec3(0.74, 0.62, 0.44);
          vec3 masaiBuff  = vec3(0.64, 0.48, 0.29);
          vec3 rothCream  = vec3(0.77, 0.66, 0.49);
          vec3 baseGround = reticCream * isRetic + masaiBuff * isMasai + rothCream * isRothschild;

          vec3 stockingTone = mix(
            vec3(0.72, 0.61, 0.45) * isRetic + vec3(0.66, 0.52, 0.34) * isMasai + vec3(0.84, 0.79, 0.69) * isRothschild,
            vec3(0.82, 0.76, 0.64),
            0.35
          );
          baseGround = mix(baseGround, stockingTone, smoothstep(0.28, 0.90, creamFade));

          // Warm golden-tan facial bridge & cheek warmth
          float isFace = smoothstep(3.8, 4.45, vRestPos.y) * smoothstep(1.65, 1.95, vRestPos.z);
          baseGround = mix(baseGround, vec3(0.64, 0.49, 0.32), isFace * 0.42);

          // Subtle savanna red-ochre dust near fetlocks/pasterns
          float lowLegDust = smoothstep(0.52, 0.08, vRestPos.y) * (1.0 - hoofMask);
          baseGround = mix(baseGround, vec3(0.63, 0.48, 0.33), lowLegDust * 0.30);

          // Rich chestnut / russet / dark chocolate patch colors
          float coreDepth = smoothstep(baseChannel, baseChannel + 0.25, effectiveBorder);
          vec3 reticPatchOuter = vec3(0.255, 0.088, 0.025);
          vec3 reticPatchCore  = vec3(0.148, 0.048, 0.014);
          vec3 masaiPatchOuter = vec3(0.135, 0.064, 0.025);
          vec3 masaiPatchCore  = vec3(0.055, 0.024, 0.010);
          vec3 rothPatchOuter  = vec3(0.275, 0.110, 0.034);
          vec3 rothPatchCore   = vec3(0.120, 0.045, 0.014);

          vec3 patchOuter = reticPatchOuter * isRetic + masaiPatchOuter * isMasai + rothPatchOuter * isRothschild;
          vec3 patchCore  = reticPatchCore * isRetic + masaiPatchCore * isMasai + rothPatchCore * isRothschild;
          vec3 patchCol = mix(patchOuter, patchCore, coreDepth);
          patchCol *= (0.85 + 0.30 * cellHash);

          if (isRothschild > 0.01) {
            float vein = 1.0 - smoothstep(0.0, 0.042, abs(gNoise3(vRestPos * 9.5) - 0.5));
            patchCol = mix(patchCol, baseGround * 0.72, vein * 0.26 * isRothschild);
          }

          // Fine directional short-coat hair grain
          vec3 furSamplePos = vec3(vRestPos.x * 105.0, vRestPos.y * 36.0, vRestPos.z * 95.0);
          float furGrain = gNoise3(furSamplePos) * 0.65 + gNoise3(furSamplePos * 2.4) * 0.35;

          vec3 coatAlbedo = mix(baseGround, patchCol, inPatch);
          coatAlbedo *= (0.92 + 0.16 * furGrain);

          // Soft taupe-charcoal velvety muzzle, nostrils, lips & ossicone hair tufts
          vec3 muzzleTaupe = mix(vec3(0.16, 0.13, 0.11), vec3(0.042, 0.035, 0.033), smoothstep(0.25, 0.88, darkSkinMask));
          muzzleTaupe *= (0.88 + 0.24 * gNoise3(vRestPos * 75.0));
          coatAlbedo = mix(coatAlbedo, muzzleTaupe, smoothstep(0.05, 0.92, darkSkinMask));

          // Keratin cloven hooves with vertical horn tubules, dark interdigital cleft & dusty sole rim
          float hornStripes = gNoise3(vec3(vRestPos.x * 170.0, vRestPos.y * 15.0, vRestPos.z * 170.0));
          vec3 hoofCol = mix(vec3(0.032, 0.029, 0.028), vec3(0.078, 0.069, 0.062), hornStripes);
          float soleDust = smoothstep(0.05, 0.004, vRestPos.y);
          hoofCol = mix(hoofCol, vec3(0.22, 0.16, 0.11), soleDust * 0.42);
          coatAlbedo = mix(coatAlbedo, hoofCol, hoofMask);

          diffuseColor.rgb *= coatAlbedo;

          float coatRoughness = mix(0.78, 0.70, inPatch) + (furGrain - 0.5) * 0.07;
          coatRoughness = mix(coatRoughness, 0.48, darkSkinMask * 0.85);
          coatRoughness = mix(coatRoughness, 0.32 + soleDust * 0.35, hoofMask);

          float coatBumpHeight =
            (furGrain - 0.5) * 0.0028 * (1.0 - hoofMask * 0.85) +
            inPatch * 0.0012 +
            (hornStripes - 0.5) * 0.0022 * hoofMask;`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = clamp(coatRoughness, 0.12, 0.96);`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            vec3 dPosdx = dFdx(vViewPosition);
            vec3 dPosdy = dFdy(vViewPosition);
            float dHdx = dFdx(coatBumpHeight);
            float dHdy = dFdy(coatBumpHeight);
            vec3 r1 = cross(dPosdy, normal);
            vec3 r2 = cross(normal, dPosdx);
            float det = dot(dPosdx, r1);
            if (abs(det) > 1e-10) {
              vec3 surfGrad = sign(det) * (dHdx * r1 + dHdy * r2);
              normal = normalize(abs(det) * normal - surfGrad * 1.05);
            }
          }`
        );
    };

    mat.customProgramCacheKey = function () {
      return 'giraffe-skin-physical-v2';
    };

    return mat;
  }

  function createGiraffeEyeMaterial() {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.08,
      metalness: 0.0,
      clearcoat: 0.62,
      clearcoatRoughness: 0.03,
      ior: 1.40,
      envMapIntensity: 0.52
    });

    mat.onBeforeCompile = function (shader) {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vEyeLocal;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vEyeLocal = normalize(position);`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vEyeLocal;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec2 p = vEyeLocal.xy;
          float r = length(p);
          float irisRadius = 0.91;
          float angle = atan(p.y, p.x);

          vec3 scleraCol = vec3(0.055, 0.038, 0.028);

          float fibers = sin(angle * 52.0 + sin(r * 22.0) * 1.4) * 0.5 + 0.5;
          float fibers2 = sin(angle * 98.0 - r * 15.0) * 0.5 + 0.5;
          float lowerCaustic = clamp(-p.y * 1.3 + 0.35, 0.0, 1.0);
          vec3 irisInner = vec3(0.085, 0.033, 0.009) * (0.80 + 0.50 * lowerCaustic);
          vec3 irisMid   = vec3(0.036, 0.013, 0.003);
          vec3 irisCol   = mix(irisMid, irisInner, fibers * 0.65 + fibers2 * 0.35);

          float limbal = smoothstep(irisRadius - 0.20, irisRadius, r);
          irisCol = mix(irisCol, vec3(0.009, 0.005, 0.004), limbal * 0.94);

          // Large dark horizontal oblong ungulate pupil
          vec2 pupilCoord = vec2(p.x / 0.50, p.y / 0.28);
          float pupilDist = length(pupilCoord);
          float inPupil = 1.0 - smoothstep(0.82, 1.02, pupilDist);

          float inIris = 1.0 - smoothstep(irisRadius - 0.03, irisRadius + 0.03, r);
          vec3 eyeCol = mix(scleraCol, irisCol, inIris);
          eyeCol = mix(eyeCol, vec3(0.004, 0.003, 0.004), inPupil * inIris);

          // Crisp sunlit corneal glint
          float glint = 1.0 - smoothstep(0.035, 0.095, length(p - vec2(-0.18, 0.22)));
          eyeCol += vec3(0.95, 0.93, 0.88) * glint * 0.78;

          diffuseColor.rgb *= eyeCol;`
        );
    };

    mat.customProgramCacheKey = function () {
      return 'giraffe-eye-v3';
    };

    return mat;
  }

  function createGiraffeManeMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.84,
      metalness: 0.0,
      side: THREE.DoubleSide,
      alphaTest: 0.35
    });

    mat.onBeforeCompile = function (shader) {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec2 vManeUv;`
        )
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
          vManeUv = uv;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec2 vManeUv;
          float maneHash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }
          float maneNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(maneHash(i), maneHash(i + vec2(1.0, 0.0)), f.x),
              mix(maneHash(i + vec2(0.0, 1.0)), maneHash(i + vec2(1.0, 1.0)), f.x),
              f.y
            );
          }`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float strandFreq = 320.0;
          float strandA = maneNoise(vec2(vManeUv.x * strandFreq, vManeUv.y * 2.5));
          float strandB = maneNoise(vec2(vManeUv.x * strandFreq * 2.6 + 17.0, vManeUv.y * 4.5));
          float hairDensity = strandA * 0.60 + strandB * 0.40;

          float tipCutoff = 0.68 + 0.32 * hairDensity;
          float alphaVal = 1.0 - smoothstep(tipCutoff - 0.12, tipCutoff, vManeUv.y);
          diffuseColor.a *= alphaVal;

          vec3 rootCol = vec3(0.36, 0.21, 0.095);
          vec3 midCol  = vec3(0.12, 0.052, 0.020);
          vec3 tipCol  = vec3(0.032, 0.016, 0.008);
          vec3 hairCol = mix(rootCol, midCol, smoothstep(0.0, 0.40, vManeUv.y));
          hairCol = mix(hairCol, tipCol, smoothstep(0.45, 0.90, vManeUv.y));
          hairCol *= (0.78 + 0.44 * hairDensity);

          diffuseColor.rgb *= hairCol;`
        );
    };

    mat.customProgramCacheKey = function () {
      return 'giraffe-mane-v2';
    };

    return mat;
  }

  function createDarkHairMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.66,
      metalness: 0.02,
      side: THREE.DoubleSide,
      alphaTest: 0.3
    });

    mat.onBeforeCompile = function (shader) {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec2 vHairUv;`
        )
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
          vHairUv = uv;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec2 vHairUv;
          float dHairHash(vec2 p) {
            return fract(sin(dot(p, vec2(91.7, 241.3))) * 43758.5453);
          }
          float dHairNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(dHairHash(i), dHairHash(i + vec2(1.0, 0.0)), f.x),
              mix(dHairHash(i + vec2(0.0, 1.0)), dHairHash(i + vec2(1.0, 1.0)), f.x),
              f.y
            );
          }`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float s1 = dHairNoise(vec2(vHairUv.x * 64.0, vHairUv.y * 2.5));
          float s2 = dHairNoise(vec2(vHairUv.x * 140.0 + 9.0, vHairUv.y * 4.0));
          float strand = s1 * 0.6 + s2 * 0.4;
          float edgeFade = sin(clamp(vHairUv.x, 0.0, 1.0) * 3.14159265);
          float maxLen = (0.60 + 0.40 * strand) * pow(edgeFade, 0.22);
          float a = 1.0 - smoothstep(maxLen - 0.14, maxLen, vHairUv.y);
          diffuseColor.a *= a;

          vec3 col = mix(vec3(0.028, 0.021, 0.018), vec3(0.010, 0.008, 0.009), vHairUv.y);
          col *= (0.75 + 0.55 * strand);
          diffuseColor.rgb *= col;`
        );
    };

    mat.customProgramCacheKey = function () {
      return 'giraffe-dark-hair-v2';
    };

    return mat;
  }

  function createPaleEarHairMaterial() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
      alphaTest: 0.28
    });

    mat.onBeforeCompile = function (shader) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vEarHairUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvEarHairUv = uv;');

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec2 vEarHairUv;
          float eHairHash(vec2 p) {
            return fract(sin(dot(p, vec2(113.5, 271.9))) * 43758.5453);
          }
          float eHairNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(eHairHash(i), eHairHash(i + vec2(1.0, 0.0)), f.x),
              mix(eHairHash(i + vec2(0.0, 1.0)), eHairHash(i + vec2(1.0, 1.0)), f.x),
              f.y
            );
          }`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float s = eHairNoise(vec2(vEarHairUv.x * 52.0, vEarHairUv.y * 3.0)) * 0.65
                  + eHairNoise(vec2(vEarHairUv.x * 115.0 + 7.0, vEarHairUv.y * 5.0)) * 0.35;
          float arch = sin(clamp(vEarHairUv.x, 0.0, 1.0) * 3.14159265);
          float cutoff = (0.35 + 0.65 * s) * pow(arch, 0.4);
          diffuseColor.a *= (1.0 - smoothstep(cutoff - 0.15, cutoff, vEarHairUv.y));
          diffuseColor.rgb *= mix(vec3(0.76, 0.67, 0.56), vec3(0.92, 0.89, 0.83), vEarHairUv.y);`
        );
    };

    mat.customProgramCacheKey = function () {
      return 'giraffe-ear-hair-v1';
    };
    return mat;
  }

  window.GiraffeCoat = {
    createGiraffeSkinMaterial,
    createGiraffeEyeMaterial,
    createGiraffeManeMaterial,
    createDarkHairMaterial,
    createPaleEarHairMaterial
  };
})();
