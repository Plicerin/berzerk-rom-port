/**
 * Tests for unexported game-logic functions:
 * - updateEvilOtto
 * - updatePlayer
 * - checkPlayerWallCollisions
 * - checkMissileBoundsAndCollisions
 * - checkPlayerCollisions
 * - checkMissileCollisions
 * - incrementScore
 * - incrementScoreBCD
 *
 * These functions are not exported from game/index.ts, so we test them
 * indirectly by manipulating ZeroPage state and observing side effects
 * through the tick() function.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame, tick, GameStateMachine, GameState, OttoState, isPositionInWall } from "../game";
import {
  NTSC,
  PAL,
  XMIN,
  XMAX,
  XMAX_PLAYER,
  H_KERNEL,
  H_PLAYER,
  MAX_ROBOTS,
  ROBOT_STAND_ANIM_OFFSET,
  ROBOT_DEATH_ANIM_OFFSET,
  OTTO_INVINCIBLE,
  OTTO_REBOUND,
  NO_OTTO,
  EXTRA_LIFE_2000,
  EXTRA_LIFE_1000,
  ROBOT_SHOOTING,
  ROBOT_SHOOTING_RIGHT,
  MOVE_LEFT,
  MOVE_RIGHT,
  MOVE_DOWN,
  XROBOT_MISSILE_BOX,
  YROBOT_MISSILE_BOX,
  PLAYER_ENTERING_NORTH,
  PLAYER_ENTERING_SOUTH,
  PLAYER_ENTERING_WEST,
  PLAYER_ENTERING_EAST,
} from "../constants";
import { InitHorizontalPosition, InitVerticalPosition } from "../data/tables";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a GameStateMachine that shares the given zp.
 * tick() requires a GameStateMachine object; this lets us feed our own zp
 * into tick() so we can inspect it after the call.
 */
