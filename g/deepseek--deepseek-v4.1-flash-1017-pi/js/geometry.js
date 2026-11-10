/* Geometry helpers: lofted tubes, ellipsoids, coat attribute baking. */
(function (G) {
  'use strict';

  var geom = G.geom = {};

  /*
   * Loft a series of rings into a tube.
   * ring = { c:Vector3, ax:Vector3, ay:Vector3, rx:number, ry:number, exp:number }
   * ax  = local lateral axis, ay = local dorsal axis.
   */
  geom.loft = function (rings, radial, capStart, capEnd) {
    var nRings = rings.length;
    var nVerts = nRings * radial + 2;
    var pos = new Float32Array(nVerts * 3);
    var uv = new Float32Array(nVerts * 2);
    var idx = [];
    var i, j;

    for (i = 0; i < nRings; i++) {
      var r = rings[i];
      var e = 2 / (r.exp || 2);
      for (j = 0; j < radial; j++) {
        var a = j / radial * Math.PI * 2;
        var ca = Math.cos(a), sa = Math.sin(a);
        var px = (ca < 0 ? -1 : 1) * Math.pow(Math.abs(ca), e) * r.rx;
        var py = (sa < 0 ? -1 : 1) * Math.pow(Math.abs(sa), e) * r.ry;
        var k = i * radial + j;
        pos[k * 3] = r.c.x + r.ax.x * px + r.ay.x * py;
        pos[k * 3 + 1] = r.c.y + r.ax.y * px + r.ay.y * py;
        pos[k * 3 + 2] = r.c.z + r.ax.z * px + r.ay.z * py;
        uv[k * 2] = j / radial;
        uv[k * 2 + 1] = i / (nRings - 1);
      }
    }
    for (i = 0; i < nRings - 1; i++) {
      for (j = 0; j < radial; j++) {
        var jn = (j + 1) % radial;
        var a0 = i * radial + j;
        var b0 = i * radial + jn;
        var c0 = (i + 1) * radial + j;
        var d0 = (i + 1) * radial + jn;
        idx.push(a0, b0, c0, b0, d0, c0);
      }
    }

    var center0 = nRings * radial;
    var center1 = center0 + 1;
    if (capStart) {
      var r0 = rings[0];
      pos[center0 * 3] = r0.c.x; pos[center0 * 3 + 1] = r0.c.y; pos[center0 * 3 + 2] = r0.c.z;
      uv[center0 * 2] = 0.5; uv[center0 * 2 + 1] = 0;
      for (j = 0; j < radial; j++) {
        var jn0 = (j + 1) % radial;
        idx.push(center0, jn0, j);
      }
    }
    if (capEnd) {
      var rl = rings[nRings - 1];
      pos[center1 * 3] = rl.c.x; pos[center1 * 3 + 1] = rl.c.y; pos[center1 * 3 + 2] = rl.c.z;
      uv[center1 * 2] = 0.5; uv[center1 * 2 + 1] = 1;
      var base = (nRings - 1) * radial;
      for (j = 0; j < radial; j++) {
        var jn1 = (j + 1) % radial;
        idx.push(center1, base + j, base + jn1);
      }
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  /* Ellipsoid with proper normals. */
  geom.ellipsoid = function (rx, ry, rz, wSeg, hSeg) {
    var g = new THREE.SphereGeometry(1, wSeg || 24, hSeg || 16);
    g.scale(rx, ry, rz);
    g.computeVertexNormals();
    return g;
  };

  /* Ring helpers for straight parts along +Y. */
  geom.ringY = function (y, cy, cx, cz, rx, ry, exp) {
    return {
      c: new THREE.Vector3(cx || 0, y, cz || 0),
      ax: new THREE.Vector3(1, 0, 0),
      ay: new THREE.Vector3(0, 0, 1),
      rx: rx, ry: ry, exp: exp || 2
    };
  };

  /*
   * Limb segment along local +Y, length L, radius profile given as
   * array of [t, radiusX, radiusZ] control points (linear interpolation).
   */
  geom.segment = function (L, profile, radial, exp) {
    var rings = [];
    for (var i = 0; i < profile.length; i++) {
      var p = profile[i];
      rings.push({
        c: new THREE.Vector3(0, p[0] * L, 0),
        ax: new THREE.Vector3(1, 0, 0),
        ay: new THREE.Vector3(0, 0, 1),
        rx: p[1], ry: p[2], exp: exp || 2.1
      });
    }
    return geom.loft(rings, radial, true, true);
  };

  /* Attach triplanar coat coordinates (in rest/root space) to a geometry. */
  geom.bakeCoat = function (mesh, rootInv, mixFn) {
    var g = mesh.geometry;
    var pos = g.attributes.position;
    var nrm = g.attributes.normal;
    var m = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
    var nm = new THREE.Matrix3().getNormalMatrix(m);
    var cp = new Float32Array(pos.count * 3);
    var cn = new Float32Array(pos.count * 3);
    var cm = new Float32Array(pos.count * 2);
    var v = new THREE.Vector3(), n = new THREE.Vector3();
    var mixOut = { spot: 1, bright: 1 };
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      n.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize();
      cp[i * 3] = v.x; cp[i * 3 + 1] = v.y; cp[i * 3 + 2] = v.z;
      cn[i * 3] = n.x; cn[i * 3 + 1] = n.y; cn[i * 3 + 2] = n.z;
      mixFn(v, n, mixOut, i);
      cm[i * 2] = mixOut.spot;
      cm[i * 2 + 1] = mixOut.bright;
    }
    g.setAttribute('coatPos', new THREE.BufferAttribute(cp, 3));
    g.setAttribute('coatNrm', new THREE.BufferAttribute(cn, 3));
    g.setAttribute('coatMix', new THREE.BufferAttribute(cm, 2));
  };

  /* Copy an attribute array to another geometry (used when rebuilding a neck). */
  geom.copyAttr = function (dst, src, name) {
    dst.setAttribute(name, src.getAttribute(name));
  };

  /* Ribbon strip from two rows of points. */
  geom.ribbon = function (rowA, rowB) {
    var n = rowA.length;
    var pos = new Float32Array(n * 2 * 3);
    var uv = new Float32Array(n * 2 * 2);
    var idx = [];
    for (var i = 0; i < n; i++) {
      var k = i * 2;
      pos[k * 3] = rowA[i].x; pos[k * 3 + 1] = rowA[i].y; pos[k * 3 + 2] = rowA[i].z;
      var k2 = k + 1;
      pos[k2 * 3] = rowB[i].x; pos[k2 * 3 + 1] = rowB[i].y; pos[k2 * 3 + 2] = rowB[i].z;
      uv[k * 2] = i / (n - 1); uv[k * 2 + 1] = 0;
      uv[k2 * 2] = i / (n - 1); uv[k2 * 2 + 1] = 1;
      if (i < n - 1) {
        var a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

})(window.G);
