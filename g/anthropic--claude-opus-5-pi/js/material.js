/* Giraffe coat material: 3D-procedural reticulated patch pattern + fur micro-normals.
   Implemented by injecting GLSL into MeshStandardMaterial so the pattern is
   seamless across all body parts (no UV atlas needed) and follows the bind pose. */
(function (global) {
  'use strict';
  var THREE = global.THREE;

  var COMMON = [
    'varying vec3 vBindPos;',
    'varying float vPat;',
    'varying float vFur;',
    'uniform float uCell;',
    'uniform vec3  uPatchA;',
    'uniform vec3  uPatchB;',
    'uniform vec3  uCream;',
    'uniform float uEdge;',
    'uniform float uTime;',
    '',
    'vec3 hash33(vec3 p){',
    '  p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));',
    '  return fract(sin(p)*43758.5453123);',
    '}',
    'float hash13(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453123); }',
    '',
    'float vnoise(vec3 x){',
    '  vec3 i = floor(x); vec3 f = fract(x);',
    '  f = f*f*(3.0-2.0*f);',
    '  float n000=hash13(i+vec3(0,0,0)), n100=hash13(i+vec3(1,0,0));',
    '  float n010=hash13(i+vec3(0,1,0)), n110=hash13(i+vec3(1,1,0));',
    '  float n001=hash13(i+vec3(0,0,1)), n101=hash13(i+vec3(1,0,1));',
    '  float n011=hash13(i+vec3(0,1,1)), n111=hash13(i+vec3(1,1,1));',
    '  float nx00=mix(n000,n100,f.x), nx10=mix(n010,n110,f.x);',
    '  float nx01=mix(n001,n101,f.x), nx11=mix(n011,n111,f.x);',
    '  return mix(mix(nx00,nx10,f.y), mix(nx01,nx11,f.y), f.z);',
    '}',
    'float fbm3(vec3 p){',
    '  float s=0.0, a=0.5;',
    '  for(int i=0;i<4;i++){ s += a*vnoise(p); p*=2.03; a*=0.5; }',
    '  return s;',
    '}',
    '',
    '// Worley: returns (F1, F2, cellRandom)',
    'vec3 worley(vec3 p){',
    '  vec3 ip = floor(p); vec3 fp = fract(p);',
    '  float f1 = 8.0, f2 = 8.0; vec3 id = vec3(0.0);',
    '  for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){',
    '    vec3 g = vec3(float(i),float(j),float(k));',
    '    vec3 o = hash33(ip+g);',
    '    vec3 r = g + o - fp;',
    '    float d = dot(r,r);',
    '    if(d < f1){ f2 = f1; f1 = d; id = ip+g; }',
    '    else if(d < f2){ f2 = d; }',
    '  }',
    '  return vec3(sqrt(f1), sqrt(f2), hash13(id*1.37+3.1));',
    '}',
    '',
    '// Patch field: 1 inside a dark patch, 0 in the cream seam',
    'float patchField(vec3 bp, out float cellRnd){',
    '  // Patches shrink on the limbs and neck (thin parts of the body) so the',
    '  // reticulation stays in proportion rather than swallowing a whole leg.',
    '  float narrow = 1.0 - 0.42 * smoothstep(2.30, 0.75, bp.y);',
    '  narrow *= 1.0 - 0.18 * smoothstep(3.10, 4.40, bp.y);',
    '  vec3 q = bp * (uCell / narrow);',
    '  // domain warp -> ragged, hand-drawn polygon edges',
    '  vec3 w = vec3(fbm3(bp*7.0), fbm3(bp*7.0+19.3), fbm3(bp*7.0+41.7)) - 0.5;',
    '  q += w * 0.55;',
    '  q += (vec3(fbm3(bp*17.0+5.0), fbm3(bp*17.0+9.0), fbm3(bp*17.0+13.0))-0.5) * 0.18;',
    '  vec3 W = worley(q);',
    '  cellRnd = W.z;',
    '  float border = W.y - W.x;            // 0 at the cell boundary',
    '  float e = uEdge * (0.75 + 0.5*fbm3(bp*9.0+31.0));',
    '  // 1 in the cell interior (the dark patch), 0 in the cream seam',
    '  return smoothstep(e*0.30, e*1.05, border);',
    '}'
  ].join('\n');

  function makeCoatMaterial(opts) {
    opts = opts || {};
    var mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0,      flatShading: false
    });
    mat.userData.uniforms = {
      uCell: { value: opts.cell !== undefined ? opts.cell : 3.45 },
      uPatchA: { value: new THREE.Color(opts.patchA || 0x6d3d1b) },
      uPatchB: { value: new THREE.Color(opts.patchB || 0x9a5c28) },
      uCream: { value: new THREE.Color(opts.cream || 0xdcc69c) },
      uEdge: { value: opts.edge !== undefined ? opts.edge : 0.115 },
      uTime: { value: 0 },
      uFurScale: { value: opts.furScale || 150.0 },
      uFurAmp: { value: opts.furAmp !== undefined ? opts.furAmp : 0.5 }
    };

    mat.onBeforeCompile = function (shader) {
      var U = mat.userData.uniforms;
      for (var k in U) shader.uniforms[k] = U[k];
      shader.uniforms.uFurScale = U.uFurScale;
      shader.uniforms.uFurAmp = U.uFurAmp;

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBindPos;\nvarying float vPat;\nvarying float vFur;\nattribute float aPattern;\nattribute float aFur;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBindPos = position;\nvPat = aPattern;\nvFur = aFur;');

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uFurScale;\nuniform float uFurAmp;\n' + COMMON)
        .replace('#include <map_fragment>', [
          '#include <map_fragment>',
          '{',
          '  float cr;',
          '  float pf = patchField(vBindPos, cr);',
          '  pf *= clamp(vPat, 0.0, 1.0);',
          '  vec3 pcol = mix(uPatchA, uPatchB, cr);',
          '  // subtle intra-patch mottling',
          '  pcol *= 0.86 + 0.28*fbm3(vBindPos*13.0+cr*7.0);',
          '  vec3 cream = uCream * (0.92 + 0.16*fbm3(vBindPos*21.0));',
          '  vec3 coat = mix(cream, pcol, pf);',
          '  // fine hair strands darkening',
          '  float hair = fbm3(vBindPos*vec3(uFurScale*0.55, uFurScale, uFurScale*0.55));',
          '  coat *= 0.90 + 0.20*hair;',
          '  diffuseColor.rgb *= coat;',
          '}'
        ].join('\n'))
        .replace('#include <roughnessmap_fragment>', [
          '#include <roughnessmap_fragment>',
          '{',
          '  float cr2; float pf2 = patchField(vBindPos, cr2) * clamp(vPat,0.0,1.0);',
          '  roughnessFactor = mix(0.95, 0.80, pf2);',
          '  roughnessFactor -= 0.18 * clamp(1.0 - vFur, 0.0, 1.0);',
          '  roughnessFactor = clamp(roughnessFactor, 0.12, 1.0);',
          '}'
        ].join('\n'))
        .replace('#include <normal_fragment_maps>', [
          '#include <normal_fragment_maps>',
          '{',
          '  // procedural fur bump: gradient of a stretched fbm in bind space',
          '  vec3 fp = vBindPos * vec3(uFurScale*0.55, uFurScale, uFurScale*0.55);',
          '  float e = 0.75;',
          '  float h0 = fbm3(fp);',
          '  vec3 grad = vec3(fbm3(fp+vec3(e,0,0))-h0, fbm3(fp+vec3(0,e,0))-h0, fbm3(fp+vec3(0,0,e))-h0);',
          '  float amp = uFurAmp * clamp(vFur,0.0,1.0);',
          '  normal = normalize(normal - grad * amp);',
          '}'
        ].join('\n'));

      mat.userData.shader = shader;
    };
    mat.customProgramCacheKey = function () { return 'giraffeCoat'; };
    return mat;
  }

  // Plain procedural material used for hooves/horn/eyes etc.
  function simple(color, rough, metal) {
    return new THREE.MeshStandardMaterial({
      color: color, roughness: rough === undefined ? 0.7 : rough,
      metalness: metal === undefined ? 0 : metal
    });
  }

  global.Mat = { makeCoatMaterial: makeCoatMaterial, simple: simple };
})(window);