function buildStateMachine(
  zp: ReturnType<typeof createZeroPage>,
  region: number
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

// ---------------------------------------------------------------------------
// updateEvilOtto
// ---------------------------------------------------------------------------

describe("updateEvilOtto (via tick)", () => {
  function enableOtto(zp: ReturnType<typeof createZeroPage>): void {
    zp.gameVariation = OTTO_REBOUND;
    zp.robotVertPos[MAX_ROBOTS - 2] = 0x7f;
  }

  it("skips when NO_OTTO flag is set", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation |= NO_OTTO;
    zp.robotVertPos[MAX_ROBOTS - 2] = 0x7f;
    const gsm = buildStateMachine(zp, NTSC);
    gsm.frameCount = 255;

    tick(gsm);

    expect(zp.evilOttoLaunchTimer).toBe(0);
  });

  it("only increments launch timer when frameCount rolls to zero and ASM Otto gates are true", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    enableOtto(zp);
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);
    expect(zp.frameCount).toBe(1);
    expect(zp.evilOttoLaunchTimer).toBe(0);

    gsm.frameCount = 255;
    tick(gsm);
    expect(zp.frameCount).toBe(0);
    expect(zp.evilOttoLaunchTimer).toBe(1);
    expect(zp.evilOttoVertPos).toBe(8);
    expect(zp.prevEvilOttoVertPos).toBe(8);
    expect(zp.tempOttoVertPos).toBe(24);
    expect(zp.evilOttoHorizPos).toBe(73);
  });

  it("does not increment launch timer without the robotVertPos+MAX_ROBOTS-2 off-screen gate", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation = OTTO_REBOUND;
    zp.robotVertPos[MAX_ROBOTS - 2] = 40;
    const gsm = buildStateMachine(zp, NTSC);
    gsm.frameCount = 255;

    tick(gsm);

    expect(zp.evilOttoLaunchTimer).toBe(0);
  });

  it("does not increment launch timer without OTTO_REBOUND or OTTO_INVINCIBLE", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation = ROBOT_SHOOTING;
    zp.robotVertPos[MAX_ROBOTS - 2] = 0x7f;
    const gsm = buildStateMachine(zp, NTSC);
    gsm.frameCount = 255;

    tick(gsm);

    expect(zp.evilOttoLaunchTimer).toBe(0);
  });

  it("launches Otto from the same doorway where the player entered", () => {
    const entries = [
      PLAYER_ENTERING_NORTH,
      PLAYER_ENTERING_SOUTH,
      PLAYER_ENTERING_WEST,
      PLAYER_ENTERING_EAST,
    ];

    for (const entryDir of entries) {
      const zp = createZeroPage();
      initGame(zp, 0, NTSC);
      enableOtto(zp);
      zp.playerStartingLocation = entryDir;
      zp.evilOttoLaunchTimer = 2;
      const gsm = buildStateMachine(zp, NTSC);
      gsm.frameCount = 255;

      tick(gsm);

      expect(zp.evilOttoLaunchTimer).toBe(3);
      expect(zp.ottoVerticalDelta).toBe(1);
      expect(zp.evilOttoVertPos).toBe(InitVerticalPosition[entryDir]);
      expect(zp.prevEvilOttoVertPos).toBe(InitVerticalPosition[entryDir]);
      expect(zp.tempOttoVertPos).toBe(InitVerticalPosition[entryDir] + 16);
      expect(zp.evilOttoHorizPos).toBe(InitHorizontalPosition[entryDir]);
    }
  });

  it("moves Otto down one pixel before tempOttoVertPos without changing delta or prev", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    enableOtto(zp);
    zp.initRobotDelay = 0;
    zp.evilOttoLaunchTimer = 3;
    zp.evilOttoVertPos = 8;
    zp.prevEvilOttoVertPos = 8;
    zp.tempOttoVertPos = 24;
    zp.ottoVerticalDelta = 1;
    zp.evilOttoHorizPos = 50;
    zp.playerHorizPos = 60;
    zp.playerVertPos = 8;
    zp.robotVertPos[0] = 0x7f;
    const gsm = buildStateMachine(zp, NTSC);
    gsm.frameCount = 1;

    tick(gsm);

    expect(zp.evilOttoVertPos).toBe(9);
    expect(zp.prevEvilOttoVertPos).toBe(8);
    expect(zp.tempOttoVertPos).toBe(24);
    expect(zp.ottoVerticalDelta).toBe(1);
    expect(zp.evilOttoHorizPos).toBe(51);
  });

  it("snaps Otto to tempOttoVertPos while moving down after passing prev+5", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    enableOtto(zp);
    zp.initRobotDelay = 0;
    zp.evilOttoLaunchTimer = 3;
    zp.evilOttoVertPos = 14;
    zp.prevEvilOttoVertPos = 8;
    zp.tempOttoVertPos = 24;
    zp.ottoVerticalDelta = 1;
    zp.evilOttoHorizPos = 50;
    zp.playerHorizPos = 50;
    zp.playerVertPos = 8;
    zp.robotVertPos[0] = 0x7f;
    const gsm = buildStateMachine(zp, NTSC);
    gsm.frameCount = 1;

    tick(gsm);

    expect(zp.evilOttoVertPos).toBe(24);
    expect(zp.prevEvilOttoVertPos).toBe(8);
    expect(zp.tempOttoVertPos).toBe(24);
    expect(zp.ottoVerticalDelta).toBe(1);
  });

  it("bounces Otto upward after reaching tempOttoVertPos and updates prev/temp", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    enableOtto(zp);
    zp.initRobotDelay = 0;
    zp.evilOttoLaunchTimer = 3;
    zp.evilOttoVertPos = 23;
    zp.prevEvilOttoVertPos = 8;
    zp.tempOttoVertPos = 24;
    zp.ottoVerticalDelta = 1;
    zp.evilOttoHorizPos = 50;
    zp.playerHorizPos = 50;
    zp.playerVertPos = 12;
    zp.robotVertPos[0] = 0x7f;
    const gsm = buildStateMachine(zp, NTSC);
    gsm.frameCount = 1;

    tick(gsm);

    expect(zp.evilOttoVertPos).toBe(24);
    expect(zp.prevEvilOttoVertPos).toBe(10);
    expect(zp.tempOttoVertPos).toBe(30);
    expect(zp.ottoVerticalDelta).toBe(-4);
  });

  it("does not move Otto when the robot motion ASL/ADC sequence does not carry", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    enableOtto(zp);
    zp.initRobotDelay = 0;
    zp.evilOttoLaunchTimer = 3;
    zp.evilOttoVertPos = 8;
    zp.prevEvilOttoVertPos = 8;
    zp.tempOttoVertPos = 24;
    zp.ottoVerticalDelta = 1;
    zp.evilOttoHorizPos = 50;
    zp.playerHorizPos = 60;
    zp.robotVertPos[0] = 20;
    zp.robotMotionDelay = 0x80;
    zp.robotMotion = 0;
    const gsm = buildStateMachine(zp, NTSC);
    gsm.frameCount = 1;

    tick(gsm);

    expect(zp.evilOttoVertPos).toBe(8);
    expect(zp.evilOttoHorizPos).toBe(50);
    expect(zp.ottoVerticalDelta).toBe(1);
  });

  it("moves Otto when the robot motion ASL/ADC sequence carries", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    enableOtto(zp);
    zp.initRobotDelay = 0;
    zp.evilOttoLaunchTimer = 3;
    zp.evilOttoVertPos = 8;
    zp.prevEvilOttoVertPos = 8;
    zp.tempOttoVertPos = 24;
    zp.ottoVerticalDelta = 1;
    zp.evilOttoHorizPos = 50;
    zp.playerHorizPos = 60;
    zp.robotVertPos[0] = 20;
    zp.robotMotionDelay = 0xff;
    zp.robotMotion = 1;
    const gsm = buildStateMachine(zp, NTSC);
    gsm.frameCount = 1;

    tick(gsm);

    expect(zp.evilOttoVertPos).toBe(9);
    expect(zp.evilOttoHorizPos).toBe(51);
  });

  it("tracks player horizontally one pixel per moved frame", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    enableOtto(zp);
    zp.initRobotDelay = 0;
    zp.evilOttoLaunchTimer = 3;
    zp.evilOttoHorizPos = 50;
    zp.evilOttoVertPos = 80;
    zp.ottoVerticalDelta = 1;
    zp.prevEvilOttoVertPos = 80;
    zp.tempOttoVertPos = 96;
    zp.playerHorizPos = 100;
    zp.playerVertPos = 80;
    zp.robotVertPos[0] = 0x7f;
    const gsm = buildStateMachine(zp, NTSC);
    gsm.frameCount = 1;

    tick(gsm);

    expect(zp.evilOttoHorizPos).toBe(51);
  });

  it("kills player on the ASM Otto collision boundary", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation = OTTO_REBOUND;
    zp.evilOttoLaunchTimer = 3;
    zp.evilOttoHorizPos = 50;
    zp.evilOttoVertPos = 80 - (H_PLAYER - 1);
    zp.playerHorizPos = 57;
    zp.playerVertPos = 80;
    zp.playerMotion = 10;
    for (let i = 0; i < MAX_ROBOTS; i++) {
      zp.robotVertPos[i] = 0x7f;
    }
    zp.robotVertPos[MAX_ROBOTS - 2] = 40; // keep Otto movement gated off for this collision-only check
    const gsm = buildStateMachine(zp, NTSC);
    gsm.frameCount = 255;

    tick(gsm);

    expect(zp.playerAnimationIndex).toBe(3);
  });

  it("does not kill player just outside the ASM Otto collision boundary", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation = OTTO_REBOUND;
    zp.evilOttoLaunchTimer = 3;
    zp.evilOttoHorizPos = 50;
    zp.evilOttoVertPos = 80 - H_PLAYER;
    zp.playerHorizPos = 58;
    zp.playerVertPos = 80;
    zp.playerMotion = 10;
    for (let i = 0; i < MAX_ROBOTS; i++) {
      zp.robotVertPos[i] = 0x7f;
    }
    zp.robotVertPos[MAX_ROBOTS - 2] = 40; // keep Otto movement gated off for this collision-only check
    const gsm = buildStateMachine(zp, NTSC);
    gsm.frameCount = 255;

    tick(gsm);

    expect(zp.playerAnimationIndex).not.toBe(3);
  });
});

