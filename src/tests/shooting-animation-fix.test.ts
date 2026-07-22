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

    // Shoot UP — missile will hit top boundary and expire
    gsm.joystickInput = 0x11; // MOVE_UP (0x01) + FIRE (0x10)
    for (let i = 1; i <= 15; i++) {
      const prevLives = zp.numberOfLives;
      const prevAnim = zp.playerAnimationIndex;
      tick(gsm);
      console.log(`Tick ${i}: lives=${zp.numberOfLives} (prev=${prevLives}) anim=${zp.playerAnimationIndex} (prev=${prevAnim}) missileDir=${zp.playerMissileDirection} playerMissileVertPos=${zp.playerMissileVertPos} playerMissileHorizPos=${zp.playerMissileHorizPos} playerHorizPos=${zp.playerHorizPos} playerVertPos=${zp.playerVertPos} robot0Horiz=${zp.robotHorizPos[0]} robot0Vert=${zp.robotVertPos[0]} robot0Anim=${zp.robotAnimationIndex[0]} ottoLaunchTimer=${zp.evilOttoLaunchTimer} ottoHoriz=${zp.evilOttoHorizPos} ottoVert=${zp.evilOttoVertPos} kernelSection=${zp.kernelSection}`);
    }

    // After missile expires, player should survive and not be in death state
    expect(zp.playerMissileDirection).toBe(0);
    expect(zp.playerAnimationIndex).not.toBe(PLAYER_DEATH_ANIM_OFFSET);
    expect(zp.numberOfLives).toBe(3);
  });
});
