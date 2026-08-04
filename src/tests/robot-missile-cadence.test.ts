import { describe, it, expect } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame, tick, type GameStateMachine, GameState } from "../game";
import {
  MAX_ROBOTS,
  NTSC,
  ROBOT_SHOOTING,
  ROBOT_SHOOTING_DOWN,
  ROBOT_SHOOTING_RIGHT,
  ROBOT_STAND_ANIM_OFFSET,
} from "../constants";

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

function isolateRobotMissileLaunch(zp: ReturnType<typeof createZeroPage>): void {
  zp.kernelSection = GameState.PLAY;
  zp.gameVariation = ROBOT_SHOOTING;
  zp.gameLevel = 1;
  zp.initRobotDelay = 0xff;
  zp.robotMotionDelay = 0;
  zp.robotMotion = 0;
  zp.robotFineHoriz[0] = 0;
  zp.robotMissileDirection = 0;
  zp.robotMissileFlightTime = 0;
  zp.robotMissileDelay = 0;
  zp.mazeOffset = 9999;
  zp.playerMissileDirection = 0;
  zp.playerMissileFlightTime = 0;
  for (let i = 0; i < MAX_ROBOTS; i++) {
    zp.robotVertPos[i] = 0x7f;
    zp.robotHorizPos[i] = 0;
    zp.robotAnimationIndex[i] = ROBOT_STAND_ANIM_OFFSET;
  }
}

describe("robot missile cadence regressions", () => {
  it("launches vertically with ROM offsets, sound index, active flag, and launch-frame movement", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    isolateRobotMissileLaunch(zp);
    zp.playerHorizPos = 50;
    zp.playerVertPos = 80; // 2LK player Y = 40
    zp.robotHorizPos[1] = 50;
    zp.robotVertPos[1] = 30;
    const state = buildStateMachine(zp, NTSC);

    tick(state);

    expect(zp.robotMissileDirection).toBe(ROBOT_SHOOTING_DOWN);
    expect(zp.robotMissileFlightTime).toBe(1);
    expect(zp.robotMissileSoundIndex).toBe(0xff);
    expect(zp.robotMissileHorizPos).toBe(54); // 50 + InitRobotMissileXOffset[4]
    expect(zp.robotMissileVertPos).toBe(37); // 30 + InitRobotMissileYOffset[4] + launch movement
  });

  it("launches horizontally and applies horizontal launch-frame movement", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    isolateRobotMissileLaunch(zp);
    zp.playerHorizPos = 70;
    zp.playerVertPos = 80; // 2LK player Y = 40
    zp.robotHorizPos[1] = 40;
    zp.robotVertPos[1] = 40;
    const state = buildStateMachine(zp, NTSC);

    tick(state);

    expect(zp.robotMissileDirection).toBe(ROBOT_SHOOTING_RIGHT);
    expect(zp.robotMissileHorizPos).toBe(51); // 40 + InitRobotMissileXOffset[1] + 2
    expect(zp.robotMissileVertPos).toBe(47); // 40 + InitRobotMissileYOffset[1]
  });

  it("skips low-level movement when the fractional accumulator does not carry", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    isolateRobotMissileLaunch(zp);
    zp.gameLevel = 1;
    zp.robotMissileDirection = ROBOT_SHOOTING_RIGHT;
    zp.robotMissileFlightTime = 1;
    zp.robotMissileDelay = 0;
    zp.robotMissileHorizPos = 50;
    zp.robotMissileVertPos = 40;
    const state = buildStateMachine(zp, NTSC);

    tick(state);

    expect(zp.robotMissileHorizPos).toBe(50);
    expect(zp.robotMissileDelay).toBe(0x39);
  });

  it("moves every frame at level 16 and above", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    isolateRobotMissileLaunch(zp);
    zp.gameLevel = 16;
    zp.robotMissileDirection = ROBOT_SHOOTING_RIGHT;
    zp.robotMissileFlightTime = 1;
    zp.robotMissileDelay = 0;
    zp.robotMissileHorizPos = 50;
    zp.robotMissileVertPos = 40;
    const state = buildStateMachine(zp, NTSC);

    tick(state);

    expect(zp.robotMissileHorizPos).toBe(52);
    expect(zp.robotMissileDelay).toBe(0);
  });
});
