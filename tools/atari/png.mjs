// Writes rows of TIA color bytes (NTSC palette) as a PNG, each pixel scaled
// xScale by yScale (2:1 shows the 2600's wide pixels).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { NTSC_PALETTE_RGB } from '../../src/palette.mjs';

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

export function writeFramePng(path, rows, xScale = 2, yScale = 1) {
  const w = rows[0].length * xScale, h = rows.length * yScale;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  rows.flatMap((row) => Array(yScale).fill(row)).forEach((row, y) => {
    let o = y * (w * 3 + 1) + 1;
    for (const c of row) {
      const rgb = NTSC_PALETTE_RGB[(c >> 1) & 0x7f];
      for (let i = 0; i < xScale; i++) { raw[o++] = (rgb >> 16) & 255; raw[o++] = (rgb >> 8) & 255; raw[o++] = rgb & 255; }
    }
  });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
