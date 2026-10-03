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
zp.robotMissileDirection = 0x08;
zp.robotMissileHorizPos = 50;
zp.robotMissileVertPos = 50;
zp.playerHorizPos = 50;
zp.playerVertPos = 50;

console.log("Before tick:");
console.log("  gameVariation:", zp.gameVariation, "(hex 0x" + zp.gameVariation.toString(16) + ")");
console.log("  robotMissileDirection:", zp.robotMissileDirection);
console.log("  robotMissileHorizPos:", zp.robotMissileHorizPos);
console.log("  robotMissileVertPos:", zp.robotMissileVertPos);
console.log("  playerHorizPos:", zp.playerHorizPos);
console.log("  playerVertPos:", zp.playerVertPos);
console.log("  playerAnimationIndex:", zp.playerAnimationIndex);
console.log("  robotMissileFlightTime:", zp.robotMissileFlightTime);

const gsm = buildStateMachine(zp, NTSC);

tick(gsm);

console.log("\nAfter tick:");
console.log("  robotMissileDirection:", zp.robotMissileDirection);
console.log("  robotMissileHorizPos:", zp.robotMissileHorizPos);
console.log("  robotMissileVertPos:", zp.robotMissileVertPos);
console.log("  robotMissileFlightTime:", zp.robotMissileFlightTime);
console.log("  playerAnimationIndex:", zp.playerAnimationIndex);
console.log("  audioIndex:", zp.audioIndex);
