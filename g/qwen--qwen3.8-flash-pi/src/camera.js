/* giraffe-world / camera.js — mouse/touch camera rig with four looks.
   Written from scratch: no example modules, so index.html stays file:// safe. */
(function (root) {
  'use strict';
  var GW = root.GW, M = GW.math, THREE = root.THREE;

  GW.CameraRig = function (camera, dom, opts) {
    opts = opts || {};
    var s = {
      camera: camera,
      mode: opts.mode || 'follow',
      distance: opts.distance || 12.5,
      distWanted: opts.distance || 12.5,
      azimuth: opts.azimuth || 0.9,          /* radians around the target    */
      azWanted: opts.azimuth || 0.9,
      elevation: opts.elevation || 0.20,     /* radians above target plane   */
      elWanted: 0.20,
      target: new THREE.Vector3(0, 2.9, 0),
      wanted: new THREE.Vector3(0, 2.9, 0),
      auto: true,
      shake: 0,
      dragging: false,
      last: { x: 0, y: 0 },
      pointers: {},
      pinch: 0,
      fov: 38,
      fovWanted: 38
    };
    var MIN_EL = -0.22, MAX_EL = 1.15;

    /* ------------------------------------------------------------ input --- */
    function down(e) {
      s.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (e.pointerType === 'mouse') { s.dragging = true; s.last.x = e.clientX; s.last.y = e.clientY; }
      countPinch();
      if (dom.setPointerCapture) { try { dom.setPointerCapture(e.pointerId); } catch (err) { } }
    }
    function move(e) {
      if (!s.pointers[e.pointerId]) return;
      var p = s.pointers[e.pointerId];
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (Object.keys(s.pointers).length >= 2) { countPinch(); return; }
      if (!s.dragging) return;
      s.azWanted -= dx * 0.006;
      s.elWanted = M.clamp(s.elWanted + dy * 0.004, MIN_EL, MAX_EL);
      s.auto = false;
    }
    function up(e) {
      delete s.pointers[e.pointerId];
      s.dragging = false;
      countPinch();
    }
    function countPinch() {
      var ids = Object.keys(s.pointers);
      if (ids.length < 2) { s.pinch = 0; return; }
      var a = s.pointers[ids[0]], b = s.pointers[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      if (s.pinch) s.distWanted = M.clamp(s.distWanted * (s.pinch / d), 3.2, 60);
      s.pinch = d;
    }
    function wheel(e) {
      e.preventDefault();
      s.distWanted = M.clamp(s.distWanted * (1 + M.clamp(e.deltaY, -120, 120) * 0.0016), 3.2, 60);
    }
    dom.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', wheel, { passive: false });
    dom.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    /* ------------------------------------------------------------ modes --- */
    var _v = new THREE.Vector3(), _fwd = new THREE.Vector3();
    function update(dt, actor) {
      dt = Math.min(dt, 0.05);
      /* where the camera should look */
      if (s.mode === 'free') {
        s.wanted.set(0, 2.6, 0);
        if (s.auto) s.azWanted += dt * 0.05;
      } else if (s.mode === 'side') {
        /* profile tracking: perpendicular to the animal's heading */
        var h = actor.heading || 0;
        s.azWanted = -h + Math.PI / 2;
        s.wanted.set(actor.pos.x, actor.bodyY + 0.4, actor.pos.z);
      } else if (s.mode === 'low') {
        s.wanted.set(actor.pos.x, actor.bodyY + 1.2, actor.pos.z);
        s.elWanted = M.clamp(s.elWanted, -0.16, 0.10);
        if (s.auto) s.azWanted += dt * 0.08;
      } else {
        /* follow: trails the animal, keeps the whole body in frame */
        _fwd.set(Math.cos(actor.heading), 0, -Math.sin(actor.heading));
        s.wanted.set(actor.pos.x, actor.bodyY + 0.5, actor.pos.z)
          .addScaledVector(_fwd, 0.3);
        if (s.auto) s.azWanted += dt * 0.055;
      }
      var k = s.mode === 'free' ? 3.0 : 5.5;
      s.target.lerp(s.wanted, 1 - Math.exp(-k * dt));
      s.azimuth = M.damp(s.azimuth, s.azWanted, 6, dt);
      s.elevation = M.damp(s.elevation, s.elWanted, 6, dt);
      s.distance = M.damp(s.distance, s.distWanted, 4, dt);
      s.fov = M.damp(s.fov, s.fovWanted, 3, dt);

      var ce = Math.cos(s.elevation), se = Math.sin(s.elevation);
      _v.set(Math.sin(s.azimuth) * ce, se, Math.cos(s.azimuth) * ce).multiplyScalar(s.distance);
      camera.position.copy(s.target).add(_v);
      if (s.shake > 0) {
        camera.position.x += (Math.random() - 0.5) * s.shake;
        camera.position.y += (Math.random() - 0.5) * s.shake;
        s.shake *= 0.86;
      }
      /* never let the eye go under the ground */
      if (camera.position.y < 0.35) camera.position.y = 0.35;
      camera.lookAt(s.target.x, s.target.y + (s.mode === 'low' ? 0.6 : 0.2), s.target.z);
      if (Math.abs(camera.fov - s.fov) > 0.01) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
      return s;
    }
    function setMode(m) {
      s.mode = m;
      s.auto = (m !== 'side');
      if (m === 'low') s.distWanted = 7.5;
      else if (m === 'free') s.distWanted = 16;
      else if (m === 'side') s.distWanted = 13.5;
      else s.distWanted = 12.5;
      s.elWanted = m === 'low' ? -0.05 : 0.2;
    }
    return {
      state: s, update: update, setMode: setMode,
      zoom: function (d) { s.distWanted = M.clamp(s.distWanted + d, 3.2, 60); }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
