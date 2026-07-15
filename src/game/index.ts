// =============================================================================
// Core Game Logic
// Ported from: Berzerk (decomp).asm
// Original: Atari 1984, Programmer: Dan Hitchens
// Decomp: Dennis Debro
//
// This module implements the game state machine and logic, mirroring the ASM
// main loop structure: VBLANK → attract/color cycling → robot init → robot AI
// → Evil Otto → player/missiles → score → game state transitions.
//
// All game state lives in a ZeroPage object (the "game memory").
// =============================================================================

import {
  createZeroPage,
  ZeroPage,
} from "../tia/zeropage";
import {
  H_KERNEL,
  H_PLAYER,
  H_ROBOT,
  ONE_COPY,
  TWO_COPIES,
  THREE_COPIES,
  QUAD_SIZE,
  VERTICAL_DELAY,
  NO_REFLECT,
  REFLECT,
  MOVE_RIGHT,
  MOVE_LEFT,
  MOVE_DOWN,
  MOVE_UP,
  NO_MOVE,
  BW_MASK,
  SELECT_MASK,
  RESET_MASK,
  NTSC,
  PAL,
  INIT_NUM_LIVES,
  SHOOTING_ROBOT_SCORE,
  MAX_ROBOTS,
  ROBOT_STAND_ANIM_OFFSET,
  ROBOT_LEFT_ANIM_OFFSET,
  ROBOT_RIGHT_ANIM_OFFSET,
  ROBOT_UP_ANIM_OFFSET,
  ROBOT_DOWN_ANIM_OFFSET,
  ROBOT_DEATH_ANIM_OFFSET,
  PLAYER_STAND_ANIM_OFFSET,
  PLAYER_RUN_ANIM_OFFSET,
  PLAYER_DEATH_ANIM_OFFSET,
  EXTRA_LIFE_2000,
  EXTRA_LIFE_1000,
  OTTO_INVINCIBLE,
  OTTO_REBOUND,
  NO_OTTO,
  ROBOT_SHOOTING,
  PLAYER_ENTERING_NORTH,
  PLAYER_ENTERING_SOUTH,
  PLAYER_ENTERING_EAST,
  PLAYER_ENTERING_WEST,
  ROBOT_SHOOTING_RIGHT,
  ROBOT_SHOOTING_LEFT,
  ROBOT_SHOOTING_DOWN,
  ROBOT_SHOOTING_UP,
  XROBOT_MISSILE_BOX,
  YROBOT_MISSILE_BOX,
  XMIN,
  XMAX,
  XMAX_PLAYER,
  YMIN,
  ROBOT_MOVE_DELAY_NTSC,
  ROBOT_MOVE_DELAY_PAL,
  getFractionalDelay,
  getRobotMoveDelay,
  getRobotMissileDelay,
  getVBlankTime,
  getOverscanTime,
} from "../constants/index";
import {
  RobotMotionDelayTable,
  RobotMissileDelayTable,
  PlayerHorizAnimationTable,
  PlayerShootingAnimationTable,
  VerticalPixelOffsets,
  HorizontalPixelOffsets,
  RobotColorTable,
  PlayerColorTable,
  InitMissileYOffsetTable,
  InitMissileXOffsetTable,
  RobotAnimationTable,
  RobotSpriteData,
  PlayerSpriteData,
  EvilOttoSpriteData,
  MissileVerticalLimitsTable,
  InitRobotMissileYOffset,
  InitRobotMissileXOffset,
  GameVariationTable,
  InitHorizontalPosition,
  InitVerticalPosition,
} from "../data/tables";

// -----------------------------------------------------------------------------
// Game state constants
// -----------------------------------------------------------------------------

export const GameState = {
  VBLANK: 0,
  ATTRACT: 1,
  COLOR_CYCLING: 2,
  ROBOT_INIT: 3,
  ROBOT_AI: 4,
  OTTO: 5,
  PLAYER: 6,
  MISSILE: 7,
  SCORE: 8,
  RENDER: 9,
  OVERSCAN: 10,
  GAME_OVER: 11,
  TEXT_DISPLAY: 12,
} as const;

// Player animation states
export const PlayerAnimState = {
  STANDING: 0,
  RUNNING: 1,
  SHOOTING: 2,
  DYING: 3,
  EXITING: 4,
} as const;

// Otto states
export const OttoState = {
  NOT_LAUNCHED: 0,
  LAUNCHING: 1,
  BOUNCING: 2,
  TRACKING: 3,
} as const;

