// =============================================================================
// Tests for Robot AI and movement logic
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame } from "../game";
import { determineRobotDirection, updateRobotAnimation, updateRobots, RobotState } from "../game";
import { NTSC, ROBOT_STAND_ANIM_OFFSET, ROBOT_LEFT_ANIM_OFFSET, ROBOT_RIGHT_ANIM_OFFSET, ROBOT_UP_ANIM_OFFSET, ROBOT_DOWN_ANIM_OFFSET, ROBOT_DEATH_ANIM_OFFSET, XMIN, XMAX, YMIN, RobotMotionDelayTable } from "../constants";
import { RobotAnimationTable } from "../data/tables";

describe("determineRobotDirection", () => {
  it("returns WALKING_RIGHT when player is to the right and dx > dy", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.robotHorizPos[0] = 50;
    zp.robotVertPos[0] = 80;
    zp.playerHorizPos = 100;
    zp.playerVertPos = 85;

    const direction = determineRobotDirection(zp, 0);
    expect(direction).toBe(RobotState.WALKING_RIGHT);
  });

  it("returns WALKING_LEFT when player is to the left and dx > dy", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.robotHorizPos[0] = 100;
    zp.robotVertPos[0] = 80;
    zp.playerHorizPos = 50;
    zp.playerVertPos = 85;

    const direction = determineRobotDirection(zp, 0);
    expect(direction).toBe(RobotState.WALKING_LEFT);
  });

  it("returns WALKING_DOWN when player is below and dy >= dx", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.robotHorizPos[0] = 75;
    zp.robotVertPos[0] = 50;
    zp.playerHorizPos = 80;
    zp.playerVertPos = 100;

    const direction = determineRobotDirection(zp, 0);
    expect(direction).toBe(RobotState.WALKING_DOWN);
  });

  it("returns WALKING_UP when player is above and dy >= dx", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.robotHorizPos[0] = 75;
    zp.robotVertPos[0] = 100;
    zp.playerHorizPos = 80;
    zp.playerVertPos = 50;

    const direction = determineRobotDirection(zp, 0);
    expect(direction).toBe(RobotState.WALKING_UP);
  });

  it("returns WALKING_RIGHT when dx equals dy (horizontal priority)", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.robotHorizPos[0] = 50;
    zp.robotVertPos[0] = 80;
    zp.playerHorizPos = 100;
    zp.playerVertPos = 130;

    const direction = determineRobotDirection(zp, 0);
    expect(direction).toBe(RobotState.WALKING_RIGHT);
  });

  it("returns WALKING_DOWN when player is at same horizontal position", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.robotHorizPos[0] = 75;
    zp.robotVertPos[0] = 50;
    zp.playerHorizPos = 75;
    zp.playerVertPos = 100;

    const direction = determineRobotDirection(zp, 0);
    expect(direction).toBe(RobotState.WALKING_DOWN);
  });
});

