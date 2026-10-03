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

function isolatePlayerMissile(zp: ReturnType<typeof createZeroPage>): void {
  zp.mazeOffset = 9999;
  zp.robotMissileDirection = 0;
  zp.robotMissileFlightTime = 0;
  for (let i = 0; i < zp.robotVertPos.length; i++) {
    zp.robotVertPos[i] = 0x7f;
    zp.robotHorizPos[i] = 0;
  }
}

describe("player missile cadence regressions", () => {
  it("launches with ROM joystick direction, 2LK vertical origin, same-tick motion, and audio index", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    isolatePlayerMissile(zp);
    zp.kernelSection = GameState.PLAY;
    zp.playerHorizPos = 50;
    zp.playerVertPos = 80;
    zp.playerMotion = 77;
    const state = buildStateMachine(zp, NTSC);
    state.joystickInput = FIRE | MOVE_RIGHT;

    tick(state);

    expect(zp.playerMissileDirection).toBe(MOVE_RIGHT);
    expect(zp.playerMissileFlightTime).toBe(1);
    expect(zp.playerMissileHorizPos).toBe(58); // 50 + InitMissileXOffset[8](6) + horizontal step(2)
    expect(zp.playerMissileVertPos).toBe(45); // (80 >> 1) + InitMissileYOffset[8](5)
    expect(zp.audioIndex).toBe(0xff);
    expect(zp.playerMotion).toBe(112);
  });

  it("uses the up-table launch offset and moves upward on the launch tick", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    isolatePlayerMissile(zp);
    zp.kernelSection = GameState.PLAY;
    zp.playerHorizPos = 50;
    zp.playerVertPos = 80;
    const state = buildStateMachine(zp, NTSC);
    state.joystickInput = FIRE | MOVE_UP;

    tick(state);

    expect(zp.playerMissileDirection).toBe(MOVE_UP);
    expect(zp.playerMissileHorizPos).toBe(57); // 50 + InitMissileXOffset[1](7)
    expect(zp.playerMissileVertPos).toBe(41); // (80 >> 1) + InitMissileYOffset[1](2) - vertical step(1)
  });

  it("held fire relaunches after the active missile is cleared without requiring a new button edge", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    isolatePlayerMissile(zp);
    zp.kernelSection = GameState.PLAY;
    zp.playerHorizPos = 50;
    zp.playerVertPos = 80;
    const state = buildStateMachine(zp, NTSC);
    state.joystickInput = FIRE | MOVE_RIGHT;

    tick(state);
    expect(zp.playerMissileFlightTime).toBe(1);

    zp.playerMissileFlightTime = 0;
    zp.playerMissileDirection = 0;
    zp.playerHorizPos = 60;
    tick(state);

    expect(zp.playerMissileDirection).toBe(MOVE_RIGHT);
    expect(zp.playerMissileFlightTime).toBe(1);
    expect(zp.playerMissileHorizPos).toBe(68);
  });
});
