// Translates the Berzerk cartridge into JavaScript, instruction for
// instruction, with cycle counts: src/berzerkRecomp.mjs (code) and src/berzerkRomData.mjs
// (the cartridge's tables and graphics, the bytes no instruction occupies).
// Instructions are decoded from the assembled bytes; labels and comments come
// from the disassembly listing. Needs tools/build (run tools/build-rom.ps1).
//
// The generated run() executes from cpu.pc until the frame ends (VSYNC) with
// the same register, flag, stack and bus behavior as the 6502 core, which
// tools/verify-recomp.mjs checks against the cartridge frame by frame.
import { readFileSync, writeFileSync } from 'node:fs';

const rom = readFileSync('tools/build/berzerk.bin');
const listing = readFileSync('tools/build/berzerk.lst', 'latin1').split(/\r?\n/);
const hex = (v, n = 2) => v.toString(16).padStart(n, '0');
const $ = (v, n) => '0x' + hex(v, n);

// official opcodes: [mnemonic, mode, cycles]
const OPC = {};
const add = (mn, list) => { for (const [op, mode, cyc] of list) OPC[op] = [mn, mode, cyc]; };
const rd = (imm, zp, zpx, abs, absx, absy, indx, indy) => [[imm, 'imm', 2], [zp, 'zp', 3], [zpx, 'zpx', 4], [abs, 'abs', 4], [absx, 'absx', 4], [absy, 'absy', 4], [indx, 'indx', 6], [indy, 'indy', 5]];
add('lda', rd(0xa9, 0xa5, 0xb5, 0xad, 0xbd, 0xb9, 0xa1, 0xb1));
add('adc', rd(0x69, 0x65, 0x75, 0x6d, 0x7d, 0x79, 0x61, 0x71));
add('sbc', rd(0xe9, 0xe5, 0xf5, 0xed, 0xfd, 0xf9, 0xe1, 0xf1));
add('and', rd(0x29, 0x25, 0x35, 0x2d, 0x3d, 0x39, 0x21, 0x31));
add('ora', rd(0x09, 0x05, 0x15, 0x0d, 0x1d, 0x19, 0x01, 0x11));
add('eor', rd(0x49, 0x45, 0x55, 0x4d, 0x5d, 0x59, 0x41, 0x51));
add('cmp', rd(0xc9, 0xc5, 0xd5, 0xcd, 0xdd, 0xd9, 0xc1, 0xd1));
add('ldx', [[0xa2, 'imm', 2], [0xa6, 'zp', 3], [0xb6, 'zpy', 4], [0xae, 'abs', 4], [0xbe, 'absy', 4]]);
add('ldy', [[0xa0, 'imm', 2], [0xa4, 'zp', 3], [0xb4, 'zpx', 4], [0xac, 'abs', 4], [0xbc, 'absx', 4]]);
add('sta', [[0x85, 'zp', 3], [0x95, 'zpx', 4], [0x8d, 'abs', 4], [0x9d, 'absx', 5], [0x99, 'absy', 5], [0x81, 'indx', 6], [0x91, 'indy', 6]]);
add('stx', [[0x86, 'zp', 3], [0x96, 'zpy', 4], [0x8e, 'abs', 4]]);
add('sty', [[0x84, 'zp', 3], [0x94, 'zpx', 4], [0x8c, 'abs', 4]]);
add('cpx', [[0xe0, 'imm', 2], [0xe4, 'zp', 3], [0xec, 'abs', 4]]);
add('cpy', [[0xc0, 'imm', 2], [0xc4, 'zp', 3], [0xcc, 'abs', 4]]);
add('bit', [[0x24, 'zp', 3], [0x2c, 'abs', 4]]);
for (const [mn, acc, zp, zpx, abs, absx] of [['asl', 0x0a, 0x06, 0x16, 0x0e, 0x1e], ['lsr', 0x4a, 0x46, 0x56, 0x4e, 0x5e], ['rol', 0x2a, 0x26, 0x36, 0x2e, 0x3e], ['ror', 0x6a, 0x66, 0x76, 0x6e, 0x7e]]) {
  add(mn, [[acc, 'acc', 2], [zp, 'zp', 5], [zpx, 'zpx', 6], [abs, 'abs', 6], [absx, 'absx', 7]]);
}
add('inc', [[0xe6, 'zp', 5], [0xf6, 'zpx', 6], [0xee, 'abs', 6], [0xfe, 'absx', 7]]);
add('dec', [[0xc6, 'zp', 5], [0xd6, 'zpx', 6], [0xce, 'abs', 6], [0xde, 'absx', 7]]);
for (const [mn, op, cyc] of [['inx', 0xe8, 2], ['dex', 0xca, 2], ['iny', 0xc8, 2], ['dey', 0x88, 2], ['tax', 0xaa, 2], ['txa', 0x8a, 2], ['tay', 0xa8, 2], ['tya', 0x98, 2], ['tsx', 0xba, 2], ['txs', 0x9a, 2],
  ['pha', 0x48, 3], ['pla', 0x68, 4], ['php', 0x08, 3], ['plp', 0x28, 4], ['clc', 0x18, 2], ['sec', 0x38, 2], ['cli', 0x58, 2], ['sei', 0x78, 2], ['clv', 0xb8, 2], ['cld', 0xd8, 2], ['sed', 0xf8, 2], ['nop', 0xea, 2], ['rts', 0x60, 6], ['rti', 0x40, 6], ['brk', 0x00, 7]]) add(mn, [[op, 'imp', cyc]]);
