/* ---------------------------------------------------------------------------
 * world.js — East-African savanna: procedural sky + IBL, sun with fitted
 * shadow camera, scrolling ground, distant ridges, acacia trees, dry grass
 * (instanced, wind-swayed), rocks, and hoof dust particles.
 * ------------------------------------------------------------------------- */
(function () {
  class World {
    constructor(scene, renderer, tex) {
      this.scene = scene;
      this.renderer = renderer;
      this.tex = tex;
      this.time = 0;
      this.center = new THREE.Vector3();
      this.dayNight = 0.32;          // 0 = dawn/dusk, 1 = high noon
      this.travellers = [];          // objects that scroll with the giraffe
      this._buildLights();
      this._buildSky();
      this._buildGround();
      this._buildRidges();
      this._buildProps();
      this._buildDust();
      this.setTimeOfDay(this.dayNight);
    }

    /* ---------------------------------------------------------- lights */
    _buildLights() {
      const s = this.scene;
      this.sun = new THREE.DirectionalLight(0xfff2d8, 3.0);
      this.sun.castShadow = true;
      const c = this.sun.shadow;
      c.mapSize.set(2048, 2048);
      c.camera.near = 1; c.camera.far = 90;
      c.camera.left = -9; c.camera.right = 9; c.camera.top = 9; c.camera.bottom = -9;
      c.bias = -0.0006; c.normalBias = 0.02; c.radius = 2.2;
      s.add(this.sun);
      s.add(this.sun.target);

      this.hemi = new THREE.HemisphereLight(0xbcd7f2, 0xb0895a, 0.9);
      s.add(this.hemi);

      this.fill = new THREE.DirectionalLight(0xd8e6ff, 0.35);
      this.fill.position.set(-6, 4, -8);
      s.add(this.fill);

      this.fog = new THREE.FogExp2(0xd8d2c4, 0.0035);
      s.fog = this.fog;
    }

    /* ------------------------------------------------------------ sky */
    _buildSky() {
      this.skyCanvas = U.canvas(1024, 512);
      this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
      this.skyTex.mapping = THREE.EquirectangularReflectionMapping;
      this.skyTex.colorSpace = THREE.SRGBColorSpace;
      this.skyTex.wrapS = THREE.RepeatWrapping;
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(700, 48, 32),
        new THREE.MeshBasicMaterial({ map: this.skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
      );
      this.skyDome = dome;
      this.scene.add(dome);
      this.pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envRT = null;
    }

    /* --------------------------------------------------------- ground */
    _buildGround() {
      const g = new THREE.PlaneGeometry(900, 900, 1, 1);
      const mat = new THREE.MeshStandardMaterial({
        map: this.tex.ground.map,
        normalMap: this.tex.ground.normalMap,
        roughness: 0.97, metalness: 0,
        normalScale: new THREE.Vector2(1.1, 1.1),
      });
      const t = this.tex.ground.map;
      t.repeat.set(900 / 4.5, 900 / 4.5);          // tile every 4.5 m
      const n = this.tex.ground.normalMap;
      n.repeat.copy(t.repeat);
      this.ground = new THREE.Mesh(g, mat);
      this.ground.rotation.x = -Math.PI / 2;
      this.ground.receiveShadow = true;
      this.scene.add(this.ground);
      this.groundMat = mat;
    }

    /* -------------------------------------------------------- ridges */
    _buildRidges() {
      // a distant, hazy hill ring: triangle strip around the listener
      const SEG = 200, R = 430;
      const pos = [], idx = [];
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        const x = Math.cos(a) * R, z = Math.sin(a) * R;
        const h = 12 + 52 * Math.pow(U.fbmt(i / SEG, 0.3, 3.0, 0.5, 4), 1.6)
          + 18 * Math.pow(U.fbmt(i / SEG + 0.4, 0.8, 7.0, 1.0, 3), 2.2);
        pos.push(x, -4, z, x, h, z);
        if (i < SEG) {
          const b = i * 2;
          idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ color: 0xa9a58f, flatShading: true });
      this.ridges = new THREE.Mesh(g, mat);
      this.scene.add(this.ridges);
    }

    /* ---------------------------------------------------- trees & props */
    _buildProps() {
      const s = this.scene;
      this.treeGroup = new THREE.Group();
      s.add(this.treeGroup);
      this.acacias = [];
      for (let i = 0; i < 7; i++) {
        const t = this._acacia(3.2 + U.rnd() * 3.4);
        this.acacias.push(t);
        this.treeGroup.add(t);
      }
      this.bushGroup = new THREE.Group();
      s.add(this.bushGroup);
      this.bushes = [];
      for (let i = 0; i < 14; i++) {
        const b = this._bush();
        this.bushes.push(b);
        this.bushGroup.add(b);
      }
      this.rocks = [];
      for (let i = 0; i < 16; i++) {
        const r = this._rock();
        this.rocks.push(r);
        this.bushGroup.add(r);
      }
      this._buildGrass();
    }

    _trunk(len, r0, r1, lean, segs) {
      const pts = [];
      const rs = [];
      let y = 0;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        pts.push([Math.sin(t * 2.0) * lean * t, t * len, Math.cos(t * 1.3) * lean * 0.4 * t]);
        rs.push([U.lerp(r0, r1, t), U.lerp(r0, r1, t) * (1 + 0.12 * (1 - t))]);
      }
      return G.loft({
        path: pts, radii: rs, radial: 12, sub: 5, noise: 0.12,
        uv: [1.2, len * 0.6],
      });
    }

    _acacia(h) {
      const g = new THREE.Group();
      const M = this.tex.barkMat;
      const trunk = new THREE.Mesh(this._trunk(h * 0.62, 0.34, 0.16, 0.5, 5), M);
      trunk.castShadow = true; trunk.receiveShadow = true;
      g.add(trunk);
      // branching crown
      const nb = 5 + Math.floor(U.rnd() * 3);
      const canopyY = h * 0.66;
      for (let i = 0; i < nb; i++) {
        const a = (i / nb) * Math.PI * 2 + U.rnd();
        const len = h * (0.35 + U.rnd() * 0.25);
        const b = new THREE.Mesh(this._trunk(len, 0.13, 0.04, 0.6, 4), M);
        b.position.set(Math.cos(a) * 0.25, h * 0.5 + U.rnd() * h * 0.1, Math.sin(a) * 0.25);
        b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
        b.castShadow = true;
        g.add(b);
        // foliage slab at the end of each branch
        const fx = b.position.x + Math.sin(b.rotation.z) * -0 + Math.cos(a) * len * 0.62;
        const fz = b.position.z + Math.sin(a) * len * 0.62;
        const fy = canopyY + len * 0.42 + U.rnd() * 0.4;
        g.add(this._canopy(fx, fy, fz, h * (0.5 + U.rnd() * 0.28)));
      }
      // a couple of thin vertical twigs to sell the silhouette
      for (let i = 0; i < 3; i++) {
        const t = new THREE.Mesh(this._trunk(h * 0.32, 0.09, 0.02, 0.35, 3), M);
        t.position.set(U.range(-0.4, 0.4), h * 0.55 + U.rnd() * 0.4, U.range(-0.4, 0.4));
        t.rotation.set(U.range(-0.3, 0.3), 0, U.range(-0.3, 0.3));
        t.castShadow = true;
        g.add(t);
      }
      return g;
    }

    _canopy(x, y, z, r) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const mat = this.tex.leafMat;
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI;
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 0.85), mat);
        pl.rotation.y = a;
        pl.rotation.x = -0.06;
        pl.position.y = (i % 2) * r * 0.12 - r * 0.08;
        pl.castShadow = true;
        g.add(pl);
      }
      // flat top disc reads as the classic acacia plateau
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 1.05, 20), mat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = r * 0.16;
      g.add(disc);
      return g;
    }

    _bush() {
      const g = new THREE.Group();
      const r = U.range(0.4, 1.1);
      const n = 4 + Math.floor(U.rnd() * 3);
      for (let i = 0; i < n; i++) {
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.6, r * 1.1), this.tex.leafMatDry);
        pl.rotation.y = (i / n) * Math.PI;
        pl.position.y = r * 0.5;
        pl.castShadow = true;
        g.add(pl);
      }
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 10, 8), this.tex.bushMat);
      ball.position.y = r * 0.45;
      ball.scale.y = 0.8;
      ball.castShadow = true;
      g.add(ball);
      return g;
    }

    _rock() {
      const s = U.range(0.2, 0.85);
      const g = new THREE.IcosahedronGeometry(s, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const n = U.fbm2(p.getX(i) * 1.6, p.getZ(i) * 1.6 + p.getY(i), 3);
        p.setXYZ(i,
          p.getX(i) * (0.8 + n * 0.5),
          p.getY(i) * (0.55 + n * 0.35),
          p.getZ(i) * (0.8 + n * 0.5));
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.tex.rockMat);
      m.castShadow = true; m.receiveShadow = true;
      m.scale.y = U.range(0.5, 1.1);
      return m;
    }

    /* ------------------------------------------------------- grass */
    _buildGrass() {
      const COUNT = 1500;
      const w = U.range.bind(U);
      const geo = new THREE.BufferGeometry();
      // crossed quads
      const planes = [];
      const mk = rot => {
        const p = new THREE.PlaneGeometry(1, 1, 1, 3);
        p.translate(0, 0.5, 0);
        p.rotateY(rot);
        return p;
      };
      const a = mk(0), b = mk(Math.PI / 2.4), c = mk(-Math.PI / 2.4);
      const merged = G.merge([{ geo: a }, { geo: b }, { geo: c }]);
      const im = new THREE.InstancedMesh(merged, this.tex.grassMat, COUNT);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.grass = im;
      this.grassData = [];
      const dummy = new THREE.Object3D();
      for (let i = 0; i < COUNT; i++) {
        const d = {
          base: U.rnd() * 6.28,
          scale: new THREE.Vector2(U.range(0.5, 1.5), U.range(0.45, 1.25)),
          rot: U.rnd() * Math.PI,
          x: 0, z: 0,
        };
        this.grassData.push(d);
        this._placeGrass(i, dummy);
      }
      im.instanceMatrix.needsUpdate = true;
      this.scene.add(im);
      this.grassCount = COUNT;
    }

    _placeGrass(i, dummy) {
      const d = this.grassData[i];
      // scatter in a band ahead/behind the traveller centre
      const span = 78;
      d.x = this.center.x - 20 + U.rnd() * span;
      d.z = this.center.z + U.range(-34, 34) * (0.4 + Math.random() * 0.6);
      d.z = this.center.z + (Math.abs(d.z - this.center.z) < 1.4 && U.rnd() > 0.3
        ? (U.rnd() - 0.5) * 6 : (d.z - this.center.z));
      const s = d.scale;
      dummy.position.set(d.x, 0, d.z);
      dummy.rotation.set(0, d.rot, 0);
      dummy.scale.set(s.x, s.y, s.x);
      dummy.updateMatrix();
      this.grass.setMatrixAt(i, dummy.matrix);
    }

    /* --------------------------------------------------------- dust */
    _buildDust() {
      const N = 420;
      const pos = new Float32Array(N * 3);
      const alpha = new Float32Array(N);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alpha, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTex: { value: this.tex.dustSprite },
          uSize: { value: 320 * window.devicePixelRatio },
          uColor: { value: new THREE.Color(0xdcc9a4) },
        },
        vertexShader: `
          attribute float aAlpha;
          varying float vA;
          uniform float uSize;
          void main(){
            vA = aAlpha;
            vec4 mv = modelViewMatrix * vec4(position,1.0);
            gl_PointSize = uSize * (0.4 + aAlpha) / max(0.5, -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform sampler2D uTex; uniform vec3 uColor; varying float vA;
          void main(){
            vec4 t = texture2D(uTex, gl_PointCoord);
            gl_FragColor = vec4(uColor, t.a * vA * 0.75);
          }`,
        transparent: true, depthWrite: false,
      });
      this.dust = new THREE.Points(g, mat);
      this.dust.frustumCulled = false;
      this.scene.add(this.dust);
      this.dustParts = [];
      for (let i = 0; i < N; i++) this.dustParts.push({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 1 });
      this.dustGeo = g;
      this.dustIdx = 0;
    }

    emitDust(p, strength) {
      const n = Math.round(4 + strength * 7);
      for (let i = 0; i < n; i++) {
        const d = this.dustParts[this.dustIdx % this.dustParts.length];
        this.dustIdx++;
        d.life = 1;
        d.pos.set(p.x + U.range(-0.12, 0.12), p.y + U.range(-0.05, 0.12), p.z + U.range(-0.12, 0.12));
        d.vel.set(U.range(-0.5, 0.9) * strength, U.range(0.15, 0.75) * strength, U.range(-0.4, 0.4) * strength);
      }
    }

    /* ------------------------------------------------- per-frame work */
    setTimeOfDay(t) {
      this.dayNight = U.clamp(t, 0, 1);
      const el = U.lerp(0.06, 0.86, this.dayNight);        // sun elevation (sin)
      const az = U.lerp(-2.5, -1.1, this.dayNight);
      const dir = new THREE.Vector3(Math.cos(az) * 0.8, el, Math.sin(az) * 0.8).normalize();
      this.sunDir = dir;
      const warm = 1 - this.dayNight;
      const sunCol = new THREE.Color().setRGB(
        1.0, U.lerp(0.62, 0.93, this.dayNight), U.lerp(0.30, 0.82, this.dayNight));
      this.sun.color.copy(sunCol);
      this.sun.intensity = U.lerp(1.7, 3.4, this.dayNight);
      this.hemi.intensity = U.lerp(0.45, 1.0, this.dayNight);
      this.hemi.color.setRGB(U.lerp(0.85, 0.62, this.dayNight), U.lerp(0.72, 0.78, this.dayNight), U.lerp(0.68, 0.92, this.dayNight));
      this.fog.color.setRGB(U.lerp(0.85, 0.80, this.dayNight), U.lerp(0.74, 0.79, this.dayNight), U.lerp(0.60, 0.70, this.dayNight));
      this.fog.density = U.lerp(0.0052, 0.0032, this.dayNight);

      const zen = [U.lerp(70, 52, this.dayNight), U.lerp(96, 122, this.dayNight), U.lerp(150, 186, this.dayNight)];
      const hor = [U.lerp(236, 202, this.dayNight), U.lerp(176, 210, this.dayNight), U.lerp(130, 198, this.dayNight)];
      const canvas = T.skyCanvas({
        w: 1024, h: 512,
        zenith: zen, horizon: hor,
        ground: [hor[0] * 0.62, hor[1] * 0.6, hor[2] * 0.58],
        sunDir: [dir.x, dir.y, dir.z],
        sunColor: [255, U.lerp(190, 246, this.dayNight), U.lerp(140, 226, this.dayNight)],
        sunSize: U.lerp(0.055, 0.03, this.dayNight),
        haze: U.lerp(0.85, 0.4, this.dayNight),
        cloud: U.lerp(0.5, 0.68, this.dayNight),
      });
      // reuse the same canvas object so the texture keeps its upload handle
      this.skyCanvas.getContext('2d').drawImage(canvas, 0, 0);
      this.skyTex.needsUpdate = true;
      if (this.envRT) { this.envRT.dispose(); this.envRT = null; }
      this.envRT = this.pmrem.fromEquirectangular(this.skyTex);
      this.scene.environment = this.envRT.texture;
      this.scene.background = null;
    }

    follow(target) {
      // keep ground, sky, ridges and props centred on the walker
      this.center.copy(target);
      this.skyDome.position.set(this.center.x, 0, this.center.z);
      this.ridges.position.set(this.center.x, 0, this.center.z);
      this.sun.position.set(this.center.x + this.sunDir.x * 40, this.sunDir.y * 40, this.center.z + this.sunDir.z * 40);
      this.sun.target.position.set(this.center.x, 2.2, this.center.z);
      this.sun.target.updateMatrixWorld();
      // scroll ground texture so the surface appears to move under the feet
      const rep = this.groundMat.map.repeat.x;
      const off = (this.center.x / 4.5) * rep / rep;   // one tile per 4.5 m
      this.groundMat.map.offset.x = (this.center.x / 4.5) % 1;
      this.groundMat.normalMap.offset.x = this.groundMat.map.offset.x;
      this.ground.position.set(this.center.x, 0, this.center.z);
      this._recycle();
    }

    _recycle() {
      const cx = this.center.x;
      const back = cx - 30, ahead = cx + 90;
      const recycle = arr => {
        for (const o of arr) {
          if (o.position.x < back || o.position.x > ahead + 40) {
            o.position.x = U.range(cx + 25, ahead);
            o.position.z = cx > 0 ? U.range(-38, 38) : U.range(-38, 38);
            if (Math.abs(o.position.z) < 2.2) o.position.z += 3.5 * Math.sign(o.position.z || 1);
            o.rotation.y = U.rnd() * 6.28;
          }
        }
      };
      recycle(this.acacias);
      recycle(this.bushes);
      recycle(this.rocks);
      // grass: recycle individual instances that fell behind
      const dummy = this._dummy || (this._dummy = new THREE.Object3D());
      for (let i = 0; i < this.grassCount; i++) {
        const d = this.grassData[i];
        if (d.x < back || d.x > ahead) {
          d.x = U.range(cx + 10, ahead);
          d.z = this.center.z + U.range(-30, 30);
          d.rot = U.rnd() * Math.PI;
          const s = d.scale;
          dummy.position.set(d.x, 0, d.z);
          dummy.rotation.set(0, d.rot, 0);
          dummy.scale.set(s.x, s.y, s.x);
          dummy.updateMatrix();
          this.grass.setMatrixAt(i, dummy.matrix);
        }
      }
      this.grass.instanceMatrix.needsUpdate = true;
    }

    update(dt, moving) {
      this.time += dt;
      if (this.tex.grassMat.userData.shader) this.tex.grassMat.userData.shader.uniforms.uTime.value = this.time;
      if (this.tex.leafMat.userData.shader) this.tex.leafMat.userData.shader.uniforms.uTime.value = this.time;
      // dust
      const pos = this.dustGeo.attributes.position.array;
      const al = this.dustGeo.attributes.aAlpha.array;
      for (let i = 0; i < this.dustParts.length; i++) {
        const d = this.dustParts[i];
        if (d.life > 0) {
          d.life -= dt * 0.55;
          d.vel.multiplyScalar(1 - dt * 1.6);
          d.vel.y += dt * 0.18;
          d.pos.addScaledVector(d.vel, dt);
        } else {
          d.life = 0;
          d.pos.y = -999;
        }
        pos[i * 3] = d.pos.x; pos[i * 3 + 1] = d.pos.y; pos[i * 3 + 2] = d.pos.z;
        al[i] = Math.max(0, d.life) * 0.9;
      }
      this.dustGeo.attributes.position.needsUpdate = true;
      this.dustGeo.attributes.aAlpha.needsUpdate = true;
    }
  }

  window.World = World;
})();
