import { describe, it, expect } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame, tick, isPositionInWall, GameState, type GameStateMachine } from "../game";
import {
  NTSC,
  MOVE_DOWN,
  PLAYER_ENTERING_SOUTH,
  PLAYER_ENTERING_NORTH,
  PLAYER_ENTERING_EAST,
  PLAYER_ENTERING_WEST,
  ROBOT_DEATH_ANIM_OFFSET,
  MAX_ROBOTS,
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
  const top = y * 2;
  const mid = (y + 4) * 2;
  const bottom = (y + 8) * 2;

  return !(
    isPositionInWall(x, top, mazeOffset) ||
    isPositionInWall(x + 7, top, mazeOffset) ||
    isPositionInWall(x, mid, mazeOffset) ||
    isPositionInWall(x + 7, mid, mazeOffset) ||
    isPositionInWall(x, bottom, mazeOffset) ||
    isPositionInWall(x + 7, bottom, mazeOffset)
  );
}

function expectActiveRobotsInOpenMaze(zp: ReturnType<typeof createZeroPage>): void {
  const mazeOffset = zp.mazeOffset ?? 0;

  for (let i = 0; i < MAX_ROBOTS; i++) {
    if (zp.robotVertPos[i] === 0x7f) continue;
    expect(isRobotBoxSafe(zp.robotHorizPos[i], zp.robotVertPos[i], mazeOffset)).toBe(true);
  }
}

describe("robot movement and room transition regressions", () => {
  it("spawns every active robot outside maze walls", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    const state = buildStateMachine(zp, NTSC);

    expectActiveRobotsInOpenMaze(zp);

    for (let room = 0; room < 16; room++) {
      zp.gameState = 0xff;
      zp.tempPlayerExitingPos = PLAYER_ENTERING_SOUTH;
      zp.upperPlayfieldLimit = 10;
      zp.lowerPlayfieldLimit = 10;
      zp.playerVertPos = 0x7f;

      tick(state);

      expectActiveRobotsInOpenMaze(zp);
    }
  });

  it("moves at least one active robot over time instead of freezing the room", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerHorizPos = 20;
    zp.playerVertPos = 20;

    const startPositions = zp.robotHorizPos.map((x, i) => ({ x, y: zp.robotVertPos[i] }));
    const state = buildStateMachine(zp, NTSC);

    for (let i = 0; i < 240; i++) {
      tick(state);
    }

    const anyMoved = startPositions.some((start, i) =>
      zp.robotVertPos[i] !== 0x7f && (zp.robotHorizPos[i] !== start.x || zp.robotVertPos[i] !== start.y)
    );
    expect(anyMoved).toBe(true);
  });

  it("destroys a robot when it walks into a maze wall", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.initRobotDelay = 0xff;
    zp.robotMotion = 0xe0;

    const mazeOffset = zp.mazeOffset ?? 0;
    let found: { robotX: number; robotY: number; playerX: number; playerY: number } | null = null;

    for (let y = 2; y <= 78 && !found; y++) {
      for (let x = 1; x <= 138 && !found; x++) {
        if (!isRobotBoxSafe(x, y, mazeOffset)) continue;
        if (isRobotBoxSafe(x + 1, y, mazeOffset)) continue;
        found = { robotX: x, robotY: y, playerX: x + 20, playerY: y };
      }
    }

    expect(found).not.toBeNull();
    zp.robotHorizPos[0] = found!.robotX;
    zp.robotVertPos[0] = found!.robotY;
    zp.robotAnimationIndex[0] = 12;
    zp.playerHorizPos = found!.playerX;
    zp.playerVertPos = found!.playerY;
    for (let i = 1; i < 6; i++) {
      zp.robotVertPos[i] = 0x7f;
    }

    const state = buildStateMachine(zp, NTSC);
    tick(state);

    expect(zp.robotHorizPos[0]).toBe(found!.robotX + 1);
    expect(zp.robotAnimationIndex[0]).toBe(ROBOT_DEATH_ANIM_OFFSET);
    expect(zp.numberRobotsKilled).toBe(1);
    expect(zp.playerScore2).toBe(0x50);
  });

  it("starts the new room in a directional opening state based on the entry doorway", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    const state = buildStateMachine(zp, NTSC);

    zp.gameState = 0xff;
    zp.tempPlayerExitingPos = PLAYER_ENTERING_WEST;
    zp.upperPlayfieldLimit = 88;
    zp.lowerPlayfieldLimit = 88;
    zp.playerVertPos = 0x7f;

    tick(state);

    expect(zp.playerStartingLocation).toBe(PLAYER_ENTERING_EAST);
    expect(zp.upperPlayfieldLimit).toBe(88);
    expect(zp.lowerPlayfieldLimit).toBe(88);

    tick(state);
    expect(zp.upperPlayfieldLimit).toBeLessThan(88);
    expect(zp.lowerPlayfieldLimit).toBe(88);
  });

  it("finishes a room transition into a new playable room instead of staying stuck in exit mode", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    const state = buildStateMachine(zp, NTSC);

    zp.gameLevel = 3;
    zp.gameState = 0xff;
    zp.tempPlayerExitingPos = PLAYER_ENTERING_SOUTH;
    zp.upperPlayfieldLimit = 10;
    zp.lowerPlayfieldLimit = 10;
    zp.playerVertPos = 0x7f;

    tick(state);

    expect(zp.gameLevel).toBe(4);
    expect(zp.gameState).toBe(0);
    expect(zp.kernelSection).toBe(GameState.PLAY);
    expect(zp.playerStartingLocation).toBe(PLAYER_ENTERING_NORTH);
    expect(zp.playerVertPos).not.toBe(0x7f);
  });

  it("starts room exit with fresh playfield limits so the close transition can actually run", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerHorizPos = 73;
    zp.playerVertPos = 151;
    zp.playerMotion = 255;

    const state = buildStateMachine(zp, NTSC);
    state.joystickInput = MOVE_DOWN;

    tick(state);

    expect(zp.gameState).toBe(0xff);
    expect(zp.tempPlayerExitingPos).toBe(PLAYER_ENTERING_SOUTH);
    expect(zp.upperPlayfieldLimit).toBe(0);
    expect(zp.lowerPlayfieldLimit).toBeGreaterThan(0);
  });
});