add('jmp', [[0x4c, 'abs', 3], [0x6c, 'ind', 5]]);
add('jsr', [[0x20, 'abs', 6]]);
for (const [mn, op] of [['bpl', 0x10], ['bmi', 0x30], ['bvc', 0x50], ['bvs', 0x70], ['bcc', 0x90], ['bcs', 0xb0], ['bne', 0xd0], ['beq', 0xf0]]) add(mn, [[op, 'rel', 2]]);
const SIZE = { imp: 1, acc: 1, imm: 2, zp: 2, zpx: 2, zpy: 2, indx: 2, indy: 2, rel: 2, abs: 3, absx: 3, absy: 3, ind: 3 };

// --- read the listing: instructions (with source text), labels, comments ---
const MNEMONICS = new Set(Object.values(OPC).map(([mn]) => mn));
const instrs = new Map();   // address -> { op, mn, mode, cyc, size, operand, source, comment }
const labels = new Map();   // address -> [names]
const notes = new Map();    // address -> [full-line comments before it]
let pendingNotes = [];
const DIRECTIVE = /^(\.byte|\.word|\.hex|org|seg|processor|include|list|if|else|endif|ds|echo|end|repeat|repend|align)/i;
for (const line of listing) {
  const m = /^\s*\d+\s+([0-9a-f]{4})(.*)$/i.exec(line);
  if (!m) continue;
  const addr = parseInt(m[1], 16);
  if (addr < 0xf000) continue;
  // drop the listed bytes; what is left is the source line
  const src = m[2].replace(/^	*/, '').replace(/^\s*(?:[0-9a-f]{2} )*[0-9a-f]{2}(?=[\s]|$)/i, '');
  if (/^\s*-(\s|$)/.test(src)) continue; // excluded by IF/ELSE
  const semi = src.indexOf(';');
  const code = semi >= 0 ? src.slice(0, semi) : src;
  const comment = semi >= 0 ? src.slice(semi + 1).replace(/\s+/g, ' ').trim() : '';
  // sta.w / sta.wy etc. force the address size (for timing); the mnemonic is the part before the dot
  const tokens = code.trim().split(/\s+/).filter(Boolean).map((w, i, all) => (i < 2 && MNEMONICS.has(w.toLowerCase().replace(/\.[wb][xy]?$/, '')) ? w.replace(/\.[wb][xy]?$/i, '') : w));
  if (!tokens.length) { if (comment) pendingNotes.push(comment); continue; }
  let t = 0;
  if (!MNEMONICS.has(tokens[0].toLowerCase()) && !DIRECTIVE.test(tokens[0]) && tokens[1] !== '=' && !tokens[0].includes('=')) {
    if (!labels.has(addr)) labels.set(addr, []);
    labels.get(addr).push(tokens[0].replace(/:$/, ''));
    t = 1;
    if (tokens[1] === 'SUBROUTINE') t = 2;
  }
  if (t >= tokens.length) continue;
  if (!MNEMONICS.has(tokens[t].toLowerCase())) { pendingNotes = []; continue; }
  const op = rom[addr & 0xfff];
  const def = OPC[op];
  if (!def || def[0] !== tokens[t].toLowerCase()) throw new Error(`$${hex(addr, 4)}: listing says ${tokens[t]}, byte is $${hex(op)}`);
  const [mn, mode, cyc] = def;
  const size = SIZE[mode];
  const operand = size === 1 ? 0 : size === 2 ? rom[(addr + 1) & 0xfff] : rom[(addr + 1) & 0xfff] | (rom[(addr + 2) & 0xfff] << 8);
  instrs.set(addr, { op, mn, mode, cyc, size, operand, source: tokens.slice(t).join(' '), comment });
  if (pendingNotes.length) notes.set(addr, pendingNotes);
  pendingNotes = [];
}

