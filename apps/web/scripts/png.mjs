// Tiny PNG helpers (no dependencies): read the header, check opacity, re-encode as opaque RGB.
// Used by scripts/generate-og-placeholders.mjs and lib/seo.test.ts. 8-bit, non-interlaced RGB/RGBA only for pixel work.
import { inflateSync, deflateSync, crc32 } from "node:zlib";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function readHeader(buf) {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25], interlace: buf[28] };
}

function chunks(buf) {
  const out = [];
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o);
    out.push({ type: buf.toString("latin1", o + 4, o + 8), data: buf.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
  }
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decode to raw 8-bit RGB or RGBA rows. Throws for anything else. */
export function decode(buf) {
  const h = readHeader(buf);
  if (h.bitDepth !== 8 || h.interlace !== 0 || (h.colorType !== 2 && h.colorType !== 6)) throw new Error("unsupported PNG layout");
  const bpp = h.colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(chunks(buf).filter((c) => c.type === "IDAT").map((c) => c.data)));
  const stride = h.width * bpp;
  const px = Buffer.alloc(stride * h.height);
  for (let y = 0; y < h.height; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      const add = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
      px[y * stride + x] = (row[x] + add) & 255;
    }
  }
  return { ...h, bpp, px };
}

/** True when no pixel has transparency. Colour type 2 has no alpha channel at all. */
export function isOpaque(buf) {
  const h = readHeader(buf);
  if (h.colorType === 2) return true;
  if (h.colorType !== 6) return false;
  const { px } = decode(buf);
  for (let i = 3; i < px.length; i += 4) if (px[i] !== 255) return false;
  return true;
}

function chunk(type, data) {
  const t = Buffer.from(type, "latin1");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
  return Buffer.concat([len, t, data, crc]);
}

/** Re-encode as 8-bit RGB (no alpha channel), flattening any alpha onto #FAFAF8. */
export function toOpaqueRgb(buf) {
  const d = decode(buf);
  const stride = d.width * 3;
  const out = Buffer.alloc((stride + 1) * d.height);
  const bg = [0xfa, 0xfa, 0xf8];
  for (let y = 0; y < d.height; y++) {
    out[y * (stride + 1)] = 0;
    for (let x = 0; x < d.width; x++) {
      const i = (y * d.width + x) * d.bpp;
      const a = d.bpp === 4 ? d.px[i + 3] / 255 : 1;
      for (let k = 0; k < 3; k++) out[y * (stride + 1) + 1 + x * 3 + k] = Math.round(d.px[i + k] * a + bg[k] * (1 - a));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(d.width, 0); ihdr.writeUInt32BE(d.height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(out, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