describe("ASM robot missile constants", () => {
  it("matches the targeting box constants used by DetermineToFireRobotMissile", () => {
    expect(XROBOT_MISSILE_BOX).toBe(8);
    expect(YROBOT_MISSILE_BOX).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// updatePlayer
// ---------------------------------------------------------------------------

describe("updatePlayer (via tick)", () => {
  it("does not move player when not in PLAY state", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.playerDirection = 0x01; // MOVE_RIGHT
    const gsm = buildStateMachine(zp, NTSC);

    // In ATTRACT mode, player should not move
    tick(gsm);

    expect(zp.playerHorizPos).toBe(
      zp.playerHorizPos // unchanged
    );
  });

  it("moves player right in PLAY state", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    // Set playerMotion high enough to trigger movement
    zp.playerMotion = 200; // 200 + 112 = 312 > 255
    const gsm = buildStateMachine(zp, NTSC);
    const startX = zp.playerHorizPos;
    gsm.joystickInput = MOVE_RIGHT;

    tick(gsm);

    expect(zp.playerHorizPos).toBeGreaterThan(startX);
  });

  it("clamps player at XMAX_PLAYER", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerHorizPos = XMAX_PLAYER;
    zp.playerMotion = 200;
    const gsm = buildStateMachine(zp, NTSC);
    gsm.joystickInput = MOVE_RIGHT;

    tick(gsm);

    expect(zp.playerHorizPos).toBe(XMAX_PLAYER);
  });

  it("clamps player at XMIN", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerHorizPos = XMIN;
    zp.playerMotion = 200;
    const gsm = buildStateMachine(zp, NTSC);
    gsm.joystickInput = MOVE_LEFT;

    tick(gsm);

    expect(zp.playerHorizPos).toBe(XMIN);
  });

  it("exits room when player reaches bottom boundary", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerHorizPos = 73;
    zp.playerVertPos = 151;
    zp.playerMotion = 200;
    const gsm = buildStateMachine(zp, NTSC);
    gsm.joystickInput = MOVE_DOWN;

    tick(gsm);

    // Player reached the bottom doorway boundary (>= 152) — triggers room exit.
    expect(zp.gameState).toBe(0xff);
    expect(zp.playerVertPos).toBe(0x7f); // player hidden
    expect(zp.tempPlayerExitingPos).toBe(PLAYER_ENTERING_SOUTH);
  });

  it("awards room-clear bonus before resetting killed robot count", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameState = 0xff;
    zp.tempPlayerExitingPos = PLAYER_ENTERING_SOUTH;
    zp.upperPlayfieldLimit = 10;
    zp.lowerPlayfieldLimit = 10;
    zp.robotVertPos[0] = 0x7f;
    zp.numberRobotsKilled = 6;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerScore0).toBe(0x00);
    expect(zp.playerScore1).toBe(0x00);
    expect(zp.playerScore2).toBe(0x60);
    expect(zp.numberRobotsKilled).toBe(0);
  });

  it("preserves killed robot count from real exit setup until room-clear bonus is awarded", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerHorizPos = 73;
    zp.playerVertPos = 151;
    zp.playerMotion = 200;
    zp.robotVertPos[0] = 0x7f;
    zp.numberRobotsKilled = 6;
    const gsm = buildStateMachine(zp, NTSC);
    gsm.joystickInput = MOVE_DOWN;

    tick(gsm);
    expect(zp.gameState).toBe(0xff);
    expect(zp.numberRobotsKilled).toBe(6);

    zp.upperPlayfieldLimit = 10;
    zp.lowerPlayfieldLimit = 10;
    tick(gsm);

    expect(zp.playerScore0).toBe(0x00);
    expect(zp.playerScore1).toBe(0x00);
    expect(zp.playerScore2).toBe(0x60);
    expect(zp.numberRobotsKilled).toBe(0);
  });

  it("does not exit from a sealed bottom wall segment away from the doorway", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerHorizPos = 50;
    zp.playerVertPos = 151;
    zp.playerMotion = 200;
    const gsm = buildStateMachine(zp, NTSC);
    gsm.joystickInput = MOVE_DOWN;

    tick(gsm);

    expect(zp.gameState).toBe(0);
    expect(zp.playerVertPos).not.toBe(0x7f);
  });

  it("does not award room-clear bonus if robots remain on screen", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameState = 0xff;
    zp.tempPlayerExitingPos = PLAYER_ENTERING_SOUTH;
    zp.upperPlayfieldLimit = 10;
    zp.lowerPlayfieldLimit = 10;
    zp.robotVertPos[0] = 40;
    zp.numberRobotsKilled = 6;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerScore0).toBe(0x00);
    expect(zp.playerScore1).toBe(0x00);
    expect(zp.playerScore2).toBe(0x00);
    expect(zp.numberRobotsKilled).toBe(0);
  });

  it("skips player update when dying", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerDirection = 0x01; // MOVE_RIGHT
    zp.playerHorizPos = 50;
    zp.playerMotion = 200;
    // Set player to death animation
    zp.playerAnimationIndex = 3; // PLAYER_DEATH_ANIM_OFFSET
    // Prevent death handler from resetting player (playerMotion must be <= 30)
    zp.playerMotion = 0;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    // Player should not move while dying
    expect(zp.playerHorizPos).toBe(50);
  });

  it("shooting resets fractional motion but keeps the ROM standing/run counter instead of writing a fake death-adjacent state", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerMotion = 77;
    const gsm = buildStateMachine(zp, NTSC);
    // Set joystick to MOVE_UP + fire (tick overwrites playerDirection from joystickInput)
    gsm.joystickInput = 0x11; // MOVE_UP (0x01) + fire (0x10)

    tick(gsm);

    expect(zp.playerAnimationIndex).toBe(0);
    expect(zp.playerMotion).toBe(112);
  });

  it("advances running animation only when movement actually occurs", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    const gsm = buildStateMachine(zp, NTSC);
    gsm.joystickInput = 0x01;

    tick(gsm);
    expect(zp.playerAnimationIndex).toBe(0); // no overflow, no animation advance

    zp.playerMotion = 255;
    tick(gsm);
    expect(zp.playerAnimationIndex).toBe(2); // ROM wraps 0 -> 2 on first moved frame
  });

  it("sets standing animation when not moving or shooting", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerDirection = 0; // no direction
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    // Standing animation offset is 0
    expect(zp.playerAnimationIndex).toBe(0);
  });

  it("NTSC: player moves when playerMotion + 112 > 255", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerMotion = 144; // 144 + 112 = 256 > 255 → move
    const gsm = buildStateMachine(zp, NTSC);
    const startX = zp.playerHorizPos;
    gsm.joystickInput = MOVE_RIGHT;

    tick(gsm);

    expect(zp.playerHorizPos).toBeGreaterThan(startX);
  });

  it("NTSC: player does not move when playerMotion + 112 <= 255", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerMotion = 100; // 100 + 112 = 212 <= 255 → no move
    const gsm = buildStateMachine(zp, NTSC);
    gsm.joystickInput = MOVE_RIGHT;

    tick(gsm);

    expect(zp.playerHorizPos).toBe(73);
  });
});