// --- data: every ROM byte not occupied by an instruction, plus the code
// bytes that indexed table reads reach into ---
const isCode = new Uint8Array(4096);
for (const [addr, ins] of instrs) for (let i = 0; i < ins.size; i += 1) isCode[(addr + i) & 0xfff] = 1;
// code bytes the cartridge also reads as data (address ranges, inclusive)
const READS_INTO_CODE = [];
for (const [lo, hi] of READS_INTO_CODE) for (let a = lo; a <= hi; a += 1) isCode[a & 0xfff] = 0;
const spans = [];
for (let i = 0; i < 4096;) {
  if (isCode[i]) { i += 1; continue; }
  let j = i;
  while (j < 4096 && !isCode[j]) j += 1;
  spans.push([0xf000 + i, rom.subarray(i, j)]);
  i = j;
}

// --- emit code ---
const addrs = [...instrs.keys()].sort((a, b) => a - b);
const writesHardware = (ins) => {
  // a store that can reach the TIA, RIOT or stack page must check for the end of the frame
  if (!['sta', 'stx', 'sty', 'inc', 'dec', 'asl', 'lsr', 'rol', 'ror'].includes(ins.mn) || ins.mode === 'acc') return false;
  if (ins.mode === 'zp') return ins.operand < 0x80;
  if (ins.mode === 'abs') return !(ins.operand >= 0x80 && ins.operand < 0x100);
  return true;
};
const ea = (ins, read) => {
  const o = ins.operand;
  switch (ins.mode) {
    case 'zp': return $(o);
    case 'abs': return $(o, 4);
    case 'zpx': return `(${$(o)} + c.x) & 0xff`;
    case 'zpy': return `(${$(o)} + c.y) & 0xff`;
    case 'absx': return read ? `c.indexed(${$(o, 4)}, c.x)` : `(${$(o, 4)} + c.x) & 0xffff`;
    case 'absy': return read ? `c.indexed(${$(o, 4)}, c.y)` : `(${$(o, 4)} + c.y) & 0xffff`;
    case 'indx': return `c.indirectX(${$(o)})`;
    case 'indy': return `c.indirectY(${$(o)}, ${read})`;
    default: throw new Error(ins.mode);
  }
};
const value = (ins) => (ins.mode === 'imm' ? $(ins.operand) : `c.read(${ea(ins, true)})`);
const FLAG = { bpl: '!(c.p & 0x80)', bmi: '(c.p & 0x80)', bvc: '!(c.p & 0x40)', bvs: '(c.p & 0x40)', bcc: '!(c.p & 0x01)', bcs: '(c.p & 0x01)', bne: '!(c.p & 0x02)', beq: '(c.p & 0x02)' };
const SIMPLE = {
  inx: 'c.x = c.setNZ((c.x + 1) & 0xff);', dex: 'c.x = c.setNZ((c.x - 1) & 0xff);', iny: 'c.y = c.setNZ((c.y + 1) & 0xff);', dey: 'c.y = c.setNZ((c.y - 1) & 0xff);',
  tax: 'c.x = c.setNZ(c.a);', txa: 'c.a = c.setNZ(c.x);', tay: 'c.y = c.setNZ(c.a);', tya: 'c.a = c.setNZ(c.y);', tsx: 'c.x = c.setNZ(c.s);', txs: 'c.s = c.x;',
  pha: 'c.push(c.a);', pla: 'c.a = c.setNZ(c.pull());', php: 'c.push(c.p | 0x30);', plp: 'c.p = (c.pull() & ~0x10) | 0x20;',
  clc: 'c.p &= ~0x01;', sec: 'c.p |= 0x01;', cli: 'c.p &= ~0x04;', sei: 'c.p |= 0x04;', clv: 'c.p &= ~0x40;', cld: 'c.p &= ~0x08;', sed: 'c.p |= 0x08;', nop: '',
};
const body = (addr, ins) => {
  const next = (addr + ins.size) & 0xffff;
  const { mn, mode } = ins;
  if (SIMPLE[mn] !== undefined) return SIMPLE[mn];
  switch (mn) {
    case 'lda': return `c.a = c.setNZ(${value(ins)});`;
    case 'ldx': return `c.x = c.setNZ(${value(ins)});`;
    case 'ldy': return `c.y = c.setNZ(${value(ins)});`;
    case 'sta': return `c.write(${ea(ins, false)}, c.a);`;
    case 'stx': return `c.write(${ea(ins, false)}, c.x);`;
    case 'sty': return `c.write(${ea(ins, false)}, c.y);`;
    case 'adc': return `c.adc(${value(ins)});`;
    case 'sbc': return `c.sbc(${value(ins)});`;
    case 'and': return `c.a = c.setNZ(c.a & ${value(ins)});`;
    case 'ora': return `c.a = c.setNZ(c.a | ${value(ins)});`;
    case 'eor': return `c.a = c.setNZ(c.a ^ ${value(ins)});`;
    case 'cmp': return `c.cmp(c.a, ${value(ins)});`;
    case 'cpx': return `c.cmp(c.x, ${value(ins)});`;
    case 'cpy': return `c.cmp(c.y, ${value(ins)});`;
    case 'bit': return `c.bit(${value(ins)});`;
    case 'asl': case 'lsr': case 'rol': case 'ror':
      return mode === 'acc' ? `c.a = c.${mn}(c.a);` : `c.rmw(${ea(ins, false)}, (v) => c.${mn}(v));`;
    case 'inc': return `c.rmw(${ea(ins, false)}, (v) => c.setNZ((v + 1) & 0xff));`;
    case 'dec': return `c.rmw(${ea(ins, false)}, (v) => c.setNZ((v - 1) & 0xff));`;
    case 'jmp':
      if (mode === 'abs') return `pc = ${$(ins.operand, 4)}; continue;`;
      return `pc = c.read(${$(ins.operand, 4)}) | (c.read(${$((ins.operand & 0xff00) | ((ins.operand + 1) & 0xff), 4)}) << 8); continue;`;
    case 'jsr': return `c.push(${$((next - 1) >> 8)}); c.push(${$((next - 1) & 0xff)}); pc = ${$(ins.operand, 4)}; continue;`;
    case 'rts': return 'pc = (c.pull() | (c.pull() << 8)) + 1 & 0xffff; continue;';
    default:
      if (mode === 'rel') {
        const target = (next + ((ins.operand ^ 0x80) - 0x80)) & 0xffff;
        const extra = (target & 0xff00) !== (next & 0xff00) ? 2 : 1;
        return `if (${FLAG[mn]}) { c.cycles += ${extra}; pc = ${$(target, 4)}; continue; }`;
      }
      throw new Error(`unsupported ${mn} at $${hex(addr, 4)}`);
  }
};

