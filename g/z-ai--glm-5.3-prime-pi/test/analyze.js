// Minimal PNG decoder + region analyzer for headless-Chrome screenshots.
const fs = require('fs');
const zlib = require('zlib');

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let w, h, bitDepth, colorType;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) throw new Error('unsupported PNG: depth ' + bitDepth + ' type ' + colorType);
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
    if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const cur = y * stride;
    const prev = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      let v = raw[rowStart + x];
      const a = x >= bpp ? out[cur + x - bpp] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = (x >= bpp && y > 0) ? out[prev + x - bpp] : 0;
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
      }
      out[cur + x] = v & 0xff;
    }
  }
  return { w, h, bpp, data: out };
}

function px(img, x, y) {
  const i = (y * img.w + x) * img.bpp;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

function regionStats(img, x0, y0, x1, y1) {
  let r = 0, g = 0, b = 0, n = 0;
  const hist = new Map();
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const [pr, pg, pb] = px(img, x, y);
    r += pr; g += pg; b += pb; n++;
    const key = ((pr >> 4) << 8) | ((pg >> 4) << 4) | (pb >> 4);
    hist.set(key, (hist.get(key) || 0) + 1);
  }
  // dominant + "brown" detection (giraffe coat: r>g>b, warm)
  let brown = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const [pr, pg, pb] = px(img, x, y);
    if (pr > 70 && pr > pb * 1.15 && pg > pb && pr - pb > 25 && pr < 225) brown++;
  }
  return { avg: [Math.round(r / n), Math.round(g / n), Math.round(b / n)], distinct: hist.size, brownFrac: +(brown / n).toFixed(3) };
}

const file = process.argv[2];
const img = decodePNG(fs.readFileSync(file));
const W = img.w, H = img.h;
console.log(`size ${W}x${H} bpp=${img.bpp}`);
console.log('top sky      :', JSON.stringify(regionStats(img, 0, 0, W, H * 0.15 | 0)));
console.log('upper-mid    :', JSON.stringify(regionStats(img, 0, H * 0.25 | 0, W, H * 0.45 | 0)));
console.log('center       :', JSON.stringify(regionStats(img, W * 0.2 | 0, H * 0.3 | 0, W * 0.8 | 0, H * 0.7 | 0)));
console.log('bottom ground:', JSON.stringify(regionStats(img, 0, H * 0.8 | 0, W, H)));
// horizontal profile at a few heights: where is the giraffe (brown columns)?
for (const fy of [0.35, 0.5, 0.65]) {
  let cols = [];
  for (let x = 0; x < W; x += 8) {
    let warm = 0;
    for (let y = (H * fy - 20) | 0; y < (H * fy + 20) | 0; y += 4) {
      const [r, g, b] = px(img, x, Math.max(0, Math.min(H - 1, y)));
      if (r > 70 && r > b * 1.12 && g > b && r - b > 22) warm++;
    }
    if (warm >= 3) cols.push(x);
  }
  if (cols.length) console.log(`warm object columns at y=${(fy * 100) | 0}%:`, cols[0], '->', cols[cols.length - 1], `(${cols.length} samples)`);
  else console.log(`warm object columns at y=${(fy * 100) | 0}%: none`);
}

// ---- silhouette mode: background = magenta (255,0,170) ----
if (process.argv[3] === 'sil') {
  const isBG = (r,g,b) => r > 240 && g < 30 && b > 140;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, count = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r,g,b] = px(img, x, y);
    if (!isBG(r,g,b)) { count++; if (x<minX)minX=x; if (x>maxX)maxX=x; if (y<minY)minY=y; if (y>maxY)maxY=y; }
  }
  console.log(`silhouette: ${count} px, bbox x ${minX}-${maxX} (w ${maxX-minX}), y ${minY}-${maxY} (h ${maxY-minY})`);
  // row width profile every 40px
  for (let y = minY; y <= maxY; y += Math.max(20, ((maxY-minY)/14)|0)) {
    let a = -1, b = -1;
    for (let x = minX; x <= maxX; x++) { const [r,g,bl] = px(img,x,y); if (!isBG(r,g,bl)) { if (a<0) a=x; b=x; } }
    console.log(`  row y=${y}: x ${a}..${b} w=${b-a+1}`);
  }
  // leg strokes at bottom: columns with silhouette in bottom quarter
  const y0 = minY + (maxY-minY)*0.72|0;
  let runs = [], inRun = false, start = 0;
  for (let x = minX; x <= maxX; x++) {
    let hit = false;
    for (let y = y0; y <= maxY; y++) { const [r,g,bl] = px(img,x,y); if (!isBG(r,g,bl)) { hit = true; break; } }
    if (hit && !inRun) { inRun = true; start = x; }
    if (!hit && inRun) { inRun = false; runs.push([start, x-1]); }
  }
  if (inRun) runs.push([start, maxX]);
  console.log('  bottom-leg strokes:', JSON.stringify(runs.filter(r => r[1]-r[0] > 2)));
}

// ---- strip mode: avg color of horizontal strips ----
if (process.argv[3] === 'strip') {
  for (let f = 0.02; f < 1; f += 0.08) {
    const y = (H * f) | 0;
    let r=0,g=0,b=0,n=0;
    for (let x = 0; x < W; x += 3) { const [pr,pg,pb]=px(img,x,y); r+=pr;g+=pg;b+=pb;n++; }
    console.log(`y=${String(y).padStart(4)} rgb=${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)}`);
  }
  // vertical strip at center-left (open sky area) and center-right
  for (const xc of [0.15, 0.85]) {
    const x = (W*xc)|0;
    const out = [];
    for (let f = 0.02; f < 0.55; f += 0.07) {
      const y = (H*f)|0;
      const [r,g,b] = px(img,x,y);
      out.push(`${Math.round(r)},${Math.round(g)},${Math.round(b)}`);
    }
    console.log(`x=${xc} col: ` + out.join(' '));
  }
}

// ---- shadow probe: darkest blocks in the lower half ----
if (process.argv[3] === 'shadow') {
  const BX = 32, BY = 32;
  let results = [];
  for (let by = (H*0.45/BY)|0; by < H/BY; by++) {
    for (let bx = 0; bx < W/BX; bx++) {
      let r=0,g=0,b=0,n=0;
      for (let y = by*BY; y < by*BY+BY; y+=2) for (let x = bx*BX; x < bx*BX+BX; x+=2) {
        const [pr,pg,pb]=px(img,x,y); r+=pr;g+=pg;b+=pb;n++;
      }
      results.push({x:bx*BX, y:by*BY, lum:(r*0.3+g*0.5+b*0.2)/n});
    }
  }
  results.sort((a,b)=>a.lum-b.lum);
  console.log('darkest blocks:', results.slice(0,8).map(r=>`(${r.x},${r.y} lum ${r.lum|0})`).join(' '));
}

// ---- coat pattern probe: transitions along horizontal lines ----
if (process.argv[3] === 'coat') {
  for (const fy of [0.30, 0.36, 0.42]) {
    const y = (H*fy)|0;
    let seq = [], prev = null, transitions = 0;
    for (let x = (W*0.35)|0; x < (W*0.85)|0; x++) {
      const [r,g,b] = px(img, x, y);
      const isBrown = (r > 90 && r < 200 && r-b > 25 && g > b);
      if (prev !== null && isBrown !== prev) transitions++;
      prev = isBrown;
    }
    console.log(`y=${y}: cream/brown transitions=${transitions}`);
  }
}
