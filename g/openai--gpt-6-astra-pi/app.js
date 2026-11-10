/* Savanna / 001 — an original procedural study. Three.js r160.
   Classic scripts, generated geometry and shaders: works over file://, offline. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!window.THREE) { $('error').hidden = false; return; }
  const T = THREE, TAU = Math.PI * 2;
  const clamp = T.MathUtils.clamp, lerp = T.MathUtils.lerp;
  const v3 = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
  let seed = 421;
  const random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rand = (a, b) => lerp(a, b, random());
  const state = { playing: !matchMedia('(prefers-reduced-motion: reduce)').matches, pace: 1, time: 0, distance: 0, golden: true, ui: true, view: 'portrait' };
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0xd9d4b9, .0085);
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: $('scene'), antialias: true, powerPreference: 'high-performance' });
  } catch (e) { $('error').hidden = false; console.error(e); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.07;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const camera = new T.PerspectiveCamera(36, innerWidth / innerHeight, .08, 500);
  const hemi = new T.HemisphereLight(0xe8eeec, 0x927743, 2.0);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xffdeb0, 3.5);
  sun.position.set(-12, 15, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: .5, far: 55 });
  sun.shadow.bias = -.00018;
  sun.shadow.normalBias = .025;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new T.DirectionalLight(0xd4e6ed, .65);
  fill.position.set(7, 5, -8); scene.add(fill);

  const noiseGLSL = `
    float hash13(vec3 p) { p = fract(p * .1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
    vec3 hash33(vec3 p) { p = fract(p * vec3(.1031,.1030,.0973)); p += dot(p,p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
    float noise3(vec3 p) {
      vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),f.x),mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x),mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x),f.y),f.z);
    }
    float fbm(vec3 p) { return .57*noise3(p)+.27*noise3(p*2.07)+.12*noise3(p*4.17)+.04*noise3(p*8.41); }
  `;
  const skyUniforms = { uSun: { value: v3(-.55,.48,.35).normalize() }, uWarm: { value: 1 } };
  const sky = new T.Mesh(new T.SphereGeometry(230, 48, 24), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, uniforms: skyUniforms,
    vertexShader: `varying vec3 vDir; void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `${noiseGLSL}
      varying vec3 vDir; uniform vec3 uSun; uniform float uWarm;
      void main(){vec3 d=normalize(vDir);float h=max(d.y,0.);
        vec3 horizon=mix(vec3(.81,.86,.82),vec3(.89,.83,.68),uWarm);
        vec3 zenith=mix(vec3(.32,.56,.67),vec3(.50,.65,.66),uWarm);
        vec3 col=mix(horizon,zenith,pow(h,.5));
        float glow=pow(max(dot(d,uSun),0.),12.);col+=vec3(.14,.10,.035)*glow*uWarm;
        vec3 cp=d/max(.13,d.y)*2.2;float cloud=smoothstep(.55,.79,fbm(cp*vec3(.8,2.,1.4)));
        col=mix(col,vec3(.92,.9,.8),cloud*.32*smoothstep(.0,.18,h));
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  scene.add(sky);

  // The same rest-space coordinate is carried by every skin vertex, so the
  // reticulated coat remains attached to the animal, including articulated limbs.
  const skin = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .89 });
  skin.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute vec3 coatPosition; varying vec3 vCoat;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoat=coatPosition;');
    shader.fragmentShader = 'varying vec3 vCoat;\n' + noiseGLSL + `
      vec3 coat(vec3 p) {
        float fine=smoothstep(4.65,5.02,p.y);
        float scale=3.7;
        vec3 pivot=vec3(1.5,4.9,0.);
        vec3 q=pivot*scale+(p-pivot)*mix(scale,8.,fine);
        q+=vec3(noise3(p*8.),noise3(p*7.+14.),noise3(p*8.+29.))*.16;
        vec3 cell=floor(q),f=fract(q);float f1=10.,f2=10.;vec3 id=vec3(0.);
        for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
          vec3 g=vec3(float(x),float(y),float(z));
          vec3 r=g+.18+.64*hash33(cell+g)-f;
          float d=dot(r,r);
          if(d<f1){f2=f1;f1=d;id=cell+g;}else if(d<f2){f2=d;}
        }
        float border=(sqrt(f2)-sqrt(f1));
        float marking=smoothstep(.040,.084,border);
        float n=fbm(p*23.);float pigment=hash13(id+3.);
        vec3 cream=vec3(.77,.57,.31);
        vec3 brown=mix(vec3(.23,.079,.025),vec3(.43,.21,.065),pigment*.75+n*.25);
        brown*=.85+.24*n;
        float belly=(1.-smoothstep(2.16,2.39,p.y))*smoothstep(1.88,2.06,p.y)*(1.-smoothstep(.55,1.0,abs(p.x)));
        float socks=1.-smoothstep(.27,.77,p.y);
        marking*=1.-.94*max(belly,socks);
        vec3 c=mix(cream,brown,marking);
        c*=.93+.12*noise3(p*145.);
        return c;
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= coat(vCoat);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = .87 + .1 * noise3(vCoat * 110.);');
  };
  const plain = (color, roughness = .85) => new T.MeshStandardMaterial({ color, roughness });
  const muzzleMat = plain(0xa58b60), innerEarMat = plain(0x8e7051), hoofMat = plain(0x494336, .72);
  const hornTipMat = plain(0x453226), hairMat = plain(0x453127), lidMat = plain(0x715137);
  const eyeMat = new T.MeshPhysicalMaterial({ color: 0x160f09, roughness: .14, clearcoat: 1, clearcoatRoughness: .08 });
  const nostrilMat = plain(0x2c231b), lipMat = plain(0x65503b);
  const giraffe = new T.Group(); scene.add(giraffe);
  const body = new T.Group(); giraffe.add(body);
  const skinMeshes = [];
  const sphereGeo = new T.SphereGeometry(1, 32, 24);
  function mesh(geometry, material, parent = body) {
    const m = new T.Mesh(geometry, material); m.castShadow = true; m.receiveShadow = true; parent.add(m);
    if (material === skin) skinMeshes.push(m);
    return m;
  }
  function ellipsoid(parent, p, scale, material = skin, rotation = 0) {
    const m = mesh(sphereGeo.clone(), material, parent); m.position.set(...p); m.scale.set(...scale); m.rotation.z = rotation; return m;
  }
  // A smoothly interpolated elliptical sweep, rather than a pile of cylinders.
  // Sections: [x, y, z, in-plane radius, lateral radius].
  function loft(sections, steps = 56, sides = 24) {
    const curve = new T.CatmullRomCurve3(sections.map(s => v3(s[0],s[1],s[2])), false, 'catmullrom', .35);
    const radii = new T.CatmullRomCurve3(sections.map(s => v3(s[3],s[4],0)), false, 'catmullrom', .35);
    const pos=[], uv=[], indices=[];
    for(let i=0;i<=steps;i++){
      const u=i/steps, p=curve.getPoint(u), tangent=curve.getTangent(u).normalize();
      let a=v3().crossVectors(tangent,v3(0,0,1)).normalize();
      if(a.lengthSq()<.5) a.set(1,0,0);
      const b=v3().crossVectors(a,tangent).normalize(), r=radii.getPoint(u);
      for(let j=0;j<=sides;j++){
        const angle=j/sides*TAU;
        const pt=p.clone().addScaledVector(a,Math.cos(angle)*Math.max(.0005,r.x)).addScaledVector(b,Math.sin(angle)*Math.max(.0005,r.y));
        pos.push(pt.x,pt.y,pt.z);uv.push(j/sides,u);
        if(i<steps&&j<sides){const k=i*(sides+1)+j;indices.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2);}
      }
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  function tube(points, radius, mat, parent=body, segments=24, radial=7) {
    return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>Array.isArray(p)?v3(...p):p)),segments,radius,radial,false),mat,parent);
  }
  const torso = mesh(loft([
    [-1.34,2.66,0,.008,.008],[-1.25,2.66,0,.26,.24],[-1.03,2.65,0,.42,.37],[-.64,2.63,0,.49,.445],
    [-.12,2.65,0,.52,.475],[.34,2.71,0,.555,.46],[.66,2.75,0,.51,.395],[.88,2.77,0,.35,.27],[1.03,2.79,0,.01,.01]
  ],90,40),skin);
  // Shoulder, haunch and pectoral volumes dissolve into the main silhouette.
  for(const side of [-1,1]){
    ellipsoid(body,[.60,2.61,side*.25],[.265,.435,.195],skin,-.16);
    ellipsoid(body,[-.94,2.60,side*.23],[.275,.40,.20],skin,.20);
  }
  ellipsoid(body,[.80,2.46,0],[.27,.35,.28],skin,-.2);
  const neck = new T.Group(); neck.position.set(.57,2.94,0); body.add(neck);
  const neckSections=[
    [-.06,-.17,0,.40,.31],[.015,.09,0,.395,.30],[.18,.45,0,.31,.255],
    [.37,.89,0,.255,.216],[.55,1.32,0,.213,.183],[.72,1.72,0,.175,.151],[.83,1.98,0,.151,.142],[.85,2.08,0,.13,.13]
  ];
  mesh(loft(neckSections,84,36),skin,neck);
  // Narrow dark mane runs along the posterior ridge, with an irregular hairy edge.
  const manePos=[],maneIndex=[];
  const neckCurve=new T.CatmullRomCurve3(neckSections.map(s=>v3(s[0],s[1],s[2])),false,'catmullrom',.35);
  const neckRadii=new T.CatmullRomCurve3(neckSections.map(s=>v3(s[3],s[4],0)),false,'catmullrom',.35);
  for(let i=0;i<=120;i++){
    const u=.12+.88*i/120,p=neckCurve.getPoint(u),t=neckCurve.getTangent(u),back=v3(-t.y,t.x,0).normalize();
    p.addScaledVector(back,neckRadii.getPoint(u).x*.99);
    const length=.065+.065*Math.sin(u*Math.PI)+rand(-.022,.022);
    for(const side of [-1,1]){
      manePos.push(p.x,p.y,side*.019,p.x+back.x*length,p.y+back.y*length,side*.006);
    }
    if(i<120){let k=i*4;maneIndex.push(k,k+4,k+1,k+1,k+4,k+5,k+2,k+3,k+6,k+3,k+7,k+6,k+1,k+5,k+3,k+3,k+5,k+7);}
  }
  const maneGeo=new T.BufferGeometry();maneGeo.setAttribute('position',new T.Float32BufferAttribute(manePos,3));maneGeo.setIndex(maneIndex);maneGeo.computeVertexNormals();
  mesh(maneGeo,hairMat,neck);
  for(let i=0;i<65;i++){
    const u=.14+.85*i/65,p=neckCurve.getPoint(u),t=neckCurve.getTangent(u),back=v3(-t.y,t.x,0).normalize();p.addScaledVector(back,neckRadii.getPoint(u).x);p.z=rand(-.025,.025);
    tube([p,p.clone().addScaledVector(back,.085).add(v3(0,-.025,0)),p.clone().addScaledVector(back,.11).add(v3(0,-.045,0))],.0019,hornTipMat,neck,5,3);
  }
  const head = new T.Group();head.position.set(.84,2.025,0);neck.add(head);
  mesh(loft([
    [-.20,.035,0,.035,.055],[-.12,.025,0,.18,.168],[.045,.012,0,.223,.195],
    [.23,-.045,0,.182,.162],[.44,-.125,0,.141,.14],[.65,-.168,0,.125,.157],[.76,-.175,0,.055,.12],[.78,-.175,0,.005,.015]
  ],56,32),skin,head);
  ellipsoid(head,[.13,-.124,0],[.25,.12,.163],skin,-.08);
  ellipsoid(head,[.644,-.185,0],[.155,.104,.158],muzzleMat,-.05);
  ellipsoid(head,[.61,-.260,0],[.159,.045,.141],muzzleMat);
  // Two ossicones, a small median forehead boss, and dark terminal tufts.
  for(const side of [-1,1]){
    mesh(loft([[-.037,.16,side*.112,.065,.058],[-.054,.25,side*.124,.047,.044],[-.075,.41,side*.145,.035,.036],[-.062,.46,side*.149,.041,.041],[-.055,.48,side*.15,.018,.022]],32,16),skin,head);
    ellipsoid(head,[-.06,.464,side*.149],[.05,.055,.048],hornTipMat);
    for(let j=0;j<16;j++){
      const a=rand(0,TAU),r=rand(.01,.035),p=v3(-.06+Math.cos(a)*r,.49,side*.149+Math.sin(a)*r);
      tube([p,p.clone().add(v3(rand(-.013,.013),rand(.012,.036),rand(-.013,.013)))],.0019,hairMat,head,2,3);
    }
  }
  ellipsoid(head,[.172,.157,0],[.091,.075,.10],skin);
  const ears=[];
  for(const side of [-1,1]){
    const ear = new T.Group();ear.position.set(-.105,.104,side*.161);head.add(ear);
    ear.quaternion.setFromUnitVectors(v3(0,1,0),v3(-.28,.48,side*.84).normalize());
    const earPos=[],earInPos=[],earUV=[],earIdx=[];
    const N=24,M=12;
    for(let i=0;i<=N;i++){
      const u=i/N,w=.135*Math.pow(Math.sin(Math.PI*u),.85)*(1-.26*u);
      for(let j=0;j<=M;j++){
        const v=j/M*2-1;const z=.033*(1-v*v)*Math.sin(Math.PI*u);
        earPos.push(w*v,u*.44,z);earInPos.push(w*v*.77,u*.395+.014,z+.009);earUV.push(j/M,u);
        if(i<N&&j<M){let k=i*(M+1)+j;earIdx.push(k,k+1,k+M+1,k+1,k+M+2,k+M+1);}
      }
    }
    const eg=new T.BufferGeometry();eg.setAttribute('position',new T.Float32BufferAttribute(earPos,3));eg.setAttribute('uv',new T.Float32BufferAttribute(earUV,2));eg.setIndex(earIdx);eg.computeVertexNormals();
    const outer=mesh(eg,skin,ear);outer.material=skin;
    // Duplicate the outer shell with reversed winding for a naturally visible back.
    const back=eg.clone();back.setIndex(earIdx.slice().reverse());back.computeVertexNormals();mesh(back,skin,ear);
    const ig=new T.BufferGeometry();ig.setAttribute('position',new T.Float32BufferAttribute(earInPos,3));ig.setIndex(earIdx);ig.computeVertexNormals();
    const im=innerEarMat.clone();im.side=T.DoubleSide;mesh(ig,im,ear);
    ears.push({group:ear,base:ear.quaternion.clone(),side});
    // Brows, inset eyes, and the upper eyelash fan.
    ellipsoid(head,[.176,.038,side*.173],[.102,.074,.048],lidMat,-.15);
    const eye=ellipsoid(head,[.189,.037,side*.207],[.065,.048,.026],eyeMat,-.12);
    const eyeLid=[];for(let k=0;k<=12;k++){const a=k/12*Math.PI;eyeLid.push([.189+Math.cos(a)*.072,.037+Math.sin(a)*.049,side*(.216+.004*Math.sin(a))]);}
    tube(eyeLid,.010,skin,head,18,7);
    for(let k=0;k<9;k++){
      const a=.18+(k/8)*2.6,x=.189+Math.cos(a)*.066,y=.037+Math.sin(a)*.049,z=side*.222;
      tube([[x,y,z],[x-.004,y+.014,z+side*.023],[x-.013,y+.017,z+side*.034]],.0017,hairMat,head,4,3);
    }
    ellipsoid(head,[.627,-.137,side*.142],[.046,.023,.011],nostrilMat,.38);
    tube([[.583,-.137,side*.146],[.613,-.109,side*.15],[.653,-.111,side*.139]],.008,muzzleMat,head,12,5);
    tube([[.747,-.224,side*.105],[.691,-.243,side*.143],[.576,-.244,side*.147],[.435,-.229,side*.12]],.0053,lipMat,head,22,5);
    for(let j=0;j<7;j++){
      const x=rand(.56,.70),y=rand(-.215,-.16),z=side*.154;
      tube([[x,y,z],[x+rand(.015,.04),y-.012,z+side*rand(.026,.049)]],.0011,lidMat,head,2,3);
    }
  }
  // Short throat hairs and a soft chin beard.
  for(let i=0;i<19;i++){
    const p=v3(rand(.01,.22),-.229,rand(-.085,.085));
    tube([p,p.clone().add(v3(-.016,rand(-.035,-.012),0))],.0017,muzzleMat,head,2,3);
  }

  // Articulated legs. The distal ends are driven by ground-space stance/swing
  // trajectories; analytic two-bone IK keeps the knees connected throughout.
  const legs=[];
  const axisY=v3(0,1,0);
  function limbGeometry(profile) {
    return loft(profile.map(p=>[0,p[0],0,p[1],p[2]??p[1]]),32,20);
  }
  function makeSegment(parent, profile, mat=skin) {return mesh(limbGeometry(profile),mat,parent);}
  function placeSegment(m,a,b) {
    m.position.copy(a);const d=b.clone().sub(a);m.scale.set(1,d.length(),1);m.quaternion.setFromUnitVectors(axisY,d.normalize());
  }
  function solveKnee(a,b,l1,l2,pole) {
    const d=b.clone().sub(a),length=clamp(d.length(),.001,l1+l2-.0001),dir=d.normalize();
    const along=(l1*l1-l2*l2+length*length)/(2*length),height=Math.sqrt(Math.max(0,l1*l1-along*along));
    const perp=v3(pole,0,0).addScaledVector(dir,-dir.x*pole).normalize();
    return a.clone().addScaledVector(dir,along).addScaledVector(perp,height);
  }
  for(const front of [true,false])for(const side of [-1,1]){
    const group=new T.Group();giraffe.add(group);
    const upper=makeSegment(group,[[0,.165,.145],[.12,.183,.16],[.34,.149,.125],[.70,.085,.074],[1,.074,.069]]);
    const middle=makeSegment(group,[[0,.079,.070],[.10,.083,.075],[.25,.066,.059],[.70,.047,.045],[1,.053,.051]]);
    const lower=makeSegment(group,[[0,.063,.057],[.13,.052,.049],[.70,.038,.037],[.89,.041,.040],[1,.052,.049]]);
    const jointA=ellipsoid(group,[0,0,0],[.083,.096,.079]);
    const jointB=ellipsoid(group,[0,0,0],[.063,.08,.064]);
    const fetlock=ellipsoid(group,[0,0,0],[.068,.080,.065]);
    const foot=new T.Group();group.add(foot);
    // Rounded cloven hoof, broader at the ground with a visible interdigital cleft.
    for(const half of [-1,1]){
      const h=mesh(loft([[0,.006,half*.044,.086,.039],[.004,.025,half*.044,.092,.04],[.0,.10,half*.042,.073,.035],[-.013,.16,half*.038,.044,.029]],18,16),hoofMat,foot);
      h.position.x=.029;
    }
    ellipsoid(foot,[-.064,.116,0],[.028,.032,.049],muzzleMat);
    legs.push({front,side,group,upper,middle,lower,jointA,jointB,fetlock,foot,
      phase: (side===1?0:.5)+(front?.13:0), x:front?.67:-.96, z:side*(front?.32:.30), contact:1});
  }

  const tail = new T.Group();tail.position.set(-1.26,2.79,0);body.add(tail);
  const tailSections=[[0,0,0,.054,.05],[-.10,-.18,0,.040,.037],[-.20,-.46,0,.028,.026],[-.22,-.73,0,.021,.020],[-.20,-.98,0,.017,.017]];
  mesh(loft(tailSections,45,16),skin,tail);
  ellipsoid(tail,[-.205,-1.06,0],[.061,.20,.065],hairMat,.10);
  for(let i=0;i<80;i++){
    const a=rand(0,TAU),r=rand(.015,.055),p=v3(-.20+Math.cos(a)*r,-.96,Math.sin(a)*r);
    tube([p,p.clone().add(v3(rand(-.018,.01),-.17,rand(-.015,.015))),p.clone().add(v3(rand(-.035,.015),rand(-.23,-.34),rand(-.025,.025)))],rand(.0014,.0025),hairMat,tail,6,3);
  }
  function animateAnimal(t, travel=true) {
    const phase=t/1.8,cycle=phase*TAU;
    body.position.y=.020*Math.cos(cycle*2)+.007*Math.sin(cycle);
    body.rotation.x=.015*Math.sin(cycle);
    body.rotation.z=.008*Math.sin(cycle*2+.4);
    neck.rotation.z=.017*Math.sin(cycle-.65);
    neck.rotation.x=.009*Math.sin(cycle+.5);
    head.rotation.z=-.012*Math.sin(cycle-.8)+.009*Math.sin(t*.47);
    head.rotation.y=.022*Math.sin(t*.39)+.012*Math.sin(t*.73);
    for(const e of ears){const twitch=Math.pow(Math.max(0,Math.sin(t*.91+e.side*1.7)),16);e.group.quaternion.copy(e.base).multiply(new T.Quaternion().setFromAxisAngle(axisY,e.side*(.04*Math.sin(t*1.8)+twitch*.18)));}
    tail.rotation.x=.16*Math.sin(t*1.5)+.085*Math.sin(t*2.4);
    tail.rotation.z=.06*Math.sin(t*1.25);
    body.updateMatrixWorld(true);
    for(const leg of legs){
      const p=((phase+leg.phase)%1+1)%1,stance=.65,stride=.91;
      let x,lift=0,roll=0;
      if(p<stance){x=stride*(.5-p/stance);leg.contact=1;roll=p>.56?-(p-.56)/.09*.16:0;}
      else{const u=(p-stance)/(1-stance),smooth=u*u*(3-2*u);x=stride*(-.5+smooth);lift=.22*Math.pow(Math.sin(Math.PI*u),1.3);roll=.36*Math.sin(TAU*u)-.08;leg.contact=0;}
      const foot=v3(leg.x+x,.17+lift,leg.z+.016*Math.sin(cycle+leg.phase*TAU));
      const hip=v3(leg.x,leg.front?2.69:2.67,leg.z).applyMatrix4(body.matrix);
      let knee,hock;
      if(leg.front){
        const elbow=hip.clone().add(v3(-.15+x*.12,-.48,0));
        knee=solveKnee(elbow,foot,1.03,1.10,-1);
        placeSegment(leg.upper,hip,elbow);placeSegment(leg.middle,elbow,knee);placeSegment(leg.lower,knee,foot);
        leg.jointA.position.copy(knee);leg.jointB.position.copy(elbow);hock=knee;
      }else{
        hock=foot.clone().add(v3(-.12-.12*lift,.88-.12*lift,0));
        knee=solveKnee(hip,hock,.96,.92,1);
        placeSegment(leg.upper,hip,knee);placeSegment(leg.middle,knee,hock);placeSegment(leg.lower,hock,foot);
        leg.jointA.position.copy(knee);leg.jointB.position.copy(hock);
      }
      leg.fetlock.position.copy(foot);leg.foot.position.copy(foot).add(v3(0,-.17,0));leg.foot.rotation.z=roll;
    }
  }
  animateAnimal(0);
  giraffe.updateMatrixWorld(true);
  // Bake coat coordinates in the untransformed rest pose, once only.
  for(const m of skinMeshes){
    const p=m.geometry.getAttribute('position'),out=new Float32Array(p.count*3),v=v3();
    for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld);out[i*3]=v.x;out[i*3+1]=v.y;out[i*3+2]=v.z;}
    m.geometry.setAttribute('coatPosition',new T.BufferAttribute(out,3));
  }

  // Earth, gravel, distant low ridges and thousands of individually bent blades.
  const groundMat=plain(0xffffff,1);
  groundMat.onBeforeCompile=s=>{
    s.vertexShader='varying vec3 vEarth;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvEarth=(modelMatrix*vec4(position,1.)).xyz;');
    s.fragmentShader='varying vec3 vEarth;\n'+noiseGLSL+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float broad=fbm(vEarth*.16),fine=noise3(vEarth*31.);
      vec3 sand=mix(vec3(.32,.27,.14),vec3(.52,.43,.24),broad);
      sand*=.86+.22*fine;
      float trail=1.-smoothstep(1.0,2.8,abs(length(vEarth.xz-vec2(0.,-27.))-27.));
      sand=mix(sand,vec3(.48,.39,.245)*(.94+.10*fine),trail*.45);
      diffuseColor.rgb*=sand;`);
  };
  const ground=new T.Mesh(new T.PlaneGeometry(440,440),groundMat);ground.rotation.x=-Math.PI/2;ground.position.y=-.012;ground.receiveShadow=true;scene.add(ground);
  function addHills(){
    for(let i=0;i<17;i++){
      const a=i/17*TAU,r=rand(140,200),w=rand(20,55),h=rand(6,18);
      const g=new T.SphereGeometry(1,32,16);const pos=g.attributes.position;
      for(let k=0;k<pos.count;k++){const y=pos.getY(k),x=pos.getX(k),z=pos.getZ(k);pos.setY(k,y*(.86+.14*Math.sin(x*8+z*7)));}g.computeVertexNormals();
      const m=new T.Mesh(g,plain(new T.Color().setHSL(.17,.12,rand(.43,.53))));m.position.set(Math.cos(a)*r,-h*.3,Math.sin(a)*r);m.scale.set(w,h,w*.75);scene.add(m);
    }
  } addHills();
  function tuftGeometry(){
    const pos=[],colors=[],idx=[];
    for(let b=0;b<6;b++){
      const angle=b*2.399+rand(-.4,.4),dx=Math.cos(angle),dz=Math.sin(angle),height=rand(.17,.36),width=rand(.008,.018),bend=rand(.04,.13);
      const bx=rand(-.08,.08),bz=rand(-.08,.08),color=new T.Color().setHSL(rand(.105,.16),rand(.25,.42),rand(.32,.49));
      const start=pos.length/3;
      for(let j=0;j<=3;j++){
        const u=j/3,w=width*(1-u)*.5;
        for(const side of [-1,1]){
          pos.push(bx+dx*bend*u*u-dz*w*side,height*u,bz+dz*bend*u*u+dx*w*side);
          const shade=.66+.34*u;colors.push(color.r*shade,color.g*shade,color.b*shade);
        }
        if(j<3){const k=start+j*2;idx.push(k,k+2,k+1,k+1,k+2,k+3);}
      }
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(idx);g.computeVertexNormals();return g;
  }
  const windUniform={value:0};
  const grassMat=new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:1});
  grassMat.onBeforeCompile=s=>{
    s.uniforms.uWind=windUniform;s.vertexShader='uniform float uWind;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 origin=instanceMatrix[3].xyz;
      float gust=sin(origin.x*.41+origin.z*.29+uWind*1.7)+.45*sin(origin.x*.93-origin.z*.31+uWind*2.1);
      transformed.x+=gust*position.y*position.y*.27;transformed.z+=gust*position.y*position.y*.15;`);
  };
  const grass=new T.InstancedMesh(tuftGeometry(),grassMat,28500),dummy=new T.Object3D();
  for(let i=0;i<grass.count;i++){
    const a=rand(0,TAU),r=95*Math.sqrt(random()),x=Math.cos(a)*r,z=Math.sin(a)*r-20;
    const trail=Math.abs(Math.hypot(x,z+27)-27),onTrail=trail<1.1;
    const scale=rand(.65,1.7)*(onTrail?.22:1);
    dummy.position.set(x,0,z);dummy.rotation.set(0,rand(0,TAU),0);dummy.scale.set(scale,scale*rand(.7,1.25),scale);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);
  }
  grass.receiveShadow=true;grass.frustumCulled=false;scene.add(grass);
  // Dry flower spikes add a fine, irregular silhouette in the foreground.
  const stalkPositions=[],stalkColors=[];
  for(let i=0;i<1500;i++){
    const x=rand(-52,52),z=rand(-65,35);if(Math.abs(Math.hypot(x,z+27)-27)<1.3)continue;
    const h=rand(.22,.60),c=new T.Color(0x8c7a4f);stalkPositions.push(x,0,z,x+.035,h,z+.04);stalkColors.push(c.r,c.g,c.b,c.r*1.25,c.g*1.25,c.b*1.25);
    for(let j=0;j<4;j++){const y=h-.02-j*.022;stalkPositions.push(x+.035,y,z+.04,x+.035+rand(-.035,.035),y+.024,z+.04+rand(-.028,.028));stalkColors.push(c.r,c.g,c.b,c.r,c.g,c.b);}
  }
  const stalkGeo=new T.BufferGeometry();stalkGeo.setAttribute('position',new T.Float32BufferAttribute(stalkPositions,3));stalkGeo.setAttribute('color',new T.Float32BufferAttribute(stalkColors,3));scene.add(new T.LineSegments(stalkGeo,new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.8})));

  const rockGeo=new T.DodecahedronGeometry(1,0),rockMat=plain(0x8c8064);
  const rocks=new T.InstancedMesh(rockGeo,rockMat,700);
  for(let i=0;i<rocks.count;i++){
    dummy.position.set(rand(-80,80),rand(-.04,.006),rand(-85,60));dummy.rotation.set(rand(0,3),rand(0,6),rand(0,3));const s=rand(.024,.13);dummy.scale.set(s*rand(.7,1.7),s*.4,s);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
    rocks.setColorAt(i,new T.Color().setHSL(.12,.12,rand(.49,.76)));
  }rocks.receiveShadow=true;scene.add(rocks);

  const barkMat=plain(0x665940),leafMat=new T.MeshStandardMaterial({color:0x626448,roughness:1,vertexColors:false});
  function branch(parent,a,b,r1,r2){
    const d=b.clone().sub(a);const m=new T.Mesh(new T.CylinderGeometry(r2,r1,d.length(),7,1),barkMat);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(axisY,d.normalize());parent.add(m);return m;
  }
  function acacia(x,z,size,variant){
    const tree=new T.Group();tree.position.set(x,0,z);tree.scale.setScalar(size);scene.add(tree);
    const tops=[],bend=rand(-.3,.3);let p=v3();
    const trunk=[v3(.10,1.0,.03),v3(bend,2.1,-.08),v3(bend+.15,2.8,0)];
    for(let i=0;i<trunk.length;i++){branch(tree,p,trunk[i],.16-i*.034,.126-i*.033);p=trunk[i];}
    for(let i=0;i<9;i++){
      const a=i/9*TAU+variant*.31,r=rand(1.4,2.8),start=trunk[i%2+1],mid=v3(Math.cos(a)*r*.6,rand(2.75,3.2),Math.sin(a)*r*.6),end=v3(Math.cos(a)*r,rand(3.0,3.6),Math.sin(a)*r);
      branch(tree,start,mid,.065,.035);branch(tree,mid,end,.034,.010);tops.push(end);
      for(let j=0;j<3;j++){const e=end.clone().add(v3(rand(-.55,.55),rand(.03,.30),rand(-.55,.55)));branch(tree,mid,e,.018,.004);tops.push(e);}
    }
    const foliage=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),leafMat,360);
    for(let i=0;i<foliage.count;i++){
      const base=tops[i%tops.length];dummy.position.copy(base).add(v3(rand(-.55,.55),rand(-.02,.18),rand(-.55,.55)));dummy.scale.set(rand(.20,.49),rand(.10,.22),rand(.18,.46));dummy.rotation.set(rand(0,1),rand(0,6),rand(-.2,.2));dummy.updateMatrix();foliage.setMatrixAt(i,dummy.matrix);foliage.setColorAt(i,new T.Color().setHSL(rand(.15,.21),rand(.13,.3),rand(.40,.75)));
    }
    tree.add(foliage);return tree;
  }
  // Open foreground; umbrella crowns occupy the middle and distant ground.
  const treeLocations=[[-16,-24,1.6],[17,-38,1.8],[-31,-49,2.1],[35,-63,2.4],[-47,-13,1.7],[53,-19,1.8],[8,-79,2.0],[-25,-95,2.5],[69,-79,2],[-71,-61,2.7],[72,25,2.1],[-72,26,2.0],[1,58,1.7],[36,62,2.3],[-43,69,2.0]];
  treeLocations.forEach((p,i)=>acacia(...p,i));

  // Soft local contact under each hoof complements the sun's long shadow.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=64;shadowCanvas.height=64;
  const sc=shadowCanvas.getContext('2d'),gr=sc.createRadialGradient(32,32,1,32,32,31);gr.addColorStop(0,'rgba(35,28,15,.40)');gr.addColorStop(.3,'rgba(35,28,15,.22)');gr.addColorStop(1,'rgba(35,28,15,0)');sc.fillStyle=gr;sc.fillRect(0,0,64,64);
  const shadowTexture=new T.CanvasTexture(shadowCanvas),footShadows=[];
  for(let i=0;i<4;i++){const m=new T.Mesh(new T.PlaneGeometry(.5,.44),new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,opacity:.65}));m.rotation.x=-Math.PI/2;m.position.y=.003;giraffe.add(m);footShadows.push(m);}
  // Tiny floating seeds catch the evening light (not a screen-space overlay).
  const dustPos=new Float32Array(150*3);
  for(let i=0;i<150;i++){dustPos[i*3]=rand(-17,17);dustPos[i*3+1]=rand(.2,4);dustPos[i*3+2]=rand(-15,15);}
  const dustGeo=new T.BufferGeometry();dustGeo.setAttribute('position',new T.BufferAttribute(dustPos,3));
  const dust=new T.Points(dustGeo,new T.PointsMaterial({color:0xffedc3,size:.021,transparent:true,opacity:.35,depthWrite:false}));scene.add(dust);

  // Orbit controls are implemented here to avoid module imports under file://.
  const orbit={theta:.93,phi:1.40,radius:11.6,target:v3(-.48,2.6,0)};
  const desired={theta:orbit.theta,phi:orbit.phi,radius:orbit.radius,target:orbit.target.clone()};
  let cameraTween=true;
  function setView(name){
    state.view=name;const narrow=innerWidth<600;
    if(name==='detail'){Object.assign(desired,{theta:1.13,phi:1.43,radius:narrow?4.1:3.7});desired.target.set(1.50,4.63,0);}
    else if(name==='profile'){Object.assign(desired,{theta:Math.PI/2,phi:1.53,radius:narrow?15.3:13.0});desired.target.set(narrow?.35:-.35,2.60,0);}
    else{Object.assign(desired,{theta:1.09,phi:1.52,radius:narrow?15.5:13.4});desired.target.set(narrow?.45:-.50,2.55,0);}
    cameraTween=true;
    document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===name;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',active);});
    document.body.classList.toggle('detail-view',name==='detail');
  }
  setView('portrait');Object.assign(orbit,{theta:desired.theta,phi:desired.phi,radius:desired.radius});orbit.target.copy(desired.target);
  function updateCamera(dt){
    const ease=1-Math.exp(-dt*5);
    if(cameraTween){orbit.theta=lerp(orbit.theta,desired.theta,ease);orbit.phi=lerp(orbit.phi,desired.phi,ease);orbit.radius=lerp(orbit.radius,desired.radius,ease);orbit.target.lerp(desired.target,ease);}
    const offset=v3(Math.cos(orbit.theta)*Math.sin(orbit.phi),Math.cos(orbit.phi),Math.sin(orbit.theta)*Math.sin(orbit.phi)).multiplyScalar(orbit.radius);
    const target=orbit.target.clone().applyQuaternion(giraffe.quaternion).add(giraffe.position);
    camera.position.copy(orbit.target).add(offset).applyQuaternion(giraffe.quaternion).add(giraffe.position);
    camera.lookAt(target);
  }
  const pointers=new Map();let pinchDistance=0;
  $('scene').addEventListener('pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});$('scene').setPointerCapture(e.pointerId);cameraTween=false;if(pointers.size===2){const p=[...pointers.values()];pinchDistance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}});
  $('scene').addEventListener('pointermove',e=>{
    const old=pointers.get(e.pointerId);if(!old)return;const dx=e.clientX-old.x,dy=e.clientY-old.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2){const p=[...pointers.values()],d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(pinchDistance>0)orbit.radius=clamp(orbit.radius*pinchDistance/d,2.1,28);pinchDistance=d;}
    else if(e.shiftKey||e.buttons===2){orbit.target.y=clamp(orbit.target.y+dy*.004*orbit.radius,0,5.5);orbit.target.x-=dx*.003*orbit.radius;}
    else{orbit.theta+=dx*.006;orbit.phi=clamp(orbit.phi+dy*.005,.32,1.66);}
    document.querySelectorAll('[data-view]').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false');});
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])$('scene').addEventListener(event,e=>{pointers.delete(e.pointerId);pinchDistance=0;});
  $('scene').addEventListener('contextmenu',e=>e.preventDefault());
  $('scene').addEventListener('wheel',e=>{e.preventDefault();cameraTween=false;orbit.radius=clamp(orbit.radius*Math.exp(e.deltaY*.001),2.1,28);},{passive:false});
  function playUI(){
    $('play-toggle').setAttribute('aria-label',state.playing?'Pause walking':'Resume walking');$('pause-icon').hidden=!state.playing;$('play-icon').hidden=state.playing;
    $('behavior-label').textContent=state.playing?'A GENTLE WALK':'A MOMENT OF STILLNESS';$('scene-subtitle').textContent=state.playing?'Lateral-sequence gait · tracking camera':'Paused · take a closer look';
  }
  $('play-toggle').onclick=()=>{state.playing=!state.playing;playUI();};playUI();
  $('pace').oninput=e=>{state.pace=Number(e.target.value);$('pace-value').value=state.pace.toFixed(2).replace(/0$/,'')+'×';};
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $('reset').onclick=()=>setView('portrait');
  function toggleLight(){
    state.golden=!state.golden;$('light-label').textContent=state.golden?'Golden hour':'Daylight';$('light-toggle').setAttribute('aria-label','Change lighting to '+(state.golden?'daylight':'golden hour'));
  }$('light-toggle').onclick=toggleLight;
  $('about-toggle').onclick=()=>{const open=$('field-notes').hidden;$('field-notes').hidden=!open;$('about-toggle').setAttribute('aria-expanded',open);if(open)$('notes-close').focus();};
  $('notes-close').onclick=()=>{$('field-notes').hidden=true;$('about-toggle').setAttribute('aria-expanded','false');$('about-toggle').focus();};
  function toggleUI(){state.ui=!state.ui;document.body.classList.toggle('ui-hidden',!state.ui);$('show-ui').hidden=state.ui;}
  $('hide-ui').onclick=toggleUI;$('show-ui').onclick=toggleUI;
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){console.info('Fullscreen is not supported by this browser.');}}
  $('fullscreen').onclick=fullscreen;
  document.addEventListener('fullscreenchange',()=>$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen'));
  addEventListener('keydown',e=>{
    if(e.target.matches('input,button,a'))return;
    if(e.code==='Space'){e.preventDefault();state.playing=!state.playing;playUI();}
    if(e.key.toLowerCase()==='r')setView('portrait');if(e.key.toLowerCase()==='h')toggleUI();if(e.key.toLowerCase()==='f')fullscreen();
    if(e.key==='1')setView('portrait');if(e.key==='2')setView('profile');if(e.key==='3')setView('detail');
    if(e.key==='Escape'){$('field-notes').hidden=true;$('about-toggle').setAttribute('aria-expanded','false');}
  });
  let wasNarrow=innerWidth<600;
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));if(wasNarrow!==(innerWidth<600)){wasNarrow=innerWidth<600;setView(state.view);}});
  let last=performance.now(),warm=1,frames=0;
  const goldenSun=new T.Color(0xffdeb0),daySun=new T.Color(0xfff4de),goldFog=new T.Color(0xd9d4b9),dayFog=new T.Color(0xc6d7d3);
  function frame(now){
    requestAnimationFrame(frame);
    const dt=Math.min((now-last)/1000,.05);last=now;
    if(document.hidden)return;
    if(state.playing){state.time+=dt*state.pace;state.distance+=dt*state.pace*(.91/(.65*1.8));}
    animateAnimal(state.time);
    // A broad circular route is seamless: the animal actually travels, while
    // the camera follows. Stance velocity matches the animal's forward speed.
    const angle=state.distance/27;
    giraffe.position.set(Math.sin(angle)*27,0,(Math.cos(angle)-1)*27);giraffe.rotation.y=angle;
    for(let i=0;i<legs.length;i++){footShadows[i].position.x=legs[i].foot.position.x;footShadows[i].position.z=legs[i].foot.position.z;footShadows[i].material.opacity=.65*(1-clamp(legs[i].foot.position.y/.25,0,.9));}
    windUniform.value=state.time;
    dust.position.copy(giraffe.position);dust.rotation.y=state.time*.006;
    sky.position.copy(giraffe.position);
    warm=lerp(warm,state.golden?1:0,1-Math.exp(-dt*2));skyUniforms.uWarm.value=warm;
    scene.fog.color.copy(dayFog).lerp(goldFog,warm);sun.color.copy(daySun).lerp(goldenSun,warm);
    sun.intensity=lerp(3.0,3.5,warm);hemi.intensity=lerp(2.3,2.0,warm);
    sun.position.copy(giraffe.position).add(v3(-12,lerp(24,15,warm),9));sun.target.position.copy(giraffe.position).add(v3(0,2,0));
    updateCamera(dt);renderer.render(scene,camera);
    if(++frames===3){$('loading').style.opacity='0';setTimeout(()=>$('loading').hidden=true,700);}
  }
  $('scene').addEventListener('webglcontextlost',e=>{e.preventDefault();$('error').hidden=false;});
  $('scene').addEventListener('webglcontextrestored',()=>location.reload());
  // A small read-only inspection hook also makes the procedural study inspectable.
  window.savanna={state,scene,camera,renderer,giraffe,legs,setView,animateAnimal,getStats:()=>({triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,geometries:renderer.info.memory.geometries})};
  requestAnimationFrame(frame);
})();