const out = [];
out.push(`// GENERATED by tools/recompile.mjs from the Berzerk cartridge and its
// disassembly -- do not edit. Each case is one instruction at its ROM
// address, with the cycles it takes; labels and comments are the disassembly's.
//
// run(c, bus): executes from c.pc until the frame's VSYNC write (or until the
// cycle budget runs out) and leaves c.pc at the next instruction.

export const START = ${$(rom[0xffc] | (rom[0xffd] << 8), 4)}; // the reset vector

export function run(c, bus, maxCycles = 400000) { // the first frame waits out the power-on timer (up to 261,120 cycles)
  const frame = bus.frame;
  const stop = c.cycles + maxCycles;
  let pc = c.pc;
  for (;;) {
    if (c.cycles > stop) { c.pc = pc; return false; }
    switch (pc) {`);
for (const addr of addrs) {
  const ins = instrs.get(addr);
  for (const n of notes.get(addr) ?? []) out.push(`      // ${n}`);
  for (const name of labels.get(addr) ?? []) out.push(`      // ${name}`);
  const next = (addr + ins.size) & 0xffff;
  let line = `      case ${$(addr, 4)}: c.cycles += ${ins.cyc}; ${body(addr, ins)}`;
  if (writesHardware(ins)) line += ` if (bus.frame !== frame) { c.pc = ${$(next, 4)}; return true; }`;
  out.push(`${line} // ${ins.source}${ins.comment ? ' ; ' + ins.comment : ''}`);
  if (!instrs.has(next) && !['jmp', 'rts', 'rti'].includes(ins.mn)) out.push(`        pc = ${$(next, 4)}; throw new Error('ran into data at $${hex(next, 4)}');`);
}
out.push(`      default: throw new Error('no instruction at $' + pc.toString(16));
    }
  }
}
`);
writeFileSync('src/berzerkRecomp.mjs', out.join('\n'));

const data = [`// GENERATED by tools/recompile.mjs: the Berzerk cartridge's tables and
// graphics (every byte no instruction occupies), by address. The code itself
// is translated in berzerkRecomp.mjs; the cartridge image is not included.

export const ROM_DATA = [`];
for (const [at, bytes] of spans) data.push(`  [${$(at, 4)}, '${Buffer.from(bytes).toString('hex')}'],`);
data.push(`];

// 4K image with the data in place; code addresses read as 0
export function romImage() {
  const rom = new Uint8Array(4096);
  for (const [at, hexBytes] of ROM_DATA) {
    for (let i = 0; i < hexBytes.length / 2; i += 1) rom[(at + i) & 0xfff] = parseInt(hexBytes.substr(i * 2, 2), 16);
  }
  return rom;
}
`);
writeFileSync('src/berzerkRomData.mjs', data.join('\n'));
const dataBytes = spans.reduce((n, [, b]) => n + b.length, 0);
console.log(`${instrs.size} instructions, ${labels.size} labelled addresses, ${dataBytes} data bytes in ${spans.length} spans`);
