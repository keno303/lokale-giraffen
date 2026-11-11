(function () {
  'use strict';
  if (!window.THREE) return;

  var host = document.getElementById('scene');
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd7b880);
  scene.fog = new THREE.FogExp2(0xd7b880, 0.018);

  var camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 120);
  var orbit = { yaw: 0.58, pitch: 0.18, radius: 18, target: new THREE.Vector3(0.6, 4.1, 0) };
  var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  host.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffe6b2, 0x706747, 2.1));
  var sun = new THREE.DirectionalLight(0xffe0ad, 4.1);
  sun.position.set(-8, 15, 9); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 13; sun.shadow.camera.bottom = -5; sun.shadow.bias = -0.0003;
  scene.add(sun);

  function makeTexture() {
    var c = document.createElement('canvas'); c.width = 512; c.height = 512;
    var x = c.getContext('2d'); x.fillStyle = '#dca95e'; x.fillRect(0, 0, 512, 512);
    var seed = 48271;
    function rnd() { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; }
    for (var i = 0; i < 58; i++) {
      var px = rnd() * 540 - 14, py = rnd() * 540 - 14, r = 19 + rnd() * 35, n = 7 + Math.floor(rnd() * 4);
      x.beginPath();
      for (var j = 0; j < n; j++) {
        var a = Math.PI * 2 * j / n, rr = r * (.72 + rnd() * .32);
        var vx = px + Math.cos(a) * rr, vy = py + Math.sin(a) * rr;
        j ? x.lineTo(vx, vy) : x.moveTo(vx, vy);
      }
      x.closePath(); x.fillStyle = i % 5 ? '#7f3b20' : '#6c321d'; x.fill();
    }
    var tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  var hide = new THREE.MeshStandardMaterial({ map: makeTexture(), color: 0xffd181, roughness: .83 });
  var pale = new THREE.MeshStandardMaterial({ color: 0xe3b66e, roughness: .9 });
  var cream = new THREE.MeshStandardMaterial({ color: 0xf0d9a8, roughness: .9 });
  var dark = new THREE.MeshStandardMaterial({ color: 0x392319, roughness: .92 });
  var maneMat = new THREE.MeshStandardMaterial({ color: 0x6d321d, roughness: 1, side: THREE.DoubleSide });
  var black = new THREE.MeshStandardMaterial({ color: 0x0d0b08, roughness: .35 });
  var wet = new THREE.MeshPhysicalMaterial({ color: 0x090705, roughness: .15, clearcoat: 1 });

  function mesh(geo, mat, parent, pos, scale, rot) {
    var m = new THREE.Mesh(geo, mat); m.position.set(pos[0], pos[1], pos[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function sphere(parent, pos, scale, mat, detail) { return mesh(new THREE.SphereGeometry(1, detail || 24, detail || 18), mat || hide, parent, pos, scale); }
  function cylinder(parent, pos, radiusTop, radiusBottom, height, mat, rot) { return mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 16), mat || hide, parent, pos, null, rot); }
  function between(parent, a, b, r1, r2, mat) {
    var va = new THREE.Vector3(a[0],a[1],a[2]), vb = new THREE.Vector3(b[0],b[1],b[2]);
    var mid = va.clone().add(vb).multiplyScalar(.5), len = va.distanceTo(vb);
    var m = cylinder(parent, [mid.x,mid.y,mid.z], r1, r2, len, mat);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), vb.clone().sub(va).normalize()); return m;
  }

  var giraffe = new THREE.Group(); giraffe.position.set(1.4, 0, 0); giraffe.rotation.y = -.08; scene.add(giraffe);
  sphere(giraffe, [0, 4.25, 0], [2.05, 1.12, .72], hide, 32); // torso
  sphere(giraffe, [-1.5, 4.38, 0], [.72, .91, .62], hide); // rump
  sphere(giraffe, [1.45, 4.58, 0], [.72, .83, .58], hide); // shoulder
  between(giraffe, [1.35,4.7,0], [1.7,7.38,0], .45, .63, hide);
  sphere(giraffe, [1.57, 6.15, 0], [.53, 1.25, .45], hide); // neck blend

  // Head and muzzle, facing +X.
  sphere(giraffe, [1.72,7.67,0], [.66,.69,.52], hide, 28);
  sphere(giraffe, [2.28,7.55,0], [.78,.39,.47], pale, 28);
  sphere(giraffe, [2.76,7.47,0], [.34,.27,.39], cream, 20);
  // nostrils
  sphere(giraffe, [2.91,7.57,.25], [.055,.035,.07], wet, 12);
  sphere(giraffe, [2.91,7.57,-.25], [.055,.035,.07], wet, 12);
  // eyes + amber iris glints
  [[1.93,.43],[1.93,-.43]].forEach(function(e){
    sphere(giraffe,[e[0],7.85,e[1]],[.105,.105,.055],black,16);
    sphere(giraffe,[e[0]+.035,7.885,e[1]+(e[1]>0?.045:-.045)],[.025,.025,.014],cream,10);
  });
  // ears
  var earGeo = new THREE.SphereGeometry(1,18,12);
  mesh(earGeo,hide,giraffe,[1.45,8.18,.57],[.18,.44,.11],[.1,0,-.78]);
  mesh(earGeo,hide,giraffe,[1.45,8.18,-.57],[.18,.44,.11],[-.1,0,-.78]);
  mesh(earGeo,dark,giraffe,[1.45,8.19,.59],[.10,.30,.115],[.1,0,-.78]);
  mesh(earGeo,dark,giraffe,[1.45,8.19,-.59],[.10,.30,.115],[-.1,0,-.78]);
  // ossicones
  [[1.44,.28],[1.44,-.28]].forEach(function(h){
    cylinder(giraffe,[h[0],8.43,h[1]],.085,.12,.55,hide,[0,0,-.08]);
    sphere(giraffe,[h[0]+.025,8.72,h[1]],[.145,.13,.145],dark,14);
  });

  // Serrated mane silhouette.
  var maneShape = new THREE.Shape(); maneShape.moveTo(1.14,7.73); maneShape.lineTo(.92,7.47);
  for(var mi=0;mi<8;mi++){ var my=7.26-mi*.34; maneShape.lineTo(.98-(mi*.035),my+.13); maneShape.lineTo(.78-(mi*.035),my); }
  maneShape.lineTo(1.17,4.65); maneShape.closePath();
  mesh(new THREE.ExtrudeGeometry(maneShape,{depth:.10,bevelEnabled:false}),maneMat,giraffe,[0,0,-.05]);

  // Articulated legs: a rolling, four-beat lateral-sequence walk.
  var legs=[];
  function makeLeg(x,z,front,phase){
    var hip=new THREE.Group(); hip.position.set(x,4.25,z); giraffe.add(hip);
    var upperLen=1.78, lowerLen=2.10;
    var upper=cylinder(hip,[0,-upperLen/2,0],front?.20:.25,front?.27:.32,upperLen,hide);
    var knee=new THREE.Group(); knee.position.y=-upperLen; hip.add(knee);
    sphere(knee,[0,0,0],[.25,.25,.23],hide,16);
    cylinder(knee,[0,-lowerLen/2,0],.13,.18,lowerLen,hide);
    var ankle=new THREE.Group(); ankle.position.y=-lowerLen; knee.add(ankle);
    sphere(ankle,[.10,-.10,0],[.29,.18,.24],dark,14);
    mesh(new THREE.BoxGeometry(.52,.18,.42),dark,ankle,[.18,-.21,0],[1,1,1],[0,0,.08]);
    legs.push({hip:hip,knee:knee,ankle:ankle,phase:phase,front:front,z:z});
  }
  makeLeg(1.22,.45,true,0); makeLeg(1.22,-.45,true,Math.PI);
  makeLeg(-1.28,.48,false,.42); makeLeg(-1.28,-.48,false,Math.PI+.42);

  // Tail with animated tuft.
  var tailRoot=new THREE.Group(); tailRoot.position.set(-1.85,4.62,0); giraffe.add(tailRoot);
  between(tailRoot,[0,0,0],[-.72,-1.1,0],.07,.11,pale);
  var tuft=sphere(tailRoot,[-.76,-1.18,0],[.16,.38,.16],dark,14); tuft.rotation.z=-.52;

  // Ground.
  var groundMat=new THREE.MeshStandardMaterial({color:0xb99762,roughness:1});
  var ground=mesh(new THREE.PlaneGeometry(120,120),groundMat,scene,[0,0,0],null,[-Math.PI/2,0,0]); ground.receiveShadow=true; ground.castShadow=false;
  // Dry grasses.
  var grassMat=new THREE.MeshBasicMaterial({color:0x846f42,side:THREE.DoubleSide,transparent:true,opacity:.65});
  var grassGeo=new THREE.PlaneGeometry(.05,.65); grassGeo.translate(0,.325,0);
  var grasses=new THREE.InstancedMesh(grassGeo,grassMat,260); var dummy=new THREE.Object3D();
  var rs=91; function rand(){rs=(rs*16807)%2147483647;return rs/2147483647;}
  for(var gi=0;gi<260;gi++){ var ang=rand()*Math.PI*2, rad=3+rand()*30; dummy.position.set(Math.cos(ang)*rad,0,Math.sin(ang)*rad); dummy.rotation.y=rand()*Math.PI; var sc=.35+rand(); dummy.scale.set(sc,sc,sc); dummy.updateMatrix(); grasses.setMatrixAt(gi,dummy.matrix); }
  scene.add(grasses);
  // Distant acacia silhouettes.
  function tree(x,z,s){ var g=new THREE.Group(); g.position.set(x,0,z); g.scale.setScalar(s); scene.add(g);
    cylinder(g,[0,1.3,0],.1,.16,2.6,dark,[0,0,-.05]);
    sphere(g,[0,2.7,0],[1.35,.27,.78],new THREE.MeshStandardMaterial({color:0x4b512b,roughness:1}),16);
    sphere(g,[.72,2.53,0],[.8,.2,.55],new THREE.MeshStandardMaterial({color:0x596033,roughness:1}),14);
  }
  tree(-9,-12,1.35); tree(12,-18,1.8); tree(-19,-23,2.2);

  // Dust motes near the feet.
  var dustCount=90, dustPos=new Float32Array(dustCount*3), dustSeed=[];
  for(var di=0;di<dustCount;di++){dustSeed.push([Math.random(),Math.random(),Math.random()]);}
  var dustGeo=new THREE.BufferGeometry(); dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPos,3));
  var dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:0xd8b982,size:.055,transparent:true,opacity:.45,depthWrite:false})); scene.add(dust);

  var clock=new THREE.Clock(), elapsed=0, playing=true, pace=1;
  function updateCamera(){
    var cp=Math.cos(orbit.pitch); camera.position.set(orbit.target.x+Math.sin(orbit.yaw)*cp*orbit.radius,orbit.target.y+Math.sin(orbit.pitch)*orbit.radius,orbit.target.z+Math.cos(orbit.yaw)*cp*orbit.radius); camera.lookAt(orbit.target);
  }
  function animate(){ requestAnimationFrame(animate); var dt=Math.min(clock.getDelta(),.04); if(playing) elapsed+=dt*pace;
    var cycle=elapsed*3.1, bob=Math.sin(cycle*2)*.045;
    giraffe.position.y=bob; giraffe.rotation.z=Math.sin(cycle*2)*.008;
    legs.forEach(function(l){
      var s=Math.sin(cycle+l.phase), forward=s*.29;
      l.hip.rotation.z=forward+(l.front?-.015:.02);
      l.knee.rotation.z=Math.max(0,-s)*.43+.04;
      l.ankle.rotation.z=-forward*.45-Math.max(0,-s)*.16;
    });
    tailRoot.rotation.x=Math.sin(elapsed*2.5)*.24; tailRoot.rotation.z=.18+Math.sin(elapsed*3.6)*.11;
    // restrained head counter-bob and ear flick
    giraffe.children[5].rotation.z=Math.sin(cycle*2+.7)*.01;
    var p=dustGeo.attributes.position.array;
    for(var i=0;i<dustCount;i++){var d=dustSeed[i], life=(elapsed*.16+d[0])%1; p[i*3]=-2.1+d[1]*4.3+life*.8; p[i*3+1]=.03+life*.65; p[i*3+2]=(d[2]-.5)*1.5;}
    dustGeo.attributes.position.needsUpdate=true;
    updateCamera(); renderer.render(scene,camera);
  }

  var canvas=renderer.domElement, dragging=false, px=0, py=0;
  canvas.addEventListener('pointerdown',function(e){dragging=true;px=e.clientX;py=e.clientY;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',function(e){if(!dragging)return;orbit.yaw-=(e.clientX-px)*.005;orbit.pitch=Math.max(-.04,Math.min(.48,orbit.pitch+(e.clientY-py)*.004));px=e.clientX;py=e.clientY;});
  canvas.addEventListener('pointerup',function(){dragging=false;});
  canvas.addEventListener('wheel',function(e){orbit.radius=Math.max(11,Math.min(25,orbit.radius+e.deltaY*.012));e.preventDefault();},{passive:false});
  document.getElementById('speed').addEventListener('input',function(e){pace=+e.target.value;});
  document.getElementById('toggle').addEventListener('click',function(){playing=!playing;this.querySelector('.pause-icon').textContent=playing?'Ⅱ':'▶';this.querySelector('.control-label').textContent=playing?'PAUSE':'WALK';this.setAttribute('aria-label',playing?'Pause animation':'Play animation');});
  addEventListener('resize',function(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
  updateCamera(); animate(); setTimeout(function(){document.getElementById('loading').classList.add('done');},850);
})();