// Robot states
export const RobotState = {
  STANDING: 0,
  WALKING_LEFT: 1,
  WALKING_RIGHT: 2,
  WALKING_UP: 3,
  WALKING_DOWN: 4,
  DYING: 5,
} as const;

// -----------------------------------------------------------------------------
// Random number generator (matches Atari 2600 RNG pattern)
// -----------------------------------------------------------------------------

export function nextRandom(zp: ZeroPage): number {
  const newRandom = (zp.randomHi << 1) | (zp.randomLo >> 7);
  if (zp.randomLo & 0x40) {
    zp.randomHi = zp.randomHi ^ 0x1d;
  }
  zp.randomHi = (zp.randomHi & 0x7f) | ((zp.randomLo & 0x80) ? 0x80 : 0);
  zp.randomLo = (zp.randomLo << 1) & 0xff;
  return zp.randomHi;
}

// -----------------------------------------------------------------------------
// Initialize game state from variation selection
// -----------------------------------------------------------------------------

export function initGame(zp: ZeroPage, gameSelection: number, region: number): void {
  zp.gameVariation = GameVariationTable[Math.min(gameSelection, 13)] ?? 0x49;
  zp.randomLo = 0x69;
  zp.randomHi = 0x9c;
  zp.numberOfLives = INIT_NUM_LIVES;
  zp.numberRobotsKilled = 0;
  zp.gameLevel = 0;
  zp.playerScore0 = 0;
  zp.playerScore1 = 0;
  zp.playerScore2 = 0;
  zp.evilOttoLaunchTimer = 0;
  zp.evilOttoHorizPos = 0;
  zp.evilOttoVertPos = 0;
  zp.prevEvilOttoVertPos = 0;
  zp.ottoVerticalDelta = 0;
  zp.initRobotDelay = 0;
  zp.kernelSection = GameState.VBLANK;
  zp.colorEOR = 0;
  zp.selectDebounce = 0;
  zp.attractModeTimer = 0;
  zp.robotMotionDelay = 0;
  zp.robotMissileDirection = 0;
  zp.robotMissileFlightTime = 0;
  zp.robotMissileHorizPos = 0;
  zp.robotMissileVertPos = 0;

  // Initialize robots to standing positions
  for (let i = 0; i < MAX_ROBOTS; i++) {
    zp.robotFineHoriz[i] = 0;
    zp.robotCoarseHoriz[i] = 73;
    zp.robotVertPos[i] = 142;
    zp.robotHorizPos[i] = 73;
    zp.robotAnimationIndex[i] = 0;
    zp.robotPointers[i] = 0;
  }

  // Initialize player
  zp.playerVertPos = 142;
  zp.playerHorizPos = 73;
  zp.playerDirection = 0;
  zp.playerAnimationIndex = 0;
  zp.playerMotion = 0;
  zp.playerMissileDirection = 0;
  zp.playerMissileFlightTime = 0;
  zp.playerMissileHorizPos = 0;
  zp.playerMissileVertPos = 0;
}

// -----------------------------------------------------------------------------
// Robot helper functions
// -----------------------------------------------------------------------------

function getRobotColor(robotIndex: number, region: number): number {
  const colorTable = RobotColorTable;
  return colorTable[robotIndex % colorTable.length];
}

function getRobotMoveDelayValue(zp: ZeroPage, robotIndex: number, region: number): number {
  const delayTable = region === PAL ? ROBOT_MOVE_DELAY_PAL : ROBOT_MOVE_DELAY_NTSC;
  return delayTable[robotIndex % delayTable.length];
}

/**
 * Update robot animation index based on direction.
 * Returns the animation table index for the robot's current direction.
 */
