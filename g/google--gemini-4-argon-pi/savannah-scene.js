// savannah-scene.js
// Serengeti / Samburu Savannah environment with zero-slip scrolling ground, cloven hoofprints,
// footfall dust puffs, Umbrella Thorn Acacia trees, swaying grass tufts, and Kilimanjaro horizon

(function (global) {
  'use strict';

  function hash(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
  }

  function valueNoise2D(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const n00 = hash(ix + iy * 57.0);
    const n10 = hash(ix + 1 + iy * 57.0);
    const n01 = hash(ix + (iy + 1) * 57.0);
    const n11 = hash(ix + 1 + (iy + 1) * 57.0);
    return (n00 * (1 - ux) + n10 * ux) * (1 - uy) + (n01 * (1 - ux) + n11 * ux) * uy;
  }

  function fbm2D(x, y, octaves) {
    let v = 0;
    let amp = 0.5;
    let freq = 1.0;
    for (let i = 0; i < octaves; i++) {
      v += amp * valueNoise2D(x * freq, y * freq);
      freq *= 2.02;
      amp *= 0.5;
    }
    return v;
  }

  // Create tileable savannah soil & dry grass ground texture
  function createSavannahGroundTextures() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const data = img.data;

    const normCanvas = document.createElement('canvas');
    normCanvas.width = size;
    normCanvas.height = size;
    const normCtx = normCanvas.getContext('2d');
    const normImg = normCtx.createImageData(size, size);
    const normData = normImg.data;

    const heights = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      const ny = y / size;
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        // Periodic tileable noise via sin/cos mapping or blended octaves
        const n1 = fbm2D(nx * 16, ny * 16, 4);
        const n2 = fbm2D(nx * 48 + 13, ny * 48 + 29, 3);
        const pebble = Math.pow(valueNoise2D(nx * 140, ny * 140), 4.0);

        // Warm East African ochre/laterite earth blended with dry golden savannah turf
        const r = Math.min(255, Math.max(0, 168 + (n1 - 0.5) * 48 + (n2 - 0.5) * 26 + pebble * 28));
        const g = Math.min(255, Math.max(0, 134 + (n1 - 0.5) * 40 + (n2 - 0.5) * 22 + pebble * 22));
        const b = Math.min(255, Math.max(0, 88 + (n1 - 0.5) * 32 + (n2 - 0.5) * 18 + pebble * 16));

        const idx = (y * size + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;

        heights[y * size + x] = n1 * 0.5 + n2 * 0.35 + pebble * 0.25;
      }
    }
    ctx.putImageData(img, 0, 0);

    for (let y = 0; y < size; y++) {
      const yUp = (y - 1 + size) % size;
      const yDn = (y + 1) % size;
      for (let x = 0; x < size; x++) {
        const xLt = (x - 1 + size) % size;
        const xRt = (x + 1) % size;
        const dx = (heights[y * size + xRt] - heights[y * size + xLt]) * 2.5;
        const dy = (heights[yDn * size + x] - heights[yUp * size + x]) * 2.5;
        const inv = 1.0 / Math.sqrt(dx * dx + dy * dy + 1.0);
        const idx = (y * size + x) * 4;
        normData[idx] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
        normData[idx + 1] = Math.round((dy * inv * 0.5 + 0.5) * 255);
        normData[idx + 2] = Math.round((inv * 0.5 + 0.5) * 255);
        normData[idx + 3] = 255;
      }
    }
    normCtx.putImageData(normImg, 0, 0);

    const repeat = 24;
    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeat, repeat);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;

    const normalMap = new THREE.CanvasTexture(normCanvas);
    normalMap.wrapS = THREE.RepeatWrapping;
    normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.repeat.set(repeat, repeat);
    normalMap.anisotropy = 4;

    return { map, normalMap, tileSizeMeters: 120 / repeat };
  }

  // Create cloven giraffe hoofprint alpha decal texture
  function createHoofprintTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, size, size);
    // Two symmetrical cloven ungulate toes separated by central interdigital cleft
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(size * 0.5 + side * 16, size * 0.5);
      ctx.rotate(side * -0.08);
      const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, 26);
      grad.addColorStop(0, 'rgba(52, 36, 20, 0.72)');
      grad.addColorStop(0.7, 'rgba(62, 44, 24, 0.50)');
      grad.addColorStop(1, 'rgba(80, 58, 32, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  // Sculpt an East African Umbrella Thorn Acacia Tree (Vachellia tortilis)
  function createAcaciaTree(seed, trunkMat, canopyMat) {
    const tree = new THREE.Group();
    const scale = 0.85 + hash(seed * 13) * 0.55;

    // Main gnarled lower trunk
    const trunkGeom = new THREE.CylinderGeometry(0.16 * scale, 0.28 * scale, 2.2 * scale, 10, 6);
    // Slightly bend trunk vertices for organic twist
    const pos = trunkGeom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + 1.1 * scale;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(y * 1.2 + seed) * 0.12 * scale);
      pos.setZ(i, pos.getZ(i) + Math.cos(y * 1.1 + seed * 2) * 0.12 * scale);
    }
    trunkGeom.computeVertexNormals();
    const trunkMesh = new THREE.Mesh(trunkGeom, trunkMat);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    tree.add(trunkMesh);

    const forkTopX = Math.sin(2.2 * scale * 1.2 + seed) * 0.12 * scale;
    const forkTopZ = Math.cos(2.2 * scale * 1.1 + seed * 2) * 0.12 * scale;
    const forkTopY = 2.1 * scale;

    // 4-5 spreading umbrella branches + flat-topped layered foliage pads
    const numBranches = 5;
    for (let b = 0; b < numBranches; b++) {
      const angle = (b / numBranches) * Math.PI * 2 + hash(seed + b * 7) * 0.5;
      const bLen = (2.2 + hash(seed + b * 19) * 1.1) * scale;
      const tilt = 0.68 + hash(seed + b * 31) * 0.22; // Wide spreading umbrella angle

      const branchGroup = new THREE.Group();
      branchGroup.position.set(forkTopX, forkTopY, forkTopZ);
      branchGroup.rotation.y = angle;
      branchGroup.rotation.z = tilt;

      const brGeom = new THREE.CylinderGeometry(0.055 * scale, 0.12 * scale, bLen, 8, 4);
      brGeom.translate(0, bLen * 0.5, 0);
      const brMesh = new THREE.Mesh(brGeom, trunkMat);
      brMesh.castShadow = true;
      branchGroup.add(brMesh);
      tree.add(branchGroup);

      // Tip of branch in tree local space
      const tipX = forkTopX - Math.sin(tilt) * Math.cos(angle) * bLen;
      const tipY = forkTopY + Math.cos(tilt) * bLen;
      const tipZ = forkTopZ + Math.sin(tilt) * Math.sin(angle) * bLen;

      // Secondary sub-branches & multi-layered umbrella foliage cloud pads
      for (let sub = 0; sub < 3; sub++) {
        const subAng = angle + (sub - 1) * 0.65;
        const subDist = sub === 0 ? 0.0 : (0.65 + hash(seed + b * 11 + sub * 7) * 0.45) * scale;
        const px = tipX + Math.cos(subAng) * subDist;
        const py = tipY + (sub === 0 ? 0.08 : -0.06 + (sub % 2) * 0.12) * scale;
        const pz = tipZ + Math.sin(subAng) * subDist;

        const padRadius = (1.35 + hash(seed + b * 43 + sub * 13) * 0.75) * scale;
        const padGeom = new THREE.SphereGeometry(padRadius, 14, 10);
        padGeom.scale(1.0, 0.15, 1.0);
        const pPos = padGeom.attributes.position;
        for (let k = 0; k < pPos.count; k++) {
          const vx = pPos.getX(k);
          const vy = pPos.getY(k);
          const vz = pPos.getZ(k);
          const n = (hash(k * 3 + b * 17 + sub * 23 + seed) - 0.5) * 0.18 * scale;
          pPos.setXYZ(k, vx + n, vy * (vy > 0 ? 0.62 : 1.12), vz + n);
        }
        padGeom.computeVertexNormals();
        const padMesh = new THREE.Mesh(padGeom, canopyMat);
        padMesh.position.set(px, py, pz);
        padMesh.castShadow = false;
        padMesh.receiveShadow = true;
        tree.add(padMesh);
      }
    }

    // Central high crown canopy cloud (2 overlapping flat tiers)
    for (let tier = 0; tier < 2; tier++) {
      const crownGeom = new THREE.SphereGeometry((2.35 - tier * 0.55) * scale, 16, 10);
      crownGeom.scale(1.12, 0.14, 1.12);
      const crownMesh = new THREE.Mesh(crownGeom, canopyMat);
      crownMesh.position.set(
        forkTopX + (tier - 0.5) * 0.35 * scale,
        forkTopY + (1.62 + tier * 0.24) * scale,
        forkTopZ
      );
      crownMesh.castShadow = false;
      crownMesh.receiveShadow = true;
      tree.add(crownMesh);
    }

    // Soft dappled umbrella canopy ground shadow pool beneath the tree
    if (tree.userData) {
      tree.userData.scale = scale;
    }
    return tree;
  }

  class SavannahEnvironment {
    constructor(scene) {
      this.scene = scene;
      this.scrollLength = 90.0; // Seamless 90m world loop
      this.scrollZ = 0.0;

      this.scrollingProps = [];
      this.hoofprints = [];
      this.dustParticles = [];

      this._buildSkyAndHorizon();
      this._buildGround();
      this._buildFoliageAndRocks();
      this._buildHoofprintPool();
      this._buildHoofContactShadows();
      this._buildDustSystem();
      this._buildBrowsingBranch();
      this._buildSavannahBirds();
    }

    _buildSkyAndHorizon() {
      // Procedural atmospheric sky dome shader (Zenith azure -> Golden savannah horizon)
      const skyGeom = new THREE.SphereGeometry(260, 32, 24);
      this.skyUniforms = {
        topColor: { value: new THREE.Color(0x2d649e) },
        midColor: { value: new THREE.Color(0x9bc1dc) },
        horizonColor: { value: new THREE.Color(0xf6d39c) },
        groundColor: { value: new THREE.Color(0xc89e63) },
        sunDir: { value: new THREE.Vector3(0.58, 0.42, 0.69).normalize() },
        sunColor: { value: new THREE.Color(0xfff1cc) }
      };

      const skyMat = new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: `
          varying vec3 vWorldPos;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          varying vec3 vWorldPos;
          uniform vec3 topColor;
          uniform vec3 midColor;
          uniform vec3 horizonColor;
          uniform vec3 groundColor;
          uniform vec3 sunDir;
          uniform vec3 sunColor;

          void main() {
            vec3 dir = normalize(vWorldPos);
            float h = dir.y;
            vec3 col;
            if (h >= 0.0) {
              float t1 = smoothstep(0.0, 0.24, h);
              float t2 = smoothstep(0.18, 0.85, h);
              col = mix(horizonColor, midColor, t1);
              col = mix(col, topColor, t2);
            } else {
              col = mix(horizonColor, groundColor, smoothstep(0.0, -0.25, h));
            }
            // Mie solar aureole & sun disc
            float sunCos = max(dot(dir, sunDir), 0.0);
            col += sunColor * pow(sunCos, 12.0) * 0.32;
            col += sunColor * smoothstep(0.9985, 0.9996, sunCos) * 1.4;
            gl_FragColor = vec4(col, 1.0);
          }
        `
      });

      this.skyMesh = new THREE.Mesh(skyGeom, skyMat);
      this.scene.add(this.skyMesh);

      // Distant East African mountain range & iconic flat-topped Kilimanjaro silhouette on horizon
      const mtRingGeom = new THREE.CylinderGeometry(185, 195, 28, 96, 1, true);
      const mtPos = mtRingGeom.attributes.position;
      for (let i = 0; i < mtPos.count; i++) {
        const y = mtPos.getY(i);
        const x = mtPos.getX(i);
        const z = mtPos.getZ(i);
        const angle = Math.atan2(x, z);
        if (y > 0) {
          // Create Mount Kilimanjaro Kibo plateau around angle ~ 0.55 rad + rolling Chyulu hills
          const kili = Math.exp(-Math.pow((angle - 0.55) / 0.20, 2.0));
          const kiliPlateau = Math.min(1.0, kili * 1.35) * 19.5;
          const mawenzi = Math.exp(-Math.pow((angle - 0.82) / 0.08, 2.0)) * 11.0;
          const hills = (Math.sin(angle * 7.0) * 0.5 + 0.5) * 4.5 + (Math.cos(angle * 19.0) * 0.5 + 0.5) * 2.2;
          mtPos.setY(i, Math.max(0.5, kiliPlateau + mawenzi + hills));
        } else {
          mtPos.setY(i, -2.0);
        }
      }
      mtRingGeom.computeVertexNormals();
      this.mountainMat = new THREE.MeshBasicMaterial({
        color: 0xbba492,
        side: THREE.DoubleSide,
        fog: true
      });
      const mtMesh = new THREE.Mesh(mtRingGeom, this.mountainMat);
      this.scene.add(mtMesh);
    }

    _buildGround() {
      const groundTex = createSavannahGroundTextures();
      this.groundMap = groundTex.map;
      this.groundNormalMap = groundTex.normalMap;
      this.tileSizeMeters = groundTex.tileSizeMeters;

      const groundGeom = new THREE.PlaneGeometry(120, 120, 64, 64);
      groundGeom.rotateX(-Math.PI * 0.5);

      // Keep central walking corridor (|x| < 2.2m) completely flat at y = 0.000m for exact hoof contact,
      // with gentle natural savannah mounds on the outer flanks (|x| > 3.5m)
      const gPos = groundGeom.attributes.position;
      for (let i = 0; i < gPos.count; i++) {
        const gx = gPos.getX(i);
        const gz = gPos.getZ(i);
        const corridorMask = Math.max(0, Math.min(1, (Math.abs(gx) - 3.2) / 8.0));
        const mound = (Math.sin(gx * 0.12) * Math.cos(gz * 0.12) * 0.45 + Math.sin(gx * 0.28 + gz * 0.21) * 0.20) * corridorMask;
        gPos.setY(i, mound);
      }
      groundGeom.computeVertexNormals();

      const groundMat = new THREE.MeshStandardMaterial({
        map: this.groundMap,
        normalMap: this.groundNormalMap,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughness: 0.94,
        metalness: 0.0
      });

      this.groundMesh = new THREE.Mesh(groundGeom, groundMat);
      this.groundMesh.receiveShadow = true;
      this.scene.add(this.groundMesh);
    }

    _buildFoliageAndRocks() {
      // Procedural Acacia Bark Texture
      const barkCanvas = document.createElement('canvas');
      barkCanvas.width = 256;
      barkCanvas.height = 256;
      const bCtx = barkCanvas.getContext('2d');
      const bImg = bCtx.createImageData(256, 256);
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const n = fbm2D(x * 0.25, y * 0.04, 3);
          const idx = (y * 256 + x) * 4;
          bImg.data[idx] = 68 + n * 42;
          bImg.data[idx + 1] = 52 + n * 32;
          bImg.data[idx + 2] = 38 + n * 24;
          bImg.data[idx + 3] = 255;
        }
      }
      bCtx.putImageData(bImg, 0, 0);
      const barkTex = new THREE.CanvasTexture(barkCanvas);
      barkTex.wrapS = THREE.RepeatWrapping;
      barkTex.wrapT = THREE.RepeatWrapping;
      barkTex.colorSpace = THREE.SRGBColorSpace;

      // Procedural Acacia Canopy Dappled Leaf Texture
      const leafCanvas = document.createElement('canvas');
      leafCanvas.width = 256;
      leafCanvas.height = 256;
      const lCtx = leafCanvas.getContext('2d');
      const lImg = lCtx.createImageData(256, 256);
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const n1 = fbm2D(x * 0.14, y * 0.14, 4);
          const n2 = valueNoise2D(x * 0.45, y * 0.45);
          const idx = (y * 256 + x) * 4;
          lImg.data[idx] = 62 + n1 * 48 + n2 * 18;
          lImg.data[idx + 1] = 88 + n1 * 56 + n2 * 22;
          lImg.data[idx + 2] = 36 + n1 * 28 + n2 * 10;
          lImg.data[idx + 3] = 255;
        }
      }
      lCtx.putImageData(lImg, 0, 0);
      const leafTex = new THREE.CanvasTexture(leafCanvas);
      leafTex.wrapS = THREE.RepeatWrapping;
      leafTex.wrapT = THREE.RepeatWrapping;
      leafTex.repeat.set(3, 3);
      leafTex.colorSpace = THREE.SRGBColorSpace;

      const trunkMat = new THREE.MeshStandardMaterial({
        map: barkTex,
        roughness: 0.94,
        metalness: 0.0
      });
      const canopyMat = new THREE.MeshStandardMaterial({
        map: leafTex,
        roughness: 0.88,
        metalness: 0.02
      });
      this.trunkMat = trunkMat;
      this.canopyMat = canopyMat;
      const rockMat = new THREE.MeshStandardMaterial({
        map: barkTex,
        color: 0x9e8e7e,
        roughness: 0.92,
        metalness: 0.02
      });

      // Procedural dappled canopy ground shadow texture for Acacia trees
      const shadeCanvas = document.createElement('canvas');
      shadeCanvas.width = 256;
      shadeCanvas.height = 256;
      const sCtx = shadeCanvas.getContext('2d');
      const sImg = sCtx.createImageData(256, 256);
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const dx = (x - 128) / 128;
          const dy = (y - 128) / 128;
          const r = Math.hypot(dx, dy);
          const n = fbm2D(x * 0.08, y * 0.08, 3);
          const mask = Math.max(0, Math.min(1, (0.92 - r + (n - 0.5) * 0.32) * 2.2));
          const dapple = 0.55 + 0.45 * n;
          const idx = (y * 256 + x) * 4;
          sImg.data[idx] = 32;
          sImg.data[idx + 1] = 22;
          sImg.data[idx + 2] = 12;
          sImg.data[idx + 3] = Math.round(mask * dapple * 125);
        }
      }
      sCtx.putImageData(sImg, 0, 0);
      const treeShadeTex = new THREE.CanvasTexture(shadeCanvas);
      const treeShadeMat = new THREE.MeshBasicMaterial({
        map: treeShadeTex,
        transparent: true,
        depthWrite: false
      });

      // 1. Place 14 Umbrella Thorn Acacia trees along both sides of the savannah trail
      for (let i = 0; i < 14; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const z = -this.scrollLength * 0.5 + (i / 14) * this.scrollLength;
        const x = side * (4.8 + hash(i * 41 + 7) * 16.0);
        const tree = createAcaciaTree(i + 1, trunkMat, canopyMat);
        const sc = tree.userData.scale || 1.0;
        const shadeGeom = new THREE.PlaneGeometry(7.2 * sc, 7.2 * sc);
        shadeGeom.rotateX(-Math.PI * 0.5);
        const shadeMesh = new THREE.Mesh(shadeGeom, treeShadeMat);
        shadeMesh.position.set(-1.6 * sc, 0.015, -1.6 * sc);
        tree.add(shadeMesh);

        tree.position.set(x, 0, z);
        tree.rotation.y = hash(i * 19) * Math.PI * 2;
        this.scene.add(tree);
        this.scrollingProps.push(tree);
      }

      // 2. Place 26 weathered smooth granite kopje boulders
      const rockGeom = new THREE.SphereGeometry(1.0, 14, 12);
      const rPos = rockGeom.attributes.position;
      for (let k = 0; k < rPos.count; k++) {
        const vx = rPos.getX(k);
        const vy = rPos.getY(k);
        const vz = rPos.getZ(k);
        const disp = 0.85 + 0.25 * fbm2D(vx * 2.2 + 5, vz * 2.2 + vy * 1.7, 3);
        rPos.setXYZ(k, vx * disp, vy * disp, vz * disp);
      }
      rockGeom.computeVertexNormals();

      for (let i = 0; i < 26; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const x = side * (2.8 + hash(i * 73 + 3) * 18.0);
        const z = -this.scrollLength * 0.5 + hash(i * 97 + 11) * this.scrollLength;
        const sx = 0.25 + hash(i * 13) * 0.55;
        const sy = 0.14 + hash(i * 29) * 0.28;
        const sz = 0.25 + hash(i * 53) * 0.55;
        const rock = new THREE.Mesh(rockGeom, rockMat);
        rock.scale.set(sx, sy, sz);
        rock.position.set(x, sy * 0.25, z);
        rock.rotation.set(0, hash(i + 5) * 6.28, 0);
        rock.castShadow = true;
        rock.receiveShadow = true;
        this.scene.add(rock);
        this.scrollingProps.push(rock);
      }

      // 3. Instanced Golden Savannah Grass Clumps (1,400 multi-blade grass tufts scrolling seamlessly)
      const bladeCountPerClump = 5;
      const clumpPositions = [];
      const clumpNormals = [];
      const clumpIndices = [];
      let vIdx = 0;
      for (let b = 0; b < bladeCountPerClump; b++) {
        const ang = (b / bladeCountPerClump) * Math.PI * 2 + 0.3;
        const lean = 0.12 + (b % 2) * 0.08;
        const h = 0.32 + (b % 3) * 0.09;
        const w = 0.022;
        const cx = Math.cos(ang) * 0.04;
        const cz = Math.sin(ang) * 0.04;
        const tx = cx + Math.cos(ang) * lean;
        const tz = cz + Math.sin(ang) * lean;
        const px = -Math.sin(ang) * w;
        const pz = Math.cos(ang) * w;

        clumpPositions.push(
          cx - px, 0, cz - pz,
          cx + px, 0, cz + pz,
          tx, h, tz
        );
        clumpNormals.push(0, 0.8, 0.2, 0, 0.8, 0.2, 0, 0.9, 0.1);
        clumpIndices.push(vIdx, vIdx + 1, vIdx + 2);
        vIdx += 3;
      }
      const grassGeom = new THREE.BufferGeometry();
      grassGeom.setAttribute('position', new THREE.Float32BufferAttribute(clumpPositions, 3));
      grassGeom.setAttribute('normal', new THREE.Float32BufferAttribute(clumpNormals, 3));
      grassGeom.setIndex(clumpIndices);

      const grassMat = new THREE.MeshStandardMaterial({
        color: 0xc8a956,
        roughness: 0.85,
        metalness: 0.0,
        side: THREE.DoubleSide
      });

      this.grassCount = 1200;
      this.grassInstanced = new THREE.InstancedMesh(grassGeom, grassMat, this.grassCount);
      this.grassInstanced.castShadow = false;
      this.grassInstanced.receiveShadow = true;
      this.grassData = [];

      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      for (let i = 0; i < this.grassCount; i++) {
        const r = hash(i * 17 + 3);
        const side = i % 2 === 0 ? 1 : -1;
        // Keep central hoof track mostly clear dirt with occasional tufts, rich grass along edges
        const dist = r < 0.12 ? (0.45 + hash(i * 31) * 1.2) : (1.1 + Math.pow(hash(i * 31), 1.4) * 20.0);
        const x = side * dist;
        const z = -this.scrollLength * 0.5 + hash(i * 61 + 19) * this.scrollLength;
        const s = 0.65 + hash(i * 89) * 1.15;
        const rotY = hash(i * 43) * Math.PI * 2;

        this.grassData.push({ x, z, s, rotY });
        dummy.position.set(x, 0, z);
        dummy.scale.set(s, s, s);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();
        this.grassInstanced.setMatrixAt(i, dummy.matrix);

        // Subtle dry gold to olive-ochre grass variation
        color.setHSL(0.11 + (hash(i * 23) - 0.5) * 0.04, 0.48, 0.46 + (hash(i * 71) - 0.5) * 0.14);
        this.grassInstanced.setColorAt(i, color);
      }
      this.grassInstanced.instanceMatrix.needsUpdate = true;
      this.grassInstanced.instanceColor.needsUpdate = true;
      this.scene.add(this.grassInstanced);
      this._dummy = dummy;
    }

    _buildHoofprintPool() {
      const printTex = createHoofprintTexture();
      const printGeom = new THREE.PlaneGeometry(0.18, 0.22);
      printGeom.rotateX(-Math.PI * 0.5);

      for (let i = 0; i < 28; i++) {
        const mat = new THREE.MeshBasicMaterial({
          map: printTex,
          transparent: true,
          opacity: 0.0,
          depthWrite: false
        });
        const mesh = new THREE.Mesh(printGeom, mat);
        mesh.position.set(0, 0.003, -999);
        mesh.visible = false;
        this.scene.add(mesh);
        this.hoofprints.push({ mesh, mat, age: 999, active: false });
      }
      this.nextPrintIdx = 0;
    }

    _buildHoofContactShadows() {
      // Soft radial ambient occlusion contact shadow under each of the 4 hooves
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(size * 0.5, size * 0.5, 4, size * 0.5, size * 0.5, size * 0.48);
      grad.addColorStop(0.0, 'rgba(28, 18, 9, 0.72)');
      grad.addColorStop(0.45, 'rgba(34, 22, 11, 0.36)');
      grad.addColorStop(1.0, 'rgba(34, 22, 11, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      const aoTex = new THREE.CanvasTexture(canvas);

      const aoGeom = new THREE.PlaneGeometry(0.34, 0.38);
      aoGeom.rotateX(-Math.PI * 0.5);

      this.hoofContactShadows = [];
      for (let i = 0; i < 4; i++) {
        const mat = new THREE.MeshBasicMaterial({
          map: aoTex,
          transparent: true,
          opacity: 0.5,
          depthWrite: false
        });
        const mesh = new THREE.Mesh(aoGeom, mat);
        mesh.position.set(0, 0.002, 0);
        this.scene.add(mesh);
        this.hoofContactShadows.push({ mesh, mat });
      }
      this._hoofWorldTmp = new THREE.Vector3();
    }

    _buildBrowsingBranch() {
      // Overhanging thorny Acacia tortilis branch that swings into reach during "Browse Acacia"
      this.browsingBranchGroup = new THREE.Group();
      this.browsingBranchGroup.position.set(0.0, 5.85, 2.32); // Tucked high above frame until browsing starts
      this.browsingBlend = 0.0;

      // Crooked main branch arching in from upper-front (+Z, +Y) toward the giraffe's muzzle
      const mainBrGeom = new THREE.CylinderGeometry(0.014, 0.032, 1.35, 10, 8);
      const mbPos = mainBrGeom.attributes.position;
      for (let i = 0; i < mbPos.count; i++) {
        const y = mbPos.getY(i);
        mbPos.setX(i, mbPos.getX(i) + Math.sin(y * 3.5) * 0.035);
        mbPos.setZ(i, mbPos.getZ(i) + Math.cos(y * 2.8) * 0.025);
      }
      mainBrGeom.computeVertexNormals();
      const mainBrMesh = new THREE.Mesh(mainBrGeom, this.trunkMat);
      mainBrMesh.position.set(0.18, 0.26, 0.42);
      mainBrMesh.rotation.x = -1.12;
      mainBrMesh.rotation.z = 0.32;
      mainBrMesh.castShadow = true;
      this.browsingBranchGroup.add(mainBrMesh);

      // Flexible terminal shoot that the giraffe's tongue wraps around & tugs (aligned along Z/X in front of muzzle)
      this.browsingShootGroup = new THREE.Group();
      this.browsingShootGroup.position.set(0.0, 0.0, 0.0);
      this.browsingShootGroup.rotation.y = 1.15;
      this.browsingBranchGroup.add(this.browsingShootGroup);

      const shootGeom = new THREE.CylinderGeometry(0.006, 0.015, 0.62, 8, 6);
      shootGeom.rotateZ(Math.PI * 0.46);
      const shootMesh = new THREE.Mesh(shootGeom, this.trunkMat);
      shootMesh.position.set(-0.08, -0.02, 0.0);
      shootMesh.castShadow = true;
      this.browsingShootGroup.add(shootMesh);

      // Iconic white paired Acacia tortilis thorns along the shoot
      const thornMat = new THREE.MeshStandardMaterial({ color: 0xf4eee1, roughness: 0.55 });
      const thornGeom = new THREE.ConeGeometry(0.0032, 0.038, 6);
      thornGeom.translate(0, 0.019, 0);
      for (let t = 0; t < 6; t++) {
        const tx = -0.32 + t * 0.11;
        for (const s of [-1, 1]) {
          const thorn = new THREE.Mesh(thornGeom, thornMat);
          thorn.position.set(tx, -0.02, s * 0.008);
          thorn.rotation.x = s * 0.68;
          thorn.rotation.z = 0.35 * s;
          this.browsingShootGroup.add(thorn);
        }
      }

      // Lush feathery green bipinnate Acacia leaf clusters along the shoot
      for (let l = 0; l < 11; l++) {
        const lx = -0.36 + l * 0.068;
        const ly = -0.01 + ((l % 3) - 1) * 0.028;
        const lz = ((l * 17) % 5 - 2) * 0.032;
        const padGeom = new THREE.SphereGeometry(0.055 + (l % 3) * 0.015, 10, 8);
        padGeom.scale(1.35, 0.28, 0.95);
        const padMesh = new THREE.Mesh(padGeom, this.canopyMat);
        padMesh.position.set(lx, ly, lz);
        padMesh.rotation.set((l % 2) * 0.25, l * 0.6, (l % 3 - 1) * 0.2);
        padMesh.castShadow = true;
        this.browsingShootGroup.add(padMesh);
      }

      // Detached fluttering green leaflets that shed when the tongue strips the shoot
      this.fallingLeaflets = [];
      const leafletGeom = new THREE.PlaneGeometry(0.022, 0.010);
      const leafletMat = new THREE.MeshStandardMaterial({
        color: 0x5c7d32,
        roughness: 0.75,
        side: THREE.DoubleSide
      });
      for (let i = 0; i < 14; i++) {
        const mesh = new THREE.Mesh(leafletGeom, leafletMat);
        mesh.visible = false;
        this.scene.add(mesh);
        this.fallingLeaflets.push({
          mesh,
          vx: 0,
          vy: 0,
          vz: 0,
          age: 99,
          active: false
        });
      }
      this.nextLeafletIdx = 0;
      this.scene.add(this.browsingBranchGroup);
    }

    _buildSavannahBirds() {
      // Distant flock of 7 East African savannah birds soaring near the horizon
      this.birdFlock = new THREE.Group();
      this.birdFlock.position.set(-22, 16.5, 68);
      this.birds = [];

      const birdMat = new THREE.MeshBasicMaterial({ color: 0x2b231d, side: THREE.DoubleSide });
      for (let i = 0; i < 7; i++) {
        const birdGroup = new THREE.Group();
        birdGroup.position.set((i - 3) * 1.65 + (i % 2) * 0.4, Math.abs(i - 3) * -0.35, Math.abs(i - 3) * -1.4);

        const wingGeom = new THREE.PlaneGeometry(0.42, 0.14);
        wingGeom.translate(0.21, 0, 0);
        const wingL = new THREE.Mesh(wingGeom, birdMat);
        wingL.rotation.x = Math.PI * 0.42;

        const wingRGeom = new THREE.PlaneGeometry(0.42, 0.14);
        wingRGeom.translate(-0.21, 0, 0);
        const wingR = new THREE.Mesh(wingRGeom, birdMat);
        wingR.rotation.x = Math.PI * 0.42;

        birdGroup.add(wingL, wingR);
        this.birdFlock.add(birdGroup);
        this.birds.push({ group: birdGroup, wingL, wingR, phase: i * 0.85 });
      }
      this.scene.add(this.birdFlock);
    }

    _buildDustSystem() {
      // Soft radial dust cloud sprite texture
      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(size * 0.5, size * 0.5, 4, size * 0.5, size * 0.5, size * 0.48);
      grad.addColorStop(0.0, 'rgba(222, 192, 144, 0.55)');
      grad.addColorStop(0.45, 'rgba(214, 182, 132, 0.28)');
      grad.addColorStop(1.0, 'rgba(214, 182, 132, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      const dustTex = new THREE.CanvasTexture(canvas);

      for (let i = 0; i < 48; i++) {
        const mat = new THREE.SpriteMaterial({
          map: dustTex,
          transparent: true,
          opacity: 0.0,
          depthWrite: false
        });
        const sprite = new THREE.Sprite(mat);
        sprite.visible = false;
        this.scene.add(sprite);
        this.dustParticles.push({
          mesh: sprite,
          mat,
          vx: 0,
          vy: 0,
          vz: 0,
          age: 99,
          maxAge: 1.0,
          active: false
        });
      }
      this.nextDustIdx = 0;
    }

    // Triggered by GiraffeGaitController whenever a hoof strikes the savannah floor
    spawnHoofStrikeEffect(limbKey, hoofBone) {
      const worldPos = new THREE.Vector3();
      hoofBone.getWorldPosition(worldPos);

      // 1. Stamp cloven hoofprint decal right beneath the hoof
      const hp = this.hoofprints[this.nextPrintIdx];
      this.nextPrintIdx = (this.nextPrintIdx + 1) % this.hoofprints.length;
      hp.active = true;
      hp.age = 0.0;
      hp.mesh.position.set(worldPos.x, 0.003, worldPos.z);
      hp.mesh.visible = true;
      hp.mat.opacity = 0.65;

      // 2. Spawn 4 golden savannah dust puffs radiating outward from the hoof impact
      for (let k = 0; k < 4; k++) {
        const dp = this.dustParticles[this.nextDustIdx];
        this.nextDustIdx = (this.nextDustIdx + 1) % this.dustParticles.length;
        const a = (k / 4) * Math.PI * 2 + Math.random() * 0.8;
        dp.active = true;
        dp.age = 0.0;
        dp.maxAge = 0.65 + Math.random() * 0.45;
        dp.mesh.position.set(worldPos.x + Math.cos(a) * 0.05, 0.04, worldPos.z + Math.sin(a) * 0.05);
        dp.mesh.scale.setScalar(0.14 + Math.random() * 0.06);
        dp.vx = Math.cos(a) * (0.18 + Math.random() * 0.15) + 0.08;
        dp.vy = 0.22 + Math.random() * 0.20;
        dp.vz = Math.sin(a) * (0.18 + Math.random() * 0.15) - 0.15;
        dp.mesh.visible = true;
        dp.mat.opacity = 0.55;
      }
    }

    update(dt, linearSpeed, elapsedTime, giraffeRef, gaitRef) {
      const dz = linearSpeed * dt;
      this.scrollZ += dz;

      // 1. Scroll ground UV at exact stance hoof speed so there is ZERO foot slip!
      const uvOffsetZ = (this.scrollZ / this.tileSizeMeters) % 1.0;
      this.groundMap.offset.y = uvOffsetZ;
      this.groundNormalMap.offset.y = uvOffsetZ;

      const halfScroll = this.scrollLength * 0.5;

      // 2. Scroll Acacia trees and boulders seamlessly
      for (const prop of this.scrollingProps) {
        prop.position.z -= dz;
        if (prop.position.z < -halfScroll) {
          prop.position.z += this.scrollLength;
        }
      }

      // 3. Scroll & wind-sway Instanced Savannah Grass
      const dummy = this._dummy;
      for (let i = 0; i < this.grassCount; i++) {
        const g = this.grassData[i];
        g.z -= dz;
        if (g.z < -halfScroll) {
          g.z += this.scrollLength;
        }
        const windSway = Math.sin(elapsedTime * 2.2 + g.x * 0.5 + g.z * 0.4) * 0.08;
        dummy.position.set(g.x, 0, g.z);
        dummy.scale.set(g.s, g.s, g.s);
        dummy.rotation.set(windSway, g.rotY, windSway * 0.6);
        dummy.updateMatrix();
        this.grassInstanced.setMatrixAt(i, dummy.matrix);
      }
      this.grassInstanced.instanceMatrix.needsUpdate = true;

      // 4. Update & scroll cloven hoofprint decals (stay locked under planted hooves!)
      for (const hp of this.hoofprints) {
        if (!hp.active) continue;
        hp.age += dt;
        hp.mesh.position.z -= dz;
        if (hp.age > 9.0 || hp.mesh.position.z < -25.0) {
          hp.active = false;
          hp.mesh.visible = false;
        } else {
          hp.mat.opacity = 0.65 * (1.0 - hp.age / 9.0);
        }
      }

      // 5. Update & expand footfall dust particles
      for (const dp of this.dustParticles) {
        if (!dp.active) continue;
        dp.age += dt;
        if (dp.age >= dp.maxAge) {
          dp.active = false;
          dp.mesh.visible = false;
          continue;
        }
        const t = dp.age / dp.maxAge;
        dp.mesh.position.x += dp.vx * dt;
        dp.mesh.position.y += dp.vy * dt;
        dp.mesh.position.z += (dp.vz - linearSpeed) * dt;
        dp.vy *= 0.95;
        dp.mesh.scale.setScalar(0.14 + t * 0.34);
        dp.mat.opacity = 0.55 * (1.0 - t) * (1.0 - t);
      }

      // 6. Update dynamic hoof contact ambient occlusion shadows directly under all 4 hooves
      const boneMap = giraffeRef && (giraffeRef.boneMap || (giraffeRef.rig && giraffeRef.rig.boneMap));
      if (boneMap && this.hoofContactShadows) {
        const hoofNames = ['hind_hoof_L', 'hoof_L', 'hind_hoof_R', 'hoof_R'];
        for (let i = 0; i < 4; i++) {
          const hBone = boneMap[hoofNames[i]];
          const cs = this.hoofContactShadows[i];
          if (hBone && cs) {
            hBone.getWorldPosition(this._hoofWorldTmp);
            cs.mesh.position.set(this._hoofWorldTmp.x, 0.002, this._hoofWorldTmp.z);
            const hNorm = Math.max(0, Math.min(1, 1.0 - this._hoofWorldTmp.y / 0.18));
            cs.mat.opacity = 0.54 * Math.pow(hNorm, 1.4);
            const s = 0.88 + (1.0 - hNorm) * 0.45;
            cs.mesh.scale.set(s, s, 1.0);
          }
        }
      }

      // 7. Update interactive overhanging Acacia browsing branch & fluttering leaflets
      if (this.browsingBranchGroup && gaitRef) {
        const browsingActive = gaitRef.browsingTimer > 0;
        const targetBlend = browsingActive ? 1.0 : 0.0;
        this.browsingBlend += (targetBlend - this.browsingBlend) * Math.min(1.0, dt * 4.5);

        if (this.browsingBlend > 0.005) {
          this.browsingBranchGroup.visible = true;
          const bProg = browsingActive ? 1.0 - gaitRef.browsingTimer / gaitRef.browsingDuration : 0.0;
          const ease = this.browsingBlend * this.browsingBlend * (3.0 - 2.0 * this.browsingBlend);

          // Anchor the overhanging thorny Acacia shoot right around the giraffe's reaching tongue!
          let targetX = 0.02, targetY = 4.66, targetZ = 2.12;
          if (giraffeRef && giraffeRef.cranial && giraffeRef.cranial.tongue) {
            giraffeRef.cranial.tongue.getWorldPosition(this._hoofWorldTmp);
            targetX = this._hoofWorldTmp.x + 0.02;
            targetY = this._hoofWorldTmp.y + 0.02;
            targetZ = this._hoofWorldTmp.z + 0.05;
          }
          this.browsingBranchGroup.position.set(
            targetX,
            targetY + (1.0 - ease) * 0.95 + Math.sin(elapsedTime * 2.5) * 0.010,
            targetZ
          );

          // Tug & quiver shoot when the giraffe's prehensile tongue wraps around it (bProg in 0.25..0.78)
          const tonguePull = (bProg > 0.22 && bProg < 0.80)
            ? Math.sin(((bProg - 0.22) / 0.58) * Math.PI)
            : 0.0;
          this.browsingShootGroup.rotation.z = -tonguePull * 0.24 + Math.sin(elapsedTime * 14.0) * tonguePull * 0.04;
          this.browsingShootGroup.rotation.x = tonguePull * 0.15;
          this.browsingShootGroup.position.z = -tonguePull * 0.06;

          // Spawn fluttering green leaflets while tongue strips the shoot
          if (tonguePull > 0.45 && Math.random() < dt * 9.0) {
            const lf = this.fallingLeaflets[this.nextLeafletIdx];
            this.nextLeafletIdx = (this.nextLeafletIdx + 1) % this.fallingLeaflets.length;
            lf.active = true;
            lf.age = 0.0;
            lf.mesh.position.set(
              (Math.random() - 0.5) * 0.24,
              4.82 + (Math.random() - 0.5) * 0.06,
              2.28 + (Math.random() - 0.5) * 0.08
            );
            lf.vx = (Math.random() - 0.5) * 0.25;
            lf.vy = -0.35 - Math.random() * 0.25;
            lf.vz = -0.35 - Math.random() * 0.30;
            lf.mesh.visible = true;
          }
        } else {
          this.browsingBranchGroup.visible = false;
        }

        for (const lf of this.fallingLeaflets) {
          if (!lf.active) continue;
          lf.age += dt;
          if (lf.age > 3.2 || lf.mesh.position.y < 0.02) {
            lf.active = false;
            lf.mesh.visible = false;
            continue;
          }
          lf.mesh.position.x += (lf.vx + Math.sin(elapsedTime * 5.0 + lf.age * 4.0) * 0.12) * dt;
          lf.mesh.position.y += lf.vy * dt;
          lf.mesh.position.z += (lf.vz - linearSpeed * 0.6) * dt;
          lf.mesh.rotation.x += dt * 4.5;
          lf.mesh.rotation.y += dt * 3.2;
        }
      }

      // 8. Animate distant soaring savannah birds across the horizon
      if (this.birdFlock) {
        const flockOrbit = elapsedTime * 0.035;
        this.birdFlock.position.x = Math.sin(flockOrbit) * 42.0 - 10.0;
        this.birdFlock.position.z = 64.0 + Math.cos(flockOrbit) * 18.0;
        this.birdFlock.position.y = 16.5 + Math.sin(elapsedTime * 0.4) * 0.8;
        for (const b of this.birds) {
          const flap = Math.sin(elapsedTime * 5.2 + b.phase) * 0.42;
          b.wingL.rotation.z = flap;
          b.wingR.rotation.z = -flap;
        }
      }
    }

    setTimeOfDay(presetKey, lights) {
      if (presetKey === 'golden') {
        this.skyUniforms.topColor.value.setHex(0x285c96);
        this.skyUniforms.midColor.value.setHex(0x96bedb);
        this.skyUniforms.horizonColor.value.setHex(0xf7cfa0);
        this.skyUniforms.sunDir.value.set(0.62, 0.36, 0.68).normalize();
        this.mountainMat.color.setHex(0xbfa38f);
        this.scene.fog.color.setHex(0xeed2ab);
        lights.sun.color.setHex(0xfff0d4);
        lights.sun.intensity = 2.85;
        lights.sun.position.set(14, 11, 14);
        lights.hemi.color.setHex(0xdbeeff);
        lights.hemi.groundColor.setHex(0xb88c52);
        lights.hemi.intensity = 1.05;
        lights.rim.color.setHex(0xffd28a);
        lights.rim.intensity = 1.15;
      } else if (presetKey === 'midday') {
        this.skyUniforms.topColor.value.setHex(0x1f5699);
        this.skyUniforms.midColor.value.setHex(0x7bb2e0);
        this.skyUniforms.horizonColor.value.setHex(0xdce8f2);
        this.skyUniforms.sunDir.value.set(0.30, 0.86, 0.41).normalize();
        this.mountainMat.color.setHex(0x9fb0c2);
        this.scene.fog.color.setHex(0xdce6f0);
        lights.sun.color.setHex(0xffffff);
        lights.sun.intensity = 3.1;
        lights.sun.position.set(8, 22, 10);
        lights.hemi.color.setHex(0xeaf4ff);
        lights.hemi.groundColor.setHex(0xc49f68);
        lights.hemi.intensity = 1.25;
        lights.rim.color.setHex(0xfff4dc);
        lights.rim.intensity = 0.75;
      } else if (presetKey === 'sunset') {
        this.skyUniforms.topColor.value.setHex(0x24264f);
        this.skyUniforms.midColor.value.setHex(0xa85551);
        this.skyUniforms.horizonColor.value.setHex(0xfc9850);
        this.skyUniforms.sunDir.value.set(0.75, 0.18, 0.63).normalize();
        this.mountainMat.color.setHex(0x7d4c4f);
        this.scene.fog.color.setHex(0xe89662);
        lights.sun.color.setHex(0xffb470);
        lights.sun.intensity = 2.65;
        lights.sun.position.set(18, 6.5, 13);
        lights.hemi.color.setHex(0xffb585);
        lights.hemi.groundColor.setHex(0x784b2a);
        lights.hemi.intensity = 0.90;
        lights.rim.color.setHex(0xff8c42);
        lights.rim.intensity = 1.45;
      }
    }
  }

  global.SavannahScene = {
    SavannahEnvironment
  };
})(window);
