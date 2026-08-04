// @vitest-environment node

import { describe, it, expect, vi } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame } from "../game";
import { render } from "../render/renderer";
import { PLAYER_DEATH_ANIM_OFFSET } from "../constants";
import { MazeOffsetTable } from "../data/tables";

type Rgb = [number, number, number];
type Image = { width: number; height: number; pixels: Uint8Array };

const VIEWPORT_X = 8;
const VIEWPORT_Y = 14;
const VIEWPORT_WIDTH = 304;
const VIEWPORT_HEIGHT = 185;
const BLUE = "#9591ff";

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

function rasterizeMazeOnly(mazeOffset: number): Image {
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
  zp.mazeOffset = mazeOffset;

  // Push all non-maze actors off the active screen so the critic judges only walls.
  zp.playerVertPos = 255;
  zp.playerAnimationIndex = PLAYER_DEATH_ANIM_OFFSET;
  zp.evilOttoHorizPos = 0;
  zp.evilOttoVertPos = 0;
  zp.playerMissileFlightTime = 0;
  zp.robotMissileFlightTime = 0;
  for (let i = 0; i < 6; i++) {
    zp.robotVertPos[i] = 255;
  }

  render(zp, canvas, 0, { comparisonMode: true });
  return { width, height, pixels };
}

function isBlue(image: Image, x: number, y: number): boolean {
  const i = (y * image.width + x) * 3;
  return hex([image.pixels[i], image.pixels[i + 1], image.pixels[i + 2]]) === BLUE;
}

function hasClearVerticalDoorway(image: Image, edgeX: number, depth: number, minHeight: number): boolean {
  for (let startY = VIEWPORT_Y; startY <= VIEWPORT_Y + VIEWPORT_HEIGHT - minHeight; startY++) {
    let clear = true;
    for (let y = startY; y < startY + minHeight && clear; y++) {
      for (let x = edgeX; x < edgeX + depth && clear; x++) {
        if (isBlue(image, x, y)) clear = false;
      }
    }
    if (clear) return true;
  }
  return false;
}

function hasClearHorizontalDoorway(image: Image, edgeY: number, depth: number, minWidth: number): boolean {
  for (let startX = VIEWPORT_X; startX <= VIEWPORT_X + VIEWPORT_WIDTH - minWidth; startX++) {
    let clear = true;
    for (let x = startX; x < startX + minWidth && clear; x++) {
      for (let y = edgeY; y < edgeY + depth && clear; y++) {
        if (isBlue(image, x, y)) clear = false;
      }
    }
    if (clear) return true;
  }
  return false;
}

function blueRunLengths(image: Image, y: number): number[] {
  const runs: number[] = [];
  let run = 0;
  for (let x = VIEWPORT_X; x < VIEWPORT_X + VIEWPORT_WIDTH; x++) {
    if (isBlue(image, x, y)) {
      run++;
    } else if (run > 0) {
      runs.push(run);
      run = 0;
    }
  }
  if (run > 0) runs.push(run);
  return runs;
}

describe("harsh per-maze visual critics", () => {
  it("mirror critic: every maze layout must keep left/right wall coverage nearly balanced on each scanline", () => {
    for (const mazeOffset of MazeOffsetTable) {
      const image = rasterizeMazeOnly(mazeOffset);
      for (let y = VIEWPORT_Y; y < VIEWPORT_Y + VIEWPORT_HEIGHT; y++) {
        let leftCount = 0;
        let rightCount = 0;
        for (let x = VIEWPORT_X; x < VIEWPORT_X + VIEWPORT_WIDTH / 2; x++) {
          if (isBlue(image, x, y)) leftCount++;
        }
        for (let x = VIEWPORT_X + VIEWPORT_WIDTH / 2; x < VIEWPORT_X + VIEWPORT_WIDTH; x++) {
          if (isBlue(image, x, y)) rightCount++;
        }
        expect(Math.abs(leftCount - rightCount)).toBeLessThanOrEqual(8);
      }
    }
  });

  it("doorway critic: every maze layout must expose clear doorways on all four edges", () => {
    for (const mazeOffset of MazeOffsetTable) {
      const image = rasterizeMazeOnly(mazeOffset);
      expect(hasClearVerticalDoorway(image, VIEWPORT_X, 12, 12)).toBe(true);
      expect(hasClearVerticalDoorway(image, VIEWPORT_X + VIEWPORT_WIDTH - 12, 12, 12)).toBe(true);
      expect(hasClearHorizontalDoorway(image, VIEWPORT_Y, 4, 8)).toBe(true);
      expect(hasClearHorizontalDoorway(image, VIEWPORT_Y + VIEWPORT_HEIGHT - 4, 4, 8)).toBe(true);
    }
  });

  it("wall critic: rendered maze runs must never collapse into isolated single-pixel crack fragments", () => {
    for (const mazeOffset of MazeOffsetTable) {
      const image = rasterizeMazeOnly(mazeOffset);
      for (let y = VIEWPORT_Y; y < VIEWPORT_Y + VIEWPORT_HEIGHT; y++) {
        const runs = blueRunLengths(image, y);
        for (const run of runs) {
          expect(run).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });
});
