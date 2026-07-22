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
  XMIN,
  XMAX,
  XMAX_PLAYER,
  YMIN,
  BLACK,
  WHITE,
  BLUE,
  PURPLE,
  GREEN_BLUE,
  LT_GREEN,
  YELLOW,
  RED,
  BROWN,
  BROWN_2,
  RED_2,
  RED_3,
  RED_4,
  ONE_COPY,
  TWO_COPIES,
  THREE_COPIES,
  QUAD_SIZE,
  MOVE_RIGHT,
  MOVE_LEFT,
  MOVE_DOWN,
  MOVE_UP,
  NO_MOVE,
  PLAYER_ENTERING_NORTH,
  PLAYER_ENTERING_SOUTH,
  PLAYER_ENTERING_EAST,
  PLAYER_ENTERING_WEST,
  ROBOT_SHOOTING_RIGHT,
  ROBOT_SHOOTING_LEFT,
  ROBOT_SHOOTING_DOWN,
  ROBOT_SHOOTING_UP,
  ROBOT_STAND_ANIM_OFFSET,
  ROBOT_LEFT_ANIM_OFFSET,
  ROBOT_RIGHT_ANIM_OFFSET,
  ROBOT_UP_ANIM_OFFSET,
  ROBOT_DOWN_ANIM_OFFSET,
  ROBOT_DEATH_ANIM_OFFSET,
  PLAYER_STAND_ANIM_OFFSET,
  PLAYER_RUN_ANIM_OFFSET,
  PLAYER_DEATH_ANIM_OFFSET,
  ROBOT_DEATH_ANIM_OFFSET as ROBOT_DEATH_ANIM_OFFSET_ALIAS,
} from "../constants/index";
import {
  MazePF0Data,
  MazePF1Data,
  MazePF2Data,
  LivesIndicator,
  CopyrightSprite,
  RobotSpriteData,
  PlayerSpriteData,
  EvilOttoSpriteData,
  RobotAnimationTable,
} from "../data/tables";

// TIA logical resolution. Atari 2600 pixels are not square on a 4:3 TV.
const TIA_WIDTH = 160;
const TIA_HEIGHT = 192;

// 4:3 display output: 160×192 logical pixels rendered as 640×480.
const SCALE_X = 4;
const SCALE_Y = 2.5;
const SCALE = SCALE_Y;
const SPRITE_SCALE = SCALE_X;
const CANVAS_WIDTH = TIA_WIDTH * SCALE_X;
const CANVAS_HEIGHT = TIA_HEIGHT * SCALE_Y;

// Color palette mapping (TIA color values → CSS colors)
const TIA_COLORS: Record<number, string> = {
  0x00: "#000000", // black
  0x0e: "#ffffff", // white
  0x10: "#ffff00", // yellow
  0x30: "#ff0000", // red
  0x40: "#ff0000", // red_2
  0x50: "#800080", // purple
  0x88: "#0000ff", // blue
  0xa8: "#00a8a8", // green_blue
  0xca: "#90ee90", // lt_green
  0xf0: "#8b4513", // brown
  0x0c: "#404040", // dark gray
  0x1a: "#808080", // gray
};

// Get a CSS color from a TIA color nibble
function tiaColor(value: number): string {
  const color = value & 0x0f;
  return TIA_COLORS[color] || "#000000";
}

// Get a TIA color value from a game color table entry
function getTiaColor(value: number): string {
  return TIA_COLORS[value] || "#000000";
}

/**
 * Render the full game state to the canvas.
 * This mirrors what the TIA kernel does:
 *   - Background (black)
 *   - Playfield (maze walls)
 *   - Sprites (player, robots, Otto, missiles)
 *   - Text overlay (score, lives)
 */
export function render(zp: ZeroPage, canvas: HTMLCanvasElement, region: number = 0): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Clear canvas
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Draw maze (playfield)
  renderMaze(ctx, zp);

  // Draw robots
  renderRobots(ctx, zp);

  // Draw Evil Otto
  renderEvilOtto(ctx, zp);

  // Draw player
  renderPlayer(ctx, zp);

  // Draw missiles
  renderMissiles(ctx, zp);

  // Draw score and lives
  renderScore(ctx, zp);
  renderLives(ctx, zp);
}

// -----------------------------------------------------------------------------
// Maze (Playfield) rendering
// -----------------------------------------------------------------------------

