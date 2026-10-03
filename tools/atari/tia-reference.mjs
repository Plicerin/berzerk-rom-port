// Reference copy of the straightforward per-pixel TIA model; tools/verify-tia.mjs
// checks that src/tia.mjs (optimized) produces identical frames and collisions.
// Streaming TIA model for the dev oracle: register writes are applied in
// time order, the beam is rasterized up to each write, and collisions latch
// per pixel between CXCLR and the read, as on the real chip. State carries
// over between frames. Objects: both players (NUSIZ copies/scale, REFP,
// VDEL), both missiles and the ball (widths, copies), playfield with score
// mode and priority. The positioning constants are calibrated against Stella.
// The playfield picks up its bit at the start of each 4-pixel block and
// PF0-PF2 writes land 2 color clocks late, as in Stella; without either, the
// right ends of the rivet screen's girders differ from a reference screenshot.
export const CYCLES_PER_LINE = 76;

export const R = Object.freeze({
  VSYNC: 0x00, VBLANK: 0x01, WSYNC: 0x02, NUSIZ0: 0x04, NUSIZ1: 0x05, COLUP0: 0x06, COLUP1: 0x07,
  COLUPF: 0x08, COLUBK: 0x09, CTRLPF: 0x0a, REFP0: 0x0b, REFP1: 0x0c, PF0: 0x0d, PF1: 0x0e, PF2: 0x0f,
  RESP0: 0x10, RESP1: 0x11, RESM0: 0x12, RESM1: 0x13, RESBL: 0x14, GRP0: 0x1b, GRP1: 0x1c,
  ENAM0: 0x1d, ENAM1: 0x1e, ENABL: 0x1f, HMP0: 0x20, HMP1: 0x21, HMM0: 0x22, HMM1: 0x23, HMBL: 0x24,
  VDELP0: 0x25, VDELP1: 0x26, VDELBL: 0x27, HMOVE: 0x2a, HMCLR: 0x2b, CXCLR: 0x2c,
});
export const POSITION = { player: 5, missile: 4, ball: 4, hblank: 3 };
export const LINES_PER_FRAME = 262;
const PF_WRITE_DELAY = 2;

const signed4 = (v) => { const n = (v >> 4) & 0x0f; return n >= 8 ? n - 16 : n; };
const COPIES = [[0], [0, 16], [0, 32], [0, 16, 32], [0, 64], [0], [0, 32, 64], [0]];
const SCALE = [1, 1, 1, 1, 1, 2, 1, 4];

// collision bits: [register, bit] for each object pair
const P0 = 1, P1 = 2, M0 = 4, M1 = 8, BL = 16, PF = 32;
const PAIRS = [
  [M0 | P1, 0, 0x80], [M0 | P0, 0, 0x40], [M1 | P0, 1, 0x80], [M1 | P1, 1, 0x40],
  [P0 | PF, 2, 0x80], [P0 | BL, 2, 0x40], [P1 | PF, 3, 0x80], [P1 | BL, 3, 0x40],
  [M0 | PF, 4, 0x80], [M0 | BL, 4, 0x40], [M1 | PF, 5, 0x80], [M1 | BL, 5, 0x40],
  [BL | PF, 6, 0x80], [P0 | P1, 7, 0x80], [M0 | M1, 7, 0x40],
];
// every combination of the six objects -> collision register bits
const COLLIDE = Array.from({ length: 64 }, (_, mask) => {
  const regs = new Uint8Array(8);
  for (const [pair, reg, bit] of PAIRS) if ((mask & pair) === pair) regs[reg] |= bit;
  return regs;
});

export class TIA {
  constructor() {
    this.s = {
      VBLANK: 0, COLUP0: 0, COLUP1: 0, COLUPF: 0, COLUBK: 0, CTRLPF: 0, PF0: 0, PF1: 0, PF2: 0,
      NUSIZ0: 0, NUSIZ1: 0, REFP0: 0, REFP1: 0, newGRP0: 0, oldGRP0: 0, newGRP1: 0, oldGRP1: 0,
      VDELP0: 0, VDELP1: 0, ENAM0: 0, ENAM1: 0, ENABL: 0, newENABL: 0, oldENABL: 0, VDELBL: 0,
      HMP0: 0, HMP1: 0, HMM0: 0, HMM1: 0, HMBL: 0, P0: 0, P1: 0, M0: 0, M1: 0, BL: 0,
    };
    this.cx = new Uint8Array(8);
    this.pfLatch = 0;           // playfield bit of the current 4-pixel block
    this.frame = this.newFrame();
    this.beam = 0;              // next pixel time to rasterize: line * 228 + color clock
    this.hmoveLine = -1;        // line whose first 8 pixels an HMOVE blanked
    this.lastFrame = null;
  }

  newFrame() { return Array.from({ length: LINES_PER_FRAME + 20 }, () => new Uint8Array(160)); }

  // color clock time of a cycle within the frame (the write lands after its cycle)
  static time(cycle) { return Math.floor(cycle / CYCLES_PER_LINE) * 228 + (cycle % CYCLES_PER_LINE + 1) * 3; }

