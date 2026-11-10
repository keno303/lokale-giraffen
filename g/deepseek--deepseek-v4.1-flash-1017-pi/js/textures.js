/* Procedural textures. No external files, so everything works from file:// */
(function (G) {
  'use strict';

  var T = G.tex = {};

  function canvas2d(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return { c: c, ctx: c.getContext('2d') };
  }

  function makeTex(canvas, repeat, aniso) {
    var t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat, repeat);
    t.anisotropy = aniso || 8;
    t.encoding = THREE.sRGBEncoding;
    t.needsUpdate = true;
    return t;
  }
  T.makeTex = makeTex;

  /* ------------------------------------------------------------------ */
  /* Giraffe hide: cream ground with big, irregular chestnut polygons.   */
  /* ------------------------------------------------------------------ */
  T.coat = function () {
    var S = 1024;
    var o = canvas2d(S, S), ctx = o.ctx;
    var rnd = G.rng(20261109);

    ctx.fillStyle = '#e8dcbe';
    ctx.fillRect(0, 0, S, S);

    // soft, low frequency mottling of the cream ground
    for (var i = 0; i < 90; i++) {
      var x = rnd() * S, y = rnd() * S, r = 60 + rnd() * 220;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      var tone = rnd() < 0.5 ? '205,190,152' : '240,232,208';
      g.addColorStop(0, 'rgba(' + tone + ',' + (0.05 + rnd() * 0.09) + ')');
      g.addColorStop(1, 'rgba(' + tone + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // reticulated patches on a jittered grid, wrapped over the seams
    var N = 9, sp = S / N;
    function spot(cx, cy, rad, tint, warm) {
      var n = 8 + Math.floor(rnd() * 4);
      var pts = [];
      var squash = 0.86 + rnd() * 0.24;
      var rot = rnd() * Math.PI * 2;
      for (var k = 0; k < n; k++) {
        var a = k / n * Math.PI * 2;
        var rr = rad * (0.74 + rnd() * 0.34);
        pts.push([
          cx + Math.cos(a) * rr,
          cy + Math.sin(a) * rr * squash
        ]);
      }
      // rotate points slightly around the centre
      for (var k2 = 0; k2 < pts.length; k2++) {
        var dx = pts[k2][0] - cx, dy = pts[k2][1] - cy;
        pts[k2][0] = cx + dx * Math.cos(rot) - dy * Math.sin(rot);
        pts[k2][1] = cy + dx * Math.sin(rot) + dy * Math.cos(rot);
      }
      ctx.beginPath();
      var p0 = pts[0], pl = pts[pts.length - 1];
      ctx.moveTo((pl[0] + p0[0]) / 2, (pl[1] + p0[1]) / 2);
      for (var k3 = 0; k3 < pts.length; k3++) {
        var p = pts[k3], q = pts[(k3 + 1) % pts.length];
        ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      }
      ctx.closePath();
      var grd = ctx.createRadialGradient(cx - rad * 0.2, cy - rad * 0.25, rad * 0.1, cx, cy, rad * 1.1);
      grd.addColorStop(0, tint[0]);
      grd.addColorStop(0.7, tint[1]);
      grd.addColorStop(1, tint[2]);
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.strokeStyle = 'rgba(58,28,8,0.55)';
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }

    var palettes = [
      ['#8a5326', '#733f16', '#5a2f0d'],
      ['#7d4a22', '#673a14', '#4e2a0b'],
      ['#95602c', '#7b4a1c', '#61360f'],
      ['#86512a', '#6d3e18', '#522c0c'],
      ['#77441e', '#5f3412', '#48260a']
    ];

    for (var gy = -1; gy <= N; gy++) {
      for (var gx = -1; gx <= N; gx++) {
        var cx = (gx + 0.5) * sp + (rnd() - 0.5) * sp * 0.30;
        var cy = (gy + 0.5) * sp + (rnd() - 0.5) * sp * 0.30;
        var rad = sp * (0.40 + rnd() * 0.09);
        var pal = palettes[(Math.abs(gx * 7 + gy * 13)) % palettes.length];
        spot(cx, cy, rad, pal);
      }
    }

    // tiny dark speckles inside the cream lines (hair pores)
    for (var s = 0; s < 9000; s++) {
      var sx = rnd() * S, sy = rnd() * S;
      var a = 0.02 + rnd() * 0.10;
      ctx.fillStyle = 'rgba(96,74,46,' + a + ')';
      ctx.fillRect(sx, sy, 1 + rnd() * 2, 1 + rnd() * 2);
    }

    // per pixel grain
    var id = ctx.getImageData(0, 0, S, S);
    var d = id.data;
    for (var p = 0; p < d.length; p += 4) {
      var n = (rnd() - 0.5) * 13;
      d[p] += n; d[p + 1] += n; d[p + 2] += n * 0.9;
    }
    ctx.putImageData(id, 0, 0);

    return makeTex(o.c, 1, 8);
  };

  /* ------------------------------------------------------------------ */
  /* Dry savanna ground                                                   */
  /* ------------------------------------------------------------------ */
  T.ground = function () {
    var S = 1024;
    var o = canvas2d(S, S), ctx = o.ctx;
    var rnd = G.rng(99117);

    ctx.fillStyle = '#9d9563';
    ctx.fillRect(0, 0, S, S);

    var cols = [
      '176,166,112', '142,138,88', '190,182,132',
      '126,128,78', '158,166,96', '168,162,110',
      '138,148,80', '108,108,66', '156,152,102'
    ];

    function blob(x, y, r, col, alpha, squash) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + col + ',' + alpha + ')');
      g.addColorStop(0.65, 'rgba(' + col + ',' + (alpha * 0.55) + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, squash || 1);
      ctx.translate(-x, -y);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.restore();
    }

    function wrapped(fn, x, y) {
      for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
          var px = x + dx * S, py = y + dy * S;
          if (px > -300 && px < S + 300 && py > -300 && py < S + 300) fn(px, py);
        }
      }
    }

    // broad soil / grass patches
    for (var i = 0; i < 140; i++) {
      var x = rnd() * S, y = rnd() * S;
      var r = 40 + rnd() * 210;
      var col = cols[Math.floor(rnd() * cols.length)];
      var alpha = 0.06 + rnd() * 0.16;
      var sq = 0.6 + rnd() * 0.8;
      wrapped(function (px, py) { blob(px, py, r, col, alpha, sq); }, x, y);
    }

    // tufty darker speckle, like tussocks seen from above
    for (var j = 0; j < 5200; j++) {
      var x2 = rnd() * S, y2 = rnd() * S;
      var r2 = 1 + rnd() * 7;
      ctx.fillStyle = 'rgba(' + cols[Math.floor(rnd() * cols.length)] + ',' + (0.05 + rnd() * 0.20) + ')';
      ctx.beginPath();
      ctx.ellipse(x2, y2, r2, r2 * (0.4 + rnd() * 0.7), rnd() * 3, 0, G.TAU);
      ctx.fill();
    }

    // fine grain so close ups don't look like flat paint
    var id = ctx.getImageData(0, 0, S, S);
    var d = id.data;
    for (var p = 0; p < d.length; p += 4) {
      var n = (rnd() - 0.5) * 19;
      d[p] += n; d[p + 1] += n; d[p + 2] += n * 0.8;
    }
    ctx.putImageData(id, 0, 0);

    var tex = makeTex(o.c, 1, 8);
    return tex;
  };

  /* ------------------------------------------------------------------ */
  /* Dry grass tuft (alpha cut out)                                      */
  /* ------------------------------------------------------------------ */
  T.grass = function () {
    var W = 256, H = 256;
    var o = canvas2d(W, H), ctx = o.ctx;
    var rnd = G.rng(4242);
    ctx.clearRect(0, 0, W, H);

    var greens = [
      ['#8d9150', '#6f7539'], ['#a19a55', '#7f7939'],
      ['#7c8a45', '#5e6a30'], ['#b2a45f', '#8d8040'],
      ['#6f7f3e', '#56622c'], ['#c0b273', '#97894a']
    ];

    for (var i = 0; i < 78; i++) {
      var baseX = W * (0.08 + rnd() * 0.84);
      var h = H * (0.55 + rnd() * 0.45);
      var bend = (rnd() - 0.5) * W * 0.62;
      var w = 0.9 + rnd() * 2.0;
      var pal = greens[Math.floor(rnd() * greens.length)];
      var g = ctx.createLinearGradient(0, H, 0, H - h);
      g.addColorStop(0, pal[1]);
      g.addColorStop(0.6, pal[0]);
      g.addColorStop(1, pal[1]);
      ctx.strokeStyle = g;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(baseX, H + 4);
      ctx.quadraticCurveTo(baseX + bend * 0.15, H - h * 0.7, baseX + bend, H - h);
      ctx.stroke();
      // seed head
      if (rnd() < 0.35) {
        ctx.fillStyle = 'rgba(168,150,94,0.9)';
        ctx.beginPath();
        ctx.ellipse(baseX + bend, H - h, 3.4, 8, bend > 0 ? 0.3 : -0.3, 0, G.TAU);
        ctx.fill();
      }
    }
    // a few dried straws
    for (var k = 0; k < 12; k++) {
      var bx = W * (0.3 + rnd() * 0.4);
      ctx.strokeStyle = 'rgba(178,159,104,0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bx, H);
      ctx.quadraticCurveTo(bx + (rnd() - 0.5) * 40, H * 0.4, bx + (rnd() - 0.5) * 120, H * (0.06 + rnd() * 0.2));
      ctx.stroke();
    }
    return makeTex(o.c, 1, 4);
  };

  /* ------------------------------------------------------------------ */
  /* Hair card used for mane and tail tuft                               */
  /* ------------------------------------------------------------------ */
  T.hair = function () {
    var W = 256, H = 256;
    var o = canvas2d(W, H), ctx = o.ctx;
    var rnd = G.rng(777);
    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < 230; i++) {
      var x0 = W * (0.03 + rnd() * 0.94);
      var len = H * (0.55 + rnd() * 0.45);
      var sway = (rnd() - 0.5) * 34;
      var w = 0.9 + rnd() * 2.0;
      var dark = 28 + rnd() * 34;
      var col = 'rgb(' + (dark + 26) + ',' + (dark + 8) + ',' + (dark - 4) + ')';
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.65 + rnd() * 0.35;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, H + 2);
      ctx.quadraticCurveTo(x0 + sway * 0.5, H - len * 0.55, x0 + sway, H - len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return makeTex(o.c, 1, 4);
  };

  /* ------------------------------------------------------------------ */
  /* Coat material: triplanar hide pattern in rest-space                 */
  /* ------------------------------------------------------------------ */
  T.coatTexture = T.coat();

  T.makeCoatMaterial = function (opts) {
    opts = opts || {};
    var mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: opts.roughness !== undefined ? opts.roughness : 0.82,
      metalness: 0.0
    });
    var coatTex = T.coatTexture;
    mat.userData.coatScale = opts.scale !== undefined ? opts.scale : 0.335;
    mat.userData.cream = new THREE.Vector3(0.902, 0.843, 0.702); // sRGB cream base

    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uCoat = { value: coatTex };
      shader.uniforms.uCoatScale = { value: mat.userData.coatScale };
      shader.uniforms.uCream = { value: mat.userData.cream };

      shader.vertexShader = [
        'attribute vec3 coatPos;',
        'attribute vec3 coatNrm;',
        'attribute vec2 coatMix;',
        'varying vec3 vCoatPos;',
        'varying vec3 vCoatNrm;',
        'varying vec2 vCoatMix;',
        shader.vertexShader
      ].join('\n');
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vCoatPos = coatPos;\n vCoatNrm = coatNrm;\n vCoatMix = coatMix;'
      );

      shader.fragmentShader = [
        'uniform sampler2D uCoat;',
        'uniform float uCoatScale;',
        'uniform vec3 uCream;',
        'varying vec3 vCoatPos;',
        'varying vec3 vCoatNrm;',
        'varying vec2 vCoatMix;',
        'vec3 gSrgb2Lin(vec3 c) {',
        '  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));',
        '}',
        shader.fragmentShader
      ].join('\n');
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          '{',
          '  vec3 nn = normalize(vCoatNrm);',
          '  vec3 w3 = abs(nn);',
          '  w3 = w3 * w3 * w3;',
          '  w3 /= (w3.x + w3.y + w3.z + 1e-5);',
          '  vec3 cx = texture2D(uCoat, vCoatPos.zy * uCoatScale).rgb;',
          '  vec3 cy = texture2D(uCoat, vCoatPos.xz * uCoatScale).rgb;',
          '  vec3 cz = texture2D(uCoat, vCoatPos.xy * uCoatScale).rgb;',
          '  vec3 coat = gSrgb2Lin(cx * w3.x + cy * w3.y + cz * w3.z);',
          '  vec3 cream = gSrgb2Lin(uCream);',
          '  diffuseColor.rgb *= (mix(cream, coat, vCoatMix.x) * vCoatMix.y);',
          '}'
        ].join('\n')
      );
      mat.userData.shader = shader;
    };
    mat.customProgramCacheKey = function () { return 'giraffeCoat'; };
    return mat;
  };

})(window.G);