export function updateRobotAnimation(zp: ZeroPage, robotIndex: number, direction: number, region: number): void {
  if (zp.robotAnimationIndex[robotIndex] === ROBOT_DEATH_ANIM_OFFSET) {
    return; // don't update dying robots
  }

  // Direction index maps to RobotAnimationTable index (0=stand, 1=left, 2=right, 3=up, 4=down)
  let dirIndex: number;
  switch (direction) {
    case 0: // standing
      dirIndex = 0;
      break;
    case 1: // walking left
      dirIndex = 1;
      break;
    case 2: // walking right
      dirIndex = 2;
      break;
    case 3: // walking up
      dirIndex = 3;
      break;
    case 4: // walking down
      dirIndex = 4;
      break;
    default:
      dirIndex = 0;
      break;
  }

  const table = RobotAnimationTable[dirIndex];
  if (!table) {
    zp.robotAnimationIndex[robotIndex] = ROBOT_STAND_ANIM_OFFSET;
    return;
  }

  // Map direction index back to its offset for animation index calculation
  const offsets = [ROBOT_STAND_ANIM_OFFSET, ROBOT_LEFT_ANIM_OFFSET, ROBOT_RIGHT_ANIM_OFFSET, ROBOT_UP_ANIM_OFFSET, ROBOT_DOWN_ANIM_OFFSET];
  const animOffset = offsets[dirIndex];

  zp.loopCount = table[zp.robotAnimationIndex[robotIndex] - (animOffset === ROBOT_STAND_ANIM_OFFSET ? 0 : table.length - 1)];
  // Simplified: cycle through animation frames
  const currentAnimOffset = zp.robotAnimationIndex[robotIndex] - animOffset;
  const nextFrame = (currentAnimOffset + 1) % table.length;
  zp.robotAnimationIndex[robotIndex] = animOffset + nextFrame;
}

/**
 * Move a robot horizontally by one HMOVE step.
 * Uses fine horizontal position and pixel offset tables.
 */
function moveRobotHorizontally(zp: ZeroPage, robotIndex: number): void {
  const finePos = zp.robotFineHoriz[robotIndex];
  const pixelOffset = HorizontalPixelOffsets[finePos & 0x0f];

  zp.robotCoarseHoriz[robotIndex] += pixelOffset;

  // Update fine position for next HMOVE
  zp.robotFineHoriz[robotIndex] = (finePos + 1) & 0x0f;
}

/**
 * Move a robot vertically.
 */
function moveRobotVertically(zp: ZeroPage, robotIndex: number, delta: number): void {
  zp.robotVertPos[robotIndex] += delta;

  // Clamp to valid range
  if (zp.robotVertPos[robotIndex] < YMIN) {
    zp.robotVertPos[robotIndex] = YMIN;
  }
  if (zp.robotVertPos[robotIndex] > 159) {
    zp.robotVertPos[robotIndex] = 159;
  }
}

// -----------------------------------------------------------------------------
// Robot AI: determine movement direction based on player position
// -----------------------------------------------------------------------------

export function determineRobotDirection(zp: ZeroPage, robotIndex: number): number {
  const robotX = zp.robotHorizPos[robotIndex];
  const robotY = zp.robotVertPos[robotIndex];
  const playerX = zp.playerHorizPos;
  const playerY = zp.playerVertPos;

  const dx = playerX - robotX;
  const dy = playerY - robotY;

  // If robot and player are at the same position, stand still
  if (dx === 0 && dy === 0) {
    return 0;
  }

  // Simple AI: move toward player (prefer horizontal when tied)
  if (Math.abs(dx) >= Math.abs(dy)) {
    // Move horizontally
    if (dx > 0) {
      return 2; // walking right
    } else {
      return 1; // walking left
    }
  } else {
    // Move vertically
    if (dy > 0) {
      return 4; // walking down
    } else {
      return 3; // walking up
    }
  }
}

/**
 * Update robot AI for all active robots.
 * Robots are active when initRobotDelay reaches 255.
 */
export function updateRobots(zp: ZeroPage, region: number): void {
  // Check if robots should be initialized
  if (zp.initRobotDelay < 255) {
    zp.initRobotDelay++;
    return;
  }
  // First frame after init: trigger immediate movement
  if (zp.robotMotionDelay === 0) {
    zp.robotMotionDelay = RobotMotionDelayTable[0] - 1;
  }

  // Robot motion delay (fractional timing)
  zp.robotMotionDelay++;
  if (zp.robotMotionDelay < RobotMotionDelayTable[0]) {
    return;
  }
  zp.robotMotionDelay = 0;

  // Update each robot
  for (let i = 0; i < MAX_ROBOTS; i++) {
    // Skip dying robots
    if (zp.robotAnimationIndex[i] === ROBOT_DEATH_ANIM_OFFSET) {
      continue;
    }

    const direction = determineRobotDirection(zp, i);
    updateRobotAnimation(zp, i, direction, region);

    // Move robot based on direction
    switch (direction) {
      case 1: // walking left
        zp.robotHorizPos[i] -= 1;
        moveRobotHorizontally(zp, i);
        break;
      case 2: // walking right
        zp.robotHorizPos[i] += 1;
        moveRobotHorizontally(zp, i);
        break;
      case 3: // walking up
        zp.robotVertPos[i] -= 1;
        break;
      case 4: // walking down
        zp.robotVertPos[i] += 1;
        break;
    }

    // Clamp robot position
    if (zp.robotHorizPos[i] < XMIN) zp.robotHorizPos[i] = XMIN;
    if (zp.robotHorizPos[i] > XMAX) zp.robotHorizPos[i] = XMAX;
  }
}

