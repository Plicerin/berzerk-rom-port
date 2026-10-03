// Playable Berzerk for the site: the translated cartridge (berzerkMachine.mjs)
// on a canvas, keyboard input while the game has focus, a gamepad, touch
// buttons on phones, and the TIA sound worklet. Mount with mountPlayer(root);
// root holds the canvas and the [data-*] controls.
import { BerzerkMachine } from './berzerkMachine.mjs';
import { NTSC_PALETTE_RGB } from './palette.mjs';
import { createTiaAudio } from './tiaAudio.mjs';
import { readGamepad, gamepadEdges } from './gamepad.mjs';

export const FIRST_LINE = 41;    // VBLANK goes off early in frame line 41 and back on early in line 232
export const VISIBLE_LINES = 191;
const FRAME_MS = 1000 / 60;
const KEYS = {
  ArrowRight: 'right', KeyD: 'right', ArrowLeft: 'left', KeyA: 'left',
  ArrowDown: 'down', KeyS: 'down', ArrowUp: 'up', KeyW: 'up', Space: 'fire', KeyZ: 'fire',
};
const LIVES = 0xda;
const POWER_ON_FRAMES = 90; // negative ($AA) while choosing a game and after a game ends

export function mountPlayer(root) {
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const playButton = root.querySelector('[data-play]');
  const poster = root.querySelector('[data-poster]');
  const hint = root.querySelector('[data-hint]');
  const muteButton = root.querySelector('[data-mute]');
  const pauseButton = root.querySelector('[data-pause]');

  const adv = new BerzerkMachine();
  const held = new Set();
  const audio = createTiaAudio(new URL('./tiaSound.worklet.js', import.meta.url).href);
  const screen = document.createElement('canvas');
  screen.width = 160;
  screen.height = VISIBLE_LINES;
  const screenCtx = screen.getContext('2d');
  const image = screenCtx.createImageData(160, VISIBLE_LINES);

  let started = false, paused = false, muted = false, resetHold = 0, selectHold = 0;
  // the console switches stay down while their key or button is held, as on the
  // console: the cartridge only reads them between rooms and debounces Select
  const switchDown = { reset: false, select: false };
  let last = 0, acc = 0, pad = null, lastState = '';

  const setHint = (text) => { if (hint) hint.textContent = text; };
  const silence = () => audio.setSilent(muted || paused || !started);
  const ram = (addr) => adv.bus.ram[addr & 0x7f];

  function step() {
    const on = (control) => held.has(control) || !!pad?.[control];
    let swcha = 0xff;
    if (on('right')) swcha &= ~0x80;
    if (on('left')) swcha &= ~0x40;
    if (on('down')) swcha &= ~0x20;
    if (on('up')) swcha &= ~0x10;
    adv.bus.swcha = swcha;
    adv.bus.inpt4 = on('fire') ? 0x00 : 0x80;
    // SWCHB: bit 0 RESET and bit 1 SELECT (low = pressed); the NTSC cartridge reads nothing else
    // a Game Reset in the cartridge's first second leaves it waiting for the
    // button (the ROM does that too), so the Play button's reset waits until then
    const resetNow = (resetHold > 0 && adv.bus.frame >= POWER_ON_FRAMES) || switchDown.reset;
    adv.bus.swchb = (resetNow ? 0 : 0x01) | (selectHold > 0 || switchDown.select ? 0 : 0x02) | 0x08;
    adv.runFrame();
    if (resetHold > 0 && resetNow) resetHold -= 1;
    if (selectHold > 0) selectHold -= 1;
    audio.update(adv.bus.audio);
    // hints follow the game: choosing a game, playing, game over
    const state = ram(LIVES) >= 0x80 ? (lastState === 'playing' ? 'over' : lastState === 'over' ? 'over' : 'choosing') : 'playing';
    if (started && state !== lastState) {
      if (state === 'choosing') setHint('The number at the bottom is the game. G changes it; fire or Enter starts it.');
      else if (state === 'playing') setHint('Clear the robots and get out. Hold fire to shoot the way you last pushed. P pauses, M mutes.');
      else setHint('Game over. Press fire or Enter to play again, or G to pick another game.');
    }
    lastState = state;
  }

  function draw() {
    const rows = adv.bus.tia.lastFrame;
    if (!rows) return;
    const data = image.data;
    for (let y = 0; y < VISIBLE_LINES; y += 1) {
      const row = rows[FIRST_LINE + y];
      for (let x = 0; x < 160; x += 1) {
        const rgb = NTSC_PALETTE_RGB[(row[x] >> 1) & 0x7f];
        const o = (y * 160 + x) * 4;
        data[o] = rgb >> 16; data[o + 1] = (rgb >> 8) & 0xff; data[o + 2] = rgb & 0xff; data[o + 3] = 255;
      }
    }
    screenCtx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(screen, 0, 0, canvas.width, canvas.height);
  }

  function frame(t) {
    if (!last) last = t;
    const dt = Math.min(100, t - last);
    last = t;
    pad = readGamepad();
    const edges = gamepadEdges(pad);
    if (edges.start) (started ? pressReset() : play());
    if (edges.back && started) togglePause();
    if (!paused && !document.hidden) {
      acc += dt;
      while (acc >= FRAME_MS) { step(); acc -= FRAME_MS; }
    }
    draw();
    requestAnimationFrame(frame);
  }

  function pressReset() {
    resetHold = 2;
    paused = false;
    if (pauseButton) pauseButton.textContent = 'Pause';
    silence();
  }

  // Game Select: the first press shows the game number, each further one advances it
  function pressSelect() {
    selectHold = 2;
  }

  async function play() {
    started = true;
    lastState = ''; // show the hint for wherever the game is now
    if (poster) poster.hidden = true;
    canvas.focus({ preventScroll: true });
    pressReset(); // before the audio: starting it can take a moment, the game should not wait
    await audio.start();
    silence();
  }

  function togglePause() {
    paused = !paused;
    if (pauseButton) pauseButton.textContent = paused ? 'Resume' : 'Pause';
    silence();
  }

  function toggleMute() {
    muted = !muted;
    if (muteButton) {
      muteButton.textContent = muted ? 'Sound on' : 'Mute';
      muteButton.setAttribute('aria-pressed', String(muted));
    }
    silence();
  }

  playButton?.addEventListener('click', play);
  pauseButton?.addEventListener('click', () => { if (started) togglePause(); });
  muteButton?.addEventListener('click', toggleMute);
  const holdSwitch = (button, name, first) => {
    if (!button) return;
    button.addEventListener('pointerdown', () => { if (!started) play(); else first(); switchDown[name] = true; });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(ev, () => { switchDown[name] = false; });
  };
  holdSwitch(root.querySelector('[data-reset]'), 'reset', pressReset);
  holdSwitch(root.querySelector('[data-select]'), 'select', pressSelect);

  canvas.addEventListener('keydown', (event) => {
    const control = KEYS[event.code];
    if (control) { event.preventDefault(); held.add(control); }
    if (event.code === 'Enter') { event.preventDefault(); if (!started) play(); else { if (!event.repeat) pressReset(); switchDown.reset = true; } }
    if (event.code === 'KeyG') { if (!event.repeat) pressSelect(); switchDown.select = true; }
    if (event.code === 'KeyP') togglePause();
    if (event.code === 'KeyM') toggleMute();
  });
  canvas.addEventListener('keyup', (event) => {
    const control = KEYS[event.code];
    if (control) held.delete(control);
    if (event.code === 'Enter') switchDown.reset = false;
    if (event.code === 'KeyG') switchDown.select = false;
  });
  canvas.addEventListener('blur', () => { held.clear(); switchDown.reset = switchDown.select = false; });
  canvas.addEventListener('pointerdown', () => { if (!started) play(); });

  // touch controls: hold to press
  root.querySelectorAll('[data-hold]').forEach((button) => {
    const control = button.dataset.hold;
    const down = (event) => {
      event.preventDefault();
      held.add(control);
      if (!started) play();
      try { button.setPointerCapture(event.pointerId); } catch { /* finger already lifted: the press still counts */ }
    };
    const up = () => held.delete(control);
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
  });

  document.addEventListener('visibilitychange', () => (document.hidden ? audio.suspend() : audio.resume()));

  step();
  draw();
  requestAnimationFrame(frame);

  // dev hook for headless checks: runs frames without the animation loop
  return {
    machine: adv,
    step(n = 1) { for (let i = 0; i < n; i += 1) step(); draw(); },
    hold(control, on) { if (on) held.add(control); else held.delete(control); },
    holdSwitch(name, on) { switchDown[name] = on; },
    reset: pressReset,
    play,
    select: pressSelect,
  };
}
