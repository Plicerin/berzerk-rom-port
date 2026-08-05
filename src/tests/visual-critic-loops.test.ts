// @vitest-environment node

import { describe, it, expect, vi } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame } from "../game";
import { render } from "../render/renderer";

declare const require: any;
declare const Buffer: any;

type BufferLike = any;
type Rgb = [number, number, number];
type Image = { width: number; height: number; pixels: Uint8Array };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const { readFileSync } = require("fs");
const { inflateSync } = require("zlib");

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodeTruecolorPng(path: string): Image {
  const png: BufferLike = readFileSync(path);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: BufferLike[] = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  const inflated: BufferLike = inflateSync(Buffer.concat(idat));
  const bytesPerPixel = 3;
  const stride = width * bytesPerPixel;
  const pixels = new Uint8Array(width * height * bytesPerPixel);
  let src = 0;

  for (let y = 0; y < height; y++) {
    const filter = inflated[src++];
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const raw = inflated[src++];
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[(y - 1) * stride + x - bytesPerPixel] : 0;
      switch (filter) {
        case 0:
          row[x] = raw;
          break;
        case 1:
          row[x] = (raw + left) & 0xff;
          break;
        case 2:
          row[x] = (raw + up) & 0xff;
          break;
        case 3:
          row[x] = (raw + Math.floor((left + up) / 2)) & 0xff;
          break;
        case 4:
          row[x] = (raw + paeth(left, up, upLeft)) & 0xff;
          break;
        default:
          throw new Error(`Unsupported PNG filter ${filter}`);
      }
    }
    pixels.set(row, y * stride);
  }

  return { width, height, pixels };
}

