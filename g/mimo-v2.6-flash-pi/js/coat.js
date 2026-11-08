'use strict';
/*
 * Coat: procedural giraffe pelt.
 * Every part carries an attribute `aSkin` = vec4(restPositionInBodySpace, region)
 * computed in the giraffe's rest pose, so the pattern is seamless across parts
 * and deforms with the skin (it never swims while animating).
 */
const COAT = (() => {

  const DEFAULTS = {
    scale: 0.255,      // patch size in rest-metres
    lineW: 0.072,      // reticulation line width (in cell units)
    dark: 0x6d3a15,
    mid: 0xa25e1d,
    light: 0xc98a3c,
    cream: 0xebe0c4,
    darken: 1.0,       // multiply result (mane uses <1)
    headScale: 0.45,   // patch scale factor on the head region
    headLight: 0.55,   // lightening towards the muzzle
    bellyLight: 0.45,
    legFade: 1.0
  };

  function colToVec(c) {
    const v = new THREE.Color(c);
    // convert to linear space like three does for material colors
    v.convertSRGBToLinear();
    return `vec3(${v.r.toFixed(4)},${v.g.toFixed(4)},${v.b.toFixed(4)})`;
  }

  function make(opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: opts.roughness === undefined ? 0.86 : opts.roughness,
      metalness: 0.0
    });
    mat.userData.coat = true;

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uScale = { value: opts.scale };
      shader.uniforms.uLineW = { value: opts.lineW };
      shader.uniforms.uDark = { value: new THREE.Color(opts.dark).convertSRGBToLinear() };
      shader.uniforms.uMid = { value: new THREE.Color(opts.mid).convertSRGBToLinear() };
      shader.uniforms.uLight = { value: new THREE.Color(opts.light).convertSRGBToLinear() };
      shader.uniforms.uCream = { value: new THREE.Color(opts.cream).convertSRGBToLinear() };
      shader.uniforms.uDarken = { value: opts.darken };
      shader.uniforms.uHeadScale = { value: opts.headScale };
      shader.uniforms.uHeadLight = { value: opts.headLight };
      shader.uniforms.uBelly = { value: opts.bellyLight };
      shader.uniforms.uLegFade = { value: opts.legFade };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>',
          '#include <common>\nattribute vec4 aSkin;\nvarying vec4 vSkin;')
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvSkin = aSkin;');

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec4 vSkin;
uniform float uScale, uLineW, uDarken, uHeadScale, uHeadLight, uBelly, uLegFade;
uniform vec3 uDark, uMid, uLight, uCream;

