import { createZeroPage, initGame, tick, buildStateMachine, GameState, NTSC, ROBOT_STAND_ANIM_OFFSET } from "../game";

const zp = createZeroPage();
initGame(zp, 0, NTSC);
zp.kernelSection = GameState.PLAY;
zp.robotHorizPos[0] = 50;
zp.robotVertPos[0] = 50;
zp.robotAnimationIndex[0] = ROBOT_STAND_ANIM_OFFSET;
zp.playerHorizPos = 52;
zp.playerVertPos = 52;
const gsm = buildStateMachine(zp, NTSC);

console.log("Before tick:");
console.log("  playerAnimIndex:", zp.playerAnimationIndex);
console.log("  playerHorizPos:", zp.playerHorizPos);
console.log("  playerVertPos:", zp.playerVertPos);
console.log("  robotHorizPos[0]:", zp.robotHorizPos[0]);
console.log("  robotVertPos[0]:", zp.robotVertPos[0]);
console.log("  robotAnimIndex[0]:", zp.robotAnimationIndex[0]);
console.log("  frameCount:", zp.frameCount);
console.log("  playerDirection:", zp.playerDirection);

tick(gsm);

console.log("After tick:");
console.log("  playerAnimIndex:", zp.playerAnimationIndex);
console.log("  playerHorizPos:", zp.playerHorizPos);
console.log("  playerVertPos:", zp.playerVertPos);
console.log("  robotHorizPos[0]:", zp.robotHorizPos[0]);
console.log("  robotVertPos[0]:", zp.robotVertPos[0]);
console.log("  robotAnimIndex[0]:", zp.robotAnimationIndex[0]);
