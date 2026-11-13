/* The Long Walk — an entirely procedural little field study. */
(() => {
  'use strict';
  const container = document.getElementById('scene');
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xd8d1bb, 0.024);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .85;
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, .1, 150);
  const target = new THREE.Vector3(0, 2.65, 0);
  let azimuth = .39, elevation = .12, distance = 14.1;
  function positionCamera() {
    const horizontal = Math.cos(elevation) * distance;
    camera.position.set(target.x + Math.sin(azimuth) * horizontal, target.y + Math.sin(elevation) * distance, target.z + Math.cos(azimuth) * horizontal);
    camera.lookAt(target);
  }
  positionCamera();
  scene.add(new THREE.HemisphereLight(0xf7f1df, 0x918663, 1.0));
  const sun = new THREE.DirectionalLight(0xffefd0, 1.4);
  sun.position.set(-3, 9, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 8, bottom: -7, near: .5, far: 30 });
  sun.shadow.bias = -.00025; sun.shadow.normalBias = .025;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdde7d2, .4); fill.position.set(5, 4, -6); scene.add(fill);

  // Stable pseudo-randomness makes the coat and landscape identical on every visit.
  let seed = 782341;
  function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function coatTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d'); const image = ctx.createImageData(512, 512);
    const cells = 9, points = [];
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) points.push({x: x + .2 + rand() * .6, y: y + .2 + rand() * .6, c: rand()});
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      // A little coordinate warping takes the geometric edge off the cells.
      const u = x / 512 * cells + .075 * Math.sin(y * .063) + .035 * Math.sin(x * .115 + y * .04);
      const v = y / 512 * cells + .075 * Math.sin(x * .057) + .035 * Math.sin(y * .11 + x * .03);
      let first = 100, second = 100, shade = 0;
      const ix = Math.floor(u), iy = Math.floor(v);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const gx = ix + dx, gy = iy + dy;
        const p = points[((gy % cells + cells) % cells) * cells + ((gx % cells + cells) % cells)];
        const px = p.x + Math.floor(gx / cells) * cells, py = p.y + Math.floor(gy / cells) * cells;
        const d = (u-px)*(u-px) + (v-py)*(v-py);
        if (d < first) { second = first; first = d; shade = p.c; } else if (d < second) second = d;
      }
      const seam = Math.min(1, Math.max(0, (second-first-.10) / .08));
      const noise = (Math.sin(x*1.7+y*2.1)+Math.sin(x*.29-y*.37))*1.2;
      const dark = [139 + shade*25, 76 + shade*20, 36 + shade*12];
      const light = [229, 194, 140];
      const i = (y*512+x)*4;
      for (let k=0;k<3;k++) image.data[i+k] = light[k]*(1-seam)+dark[k]*seam+noise;
      image.data[i+3]=255;
    }
    ctx.putImageData(image,0,0);
    const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t;
  }
  const coat = coatTexture();
  function coatMat(rx=1, ry=1) { const t=coat.clone(); t.needsUpdate=true; t.repeat.set(rx,ry); return new THREE.MeshStandardMaterial({map:t, color:0xffffff, roughness:.91}); }
  const bodyMat = coatMat(1.25,.8), neckMat = coatMat(.72,1.35), legMat = coatMat(.65,1.05), headMat = coatMat(.65,.65);
  const cream = new THREE.MeshStandardMaterial({color:0xd8b684, roughness:1});
  const pale = new THREE.MeshStandardMaterial({color:0xe5c89d, roughness:1});
  const muzzleMat = new THREE.MeshStandardMaterial({color:0xb89975, roughness:1});
  const dark = new THREE.MeshStandardMaterial({color:0x281b13, roughness:.9});
  const hoofMat = new THREE.MeshStandardMaterial({color:0x2b2119, roughness:.95});
  const eyeMat = new THREE.MeshStandardMaterial({color:0x1f1a16, roughness:.18});
  const glint = new THREE.MeshBasicMaterial({color:0xfff7e6});
  const sphereGeo = new THREE.SphereGeometry(1, 32, 24);
  function blob(parent, pos, scale, material, rotZ=0) {
    const mesh = new THREE.Mesh(sphereGeo, material); mesh.position.set(...pos); mesh.scale.set(...scale); mesh.rotation.z=rotZ; mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
  }
  function segment(parent, a, b, r1, r2, material, radial=14) {
    const geo = new THREE.CylinderGeometry(r2,r1,1,radial,1,false);
    const mesh = new THREE.Mesh(geo,material); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh);
    setSegment(mesh, a, b); return mesh;
  }
  const up = new THREE.Vector3(0,1,0);
  function setSegment(mesh, a, b) {
    const av = a.isVector3 ? a : new THREE.Vector3(...a), bv = b.isVector3 ? b : new THREE.Vector3(...b);
    const d = new THREE.Vector3().subVectors(bv,av); mesh.position.copy(av).add(bv).multiplyScalar(.5); mesh.scale.y=d.length(); mesh.quaternion.setFromUnitVectors(up,d.normalize());
  }
  // Soft, curved, tapered neck; rings remain horizontal so the slope feels organic.
  function neckMesh(parent) {
    const rings = [
      [3.02,.63,.45,.43],[3.27,.76,.48,.43],[3.55,.83,.40,.37],
      [3.95,.91,.31,.30],[4.35,1.00,.265,.255],[4.78,1.08,.235,.225],
      [5.12,1.16,.22,.21],[5.38,1.20,.23,.21],[5.50,1.23,.23,.20]
    ];
    const n=32, vertices=[], uvs=[], indices=[];
    rings.forEach((r,j)=>{ for(let i=0;i<=n;i++){const a=i/n*Math.PI*2; vertices.push(r[1]+Math.cos(a)*r[2],r[0],Math.sin(a)*r[3]); uvs.push(i/n,j/(rings.length-1)); }});
    for(let j=0;j<rings.length-1;j++)for(let i=0;i<n;i++){let a=j*(n+1)+i,b=a+n+1; indices.push(a,b,a+1,b,b+1,a+1);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,neckMat);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);
  }
  const giraffe = new THREE.Group(); scene.add(giraffe);
  const torso = new THREE.Group(); giraffe.add(torso);
  blob(torso,[-.15,2.94,0],[1.29,.70,.53],bodyMat,-.045);
  blob(torso,[.70,3.05,0],[.64,.72,.51],bodyMat,-.17);
  blob(torso,[-1.0,2.93,0],[.47,.57,.48],bodyMat);
  // Belly and chest soften the transition into the long legs.
  blob(torso,[.52,2.62,0],[.43,.39,.40],bodyMat);
  neckMesh(torso);
  // Short upright mane following the back edge of the neck.
  const maneMat = new THREE.MeshStandardMaterial({color:0x67442c,roughness:1});
  const manePoints = [[.38,3.25],[.48,3.55],[.59,3.9],[.69,4.25],[.78,4.6],[.85,4.95],[.92,5.25]];
  for(let j=0;j<manePoints.length-1;j++){
    const [x,y]=manePoints[j], [x2,y2]=manePoints[j+1];
    segment(torso,[x,y,0],[x2,y2,0],.075,.065,maneMat,8);
    for(let k=0;k<4;k++){let f=k/4, xx=x+(x2-x)*f, yy=y+(y2-y)*f; segment(torso,[xx,yy,0],[xx-.10,yy+.07,0],.035,.008,maneMat,6);}
  }
  // Head faces +X. It has a broad forehead, long face, soft muzzle, ears and ossicones.
  const head = new THREE.Group(); head.position.set(1.22,5.38,0); torso.add(head);
  blob(head,[.10,.06,0],[.34,.38,.255],headMat,-.22);
  blob(head,[.36,-.07,0],[.43,.25,.22],headMat,-.28);
  blob(head,[.66,-.17,0],[.25,.19,.225],muzzleMat,-.12);
  blob(head,[.70,-.255,0],[.205,.09,.19],pale,-.05);
  // A restrained mouth line and the two nostrils.
  for(const side of [-1,1]){
    blob(head,[.75,-.16,side*.196],[.045,.027,.012],dark,.25);
    blob(head,[.69,-.285,side*.177],[.135,.012,.009],dark,.06);
    // Eyes on raised warm surrounds, with tiny catchlights.
    blob(head,[.20,.16,side*.228],[.085,.075,.027],muzzleMat);
    blob(head,[.225,.17,side*.255],[.042,.045,.021],eyeMat);
    blob(head,[.238,.186,side*.274],[.010,.010,.006],glint);
    // Ears flare outward from the skull.
    const ear=blob(head,[-.08,.20,side*.38],[.23,.10,.32],cream,side===1?.18:.18);
    ear.rotation.y=side*.30; ear.rotation.x=side*.30;
    const inner=blob(head,[-.065,.225,side*.405],[.145,.035,.225],muzzleMat,.18); inner.rotation.y=side*.30; inner.rotation.x=side*.30;
    segment(head,[-.04,.32,side*.14],[-.08,.68,side*.18],.055,.048,cream,10);
    blob(head,[-.08,.68,side*.18],[.085,.08,.08],maneMat);
  }
  // Tail hangs from the rump and sways independently.
  const tail = new THREE.Group(); tail.position.set(-1.26,3.05,0); torso.add(tail);
  segment(tail,[0,0,0],[-.24,-.35,0],.055,.042,cream,9);
  segment(tail,[-.24,-.35,0],[-.34,-.75,0],.042,.028,cream,9);
  blob(tail,[-.35,-.81,0],[.095,.20,.08],maneMat,-.2);

  // Legs use simple two-bone inverse kinematics so feet lift instead of just swinging through the floor.
  const legs=[];
  for(const front of [false,true]) for(const side of [-1,1]){
    const group=new THREE.Group(); giraffe.add(group);
    const hipX=front?.78:-.94, z=side*.35;
    const upper=segment(group,[hipX,2.85,z],[hipX,1.45,z],.19,.135,legMat);
    const lower=segment(group,[hipX,1.45,z],[hipX,.27,z],.13,.075,legMat);
    const joint=blob(group,[hipX,1.45,z],[.15,.17,.14],legMat);
    const ankle=blob(group,[hipX,.29,z],[.10,.16,.10],cream);
    const hoof=blob(group,[hipX+.055,.12,z],[.19,.12,.135],hoofMat);
    legs.push({front,side,hipX,z,upper,lower,joint,ankle,hoof});
  }
  function animateLegs(time, bob){
    for(const leg of legs){
      // Lateral gait, with a small front-to-back delay.
      const phase=time*2.05+(leg.side===1?0:Math.PI)+(leg.front?.23:0);
      const stride=Math.sin(phase)*.37, lift=Math.max(0,Math.cos(phase))*.25;
      const hip=new THREE.Vector3(leg.hipX,2.76+bob,leg.z);
      const foot=new THREE.Vector3(leg.hipX+stride,.25+lift,leg.z);
      const knee=new THREE.Vector3(leg.hipX+stride*.48+(leg.front?-.10:.16),1.48+bob*.5+lift*.20,leg.z);
      setSegment(leg.upper,hip,knee);setSegment(leg.lower,knee,foot);leg.joint.position.copy(knee);leg.ankle.position.copy(foot);
      leg.hoof.position.set(foot.x+.06,foot.y-.13,foot.z); leg.hoof.rotation.z=-Math.max(0,Math.cos(phase))*.12;
    }
  }
  // Warm earth and a soft contact shadow.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(180,180),new THREE.MeshStandardMaterial({color:0xc8b998,roughness:1}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-.015; ground.receiveShadow=true; scene.add(ground);
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
  const sc=shadowCanvas.getContext('2d'), grad=sc.createRadialGradient(64,64,4,64,64,64);grad.addColorStop(0,'rgba(62,54,37,.30)');grad.addColorStop(1,'rgba(62,54,37,0)');sc.fillStyle=grad;sc.fillRect(0,0,128,128);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(4.6,2.6),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.set(-.1,.005,0);scene.add(shadow);
  // Distant acacias, softly muted by fog. Flat crowns retain their characteristic silhouette.
  const treeTrunk=new THREE.MeshStandardMaterial({color:0x766d58,roughness:1});
  const treeLeaf=new THREE.MeshStandardMaterial({color:0x7c876e,roughness:1});
  function tree(x,z,s){
    const t=new THREE.Group();t.position.set(x,0,z);t.scale.setScalar(s);scene.add(t);
    segment(t,[0,0,0],[.12,2.1,0],.12,.075,treeTrunk,7);
    segment(t,[.1,1.45,0],[-.75,2.25,0],.07,.025,treeTrunk,7);
    segment(t,[.12,1.5,0],[.85,2.32,0],.07,.025,treeTrunk,7);
    for(const [px,py,pz,sx,sy,sz] of [[0,2.35,0,1.15,.25,.55],[-.7,2.25,0,.65,.20,.45],[.75,2.31,0,.7,.22,.45]]) blob(t,[px,py,pz],[sx,sy,sz],treeLeaf);
  }
  tree(-8,-11,1.15);tree(-5.6,-16,.85);tree(8,-14,1.0);tree(11,-18,1.25);
  // Sparse grass silhouettes, instanced into a few inexpensive merged geometries.
  const grassColors=[0x9f9974,0xaaa17d,0xb2a786];
  const grassGeo=new THREE.BufferGeometry(), verts=[], colors=[];
  for(let i=0;i<620;i++){
    const x=(rand()-.5)*34,z=(rand()-.5)*25-2;
    if(Math.abs(x)<2.1 && Math.abs(z)<1.6) continue;
    const h=.07+rand()*.22, w=.012+rand()*.02, c=new THREE.Color(grassColors[Math.floor(rand()*3)]);
    for(let b=0;b<2;b++){const angle=rand()*Math.PI, dx=Math.cos(angle)*w,dz=Math.sin(angle)*w, lean=(rand()-.5)*.12;
      verts.push(x-dx,0,z-dz,x+dx,0,z+dz,x+lean,h,z+lean);for(let j=0;j<3;j++)colors.push(c.r,c.g,c.b);
    }
  }
  grassGeo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));grassGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));grassGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(grassGeo,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:1})));

  // Pointer orbit, wheel zoom and a deliberately bounded camera keep the animal in view.
  let dragging=false,lastX=0,lastY=0;
  renderer.domElement.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);});
  renderer.domElement.addEventListener('pointermove',e=>{if(!dragging)return;azimuth-=(e.clientX-lastX)*.006;elevation=Math.max(-.05,Math.min(.65,elevation+(e.clientY-lastY)*.004));lastX=e.clientX;lastY=e.clientY;positionCamera();});
  renderer.domElement.addEventListener('pointerup',()=>dragging=false);
  renderer.domElement.addEventListener('pointercancel',()=>dragging=false);
  renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(8,Math.min(19,distance+e.deltaY*.008));positionCamera();},{passive:false});
  let playing=true, elapsed=0, previous=performance.now();
  const toggle=document.getElementById('toggle');
  toggle.addEventListener('click',()=>{playing=!playing;document.getElementById('playIcon').textContent=playing?'Ⅱ':'▶';document.getElementById('playLabel').textContent=playing?'WALKING':'PAUSED';document.getElementById('playHint').textContent=playing?'A NATURAL PACE':'TAKE YOUR TIME';toggle.setAttribute('aria-label',playing?'Pause walking':'Resume walking');toggle.title=playing?'Pause walking':'Resume walking';});
  function resize(){
    const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;
    // On narrow screens pull back so the whole animal remains visible.
    camera.fov=w<600?48:35;camera.updateProjectionMatrix();
    target.x=w<600?.7:0;positionCamera();
  }
  window.addEventListener('resize',resize);resize();
  function frame(now){
    requestAnimationFrame(frame);const delta=Math.min((now-previous)/1000,.05);previous=now;if(playing)elapsed+=delta;
    const bob=Math.sin(elapsed*4.1)*.035;
    torso.position.y=bob; torso.rotation.z=Math.sin(elapsed*2.05)*.012;
    head.rotation.z=Math.sin(elapsed*2.05-.4)*.018;
    tail.rotation.x=Math.sin(elapsed*1.8)*.18;tail.rotation.z=Math.sin(elapsed*1.6)*.08;
    animateLegs(elapsed,bob);renderer.render(scene,camera);
  }
  requestAnimationFrame(frame);
})();