// -----------------------------------------------------------------------------
// Robot shooting logic
// -----------------------------------------------------------------------------

function robotShoot(zp: ZeroPage, robotIndex: number, region: number): void {
  if (!(zp.gameVariation & ROBOT_SHOOTING)) {
    return;
  }

  const direction = determineRobotDirection(zp, robotIndex);
  if (direction === RobotState.STANDING) {
    return;
  }

  // Check if robot should fire (random chance)
  nextRandom(zp);
  if (zp.randomHi > 0x20) {
    return;
  }

  // Check missile delay
  if (zp.robotMissileDirection !== 0) {
    return; // robot already has a missile in flight
  }

  // Check missile delay timer
  zp.robotMissileDelay++;
  const missileDelay = getRobotMissileDelay(region);
  if (zp.robotMissileDelay < missileDelay[robotIndex % missileDelay.length]) {
    return;
  }
  zp.robotMissileDelay = 0;

  // Launch missile
  zp.robotMissileDirection = direction;
  zp.robotMissileFlightTime = 0;

  // Set missile starting position
  const yOffset = InitRobotMissileYOffset[direction];
  const xOffset = InitRobotMissileXOffset[direction];
  zp.robotMissileVertPos = zp.robotVertPos[robotIndex] + yOffset;
  zp.robotMissileHorizPos = zp.robotHorizPos[robotIndex] + xOffset;
}

/**
 * Update robot missile.
 */
function updateRobotMissile(zp: ZeroPage): void {
  if (zp.robotMissileDirection === 0) {
    return;
  }

  zp.robotMissileFlightTime++;

  // Check flight time limit
  if (zp.robotMissileFlightTime > 100) {
    zp.robotMissileDirection = 0;
    return;
  }

  // Move missile based on direction
  switch (zp.robotMissileDirection) {
    case ROBOT_SHOOTING_RIGHT:
      zp.robotMissileHorizPos += 2;
      break;
    case ROBOT_SHOOTING_LEFT:
      zp.robotMissileHorizPos -= 2;
      break;
    case ROBOT_SHOOTING_DOWN:
      zp.robotMissileVertPos += 2;
      break;
    case ROBOT_SHOOTING_UP:
      zp.robotMissileVertPos -= 2;
      break;
  }

  // Check bounds
  if (zp.robotMissileHorizPos < XMIN || zp.robotMissileHorizPos > XMAX) {
    zp.robotMissileDirection = 0;
  }
  if (zp.robotMissileVertPos < YMIN || zp.robotMissileVertPos > 159) {
    zp.robotMissileDirection = 0;
  }
}

// -----------------------------------------------------------------------------
// Evil Otto logic
// -----------------------------------------------------------------------------

