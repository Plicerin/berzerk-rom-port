// @vitest-environment node

import { describe, it, expect, vi } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame } from "../game";
import { render } from "../render/renderer";

declare const require: any;
declare const Buffer: any;

type BufferLike = any;

const { readFileSync } = require("fs");
const { inflateSync } = require("zlib");

type Rgb = [number, number, number];
type Image = { width: number; height: number; pixels: Uint8Array };

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

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
  expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: BufferLike[] = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  expect(width).toBe(320);
  expect(height).toBe(224);
  expect(bitDepth).toBe(8);
  expect(colorType).toBe(2);

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

function imageStats(image: Image): { bounds: Bounds; palette: Map<string, number> } {
  const bounds: Bounds = { minX: image.width, minY: image.height, maxX: -1, maxY: -1 };
  const palette = new Map<string, number>();

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 3;
      const color = hex([image.pixels[i], image.pixels[i + 1], image.pixels[i + 2]]);
      palette.set(color, (palette.get(color) ?? 0) + 1);
      if (color !== "#000000") {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
  }

  return { bounds, palette };
}

function componentOverlap(a: Image, b: Image, aBounds: Bounds, bBounds: Bounds, color: string): {
  overlap: number;
  union: number;
  iou: number;
} {
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

  return { overlap, union, iou: union === 0 ? 0 : overlap / union };
}

function diffImages(a: Image, b: Image): {
  differentPixels: number;
  referenceColoredMissing: number;
  extraColoredPixels: number;
  matchingColoredPixels: number;
} {
  expect(a.width).toBe(b.width);
  expect(a.height).toBe(b.height);

  let differentPixels = 0;
  let referenceColoredMissing = 0;
  let extraColoredPixels = 0;
  let matchingColoredPixels = 0;

  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 3;
      const ar = a.pixels[i];
      const ag = a.pixels[i + 1];
      const ab = a.pixels[i + 2];
      const br = b.pixels[i];
      const bg = b.pixels[i + 1];
      const bb = b.pixels[i + 2];
      const aColored = ar !== 0 || ag !== 0 || ab !== 0;
      const bColored = br !== 0 || bg !== 0 || bb !== 0;

      if (ar !== br || ag !== bg || ab !== bb) differentPixels++;
      if (aColored && !bColored) referenceColoredMissing++;
      if (!aColored && bColored) extraColoredPixels++;
      if (aColored && bColored && ar === br && ag === bg && ab === bb) matchingColoredPixels++;
    }
  }

  return { differentPixels, referenceColoredMissing, extraColoredPixels, matchingColoredPixels };
}