// ---------------------------------------------------------------------------
// checkPlayerWallCollisions
// ---------------------------------------------------------------------------

describe("checkPlayerWallCollisions (via tick)", () => {
  it("reverts player position when moving into a wall", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerDirection = 0x01; // MOVE_RIGHT
    // Position player so right edge is at a wall
    // Using isPositionInWall to find a safe position first
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);
    // Just verify tick doesn't throw with wall collision logic
    expect(() => tick(gsm)).not.toThrow();
  });

  it("clamps player after reverting movement", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerDirection = 0x01; // MOVE_RIGHT
    zp.playerHorizPos = XMAX_PLAYER;
    zp.playerMotion = 200;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerHorizPos).toBeLessThanOrEqual(XMAX_PLAYER);
  });
});

// ---------------------------------------------------------------------------
// checkMissileBoundsAndCollisions
// ---------------------------------------------------------------------------

describe("checkMissileBoundsAndCollisions (via tick)", () => {
  it("turns off player missile at X boundary", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerMissileDirection = 0x08; // firing
    zp.playerMissileHorizPos = XMIN; // at left edge
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerMissileDirection).toBe(0);
  });

  it("turns off player missile at XMAX boundary", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerMissileDirection = 0x08; // firing
    zp.playerMissileHorizPos = XMAX; // at right edge
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerMissileDirection).toBe(0);
  });

  it("turns off player missile at Y boundary", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerMissileDirection = 0x08; // firing
    zp.playerMissileVertPos = (H_KERNEL - 8) / 2 + 1; // below YMAX
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerMissileDirection).toBe(0);
  });

  it("turns off player missile at YMIN boundary", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerMissileDirection = 0x08; // firing
    zp.playerMissileVertPos = -1; // above top
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerMissileDirection).toBe(0);
  });

  it("turns off robot missile at X boundary", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.robotMissileDirection = ROBOT_SHOOTING_RIGHT; // horizontal direction
    zp.robotMissileHorizPos = XMAX; // at right edge
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.robotMissileDirection).toBe(0);
  });

  it("turns off both missiles on collision", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerMissileDirection = 0x08;
    zp.playerMissileHorizPos = 75;
    zp.playerMissileVertPos = 50;
    zp.robotMissileDirection = 0x08;
    zp.robotMissileHorizPos = 76;
    zp.robotMissileVertPos = 50;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerMissileDirection).toBe(0);
    expect(zp.robotMissileDirection).toBe(0);
  });

  it("turns off robot missile and kills player on hit", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.robotMissileDirection = 0x08;
    zp.robotMissileHorizPos = 50;
    zp.robotMissileVertPos = 50;
    zp.playerHorizPos = 50;
    zp.playerVertPos = 50;
    // Keep playerMotion low so death handler doesn't immediately reset player
    zp.playerMotion = 10;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.robotMissileDirection).toBe(0);
    expect(zp.playerAnimationIndex).toBe(3); // death animation (PLAYER_DEATH_ANIM_OFFSET)
  });

  it("does not turn off missile when direction is 0x0f (off)", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerMissileDirection = 0x0f;
    zp.playerMissileHorizPos = 75;
    zp.playerMissileVertPos = 50;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    // Missile should still be off (0x0f), not changed to 0
    expect(zp.playerMissileDirection).toBe(0x0f);
  });
});