function updateEvilOtto(zp: ZeroPage, region: number): void {
  // Skip if NO_OTTO flag is set
  if (zp.gameVariation & NO_OTTO) {
    return;
  }

  // Otto launch timer
  if (zp.evilOttoLaunchTimer === 0) {
    // Start launch timer (~12 seconds = 720 frames at 60fps)
    zp.evilOttoLaunchTimer = 200;
    return;
  }

  zp.evilOttoLaunchTimer--;

  if (zp.evilOttoLaunchTimer > 0) {
    return; // Otto not yet launched
  }

  // Otto is active
  switch (zp.kernelSection) {
    case OttoState.NOT_LAUNCHED:
      // Check if Otto should start
      if (zp.evilOttoLaunchTimer === 0) {
        zp.kernelSection = OttoState.LAUNCHING;
        zp.evilOttoVertPos = 0;
        zp.evilOttoHorizPos = 0;
        zp.ottoVerticalDelta = 1;
      }
      break;

    case OttoState.LAUNCHING:
      // Move Otto down from top
      zp.evilOttoVertPos += zp.ottoVerticalDelta;
      if (zp.evilOttoVertPos >= 60) {
        zp.kernelSection = OttoState.BOUNCING;
        zp.ottoVerticalDelta = 1;
      }
      break;

    case OttoState.BOUNCING:
      // Otto bounces vertically
      zp.evilOttoVertPos += zp.ottoVerticalDelta;

      // Bounce off top/bottom
      if (zp.evilOttoVertPos <= 40) {
        zp.ottoVerticalDelta = 1;
      }
      if (zp.evilOttoVertPos >= 120) {
        zp.ottoVerticalDelta = -1;
      }

      // Check if Otto has reached player's Y level
      if (Math.abs(zp.evilOttoVertPos - zp.playerVertPos) < 10) {
        zp.kernelSection = OttoState.TRACKING;
      }
      break;

    case OttoState.TRACKING:
      // Otto tracks player horizontally
      zp.prevEvilOttoVertPos = zp.evilOttoVertPos;

      if (zp.evilOttoHorizPos < zp.playerHorizPos) {
        zp.evilOttoHorizPos += 1;
      } else if (zp.evilOttoHorizPos > zp.playerHorizPos) {
        zp.evilOttoHorizPos -= 1;
      }

      // Move vertically toward player
      if (zp.evilOttoVertPos < zp.playerVertPos) {
        zp.evilOttoVertPos += 1;
      } else if (zp.evilOttoVertPos > zp.playerVertPos) {
        zp.evilOttoVertPos -= 1;
      }
      break;
  }
}

// -----------------------------------------------------------------------------
// Player logic
// -----------------------------------------------------------------------------

