import { describe, it, expect } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { initGame, tick, processJoystickInput, GameStateMachine, GameState } from "../game";
import { NTSC } from "../constants";

function buildStateMachine(zp: ReturnType<typeof createZeroPage>, region: number): GameStateMachine {
  return { zp, region, joystickInput: 0, lastJoystickInput: 0, frameCount: 0, vblankCount: 0, overscanCount: 0, colorCycleIndex: 0 };
}

describe("trace player death", () => {
  it("should trace what kills the player — player kills a robot then dies", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    const state = buildStateMachine(zp, NTSC);

    zp.kernelSection = GameState.PLAY;
    zp.playerHorizPos = 73;
    zp.playerVertPos = 8;
    zp.playerMotion = 10;

    // Robot 0 is close enough to be killable by player missile
    zp.robotHorizPos[0] = 100;
    zp.robotVertPos[0] = 8;
    zp.robotAnimationIndex[0] = 0;
    for (let i = 1; i < 6; i++) {
      zp.robotHorizPos[i] = 142;
      zp.robotVertPos[i] = 76;
      zp.robotAnimationIndex[i] = 0;
    }

    console.log("=== Initial state ===");
    console.log("playerPos:", zp.playerHorizPos, zp.playerVertPos);
    console.log("robot0:", zp.robotHorizPos[0], zp.robotVertPos[0]);
    console.log("gameVariation:", zp.gameVariation.toString(16));

    let died = false;
    let deathTick = 0;
    for (let tickNum = 1; tickNum <= 300; tickNum++) {
      // Player shoots right toward robot 0
      processJoystickInput(state, 2); // MOVE_RIGHT
      tick(state);

      const nowDead = zp.playerAnimationIndex === 3;
      if (nowDead && !died) {
        console.log("\n=== PLAYER DIED at tick", tickNum, "===");
        console.log("playerPos:", zp.playerHorizPos, zp.playerVertPos);
        console.log("robot0:", zp.robotHorizPos[0], zp.robotVertPos[0], "anim:", zp.robotAnimationIndex[0]);
        console.log("robotMissileDir:", zp.robotMissileDirection);
        console.log("robotMissilePos:", zp.robotMissileHorizPos, zp.robotMissileVertPos);
        console.log("robotMissileFlightTime:", zp.robotMissileFlightTime);
        console.log("evilOttoPos:", zp.evilOttoHorizPos, zp.evilOttoVertPos);
        console.log("evilOttoTimer:", zp.evilOttoLaunchTimer);
        console.log("kernelSection:", zp.kernelSection);
        console.log("initRobotDelay:", zp.initRobotDelay);
        console.log("numberOfLives:", zp.numberOfLives);
        console.log("robot1:", zp.robotHorizPos[1], zp.robotVertPos[1]);
        console.log("frameCount:", zp.frameCount);
        died = true;
        deathTick = tickNum;
        break;
      }
    }

    // If player never died, log that fact
    if (!died) {
      console.log("\n=== PLAYER SURVIVED all 300 ticks ===");
      console.log("robot0:", zp.robotHorizPos[0], zp.robotVertPos[0], "anim:", zp.robotAnimationIndex[0]);
      console.log("initRobotDelay:", zp.initRobotDelay);
    }
    // Just log — don't assert
    expect(true).toBe(true);
  });

  it("should trace what kills the player — robot moves toward player", () => {
    const zp = createZeroPage();
    initGame(zp, 0, NTSC);
    const state = buildStateMachine(zp, NTSC);

    zp.kernelSection = GameState.PLAY;
    zp.playerHorizPos = 73;
    zp.playerVertPos = 8;
    zp.playerMotion = 10;

    // Robot 0 is close and will move toward player
    zp.robotHorizPos[0] = 80;
    zp.robotVertPos[0] = 8;
    zp.robotAnimationIndex[0] = 0;
    for (let i = 1; i < 6; i++) {
      zp.robotHorizPos[i] = 142;
      zp.robotVertPos[i] = 76;
      zp.robotAnimationIndex[i] = 0;
    }

    console.log("=== Initial state ===");
    console.log("playerPos:", zp.playerHorizPos, zp.playerVertPos);
    console.log("robot0:", zp.robotHorizPos[0], zp.robotVertPos[0]);
    console.log("gameVariation:", zp.gameVariation.toString(16));

    let died = false;
    let deathTick = 0;
    for (let tickNum = 1; tickNum <= 500; tickNum++) {
      processJoystickInput(state, 0); // no input
      tick(state);

      const nowDead = zp.playerAnimationIndex === 3;
      if (nowDead && !died) {
        console.log("\n=== PLAYER DIED at tick", tickNum, "===");
        console.log("playerPos:", zp.playerHorizPos, zp.playerVertPos);
        console.log("robot0:", zp.robotHorizPos[0], zp.robotVertPos[0], "anim:", zp.robotAnimationIndex[0]);
        console.log("robotMissileDir:", zp.robotMissileDirection);
        console.log("robotMissilePos:", zp.robotMissileHorizPos, zp.robotMissileVertPos);
        console.log("robotMissileFlightTime:", zp.robotMissileFlightTime);
        console.log("evilOttoPos:", zp.evilOttoHorizPos, zp.evilOttoVertPos);
        console.log("evilOttoTimer:", zp.evilOttoLaunchTimer);
        console.log("kernelSection:", zp.kernelSection);
        console.log("initRobotDelay:", zp.initRobotDelay);
        console.log("numberOfLives:", zp.numberOfLives);
        console.log("frameCount:", zp.frameCount);
        died = true;
        deathTick = tickNum;
        break;
      }
    }

    if (!died) {
      console.log("\n=== PLAYER SURVIVED all 500 ticks ===");
      console.log("robot0:", zp.robotHorizPos[0], zp.robotVertPos[0], "anim:", zp.robotAnimationIndex[0]);
      console.log("initRobotDelay:", zp.initRobotDelay);
    }
    expect(true).toBe(true);
  });
});
