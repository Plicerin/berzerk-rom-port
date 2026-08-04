import { describe, it, expect } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame, tick, updateRobots, isPositionInWall, GameState, type GameStateMachine } from "../game";
import {
  NTSC,
  H_KERNEL,
  PLAYER_ENTERING_NORTH,
  PLAYER_ENTERING_SOUTH,
  PLAYER_ENTERING_WEST,
  PLAYER_ENTERING_EAST,
  PLAYER_DEATH_ANIM_OFFSET,
} from "../constants";

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

function isRobotBoxSafe(x: number, y: number, mazeOffset: number): boolean {
  return !(
    isPositionInWall(x, y, mazeOffset) ||
    isPositionInWall(x + 7, y, mazeOffset) ||
    isPositionInWall(x, y + 11, mazeOffset) ||
    isPositionInWall(x + 7, y + 11, mazeOffset) ||
    isPositionInWall(x, y + 5, mazeOffset) ||
    isPositionInWall(x + 7, y + 5, mazeOffset)
  );
}

describe("gameplay cadence regressions", () => {
  it("arms robots from a cold room in exactly 8 update cycles, then allows movement on the 9th", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);

    const mazeOffset = zp.mazeOffset ?? 0;
    let found: { x: number; y: number } | null = null;
    for (let y = 4; y <= 147 && !found; y++) {
      for (let x = 110; x <= 138 && !found; x++) {
        if (isRobotBoxSafe(x, y, mazeOffset) && isRobotBoxSafe(x - 1, y, mazeOffset)) {
          found = { x, y };
        }
      }
    }

    expect(found).not.toBeNull();
    zp.initRobotDelay = 0;
    zp.playerHorizPos = 103; // forces determineRobotToMove base index 0
    zp.playerVertPos = 100;
    zp.randomHi = 0; // keeps selected robot index at 0 and chooses horizontal movement
    zp.robotHorizPos[0] = found!.x;
    zp.robotVertPos[0] = found!.y;
    zp.robotAnimationIndex[0] = 8;
    zp.robotMotion = 0xe0; // next active update overflows the fractional accumulator
    for (let i = 1; i < 6; i++) {
      zp.robotVertPos[i] = 0x7f;
    }

    for (let i = 0; i < 7; i++) {
      updateRobots(zp, NTSC);
      expect(zp.initRobotDelay).not.toBe(0xff);
      expect(zp.robotHorizPos[0]).toBe(found!.x);
    }

    updateRobots(zp, NTSC);
    expect(zp.initRobotDelay).toBe(0xff);
    expect(zp.robotHorizPos[0]).toBe(found!.x); // still no movement on the arming tick itself

    updateRobots(zp, NTSC);
    expect(zp.robotHorizPos[0]).toBe(found!.x);
    expect(zp.robotAnimationIndex[0]).toBe(9); // chase direction selected, no same-frame movement

    zp.robotMotion = 0xe0;
    updateRobots(zp, NTSC);
    expect(zp.robotHorizPos[0]).toBe(found!.x - 1);
  });

  it("closes any room exit in exactly 88 transition ticks before changing rooms", () => {
    const exits = [
      PLAYER_ENTERING_NORTH,
      PLAYER_ENTERING_SOUTH,
      PLAYER_ENTERING_WEST,
      PLAYER_ENTERING_EAST,
    ];

    for (const exitDir of exits) {
      const zp = createZeroPage();
      initGame(zp, 0, NTSC);
      const state = buildStateMachine(zp, NTSC);

      zp.gameLevel = 5;
      zp.gameState = 0xff;
      zp.tempPlayerExitingPos = exitDir;
      zp.upperPlayfieldLimit = 0;
      zp.lowerPlayfieldLimit = H_KERNEL / 2;
      zp.playerVertPos = 0x7f;

      for (let i = 0; i < (H_KERNEL / 2) - 1; i++) {
        tick(state);
        expect(zp.gameState).toBe(0xff);
        expect(zp.gameLevel).toBe(5);
      }

      tick(state);
      expect(zp.gameState).toBe(0);
      expect(zp.gameLevel).toBe(6);
    }
  });

  it("consumes a life only after the full ROM-style player death countdown, not after a short placeholder delay", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    const state = buildStateMachine(zp, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerAnimationIndex = PLAYER_DEATH_ANIM_OFFSET;
    const startingLives = zp.numberOfLives;

    for (let i = 0; i < 125; i++) {
      tick(state);
      expect(zp.numberOfLives).toBe(startingLives);
    }

    tick(state);
    expect(zp.numberOfLives).toBe(startingLives - 1);
    expect(zp.playerAnimationIndex).toBe(0);
  });

  it("opens a newly entered room in exactly 88 ticks from either doorway polarity", () => {
    const entries = [
      { entryDir: PLAYER_ENTERING_NORTH, startUpper: 0, startLower: 0, finalUpper: 0, finalLower: H_KERNEL / 2 },
      { entryDir: PLAYER_ENTERING_WEST, startUpper: 0, startLower: 0, finalUpper: 0, finalLower: H_KERNEL / 2 },
      { entryDir: PLAYER_ENTERING_SOUTH, startUpper: H_KERNEL / 2, startLower: H_KERNEL / 2, finalUpper: 0, finalLower: H_KERNEL / 2 },
      { entryDir: PLAYER_ENTERING_EAST, startUpper: H_KERNEL / 2, startLower: H_KERNEL / 2, finalUpper: 0, finalLower: H_KERNEL / 2 },
    ];

    for (const entry of entries) {
      const zp = createZeroPage();
      initGame(zp, 0, NTSC);
      const state = buildStateMachine(zp, NTSC);
      zp.kernelSection = GameState.PLAY;
      zp.playerStartingLocation = entry.entryDir;
      zp.upperPlayfieldLimit = entry.startUpper;
      zp.lowerPlayfieldLimit = entry.startLower;

      for (let i = 0; i < (H_KERNEL / 2) - 1; i++) {
        tick(state);
        expect(zp.upperPlayfieldLimit === entry.finalUpper && zp.lowerPlayfieldLimit === entry.finalLower).toBe(false);
      }

      tick(state);
      expect(zp.upperPlayfieldLimit).toBe(entry.finalUpper);
      expect(zp.lowerPlayfieldLimit).toBe(entry.finalLower);
    }
  });
});
