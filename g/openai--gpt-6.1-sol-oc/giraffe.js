/* Giraffa — completely local, procedural geometry, textures and animation. */
'use strict';
(() => {
  if (!window.THREE) { document.getElementById('error').hidden = false; return; }
  const T = THREE;
  const canvas = document.getElementById('canvas');
  let renderer;
  try { renderer = new T.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'}); }
  catch (e) { document.getElementById('loading').hidden = true; document.getElementById('error').hidden = false; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new T.Scene();
  scene.background = new T.Color('#dedac5');
  scene.fog = new T.FogExp2('#dedac5', .013);
  const camera = new T.PerspectiveCamera(35, 1, .1, 230);
  const hemi = new T.HemisphereLight('#e9eff1', '#8b7650', 2.2);
  scene.add(hemi);
  const sun = new T.DirectionalLight('#ffdea3', 3.6);
  sun.position.set(-5, 12, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {left:-10,right:10,top:10,bottom:-10,near:.5,far:35});
  sun.shadow.normalBias = .035;
  sun.shadow.bias = -.00015;
  sun.shadow.radius = 4;
  scene.add(sun);
  const fill = new T.DirectionalLight('#e9ebd6', .65);
  fill.position.set(3,6,-8); scene.add(fill);

  let seed = 48329;
  function rand() { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; }
  const range = (a,b) => a + rand()*(b-a);
  const V = (x,y,z) => new T.Vector3(x,y,z);
  function mat(color, roughness= .85) { return new T.MeshStandardMaterial({color,roughness}); }
  function mesh(geometry, material, parent=scene) {
    const m = new T.Mesh(geometry,material); m.castShadow=true; m.receiveShadow=true; parent.add(m); return m;
  }
  function ellipsoid(parent, material, position, scale, detail=32) {
    const m = mesh(new T.SphereGeometry(1,detail,Math.max(12,detail/2)), material,parent);
    m.position.set(...position); m.scale.set(...scale); return m;
  }
  function rod(parent, a, b, r1, r2, material, sides=12) {
    const from = new T.Vector3(...a), to = new T.Vector3(...b), d = to.clone().sub(from);
    const m = mesh(new T.CylinderGeometry(r2,r1,d.length(),sides),material,parent);
    m.position.copy(from.add(to).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(V(0,1,0),d.normalize()); return m;
  }
  function mergeStatic(parent, material) {
    const parts=parent.children.filter(p=>p.isMesh&&p.material===material);
    if(parts.length<2)return;
    const positions=[],normals=[],uvs=[],indices=[];
    for(const part of parts){
      part.updateMatrix();const normalMatrix=new T.Matrix3().getNormalMatrix(part.matrix),g=part.geometry,offset=positions.length/3;
      for(let i=0;i<g.attributes.position.count;i++){
        const p=new T.Vector3().fromBufferAttribute(g.attributes.position,i).applyMatrix4(part.matrix);
        const n=new T.Vector3().fromBufferAttribute(g.attributes.normal,i).applyMatrix3(normalMatrix).normalize();
        positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);
        const uv=g.attributes.uv;uvs.push(uv?uv.getX(i):0,uv?uv.getY(i):0);
      }
      if(g.index)for(let i=0;i<g.index.count;i++)indices.push(offset+g.index.getX(i));
      else for(let i=0;i<g.attributes.position.count;i++)indices.push(offset+i);
      parent.remove(part);g.dispose();
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);
    const combined=mesh(g,material,parent);combined.castShadow=parts.some(p=>p.castShadow);return combined;
  }

  // Voronoi hide: polygonal, irregular chestnut islands separated by pale reticulations.
  function hideTexture() {
    const c = document.createElement('canvas'); c.width=c.height=1024;
    const ctx=c.getContext('2d'); ctx.fillStyle='#d2b57c'; ctx.fillRect(0,0,1024,1024);
    const sites=[];
    for(let y=-1;y<=7;y++) for(let x=-1;x<=7;x++) sites.push({x:(x+.5+range(-.27,.27))/7*1024,y:(y+.5+range(-.27,.27))/7*1024,t:rand()});
    for(const p of sites) {
      let polygon=[[p.x-220,p.y-220],[p.x+220,p.y-220],[p.x+220,p.y+220],[p.x-220,p.y+220]];
      for(const q of sites) {
        if(p===q || Math.abs(q.x-p.x)>360 || Math.abs(q.y-p.y)>360) continue;
        const dx=q.x-p.x, dy=q.y-p.y, edge=(q.x*q.x+q.y*q.y-p.x*p.x-p.y*p.y)/2;
        const clipped=[];
        for(let j=0;j<polygon.length;j++) {
          const a=polygon[j], b=polygon[(j+1)%polygon.length];
          const da=a[0]*dx+a[1]*dy-edge, db=b[0]*dx+b[1]*dy-edge;
          if(da<=0) clipped.push(a);
          if((da<=0)!==(db<=0)) { const t=da/(da-db); clipped.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]); }
        }
        polygon=clipped; if(!polygon.length) break;
      }
      if(polygon.length<3) continue;
      const inset=range(.88,.94);
      polygon=polygon.map(a=>[p.x+(a[0]-p.x)*inset,p.y+(a[1]-p.y)*inset]);
      ctx.beginPath();
      for(let i=0;i<polygon.length;i++) {
        const prev=polygon[(i+polygon.length-1)%polygon.length],a=polygon[i],next=polygon[(i+1)%polygon.length];
        const before=[a[0]+(prev[0]-a[0])*.13,a[1]+(prev[1]-a[1])*.13];
        const after=[a[0]+(next[0]-a[0])*.13,a[1]+(next[1]-a[1])*.13];
        if(!i)ctx.moveTo(...before);else ctx.lineTo(...before);
        ctx.quadraticCurveTo(...a,...after);
      }
      ctx.closePath();
      const grad=ctx.createRadialGradient(p.x-20,p.y-20,5,p.x,p.y,110);
      const h=range(23,30), l=range(29,40);
      grad.addColorStop(0,`hsl(${h},39%,${l+4}%)`);grad.addColorStop(1,`hsl(${h},42%,${l}%)`);
      ctx.fillStyle=grad; ctx.fill();
    }
    // Fine, directional hairs avoid an unrealistically smooth, plastic hide.
    for(let i=0;i<65000;i++) {
      const x=rand()*1024,y=rand()*1024;
      ctx.strokeStyle=rand()>.5?'rgba(255,225,174,.065)':'rgba(49,24,10,.06)';
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+range(-.4,.4),y+range(1,3));ctx.stroke();
    }
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
    return tex;
  }
  const hide=hideTexture();
  const skin=new T.MeshStandardMaterial({map:hide,roughness:.92});
  const furCanvas=document.createElement('canvas');furCanvas.width=furCanvas.height=512;
  const fc=furCanvas.getContext('2d'),pixels=fc.createImageData(512,512);
  for(let i=0;i<pixels.data.length;i+=4){const value=110+rand()*36;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=255;}
  fc.putImageData(pixels,0,0);
  for(let i=0;i<16000;i++){fc.strokeStyle=rand()>.5?'#aaa':'#666';const x=rand()*512,y=rand()*512;fc.beginPath();fc.moveTo(x,y);fc.lineTo(x+range(-.3,.3),y+range(1,3));fc.stroke();}
  const fur=new T.CanvasTexture(furCanvas);fur.wrapS=fur.wrapT=T.RepeatWrapping;fur.repeat.set(3,3);
  skin.bumpMap=fur;skin.bumpScale=.003;
  const jointSkin=skin.clone();jointSkin.map=hide.clone();jointSkin.map.repeat.set(.13,.13);jointSkin.map.offset.set(.28,.44);
  function fadedHide(low, high, color) {
    const material=skin.clone(),c=new T.Color(color);
    material.onBeforeCompile=shader=>{
      shader.vertexShader='varying float vSkinY;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSkinY = position.y;');
      shader.fragmentShader='varying float vSkinY;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(${c.r.toFixed(5)},${c.g.toFixed(5)},${c.b.toFixed(5)}), 1.0 - smoothstep(${low.toFixed(3)},${high.toFixed(3)},vSkinY));`);
    };
    material.customProgramCacheKey=()=>`faded-hide-${low}-${high}-${color}`;
    return material;
  }
  const bellySkin=fadedHide(2.40,2.68,'#c9b784');
  const lowerSkin=fadedHide(-1.07,-.55,'#cbb68b');
  const pale=mat('#c8ac70');
  const dark=mat('#3e3022');
  const horn=mat('#8b6339');
  const noseMat=mat('#736044',.97);
  const eyeMat=mat('#151511',.13);
  const eyeRim=mat('#503a23');
  const shineMat=new T.MeshBasicMaterial({color:'#e2d6ae'});

  // Smooth elliptical lofts, with physical-size UVs rather than stretched sphere maps.
  function loft(parent, points, radii, material=skin, {segments=32,sides=24,patchScale=2.2}={}) {
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
    const pos=[],uv=[],indices=[];
    const length=curve.getLength();
    for(let i=0;i<=segments;i++) {
      const t=i/segments, p=curve.getPoint(t), tangent=curve.getTangent(t).normalize();
      const n=tangent.clone().cross(V(0,0,1)).normalize(), b=tangent.clone().cross(n).normalize();
      const q=t*(radii.length-1), index=Math.min(radii.length-2,Math.floor(q)), f=q-index, s=f*f*(3-2*f);
      const a=radii[index][0]*(1-s)+radii[index+1][0]*s;
      const r=radii[index][1]*(1-s)+radii[index+1][1]*s;
      for(let j=0;j<=sides;j++) {
        const angle=j/sides*Math.PI*2;
        const v=p.clone().addScaledVector(n,Math.cos(angle)*a).addScaledVector(b,Math.sin(angle)*r);
        pos.push(v.x,v.y,v.z);uv.push(j/sides*Math.PI*2*(a+r)/2/patchScale,t*length/patchScale);
        if(i<segments && j<sides) {const k=i*(sides+1)+j;indices.push(k,k+1,k+sides+1,k+1,k+sides+2,k+sides+1);}
      }
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
    return mesh(g,material,parent);
  }

  const giraffe=new T.Group();scene.add(giraffe);
  const body=new T.Group();giraffe.add(body);
  // The chest sits higher than the rump; the silhouette has withers and a sloping back.
  const torso=loft(body,[[-1.47,2.77,0],[-1.21,2.92,0],[-.6,2.99,0],[.12,3.08,0],[.72,3.15,0],[1.12,3.12,0],[1.32,3.1,0]],
    [[.02,.02],[.48,.38],[.65,.52],[.69,.53],[.65,.48],[.41,.34],[.02,.02]],bellySkin,{segments:52,sides:40});
  // Powerful neck: broad base, narrowing gradually into the poll.
  const neckGroup=new T.Group();body.add(neckGroup);
  loft(neckGroup,[[.62,3.29,0],[.91,3.72,0],[1.12,4.26,0],[1.29,4.83,0],[1.45,5.36,0],[1.65,5.79,0]],
    [[.46,.39],[.36,.29],[.29,.24],[.245,.20],[.21,.175],[.19,.16]],skin,{segments:55,sides:32,patchScale:2.05});
  // Soft throat transition and brisket.
  loft(body,[[1.09,2.63,0],[1.23,2.96,0],[1.18,3.39,0],[1.37,3.95,0]],[[.015,.01],[.19,.24],[.21,.25],[.025,.025]],skin,{segments:28});
  // A short, dark mane runs down the posterior edge of the neck.
  const maneMaterial=mat('#58412a');
  const maneCurve=new T.CatmullRomCurve3([V(.19,3.42,0),V(.6,3.85,0),V(.83,4.45,0),V(1.05,5.08,0),V(1.43,5.83,0)]);
  for(let i=0;i<500;i++) {
    const t=i/499, p=maneCurve.getPoint(t), len=range(.045,.10);
    rod(neckGroup,[p.x,p.y,p.z+range(-.028,.028)],[p.x-len,p.y+range(.01,.025),p.z+range(-.03,.03)],.003,.0007,maneMaterial,4);
  }
  mergeStatic(neckGroup,maneMaterial);

  const head=new T.Group();head.position.set(1.62,5.74,0);neckGroup.add(head);
  loft(head,[[-.11,.03,0],[.04,.14,0],[.28,.095,0],[.55,-.03,0],[.79,-.13,0],[.91,-.15,0]],
    [[.14,.135],[.25,.19],[.215,.18],[.15,.14],[.14,.135],[.03,.06]],skin,{segments:38,sides:32,patchScale:1.85});
  // Lower jaw and articulated-looking lips.
  loft(head,[[.08,-.09,0],[.31,-.115,0],[.57,-.19,0],[.81,-.205,0]],[[.05,.11],[.065,.12],[.038,.106],[.022,.07]],pale,{segments:24});
  const muzzle=ellipsoid(head,noseMat,[.81,-.132,0],[.18,.122,.151]);muzzle.rotation.z=-.17;
  const eyes=[],highlights=[];
  for(const side of [-1,1]) {
    const nostril=ellipsoid(head,dark,[.865,-.084,side*.112],[.053,.024,.013],20);nostril.rotation.z=.35;
    ellipsoid(head,eyeRim,[.16,.135,side*.177],[.079,.067,.034],24);
    eyes.push(ellipsoid(head,eyeMat,[.172,.148,side*.202],[.051,.043,.017],24));
    highlights.push(ellipsoid(head,shineMat,[.183,.161,side*.218],[.007,.008,.002],12));
    // Upper eyelashes, prominent on real giraffes.
    for(let j=0;j<8;j++) {
      const a=j/7*Math.PI;
      const x=.17+Math.cos(a)*.053, y=.15+Math.sin(a)*.043;
      rod(head,[x,y,side*.215],[x-.012,y+.019,side*.242],.0015,.0005,dark,4);
    }
    rod(head,[.66,-.226,side*.126],[.92,-.207,side*.086],.003,.002,dark,8);
    // Skin-covered ossicones, with velvety dark tips.
    loft(head,[[.015,.28,side*.115],[.012,.41,side*.127],[-.015,.59,side*.141]],[[.051,.048],[.037,.036],[.043,.041]],skin,{segments:14,sides:16,patchScale:1.8});
    ellipsoid(head,dark,[-.018,.595,side*.143],[.049,.044,.047],16);
    for(let j=0;j<17;j++) rod(head,[-.018+range(-.035,.035),.61,side*.143+range(-.025,.025)],[-.018+range(-.043,.043),range(.63,.66),side*.143+range(-.032,.032)],.003,.001,dark,4);
  }
  ellipsoid(head,horn,[.29,.262,0],[.074,.037,.068],24);
  mergeStatic(head,dark);

  // Leaf-shaped ears: shaped rims, concave interiors, and a central fold.
  const ears=[];
  for(const side of [-1,1]) {
    const ear=new T.Group();ear.position.set(-.065,.195,side*.165);head.add(ear);ears.push(ear);
    ear.rotation.x=-side*.75;ear.rotation.y=side*-.12;
    const positions=[],uv=[],idx=[];
    const rings=16,cols=12;
    for(let i=0;i<=rings;i++) {
      const t=i/rings, width=Math.pow(Math.sin(Math.PI*t),.85)*.127;
      for(let j=0;j<=cols;j++) {
        const v=j/cols*2-1;
        positions.push(-.04-t*.11+v*width,.018+t*.15+(1-v*v)*.037*Math.sin(Math.PI*t),side*(t*.38));
        uv.push(j/cols*.22,t*.35);
        if(i<rings&&j<cols){const k=i*(cols+1)+j;idx.push(k,k+1,k+cols+1,k+1,k+cols+2,k+cols+1);}
      }
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    const earSkin=skin.clone();earSkin.side=T.DoubleSide;mesh(g,earSkin,ear);
    const inner=g.clone();const attr=inner.attributes.position;
    for(let i=0;i<attr.count;i++){attr.setX(i,attr.getX(i)*.72-.017);attr.setY(i,attr.getY(i)-.009);attr.setZ(i,attr.getZ(i)*.88+side*.018);}inner.computeVertexNormals();
    const innerMat=mat('#b89d70');innerMat.side=T.DoubleSide;mesh(inner,innerMat,ear);
    rod(ear,[-.045,.04,side*.015],[-.12,.15,side*.31],.012,.002,pale,8);
  }

  // Leg segments are articulated with analytic inverse kinematics. Feet remain
  // on the earth through the stance portion, lift and advance during swing.
  const legs=[];
  function makeSegment(parent,length,top,bottom,bulge,material=skin) {
    const g=new T.Group();parent.add(g);
    loft(g,[[0,0,0],[0,-length*.22,0],[0,-length*.6,0],[0,-length,0]],[[top,top*.82],[bulge,bulge*.8],[bottom*1.18,bottom],[bottom,bottom*.83]],material,{segments:20,sides:18,patchScale:2.1});
    return g;
  }
  for(const front of [true,false])for(const side of [-1,1]) {
    const x=front?.86:-1.02, z=side*(front?.365:.34);
    const hip=new T.Group();hip.position.set(x,front?3.05:2.98,z);body.add(hip);
    const proximalLen=front?.64:.76;
    const upper=makeSegment(hip,proximalLen,front?.19:.24,front?.11:.12,front?.175:.23);
    const midPivot=new T.Group();midPivot.position.y=-proximalLen;upper.add(midPivot);
    const a=front?1.28:1.24,b=front?1.20:1.24;
    const mid=makeSegment(midPivot,a,.112,.066,front?.095:.092);
    const lowerPivot=new T.Group();lowerPivot.position.y=-a;mid.add(lowerPivot);
    ellipsoid(lowerPivot,jointSkin,[0,.018,0],[.077,.097,.073],20);
    const lower=makeSegment(lowerPivot,b,.067,.052,.062,lowerSkin);
    const foot=new T.Group();foot.position.y=-b;lower.add(foot);
    ellipsoid(foot,pale,[0,.01,0],[.061,.105,.062],20);
    for(const split of [-1,1]) {
      const hoof=ellipsoid(foot,dark,[.025,-.057,split*.035],[.104,.09,.039],20);
      // Flattened hoof soles, while preserving rounded coronary bands.
      const vertices=hoof.geometry.attributes.position;
      for(let i=0;i<vertices.count;i++) vertices.setY(i,Math.max(-.72,vertices.getY(i)));
      vertices.needsUpdate=true;hoof.geometry.computeVertexNormals();
    }
    legs.push({front,side,x,z,hip,upper,mid,lower,foot,proximalLen,a,b,phase:(side===1?0:.5)+(front?0:.11)});
  }

  const tail=new T.Group();tail.position.set(-1.33,2.98,0);body.add(tail);
  loft(tail,[[0,0,0],[-.16,-.24,0],[-.24,-.68,0],[-.28,-1.04,0]],[[.073,.061],[.047,.042],[.029,.025],[.023,.02]],skin,{segments:25,sides:14});
  const tailTuft=loft(tail,[[-.28,-.95,0],[-.32,-1.14,0],[-.34,-1.36,0]],[ [.038,.035],[.078,.068],[.002,.002]],dark,{segments:20,sides:18});
  for(let i=0;i<45;i++) rod(tail,[-.3+range(-.025,.025),-1.06,range(-.025,.025)],[-.34+range(-.045,.045),range(-1.34,-1.45),range(-.04,.04)],.004,.001,dark,4);
  mergeStatic(tail,dark);

  // Ground color variation, grains, and wind-combed dry grass, all generated here.
  const groundCanvas=document.createElement('canvas');groundCanvas.width=groundCanvas.height=1024;
  const gc=groundCanvas.getContext('2d');gc.fillStyle='#a69e70';gc.fillRect(0,0,1024,1024);
  for(let i=0;i<2300;i++) {
    const x=rand()*1024,y=rand()*1024,r=range(3,65);
    const gradient=gc.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,rand()>.45?'rgba(116,107,63,.08)':'rgba(215,196,139,.11)');gradient.addColorStop(1,'rgba(160,153,108,0)');
    gc.fillStyle=gradient;gc.fillRect(x-r,y-r,r*2,r*2);
  }
  for(let i=0;i<36000;i++){const x=rand()*1024,y=rand()*1024;gc.fillStyle=rand()>.5?'rgba(230,211,159,.13)':'rgba(76,71,43,.13)';gc.fillRect(x,y,range(.5,2),range(.5,1.5));}
  const groundTex=new T.CanvasTexture(groundCanvas);groundTex.colorSpace=T.SRGBColorSpace;groundTex.wrapS=groundTex.wrapT=T.RepeatWrapping;groundTex.repeat.set(14,14);groundTex.anisotropy=8;
  const earth=mesh(new T.PlaneGeometry(240,240),new T.MeshStandardMaterial({map:groundTex,roughness:1}));earth.rotation.x=-Math.PI/2;earth.position.y=-.015;earth.castShadow=false;

  // A subtle contact shadow supports the directional cast shadow without floating feet.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
  const sc=shadowCanvas.getContext('2d'),sg=sc.createRadialGradient(64,64,5,64,64,64);
  sg.addColorStop(0,'rgba(39,33,18,.23)');sg.addColorStop(.5,'rgba(39,33,18,.12)');sg.addColorStop(1,'rgba(39,33,18,0)');sc.fillStyle=sg;sc.fillRect(0,0,128,128);
  const contact=new T.Mesh(new T.PlaneGeometry(4.3,2),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));contact.rotation.x=-Math.PI/2;contact.position.set(0,.008,0);scene.add(contact);

  const grassMat=new T.MeshStandardMaterial({color:'#b2a46a',roughness:1,side:T.DoubleSide});
  const grassGeometry=new T.BufferGeometry();
  const gp=[],gi=[];
  for(let blade=0;blade<7;blade++){
    const a=range(0,Math.PI*2),x=range(-.07,.07),z=range(-.07,.07),h=range(.13,.42),w=range(.008,.018),lean=range(.025,.12),k=gp.length/3;
    gp.push(x-Math.cos(a)*w,0,z-Math.sin(a)*w,x+Math.cos(a)*w,0,z+Math.sin(a)*w,x+Math.cos(a)*lean,h,z+Math.sin(a)*lean);
    gi.push(k,k+1,k+2);
  }
  grassGeometry.setAttribute('position',new T.Float32BufferAttribute(gp,3));grassGeometry.setIndex(gi);grassGeometry.computeVertexNormals();
  const grassCount=4600,grass=new T.InstancedMesh(grassGeometry,grassMat,grassCount);grass.receiveShadow=true;scene.add(grass);
  const grassData=[],dummy=new T.Object3D(), color=new T.Color();
  for(let i=0;i<grassCount;i++){
    let x=range(-55,55),z=range(-38,48);const s=range(.5,1.7);
    // A relatively open path under the animal keeps its hooves readable.
    if(Math.abs(z)<1.3 && Math.abs(x)<8) z+=z>0?1.3:-1.3;
    grassData.push({x,z,s,r:range(0,Math.PI*2)});
    color.setHSL(range(.12,.17),range(.2,.35),range(.32,.52));grass.setColorAt(i,color);
  }
  function positionGrass(distance,time){
    for(let i=0;i<grassCount;i++){
      const d=grassData[i];dummy.position.set(((d.x-distance+55)%110+110)%110-55,0,d.z);
      dummy.rotation.set(0,d.r,.045*Math.sin(time*.8+d.x*.4));dummy.scale.set(d.s,d.s,d.s);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);
    }
    grass.instanceMatrix.needsUpdate=true;
  }

  // Alpha-cut leaf sprays give the acacias fine, irregular silhouettes.
  const leafCanvas=document.createElement('canvas');leafCanvas.width=256;leafCanvas.height=128;
  const lc=leafCanvas.getContext('2d');
  for(let i=0;i<1900;i++){
    const x=range(0,256),y=range(0,128),nx=(x-128)/128,ny=(y-64)/64;
    if(nx*nx+ny*ny>range(.52,1.12))continue;
    const v=Math.floor(range(160,255));lc.fillStyle=`rgb(${v},${v},${v})`;lc.beginPath();lc.ellipse(x,y,range(1.5,3.7),range(.7,1.5),rand()*Math.PI,0,Math.PI*2);lc.fill();
  }
  const leafTexture=new T.CanvasTexture(leafCanvas);leafTexture.colorSpace=T.SRGBColorSpace;
  const bark=mat('#655e43'),leaf=new T.MeshStandardMaterial({color:'#89925b',map:leafTexture,alphaTest:.45,side:T.DoubleSide,roughness:1}),leafLight=leaf.clone();leafLight.color.set('#a2a06c');
  const treeData=[];
  function acacia(x,z,size) {
    const tree=new T.Group();tree.position.set(x,0,z);tree.scale.setScalar(size);scene.add(tree);
    rod(tree,[0,0,0],[.17,2.4,0],.16,.078,bark);
    rod(tree,[.17,1.3,0],[-.72,2.85,.2],.095,.04,bark);
    rod(tree,[.14,1.85,0],[1,2.93,-.3],.08,.035,bark);
    rod(tree,[-.6,2.55,.16],[-1.3,2.87,-.3],.048,.018,bark);
    for(let i=0;i<26;i++) {
      const a=rand()*Math.PI*2,r=Math.sqrt(rand())*1.65;
      const px=Math.cos(a)*r, pz=Math.sin(a)*r*.68,py=3.0+.24*(1-r/1.7)+range(-.12,.12);
      rod(tree,[.17,2.36,0],[px,py,pz],.024,.008,bark,6);
      for(let layer=0;layer<3;layer++){
        const foliage=mesh(new T.PlaneGeometry(range(.8,1.35),range(.34,.49)),i%3?leaf:leafLight,tree);
        foliage.position.set(px,py+range(-.06,.06),pz);foliage.rotation.set(range(-.5,.5),layer*Math.PI/3+range(-.2,.2),range(-.12,.12));foliage.castShadow=false;
      }
    }
    mergeStatic(tree,bark);mergeStatic(tree,leaf);mergeStatic(tree,leafLight);
    treeData.push({tree,x,z});
  }
  acacia(-13,-16,1.8);acacia(15,-23,2.1);acacia(31,-32,1.6);acacia(-34,-29,1.7);acacia(-6,-43,1.25);acacia(48,-49,1.6);acacia(-53,-54,2.3);
  acacia(-23,34,1.8);acacia(19,41,1.65);acacia(43,29,1.3);acacia(-44,21,1.35);
  // Low hazy ridges form a horizon with no visible edge to the ground plane.
  const ridgeMat=mat('#a1a388');
  for(let i=0;i<13;i++){
    const r=ellipsoid(scene,ridgeMat,[-108+i*18,-1.7,-85],[range(12,22),range(3,7),range(8,15)],16);r.castShadow=false;
  }
  for(let i=0;i<12;i++){
    const a=i/12*Math.PI*2;
    const r=ellipsoid(scene,ridgeMat,[Math.cos(a)*96,-2.3,Math.sin(a)*96],[range(11,21),range(3,6),range(10,18)],12);r.castShadow=false;
  }
  const stoneMat=mat('#8b8565');
  const stones=[];
  for(let i=0;i<45;i++){
    const stone=ellipsoid(scene,stoneMat,[range(-30,30),.025,range(-15,24)],[range(.06,.17),range(.025,.07),range(.06,.14)],8);stone.rotation.y=rand()*6.28;stone.castShadow=false;stones.push({stone,x:stone.position.x});
  }

  // Orbit controls implemented without module imports so file:// works everywhere.
  const target=V(0,2.85,0);
  const orbit={theta:1.15,phi:1.38,radius:14.9,target:target.clone()};
  const desired={theta:1.15,phi:1.38,radius:14.9,target:target.clone()};
  const views={portrait:{theta:1.15,phi:1.38,radius:14.9,target:[.0,2.85,0]},profile:{theta:Math.PI/2,phi:1.48,radius:13.8,target:[.35,2.9,0]},detail:{theta:.92,phi:1.43,radius:5.3,target:[1.65,5.55,0]}};
  let selectedView='portrait';
  function setView(name){
    selectedView=name;Object.assign(desired,{theta:views[name].theta,phi:views[name].phi,radius:views[name].radius});desired.target.set(...views[name].target);
    document.querySelectorAll('[data-view]').forEach(button=>{const active=button.dataset.view===name;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active);});
    if(innerWidth<600&&name!=='detail'){desired.radius=20;desired.target.x=.62;}
  }
  function updateCamera(dt){
    const lerp=1-Math.exp(-dt*5);
    orbit.theta+= (desired.theta-orbit.theta)*lerp;orbit.phi+=(desired.phi-orbit.phi)*lerp;orbit.radius+=(desired.radius-orbit.radius)*lerp;orbit.target.lerp(desired.target,lerp);
    // Bias the full-body views right to leave the editorial title unobstructed.
    const mobile=innerWidth<600;
    camera.setViewOffset(innerWidth,innerHeight,selectedView==='detail'||mobile?0:-innerWidth*.105,mobile?-innerHeight*.035:0,innerWidth,innerHeight);
    camera.position.set(orbit.target.x+orbit.radius*Math.sin(orbit.phi)*Math.cos(orbit.theta),orbit.target.y+orbit.radius*Math.cos(orbit.phi),orbit.target.z+orbit.radius*Math.sin(orbit.phi)*Math.sin(orbit.theta));
    camera.lookAt(orbit.target);
  }
  const pointers=new Map();let previousPinch=0;
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.style.cursor='grabbing';});
  canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    const last=pointers.get(e.pointerId);const dx=e.clientX-last.x,dy=e.clientY-last.y;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2){const [a,b]=[...pointers.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);if(previousPinch)desired.radius=T.MathUtils.clamp(desired.radius*previousPinch/d,3.1,28);previousPinch=d;}
    else {desired.theta-=dx*.006;desired.phi=T.MathUtils.clamp(desired.phi-dy*.005,.35,1.73);}
  });
  function release(e){pointers.delete(e.pointerId);previousPinch=0;if(!pointers.size)canvas.style.cursor='grab';}
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.style.cursor='grab';
  canvas.addEventListener('wheel',e=>{e.preventDefault();desired.radius=T.MathUtils.clamp(desired.radius*Math.exp(e.deltaY*.001),3.1,28);},{passive:false});
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  document.getElementById('reset').addEventListener('click',()=>setView('portrait'));
  let paused=matchMedia('(prefers-reduced-motion: reduce)').matches,speed=1,golden=true;
  function updatePlay(){document.getElementById('pause-icon').hidden=paused;document.getElementById('play-icon').hidden=!paused;document.getElementById('play').setAttribute('aria-label',paused?'Resume walking':'Pause walking');document.getElementById('scene-state').textContent=paused?'AT REST':'WALKING';document.querySelector('.live-dot').style.opacity=paused?'.4':'1';}
  document.getElementById('play').addEventListener('click',()=>{paused=!paused;updatePlay();});updatePlay();
  document.getElementById('speed').addEventListener('input',e=>{speed=Number(e.target.value);document.getElementById('speed-value').textContent=speed.toFixed(2).replace(/0$/,'')+'×';});
  document.getElementById('light').addEventListener('click',()=>{
    golden=!golden;sun.color.set(golden?'#ffdea3':'#fff5e3');sun.intensity=golden?3.6:3.15;hemi.intensity=golden?2.2:2.7;
    scene.background.set(golden?'#dedac5':'#d9e3df');scene.fog.color.copy(scene.background);
    document.getElementById('light-label').textContent=golden?'Golden hour':'Daylight';document.getElementById('light').setAttribute('aria-label',golden?'Switch to daylight':'Switch to golden hour');
  });
  window.addEventListener('keydown',e=>{
    if(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON'||e.target.tagName==='A')return;
    if(e.code==='Space'){e.preventDefault();paused=!paused;updatePlay();}
    if(e.key.toLowerCase()==='r')setView('portrait');
    if(e.key==='1')setView('portrait');if(e.key==='2')setView('profile');if(e.key==='3')setView('detail');
    if(e.key==='ArrowLeft'){desired.theta+=.12;e.preventDefault();}if(e.key==='ArrowRight'){desired.theta-=.12;e.preventDefault();}
    if(e.key==='ArrowUp'){desired.phi=Math.max(.35,desired.phi-.08);e.preventDefault();}if(e.key==='ArrowDown'){desired.phi=Math.min(1.73,desired.phi+.08);e.preventDefault();}
    if(e.key==='+'||e.key==='=')desired.radius=Math.max(3.1,desired.radius*.9);if(e.key==='-')desired.radius=Math.min(28,desired.radius*1.1);
  });
  function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);if(selectedView!=='detail'){desired.radius=innerWidth<600?20:views[selectedView].radius;desired.target.x=innerWidth<600?.62:views[selectedView].target[0];}}
  window.addEventListener('resize',resize);resize();

  let time=0,distance=0,last=performance.now(),frame=0;
  const cycleDuration=1.65,stance=.68,stride=1.30;
  function animateAnimal(t){
    const phase=t/cycleDuration;
    const bob=.035*Math.cos(phase*Math.PI*4), sway=.035*Math.sin(phase*Math.PI*2);
    body.position.y=bob;body.rotation.x=sway*.32;body.rotation.z=.008*Math.sin(phase*Math.PI*4);
    const breathing=1+.0035*Math.sin(t*1.6);torso.scale.y=breathing;torso.position.y=3*(1-breathing);
    neckGroup.rotation.z=.012*Math.sin(phase*Math.PI*2-.7);
    head.rotation.z=-.025+.022*Math.sin(phase*Math.PI*2-.9);
    head.rotation.y=.045*Math.sin(t*.43);
    const blinkPhase=(t+2.8)%6.7,blink=blinkPhase<.22?Math.sin(blinkPhase/.22*Math.PI):0;
    for(let i=0;i<eyes.length;i++){eyes[i].scale.y=.043*(1-blink*.94);highlights[i].visible=blink<.35;}
    ears[0].rotation.x=.75+.04*Math.sin(t*1.4);ears[1].rotation.x=-.75+.04*Math.sin(t*1.1+1);
    tail.rotation.x=.22*Math.sin(t*1.9);tail.rotation.z=.12+.14*Math.sin(t*1.1+.5);
    for(const leg of legs){
      let p=((phase+leg.phase)%1+1)%1,footX,footY=.13;
      if(p<stance){footX=stride*(.5-p/stance);}else{const s=(p-stance)/(1-stance),q=s*s*(3-2*s);footX=stride*(-.5+q);footY+=.23*Math.pow(Math.sin(Math.PI*s),1.3);}
      // Shoulder-to-elbow slopes backward; hip-to-stifle slopes forward.
      const proximalAngle=leg.front?-.46+.26*footX/(stride*.5):.43+.08*Math.sin(p*Math.PI*2);
      leg.upper.rotation.z=proximalAngle;
      const jointX=leg.x+Math.sin(proximalAngle)*leg.proximalLen;
      const jointY=leg.hip.position.y-Math.cos(proximalAngle)*leg.proximalLen+bob;
      const dx=leg.x+footX-jointX,dy=footY-jointY;
      const d=Math.min(Math.hypot(dx,dy),leg.a+leg.b-.001);
      const alpha=Math.acos(T.MathUtils.clamp((leg.a*leg.a+d*d-leg.b*leg.b)/(2*leg.a*d),-1,1));
      const direction=Math.atan2(dx,-dy);
      // Fore carpus folds forward; hind hock projects backward beneath the stifle.
      const upperAngle=direction+(leg.front?alpha:-alpha);
      const kneeX=jointX+Math.sin(upperAngle)*leg.a,kneeY=jointY-Math.cos(upperAngle)*leg.a;
      const lowerAngle=Math.atan2(leg.x+footX-kneeX,-(footY-kneeY));
      leg.mid.rotation.z=upperAngle-proximalAngle;
      leg.lower.rotation.z=lowerAngle-upperAngle;
      // Hooves stay flat in stance, then gently tip as the foot swings.
      const toe=p<stance?0:-.20*Math.sin((p-stance)/(1-stance)*Math.PI);
      leg.foot.rotation.z=-lowerAngle+toe;
    }
  }
  function tick(now){
    requestAnimationFrame(tick);
    const dt=Math.min((now-last)/1000,.05);last=now;
    if(!paused){time+=dt*speed;distance+=dt*speed*stride/(cycleDuration*stance);}
    animateAnimal(time);
    // Instances need updates only every other rendered frame; motion remains smooth.
    if(frame++%2===0){positionGrass(distance,time);groundTex.offset.x=distance/240*14;for(const data of treeData)data.tree.position.x=((data.x-distance+75)%150+150)%150-75;for(const d of stones)d.stone.position.x=((d.x-distance+35)%70+70)%70-35;}
    updateCamera(dt);renderer.render(scene,camera);
  }
  animateAnimal(0);positionGrass(0,0);updateCamera(1);renderer.render(scene,camera);
  requestAnimationFrame(tick);
  document.getElementById('loading').classList.add('finished');
  // Exposed read-only diagnostic entry point for offline smoke tests.
  window.giraffa={renderer,scene,camera,giraffe,get paused(){return paused;},get time(){return time;},get speed(){return speed;},get feet(){scene.updateMatrixWorld(true);return legs.map(leg=>({front:leg.front,side:leg.side,position:leg.foot.getWorldPosition(new T.Vector3()).toArray()}));}};
})();
