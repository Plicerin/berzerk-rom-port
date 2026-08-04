import { describe, it, expect, vi } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame, tick, isPositionInWall, GameState, type GameStateMachine } from "../game";
import { render } from "../render/renderer";
import {
  NTSC,
  MOVE_LEFT,
  MOVE_RIGHT,
  MOVE_UP,
  MOVE_DOWN,
  PLAYER_ENTERING_NORTH,
  PLAYER_ENTERING_SOUTH,
  PLAYER_ENTERING_WEST,
  PLAYER_ENTERING_EAST,
} from "../constants";
import { MazeOffsetTable, InitHorizontalPosition, InitVerticalPosition, StartingLocationValues } from "../data/tables";

function buildStateMachine(
  zp: ReturnType<typeof createZeroPage>,
  region: number = NTSC,
): GameStateMachine {
  return {
    zp,
    region,
    joystickInput: 0,
    lastJoystickInput: 0,
    frameCount: 0,
    vblankCount: 0,
    overscanCount: 0,
    colorCycleIndex: 0,
  };
}

function isPlayerBoxSafe(x: number, y: number, mazeOffset: number): boolean {
  return !(
    isPositionInWall(x, y, mazeOffset) ||
    isPositionInWall(x + 7, y, mazeOffset) ||
    isPositionInWall(x, y + 11, mazeOffset) ||
    isPositionInWall(x + 7, y + 11, mazeOffset)
  );
}

function findDoorwayStart(
  mazeOffset: number,
  side: "left" | "right" | "top" | "bottom",
): { x: number; y: number; move: number; exitDir: number } {
  const doorwayX = InitHorizontalPosition[PLAYER_ENTERING_NORTH];
  const doorwayY = InitVerticalPosition[PLAYER_ENTERING_WEST];

  if (side === "left") {
    for (let y = doorwayY - 4; y <= doorwayY + 4; y++) {
      if (isPlayerBoxSafe(1, y, mazeOffset) && isPlayerBoxSafe(0, y, mazeOffset)) {
        return { x: 1, y, move: MOVE_LEFT, exitDir: PLAYER_ENTERING_WEST };
      }
    }
  }

  if (side === "right") {
    for (let y = doorwayY - 4; y <= doorwayY + 4; y++) {
      if (isPlayerBoxSafe(145, y, mazeOffset) && isPlayerBoxSafe(146, y, mazeOffset)) {
        return { x: 145, y, move: MOVE_RIGHT, exitDir: PLAYER_ENTERING_EAST };
      }
    }
  }

  if (side === "top") {
    for (let x = doorwayX - 4; x <= doorwayX + 4; x++) {
      if (isPlayerBoxSafe(x, 1, mazeOffset) && isPlayerBoxSafe(x, 0, mazeOffset)) {
        return { x, y: 1, move: MOVE_UP, exitDir: PLAYER_ENTERING_NORTH };
      }
    }
  }

  for (let x = doorwayX - 4; x <= doorwayX + 4; x++) {
    if (isPlayerBoxSafe(x, 151, mazeOffset) && isPlayerBoxSafe(x, 152, mazeOffset)) {
      return { x, y: 151, move: MOVE_DOWN, exitDir: PLAYER_ENTERING_SOUTH };
    }
  }

  throw new Error(`No clear ${side} doorway found for maze offset ${mazeOffset}`);
}

