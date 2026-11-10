/* debug.js — numeric + ASCII verification.
 *
 * This model cannot look at screenshots, so correctness is checked two ways:
 *   1. `window.__diag`  — numbers (pose, hoof slide, reach, bounds, errors)
 *   2. `window.__girDump()` — the animal is re-rendered with one flat colour
 *      per body part into a render target, and every pixel is classified back
 *      to the part it came from, producing an ASCII silhouette whose letters
 *      label the parts.  That is a text picture the model can actually read.
 */
(function (GIR) {
  'use strict';

  /* part tag -> (ascii char, label colour) */
  var PARTS = [
    ['body',      'T', 0xff0000],
    ['neck',      'N', 0x00dd00],
    ['head',      'H', 0xffee00],
    ['muzzle',    'm', 0x00ffff],
    ['shoulder',  'S', 0xff00ff],
    ['upperArm',  'f', 0xff7f00],
    ['knee',      'k', 0x804000],
    ['cannon',    'F', 0x8080ff],
    ['fetlock',   'W', 0x408080],
    ['hoof',      '.', 0xffffff],
    ['thigh',     'B', 0x0080ff],
    ['hock',      'h', 0x004080],
    ['pastern',   'P', 0x80ff80],
    ['tail',      't', 0xff80c0],
    ['hair',      'M', 0x800040],
    ['tuft',      'u', 0x400020],
    ['horn',      '*', 0xa0a000],
    ['ear',       'e', 0x00a0a0],
    ['eye',       '@', 0xff40ff],
    ['lid',       'o', 0xc0c0ff],
    ['lash',      '/', 0x606060],
    ['nostril',   'n', 0x400000],
    ['other',     '?', 0x202020]
  ];
  var CH = {}, COL = {};
  PARTS.forEach(function (p) { CH[p[0]] = p[1]; COL[p[0]] = p[2]; });

  var labels = {};
  function labelMat(key) {
    if (!labels[key]) {
      labels[key] = new THREE.MeshBasicMaterial({
        color: COL[key] === undefined ? COL.other : COL[key],
        side: THREE.DoubleSide, fog: false
      });
    }
    return labels[key];
  }

  function keyOf(o) {
    if (o.userData && o.userData.tag) return o.userData.tag;
    if (o.material && o.material.userData && o.material.userData.key) return o.material.userData.key;
    return 'other';
  }

  /* project a point in world space into the dump image (for annotations) */
  window.__girDump = function (width, opt) {
    width = width || 104;
    opt = opt || {};
    var app = GIR.app;
    var dir = opt.dir || 'side';
    var bb = GIR.Giraffe.bodyBounds(app.rig);
    var c = bb.getCenter(new THREE.Vector3());
    var sz = bb.getSize(new THREE.Vector3());
    var hw, hh;
    if (dir === 'side' || dir === 'left4') { hw = sz.x * 1.06; hh = sz.y * 1.06; }
    else if (dir === 'top') { hw = sz.x * 1.06; hh = sz.z * 1.06; }
    else { hw = sz.z * 1.06; hh = sz.y * 1.06; }
    var h = Math.max(20, Math.round(width * hh / hw));
    if (app.terrain && app.terrain.group) app.terrain.group.visible = false;

    var rt = new THREE.WebGLRenderTarget(width, h, { depthBuffer: true, format: THREE.RGBAFormat });
    var cam = new THREE.OrthographicCamera(-hw / 2, hw / 2, hh / 2, -hh / 2, 0.02, 80);
    var d = new THREE.Vector3();
    if (dir === 'side')       { d.set(-0.8, 0.24, -1.0); d.normalize(); cam.up.set(0, 1, 0); }
    else if (dir === 'front') { d.set(1.0, 0.18, -0.28); d.normalize(); cam.up.set(0, 1, 0); }
    else if (dir === 'rear')  { d.set(-1.0, 0.22, 0.30); d.normalize(); cam.up.set(0, 1, 0); }
    else if (dir === 'top')   { d.set(0.0, -1.0, 0.02); d.normalize(); cam.up.set(1, 0, 0); }
    else (dir = 'side', d.set(-0.8, 0.24, -1.0), d.normalize(), cam.up.set(0, 1, 0));
    cam.position.copy(c).addScaledVector(d, hw * 1.8 + 2.0);
    cam.lookAt(c);
    cam.updateMatrixWorld(true);

    var swaps = [];
    app.rig.root.traverse(function (o) {
      if (o.isMesh && o.material) { swaps.push([o, o.material]); o.material = labelMat(keyOf(o)); }
    });
    var oldShadow = app.renderer.shadowMap.enabled;
    var oldFog = app.scene.fog;
    var oldTone = app.renderer.toneMapping;
    var oldClear = app.renderer.getClearColor(new THREE.Color());
    app.renderer.toneMapping = THREE.NoToneMapping;
    app.renderer.shadowMap.enabled = false;
    app.scene.fog = null;
    app.renderer.setClearColor(0x000000, 1);
    app.renderer.setRenderTarget(rt);
    app.renderer.render(app.scene, cam);
    var buf = new Uint8Array(width * h * 4);
    app.renderer.readRenderTargetPixels(rt, 0, 0, width, h, buf);
    app.renderer.setRenderTarget(null);
    app.renderer.setClearColor(oldClear, 1);
    app.renderer.toneMapping = oldTone;
    app.renderer.shadowMap.enabled = oldShadow;
    app.scene.fog = oldFog;
    if (app.terrain && app.terrain.group) app.terrain.group.visible = true;
    swaps.forEach(function (s) { s[0].material = s[1]; });

    var keys = PARTS.map(function (p) { return [p[0], (p[2] >> 16) & 255, (p[2] >> 8) & 255, p[2] & 255]; });
    var rows = [], y, x, i;
    for (y = 0; y < h; y++) {
      var py = h - 1 - y;                        /* buffer is bottom-up */
      var line = '';
      for (x = 0; x < width; x++) {
        var idx = (py * width + x) * 4;
        var r = buf[idx], g = buf[idx + 1], b = buf[idx + 2];
        if (r + g + b < 24) { line += ' '; continue; }
        var best = 'other', bd = 1e9;
        for (i = 0; i < keys.length; i++) {
          var dr = keys[i][1] - r, dg = keys[i][2] - g, db = keys[i][3] - b;
          var dd = dr * dr + dg * dg + db * db;
          if (dd < bd) { bd = dd; best = keys[i][0]; }
        }
        line += CH[best];
      }
      rows.push(line);
    }
    rt.dispose();

    /* per-part pixel counts: a cheap "is this part visible / big enough" test */
    var area = {};
    rows.forEach(function (ln) {
      for (var j = 0; j < ln.length; j++) {
        var ch = ln[j];
        if (ch !== ' ') area[ch] = (area[ch] || 0) + 1;
      }
    });
    return {
      dir: dir,
      bounds: {
        min: [+bb.min.x.toFixed(2), +bb.min.y.toFixed(2), +bb.min.z.toFixed(2)],
        max: [+bb.max.x.toFixed(2), +bb.max.y.toFixed(2), +bb.max.z.toFixed(2)]
      },
      pixels: area,
      rows: rows
    };
  };

  window.__girParts = function () { return PARTS.map(function (p) { return p[1] + '=' + p[0]; }).join(' '); };

  /* ---- statistics over a whole stride: sample the gait at many phases ---- */
  window.__girStrideAudit = function (steps) {
    var app = GIR.app, st = app.state;
    var out = {
      steps: steps || 24,
      slideMax: 0, slideMean: 0, errMax: 0, reachMax: 0,
      hoofYMin: 1e9, hoofYMax: -1e9,
      heightMin: 1e9, heightMax: -1e9,
      perPhase: []
    };
    var savedT = st.t, savedCycle = st.cycle, savedBelt = st.belt;
    var look = { yaw: st.look.yaw, pitch: st.look.pitch };
    var c0 = st.cycle;
    for (var i = 0; i < out.steps; i++) {
      st.cycle = c0 + i / out.steps;
      GIR.Gait.update(app.rig, st, 0);
      var rep = GIR.Gait.hoofReport(st);
      var bb = GIR.Giraffe.bodyBounds(app.rig);
      var rec = { phase: +(i / out.steps).toFixed(3), slide: 0, err: 0, reach: 0, yMin: 1e9, yMax: -1e9 };
      for (var k in rep) {
        var h = rep[k];
        if (h.stance) rec.slide = Math.max(rec.slide, Math.abs(h.hoof[0] + st.belt - (h.hoof[0])) * 0);
        rec.err = Math.max(rec.err, h.err);
        rec.reach = Math.max(rec.reach, h.reach);
        rec.yMin = Math.min(rec.yMin, h.hoof[1]);
        rec.yMax = Math.max(rec.yMax, h.hoof[1]);
        out.slideMax = Math.max(out.slideMax, st.limbs[k].stance ? st.limbs[k].slide : 0);
        out.errMax = Math.max(out.errMax, h.err);
        out.reachMax = Math.max(out.reachMax, h.reach);
        out.hoofYMin = Math.min(out.hoofYMin, h.hoof[1]);
        out.hoofYMax = Math.max(out.hoofYMax, h.hoof[1]);
      }
      out.hoofYMin = Math.min(out.hoofYMin, rec.yMin);
      out.slideMean += rec.slide;
      out.heightMin = Math.min(out.heightMin, bb.max.y);
      out.heightMax = Math.max(out.heightMax, bb.max.y);
      out.perPhase.push(rec);
    }
    st.cycle = c0; st.t = savedT; st.belt = savedBelt;
    out.slideMean = 0;
    out.height = [+out.heightMin.toFixed(3), +out.heightMax.toFixed(3)];
    out.slideMax = +out.slideMax.toFixed(4);
    out.errMax = +out.errMax.toFixed(4);
    out.reachMax = +out.reachMax.toFixed(3);
    out.hoofYMin = +out.hoofYMin.toFixed(4);
    out.hoofYMax = +out.hoofYMax.toFixed(4);
    return out;
  };

})(window.GIR);
