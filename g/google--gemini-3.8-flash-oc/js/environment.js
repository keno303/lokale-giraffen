/**
 * Giraffe 3D - African Savanna Environment
 * Builds the savanna landscape, flat-topped umbrella acacia trees, vegetation,
 * sky dome, and dynamic lighting presets (Golden Hour, Midday, Dawn, Starry Night).
 */

const GiraffeEnvironment = (function() {
  'use strict';

  class SavannaWorld {
    constructor(scene, textures) {
      this.scene = scene;
      this.textures = textures;

      this.trees = [];
      this.bushes = [];
      this.rocks = [];
      this.currentPreset = 'sunset';

      this.setupLights();
      this.setupSky();
      this.setupTerrain();
      this.populateSavanna();
      this.applyLightingPreset('sunset');
    }

    setupLights() {
      // Ambient / Hemisphere Light
      this.hemiLight = new THREE.HemisphereLight(0xffeedd, 0x6e523b, 0.48);
      this.scene.add(this.hemiLight);

      // Main Sun / Directional Light with soft shadows
      this.sunLight = new THREE.DirectionalLight(0xffb86b, 1.15);
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.width = 2048;
      this.sunLight.shadow.mapSize.height = 2048;
      this.sunLight.shadow.camera.near = 0.5;
      this.sunLight.shadow.camera.far = 70;

      const d = 16;
      this.sunLight.shadow.camera.left = -d;
      this.sunLight.shadow.camera.right = d;
      this.sunLight.shadow.camera.top = d;
      this.sunLight.shadow.camera.bottom = -d;
      this.sunLight.shadow.bias = -0.0006;
      this.sunLight.shadow.normalBias = 0.02;

      this.scene.add(this.sunLight);

      this.sunTarget = new THREE.Object3D();
      this.scene.add(this.sunTarget);
      this.sunLight.target = this.sunTarget;
    }

    setupSky() {
      // Large Sky Dome
      const skyGeo = new THREE.SphereGeometry(180, 32, 24);

      this.skyUniforms = {
        topColor: { value: new THREE.Color(0x162544) },
        midColor: { value: new THREE.Color(0x6e2c48) },
        bottomColor: { value: new THREE.Color(0xf5923b) }
      };

      const skyMat = new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: `
          varying vec3 vWorldPosition;
          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;
          uniform vec3 topColor;
          uniform vec3 midColor;
          uniform vec3 bottomColor;
          varying vec3 vWorldPosition;
          void main() {
            vec3 nPos = normalize(vWorldPosition);
            float h = clamp(nPos.y * 1.8 + 0.05, 0.0, 1.0);
            vec3 col;
            if (h < 0.45) {
              col = mix(bottomColor, midColor, h / 0.45);
            } else {
              col = mix(midColor, topColor, (h - 0.45) / 0.55);
            }
            gl_FragColor = vec4(col, 1.0);
          }
        `,
        side: THREE.BackSide,
        depthWrite: false
      });

      this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
      this.scene.add(this.skyMesh);

      // Starfield for African Night
      const starGeo = new THREE.BufferGeometry();
      const starPos = [];
      for (let i = 0; i < 1200; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 0.82 + 0.1);
        const r = 175;
        starPos.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
      }
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
      const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, transparent: true, opacity: 0.85 });
      this.stars = new THREE.Points(starGeo, starMat);
      this.stars.visible = false;
      this.scene.add(this.stars);

      // Atmospheric fog
      this.scene.fog = new THREE.FogExp2(0xf5923b, 0.010);
    }

    setupTerrain() {
      const terrainSize = 240;
      const segments = 90;
      const geo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
      geo.rotateX(-Math.PI / 2);

      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);

        const distFromCenter = Math.abs(x);
        let heightMod = 0;
        if (distFromCenter > 4.5) {
          const t = Math.min(1.0, (distFromCenter - 4.5) / 30.0);
          const noiseH = (Math.sin(x * 0.05) * Math.cos(z * 0.04) + Math.sin(x * 0.02 + z * 0.03)) * 1.6;
          heightMod = noiseH * t;
        }

        pos.setY(i, heightMod);
      }
      geo.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({
        map: this.textures.ground,
        roughness: 0.94,
        metalness: 0.02
      });

      this.terrain = new THREE.Mesh(geo, mat);
      this.terrain.receiveShadow = true;
      this.scene.add(this.terrain);
    }

    /**
     * Builds an authentic Flat-Topped Umbrella Acacia Tree (Vachellia tortilis)
     */
    createAcaciaTree(scale = 1.0) {
      const tree = new THREE.Group();

      const barkMat = new THREE.MeshStandardMaterial({
        map: this.textures.bark,
        roughness: 0.92,
        color: 0x4d3b2e
      });

      const canopyMat = new THREE.MeshStandardMaterial({
        map: this.textures.canopy,
        transparent: true,
        alphaTest: 0.15,
        roughness: 0.82,
        color: 0x92a35d,
        side: THREE.DoubleSide
      });

      // Twisted leaning trunk
      const trunkHeight = 4.4 * scale;
      const trunkGeo = new THREE.CylinderGeometry(0.20 * scale, 0.38 * scale, trunkHeight, 10);
      const trunk = new THREE.Mesh(trunkGeo, barkMat);
      trunk.position.y = trunkHeight * 0.5;
      trunk.rotation.z = (Math.random() - 0.5) * 0.18;
      trunk.rotation.x = (Math.random() - 0.5) * 0.18;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      tree.add(trunk);

      // Spreading main branches forming classic vase/umbrella structure
      const numBranches = 5 + Math.floor(Math.random() * 2);
      for (let b = 0; b < numBranches; b++) {
        const branchAngle = (b / numBranches) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
        const branchSpread = (2.2 + Math.random() * 0.8) * scale;
        const branchElevation = (trunkHeight * 0.88) + (Math.random() - 0.5) * 0.4 * scale;

        const branchLen = 3.0 * scale;
        const bGeo = new THREE.CylinderGeometry(0.08 * scale, 0.16 * scale, branchLen, 8);
        const bMesh = new THREE.Mesh(bGeo, barkMat);

        bMesh.position.set(0, branchElevation, 0);
        bMesh.rotation.y = branchAngle;
        bMesh.rotation.z = 0.92 + (Math.random() - 0.5) * 0.18;
        bMesh.position.x += Math.sin(branchAngle) * (branchSpread * 0.4);
        bMesh.position.z += Math.cos(branchAngle) * (branchSpread * 0.4);
        bMesh.castShadow = true;
        tree.add(bMesh);

        // Clustered umbrella foliage disks
        const numDiscs = 2;
        for (let l = 0; l < numDiscs; l++) {
          const discRadius = (2.4 + Math.random() * 1.1) * scale;
          const discGeo = new THREE.CylinderGeometry(discRadius, discRadius * 0.95, 0.15 * scale, 12);
          const disc = new THREE.Mesh(discGeo, canopyMat);

          const discX = Math.sin(branchAngle) * branchSpread * 1.15 + (Math.random() - 0.5) * 0.7 * scale;
          const discZ = Math.cos(branchAngle) * branchSpread * 1.15 + (Math.random() - 0.5) * 0.7 * scale;
          const discY = branchElevation + 1.1 * scale + l * 0.25 * scale;

          disc.position.set(discX, discY, discZ);
          disc.scale.set(1.0, 0.08, 1.0); // Flat umbrella
          disc.castShadow = true;
          disc.receiveShadow = true;
          tree.add(disc);
        }
      }

      return tree;
    }

    createBush(scale = 1.0) {
      const bushMat = new THREE.MeshStandardMaterial({
        color: 0x738042,
        roughness: 0.92
      });
      const bush = new THREE.Group();
      const numPuffs = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < numPuffs; i++) {
        const puffGeo = new THREE.SphereGeometry((0.4 + Math.random() * 0.35) * scale, 8, 8);
        puffGeo.scale(1.2, 0.8, 1.2);
        const puff = new THREE.Mesh(puffGeo, bushMat);
        puff.position.set(
          (Math.random() - 0.5) * 0.8 * scale,
          (0.3 + Math.random() * 0.3) * scale,
          (Math.random() - 0.5) * 0.8 * scale
        );
        puff.castShadow = true;
        bush.add(puff);
      }
      return bush;
    }

    createRock(scale = 1.0) {
      const rockGeo = new THREE.DodecahedronGeometry(0.5 * scale, 1);
      rockGeo.scale(1.2, 0.7, 0.9);
      const rockMat = new THREE.MeshStandardMaterial({
        color: 0x7a6652,
        roughness: 0.95
      });
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.castShadow = true;
      rock.receiveShadow = true;
      return rock;
    }

    populateSavanna() {
      const treeConfigs = [
        { x: -16, z: -10, s: 1.3 },
        { x: 18,  z: -6,  s: 1.4 },
        { x: -24, z: 15,  s: 1.2 },
        { x: 22,  z: 22,  s: 1.5 },
        { x: -18, z: 40,  s: 1.35 },
        { x: 20,  z: 48,  s: 1.25 },
        { x: -28, z: -35, s: 1.6 },
        { x: 25,  z: -30, s: 1.4 },
        { x: -35, z: 0,   s: 1.5 },
        { x: 38,  z: 8,   s: 1.7 },
        { x: -14, z: 75,  s: 1.3 },
        { x: 16,  z: 85,  s: 1.45 },
        { x: -32, z: 110, s: 1.6 },
        { x: 28,  z: 115, s: 1.5 },
        { x: -20, z: -65, s: 1.4 },
        { x: 18,  z: -75, s: 1.3 }
      ];

      treeConfigs.forEach(cfg => {
        const tree = this.createAcaciaTree(cfg.s);
        tree.position.set(cfg.x, 0, cfg.z);
        this.scene.add(tree);
        this.trees.push(tree);
      });

      for (let i = 0; i < 35; i++) {
        const sign = Math.random() > 0.5 ? 1 : -1;
        const x = sign * (6 + Math.random() * 40);
        const z = -60 + Math.random() * 180;
        const s = 0.7 + Math.random() * 0.7;
        const bush = this.createBush(s);
        bush.position.set(x, 0, z);
        this.scene.add(bush);
        this.bushes.push(bush);
      }

      for (let i = 0; i < 25; i++) {
        const sign = Math.random() > 0.5 ? 1 : -1;
        const x = sign * (4.5 + Math.random() * 25);
        const z = -50 + Math.random() * 150;
        const s = 0.5 + Math.random() * 0.8;
        const rock = this.createRock(s);
        rock.position.set(x, s * 0.3, z);
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        this.scene.add(rock);
        this.rocks.push(rock);
      }
    }

    /**
     * Lighting Presets: Sunset, Midday, Dawn, Night
     */
    applyLightingPreset(presetName) {
      this.currentPreset = presetName;
      if (this.stars) {
        this.stars.visible = (presetName === 'night');
      }

      switch(presetName) {
        case 'sunset': // African Golden Hour Sunset
          this.sunLight.color.setHex(0xffaa50);
          this.sunLight.intensity = 1.15;
          this.sunLight.position.set(16, 12, 10);

          this.hemiLight.color.setHex(0xffdfba);
          this.hemiLight.groundColor.setHex(0x69462b);
          this.hemiLight.intensity = 0.50;

          this.skyUniforms.topColor.value.setHex(0x162544);
          this.skyUniforms.midColor.value.setHex(0x6e2c48);
          this.skyUniforms.bottomColor.value.setHex(0xf5923b);

          this.scene.fog.color.setHex(0xf5923b);
          this.scene.fog.density = 0.010;
          break;

        case 'midday': // High African Sun
          this.sunLight.color.setHex(0xfff5e6);
          this.sunLight.intensity = 1.30;
          this.sunLight.position.set(8, 26, 6);

          this.hemiLight.color.setHex(0xddeeff);
          this.hemiLight.groundColor.setHex(0x826c52);
          this.hemiLight.intensity = 0.58;

          this.skyUniforms.topColor.value.setHex(0x2d7ac4);
          this.skyUniforms.midColor.value.setHex(0x76b4e8);
          this.skyUniforms.bottomColor.value.setHex(0xdcebf7);

          this.scene.fog.color.setHex(0xdcebf7);
          this.scene.fog.density = 0.008;
          break;

        case 'dawn': // Soft Morning Safari
          this.sunLight.color.setHex(0xffbc8f);
          this.sunLight.intensity = 1.05;
          this.sunLight.position.set(-18, 9, 8);

          this.hemiLight.color.setHex(0xf9dbd2);
          this.hemiLight.groundColor.setHex(0x544036);
          this.hemiLight.intensity = 0.48;

          this.skyUniforms.topColor.value.setHex(0x384c6e);
          this.skyUniforms.midColor.value.setHex(0x84556f);
          this.skyUniforms.bottomColor.value.setHex(0xf59e78);

          this.scene.fog.color.setHex(0xf59e78);
          this.scene.fog.density = 0.014;
          break;

        case 'night': // Starry African Night
          this.sunLight.color.setHex(0x7c9ecc);
          this.sunLight.intensity = 0.38;
          this.sunLight.position.set(12, 18, -10);

          this.hemiLight.color.setHex(0x141f2e);
          this.hemiLight.groundColor.setHex(0x0a0d12);
          this.hemiLight.intensity = 0.28;

          this.skyUniforms.topColor.value.setHex(0x03060c);
          this.skyUniforms.midColor.value.setHex(0x0b1320);
          this.skyUniforms.bottomColor.value.setHex(0x142033);

          this.scene.fog.color.setHex(0x0c1320);
          this.scene.fog.density = 0.012;
          break;
      }
    }

    setVegetationVisible(visible) {
      const v = !!visible;
      this.trees.forEach(t => t.visible = v);
      this.bushes.forEach(b => b.visible = v);
      this.rocks.forEach(r => r.visible = v);
    }

    update(giraffeZ) {
      this.sunTarget.position.z = giraffeZ;
      this.sunLight.position.z = giraffeZ + 8;
      this.skyMesh.position.z = giraffeZ;
      if (this.stars) this.stars.position.z = giraffeZ;
      this.terrain.position.z = Math.floor(giraffeZ / 40) * 40;
    }
  }

  return {
    SavannaWorld
  };
})();
