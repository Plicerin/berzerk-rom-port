import { createZeroPage } from './src/tia/zeropage';
import { initGame, tick } from './src/game/index';
import { ROBOT_SHOOTING_RIGHT } from './src/constants';

const zp = createZeroPage();
initGame(zp, 0, 0);
for (let i = 0; i < 6; i++) {
  zp.robotHorizPos[i] = 0;
  zp.robotVertPos[i] = 0;
}

console.log('After init: missileDir=' + zp.playerMissileDirection);
console.log('zp id: ' + (zp as any).__id__);

const state = {
  zp,
  region: 0,
  joystickInput: 0x18,
  lastJoystickInput: 0,
  frameCount: 0,
  vblankCount: 0,
  overscanCount: 0,
  colorCycleIndex: 0,
};

console.log('Before tick: missileDir=' + zp.playerMissileDirection);
tick(state);
console.log('After tick: missileDir=' + zp.playerMissileDirection);

// Now test with 0x12 (fire + right, where right=8)
const zp2 = createZeroPage();
initGame(zp2, 0, 0);
for (let i = 0; i < 6; i++) {
  zp2.robotHorizPos[i] = 0;
  zp2.robotVertPos[i] = 0;
}
const state2 = {
  zp: zp2,
  region: 0,
  joystickInput: 0x12,
  lastJoystickInput: 0,
  frameCount: 0,
  vblankCount: 0,
  overscanCount: 0,
  colorCycleIndex: 0,
};
tick(state2);
console.log('With 0x12: missileDir=' + zp2.playerMissileDirection);
