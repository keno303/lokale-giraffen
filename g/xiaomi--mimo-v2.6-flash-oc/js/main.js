/* main.js — renderer, camera controls, main loop */
'use strict';

(function () {
  const params = new URLSearchParams(location.search);
  const app = document.getElementById('app');
  const statsEl = document.getElementById('stats');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    document.getElementById('err').style.display = 'block';
    document.getElementById('err').textContent = 'WebGL unavailable: ' + e.message;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 900);

  buildWorld(scene);
  scene.add(buildGiraffe());

  /* ---------- orbit camera ---------- */
  const VIEWS = {
    '': { th: -1.02, ph: 1.27, r: 12.5, ty: 2.5, tz: 0.3 },
    side: { th: -PI / 2, ph: 1.30, r: 13.5, ty: 2.35, tz: 0.1 },
    front: { th: 0.0, ph: 1.32, r: 11.0, ty: 2.6, tz: 0.4 },
    closeup: { th: -0.7, ph: 1.40, r: 4.4, ty: 4.15, tz: 1.75 },
    face: { th: -1.15, ph: 1.50, r: 2.6, ty: 4.30, tz: 2.05 },
    wide: { th: -0.9, ph: 1.10, r: 20.0, ty: 2.6, tz: 0.3 },
    top: { th: -1.6, ph: 0.75, r: 16.0, ty: 2.0, tz: 0.2 }
  };
  const v0 = VIEWS[params.get('view') || ''] || VIEWS[''];
  const cam = {
    th: v0.th, ph: v0.ph, r: v0.r, ty: v0.ty, tz: v0.tz,
    thT: v0.th, phT: v0.ph, rT: v0.r, tyT: v0.ty, tzT: v0.tz
  };
  let idle = 0, dragging = false, lastX = 0, lastY = 0, pinch = 0;

  const dom = renderer.domElement;
  dom.addEventListener('pointerdown', e => {
    dragging = true; lastX = e.clientX; lastY = e.clientY; idle = 0;
    dom.setPointerCapture(e.pointerId);
  });
  dom.addEventListener('pointermove', e => {
    if (!dragging) return;
    cam.thT -= (e.clientX - lastX) * 0.006;
    cam.phT = clamp(cam.phT - (e.clientY - lastY) * 0.005, 0.45, 1.56);
    lastX = e.clientX; lastY = e.clientY; idle = 0;
  });
  const endDrag = e => { dragging = false; };
  dom.addEventListener('pointerup', endDrag);
  dom.addEventListener('pointercancel', endDrag);
  dom.addEventListener('wheel', e => {
    e.preventDefault();
    cam.rT = clamp(cam.rT * (1 + Math.sign(e.deltaY) * 0.09), 3.2, 55);
    idle = 0;
  }, { passive: false });
  dom.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: true });
  dom.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && pinch) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY);
      cam.rT = clamp(cam.rT * (pinch / Math.max(d, 1)), 3.2, 55);
      pinch = d; idle = 0;
    }
  }, { passive: true });
  dom.addEventListener('touchend', () => { pinch = 0; });

  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); paused = !paused; }
    idle = 0;
  });

  const target = new THREE.Vector3();
  function updateCamera(dt) {
    idle += dt;
    if (!dragging && idle > 9) cam.thT += 0.11 * dt;
    const k = 1 - Math.exp(-dt * 7);
    cam.th += (cam.thT - cam.th) * k;
    cam.ph += (cam.phT - cam.ph) * k;
    cam.r += (cam.rT - cam.r) * k;
    cam.ty += (cam.tyT - cam.ty) * k;
    cam.tz += (cam.tzT - cam.tz) * k;
    target.set(0, cam.ty, cam.tz);
    const sp = Math.sin(cam.ph);
    camera.position.set(
      target.x + cam.r * sp * Math.sin(cam.th),
      target.y + cam.r * Math.cos(cam.ph),
      target.z + cam.r * sp * Math.cos(cam.th));
    camera.lookAt(target);
  }

  /* ---------- loop ---------- */
  let time = parseFloat(params.get('t') || '0') || 0;
  let paused = params.has('pause');
  const still = params.has('still');
  let last = performance.now(), statT = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) time += dt;
    updateGiraffe(time);
    updateWorld(time);
    updateCamera(dt);
    renderer.render(scene, camera);
    statT += dt;
    if (statT > 0.4) {
      statT = 0;
      statsEl.textContent =
        'walked ' + (GAIT.v * time).toFixed(1) + ' m  ·  ' +
        (GAIT.v * 3.6).toFixed(1) + ' km/h  ·  t=' + time.toFixed(1) + ' s' +
        (paused ? '  ·  paused' : '');
    }
    if (!still) requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  if (params.has('bench')) {
    /* drive the animation loop manually (headless rAF never fires) */
    let now = performance.now(), fails = 0;
    const N = parseInt(params.get('bench'), 10) || 20;
    for (let i = 0; i < N; i++) {
      now += 100;
      try { frame(now); } catch (e) { fails++; document.title = 'BENCH_ERR:' + e.message; break; }
    }
    if (!fails) document.title = 'BENCH_OK ' + statsEl.textContent;
  } else if (still) {
    /* size to the layout viewport right before capture */
    const LW = document.documentElement.clientWidth;
    const LH = document.documentElement.clientHeight;
    renderer.setSize(LW, LH, false);
    camera.aspect = LW / LH;
    camera.updateProjectionMatrix();
    updateGiraffe(time);
    updateWorld(time);
    updateCamera(1 / 60);
    updateCamera(1 / 60);
    renderer.render(scene, camera);
    let px = [0, 0, 0, 0], err = '';
    try {
      const gl = renderer.getContext();
      const buf = new Uint8Array(4);
      gl.readPixels(Math.floor(gl.drawingBufferWidth / 2),
        Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      px = Array.from(buf);
    } catch (e) { err = e.message; }
    /* headless screenshot paths often miss WebGL surfaces: blit to a 2-D image */
    try {
      const url = renderer.domElement.toDataURL('image/png');
      const img = new Image();
      img.src = url;
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
      app.insertBefore(img, renderer.domElement);
      renderer.domElement.style.display = 'none';
    } catch (e) { err += ' toDataURL:' + e.message; }
    document.title = 'PX:' + px.join(',') + ' win:' + window.innerWidth + 'x' + window.innerHeight +
      ' css:' + LW + 'x' + LH + ' ' + err;
    if (params.has('debug')) {
      const rows = [];
      const bb = new THREE.Box3();
      const wp = new THREE.Vector3();
      G.body.children.forEach((c, i) => {
        bb.setFromObject(c);
        rows.push(i + ':' + (c.type) + (c.isMesh ? '(m' + c.geometry.attributes.position.count + ')' : '') +
          ' x[' + bb.min.x.toFixed(2) + ',' + bb.max.x.toFixed(2) + '] y[' +
          bb.min.y.toFixed(2) + ',' + bb.max.y.toFixed(2) + '] z[' +
          bb.min.z.toFixed(2) + ',' + bb.max.z.toFixed(2) + ']');
      });
      G.neckGroups.concat([G.head]).forEach((c, i) => {
        c.getWorldPosition(wp);
        rows.push('N' + i + ' local[' + c.position.x.toFixed(2) + ',' + c.position.y.toFixed(2) +
          ',' + c.position.z.toFixed(2) + '] world[' + wp.x.toFixed(2) + ',' + wp.y.toFixed(2) +
          ',' + wp.z.toFixed(2) + ']');
        c.children.forEach((ch, j) => {
          bb.setFromObject(ch);
          rows.push('  c' + j + ':' + ch.type + (ch.isMesh ? '(m' + ch.geometry.attributes.position.count + ')' : '') +
            ' y[' + bb.min.y.toFixed(2) + ',' + bb.max.y.toFixed(2) + '] z[' +
            bb.min.z.toFixed(2) + ',' + bb.max.z.toFixed(2) + ']');
        });
      });
      /* winding check: geometric normal vs stored normal of one triangle */
      try {
        const tm = G.body.children[0];
        const gi = tm.geometry.index.array, pa = tm.geometry.attributes.position,
          na = tm.geometry.attributes.normal;
        const i0 = gi[0], i1 = gi[1], i2 = gi[2];
        const a = new THREE.Vector3().fromBufferAttribute(pa, i0),
          b = new THREE.Vector3().fromBufferAttribute(pa, i1),
          c = new THREE.Vector3().fromBufferAttribute(pa, i2);
        const gn = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
        const sn = new THREE.Vector3().fromBufferAttribute(na, i0);
        rows.push('tri(' + i0 + ',' + i1 + ',' + i2 + ') geoN[' + gn.x.toFixed(2) + ',' + gn.y.toFixed(2) +
          ',' + gn.z.toFixed(2) + '] storedN[' + sn.x.toFixed(2) + ',' + sn.y.toFixed(2) + ',' + sn.z.toFixed(2) + ']');
      } catch (e) { rows.push('triERR ' + e.message); }
      document.title = rows.join(' | ').slice(0, 1800);
    }
    statsEl.textContent = 'still t=' + time.toFixed(2) + 's';
  } else {
    requestAnimationFrame(frame);
  }
})();
