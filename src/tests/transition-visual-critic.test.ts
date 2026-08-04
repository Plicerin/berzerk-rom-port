// @vitest-environment node

import { describe, it, expect, vi } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame } from "../game";
import { render } from "../render/renderer";
import {
  PLAYER_ENTERING_NORTH,
  PLAYER_ENTERING_SOUTH,
  PLAYER_ENTERING_WEST,
  PLAYER_ENTERING_EAST,
} from "../constants";

type Rgb = [number, number, number];
type Image = { width: number; height: number; pixels: Uint8Array };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const ACTIVE_COLORS = new Set(["#9591ff", "#c1a739", "#ffa7b3", "#ff3030", "#ffffff"]);
const VIEWPORT_X = 8;
const VIEWPORT_Y = 14;
const VIEWPORT_WIDTH = 304;
const VIEWPORT_HEIGHT = 185;
const H_KERNEL = 176;
const SCALE = VIEWPORT_HEIGHT / H_KERNEL;
const HALF_KERNEL = H_KERNEL / 2;

function colorToRgb(color: string): Rgb {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function hex(rgb: Rgb): string {
  return `#${rgb.map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

function rasterizeTransitionScene(config: {
  gameState?: number;
  tempPlayerExitingPos?: number;
  playerStartingLocation?: number;
  upperPlayfieldLimit: number;
  lowerPlayfieldLimit: number;
}): Image {
  const width = 320;
  const height = 224;
  const pixels = new Uint8Array(width * height * 3);
  const stack: Array<{ x: number; y: number }> = [];
  let fillStyle = "#000000";
  let translateX = 0;
  let translateY = 0;

  const ctx: any = {
    imageSmoothingEnabled: false,
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      const [r, g, b] = colorToRgb(fillStyle);
      const minX = Math.max(0, Math.floor(x + translateX));
      const minY = Math.max(0, Math.floor(y + translateY));
      const maxX = Math.min(width - 1, Math.ceil(x + translateX + w) - 1);
      const maxY = Math.min(height - 1, Math.ceil(y + translateY + h) - 1);
      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          const i = (py * width + px) * 3;
          pixels[i] = r;
          pixels[i + 1] = g;
          pixels[i + 2] = b;
        }
      }
    }),
    save: vi.fn(() => stack.push({ x: translateX, y: translateY })),
    restore: vi.fn(() => {
      const previous = stack.pop();
      translateX = previous?.x ?? 0;
      translateY = previous?.y ?? 0;
    }),
    translate: vi.fn((x: number, y: number) => {
      translateX += x;
      translateY += y;
    }),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    createRadialGradient: vi.fn(),
  };
  Object.defineProperty(ctx, "fillStyle", {
    get: () => fillStyle,
    set: (value: string) => { fillStyle = value; },
  });

  const canvas = { getContext: vi.fn().mockReturnValue(ctx) } as unknown as HTMLCanvasElement;
  const zp = createZeroPage();
  initGame(zp, 0, 0);

  zp.gameState = config.gameState ?? 0;
  zp.tempPlayerExitingPos = config.tempPlayerExitingPos ?? PLAYER_ENTERING_NORTH;
  zp.playerStartingLocation = config.playerStartingLocation ?? PLAYER_ENTERING_NORTH;
  zp.upperPlayfieldLimit = config.upperPlayfieldLimit;
  zp.lowerPlayfieldLimit = config.lowerPlayfieldLimit;

  zp.playerHorizPos = 14;
  zp.playerVertPos = 52;
  zp.playerAnimationIndex = 0;
  zp.robotHorizPos[0] = (252 - 8) / 1.9;
  zp.robotVertPos[0] = (24 - 14) / (185 / 176);
  zp.robotAnimationIndex[0] = 0;
  zp.robotHorizPos[1] = (136 - 8) / 1.9;
  zp.robotVertPos[1] = (44 - 14) / (185 / 176);
  zp.robotAnimationIndex[1] = 0;
  zp.robotHorizPos[2] = (38 - 8) / 1.9;
  zp.robotVertPos[2] = (124 - 14) / (185 / 176);
  zp.robotAnimationIndex[2] = 0;
  zp.robotHorizPos[3] = (172 - 8) / 1.9;
  zp.robotVertPos[3] = (164 - 14) / (185 / 176);
  zp.robotAnimationIndex[3] = 0;
  zp.robotVertPos[4] = 0x7f;
  zp.robotVertPos[5] = 0x7f;

  render(zp, canvas, 0, { comparisonMode: true });
  return { width, height, pixels };
}

function boundsForActiveColors(image: Image): Bounds {
  const bounds: Bounds = { minX: image.width, minY: image.height, maxX: -1, maxY: -1 };
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 3;
      const color = hex([image.pixels[i], image.pixels[i + 1], image.pixels[i + 2]]);
      if (!ACTIVE_COLORS.has(color)) continue;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  return bounds;
}

describe("harsh directional transition visual critics", () => {
  it("west-exit critic: room close must wipe inward from the left edge", () => {
    const rendered = rasterizeTransitionScene({
      gameState: 0xff,
      tempPlayerExitingPos: PLAYER_ENTERING_WEST,
      upperPlayfieldLimit: 24,
      lowerPlayfieldLimit: HALF_KERNEL,
    });
    const bounds = boundsForActiveColors(rendered);
    const expectedMinX = VIEWPORT_X + Math.round((24 / HALF_KERNEL) * VIEWPORT_WIDTH);

    expect(bounds.minX).toBeGreaterThanOrEqual(expectedMinX - 1);
    expect(bounds.maxX).toBeLessThanOrEqual(VIEWPORT_X + VIEWPORT_WIDTH - 1);
    expect(bounds.minY).toBeGreaterThanOrEqual(VIEWPORT_Y);
    expect(bounds.maxY).toBeLessThanOrEqual(VIEWPORT_Y + VIEWPORT_HEIGHT);
  });

  it("east-exit critic: room close must wipe inward from the right edge", () => {
    const rendered = rasterizeTransitionScene({
      gameState: 0xff,
      tempPlayerExitingPos: PLAYER_ENTERING_EAST,
      upperPlayfieldLimit: 0,
      lowerPlayfieldLimit: 64,
    });
    const bounds = boundsForActiveColors(rendered);
    const expectedMaxX = VIEWPORT_X + Math.round((64 / HALF_KERNEL) * VIEWPORT_WIDTH) - 1;

    expect(bounds.minX).toBeGreaterThanOrEqual(VIEWPORT_X);
    expect(bounds.maxX).toBeLessThanOrEqual(expectedMaxX + 1);
  });

  it("north-exit critic: room close must wipe downward from the top edge", () => {
    const rendered = rasterizeTransitionScene({
      gameState: 0xff,
      tempPlayerExitingPos: PLAYER_ENTERING_NORTH,
      upperPlayfieldLimit: 16,
      lowerPlayfieldLimit: HALF_KERNEL,
    });
    const bounds = boundsForActiveColors(rendered);
    const expectedMinY = VIEWPORT_Y + Math.round(16 * 2 * SCALE);

    expect(bounds.minY).toBeGreaterThanOrEqual(expectedMinY - 1);
    expect(bounds.maxY).toBeLessThanOrEqual(VIEWPORT_Y + VIEWPORT_HEIGHT);
  });

  it("south-exit critic: room close must wipe upward from the bottom edge", () => {
    const rendered = rasterizeTransitionScene({
      gameState: 0xff,
      tempPlayerExitingPos: PLAYER_ENTERING_SOUTH,
      upperPlayfieldLimit: 0,
      lowerPlayfieldLimit: 72,
    });
    const bounds = boundsForActiveColors(rendered);
    const expectedMaxY = VIEWPORT_Y + Math.round(72 * 2 * SCALE) - 1;

    expect(bounds.minY).toBeGreaterThanOrEqual(VIEWPORT_Y);
    expect(bounds.maxY).toBeLessThanOrEqual(expectedMaxY + 1);
  });

  it("entry critic: a new east-entry room must open from the right-side doorway, and a new north-entry room from the top", () => {
    const eastOpening = rasterizeTransitionScene({
      playerStartingLocation: PLAYER_ENTERING_EAST,
      upperPlayfieldLimit: 70,
      lowerPlayfieldLimit: HALF_KERNEL,
    });
    const eastBounds = boundsForActiveColors(eastOpening);
    const expectedEastMinX = VIEWPORT_X + Math.round((70 / HALF_KERNEL) * VIEWPORT_WIDTH);
    expect(eastBounds.minX).toBeGreaterThanOrEqual(expectedEastMinX - 1);

    const northOpening = rasterizeTransitionScene({
      playerStartingLocation: PLAYER_ENTERING_NORTH,
      upperPlayfieldLimit: 0,
      lowerPlayfieldLimit: 18,
    });
    const northBounds = boundsForActiveColors(northOpening);
    const expectedNorthMaxY = VIEWPORT_Y + Math.round(18 * 2 * SCALE) - 1;
    expect(northBounds.maxY).toBeLessThanOrEqual(expectedNorthMaxY + 1);
  });
});
