/* The giraffe: lofted anatomy, procedural rig, walk cycle. */
(function (G) {
  'use strict';

  var TAU = Math.PI * 2;
  var V = THREE.Vector3;

  var GAIT = {
    period: 1.08,
    duty: 0.665,
    speed: 1.28,
    hoofY: 0.222
  };
  GAIT.stride = GAIT.speed * GAIT.period;
  GAIT.A = GAIT.stride * GAIT.duty * 0.5;

  var PIVOT = new V(0, 2.56, 0);

  function mkMesh(geo, mat, cast, recv) {
    var m = new THREE.Mesh(geo, mat);
    m.castShadow = cast !== false;
    m.receiveShadow = recv !== false;
    return m;
  }

  function ringZ(z, cy, rx, ry, exp, cx) {
    return {
      c: new V(cx || 0, cy, z),
      ax: new V(1, 0, 0),
      ay: new V(0, 1, 0),
      rx: rx, ry: ry, exp: exp || 2.2
    };
  }

  /* fill an existing loft geometry from a new set of rings */
  function writeRings(geo, rings, radial) {
    var pos = geo.attributes.position.array;
    var nRings = rings.length;
    for (var i = 0; i < nRings; i++) {
      var r = rings[i];
      var e = 2 / (r.exp || 2);
      for (var j = 0; j < radial; j++) {
        var a = j / radial * TAU;
        var ca = Math.cos(a), sa = Math.sin(a);
        var px = (ca < 0 ? -1 : 1) * Math.pow(Math.abs(ca), e) * r.rx;
        var py = (sa < 0 ? -1 : 1) * Math.pow(Math.abs(sa), e) * r.ry;
        var k = (i * radial + j) * 3;
        pos[k] = r.c.x + r.ax.x * px + r.ay.x * py;
        pos[k + 1] = r.c.y + r.ax.y * px + r.ay.y * py;
        pos[k + 2] = r.c.z + r.ax.z * px + r.ay.z * py;
      }
    }
    var c0 = nRings * radial, c1 = c0 + 1;
    pos[c0 * 3] = rings[0].c.x; pos[c0 * 3 + 1] = rings[0].c.y; pos[c0 * 3 + 2] = rings[0].c.z;
    var rl = rings[nRings - 1];
    pos[c1 * 3] = rl.c.x; pos[c1 * 3 + 1] = rl.c.y; pos[c1 * 3 + 2] = rl.c.z;
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }

  function ik2(a, target, l1, l2, pole, outMid) {
    var d = new V().subVectors(target, a);
    var dist = d.length();
    var maxd = (l1 + l2) * 0.9995;
    if (dist > maxd) dist = maxd;
    if (dist < 1e-4) dist = 1e-4;
    d.normalize();
    var x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
    var h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    var perp = pole.clone();
    perp.addScaledVector(d, -perp.dot(d));
    if (perp.lengthSq() < 1e-8) perp.set(0, 0, 1);
    perp.normalize();
    outMid.copy(a).addScaledVector(d, x).addScaledVector(perp, h);
    return d;
  }

  function placeSeg(mesh, a, b) {
    var d = new V().subVectors(b, a);
    mesh.position.copy(a);
    G.basisQuat(d, new V(1, 0, 0), mesh.quaternion);
  }

  /* ------------------------------------------------------------------ */

  G.Giraffe = function () {
    this.root = new THREE.Group();
    this.root.name = 'giraffe';
    this.body = new THREE.Group();
    this.root.add(this.body);

    this.pivot = PIVOT;
    this.drop = 0.145;

    this.coatMat = G.tex.makeCoatMaterial({ roughness: 0.76 });
    this.maneMat = new THREE.MeshStandardMaterial({
      map: G.tex.hair(), color: 0xffffff, roughness: 0.92, metalness: 0,
      alphaTest: 0.35, side: THREE.DoubleSide
    });
    this.hoofMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.55, metalness: 0.05, vertexColors: true
    });
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: G.col(0x0c0906), roughness: 0.12, metalness: 0.1
    });
    this.darkMat = new THREE.MeshStandardMaterial({
      color: G.col(0x2e241c), roughness: 0.75
    });
    this.hornMat = new THREE.MeshStandardMaterial({
      color: G.col(0x3d2f22), roughness: 0.85
    });
    this.innerEarMat = new THREE.MeshStandardMaterial({
      color: G.col(0x6d5140), roughness: 0.9
    });

    this.coatParts = [];   // { mesh, kind }

    this.buildTorso();
    this.buildLegs();
    this.buildNeck();
    this.buildHead();
    this.buildTail();

    this.setPose(0);
    this.root.updateMatrixWorld(true);
    this.bakeAll();
  };

  /* ---------------------------- torso ------------------------------- */

  G.Giraffe.prototype.buildTorso = function () {
    var data = [
      [-1.20, 2.880, 0.10, 0.060, 2.0],
      [-1.16, 2.870, 0.14, 0.140, 2.05],
      [-1.08, 2.850, 0.20, 0.235, 2.15],
      [-0.96, 2.825, 0.28, 0.305, 2.25],
      [-0.82, 2.805, 0.35, 0.360, 2.4],
      [-0.64, 2.790, 0.42, 0.395, 2.5],
      [-0.42, 2.795, 0.44, 0.425, 2.5],
      [-0.16, 2.795, 0.475, 0.440, 2.5],
      [0.10, 2.780, 0.505, 0.455, 2.5],
      [0.34, 2.790, 0.545, 0.462, 2.5],
      [0.56, 2.800, 0.575, 0.462, 2.45],
      [0.74, 2.800, 0.560, 0.452, 2.4],
      [0.90, 2.790, 0.520, 0.430, 2.3],
      [1.02, 2.735, 0.540, 0.375, 2.2],
      [1.11, 2.750, 0.405, 0.285, 2.1],
      [1.17, 2.785, 0.235, 0.170, 2.0],
      [1.20, 2.785, 0.135, 0.075, 2.0]
    ];
    var rings = [];
    for (var i = 0; i < data.length; i++) {
      var d = data[i];
      rings.push(ringZ(d[0], d[1], d[3], d[2], d[4]));
    }
    var geo = G.geom.loft(rings, 44, true, true);
    this.torso = mkMesh(geo, this.coatMat);
    this.body.add(this.torso);
    this.coatParts.push({ mesh: this.torso, kind: 'torso' });

    // shoulder blades and haunches
    var s;
    for (s = -1; s <= 1; s += 2) {
      var sh = mkMesh(G.geom.ellipsoid(0.10, 0.255, 0.235, 22, 16), this.coatMat);
      sh.position.set(s * 0.365, 3.02, 0.63);
      sh.rotation.z = s * 0.10;
      sh.rotation.x = 0.06;
      sh.scale.set(1, 1, 1);
      this.body.add(sh);
      this.coatParts.push({ mesh: sh, kind: 'torso' });

      var ha = mkMesh(G.geom.ellipsoid(0.115, 0.265, 0.255, 22, 16), this.coatMat);
      ha.position.set(s * 0.355, 2.74, -0.62);
      ha.rotation.z = s * 0.06;
      this.body.add(ha);
      this.coatParts.push({ mesh: ha, kind: 'torso' });

      // upper-arm muscle just below the shoulder
      var ua = mkMesh(G.geom.ellipsoid(0.092, 0.19, 0.145, 18, 14), this.coatMat);
      ua.position.set(s * 0.355, 2.49, 0.60);
      this.body.add(ua);
      this.coatParts.push({ mesh: ua, kind: 'torso' });
    }

    // shoulder / chest blend running down from the neck
    var br = mkMesh(G.geom.ellipsoid(0.235, 0.155, 0.265, 24, 16), this.coatMat);
    br.position.set(0, 2.94, 0.80);
    this.body.add(br);
    this.coatParts.push({ mesh: br, kind: 'torso' });

    this.buildBackMane();
  };

  G.Giraffe.prototype.buildBackMane = function () {
    var pts = [
      [0.92, 3.36], [0.7, 3.40], [0.45, 3.38], [0.2, 3.35],
      [0.0, 3.32], [-0.25, 3.28], [-0.5, 3.25]
    ];
    var a = [], b = [];
    for (var i = 0; i < pts.length; i++) {
      a.push(new V(0, pts[i][1] - 0.01, pts[i][0]));
      b.push(new V(0, pts[i][1] + 0.038, pts[i][0] - 0.006));
    }
    var geo = G.geom.ribbon(a, b);
    var m = mkMesh(geo, this.maneMat, true, false);
    this.body.add(m);
  };

  /* ---------------------------- legs -------------------------------- */

  G.Giraffe.prototype.makeLegDefs = function () {
    var defs = [];
    var sides = [-1, 1];

    for (var i = 0; i < sides.length; i++) {
      var s = sides[i];
      var front = {
        front: true, side: s,
        shoulder: new V(s * 0.325, 2.42, 0.60),
        carpus: new V(s * 0.330, 1.15, 0.44),
        fetlock: new V(s * 0.330, GAIT.hoofY, 0.52),
        footX: s * 0.330, footZ: 0.52,
        phase: i === 0 ? 0.07 : 0.57
      };
      defs.push(front);

      var hind = {
        front: false, side: s,
        hip: new V(s * 0.345, 2.50, -0.60),
        stifle: new V(s * 0.352, 1.75, -0.20),
        hock: new V(s * 0.345, 0.95, -0.56),
        fetlock: new V(s * 0.345, GAIT.hoofY, -0.50),
        footX: s * 0.345, footZ: -0.50,
        phase: i === 0 ? 0.0 : 0.50
      };
      defs.push(hind);
    }
    return defs;
  };

  G.Giraffe.prototype.buildLegs = function () {
    var defs = this.makeLegDefs();
    this.legs = [];
    this.legMeshes = [];
    var self = this;

    defs.forEach(function (d) {
      var leg = { def: d, side: d.side, front: d.front };
      var sideHint = new V(1, 0, 0);

      if (d.front) {
        leg.l1 = d.shoulder.distanceTo(d.carpus);
        leg.l2 = d.carpus.distanceTo(d.fetlock);
        leg.root = d.shoulder;
        leg.upper = mkMesh(G.geom.segment(leg.l1, [
          [0.0, 0.215, 0.255], [0.12, 0.228, 0.272], [0.32, 0.195, 0.222],
          [0.55, 0.152, 0.174], [0.78, 0.124, 0.135], [0.93, 0.113, 0.120], [1.0, 0.108, 0.115]
        ], 18, 2.3), self.coatMat);
        leg.lower = mkMesh(G.geom.segment(leg.l2, [
          [0.0, 0.115, 0.123], [0.08, 0.104, 0.111], [0.35, 0.084, 0.091],
          [0.62, 0.077, 0.084], [0.88, 0.089, 0.095], [1.0, 0.101, 0.107]
        ], 16, 2.2), self.coatMat);
        leg.kneeBall = mkMesh(G.geom.ellipsoid(0.10, 0.109, 0.104, 16, 12), self.coatMat);
        leg.fetlockBall = mkMesh(G.geom.ellipsoid(0.094, 0.081, 0.10, 16, 12), self.coatMat);
        leg.stifleBall = null;
        leg.hockBall = null;
        leg.cannon = leg.lower; // the lower segment is the cannon
      } else {
        leg.lf = d.hip.distanceTo(d.stifle);
        leg.lt = d.stifle.distanceTo(d.hock);
        leg.lc = d.hock.distanceTo(d.fetlock);
        leg.root = d.hip;
        leg.upper = mkMesh(G.geom.segment(leg.lf, [
          [0.0, 0.255, 0.315], [0.16, 0.282, 0.348], [0.42, 0.235, 0.295],
          [0.7, 0.170, 0.212], [0.9, 0.132, 0.155], [1.0, 0.119, 0.138]
        ], 20, 2.35), self.coatMat);
        leg.lower = mkMesh(G.geom.segment(leg.lt, [
          [0.0, 0.148, 0.180], [0.2, 0.161, 0.196], [0.45, 0.129, 0.154],
          [0.72, 0.099, 0.111], [0.9, 0.088, 0.095], [1.0, 0.086, 0.092]
        ], 16, 2.2), self.coatMat);
        leg.cannon = mkMesh(G.geom.segment(leg.lc, [
          [0.0, 0.102, 0.110], [0.12, 0.092, 0.100], [0.42, 0.079, 0.086],
          [0.72, 0.084, 0.091], [0.9, 0.094, 0.100], [1.0, 0.099, 0.106]
        ], 16, 2.2), self.coatMat);
        leg.kneeBall = mkMesh(G.geom.ellipsoid(0.112, 0.126, 0.126, 16, 12), self.coatMat);
        leg.fetlockBall = mkMesh(G.geom.ellipsoid(0.096, 0.082, 0.102, 16, 12), self.coatMat);
        leg.stifleBall = null;
        leg.hockBall = mkMesh(G.geom.ellipsoid(0.092, 0.108, 0.100, 16, 12), self.coatMat);
        leg.cannon = leg.cannon;
      }

      var hoofGeo = G.geom.segment(0.225, [
        [0.0, 0.126, 0.158], [0.18, 0.138, 0.170], [0.45, 0.126, 0.141],
        [0.72, 0.109, 0.116], [0.9, 0.100, 0.105], [1.0, 0.094, 0.099]
      ], 18, 2.6);
      // vertex colours: dark horn, lighter coronet band
      var hp = hoofGeo.attributes.position;
      var hc = new Float32Array(hp.count * 3);
      for (var vi = 0; vi < hp.count; vi++) {
        var yy = hp.getY(vi) / 0.225;
        var dark = G.lerp(0.14, 0.42, G.smoothstep(0.55, 0.95, yy));
        // warmer toward the top of the hoof
        hc[vi * 3] = dark * 1.25;
        hc[vi * 3 + 1] = dark * 1.05;
        hc[vi * 3 + 2] = dark * 0.92;
      }
      hoofGeo.setAttribute('color', new THREE.BufferAttribute(hc, 3));
      hoofGeo.translate(0, -0.225, 0);
      leg.hoof = mkMesh(hoofGeo, self.hoofMat);

      leg.all = [leg.upper, leg.lower, leg.kneeBall, leg.fetlockBall, leg.hoof];
      if (leg.cannon !== leg.lower) leg.all.push(leg.cannon);
      if (leg.stifleBall) leg.all.push(leg.stifleBall);
      if (leg.hockBall) leg.all.push(leg.hockBall);

      leg.all.forEach(function (m) {
        self.root.add(m);
        self.legMeshes.push(m);
        if (m !== leg.hoof) self.coatParts.push({ mesh: m, kind: 'limb' });
      });

      // rest orientation, used for baking
      if (d.front) {
        placeSeg(leg.upper, d.shoulder, d.carpus);
        placeSeg(leg.lower, d.carpus, d.fetlock);
        leg.kneeBall.position.copy(d.carpus);
        leg.fetlockBall.position.copy(d.fetlock);
      } else {
        placeSeg(leg.upper, d.hip, d.stifle);
        placeSeg(leg.lower, d.stifle, d.hock);
        placeSeg(leg.cannon, d.hock, d.fetlock);
        leg.kneeBall.position.copy(d.stifle);
        leg.hockBall.position.copy(d.hock);
        leg.fetlockBall.position.copy(d.fetlock);
      }

      self.legs.push(leg);
    });
  };

  /* ---------------------------- neck -------------------------------- */

  G.Giraffe.prototype.neckRadii = function (s) {
    // sagittal (depth) and lateral radii along the neck
    var t = s;
    var sag = 0.135 * Math.pow(1 - t, 0.55) + 0.112;
    var lat = 0.088 * Math.pow(1 - t, 0.55) + 0.100;
    return [sag, lat];
  };

  G.Giraffe.prototype.buildNeck = function () {
    var self = this;
    this.neck = {
      base: new V(0, 3.12, 0.66),
      length: 2.22,
      n: 30,
      radial: 22,
      rings: [],
      maneA: [],
      maneB: []
    };

    // rest rings
    var n = this.neck.n, L = this.neck.length;
    var ds = L / (n - 1);
    var p = this.neck.base.clone();
    for (var i = 0; i < n; i++) {
      var s = i / (n - 1);
      var theta = 0.455 - 0.15 * s;
      var dir = new V(0, Math.cos(theta), Math.sin(theta));
      var side = new V(1, 0, 0);
      var up = new V().crossVectors(dir, side).normalize();
      var rr = this.neckRadii(s);
      this.neck.rings.push({ c: p.clone(), ax: side, ay: up, rx: rr[1], ry: rr[0], exp: 2.25 });
      if (i < n - 1) p.addScaledVector(dir, ds);
    }

    var geo = G.geom.loft(this.neck.rings, this.neck.radial, true, true);
    // bake coat space from the rest geometry before it is ever animated
    this.neck.geoRest = geo;
    this.neckMesh = mkMesh(geo, this.coatMat);
    this.body.add(this.neckMesh);
    this.coatParts.push({ mesh: this.neckMesh, kind: 'neck' });

    // mane ribbon
    var a = [], b = [];
    for (var k = 0; k < n; k++) {
      var r = this.neck.rings[k];
      var base = r.c.clone().addScaledVector(r.ay, r.ry * 0.97);
      a.push(base);
      b.push(base.clone().addScaledVector(r.ay, 0.058));
    }
    this.maneGeo = G.geom.ribbon(a, b);
    this.neck.maneA = a; this.neck.maneB = b;
    this.maneMesh = mkMesh(this.maneGeo, this.maneMat, true, false);
    this.body.add(this.maneMesh);
    this.maneMesh.renderOrder = 1;
  };

  G.Giraffe.prototype.updateNeck = function (p) {
    var n = this.neck.n, L = this.neck.length;
    var ds = L / (n - 1);
    var rings = [];
    var pitchAnim = 0.040 * Math.sin(TAU * p + 0.75) + 0.010 * Math.sin(TAU * 2 * p + 2.1);
    var latAnim = 0.030 * Math.sin(TAU * p * 0.5 + 0.4) * 0.7 +
      0.018 * Math.sin(TAU * p + 1.7);
    var pnt = this.neck.base.clone();
    var a = [], b = [];
    for (var i = 0; i < n; i++) {
      var s = i / (n - 1);
      var theta = 0.455 - 0.15 * s + pitchAnim * Math.pow(s, 1.25);
      var phi = latAnim * Math.pow(s, 1.5);
      var dir = new V(
        Math.sin(theta) * Math.sin(phi),
        Math.cos(theta),
        Math.sin(theta) * Math.cos(phi)
      );
      var side = new V(Math.cos(phi), 0, -Math.sin(phi));
      var up = new V().crossVectors(dir, side).normalize();
      var rr = this.neckRadii(s);
      rings.push({ c: pnt.clone(), ax: side, ay: up, rx: rr[1], ry: rr[0], exp: 2.25 });
      var baseP = pnt.clone().addScaledVector(up, rr[0] * 0.97);
      a.push(baseP);
      b.push(baseP.clone().addScaledVector(up, 0.052 + 0.010 * Math.sin(i * 1.7)).addScaledVector(dir, -0.010));
      if (i < n - 1) {
        var dm = new V(
          Math.sin(theta) * Math.sin(phi),
          Math.cos(theta),
          Math.sin(theta) * Math.cos(phi)
        );
        pnt.addScaledVector(dm, ds);
      }
    }
    this.neck.rings = rings;
    writeRings(this.neck.geoRest, rings, this.neck.radial);

    // update the mane ribbon in place
    var mp = this.maneGeo.attributes.position.array;
    for (var k = 0; k < n; k++) {
      var kk = k * 6;
      mp[kk] = a[k].x; mp[kk + 1] = a[k].y; mp[kk + 2] = a[k].z;
      mp[kk + 3] = b[k].x; mp[kk + 4] = b[k].y; mp[kk + 5] = b[k].z;
    }
    this.maneGeo.attributes.position.needsUpdate = true;
    this.maneGeo.computeVertexNormals();
    this.maneGeo.computeBoundingSphere();

    var tip = rings[n - 1];
    this.neckTip = tip;
  };

  /* ---------------------------- head -------------------------------- */

  G.Giraffe.prototype.buildHead = function () {
    var self = this;
    this.headGroup = new THREE.Group();
    this.headGroup.name = 'head';
    this.headGroup.scale.setScalar(1.12);
    this.body.add(this.headGroup);

    var data = [
      [-0.10, 0.000, 0.100, 0.112],
      [-0.055, 0.015, 0.118, 0.130],
      [0.01, 0.020, 0.132, 0.152],
      [0.09, 0.014, 0.132, 0.150],
      [0.17, 0.003, 0.121, 0.136],
      [0.27, -0.014, 0.108, 0.118],
      [0.37, -0.030, 0.096, 0.101],
      [0.46, -0.044, 0.088, 0.089],
      [0.545, -0.055, 0.085, 0.082],
      [0.605, -0.063, 0.075, 0.070],
      [0.645, -0.069, 0.058, 0.053],
      [0.672, -0.073, 0.031, 0.029]
    ];
    var rings = [];
    for (var i = 0; i < data.length; i++) {
      rings.push(ringZ(data[i][0], data[i][1], data[i][2], data[i][3], 2.35));
    }
    var geo = G.geom.loft(rings, 30, true, true);
    var skull = mkMesh(geo, this.coatMat);
    this.headGroup.add(skull);
    this.coatParts.push({ mesh: skull, kind: 'head' });
    this.headSkull = skull;

    // jaw / cheek masses
    var jaw = mkMesh(G.geom.ellipsoid(0.062, 0.048, 0.155, 20, 14), this.coatMat);
    jaw.position.set(0, -0.088, 0.30);
    this.headGroup.add(jaw);
    this.coatParts.push({ mesh: jaw, kind: 'head' });

    for (var s = -1; s <= 1; s += 2) {
      var cheek = mkMesh(G.geom.ellipsoid(0.028, 0.062, 0.08, 16, 12), this.coatMat);
      cheek.position.set(s * 0.085, -0.022, 0.115);
      this.headGroup.add(cheek);
      this.coatParts.push({ mesh: cheek, kind: 'head' });

      // eye — sits proud of the skull so it reads from any angle
      var eye = mkMesh(new THREE.SphereGeometry(0.032, 20, 14), this.eyeMat, true, false);
      eye.position.set(s * 0.136, 0.030, 0.112);
      eye.scale.set(0.78, 1.0, 1.10);
      this.headGroup.add(eye);

      // eyelid rim
      var lid = mkMesh(new THREE.TorusGeometry(0.036, 0.0075, 8, 20), this.darkMat, false, false);
      lid.position.copy(eye.position);
      lid.position.x -= s * 0.004;
      lid.rotation.y = Math.PI / 2;
      lid.scale.set(1, 1, 0.88);
      this.headGroup.add(lid);

      // ear group
      var ear = new THREE.Group();
      var earGeo = G.geom.segment(0.27, [
        [0.0, 0.026, 0.013], [0.18, 0.055, 0.017], [0.45, 0.068, 0.018],
        [0.7, 0.052, 0.014], [0.88, 0.031, 0.009], [1.0, 0.008, 0.004]
      ], 12, 2.0);
      var earMesh = mkMesh(earGeo, this.coatMat);
      ear.add(earMesh);
      this.coatParts.push({ mesh: earMesh, kind: 'limb' });

      var inner = mkMesh(G.geom.ellipsoid(0.038, 0.078, 0.005, 14, 10), this.innerEarMat, false, false);
      inner.position.set(0, 0.118, 0.013);
      inner.scale.set(1, 1, 1);
      ear.add(inner);

      var eDir = new V(s * 0.70, 0.46, -0.44).normalize();
      ear.position.set(s * 0.108, 0.062, -0.022);
      G.basisQuat(eDir, new V(0, 1, 0), ear.quaternion);
      this.headGroup.add(ear);
      if (s === -1) this.earL = ear; else this.earR = ear;

      // ossicone
      var oDir = new V(s * 0.22, 0.95, -0.16).normalize();
      var oBase = new V(s * 0.048, 0.115, -0.015);
      var stalk = mkMesh(new THREE.CylinderGeometry(0.020, 0.028, 0.135, 12), this.hornMat);
      stalk.position.copy(oBase).addScaledVector(oDir, 0.064);
      G.basisQuat(oDir, new V(1, 0, 0), stalk.quaternion);
      this.headGroup.add(stalk);
      var knob = mkMesh(new THREE.SphereGeometry(0.037, 16, 12), this.hornMat);
      knob.position.copy(oBase).addScaledVector(oDir, 0.136);
      knob.scale.set(1.0, 0.9, 1.0);
      this.headGroup.add(knob);

      // nostril
      var nos = mkMesh(G.geom.ellipsoid(0.017, 0.011, 0.020, 12, 8), this.darkMat, false, false);
      nos.position.set(s * 0.045, -0.055, 0.605);
      nos.rotation.y = s * 0.25;
      this.headGroup.add(nos);
    }

    // mouth line
    var curve = new THREE.CatmullRomCurve3([
      new V(-0.055, -0.078, 0.545),
      new V(0, -0.089, 0.625),
      new V(0.055, -0.078, 0.545)
    ]);
    var mouth = mkMesh(new THREE.TubeGeometry(curve, 14, 0.0035, 5, false), this.darkMat, false, false);
    this.headGroup.add(mouth);

    // poll tuft
    var tuftA = [], tuftB = [];
    for (var k = 0; k < 5; k++) {
      var zz = -0.14 + k * 0.035;
      tuftA.push(new V(0, 0.142, zz));
      tuftB.push(new V(0, 0.20, zz - 0.01));
    }
    var tuft = mkMesh(G.geom.ribbon(tuftA, tuftB), this.maneMat, true, false);
    this.headGroup.add(tuft);
  };

  G.Giraffe.prototype.updateHead = function (p, t) {
    var tip = this.neckTip;
    var neckDir = new V().subVectors(tip.c, this.neck.rings[this.neck.n - 2].c).normalize();
    var tipTheta = Math.asin(G.clamp(neckDir.z, -1, 1));
    var tipLat = Math.atan2(neckDir.x, neckDir.z);

    // head looks around slowly, with a small stride-synced nod
    var lookYaw = 0.055 * Math.sin(t * 0.37 + 1.1) + 0.025 * Math.sin(t * 0.83 + 0.2);
    var lookPitch = 0.035 * Math.sin(t * 0.29 + 2.3) + 0.010 * Math.sin(TAU * p + 1.0);

    var theta = 0.30 + 0.96 + lookPitch; // from vertical
    var phi = tipLat + lookYaw;
    var fwd = new V(
      Math.sin(theta) * Math.sin(phi),
      Math.cos(theta),
      Math.sin(theta) * Math.cos(phi)
    ).normalize();
    var q = new THREE.Quaternion();
    G.forwardBasisQuat(fwd, new V(0, 1, 0), q);

    var hq = new THREE.Quaternion().copy(q);
    this.headGroup.quaternion.copy(hq);
    this.headGroup.position.copy(tip.c).addScaledVector(fwd, 0.005);

    // ear flicks
    if (this.earL && this.earR) {
      var flickL = Math.max(0, Math.sin(t * 0.53 + 0.9) - 0.975) * 22;
      var flickR = Math.max(0, Math.sin(t * 0.41 + 3.3) - 0.975) * 22;
      this.earL.rotation.x = -0.06 - flickL * 0.5;
      this.earR.rotation.x = -0.06 - flickR * 0.5;
    }
  };

  /* ---------------------------- tail -------------------------------- */

  G.Giraffe.prototype.buildTail = function () {
    var self = this;
    this.tail = {
      base: new V(0, 2.945, -1.04),
      n: 9, radial: 12, len: 1.16,
      geo: null,
      pts: []
    };
    var rings = [];
    for (var i = 0; i < this.tail.n; i++) {
      var s = i / (this.tail.n - 1);
      var r = G.lerp(0.045, 0.016, Math.pow(s, 0.85));
      rings.push({
        c: new V(0, 2.945 - s * 1.16, -1.04 - s * 0.02 + Math.sin(s * Math.PI) * -0.02),
        ax: new V(1, 0, 0), ay: new V(0, 0, 1),
        rx: r, ry: r, exp: 2.2
      });
    }
    var geo = G.geom.loft(rings, this.tail.radial, true, true);
    this.tail.geo = geo;
    this.tailMesh = mkMesh(geo, this.coatMat);
    this.body.add(this.tailMesh);
    this.coatParts.push({ mesh: this.tailMesh, kind: 'limb' });
    this.tailRestRings = rings;

    // tuft cards
    this.tailTuft = new THREE.Group();
    this.body.add(this.tailTuft);
    for (var k = 0; k < 3; k++) {
      var g = new THREE.PlaneGeometry(0.20, 0.46, 1, 2);
      g.translate(0, -0.23, 0);
      var card = mkMesh(g, this.maneMat, true, false);
      card.rotation.y = k * Math.PI / 3;
      this.tailTuft.add(card);
    }
  };

  G.Giraffe.prototype.updateTail = function (t) {
    var n = this.tail.n, radial = this.tail.radial;
    var rings = [];
    var a = [];
    var sway = 0.10 * Math.sin(t * 1.7) + 0.045 * Math.sin(t * 0.61 + 1.0);
    var sway2 = 0.05 * Math.sin(t * 1.31 + 2.2);
    for (var i = 0; i < n; i++) {
      var s = i / (n - 1);
      var dx = -sway * Math.pow(s, 1.7) * 0.55 + sway2 * Math.pow(s, 2.0) * 0.25;
      var dz = -0.02 * s + Math.sin(s * Math.PI) * -0.02 - 0.05 * Math.pow(s, 2) * Math.cos(t * 1.7);
      var r = G.lerp(0.045, 0.016, Math.pow(s, 0.85));
      var c = new V(dx, 2.945 - s * 1.16, -1.04 + dz);
      rings.push({ c: c, ax: new V(1, 0, 0), ay: new V(0, 0, 1), rx: r, ry: r, exp: 2.2 });
      a.push(c);
    }
    writeRings(this.tail.geo, rings, radial);

    var tip = a[n - 1];
    var prev = a[n - 2];
    var dir = new V().subVectors(tip, prev).normalize();
    this.tailTuft.position.copy(tip);
    G.basisQuat(dir.clone().negate(), new V(1, 0, 0), this.tailTuft.quaternion);
    this.tailTuft.rotateY(Math.sin(t * 1.7) * 0.25);
  };

  /* ---------------------------- pose -------------------------------- */

  G.Giraffe.prototype.legFoot = function (leg, p, out) {
    var d = leg.def;
    var ph = ((p + d.phase) % 1 + 1) % 1;
    var duty = GAIT.duty;
    var A = GAIT.A;
    var z, y = GAIT.hoofY, pitch;
    if (ph < duty) {
      var u = ph / duty;
      z = d.footZ + A * (1 - 2 * u);
      pitch = -0.10 * (1 - G.smoothstep(0, 0.22, u)) + 0.20 * G.smoothstep(0.68, 1.0, u);
      y += 0.004 * Math.sin(Math.PI * u);
    } else {
      var s = (ph - duty) / (1 - duty);
      var e = G.smootherstep(0, 1, s);
      // velocity-matched swing: both endpoints have zero world velocity.
      // The base smootherstep already returns to rest; the odd cubic term
      // g(s)=s(1-s)(1-2s) has g(0)=g(1)=0 and g'(0)=g'(1)=1, so it trims the
      // residual ground velocity without disturbing the landing position.
      var k = -GAIT.speed * (1 - duty) * GAIT.period;
      z = d.footZ + (-A + 2 * A * e + k * s * (1 - s) * (1 - 2 * s));
      var lift = 0.155 * Math.pow(Math.sin(Math.PI * s), 1.15);
      y += lift;
      pitch = 0.20 * (1 - G.smoothstep(0, 0.25, s)) - 0.11 * G.smoothstep(0.45, 1.0, s);
    }
    y += 0.16 * Math.abs(pitch);
    out.set(d.footX, y, z);
    return pitch;
  };

  G.Giraffe.prototype.setPose = function (time) {
    var p = ((time / GAIT.period) % 1 + 1) % 1;

    // ------- body -------
    var bob = 0.017 * Math.sin(TAU * 2 * p + 0.9);
    var sway = 0.010 * Math.sin(TAU * p + 0.15);
    var roll = 0.020 + 0.011 * Math.sin(TAU * p + 1.0);
    var pitch = 0.006 * Math.sin(TAU * 2 * p + 2.0);
    var yawOsc = 0.007 * Math.sin(TAU * p + 0.5);
    var off = new V(sway, -this.drop + bob, 0);

    var Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yawOsc, roll, 'YXZ'));
    var bodyPos = this.pivot.clone().add(off).sub(this.pivot.clone().applyQuaternion(Q));
    this.body.quaternion.copy(Q);
    this.body.position.copy(bodyPos);
    this.body.updateMatrix();
    this.body.matrixWorldNeedsUpdate = true;

    // ------- neck + head -------
    this.updateNeck(p);
    this.updateHead(p, time);

    // ------- tail -------
    this.updateTail(time);

    // ------- legs -------
    var foot = new V(), tmpPole = new V();
    for (var i = 0; i < this.legs.length; i++) {
      var leg = this.legs[i];
      var d = leg.def;
      var pitchH = this.legFoot(leg, p, foot);

      // hip position in root space
      var hipRoot, rootP;
      if (d.front) {
        hipRoot = d.shoulder.clone().sub(this.pivot).applyQuaternion(Q).add(this.pivot).add(off);
        rootP = hipRoot;
      } else {
        hipRoot = d.hip.clone().sub(this.pivot).applyQuaternion(Q).add(this.pivot).add(off);
        rootP = hipRoot;
      }

      if (d.front) {
        tmpPole.set(leg.side * 0.06, 0, -1);
        ik2(hipRoot, foot, leg.l1, leg.l2, tmpPole, leg.carpusNow || (leg.carpusNow = new V()));
        var carpus = leg.carpusNow;
        placeSeg(leg.upper, hipRoot, carpus);
        placeSeg(leg.lower, carpus, foot);
        leg.kneeBall.position.copy(carpus);
        leg.fetlockBall.position.copy(foot);
      } else {
        // cannon direction (hock above the fetlock)
        var canAngle = 0.05 * Math.sin(TAU * p + i) + 0.02 * Math.sin(pitchH);
        var canDir = new V(0, Math.cos(canAngle), -0.075 + Math.sin(canAngle) * 0.5).normalize();
        var hock = new V().copy(foot).addScaledVector(canDir, leg.lc);
        tmpPole.set(leg.side * 0.05, 0, 1);
        ik2(hipRoot, hock, leg.lf, leg.lt, tmpPole, leg.stifleNow || (leg.stifleNow = new V()));
        var stifle = leg.stifleNow;
        placeSeg(leg.upper, hipRoot, stifle);
        placeSeg(leg.lower, stifle, hock);
        placeSeg(leg.cannon, hock, foot);
        leg.kneeBall.position.copy(stifle);
        leg.hockBall.position.copy(hock);
        leg.fetlockBall.position.copy(foot);
      }

      leg.hoof.position.copy(foot);
      leg.hoof.quaternion.setFromAxisAngle(new V(1, 0, 0), pitchH);
    }
  };

  /* ---------------------------- coat bake --------------------------- */

  G.Giraffe.prototype.bakeAll = function () {
    var rootInv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    var headInv = new THREE.Matrix4().copy(this.headGroup.matrixWorld).invert();
    var headLocalInv = new THREE.Matrix4().multiplyMatrices(headInv, this.root.matrixWorld);
    var self = this;

    var fns = {
      torso: function (v, n, out) {
        out.spot = 1.0;
        out.bright = G.lerp(0.93, 1.025, G.smoothstep(3.26, 2.05, v.y));
        out.bright *= 0.985 + 0.03 * G.noise2(v.z * 3.1, v.y * 2.7);
      },
      limb: function (v, n, out) {
        var k = G.smoothstep(1.55, 0.40, v.y);
        out.spot = 1.0 - 0.72 * k;
        out.bright = 1.0 + 0.085 * k;
        out.bright *= 0.97 + 0.04 * G.noise2(v.x * 4.0, v.z * 4.0);
      },
      neck: function (v, n, out) {
        out.spot = 1.0;
        out.bright = 0.955 + 0.075 * G.smoothstep(0.2, -0.9, n.y);
      },
      head: function (v, n, out) {
        var hl = v.clone().applyMatrix4(headLocalInv);
        var m = G.smoothstep(0.30, 0.60, hl.z);
        out.spot = G.lerp(1.0, 0.55, m);
        out.bright = G.lerp(0.985, 1.11, m);
      }
    };

    for (var i = 0; i < this.coatParts.length; i++) {
      var part = this.coatParts[i];
      G.geom.bakeCoat(part.mesh, rootInv, fns[part.kind] || fns.torso);
    }
  };

  G.Giraffe.prototype.update = function (time) {
    this.setPose(time);
  };

  G.GAIT = GAIT;
  G.GIRAFFE_PIVOT = PIVOT;

})(window.G);
