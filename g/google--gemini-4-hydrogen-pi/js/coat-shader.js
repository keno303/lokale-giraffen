(function (global) {
  'use strict';

  const G = (global.GiraffeApp = global.GiraffeApp || {});
  const THREE = global.THREE;

  const SUBSPECIES = {
    reticulated: {
      id: 0,
      patchColorA: new THREE.Color('#803816'),
      patchColorB: new THREE.Color('#5c240d'),
      lineColor: new THREE.Color('#efe1c4'),
      bellyColor: new THREE.Color('#ecdec1'),
      stockingColor: new THREE.Color('#e6d7b9'),
      muzzleColor: new THREE.Color('#3b2f28'),
      lineWidth: 0.082,
      edgeSoftness: 0.024,
      warpAmp: 0.09,
      legSpotEnd: 0.92
    },
    masai: {
      id: 1,
      patchColorA: new THREE.Color('#5a3017'),
      patchColorB: new THREE.Color('#3c1e0d'),
      lineColor: new THREE.Color('#d8b884'),
      bellyColor: new THREE.Color('#dfc497'),
      stockingColor: new THREE.Color('#d7bb8a'),
      muzzleColor: new THREE.Color('#322720'),
      lineWidth: 0.145,
      edgeSoftness: 0.036,
      warpAmp: 0.24,
      legSpotEnd: 0.45
    },
    rothschild: {
      id: 2,
      patchColorA: new THREE.Color('#8d4f22'),
      patchColorB: new THREE.Color('#6b3614'),
      lineColor: new THREE.Color('#ebd8b3'),
      bellyColor: new THREE.Color('#ede0c6'),
      stockingColor: new THREE.Color('#efe4ce'),
      muzzleColor: new THREE.Color('#3e322b'),
      lineWidth: 0.125,
      edgeSoftness: 0.034,
      warpAmp: 0.13,
      legSpotEnd: 1.04
    }
  };

  function createCoatMaterial(speciesKey = 'reticulated') {
    const preset = SUBSPECIES[speciesKey] || SUBSPECIES.reticulated;

    const uniforms = {
      uPatchColorA: { value: preset.patchColorA.clone() },
      uPatchColorB: { value: preset.patchColorB.clone() },
      uLineColor: { value: preset.lineColor.clone() },
      uBellyColor: { value: preset.bellyColor.clone() },
      uStockingColor: { value: preset.stockingColor.clone() },
      uMuzzleColor: { value: preset.muzzleColor.clone() },
      uDustColor: { value: new THREE.Color('#b6956f') },
      uLineWidth: { value: preset.lineWidth },
      uEdgeSoftness: { value: preset.edgeSoftness },
      uWarpAmp: { value: preset.warpAmp },
      uLegSpotEnd: { value: preset.legSpotEnd },
      uSpecies: { value: preset.id }
    };

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.02,
      vertexColors: true
    });

    material.userData.coatUniforms = uniforms;

    material.onBeforeCompile = function (shader) {
      Object.assign(shader.uniforms, uniforms);

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec3 aRestPos;
          attribute vec4 aRegion;
          varying vec3 vRestPos;
          varying vec3 vRestNormal;
          varying vec4 vRegion;
          `
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vRestPos = aRestPos;
          vRestNormal = normalize(normal);
          vRegion = aRegion;
          `
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec3 uPatchColorA;
          uniform vec3 uPatchColorB;
          uniform vec3 uLineColor;
          uniform vec3 uBellyColor;
          uniform vec3 uStockingColor;
          uniform vec3 uMuzzleColor;
          uniform vec3 uDustColor;
          uniform float uLineWidth;
          uniform float uEdgeSoftness;
          uniform float uWarpAmp;
          uniform float uLegSpotEnd;
          uniform float uSpecies;

          varying vec3 vRestPos;
          varying vec3 vRestNormal;
          varying vec4 vRegion;

          vec3 hash33(vec3 p) {
            p = vec3(
              dot(p, vec3(127.1, 311.7, 74.7)),
              dot(p, vec3(269.5, 183.3, 246.1)),
              dot(p, vec3(113.5, 271.9, 124.6))
            );
            return fract(sin(p) * 43758.5453123);
          }

          float noise3D(vec3 x) {
            vec3 i = floor(x);
            vec3 f = fract(x);
            f = f * f * (3.0 - 2.0 * f);
            float n000 = hash33(i + vec3(0.0, 0.0, 0.0)).x;
            float n100 = hash33(i + vec3(1.0, 0.0, 0.0)).x;
            float n010 = hash33(i + vec3(0.0, 1.0, 0.0)).x;
            float n110 = hash33(i + vec3(1.0, 1.0, 0.0)).x;
            float n001 = hash33(i + vec3(0.0, 0.0, 1.0)).x;
            float n101 = hash33(i + vec3(1.0, 0.0, 1.0)).x;
            float n011 = hash33(i + vec3(0.0, 1.0, 1.0)).x;
            float n111 = hash33(i + vec3(1.0, 1.0, 1.0)).x;
            return mix(
              mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
              mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
              f.z
            );
          }

          float fbm3D(vec3 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 3; i++) {
              v += a * (noise3D(p) * 2.0 - 1.0);
              p *= 2.07;
              a *= 0.5;
            }
            return v;
          }

          // Returns vec3(edgeDist, cellIdHash, F1)
          vec3 voronoi3D(vec3 x) {
            vec3 n = floor(x);
            vec3 f = fract(x);
            float md1 = 8.0;
            float md2 = 8.0;
            vec3 bestCell = vec3(0.0);
            vec3 mr = vec3(0.0);

            for (int k = -1; k <= 1; k++) {
              for (int j = -1; j <= 1; j++) {
                for (int i = -1; i <= 1; i++) {
                  vec3 g = vec3(float(i), float(j), float(k));
                  vec3 o = hash33(n + g);
                  // Keep jitter well centered for realistic polygonal cells
                  vec3 r = g + (0.18 + 0.64 * o) - f;
                  float d = dot(r, r);
                  if (d < md1) {
                    md2 = md1;
                    md1 = d;
                    mr = r;
                    bestCell = o;
                  } else if (d < md2) {
                    md2 = d;
                  }
                }
              }
            }

            // Approximate distance to cell border
            float d1 = sqrt(md1);
            float d2 = sqrt(md2);
            float edge = (d2 - d1);
            return vec3(edge, bestCell.x, d1);
          }
          `
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>

          // Determine regional scale based on height & part
          float isLeg = step(0.5, vRegion.x) * step(vRegion.x, 1.5);
          float isHeadPart = step(1.5, vRegion.x);

          // Evaluate two constant-scale 3D Voronoi fields and blend results (avoids spatial scale distortion!)
          float headFactor = smoothstep(4.45, 4.88, vRestPos.y) * smoothstep(1.52, 1.85, vRestPos.z);
          float legLowerFactor = isLeg * (1.0 - smoothstep(0.85, 1.85, vRestPos.y));

          vec3 p = vRestPos * vec3(1.0, 0.88, 1.0);
          vec3 warp = vec3(
            fbm3D(p * 6.5 + 1.3),
            fbm3D(p * 6.5 + 9.7),
            fbm3D(p * 6.5 + 21.1)
          ) * uWarpAmp;

          // Extra jaggedness for Masai oak-leaf spots
          if (uSpecies > 0.5 && uSpecies < 1.5) {
            warp += vec3(
              fbm3D(p * 16.0 + 3.1),
              fbm3D(p * 16.0 + 14.2),
              fbm3D(p * 16.0 + 27.9)
            ) * 0.11;
          }

          vec3 vorBody = voronoi3D(p * 4.35 + warp);
          vec3 vorHead = voronoi3D(p * 7.6 + warp * 0.75);
          float fineBlend = clamp(max(headFactor, legLowerFactor * 0.65), 0.0, 1.0);
          float edgeDist = mix(vorBody.x, vorHead.x, fineBlend);
          float cellRand = mix(vorBody.y, vorHead.y, step(0.5, fineBlend));

          // Fine hair-edge fuzziness
          float edgeNoise = fbm3D(vRestPos * 34.0) * 0.014;
          float lineW = uLineWidth * mix(1.0, 1.45, legLowerFactor);
          float patchMask = smoothstep(lineW - uEdgeSoftness, lineW + uEdgeSoftness, edgeDist + edgeNoise);

          // Patch color varies slightly per cell and toward center
          vec3 patchCol = mix(uPatchColorA, uPatchColorB, smoothstep(0.15, 0.85, cellRand) * 0.72);
          float centerDark = smoothstep(0.10, 0.42, edgeDist);
          patchCol *= mix(1.06, 0.88, centerDark * 0.5);

          // Short fur directional micro-grain
          float furGrain = noise3D(vRestPos * vec3(145.0, 48.0, 145.0));
          float furFine = noise3D(vRestPos * vec3(280.0, 95.0, 280.0));
          float furShade = 0.92 + 0.16 * (furGrain * 0.65 + furFine * 0.35);

          vec3 coatCol = mix(uLineColor, patchCol, patchMask) * furShade;

          // Underbelly & true medial inner-leg cream fade (keep front brisket spotted!)
          float frontBrisketProtect = 1.0 - smoothstep(0.25, 0.62, vRestPos.z) * (1.0 - smoothstep(1.9, 2.35, vRestPos.y));
          float bellyMask = smoothstep(-0.46, -0.84, vRestNormal.y)
                          * (1.0 - smoothstep(2.45, 2.95, vRestPos.y))
                          * mix(0.25, 1.0, frontBrisketProtect);
          float innerLegMask = isLeg * smoothstep(0.55, 0.90, -sign(vRestPos.x) * vRestNormal.x) * 0.28;
          float creamFade = clamp(max(bellyMask, innerLegMask), 0.0, 1.0);
          coatCol = mix(coatCol, uBellyColor * furShade, creamFade * 0.88);

          // Lower leg stocking transition (below knee/hock)
          float legStocking = isLeg * (1.0 - smoothstep(uLegSpotEnd - 0.18, uLegSpotEnd + 0.25, vRestPos.y));
          float speckle = smoothstep(0.68, 0.78, noise3D(vRestPos * 18.0)) * 0.18;
          coatCol = mix(coatCol, uStockingColor * furShade, clamp(legStocking - speckle * (1.0 - legStocking), 0.0, 1.0));

          // Muzzle / nose dark velvety taupe fade (aRegion.w = muzzleFactor)
          float muzzleMask = smoothstep(0.08, 0.92, clamp(vRegion.w, 0.0, 1.0));
          // Blend spots out smoothly before muzzle turns velvety dark
          coatCol = mix(coatCol, mix(uLineColor * 0.82, uPatchColorA * 0.9, 0.45) * furShade, smoothstep(0.05, 0.45, vRegion.w) * 0.65);
          coatCol = mix(coatCol, uMuzzleColor * (0.94 + 0.12 * furFine), muzzleMask);

          // Ears & ossicones shading
          if (isHeadPart > 0.5) {
            float innerEar = smoothstep(0.10, 0.78, vRegion.z);
            float ossiTip = smoothstep(-0.15, -0.85, vRegion.z);
            // Outer ear / ossicone shaft warm tawny-tan, inner ear soft cream-pink, ossicone tip dark umber
            coatCol = mix(coatCol, mix(uPatchColorA, uLineColor, 0.42) * furShade, 0.85 * (1.0 - abs(vRegion.z)));
            coatCol = mix(coatCol, vec3(0.84, 0.72, 0.64), innerEar * 0.92);
            coatCol = mix(coatCol, vec3(0.16, 0.11, 0.08), ossiTip);
          }

          // Subtle savannah dust near hooves (y < 0.32)
          float dustMask = isLeg * (1.0 - smoothstep(0.06, 0.34, vRestPos.y));
          coatCol = mix(coatCol, uDustColor, dustMask * 0.32);

          diffuseColor.rgb *= coatCol;
          `
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          float furRough = mix(0.82, 0.71, patchMask);
          furRough = mix(furRough, 0.64, clamp(vRegion.w, 0.0, 1.0));
          roughnessFactor = clamp(furRough, 0.45, 0.95);
          `
        )
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          // Subtle backlit fur velvet sheen at grazing angles
          float NdotV = clamp(dot(normalize(geometryNormal), normalize(geometryViewDir)), 0.0, 1.0);
          float rim = pow(1.0 - NdotV, 3.2);
          reflectedLight.indirectDiffuse += diffuseColor.rgb * rim * 0.22;
          `
        );
    };

    material.customProgramCacheKey = () => 'giraffe-coat-v1';
    return material;
  }

  function updateCoatSpecies(material, speciesKey) {
    const preset = SUBSPECIES[speciesKey];
    if (!preset || !material.userData.coatUniforms) return;
    const u = material.userData.coatUniforms;
    u.uPatchColorA.value.copy(preset.patchColorA);
    u.uPatchColorB.value.copy(preset.patchColorB);
    u.uLineColor.value.copy(preset.lineColor);
    u.uBellyColor.value.copy(preset.bellyColor);
    u.uStockingColor.value.copy(preset.stockingColor);
    u.uMuzzleColor.value.copy(preset.muzzleColor);
    u.uLineWidth.value = preset.lineWidth;
    u.uEdgeSoftness.value = preset.edgeSoftness;
    u.uWarpAmp.value = preset.warpAmp;
    u.uLegSpotEnd.value = preset.legSpotEnd;
    u.uSpecies.value = preset.id;
  }

  // Procedural Eye Texture (rich dark espresso iris, horizontal-oval ungulate pupil, limbal ring)
  function createEyeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const cx = 256;
    const cy = 256;

    // Dark warm sclera / conjunctiva edge
    ctx.fillStyle = '#241a14';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle warm-amber sclera ring
    const scleraGrad = ctx.createRadialGradient(cx, cy, 110, cx, cy, 240);
    scleraGrad.addColorStop(0.0, '#4e2f1b');
    scleraGrad.addColorStop(0.65, '#3b2416');
    scleraGrad.addColorStop(1.0, '#1e1410');
    ctx.fillStyle = scleraGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 240, 0, Math.PI * 2);
    ctx.fill();

    // Rich amber-espresso iris with radial fibers
    const irisGrad = ctx.createRadialGradient(cx, cy, 35, cx, cy, 175);
    irisGrad.addColorStop(0.0, '#4f2c16');
    irisGrad.addColorStop(0.5, '#7a4522');
    irisGrad.addColorStop(0.85, '#4d2b15');
    irisGrad.addColorStop(1.0, '#24140b');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 165, 0, Math.PI * 2);
    ctx.fill();

    // Radial iris striations
    for (let i = 0; i < 180; i++) {
      const ang = (i / 180) * Math.PI * 2;
      const r0 = 55 + (i % 5) * 6;
      const r1 = 152 - (i % 3) * 8;
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(130, 78, 38, 0.28)' : 'rgba(26, 13, 7, 0.25)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.stroke();
    }

    // Horizontal-oval ungulate pupil
    ctx.fillStyle = '#070505';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 78, 48, 0, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function createHoofMaterial() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#3a3029');
    grad.addColorStop(0.45, '#2b241f');
    grad.addColorStop(0.85, '#352c25');
    grad.addColorStop(1.0, '#5a4a3c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Keratin vertical striations + subtle horizontal growth ridges
    for (let x = 0; x < 256; x += 3) {
      const alpha = 0.04 + ((x * 37) % 10) * 0.008;
      ctx.fillStyle = x % 6 === 0 ? `rgba(255,245,230,${alpha})` : `rgba(10,8,6,${alpha})`;
      ctx.fillRect(x, 0, 2, 256);
    }
    for (let y = 20; y < 240; y += 26) {
      ctx.fillStyle = 'rgba(15,12,10,0.16)';
      ctx.fillRect(0, y, 256, 3);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;

    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.48,
      metalness: 0.05
    });
  }

  function createHairMaterial(baseHex = '#2c180c', tipHex = '#140b06') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 68; i++) {
      const x = 14 + (i / 68) * 228 + ((i * 13) % 5 - 2);
      const baseW = 1.9 + (i % 3) * 0.7;
      const topY = 12 + ((i * 37) % 85) + Math.abs(i - 34) * 1.6;
      const g = ctx.createLinearGradient(x, 256, x, topY);
      g.addColorStop(0.0, baseHex);
      g.addColorStop(0.55, tipHex);
      g.addColorStop(1.0, 'rgba(20,11,6,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - baseW, 256);
      ctx.lineTo(x + baseW, 256);
      ctx.lineTo(x + ((i % 3) - 1) * 5, topY);
      ctx.closePath();
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: tex,
      alphaTest: 0.25,
      side: THREE.DoubleSide,
      roughness: 0.88,
      metalness: 0.0
    });
  }

  G.CoatShader = {
    SUBSPECIES,
    createCoatMaterial,
    updateCoatSpecies,
    createEyeTexture,
    createHoofMaterial,
    createHairMaterial
  };
})(window);
