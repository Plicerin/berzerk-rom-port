import { describe, it, expect } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame, tick, type GameStateMachine, GameState } from "../game";
import { NTSC } from "../constants";

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

describe("player animation cadence regressions", () => {
  it("uses the ROM-style 0 -> 2 -> 1 -> 0 running loop on moved frames", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    const state = buildStateMachine(zp, NTSC);
    state.joystickInput = 0x08; // MOVE_RIGHT

    zp.playerMotion = 255;
    tick(state);
    expect(zp.playerAnimationIndex).toBe(2);

    zp.playerMotion = 255;
    tick(state);
    expect(zp.playerAnimationIndex).toBe(1);

    zp.playerMotion = 255;
    tick(state);
    expect(zp.playerAnimationIndex).toBe(0);
  });

  it("resets to standing and zeroes fractional motion when the player releases movement", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    const state = buildStateMachine(zp, NTSC);

    zp.playerAnimationIndex = 2;
    zp.playerMotion = 99;
    state.joystickInput = 0;
    tick(state);

    expect(zp.playerAnimationIndex).toBe(0);
    expect(zp.playerMotion).toBe(112);
  });
});