function createMockContext() {
  const drawCalls: Array<{ fillStyle: string; args: number[] }> = [];
  const transformStack: Array<{ x: number; y: number }> = [];
  let fillStyle = "#000000";
  let translateX = 0;
  let translateY = 0;
  const ctx: any = {
    imageSmoothingEnabled: true,
    fillRect: vi.fn((x: number, y: number, width: number, height: number) => {
      drawCalls.push({ fillStyle, args: [x + translateX, y + translateY, width, height] });
    }),
    save: vi.fn(() => transformStack.push({ x: translateX, y: translateY })),
    restore: vi.fn(() => {
      const previous = transformStack.pop();
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
    drawCalls,
  };
  Object.defineProperty(ctx, "fillStyle", {
    get: () => fillStyle,
    set: (value: string) => { fillStyle = value; },
  });
  return ctx;
}

describe("maze, doorway, and transition regressions", () => {
  it("lets the player trigger all four room exits from clear doorways on the default maze", () => {
    const sides = ["left", "right", "top", "bottom"] as const;

    for (const side of sides) {
      const zp = createZeroPage();
      initGame(zp, 0, NTSC);
      zp.kernelSection = GameState.PLAY;
      const doorway = findDoorwayStart(zp.mazeOffset ?? 0, side);
      zp.playerHorizPos = doorway.x;
      zp.playerVertPos = doorway.y;
      zp.playerMotion = 255;

      const state = buildStateMachine(zp, NTSC);
      state.joystickInput = doorway.move;

      tick(state);

      expect(zp.gameState).toBe(0xff);
      expect(zp.tempPlayerExitingPos).toBe(doorway.exitDir);
      expect(zp.playerVertPos).toBe(0x7f);
    }
  });

  it("maps every exit direction to the correct opposite-side spawn after transition", () => {
    const cases = [
      { exitDir: PLAYER_ENTERING_NORTH, entryDir: PLAYER_ENTERING_SOUTH },
      { exitDir: PLAYER_ENTERING_SOUTH, entryDir: PLAYER_ENTERING_NORTH },
      { exitDir: PLAYER_ENTERING_WEST, entryDir: PLAYER_ENTERING_EAST },
      { exitDir: PLAYER_ENTERING_EAST, entryDir: PLAYER_ENTERING_WEST },
    ];

    for (const { exitDir, entryDir } of cases) {
      expect(StartingLocationValues[exitDir]).toBe(entryDir);

      const zp = createZeroPage();
      initGame(zp, 0, NTSC);
      const state = buildStateMachine(zp, NTSC);
      zp.gameState = 0xff;
      zp.tempPlayerExitingPos = exitDir;
      zp.upperPlayfieldLimit = 10;
      zp.lowerPlayfieldLimit = 10;
      zp.playerVertPos = 0x7f;

      tick(state);

      expect(zp.gameState).toBe(0);
      expect(zp.playerStartingLocation).toBe(entryDir);
      expect(zp.playerHorizPos).toBe(InitHorizontalPosition[entryDir]);
      expect(zp.playerVertPos).toBe(InitVerticalPosition[entryDir]);
    }
  });

  it("keeps all maze variants open on every edge so no room is born with a sealed doorway", () => {
    for (const mazeOffset of MazeOffsetTable) {
      expect(() => findDoorwayStart(mazeOffset, "left")).not.toThrow();
      expect(() => findDoorwayStart(mazeOffset, "right")).not.toThrow();
      expect(() => findDoorwayStart(mazeOffset, "top")).not.toThrow();
      expect(() => findDoorwayStart(mazeOffset, "bottom")).not.toThrow();
    }
  });

  it("renders maze wall segments on integer pixel boundaries to avoid visible cracks", () => {
    for (const mazeOffset of MazeOffsetTable) {
      const ctx = createMockContext();
      const canvas = { getContext: vi.fn().mockReturnValue(ctx) } as unknown as HTMLCanvasElement;
      const zp = createZeroPage();
      initGame(zp, 0, NTSC);
      zp.mazeOffset = mazeOffset;

      render(zp, canvas, 0, { comparisonMode: true });

      const blueRects = ctx.drawCalls.filter((call: { fillStyle: string; args: number[] }) => call.fillStyle === "#9591ff");
      expect(blueRects.length).toBeGreaterThan(0);

      for (const call of blueRects) {
        for (const value of call.args) {
          expect(Number.isInteger(value)).toBe(true);
        }
        expect(call.args[2]).toBeGreaterThan(0);
        expect(call.args[3]).toBeGreaterThan(0);
      }
    }
  });
});
