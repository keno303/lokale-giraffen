/* ============================================================================
   Walking Giraffe — Three.js r128, fully self-contained.
   Runs by opening index.html directly (file://). No server, no build step.
   Everything (scene, rig, walking gait, environment, orbit controls) lives here.
   ========================================================================== */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 0. Tiny deterministic PRNG (mulberry32) for reproducible procedural textures
  // ---------------------------------------------------------------------------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ===========================================================================
  // 1. Procedural textures (canvas-drawn, so no external image files)
  // ===========================================================================

  // Giraffe coat: irregular brown patches on a tawny ground colour.
  // `seed` shifts the whole layout so each call can differ (used along the neck).
  function makeCoatTexture(seed) {
    const S = 1024;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const rand = mulberry32(seed);

    // Ground colour of the coat.
    ctx.fillStyle = '#d6a64e';
    ctx.fillRect(0, 0, S, S);

    // A soft mottled variation under the spots.
    for (let i = 0; i < 2600; i++) {
      const x = rand() * S, y = rand() * S;
      const r = 6 + rand() * 26;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const shade = rand() > 0.5 ? 'rgba(120,80,30,0.10)' : 'rgba(230,190,110,0.10)';
      g.addColorStop(0, shade);
      g.addColorStop(1, 'rgba(180,140,70,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    function blob(cx, cy, baseR, w) {
      const pts = [];
      const n = 9 + Math.floor(rand() * 5);
      const ang0 = rand() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = ang0 + (i / n) * Math.PI * 2;
        const rr = baseR * (0.62 + w * rand());
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      // Smooth closed path through the points.
      ctx.beginPath();
      const p0 = pts[0], pn = pts[pts.length - 1];
      ctx.moveTo((p0[0] + pn[0]) / 2, (p0[1] + pn[1]) / 2);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      }
      ctx.closePath();
    }

    // Large main spots (the crisp-edged patches).
    const big = 8 + Math.floor(rand() * 5);
    for (let i = 0; i < big; i++) {
      const cx = 60 + rand() * (S - 120);
      const cy = 60 + rand() * (S - 120);
      const baseR = 70 + rand() * 120;
      blob(cx, cy, baseR, 0.9);
      ctx.fillStyle = '#b47a33';
      ctx.fill();
      ctx.lineWidth = 10 + rand() * 10;
      ctx.strokeStyle = '#6f431f';
      ctx.stroke();
    }
    // Smaller filler spots that crowd the gaps.
    const fill = 34;
    for (let i = 0; i < fill; i++) {
      const cx = 40 + rand() * (S - 80);
      const cy = 40 + rand() * (S - 80);
      blob(cx, cy, 26 + rand() * 34, 0.8);
      ctx.fillStyle = '#a86f2c';
      ctx.fill();
      ctx.lineWidth = 5 + rand() * 6;
      ctx.strokeStyle = '#6a4220';
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  // Procedural grass for the ground plane.
  function makeGrassTexture() {
    const S = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const rand = mulberry32(7);
    ctx.fillStyle = '#5a8a3c';
    ctx.fillRect(0, 0, S, S);
    // Layered blades / speckle.
    for (let i = 0; i < 15000; i++) {
      const x = rand() * S, y = rand() * S;
      const len = 3 + rand() * 9;
      const shade = rand();
      if (shade < 0.5) ctx.fillStyle = 'rgba(74,120,46,0.5)';
      else if (shade < 0.8) ctx.fillStyle = 'rgba(96,150,60,0.5)';
      else ctx.fillStyle = 'rgba(120,170,74,0.4)';
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rand() - 0.5) * 0.8);
      ctx.fillRect(-1, -len / 2, 1.6, len);
      ctx.restore();
    }
    // A few lighter, drier patches.
    for (let i = 0; i < 14; i++) {
      const x = rand() * S, y = rand() * S, r = 30 + rand() * 70;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(170,160,90,0.22)');
      g.addColorStop(1, 'rgba(120,150,70,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(26, 26);
    tex.anisotropy = 8;
    return tex;
  }

  // Vertical sky gradient for a sky dome.
  function makeSkyTexture() {
    const S = 512;
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = S;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0.0, '#2f63a6');
    g.addColorStop(0.55, '#5f97cf');
    g.addColorStop(0.8, '#b9dcef');
    g.addColorStop(1.0, '#dff0f7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, S);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ===========================================================================
  // 2. Self-contained orbit camera controls (mouse / touch). No external deps.
  // ===========================================================================
  class SimpleOrbitControls {
    constructor(camera, dom) {
      this.camera = camera;
      this.dom = dom;
      this.target = new THREE.Vector3();
      this.enabled = true;
      this.rotateSpeed = 0.0052;
      this.zoomSpeed = 1.09;
      this.panSpeed = 0.9;
      this.minDistance = 4;
      this.maxDistance = 200;
      this.minPitch = 0.04;
      this.maxPitch = Math.PI * 0.495;

      this._theta = Math.PI * 0.28;      // azimuth
      this._phi = Math.PI * 0.30;        // pitch from top
      this._distance = 30;
      this._pan = new THREE.Vector3();
      this._down = false;
      this._button = 0;
      this._last = { x: 0, y: 0 };
      this._worldUp = new THREE.Vector3(0, 1, 0);
      this._left = new THREE.Vector3();
      this._for = new THREE.Vector3();

      this._onDown = (e) => {
        if (!this.enabled) return;
        this._down = true;
        this._button = e.button;
        this._last.x = e.clientX;
        this._last.y = e.clientY;
        e.preventDefault();
      };
      this._onMove = (e) => {
        if (!this._down) return;
        const dx = e.clientX - this._last.x;
        const dy = e.clientY - this._last.y;
        this._last.x = e.clientX;
        this._last.y = e.clientY;
        if (this._button === 0 || this._button === 1) {
          this._theta -= dx * this.rotateSpeed;
          this._phi = clamp(this._phi - dy * this.rotateSpeed, this.minPitch, this.maxPitch);
        } else { // right (or middle) button -> pan
          const range = this._distance * Math.sin(this._phi) * 0.0012;
          this._pan.addScaledVector(this._worldUp, dy * range * this.panSpeed);
          this._left.crossVectors(this._worldUp, this._for).normalize();
          this._pan.addScaledVector(this._left, -dx * range * this.panSpeed);
        }
      };
      this._onUp = () => { this._down = false; };
      this._onWheel = (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        const f = e.deltaY > 0 ? this.zoomSpeed : 1 / this.zoomSpeed;
        this._distance = clamp(this._distance * f, this.minDistance, this.maxDistance);
      };
      // Prevent the browser context menu while panning.
      this._onCtx = (e) => { if (this._button === 2) e.preventDefault(); };

      dom.addEventListener('pointerdown', this._onDown);
      window.addEventListener('pointermove', this._onMove);
      window.addEventListener('pointerup', this._onUp);
      dom.addEventListener('wheel', this._onWheel, { passive: false });
      dom.addEventListener('contextmenu', this._onCtx, { capture: true, passive: false });
    }

    // Initialise the spherical state from a target + camera position.
    reset(target, position) {
      const offset = position.clone().sub(target);
      this._distance = offset.length();
      this._phi = clamp(Math.acos(clamp(offset.y / this._distance, -1, 1)), this.minPitch, this.maxPitch);
      this._theta = Math.atan2(offset.x, offset.z);
      this._pan.set(0, 0, 0);
      this.target.copy(target);
    }

    update() {
      const sp = Math.sin(this._phi);
      this._for
        .set(Math.sin(this._phi) * Math.sin(this._theta), Math.cos(this._phi), Math.sin(this._phi) * Math.cos(this._theta))
        .normalize();
      this._left.crossVectors(this._worldUp, this._for).normalize();

      const pos = this.target
        .clone()
        .addScaledVector(this._for, this._distance)
        .add(this._pan);
      this.camera.position.copy(pos);
      this.camera.lookAt(this.target);
    }
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ===========================================================================
  // 3. Giraffe rig
  // ===========================================================================

  // A single articulated leg: hip -> thigh -> knee -> shin -> hoof, forward-kinematic.
  class Leg {
    constructor(name, side, shoulderPos, isFront) {
      this.name = name;
      this.side = side;                 // +1 right, -1 left
      this.isFront = isFront;

      this.group = new THREE.Group();
      this.group.position.copy(shoulderPos);

      // Hip pivot swings the whole leg forward/back (about X in local space).
      this.hip = new THREE.Group();
      this.hip.position.set(0, 0, 0);
      this.group.add(this.hip);

      const thighLen = 0.90;
      const shinLen = 0.86;
      const hoofH = 0.13;

      // Thigh.
      this.thigh = makeLimb(0.265, 0.185, thighLen, 18);
      this.thigh.position.set(0, -thighLen / 2, 0);
      this.hip.add(this.thigh);

      // Knee, at the foot of the thigh.
      this.knee = new THREE.Group();
      this.knee.position.set(0, -thighLen, 0);
      this.hip.add(this.knee);

      // Shin.
      this.shin = makeLimb(0.185, 0.10, shinLen, 16);
      this.shin.position.set(0, -shinLen / 2, 0);
      this.knee.add(this.shin);

      // Hoof / foot at the ankle.
      this.foot = new THREE.Group();
      this.foot.position.set(0, -shinLen, 0);
      this.knee.add(this.foot);

      const hoof = new THREE.Mesh(
        new THREE.CylinderGeometry(0.135, 0.115, hoofH, 14),
        makeMat(darkMatOpts)
      );
      hoof.position.set(0, -hoofH / 2, 0);
      hoof.castShadow = true; hoof.receiveShadow = true;
      this.foot.add(hoof);

      // A small "dewclaw" pad behind the hoof for extra leg realism.
      const pad = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 10, 8),
        makeMat(darkMatOpts)
      );
      pad.scale.set(1, 0.7, 1.4);
      pad.position.set(0, -hoofH * 0.5, -0.02);
      pad.castShadow = true;
      this.foot.add(pad);
    }

    // cycle: current walk-cycle phase (radians). `phase` staggs the four legs.
    animate(cycle, phase) {
      const a = cycle + phase;
      const swing = SING_AMP * Math.sin(a);
      // Foot lifts off the ground during the forward swing (sin>0).
      const lift = FOOT_LIFT * clamp(Math.sin(a), 0, 1);
      // Knee tucks under when the leg swings backward (sin<0).
      const knee = KNEE_AMP * clamp(-Math.sin(a), 0, 1) + 0.06;

      this.hip.rotation.x = swing;
      this.knee.rotation.x = -knee;
      // Ankle keeps the hoof from flapping: counter-bend so the foot stays low.
      this.foot.rotation.x = -knee * 0.42 - lift * 0.25;

      // Store vertical foot offset for a tiny whole-body weight shift.
      this._footLift = lift;
    }
  }

  function makeLimb(rTop, rBot, len, seg) {
    const geo = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1);
    // Lower the geometry so the pivot sits exactly at the top cap.
    geo.translate(0, -len / 2, 0);
    const m = new THREE.Mesh(geo, makeMat(furMatOpts));
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // ===========================================================================
  // 4. Build the whole giraffe
  // ===========================================================================
  const furMatOpts = { roughness: 0.82, metalness: 0.0 };
  const darkMatOpts = { color: 0x3a2615, roughness: 0.92, metalness: 0.0 };
  const muzzleOpts = { color: 0xca9a54, roughness: 0.88, metalness: 0.0 };
  const hornOpts = { color: 0x5a3d22, roughness: 0.8, metalness: 0.0 };
  const maneOpts = { color: 0x5f3a1c, roughness: 0.95, metalness: 0.0 };
  const eyeOpts = { color: 0x170f08, roughness: 0.25, metalness: 0.0 };

  function buildGiraffe() {
    const g = new THREE.Group();

    const coat = makeCoatTexture(11);
    furMatOpts.map = coat;

    // ---- Body (overlapping ellipsoids for a natural, non-round silhouette) ----
    const body = new THREE.Group();
    g.add(body);

    const torsoGeo = new THREE.SphereGeometry(1, 32, 24);
    const torso = new THREE.Mesh(torsoGeo, makeMat(furMatOpts));
    torso.scale.set(0.96, 0.92, 1.42);
    torso.position.set(0, 2.5, 0.0);
    torso.castShadow = true; torso.receiveShadow = true;
    body.add(torso);

    const chest = new THREE.Mesh(torsoGeo, makeMat(furMatOpts));
    chest.scale.set(0.9, 0.88, 0.72);
    chest.position.set(0, 2.35, 1.05);
    chest.castShadow = true;
    body.add(chest);

    const rump = new THREE.Mesh(torsoGeo, makeMat(furMatOpts));
    rump.scale.set(0.94, 0.9, 0.82);
    rump.position.set(0, 2.58, -1.05);
    rump.castShadow = true;
    body.add(rump);

    const belly = new THREE.Mesh(torsoGeo, makeMat(furMatOpts));
    belly.scale.set(0.72, 0.62, 1.05);
    belly.position.set(0, 1.85, 0.15);
    body.add(belly);

    // ---- Neck (a curved chain of tapered cylinders) ----
    const neckBase = new THREE.Vector3(0, 3.28, 0.92);
    const neckCurve = [
      new THREE.Vector3(0, 0.00, 0.00),
      new THREE.Vector3(0, 1.02, 0.42),
      new THREE.Vector3(0, 2.02, 0.86),
      new THREE.Vector3(0, 3.00, 1.28),
      new THREE.Vector3(0, 3.86, 1.72),
      new THREE.Vector3(0, 4.60, 2.20),
      new THREE.Vector3(0, 5.22, 2.70),
    ];
    const neckRadii = [0.47, 0.45, 0.42, 0.39, 0.35, 0.31, 0.27];

    const neck = new THREE.Group();
    neck.position.copy(neckBase);
    g.add(neck);

    for (let i = 0; i < neckCurve.length - 1; i++) {
      const p = neckCurve[i].clone().sub(neckCurve[i + 1].clone());
      const len = neckCurve[i].distanceTo(neckCurve[i + 1]);
      const dir = neckCurve[i].clone().sub(neckCurve[i + 1]).normalize();

      const segTex = makeCoatTexture(100 + i * 7); // vary spots down the neck
      const segMat = makeMat({ ...furMatOpts, map: segTex });
      const geo = new THREE.CylinderGeometry(neckRadii[i + 1], neckRadii[i], len, 20, 1);
      geo.translate(0, -len / 2, 0);
      const seg = new THREE.Mesh(geo, segMat);
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      seg.position.copy(neckCurve[i + 1].clone().sub(neckBase));
      seg.castShadow = true; seg.receiveShadow = true;
      neck.add(seg);
    }

    // Mane: a row of small pyramids along the top ridge of the neck.
    for (let i = 0; i < neckCurve.length - 1; i++) {
      const mid = neckCurve[i].clone().add(neckCurve[i + 1]).multiplyScalar(0.5);
      const dir = neckCurve[i + 1].clone().sub(neckCurve[i]).normalize();
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.30, 4),
        makeMat(maneOpts)
      );
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      spike.position.copy(mid).sub(neckBase);
      spike.position.y += 0.05;
      spike.castShadow = true;
      neck.add(spike);
    }

    // ---- Head ----
    const head = new THREE.Group();
    head.position.copy(neckCurve[neckCurve.length - 1]).sub(neckBase);
    head.rotation.z = 0.06; // slight forward lean
    g.add(head);

    const skull = new THREE.Mesh(torsoGeo, makeMat(furMatOpts));
    skull.scale.set(0.50, 0.46, 0.62);
    skull.position.set(0, 0, 0);
    skull.castShadow = true;
    head.add(skull);

    // Forehead bulge connecting head to the neck.
    const fore = new THREE.Mesh(torsoGeo, makeMat(furMatOpts));
    fore.scale.set(0.42, 0.42, 0.5);
    fore.position.set(0, 0.10, -0.22);
    fore.castShadow = true;
    head.add(fore);

    const muzzle = new THREE.Mesh(torsoGeo, makeMat(muzzleOpts));
    muzzle.scale.set(0.30, 0.30, 0.52);
    muzzle.position.set(0, -0.04, 0.52);
    muzzle.castShadow = true;
    head.add(muzzle);

    // Ears.
    [-1, 1].forEach((s) => {
      const ear = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 14, 12),
        makeMat(furMatOpts)
      );
      ear.scale.set(0.7, 1.1, 0.45);
      ear.position.set(s * 0.34, 0.42, -0.20);
      ear.rotation.z = s * 0.35;
      ear.rotation.x = -0.25;
      ear.castShadow = true;
      head.add(ear);
      const inner = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 12, 10),
        makeMat({ color: 0x7a4a28, roughness: 0.9 })
      );
      inner.scale.set(0.6, 1.0, 0.5);
      inner.position.set(s * 0.34, 0.42, -0.16);
      inner.rotation.z = s * 0.35;
      head.add(inner);
    });

    // Ossicones (the horn-like bumps).
    [-1, 1].forEach((s) => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.095, 0.5, 12),
        makeMat(hornOpts)
      );
      pole.position.set(s * 0.22, 0.52, -0.06);
      pole.rotation.z = s * -0.12;
      pole.castShadow = true;
      head.add(pole);
      const bump = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 14, 12),
        makeMat(hornOpts)
      );
      bump.position.set(s * 0.21, 0.77, -0.07);
      bump.castShadow = true;
      head.add(bump);
    });

    // Eyes (glossy, with a light brow).
    [-1, 1].forEach((s) => {
      const brow = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 14, 10),
        makeMat(furMatOpts)
      );
      brow.scale.set(1.1, 0.55, 0.6);
      brow.position.set(s * 0.34, 0.16, 0.14);
      brow.rotation.z = s * -0.15;
      head.add(brow);
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 16, 14),
        makeMat(eyeOpts)
      );
      eye.position.set(s * 0.30, 0.06, 0.30);
      head.add(eye);
      // Small specular highlight dot.
      const hl = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      hl.position.set(s * 0.26, 0.10, 0.35);
      head.add(hl);
    });

    // Nostrils.
    [-1, 1].forEach((s) => {
      const n = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 10, 10),
        makeMat({ color: 0x2c1c0e, roughness: 0.9 })
      );
      n.scale.set(0.8, 0.7, 1.2);
      n.position.set(s * 0.11, -0.06, 0.76);
      head.add(n);
    });

    // ---- Legs (front pair then rear pair) ----
    const legs = [];
    const legSpots = {
      FL: { x: 0.70, z: 1.02 }, FR: { x: -0.70, z: 1.02 },
      BL: { x: 0.66, z: -0.92 }, BR: { x: -0.66, z: -0.92 },
    };
    Object.keys(legSpots).forEach((name) => {
      const s = legSpots[name];
      const isFront = name[0] === 'F';
      const shoulder = new THREE.Vector3(s.x, isFront ? 1.96 : 1.9, s.z);
      const leg = new Leg(name, name[1] === 'L' ? 1 : -1, shoulder, isFront);
      g.add(leg.group);
      legs.push(leg);
    });

    // ---- Tail ----
    const tail = new THREE.Group();
    tail.position.set(0, 2.7, -1.42);
    tail.rotation.x = 0.25;
    g.add(tail);
    const tailRod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.035, 1.05, 10),
      makeMat(furMatOpts)
    );
    tailRod.position.set(0, -0.52, 0.05);
    tailRod.castShadow = true;
    tail.add(tailRod);
    const tuft = new THREE.Mesh(
      new THREE.ConeGeometry(0.10, 0.34, 12),
      makeMat(darkMatOpts)
    );
    tuft.position.set(0, -1.08, 0.08);
    tuft.rotation.x = Math.PI;
    tuft.castShadow = true;
    tail.add(tuft);

    return { group: g, body, neck, head, tail, legs };
  }

  function makeMat(opts) {
    return new THREE.MeshStandardMaterial(opts);
  }

  // ===========================================================================
  // 5. Walking gait constants & driver
  // ===========================================================================
  const SING_AMP = 0.46;      // hip swing amplitude (radians)
  const KNEE_AMP = 0.72;      // knee flex amplitude (radians)
  const FOOT_LIFT = 0.18;     // peak vertical hoof lift (world units)
  const BOB_AMP = 0.075;      // whole-body vertical bob
  const ROLL_AMP = 0.032;     // lateral body sway
  const PITCH_AMP = 0.030;    // forward-back nod
  const WALK_FREQ = 6.6;      // leg-swing angular frequency (radians/sec)
  const CIRCLE_OMEGA = 0.20;  // how fast the giraffe circles the scene

  // Per-leg walk phases (staggered four-phase walk).
  const legPhase = { FL: 0, FR: Math.PI / 2, BR: Math.PI, BL: (3 * Math.PI) / 2 };

  function driveGiraffe(parts, t) {
    const cycle = t * WALK_FREQ;

    // Per-leg kinematics with a staggered four-phase walk.
    let avgFoot = 0;
    for (let i = 0; i < parts.legs.length; i++) {
      const leg = parts.legs[i];
      const phase = legPhase[leg.name];
      leg.animate(cycle, phase);
      avgFoot += leg._footLift;
    }
    avgFoot /= parts.legs.length;

    // Body bob & sway, synced to the stride (2× per cycle for the walk).
    parts.body.position.y = BOB_AMP * Math.sin(cycle * 2) + avgFoot * 0.4;
    parts.body.rotation.z = ROLL_AMP * Math.sin(cycle);
    parts.body.rotation.x = PITCH_AMP * Math.sin(cycle * 2 - 0.5);
    // The head bobs a touch against the body so it doesn't look bolted on.
    parts.head.rotation.x = 0.06 + 0.02 * Math.sin(cycle * 2 + 0.8);

    // Tail sway.
    parts.tail.rotation.z = 0.12 * Math.sin(t * 2.3 + 1.2);
    parts.tail.rotation.x = 0.25 + 0.08 * Math.sin(t * 1.7);

    // Walk the giraffe around a slow circle so the camera can enjoy all sides.
    const ang = t * CIRCLE_OMEGA;
    parts.group.position.x = Math.cos(ang) * 9;
    parts.group.position.z = Math.sin(ang) * 9;
    parts.group.position.y = 0;
    // Face the direction of travel (tangent to the circle).
    parts.group.rotation.y = ang + Math.PI / 2;
  }

  // ===========================================================================
  // 6. Environment (ground, sky, lights, props)
  // ===========================================================================
  function makeGround() {
    const geo = new THREE.PlaneGeometry(260, 260, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      map: makeGrassTexture(),
      roughness: 1.0,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    return ground;
  }

  function makeSky() {
    const geo = new THREE.SphereGeometry(180, 32, 16);
    const mat = new THREE.MeshBasicMaterial({
      map: makeSkyTexture(),
      side: THREE.BackSide,
      fog: false,
    });
    return new THREE.Mesh(geo, mat);
  }

  // Stylised acacia tree (the flat-topped savanna silhouette).
  function makeAcacia(x, z, scale, seed) {
    const tree = new THREE.Group();
    const rand = mulberry32(seed);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4326, roughness: 0.95 });

    const h = 3.4 * scale;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.28 * scale, h, 8), trunkMat);
    trunk.position.y = h / 2;
    trunk.castShadow = true; trunk.receiveShadow = true;
    tree.add(trunk);

    // A few splaying branches.
    for (let i = 0; i < 3; i++) {
      const a = rand() * Math.PI * 2;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * scale, 0.09 * scale, 1.6 * scale, 6), trunkMat);
      br.position.set(Math.cos(a) * 0.25 * scale, h - 0.2 * scale, Math.sin(a) * 0.25 * scale);
      br.rotation.z = Math.cos(a) * 0.6;
      br.rotation.x = Math.sin(a) * 0.6;
      br.castShadow = true;
      tree.add(br);
    }

    // Flat umbrella canopy (a wide, flattened ellipsoid).
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4c7a34, roughness: 0.95 });
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), leafMat);
    canopy.scale.set(2.6 * scale, 0.35 * scale, 2.2 * scale);
    canopy.position.set((rand() - 0.5) * 0.4 * scale, h + 0.05 * scale, (rand() - 0.5) * 0.4 * scale);
    canopy.castShadow = true; canopy.receiveShadow = true;
    tree.add(canopy);

    // A little extra foliage texture via darker blobs.
    const blobMat = new THREE.MeshStandardMaterial({ color: 0x3c6628, roughness: 0.95 });
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.7 * scale, 10, 8), blobMat);
      b.scale.set(1.4, 0.4, 1.3);
      b.position.set((rand() - 0.5) * 3.2 * scale, h + 0.02 * scale, (rand() - 0.5) * 2.6 * scale);
      b.castShadow = true;
      tree.add(b);
    }
    tree.position.set(x, 0, z);
    return tree;
  }

  function makeBush(x, z, s, seed) {
    const rand = mulberry32(seed);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4b7d37, roughness: 0.95 });
    const b = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 10), mat);
    core.scale.set(1, 0.75, 1);
    core.position.y = s * 0.5;
    core.castShadow = true; core.receiveShadow = true;
    b.add(core);
    for (let i = 0; i < 3; i++) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(s * 0.55, 10, 8), mat);
      n.scale.set(1.1, 0.7, 1.1);
      n.position.set((rand() - 0.5) * s * 1.6, s * (0.4 + rand() * 0.3), (rand() - 0.5) * s * 1.6);
      n.castShadow = true;
      b.add(n);
    }
    b.position.set(x, 0, z);
    return b;
  }

  function makeRock(x, z, s, seed) {
    const rand = mulberry32(seed);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.98, flatShading: true });
    const r = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), mat);
    r.scale.set(1, 0.6 + rand() * 0.5, 1 + rand() * 0.4);
    r.position.set((rand() - 0.5) * s, s * 0.3, (rand() - 0.5) * s);
    r.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    r.castShadow = true; r.receiveShadow = true;
    return r;
  }

  // ===========================================================================
  // 7. Scene setup, render loop
  // ===========================================================================
  function fitCamera(camera, object, padding) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const fov = camera.fov * Math.PI / 180;
    const distH = (size.y * 0.5) / Math.tan(fov / 2) * padding;
    const distW = (size.x * 0.5) / Math.tan(fov / 2) * padding;
    const dist = Math.max(distH, distW, 6);
    const dir = new THREE.Vector3(0.34, 0.24, 0.88).normalize();
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.lookAt(center);
    return center;
  }

  function main() {
    const app = document.getElementById('app');

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    app.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfe0f5);
    scene.fog = new THREE.Fog(0xbfe0f5, 60, 220);

    const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 600);

    // Lights.
    const hemi = new THREE.HemisphereLight(0xcfeaff, 0x4a5a30, 0.75);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d8, 1.55);
    sun.position.set(24, 40, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 160;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);

    // World.
    scene.add(makeSky());
    scene.add(makeGround());

    // Props scattered around the savanna.
    const propSeed = 3;
    scene.add(makeAcacia(-26, -18, 1.4, propSeed));
    scene.add(makeAcacia(30, -26, 1.1, propSeed + 1));
    scene.add(makeAcacia(22, 22, 1.7, propSeed + 2));
    scene.add(makeAcacia(-34, 16, 1.0, propSeed + 4));
    scene.add(makeBush(-8, 12, 1.4, propSeed + 5));
    scene.add(makeBush(10, -8, 1.1, propSeed + 6));
    scene.add(makeBush(-16, -6, 0.9, propSeed + 7));
    scene.add(makeRock(6, 6, 0.8, propSeed + 8));
    scene.add(makeRock(-4, -12, 1.1, propSeed + 9));
    scene.add(makeRock(18, 4, 0.6, propSeed + 10));

    // The giraffe.
    const parts = buildGiraffe();
    scene.add(parts.group);
    const center = fitCamera(camera, parts.group, 1.35);

    const controls = new SimpleOrbitControls(camera, renderer.domElement);
    controls.reset(center, camera.position);

    const clock = new THREE.Clock();
    let t = 0;
    function animate() {
      requestAnimationFrame(animate);
      t += Math.min(clock.getDelta(), 0.05);
      driveGiraffe(parts, t);
      // Follow-cam: keep the orbit target centred on the walking giraffe.
      controls.target.copy(parts.group.position);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', onResize);
    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  // Kick off once the DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      try { main(); } catch (e) { console.error('Giraffe scene failed to start:', e); }
    });
  } else {
    try { main(); } catch (e) { console.error('Giraffe scene failed to start:', e); }
  }
})();
