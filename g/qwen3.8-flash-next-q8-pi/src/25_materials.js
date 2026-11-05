// ---------------------------------------------------------------------------
// 25_materials.js -- skin shader (procedural coat), hair, horn, eye
// ---------------------------------------------------------------------------
window.G = window.G || {};
(function (G) {
  'use strict';

  const srgb = (h) => new THREE.Color(h).convertSRGBToLinear();

  G.makeSkinMaterial = function (coatTex, opts) {
    opts = opts || {};
    const m = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: opts.roughness === undefined ? 0.78 : opts.roughness,
      metalness: 0.0
    });
    m.map = coatTex;
    m.bumpMap = coatTex;
    m.bumpScale = opts.bump === undefined ? 0.22 : opts.bump;
    const U = {
      uCream: { value: srgb(opts.cream || 0xefe0b8) },
      uPatchA: { value: srgb(opts.patchA || 0x8e4726) },
      uPatchB: { value: srgb(opts.patchB || 0x552618) },
      uLine: { value: opts.line === undefined ? 1.0 : opts.line }
    };
    m.userData.uniforms = U;
    m.customProgramCacheKey = () => 'giraffe-skin';
    m.onBeforeCompile = function (sh) {
      Object.assign(sh.uniforms, U);
      // own UV varying: keeps this working across three versions that renamed
      // the built-in one (vUv -> vMapUv) and does not depend on USE_UV.
      sh.vertexShader = 'attribute vec2 aCoat;\nvarying vec2 vCoat;\nvarying vec2 vCoatUv;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvCoat = aCoat;\n\tvCoatUv = uv;');
      sh.fragmentShader = 'uniform vec3 uCream;\nuniform vec3 uPatchA;\nuniform vec3 uPatchB;\nuniform float uLine;\nvarying vec2 vCoat;\nvarying vec2 vCoatUv;\n' +
        sh.fragmentShader.replace('#include <map_fragment>', [
          '#ifdef USE_MAP',
          '  vec4 coatT = texture2D( map, vCoatUv );',
          '  float pmask = clamp( coatT.r * vCoat.x, 0.0, 1.0 );',
          '  float mot = coatT.b;',
          '  vec3 creamC = uCream * ( 0.88 + 0.22 * mot ) * uLine;',
          '  vec3 patchC = mix( uPatchA, uPatchB, coatT.g ) * ( 0.78 + 0.44 * mot );',
          '  vec3 coatCol = mix( creamC, patchC, pmask );',
          '  diffuseColor.rgb *= coatCol * vCoat.y;',
          '#endif'
        ].join('\n'));
      // roughness varies between patch and cream line (must come after the
      // roughnessmap chunk, which is where roughnessFactor is declared)
      sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\n#ifdef USE_MAP\n\troughnessFactor = mix( 0.92, 0.62, clamp( texture2D( map, vCoatUv ).r * vCoat.x, 0.0, 1.0 ) );\n#endif');
    };
    return m;
  };

  G.makeHairMaterial = function (hex, rough) {
    return new THREE.MeshPhysicalMaterial({
      color: srgb(hex === undefined ? 0x33200f : hex),
      roughness: rough === undefined ? 0.55 : rough,
      metalness: 0.0,
      sheen: 0.6,
      sheenColor: srgb(0x8a6a45),
      sheenRoughness: 0.7
    });
  };

  G.makeHoofMaterial = function () {
    return new THREE.MeshStandardMaterial({ color: srgb(0x241a13), roughness: 0.42, metalness: 0.0 });
  };

  G.makeEyeMaterial = function () {
    return new THREE.MeshPhysicalMaterial({
      color: srgb(0x1a0f08), roughness: 0.12, metalness: 0.0,
      clearcoat: 1.0, clearcoatRoughness: 0.05
    });
  };
})(window.G);
