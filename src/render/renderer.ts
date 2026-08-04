// =============================================================================
// Canvas Renderer for Berzerk
// Ported from: Berzerk (decomp).asm
// Original: Atari 1984, Programmer: Dan Hitchens
// Decomp: Dennis Debro
//
// Renders the full game state (maze, sprites, text, lives) to a Canvas element,
// scaling the 160×192 TIA resolution to fit the display.
// =============================================================================

import { ZeroPage } from "../tia/zeropage";
import {
  H_KERNEL,
  MOVE_DOWN,
  MOVE_LEFT,
  MOVE_UP,
  PLAYER_DEATH_ANIM_OFFSET,
  PLAYER_ENTERING_NORTH,
  PLAYER_ENTERING_SOUTH,
} from "../constants/index";
import {
  MazePF0Data,
  MazePF1Data,
  MazePF2Data,
  LivesIndicator,
  RobotSpriteData,
  PlayerSpriteData,
  EvilOttoSpriteData,
} from "../data/tables";

// TIA logical resolution. Atari 2600 pixels are not square on a 4:3 TV.
const TIA_WIDTH = 160;

// Reference comparison output. The OldGames Atari 2600 reference image is
// 320×224, with visible game pixels inset from the capture border.
const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 224;
const VIEWPORT_X = 8;
const VIEWPORT_Y = 14;
const VIEWPORT_WIDTH = 304;
const VIEWPORT_HEIGHT = 185;
const SCALE_X = VIEWPORT_WIDTH / TIA_WIDTH;
const SCALE_Y = VIEWPORT_HEIGHT / H_KERNEL;
const SCALE = SCALE_Y;
const SPRITE_SCALE = 2;

/**
 * Render the full game state to the canvas.
 * This mirrors what the TIA kernel does:
 *   - Background (black)
 *   - Playfield (maze walls)
 *   - Sprites (player, robots, Otto, missiles)
 *   - Text overlay (score, lives)
 */
export interface RenderOptions {
  comparisonMode?: boolean;
}

type TransitionClip = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export function render(
  zp: ZeroPage,
  canvas: HTMLCanvasElement,
  _region: number = 0,
  options: RenderOptions = {},
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.imageSmoothingEnabled = false;

  const transitionClip = getTransitionClip(zp);

  renderBackdrop(ctx);
  renderMaze(ctx, zp, transitionClip);
  renderRobots(ctx, zp, transitionClip);
  renderEvilOtto(ctx, zp, transitionClip);
  renderPlayer(ctx, zp, transitionClip);
  renderMissiles(ctx, zp, transitionClip);
  if (options.comparisonMode) {
    renderCopyright(ctx);
  } else {
    renderScore(ctx, zp);
    renderLives(ctx, zp);
  }
}

function renderBackdrop(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function getTransitionClip(zp: ZeroPage): TransitionClip {
  const upperLimit = Math.max(0, zp.upperPlayfieldLimit | 0);
  const lowerLimit = Math.min(H_KERNEL / 2, Math.max(0, zp.lowerPlayfieldLimit | 0));
  const fullClip = {
    left: VIEWPORT_X,
    right: VIEWPORT_X + VIEWPORT_WIDTH,
    top: VIEWPORT_Y,
    bottom: VIEWPORT_Y + VIEWPORT_HEIGHT,
  };

  const isTransitionActive = zp.gameState === 0xff || upperLimit !== 0 || lowerLimit !== H_KERNEL / 2;
  if (!isTransitionActive) {
    return fullClip;
  }

  const transitionDir = zp.gameState === 0xff ? zp.tempPlayerExitingPos : zp.playerStartingLocation;
  if (transitionDir === undefined) {
    return fullClip;
  }

  if (transitionDir === PLAYER_ENTERING_NORTH || transitionDir === PLAYER_ENTERING_SOUTH) {
    return {
      ...fullClip,
      top: VIEWPORT_Y + Math.round(upperLimit * 2 * SCALE),
      bottom: VIEWPORT_Y + Math.round(lowerLimit * 2 * SCALE),
    };
  }

  return {
    ...fullClip,
    left: VIEWPORT_X + Math.round((upperLimit / (H_KERNEL / 2)) * VIEWPORT_WIDTH),
    right: VIEWPORT_X + Math.round((lowerLimit / (H_KERNEL / 2)) * VIEWPORT_WIDTH),
  };
}

function drawClippedRect(
  ctx: CanvasRenderingContext2D,
  clip: TransitionClip,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const clippedLeft = Math.max(x, clip.left);
  const clippedRight = Math.min(x + width, clip.right);
  const clippedTop = Math.max(y, clip.top);
  const clippedBottom = Math.min(y + height, clip.bottom);
  if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) return;
  ctx.fillRect(clippedLeft, clippedTop, clippedRight - clippedLeft, clippedBottom - clippedTop);
}

