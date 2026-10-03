import { describe, it, expect } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame, tick, type GameStateMachine, GameState } from "../game";
import { MOVE_RIGHT, MOVE_UP, NTSC } from "../constants";

const FIRE = 0x10;

function buildStateMachine(zp: ReturnType<typeof createZeroPage>, region: number = NTSC): GameStateMachine {
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

function isolatePlayer(zp: ReturnType<typeof createZeroPage>): void {
  zp.mazeOffset = 9999;
  zp.robotMissileDirection = 0;
  zp.robotMissileFlightTime = 0;
  for (let i = 0; i < zp.robotVertPos.length; i++) {
    zp.robotVertPos[i] = 0x7f;
    zp.robotHorizPos[i] = 0;
  }
}

describe("player facing cadence regressions", () => {
  it("preserves the last movement direction when the stick is released", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    isolatePlayer(zp);
    zp.kernelSection = GameState.PLAY;
    zp.playerMotion = 255;
    const state = buildStateMachine(zp, NTSC);
    state.joystickInput = MOVE_RIGHT;

    tick(state);
    expect(zp.playerDirection).toBe(MOVE_RIGHT);

    state.joystickInput = 0;
    const xAfterRelease = zp.playerHorizPos;
    tick(state);

    expect(zp.playerDirection).toBe(MOVE_RIGHT);
    expect(zp.playerHorizPos).toBe(xAfterRelease);
    expect(zp.playerAnimationIndex).toBe(0);
  });

  it("fire with no movement launches in the preserved facing direction", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    isolatePlayer(zp);
    zp.kernelSection = GameState.PLAY;
    zp.playerHorizPos = 50;
    zp.playerVertPos = 80;
    const state = buildStateMachine(zp, NTSC);
    state.joystickInput = MOVE_RIGHT;

    tick(state);
    state.joystickInput = FIRE;
    tick(state);

    expect(zp.playerDirection).toBe(MOVE_RIGHT);
    expect(zp.playerMissileDirection).toBe(MOVE_RIGHT);
    expect(zp.playerMissileFlightTime).toBe(1);
    expect(zp.playerMissileHorizPos).toBeGreaterThan(50);
  });

  it("new movement input updates facing before firing", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    isolatePlayer(zp);
    zp.kernelSection = GameState.PLAY;
    zp.playerDirection = MOVE_RIGHT;
    zp.playerHorizPos = 50;
    zp.playerVertPos = 80;
    const state = buildStateMachine(zp, NTSC);
    state.joystickInput = FIRE | MOVE_UP;

    tick(state);

    expect(zp.playerDirection).toBe(MOVE_UP);
    expect(zp.playerMissileDirection).toBe(MOVE_UP);
  });
});