function updatePlayer(zp: ZeroPage, region: number): void {
  // Skip if player is dying or exiting
  if (
    zp.playerAnimationIndex === PLAYER_DEATH_ANIM_OFFSET ||
    zp.playerAnimationIndex === PlayerAnimState.EXITING
  ) {
    return;
  }

  // Determine player animation state
  const isShooting = zp.playerMissileDirection !== 0;
  const isMoving =
    (zp.playerDirection & (MOVE_UP | MOVE_DOWN | MOVE_LEFT | MOVE_RIGHT)) !== 0;

  // Update player animation
  if (isShooting) {
    // Shooting animation based on direction
    let shootAnimIndex: number;
    switch (zp.playerDirection & 0x0f) {
      case MOVE_UP:
        shootAnimIndex = 2; // fire up
        break;
      case MOVE_DOWN:
        shootAnimIndex = 3; // fire down
        break;
      default:
        shootAnimIndex = 0; // fire horizontal
        break;
    }
    zp.playerAnimationIndex = PlayerShootingAnimationTable[shootAnimIndex] ?? 0;
  } else if (isMoving) {
    zp.playerAnimationIndex = PLAYER_RUN_ANIM_OFFSET;
  } else {
    zp.playerAnimationIndex = PLAYER_STAND_ANIM_OFFSET;
  }

  // Player movement (fractional delay)
  const fractionalDelay = getFractionalDelay(region);
  zp.playerMotion++;

  if (zp.playerMotion >= fractionalDelay) {
    zp.playerMotion = 0;

    // Horizontal movement
    if (zp.playerDirection & MOVE_RIGHT) {
      zp.playerHorizPos += 1;
      if (zp.playerHorizPos > XMAX_PLAYER) {
        zp.playerHorizPos = XMAX_PLAYER;
      }
    }
    if (zp.playerDirection & MOVE_LEFT) {
      zp.playerHorizPos -= 1;
      if (zp.playerHorizPos < XMIN) {
        zp.playerHorizPos = XMIN;
      }
    }

    // Vertical movement
    if (zp.playerDirection & MOVE_DOWN) {
      zp.playerVertPos += 1;
      if (zp.playerVertPos > 159) {
        zp.playerVertPos = 159;
      }
    }
    if (zp.playerDirection & MOVE_UP) {
      zp.playerVertPos -= 1;
      if (zp.playerVertPos < YMIN) {
        zp.playerVertPos = YMIN;
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Player missile logic
// -----------------------------------------------------------------------------

function firePlayerMissile(zp: ZeroPage, joystickInput: number): void {
  console.log('[firePM] entry missileDir=' + zp.playerMissileDirection + ' ji=' + joystickInput);
  if (zp.playerMissileDirection !== 0) {
    console.log('[firePM] returning early - already firing');
    return; // already firing
  }

  // Determine direction from joystick
  let direction = 0;
  if (joystickInput & MOVE_UP) {
    direction = ROBOT_SHOOTING_UP;
  } else if (joystickInput & MOVE_DOWN) {
    direction = ROBOT_SHOOTING_DOWN;
  } else if (joystickInput & MOVE_RIGHT) {
    direction = ROBOT_SHOOTING_RIGHT;
  } else if (joystickInput & MOVE_LEFT) {
    direction = ROBOT_SHOOTING_LEFT;
  }

  console.log('[firePM] direction=' + direction);
  if (direction === 0) {
    console.log('[firePM] returning - no direction');
    return;
  }

  console.log('[firePM] about to set missileDir=' + direction);
  zp.playerMissileDirection = direction;
  console.log('[firePM] set missileDir=' + zp.playerMissileDirection);
  zp.playerMissileFlightTime = 0;

  // Set missile starting position based on direction
  const yIndex = direction;
  const xIndex = direction;
  zp.playerMissileVertPos = zp.playerVertPos + InitMissileYOffsetTable[yIndex];
  zp.playerMissileHorizPos = zp.playerHorizPos + InitMissileXOffsetTable[xIndex];
}

function updatePlayerMissile(zp: ZeroPage): void {
  if (zp.playerMissileDirection === 0) {
    return;
  }

  zp.playerMissileFlightTime++;

  // Check flight time limit
  if (zp.playerMissileFlightTime > 50) {
    zp.playerMissileDirection = 0;
    return;
  }

  // Move missile based on direction
  switch (zp.playerMissileDirection) {
    case ROBOT_SHOOTING_RIGHT:
      zp.playerMissileHorizPos += 3;
      break;
    case ROBOT_SHOOTING_LEFT:
      zp.playerMissileHorizPos -= 3;
      break;
    case ROBOT_SHOOTING_DOWN:
      zp.playerMissileVertPos += 3;
      break;
    case ROBOT_SHOOTING_UP:
      zp.playerMissileVertPos -= 3;
      break;
  }

  // Check bounds
  if (zp.playerMissileHorizPos < XMIN || zp.playerMissileHorizPos > XMAX) {
    zp.playerMissileDirection = 0;
  }
  if (zp.playerMissileVertPos < YMIN || zp.playerMissileVertPos > 159) {
    zp.playerMissileDirection = 0;
  }
}

// -----------------------------------------------------------------------------
// Collision detection
// -----------------------------------------------------------------------------

function checkPlayerCollisions(zp: ZeroPage): void {
  // Check player vs playfield (PF0/PF1/PF2)
  // In the real Atari, this is handled by TIA hardware (COLP0, COLPF1, COLPF2)
  // For the JS port, we approximate with position checks

  // Check player vs robots
  for (let i = 0; i < MAX_ROBOTS; i++) {
    if (zp.robotAnimationIndex[i] === ROBOT_DEATH_ANIM_OFFSET) {
      continue; // dead robots don't collide
    }

    const dx = Math.abs(zp.playerHorizPos - zp.robotHorizPos[i]);
    const dy = Math.abs(zp.playerVertPos - zp.robotVertPos[i]);

    if (dx < H_ROBOT && dy < H_PLAYER) {
      // Player hit by robot
      zp.playerAnimationIndex = PLAYER_DEATH_ANIM_OFFSET;
    }
  }

  // Check player vs Evil Otto
  if (zp.evilOttoVertPos > 0) {
    const dx = Math.abs(zp.playerHorizPos - zp.evilOttoHorizPos);
    const dy = Math.abs(zp.playerVertPos - zp.evilOttoVertPos);

    if (dx < H_ROBOT && dy < H_PLAYER) {
      // Player hit by Otto
      zp.playerAnimationIndex = PLAYER_DEATH_ANIM_OFFSET;
    }
  }

  // Check player vs robot missile
  if (zp.robotMissileDirection !== 0) {
    const dx = Math.abs(zp.playerHorizPos - zp.robotMissileHorizPos);
    const dy = Math.abs(zp.playerVertPos - zp.robotMissileVertPos);

    if (dx < H_PLAYER && dy < H_PLAYER) {
      zp.playerMissileDirection = 0;
      zp.robotMissileDirection = 0;
      zp.playerAnimationIndex = PLAYER_DEATH_ANIM_OFFSET;
    }
  }
}

function checkMissileCollisions(zp: ZeroPage): void {
  console.log('[checkMissile] missileDir=' + zp.playerMissileDirection + ' pos=(' + zp.playerMissileHorizPos + ',' + zp.playerMissileVertPos + ')');
  // Check player missile vs robots
  if (zp.playerMissileDirection !== 0) {
    for (let i = 0; i < MAX_ROBOTS; i++) {
      if (zp.robotAnimationIndex[i] === ROBOT_DEATH_ANIM_OFFSET) {
        continue;
      }
      const dx = Math.abs(zp.playerMissileHorizPos - zp.robotHorizPos[i]);
      const dy = Math.abs(zp.playerMissileVertPos - zp.robotVertPos[i]);
      console.log('[checkMissile] robot[' + i + '] pos=(' + zp.robotHorizPos[i] + ',' + zp.robotVertPos[i] + ') dx=' + dx + ' dy=' + dy);

      if (dx < H_ROBOT && dy < H_PLAYER) {
        // Robot killed by player missile
        console.log('[checkMissile] ROBOT KILLED');
        zp.robotAnimationIndex[i] = ROBOT_DEATH_ANIM_OFFSET;
        zp.playerMissileDirection = 0;
        zp.numberRobotsKilled++;

        // Add score (BCD)
        incrementScore(zp, 100);

        // Check for bonus life
        if (zp.numberRobotsKilled % 20 === 0) {
          if (zp.gameVariation & EXTRA_LIFE_2000) {
            incrementScore(zp, 2000);
          } else if (zp.gameVariation & EXTRA_LIFE_1000) {
            incrementScore(zp, 1000);
          }
          zp.numberOfLives++;
        }

        break; // only kill one robot per missile
      }
    }
  }

  // Check player missile vs Evil Otto (if Otto is not invincible)
  if (zp.playerMissileDirection !== 0 && !(zp.gameVariation & OTTO_INVINCIBLE)) {
    if (zp.evilOttoVertPos > 0) {
      const dx = Math.abs(zp.playerMissileHorizPos - zp.evilOttoHorizPos);
      const dy = Math.abs(zp.playerMissileVertPos - zp.evilOttoVertPos);

      if (dx < H_ROBOT && dy < H_PLAYER) {
        zp.playerMissileDirection = 0;
      }
    }
  }

  // Check robot missile vs playfield (absorbed by walls)
  // In the real game, missiles are absorbed by the playfield.
  // For the JS port, we check against simplified wall positions.
}

// -----------------------------------------------------------------------------
// Score increment (BCD arithmetic)
// -----------------------------------------------------------------------------

function incrementScore(zp: ZeroPage, amount: number): void {
  // Add BCD amount to player score (3 digits)
  let carry = amount;

  // Add ones digit
  zp.playerScore0 += carry % 10;
  if (zp.playerScore0 > 9) {
    zp.playerScore0 -= 10;
    carry = 1;
  } else {
    carry = 0;
  }

  // Add tens digit
  zp.playerScore1 += Math.floor((carry % 100) / 10) + (amount >= 10 ? Math.floor((amount % 100) / 10) : 0);
  if (zp.playerScore1 > 9) {
    zp.playerScore1 -= 10;
    zp.playerScore0 += 1; // carry to ones
  }

  // Add hundreds digit
  zp.playerScore2 += Math.floor(amount / 100);
  if (zp.playerScore2 > 9) {
    zp.playerScore2 -= 10;
  }
}

/**
 * Increment score by a BCD value with carry handling.
 * This matches the ASM IncrementScore subroutine.
 */
function incrementScoreBCD(zp: ZeroPage, bcdAmount: number): void {
  let carry = 0;

  // Add ones place
  let ones = (bcdAmount & 0x0f) + zp.playerScore0 + carry;
  if (ones >= 10) {
    ones -= 10;
    carry = 1;
  } else {
    carry = 0;
  }
  zp.playerScore0 = ones;

  // Add tens place
  let tens = ((bcdAmount >> 4) & 0x0f) + zp.playerScore1 + carry;
  if (tens >= 10) {
    tens -= 10;
    carry = 1;
  } else {
    carry = 0;
  }
  zp.playerScore1 = tens;

  // Add hundreds place
  let hundreds = ((bcdAmount >> 8) & 0x0f) + zp.playerScore2 + carry;
  zp.playerScore2 = hundreds & 0x0f;
}

// -----------------------------------------------------------------------------
// Color cycling (attract mode)
// -----------------------------------------------------------------------------

function updateColorCycling(zp: ZeroPage): void {
  zp.colorEOR++;
}

// -----------------------------------------------------------------------------
// Reset player after death
// -----------------------------------------------------------------------------

function resetPlayer(zp: ZeroPage): void {
  zp.playerAnimationIndex = 0;
  zp.playerMissileDirection = 0;
  zp.playerMissileFlightTime = 0;

  // Determine spawn position based on game variation
  const spawnLocation = zp.playerStartingLocation;
  zp.playerHorizPos = InitHorizontalPosition[spawnLocation];
  zp.playerVertPos = InitVerticalPosition[spawnLocation];
  zp.playerDirection = NO_MOVE;
}

// -----------------------------------------------------------------------------
// Reset robots after player death
// -----------------------------------------------------------------------------

function resetRobots(zp: ZeroPage): void {
  for (let i = 0; i < MAX_ROBOTS; i++) {
    zp.robotAnimationIndex[i] = 0; // standing
    zp.robotHorizPos[i] = 73;
    zp.robotVertPos[i] = 142;
    zp.robotFineHoriz[i] = 0;
  }
}

// -----------------------------------------------------------------------------
// Main game state machine tick
// -----------------------------------------------------------------------------

export interface GameStateMachine {
  zp: ZeroPage;
  region: number;
  joystickInput: number;
  lastJoystickInput: number;
  frameCount: number;
  vblankCount: number;
  overscanCount: number;
  colorCycleIndex: number;
}

export function createGameStateMachine(region: number = NTSC): GameStateMachine {
  return {
    zp: createZeroPage(),
    region,
    joystickInput: NO_MOVE,
    lastJoystickInput: NO_MOVE,
    frameCount: 0,
    vblankCount: 0,
    overscanCount: 0,
    colorCycleIndex: 0,
  };
}

/**
 * Process one frame of game logic.
 * This mirrors the Atari 2600 main loop structure.
 */
export function tick(state: GameStateMachine): void {
  const { zp, region } = state;

  state.frameCount++;

  // VBLANK: clear state, update attract timer
  // This is where the 2600 would clear the screen and handle vertical blanking.
  // In the game logic, we use this to update timers and check for state transitions.

  // Update color cycling (attract mode)
  if (zp.kernelSection === GameState.ATTRACT) {
    updateColorCycling(zp);
  }

  // Update player missile
  updatePlayerMissile(zp);

  // Update robot missile
  updateRobotMissile(zp);

  // Update robots (AI + movement)
  updateRobots(zp, region);

  // Robot shooting
  if (zp.gameVariation & ROBOT_SHOOTING) {
    for (let i = 0; i < MAX_ROBOTS; i++) {
      robotShoot(zp, i, region);
    }
  }

  // Update Evil Otto
  updateEvilOtto(zp, region);

  // Update player direction from joystick (before movement)
  zp.playerDirection = state.joystickInput & 0x0f;

  // Update player movement
  updatePlayer(zp, region);

  // Fire player missile (on edge detection)
  const firePressed = (state.joystickInput & 0x10) && !(state.lastJoystickInput & 0x10);
  console.log('[tick] edgeDetected=' + firePressed + ' ji=' + state.joystickInput + ' last=' + state.lastJoystickInput);
  if (firePressed) {
    firePlayerMissile(zp, state.joystickInput);
  }
  console.log('[tick] after fire: missileDir=' + zp.playerMissileDirection);
  state.lastJoystickInput = state.joystickInput;

  // Check collisions
  checkPlayerCollisions(zp);
  console.log('[tick] after collisions: missileDir=' + zp.playerMissileDirection);
  checkMissileCollisions(zp);
  console.log('[tick] after missileCollisions: missileDir=' + zp.playerMissileDirection);

  // Handle player death
  if (zp.playerAnimationIndex === PLAYER_DEATH_ANIM_OFFSET) {
    // Check if death animation is complete (simplified: 30 frames)
    if (zp.playerMotion > 30) {
      zp.numberOfLives--;
      if (zp.numberOfLives <= 0) {
        // Game over
        zp.kernelSection = GameState.GAME_OVER;
      } else {
        // Reset player and robots for next life
        zp.playerMotion = 0;
        resetPlayer(zp);
        resetRobots(zp);
        zp.evilOttoLaunchTimer = 0; // reset Otto timer
      }
    }
  }
}

/**
 * Process joystick input.
 * The Atari 2600 uses SWCHA register for joystick state.
 * Bits: 3=right, 2=left, 1=down, 0=up, 4=fire
 */
export function processJoystickInput(state: GameStateMachine, input: number): void {
  state.joystickInput = input & 0x1f; // mask to joystick bits
}
