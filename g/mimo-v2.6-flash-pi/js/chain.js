'use strict';
/*
 * Skin-following chain geometry: a tube (or mane ridge) whose rings are re-fitted
 * to an animated centreline every frame.  Skin coordinates (aSkin) are frozen in
 * the rest pose, so the coat pattern stays glued to the body.
 */
class ChainMesh {
  /**
   * restPts : THREE.Vector3[]  rest centreline
   * profile : fn(t) -> {rx, ry, se?}
   */
  constructor(restPts, profile, radial, region) {
    radial = radial || 20;
    const n = restPts.length;
    this.n = n;
    this.radial = radial;
    this.rx = []; this.ry = []; this.se = [];
    const restFr = GEO.frames(restPts);
    this.restFr = restFr;

    const pos = new Float32Array(n * (radial + 1) * 3);
    const uv = new Float32Array(n * (radial + 1) * 2);
    const skin = new Float32Array(n * (radial + 1) * 4);
    const idx = [];

    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const pr = profile(t);
      this.rx.push(pr.rx); this.ry.push(pr.ry); this.se.push(pr.se || 2);
      const c = restPts[i], f = restFr[i];
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        const th = (j / radial) * U.TAU;
        const [a, b] = GEO.se(th, pr.rx, pr.ry, pr.se || 2);
        const x = c.x + f.side.x * a + f.up.x * b;
        const y = c.y + f.side.y * a + f.up.y * b;
        const z = c.z + f.side.z * a + f.up.z * b;
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        uv[k * 2] = j / radial; uv[k * 2 + 1] = t;
        skin[k * 4] = x; skin[k * 4 + 1] = y; skin[k * 4 + 2] = z;
        skin[k * 4 + 3] = region || 0;
      }
    }
    const row = radial + 1;
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aSkin', new THREE.BufferAttribute(skin, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, null);
    this.mesh.frustumCulled = false;
  }

  setMaterial(m) { this.mesh.material = m; return this; }

  /* re-fit rings to an animated centreline */
  update(points) {
    const n = this.n, radial = this.radial;
    const fr = GEO.frames(points);
    const pos = this.geometry.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const c = points[i], f = fr[i];
      const rx = this.rx[i], ry = this.ry[i], se = this.se[i];
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        const th = (j / radial) * U.TAU;
        const [a, b] = GEO.se(th, rx, ry, se);
        pos[k * 3] = c.x + f.side.x * a + f.up.x * b;
        pos[k * 3 + 1] = c.y + f.side.y * a + f.up.y * b;
        pos[k * 3 + 2] = c.z + f.side.z * a + f.up.z * b;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
    this.lastFr = fr;
    return fr;
  }
}

/*
 * Mane: a triangular ridge running along the top of the neck.
 * Three rows per station: left base (on the skin), tip, right base.
 */
class ManeMesh {
  constructor(restPts, restFr, profile, halfAngle, height, region) {
    const n = restPts.length;
    this.n = n;
    this.halfAngle = halfAngle;
    this.height = height;
    const rows = 3;
    this.rows = rows;
    const pos = new Float32Array(n * rows * 3);
    const uv = new Float32Array(n * rows * 2);
    const skin = new Float32Array(n * rows * 4);
    const idx = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const pr = profile(t);
      const c = restPts[i], f = restFr[i];
      const h = height(t);
      for (let r = 0; r < rows; r++) {
        const k = i * rows + r;
        let x, y, z;
        if (r === 1) { // tip
          x = c.x + f.up.x * (pr.ry + h);
          y = c.y + f.up.y * (pr.ry + h);
          z = c.z + f.up.z * (pr.ry + h);
        } else {
          const sign = r === 0 ? 1 : -1;
          const th = Math.PI / 2 + sign * halfAngle;
          const [a, b] = GEO.se(th, pr.rx, pr.ry, pr.se || 2);
          x = c.x + f.side.x * a + f.up.x * b;
          y = c.y + f.side.y * a + f.up.y * b;
          z = c.z + f.side.z * a + f.up.z * b;
        }
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        uv[k * 2] = r / (rows - 1); uv[k * 2 + 1] = t;
        skin[k * 4] = x; skin[k * 4 + 1] = y; skin[k * 4 + 2] = z;
        skin[k * 4 + 3] = region || 0;
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let r = 0; r < rows - 1; r++) {
        const a = i * rows + r, b = a + 1, c = a + rows, d = c + 1;
        idx.push(a, c, b, b, c, d);
        idx.push(a, b, c, b, d, c); // double sided (thin ridge)
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aSkin', new THREE.BufferAttribute(skin, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, null);
    this.mesh.frustumCulled = false;
    this.profile = profile;
    this.heightFn = height;
  }

  setMaterial(m) { this.mesh.material = m; return this; }

  update(points, fr) {
    const n = this.n, rows = this.rows;
    const pos = this.geometry.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const pr = this.profile(t);
      const c = points[i], f = fr[i];
      const h = this.heightFn(t);
      for (let r = 0; r < rows; r++) {
        const k = i * rows + r;
        let x, y, z;
        if (r === 1) {
          x = c.x + f.up.x * (pr.ry + h);
          y = c.y + f.up.y * (pr.ry + h);
          z = c.z + f.up.z * (pr.ry + h);
        } else {
          const sign = r === 0 ? 1 : -1;
          const th = Math.PI / 2 + sign * this.halfAngle;
          const [a, b] = GEO.se(th, pr.rx, pr.ry, pr.se || 2);
          x = c.x + f.side.x * a + f.up.x * b;
          y = c.y + f.side.y * a + f.up.y * b;
          z = c.z + f.side.z * a + f.up.z * b;
        }
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }
}