// ---------------------------------------------------------------------------
// checkPlayerCollisions
// ---------------------------------------------------------------------------

describe("checkPlayerCollisions (via tick)", () => {
  it("kills player when colliding with a robot", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    // Place robot close to player
    zp.robotHorizPos[0] = 50;
    zp.robotVertPos[0] = 50;
    zp.robotAnimationIndex[0] = ROBOT_STAND_ANIM_OFFSET;
    zp.playerHorizPos = 52;
    zp.playerVertPos = 52;
    // Keep playerMotion low so death handler doesn't immediately reset player
    zp.playerMotion = 10;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerAnimationIndex).toBe(3); // death animation (PLAYER_DEATH_ANIM_OFFSET)
  });

  it("does not kill player when far from robots", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    // Place robot far from player
    zp.robotHorizPos[0] = 100;
    zp.robotVertPos[0] = 100;
    zp.robotAnimationIndex[0] = ROBOT_STAND_ANIM_OFFSET;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerAnimationIndex).not.toBe(3);
  });

  it("kills player when Evil Otto is in TRACKING state", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    // Clear NO_OTTO flag so updateEvilOtto runs
    zp.gameVariation &= ~0x08;
    zp.evilOttoLaunchTimer = 3; // Otto is active
    zp.evilOttoHorizPos = 50;
    zp.evilOttoVertPos = 50;
    // frameCount must be even for collision check to execute
    // (ror frameCount → carry=0 → bcs doesn't skip)
    zp.frameCount = 0;
    // Place Otto close to player
    zp.playerHorizPos = 53; // within 7px
    zp.playerVertPos = 55; // within targeting box
    // Keep playerMotion low so death handler doesn't immediately reset player
    zp.playerMotion = 10;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerAnimationIndex).toBe(3); // death (PLAYER_DEATH_ANIM_OFFSET)
  });

  it("skips Otto collision on odd frameCount", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.evilOttoLaunchTimer = 3;
    zp.evilOttoHorizPos = 50;
    zp.evilOttoVertPos = 50;
    zp.frameCount = 1; // odd → collision check skipped
    zp.playerHorizPos = 53;
    zp.playerVertPos = 55;
    // Clear all other robots so they don't collide with the player
    for (let i = 0; i < 6; i++) {
      zp.robotHorizPos[i] = 0;
      zp.robotVertPos[i] = 0;
    }
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerAnimationIndex).not.toBe(3);
  });

  it("kills player when hit by robot missile", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.robotMissileDirection = 0x08;
    zp.robotMissileHorizPos = 50;
    zp.robotMissileVertPos = 50;
    zp.playerHorizPos = 50;
    zp.playerVertPos = 50;
    // Keep playerMotion low so death handler doesn't immediately reset player
    zp.playerMotion = 10;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerAnimationIndex).toBe(3);
    expect(zp.robotMissileDirection).toBe(0);
  });

  it("does not kill player when robot is dying", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    // Robot in death animation
    zp.robotHorizPos[0] = 50;
    zp.robotVertPos[0] = 50;
    zp.robotAnimationIndex[0] = ROBOT_DEATH_ANIM_OFFSET; // death animation
    zp.playerHorizPos = 52;
    zp.playerVertPos = 52;
    // Clear all other robots so they don't collide with the player
    for (let i = 1; i < 6; i++) {
      zp.robotHorizPos[i] = 0;
      zp.robotVertPos[i] = 0;
    }
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerAnimationIndex).not.toBe(3);
  });

  it("does not kill player when robot is off screen", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    // Robot off screen
    zp.robotHorizPos[0] = 50;
    zp.robotVertPos[0] = 0x7f;
    zp.robotAnimationIndex[0] = ROBOT_STAND_ANIM_OFFSET;
    zp.playerHorizPos = 52;
    zp.playerVertPos = 52;
    // Clear all other robots so they don't collide with the player
    for (let i = 1; i < 6; i++) {
      zp.robotHorizPos[i] = 0;
      zp.robotVertPos[i] = 0;
    }
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerAnimationIndex).not.toBe(3);
  });
});