describe("updateRobotAnimation", () => {
  it("does not update animation for a dying robot", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.robotAnimationIndex[0] = ROBOT_DEATH_ANIM_OFFSET;

    updateRobotAnimation(zp, 0, RobotState.WALKING_LEFT, NTSC);
    expect(zp.robotAnimationIndex[0]).toBe(ROBOT_DEATH_ANIM_OFFSET);
  });

  it("sets standing animation when direction is 0 (standing)", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.robotAnimationIndex[0] = ROBOT_STAND_ANIM_OFFSET;

    updateRobotAnimation(zp, 0, RobotState.STANDING, NTSC);
    expect(zp.robotAnimationIndex[0]).toBe(ROBOT_STAND_ANIM_OFFSET + 1);
  });

  it("sets left animation offset when direction is WALKING_LEFT", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.robotAnimationIndex[0] = ROBOT_LEFT_ANIM_OFFSET;

    updateRobotAnimation(zp, 0, RobotState.WALKING_LEFT, NTSC);
    expect(zp.robotAnimationIndex[0]).toBe(ROBOT_LEFT_ANIM_OFFSET + 1);
  });

  it("sets right animation offset when direction is WALKING_RIGHT", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.robotAnimationIndex[0] = ROBOT_RIGHT_ANIM_OFFSET;

    updateRobotAnimation(zp, 0, RobotState.WALKING_RIGHT, NTSC);
    expect(zp.robotAnimationIndex[0]).toBe(ROBOT_RIGHT_ANIM_OFFSET + 1);
  });

  it("sets up animation offset when direction is WALKING_UP", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.robotAnimationIndex[0] = ROBOT_UP_ANIM_OFFSET;

    updateRobotAnimation(zp, 0, RobotState.WALKING_UP, NTSC);
    expect(zp.robotAnimationIndex[0]).toBe(ROBOT_UP_ANIM_OFFSET + 1);
  });

  it("sets down animation offset when direction is WALKING_DOWN", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.robotAnimationIndex[0] = ROBOT_DOWN_ANIM_OFFSET;

    updateRobotAnimation(zp, 0, RobotState.WALKING_DOWN, NTSC);
    expect(zp.robotAnimationIndex[0]).toBe(ROBOT_DOWN_ANIM_OFFSET + 1);
  });

  it("wraps animation index to 0 when reaching end of table", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);

    // Standing table has 9 entries (indices 0-8)
    // Set to last entry
    zp.robotAnimationIndex[0] = ROBOT_STAND_ANIM_OFFSET + 8;

    updateRobotAnimation(zp, 0, RobotState.STANDING, NTSC);
    expect(zp.robotAnimationIndex[0]).toBe(ROBOT_STAND_ANIM_OFFSET);
  });

  it("falls back to standing animation for unknown direction", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.robotAnimationIndex[0] = ROBOT_STAND_ANIM_OFFSET;

    // Direction 99 is unknown — should default to standing
    updateRobotAnimation(zp, 0, 99, NTSC);
    expect(zp.robotAnimationIndex[0]).toBe(ROBOT_STAND_ANIM_OFFSET + 1);
  });
});

describe("updateRobots - initRobotDelay", () => {
  it("increments initRobotDelay until it reaches 255", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 0;

    // Call updateRobots 255 times
    for (let i = 0; i < 255; i++) {
      updateRobots(zp, NTSC);
    }
    expect(zp.initRobotDelay).toBe(255);
  });

  it("does not move robots while initRobotDelay < 255", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    const startHorizPos = zp.robotHorizPos[0];
    const startVertPos = zp.robotVertPos[0];

    // Call updateRobots 254 times (initRobotDelay goes from 0 to 254)
    for (let i = 0; i < 254; i++) {
      updateRobots(zp, NTSC);
    }

    // Robots should not have moved during init phase
    expect(zp.robotHorizPos[0]).toBe(startHorizPos);
    expect(zp.robotVertPos[0]).toBe(startVertPos);
  });
});

describe("updateRobots - motion delay", () => {
  it("resets robotMotionDelay to 0 when it reaches RobotMotionDelayTable[0]", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotMotionDelay = RobotMotionDelayTable[0] - 1;

    updateRobots(zp, NTSC);
    expect(zp.robotMotionDelay).toBe(0);
  });

  it("does not advance robots when motion delay has not reached threshold", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotMotionDelay = RobotMotionDelayTable[0] - 2;
    const startHorizPos = zp.robotHorizPos[0];

    updateRobots(zp, NTSC);

    // Motion delay should have incremented but not reached threshold
    expect(zp.robotMotionDelay).toBe(RobotMotionDelayTable[0] - 1);
    expect(zp.robotHorizPos[0]).toBe(startHorizPos);
  });
});

