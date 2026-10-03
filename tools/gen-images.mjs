// Renders the site's images from the translated cartridge (no ROM needed):
// the poster (game 1's first room), the next room after walking out of it,
// a room with Evil Otto (game 2), sprite plates, and the app icons. Pixels are 2:1 like
// the game. The player's lives are topped up while waiting so the frames are
// reached; nothing else is changed.
// usage: node tools/gen-images.mjs   -> img/*.png
import { mkdirSync } from 'node:fs';
import { BerzerkMachine } from '../src/berzerkMachine.mjs';
import { writeFramePng } from './atari/png.mjs';

const FIRST = 41, LINES = 191;
const LIVES = 0xda, OTTO_TIMER = 0xf6;
const ROBOT = 0x1a, PLAYER = 0x3c, WALL = 0x88; // game 1's colors

const start = (selects) => {
  const m = new BerzerkMachine();
  const run = (n) => { for (let i = 0; i < n; i += 1) m.runFrame(); };
  run(60);
  for (let i = 0; i < selects; i += 1) { m.bus.swchb = 0x09; run(2); m.bus.swchb = 0x0b; run(20); }
  m.bus.swchb = 0x0a; run(4); m.bus.swchb = 0x0b;
  return { m, run, visible: () => m.bus.tia.lastFrame.slice(FIRST, FIRST + LINES).map((r) => Array.from(r)) };
};

// blobs of one color: bounding boxes of 8-connected pixels
const blobs = (rows, color) => {
  const seen = new Set(), out = [];
  rows.forEach((row, y) => row.forEach((c, x) => {
    if (c !== color || seen.has(y * 160 + x)) return;
    const stack = [[x, y]]; seen.add(y * 160 + x);
    let box = [x, y, x, y];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      box = [Math.min(box[0], cx), Math.min(box[1], cy), Math.max(box[2], cx), Math.max(box[3], cy)];
      for (let dy = -3; dy <= 3; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = cx + dx, ny = cy + dy;
        if (ny >= 0 && ny < rows.length && nx >= 0 && nx < 160 && rows[ny][nx] === color && !seen.has(ny * 160 + nx)) { seen.add(ny * 160 + nx); stack.push([nx, ny]); }
      }
    }
    out.push(box);
  }));
  return out;
};
const crop = (rows, [x0, y0, x1, y1], pad = 2) => rows.slice(Math.max(0, y0 - pad), y1 + pad + 1).map((r) => r.slice(Math.max(0, x0 - pad), x1 + pad + 1));

mkdirSync('img', { recursive: true });
const g1 = start(0);
g1.run(120);
const room = g1.visible();
const room0Maze = g1.m.bus.ram[0x82 & 0x7f];
writeFramePng('img/start.png', room, 4, 2);
const robot = blobs(room, ROBOT).find((b) => b[3] - b[1] > 8);
const player = blobs(room, PLAYER).find((b) => b[3] - b[1] > 8);
writeFramePng('img/sprite-robot.png', crop(room, robot), 6, 3);
writeFramePng('img/sprite-player.png', crop(room, player), 6, 3);

// the next room: walk out of the first one to the right and let the new maze settle
g1.m.bus.swcha = 0x7f;
for (let i = 0; i < 400 && g1.m.bus.ram[0x82 & 0x7f] === room0Maze; i += 1) { g1.m.bus.ram[LIVES & 0x7f] = 3; g1.run(1); }
g1.m.bus.swcha = 0xff;
g1.run(150);
writeFramePng('img/room-next.png', g1.visible(), 4, 2);

// Evil Otto (game 2): step a little way into the room, wait for his launch
// timer, and take the first frame with his face. He shares the player's
// sprite on alternate frames, so in that frame the player is not drawn.
const g2 = start(1);
g2.run(60);
g2.m.bus.swcha = 0x7f; for (let i = 0; i < 25; i += 1) { g2.m.bus.ram[LIVES & 0x7f] = 3; g2.run(1); } g2.m.bus.swcha = 0xff;
for (let i = 0; i < 3000 && g2.m.bus.ram[OTTO_TIMER & 0x7f] < 3; i += 1) { g2.m.bus.ram[LIVES & 0x7f] = 3; g2.run(1); }
const FACE = [1, 1, 0, 1, 1, 0, 1, 1]; // the $DB row of EvilOttoSprite_0
let otto = null;
for (let f = 0; f < 600 && !otto; f += 1) {
  g2.m.bus.ram[LIVES & 0x7f] = 3; g2.run(1);
  const v = g2.visible();
  for (let y = 0; y < v.length && !otto; y += 1) for (let x = 1; x < 152 && !otto; x += 1) {
    if (v[y][x] === PLAYER && !v[y][x - 1] && FACE.every((b, i) => (v[y][x + i] === PLAYER) === !!b)) otto = { frame: v, box: [x, y - 4, x + 7, y + 11] }; // each sprite byte is two lines
  }
}
if (!otto) throw new Error('Evil Otto never appeared');
writeFramePng('img/room-otto.png', otto.frame, 4, 2);
writeFramePng('img/sprite-otto.png', crop(otto.frame, otto.box, 1), 6, 3);

// icons: a robot centered on black
for (const size of [180, 192, 512]) {
  const sprite = crop(room, robot, 0);
  const scale = Math.floor((size * 0.6) / Math.max(sprite[0].length * 2, sprite.length));
  const w = sprite[0].length * 2 * scale, h = sprite.length * scale;
  const rows = Array.from({ length: size }, () => new Array(size).fill(0));
  const left = Math.floor((size - w) / 2), top = Math.floor((size - h) / 2);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) rows[top + y][left + x] = sprite[Math.floor(y / scale)][Math.floor(x / (2 * scale))];
  writeFramePng(`img/icon-${size}.png`, rows, 1, 1);
}
console.log('wrote img/');
