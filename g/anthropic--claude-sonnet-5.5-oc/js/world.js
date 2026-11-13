/* Savanna environment: sky, terrain, grass, acacias, rocks, lighting */
(function () {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const { loft, profile, mergeGeometries, mulberry32 } = GU;

  // ---- small JS noise for terrain / placement
  function h2(x, y) { let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
  function vn2(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function fbm2(x, y) { let s = 0, a = 0.5; for (let i = 0; i < 5; i++) { s += a * vn2(x, y); x = x * 2.02 + 3.1; y = y * 2.02 + 7.7; a *= 0.5; } return s; }

  function groundHeight(x, z) {
    const r = Math.hypot(x, z);
    const far = GU.smoothstep(105, 420, r);
    const ridge = fbm2(x * 0.004 + 10, z * 0.004 - 4);
    return far * (10 + 60 * ridge * ridge) * far + 0.0;
  }

  const SKY_VERT = /* glsl */`
    varying vec3 vDir;
    void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }
  `;
  const SKY_FRAG = /* glsl */`
    varying vec3 vDir;
    uniform vec3 uSun;
    uniform float uTime;
    ${NOISE_GLSL}
    void main(){
      vec3 d = normalize(vDir);
      float h = clamp(d.y, -0.2, 1.0);
      vec3 zen = pow(vec3(0.20,0.42,0.80), vec3(2.2));
      vec3 mid = pow(vec3(0.55,0.72,0.92), vec3(2.2));
      vec3 hor = pow(vec3(0.93,0.82,0.66), vec3(2.2));
      vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h));
      col = mix(col, zen, smoothstep(0.15, 0.85, h));
      float sd = max(dot(d, uSun), 0.0);
      col += pow(vec3(1.0,0.78,0.5), vec3(2.2)) * (pow(sd, 6.0)*0.35 + pow(sd, 64.0)*0.8);
      col += vec3(1.0,0.95,0.85) * smoothstep(0.9995, 0.9999, sd) * 12.0;
      // clouds
      if(d.y > 0.02){
        vec2 uv = d.xz/(d.y+0.18)*1.3 + vec2(uTime*0.004, 0.0);
        float n = fbm3(vec3(uv*1.4, 0.0)) ;
        float c = smoothstep(0.50, 0.78, n) * smoothstep(0.02, 0.25, d.y);
        vec3 cc = mix(pow(vec3(0.75,0.78,0.85),vec3(2.2)), vec3(1.05,1.0,0.95), smoothstep(0.5,0.85,n));
        cc = mix(cc, col, 0.15);
        col = mix(col, cc, c*0.85);
      }
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;

  class World {
    constructor(renderer) {
      this.scene = new THREE.Scene();
      this.renderer = renderer;
      this.uniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector2() } };
      this.sunDir = V(-0.55, 0.50, 0.62).normalize();
      this.buildSky();
      this.buildLights();
      this.buildGround();
      this.buildGrass();
      this.buildTrees();
      this.buildRocks();
      this.scene.fog = new THREE.FogExp2(0xd9c7a4, 0.0042);
    }

    buildSky() {
      this.skyUniforms = { uSun: { value: this.sunDir }, uTime: this.uniforms.uTime };
      const mat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false });
      const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
      sky.renderOrder = -10;
      sky.frustumCulled = false;
      this.sky = sky;
      this.scene.add(sky);
      // image based lighting from the sky
      const envScene = new THREE.Scene();
      const envSky = new THREE.Mesh(sky.geometry, mat);
      envScene.add(envSky);
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pm.fromScene(envScene, 0.02, 1, 2000).texture;
      this.envMapHolder = pm;
    }

    buildLights() {
      const sun = new THREE.DirectionalLight(0xfff0d8, 3.4);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const c = sun.shadow.camera;
      c.left = -9; c.right = 9; c.top = 9; c.bottom = -9; c.near = 1; c.far = 120;
      sun.shadow.bias = -0.0003;
      sun.shadow.normalBias = 0.025;
      sun.shadow.radius = 3;
      this.sun = sun;
      this.scene.add(sun, sun.target);
      const hemi = new THREE.HemisphereLight(0xa8c4ea, 0xa88a58, 0.35);
      this.scene.add(hemi);
    }

    buildGround() {
      const size = 1800, seg = 220;
      const g = new THREE.PlaneGeometry(size, size, seg, seg);
      g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, groundHeight(p.getX(i), p.getZ(i)));
      g.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n vW = (modelMatrix*vec4(position,1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
            varying vec3 vW;
            ${NOISE_GLSL}
            vec3 srgbG(vec3 c){ return pow(c, vec3(2.2)); }
            float groundH(vec3 w){ return vnoise(w*7.0)*0.02 + vnoise(w*31.0)*0.008 + vnoise(w*1.3)*0.05; }
            vec3 perturbG( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
              vec3 vSigmaX = dFdx( surf_pos.xyz ); vec3 vSigmaY = dFdy( surf_pos.xyz );
              vec3 R1 = cross( vSigmaY, surf_norm ); vec3 R2 = cross( surf_norm, vSigmaX );
              float fDet = dot( vSigmaX, R1 ) * faceDirection;
              vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
              return normalize( abs( fDet ) * surf_norm - vGrad );
            }
          `)
          .replace('#include <map_fragment>', `
            vec3 wp = vW;
            float n1 = fbm3(wp*0.035);
            float n2 = fbm3(wp*0.21+4.0);
            float n3 = vnoise(wp*5.0);
            float n4 = vnoise(wp*38.0);
            vec3 gold = srgbG(vec3(0.66,0.54,0.30));
            vec3 straw = srgbG(vec3(0.75,0.65,0.40));
            vec3 green = srgbG(vec3(0.38,0.43,0.19));
            vec3 soil = srgbG(vec3(0.50,0.37,0.25));
            vec3 gc = mix(gold, straw, smoothstep(0.35,0.7,n2));
            gc = mix(gc, green, smoothstep(0.52,0.72,n1)*0.85);
            gc = mix(gc, soil, smoothstep(0.58,0.78,fbm3(wp*0.09+11.0))*0.8);
            gc *= 0.82 + 0.3*n3;
            gc *= 0.88 + 0.24*n4;
            float hills = smoothstep(120.0, 380.0, length(wp.xz));
            gc = mix(gc, srgbG(vec3(0.46,0.42,0.26)), hills*0.6);
            diffuseColor.rgb *= gc;
          `)
          .replace('#include <normal_fragment_maps>', `
            #include <normal_fragment_maps>
            {
              float fade = 1.0 - smoothstep(6.0, 40.0, length(vViewPosition));
              float hh = groundH(vW);
              vec2 dH = vec2(dFdx(hh), dFdy(hh)) * fade;
              normal = perturbG(-vViewPosition, normal, dH, faceDirection);
            }
          `);
      };
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      this.ground = m;
      this.scene.add(m);
    }

    buildGrass() {
      const rnd = mulberry32(99);
      // tuft geometry: several curved ribbons
      const blades = [];
      const nb = 7;
      for (let b = 0; b < nb; b++) {
        const ang = rnd() * Math.PI * 2, rad = 0.02 + rnd() * 0.13;
        const ox = Math.cos(ang) * rad, oz = Math.sin(ang) * rad;
        const hgt = 0.17 + rnd() * 0.24, wid = 0.008 + rnd() * 0.006;
        const lean = rnd() * Math.PI * 2, bendAmt = 0.08 + rnd() * 0.28;
        const face = rnd() * Math.PI;
        const levels = 3;
        const pos = [], nor = [], col = [], idx = [];
        for (let l = 0; l <= levels; l++) {
          const t = l / levels;
          const w = wid * (1 - t * t * 0.95) * (l === levels ? 0 : 1);
          const bend = bendAmt * t * t * hgt;
          const cx = ox + Math.cos(lean) * bend, cz = oz + Math.sin(lean) * bend;
          const y = hgt * t * (1 - 0.18 * t * t * bendAmt * 2);
          const dx = Math.cos(face) * w, dz = Math.sin(face) * w;
          const shade = 0.5 + 0.55 * t;
          const tip = l === levels ? 1 : 2;
          for (let s = 0; s < (l === levels ? 1 : 2); s++) {
            const sg = s === 0 ? -1 : 1;
            pos.push(cx + sg * dx, y, cz + sg * dz);
            const n = V(-Math.sin(face), 0.9, Math.cos(face)).normalize();
            nor.push(n.x * 0.4, 0.9, n.z * 0.4);
            col.push(shade, shade, shade * 0.95);
          }
        }
        // indices
        let base = 0;
        for (let l = 0; l < levels; l++) {
          const cnt = 2, nextCnt = l + 1 === levels ? 1 : 2;
          const a = base, c = base + cnt;
          if (nextCnt === 2) { idx.push(a, a + 1, c, a + 1, c + 1, c); }
          else idx.push(a, a + 1, c);
          base += cnt;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        blades.push(g);
      }
      const geo = mergeGeometries(blades);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
      const uniforms = this.uniforms;
      const FIELD = 64;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = uniforms.uTime;
        sh.uniforms.uCam = uniforms.uCam;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uCam;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            vec2 base = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
            vec2 wrapped = uCam + mod(base - uCam + ${(FIELD / 2).toFixed(1)}, ${FIELD.toFixed(1)}) - ${(FIELD / 2).toFixed(1)};
            float dist = length(wrapped - uCam);
            float sc = 1.0 - smoothstep(${(FIELD * 0.34).toFixed(1)}, ${(FIELD * 0.48).toFixed(1)}, dist);
            float hh = position.y;
            float wv = sin(uTime*1.4 + wrapped.x*0.31 + wrapped.y*0.23)*0.5 + sin(uTime*2.9 + wrapped.x*0.9 - wrapped.y*0.4)*0.18;
            transformed.x += wv*hh*hh*0.28;
            transformed.z += wv*hh*hh*0.12;
            transformed *= instanceMatrix[1][1] * sc;
            transformed.x += wrapped.x; transformed.z += wrapped.y;
            transformed.y += instanceMatrix[3][1];
          `)
          .replace('#include <project_vertex>', `
            vec4 mvPosition = vec4( transformed, 1.0 );
            mvPosition = modelViewMatrix * mvPosition;
            gl_Position = projectionMatrix * mvPosition;
          `)
          .replace('#include <defaultnormal_vertex>', `
            vec3 transformedNormal = normalMatrix * objectNormal;
            #ifdef FLIP_SIDED
              transformedNormal = - transformedNormal;
            #endif
            vec3 transformedTangent = transformedNormal;
          `);
      };
      const N = 42000;
      const mesh = new THREE.InstancedMesh(geo, mat, N);
      const m = new THREE.Matrix4(), c = new THREE.Color();
      const palette = [0xb89a52, 0xc8ad66, 0x9c8a46, 0x7f8a3e, 0xa88f4c, 0xd2b878, 0x8d7a3d];
      for (let i = 0; i < N; i++) {
        const s = 0.6 + rnd() * 0.8;
        m.makeScale(s, s, s);
        m.setPosition((rnd()) * FIELD, 0, (rnd()) * FIELD);
        mesh.setMatrixAt(i, m);
        c.setHex(palette[Math.floor(rnd() * palette.length)]).multiplyScalar(0.8 + rnd() * 0.4);
        mesh.setColorAt(i, c);
      }
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      this.grass = mesh;
      this.scene.add(mesh);
    }

    leafMaterial(tint) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n vObj = position;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\n' + NOISE_GLSL)
          .replace('#include <map_fragment>', `
            float lf = fbm3(vObj*7.0) *0.75 + vnoise(vObj*26.0)*0.25;
            if (lf < 0.40) discard;
            diffuseColor.rgb *= (0.8 + 0.4*vnoise(vObj*17.0));
          `);
      };
      return mat;
    }

    buildTrees() {
      const rnd = mulberry32(2024);
      const barkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.95 });
      const leafMat = this.leafMaterial();
      this.trees = [];
      const makeAcacia = (seed) => {
        const r = mulberry32(seed);
        const group = new THREE.Group();
        const H = 4.5 + r() * 3.5;
        const trunkPts = [V(0, 0, 0), V((r() - 0.5) * 0.8, H * 0.35, (r() - 0.5) * 0.8), V((r() - 0.5) * 1.3, H * 0.7, (r() - 0.5) * 1.3), V((r() - 0.5) * 1.5, H, (r() - 0.5) * 1.5)];
        const tc = new THREE.CatmullRomCurve3(trunkPts);
        const tg = loft({ path: s => tc.getPointAt(s), rx: profile([[0, 0.34], [0.3, 0.22], [1, 0.14]]), ry: profile([[0, 0.34], [0.3, 0.22], [1, 0.14]]), rings: 20, radial: 10, cap: 2 });
        group.add(new THREE.Mesh(tg, barkMat));
        const top = trunkPts[3];
        const canopy = [];
        const nBr = 4 + Math.floor(r() * 3);
        const spread = 3.4 + r() * 2.2;
        for (let b = 0; b < nBr; b++) {
          const a = (b / nBr) * Math.PI * 2 + r();
          const len = spread * (0.55 + 0.45 * r());
          const end = top.clone().add(V(Math.cos(a) * len, 0.5 + r() * 1.2, Math.sin(a) * len));
          const mid = top.clone().lerp(end, 0.5).add(V(0, 0.15 + r() * 0.2, 0));
          const bc = new THREE.CatmullRomCurve3([top.clone().add(V(0, -0.6, 0)), mid, end]);
          const bg = loft({ path: s => bc.getPointAt(s), rx: profile([[0, 0.13], [1, 0.05]]), ry: profile([[0, 0.13], [1, 0.05]]), rings: 10, radial: 7, cap: 2 });
          group.add(new THREE.Mesh(bg, barkMat));
          // flat leafy clusters along each branch
          for (let k = 0; k < 4; k++) {
            const p = bc.getPointAt(0.45 + k * 0.18);
            const rad = (1.5 + r() * 1.3) * (1 - k * 0.1);
            const ico = new THREE.IcosahedronGeometry(1, 3);
            const pa = ico.attributes.position;
            const colors = new Float32Array(pa.count * 3);
            for (let i = 0; i < pa.count; i++) {
              const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
              const nn = 1 + 0.18 * Math.sin(x * 4.1 + k) * Math.cos(z * 3.7 + b) + 0.1 * r();
              pa.setXYZ(i, x * rad * nn, y * rad * 0.30, z * rad * nn);
              const t = THREE.MathUtils.clamp(y * 0.5 + 0.5, 0, 1);
              colors[i * 3] = 0.09 + 0.08 * t; colors[i * 3 + 1] = 0.13 + 0.12 * t; colors[i * 3 + 2] = 0.04 + 0.03 * t;
            }
            ico.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            ico.computeVertexNormals();
            ico.translate(p.x, p.y + 0.35, p.z);
            canopy.push(ico);
          }
        }
        const cm = new THREE.Mesh(mergeGeometries(canopy.map(g => { g.deleteAttribute('uv'); return g; })), leafMat);
        cm.castShadow = true; cm.receiveShadow = true;
        group.add(cm);
        group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        return group;
      };
      const variants = [makeAcacia(11), makeAcacia(23), makeAcacia(37), makeAcacia(41)];
      const placed = [];
      let guard = 0;
      while (placed.length < 26 && guard++ < 2000) {
        const a = rnd() * Math.PI * 2, d = 20 + Math.pow(rnd(), 0.8) * 230;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        const pr = this.pathRadius(Math.atan2(z, x));
        if (Math.abs(d - pr) < 11) continue;
        if (placed.some(p => Math.hypot(p.x - x, p.z - z) < 14)) continue;
        placed.push({ x, z });
        const t = variants[Math.floor(rnd() * variants.length)].clone(true);
        const s = 0.8 + rnd() * 0.7;
        t.position.set(x, groundHeight(x, z), z);
        t.rotation.y = rnd() * 6.28;
        t.scale.set(s, s * (0.9 + rnd() * 0.3), s);
        this.scene.add(t);
      }
      // low bushes
      const bushMat = this.leafMaterial();
      for (let i = 0; i < 60; i++) {
        const a = rnd() * Math.PI * 2, d = 12 + rnd() * 160;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (Math.abs(d - this.pathRadius(Math.atan2(z, x))) < 5) continue;
        const rad = 0.6 + rnd() * 1.1;
        const ico = new THREE.IcosahedronGeometry(1, 3);
        const pa = ico.attributes.position;
        const colors = new Float32Array(pa.count * 3);
        for (let k = 0; k < pa.count; k++) {
          const nn = 1 + 0.2 * Math.sin(pa.getX(k) * 5 + i) * Math.cos(pa.getZ(k) * 4);
          pa.setXYZ(k, pa.getX(k) * rad * nn, Math.max(pa.getY(k), -0.2) * rad * 0.7, pa.getZ(k) * rad * nn);
          const t = THREE.MathUtils.clamp(pa.getY(k) * 0.5 + 0.5, 0, 1);
          colors[k * 3] = 0.10 + 0.08 * t; colors[k * 3 + 1] = 0.13 + 0.11 * t; colors[k * 3 + 2] = 0.05 + 0.03 * t;
        }
        ico.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        ico.computeVertexNormals();
        const m = new THREE.Mesh(ico, bushMat);
        m.position.set(x, groundHeight(x, z) + 0.2, z);
        m.castShadow = true; m.receiveShadow = true;
        this.scene.add(m);
      }
    }

    buildRocks() {
      const rnd = mulberry32(5);
      const mat = new THREE.MeshStandardMaterial({ color: 0x8a7b68, roughness: 0.92, flatShading: false });
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\n vObj = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;\n' + NOISE_GLSL)
          .replace('#include <map_fragment>', 'diffuseColor.rgb *= 0.6 + 0.7*fbm3(vObj*5.0) ; diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.1,0.95,0.8), vnoise(vObj*2.0));');
      };
      for (let i = 0; i < 40; i++) {
        const a = rnd() * Math.PI * 2, d = 8 + rnd() * 140;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (Math.abs(d - this.pathRadius(Math.atan2(z, x))) < 4) continue;
        const rad = 0.25 + Math.pow(rnd(), 2) * 1.3;
        const g = new THREE.IcosahedronGeometry(1, 3);
        const pa = g.attributes.position;
        const sx = 0.8 + rnd() * 0.6, sz = 0.8 + rnd() * 0.6, ph = rnd() * 10;
        for (let k = 0; k < pa.count; k++) {
          const x0 = pa.getX(k), y0 = pa.getY(k), z0 = pa.getZ(k);
          const n = 1 + 0.25 * (fbm2(x0 * 1.6 + ph, z0 * 1.6 + y0 * 1.3) - 0.5) * 2;
          pa.setXYZ(k, x0 * rad * sx * n, Math.max(y0, -0.35) * rad * 0.6 * n, z0 * rad * sz * n);
        }
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, mat);
        m.position.set(x, groundHeight(x, z) + rad * 0.12, z);
        m.rotation.y = rnd() * 6;
        m.castShadow = true; m.receiveShadow = true;
        this.scene.add(m);
      }
    }

    // radius of the giraffe's wandering loop at polar angle a
    pathRadius(a) { return 30 + 6 * Math.sin(2 * a + 1.0) + 3.5 * Math.sin(3 * a + 0.3); }

    update(time, focus) {
      this.uniforms.uTime.value = time;
      this.uniforms.uCam.value.set(focus.x, focus.z);
      const L = this.sun;
      L.target.position.copy(focus);
      L.position.copy(focus).addScaledVector(this.sunDir, 70);
      // snap shadow frustum to texel grid to reduce shimmering
      const ts = 18 / 2048;
      L.target.position.x = Math.round(L.target.position.x / ts) * ts;
      L.target.position.z = Math.round(L.target.position.z / ts) * ts;
      this.sky.position.copy(focus);
    }
  }

  window.World = World;
  window.groundHeight = groundHeight;
})();