// -----------------------------------------------------------------------------
// Maze (Playfield) rendering
// -----------------------------------------------------------------------------

function renderMaze(ctx: CanvasRenderingContext2D, zp: ZeroPage, clip: TransitionClip): void {
  // Atari 2600 TIA playfield: 40 dots, each 4 color-clocks wide.
  // Left half: PF0.4→PF0.7, PF1.7→PF1.0, PF2.0→PF2.7  (20 dots)
  // Right half: mirrors left half (REFLECT mode, CTRLPF.0=1)
  //
  // We quantize every edge to integer screen pixels so the browser does not
  // anti-alias fractional fillRects into visible gaps between wall segments.

  const mazeOffset = zp.mazeOffset ?? 0;
  const mazePF0 = zp.mazePF0Value ?? 0;
  const enteringFromNorth = zp.playerStartingLocation === PLAYER_ENTERING_NORTH;
  const dotW = 4 * SCALE_X;

  const localClip: TransitionClip = {
    left: clip.left - VIEWPORT_X,
    right: clip.right - VIEWPORT_X,
    top: clip.top - VIEWPORT_Y,
    bottom: clip.bottom - VIEWPORT_Y,
  };

  const drawDot = (dotIndex: number, rowTop: number, rowHeight: number): void => {
    const x0 = Math.round(dotIndex * dotW);
    const x1 = Math.round((dotIndex + 1) * dotW);
    drawClippedRect(ctx, localClip, x0, rowTop, Math.max(1, x1 - x0), rowHeight);
  };

  ctx.save();
  ctx.translate(VIEWPORT_X, VIEWPORT_Y);
  ctx.fillStyle = "#9591ff";

  for (let scanline = 0; scanline < H_KERNEL; scanline++) {
    let pf0: number;
    let pf1: number;
    let pf2: number;

    if (scanline < 4 || scanline >= 172) {
      pf0 = 0xe0;
      pf1 = 0xff;
      pf2 = enteringFromNorth ? 0xff : 0x07;
    } else {
      const dataIndex = (scanline >> 2) + mazeOffset;
      pf0 = (MazePF0Data[dataIndex] ?? 0) | mazePF0;
      pf1 = MazePF1Data[dataIndex] ?? 0;
      pf2 = MazePF2Data[dataIndex] ?? 0;
    }

    const rowTop = Math.round(scanline * SCALE);
    const rowBottom = Math.round((scanline + 1) * SCALE);
    const rowHeight = Math.max(1, rowBottom - rowTop);

    for (let i = 0; i < 4; i++) {
      if (pf0 & (1 << (4 + i))) drawDot(i, rowTop, rowHeight);
    }
    for (let i = 0; i < 8; i++) {
      if (pf1 & (1 << (7 - i))) drawDot(4 + i, rowTop, rowHeight);
    }
    for (let i = 0; i < 8; i++) {
      if (pf2 & (1 << i)) drawDot(12 + i, rowTop, rowHeight);
    }
    for (let i = 0; i < 8; i++) {
      if (pf2 & (1 << (7 - i))) drawDot(20 + i, rowTop, rowHeight);
    }
    for (let i = 0; i < 8; i++) {
      if (pf1 & (1 << i)) drawDot(28 + i, rowTop, rowHeight);
    }
    for (let i = 0; i < 4; i++) {
      if (pf0 & (1 << (7 - i))) drawDot(36 + i, rowTop, rowHeight);
    }
  }
  ctx.restore();
}

