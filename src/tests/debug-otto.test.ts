import { describe, it, expect } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame, tick, GameStateMachine, GameState, OttoState } from "../game";
import { NTSC } from "../constants";

function buildStateMachine(zp: ReturnType<typeof createZeroPage>, region: number): GameStateMachine {
  return { zp, region, joystickInput: 0, lastJoystickInput: 0, frameCount: 0, vblankCount: 0, overscanCount: 0, colorCycleIndex: 0 };
}

describe("debug otto launch", () => {
  it("trace otto launch", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation &= ~0x08; // clear NO_OTTO
    zp.evilOttoLaunchTimer = 0;
    zp.kernelSection = GameState.VBLANK;
    const gsm = buildStateMachine(zp, NTSC);

    console.log("Before any tick: kernelSection =", zp.kernelSection, "launchTimer =", zp.evilOttoLaunchTimer);
    
    tick(gsm); // sets timer to 200
    console.log("After tick 1: kernelSection =", zp.kernelSection, "launchTimer =", zp.evilOttoLaunchTimer, "ottoVertPos =", zp.evilOttoVertPos, "frameCount =", gsm.frameCount);
    
    zp.evilOttoLaunchTimer = 1;
    tick(gsm); // Otto launches
    console.log("After tick 2: kernelSection =", zp.kernelSection, "launchTimer =", zp.evilOttoLaunchTimer, "ottoVertPos =", zp.evilOttoVertPos, "ottoDelta =", zp.ottoVerticalDelta);
    
    let finalKernel = 0;
    for (let i = 0; i < 60; i++) {
      tick(gsm);
      if (i === 59) {
        finalKernel = zp.kernelSection;
      }
    }
    console.log("After 60 more ticks: kernelSection =", finalKernel, "ottoVertPos =", zp.evilOttoVertPos, "numberOfLives =", zp.numberOfLives);
    console.log("playerVertPos =", zp.playerVertPos, "playerHorizPos =", zp.playerHorizPos);
    console.log("robotVertPos =", zp.robotVertPos);
    console.log("robotHorizPos =", zp.robotHorizPos);
    
    expect(finalKernel).toBe(OttoState.BOUNCING);
  });
});
