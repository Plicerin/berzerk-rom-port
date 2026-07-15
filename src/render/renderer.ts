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

// TIA resolution
const TIA_WIDTH = 160;
const TIA_HEIGHT = 192;

// Scale factor for the canvas
const SCALE = 4;
const CANVAS_WIDTH = TIA_WIDTH * SCALE;
const CANVAS_HEIGHT = TIA_HEIGHT * SCALE;

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
  // The ASM kernel .drawMazeData: index = (Y+1)/2 + mazeOffset.

  const mazeOffset = zp.mazeOffset ?? 0;
  const mazePF0 = zp.mazePF0Value ?? 0;
  const halfKernel = H_KERNEL / 2; // 88
  const enteringFromNorth = zp.playerStartingLocation === PLAYER_ENTERING_NORTH;

  // Each playfield dot is 4 TIA color-clocks wide
  const dotW = 4 * SCALE;

  for (let scanline = 0; scanline < halfKernel; scanline++) {
    let pf0: number;
    let pf1: number;
    let pf2: number;

    if (scanline < 2 || scanline >= 86) {
      pf0 = 0xe0;
      pf1 = 0xff;
      pf2 = enteringFromNorth ? 0xff : 0x07;
    } else {
      const dataIndex = ((scanline >> 1) + 1) + mazeOffset;
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
  for (let i = 0; i < 6; i++) {
    const robotVertPos = zp.robotVertPos[i];
    const robotHorizPos = zp.robotHorizPos[i];
    const robotAnimIndex = zp.robotAnimationIndex[i];

    // Skip robots that are off-screen (vertPos = 127 means not on screen)
    if (robotVertPos >= 127) continue;
    if (robotHorizPos < 0) continue;

    // Get the robot's sprite data based on animation state
    const spriteKey = getRobotAnimKey(robotAnimIndex);
    const spriteData = RobotSpriteData[spriteKey];
    if (!spriteData) continue;

    // Determine robot color from RobotAnimationTable
    const colorEntry = RobotAnimationTable[i];
    const colorValue = colorEntry ? colorEntry[0] : 0;
    const cssColor = getTiaColor(colorValue);

    // Draw each frame line of the sprite
    for (let line = 0; line < spriteData.length; line++) {
      const frameLines = spriteData[line]; // number[]
      if (!frameLines || frameLines.length === 0) continue;
      if (frameLines[0] === 0) continue;

      const screenY = (robotVertPos + line) * SCALE;
      const screenX = robotHorizPos * SCALE;

      // Draw 9-bit sprite row (each bit = 1 pixel)
      for (let bit = 0; bit < 9; bit++) {
        if (frameLines[0] & (1 << (8 - bit))) {
          ctx.fillStyle = cssColor;
          ctx.fillRect(screenX + bit * SCALE, screenY, SCALE, SCALE);
        }
      }
    }
  }
}

function getRobotAnimKey(animIndex: number): string {
  // Map animation index to sprite data key
  const baseOffset = animIndex & 0x1f;

  if (baseOffset < 9) return "standing";
  if (baseOffset < 12) return "walkingLeft";
  if (baseOffset < 15) return "walkingRight";
  if (baseOffset < 18) return "walkingUp";
  if (baseOffset < 22) return "walkingDown";
  if (baseOffset < 26) return "death";

  return "standing";
}

// -----------------------------------------------------------------------------
// Evil Otto rendering
// -----------------------------------------------------------------------------

function renderEvilOtto(ctx: CanvasRenderingContext2D, zp: ZeroPage): void {
  if (zp.evilOttoHorizPos === 0 && zp.evilOttoVertPos === 0) return;

  const spriteKey = zp.loopCount % 2 === 0 ? "frame0" : "frame1";
  const spriteData = EvilOttoSpriteData[spriteKey];

  if (!spriteData) return;

  const screenX = zp.evilOttoHorizPos * SCALE;
  const screenY = zp.evilOttoVertPos * SCALE;

  // Otto is red
  ctx.fillStyle = "#ff0000";

  for (let line = 0; line < spriteData.length; line++) {
    const spriteRow = spriteData[line];
    if (spriteRow === 0) continue;

    for (let bit = 0; bit < 9; bit++) {
      if (spriteRow & (1 << (8 - bit))) {
        ctx.fillRect(screenX + bit * SCALE, screenY + line * SCALE, SCALE, SCALE);
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

  const screenX = playerHorizPos * SCALE;
  const screenY = playerVertPos * SCALE;

  // Player is white
  ctx.fillStyle = "#ffffff";

  for (let line = 0; line < spriteData.length; line++) {
    const spriteRow = spriteData[line];
    if (spriteRow === 0) continue;

    for (let bit = 0; bit < 9; bit++) {
      if (spriteRow & (1 << (8 - bit))) {
        ctx.fillRect(screenX + bit * SCALE, screenY + line * SCALE, SCALE, SCALE);
      }
    }
  }
}

function getPlayerSpriteKey(
  animIndex: number,
  direction: number,
  missileDir: number,
): string {
  const baseOffset = animIndex & 0x03;

  if (baseOffset === PLAYER_DEATH_ANIM_OFFSET) return "death";

  // Check for shooting animation
  if (missileDir !== 0 && (direction === MOVE_UP || direction === MOVE_DOWN)) {
    if (direction === MOVE_UP) return "fireUp";
    if (direction === MOVE_DOWN) return "fireDown";
  }

  if (direction === MOVE_RIGHT || direction === MOVE_LEFT) {
    return "fireHoriz";
  }

  if (baseOffset === PLAYER_RUN_ANIM_OFFSET) return "running0";

  return "stationary";
}

// -----------------------------------------------------------------------------
// Missile rendering
// -----------------------------------------------------------------------------

function renderMissiles(ctx: CanvasRenderingContext2D, zp: ZeroPage): void {
  // Player missile
  if (zp.playerMissileFlightTime > 0) {
    ctx.fillStyle = "#ffffff";
    const pmX = zp.playerMissileHorizPos * SCALE;
    const pmY = zp.playerMissileVertPos * SCALE;
    ctx.fillRect(pmX, pmY, SCALE, SCALE);
  }

  // Robot missiles (up to 6 active)
  for (let i = 0; i < 6; i++) {
    if (zp.robotMissileFlightTime > 0 && zp.robotHorizPos[i] > 0) {
      ctx.fillStyle = "#ff0000";
      const rmX = (zp.robotHorizPos[i] + zp.robotMissileHorizPos) * SCALE;
      const rmY = zp.robotMissileVertPos * SCALE;
      ctx.fillRect(rmX, rmY, SCALE, SCALE);
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
  ctx.font = `${12 * SCALE}px monospace`;
  ctx.fillText(`SCORE: ${score}`, 4 * SCALE, 12 * SCALE);
}

// -----------------------------------------------------------------------------
// Lives rendering
// -----------------------------------------------------------------------------

function renderLives(ctx: CanvasRenderingContext2D, zp: ZeroPage): void {
  const numLives = zp.numberOfLives;
  if (numLives <= 0) return;

  // Draw small player sprites as life indicators
  const startX = 4;
  const spacing = 10;

  for (let i = 0; i < Math.min(numLives, 3); i++) {
    const spriteData = PlayerSpriteData["stationary"];
    if (!spriteData) continue;

    const screenX = (startX + i * spacing) * SCALE;
    const screenY = 148 * SCALE;

    ctx.fillStyle = "#ffffff";

    for (let line = 0; line < spriteData.length; line++) {
      const spriteRow = spriteData[line];
      if (spriteRow === 0) continue;

      for (let bit = 0; bit < 9; bit++) {
        if (spriteRow & (1 << (8 - bit))) {
          ctx.fillRect(screenX + bit * SCALE, screenY + line * SCALE, SCALE, SCALE);
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