  objectsAt(x) {
    const s = this.s;
    const player = (graphics, pos, nusiz, reflect) => {
      if (!graphics) return 0;
      const scale = SCALE[nusiz & 7];
      const start = pos + (scale > 1 ? 1 : 0);
      for (const c of COPIES[nusiz & 7]) {
        const d = (x - start - c + 320) % 160;
        if (d < 8 * scale) {
          const bit = Math.floor(d / scale);
          return (graphics >> (reflect ? bit : 7 - bit)) & 1;
        }
      }
      return 0;
    };
    const missile = (enabled, pos, nusiz) => {
      if (!(enabled & 2)) return 0;
      const width = 1 << ((nusiz >> 4) & 3);
      for (const c of COPIES[nusiz & 7]) if ((x - pos - c + 320) % 160 < width) return 1;
      return 0;
    };
    const half = x < 80 ? x : (s.CTRLPF & 1 ? 159 - x : x - 80);
    const pfi = half >> 2;
    let pf = pfi < 4 ? (s.PF0 >> (4 + pfi)) & 1 : pfi < 12 ? (s.PF1 >> (11 - pfi)) & 1 : (s.PF2 >> (pfi - 12)) & 1;
    if ((x & 3) === 0) this.pfLatch = pf;
    pf = this.pfLatch;
    const enabl = s.VDELBL & 1 ? s.oldENABL : s.newENABL;
    let mask = 0;
    if (player(s.VDELP0 & 1 ? s.oldGRP0 : s.newGRP0, s.P0, s.NUSIZ0, s.REFP0 & 8)) mask |= P0;
    if (player(s.VDELP1 & 1 ? s.oldGRP1 : s.newGRP1, s.P1, s.NUSIZ1, s.REFP1 & 8)) mask |= P1;
    if (missile(s.ENAM0, s.M0, s.NUSIZ0)) mask |= M0;
    if (missile(s.ENAM1, s.M1, s.NUSIZ1)) mask |= M1;
    if ((enabl & 2) && (x - s.BL + 160) % 160 < 1 << ((s.CTRLPF >> 4) & 3)) mask |= BL;
    if (pf) mask |= PF;
    return mask;
  }

  color(mask, x) {
    const s = this.s;
    const pfColor = s.CTRLPF & 2 ? (x < 80 ? s.COLUP0 : s.COLUP1) : s.COLUPF;
    if (s.CTRLPF & 4) {
      if (mask & PF) return pfColor;
      if (mask & BL) return s.COLUPF;
    }
    if (mask & (P0 | M0)) return s.COLUP0;
    if (mask & (P1 | M1)) return s.COLUP1;
    if (mask & PF) return pfColor;
    if (mask & BL) return s.COLUPF;
    return s.COLUBK;
  }

  // draw every pixel before color-clock time t
  rasterize(t) {
    while (this.beam < t) {
      const line = Math.floor(this.beam / 228), clock = this.beam % 228;
      if (clock < 68) { this.beam = Math.min(t, line * 228 + 68); continue; }
      const x = clock - 68;
      const row = this.frame[line];
      if (this.s.VBLANK & 2) { if (row) row[x] = 0; } else {
        const mask = this.objectsAt(x);
        const bits = COLLIDE[mask];
        for (let r = 0; r < 8; r += 1) this.cx[r] |= bits[r];
        if (row) row[x] = this.hmoveLine === line && x < 8 ? 0 : this.color(mask, x);
      }
      this.beam += 1;
    }
  }

  write(reg, v, cycle) {
    const t = TIA.time(cycle);
    this.rasterize(reg >= R.PF0 && reg <= R.PF2 ? t + PF_WRITE_DELAY : t);
    const s = this.s;
    const line = Math.floor(cycle / CYCLES_PER_LINE), clock = (cycle % CYCLES_PER_LINE + 1) * 3;
    const pos = (delay) => (clock < 68 ? POSITION.hblank : clock - 68 + delay) % 160;
    switch (reg) {
      case R.GRP0: s.newGRP0 = v; s.oldGRP1 = s.newGRP1; break;
      case R.GRP1: s.newGRP1 = v; s.oldGRP0 = s.newGRP0; s.oldENABL = s.newENABL; break;
      case R.ENABL: s.newENABL = v; break;
      case R.RESP0: s.P0 = pos(POSITION.player); break;
      case R.RESP1: s.P1 = pos(POSITION.player); break;
      case R.RESM0: s.M0 = pos(POSITION.missile); break;
      case R.RESM1: s.M1 = pos(POSITION.missile); break;
      case R.RESBL: s.BL = pos(POSITION.ball); break;
      case R.HMOVE:
        s.P0 = (s.P0 - signed4(s.HMP0) + 160) % 160;
        s.P1 = (s.P1 - signed4(s.HMP1) + 160) % 160;
        s.M0 = (s.M0 - signed4(s.HMM0) + 160) % 160;
        s.M1 = (s.M1 - signed4(s.HMM1) + 160) % 160;
        s.BL = (s.BL - signed4(s.HMBL) + 160) % 160;
        // an HMOVE at the start of a line blanks its first 8 pixels; one at the very end blanks the next line's
        if (cycle % CYCLES_PER_LINE < 3) this.hmoveLine = line;
        else if (cycle % CYCLES_PER_LINE >= CYCLES_PER_LINE - 3) this.hmoveLine = line + 1;
        break;
      case R.HMCLR: s.HMP0 = s.HMP1 = s.HMM0 = s.HMM1 = s.HMBL = 0; break;
      case R.CXCLR: this.cx.fill(0); break;
      default: {
        const name = Object.keys(R).find((k) => R[k] === reg);
        if (name && name in s) s[name] = v;
      }
    }
  }

  readCollision(reg, cycle) {
    this.rasterize(TIA.time(cycle) - 3);
    return this.cx[reg & 7];
  }

  // VSYNC: finish the frame at the write and continue the beam from the same
  // place, now counted from the start of the VSYNC line
  endFrame(cycle, cycleInNewFrame = 0) {
    this.rasterize(TIA.time(cycle));
    this.lastFrame = this.frame;
    this.frame = this.newFrame();
    this.beam = TIA.time(cycleInNewFrame);
    this.hmoveLine = -1;
  }
}
