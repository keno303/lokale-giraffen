(function () {
  'use strict';

  const GS = (window.GiraffeSim = window.GiraffeSim || {});
  const M = GS.Math;

  const LIGHTING_MOODS = {
    golden: {
      name: 'Golden Hour',
      sunAzimuth: 0.95,
      sunElevation: 0.42, // ~24 deg warm golden angle
      sunColor: new THREE.Color('#ffe2b8'),
      sunIntensity: 2.80,
      hemiSky: new THREE.Color('#ffebd2'),
      hemiGround: new THREE.Color('#9c7248'),
      hemiIntensity: 0.98,
      skyZenith: new THREE.Color('#2d629e'),
      skyHorizon: new THREE.Color('#e8be8b'),
      skySunGlow: new THREE.Color('#ffe5ba'),
      fogColor: new THREE.Color('#e3be90'),
      fogDensity: 0.0020,
      exposure: 1.04
    },
    midday: {
      name: 'Serengeti Sun',
      sunAzimuth: 0.65,
      sunElevation: 1.02, // ~58 deg high equatorial sun
      sunColor: new THREE.Color('#fff6e5'),
      sunIntensity: 3.05,
      hemiSky: new THREE.Color('#d8ecff'),
      hemiGround: new THREE.Color('#b0895a'),
      hemiIntensity: 1.05,
      skyZenith: new THREE.Color('#245ea8'),
      skyHorizon: new THREE.Color('#dfeaf2'),
      skySunGlow: new THREE.Color('#fff9eb'),
      fogColor: new THREE.Color('#dfd8c8'),
      fogDensity: 0.0016,
      exposure: 0.99
    },
    overcast: {
      name: 'Soft Overcast',
      sunAzimuth: 0.80,
      sunElevation: 0.78,
      sunColor: new THREE.Color('#fff4e8'),
      sunIntensity: 1.45,
      hemiSky: new THREE.Color('#e8edf2'),
      hemiGround: new THREE.Color('#9e8364'),
      hemiIntensity: 1.55,
      skyZenith: new THREE.Color('#8fa3b8'),
      skyHorizon: new THREE.Color('#dfd9ce'),
      skySunGlow: new THREE.Color('#f7efe2'),
      fogColor: new THREE.Color('#dad3c7'),
      fogDensity: 0.0020,
      exposure: 1.06
    }
  };

  function evalTrailX(z) {
    return Math.sin(z * 0.022) * 1.65 + Math.sin(z * 0.009 + 1.1) * 1.15;
  }

  function groundHeight(x, z) {
    const tx = evalTrailX(z);
    const distFromTrail = Math.abs(x - tx);
    // Gentle long-wavelength rolling savannah along trail; taller kopjes/mounds away from trail
    const longRoll = Math.sin(z * 0.031) * 0.09 + Math.cos(z * 0.017 + x * 0.012) * 0.07;
    const offTrailBlend = M.smoothstep(2.6, 16.0, distFromTrail);
    const hills =
      (M.fbm3D(x * 0.028, 0.5, z * 0.028, 3) * 2.4 +
        Math.max(0, M.noise3D(x * 0.055 + 11.2, 1.3, z * 0.055)) * 1.8) *
      offTrailBlend;
    // Subtle concave wear (-1.8 cm) right along center of sandy animal track
    const trailDip = -0.018 * (1.0 - M.smoothstep(0.0, 1.4, distFromTrail));
    return longRoll + hills + trailDip;
  }

  function createSkyDome(initialMood) {
    const mood = LIGHTING_MOODS[initialMood] || LIGHTING_MOODS.golden;
    const sunDir = new THREE.Vector3();
    sunDir.setFromSphericalCoords(1, Math.PI * 0.5 - mood.sunElevation, mood.sunAzimuth);

    const uniforms = {
      uZenith: { value: mood.skyZenith.clone() },
      uHorizon: { value: mood.skyHorizon.clone() },
      uSunGlow: { value: mood.skySunGlow.clone() },
      uSunDir: { value: sunDir.clone() }
    };

    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorldDir;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunGlow;
        uniform vec3 uSunDir;

        void main() {
          vec3 d = normalize(vWorldDir);
          float h = clamp(d.y, -0.15, 1.0);
          float horizonT = pow(1.0 - max(0.0, h), 2.35);
          vec3 col = mix(uZenith, uHorizon, horizonT);

          // Below horizon warm savannah bounce (used when baking PMREM environment map!)
          if (h < 0.0) {
            col = mix(uHorizon, vec3(0.58, 0.43, 0.27), clamp(-h * 4.5, 0.0, 1.0));
          }

          // Mie forward scattering solar aureole + soft sun disc
          float cosSun = max(0.0, dot(d, normalize(uSunDir)));
          col += uSunGlow * pow(cosSun, 9.0) * 0.28;
          col += uSunGlow * pow(cosSun, 180.0) * 0.85;
          col += vec3(1.0, 0.97, 0.90) * smoothstep(0.99935, 0.99985, cosSun) * 2.2;

          // Subtle high wispy savannah cirrus bands
          float cloudBand = sin(d.x * 9.0 + d.z * 4.0) * 0.5 + 0.5;
          float cirrus = smoothstep(0.12, 0.55, h) * (1.0 - smoothstep(0.55, 0.92, h)) * pow(cloudBand, 3.0) * 0.045;
          col = mix(col, uSunGlow, cirrus);

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(420, 36, 24), skyMat);
    mesh.frustumCulled = false;
    return { mesh, uniforms };
  }

  // Endless world-snapped Savannah Terrain with shader-driven sandy trail, ochre soil, pebbles & dry grass tint
  function createSavannahTerrain() {
    const size = 156;
    const segs = 130;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const baseX = new Float32Array(geo.attributes.position.count);
    const baseZ = new Float32Array(geo.attributes.position.count);
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      baseX[i] = posAttr.getX(i);
      baseZ[i] = posAttr.getZ(i);
    }

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.40
    });

    mat.onBeforeCompile = function (shader) {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          varying vec3 vSavWorld;
          varying vec2 vTileLocal;
          `
        )
        .replace(
          '#include <worldpos_vertex>',
          /* glsl */ `
          #include <worldpos_vertex>
          vSavWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vTileLocal = transformed.xz;
          `
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          varying vec3 vSavWorld;
          varying vec2 vTileLocal;

          float savHash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }
          float savNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(savHash(i), savHash(i + vec2(1.0, 0.0)), f.x),
              mix(savHash(i + vec2(0.0, 1.0)), savHash(i + vec2(1.0, 1.0)), f.x),
              f.y
            );
          }
          `
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */ `
          #include <color_fragment>
          float trailCenter = sin(vSavWorld.z * 0.022) * 1.65 + sin(vSavWorld.z * 0.009 + 1.1) * 1.15;
          float dTrail = abs(vSavWorld.x - trailCenter);

          float nMacro = savNoise(vSavWorld.xz * 0.14);
          float nMed   = savNoise(vSavWorld.xz * 0.85);
          float nFine  = savNoise(vSavWorld.xz * 6.5);
          float nGrit  = savNoise(vSavWorld.xz * 28.0);

          // Worn East African red-ochre sandy game trail vs dry golden-olive savannah turf
          vec3 sandyTrail = mix(vec3(0.74, 0.56, 0.38), vec3(0.66, 0.47, 0.30), nMed);
          sandyTrail *= (0.92 + 0.16 * nGrit);

          vec3 dryTurf = mix(vec3(0.64, 0.55, 0.34), vec3(0.51, 0.45, 0.27), nMacro);
          dryTurf = mix(dryTurf, vec3(0.70, 0.52, 0.34), smoothstep(0.56, 0.82, nMed) * 0.55);
          dryTurf *= (0.90 + 0.18 * nFine);

          float trailBlend = smoothstep(0.75, 2.35 + nMed * 0.8, dTrail);
          vec3 groundCol = mix(sandyTrail, dryTurf, trailBlend);
          // Smooth radial blend at outer edge of 156m terrain tile into distant plain skirt color!
          float edgeDist = max(abs(vTileLocal.x), abs(vTileLocal.y));
          float skirtFade = smoothstep(56.0, 76.0, edgeDist);
          groundCol = mix(groundCol, vec3(0.58, 0.50, 0.31), skirtFade);
          diffuseColor.rgb *= groundCol;
          `
        );
    };

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    const cellStep = size / segs;
    let lastSnapX = Infinity;
    let lastSnapZ = Infinity;

    function updateAround(wx, wz) {
      const snapX = Math.floor(wx / cellStep) * cellStep;
      const snapZ = Math.floor(wz / cellStep) * cellStep;
      if (snapX === lastSnapX && snapZ === lastSnapZ) return;
      lastSnapX = snapX;
      lastSnapZ = snapZ;

      mesh.position.set(snapX, 0, snapZ);
      for (let i = 0; i < posAttr.count; i++) {
        const lx = baseX[i];
        const lz = baseZ[i];
        const vx = lx + snapX;
        const vz = lz + snapZ;
        // Smoothly settle outer border of terrain tile to match outerSkirt (y = -0.06) with zero gap!
        const borderT = M.smoothstep(54.0, 74.0, Math.max(Math.abs(lx), Math.abs(lz)));
        const h = M.lerp(groundHeight(vx, vz), -0.06, borderT);
        posAttr.setY(i, h);
      }
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();
    }

    updateAround(0, 0);
    return { mesh, updateAround };
  }

  /**
   * Sculpted Flat-Topped East African Umbrella Thorn Acacia (Vachellia tortilis)
   * Returns a single reusable pair of trunk + canopy geometries for fast instancing/cloning!
   */
  function buildAcaciaPrefabs() {
    const variants = [];
    for (let v = 0; v < 3; v++) {
      const rng = M.mulberry32(5100 + v * 977);
      const branchGeos = [];
      const canopyGeos = [];

      const trunkHeight = 1.6 + rng() * 0.55;
      // Main gnarled lower trunk
      branchGeos.push(
        buildTaperedLimbTube(
          new THREE.Vector3(0, -0.15, 0),
          new THREE.Vector3((rng() - 0.5) * 0.25, trunkHeight * 0.55, (rng() - 0.5) * 0.25),
          new THREE.Vector3((rng() - 0.5) * 0.2, trunkHeight, (rng() - 0.5) * 0.2),
          0.22,
          0.14,
          7,
          8
        )
      );

      const bCount = 5 + (v % 2);
      const forkTop = new THREE.Vector3(0, trunkHeight * 0.95, 0);
      const canopyTopY = trunkHeight + 2.35 + rng() * 0.75;

      for (let b = 0; b < bCount; b++) {
        const ang = (b / bCount) * Math.PI * 2 + (rng() - 0.5) * 0.45;
        const spread = 2.1 + rng() * 1.35;
        const endY = canopyTopY - 0.15 + (rng() - 0.5) * 0.32;
        const endPt = new THREE.Vector3(Math.cos(ang) * spread, endY, Math.sin(ang) * spread);
        const midPt = new THREE.Vector3(
          Math.cos(ang) * spread * 0.44 + (rng() - 0.5) * 0.3,
          M.lerp(forkTop.y, endY, 0.52),
          Math.sin(ang) * spread * 0.44 + (rng() - 0.5) * 0.3
        );
        branchGeos.push(buildTaperedLimbTube(forkTop, midPt, endPt, 0.105, 0.036, 7, 6));

        // Secondary twig fork
        const subAng = ang + (rng() > 0.5 ? 0.38 : -0.38);
        const subEnd = new THREE.Vector3(
          Math.cos(subAng) * (spread * 0.82),
          endY - 0.12,
          Math.sin(subAng) * (spread * 0.82)
        );
        branchGeos.push(
          buildTaperedLimbTube(
            midPt,
            midPt.clone().lerp(subEnd, 0.5),
            subEnd,
            0.055,
            0.022,
            4,
            5
          )
        );

        // Cluster of feathery overlapping umbrella foliage cloudlets atop each spreading limb!
        const subPads = 3;
        for (let sp = 0; sp < subPads; sp++) {
          const sa = rng() * Math.PI * 2;
          const sr = sp === 0 ? 0 : 0.65 + rng() * 0.55;
          canopyGeos.push(
            buildUmbrellaPad(
              endPt.x + Math.cos(sa) * sr,
              endPt.y + 0.08 + (rng() - 0.5) * 0.12,
              endPt.z + Math.sin(sa) * sr,
              0.92 + rng() * 0.48,
              0.17 + rng() * 0.06,
              rng
            )
          );
        }
      }

      // Broad crowning central flat umbrella canopy tier (airy overlapping leaflets)
      for (let cp = 0; cp < 6; cp++) {
        const ca = (cp / 6) * Math.PI * 2 + rng() * 0.4;
        const cr = cp === 0 ? 0 : 0.95 + rng() * 0.65;
        canopyGeos.push(
          buildUmbrellaPad(
            Math.cos(ca) * cr,
            canopyTopY + 0.20 + (cp % 2) * 0.07,
            Math.sin(ca) * cr,
            1.28 + rng() * 0.45,
            0.19 + rng() * 0.05,
            rng
          )
        );
      }

      variants.push({
        trunkGeo: mergePlainGeos(branchGeos),
        canopyGeo: mergePlainGeos(canopyGeos)
      });
    }
    return variants;
  }

  function buildTaperedLimbTube(p0, p1, p2, r0, r1, rings, segs) {
    const pos = [];
    const idx = [];
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    const up = new THREE.Vector3(0, 1, 0);
    const tan = new THREE.Vector3();
    const n1 = new THREE.Vector3();
    const n2 = new THREE.Vector3();
    const pt = new THREE.Vector3();

    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      curve.getPoint(t, pt);
      curve.getTangent(t, tan).normalize();
      n1.crossVectors(up, tan);
      if (n1.lengthSq() < 1e-4) n1.set(1, 0, 0);
      n1.normalize();
      n2.crossVectors(tan, n1).normalize();
      const r = M.lerp(r0, r1, t);

      for (let j = 0; j <= segs; j++) {
        const phi = (j / segs) * Math.PI * 2;
        const c = Math.cos(phi), s = Math.sin(phi);
        pos.push(
          pt.x + r * (n1.x * c + n2.x * s),
          pt.y + r * (n1.y * c + n2.y * s),
          pt.z + r * (n1.z * c + n2.z * s)
        );
      }
    }
    const stride = segs + 1;
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = i * stride + j;
        const b = (i + 1) * stride + j;
        const c = (i + 1) * stride + (j + 1);
        const d = i * stride + (j + 1);
        idx.push(a, b, d, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }

  function buildUmbrellaPad(cx, cy, cz, radiusXZ, radiusY, rng) {
    const g = new THREE.IcosahedronGeometry(1.0, 3);
    const pos = g.attributes.position;
    const cols = [];
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const lump = 0.80 + 0.34 * (M.noise3D(x * 2.8 + cx, y * 3.2, z * 2.8 + cz) * 0.5 + 0.5);
      // Flatten underside more than top for classic flat-topped East African acacia silhouette!
      const flatY = y < 0 ? y * radiusY * 0.52 : y * radiusY * 1.12;
      pos.setXYZ(i, cx + x * radiusXZ * lump, cy + flatY, cz + z * radiusXZ * lump);

      // Sunlit warm olive-sage top foliage, rich shaded olive underside
      const sunFactor = M.clamp(y * 0.5 + 0.5, 0, 1);
      const r = M.lerp(0.18, 0.38, sunFactor) * (0.92 + 0.16 * rng());
      const gr = M.lerp(0.24, 0.45, sunFactor) * (0.92 + 0.16 * rng());
      const b = M.lerp(0.10, 0.19, sunFactor);
      cols.push(r, gr, b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    return g;
  }

  function mergePlainGeos(geos) {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    let hasColor = geos[0] && !!geos[0].attributes.color;
    let offset = 0;

    for (let k = 0; k < geos.length; k++) {
      const g = geos[k];
      const p = g.attributes.position.array;
      const n = g.attributes.normal.array;
      const c = hasColor ? g.attributes.color.array : null;
      const ix = g.index ? g.index.array : null;

      for (let i = 0; i < p.length; i++) {
        positions.push(p[i]);
        normals.push(n[i]);
        if (hasColor) colors.push(c[i]);
      }
      if (ix) {
        for (let i = 0; i < ix.length; i++) indices.push(ix[i] + offset);
      } else {
        const count = p.length / 3;
        for (let i = 0; i < count; i++) indices.push(i + offset);
      }
      offset += p.length / 3;
    }

    const out = new THREE.BufferGeometry();
    out.setIndex(indices);
    out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    if (hasColor) out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return out;
  }

  // Instanced Golden Savannah Grass Field with GPU Wind Shader (wraps seamlessly around giraffe Z!)
  function createSavannahGrass(count) {
    const tuftGeos = [];
    const rngBlade = M.mulberry32(40409);
    const bladesPerTuft = 9;

    for (let b = 0; b < bladesPerTuft; b++) {
      const ang = (b / bladesPerTuft) * Math.PI * 2 + rngBlade() * 0.55;
      const tilt = 0.14 + rngBlade() * 0.34;
      const h = 0.24 + rngBlade() * 0.32;
      const w = 0.016;
      const radOffset = 0.015 + rngBlade() * 0.045;
      const dx = Math.cos(ang), dz = Math.sin(ang);
      const tx = -dz * w, tz = dx * w;

      const pos = [
        dx * radOffset - tx, 0.0, dz * radOffset - tz,
        dx * radOffset + tx, 0.0, dz * radOffset + tz,
        dx * (radOffset + h * tilt * 0.45) - tx * 0.55, h * 0.52, dz * (radOffset + h * tilt * 0.45) - tz * 0.55,
        dx * (radOffset + h * tilt * 0.45) + tx * 0.55, h * 0.52, dz * (radOffset + h * tilt * 0.45) + tz * 0.55,
        dx * (radOffset + h * tilt * 1.18), h, dz * (radOffset + h * tilt * 1.18)
      ];
      // Golden oat stalks: earthy olive-ochre root AO -> sunlit golden straw tip
      const col = [
        0.38, 0.33, 0.18,
        0.38, 0.33, 0.18,
        0.66, 0.55, 0.30,
        0.66, 0.55, 0.30,
        0.85, 0.73, 0.44
      ];
      const idx = [0, 1, 2, 1, 3, 2, 2, 3, 4];
      const bg = new THREE.BufferGeometry();
      bg.setIndex(idx);
      bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      bg.computeVertexNormals();
      tuftGeos.push(bg);
    }

    const tuftGeo = mergePlainGeos(tuftGeos);
    const windUniforms = { uTime: { value: 0 } };

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.0,
      side: THREE.DoubleSide
    });

    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = windUniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          uniform float uTime;
          `
        )
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `
          #include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 instWorld = instanceMatrix[3].xyz;
            float bend = clamp(transformed.y * 2.2, 0.0, 1.0);
            bend = bend * bend;
            float gust = sin(instWorld.z * 0.22 + instWorld.x * 0.15 + uTime * 2.15) * 0.075
                       + sin(instWorld.z * 0.65 - uTime * 3.4) * 0.028;
            transformed.x += gust * bend;
            transformed.z += gust * 0.55 * bend;
          #endif
          `
        );
    };

    const instMesh = new THREE.InstancedMesh(tuftGeo, mat, count);
    instMesh.castShadow = false;
    instMesh.receiveShadow = true;
    instMesh.frustumCulled = false;

    const rng = M.mulberry32(71717);
    const spanZ = 96;
    const slots = [];
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      // Place grass outside central sandy trail, denser in mid-ground clusters
      const side = rng() > 0.5 ? 1 : -1;
      const dist = 1.25 + Math.pow(rng(), 1.45) * 42.0;
      const zSlot = (rng() - 0.5) * spanZ;
      const scaleXZ = 0.75 + rng() * 0.85;
      const scaleY = 0.65 + rng() * 1.05;
      const rotY = rng() * Math.PI * 2;
      const wrapCount = 0;

      slots.push({ side, dist, zSlot, scaleXZ, scaleY, rotY, wrapCount: -9999 });
      color.setRGB(0.88 + rng() * 0.24, 0.86 + rng() * 0.22, 0.80 + rng() * 0.20);
      instMesh.setColorAt(i, color);
    }

    function updateAroundZ(centerZ, time) {
      windUniforms.uTime.value = time;
      let dirty = false;
      for (let i = 0; i < count; i++) {
        const sl = slots[i];
        const k = Math.round((centerZ - sl.zSlot) / spanZ);
        if (k !== sl.wrapCount) {
          sl.wrapCount = k;
          const wz = sl.zSlot + k * spanZ;
          const wx = evalTrailX(wz) + sl.side * sl.dist;
          const wy = groundHeight(wx, wz);
          dummy.position.set(wx, wy - 0.02, wz);
          dummy.rotation.set(0, sl.rotY, 0);
          dummy.scale.set(sl.scaleXZ, sl.scaleY, sl.scaleXZ);
          dummy.updateMatrix();
          instMesh.setMatrixAt(i, dummy.matrix);
          dirty = true;
        }
      }
      if (dirty) instMesh.instanceMatrix.needsUpdate = true;
    }

    updateAroundZ(0, 0);
    return { mesh: instMesh, updateAroundZ };
  }

  // Distant East African Rift Escarpment & Mt. Kilimanjaro Silhouette Ring
  function createHorizonMountains() {
    const segs = 160;
    const radius = 355;
    const pos = [];
    const col = [];
    const idx = [];

    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const ang = u * Math.PI * 2;
      const x = Math.sin(ang) * radius;
      const z = Math.cos(ang) * radius;

      // Iconic flat-topped volcanic massif (Kilimanjaro Kibo dome) ahead-left around ang ~ 0.32 rad
      const kiliDist = Math.abs(ang - 0.34);
      const kiliMassif =
        Math.exp(-Math.pow(kiliDist / 0.16, 2)) * 42.0 -
        Math.exp(-Math.pow(kiliDist / 0.045, 2)) * 6.5; // flat volcanic crater summit!
      const mawenzi = Math.exp(-Math.pow((ang - 0.56) / 0.055, 2)) * 22.0;
      const ridge =
        (M.fbm3D(Math.sin(ang) * 3.2, 0.2, Math.cos(ang) * 3.2, 4) * 0.5 + 0.5) * 18.0 + 3.5;

      const peakH = Math.max(2.0, ridge + kiliMassif + mawenzi);

      pos.push(x, -6.0, z);
      pos.push(x, peakH, z);

      // Atmospheric distant slate-violet / dusty-blue mountain silhouette + Kibo snow cap
      const snow = M.smoothstep(34.5, 39.5, peakH);
      col.push(0.32, 0.31, 0.38);
      col.push(
        M.lerp(0.28, 0.88, snow),
        M.lerp(0.30, 0.87, snow),
        M.lerp(0.42, 0.90, snow)
      );
    }

    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      idx.push(a, b, c, b, d, c);
    }

    const geo = new THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      fog: true
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  // Hoofprint Ring Buffer + Sunlit Dust Puff Particle System
  function createFootprintAndDustSystem(scene) {
    // Cloven hoofprint canvas texture (sunken dark paired artiodactyl pads + warm displaced sand rim)
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 96;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 96, 96);

    // Subtle outer raised sandy rim
    const outerRim = ctx.createRadialGradient(48, 48, 16, 48, 48, 42);
    outerRim.addColorStop(0.0, 'rgba(218, 178, 126, 0.0)');
    outerRim.addColorStop(0.65, 'rgba(224, 184, 132, 0.28)');
    outerRim.addColorStop(1.0, 'rgba(224, 184, 132, 0.0)');
    ctx.fillStyle = outerRim;
    ctx.fillRect(0, 0, 96, 96);

    for (let side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.translate(48 + side * 14, 49);
      ctx.scale(side, 1);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 21);
      g.addColorStop(0, 'rgba(54, 34, 18, 0.72)');
      g.addColorStop(0.68, 'rgba(68, 45, 25, 0.48)');
      g.addColorStop(1, 'rgba(68, 45, 25, 0.0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 22, 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const printTex = new THREE.CanvasTexture(c);
    printTex.colorSpace = THREE.SRGBColorSpace;
    const printGeo = new THREE.PlaneGeometry(0.20, 0.24);
    printGeo.rotateX(-Math.PI / 2);

    const maxPrints = 44;
    const prints = [];
    let printCursor = 0;
    for (let i = 0; i < maxPrints; i++) {
      const m = new THREE.MeshBasicMaterial({
        map: printTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2
      });
      const mesh = new THREE.Mesh(printGeo, m);
      mesh.visible = false;
      scene.add(mesh);
      prints.push({ mesh, age: 999 });
    }

    // Soft wispy Gaussian dust cloud sprites (zero hard geometric edges close up!)
    const dc = document.createElement('canvas');
    dc.width = 64;
    dc.height = 64;
    const dctx = dc.getContext('2d');
    const dg = dctx.createRadialGradient(32, 32, 1, 32, 32, 30);
    dg.addColorStop(0.0, 'rgba(232, 202, 162, 0.75)');
    dg.addColorStop(0.45, 'rgba(220, 186, 142, 0.32)');
    dg.addColorStop(1.0, 'rgba(220, 186, 142, 0.0)');
    dctx.fillStyle = dg;
    dctx.fillRect(0, 0, 64, 64);
    const dustTex = new THREE.CanvasTexture(dc);
    dustTex.colorSpace = THREE.SRGBColorSpace;

    const maxPuffs = 42;
    const puffs = [];
    let puffCursor = 0;
    for (let i = 0; i < maxPuffs; i++) {
      const pm = new THREE.SpriteMaterial({
        map: dustTex,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const mesh = new THREE.Sprite(pm);
      mesh.visible = false;
      scene.add(mesh);
      puffs.push({
        mesh,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1
      });
    }

    function spawnHoofStrike(limbKey, wx, wy, wz, yaw) {
      // 1. Stamp cloven hoofprint conformed to local terrain slope (1.6 cm clearance prevents z-fighting/clipping)
      const pr = prints[printCursor];
      printCursor = (printCursor + 1) % maxPrints;
      const dhZ = (groundHeight(wx, wz + 0.12) - groundHeight(wx, wz - 0.12)) / 0.24;
      const dhX = (groundHeight(wx + 0.12, wz) - groundHeight(wx - 0.12, wz)) / 0.24;
      pr.mesh.position.set(wx, wy + 0.016, wz);
      pr.mesh.rotation.order = 'YXZ';
      pr.mesh.rotation.set(-Math.atan(dhZ), yaw, Math.atan(dhX));
      pr.mesh.material.opacity = 0.85;
      pr.mesh.visible = true;
      pr.age = 0;

      // 2. Spawn 4 soft golden dust motes drifting out from hoof impact
      for (let k = 0; k < 4; k++) {
        const pf = puffs[puffCursor];
        puffCursor = (puffCursor + 1) % maxPuffs;
        const ang = (k / 4) * Math.PI * 2 + (wx * 7.3 + wz * 3.1);
        pf.mesh.position.set(wx + Math.cos(ang) * 0.04, wy + 0.035, wz + Math.sin(ang) * 0.04);
        pf.mesh.scale.setScalar(0.65);
        pf.vx = Math.cos(ang) * (0.16 + (k % 2) * 0.08) + 0.08;
        pf.vy = 0.16 + (k % 3) * 0.05;
        pf.vz = Math.sin(ang) * 0.16 - 0.10;
        pf.life = 0;
        pf.maxLife = 0.85 + (k % 3) * 0.22;
        pf.mesh.material.opacity = 0.28;
        pf.mesh.visible = true;
      }
    }

    function update(dt) {
      for (let i = 0; i < maxPrints; i++) {
        const pr = prints[i];
        if (!pr.mesh.visible) continue;
        pr.age += dt;
        if (pr.age > 26) {
          pr.mesh.visible = false;
        } else if (pr.age > 18) {
          pr.mesh.material.opacity = 0.72 * (1 - (pr.age - 18) / 8);
        }
      }

      for (let i = 0; i < maxPuffs; i++) {
        const pf = puffs[i];
        if (!pf.mesh.visible) continue;
        pf.life += dt;
        if (pf.life >= pf.maxLife) {
          pf.mesh.visible = false;
          continue;
        }
        const t = pf.life / pf.maxLife;
        pf.mesh.position.x += pf.vx * dt;
        pf.mesh.position.y += pf.vy * dt;
        pf.mesh.position.z += pf.vz * dt;
        pf.vy *= 1 - 1.4 * dt;
        pf.mesh.scale.setScalar(0.10 + t * 0.34);
        pf.mesh.material.opacity = 0.42 * (1 - t) * (1 - t);
      }
    }

    return { spawnHoofStrike, update };
  }

  /**
   * Master Savannah World Builder
   */
  function createSavannahWorld(renderer, scene, initialMood) {
    const moodKey = initialMood || 'golden';
    const mood = LIGHTING_MOODS[moodKey] || LIGHTING_MOODS.golden;

    scene.fog = new THREE.FogExp2(mood.fogColor.getHex(), mood.fogDensity);

    const sky = createSkyDome(moodKey);
    scene.add(sky.mesh);

    const hemiLight = new THREE.HemisphereLight(
      mood.hemiSky.getHex(),
      mood.hemiGround.getHex(),
      mood.hemiIntensity
    );
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(mood.sunColor.getHex(), mood.sunIntensity);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(4096, 4096);
    sunLight.shadow.camera.near = 1.0;
    sunLight.shadow.camera.far = 52.0;
    const frustumHalf = 13.5;
    sunLight.shadow.camera.left = -frustumHalf;
    sunLight.shadow.camera.right = frustumHalf;
    sunLight.shadow.camera.top = frustumHalf;
    sunLight.shadow.camera.bottom = -frustumHalf;
    sunLight.shadow.bias = -0.00025;
    sunLight.shadow.normalBias = 0.016;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // Subtle cool sky rim light opposite the sun for 3D sculptural separation
    const rimLight = new THREE.DirectionalLight(0xcce2ff, 0.48);
    scene.add(rimLight);
    scene.add(rimLight.target);

    // Bake realistic sky+ground PMREM environment map for glossy eyes & coat PBR
    const pmremGen = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = createSkyDome(moodKey);
    envScene.add(envSky.mesh);
    let envRT = null;

    function bakeEnvironment() {
      if (envRT) envRT.dispose();
      envSky.uniforms.uZenith.value.copy(sky.uniforms.uZenith.value);
      envSky.uniforms.uHorizon.value.copy(sky.uniforms.uHorizon.value);
      envSky.uniforms.uSunGlow.value.copy(sky.uniforms.uSunGlow.value);
      envSky.uniforms.uSunDir.value.copy(sky.uniforms.uSunDir.value);
      envRT = pmremGen.fromScene(envScene, 0.03);
      scene.environment = envRT.texture;
    }

    const sunOffsetDir = new THREE.Vector3();
    function applyMood(key) {
      const m = LIGHTING_MOODS[key];
      if (!m) return;
      sunOffsetDir.setFromSphericalCoords(1, Math.PI * 0.5 - m.sunElevation, m.sunAzimuth);
      sky.uniforms.uZenith.value.copy(m.skyZenith);
      sky.uniforms.uHorizon.value.copy(m.skyHorizon);
      sky.uniforms.uSunGlow.value.copy(m.skySunGlow);
      sky.uniforms.uSunDir.value.copy(sunOffsetDir);

      sunLight.color.copy(m.sunColor);
      sunLight.intensity = m.sunIntensity;
      hemiLight.color.copy(m.hemiSky);
      hemiLight.groundColor.copy(m.hemiGround);
      hemiLight.intensity = m.hemiIntensity;
      scene.fog.color.copy(m.fogColor);
      scene.fog.density = m.fogDensity;
      renderer.toneMappingExposure = m.exposure;

      bakeEnvironment();
    }

    applyMood(moodKey);

    // Endless terrain, outer savannah horizon skirt, mountains, grass, acacia trees, and kopje boulders
    const terrain = createSavannahTerrain();
    scene.add(terrain.mesh);

    const outerSkirtGeo = new THREE.RingGeometry(74, 395, 72, 2);
    outerSkirtGeo.rotateX(-Math.PI / 2);
    const outerSkirtMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.58, 0.50, 0.31),
      roughness: 0.96,
      metalness: 0.0,
      envMapIntensity: 0.40
    });
    const outerSkirt = new THREE.Mesh(outerSkirtGeo, outerSkirtMat);
    outerSkirt.position.y = -0.08;
    outerSkirt.frustumCulled = false;
    scene.add(outerSkirt);

    const mountains = createHorizonMountains();
    scene.add(mountains);

    const grass = createSavannahGrass(5200);
    scene.add(grass.mesh);

    // Acacia trees recycled along a 160m corridor
    const acaciaPrefabs = buildAcaciaPrefabs();
    const barkMat = new THREE.MeshStandardMaterial({
      color: 0x4d3f33,
      roughness: 0.92,
      metalness: 0.0
    });
    const canopyMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.0
    });

    const treeSpanZ = 168;
    const treeCount = 26;
    const treeSlots = [];
    const rngTree = M.mulberry32(202611);
    for (let i = 0; i < treeCount; i++) {
      const prefab = acaciaPrefabs[i % acaciaPrefabs.length];
      const grp = new THREE.Group();
      const trunk = new THREE.Mesh(prefab.trunkGeo, barkMat);
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      const canopy = new THREE.Mesh(prefab.canopyGeo, canopyMat);
      canopy.castShadow = true;
      canopy.receiveShadow = true;
      grp.add(trunk, canopy);
      scene.add(grp);

      const side = i % 2 === 0 ? 1 : -1;
      const dist = 7.2 + Math.pow(rngTree(), 1.1) * 44.0;
      const zSlot = ((i + rngTree() * 0.75) / treeCount - 0.42) * treeSpanZ;
      const scale = 0.78 + rngTree() * 0.62;
      const rotY = rngTree() * Math.PI * 2;
      treeSlots.push({ grp, side, dist, zSlot, scale, rotY, wrapCount: -9999 });
    }

    // Scattered weathered granite kopje rocks & trailside stones
    const rockGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const rPos = rockGeo.attributes.position;
    for (let i = 0; i < rPos.count; i++) {
      const rx = rPos.getX(i), ry = rPos.getY(i), rz = rPos.getZ(i);
      const n = 0.82 + 0.32 * (M.noise3D(rx * 1.8, ry * 1.8, rz * 1.8) * 0.5 + 0.5);
      rPos.setXYZ(i, rx * n, ry * n * 0.62, rz * n);
    }
    rockGeo.computeVertexNormals();
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x7c6d5c,
      roughness: 0.90
    });
    const rockCount = 90;
    const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    rockInst.castShadow = true;
    rockInst.receiveShadow = true;
    rockInst.frustumCulled = false;
    scene.add(rockInst);

    const rockSpanZ = 120;
    const rockSlots = [];
    const rngRock = M.mulberry32(61611);
    const rockDummy = new THREE.Object3D();
    for (let i = 0; i < rockCount; i++) {
      const side = rngRock() > 0.5 ? 1 : -1;
      const isLarge = i < 16;
      const dist = isLarge ? 10.0 + rngRock() * 32.0 : 1.45 + rngRock() * 16.0;
      const zSlot = (rngRock() - 0.5) * rockSpanZ;
      const sc = isLarge ? 0.55 + rngRock() * 1.15 : 0.06 + rngRock() * 0.16;
      const rotY = rngRock() * Math.PI * 2;
      rockSlots.push({ side, dist, zSlot, sc, rotY, wrapCount: -9999 });
    }

    const footprints = createFootprintAndDustSystem(scene);

    // Distant soaring East African savannah birds riding warm thermals
    const birds = [];
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          0, 0, 0.22,
          0, 0, -0.22,
          0.72, 0.08, -0.05,
          0.72, 0.08, -0.05,
          1.25, -0.04, -0.18,
          0, 0, -0.14
        ],
        3
      )
    );
    wingGeo.computeVertexNormals();
    const birdMat = new THREE.MeshBasicMaterial({
      color: 0x2a231e,
      side: THREE.DoubleSide,
      fog: true
    });
    for (let b = 0; b < 7; b++) {
      const birdGrp = new THREE.Group();
      const wingL = new THREE.Mesh(wingGeo, birdMat);
      const wingR = new THREE.Mesh(wingGeo, birdMat);
      wingR.scale.x = -1;
      birdGrp.add(wingL, wingR);
      birdGrp.scale.setScalar(0.55 + (b % 3) * 0.12);
      scene.add(birdGrp);
      birds.push({
        grp: birdGrp,
        wingL,
        wingR,
        orbitR: 26 + (b % 4) * 11,
        alt: 19 + b * 2.4,
        speed: 0.14 + (b % 3) * 0.03,
        phase: (b / 7) * Math.PI * 2,
        centerOffX: (b % 2 === 0 ? -38 : 44) + b * 3,
        centerOffZ: 68 + b * 9
      });
    }

    // Shadow texel snapping scratch vectors
    const _lightUp = new THREE.Vector3(0, 1, 0);
    const _lightRight = new THREE.Vector3();
    const _lightTrueUp = new THREE.Vector3();
    const _targetCenter = new THREE.Vector3();

    function update(dt, time, giraffeWorldPos, cameraPos) {
      const gx = giraffeWorldPos.x;
      const gz = giraffeWorldPos.z;

      sky.mesh.position.copy(cameraPos);
      outerSkirt.position.set(gx, -0.065, gz);
      mountains.position.set(gx, 0, gz);

      // Update soaring savannah thermal birds
      for (let b = 0; b < birds.length; b++) {
        const bd = birds[b];
        const ang = bd.phase + time * bd.speed;
        const bx = gx + bd.centerOffX + Math.cos(ang) * bd.orbitR;
        const bz = gz + bd.centerOffZ + Math.sin(ang) * bd.orbitR;
        const by = bd.alt + Math.sin(time * 0.5 + b) * 0.8;
        bd.grp.position.set(bx, by, bz);
        // Face tangent of circle + slight inward thermal bank roll
        bd.grp.rotation.order = 'YXZ';
        bd.grp.rotation.set(0.04, Math.atan2(-Math.sin(ang), Math.cos(ang)), -0.22);
        // Gentle intermittent flap vs soaring glide
        const flapEnv = Math.pow(Math.max(0, Math.sin(time * 0.42 + b * 1.7)), 3.0);
        const flap = Math.sin(time * 5.6 + b) * 0.34 * flapEnv + 0.08;
        bd.wingL.rotation.z = flap;
        bd.wingR.rotation.z = -flap;
      }

      terrain.updateAround(gx, gz);
      grass.updateAroundZ(gz, time);

      for (let i = 0; i < treeCount; i++) {
        const ts = treeSlots[i];
        const k = Math.round((gz - ts.zSlot) / treeSpanZ);
        if (k !== ts.wrapCount) {
          ts.wrapCount = k;
          const wz = ts.zSlot + k * treeSpanZ;
          const wx = evalTrailX(wz) + ts.side * ts.dist;
          const wy = groundHeight(wx, wz);
          ts.grp.position.set(wx, wy, wz);
          ts.grp.rotation.set(0, ts.rotY, 0);
          ts.grp.scale.setScalar(ts.scale);
        }
      }

      let rockDirty = false;
      for (let i = 0; i < rockCount; i++) {
        const rs = rockSlots[i];
        const k = Math.round((gz - rs.zSlot) / rockSpanZ);
        if (k !== rs.wrapCount) {
          rs.wrapCount = k;
          const wz = rs.zSlot + k * rockSpanZ;
          const wx = evalTrailX(wz) + rs.side * rs.dist;
          const wy = groundHeight(wx, wz);
          rockDummy.position.set(wx, wy - rs.sc * 0.18, wz);
          rockDummy.rotation.set(0.12 * (i % 3), rs.rotY, 0.08 * (i % 2));
          rockDummy.scale.set(rs.sc * 1.2, rs.sc * 0.78, rs.sc);
          rockDummy.updateMatrix();
          rockInst.setMatrixAt(i, rockDummy.matrix);
          rockDirty = true;
        }
      }
      if (rockDirty) rockInst.instanceMatrix.needsUpdate = true;

      // Stabilized texel-snapped directional sun shadow tracking around giraffe
      _targetCenter.set(gx, giraffeWorldPos.y + 2.35, gz);
      _lightRight.crossVectors(_lightUp, sunOffsetDir).normalize();
      _lightTrueUp.crossVectors(sunOffsetDir, _lightRight).normalize();

      const texelSize = (frustumHalf * 2) / 4096;
      const projR = Math.round(_targetCenter.dot(_lightRight) / texelSize) * texelSize;
      const projU = Math.round(_targetCenter.dot(_lightTrueUp) / texelSize) * texelSize;
      const projF = _targetCenter.dot(sunOffsetDir);

      sunLight.target.position
        .set(0, 0, 0)
        .addScaledVector(_lightRight, projR)
        .addScaledVector(_lightTrueUp, projU)
        .addScaledVector(sunOffsetDir, projF);
      sunLight.position.copy(sunLight.target.position).addScaledVector(sunOffsetDir, 22.0);
      sunLight.target.updateMatrixWorld();

      rimLight.target.position.copy(_targetCenter);
      rimLight.position.copy(_targetCenter).addScaledVector(sunOffsetDir, -14.0).setY(_targetCenter.y + 6.0);
      rimLight.target.updateMatrixWorld();

      footprints.update(dt);
    }

    // Prime initial placement
    update(0.016, 0, new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 2.5, 5));

    return {
      LIGHTING_MOODS,
      groundHeight,
      evalTrailX,
      applyMood,
      spawnHoofStrike: footprints.spawnHoofStrike,
      update
    };
  }

  GS.World = {
    LIGHTING_MOODS,
    groundHeight,
    evalTrailX,
    createSavannahWorld
  };
})();
