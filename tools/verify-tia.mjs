// Checks the optimized TIA model (src/tia.mjs) against the straightforward
// per-pixel reference (tools/atari/tia-reference.mjs): the cartridge runs on
// the oracle with the reference attached, every write and collision read is
// mirrored into the optimized model, and frames and reads must agree.
// usage: node tools/verify-tia.mjs [frames] [seed]
import { VCS, loadRom } from './atari/vcs.mjs';
import { TIA as Reference } from './atari/tia-reference.mjs';
import { TIA as Fast } from '../src/tia.mjs';

const frames = Number(process.argv[2] ?? 3000);
let s = Number(process.argv[3] ?? 1) >>> 0;
const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
const vcs = new VCS(loadRom());
vcs.tia = new Reference();
const fast = new Fast();
const write = vcs.tia.write.bind(vcs.tia), read = vcs.tia.readCollision.bind(vcs.tia), end = vcs.tia.endFrame.bind(vcs.tia);
let bad = 0;
vcs.tia.write = (reg, v, c) => { fast.write(reg, v, c); write(reg, v, c); };
vcs.tia.readCollision = (reg, c) => { const a = read(reg, c), b = fast.readCollision(reg, c); if (a !== b && bad++ < 5) console.log('collision', reg, a, b); return a; };
vcs.tia.endFrame = (c, n) => {
  end(c, n); fast.endFrame(c, n);
  const A = vcs.tia.lastFrame, B = fast.lastFrame;
  if (A.some((row, y) => row.some((v, x) => v !== B[y][x])) && bad++ < 5) console.log('frame differs at', vcs.frame);
};
let stick = 0xff;
for (let f = 0; f < frames; f += 1) {
  if (f % 20 === 0) { const r = rand(); stick = r < 0.25 ? 0x7f : r < 0.45 ? 0xbf : r < 0.65 ? 0xef : r < 0.8 ? 0xdf : 0xff; }
  vcs.swcha = stick; vcs.inpt4 = rand() < 0.3 ? 0 : 0x80;
  vcs.swchb = f % 3000 < 4 ? 0x0a : 0x0b; // Game Reset now and then
  if (f % 900 === 450 && vcs.ram[0xda & 0x7f] < 0x80) { vcs.ram[0xda & 0x7f] = 3; vcs.ram[0x82 & 0x7f] = Math.floor(rand() * 256); } // keep playing, new mazes
  vcs.runFrames(1);
}
console.log({ frames, bad });
process.exit(bad ? 1 : 0);
