/**
 * Generates iOS PWA launch ("splash") images for the Circles Toolkit.
 *
 * iOS does NOT use the web-manifest `background_color` for an installed
 * home-screen app when `apple-mobile-web-app-capable` is set (the toolkit sets
 * appleWebApp.capable). It only shows a branded launch screen when matching
 * `apple-touch-startup-image` links are present — without them iOS paints a
 * blank WHITE screen on cold start, which then jumps to the green CircleSplash.
 *
 * Each image is the white Circles wordmark centered on brand green (#34B233),
 * matching <CircleSplash> exactly, so the native launch screen is seamless with
 * the in-app splash: green hold -> green splash (logo + pulse) -> page. No white.
 *
 * Pure Node (zlib only) so it needs no image deps. Re-run with:
 *   node scripts/generate-toolkit-splash.js
 * then paste the printed <link> tags into app/circle-leader-toolkit/layout.tsx.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const GREEN = [0x34, 0xb2, 0x33]; // #34B233 — matches .cs-splash + toolkit manifest
const LOGO_PATH = path.join(__dirname, '..', 'public', 'Circles Logo V2-White.png');
const OUT_DIR = path.join(__dirname, '..', 'public', 'splash-toolkit');
const LOGO_WIDTH_FRACTION = 0.35; // ~8.5rem on a phone — matches .cs-splash-logo

// iPhone portrait launch sizes (device pixels). The manifest is portrait-primary,
// so we only ship portrait. width x height x devicePixelRatio.
const DEVICES = [
  { w: 1320, h: 2868, r: 3 }, // 16 Pro Max
  { w: 1206, h: 2622, r: 3 }, // 16 Pro
  { w: 1290, h: 2796, r: 3 }, // 14/15 Pro Max, 15/16 Plus
  { w: 1179, h: 2556, r: 3 }, // 14/15/16 Pro
  { w: 1284, h: 2778, r: 3 }, // 12/13 Pro Max, 14 Plus
  { w: 1170, h: 2532, r: 3 }, // 12/13/14, 13 Pro
  { w: 1125, h: 2436, r: 3 }, // X, XS, 11 Pro
  { w: 1242, h: 2688, r: 3 }, // XS Max, 11 Pro Max
  { w: 828, h: 1792, r: 2 },  // XR, 11
  { w: 1242, h: 2208, r: 3 }, // 6+/7+/8+
  { w: 750, h: 1334, r: 2 },  // 6/7/8/SE2/SE3
  { w: 640, h: 1136, r: 2 },  // SE1 / 5s
];

// ---- minimal PNG decode (8-bit, color type 6 RGBA) ----
function decodePng(buf) {
  let pos = 8;
  const idat = [];
  let width, height, colorType;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (colorType !== 6) throw new Error('expected RGBA logo (color type 6)');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = 4;
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  let rp = 0;
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const v = raw[rp++];
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let recon;
      switch (filter) {
        case 0: recon = v; break;
        case 1: recon = v + a; break;
        case 2: recon = v + b; break;
        case 3: recon = v + ((a + b) >> 1); break;
        case 4: recon = v + paeth(a, b, c); break;
        default: throw new Error('bad filter ' + filter);
      }
      out[y * stride + x] = recon & 0xff;
    }
  }
  return { width, height, data: out };
}

// ---- nearest-neighbor scale of an RGBA bitmap ----
function scaleRgba(src, srcW, srcH, dstW, dstH) {
  const out = Buffer.alloc(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, (y * srcH / dstH) | 0);
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, (x * srcW / dstW) | 0);
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      out[di] = src[si]; out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3];
    }
  }
  return out;
}

// ---- encode solid-bg RGB PNG with the logo alpha-composited at center ----
function encodeSplash(w, h, logo, logoW, logoH) {
  const scaled = scaleRgba(logo.data, logo.width, logo.height, logoW, logoH);
  const offX = ((w - logoW) / 2) | 0;
  const offY = ((h - logoH) / 2) | 0;
  const stride = w * 3 + 1; // +1 filter byte per scanline
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    let p = y * stride;
    raw[p++] = 0; // filter: none
    const inLogo = y >= offY && y < offY + logoH;
    for (let x = 0; x < w; x++) {
      let r = GREEN[0], g = GREEN[1], b = GREEN[2];
      if (inLogo && x >= offX && x < offX + logoW) {
        const si = ((y - offY) * logoW + (x - offX)) * 4;
        const a = scaled[si + 3] / 255;
        r = Math.round(scaled[si] * a + r * (1 - a));
        g = Math.round(scaled[si + 1] * a + g * (1 - a));
        b = Math.round(scaled[si + 2] * a + b * (1 - a));
      }
      raw[p++] = r; raw[p++] = g; raw[p++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0, 0);
    return Buffer.concat([len, td, crc]);
  };
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// CRC32 (PNG)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const logo = decodePng(fs.readFileSync(LOGO_PATH));
fs.mkdirSync(OUT_DIR, { recursive: true });

const links = [];
for (const d of DEVICES) {
  const logoW = Math.round(d.w * LOGO_WIDTH_FRACTION) & ~1;
  const logoH = Math.round(logoW * logo.height / logo.width) & ~1;
  const png = encodeSplash(d.w, d.h, logo, logoW, logoH);
  const name = `toolkit-splash-${d.w}x${d.h}.png`;
  fs.writeFileSync(path.join(OUT_DIR, name), png);
  const ptW = d.w / d.r, ptH = d.h / d.r;
  links.push(
    `        <link rel="apple-touch-startup-image" ` +
    `media="(device-width: ${ptW}px) and (device-height: ${ptH}px) and ` +
    `(-webkit-device-pixel-ratio: ${d.r}) and (orientation: portrait)" ` +
    `href="/splash-toolkit/${name}" />`
  );
  console.log('wrote', name);
}

console.log('\nPaste these <link> tags into the toolkit layout head:\n');
console.log(links.join('\n'));