function colorToRgb(color: string): Rgb {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
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

describe("visual reference raster checks", () => {
  it("decodes the real Atari 2600 reference image metadata and palette", () => {
    const reference = decodeTruecolorPng("public/reference/berzerk-atari2600-gameplay.png");
    const { bounds, palette } = imageStats(reference);

    expect(bounds).toEqual({ minX: 8, minY: 14, maxX: 311, maxY: 199 });
    expect([...palette.entries()].sort()).toEqual([
      ["#000000", 63468],
      ["#9591ff", 7264],
      ["#c1a739", 580],
      ["#e7cc5b", 268],
      ["#ffa7b3", 100],
    ].sort());
  });

  it("computes a real pixel diff between the reference and current comparison render", () => {
    const reference = decodeTruecolorPng("public/reference/berzerk-atari2600-gameplay.png");
    const rendered = rasterizeComparisonRender();
    const diff = diffImages(reference, rendered);

    const referenceStats = imageStats(reference);
    const referenceColoredPixels = [...referenceStats.palette.entries()]
      .filter(([color]) => color !== "#000000")
      .reduce((sum, [, count]) => sum + count, 0);
    const intersectionOverUnion = diff.matchingColoredPixels /
      (referenceColoredPixels + diff.extraColoredPixels);

    expect(diff.matchingColoredPixels).toBeGreaterThanOrEqual(2300);
    expect(intersectionOverUnion).toBeGreaterThanOrEqual(0.10);
    expect(diff.differentPixels).toBeLessThanOrEqual(20000);
    expect(diff.referenceColoredMissing).toBeLessThanOrEqual(6000);
    expect(diff.extraColoredPixels).toBeLessThanOrEqual(8000);
  });

  it("rasterized comparison render keeps each robot component near the reference robots", () => {
    const reference = decodeTruecolorPng("public/reference/berzerk-atari2600-gameplay.png");
    const rendered = rasterizeComparisonRender();
    const referenceRobots = componentsForColor(reference, "#c1a739").filter(component => component.count >= 100);
    const renderedRobots = componentsForColor(rendered, "#c1a739").filter(component => component.count >= 50);

    expect(referenceRobots.map(({ minX, minY, maxX, maxY }) => ({ minX, minY, maxX, maxY }))).toEqual([
      { minX: 252, minY: 24, maxX: 267, maxY: 39 },
      { minX: 136, minY: 44, maxX: 151, maxY: 59 },
      { minX: 38, minY: 124, maxX: 53, maxY: 139 },
      { minX: 172, minY: 164, maxX: 187, maxY: 179 },
    ]);
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
          bestIndex = i;
          bestDistance = distance;
        }
      }

      expect(bestIndex).toBeGreaterThanOrEqual(0);
      usedRenderedComponents.add(bestIndex);
      const renderedRobot = renderedRobots[bestIndex];
      const bestOverlap = componentOverlap(reference, rendered, referenceRobot, renderedRobot, "#c1a739");

      expect(renderedRobot.minX).toBeGreaterThanOrEqual(referenceRobot.minX - 2);
      expect(renderedRobot.minX).toBeLessThanOrEqual(referenceRobot.minX + 2);
      expect(renderedRobot.minY).toBeGreaterThanOrEqual(referenceRobot.minY - 2);
      expect(renderedRobot.minY).toBeLessThanOrEqual(referenceRobot.minY + 2);
      expect(renderedRobot.maxX).toBeGreaterThanOrEqual(referenceRobot.maxX - 2);
      expect(renderedRobot.maxX).toBeLessThanOrEqual(referenceRobot.maxX + 2);
      expect(renderedRobot.maxY).toBeGreaterThanOrEqual(referenceRobot.maxY - 2);
      expect(renderedRobot.maxY).toBeLessThanOrEqual(referenceRobot.maxY + 2);
      expect(renderedRobot.count).toBeGreaterThanOrEqual(referenceRobot.count * 0.85);
      expect(renderedRobot.count).toBeLessThanOrEqual(referenceRobot.count * 1.15);
      expect(bestOverlap.iou).toBeGreaterThanOrEqual(0.55);
    }
  });

  it("rasterized comparison render keeps player, robot, and copyright masks near the reference", () => {
    const reference = decodeTruecolorPng("public/reference/berzerk-atari2600-gameplay.png");
    const rendered = rasterizeComparisonRender();
    const referencePlayer = boundsForColor(reference, "#ffa7b3");
    const player = boundsForColor(rendered, "#ffa7b3");
    const robots = boundsForColor(rendered, "#c1a739");
    const referenceCopyright = boundsForColor(reference, "#e7cc5b");
    const copyright = boundsForColor(rendered, "#e7cc5b");

    expect(player.minX).toBeGreaterThanOrEqual(34);
    expect(player.minX).toBeLessThanOrEqual(36);
    expect(player.minY).toBeGreaterThanOrEqual(68);
    expect(player.minY).toBeLessThanOrEqual(70);
    expect(player.maxX).toBeLessThanOrEqual(52);
    expect(player.maxY).toBeLessThanOrEqual(90);
    expect(componentOverlap(reference, rendered, referencePlayer, player, "#ffa7b3").iou)
      .toBeGreaterThanOrEqual(0.25);

    expect(robots.minX).toBeGreaterThanOrEqual(38);
    expect(robots.minX).toBeLessThanOrEqual(40);
    expect(robots.minY).toBeGreaterThanOrEqual(24);
    expect(robots.minY).toBeLessThanOrEqual(26);
    expect(robots.maxX).toBeGreaterThanOrEqual(266);
    expect(robots.maxX).toBeLessThanOrEqual(269);
    expect(robots.maxY).toBeGreaterThanOrEqual(179);
    expect(robots.maxY).toBeLessThanOrEqual(181);

    expect(copyright.minX).toBeGreaterThanOrEqual(126);
    expect(copyright.minX).toBeLessThanOrEqual(128);
    expect(copyright.minY).toBe(193);
    expect(copyright.maxX).toBeGreaterThanOrEqual(190);
    expect(copyright.maxX).toBeLessThanOrEqual(205);
    expect(copyright.maxY).toBe(199);
    expect(componentOverlap(reference, rendered, referenceCopyright, copyright, "#e7cc5b").iou)
      .toBeGreaterThanOrEqual(0.25);
  });

  it("rasterized comparison render uses only reference colors and stays inside reference active bounds", () => {
    const rendered = rasterizeComparisonRender();
    const { bounds, palette } = imageStats(rendered);

    expect(bounds.minX).toBeGreaterThanOrEqual(8);
    expect(bounds.minY).toBeGreaterThanOrEqual(14);
    expect(bounds.maxX).toBeLessThanOrEqual(311);
    expect(bounds.maxY).toBeLessThanOrEqual(199);
    expect([...palette.keys()].sort()).toEqual([
      "#000000",
      "#9591ff",
      "#c1a739",
      "#e7cc5b",
      "#ffa7b3",
    ].sort());
  });
});
