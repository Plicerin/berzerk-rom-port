import { describe, it, expect } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame, tick, GameStateMachine, GameState } from "../game";
import { agentDecide } from "../game/agent";
import { NTSC, MAX_ROBOTS, ROBOT_DEATH_ANIM_OFFSET } from "../constants";

function buildStateMachine(zp: ReturnType<typeof createZeroPage>, region: number): GameStateMachine {
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

describe("agent", () => {
  it("heads for an exit after all robots are dead and triggers room exit", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerHorizPos = 73;
    zp.playerVertPos = 150;
    zp.playerMotion = 200;

    for (let i = 0; i < MAX_ROBOTS; i++) {
      zp.robotAnimationIndex[i] = ROBOT_DEATH_ANIM_OFFSET;
      zp.robotVertPos[i] = 0x7f;
    }

    const gsm = buildStateMachine(zp, NTSC);

    for (let i = 0; i < 20 && zp.gameState !== 0xff; i++) {
      gsm.joystickInput = agentDecide(gsm);
      tick(gsm);
    }

    expect(zp.gameState).toBe(0xff);
  });
});
