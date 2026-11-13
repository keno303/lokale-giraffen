/* Reticulated giraffe coat: domain-warped 3D Voronoi evaluated on rest-pose
   coordinates, injected into MeshStandardMaterial so lighting/shadows stay PBR. */
(function () {
  function makeCoatMaterial() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.0 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aRest; attribute vec3 aInfo;
          varying vec3 vRest; varying vec3 vInfo;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vRest = aRest; vInfo = aInfo;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vRest; varying vec3 vInfo;
          vec3 hash3(vec3 p){
            p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
            return fract(sin(p)*43758.5453123);
          }
          float vnoise(vec3 x){
            vec3 p = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
            float n000 = hash3(p).x, n100 = hash3(p+vec3(1,0,0)).x, n010 = hash3(p+vec3(0,1,0)).x, n110 = hash3(p+vec3(1,1,0)).x;
            float n001 = hash3(p+vec3(0,0,1)).x, n101 = hash3(p+vec3(1,0,1)).x, n011 = hash3(p+vec3(0,1,1)).x, n111 = hash3(p+vec3(1,1,1)).x;
            return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y), mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
          }
          // returns (F1, F2, cell id)
          vec3 voronoi(vec3 x){
            vec3 p = floor(x), f = fract(x);
            float f1 = 8.0, f2 = 8.0, id = 0.0;
            for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
              vec3 g = vec3(float(i),float(j),float(k));
              vec3 h = hash3(p+g);
              vec3 r = g + h - f;
              float d = dot(r,r);
              if(d < f1){ f2 = f1; f1 = d; id = h.y; }
              else if(d < f2){ f2 = d; }
            }
            return vec3(sqrt(f1), sqrt(f2), id);
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            float sc = 4.3 * vInfo.x;
            vec3 x = vRest * sc;
            vec3 w = vec3(vnoise(x*1.3), vnoise(x*1.3+17.3), vnoise(x*1.3+41.7)) - 0.5;
            x += w * 0.55;
            vec3 v = voronoi(x);
            float e = v.y - v.x;                       // distance-to-border proxy
            float cover = clamp(vInfo.y, 0.0, 1.0);
            float lineW = mix(0.075, 0.62, 1.0 - cover);
            float line = 1.0 - smoothstep(lineW*0.55, lineW*1.25, e);
            float h = v.z;
            // chestnut patches, each with its own tone, slightly lighter near the rim
            vec3 darkP = vec3(0.17, 0.065, 0.028);
            vec3 midP  = vec3(0.36, 0.165, 0.060);
            vec3 warmP = vec3(0.50, 0.265, 0.095);
            vec3 pc = mix(darkP, midP, smoothstep(0.0, 0.55, h));
            pc = mix(pc, warmP, smoothstep(0.55, 1.0, h) * 0.8);
            pc *= 0.80 + 0.45 * smoothstep(0.55, 0.05, e);   // rim lightening
            float grain = vnoise(vRest * 38.0) * 0.5 + vnoise(vRest * 90.0) * 0.5;
            pc *= 0.88 + 0.24 * grain;
            vec3 cream = vec3(0.80, 0.64, 0.40) * (0.92 + 0.14 * grain);
            vec3 col = mix(pc, cream, line);
            col = mix(col, cream * 0.95, clamp(1.0 - cover*1.6, 0.0, 0.6) * 0.0);
            col = mix(col, vec3(0.035, 0.022, 0.016), clamp(vInfo.z, 0.0, 1.0));
            diffuseColor.rgb *= pow(col, vec3(2.2));
          }`);
    };
    return mat;
  }
  window.makeCoatMaterial = makeCoatMaterial;
})();
