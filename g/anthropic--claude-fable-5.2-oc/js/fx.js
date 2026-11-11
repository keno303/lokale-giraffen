// Small dust puffs kicked up by the hooves.
(function () {
  'use strict';
  const GIR = (window.GIR = window.GIR || {});

  GIR.createDust = function (scene, renderer, camera) {
    const N = 320;
    const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), data = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) data[i * 4] = -100;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
    g.setAttribute('aData', new THREE.BufferAttribute(data, 4));
    const U = { uTime: { value: 0 }, uScale: { value: 1 }, uColor: { value: new THREE.Color(0xc9ab7c) } };
    const m = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false,
      vertexShader: `
attribute vec3 aVel; attribute vec4 aData;
uniform float uTime, uScale;
varying float vA;
void main(){
  float age = uTime - aData.x, t = age / aData.y;
  vec3 p = position + aVel * age * (1.0 - 0.45 * t) + vec3(0.0, 0.10 * age * age, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float ok = step(0.0, t) * step(t, 1.0);
  gl_PointSize = ok * aData.z * (1.0 + 3.2 * t) * uScale / max(0.1, -mv.z);
  vA = ok * pow(1.0 - t, 1.6) * smoothstep(0.0, 0.08, t) * aData.w;
}`,
      fragmentShader: `
uniform vec3 uColor; varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false; pts.renderOrder = 5;
    scene.add(pts);
    let next = 0, seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    return {
      puff(x, z, t, strength, dirX) {
        const n = Math.round(7 * strength);
        for (let k = 0; k < n; k++) {
          const i = next; next = (next + 1) % N;
          const a = rnd() * 6.283, r = 0.03 + rnd() * 0.09;
          pos[i * 3] = x + Math.cos(a) * r; pos[i * 3 + 1] = 0.03 + rnd() * 0.05; pos[i * 3 + 2] = z + Math.sin(a) * r;
          const sp = 0.12 + rnd() * 0.3;
          vel[i * 3] = Math.cos(a) * sp + dirX * 0.25; vel[i * 3 + 1] = 0.05 + rnd() * 0.22; vel[i * 3 + 2] = Math.sin(a) * sp;
          data[i * 4] = t + rnd() * 0.06; data[i * 4 + 1] = 1.1 + rnd() * 1.3; data[i * 4 + 2] = 0.16 + rnd() * 0.2; data[i * 4 + 3] = (0.1 + rnd() * 0.14) * strength;
        }
        g.attributes.position.needsUpdate = g.attributes.aVel.needsUpdate = g.attributes.aData.needsUpdate = true;
      },
      update(t, sunWarm) {
        U.uTime.value = t;
        U.uScale.value = renderer.domElement.height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
      },
    };
  };
})();
