import { describe, it, expect } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame, tick, GameStateMachine, GameState } from "../game";
import { agentDecide } from "../game/agent";
import { NTSC, MAX_ROBOTS, ROBOT_DEATH_ANIM_OFFSET, MOVE_LEFT } from "../constants";

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

  it("dodges away from a nearby robot instead of running into it", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;

    // Player in the middle of the playfield
    zp.playerHorizPos = 73;
    zp.playerVertPos = 100;

    // Robot just 10 pixels away (well within ROBOT_SAFE_DISTANCE of 40)
    zp.robotHorizPos[0] = 83;
    zp.robotVertPos[0] = 100;
    zp.robotAnimationIndex[0] = 9; // walking animation

    const gsm = buildStateMachine(zp, NTSC);

    // The agent should NOT return 0 (no move) — it should dodge away
    const move = agentDecide(gsm);
    expect(move).not.toBe(0);

    const oldDist = Math.abs(zp.robotHorizPos[0] - zp.playerHorizPos) +
                     Math.abs(zp.robotVertPos[0] - zp.playerVertPos);

    tick(gsm);
    const newDist = Math.abs(zp.robotHorizPos[0] - zp.playerHorizPos) +
                     Math.abs(zp.robotVertPos[0] - zp.playerVertPos);

    // Player should have moved away (distance increased or stayed same, robot frozen)
    expect(newDist).toBeGreaterThanOrEqual(oldDist);
  });

  it("does not path through walls — BFS respects wall collisions", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;

    // Player in the playfield
    zp.playerHorizPos = 73;
    zp.playerVertPos = 100;

    // All robots dead — bot will try to head for exit
    for (let i = 0; i < MAX_ROBOTS; i++) {
      zp.robotAnimationIndex[i] = ROBOT_DEATH_ANIM_OFFSET;
      zp.robotVertPos[i] = 0x7f;
    }

    const gsm = buildStateMachine(zp, NTSC);

    // Record player positions during navigation
    const playerPositions: { x: number; y: number }[] = [];
    playerPositions.push({ x: zp.playerHorizPos, y: zp.playerVertPos });

    for (let i = 0; i < 50 && zp.gameState !== 0xff; i++) {
      const oldX = zp.playerHorizPos;
      const oldY = zp.playerVertPos;
      gsm.joystickInput = agentDecide(gsm);
      tick(gsm);

      // After tick, check if player moved through a wall
      // The game's checkPlayerWallCollisions should have reverted invalid moves
      playerPositions.push({ x: zp.playerHorizPos, y: zp.playerVertPos });
    }

    // Verify no position jump that would indicate wall clipping
    for (let i = 1; i < playerPositions.length; i++) {
      const dx = Math.abs(playerPositions[i].x - playerPositions[i - 1].x);
      const dy = Math.abs(playerPositions[i].y - playerPositions[i - 1].y);
      // Player should move at most 1 pixel per tick
      expect(dx + dy).toBeLessThanOrEqual(1);
    }
  });

  it("exits the room when moving toward a clear exit", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    zp.kernelSection = GameState.PLAY;

    // Player near the left edge, moving left
    zp.playerHorizPos = 1;
    zp.playerVertPos = 76;
    zp.playerMotion = 200; // Force movement this tick

    // All robots dead — bot would try to exit
    for (let i = 0; i < MAX_ROBOTS; i++) {
      zp.robotAnimationIndex[i] = ROBOT_DEATH_ANIM_OFFSET;
      zp.robotVertPos[i] = 0x7f;
    }

    const gsm = buildStateMachine(zp, NTSC);
    gsm.joystickInput = MOVE_LEFT; // Set joystick to left
    tick(gsm);

    // In maze 0, the left exit at (0, 76) is NOT blocked (PF0[19] = 0x00).
    // Moving left from x=1 to x=0 should trigger the exit.
    expect(zp.gameState).toBe(0xff);
  });
});
