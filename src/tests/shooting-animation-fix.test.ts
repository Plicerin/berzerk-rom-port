import { describe, it, expect } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame, tick, GameStateMachine, GameState } from "../game";
import { NTSC, PLAYER_DEATH_ANIM_OFFSET } from "../constants";

function buildStateMachine(
  zp: ReturnType<typeof createZeroPage>,
  region: number,
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

describe("shooting animation fix", () => {
  it("shooting UP should not trigger death animation", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    const gsm = buildStateMachine(zp, NTSC);

    // Shoot UP once, then release so held fire does not relaunch immediately.
    gsm.joystickInput = 0x11; // MOVE_UP (0x01) + FIRE (0x10)
    tick(gsm);
    gsm.joystickInput = 0x00;
    for (let i = 1; i <= 60; i++) tick(gsm);

    // After missile expires, player should survive and not be in death state
    expect(zp.playerMissileDirection).toBe(0);
    expect(zp.playerAnimationIndex).not.toBe(PLAYER_DEATH_ANIM_OFFSET);
    expect(zp.numberOfLives).toBe(3);
  });
});