vec3 hash33(vec3 p){
  p = vec3(dot(p, vec3(127.1, 311.7,  74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float hash13(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
/* worley: f1, f2 distances and the id of the closest cell */
void cellular(vec3 p, out float f1, out float f2, out vec3 id){
  vec3 ip = floor(p), fp = fract(p);
  f1 = 8.0; f2 = 8.0; id = vec3(0.0);
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++){
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 o = hash33(ip + g);
    vec3 r = g + o - fp;
    float d = dot(r, r);
    if (d < f1){ f2 = f1; f1 = d; id = ip + g; }
    else if (d < f2){ f2 = d; }
  }
  f1 = sqrt(f1); f2 = sqrt(f2);
}

/* smooth value noise -> skin folds / fur grain */
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0,0.0,0.0));
  float n100 = hash13(i + vec3(1.0,0.0,0.0));
  float n010 = hash13(i + vec3(0.0,1.0,0.0));
  float n110 = hash13(i + vec3(1.0,1.0,0.0));
  float n001 = hash13(i + vec3(0.0,0.0,1.0));
  float n101 = hash13(i + vec3(1.0,0.0,1.0));
  float n011 = hash13(i + vec3(0.0,1.0,1.0));
  float n111 = hash13(i + vec3(1.0,1.0,1.0));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float skinHeight(vec3 p){
  return vnoise(p * 46.0) * 0.65 + vnoise(p * 160.0) * 0.35;
}
vec3 perturbSkin(vec3 surf_pos, vec3 surf_norm, vec2 dH, float faceDir){
  vec3 sx = dFdx(surf_pos), sy = dFdy(surf_pos);
  vec3 R1 = cross(sy, surf_norm), R2 = cross(surf_norm, sx);
  float fDet = dot(sx, R1) * faceDir;
  vec3 grad = sign(fDet) * (dH.x * R1 + dH.y * R2);
  return normalize(abs(fDet) * surf_norm - grad);
}

vec3 giraffeCoat(vec3 skin, float region){
  vec3 sp = skin;
  float scaleMul = 1.0;
  float lightMix = 0.0;

  if (region > 0.5 && region < 1.5) {
    // head: smaller patches, muzzle gets paler
    scaleMul = uHeadScale;
    lightMix = uHeadLight * smoothstep(2.52, 3.05, sp.x);
  }

  vec3 p = sp / (uScale * scaleMul);
  float f1, f2; vec3 id;
  cellular(p, f1, f2, id);

  vec3 h  = hash33(id + 0.31);
  vec3 h2 = hash33(id + 7.13);

  float edge = f2 - f1;
  float lw = uLineW * (0.75 + 0.75 * h.x);
  float inside = smoothstep(lw * 0.55, lw * 1.15, edge);

  // patch colour: random pick between deep brown / warm brown / tan
  float pick = pow(h.y, 0.72);
  vec3 pc = mix(uDark, uMid, smoothstep(0.0, 0.55, pick));
  pc = mix(pc, uLight, smoothstep(0.62, 1.0, pick));
  // mottling inside a patch
  float mott = hash13(floor(sp * 26.0) + id * 3.0);
  pc *= 0.90 + 0.20 * mott;
  pc = mix(pc, pc * 1.18, h2.z * 0.6);

  vec3 lineCol = uCream * (0.93 + 0.10 * h2.x);
  vec3 col = mix(lineCol, pc, inside);

  // lower legs fade to pale cream (giraffes have whitish shins)
  // shins go pale but keep a ghost of the reticulation, like a real giraffe
  float legFade = smoothstep(1.32, 0.40, sp.y) * uLegFade;
  vec3 pale = mix(uCream * (0.95 + 0.08 * mott), pc * 0.45 + uCream * 0.55, 0.42);
  col = mix(col, pale, legFade * 0.88);

  // belly / chest underside lighter
  float belly = smoothstep(2.42, 2.05, sp.y) * uBelly;
  col = mix(col, mix(col, uCream, 0.55), belly);

  // paler muzzle/face
  col = mix(col, mix(col, uCream, 0.55), lightMix);

  // fine fur grain
  float grain = hash13(sp * 190.0);
  col *= 0.965 + 0.07 * grain;

  return col * uDarken;
}
`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
{
  vec3 sp = vSkin.xyz;
  float h0 = skinHeight(sp);
  vec2 dH = vec2(skinHeight(sp + dFdx(sp)) - h0, skinHeight(sp + dFdy(sp)) - h0);
  normal = perturbSkin(-vViewPosition, normal, dH * 0.0032, faceDirection);
}
`)
        .replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  diffuseColor *= sampledDiffuseColor;
#endif
diffuseColor.rgb *= giraffeCoat(vSkin.xyz, vSkin.w);
`);
    };
    mat.customProgramCacheKey = () => 'coat' + opts.scale + '_' + opts.darken + '_' + opts.headScale;
    return mat;
  }

  /* assign the aSkin attribute (vec4) from an array of rest positions */
  function applySkin(geometry, positions, region) {
    const n = geometry.attributes.position.count;
    const arr = new Float32Array(n * 4);
    if (positions && positions.length === n * 3) {
      for (let i = 0; i < n; i++) {
        arr[i * 4] = positions[i * 3];
        arr[i * 4 + 1] = positions[i * 3 + 1];
        arr[i * 4 + 2] = positions[i * 3 + 2];
        arr[i * 4 + 3] = region;
      }
    } else {
      const p = geometry.attributes.position;
      for (let i = 0; i < n; i++) {
        arr[i * 4] = p.getX(i);
        arr[i * 4 + 1] = p.getY(i);
        arr[i * 4 + 2] = p.getZ(i);
        arr[i * 4 + 3] = region;
      }
    }
    geometry.setAttribute('aSkin', new THREE.BufferAttribute(arr, 4));
    return geometry;
  }

  /* skin = quat * localPos + offset  (for rigid parts authored in local space) */
  function applySkinX(geometry, quat, offset, region) {
    const p = geometry.attributes.position;
    const n = p.count;
    const arr = new Float32Array(n * 4);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(p, i);
      if (quat) v.applyQuaternion(quat);
      if (offset) v.add(offset);
      arr[i * 4] = v.x; arr[i * 4 + 1] = v.y; arr[i * 4 + 2] = v.z; arr[i * 4 + 3] = region || 0;
    }
    geometry.setAttribute('aSkin', new THREE.BufferAttribute(arr, 4));
    return geometry;
  }

  return { make, applySkin, applySkinX, DEFAULTS };
})();