// -----------------------------------------------------------------------------
// Robot rendering
// -----------------------------------------------------------------------------

function renderRobots(ctx: CanvasRenderingContext2D, zp: ZeroPage, clip: TransitionClip): void {
  for (let i = 0; i < 6; i++) {
    const robotVertPos = zp.robotVertPos[i];
    const robotHorizPos = zp.robotHorizPos[i];
    const robotAnimIndex = zp.robotAnimationIndex[i];

    if (robotVertPos === 0x7f) continue; // ASM sentinel for off-screen

    // Decode animation index → sprite key + frame
    const { key, frame } = decodeRobotAnim(robotAnimIndex);
    const frames = RobotSpriteData[key];
    if (!frames) continue;
    const spriteData = frames[frame % frames.length];
    if (!spriteData) continue;

    // Atari 2600 Berzerk presents robots as yellow on the early boards.
    const cssColor = "#c1a739";

    const screenX = VIEWPORT_X + robotHorizPos * SCALE_X;

    for (let line = 0; line < spriteData.length; line++) {
      const row = spriteData[line];
      if (row === 0) continue;

      const screenY = VIEWPORT_Y + robotVertPos * SCALE_Y + line * SPRITE_SCALE;
      for (let bit = 0; bit < 8; bit++) {
        if (row & (1 << (7 - bit))) {
          ctx.fillStyle = cssColor;
          drawClippedRect(ctx, clip, screenX + bit * SPRITE_SCALE, screenY, SPRITE_SCALE, SPRITE_SCALE);
        }
      }
    }
  }

}

function decodeRobotAnim(animIndex: number): { key: string; frame: number } {
  // ASM RobotAnimationTable offsets:
  // standing: 0-8 (9 frames)
  // walkingLeft: 9-11 (3 frames)
  // walkingRight: 12-14 (3 frames)
  // walkingUp: 15-18 (4 frames)
  // walkingDown: 19-22 (4 frames)  [note: ASM has 4 entries but data has 2]
  // death: 23-25 (3 frames)
  const idx = animIndex & 0x1f;
  if (idx < 9)  return { key: "standing",    frame: idx };
  if (idx < 12) return { key: "walkingLeft",  frame: idx - 9 };
  if (idx < 15) return { key: "walkingRight", frame: idx - 12 };
  if (idx < 18) return { key: "walkingUp",    frame: idx - 15 };
  if (idx < 22) return { key: "walkingDown",  frame: idx - 18 };
  if (idx < 26) return { key: "death",        frame: idx - 23 };
  return { key: "standing", frame: 0 };
}

// -----------------------------------------------------------------------------
// Evil Otto rendering
// -----------------------------------------------------------------------------