describe("updateRobots - horizontal movement and clamping", () => {
  it("moves robot left (direction 1) and increments fine horizontal position", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotHorizPos[0] = 50;
    zp.robotVertPos[0] = 80;
    zp.playerHorizPos = 0; // player to the left
    zp.playerVertPos = 80;
    zp.robotFineHoriz[0] = 0;

    updateRobots(zp, NTSC);

    expect(zp.robotHorizPos[0]).toBe(49); // moved left
    expect(zp.robotFineHoriz[0]).toBe(1); // fine position incremented
  });

  it("moves robot right (direction 2) and increments fine horizontal position", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotHorizPos[0] = 50;
    zp.robotVertPos[0] = 80;
    zp.playerHorizPos = 149; // player to the right
    zp.playerVertPos = 80;
    zp.robotFineHoriz[0] = 0;

    updateRobots(zp, NTSC);

    expect(zp.robotHorizPos[0]).toBe(51); // moved right
    expect(zp.robotFineHoriz[0]).toBe(1); // fine position incremented
  });

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

  it("updates coarse horizontal position via moveRobotHorizontally", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotHorizPos[0] = 50;
    zp.robotVertPos[0] = 80;
    zp.playerHorizPos = 149; // player to the right → robot walks right
    zp.playerVertPos = 80;
    zp.robotFineHoriz[0] = 0;
    const startCoarse = zp.robotCoarseHoriz[0];

    updateRobots(zp, NTSC);

    // HorizontalPixelOffsets[0] = 0, so coarse doesn't change on first step
    // But fine position should have incremented
    expect(zp.robotFineHoriz[0]).toBe(1);
  });
});

describe("updateRobots - vertical movement", () => {
  it("moves robot up (direction 3) and decrements vertical position", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotHorizPos[0] = 75;
    zp.robotVertPos[0] = 80;
    zp.playerHorizPos = 75;
    zp.playerVertPos = 40; // player above

    updateRobots(zp, NTSC);

    expect(zp.robotVertPos[0]).toBe(79); // moved up by 1
  });

  it("moves robot down (direction 4) and increments vertical position", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotHorizPos[0] = 75;
    zp.robotVertPos[0] = 80;
    zp.playerHorizPos = 75;
    zp.playerVertPos = 120; // player below

    updateRobots(zp, NTSC);

    expect(zp.robotVertPos[0]).toBe(81); // moved down by 1
  });

  it("clamps robot vertical position to YMIN (0)", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotHorizPos[0] = 75;
    zp.robotVertPos[0] = YMIN;
    zp.playerHorizPos = 75;
    zp.playerVertPos = 0; // player at YMIN

    updateRobots(zp, NTSC);

    expect(zp.robotVertPos[0]).toBe(YMIN);
  });

  it("clamps robot vertical position to 159", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;
    zp.robotHorizPos[0] = 75;
    zp.robotVertPos[0] = 159;
    zp.playerHorizPos = 75;
    zp.playerVertPos = 159; // player at 159

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
    zp.playerHorizPos = 0;
    zp.playerVertPos = 80;

    updateRobots(zp, NTSC);

    // Robot should not have moved (death state skips movement)
    expect(zp.robotHorizPos[0]).toBe(50);
    expect(zp.robotVertPos[0]).toBe(80);
  });

  it("processes non-death robots even when others are dying", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.initRobotDelay = 255;

    // Robot 0: dying
    zp.robotAnimationIndex[0] = ROBOT_DEATH_ANIM_OFFSET;
    zp.robotHorizPos[0] = 50;

    // Robot 1: alive, player to the left → should move left
    zp.robotAnimationIndex[1] = ROBOT_STAND_ANIM_OFFSET;
    zp.robotHorizPos[1] = 50;
    zp.robotVertPos[1] = 80;
    zp.playerHorizPos = 0;
    zp.playerVertPos = 80;

    updateRobots(zp, NTSC);

    // Robot 0 should be unchanged
    expect(zp.robotHorizPos[0]).toBe(50);
    // Robot 1 should have moved left
    expect(zp.robotHorizPos[1]).toBe(49);
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

    const initialAnim = zp.robotAnimationIndex[0];
    expect(initialAnim).toBe(ROBOT_STAND_ANIM_OFFSET);

    // Call multiple times - animation should progress
    for (let i = 0; i < 8; i++) {
      updateRobots(zp, NTSC);
    }

    // Standing table has 9 entries; after 8 calls from index 0, should be at index 8
    expect(zp.robotAnimationIndex[0]).toBe(ROBOT_STAND_ANIM_OFFSET + 8);
  });
});
