/* =========================================================================
   world.js — sky, light, ground and savannah scenery.
   ========================================================================= */
(function (global) {
  'use strict';

  const U = global.U;
  const THREE = global.THREE;

  function makeCanvasTexture(canvas, repeatX, repeatY, srgb) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX || 1, repeatY || 1);
    t.anisotropy = 8;
    if (srgb !== false) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function createWorld(renderer, scene, opts) {
    opts = opts || {};
    const W = {};

    /* ---------------- sky + environment ------------------------------- */
    const skyCanvas = global.Tex.makeSky();
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.mapping = THREE.EquirectangularReflectionMapping;
    skyTex.encoding = THREE.sRGBEncoding;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envRT = pmrem.fromEquirectangular(skyTex);
    scene.environment = envRT.texture;
    scene.background = skyTex;
    scene.fog = new THREE.Fog(U.srgb(0xc3d5e3), 60, 330);

    /* ---------------- lights ------------------------------------------ */
    const sun = new THREE.DirectionalLight(U.srgb(0xfff2dc), 1.75);
    sun.position.set(24, 34, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 11;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 8; sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.022;
    scene.add(sun);
    scene.add(sun.target);

    const hemi = new THREE.HemisphereLight(U.srgb(0xa8ccec), U.srgb(0x8a7350), 0.30);
    scene.add(hemi);
    const bounce = new THREE.DirectionalLight(U.srgb(0xffd2a0), 0.16);
    bounce.position.set(-12, 6, -14);
    scene.add(bounce);

    /* ---------------- ground ------------------------------------------ */
    const gTex = global.Tex.makeGround({ size: 1024 });
    const groundMap = makeCanvasTexture(gTex.canvas, 62, 62, true);
    const groundNrm = makeCanvasTexture(gTex.normalCanvas, 62, 62, false);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundMap, normalMap: groundNrm,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.97, metalness: 0.0, color: U.srgb(0xffffff),
      envMapIntensity: 0.55
    });
    // large scale colour variation so the tiling of the detail texture is
    // not readable - sampled with a much lower frequency and multiplied in.
    const macroCanvas = global.Tex.makeGround({ size: 512, seed: 909 });
    const macroTex = makeCanvasTexture(macroCanvas.canvas, 7, 7, true);
    groundMat.userData.macro = { value: macroTex };
    groundMat.onBeforeCompile = function (shader) {
      shader.uniforms.macroMap = groundMat.userData.macro;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vMacroUv;')
        .replace('#include <uv_vertex>', 'vMacroUv = uv;\n#include <uv_vertex>');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D macroMap;\nvarying vec2 vMacroUv;')
        .replace('#include <map_fragment>', [
          '#include <map_fragment>',
          '#ifdef USE_MAP',
          '  vec4 macroC = texture2D( macroMap, vMacroUv );',
          '  float mv = smoothstep( 0.28, 0.62, macroC.g );',
          '  diffuseColor.rgb *= mix( vec3(0.72), vec3(1.22), mv );',
          '#endif'
        ].join('\n'));
    };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 1, 1), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y = 0;
    scene.add(ground);
    W.ground = ground;

    /* ---------------- grass tufts -------------------------------------- */
    const bladeCanvas = global.Tex.makeGrassBlade(64);
    const bladeTex = new THREE.CanvasTexture(bladeCanvas);
    bladeTex.encoding = THREE.sRGBEncoding;
    const tuftGeo = new THREE.BufferGeometry();
    {
      // three crossed quads
      const pos = [], nor = [], uv = [], idx = [];
      const dirs = [0, Math.PI / 3, -Math.PI / 3];
      for (let d = 0; d < dirs.length; d++) {
        const a = dirs[d];
        const dx = Math.cos(a) * 0.16, dz = Math.sin(a) * 0.16;
        const b = pos.length / 3;
        pos.push(-dx, 0, -dz, dx, 0, dz, dx, 0.34, dz, -dx, 0.34, -dz);
        for (let k = 0; k < 4; k++) nor.push(0, 1, 0);
        uv.push(0, 0, 1, 0, 1, 1, 0, 1);
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      tuftGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      tuftGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      tuftGeo.setIndex(idx);
    }
    const tuftMat = new THREE.MeshStandardMaterial({
      map: bladeTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
      roughness: 0.9, metalness: 0
    });
    const TUFTS = 520;
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, TUFTS);
    tufts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    tufts.frustumCulled = false;
    tufts.castShadow = false;
    tufts.receiveShadow = false;
    scene.add(tufts);
    const dummy = new THREE.Object3D();
    const rnd = U.mulberry32(2024);
    const tuftData = [];
    for (let i = 0; i < TUFTS; i++) {
      tuftData.push({
        x: (rnd() - 0.5) * 190,
        z: (rnd() - 0.5) * 120 - 6,
        s: 0.7 + rnd() * 1.5,
        r: rnd() * Math.PI * 2
      });
    }
    W.updateTufts = function (centreX) {
      for (let i = 0; i < TUFTS; i++) {
        const t = tuftData[i];
        let x = t.x - centreX;
        // recycle in a band around the giraffe
        const band = 150;
        x = ((x + band * 0.5) % band + band) % band - band * 0.5;
        const wx = centreX + x;
        dummy.position.set(wx, 0, t.z);
        dummy.rotation.set(0, t.r, 0);
        dummy.scale.set(t.s, t.s * (0.8 + 0.4 * ((i * 37) % 10) / 10), t.s);
        dummy.updateMatrix();
        tufts.setMatrixAt(i, dummy.matrix);
      }
      tufts.instanceMatrix.needsUpdate = true;
    };

    /* ---------------- rocks ------------------------------------------- */
    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    {
      const p = rockGeo.attributes.position;
      const r2 = U.mulberry32(88);
      // displace per triangle so the shell stays closed
      for (let f = 0; f < p.count; f += 3) {
        const s = 0.72 + r2() * 0.42;
        const cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
        const flat = 0.55 + 0.12 * r2();
        for (let k = 0; k < 3; k++) {
          const i = f + k;
          p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * flat, p.getZ(i) * s);
        }
        if (cy < -0.55) { /* keep the bottom flatter */ }
      }
      rockGeo.computeVertexNormals();
    }
    const rockMat = new THREE.MeshStandardMaterial({ color: U.srgb(0x7a6f5d), roughness: 0.95, flatShading: true, envMapIntensity: 0.5 });
    const ROCKS = 46;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
    rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rocks.frustumCulled = false;
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    scene.add(rocks);
    const rockData = [];
    for (let i = 0; i < ROCKS; i++) {
      rockData.push({
        x: (rnd() - 0.5) * 170,
        z: (rnd() - 0.5) * 90 + 8,
        s: 0.22 + rnd() * 0.85,
        r: rnd() * Math.PI * 2
      });
    }
    W.updateRocks = function (centreX) {
      for (let i = 0; i < ROCKS; i++) {
        const r = rockData[i];
        const band = 140;
        let x = r.x - centreX;
        x = ((x + band * 0.5) % band + band) % band - band * 0.5;
        dummy.position.set(centreX + x, r.s * 0.30, r.z);
        dummy.rotation.set(0, r.r, 0);
        dummy.scale.set(r.s, r.s * 0.75, r.s);
        dummy.updateMatrix();
        rocks.setMatrixAt(i, dummy.matrix);
      }
      rocks.instanceMatrix.needsUpdate = true;
    };

    /* ---------------- distant acacias ----------------------------------- */
    const treeGroup = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: U.srgb(0x6a5340), roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: U.srgb(0x55663a), roughness: 0.92, flatShading: true });
    const trees = [];
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      const h = 3.6 + Math.random() * 2.6;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.38, h, 8), trunkMat);
      trunk.position.y = h / 2;
      trunk.rotation.z = (Math.random() - 0.5) * 0.12;
      g.add(trunk);
      // forked branches
      for (let b = 0; b < 3; b++) {
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.14, 1.9 + Math.random() * 0.8, 6), trunkMat);
        br.position.set(0, h * 0.82, 0);
        br.rotation.set(Math.random() * 0.5 - 0.25, Math.random() * 6.28, 1.05 + Math.random() * 0.45);
        g.add(br);
      }
      // flat umbrella canopy made of overlapping blobs
      const cw = 3.0 + Math.random() * 1.6;
      for (let b = 0; b < 5; b++) {
        const canopy = new THREE.Mesh(new THREE.SphereGeometry(cw * (0.30 + Math.random() * 0.18), 9, 6), leafMat);
        canopy.scale.set(1, 0.34 + Math.random() * 0.10, 1);
        canopy.position.set((Math.random() - 0.5) * cw * 1.7, h + Math.random() * 0.7, (Math.random() - 0.5) * cw * 1.7);
        g.add(canopy);
      }
      g.position.set((i - 4) * 24 + rnd() * 14, 0, -40 - rnd() * 45);
      g.traverse(function (o) { if (o.isMesh) o.castShadow = false; });
      treeGroup.add(g);
      trees.push(g);
    }
    scene.add(treeGroup);
    W.updateTrees = function (centreX) {
      for (const t of trees) {
        t.position.x = ((t.position.x - centreX + 120) % 240 + 240) % 240 - 120 + centreX;
      }
    };

    W.sun = sun;
    W.sky = skyTex;
    W.pmrem = pmrem;
    W.setCentre = function (x) {
      ground.position.x = x;
      sun.target.position.set(x, 2.2, 0);
      sun.position.set(x + 24, 34, 18);
      sun.target.updateMatrixWorld();
      W.updateTufts(x);
      W.updateRocks(x);
      W.updateTrees(x);
    };
    return W;
  }

  global.World = { create: createWorld, makeCanvasTexture: makeCanvasTexture };
})(window);