function renderEvilOtto(ctx: CanvasRenderingContext2D, zp: ZeroPage, clip: TransitionClip): void {
  if (zp.evilOttoHorizPos === 0 && zp.evilOttoVertPos === 0) return;

  const spriteKey = zp.loopCount % 2 === 0 ? "frame0" : "frame1";
  const spriteData = EvilOttoSpriteData[spriteKey];

  if (!spriteData) return;

  const screenX = VIEWPORT_X + zp.evilOttoHorizPos * SCALE_X;
  const screenY = VIEWPORT_Y + zp.evilOttoVertPos * SCALE_Y;

  // Otto is red
  ctx.fillStyle = "#ff3030";

  for (let line = 0; line < spriteData.length; line++) {
    const spriteRow = spriteData[line];
    if (spriteRow === 0) continue;

    for (let bit = 0; bit < 8; bit++) {
      if (spriteRow & (1 << (7 - bit))) {
        drawClippedRect(ctx, clip, screenX + bit * SPRITE_SCALE, screenY + line * SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE);
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Player rendering
// -----------------------------------------------------------------------------

function renderPlayer(ctx: CanvasRenderingContext2D, zp: ZeroPage, clip: TransitionClip): void {
  const playerHorizPos = zp.playerHorizPos;
  const playerVertPos = zp.playerVertPos;
  const playerAnimIndex = zp.playerAnimationIndex;
  const playerDirection = zp.playerDirection;

  // Get the player's sprite data based on animation state
  const spriteKey = getPlayerSpriteKey(
    playerAnimIndex,
    playerDirection,
    zp.playerMissileDirection,
  );
  const spriteData = PlayerSpriteData[spriteKey];

  if (!spriteData) return;

  const screenX = VIEWPORT_X + playerHorizPos * SCALE_X;
  const screenY = VIEWPORT_Y + playerVertPos * SCALE_Y;

  // Player is pink in the Atari 2600 gameplay reference.
  ctx.fillStyle = "#ffa7b3";
  const reflect = shouldReflectPlayer(playerDirection);

  for (let line = 0; line < spriteData.length; line++) {
    const spriteRow = spriteData[line];
    if (spriteRow === 0) continue;

    for (let bit = 0; bit < 8; bit++) {
      const sourceBit = reflect ? bit : 7 - bit;
      if (spriteRow & (1 << sourceBit)) {
        drawClippedRect(ctx, clip, screenX + bit * SPRITE_SCALE, screenY + line * SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE);
      }
    }
  }
}

function shouldReflectPlayer(direction: number): boolean {
  // ASM: lda playerDirection / asl / sta REFP0. With Berzerk's joystick bit
  // layout, MOVE_LEFT is the bit that reaches the TIA reflect flag.
  return (direction & MOVE_LEFT) !== 0;
}

function getPlayerSpriteKey(
  animIndex: number,
  direction: number,
  missileDir: number,
): string {
  // Death animation begins at offset 3 and then keeps incrementing as a ROM-style
  // counter until bit 7 sets. Any value in that range should still render death.
  if (animIndex >= PLAYER_DEATH_ANIM_OFFSET) return "death";

  // Shooting animations
  if (missileDir !== 0) {
    if (direction === MOVE_UP) return "fireUp";
    if (direction === MOVE_DOWN) return "fireDown";
    return "fireHoriz";
  }

  // ROM walking sequence uses animation indices 2 -> 1 -> 0.
  if (animIndex === 2) return "running1";
  if (animIndex === 1) return "running0";

  return "stationary";
}

// -----------------------------------------------------------------------------
// Missile rendering
// -----------------------------------------------------------------------------

function renderMissiles(ctx: CanvasRenderingContext2D, zp: ZeroPage, clip: TransitionClip): void {
  if (zp.playerMissileFlightTime > 0) {
    const pmX = VIEWPORT_X + zp.playerMissileHorizPos * SCALE_X;
    const pmY = VIEWPORT_Y + zp.playerMissileVertPos * 2 * SCALE_Y;
    ctx.fillStyle = "#ffffff";
    drawClippedRect(ctx, clip, pmX, pmY, SCALE_X, SCALE_Y * 2);
  }

  if (zp.robotMissileFlightTime > 0 && zp.robotMissileDirection !== 0 && zp.robotMissileDirection !== 0x0f) {
    const rmX = VIEWPORT_X + zp.robotMissileHorizPos * SCALE_X;
    const rmY = VIEWPORT_Y + zp.robotMissileVertPos * SCALE_Y;
    ctx.fillStyle = "#ff3030";
    drawClippedRect(ctx, clip, rmX, rmY, SCALE_X, SCALE_Y);
  }
}

// -----------------------------------------------------------------------------
// Score rendering
// -----------------------------------------------------------------------------

const ReferenceCopyrightBitmap = [
  "..########....##..######..######..######........##..##########..##....####....##",
  "##........##..##..##..##..##..##..##..##......##..##....##....##..##..##..##..##",
  "##..####..##..##..##..##..##..##......##......##..##....##....##..##..##..##..##",
  "##..##....##..##..######..######..######......######....##....######..####....##",
  "##..####..##..##......##..##..##..##..........##..##....##....##..##..##..##..##",
  "##........##..##......##..##..##..##..........##..##....##....##..##..##..##..##",
  "..########....##......##..######..######......##..##....##....##..##..##..##..##",
] as const;

function renderCopyright(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#e7cc5b";
  const originX = 126;
  const originY = 193;

  for (let row = 0; row < ReferenceCopyrightBitmap.length; row++) {
    const bitmapRow = ReferenceCopyrightBitmap[row];
    for (let col = 0; col < bitmapRow.length; col++) {
      if (bitmapRow[col] === "#") {
        ctx.fillRect(originX + col, originY + row, 1, 1);
      }
    }
  }
}

function renderScore(ctx: CanvasRenderingContext2D, zp: ZeroPage): void {
  const scoreBytes = [zp.playerScore0, zp.playerScore1, zp.playerScore2];
  const digits = scoreBytes
    .map(byte => `${(byte >> 4) & 0x0f}${byte & 0x0f}`)
    .join("");
  const firstNonZero = digits.search(/[1-9]/);
  if (firstNonZero === -1) return;
  const displayDigits = " ".repeat(firstNonZero) + digits.slice(firstNonZero);
  renderPixelText(ctx, displayDigits, 10, 8, "#e7cc5b");
}

const PixelGlyphs: Record<string, string[]> = {
  "©": ["01110", "10001", "10111", "10100", "10111", "10001", "01110"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "10001", "01110"],
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function renderPixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  let cursorX = x;
  for (const char of text) {
    const glyph = PixelGlyphs[char];
    if (!glyph) {
      cursorX += 6;
      continue;
    }
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] === "1") {
          ctx.fillRect(cursorX + col, y + row, 1, 1);
        }
      }
    }
    cursorX += 6;
  }
}

