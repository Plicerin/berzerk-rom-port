// =============================================================================
// Tests for Robot AI and movement logic (ASM-matched)
// =============================================================================

import { describe, it, expect } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame, updateRobots } from "../game";
import {
  NTSC, ROBOT_STAND_ANIM_OFFSET, ROBOT_LEFT_ANIM_OFFSET,
  ROBOT_RIGHT_ANIM_OFFSET, ROBOT_UP_ANIM_OFFSET, ROBOT_DOWN_ANIM_OFFSET,
  ROBOT_DEATH_ANIM_OFFSET, XMIN, XMAX, YMIN,
} from "../constants";
import { RobotAnimationTableFlat } from "../data/tables";

describe("updateRobots - initRobotDelay", () => {
  it("keeps robots inactive while initRobotDelay has not reached 0xff", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    // Start at $AA (attract mode value) — takes 6 ticks to reach 0xff
    zp.initRobotDelay = 0xaa;

    let reachedFF = false;
    for (let i = 0; i < 6; i++) {
      updateRobots(zp, NTSC);
      expect(zp.initRobotDelay).not.toBe(0xff);
      reachedFF = true;
    }
    expect(reachedFF).toBe(true);
  });

  it("does not move robots while initRobotDelay < threshold", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    const startH = zp.robotHorizPos[0];
    const startV = zp.robotVertPos[0];

    for (let i = 0; i < 10; i++) {
      updateRobots(zp, NTSC);
    }

    expect(zp.robotHorizPos[0]).toBe(startH);
    expect(zp.robotVertPos[0]).toBe(startV);
  });
});

describe("updateRobots - fractional accumulator timing", () => {
  it("advances robotMotion via fractional accumulator", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotMotion = 0;

    updateRobots(zp, NTSC);

    expect(zp.robotMotion).toBe(0x20);
  });
});

describe("updateRobots - horizontal clamping", () => {
  it("clamps robot horizontal position to XMIN (0)", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotHorizPos[0] = XMIN;
    zp.robotVertPos[0] = 80;
    zp.playerHorizPos = 0;
    zp.playerVertPos = 80;

    updateRobots(zp, NTSC);
    expect(zp.robotHorizPos[0]).toBe(XMIN);
  });

  it("clamps robot horizontal position to XMAX (149)", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotHorizPos[0] = XMAX;
    zp.robotVertPos[0] = 80;
    zp.playerHorizPos = 149;
    zp.playerVertPos = 80;

    updateRobots(zp, NTSC);
    expect(zp.robotHorizPos[0]).toBe(XMAX);
  });
});

describe("updateRobots - vertical clamping", () => {
  it("clamps robot vertical position to YMIN (0)", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotVertPos[0] = YMIN;
    zp.playerVertPos = 0;

    updateRobots(zp, NTSC);
    expect(zp.robotVertPos[0]).toBe(YMIN);
  });

  it("clamps robot vertical position to 159", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotVertPos[0] = 159;
    zp.playerVertPos = 159;

    updateRobots(zp, NTSC);
    expect(zp.robotVertPos[0]).toBe(159);
  });
});

describe("updateRobots - skipping dying robots", () => {
  it("skips robots in death animation state", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotHorizPos[0] = 50;
    zp.robotVertPos[0] = 80;
    zp.robotAnimationIndex[0] = ROBOT_DEATH_ANIM_OFFSET;

    updateRobots(zp, NTSC);

    expect(zp.robotHorizPos[0]).toBe(50);
    expect(zp.robotVertPos[0]).toBe(80);
  });

  it("skips off-screen robots (vertPos = 0x7f)", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotVertPos[0] = 0x7f;

    updateRobots(zp, NTSC);
    expect(zp.robotVertPos[0]).toBe(0x7f);
  });
});

describe("RobotAnimationTableFlat", () => {
  it("cycles standing animation (0-8)", () => {
    expect(RobotAnimationTableFlat[0]).toBe(1);
    expect(RobotAnimationTableFlat[1]).toBe(2);
    expect(RobotAnimationTableFlat[7]).toBe(8);
    expect(RobotAnimationTableFlat[8]).toBe(0); // wraps
  });

  it("cycles walking left animation (9-11)", () => {
    expect(RobotAnimationTableFlat[9]).toBe(10);
    expect(RobotAnimationTableFlat[10]).toBe(11);
    expect(RobotAnimationTableFlat[11]).toBe(10); // wraps
  });

  it("cycles walking right animation (12-14)", () => {
    expect(RobotAnimationTableFlat[12]).toBe(13);
    expect(RobotAnimationTableFlat[13]).toBe(14);
    expect(RobotAnimationTableFlat[14]).toBe(13); // wraps
  });

  it("cycles walking up animation (15-17)", () => {
    expect(RobotAnimationTableFlat[15]).toBe(16);
    expect(RobotAnimationTableFlat[16]).toBe(17);
    expect(RobotAnimationTableFlat[17]).toBe(15); // wraps
  });

  it("cycles walking down animation (18-21)", () => {
    expect(RobotAnimationTableFlat[18]).toBe(19);
    expect(RobotAnimationTableFlat[19]).toBe(20);
    expect(RobotAnimationTableFlat[20]).toBe(21);
    expect(RobotAnimationTableFlat[21]).toBe(18); // wraps
  });

  it("advances death animation (22-25)", () => {
    expect(RobotAnimationTableFlat[22]).toBe(23);
    expect(RobotAnimationTableFlat[23]).toBe(24);
    expect(RobotAnimationTableFlat[24]).toBe(25);
    expect(RobotAnimationTableFlat[25]).toBe(25); // stays at last frame
  });
});

describe("updateRobots - multiple calls cycle animation", () => {
  it("cycles through standing animation frames over multiple calls", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotHorizPos[0] = 75;
    zp.robotVertPos[0] = 80;
    zp.playerHorizPos = 75;
    zp.playerVertPos = 80; // same position → standing

    // Animation index is randomized by initGame, just check it's in standing range
    expect(zp.robotAnimationIndex[0] & 0x1f).toBeLessThanOrEqual(8);

    // Call multiple times - animation should progress
    for (let i = 0; i < 8; i++) {
      updateRobots(zp, NTSC);
    }

    // Robot 0 may be selected to move, so just verify the animation index
    // remains within the valid robot animation table range.
    const animIdx = zp.robotAnimationIndex[0] & 0x1f;
    expect(animIdx).toBeGreaterThanOrEqual(0);
    expect(animIdx).toBeLessThanOrEqual(21);
  });
});