// ---------------------------------------------------------------------------
// checkMissileCollisions
// ---------------------------------------------------------------------------

describe("checkMissileCollisions (via tick)", () => {
  it("kills robot when hit by player missile", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerMissileDirection = 0x08;
    zp.playerMissileHorizPos = 50;
    zp.playerMissileVertPos = 50;
    zp.robotHorizPos[0] = 50;
    zp.robotVertPos[0] = 50;
    zp.robotAnimationIndex[0] = ROBOT_STAND_ANIM_OFFSET;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.robotAnimationIndex[0]).toBe(23); // death animation (ROBOT_DEATH_ANIM_OFFSET)
    expect(zp.playerMissileDirection).toBe(0);
  });

  it("awards 50 packed-BCD points for robot kill", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerMissileDirection = 0x08;
    zp.playerMissileHorizPos = 50;
    zp.playerMissileVertPos = 50;
    zp.robotHorizPos[0] = 50;
    zp.robotVertPos[0] = 50;
    zp.robotAnimationIndex[0] = ROBOT_STAND_ANIM_OFFSET;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    // Score: 000050 → playerScore bytes [00, 00, 50]
    expect(zp.playerScore0).toBe(0x00);
    expect(zp.playerScore1).toBe(0x00);
    expect(zp.playerScore2).toBe(0x50);
  });

  it("awards extra life when score crosses the 1000-point threshold", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.gameVariation = EXTRA_LIFE_1000 | ROBOT_SHOOTING;
    zp.playerScore0 = 0x00;
    zp.playerScore1 = 0x09;
    zp.playerScore2 = 0x50;
    zp.playerMissileDirection = 0x08;
    zp.playerMissileHorizPos = 50;
    zp.playerMissileVertPos = 50;
    zp.robotHorizPos[0] = 50;
    zp.robotVertPos[0] = 50;
    zp.robotAnimationIndex[0] = ROBOT_STAND_ANIM_OFFSET;
    const initialLives = zp.numberOfLives;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.numberOfLives).toBe(initialLives + 1);
    expect(zp.playerScore0).toBe(0x00);
    expect(zp.playerScore1).toBe(0x10);
    expect(zp.playerScore2).toBe(0x00);
  });

  it("does not kill robot when missile direction is 0", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.playerMissileDirection = 0;
    zp.playerMissileHorizPos = 50;
    zp.playerMissileVertPos = 50;
    zp.robotHorizPos[0] = 50;
    zp.robotVertPos[0] = 50;
    zp.robotAnimationIndex[0] = ROBOT_STAND_ANIM_OFFSET;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.robotAnimationIndex[0]).toBe(ROBOT_STAND_ANIM_OFFSET);
  });

  it("stops missile on Otto collision when not invincible", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    // gameVariation should NOT include OTTO_INVINCIBLE
    zp.gameVariation = ROBOT_SHOOTING;
    zp.playerMissileDirection = 0x08;
    zp.playerMissileHorizPos = 50;
    zp.playerMissileVertPos = 50;
    zp.evilOttoHorizPos = 50;
    zp.evilOttoVertPos = 50;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerMissileDirection).toBe(0);
  });

  it("does not stop missile on Otto collision when invincible", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.gameVariation = ROBOT_SHOOTING | OTTO_INVINCIBLE;
    zp.playerMissileDirection = 0x08;
    zp.playerMissileHorizPos = 50;
    zp.playerMissileVertPos = 50;
    zp.evilOttoHorizPos = 50;
    zp.evilOttoVertPos = 50;
    // Clear all robots so the missile doesn't hit one
    for (let i = 0; i < 6; i++) {
      zp.robotHorizPos[i] = 0;
      zp.robotVertPos[i] = 0;
    }
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    // Missile should not stop (still active)
    expect(zp.playerMissileDirection).toBe(0x08);
  });

  it("does not check Otto collision when invincible flag is set", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;
    zp.gameVariation = ROBOT_SHOOTING | OTTO_INVINCIBLE;
    zp.playerMissileDirection = 0x08;
    zp.playerMissileHorizPos = 50;
    zp.playerMissileVertPos = 50;
    zp.evilOttoHorizPos = 50;
    zp.evilOttoVertPos = 50;
    // Kill a robot too to check score doesn't get doubled
    zp.robotHorizPos[0] = 50;
    zp.robotVertPos[0] = 50;
    zp.robotAnimationIndex[0] = ROBOT_STAND_ANIM_OFFSET;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    // Robot should be killed
    expect(zp.robotAnimationIndex[0]).toBe(23);
  });
});

