(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const loading = $('loading');
  function fail(error) {
    console.error(error);
    loading.hidden = true;
    $('error').hidden = false;
  }
  if (!window.THREE || !window.SavannaGiraffe) { fail(new Error('A local scene file could not be loaded.')); return; }

  try {
    const T = THREE;
    const rand = SavannaGiraffe.random(89253);
    const TAU = Math.PI * 2;
    const canvas = $('scene');
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, innerWidth < 700 ? 1.4 : 1.75));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    const scene = new T.Scene();
    scene.fog = new T.FogExp2(0xc1b795, .0125);
    const camera = new T.PerspectiveCamera(36, innerWidth / innerHeight, .06, 500);
    const clock = new T.Clock();
    const state = {
      paused: matchMedia('(prefers-reduced-motion: reduce)').matches,
      speed: 1, time: 0, travel: 0, daylight: false,
      azimuth: .40, elevation: .08, distance: 12.5,
      targetAzimuth: .40, targetElevation: .08, targetDistance: 12.5,
      target: new T.Vector3(-1.20, 2.70, 0), pan: new T.Vector3(), targetPan: new T.Vector3(),
      ready: false, frames: 0
    };
    const uniforms = { time: { value: 0 }, travel: { value: 0 } };
    const hemi = new T.HemisphereLight(0xd8e2df, 0x82714a, 1.55); scene.add(hemi);
    const sunlight = new T.DirectionalLight(0xffdfaa, 3.25);
    sunlight.position.set(-5, 7.5, 9); sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(2048, 2048);
    Object.assign(sunlight.shadow.camera, { left: -9, right: 9, top: 12, bottom: -10, near: .5, far: 40 });
    sunlight.shadow.bias = -.0002; sunlight.shadow.normalBias = .022; sunlight.shadow.radius = 3;
    sunlight.target.position.set(0, 2, 0); scene.add(sunlight, sunlight.target);
    const rim = new T.DirectionalLight(0xf7e6bf, .65); rim.position.set(4, 5, -6); scene.add(rim);

    const skyUniforms = {
      zenith: { value: new T.Color(0x7397a2) }, horizon: { value: new T.Color(0xddd0ac) },
      sunDirection: { value: sunlight.position.clone().normalize() }, sunColor: { value: new T.Color(0xffe6b2) }
    };
    const sky = new T.Mesh(new T.SphereGeometry(240, 40, 24), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, uniforms: skyUniforms,
      vertexShader: 'varying vec3 vDirection; void main(){ vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec3 vDirection; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDirection; uniform vec3 sunColor;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p) { vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
        void main(){
          vec3 d=normalize(vDirection); float h=max(d.y,0.);
          vec3 col=mix(horizon,zenith,pow(smoothstep(0.,.64,h),.48));
          float sun=pow(max(dot(d,sunDirection),0.),12.);
          col+=sunColor*sun*.12;
          vec2 c=d.xz/max(.08,d.y)*1.1;
          float n=noise(c*.7)*.54+noise(c*1.4)*.28+noise(c*3.)*.12+noise(c*6.)*.06;
          float cloud=smoothstep(.49,.78,n)*smoothstep(.01,.16,h)*(1.-smoothstep(.45,.85,h));
          col=mix(col,vec3(.91,.87,.76),cloud*.48);
          gl_FragColor=vec4(col,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    })); scene.add(sky);

    const noiseGLSL = `
      float fieldHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
      float fieldNoise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(fieldHash(i),fieldHash(i+vec2(1,0)),f.x),mix(fieldHash(i+vec2(0,1)),fieldHash(i+vec2(1,1)),f.x),f.y); }
    `;
    const groundGeo = new T.PlaneGeometry(400, 400, 1, 1); groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    groundMat.onBeforeCompile = shader => {
      shader.uniforms.travel = uniforms.travel;
      shader.vertexShader = 'varying vec3 vGround;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround=position;');
      shader.fragmentShader = 'varying vec3 vGround; uniform float travel;\n' + noiseGLSL + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec2 p=vGround.xz+vec2(travel,0.);
        float broad=fieldNoise(p*.14), fine=fieldNoise(p*2.4), grain=fieldNoise(p*94.);
        vec3 soil=mix(vec3(.265,.237,.136),vec3(.48,.39,.225),broad);
        soil=mix(soil,vec3(.38,.325,.20),fine*.45);
        float track=(1.-smoothstep(.1,1.8,abs(p.y+.2+sin(p.x*.08)*.4)))*.23;
        soil=mix(soil,vec3(.50,.415,.27),track);
        diffuseColor.rgb*=soil*(.88+grain*.22);
      `);
    };
    const ground = new T.Mesh(groundGeo, groundMat); ground.position.y = -.015; ground.receiveShadow = true; scene.add(ground);

    // Far ridges are closed organic silhouettes; fog does most of the painting.
    function ridge(distance, height, color, seed) {
      const rng = SavannaGiraffe.random(seed), count = 384, positions = [], indices = [];
      const phases = [rng() * 6, rng() * 6, rng() * 6];
      for (let i = 0; i <= count; i++) {
        const a = i / count * TAU, x = Math.sin(a) * distance, z = -Math.cos(a) * distance;
        const h = height * (.57 + Math.sin(a * 3 + phases[0]) * .21 + Math.sin(a * 7 + phases[1]) * .14 + Math.sin(a * 13 + phases[2]) * .07 + Math.sin(a * 29) * .018);
        positions.push(x, -1, z, x, h, z);
        if (i < count) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geo.setIndex(indices); geo.computeVertexNormals();
      const obj = new T.Mesh(geo, new T.MeshStandardMaterial({ color, roughness: 1, side: T.DoubleSide })); scene.add(obj);
    }
    ridge(150, 16, 0x92957c, 991); ridge(108, 8, 0x7d8365, 584); ridge(78, 3.4, 0x7d815a, 751);

    // A patch contains three curved, tapered blades. Instancing keeps the
    // entire meadow to two draw calls while retaining individually lit leaves.
    function makeGrass(count, span, depth, near) {
      const positions = [], colors = [], indices = [];
      for (let blade = 0; blade < 3; blade++) {
        const angle = blade / 3 * TAU + .2, dx = Math.cos(angle), dz = Math.sin(angle);
        const bx = (rand() - .5) * .11, bz = (rand() - .5) * .11;
        const coarse = span > 50;
        const height = .24 + rand() * .22, width = coarse ? .012 + rand() * .018 : .004 + rand() * .007, bend = .06 + rand() * .09;
        const base = positions.length / 3;
        for (let j = 0; j <= 2; j++) {
          const t = j / 2, w = width * Math.pow(1 - t, .8), y = height * t;
          const color = new T.Color().setRGB(.51 + t * .18, .44 + t * .15, .23 + t * .10);
          for (const side of [-1, 1]) {
            positions.push(bx + dx * w * side + dz * bend * t * t, y, bz + dz * w * side - dx * bend * t * t);
            colors.push(color.r, color.g, color.b);
          }
          if (j < 2) { const a = base + j * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        }
      }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); geo.setIndex(indices); geo.computeVertexNormals();
      const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: T.DoubleSide });
      function windShader(shader) {
        shader.uniforms.windTime = uniforms.time; shader.uniforms.travel = uniforms.travel;
        shader.vertexShader = 'uniform float windTime; uniform float travel;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          float phase=instanceMatrix[3].x*.43+instanceMatrix[3].z*.37;
          float wind=sin(windTime*1.6+phase)*.45+sin(windTime*.7+phase*2.3)*.3;
          transformed.x+=wind*position.y*position.y*.60;
          transformed.z+=sin(windTime+phase)*position.y*position.y*.22;
          ${near ? `float wrappedX=mod(instanceMatrix[3].x-travel+${(span / 2).toFixed(1)},${span.toFixed(1)})-${(span / 2).toFixed(1)};
          float edge=min(${(span / 2).toFixed(1)}-abs(wrappedX),${(depth / 2).toFixed(1)}-abs(instanceMatrix[3].z));
          transformed.y*=smoothstep(0.0,3.5,edge);` : ''}
        `);
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
          vec4 mvPosition=vec4(transformed,1.0);
          mvPosition=instanceMatrix*mvPosition;
          mvPosition.x+=mod(instanceMatrix[3].x-travel+${(span / 2).toFixed(1)},${span.toFixed(1)})-${(span / 2).toFixed(1)}-instanceMatrix[3].x;
          mvPosition=modelViewMatrix*mvPosition;
          gl_Position=projectionMatrix*mvPosition;
        `);
        // Shadow receiving needs the same translated world position.
        shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
          vec4 worldPosition=instanceMatrix*vec4(transformed,1.0);
          worldPosition.x+=mod(instanceMatrix[3].x-travel+${(span / 2).toFixed(1)},${span.toFixed(1)})-${(span / 2).toFixed(1)}-instanceMatrix[3].x;
          worldPosition=modelMatrix*worldPosition;
        `);
      }
      mat.onBeforeCompile = windShader;
      mat.customProgramCacheKey = () => `savanna-grass-${span}-${depth}-${near}`;
      const grass = new T.InstancedMesh(geo, mat, count), dummy = new T.Object3D(), color = new T.Color();
      for (let i = 0; i < count; i++) {
        const x = (rand() - .5) * span, z = (rand() - .5) * depth + (near ? 0 : -23);
        const patch = Math.sin(x * .65 + z * .4) * Math.sin(z * .9 - x * .2);
        let s = .45 + rand() * 1.25;
        const trail = Math.abs(z + .2 + Math.sin(x * .08) * .4);
        s *= .35 + .65 * T.MathUtils.smoothstep(trail, .28, 1.25);
        if (patch > .3) s *= 1.35;
        dummy.position.set(x, 0, z); dummy.rotation.y = rand() * TAU; dummy.scale.set(s, s * (.75 + rand() * .5), s); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
        color.setHSL(.105 + rand() * .04, .22 + rand() * .18, .47 + rand() * .19); grass.setColorAt(i, color);
      }
      grass.receiveShadow = true; grass.frustumCulled = false; scene.add(grass); return grass;
    }
    makeGrass(30000, 36, 24, true);
    makeGrass(16000, 80, 60, true);
    makeGrass(19000, 150, 86, false);

    const movingObjects = [];
    const barkMat = new T.MeshStandardMaterial({ color: 0x5b523a, roughness: 1 });
    const foliageMat = new T.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, side: T.DoubleSide });
    const branchGeo = new T.CylinderGeometry(1, 1, 1, 7);
    // Merge branch cylinders per tree, retaining fine branching at low draw cost.
    function mergeBranches(group) {
      const positions = [], normals = [];
      for (const object of [...group.children]) {
        object.updateMatrix();
        const geo = object.geometry.toNonIndexed(); geo.applyMatrix4(object.matrix);
        positions.push(...geo.attributes.position.array); normals.push(...geo.attributes.normal.array);
        object.geometry.dispose(); geo.dispose(); group.remove(object);
      }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(normals, 3)); group.add(new T.Mesh(geo, barkMat));
    }
    function branch(parent, a, b, r1, r2) {
      const geo = branchGeo.clone();
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) { const r = T.MathUtils.lerp(r2, r1, pos.getY(i) + .5); pos.setX(i, pos.getX(i) * r); pos.setZ(i, pos.getZ(i) * r); }
      geo.computeVertexNormals();
      const m = new T.Mesh(geo, barkMat); m.position.copy(a).add(b).multiplyScalar(.5); m.scale.y = a.distanceTo(b); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize()); parent.add(m);
    }
    function acacia(x, z, scale, seed) {
      const rng = SavannaGiraffe.random(seed), group = new T.Group();
      const leafPositions = [], leafColors = [], leafIndices = [], leafColor = new T.Color();
      const base = new T.Vector3(0, 0, 0), fork = new T.Vector3(.15, 1.65, -.07);
      branch(group, base, fork, .075, .16);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU + rng() * .4, r = 1.3 + rng() * 1.2;
        const p = new T.Vector3(Math.cos(a) * r, 2.3 + rng() * .6, Math.sin(a) * r * .76);
        const mid = fork.clone().lerp(p, .48); mid.y -= .13;
        branch(group, fork, mid, .04, .075); branch(group, mid, p, .016, .041);
        for (let j = 0; j < 6; j++) {
          const end = p.clone().add(new T.Vector3((rng() - .5) * 1.35, rng() * .27, (rng() - .5) * 1.15));
          if (j < 3) branch(group, mid, end, .009, .027);
          const rx = .48 + rng() * .25, rz = .4 + rng() * .24;
          for (let k = 0; k < 95; k++) {
            const angle = rng() * TAU, radius = Math.sqrt(rng());
            const cx = end.x + Math.cos(angle) * radius * rx, cz = end.z + Math.sin(angle) * radius * rz;
            const cy = end.y + (rng() - .4) * .3 * Math.sqrt(1 - radius * radius);
            const leafAngle = rng() * TAU, length = .065 + rng() * .065, width = length * .55;
            const dx = Math.cos(leafAngle), dz = Math.sin(leafAngle), tip = (rng() - .3) * .06;
            const base = leafPositions.length / 3;
            leafPositions.push(cx - dx * length, cy + tip, cz - dz * length, cx - dz * width, cy, cz + dx * width, cx + dx * length, cy - tip, cz + dz * length, cx + dz * width, cy + .023, cz - dx * width);
            leafIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
            leafColor.setHSL(.18 + rng() * .03, .19 + rng() * .21, .20 + rng() * .13);
            for (let n = 0; n < 4; n++) leafColors.push(leafColor.r, leafColor.g, leafColor.b);
          }
        }
      }
      mergeBranches(group);
      const leaves = new T.BufferGeometry(); leaves.setAttribute('position', new T.Float32BufferAttribute(leafPositions, 3)); leaves.setAttribute('color', new T.Float32BufferAttribute(leafColors, 3)); leaves.setIndex(leafIndices); leaves.computeVertexNormals(); group.add(new T.Mesh(leaves, foliageMat));
      group.position.set(x, -.03, z); group.scale.setScalar(scale); scene.add(group); movingObjects.push({ object: group, x, span: 180 });
    }
    acacia(-13, -17, 1.45, 635);
    acacia(16, -25, 1.8, 583);
    acacia(30, -43, 1.55, 226);
    acacia(-34, -39, 1.5, 934);
    acacia(-4, -49, 1.15, 125);
    for (let i = 0; i < 16; i++) acacia((rand() - .5) * 170, -55 - rand() * 35, .55 + rand() * .85, 1234 + i * 183);
    // Sparse shrubs, small basalt stones, and seedheads break up the meadow.
    const rockMat = new T.MeshStandardMaterial({ color: 0x8b8167, roughness: 1, flatShading: true });
    const rocks = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), rockMat, 210);
    const rockData = [], dummy = new T.Object3D();
    for (let i = 0; i < rocks.count; i++) {
      const x = (rand() - .5) * 90, z = (rand() - .5) * 55, s = .04 + Math.pow(rand(), 4) * .33;
      rockData.push({ x, z, s, angle: rand() * TAU });
    }
    rocks.receiveShadow = true; scene.add(rocks);
    function updateRocks() {
      for (let i = 0; i < rockData.length; i++) { const r = rockData[i]; dummy.position.set(T.MathUtils.euclideanModulo(r.x - state.travel + 45, 90) - 45, r.s * .20, r.z); dummy.rotation.set(r.angle, r.angle * .3, r.angle * .7); dummy.scale.set(r.s * 1.3, r.s * .57, r.s); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix); }
      rocks.instanceMatrix.needsUpdate = true;
    }
    updateRocks();

    // Thin airborne motes are subdued; they catch the low sun rather than
    // competing with the silhouette of the animal.
    const moteCount = 75, motePositions = new Float32Array(moteCount * 3), moteBase = [];
    for (let i = 0; i < moteCount; i++) moteBase.push({ x: (rand() - .5) * 20, y: rand() * 3.4 + .1, z: (rand() - .5) * 16, phase: rand() * TAU });
    const moteGeo = new T.BufferGeometry(); moteGeo.setAttribute('position', new T.BufferAttribute(motePositions, 3));
    const moteCanvas = document.createElement('canvas'); moteCanvas.width = moteCanvas.height = 32;
    const mc = moteCanvas.getContext('2d'), mg = mc.createRadialGradient(16, 16, 0, 16, 16, 16); mg.addColorStop(0, '#fff5dcbb'); mg.addColorStop(.2, '#fff5dc66'); mg.addColorStop(1, '#fff5dc00'); mc.fillStyle = mg; mc.fillRect(0, 0, 32, 32);
    const motes = new T.Points(moteGeo, new T.PointsMaterial({ map: new T.CanvasTexture(moteCanvas), color: 0xffebba, size: .037, transparent: true, opacity: .6, depthWrite: false })); scene.add(motes);

    const giraffe = SavannaGiraffe.create(); scene.add(giraffe.root);
    // Broad, faint contact occlusion complements the directional hoof shadows.
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
    const sc = shadowCanvas.getContext('2d'), sg = sc.createRadialGradient(64, 64, 1, 64, 64, 64); sg.addColorStop(0, '#241d1480'); sg.addColorStop(.45, '#241d1430'); sg.addColorStop(1, '#241d1400'); sc.fillStyle = sg; sc.fillRect(0, 0, 128, 128);
    const contactShadow = new T.Mesh(new T.PlaneGeometry(3.8, 1.9), new T.MeshBasicMaterial({ map: new T.CanvasTexture(shadowCanvas), transparent: true, opacity: .38, depthWrite: false })); contactShadow.rotation.x = -Math.PI / 2; contactShadow.position.set(-.3, .001, 0); scene.add(contactShadow);

    // Distant birds travel slowly along the ridge line.
    const birds = [];
    const birdMat = new T.MeshBasicMaterial({ color: 0x5e6757, side: T.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute([0,0,0, -.23,.07,-.05, -.41,.02,.04, 0,0,0, .23,.07,-.05, .41,.02,.04], 3)); geo.computeVertexNormals();
      const bird = new T.Mesh(geo, birdMat); bird.position.set(-25 + i * 2.4, 10 + Math.sin(i) * 1.4, -70 - i * 1.4); scene.add(bird); birds.push(bird);
    }

    let toastTimer;
    function toast(text) { $('toast').textContent = text; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2400); }
    function setPlay() {
      $('pause-icon').toggleAttribute('hidden', state.paused); $('play-icon').toggleAttribute('hidden', !state.paused);
      $('play-button').setAttribute('aria-label', state.paused ? 'Resume walking' : 'Pause walking');
      $('motion-state').textContent = state.paused ? 'AT REST' : 'WALKING';
      $('speed-readout').textContent = state.paused ? 'A moment of stillness' : state.speed < .8 ? 'Taking it slowly' : state.speed > 1.2 ? 'A lively stride' : 'A natural pace';
    }
    $('play-button').addEventListener('click', () => { state.paused = !state.paused; setPlay(); });
    $('speed').addEventListener('input', event => { state.speed = Number(event.target.value); $('speed-value').textContent = state.speed.toFixed(1) + '×'; setPlay(); });
    setPlay();
    function toggleInfo(force) {
      const show = force === undefined ? $('info-panel').hidden : force;
      $('info-panel').hidden = !show; $('info-button').setAttribute('aria-expanded', String(show));
    }
    $('info-button').addEventListener('click', () => toggleInfo()); $('close-info').addEventListener('click', () => { toggleInfo(false); $('info-button').focus(); });

    function toggleLight() {
      state.daylight = !state.daylight;
      $('time-label').textContent = state.daylight ? 'MIDDAY LIGHT' : 'GOLDEN HOUR';
      $('light-button').setAttribute('aria-label', state.daylight ? 'Switch to golden hour light' : 'Switch to midday light');
      sunlight.color.set(state.daylight ? 0xfff5de : 0xffdfaa); sunlight.intensity = state.daylight ? 2.8 : 3.25;
      sunlight.position.set(state.daylight ? -2 : -5, state.daylight ? 13 : 7.5, state.daylight ? 6 : 9);
      hemi.intensity = state.daylight ? 1.85 : 1.55;
      skyUniforms.zenith.value.set(state.daylight ? 0x6599b2 : 0x7397a2); skyUniforms.horizon.value.set(state.daylight ? 0xd1d6c1 : 0xddd0ac);
      skyUniforms.sunDirection.value.copy(sunlight.position).normalize(); scene.fog.color.set(state.daylight ? 0xbac5b2 : 0xc1b795);
      toast(state.daylight ? 'Under the midday sun' : 'Back to the golden hour');
    }
    $('light-button').addEventListener('click', toggleLight);
    function resetCamera(announce = true) {
      state.targetAzimuth = .40; state.targetElevation = .08; state.targetDistance = innerWidth < 700 ? 16.7 * Math.max(1, .44 / camera.aspect) : 12.5; state.targetPan.set(0, 0, 0);
      if (announce) toast('Back to the field view');
    }
    $('reset-button').addEventListener('click', () => resetCamera());
    async function fullscreen() {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else toast('Fullscreen is not available in this browser'); }
      catch { toast('Fullscreen is not available in this browser'); }
    }
    $('fullscreen-button').addEventListener('click', fullscreen);
    document.addEventListener('fullscreenchange', () => $('fullscreen-button').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'));
    document.addEventListener('keydown', event => {
      if (event.target.matches('input, button, a') && event.code === 'Space') return;
      if (event.target.matches('input')) return;
      if (event.code === 'Space') { event.preventDefault(); state.paused = !state.paused; setPlay(); }
      if (event.code === 'KeyR') resetCamera();
      if (event.code === 'KeyL') toggleLight();
      if (event.code === 'KeyF') fullscreen();
      if (event.code === 'Escape') toggleInfo(false);
      if (event.target === canvas) {
        if (event.code === 'ArrowLeft') state.targetAzimuth -= .12;
        if (event.code === 'ArrowRight') state.targetAzimuth += .12;
        if (event.code === 'ArrowUp') state.targetElevation = Math.min(.8, state.targetElevation + .08);
        if (event.code === 'ArrowDown') state.targetElevation = Math.max(-.08, state.targetElevation - .08);
        if (event.code.startsWith('Arrow')) event.preventDefault();
        if (event.key === '+' || event.key === '=') state.targetDistance = Math.max(5, state.targetDistance * .9);
        if (event.key === '-') state.targetDistance = Math.min(25, state.targetDistance * 1.1);
      }
    });

    const pointers = new Map(); let gesture = null;
    const pointerCenter = () => { const ps = [...pointers.values()]; return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length, distance: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0 }; };
    canvas.addEventListener('pointerdown', event => { canvas.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); gesture = pointerCenter(); });
    canvas.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const now = pointerCenter(), dx = now.x - gesture.x, dy = now.y - gesture.y;
      if (pointers.size > 1) {
        if (gesture.distance > 0 && now.distance > 0) state.targetDistance = T.MathUtils.clamp(state.targetDistance * gesture.distance / now.distance, 5, 25);
      } else if (event.shiftKey || event.buttons === 2) {
        state.targetPan.x = T.MathUtils.clamp(state.targetPan.x - dx * .007, -3, 3);
        state.targetPan.y = T.MathUtils.clamp(state.targetPan.y + dy * .007, -1.8, 2);
      } else {
        state.targetAzimuth -= dx * .005;
        state.targetElevation = T.MathUtils.clamp(state.targetElevation + dy * .003, -.08, .8);
      }
      gesture = now;
    });
    const release = event => { pointers.delete(event.pointerId); gesture = pointers.size ? pointerCenter() : null; };
    canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release); canvas.addEventListener('lostpointercapture', release);
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('wheel', event => { event.preventDefault(); state.targetDistance = T.MathUtils.clamp(state.targetDistance * Math.exp(event.deltaY * .001), 5, 25); }, { passive: false });

    let wasMobile = innerWidth < 700;
    function resize() {
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
      state.target.x = innerWidth < 700 ? .50 : -1.20;
      state.target.y = innerWidth < 700 ? 3.05 : 2.70;
      if (wasMobile !== (innerWidth < 700)) resetCamera(false);
      wasMobile = innerWidth < 700;
    }
    window.addEventListener('resize', resize); resize(); resetCamera(false); state.distance = state.targetDistance;
    const target = new T.Vector3();
    function updateCamera(dt) {
      const ease = 1 - Math.exp(-dt * 8);
      state.azimuth = T.MathUtils.lerp(state.azimuth, state.targetAzimuth, ease);
      state.elevation = T.MathUtils.lerp(state.elevation, state.targetElevation, ease);
      state.distance = T.MathUtils.lerp(state.distance, state.targetDistance, ease);
      state.pan.lerp(state.targetPan, ease); target.copy(state.target).add(state.pan);
      camera.position.set(target.x + Math.sin(state.azimuth) * Math.cos(state.elevation) * state.distance, Math.max(.24, target.y + Math.sin(state.elevation) * state.distance), target.z + Math.cos(state.azimuth) * Math.cos(state.elevation) * state.distance);
      camera.lookAt(target);
    }

    let contextLost = false;
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); contextLost = true; $('error-message').textContent = 'The graphics context was interrupted. Reload the page to return to the savanna.'; $('error').hidden = false; });
    document.addEventListener('visibilitychange', () => { clock.getDelta(); });
    function animate() {
      requestAnimationFrame(animate);
      if (contextLost || document.hidden) return;
      const dt = Math.min(clock.getDelta(), .05);
      if (!state.paused) {
        state.time += dt * state.speed;
        // The stance foot sweeps 0.94 m over 66% of each 0.58 Hz cycle.
        // Matching this velocity prevents foot skating in a tracking-camera view.
        state.travel += dt * state.speed * giraffe.stride * giraffe.cyclesPerSecond / .66;
      }
      uniforms.time.value = state.time; uniforms.travel.value = state.travel;
      giraffe.update(state.time, !state.paused);
      for (const item of movingObjects) item.object.position.x = T.MathUtils.euclideanModulo(item.x - state.travel + item.span / 2, item.span) - item.span / 2;
      updateRocks();
      for (let i = 0; i < moteCount; i++) { const m = moteBase[i]; motePositions[i * 3] = T.MathUtils.euclideanModulo(m.x - state.travel * .4 + 10, 20) - 10; motePositions[i * 3 + 1] = m.y + Math.sin(state.time * .4 + m.phase) * .15; motePositions[i * 3 + 2] = m.z + Math.sin(state.time * .2 + m.phase) * .3; }
      moteGeo.attributes.position.needsUpdate = true;
      birds.forEach((bird, i) => { bird.position.x = -25 + i * 2.4 + Math.sin(state.time * .019) * 18; bird.position.y = 10 + Math.sin(i) * 1.4 + Math.sin(state.time * .7 + i) * .1; bird.rotation.z = Math.sin(state.time * 1.5 + i) * .10; });
      updateCamera(dt);
      renderer.render(scene, camera);
      if (!state.ready) { state.ready = true; loading.classList.add('complete'); setTimeout(() => { loading.hidden = true; }, 900); }
      state.frames++;
    }
    // A small inspection surface helps verify animation and rendering
    // in a browser without introducing any application dependencies.
    window.savanna = { scene, camera, renderer, giraffe, state, resetCamera };
    updateCamera(1); renderer.compile(scene, camera); animate();
  } catch (error) { fail(error); }
}());
