import { describe, it, expect } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame, tick, GameStateMachine } from "../game";
import { MAX_ROBOTS, NTSC, OTTO_REBOUND } from "../constants";

function buildStateMachine(zp: ReturnType<typeof createZeroPage>, region: number): GameStateMachine {
  return { zp, region, joystickInput: 0, lastJoystickInput: 0, frameCount: 0, vblankCount: 0, overscanCount: 0, colorCycleIndex: 0 };
}

describe("Otto ASM frame transitions", () => {
  it("increments the launch timer on frame rollover only", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation = OTTO_REBOUND;
    zp.robotVertPos[MAX_ROBOTS - 2] = 0x7f;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);
    expect(zp.evilOttoLaunchTimer).toBe(0);

    gsm.frameCount = 255;
    tick(gsm);
    expect(zp.evilOttoLaunchTimer).toBe(1);
    expect(zp.evilOttoVertPos).toBe(8);
    expect(zp.tempOttoVertPos).toBe(24);
  });

  it("performs an exact fast-move bounce sequence", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation = OTTO_REBOUND;
    zp.robotVertPos[MAX_ROBOTS - 2] = 0x7f;
    zp.robotVertPos[0] = 0x7f;
    zp.initRobotDelay = 0;
    zp.evilOttoLaunchTimer = 3;
    zp.evilOttoVertPos = 23;
    zp.prevEvilOttoVertPos = 8;
    zp.tempOttoVertPos = 24;
    zp.ottoVerticalDelta = 1;
    zp.evilOttoHorizPos = 50;
    zp.playerHorizPos = 49;
    zp.playerVertPos = 12;
    const gsm = buildStateMachine(zp, NTSC);
    gsm.frameCount = 1;

    tick(gsm);
    expect(zp.evilOttoVertPos).toBe(24);
    expect(zp.prevEvilOttoVertPos).toBe(10);
    expect(zp.tempOttoVertPos).toBe(30);
    expect(zp.ottoVerticalDelta).toBe(-4);
    expect(zp.evilOttoHorizPos).toBe(49);
  });
});