function renderMaze(ctx: CanvasRenderingContext2D, zp: ZeroPage): void {
  // Atari 2600 TIA playfield: 40 dots, each 4 color-clocks wide.
  // Left half: PF0.4→PF0.7, PF1.7→PF1.0, PF2.0→PF2.7  (20 dots)
  // Right half: mirrors left half (REFLECT mode, CTRLPF.0=1)
  //
  // PF0 (LSB first): dots 0-3 from bits 4,5,6,7
  // PF1 (MSB first): dots 4-11 from bits 7,6,5,4,3,2,1,0
  // PF2 (LSB first): dots 12-19 from bits 0,1,2,3,4,5,6,7
  //
  // Each dot = 4 TIA color-clocks = 4 * SCALE canvas pixels.
  // The ASM kernel .drawMazeData: index = Y/2 + mazeOffset.

  const mazeOffset = zp.mazeOffset ?? 0;
  const mazePF0 = zp.mazePF0Value ?? 0;
  const enteringFromNorth = zp.playerStartingLocation === PLAYER_ENTERING_NORTH;

  // Each playfield dot is 4 TIA color-clocks wide
  const dotW = 4 * SCALE_X;

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

    const rowY = scanline * SCALE;
    ctx.fillStyle = "#0000ff";

    // === LEFT HALF (dots 0-19) ===
    // PF0.4-7: dots 0-3 from bits 4,5,6,7 (LSB first)
    for (let i = 0; i < 4; i++) {
      if (pf0 & (1 << (4 + i))) {
        ctx.fillRect(i * dotW, rowY, dotW, SCALE);
      }
    }
    // PF1.7-0: dots 4-11 from bits 7,6,5,4,3,2,1,0 (MSB first)
    for (let i = 0; i < 8; i++) {
      if (pf1 & (1 << (7 - i))) {
        ctx.fillRect((4 + i) * dotW, rowY, dotW, SCALE);
      }
    }
    // PF2.0-7: dots 12-19 from bits 0,1,2,3,4,5,6,7 (LSB first)
    for (let i = 0; i < 8; i++) {
      if (pf2 & (1 << i)) {
        ctx.fillRect((12 + i) * dotW, rowY, dotW, SCALE);
      }
    }

    // === RIGHT HALF — MIRROR (dots 20-39) ===
    // PF2.7-0: dots 20-27 from bits 7,6,5,4,3,2,1,0 (reversed)
    for (let i = 0; i < 8; i++) {
      if (pf2 & (1 << (7 - i))) {
        ctx.fillRect((20 + i) * dotW, rowY, dotW, SCALE);
      }
    }
    // PF1.0-7: dots 28-35 from bits 0,1,2,3,4,5,6,7 (reversed)
    for (let i = 0; i < 8; i++) {
      if (pf1 & (1 << i)) {
        ctx.fillRect((28 + i) * dotW, rowY, dotW, SCALE);
      }
    }
    // PF0.7-4: dots 36-39 from bits 7,6,5,4 (reversed)
    for (let i = 0; i < 4; i++) {
      if (pf0 & (1 << (7 - i))) {
        ctx.fillRect((36 + i) * dotW, rowY, dotW, SCALE);
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Robot rendering
// -----------------------------------------------------------------------------

function renderRobots(ctx: CanvasRenderingContext2D, zp: ZeroPage): void {
  // Robot color table (from ASM RobotColorTable)
  const robotColors = [0x1a, 0x36, 0x0c, 0xca, 0x52, 0xa8, 0xf0, 0xa8];

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

    // Robot color from color table (indexed by gameLevel/2)
    const colorIdx = (zp.gameLevel >> 1) & 7;
    const cssColor = getTiaColor(robotColors[colorIdx]);

    const screenX = robotHorizPos * SCALE_X;

    for (let line = 0; line < spriteData.length; line++) {
      const row = spriteData[line];
      if (row === 0) continue;

      const screenY = robotVertPos * SCALE_Y + line * SPRITE_SCALE;
      for (let bit = 0; bit < 8; bit++) {
        if (row & (1 << (7 - bit))) {
          ctx.fillStyle = cssColor;
          ctx.fillRect(screenX + bit * SPRITE_SCALE, screenY, SPRITE_SCALE, SPRITE_SCALE);
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

function renderEvilOtto(ctx: CanvasRenderingContext2D, zp: ZeroPage): void {
  if (zp.evilOttoHorizPos === 0 && zp.evilOttoVertPos === 0) return;

  const spriteKey = zp.loopCount % 2 === 0 ? "frame0" : "frame1";
  const spriteData = EvilOttoSpriteData[spriteKey];

  if (!spriteData) return;

  const screenX = zp.evilOttoHorizPos * SCALE_X;
  const screenY = zp.evilOttoVertPos * SCALE_Y;

  // Otto is red
  ctx.fillStyle = "#ff0000";

  for (let line = 0; line < spriteData.length; line++) {
    const spriteRow = spriteData[line];
    if (spriteRow === 0) continue;

    for (let bit = 0; bit < 8; bit++) {
      if (spriteRow & (1 << (7 - bit))) {
        ctx.fillRect(screenX + bit * SPRITE_SCALE, screenY + line * SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE);
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Player rendering
// -----------------------------------------------------------------------------

function renderPlayer(ctx: CanvasRenderingContext2D, zp: ZeroPage): void {
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

  const screenX = playerHorizPos * SCALE_X;
  const screenY = playerVertPos * SCALE_Y;

  // Player is white
  ctx.fillStyle = "#ffffff";

  for (let line = 0; line < spriteData.length; line++) {
    const spriteRow = spriteData[line];
    if (spriteRow === 0) continue;

    for (let bit = 0; bit < 8; bit++) {
      if (spriteRow & (1 << (7 - bit))) {
        ctx.fillRect(screenX + bit * SPRITE_SCALE, screenY + line * SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE);
      }
    }
  }
}

function getPlayerSpriteKey(
  animIndex: number,
  direction: number,
  missileDir: number,
): string {
  // Death animation (offset 3)
  if ((animIndex & 0x03) === PLAYER_DEATH_ANIM_OFFSET) return "death";

  // Shooting animations
  if (missileDir !== 0) {
    if (direction === MOVE_UP) return "fireUp";
    if (direction === MOVE_DOWN) return "fireDown";
    return "fireHoriz";
  }

  // Running animation (toggles between 0 and 1)
  if ((animIndex & 0x01) !== 0) return "running1";

  return "stationary";
}

// -----------------------------------------------------------------------------
// Missile rendering
// -----------------------------------------------------------------------------

function renderMissiles(ctx: CanvasRenderingContext2D, zp: ZeroPage): void {
  // Player missile
  if (zp.playerMissileFlightTime > 0) {
    ctx.fillStyle = "#ffffff";
    const pmX = zp.playerMissileHorizPos * SCALE_X;
    const pmY = zp.playerMissileVertPos * SCALE_Y;
    ctx.fillRect(pmX, pmY, SCALE_X, SCALE_Y);
  }

  // Robot missiles (up to 6 active)
  for (let i = 0; i < 6; i++) {
    if (zp.robotMissileFlightTime > 0 && zp.robotHorizPos[i] > 0) {
      ctx.fillStyle = "#ff0000";
      const rmX = (zp.robotHorizPos[i] + zp.robotMissileHorizPos) * SCALE_X;
      const rmY = zp.robotMissileVertPos * SCALE_Y;
      ctx.fillRect(rmX, rmY, SCALE_X, SCALE_Y);
    }
  }
}

// -----------------------------------------------------------------------------
// Score rendering
// -----------------------------------------------------------------------------

function renderScore(ctx: CanvasRenderingContext2D, zp: ZeroPage): void {
  // Convert BCD score to string
  const score =
    (zp.playerScore2 * 100) + (zp.playerScore1 * 10) + zp.playerScore0;

  ctx.fillStyle = "#ffff00";
  ctx.font = `${12 * SCALE_Y}px monospace`;
  ctx.fillText(`SCORE: ${score}`, 4 * SCALE_X, 12 * SCALE_Y);
}

// -----------------------------------------------------------------------------
// Lives rendering
// -----------------------------------------------------------------------------

function renderLives(ctx: CanvasRenderingContext2D, zp: ZeroPage): void {
  const numLives = Math.max(0, zp.numberOfLives | 0);
  if (numLives <= 0) return;

  // ASM builds the lives display by writing LivesIndicator pointers into
  // digitPointer slots 10, 8, 6, ... and then jumping to DisplayLivesKernel.
  // That places the life icons in the top HUD row, to the right of the score.
  const maxIcons = Math.min(numLives, 6);
  const startX = 88;
  const spacing = 16;
  const startY = 5;

  ctx.fillStyle = "#ffffff";

  for (let i = 0; i < maxIcons; i++) {
    const screenX = (startX + i * spacing) * SCALE_X;
    const screenY = startY * SCALE_Y;

    for (let line = 0; line < LivesIndicator.length; line++) {
      const spriteRow = LivesIndicator[LivesIndicator.length - 1 - line];
      if (spriteRow === 0) continue;

      for (let bit = 0; bit < 8; bit++) {
        if (spriteRow & (1 << bit)) {
          ctx.fillRect(screenX + bit * SPRITE_SCALE, screenY + line * SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE);
        }
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Canvas setup
// -----------------------------------------------------------------------------

export function setupCanvas(container: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  canvas.style.imageRendering = "pixelated";
  canvas.style.display = "block";
  canvas.style.margin = "auto";
  canvas.style.backgroundColor = "#000000";

  container.appendChild(canvas);
  return canvas;
}