function renderLives(ctx: CanvasRenderingContext2D, zp: ZeroPage): void {
  const numLives = Math.max(0, zp.numberOfLives | 0);
  const maxIcons = Math.min(numLives, 6);
  const startX = 250;
  const startY = 8;
  const spacing = 10;

  ctx.fillStyle = "#ffa7b3";
  for (let i = 0; i < maxIcons; i++) {
    const screenX = startX + i * spacing;
    for (let line = 0; line < LivesIndicator.length; line++) {
      const spriteRow = LivesIndicator[LivesIndicator.length - 1 - line];
      for (let bit = 0; bit < 8; bit++) {
        if (spriteRow & (1 << bit)) {
          ctx.fillRect(screenX + bit, startY + line, 1, 1);
        }
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Canvas setup
// -----------------------------------------------------------------------------

export function setupCanvas(container: HTMLElement): HTMLCanvasElement {
  const existingCanvas = container.querySelector?.("canvas") as HTMLCanvasElement | null;
  const canvas = existingCanvas ?? document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  canvas.setAttribute("aria-label", "Berzerk game screen");
  canvas.style.imageRendering = "pixelated";
  canvas.style.display = "block";
  canvas.style.width = "320px";
  canvas.style.maxWidth = "100%";
  canvas.style.height = "224px";
  canvas.style.aspectRatio = "10 / 7";
  canvas.style.margin = "auto";
  canvas.style.backgroundColor = "#000000";

  if (!existingCanvas) {
    container.appendChild(canvas);
  }
  return canvas;
}
