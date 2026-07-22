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

const zp = createZeroPage();
initGame(zp, 0, NTSC);
zp.kernelSection = GameState.PLAY;
zp.playerDirection = 0x01; // MOVE_RIGHT (not shooting)

console.log("Before tick:");
console.log("  playerAnimationIndex:", zp.playerAnimationIndex);
console.log("  playerMissileDirection:", zp.playerMissileDirection);
console.log("  playerDirection:", zp.playerDirection);
console.log("  playerHorizPos:", zp.playerHorizPos);
console.log("  playerVertPos:", zp.playerVertPos);
console.log("  playerMotion:", zp.playerMotion);
console.log("  gameVariation:", zp.gameVariation);
console.log("  NO_OTTO:", zp.gameVariation & 0x01);

const gsm = buildStateMachine(zp, NTSC);
const initialAnim = zp.playerAnimationIndex;

tick(gsm);

// Check what happened during tick
console.log("\nAfter tick:");
console.log("  playerAnimationIndex:", zp.playerAnimationIndex);
console.log("  playerAnimationIndex & 1:", zp.playerAnimationIndex & 1);
console.log("  initialAnim:", initialAnim);
console.log("  initialAnim & 1:", initialAnim & 1);
console.log("  playerMotion:", zp.playerMotion);
console.log("  playerHorizPos:", zp.playerHorizPos);
console.log("  frameCount:", gsm.frameCount);
console.log("  kernelSection:", zp.kernelSection);
