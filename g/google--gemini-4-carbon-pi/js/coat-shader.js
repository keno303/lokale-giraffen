(function () {
  'use strict';

  const GS = (window.GiraffeSim = window.GiraffeSim || {});

  const SUBSPECIES_PRESETS = {
    reticulated: {
      name: 'Reticulated (G. c. reticulata)',
      patchInner: new THREE.Color('#863514'),
      patchEdge: new THREE.Color('#5a2009'),
      channelColor: new THREE.Color('#e4cca0'),
      bellyColor: new THREE.Color('#ebd9b8'),
      stockingColor: new THREE.Color('#e3cea8'),
      muzzleColor: new THREE.Color('#473e38'),
      channelScale: 1.0,
      jaggedness: 0.020,
      innerSplit: 0.0
    },
    masai: {
      name: 'Masai (G. tippelskirchi)',
      patchInner: new THREE.Color('#4f2612'),
      patchEdge: new THREE.Color('#341709'),
      channelColor: new THREE.Color('#d9b173'),
      bellyColor: new THREE.Color('#e6cca0'),
      stockingColor: new THREE.Color('#dcc092'),
      muzzleColor: new THREE.Color('#433b36'),
      channelScale: 1.85,
      jaggedness: 0.095,
      innerSplit: 0.0
    },
    rothschild: {
      name: "Rothschild's (G. c. camelopardalis)",
      patchInner: new THREE.Color('#6a2f14'),
      patchEdge: new THREE.Color('#481d0b'),
      channelColor: new THREE.Color('#e8d2a6'),
      bellyColor: new THREE.Color('#f3ead8'),
      stockingColor: new THREE.Color('#f4ede0'),
      muzzleColor: new THREE.Color('#4a423c'),
      channelScale: 1.38,
      jaggedness: 0.052,
      innerSplit: 0.35
    }
  };

  const GLSL_NOISE_VORONOI = /* glsl */ `
    vec3 gsHash3(vec3 p) {
      p = vec3(
        dot(p, vec3(127.1, 311.7, 74.7)),
        dot(p, vec3(269.5, 183.3, 246.1)),
        dot(p, vec3(113.5, 271.9, 124.6))
      );
      return fract(sin(p) * 43758.5453123);
    }

    float gsHash1(vec3 p) {
      p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    float gsValueNoise(vec3 x) {
      vec3 i = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(
          mix(gsHash1(i + vec3(0,0,0)), gsHash1(i + vec3(1,0,0)), f.x),
          mix(gsHash1(i + vec3(0,1,0)), gsHash1(i + vec3(1,1,0)), f.x),
          f.y
        ),
        mix(
          mix(gsHash1(i + vec3(0,0,1)), gsHash1(i + vec3(1,0,1)), f.x),
          mix(gsHash1(i + vec3(0,1,1)), gsHash1(i + vec3(1,1,1)), f.x),
          f.y
        ),
        f.z
      );
    }

    float gsFbm(vec3 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 3; i++) {
        v += a * gsValueNoise(p);
        p = p * 2.07 + vec3(13.1, 7.7, 5.3);
        a *= 0.5;
      }
      return v;
    }

    // Exact 3D Voronoi edge distance (IQ technique):
    // returns vec3(edgeDist, cellHash, centerDist)
    vec3 gsVoronoiEdge(vec3 x) {
      vec3 n = floor(x);
      vec3 f = fract(x);

      vec3 mg = vec3(0.0);
      vec3 mr = vec3(0.0);
      float md = 8.0;
      float cellId = 0.0;

      for (int k = -1; k <= 1; k++) {
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec3 g = vec3(float(i), float(j), float(k));
            vec3 rnd = gsHash3(n + g);
            // Jitter 0.82 keeps polygons well-formed 5-7 sided biological cells
            vec3 o = 0.09 + 0.82 * rnd;
            vec3 r = g + o - f;
            float d = dot(r, r);
            if (d < md) {
              md = d;
              mr = r;
              mg = g;
              cellId = rnd.x * 0.6 + rnd.y * 0.4;
            }
          }
        }
      }

      float minEdge = 8.0;
      for (int k = -1; k <= 1; k++) {
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec3 g = vec3(float(i), float(j), float(k));
            vec3 diffG = g - mg;
            if (dot(diffG, diffG) > 0.0001) {
              vec3 rnd = gsHash3(n + g);
              vec3 o = 0.09 + 0.82 * rnd;
              vec3 r = g + o - f;
              vec3 rmr = r - mr;
              float lenRmr = length(rmr);
              if (lenRmr > 0.0001) {
                float d = dot(0.5 * (mr + r), rmr / lenRmr);
                minEdge = min(minEdge, d);
              }
            }
          }
        }
      }

      return vec3(minEdge, cellId, sqrt(md));
    }
  `;

  function createGiraffeCoatMaterial(initialSubspecies) {
    const preset = SUBSPECIES_PRESETS[initialSubspecies || 'reticulated'] || SUBSPECIES_PRESETS.reticulated;

    const uniforms = {
      uPatchInner: { value: preset.patchInner.clone() },
      uPatchEdge: { value: preset.patchEdge.clone() },
      uChannelColor: { value: preset.channelColor.clone() },
      uBellyColor: { value: preset.bellyColor.clone() },
      uStockingColor: { value: preset.stockingColor.clone() },
      uMuzzleColor: { value: preset.muzzleColor.clone() },
      uChannelScale: { value: preset.channelScale },
      uJaggedness: { value: preset.jaggedness },
      uInnerSplit: { value: preset.innerSplit }
    };

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.02,
      envMapIntensity: 0.65
    });

    mat.userData.coatUniforms = uniforms;
    mat.customProgramCacheKey = function () {
      return 'giraffe-coat-v1';
    };

    mat.onBeforeCompile = function (shader) {
      Object.assign(shader.uniforms, uniforms);

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          attribute vec3 aRestPos;
          attribute vec3 aCoatPos;
          attribute vec4 aCoatData;
          varying vec3 vRestPos;
          varying vec3 vCoatPos;
          varying vec4 vCoatData;
          `
        )
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `
          #include <begin_vertex>
          vRestPos = aRestPos;
          vCoatPos = aCoatPos;
          vCoatData = aCoatData;
          `
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          varying vec3 vRestPos;
          varying vec3 vCoatPos;
          varying vec4 vCoatData;

          uniform vec3 uPatchInner;
          uniform vec3 uPatchEdge;
          uniform vec3 uChannelColor;
          uniform vec3 uBellyColor;
          uniform vec3 uStockingColor;
          uniform vec3 uMuzzleColor;
          uniform float uChannelScale;
          uniform float uJaggedness;
          uniform float uInnerSplit;

          ${GLSL_NOISE_VORONOI}
          `
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */ `
          #include <color_fragment>

          float spotMask = clamp(vCoatData.y, 0.0, 1.0);
          float baseChanW = vCoatData.z * uChannelScale;
          float regionType = vCoatData.w;

          // Chirp-free integrated 3D anatomical Voronoi coordinate + organic domain warp
          vec3 sampleP = vCoatPos;
          vec3 warp = vec3(
            gsFbm(sampleP * 0.52 + vec3(2.1, 5.3, 8.7)) - 0.5,
            gsFbm(sampleP * 0.52 + vec3(19.4, 3.2, 11.1)) - 0.5,
            gsFbm(sampleP * 0.52 + vec3(7.8, 27.1, 4.6)) - 0.5
          );
          vec3 warpedP = sampleP + warp * 0.40;

          vec3 vor = gsVoronoiEdge(warpedP);
          float edgeDist = vor.x;
          float cellHash = vor.y;
          float centerDist = vor.z;

          // Edge perturbation for Masai oak-leaf / natural follicle irregularity
          float edgeNoise = (gsFbm(sampleP * 2.9 + vec3(41.0)) - 0.5) * 2.0;
          float microFurEdge = (gsValueNoise(vRestPos * vec3(135.0, 65.0, 135.0)) - 0.5) * 0.018;

          // Where spotMask fades toward belly/stockings, widen channels so spots shrink organically into smaller islets!
          float maskShrink = (1.0 - spotMask) * 0.34;
          float effectiveChan = baseChanW + maskShrink + edgeNoise * uJaggedness + microFurEdge;

          float inPatch = smoothstep(effectiveChan - 0.022, effectiveChan + 0.026, edgeDist) * smoothstep(0.04, 0.24, spotMask);

          // Optional Rothschild faint inner patch split vein
          if (uInnerSplit > 0.01) {
            float vein = abs(gsValueNoise(sampleP * 1.45 + vec3(9.2)) - 0.5);
            float splitMask = (1.0 - smoothstep(0.0, 0.032, vein)) * uInnerSplit * step(0.55, cellHash);
            inPatch *= (1.0 - splitMask * 0.72);
          }

          // Rich patch color: warm chestnut interior, deeper dark umber near border, per-cell biological variation
          float borderGrad = smoothstep(effectiveChan, effectiveChan + 0.22, edgeDist);
          vec3 patchCol = mix(uPatchEdge, uPatchInner, borderGrad);
          patchCol *= (0.86 + 0.28 * cellHash);

          // Directional short-hair fur grain striations
          vec3 furCoord = vec3(vRestPos.x * 190.0, vRestPos.y * 72.0 + vRestPos.z * 38.0, vRestPos.z * 190.0);
          float furGrain = gsValueNoise(furCoord) * 0.5 + gsValueNoise(furCoord * 2.3) * 0.5;
          patchCol *= (0.93 + 0.14 * furGrain);

          // Ground coat transitions from warm reticulation channel -> creamy belly / lower-leg stockings
          float isLowerLeg = 1.0 - smoothstep(0.75, 1.32, vRestPos.y);
          vec3 lightGround = mix(uChannelColor, uBellyColor, clamp(1.0 - spotMask, 0.0, 1.0));
          lightGround = mix(lightGround, uStockingColor, isLowerLeg * (1.0 - spotMask));
          lightGround *= (0.94 + 0.11 * furGrain);

          // Subtle savannah red-ochre dust near lower pasterns / hooves
          float pasternDust = (1.0 - smoothstep(0.11, 0.52, vRestPos.y)) * 0.26;
          lightGround = mix(lightGround, vec3(0.66, 0.50, 0.35), pasternDust);

          vec3 finalHide = mix(lightGround, patchCol, inPatch);

          // Region overrides:
          // regionType > 0.0 && <= 1.0: smooth blend into velvety dark greyish-taupe muzzle/lips/eyelids
          float muzzleBlend = clamp(regionType, 0.0, 1.0);
          if (muzzleBlend > 0.001) {
            float skinPore = gsValueNoise(vRestPos * 260.0);
            vec3 muz = uMuzzleColor * (0.90 + 0.18 * skinPore);
            // Soft pinkish-grey inner nostril / lip rim hint
            finalHide = mix(finalHide, muz, muzzleBlend);
          }

          // regionType > 1.0: inner ear concave pale cream-pink fur (1.0 -> 2.0)
          if (regionType > 1.001) {
            float earIn = clamp(regionType - 1.0, 0.0, 1.0);
            vec3 innerEarCol = mix(vec3(0.84, 0.74, 0.68), vec3(0.95, 0.92, 0.87), furGrain);
            finalHide = mix(finalHide, innerEarCol, earIn);
          }

          // regionType < 0.0: ossicone dark tufted black-brown hair knob (0.0 -> -1.0)
          if (regionType < -0.001) {
            float knobBlend = clamp(-regionType, 0.0, 1.0);
            vec3 knobCol = vec3(0.09, 0.065, 0.05) * (0.85 + 0.35 * furGrain);
            finalHide = mix(finalHide, knobCol, knobBlend);
          }

          diffuseColor.rgb *= finalHide;
          `
        )
        .replace(
          '#include <roughnessmap_fragment>',
          /* glsl */ `
          #include <roughnessmap_fragment>
          // Muzzle/eyelid skin is slightly smoother/velvety; dark ossicone hair rougher
          float rMuz = clamp(vCoatData.w, 0.0, 1.0);
          roughnessFactor = mix(0.79, 0.52, rMuz);
          `
        )
        .replace(
          '#include <normal_fragment_maps>',
          /* glsl */ `
          #include <normal_fragment_maps>
          // Tactile micro-fur grain + subtle biological raised-hair relief on dark thermoregulatory patches!
          float patchRelief = smoothstep(uChannelScale * vCoatData.z - 0.015, uChannelScale * vCoatData.z + 0.035, gsVoronoiEdge(vCoatPos).x) * clamp(vCoatData.y, 0.0, 1.0);
          float bumpSignal = gsValueNoise(vec3(vRestPos.x * 175.0, vRestPos.y * 68.0, vRestPos.z * 175.0)) * 0.72 + patchRelief * 0.45;
          vec3 dpdx = dFdx(vViewPosition);
          vec3 dpdy = dFdy(vViewPosition);
          float dbdx = dFdx(bumpSignal);
          float dbdy = dFdy(bumpSignal);
          vec3 surfGrad = sign(determinant(mat2(dpdx.xy, dpdy.xy))) * (dbdx * cross(normal, dpdy) + dbdy * cross(dpdx, normal));
          normal = normalize(normal - surfGrad * 0.042);
          `
        )
        .replace(
          '#include <dithering_fragment>',
          /* glsl */ `
          // Subtle ungulate short-coat grazing velvet rim sheen
          float fresnelFur = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.6);
          gl_FragColor.rgb += diffuseColor.rgb * fresnelFur * 0.16;
          #include <dithering_fragment>
          `
        );
    };

    mat.setSubspecies = function (key) {
      const p = SUBSPECIES_PRESETS[key];
      if (!p) return;
      uniforms.uPatchInner.value.copy(p.patchInner);
      uniforms.uPatchEdge.value.copy(p.patchEdge);
      uniforms.uChannelColor.value.copy(p.channelColor);
      uniforms.uBellyColor.value.copy(p.bellyColor);
      uniforms.uStockingColor.value.copy(p.stockingColor);
      uniforms.uMuzzleColor.value.copy(p.muzzleColor);
      uniforms.uChannelScale.value = p.channelScale;
      uniforms.uJaggedness.value = p.jaggedness;
      uniforms.uInnerSplit.value = p.innerSplit;
    };

    return mat;
  }

  // Procedural CanvasTexture for glossy dark brown giraffe eye (horizontal-oval ungulate pupil + rich dark chestnut iris)
  function createEyeMaterial() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Sclera (darkly pigmented margins in giraffes so white rarely shows except far periphery)
    ctx.fillStyle = '#2d211b';
    ctx.fillRect(0, 0, size, size);

    // Polar UV mapping: rich warm amber-chestnut iris + horizontal ungulate pupil + wet sky glint
    const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size * 0.48);
    grad.addColorStop(0.0, '#050303');
    grad.addColorStop(0.28, '#0b0605');
    grad.addColorStop(0.42, '#4a2410');
    grad.addColorStop(0.68, '#633116');
    grad.addColorStop(0.86, '#261108');
    grad.addColorStop(1.0, '#160c08');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Subtle iris radial fibers + warm lower sunlit caustic crescent
    ctx.save();
    ctx.translate(size / 2, size / 2);
    for (let i = 0; i < 120; i++) {
      const ang = (i / 120) * Math.PI * 2;
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(135, 72, 30, 0.28)' : 'rgba(18, 9, 5, 0.25)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * 26, Math.sin(ang) * 20);
      ctx.lineTo(Math.cos(ang) * 95, Math.sin(ang) * 95);
      ctx.stroke();
    }
    // Ungulate horizontal oblong pupil
    ctx.fillStyle = '#040303';
    ctx.beginPath();
    ctx.ellipse(0, 0, 40, 21, 0, 0, Math.PI * 2);
    ctx.fill();

    // Soft corneal sky-window catchlight glint on upper-anterior quadrant
    const glint = ctx.createRadialGradient(-22, -26, 1, -22, -26, 16);
    glint.addColorStop(0.0, 'rgba(255, 250, 240, 0.92)');
    glint.addColorStop(0.45, 'rgba(245, 235, 220, 0.38)');
    glint.addColorStop(1.0, 'rgba(245, 235, 220, 0.0)');
    ctx.fillStyle = glint;
    ctx.beginPath();
    ctx.arc(-22, -26, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    return new THREE.MeshPhysicalMaterial({
      map: tex,
      roughness: 0.04,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      reflectivity: 1.0,
      envMapIntensity: 2.25
    });
  }

  // Keratinous cloven hoof material with vertical horn tubules & earthy wear
  function createHoofMaterial() {
    const w = 256, h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.0, '#2f2a27');
    g.addColorStop(0.55, '#1f1c1a');
    g.addColorStop(0.88, '#2b2520');
    g.addColorStop(1.0, '#4f4134'); // sole/ground dust wear
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (let x = 0; x < w; x++) {
      const v = 22 + ((x * 37) % 19);
      ctx.fillStyle = `rgba(${v},${v - 2},${v - 4},0.22)`;
      ctx.fillRect(x, 0, 1 + (x % 2), h);
    }
    // Subtle horizontal growth rings
    for (let y = 18; y < h; y += 26) {
      ctx.fillStyle = 'rgba(10, 9, 8, 0.18)';
      ctx.fillRect(0, y, w, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.46,
      metalness: 0.05,
      bumpMap: tex,
      bumpScale: 0.004
    });
  }

  // Feathered hair card material for erect neck mane & black tail switch
  function createHairMaterial(options) {
    const opts = options || {};
    const baseHex = opts.baseColor || '#3e1b0c';
    const tipHex = opts.tipColor || '#220e06';
    const isTail = !!opts.isTail;

    const w = 128, h = 256;
    const cColor = document.createElement('canvas');
    cColor.width = w;
    cColor.height = h;
    const ctx = cColor.getContext('2d');

    const cAlpha = document.createElement('canvas');
    cAlpha.width = w;
    cAlpha.height = h;
    const actx = cAlpha.getContext('2d');
    actx.fillStyle = '#000';
    actx.fillRect(0, 0, w, h);

    const rng = GS.Math.mulberry32(isTail ? 88421 : 33109);

    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0.0, baseHex);
    grad.addColorStop(0.65, baseHex);
    grad.addColorStop(1.0, tipHex);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Draw individual coarse ungulate hair bristles from root (y=h) to tip (y=0)
    const strandCount = isTail ? 170 : 140;
    for (let i = 0; i < strandCount; i++) {
      const x0 = (i / strandCount) * w + (rng() - 0.5) * 3.0;
      const tipY = isTail ? rng() * h * 0.28 : rng() * h * 0.24;
      const sway = (rng() - 0.5) * (isTail ? 16 : 7);

      const shade = rng();
      if (isTail) {
        const lum = Math.floor(14 + shade * 24);
        ctx.strokeStyle = `rgb(${lum + 4},${lum + 2},${lum})`;
      } else {
        // Giraffe neck mane blends rich dark chestnut, burnt umber, and occasional pale buff base hairs
        const r = Math.floor(42 + shade * 68);
        const g2 = Math.floor(18 + shade * 32);
        const b = Math.floor(9 + shade * 16);
        ctx.strokeStyle = `rgb(${r},${g2},${b})`;
      }
      ctx.lineWidth = isTail ? 1.5 : 1.7;
      ctx.beginPath();
      ctx.moveTo(x0, h);
      ctx.quadraticCurveTo(x0 + sway * 0.4, h * 0.45, x0 + sway, tipY);
      ctx.stroke();

      // Alpha mask bristle with side feathering so card edges vanish naturally
      const edgeFade = Math.sin(clamp01(x0 / w) * Math.PI);
      const alphaVal = Math.floor(clamp01(edgeFade * 1.45) * 255);
      actx.strokeStyle = `rgb(${alphaVal},${alphaVal},${alphaVal})`;
      actx.lineWidth = isTail ? 2.1 : 2.4;
      actx.beginPath();
      actx.moveTo(x0, h);
      actx.quadraticCurveTo(x0 + sway * 0.4, h * 0.45, x0 + sway, tipY);
      actx.stroke();
    }

    function clamp01(v) {
      return v < 0 ? 0 : v > 1 ? 1 : v;
    }

    const colorTex = new THREE.CanvasTexture(cColor);
    colorTex.colorSpace = THREE.SRGBColorSpace;
    const alphaTex = new THREE.CanvasTexture(cAlpha);

    return new THREE.MeshStandardMaterial({
      map: colorTex,
      alphaMap: alphaTex,
      alphaTest: 0.36,
      side: THREE.DoubleSide,
      roughness: isTail ? 0.62 : 0.82,
      metalness: 0.02
    });
  }

  GS.Coat = {
    SUBSPECIES_PRESETS,
    createGiraffeCoatMaterial,
    createEyeMaterial,
    createHoofMaterial,
    createHairMaterial
  };
})();
