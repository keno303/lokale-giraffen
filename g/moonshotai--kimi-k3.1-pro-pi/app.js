/* Wild Atlas — a self-contained procedural Three.js field study.
 * No fetched assets, modules, build tools, or server are required.
 */
(function () {
  'use strict';

  const mount = document.getElementById('scene');
  const loading = document.getElementById('loading');
  if (!window.THREE) {
    loading.innerHTML = '<div class="loading-mark">WA</div><span>WILD ATLAS</span><p>Three.js could not be loaded. Keep the vendor folder beside index.html.</p>';
    return;
  }

  const THREE = window.THREE;
  const TAU = Math.PI * 2;
  const UP = new THREE.Vector3(0, 1, 0);
  const tempObject = new THREE.Object3D();
  const tempColor = new THREE.Color();
  let seed = 481516;

  function random() {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rand(min, max) { return min + (max - min) * random(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    loading.innerHTML = '<div class="loading-mark">WA</div><span>WILD ATLAS</span><p>This study needs a browser with WebGL enabled.</p>';
    console.error(error);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'A reticulated giraffe walking through an acacia savanna. Drag to orbit and scroll to zoom.');

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcac6aa, 25, 88);
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.08, 180);

  const hemi = new THREE.HemisphereLight(0xe5eff0, 0x8f6a3d, 2.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe4b0, 3.35);
  sun.position.set(-9, 14, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -5;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 36;
  sun.shadow.bias = -0.00018;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xb9d1d2, 0.45);
  fill.position.set(8, 6, -10);
  scene.add(fill);

  // A luminous, hazy sky with a real directional sun glow.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(115, 32, 18),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x789fa8) },
        horizonColor: { value: new THREE.Color(0xddd0ac) },
        lowColor: { value: new THREE.Color(0xe4cda2) },
        sunDirection: { value: new THREE.Vector3(-0.55, 0.42, -0.45).normalize() }
      },
      vertexShader: 'varying vec3 vWorld; void main(){ vec4 world = modelMatrix * vec4(position,1.0); vWorld = world.xyz; gl_Position = projectionMatrix * viewMatrix * world; }',
      fragmentShader: `
        varying vec3 vWorld;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 lowColor;
        uniform vec3 sunDirection;
        void main(){
          vec3 d = normalize(vWorld - cameraPosition);
          float h = d.y;
          vec3 col = mix(horizonColor, topColor, smoothstep(-0.02, 0.72, h));
          col = mix(lowColor, col, smoothstep(-0.22, 0.04, h));
          float sunDot = max(dot(d, sunDirection), 0.0);
          col += vec3(1.0,0.76,0.43) * pow(sunDot, 180.0) * 0.75;
          col += vec3(1.0,0.78,0.49) * pow(sunDot, 12.0) * 0.13;
          gl_FragColor = vec4(col,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    })
  );
  sky.frustumCulled = false;
  scene.add(sky);

  function canvasTexture(canvas, repeat) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (repeat) texture.repeat.set(repeat, repeat);
    return texture;
  }

  // Giraffe markings are actual irregular Voronoi cells with pale reticulations,
  // not a generic image or a set of round polka dots.
  function makeCoatTexture(base, colors, cols, rows) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = base; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const points = [];
    for (let y = -1; y <= rows; y++) {
      for (let x = -1; x <= cols; x++) {
        points.push({
          x: (x + 0.5 + rand(-0.28, 0.28)) * canvas.width / cols,
          y: (y + 0.5 + rand(-0.3, 0.3)) * canvas.height / rows
        });
      }
    }
    function clip(poly, nx, ny, c) {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const da = a.x * nx + a.y * ny - c;
        const db = b.x * nx + b.y * ny - c;
        if (da <= 0) out.push(a);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
          const t = da / (da - db);
          out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      }
      return out;
    }
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.x < -60 || p.x > 1084 || p.y < -60 || p.y > 572) continue;
      let poly = [{x:p.x-115,y:p.y-115},{x:p.x+115,y:p.y-115},{x:p.x+115,y:p.y+115},{x:p.x-115,y:p.y+115}];
      for (let j = 0; j < points.length && poly.length; j++) {
        if (i === j) continue;
        const q = points[j];
        if (Math.abs(q.x-p.x) > 230 || Math.abs(q.y-p.y) > 230) continue;
        poly = clip(poly, q.x-p.x, q.y-p.y, (q.x*q.x+q.y*q.y-p.x*p.x-p.y*p.y)/2);
      }
      if (poly.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k].x, poly[k].y);
      ctx.closePath();
      ctx.fillStyle = colors[Math.floor(random() * colors.length)];
      ctx.fill();
      ctx.lineJoin = 'round';
      ctx.lineWidth = rand(5.5, 8.5);
      ctx.strokeStyle = base;
      ctx.stroke();
      ctx.save(); ctx.clip();
      const glow = ctx.createRadialGradient(p.x-12,p.y-15,2,p.x,p.y,75);
      glow.addColorStop(0,'rgba(255,222,160,.10)');
      glow.addColorStop(1,'rgba(57,26,12,.08)');
      ctx.fillStyle = glow; ctx.fillRect(p.x-100,p.y-100,200,200);
      for (let n = 0; n < 18; n++) {
        ctx.fillStyle = random() > .5 ? 'rgba(255,225,170,.055)' : 'rgba(40,20,8,.045)';
        ctx.fillRect(p.x+rand(-60,60),p.y+rand(-60,60),rand(1,4),rand(1,4));
      }
      ctx.restore();
    }
    // Fine, non-uniform hair grain.
    for (let i = 0; i < 16000; i++) {
      ctx.fillStyle = random() > .48 ? 'rgba(255,244,208,.035)' : 'rgba(46,25,12,.025)';
      ctx.fillRect(random()*1024,random()*512,rand(.4,1.4),rand(1,3));
    }
    return canvasTexture(canvas);
  }

  const coatTexture = makeCoatTexture('#ddbd7c', ['#a55f30','#ad6835','#985128','#b36d37','#a45b2b'], 15, 9);
  const legTexture = makeCoatTexture('#d7bd85', ['#b27a43','#aa6c37','#bd894e','#a86e3b'], 13, 8);
  const coat = new THREE.MeshStandardMaterial({ map: coatTexture, roughness: 0.88, metalness: 0 });
  const bodyTexture = coatTexture.clone();
  bodyTexture.repeat.set(1.28, 1.12); bodyTexture.needsUpdate = true;
  const bodyCoat = new THREE.MeshStandardMaterial({ map: bodyTexture, roughness: .9 });
  const legCoat = new THREE.MeshStandardMaterial({ map: legTexture, roughness: 0.91 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xd6b77e, roughness: .92 });
  const muzzleMat = new THREE.MeshStandardMaterial({ color: 0xad8b59, roughness: .88 });
  const darkHair = new THREE.MeshStandardMaterial({ color: 0x4b3321, roughness: 1 });
  const hoofMat = new THREE.MeshStandardMaterial({ color: 0x302a22, roughness: .76 });
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x100d08, roughness: .12, clearcoat: 1, clearcoatRoughness: .06 });
  const eyeRimMat = new THREE.MeshStandardMaterial({ color: 0x5a4027, roughness: .8 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x241d15, roughness: .86 });
  const innerEarMat = new THREE.MeshStandardMaterial({ color: 0x94714f, roughness: 1, side: THREE.DoubleSide });
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xfff9df });
  const sphereGeometry = new THREE.SphereGeometry(1, 28, 18);
  const lowSphereGeometry = new THREE.SphereGeometry(1, 14, 10);

  function addMesh(parent, geometry, material, position, scale, shadows) {
    const m = new THREE.Mesh(geometry, material);
    if (position) m.position.copy(position);
    if (scale) m.scale.copy(scale);
    m.castShadow = shadows !== false;
    m.receiveShadow = shadows !== false;
    parent.add(m);
    return m;
  }
  function ellipsoid(parent, material, x, y, z, sx, sy, sz, low) {
    return addMesh(parent, low ? lowSphereGeometry : sphereGeometry, material,
      new THREE.Vector3(x,y,z), new THREE.Vector3(sx,sy,sz));
  }
  function cylinderBetween(parent, a, b, rBottom, rTop, material, sides) {
    const direction = new THREE.Vector3().subVectors(b,a);
    const mesh = addMesh(parent, new THREE.CylinderGeometry(rTop,rBottom,direction.length(),sides || 12,1), material);
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
    return mesh;
  }

  function createGroundTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#a99967'; ctx.fillRect(0,0,1024,1024);
    for (let i=0;i<70000;i++) {
      const light = random()>.52;
      ctx.fillStyle = light ? `rgba(231,214,158,${rand(.025,.11)})` : `rgba(66,62,34,${rand(.018,.075)})`;
      const s=rand(.5,3.2); ctx.fillRect(random()*1024,random()*1024,s,s*.55);
    }
    for (let i=0;i<4200;i++) {
      const x=random()*1024,y=random()*1024,l=rand(2,12);
      ctx.strokeStyle=random()>.5?'rgba(80,76,38,.18)':'rgba(211,192,121,.22)';
      ctx.lineWidth=rand(.4,1.1);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+rand(-3,3),y-l);ctx.stroke();
    }
    for (let i=0;i<55;i++) {
      const x=random()*1024,y=random()*1024,r=rand(25,130);
      const g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,random()>.5?'rgba(72,75,39,.07)':'rgba(232,205,137,.08)');g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
    return canvasTexture(canvas, 22);
  }

  const groundGeometry=new THREE.PlaneGeometry(180,180,64,64);
  const groundColors=[],groundPosition=groundGeometry.attributes.position;
  for(let i=0;i<groundPosition.count;i++){
    const x=groundPosition.getX(i),y=groundPosition.getY(i);
    const patch=Math.sin(x*.13+Math.sin(y*.07))*Math.cos(y*.11)+Math.sin((x+y)*.037)*.7;
    const shade=.94+patch*.055;
    tempColor.setRGB(shade,shade*.995,shade*.94);groundColors.push(tempColor.r,tempColor.g,tempColor.b);
  }
  groundGeometry.setAttribute('color',new THREE.Float32BufferAttribute(groundColors,3));
  const ground = new THREE.Mesh(
    groundGeometry,
    new THREE.MeshStandardMaterial({ map:createGroundTexture(), color:0xd9cfb2, vertexColors:true, roughness:1, metalness:0 })
  );
  ground.rotation.x=-Math.PI/2;ground.position.y=-.018;ground.receiveShadow=true;scene.add(ground);

  // Barely visible, worn track followed by the animal.
  const track = new THREE.Mesh(new THREE.RingGeometry(17.55,18.45,160),new THREE.MeshBasicMaterial({color:0x7d7048,transparent:true,opacity:.075,depthWrite:false,side:THREE.DoubleSide}));
  track.rotation.x=-Math.PI/2;track.position.set(0,-.006,-18);scene.add(track);

  // Layered, low-contrast ridges keep the horizon natural through a full orbit.
  function hillRing(radius,amplitude,color,opacity,phase){
    const positions=[],indices=[],segments=160;
    for(let i=0;i<=segments;i++){
      const a=i/segments*TAU;
      const height=1.1+amplitude*(.46+.24*Math.sin(a*3+phase)+.18*Math.sin(a*7-phase)+.12*Math.cos(a*13+phase));
      positions.push(Math.cos(a)*radius,-.3,-18+Math.sin(a)*radius,Math.cos(a)*radius,height,-18+Math.sin(a)*radius);
      if(i<segments){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false,fog:true});
    scene.add(new THREE.Mesh(geometry,material));
  }
  hillRing(79,4.1,0x8e9a88,.24,1.7);
  hillRing(69,2.6,0x89917b,.20,.2);

  const barkMat = new THREE.MeshStandardMaterial({color:0x615238,roughness:1});
  const leafMaterials = [0x4e5934,0x5f6638,0x6a6c3c,0x464f31].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:1,flatShading:false}));
  function createAcacia(x,z,size,rotation) {
    const group=new THREE.Group();group.position.set(x,0,z);group.scale.setScalar(size);group.rotation.y=rotation;scene.add(group);
    const h=rand(2.5,3.5);
    cylinderBetween(group,new THREE.Vector3(0,0,0),new THREE.Vector3(.12,h*.77,0),.15,.085,barkMat,8);
    for(let i=0;i<6;i++){
      const a=i/6*TAU+rand(-.3,.3),reach=rand(1.1,2.05),by=h+rand(-.18,.4);
      const fork=new THREE.Vector3(.08,h*.56,0);
      const end=new THREE.Vector3(Math.cos(a)*reach,by,Math.sin(a)*reach*.72);
      cylinderBetween(group,fork,end,.075,.025,barkMat,7);
      const canopy=ellipsoid(group,leafMaterials[Math.floor(random()*leafMaterials.length)],end.x,by+.12,end.z,rand(.88,1.38),rand(.30,.48),rand(.72,1.08),true);
      canopy.rotation.y=rand(0,TAU);
      for(let j=0;j<2;j++){
        const a2=rand(0,TAU);
        ellipsoid(group,leafMaterials[Math.floor(random()*leafMaterials.length)],end.x+Math.cos(a2)*.72,by+rand(.12,.35),end.z+Math.sin(a2)*.55,rand(.45,.75),rand(.25,.40),rand(.42,.70),true);
      }
    }
    const crown=ellipsoid(group,leafMaterials[1],0,h+.28,0,1.35,.43,1.0,true);crown.rotation.y=rand(0,TAU);
    return group;
  }
  // Keep the tracking-camera corridor clear; trees frame the animal instead of
  // repeatedly passing between the lens and the subject.
  const treeLocations=[[-7,-17,1.18],[5,-22,1.02],[-1,-11,.74],[8,-14,.82],[-9,-25,.88],[1,-27,.78],[3,-18,.62]];
  for(let i=0;i<19;i++){
    const a=i/19*TAU+.12,r=rand(38,53);
    treeLocations.push([Math.cos(a)*r,-18+Math.sin(a)*r,rand(1.05,1.75)]);
  }
  treeLocations.forEach((p,i)=>createAcacia(p[0],p[1],p[2],i*1.77));

  // Thousands of gently bending grass blades in only one draw call.
  const grassGeometry=new THREE.BufferGeometry();
  const grassPositions=[];
  for(let b=0;b<4;b++){
    const a=b*Math.PI/4,dx=Math.cos(a)*.026,dz=Math.sin(a)*.026;
    const bendX=Math.sin(a)*.15,bendZ=Math.cos(a)*.15;
    // Two tapered, slightly curved sections per blade rather than one broad spike.
    grassPositions.push(
      -dx,0,-dz, dx,0,dz, dx*.62+bendX*.32,.56,dz*.62+bendZ*.32,
      -dx,0,-dz, dx*.62+bendX*.32,.56,dz*.62+bendZ*.32, -dx*.62+bendX*.32,.56,-dz*.62+bendZ*.32,
      -dx*.62+bendX*.32,.56,-dz*.62+bendZ*.32, dx*.62+bendX*.32,.56,dz*.62+bendZ*.32, bendX,1,bendZ
    );
  }
  grassGeometry.setAttribute('position',new THREE.Float32BufferAttribute(grassPositions,3));
  grassGeometry.computeVertexNormals();
  // Instance colours are enabled by InstancedMesh itself. Setting the separate
  // vertexColors flag without a colour attribute would multiply them by black.
  const grassMat=new THREE.MeshStandardMaterial({color:0xb1a563,roughness:1,side:THREE.DoubleSide});
  let grassShader;
  grassMat.onBeforeCompile=function(shader){
    shader.uniforms.uTime={value:0};grassShader=shader;
    shader.vertexShader='uniform float uTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`vec3 transformed = vec3(position);
      #ifdef USE_INSTANCING
        float windOffset = instanceMatrix[3].x * .19 + instanceMatrix[3].z * .13;
        transformed.x += sin(uTime * 1.15 + windOffset) * position.y * position.y * .095;
        transformed.z += cos(uTime * .73 + windOffset) * position.y * position.y * .035;
      #endif`);
  };
  const grassCount=5800;
  const grass=new THREE.InstancedMesh(grassGeometry,grassMat,grassCount);
  grass.receiveShadow=true;grass.castShadow=false;
  for(let i=0;i<grassCount;i++){
    const x=rand(-55,55),z=rand(-58,48);
    const trackDistance=Math.abs(Math.hypot(x,z+18)-18);
    let height=rand(.16,.64)*(random()>.88?1.6:1);
    if(trackDistance<1.05)height*=.32;
    tempObject.position.set(x,-.01,z);tempObject.rotation.set(0,rand(0,TAU),rand(-.06,.06));tempObject.scale.set(rand(.65,1.3),height,rand(.65,1.3));tempObject.updateMatrix();
    grass.setMatrixAt(i,tempObject.matrix);
    tempColor.setHSL(rand(.105,.155),rand(.24,.43),rand(.32,.49));grass.setColorAt(i,tempColor);
  }
  grass.instanceMatrix.needsUpdate=true;if(grass.instanceColor)grass.instanceColor.needsUpdate=true;scene.add(grass);

  const rockMat=new THREE.MeshStandardMaterial({color:0x8f805e,roughness:1,flatShading:true});
  const rockGeo=new THREE.DodecahedronGeometry(1,0);
  for(let i=0;i<48;i++){
    const r=addMesh(scene,rockGeo,rockMat,new THREE.Vector3(rand(-40,40),rand(.015,.07),rand(-45,35)),new THREE.Vector3(rand(.05,.22),rand(.035,.11),rand(.06,.25)));
    r.rotation.set(rand(0,1),rand(0,TAU),rand(0,1));
  }

  function bodyGeometry() {
    const profile=new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.48,3.12,.035),new THREE.Vector3(-1.31,3.12,.43),
      new THREE.Vector3(-.91,3.13,.65),new THREE.Vector3(-.35,3.18,.655),
      new THREE.Vector3(.25,3.29,.68),new THREE.Vector3(.73,3.43,.76),
      new THREE.Vector3(1.08,3.43,.54),new THREE.Vector3(1.25,3.42,.06)
    ],false,'catmullrom',.45);
    const zProfile=new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.48,3.12,.035),new THREE.Vector3(-1.31,3.12,.32),
      new THREE.Vector3(-.91,3.13,.51),new THREE.Vector3(-.35,3.18,.54),
      new THREE.Vector3(.25,3.29,.55),new THREE.Vector3(.73,3.43,.57),
      new THREE.Vector3(1.08,3.43,.43),new THREE.Vector3(1.25,3.42,.06)
    ],false,'catmullrom',.45);
    const lengthSegments=48,radial=32,positions=[],uvs=[],indices=[];
    for(let i=0;i<=lengthSegments;i++){
      const t=i/lengthSegments,p=profile.getPoint(t),zp=zProfile.getPoint(t);
      for(let j=0;j<=radial;j++){
        const v=j/radial,a=v*TAU;
        positions.push(p.x,p.y+Math.cos(a)*Math.max(.02,p.z),Math.sin(a)*Math.max(.02,zp.z));uvs.push(t,v);
      }
    }
    for(let i=0;i<lengthSegments;i++)for(let j=0;j<radial;j++){
      const a=i*(radial+1)+j,b=a+radial+1;indices.push(a,b,a+1,b,b+1,a+1);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
  }

  function taperedTube(curve,segments,radial,radiusFn,ellipse) {
    const geometry=new THREE.TubeGeometry(curve,segments,1,radial,false);
    const pos=geometry.attributes.position;
    for(let i=0;i<=segments;i++){
      const t=i/segments,center=curve.getPointAt(t),radius=radiusFn(t);
      for(let j=0;j<=radial;j++){
        const index=i*(radial+1)+j;
        const x=pos.getX(index),y=pos.getY(index),z=pos.getZ(index);
        pos.setXYZ(index,center.x+(x-center.x)*radius,center.y+(y-center.y)*radius,center.z+(z-center.z)*radius*(ellipse||1));
      }
    }
    pos.needsUpdate=true;geometry.computeVertexNormals();return geometry;
  }

  const giraffe=new THREE.Group();giraffe.name='Reticulated giraffe';giraffe.scale.setScalar(.92);scene.add(giraffe);
  const bodyCore=new THREE.Group();giraffe.add(bodyCore);
  // Shoulder, sloping withers, barrel, belly and haunch share a single skin.
  const torso=addMesh(bodyCore,bodyGeometry(),bodyCoat);

  const neckGroup=new THREE.Group();neckGroup.position.set(.80,3.64,0);bodyCore.add(neckGroup);
  const neckCurve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0,0),new THREE.Vector3(.16,.53,0),new THREE.Vector3(.33,1.16,0),
    new THREE.Vector3(.47,1.77,0),new THREE.Vector3(.65,2.29,0)
  ],false,'catmullrom',.45);
  function neckRadius(t){return .415*(1-t)+.185*t+.045*Math.sin(Math.PI*t);}
  addMesh(neckGroup,taperedTube(neckCurve,42,24,neckRadius,1.10),coat);

  function createMane() {
    const positions=[],uvs=[],indices=[],steps=46;
    for(let i=0;i<=steps;i++){
      const t=i/steps,p=neckCurve.getPoint(t),r=neckRadius(t);
      const backX=p.x-r*.79,edge=backX-(.052+.020*Math.sin(i*2.4)+.015*random());
      positions.push(backX,p.y,-.045, edge,p.y+.005,-.045);uvs.push(0,t,1,t);
      if(i<steps){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
    const mat=darkHair.clone();mat.side=THREE.DoubleSide;
    addMesh(neckGroup,g,mat);
    const cordCurve=new THREE.CatmullRomCurve3(Array.from({length:18},(_,i)=>{const t=i/17,p=neckCurve.getPoint(t);return new THREE.Vector3(p.x-neckRadius(t)*.79,p.y,-.045);}));
    addMesh(neckGroup,new THREE.TubeGeometry(cordCurve,32,.035,6,false),darkHair);
  }
  createMane();

  const head=new THREE.Group();head.position.set(.65,2.29,0);head.rotation.z=-.09;neckGroup.add(head);
  const skull=ellipsoid(head,coat,.13,.015,0,.41,.275,.245);skull.rotation.z=-.09;
  const face=ellipsoid(head,coat,.39,-.09,0,.38,.205,.202);face.rotation.z=-.13;
  const muzzle=ellipsoid(head,muzzleMat,.64,-.15,0,.255,.155,.205);muzzle.rotation.z=-.10;
  ellipsoid(head,muzzleMat,.46,-.24,0,.32,.078,.165);
  // Nostrils, lips, glossy eyes and tiny catchlights on both sides.
  [-1,1].forEach(side=>{
    const rim=ellipsoid(head,eyeRimMat,.19,.105,side*.218,.066,.058,.031);rim.rotation.x=side*.12;
    ellipsoid(head,eyeMat,.205,.108,side*.244,.039,.041,.022);
    ellipsoid(head,glintMat,.216,.124,side*.263,.008,.008,.005,true).castShadow=false;
    const nostril=ellipsoid(head,blackMat,.737,-.108,side*.194,.052,.025,.014);nostril.rotation.z=.32;
    const mouthCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(.30,-.245,side*.172),new THREE.Vector3(.50,-.252,side*.187),new THREE.Vector3(.76,-.199,side*.142)]);
    addMesh(head,new THREE.TubeGeometry(mouthCurve,14,.009,5,false),blackMat);
    // Supraorbital ridge gives the eye a less toy-like, recessed setting.
    const brow=ellipsoid(head,coat,.16,.181,side*.206,.14,.055,.054);brow.rotation.z=-.15;
  });

  const earShape=new THREE.Shape();
  earShape.moveTo(0,0);earShape.bezierCurveTo(-.15,.10,-.14,.35,-.018,.53);earShape.bezierCurveTo(.055,.41,.15,.23,.12,.12);earShape.bezierCurveTo(.10,.05,.05,.015,0,0);
  const earGeo=new THREE.ExtrudeGeometry(earShape,{depth:.022,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:2,steps:1,curveSegments:10});
  const innerShape=new THREE.Shape();innerShape.moveTo(.005,.055);innerShape.bezierCurveTo(-.085,.15,-.085,.34,-.016,.435);innerShape.bezierCurveTo(.032,.32,.075,.17,.005,.055);
  const innerGeo=new THREE.ShapeGeometry(innerShape,10);
  const ears=[];
  [-1,1].forEach(side=>{
    const ear=new THREE.Group();ear.position.set(-.11,.17,side*.18);ear.rotation.set(side*.76,side*.18,side*-.52);ear.scale.setScalar(1.13);head.add(ear);
    addMesh(ear,earGeo,cream);
    const inner=addMesh(ear,innerGeo,innerEarMat,new THREE.Vector3(0,0,.037));inner.castShadow=false;
    ear.userData.baseZ=ear.rotation.z;ear.userData.side=side;ears.push(ear);
  });
  [-1,1].forEach(side=>{
    cylinderBetween(head,new THREE.Vector3(-.045,.245,side*.105),new THREE.Vector3(-.015,.57,side*.13),.043,.030,cream,10);
    ellipsoid(head,darkHair,-.015,.585,side*.13,.066,.085,.063,true);
    for(let i=0;i<5;i++){
      const a=i/5*TAU;
      cylinderBetween(head,new THREE.Vector3(-.015+Math.cos(a)*.035,.58,side*.13+Math.sin(a)*.035),new THREE.Vector3(-.015+Math.cos(a)*.05,.68+rand(-.015,.015),side*.13+Math.sin(a)*.05),.012,.003,darkHair,5);
    }
  });

  const tail=new THREE.Group();tail.position.set(-1.38,3.29,0);bodyCore.add(tail);
  const tailCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(-.26,-.23,0),new THREE.Vector3(-.36,-.64,0),new THREE.Vector3(-.29,-1.02,0)]);
  addMesh(tail,taperedTube(tailCurve,20,8,t=>.047*(1-t)+.023*t,1),cream);
  const tailTuft=new THREE.Group();tailTuft.position.set(-.29,-1.01,0);tail.add(tailTuft);
  const tuft=ellipsoid(tailTuft,darkHair,-.01,-.13,0,.105,.245,.09,true);tuft.rotation.z=-.13;
  for(let i=0;i<8;i++){
    const z=rand(-.07,.07),x=rand(-.07,.06);
    const strand=new THREE.CatmullRomCurve3([new THREE.Vector3(x,0,z),new THREE.Vector3(x-.035,-.19,z*1.2),new THREE.Vector3(x+rand(-.08,.08),-.38-rand(0,.08),z*1.5)]);
    addMesh(tailTuft,new THREE.TubeGeometry(strand,7,.009,4,false),darkHair);
  }

  const legs=[];
  function createLeg(name,hipX,hipY,z,front,side,phaseOffset) {
    const L1=front?1.47:1.43,L2=front?1.48:1.45;
    const upper=new THREE.Group();upper.name=name+' upper leg';upper.position.set(hipX,hipY,z);giraffe.add(upper);
    const upperMesh=addMesh(upper,new THREE.CylinderGeometry(.135,.092,L1,14,3),coat,new THREE.Vector3(0,-L1/2,0));upperMesh.scale.z=1.12;
    ellipsoid(upper,coat,0,-.19,0,.155,.34,.16,true);
    const knee=new THREE.Group();knee.position.y=-L1;upper.add(knee);
    ellipsoid(knee,legCoat,0,0,0,.112,.13,.115,true);
    const lowerMesh=addMesh(knee,new THREE.CylinderGeometry(.091,.057,L2,12,3),legCoat,new THREE.Vector3(0,-L2/2,0));lowerMesh.scale.z=1.05;
    // Tendon along the cannon bone catches the rim light.
    cylinderBetween(knee,new THREE.Vector3(-.055,-.17,-side*.055),new THREE.Vector3(-.038,-L2+.16,-side*.04),.012,.008,cream,5);
    const foot=new THREE.Group();foot.position.y=-L2;knee.add(foot);
    ellipsoid(foot,legCoat,0,-.035,0,.105,.17,.12,true);
    [-1,1].forEach(cloven=>{
      const hoof=addMesh(foot,new THREE.CylinderGeometry(.086,.112,.19,8,1),hoofMat,new THREE.Vector3(.025,-.16,cloven*.061),new THREE.Vector3(1.25,1,.64));hoof.rotation.z=-.06;
      ellipsoid(foot,hoofMat,-.075,-.045,cloven*.095,.031,.037,.025,true);
    });
    const data={name,upper,knee,foot,hipX,hipY,z,front,side,phaseOffset,L1,L2,lastPhase:0};
    legs.push(data);return data;
  }
  // Lateral couplets: left hind follows left fore, then the right-side pair.
  createLeg('Left fore',.76,3.18,.43,true,1,0);
  createLeg('Right fore',.76,3.18,-.43,true,-1,.5);
  createLeg('Left hind',-.92,3.08,.43,false,1,.085);
  createLeg('Right hind',-.92,3.08,-.43,false,-1,.585);

  // Soft contact occlusion complements the directional shadow without a postprocessor.
  function radialTexture() {
    const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');
    const g=x.createRadialGradient(64,64,2,64,64,64);g.addColorStop(0,'rgba(35,31,20,.52)');g.addColorStop(.45,'rgba(35,31,20,.20)');g.addColorStop(1,'rgba(35,31,20,0)');x.fillStyle=g;x.fillRect(0,0,128,128);return canvasTexture(c);
  }
  const contactTexture=radialTexture();
  const contact=new THREE.Mesh(new THREE.PlaneGeometry(3.4,1.8),new THREE.MeshBasicMaterial({map:contactTexture,transparent:true,opacity:.55,depthWrite:false}));
  contact.rotation.x=-Math.PI/2;contact.position.y=.006;giraffe.add(contact);

  const dustCount=110,dustPositions=new Float32Array(dustCount*3),dustData=[];
  for(let i=0;i<dustCount;i++){dustPositions[i*3+1]=-100;dustData.push({life:0,velocity:new THREE.Vector3()});}
  const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3).setUsage(THREE.DynamicDrawUsage));
  const dustMat=new THREE.PointsMaterial({color:0xd8c18b,size:.16,map:radialTexture(),transparent:true,opacity:.32,depthWrite:false,sizeAttenuation:true,blending:THREE.NormalBlending});
  const dust=new THREE.Points(dustGeo,dustMat);dust.frustumCulled=false;scene.add(dust);let dustCursor=0;
  function spawnDust(leg) {
    const p=giraffe.localToWorld(new THREE.Vector3(leg.currentX||leg.hipX,.03,leg.z));
    for(let n=0;n<4;n++){
      const i=dustCursor++%dustCount,d=dustData[i];d.life=rand(.55,1.05);
      dustPositions[i*3]=p.x+rand(-.12,.12);dustPositions[i*3+1]=rand(.025,.08);dustPositions[i*3+2]=p.z+rand(-.12,.12);
      d.velocity.set(rand(-.12,.12),rand(.08,.24),rand(-.12,.12));
    }
  }
  function updateDust(dt){
    for(let i=0;i<dustCount;i++){
      const d=dustData[i];if(d.life<=0)continue;d.life-=dt;
      if(d.life<=0){dustPositions[i*3+1]=-100;continue;}
      dustPositions[i*3]+=d.velocity.x*dt;dustPositions[i*3+1]+=d.velocity.y*dt;dustPositions[i*3+2]+=d.velocity.z*dt;
      d.velocity.multiplyScalar(Math.exp(-dt*1.5));
    }
    dustGeo.attributes.position.needsUpdate=true;
  }

  // Small distant birds add scale without competing with the subject.
  const birds=[];const birdMat=new THREE.MeshBasicMaterial({color:0x4d584c,side:THREE.DoubleSide,transparent:true,opacity:.65});
  for(let i=0;i<7;i++){
    const bird=new THREE.Group();
    const wingGeo=new THREE.BufferGeometry();wingGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-.38,.04,.05,-.1,-.035,0,0,0,0,.38,.04,.05,.1,-.035,0],3));wingGeo.computeVertexNormals();
    addMesh(bird,wingGeo,birdMat,null,null,false);bird.position.set(rand(-25,25),rand(10,16),rand(-40,-22));bird.scale.setScalar(rand(.55,1));scene.add(bird);birds.push(bird);
  }

  const pathRadius=18;
  let pathAngle=0,gaitPhase=.16,speedFactor=1,walking=true,elapsed=0;
  const stride=.70,stance=.62,baseSpeed=.64;
  const baseCycle=stride/(baseSpeed*stance);
  const worldTarget=new THREE.Vector3();
  function updateGiraffe(dt) {
    if(walking){
      const cycle=baseCycle/speedFactor;
      gaitPhase=(gaitPhase+dt/cycle)%1;
      // Match world translation to the scaled, backwards-planted stance foot.
      pathAngle+=baseSpeed*giraffe.scale.x*speedFactor*dt/pathRadius;
    }
    giraffe.position.set(pathRadius*Math.sin(pathAngle),0,pathRadius*(Math.cos(pathAngle)-1));
    giraffe.rotation.y=pathAngle;
    const phaseAngle=gaitPhase*TAU;
    const bob=walking?Math.cos(phaseAngle*2)*.026:Math.sin(elapsed*1.4)*.008;
    bodyCore.position.y=bob;
    bodyCore.rotation.x=walking?Math.sin(phaseAngle)*.012:0;
    bodyCore.rotation.z=walking?Math.sin(phaseAngle)*.009:0;
    torso.scale.y=1+Math.sin(elapsed*1.45)*.0025;
    neckGroup.rotation.z=(walking?Math.sin(phaseAngle-.35)*.012:Math.sin(elapsed*.7)*.008);
    neckGroup.rotation.x=Math.sin(elapsed*.43)*.007;
    head.rotation.z=-.09-neckGroup.rotation.z+Math.sin(elapsed*.62)*.012;
    head.rotation.y=Math.sin(elapsed*.31)*.035;
    tail.rotation.x=Math.sin(elapsed*1.7)*.23+Math.sin(phaseAngle)*.07;
    tail.rotation.z=-.04+Math.sin(elapsed*.91)*.07;
    tailTuft.rotation.x=Math.sin(elapsed*1.7-.55)*.18;
    ears.forEach((ear,i)=>{
      const pulse=Math.pow(Math.max(0,Math.sin(elapsed*.73+i*2.9)),18);
      ear.rotation.z=ear.userData.baseZ+ear.userData.side*(Math.sin(elapsed*1.1+i)*.025+pulse*.28);
    });

    legs.forEach(leg=>{
      const p=(gaitPhase+leg.phaseOffset)%1;
      let stepX,lift=0,swing=0;
      if(p<stance){
        stepX=stride*(.5-p/stance);
      }else{
        swing=(p-stance)/(1-stance);
        stepX=stride*(-.5+smoothstep(0,1,swing));
        lift=.31*Math.pow(Math.sin(Math.PI*swing),1.25);
      }
      leg.currentX=leg.hipX+stepX;
      leg.upper.position.y=leg.hipY+bob;
      const dx=stepX,dy=.28+lift-leg.upper.position.y;
      const distance=clamp(Math.hypot(dx,dy),Math.abs(leg.L1-leg.L2)+.001,leg.L1+leg.L2-.005);
      const targetAngle=Math.atan2(dx,-dy);
      const hipOffset=Math.acos(clamp((leg.L1*leg.L1+distance*distance-leg.L2*leg.L2)/(2*leg.L1*distance),-1,1));
      const bend=leg.front?1:-1;
      const upperAngle=targetAngle+bend*hipOffset;
      const kneeX=Math.sin(upperAngle)*leg.L1,kneeY=-Math.cos(upperAngle)*leg.L1;
      const lowerAbsolute=Math.atan2(dx-kneeX,-(dy-kneeY));
      const kneeAngle=lowerAbsolute-upperAngle;
      leg.upper.rotation.z=upperAngle;
      leg.knee.rotation.z=kneeAngle;
      const hoofPitch=p<stance?(-.055*smoothstep(.48,.62,p)):(.18*Math.sin(Math.PI*swing));
      leg.foot.rotation.z=-(upperAngle+kneeAngle)+hoofPitch;
      if(walking && leg.lastPhase>.82 && p<.18)spawnDust(leg);
      leg.lastPhase=p;
    });
    worldTarget.copy(giraffe.position).add(new THREE.Vector3(0,2.86,0));
    contact.position.y=.006;
    contact.material.opacity=.46+.05*Math.cos(phaseAngle*2);
  }

  const cameraState={theta:.54,phi:1.435,distance:13.35,targetHeight:3.05,desiredTheta:.54,desiredPhi:1.435,desiredDistance:13.35,desiredHeight:3.05,view:'follow'};
  const cameraLook=new THREE.Vector3(0,3,0);
  function setView(view,notify){
    const views={follow:{theta:.54,phi:1.435,distance:13.35,height:3.05},profile:{theta:.025,phi:1.48,distance:13.5,height:3.0},detail:{theta:.38,phi:1.37,distance:8.4,height:3.72}};
    const v=views[view]||views.follow;cameraState.view=view;
    cameraState.desiredTheta=v.theta;cameraState.desiredPhi=v.phi;cameraState.desiredDistance=v.distance;cameraState.desiredHeight=v.height;
    document.querySelectorAll('.view-button').forEach(button=>{const active=button.dataset.view===view;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    if(notify)showToast(view==='detail'?'DETAIL · HEAD & SHOULDERS':view==='profile'?'PROFILE · LATERAL WALK':'FOLLOW · NATURAL PACE');
  }
  function updateCamera(dt,instant){
    const blend=instant?1:1-Math.exp(-dt*4.2);
    cameraState.theta+=(cameraState.desiredTheta-cameraState.theta)*blend;
    cameraState.phi+=(cameraState.desiredPhi-cameraState.phi)*blend;
    cameraState.distance+=(cameraState.desiredDistance-cameraState.distance)*blend;
    cameraState.targetHeight+=(cameraState.desiredHeight-cameraState.targetHeight)*blend;
    const target=giraffe.position.clone().add(new THREE.Vector3(0,cameraState.targetHeight,0));
    cameraLook.lerp(target,instant?1:1-Math.exp(-dt*5));
    const angle=cameraState.theta+pathAngle,sinPhi=Math.sin(cameraState.phi);
    const responsiveDistance=cameraState.distance*(camera.aspect<.72?1.18:1);
    const offset=new THREE.Vector3(Math.sin(angle)*sinPhi,Math.cos(cameraState.phi),Math.cos(angle)*sinPhi).multiplyScalar(responsiveDistance);
    const desired=cameraLook.clone().add(offset);
    camera.position.lerp(desired,instant?1:1-Math.exp(-dt*3.7));camera.lookAt(cameraLook);
    sun.position.copy(giraffe.position).add(new THREE.Vector3(-9,14,7));sun.target.position.copy(giraffe.position);sun.target.updateMatrixWorld();
  }

  let toastTimer;
  function showToast(message){const toast=document.getElementById('toast');toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),1800);}
  function paceLabel(){return speedFactor<.85?'Slow walk':speedFactor>1.15?'Brisk walk':'Natural walk';}
  function toggleWalking(){
    walking=!walking;document.body.classList.toggle('paused',!walking);
    document.getElementById('movementLabel').textContent=walking?paceLabel():'At rest';
    document.getElementById('playButton').setAttribute('aria-label',walking?'Pause walking':'Resume walking');
    showToast(walking?'WALKING · NATURAL PACE':'PAUSED · OBSERVE');
  }
  document.getElementById('playButton').addEventListener('click',toggleWalking);
  document.getElementById('speed').addEventListener('input',event=>{
    speedFactor=Number(event.target.value);document.getElementById('speedValue').value=speedFactor.toFixed(1)+'×';
    const percent=(speedFactor-.5)*100;event.target.style.background=`linear-gradient(to right, #d8c6a5 ${percent}%, rgba(244,238,222,.2) ${percent}%)`;
    if(walking)document.getElementById('movementLabel').textContent=paceLabel();
  });
  document.querySelectorAll('.view-button').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view,true)));
  document.getElementById('resetButton').addEventListener('click',()=>{setView('follow');showToast('CAMERA RESET');});
  document.getElementById('brandReset').addEventListener('click',event=>{event.preventDefault();setView('follow',true);});
  const notes=document.getElementById('fieldNotes'),infoToggle=document.getElementById('infoToggle');
  function toggleNotes(force){const open=typeof force==='boolean'?force:!notes.classList.contains('open');notes.classList.toggle('open',open);notes.setAttribute('aria-hidden',String(!open));infoToggle.setAttribute('aria-expanded',String(open));}
  infoToggle.addEventListener('click',()=>toggleNotes());document.getElementById('notesClose').addEventListener('click',()=>toggleNotes(false));

  let pointerDown=false,lastX=0,lastY=0,pinchDistance=0;
  const pointers=new Map();
  renderer.domElement.addEventListener('pointerdown',event=>{
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});renderer.domElement.setPointerCapture(event.pointerId);
    pointerDown=true;lastX=event.clientX;lastY=event.clientY;mount.classList.add('dragging');
    if(pointers.size===2){const p=[...pointers.values()];pinchDistance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}
  });
  renderer.domElement.addEventListener('pointermove',event=>{
    if(!pointers.has(event.pointerId))return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===2){const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);cameraState.desiredDistance=clamp(cameraState.desiredDistance+(pinchDistance-d)*.018,5.4,21);pinchDistance=d;return;}
    if(!pointerDown)return;
    const dx=event.clientX-lastX,dy=event.clientY-lastY;lastX=event.clientX;lastY=event.clientY;
    cameraState.desiredTheta-=dx*.005;cameraState.desiredPhi=clamp(cameraState.desiredPhi-dy*.004,.68,1.58);
  });
  function releasePointer(event){pointers.delete(event.pointerId);pointerDown=pointers.size>0;if(pointers.size===1){const p=[...pointers.values()][0];lastX=p.x;lastY=p.y;}else mount.classList.remove('dragging');}
  renderer.domElement.addEventListener('pointerup',releasePointer);renderer.domElement.addEventListener('pointercancel',releasePointer);
  renderer.domElement.addEventListener('wheel',event=>{event.preventDefault();cameraState.desiredDistance=clamp(cameraState.desiredDistance+event.deltaY*.008,5.4,21);},{passive:false});
  renderer.domElement.addEventListener('dblclick',()=>setView('follow',true));
  window.addEventListener('keydown',event=>{
    if(event.target.tagName==='INPUT')return;
    if(event.code==='Space'){event.preventDefault();toggleWalking();}
    else if(event.key.toLowerCase()==='r')setView('follow',true);
    else if(event.key.toLowerCase()==='c'){const views=['follow','profile','detail'];setView(views[(views.indexOf(cameraState.view)+1)%views.length],true);}
    else if(event.key.toLowerCase()==='h')document.body.classList.toggle('ui-hidden');
    else if(event.key==='Escape')toggleNotes(false);
  });
  window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8));});
  document.addEventListener('visibilitychange',()=>{lastTime=performance.now();});

  updateGiraffe(0);updateCamera(1,true);
  let lastTime=performance.now(),firstFrame=true;
  function frame(now){
    requestAnimationFrame(frame);
    const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;if(document.hidden)return;
    elapsed+=dt;updateGiraffe(dt);updateDust(dt);updateCamera(dt,false);
    if(grassShader)grassShader.uniforms.uTime.value=elapsed;
    birds.forEach((bird,i)=>{bird.position.x+=dt*(.07+i*.009);bird.rotation.z=Math.sin(elapsed*1.8+i)*.07;if(bird.position.x>35)bird.position.x=-35;});
    sky.position.copy(camera.position);
    renderer.render(scene,camera);
    if(firstFrame){firstFrame=false;document.documentElement.dataset.ready='true';setTimeout(()=>loading.classList.add('done'),280);}
  }
  requestAnimationFrame(frame);

  // Read-only diagnostics are useful when opening the file locally.
  window.__wildAtlas={version:'1.0.0',threeRevision:THREE.REVISION,get state(){return{walking,speedFactor,gaitPhase,pathAngle,view:cameraState.view,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};}};
})();
