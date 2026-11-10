// Procedural reticulated-giraffe coat: 3D Voronoi patches (liver/chestnut) separated by
// narrow cream lines, evaluated on the rest-pose coordinates so it stays glued to the skin.
// aPat.x = pattern amount (1 full, 0 plain cream), aPat.y = paleness, aPat.z = muzzle/face tint
(function () {
  'use strict';
  const coatChunk = /* glsl */`
  vec3 gHash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123);
  }
  float gNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = gHash3(i).x, n100 = gHash3(i + vec3(1,0,0)).x, n010 = gHash3(i + vec3(0,1,0)).x, n110 = gHash3(i + vec3(1,1,0)).x;
    float n001 = gHash3(i + vec3(0,0,1)).x, n101 = gHash3(i + vec3(1,0,1)).x, n011 = gHash3(i + vec3(0,1,1)).x, n111 = gHash3(i + vec3(1,1,1)).x;
    return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
  }
  // returns (border distance, cell id hash, distance to nucleus)
  vec3 gVoronoi(vec3 x) {
    vec3 n = floor(x), f = fract(x);
    vec3 mg, mr; float md = 8.0;
    for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec3 g = vec3(float(i), float(j), float(k));
      vec3 o = 0.15 + 0.7 * gHash3(n + g);
      vec3 r = g + o - f;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
    float bd = 8.0;
    for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec3 g = mg + vec3(float(i), float(j), float(k));
      vec3 o = 0.15 + 0.7 * gHash3(n + g);
      vec3 r = g + o - f;
      if (dot(mr - r, mr - r) > 0.00001) bd = min(bd, dot(0.5 * (mr + r), normalize(r - mr)));
    }
    return vec3(bd, gHash3(n + mg + 17.0).y, sqrt(md));
  }
  vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
  `;

  function makeCoatMaterial() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.0 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aRest;\nattribute vec3 aPat;\nvarying vec3 vRest;\nvarying vec3 vPat;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest;\nvPat = aPat;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRest;\nvarying vec3 vPat;\n' + coatChunk)
        .replace('#include <color_fragment>', /* glsl */`
          #include <color_fragment>
          {
            vec3 q = vRest;
            // domain warp gives the irregular, jagged pcol outlines
            vec3 w = vec3(gNoise(q * 1.7), gNoise(q * 1.7 + 31.4), gNoise(q * 1.7 + 71.9)) - 0.5;
            vec3 w2 = vec3(gNoise(q * 5.3 + 9.1), gNoise(q * 5.3 + 3.3), gNoise(q * 5.3 + 5.7)) - 0.5;
            vec3 v = gVoronoi(q + w * 0.55 + w2 * 0.12);
            float amount = clamp(vPat.x, 0.0, 1.0);
            float lineW = 0.055 + 0.03 * gNoise(q * 3.1) + (1.0 - amount) * 0.42;
            float m = smoothstep(lineW, lineW + 0.035, v.x);
            vec3 cream = toLin(vec3(0.90, 0.84, 0.72));
            vec3 creamPale = toLin(vec3(0.88, 0.83, 0.74));
            vec3 dark = toLin(vec3(0.30, 0.15, 0.07));
            vec3 mid = toLin(vec3(0.47, 0.25, 0.11));
            vec3 pcol = mix(dark, mid, v.y);
            // darker 'star' center inside larger patches
            pcol *= mix(0.78, 1.0, smoothstep(0.05, 0.35, v.x));
            vec3 tanc = toLin(vec3(0.66, 0.50, 0.34));
            pcol = mix(pcol, tanc, clamp(vPat.y, 0.0, 1.0));
            vec3 bg = mix(cream, creamPale, clamp(vPat.y, 0.0, 1.0));
            vec3 col = mix(bg, pcol, m * smoothstep(0.0, 0.25, amount));
            // face/muzzle tint
            col = mix(col, toLin(vec3(0.62, 0.47, 0.33)), clamp(vPat.z, 0.0, 1.0));
            // fur micro variation
            float fur = gNoise(q * 38.0) * 0.6 + gNoise(q * 91.0) * 0.4;
            col *= 0.88 + 0.2 * fur;
            diffuseColor.rgb = col;
          }
        `);
    };
    return mat;
  }
  window.makeCoatMaterial = makeCoatMaterial;
})();
