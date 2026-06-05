// Generates PWA PNG icons with zero dependencies (pure Node + zlib).
// Draws the "SF" monogram on a brand gradient rounded square.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const outDir = path.resolve(__dirname, "..");

// 5x7 bitmap font for the letters we need.
const FONT = {
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
};

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // no filter
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function draw(size, padRatio) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * 0.22; // rounded corners
  // Brand gradient (top #1d72f3 -> bottom #0bbf9a)
  const top = [29, 114, 243];
  const bot = [11, 191, 154];

  // Monogram geometry
  const glyphCols = 5;
  const glyphRows = 7;
  const gap = 1; // columns between S and F
  const totalCols = glyphCols * 2 + gap;
  const drawable = size * (1 - padRatio * 2);
  const cell = Math.floor(drawable / (totalCols + 2));
  const monoW = totalCols * cell;
  const monoH = glyphRows * cell;
  const startX = Math.round((size - monoW) / 2);
  const startY = Math.round((size - monoH) / 2);

  function pixelInMonogram(px, py) {
    const lx = px - startX;
    const ly = py - startY;
    if (lx < 0 || ly < 0 || lx >= monoW || ly >= monoH) return false;
    const col = Math.floor(lx / cell);
    const row = Math.floor(ly / cell);
    let letter, lcol;
    if (col < glyphCols) {
      letter = "S";
      lcol = col;
    } else if (col < glyphCols + gap) {
      return false;
    } else {
      letter = "F";
      lcol = col - glyphCols - gap;
    }
    return FONT[letter][row][lcol] === "1";
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-rect mask
      const cx = Math.min(x, size - 1 - x);
      const cy = Math.min(y, size - 1 - y);
      let inside = true;
      if (cx < radius && cy < radius) {
        const dx = radius - cx;
        const dy = radius - cy;
        if (dx * dx + dy * dy > radius * radius) inside = false;
      }
      if (!inside) {
        rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 0;
        continue;
      }
      const t = y / size;
      if (pixelInMonogram(x, y)) {
        rgba[i] = 255;
        rgba[i + 1] = 255;
        rgba[i + 2] = 255;
        rgba[i + 3] = 255;
      } else {
        rgba[i] = lerp(top[0], bot[0], t);
        rgba[i + 1] = lerp(top[1], bot[1], t);
        rgba[i + 2] = lerp(top[2], bot[2], t);
        rgba[i + 3] = 255;
      }
    }
  }
  return encodePng(size, size, rgba);
}

const targets = [
  { file: "icon-192.png", size: 192, pad: 0.12 },
  { file: "icon-512.png", size: 512, pad: 0.12 },
  { file: "icon-maskable-512.png", size: 512, pad: 0.2 }, // extra safe-zone padding
  { file: "apple-touch-icon.png", size: 180, pad: 0.1 },
];

for (const t of targets) {
  fs.writeFileSync(path.join(outDir, t.file), draw(t.size, t.pad));
  console.log("wrote", t.file);
}
