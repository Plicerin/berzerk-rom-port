import { describe, it, expect } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame, tick, processJoystickInput, GameStateMachine, GameState } from "../game";
import { NTSC, PLAYER_DEATH_ANIM_OFFSET } from "../constants";

function buildStateMachine(zp: ReturnType<typeof createZeroPage>, region: number): GameStateMachine {
  return { zp, region, joystickInput: 0, lastJoystickInput: 0, frameCount: 0, vblankCount: 0, overscanCount: 0, colorCycleIndex: 0 };
}

describe("player death regressions", () => {
  it("does not kill the player while firing right at a distant robot setup", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    const state = buildStateMachine(zp, NTSC);

    zp.kernelSection = GameState.PLAY;
    zp.playerHorizPos = 73;
    zp.playerVertPos = 8;
    zp.playerMotion = 10;
    zp.robotHorizPos[0] = 100;
    zp.robotVertPos[0] = 8;
    zp.robotAnimationIndex[0] = 0;
    for (let i = 1; i < 6; i++) {
      zp.robotHorizPos[i] = 142;
      zp.robotVertPos[i] = 76;
      zp.robotAnimationIndex[i] = 0;
    }

    for (let tickNum = 1; tickNum <= 300; tickNum++) {
      processJoystickInput(state, 2); // MOVE_RIGHT
      tick(state);
      expect(zp.playerAnimationIndex).not.toBe(PLAYER_DEATH_ANIM_OFFSET);
    }
  });

  it("kills the player immediately when a robot starts inside the collision box", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    const state = buildStateMachine(zp, NTSC);

    zp.kernelSection = GameState.PLAY;
    zp.playerHorizPos = 73;
    zp.playerVertPos = 8;
    zp.playerMotion = 10;
    zp.robotHorizPos[0] = 80;
    zp.robotVertPos[0] = 8;
    zp.robotAnimationIndex[0] = 0;
    for (let i = 1; i < 6; i++) {
      zp.robotHorizPos[i] = 142;
      zp.robotVertPos[i] = 76;
      zp.robotAnimationIndex[i] = 0;
    }

    processJoystickInput(state, 0);
    tick(state);

    expect(zp.playerAnimationIndex).toBe(PLAYER_DEATH_ANIM_OFFSET);
  });
});