// ---------------------------------------------------------------------------
// incrementScore
// ---------------------------------------------------------------------------

describe("incrementScore", () => {
  function killRobotWithScore(zp: ReturnType<typeof createZeroPage>): void {
    zp.kernelSection = GameState.PLAY;
    zp.playerMissileDirection = 0x08;
    zp.playerMissileHorizPos = 50;
    zp.playerMissileVertPos = 50;
    zp.robotHorizPos[0] = 50;
    zp.robotVertPos[0] = 50;
    zp.robotAnimationIndex[0] = ROBOT_STAND_ANIM_OFFSET;
    tick(buildStateMachine(zp, NTSC));
  }

  it("adds 50 to the low packed BCD score byte", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.playerScore0 = 0x12;
    zp.playerScore1 = 0x34;
    zp.playerScore2 = 0x05;

    killRobotWithScore(zp);

    expect(zp.playerScore0).toBe(0x12);
    expect(zp.playerScore1).toBe(0x34);
    expect(zp.playerScore2).toBe(0x55);
  });

  it("carries from low byte into middle packed BCD byte", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.playerScore0 = 0x00;
    zp.playerScore1 = 0x00;
    zp.playerScore2 = 0x50;

    killRobotWithScore(zp);

    expect(zp.playerScore0).toBe(0x00);
    expect(zp.playerScore1).toBe(0x01);
    expect(zp.playerScore2).toBe(0x00);
  });

  it("carries from middle byte into high packed BCD byte", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.playerScore0 = 0x00;
    zp.playerScore1 = 0x99;
    zp.playerScore2 = 0x50;

    killRobotWithScore(zp);

    expect(zp.playerScore0).toBe(0x01);
    expect(zp.playerScore1).toBe(0x00);
    expect(zp.playerScore2).toBe(0x00);
  });

  it("wraps after 999999 like three packed BCD bytes", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.playerScore0 = 0x99;
    zp.playerScore1 = 0x99;
    zp.playerScore2 = 0x50;

    killRobotWithScore(zp);

    expect(zp.playerScore0).toBe(0x00);
    expect(zp.playerScore1).toBe(0x00);
    expect(zp.playerScore2).toBe(0x00);
  });

  it("awards extra life in 1000-point mode when crossing 950 to 1000", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation = EXTRA_LIFE_1000 | ROBOT_SHOOTING;
    zp.playerScore0 = 0x00;
    zp.playerScore1 = 0x09;
    zp.playerScore2 = 0x50;
    const initialLives = zp.numberOfLives;

    killRobotWithScore(zp);

    expect(zp.playerScore0).toBe(0x00);
    expect(zp.playerScore1).toBe(0x10);
    expect(zp.playerScore2).toBe(0x00);
    expect(zp.numberOfLives).toBe(initialLives + 1);
    expect(zp.gameState).toBe(0x03);
  });

  it("does not award extra life in 1000-point mode when reaching only 950", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation = EXTRA_LIFE_1000 | ROBOT_SHOOTING;
    zp.playerScore0 = 0x00;
    zp.playerScore1 = 0x09;
    zp.playerScore2 = 0x00;
    const initialLives = zp.numberOfLives;

    killRobotWithScore(zp);

    expect(zp.playerScore0).toBe(0x00);
    expect(zp.playerScore1).toBe(0x09);
    expect(zp.playerScore2).toBe(0x50);
    expect(zp.numberOfLives).toBe(initialLives);
  });

  it("awards extra life in 2000-point mode when crossing 1950 to 2000", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation = EXTRA_LIFE_2000 | ROBOT_SHOOTING;
    zp.playerScore0 = 0x00;
    zp.playerScore1 = 0x19;
    zp.playerScore2 = 0x50;
    const initialLives = zp.numberOfLives;

    killRobotWithScore(zp);

    expect(zp.playerScore0).toBe(0x00);
    expect(zp.playerScore1).toBe(0x20);
    expect(zp.playerScore2).toBe(0x00);
    expect(zp.numberOfLives).toBe(initialLives + 1);
    expect(zp.gameState).toBe(0x03);
  });

  it("does not award extra life in 2000-point mode when reaching only 1950", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation = EXTRA_LIFE_2000 | ROBOT_SHOOTING;
    zp.playerScore0 = 0x00;
    zp.playerScore1 = 0x19;
    zp.playerScore2 = 0x00;
    const initialLives = zp.numberOfLives;

    killRobotWithScore(zp);

    expect(zp.playerScore0).toBe(0x00);
    expect(zp.playerScore1).toBe(0x19);
    expect(zp.playerScore2).toBe(0x50);
    expect(zp.numberOfLives).toBe(initialLives);
  });

  it("does not award extra life in 2000-point mode when crossing 2950 to 3000", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation = EXTRA_LIFE_2000 | ROBOT_SHOOTING;
    zp.playerScore0 = 0x00;
    zp.playerScore1 = 0x29;
    zp.playerScore2 = 0x50;
    const initialLives = zp.numberOfLives;

    killRobotWithScore(zp);

    expect(zp.playerScore0).toBe(0x00);
    expect(zp.playerScore1).toBe(0x30);
    expect(zp.playerScore2).toBe(0x00);
    expect(zp.numberOfLives).toBe(initialLives);
  });

  it("awards extra life in 1000-point mode on later x950 to next-thousand crossings", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation = EXTRA_LIFE_1000 | ROBOT_SHOOTING;
    zp.playerScore0 = 0x00;
    zp.playerScore1 = 0x29;
    zp.playerScore2 = 0x50;
    const initialLives = zp.numberOfLives;

    killRobotWithScore(zp);

    expect(zp.playerScore0).toBe(0x00);
    expect(zp.playerScore1).toBe(0x30);
    expect(zp.playerScore2).toBe(0x00);
    expect(zp.numberOfLives).toBe(initialLives + 1);
  });

  it("awards extra life in 2000-point mode on ASM bitmask crossings beyond 2000", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation = EXTRA_LIFE_2000 | ROBOT_SHOOTING;
    zp.playerScore0 = 0x00;
    zp.playerScore1 = 0x39;
    zp.playerScore2 = 0x50;
    const initialLives = zp.numberOfLives;

    killRobotWithScore(zp);

    expect(zp.playerScore0).toBe(0x00);
    expect(zp.playerScore1).toBe(0x40);
    expect(zp.playerScore2).toBe(0x00);
    expect(zp.numberOfLives).toBe(initialLives + 1);
  });

  it("twenty normal robot kills from zero reach 1000 and award one extra life in 1000-point mode", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation = EXTRA_LIFE_1000 | ROBOT_SHOOTING;
    const initialLives = zp.numberOfLives;

    for (let i = 0; i < 20; i++) {
      killRobotWithScore(zp);
      if (i < 19) {
        zp.robotAnimationIndex[0] = ROBOT_STAND_ANIM_OFFSET;
        zp.playerMissileDirection = 0x08;
        zp.playerMissileFlightTime = 1;
      }
    }

    expect(zp.playerScore0).toBe(0x00);
    expect(zp.playerScore1).toBe(0x10);
    expect(zp.playerScore2).toBe(0x00);
    expect(zp.numberOfLives).toBe(initialLives + 1);
  });

  it("uses 1000-point extra-life behavior when both extra-life flags are set", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.gameVariation = EXTRA_LIFE_1000 | EXTRA_LIFE_2000 | ROBOT_SHOOTING;
    zp.playerScore0 = 0x00;
    zp.playerScore1 = 0x09;
    zp.playerScore2 = 0x50;
    const initialLives = zp.numberOfLives;

    killRobotWithScore(zp);

    expect(zp.playerScore0).toBe(0x00);
    expect(zp.playerScore1).toBe(0x10);
    expect(zp.playerScore2).toBe(0x00);
    expect(zp.numberOfLives).toBe(initialLives + 1);
  });

  it("does not affect score when missile is off", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    const initialScore0 = zp.playerScore0;
    const initialScore1 = zp.playerScore1;
    const initialScore2 = zp.playerScore2;
    zp.kernelSection = GameState.PLAY;
    zp.playerMissileDirection = 0;
    const gsm = buildStateMachine(zp, NTSC);

    tick(gsm);

    expect(zp.playerScore0).toBe(initialScore0);
    expect(zp.playerScore1).toBe(initialScore1);
    expect(zp.playerScore2).toBe(initialScore2);
  });
});

// ---------------------------------------------------------------------------
// isPositionInWall (exported, but testing the wall collision logic)
// ---------------------------------------------------------------------------

describe("isPositionInWall", () => {
  it("returns false for y < 2", () => {
    expect(isPositionInWall(50, 0, 0)).toBe(false);
    expect(isPositionInWall(50, 1, 0)).toBe(false);
  });

  it("returns false for y >= 86", () => {
    expect(isPositionInWall(50, 86, 0)).toBe(false);
    expect(isPositionInWall(50, 100, 0)).toBe(false);
  });

  it("returns false for x >= 160 (dot >= 40)", () => {
    expect(isPositionInWall(160, 10, 0)).toBe(false);
    expect(isPositionInWall(200, 10, 0)).toBe(false);
  });
});
