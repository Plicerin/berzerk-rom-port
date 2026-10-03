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
const OVERLAP = Uint8Array.from({ length: 64 }, (_, mask) => (mask & (mask - 1) ? 1 : 0));

// which objects' coverage rows a register write can change
const DIRTY = new Uint8Array(64);
for (const [reg, bits] of [
  [0x04, P0 | M0], [0x05, P1 | M1], [0x0a, BL | PF], [0x0b, P0], [0x0c, P1], [0x0d, PF], [0x0e, PF], [0x0f, PF],
  [0x10, P0], [0x11, P1], [0x12, M0], [0x13, M1], [0x14, BL], [0x1b, P0 | P1], [0x1c, P0 | P1 | BL],
  [0x1d, M0], [0x1e, M1], [0x1f, BL], [0x25, P0], [0x26, P1], [0x27, BL], [0x2a, P0 | P1 | M0 | M1 | BL],
]) DIRTY[reg] = bits;
const NAME = [];
for (const [name, reg] of Object.entries(R)) NAME[reg] = name;
const COLOR_REGS = new Set([0x06, 0x07, 0x08, 0x09, 0x0a]);

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
    this.rows = { p0: new Uint8Array(160), p1: new Uint8Array(160), m0: new Uint8Array(160), m1: new Uint8Array(160), bl: new Uint8Array(160), pf: new Uint8Array(160) };
    this.colorsL = new Uint8Array(64);
    this.colorsR = new Uint8Array(64);
    this.dirty = 63;
    this.colorsDirty = true;
    this.frame = this.newFrame();
    this.beam = 0;              // next pixel time to rasterize: line * 228 + color clock
    this.hmoveLine = -1;        // line whose first 8 pixels an HMOVE blanked
    this.lastFrame = null;
  }

  newFrame() { return Array.from({ length: LINES_PER_FRAME + 20 }, () => new Uint8Array(160)); }

  // color clock time of a cycle within the frame (the write lands after its cycle)
  static time(cycle) { return Math.floor(cycle / CYCLES_PER_LINE) * 228 + (cycle % CYCLES_PER_LINE + 1) * 3; }

  // coverage rows: one byte per pixel for each object, rebuilt only when a
  // register that shapes or places the object changes
  rebuild(dirty) {
    const s = this.s, rows = this.rows;
    const player = (row, graphics, pos, nusiz, reflect) => {
      row.fill(0);
      if (!graphics) return;
      const scale = SCALE[nusiz & 7];
      const start = pos + (scale > 1 ? 1 : 0);
      for (const c of COPIES[nusiz & 7]) {
        for (let d = 0; d < 8 * scale; d += 1) {
          const bit = Math.floor(d / scale);
          const x = (start + c + d) % 160;
          if (!row[x]) row[x] = (graphics >> (reflect ? bit : 7 - bit)) & 1;
        }
      }
    };
    const missile = (row, enabled, pos, nusiz) => {
      row.fill(0);
      if (!(enabled & 2)) return;
      const width = 1 << ((nusiz >> 4) & 3);
      for (const c of COPIES[nusiz & 7]) for (let d = 0; d < width; d += 1) row[(pos + c + d) % 160] = 1;
    };
    if (dirty & P0) player(rows.p0, s.VDELP0 & 1 ? s.oldGRP0 : s.newGRP0, s.P0, s.NUSIZ0, s.REFP0 & 8);
    if (dirty & P1) player(rows.p1, s.VDELP1 & 1 ? s.oldGRP1 : s.newGRP1, s.P1, s.NUSIZ1, s.REFP1 & 8);
    if (dirty & M0) missile(rows.m0, s.ENAM0, s.M0, s.NUSIZ0);
    if (dirty & M1) missile(rows.m1, s.ENAM1, s.M1, s.NUSIZ1);
    if (dirty & BL) {
      rows.bl.fill(0);
      if ((s.VDELBL & 1 ? s.oldENABL : s.newENABL) & 2) {
        for (let d = 0; d < 1 << ((s.CTRLPF >> 4) & 3); d += 1) rows.bl[(s.BL + d) % 160] = 1;
      }
    }
    if (dirty & PF) {
      for (let x = 0; x < 160; x += 1) {
        const half = x < 80 ? x : (s.CTRLPF & 1 ? 159 - x : x - 80);
        const pfi = half >> 2;
        rows.pf[x] = pfi < 4 ? (s.PF0 >> (4 + pfi)) & 1 : pfi < 12 ? (s.PF1 >> (11 - pfi)) & 1 : (s.PF2 >> (pfi - 12)) & 1;
      }
    }
  }

  // color of each object combination, left and right half (score mode differs)
  rebuildColors() {
    const s = this.s;
    for (let half = 0; half < 2; half += 1) {
      const pfColor = s.CTRLPF & 2 ? (half ? s.COLUP1 : s.COLUP0) : s.COLUPF;
      const table = half ? this.colorsR : this.colorsL;
      for (let mask = 0; mask < 64; mask += 1) {
        let c;
        if ((s.CTRLPF & 4) && (mask & PF)) c = pfColor;
        else if ((s.CTRLPF & 4) && (mask & BL)) c = s.COLUPF;
        else if (mask & (P0 | M0)) c = s.COLUP0;
        else if (mask & (P1 | M1)) c = s.COLUP1;
        else if (mask & PF) c = pfColor;
        else if (mask & BL) c = s.COLUPF;
        else c = s.COLUBK;
        table[mask] = c;
      }
    }
  }

  // draw every pixel before color-clock time t
  rasterize(t) {
    if (this.dirty) { this.rebuild(this.dirty); this.dirty = 0; }
    if (this.colorsDirty) { this.rebuildColors(); this.colorsDirty = false; }
    const { p0, p1, m0, m1, bl, pf } = this.rows;
    const cx = this.cx;
    while (this.beam < t) {
      const line = Math.floor(this.beam / 228), clock = this.beam % 228;
      if (clock < 68) { this.beam = Math.min(t, line * 228 + 68); continue; }
      const x0 = clock - 68, x1 = Math.min(160, x0 + (t - this.beam));
      const row = this.frame[line];
      if (this.s.VBLANK & 2) {
        if (row) row.fill(0, x0, x1);
      } else {
        const blank = this.hmoveLine === line ? 8 : 0;
        for (let x = x0; x < x1; x += 1) {
          if ((x & 3) === 0) this.pfLatch = pf[x];
          const mask = p0[x] | (p1[x] << 1) | (m0[x] << 2) | (m1[x] << 3) | (bl[x] << 4) | (this.pfLatch << 5);
          if (OVERLAP[mask]) { const bits = COLLIDE[mask]; for (let r = 0; r < 8; r += 1) cx[r] |= bits[r]; }
          if (row) row[x] = x < blank ? 0 : (x < 80 ? this.colorsL : this.colorsR)[mask];
        }
      }
      this.beam += x1 - x0;
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
        const name = NAME[reg];
        if (name && name in s) s[name] = v;
      }
    }
    this.dirty |= DIRTY[reg];
    if (COLOR_REGS.has(reg)) this.colorsDirty = true;
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
