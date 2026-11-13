// Geometry helpers for the giraffe model.


// Map normalized (u,v) into an atlas patch.
function toAtlasUV(geometry, patch) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = Math.min(1, Math.max(0, uv.getX(i)));
    const v = Math.min(1, Math.max(0, uv.getY(i)));
    uv.setXY(i,
      patch.u0 + (patch.u1 - patch.u0) * u,
      patch.v0 + (patch.v1 - patch.v0) * v);
  }
  uv.needsUpdate = true;
  return geometry;
}

// Re-map a primitive's UVs into an atlas patch using object-space position.
function atlasUV(geometry, patch, mode = 'xy') {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const bbox = new THREE.Box3().setFromBufferAttribute(pos);
  const size = new THREE.Vector3().subVectors(bbox.max, bbox.min);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (mode === 'polar') {
      u = 0.5 + Math.atan2(z, x) / (Math.PI * 2);
      u = ((u + 0.5) % 1 + 1) % 1;
      v = (y - bbox.min.y) / Math.max(1e-6, size.y);
    } else {
      u = (x - bbox.min.x) / Math.max(1e-6, size.x);
      v = (y - bbox.min.y) / Math.max(1e-6, size.y);
    }
    uv.setXY(i,
      patch.u0 + (patch.u1 - patch.u0) * u,
      patch.v0 + (patch.v1 - patch.v0) * v);
  }
  uv.needsUpdate = true;
  return geometry;
}

// Per-vertex parametric UV generator from explicit position function.
function parametricGeometry(fn, uSegs, vSegs) {
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j <= vSegs; j++) {
    const v = j / vSegs;
    for (let i = 0; i <= uSegs; i++) {
      const u = i / uSegs;
      const p = fn(u, v);
      positions.push(p.x, p.y, p.z);
      uvs.push(u, v);
    }
  }
  for (let j = 0; j < vSegs; j++) {
    for (let i = 0; i < uSegs; i++) {
      const a = j * (uSegs + 1) + i, b = a + uSegs + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// A tapered tube swept along a spine, elliptical cross-section, no twist.
// The cross-section "side" axis is fixed to world X so UVs stay coherent.
function tubeAlong(spineFn, opts = {}) {
  const {
    steps = 32, radial = 20,
    radiusFn = () => 0.2,
    ryFactorFn = () => 1.0,
    capStart = false, capEnd = false,
  } = opts;
  return parametricGeometry((u, v) => {
    const a = u * Math.PI * 2;
    const c = spineFn(v);
    const eps = 0.0015;
    const p0 = spineFn(Math.max(0, v - eps));
    const p1 = spineFn(Math.min(1, v + eps));
    const tan = new THREE.Vector3().subVectors(p1, p0);
    if (tan.lengthSq() < 1e-10) tan.set(0, 1, 0);
    tan.normalize();
    // fixed-axis frame (no twist)
    const side = new THREE.Vector3(1, 0, 0);
    side.addScaledVector(tan, -side.dot(tan));
    if (side.lengthSq() < 1e-6) side.set(0, 0, 1);
    side.normalize();
    const up = new THREE.Vector3().crossVectors(tan, side).normalize();
    const r = radiusFn(v), ryf = ryFactorFn(v);
    return new THREE.Vector3()
      .copy(c)
      .addScaledVector(side, Math.cos(a) * r)
      .addScaledVector(up, Math.sin(a) * r * ryf);
  }, radial, steps);
}

// Map a tube's uvs (u = angle 0..1, v = t 0..1) into an atlas patch.
// Seam is rotated to the back by shifting u by uvShift; vScale/vOff select a
// sub-band of the source (e.g. only the spotted part of the leg strip).
// vFlip reverses the axial direction (top of the patch = t 0).
function tubeAtlasUV(geometry, patch, opts = {}) {
  const { uvShift = 0.5, vScale = 1, vOff = 0, vFlip = false } = opts;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    let u = (uv.getX(i) + uvShift) % 1;
    if (u < 0) u += 1;
    const vv = vFlip ? 1 - uv.getY(i) : uv.getY(i);
    const v = vOff + vv * vScale;
    uv.setXY(i,
      patch.u0 + (patch.u1 - patch.u0) * u,
      patch.v0 + (patch.v1 - patch.v0) * v);
  }
  uv.needsUpdate = true;
  return geometry;
}

// Capsule-like ear: a flattened, slightly curled leaf shape, base at y=0.
function earGeometry() {
  const geo = new THREE.SphereGeometry(1, 14, 12);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const taper = 0.5 + 0.5 * (1 - Math.abs(y) * 0.85);
    pos.setXYZ(i, x * 0.42 * taper, y * 0.55, z * 0.13 + x * x * 0.14);
  }
  geo.translate(0, 0.55, 0);
  geo.computeVertexNormals();
  return toAtlasUV(geo, ATLAS.BODY);
}

// Mane: a continuous fin with a jagged top edge, following an arc of the neck.
// Positions are in object space; textured with the mane patch (u along tufts).
function maneGeometry(segments, arcFn, heightFn, thickness = 0.09) {
  const positions = [], normals = [], uvs = [], indices = [];
  const up = new THREE.Vector3(0, 1, 0);
  const cols = 6; // vertical subdivisions of the fin (jagged top handled at top row)
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = arcFn(t);
    const h = heightFn(t);
    const eps = 1e-3;
    const tangent = arcFn(Math.min(1, t + eps)).sub(arcFn(Math.max(0, t - eps))).normalize();
    // outward is horizontal, perpendicular to the neck, pointing backward
    const outward = new THREE.Vector3().crossVectors(up, tangent).normalize();
    if (outward.z < 0) outward.multiplyScalar(-1); // point backward (-Z)
    const side = new THREE.Vector3().crossVectors(tangent, outward).normalize();

    const jag = 0.55 + 0.45 * Math.abs(
      Math.sin(t * 34.0) * 0.6 + Math.sin(t * 13.0 + 1.7) * 0.4);
    const hh = h * jag;
    for (let k = 0; k <= cols; k++) {
      const f = k / cols;
      const base = p.clone()
        .addScaledVector(outward, hh * f)
        .addScaledVector(tangent, hh * f * 0.30)
        .addScaledVector(side, thickness * 0.5 * (f < 0.99 ? 1 : 0.6) * ((i % 2) ? 1 : -1) * 0.15);
      positions.push(base.x, base.y, base.z);
      normals.push(outward.x, outward.y, outward.z);
      uvs.push(i / segments, f);
    }
  }
  const stride = cols + 1;
  for (let i = 0; i < segments; i++) {
    for (let k = 0; k < cols; k++) {
      const a = i * stride + k, b = (i + 1) * stride + k;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
      indices.push(a + 1, b, a, b + 1, b, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return toAtlasUV(geo, ATLAS.MANE);
}