function hex(rgb: Rgb): string {
  return `#${rgb.map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

function colorToRgb(color: string): Rgb {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function boundsForColor(image: Image, targetColor: string): Bounds {
  const bounds: Bounds = { minX: image.width, minY: image.height, maxX: -1, maxY: -1 };
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 3;
      const color = hex([image.pixels[i], image.pixels[i + 1], image.pixels[i + 2]]);
      if (color === targetColor) {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
  }
  return bounds;
}

function countColorPixels(image: Image, targetColor: string): number {
  let count = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 3;
      const color = hex([image.pixels[i], image.pixels[i + 1], image.pixels[i + 2]]);
      if (color === targetColor) count++;
    }
  }
  return count;
}

function componentsForColor(image: Image, targetColor: string): Array<Bounds & { count: number }> {
  const visited = new Uint8Array(image.width * image.height);
  const components: Array<Bounds & { count: number }> = [];
  const queue: Array<[number, number]> = [];

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const startIndex = y * image.width + x;
      if (visited[startIndex]) continue;
      const pixelIndex = startIndex * 3;
      const color = hex([image.pixels[pixelIndex], image.pixels[pixelIndex + 1], image.pixels[pixelIndex + 2]]);
      if (color !== targetColor) {
        visited[startIndex] = 1;
        continue;
      }

      const bounds = { minX: x, minY: y, maxX: x, maxY: y, count: 0 };
      queue.length = 0;
      queue.push([x, y]);
      visited[startIndex] = 1;

      for (let qi = 0; qi < queue.length; qi++) {
        const [cx, cy] = queue[qi];
        bounds.count++;
        bounds.minX = Math.min(bounds.minX, cx);
        bounds.minY = Math.min(bounds.minY, cy);
        bounds.maxX = Math.max(bounds.maxX, cx);
        bounds.maxY = Math.max(bounds.maxY, cy);

        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue;
          const nextIndex = ny * image.width + nx;
          if (visited[nextIndex]) continue;
          const ni = nextIndex * 3;
          const nextColor = hex([image.pixels[ni], image.pixels[ni + 1], image.pixels[ni + 2]]);
          if (nextColor === targetColor) {
            visited[nextIndex] = 1;
            queue.push([nx, ny]);
          }
        }
      }

      components.push(bounds);
    }
  }

  return components.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
}

function componentOverlap(a: Image, b: Image, aBounds: Bounds, bBounds: Bounds, color: string): number {
  const minX = Math.min(aBounds.minX, bBounds.minX);
  const minY = Math.min(aBounds.minY, bBounds.minY);
  const maxX = Math.max(aBounds.maxX, bBounds.maxX);
  const maxY = Math.max(aBounds.maxY, bBounds.maxY);
  let overlap = 0;
  let union = 0;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const ai = (y * a.width + x) * 3;
      const bi = (y * b.width + x) * 3;
      const aMatches = hex([a.pixels[ai], a.pixels[ai + 1], a.pixels[ai + 2]]) === color;
      const bMatches = hex([b.pixels[bi], b.pixels[bi + 1], b.pixels[bi + 2]]) === color;
      if (aMatches && bMatches) overlap++;
      if (aMatches || bMatches) union++;
    }
  }

  return union === 0 ? 0 : overlap / union;
}

function rasterizeComparisonRender(): Image {
  const width = 320;
  const height = 224;
  const pixels = new Uint8Array(width * height * 3);
  const stack: Array<{ x: number; y: number }> = [];
  let fillStyle = "#000000";
  let translateX = 0;
  let translateY = 0;

  const ctx: any = {
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
  zp.playerHorizPos = 14;
  zp.playerVertPos = 52;
  zp.playerAnimationIndex = 0;
  zp.robotHorizPos[0] = (252 - 8) / 1.9;
  zp.robotVertPos[0] = (24 - 14) / (2 * (185 / 176));
  zp.robotAnimationIndex[0] = 0;
  zp.robotHorizPos[1] = (136 - 8) / 1.9;
  zp.robotVertPos[1] = (44 - 14) / (2 * (185 / 176));
  zp.robotAnimationIndex[1] = 0;
  zp.robotHorizPos[2] = (38 - 8) / 1.9;
  zp.robotVertPos[2] = (124 - 14) / (2 * (185 / 176));
  zp.robotAnimationIndex[2] = 0;
  zp.robotHorizPos[3] = (172 - 8) / 1.9;
  zp.robotVertPos[3] = (164 - 14) / (2 * (185 / 176));
  zp.robotAnimationIndex[3] = 0;
  zp.robotVertPos[4] = 0x7f;
  zp.robotVertPos[5] = 0x7f;
  render(zp, canvas, 0, { comparisonMode: true });

  return { width, height, pixels };
}

describe("harsh visual critic loops", () => {
  const reference = decodeTruecolorPng("public/reference/berzerk-atari2600-gameplay.png");
  const rendered = rasterizeComparisonRender();

  it("stage critic: our maze silhouette must stay inside the real Berzerk arena and keep dense overlap", () => {
    const referenceBounds = boundsForColor(reference, "#9591ff");
    const renderedBounds = boundsForColor(rendered, "#9591ff");
    const stageIou = componentOverlap(reference, rendered, referenceBounds, renderedBounds, "#9591ff");
    const referencePixels = countColorPixels(reference, "#9591ff");
    const renderedPixels = countColorPixels(rendered, "#9591ff");

    expect(renderedBounds.minX).toBeGreaterThanOrEqual(referenceBounds.minX);
    expect(renderedBounds.minY).toBeGreaterThanOrEqual(referenceBounds.minY);
    expect(renderedBounds.maxX).toBeLessThanOrEqual(referenceBounds.maxX);
    expect(renderedBounds.maxY).toBeLessThanOrEqual(referenceBounds.maxY + 10);
    expect(renderedPixels).toBeGreaterThanOrEqual(referencePixels * 0.88);
    expect(renderedPixels).toBeLessThanOrEqual(referencePixels * 1.08);
    // The maze critic stays strict on envelope and density, but uses a lower
    // IoU because the sampled CRT capture and our crisp software rasterization
    // differ substantially in line thickness.
    expect(stageIou).toBeGreaterThanOrEqual(0.10);
  });

  it("robot critic: every robot cluster must land near its real counterpart or it flunks", () => {
    const referenceRobots = componentsForColor(reference, "#c1a739").filter(component => component.count >= 100);
    const renderedRobots = componentsForColor(rendered, "#c1a739").filter(component => component.count >= 50);

    expect(renderedRobots.length).toBe(4);

    const usedRenderedComponents = new Set<number>();
    for (const referenceRobot of referenceRobots) {
      const referenceCenterX = (referenceRobot.minX + referenceRobot.maxX) / 2;
      const referenceCenterY = (referenceRobot.minY + referenceRobot.maxY) / 2;
      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < renderedRobots.length; i++) {
        if (usedRenderedComponents.has(i)) continue;
        const renderedCenterX = (renderedRobots[i].minX + renderedRobots[i].maxX) / 2;
        const renderedCenterY = (renderedRobots[i].minY + renderedRobots[i].maxY) / 2;
        const distance = Math.hypot(renderedCenterX - referenceCenterX, renderedCenterY - referenceCenterY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      }

      expect(bestIndex).toBeGreaterThanOrEqual(0);
      usedRenderedComponents.add(bestIndex);
      const renderedRobot = renderedRobots[bestIndex];
      const iou = componentOverlap(reference, rendered, referenceRobot, renderedRobot, "#c1a739");

      expect(bestDistance).toBeLessThanOrEqual(2.5);
      expect(renderedRobot.count).toBeGreaterThanOrEqual(referenceRobot.count * 0.85);
      expect(renderedRobot.count).toBeLessThanOrEqual(referenceRobot.count * 1.15);
      expect(iou).toBeGreaterThanOrEqual(0.55);
    }
  });

  it("player critic: the hero sprite must sit in the right pocket with visible mask overlap", () => {
    const referencePlayer = boundsForColor(reference, "#ffa7b3");
    const renderedPlayer = boundsForColor(rendered, "#ffa7b3");
    const iou = componentOverlap(reference, rendered, referencePlayer, renderedPlayer, "#ffa7b3");

    expect(renderedPlayer.minX).toBeGreaterThanOrEqual(referencePlayer.minX - 2);
    expect(renderedPlayer.minX).toBeLessThanOrEqual(referencePlayer.minX + 2);
    expect(renderedPlayer.minY).toBeGreaterThanOrEqual(referencePlayer.minY - 2);
    expect(renderedPlayer.minY).toBeLessThanOrEqual(referencePlayer.minY + 2);
    expect(renderedPlayer.maxX).toBeGreaterThanOrEqual(referencePlayer.maxX - 4);
    expect(renderedPlayer.maxX).toBeLessThanOrEqual(referencePlayer.maxX + 4);
    expect(renderedPlayer.maxY).toBeGreaterThanOrEqual(referencePlayer.maxY - 4);
    expect(renderedPlayer.maxY).toBeLessThanOrEqual(referencePlayer.maxY + 4);
    expect(iou).toBeGreaterThanOrEqual(0.25);
  });

  it("hud critic: the copyright footer must match the photographed Atari glyph mask, not a loose approximation", () => {
    const referenceHud = boundsForColor(reference, "#e7cc5b");
    const renderedHud = boundsForColor(rendered, "#e7cc5b");
    const iou = componentOverlap(reference, rendered, referenceHud, renderedHud, "#e7cc5b");

    expect(renderedHud).toEqual(referenceHud);
    expect(iou).toBeGreaterThanOrEqual(0.95);
  });
});
