import { createZeroPage } from "../tia/zeropage";
import { initGame, tick, GameStateMachine, GameState, NTSC } from "../game";

function buildStateMachine(zp: any, region: number): GameStateMachine {
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

// Test 1: Check if player motion matters
const zp = createZeroPage();
initGame(zp, 0, NTSC);
zp.kernelSection = GameState.PLAY;
zp.robotMissileDirection = 0x08;
zp.robotMissileHorizPos = 50;
zp.robotMissileVertPos = 50;
zp.playerHorizPos = 50;
zp.playerVertPos = 50;
zp.playerMotion = 50;  // Set playerMotion > 30

console.log("Before tick (playerMotion=50):");
console.log("  playerAnimationIndex:", zp.playerAnimationIndex);
console.log("  playerMotion:", zp.playerMotion);
console.log("  playerHorizPos:", zp.playerHorizPos);
console.log("  playerVertPos:", zp.playerVertPos);

const gsm = buildStateMachine(zp, NTSC);
tick(gsm);

console.log("\nAfter tick:");
console.log("  playerAnimationIndex:", zp.playerAnimationIndex);
console.log("  playerMotion:", zp.playerMotion);
console.log("  playerHorizPos:", zp.playerHorizPos);
console.log("  playerVertPos:", zp.playerVertPos);
console.log("  audioIndex:", zp.audioIndex);
console.log("  numberOfLives:", zp.numberOfLives);
