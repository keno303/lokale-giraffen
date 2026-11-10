// Procedural giraffe: hierarchical model + analytic two-bone IK walk cycle.
// Units ~ metres. Model faces +Z. Legs swing in the sagittal (Y/Z) plane.
(function () {
  const T = THREE;

  const P = {
    hipH: 2.2,        // hip joint height above ground
    ankleH: 0.15,     // ankle height above ground in stance
    upperLen: 1.15,   // thigh/humerus
    lowerLen: 1.25,   // shank/cannon (giraffe lower leg is long)
    stride: 1.5,      // foot travel per stride (metres)
    duty: 0.6,        // fraction of cycle a foot is on the ground
    lift: 0.38,       // foot lift during swing
    cycle: 1.8,       // seconds per stride cycle
    neckSegs: 6,
    neckLen: 2.7,
    tailSegs: 6,
  };

  // Walk speed that matches foot stance velocity to ground speed.
  const WALK_SPEED = P.stride / (P.duty * P.cycle);

  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  // Irregular spotted coat texture (giraffe reticulated pattern).
  function spotTexture(o) {
    const W = 1024, H = 512;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const r = rng(o.seed);
    g.fillStyle = o.base;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(80,50,20,0.05)';
      g.fillRect(r() * W, r() * H, 2 + r() * 2, 2 + r() * 2);
    }
    for (let i = 0; i < o.count; i++) {
      const cx = r() * W, cy = r() * H;
      const rad = o.rMin + r() * (o.rMax - o.rMin);
      const n = 8 + Math.floor(r() * 5);
      const pts = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const rr = rad * (0.65 + r() * 0.55);
        pts.push([Math.cos(a) * rr * (0.9 + r() * 0.3), Math.sin(a) * rr * (0.75 + r() * 0.3)]);
      }
      const dark = 0.85 + r() * 0.3;
      const col = o.spot.map((v) => Math.round(v * dark));
      const fill = `rgb(${col[0]},${col[1]},${col[2]})`;
      for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
        g.save();
        g.translate(cx + ox, cy + oy);
        g.beginPath();
        const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const m0 = mid(pts[n - 1], pts[0]);
        g.moveTo(m0[0], m0[1]);
        for (let k = 0; k < n; k++) {
          const m = mid(pts[k], pts[(k + 1) % n]);
          g.quadraticCurveTo(pts[k][0], pts[k][1], m[0], m[1]);
        }
        g.closePath();
        g.fillStyle = fill;
        g.fill();
        g.restore();
      }
    }
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  function tapered(rTop, rBot, len) {
    const geo = new T.CylinderGeometry(rTop, rBot, len, 18, 1);
    geo.translate(0, -len / 2, 0); // top at origin, hangs down
    return geo;
  }

  function mesh(geo, mat, parent) {
    const m = new T.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    if (parent) parent.add(m);
    return m;
  }

  function ellipsoid(rx, ry, rz, mat, parent, pos) {
    const m = mesh(new T.SphereGeometry(1, 28, 20), mat, parent);
    m.scale.set(rx, ry, rz);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    return m;
  }

  function makeLeg(body, x, z, kneeSign, mats) {
    const hip = new T.Group();
    hip.position.set(x, P.hipH, z);
    body.add(hip);

    const up = new T.Group();
    hip.add(up);
    mesh(tapered(0.2, 0.15, P.upperLen), mats.leg, up);
    ellipsoid(0.16, 0.16, 0.16, mats.leg, up, [0, 0, 0]);

    const knee = new T.Group();
    knee.position.y = -P.upperLen;
    up.add(knee);
    mesh(new T.SphereGeometry(0.15, 18, 12), mats.leg, knee);
    mesh(tapered(0.15, 0.1, P.lowerLen), mats.leg, knee);

    const ankle = new T.Group();
    ankle.position.y = -P.lowerLen;
    knee.add(ankle);
    mesh(new T.SphereGeometry(0.1, 14, 10), mats.leg, ankle);
    // hoof: sits so its bottom touches ground when ankle is at ankleH
    const hoof = mesh(new T.CylinderGeometry(0.12, 0.13, 0.15, 16), mats.hoof, ankle);
    hoof.position.y = -0.075;

    return { hip, up, knee, sign: kneeSign, phase: 0 };
  }

  // Two-bone IK in the sagittal plane (z forward, y up), result sets rotation.x.
  function solveLeg(leg, fz, footY) {
    const a = P.upperLen, b = P.lowerLen;
    let d = Math.hypot(fz, footY);
    d = Math.min(Math.max(d, 0.05), a + b - 1e-3);
    // angle of hip->foot from straight down, measured forward
    const phi = Math.atan2(fz, -footY);
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const alpha = Math.acos(Math.min(1, Math.max(-1, cosA)));
    const th1 = phi + leg.sign * alpha;
    const kz = a * Math.sin(th1), ky = -a * Math.cos(th1);
    const th2 = Math.atan2(fz - kz, -(footY - ky));
    leg.up.rotation.x = -th1;
    leg.knee.rotation.x = -(th2 - th1);
  }

  function makeGiraffe() {
    const root = new T.Group();
    const mats = {
      body: new T.MeshStandardMaterial({ map: spotTexture({ seed: 7, base: '#e9cf9c', spot: [150, 92, 46], count: 110, rMin: 22, rMax: 50 }), roughness: 0.85 }),
      leg: new T.MeshStandardMaterial({ map: spotTexture({ seed: 19, base: '#efdcb0', spot: [120, 74, 36], count: 70, rMin: 26, rMax: 50 }), roughness: 0.9 }),
      dark: new T.MeshStandardMaterial({ color: 0x2b1b0e, roughness: 0.95 }),
      mane: new T.MeshStandardMaterial({ color: 0x3a2412, roughness: 1 }),
      hoof: new T.MeshStandardMaterial({ color: 0x2a211a, roughness: 0.6 }),
      eyeW: new T.MeshStandardMaterial({ color: 0xf6f1e4, roughness: 0.3 }),
      eyeP: new T.MeshStandardMaterial({ color: 0x080808, roughness: 0.2 }),
      horn: new T.MeshStandardMaterial({ color: 0x5a3f28, roughness: 0.8 }),
    };

    // Torso
    const body = new T.Group();
    root.add(body);
    ellipsoid(0.62, 0.58, 1.15, mats.body, body, [0, 2.45, 0]);
    // Chest & hindquarter shaping
    ellipsoid(0.55, 0.52, 0.55, mats.body, body, [0, 2.5, 0.75]);
    ellipsoid(0.5, 0.5, 0.5, mats.body, body, [0, 2.45, -0.8]);

    // Legs (front knees bend forward, hind hocks bend backward)
    const legs = {
      FL: makeLeg(body, 0.36, 0.72, +1, mats),
      FR: makeLeg(body, -0.36, 0.72, +1, mats),
      HL: makeLeg(body, 0.34, -0.72, -1, mats),
      HR: makeLeg(body, -0.34, -0.72, -1, mats),
    };
    // Lateral sequence: hind, same-side fore, opposite hind, opposite fore
    legs.HL.phase = 0.0;
    legs.FL.phase = 0.25;
    legs.HR.phase = 0.5;
    legs.FR.phase = 0.75;

    // Neck
    const neckBase = new T.Group();
    neckBase.position.set(0, 2.85, 0.75);
    neckBase.rotation.x = 0.35;
    body.add(neckBase);
    const segLen = P.neckLen / P.neckSegs;
    const neckSegs = [];
    let parent = neckBase;
    for (let i = 0; i < P.neckSegs; i++) {
      const t = i / (P.neckSegs - 1);
      const rTop = 0.27 - 0.09 * t;
      const rBot = rTop + 0.03;
      const seg = new T.Group();
      if (i > 0) seg.position.y = segLen;
      parent.add(seg);
      mesh(tapered(rTop, rBot, segLen), mats.body, seg);
      // tapered() hangs geometry down; flip so segment grows +Y
      seg.children[0].geometry.dispose();
      seg.children[0].geometry = new T.CylinderGeometry(rBot, rTop, segLen, 18, 1);
      seg.children[0].geometry.translate(0, segLen / 2, 0);
      mesh(new T.SphereGeometry(rBot, 16, 12), mats.body, seg);
      // mane along the back of the neck
      const mane = new T.Mesh(new T.BoxGeometry(0.07, segLen * 1.02, 0.12), mats.mane);
      mane.position.set(0, segLen / 2, -rBot * 0.85);
      mane.castShadow = true;
      seg.add(mane);
      neckSegs.push(seg);
      parent = seg;
      seg.userData.base = i === 0 ? 0 : 0.05; // gentle forward curvature
    }

    // Head (at top of neck)
    const head = new T.Group();
    head.position.y = segLen;
    neckSegs[neckSegs.length - 1].add(head);
    ellipsoid(0.18, 0.2, 0.3, mats.body, head, [0, 0.02, 0.1]);
    ellipsoid(0.12, 0.13, 0.2, mats.body, head, [0, -0.03, 0.42]);     // muzzle
    ellipsoid(0.1, 0.07, 0.2, mats.body, head, [0, -0.13, 0.3]);       // jaw
    ellipsoid(0.065, 0.03, 0.04, mats.dark, head, [0.05, -0.02, 0.56]); // nostrils area
    ellipsoid(0.065, 0.03, 0.04, mats.dark, head, [-0.05, -0.02, 0.56]);
    ellipsoid(0.04, 0.04, 0.04, mats.eyeW, head, [0.16, 0.08, 0.12]);
    ellipsoid(0.04, 0.04, 0.04, mats.eyeW, head, [-0.16, 0.08, 0.12]);
    ellipsoid(0.022, 0.022, 0.022, mats.eyeP, head, [0.2, 0.08, 0.12]);
    ellipsoid(0.022, 0.022, 0.022, mats.eyeP, head, [-0.2, 0.08, 0.12]);
    // ears
    const earR = ellipsoid(0.13, 0.04, 0.07, mats.body, head, [0.22, 0.1, -0.05]);
    earR.rotation.z = -0.4;
    const earL = ellipsoid(0.13, 0.04, 0.07, mats.body, head, [-0.22, 0.1, -0.05]);
    earL.rotation.z = 0.4;
    // ossicones (horns)
    for (const sx of [1, -1]) {
      const o = mesh(new T.CylinderGeometry(0.022, 0.03, 0.2, 10), mats.horn, head);
      o.position.set(sx * 0.08, 0.27, -0.02);
      o.rotation.z = -sx * 0.1;
      const tip = mesh(new T.SphereGeometry(0.04, 12, 10), mats.dark, head);
      tip.position.set(sx * 0.085, 0.38, -0.02);
    }

    // Tail
    const tailBase = new T.Group();
    tailBase.position.set(0, 2.7, -1.1);
    tailBase.rotation.x = -2.2;
    body.add(tailBase);
    let tp = tailBase;
    const tailSegs = [];
    const tlen = 0.26;
    for (let i = 0; i < P.tailSegs; i++) {
      const seg = new T.Group();
      if (i > 0) seg.position.y = tlen;
      tp.add(seg);
      const r0 = 0.045 - i * 0.004;
      const m = new T.Mesh(new T.CylinderGeometry(r0 * 0.8, r0, tlen, 8), mats.dark);
      m.position.y = tlen / 2;
      m.castShadow = true;
      seg.add(m);
      tailSegs.push(seg);
      tp = seg;
    }
    const tuft = mesh(new T.SphereGeometry(0.1, 12, 10), mats.dark, tp);
    tuft.scale.set(0.9, 1.6, 0.9);
    tuft.position.y = 0.12;

    const api = {
      root, body, legs, neckBase, neckSegs, head, tailSegs, mats,
      phase: 0,
      update(dt) {
        this.phase = (this.phase + dt / P.cycle) % 1;
        const p = this.phase;
        const TWO_PI = Math.PI * 2;

        // Legs: stance/swing IK
        for (const k of Object.keys(legs)) {
          const leg = legs[k];
          const q = (p + leg.phase) % 1;
          let fz, lift = 0;
          if (q < P.duty) {
            const u = q / P.duty;
            fz = P.stride / 2 - u * P.stride;
          } else {
            const u = (q - P.duty) / (1 - P.duty);
            fz = -P.stride / 2 + u * P.stride;
            lift = P.lift * Math.sin(Math.PI * u);
          }
          const footY = -(P.hipH - P.ankleH) + lift;
          solveLeg(leg, fz, footY);
        }

        // Body: slight roll and lift, synced to the stride
        body.rotation.z = 0.03 * Math.sin(TWO_PI * p);
        // Neck counter-sways with the stride (bob forward/back)
        for (let i = 0; i < neckSegs.length; i++) {
          const amp = 0.02 + 0.015 * i;
          neckSegs[i].rotation.x = neckSegs[i].userData.base + amp * Math.sin(TWO_PI * p + i * 0.35 + Math.PI);
          neckSegs[i].rotation.z = 0.01 * Math.sin(TWO_PI * p + i * 0.5);
        }
        head.rotation.x = -0.05 + 0.08 * Math.sin(TWO_PI * p + Math.PI);
        // Tail swish
        for (let i = 0; i < tailSegs.length; i++) {
          tailSegs[i].rotation.z = 0.18 * Math.sin(TWO_PI * (p * 0.5) + i * 0.4);
          tailSegs[i].rotation.x = 0.04 * i;
        }
      },
    };
    return api;
  }

  window.makeGiraffe = makeGiraffe;
  window.GIRAFFE_CONFIG = P;
  window.GIRAFFE_WALK_SPEED = WALK_SPEED;
})();
