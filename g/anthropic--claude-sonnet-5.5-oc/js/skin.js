/* Procedural reticulated-giraffe coat, evaluated in 3D rest-pose space (no UVs, no seams). */
(function () {
  const NOISE_GLSL = /* glsl */`
    float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
    vec3 hash33(vec3 p){ p = fract(p*vec3(.1031,.1030,.0973)); p += dot(p, p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
    float vnoise(vec3 x){
      vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
      float a=hash13(i), b=hash13(i+vec3(1,0,0)), c=hash13(i+vec3(0,1,0)), d=hash13(i+vec3(1,1,0));
      float e=hash13(i+vec3(0,0,1)), g=hash13(i+vec3(1,0,1)), h=hash13(i+vec3(0,1,1)), k=hash13(i+vec3(1,1,1));
      return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y), mix(mix(e,g,f.x),mix(h,k,f.x),f.y), f.z);
    }
    float fbm3(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
  `;
  window.NOISE_GLSL = NOISE_GLSL;

  const VERT_PARS = `varying vec3 vRest;`;
  const FRAG_PARS = /* glsl */`
    varying vec3 vRest;
    uniform float uScale;
    uniform vec2  uPatchY;      // y range where the coat fades from cream to patched
    uniform float uHead;
    uniform vec3  uHeadO, uHeadD, uHeadU;
    uniform float uHeadL;
    uniform float uTint;
    ${NOISE_GLSL}

    // returns (F1, F2-F1, cell id hash)
    vec3 voro(vec3 x){
      vec3 n=floor(x), f=fract(x);
      float F1=8.0, F2=8.0; float id=0.0;
      for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
        vec3 g=vec3(float(i),float(j),float(k));
        vec3 o=hash33(n+g);
        vec3 r=g+0.12+0.76*o-f;
        float d=dot(r,r);
        if(d<F1){ F2=F1; F1=d; id=hash13(n+g+17.0); }
        else if(d<F2){ F2=d; }
      }
      F1=sqrt(F1); F2=sqrt(F2);
      return vec3(F1, F2-F1, id);
    }

    vec3 srgb(vec3 c){ return pow(c, vec3(2.2)); }

    struct Coat { vec3 col; float h; float rough; };

    Coat giraffeCoat(vec3 P){
      Coat o;
      float sc = uScale;
      vec3 w = vec3(vnoise(P*3.1), vnoise(P*3.1+7.1), vnoise(P*3.1+13.7)) - 0.5;
      vec3 q = P*sc + w*0.55;
      vec3 v = voro(q);
      float pm = smoothstep(uPatchY.x, uPatchY.y, P.y);
      float lineW = mix(0.42, 0.075, pm);
      if(uHead>0.5){
        vec3 rel = P-uHeadO;
        float t = dot(rel,uHeadD)/uHeadL;
        float up = dot(rel,uHeadU);
        float under = smoothstep(-0.02,-0.10, up);
        lineW = mix(0.08, 0.35, under);
        lineW = mix(lineW, 0.45, smoothstep(0.55,0.9,t));
      }
      float edge = smoothstep(lineW, lineW+0.07, v.y);
      float tone = hash13(vec3(v.z*91.7, 3.3, 1.1));
      vec3 cDark   = srgb(vec3(0.25,0.10,0.045));
      vec3 cMid    = srgb(vec3(0.47,0.21,0.075));
      vec3 cLight  = srgb(vec3(0.66,0.36,0.14));
      vec3 pcol = mix(cMid, cDark, smoothstep(0.35,1.0,tone)*0.9);
      pcol = mix(pcol, cLight, smoothstep(0.55,0.0,tone)*0.8);
      pcol *= mix(1.0, 0.72, smoothstep(0.15,0.9,v.x));   // darker cores
      pcol *= 0.88 + 0.24*vnoise(P*46.0);                 // coat hair mottling
      vec3 cream = srgb(vec3(0.90,0.80,0.60));
      cream *= 0.93 + 0.14*vnoise(P*38.0+3.0);
      float lowFade = smoothstep(0.30,0.0,P.y);            // hooves & fetlocks
      vec3 col = mix(cream, pcol, edge);
      if(uHead>0.5){
        vec3 rel = P-uHeadO;
        float t = dot(rel,uHeadD)/uHeadL;
        float lat = abs(rel.x);
        float stripe = exp(-pow(lat/0.045,2.0))*smoothstep(0.1,0.3,t)*smoothstep(0.98,0.8,t);
        col = mix(col, srgb(vec3(0.20,0.09,0.045)), stripe*0.85*(1.0-smoothstep(-0.02,-0.08,dot(rel,uHeadU))));
        float mz = smoothstep(0.80,0.93,t);
        col = mix(col, srgb(vec3(0.20,0.165,0.15))*(0.8+0.4*vnoise(P*90.0)), mz);
      }
      o.col = col * uTint;
      o.rough = mix(0.6, 0.88, edge);
      o.h = -0.0035*(1.0-edge) + 0.0006*vnoise(P*210.0);
      return o;
    }

    vec3 perturbNormalGU( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
      vec3 vSigmaX = dFdx( surf_pos.xyz );
      vec3 vSigmaY = dFdy( surf_pos.xyz );
      vec3 vN = surf_norm;
      vec3 R1 = cross( vSigmaY, vN );
      vec3 R2 = cross( vN, vSigmaX );
      float fDet = dot( vSigmaX, R1 ) * faceDirection;
      vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
      return normalize( abs( fDet ) * surf_norm - vGrad );
    }
  `;

  function makeSkin(opts) {
    opts = opts || {};
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.8, metalness: 0.0,
      sheen: 0.6, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffe2b8),
    });
    const u = {
      uScale: { value: opts.scale || 3.6 },
      uPatchY: { value: new THREE.Vector2(opts.fadeLo === undefined ? 1.0 : opts.fadeLo, opts.fadeHi === undefined ? 1.9 : opts.fadeHi) },
      uHead: { value: opts.head ? 1 : 0 },
      uHeadO: { value: opts.headO || new THREE.Vector3() },
      uHeadD: { value: opts.headD || new THREE.Vector3(0, 0, 1) },
      uHeadU: { value: opts.headU || new THREE.Vector3(0, 1, 0) },
      uHeadL: { value: opts.headL || 1 },
      uTint: { value: opts.tint || 1 },
    };
    mat.userData.uniforms = u;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_PARS)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vRest = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
        .replace('#include <map_fragment>', `
          Coat coat = giraffeCoat(vRest);
          diffuseColor.rgb *= coat.col;
        `)
        .replace('#include <roughnessmap_fragment>', `
          #include <roughnessmap_fragment>
          roughnessFactor = coat.rough;
        `)
        .replace('#include <normal_fragment_maps>', `
          #include <normal_fragment_maps>
          {
            float fade = 1.0 - smoothstep(3.0, 11.0, length(vViewPosition));
            vec2 dH = vec2(dFdx(coat.h), dFdy(coat.h)) * fade;
            normal = perturbNormalGU(-vViewPosition, normal, dH, faceDirection);
          }
        `);
    };
    mat.customProgramCacheKey = () => 'giraffeskin';
    return mat;
  }
  window.makeSkin = makeSkin;
})();
