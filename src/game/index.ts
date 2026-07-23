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
  RobotAnimationTableFlat,
  RobotSpriteData,
  PlayerSpriteData,
  EvilOttoSpriteData,
  MissileVerticalLimitsTable,
  InitRobotMissileYOffset,
  InitRobotMissileXOffset,
  GameVariationTable,
  InitHorizontalPosition,
  InitVerticalPosition,
  MazePF0Data,
  MazePF1Data,
  MazePF2Data,
  MazeOffsetTable,
  StartingLocationValues,
} from "../data/tables";

// -----------------------------------------------------------------------------
// Game state constants
// -----------------------------------------------------------------------------

export const GameState = {
  VBLANK: 0,
  ATTRACT: 0,       // alias of VBLANK — attract mode uses VBLANK kernel
  PLAY: 1,
  GAME: 1,          // alias of PLAY
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
  // ASM NextRandom: rotate the 16-bit random seed, then fold the high byte
  // down until it is <= randomNumberMax (loopCount alias).
  let a = zp.randomLo;
  let carry = (a >> 7) & 1;
  a = (a << 1) & 0xff;
  a ^= zp.randomLo;
  carry = (a >> 7) & 1;
  a = (a << 1) & 0xff;
  carry = (a >> 7) & 1;
  a = (a << 1) & 0xff;

  const oldRandomHi = zp.randomHi;
  zp.randomHi = ((zp.randomHi << 1) & 0xff) | carry;
  carry = (oldRandomHi >> 7) & 1;
  zp.randomLo = ((zp.randomLo << 1) & 0xff) | carry;

  let temp = zp.randomHi & 0x7f;
  zp.temp01 = temp;
  const max = zp.loopCount || 0xff;
  while (((temp + zp.temp02) & 0xff) > max) {
    zp.temp01 >>= 1;
    temp = zp.temp01;
  }
  return (temp + zp.temp02) & 0xff;
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
  zp.robotMotionDelay = RobotMotionDelayTable[(zp.gameLevel >> 1) & 7] ?? RobotMotionDelayTable[0];
  zp.robotMissileDirection = 0;
  zp.robotMissileFlightTime = 0;
  zp.robotMissileHorizPos = 0;
  zp.robotMissileVertPos = 0;

  // Initialize robots: ASM ResetRobotsForNewBoard
  // Starts at vertical position 75, then each lower X index is placed
  // H_ROBOT+1 pixels above the previous robot.
  zp.numberRobotsKilled = 0;
  zp.initRobotDelay = 0;
  zp.lastRobotVertPos = 75;
  zp.temp02 = 0;
  zp.loopCount = 135;
  for (let i = MAX_ROBOTS - 1; i >= 0; i--) {
    zp.lastRobotVertPos = i === MAX_ROBOTS - 1 ? 75 : zp.lastRobotVertPos - (H_ROBOT + 1);
    zp.robotVertPos[i] = zp.lastRobotVertPos;
    zp.robotHorizPos[i] = nextRandom(zp);
    zp.robotAnimationIndex[i] = nextRandom(zp) & 7;
  }

  // Initialize player (ASM: uses InitHorizontalPosition/InitVerticalPosition)
  zp.playerStartingLocation = PLAYER_ENTERING_NORTH;
  zp.playerHorizPos = InitHorizontalPosition[zp.playerStartingLocation];
  zp.playerVertPos = InitVerticalPosition[zp.playerStartingLocation];
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

/**
 * Determine which robot should move this frame.
 * ASM DetermineRobotToMove: divides screen into 4 horizontal zones,
 * picks a base robot, adjusts for vertical position, XORs with random.
 */
function determineRobotToMove(zp: ZeroPage): number {
  let robotToMove = 3;
  let threshold = 0;

  while (threshold < zp.playerHorizPos && robotToMove > 0) {
    threshold += 34;
    if (threshold < zp.playerHorizPos) {
      robotToMove--;
    }
  }

  if (zp.playerVertPos < (H_KERNEL / 2) - H_ROBOT + 1) {
    robotToMove += 4;
  }

  return (robotToMove ^ zp.randomHi) & 7;
}

/**
 * Advance robot animation by one frame using the RobotAnimationTable.
 * ASM: lda RobotAnimationTable,y / sta robotAnimationIndex,x
 */
function advanceRobotAnimation(zp: ZeroPage, robotIndex: number): void {
  const animIdx = zp.robotAnimationIndex[robotIndex];
  if (animIdx >= ROBOT_DEATH_ANIM_OFFSET) return; // dying

  const tableEntry = RobotAnimationTableFlat[animIdx];
  if (tableEntry !== undefined) {
    zp.robotAnimationIndex[robotIndex] = tableEntry;
  }
}

/**
 * Set robot to walk in a direction (sets animation index to the direction's base offset).
 */
function setRobotWalkingDirection(zp: ZeroPage, robotIndex: number, dirOffset: number): void {
  zp.robotAnimationIndex[robotIndex] = dirOffset;
}

/**
 * Set robot to standing animation.
 */
function setRobotStanding(zp: ZeroPage, robotIndex: number): void {
  zp.robotAnimationIndex[robotIndex] = ROBOT_STAND_ANIM_OFFSET;
}

/**
 * Check if adjacent robot collision would occur when moving vertically.
 * ASM: compares with robotVertPos-1 or robotVertPos+1 plus H_ROBOT padding.
 */
function checkRobotVerticalCollision(zp: ZeroPage, robotIndex: number, movingDown: boolean): boolean {
  if (movingDown) {
    // Check if next robot is too close below
    if (robotIndex < MAX_ROBOTS - 1) {
      if (zp.robotVertPos[robotIndex + 1] !== 0x7f) {
        if (zp.robotVertPos[robotIndex] + H_ROBOT + 2 >= zp.robotVertPos[robotIndex + 1]) {
          return true; // collision — don't move down
        }
      }
    }
  } else {
    // Check if previous robot is too close above
    if (robotIndex > 0) {
      if (zp.robotVertPos[robotIndex - 1] + H_ROBOT + 1 >= zp.robotVertPos[robotIndex]) {
        return true; // collision — don't move up
      }
    }
  }
  return false;
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
 * ASM: fractional accumulator timing, one robot moves per frame.
 */
/**
 * Check if all robots are dead (off-screen at 0x7F).
 */
function allRobotsDead(zp: ZeroPage): boolean {
  for (let i = 0; i < MAX_ROBOTS; i++) {
    if (zp.robotVertPos[i] !== 0x7f) return false;
  }
  return true;
}

/**
 * Handle player exiting the room by walking through a doorway.
 * ASM: IncrementGameLevel + SetupForPlayerExitingRoom
 *
 * Sets gameState to $FF to trigger VBLANK room transition.
 */
function setupRoomExit(zp: ZeroPage): void {
  // Determine which side the player is exiting from
  let exitDir: number;
  if (zp.playerHorizPos === 0) {
    exitDir = PLAYER_ENTERING_WEST;
  } else if (zp.playerHorizPos >= XMAX_PLAYER) {
    exitDir = PLAYER_ENTERING_EAST;
  } else if (zp.playerVertPos < YMIN + 2) {
    exitDir = PLAYER_ENTERING_NORTH;
  } else {
    exitDir = PLAYER_ENTERING_SOUTH;
  }

  // Save the exiting position (used by SetupForPlayerExitingRoom in ASM)
  zp.tempPlayerExitingPos = exitDir;
  zp.gameState = 0xFF;

  // Hide player (ASM: set playerVertPos to $7F)
  zp.playerVertPos = 0x7f;
  zp.playerAnimationIndex = 0;

  // Reset robots and missiles
  zp.numberRobotsKilled = 0;
  zp.initRobotDelay = 0;
  zp.robotMotionDelay = 0;
  zp.robotMissileDirection = 0;
  zp.robotMissileFlightTime = 0;
  zp.playerMissileDirection = 0;
  zp.playerMissileFlightTime = 0;
  zp.evilOttoLaunchTimer = 0;
}

/**
 * Setup a new room when the player exits through a doorway.
 * ASM: SetupForNewScreen + ResetRobotsForNewBoard
 */
function transitionToNewRoom(zp: ZeroPage, exitDir: number): void {
  zp.gameLevel++;
  zp.numberRobotsKilled = 0;
  zp.initRobotDelay = 0;
  zp.robotMotionDelay = RobotMotionDelayTable[(zp.gameLevel >> 1) & 7] ?? RobotMotionDelayTable[0];

  // Reset playfield limits for transition
  zp.upperPlayfieldLimit = 0;
  zp.lowerPlayfieldLimit = H_KERNEL / 2;

  // Pick a new maze (different from current)
  nextRandom(zp);
  let newMaze = zp.randomHi & 3;
  if (newMaze === (zp.mazeOffset / 42 | 0)) {
    newMaze = (newMaze + 2) & 3; // ensure different maze
  }
  zp.mazeOffset = MazeOffsetTable[newMaze];

  // Determine entry direction explicitly from TS direction constants.
  // This avoids relying on ASM table ordering for east/west indices.
  let entryDir: number;
  switch (exitDir) {
    case PLAYER_ENTERING_NORTH:
      entryDir = PLAYER_ENTERING_SOUTH;
      break;
    case PLAYER_ENTERING_SOUTH:
      entryDir = PLAYER_ENTERING_NORTH;
      break;
    case PLAYER_ENTERING_WEST:
      entryDir = PLAYER_ENTERING_EAST;
      break;
    case PLAYER_ENTERING_EAST:
      entryDir = PLAYER_ENTERING_WEST;
      break;
    default:
      entryDir = PLAYER_ENTERING_NORTH;
      break;
  }
  zp.playerStartingLocation = entryDir;
  zp.playerHorizPos = InitHorizontalPosition[entryDir];
  zp.playerVertPos = InitVerticalPosition[entryDir];
  zp.playerDirection = NO_MOVE;
  zp.playerAnimationIndex = PLAYER_STAND_ANIM_OFFSET;
  zp.playerMissileDirection = 0;

  // Reset robots (ASM: ResetRobotsForNewBoard)
  resetRobots(zp);
}

export function updateRobots(zp: ZeroPage, region: number): void {
  // ASM: sec / ror initRobotDelay — rotate right through carry (carry always set,
  // so a 1 bit is always inserted at bit 7). Starting value is $AA in attract mode,
  // or $00 on reset (which then becomes $80 on first tick via sec+ror).
  if (zp.initRobotDelay !== 0xff) {
    zp.initRobotDelay = (zp.initRobotDelay >>> 1 | 0x80) & 0xff;
    return;
  }

  // Fractional accumulator for robot motion timing.
  // ASM: adc robotMotionDelay / sta robotMotion, animate on carry.
  const delay = zp.robotMotionDelay;
  zp.robotMotion = (zp.robotMotion + delay) & 0xff;
  const shouldAnimate = zp.robotMotion < delay;

  // Set delayRobotAnimation flag (ASM: $9F) — 1 when accumulator overflowed
  zp.robotFineHoriz[0] = shouldAnimate ? 1 : 0;

  // Determine which robot gets to move this frame
  const robotToMove = determineRobotToMove(zp);

  // Process each robot
  for (let i = 0; i < MAX_ROBOTS; i++) {
    // Skip off-screen robots
    if (zp.robotVertPos[i] === 0x7f) continue;

    const animIdx = zp.robotAnimationIndex[i];

    // Handle dying robots
    if (animIdx >= ROBOT_DEATH_ANIM_OFFSET) {
      if (animIdx < ROBOT_DEATH_ANIM_OFFSET + 4) {
        advanceRobotAnimation(zp, i);
      }
      continue;
    }

    // Only animate if the fractional accumulator fired
    if (!shouldAnimate) continue;

    let currentAnim = animIdx & 0x1f;

    // If robot is standing (anim < ROBOT_LEFT_ANIM_OFFSET = 9)
    if (currentAnim < ROBOT_LEFT_ANIM_OFFSET) {
      // This robot was selected to move — decide direction
      if (i === (robotToMove & 7)) {
        // ROM: random bit decides horizontal vs vertical axis
        const robotX = zp.robotHorizPos[i];
        const robotY = zp.robotVertPos[i];
        const playerX = zp.playerHorizPos;
        const playerY = zp.playerVertPos;

        if (robotX === playerX && (playerY >> 1) === robotY) {
          // Same position as player — stand
          setRobotStanding(zp, i);
        } else if (zp.randomHi & 0x80) {
          // Vertical axis chosen by random bit — ROM uses playerY/2
          const playerYHalf = playerY >> 1;
          if (playerYHalf >= robotY) {
            setRobotWalkingDirection(zp, i, ROBOT_DOWN_ANIM_OFFSET);
          } else {
            setRobotWalkingDirection(zp, i, ROBOT_UP_ANIM_OFFSET);
          }
        } else {
          // Horizontal axis chosen by random bit
          const dx = playerX - robotX;
          if (dx > 0) {
            setRobotWalkingDirection(zp, i, ROBOT_RIGHT_ANIM_OFFSET);
          } else {
            setRobotWalkingDirection(zp, i, ROBOT_LEFT_ANIM_OFFSET);
          }
        }
      } else {
        advanceRobotAnimation(zp, i);
      }
      // Re-read animation after direction was set
      currentAnim = zp.robotAnimationIndex[i] & 0x1f;
    }

    // Execute movement based on current walking direction (ROM-style, no wall checks for horizontal)
    if (currentAnim >= ROBOT_LEFT_ANIM_OFFSET && currentAnim < ROBOT_RIGHT_ANIM_OFFSET) {
      // Walking left — if robot x > player x, move left; otherwise stand
      if (zp.robotHorizPos[i] > zp.playerHorizPos) {
        zp.robotHorizPos[i]--;
        advanceRobotAnimation(zp, i);
      } else {
        setRobotStanding(zp, i);
      }
    } else if (currentAnim >= ROBOT_RIGHT_ANIM_OFFSET && currentAnim < ROBOT_UP_ANIM_OFFSET) {
      // Walking right — if robot x < player x, move right; otherwise stand
      if (zp.robotHorizPos[i] < zp.playerHorizPos) {
        zp.robotHorizPos[i]++;
        advanceRobotAnimation(zp, i);
      } else {
        setRobotStanding(zp, i);
      }
    } else if (currentAnim >= ROBOT_UP_ANIM_OFFSET && currentAnim < ROBOT_DOWN_ANIM_OFFSET) {
      // Walking up — check robot-to-robot collision
      // ROM: if collision, redirect to horizontal (DetermineRobotMovement)
      if (checkRobotVerticalCollision(zp, i, false)) {
        // Collision with adjacent robot — switch to horizontal direction
        if (zp.robotHorizPos[i] > zp.playerHorizPos) {
          setRobotWalkingDirection(zp, i, ROBOT_LEFT_ANIM_OFFSET);
        } else {
          setRobotWalkingDirection(zp, i, ROBOT_RIGHT_ANIM_OFFSET);
        }
      } else {
        zp.robotVertPos[i]--;
        advanceRobotAnimation(zp, i);
      }
    } else if (currentAnim >= ROBOT_DOWN_ANIM_OFFSET && currentAnim < ROBOT_DEATH_ANIM_OFFSET) {
      // Walking down — ROM gates movement at animation frames DOWN (19) and DOWN+2 (21)
      // Only moves at DOWN+1 (20) and DOWN+3 (22)
      if (currentAnim === ROBOT_DOWN_ANIM_OFFSET || currentAnim === ROBOT_DOWN_ANIM_OFFSET + 2) {
        // Skip movement at these frames
        advanceRobotAnimation(zp, i);
      } else {
        // ROM: if collision, redirect to horizontal (DetermineRobotMovement)
        if (checkRobotVerticalCollision(zp, i, true)) {
          // Collision with adjacent robot — switch to horizontal direction
          if (zp.robotHorizPos[i] > zp.playerHorizPos) {
            setRobotWalkingDirection(zp, i, ROBOT_LEFT_ANIM_OFFSET);
          } else {
            setRobotWalkingDirection(zp, i, ROBOT_RIGHT_ANIM_OFFSET);
          }
        } else {
          zp.robotVertPos[i]++;
          advanceRobotAnimation(zp, i);
        }
      }
    }

    // Clamp horizontal position
    if (zp.robotHorizPos[i] < XMIN) zp.robotHorizPos[i] = XMIN;
    if (zp.robotHorizPos[i] > XMAX) zp.robotHorizPos[i] = XMAX;
  }
}

// -----------------------------------------------------------------------------
// Robot shooting logic
// -----------------------------------------------------------------------------

function robotShoot(zp: ZeroPage, region: number): void {
  // ASM: only fire missiles after initRobotDelay reaches FF
  if (zp.initRobotDelay !== 0xff) return;

  // ASM: don't fire missiles on first game board (gameLevel 0)
  if ((zp.gameLevel ?? 0) === 0) return;

  // ASM: check game variation for robot shooting
  if (!(zp.gameVariation & ROBOT_SHOOTING)) return;

  // If missile already in flight, don't launch new one
  if (zp.robotMissileDirection !== 0) return;

  // Rate-limit: robots can't fire until missile is gone and delay has passed
  if (zp.robotMissileDelay > 0) return;

  // ASM: only try to launch when robots are NOT being animated this frame
  // (delayRobotAnimation at $9F is set to 1 when a robot moves)
  if (zp.robotFineHoriz[0] !== 0) return;

  // Pick a robot using frameCount & 7
  const robotIdx = zp.frameCount & 7;
  if (robotIdx >= MAX_ROBOTS) return;
  if (zp.robotVertPos[robotIdx] === 0x7f) return; // off screen
  if (zp.robotAnimationIndex[robotIdx] >= ROBOT_DEATH_ANIM_OFFSET) return;

  // Check if robot is within targeting box horizontally
  const playerXMin = zp.playerHorizPos - XROBOT_MISSILE_BOX;
  const playerXMax = zp.playerHorizPos + XROBOT_MISSILE_BOX;

  if (zp.robotHorizPos[robotIdx] >= playerXMin && zp.robotHorizPos[robotIdx] <= playerXMax) {
    // Robot is in X targeting box — fire vertically
    const playerYHalf = zp.playerVertPos >> 1;
    let dir: number;
    if (playerYHalf >= zp.robotVertPos[robotIdx]) {
      dir = ROBOT_SHOOTING_DOWN;
    } else {
      dir = ROBOT_SHOOTING_UP;
    }
    launchRobotMissile(zp, robotIdx, dir);
    return;
  }

  // Check if robot is within targeting box vertically
  const playerYMin = (zp.playerVertPos >> 1) - YROBOT_MISSILE_BOX;
  const playerYMax = (zp.playerVertPos >> 1) + YROBOT_MISSILE_BOX;

  if (zp.robotVertPos[robotIdx] >= playerYMin && zp.robotVertPos[robotIdx] <= playerYMax) {
    // Robot is in Y targeting box — fire horizontally
    let dir: number;
    if (zp.robotHorizPos[robotIdx] >= zp.playerHorizPos) {
      dir = ROBOT_SHOOTING_LEFT;
    } else {
      dir = ROBOT_SHOOTING_RIGHT;
    }
    launchRobotMissile(zp, robotIdx, dir);
  }
}

function launchRobotMissile(zp: ZeroPage, robotIdx: number, direction: number): void {
  // Set robot back to standing when it fires
  if (zp.robotAnimationIndex[robotIdx] >= ROBOT_LEFT_ANIM_OFFSET) {
    zp.robotAnimationIndex[robotIdx] = ROBOT_STAND_ANIM_OFFSET;
  }

  // Rate-limit: don't allow another shot until missile is gone and delay has passed
  // ASM: RobotMissileDelay counts down from 0xff; robots can't fire while it's > 0
  // This prevents machine-gun shooting
  if (zp.robotMissileDelay > 0) return;

  zp.robotMissileDelay = 0;

  zp.robotMissileDirection = direction;
  zp.robotMissileFlightTime = 0;

  // Set missile starting position from robot position
  zp.robotMissileVertPos = zp.robotVertPos[robotIdx] + InitRobotMissileYOffset[direction];
  zp.robotMissileHorizPos = zp.robotHorizPos[robotIdx] + InitRobotMissileXOffset[direction];
}

/**
 * Update robot missile.
 */
function updateRobotMissile(zp: ZeroPage, region: number): void {
  if (zp.robotMissileDirection === 0) {
    return;
  }

  zp.robotMissileFlightTime++;

  // Check flight time limit
  if (zp.robotMissileFlightTime > 100) {
    zp.robotMissileDirection = 0;
    zp.robotMissileDelay = 0; // Reset delay so next shot can fire
    return;
  }

  // Robot missile movement is rate-limited by RobotMissileDelayTable (ASM)
  // Level >= 16: missile moves every frame
  // Level < 16: accumulator-based delay (only move some frames)
  const gameLevel = zp.gameLevel ?? 0;
  if (gameLevel < 16) {
    const delayTable = getRobotMissileDelay(region);
    const tableIndex = ((gameLevel >> 1) & 7) as number;
    const delayValue = delayTable[tableIndex] ?? delayTable[0];
    zp.robotMissileDelay = (zp.robotMissileDelay + delayValue) & 0xff;
    if ((zp.robotMissileDelay >> 7) === 0) {
      // No carry — skip movement this frame
      return;
    }
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
    zp.robotMissileDelay = 0; // Reset delay so next shot can fire
    return;
  }
  if (zp.robotMissileVertPos < YMIN || zp.robotMissileVertPos >= (H_KERNEL - 8) / 2) {
    zp.robotMissileDirection = 0;
    zp.robotMissileDelay = 0; // Reset delay so next shot can fire
    return;
  }

  // Check wall collision
  if (isPositionInWall(zp.robotMissileHorizPos, zp.robotMissileVertPos, zp.mazeOffset ?? 0)) {
    zp.robotMissileDirection = 0;
    zp.robotMissileDelay = 0; // Reset delay so next shot can fire
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

  // Otto launch timer — only matters while Otto hasn't launched yet
  if (zp.kernelSection === OttoState.NOT_LAUNCHED) {
    if (zp.evilOttoLaunchTimer === 0) {
      // Start launch timer (~12 seconds = 720 frames at 60fps)
      zp.evilOttoLaunchTimer = 200;
      return;
    }
    zp.evilOttoLaunchTimer--;
    if (zp.evilOttoLaunchTimer > 0) {
      return; // Otto not yet launched
    }
    // Timer expired — transition to LAUNCHING (fall through to switch)
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

function updatePlayer(zp: ZeroPage, region: number, wasShooting: boolean): void {
  // Skip if player is dying or exiting
  if (
    zp.playerAnimationIndex === PLAYER_DEATH_ANIM_OFFSET ||
    zp.playerAnimationIndex === PlayerAnimState.EXITING
  ) {
    return;
  }

  // Determine player animation state
  const isShooting = wasShooting;
  const isMoving =
    (zp.playerDirection & (MOVE_UP | MOVE_DOWN | MOVE_LEFT | MOVE_RIGHT)) !== 0;

  // Update player animation — alternate running frames via bit 0
  if (isShooting) {
    let shootAnimIndex: number;
    switch (zp.playerDirection & 0x0f) {
      case MOVE_UP:
        shootAnimIndex = 2;
        break;
      case MOVE_DOWN:
        shootAnimIndex = 3;
        break;
      default:
        shootAnimIndex = 0;
        break;
    }
    zp.playerAnimationIndex = PlayerShootingAnimationTable[shootAnimIndex] ?? 0;
  } else if (isMoving) {
    // Toggle between running0 (bit0=0) and running1 (bit0=1)
    zp.playerAnimationIndex ^= 1;
    // Prevent the toggle from accidentally landing on the death animation index
    if (zp.playerAnimationIndex === PLAYER_DEATH_ANIM_OFFSET) {
      zp.playerAnimationIndex ^= 1;
    }
  } else {
    zp.playerAnimationIndex = PLAYER_STAND_ANIM_OFFSET;
  }

  // Player movement — ASM fractional accumulator:
  //   lda playerMotion / adc playerMotionDelay / sta playerMotion / bcc skip
  //   Accumulator overflows ~26 times/sec at NTSC (112/256).
  const fractionalDelay = getFractionalDelay(region);
  const sum = zp.playerMotion + fractionalDelay;
  zp.playerMotion = sum & 0xff;

  if (sum > 0xff) {
    // Horizontal movement
    if (zp.playerDirection & MOVE_RIGHT) {
      zp.playerHorizPos += 1;
    }
    if (zp.playerDirection & MOVE_LEFT) {
      zp.playerHorizPos -= 1;
    }

    // Vertical movement
    if (zp.playerDirection & MOVE_DOWN) {
      zp.playerVertPos += 1;
    }
    if (zp.playerDirection & MOVE_UP) {
      zp.playerVertPos -= 1;
    }

    // Check for room exit — original ROM checks player position after movement:
    // Left exit:  playerHorizPos == 0
    // Right exit: playerHorizPos >= XMAX_PLAYER (146)
    // Top exit:   playerVertPos < YMIN + 2
    // Bottom exit: playerVertPos >= H_KERNEL - H_PLAYER*2 (152)
    // Also verify the exit point is not blocked by a wall (prevents
    // the player from triggering an exit by walking through a wall).
    const mazeOff = zp.mazeOffset ?? 0;
    const atLeftExit  = zp.playerHorizPos === 0 &&
                        !isPositionInWall(0, zp.playerVertPos, mazeOff);
    const atRightExit = zp.playerHorizPos >= XMAX_PLAYER &&
                        !isPositionInWall(XMAX_PLAYER, zp.playerVertPos, mazeOff);
    const atTopExit   = zp.playerVertPos < YMIN + 2 &&
                        !isPositionInWall(zp.playerHorizPos, 0, mazeOff);
    const atBottomExit= zp.playerVertPos >= H_KERNEL - H_PLAYER * 2 &&
                        !isPositionInWall(zp.playerHorizPos, 159, mazeOff);
    if (atLeftExit || atRightExit || atTopExit || atBottomExit) {
      setupRoomExit(zp);
      return;
    }
  }
}

// -----------------------------------------------------------------------------
// Player missile logic
// -----------------------------------------------------------------------------

function firePlayerMissile(zp: ZeroPage, joystickInput: number): void {
  if (zp.playerMissileDirection !== 0) {
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

  if (direction === 0) {
    return;
  }

  zp.playerMissileDirection = direction;
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
  // ASM: horizontal uses HorizontalPixelOffsets (±1 * 2 = ±2), vertical uses VerticalPixelOffsets (±1)
  switch (zp.playerMissileDirection) {
    case ROBOT_SHOOTING_RIGHT:
      zp.playerMissileHorizPos += 2;
      break;
    case ROBOT_SHOOTING_LEFT:
      zp.playerMissileHorizPos -= 2;
      break;
    case ROBOT_SHOOTING_DOWN:
      zp.playerMissileVertPos += 1;
      break;
    case ROBOT_SHOOTING_UP:
      zp.playerMissileVertPos -= 1;
      break;
  }

  // Check bounds
  if (zp.playerMissileHorizPos < XMIN || zp.playerMissileHorizPos > XMAX) {
    zp.playerMissileDirection = 0;
    return;
  }
  if (zp.playerMissileVertPos < YMIN || zp.playerMissileVertPos >= (H_KERNEL - 8) / 2) {
    zp.playerMissileDirection = 0;
    return;
  }

  // Check wall collision — missile stops at maze walls
  if (isPositionInWall(zp.playerMissileHorizPos, zp.playerMissileVertPos, zp.mazeOffset ?? 0)) {
    zp.playerMissileDirection = 0;
  }
}

// -----------------------------------------------------------------------------
// Collision detection — matches ASM DetermineToTurnOffMissiles + CheckPlayerHarmfulCollisions
// -----------------------------------------------------------------------------

/**
 * Turn off missiles that are out of bounds or hit something.
 * ASM: DetermineToTurnOffMissiles / CheckToTurnOffPlayerMissile
 */
function checkMissileBoundsAndCollisions(zp: ZeroPage): void {
  // --- Robot missile ---
  const robotMissileWasActive = zp.robotMissileDirection !== 0 && zp.robotMissileDirection !== 0x0f;
  if (robotMissileWasActive) {
    let turnOff = false;

    // X position limits (ASM: MissileVerticalLimitsTable check)
    const rmx = zp.robotMissileHorizPos;
    if (rmx <= XMIN + 1 || rmx >= XMAX - 1) turnOff = true;

    // Y position limits
    const rmy = zp.robotMissileVertPos;
    if (rmy <= YMIN || rmy >= (H_KERNEL - 8) / 2) turnOff = true;

    // Missile-missile collision (CXPPMM bit 6)
    if (zp.playerMissileDirection !== 0 && zp.playerMissileDirection !== 0x0f) {
      const dxm = Math.abs(zp.robotMissileHorizPos - zp.playerMissileHorizPos);
      const dym = Math.abs(zp.robotMissileVertPos - zp.playerMissileVertPos);
      if (dxm < 4 && dym < 4) turnOff = true;
    }

    // Robot missile hit player (CXM1P bit 7)
    const dxrp = Math.abs(zp.robotMissileHorizPos - zp.playerHorizPos);
    const dyrp = Math.abs(zp.robotMissileVertPos - zp.playerVertPos);
    if (dxrp < H_PLAYER && dyrp < H_PLAYER) {
      turnOff = true;
      triggerPlayerDeath(zp);
    }

    if (turnOff) {
      zp.robotMissileDirection = 0;
      zp.robotMissileFlightTime = 0;
    }
  }

  // --- Player missile ---
  if (zp.playerMissileDirection !== 0 && zp.playerMissileDirection !== 0x0f) {
    let turnOff = false;

    // X position limits
    const pmx = zp.playerMissileHorizPos;
    if (pmx <= XMIN + 1 || pmx >= XMAX - 1) turnOff = true;

    // Y position limits
    const pmy = zp.playerMissileVertPos;
    if (pmy <= YMIN || pmy >= (H_KERNEL - 8) / 2) turnOff = true;

    // Missile-missile collision (CXPPMM bit 6)
    if (robotMissileWasActive) {
      const dxm = Math.abs(zp.playerMissileHorizPos - zp.robotMissileHorizPos);
      const dym = Math.abs(zp.playerMissileVertPos - zp.robotMissileVertPos);
      if (dxm < 4 && dym < 4) turnOff = true;
    }

    // Wall collision
    if (!turnOff && isMissileInMazeWall(pmx, pmy, zp.mazeOffset ?? 0)) {
      turnOff = true;
    }

    if (turnOff) {
      zp.playerMissileDirection = 0;
      zp.playerMissileFlightTime = 0;
    }
  }
}

/**
 * Simplified check: is a missile position inside a maze wall?
 * Checks the PF0/PF1/PF2 bit patterns at the missile's scanline.
 */
function isMissileInMazeWall(x: number, y: number, mazeOffset: number): boolean {
  if (y < 2 || y >= 86) return false;

  const dataIndex = (y >> 1) + mazeOffset;
  const pf0 = MazePF0Data[dataIndex] ?? 0;
  const pf1 = MazePF1Data[dataIndex] ?? 0;
  const pf2 = MazePF2Data[dataIndex] ?? 0;

  // Convert x to dot position
  const dot = Math.floor(x / 4);
  if (dot >= 40) return false;

  // Left half: dots 0-3 from PF0, 4-11 from PF1, 12-19 from PF2
  // Right half: dots 20-39 (mirror)
  const isLeft = dot < 20;
  const localDot = isLeft ? dot : (39 - dot);

  if (localDot < 4) {
    return (pf0 & (1 << (4 + localDot))) !== 0;
  } else if (localDot < 12) {
    return (pf1 & (1 << (11 - localDot))) !== 0;
  } else if (localDot < 20) {
    return (pf2 & (1 << (localDot - 12))) !== 0;
  }
  return false;
}

/**
 * Trigger player death with audio (ASM: .playerHarmfulCollision)
 */
function triggerPlayerDeath(zp: ZeroPage): void {
  if (zp.playerAnimationIndex === PLAYER_DEATH_ANIM_OFFSET) return; // already dying
  zp.playerAnimationIndex = PLAYER_DEATH_ANIM_OFFSET;
  zp.audioIndex = 8;
  zp.playerMotion = 0; // start death animation timer
}

/**
 * Check player vs robots and Evil Otto.
 * ASM: CheckPlayerHarmfulCollisions
 */
function checkPlayerCollisions(zp: ZeroPage): void {
  // Check player vs robots (CXPPMM bit 7)
  for (let i = 0; i < MAX_ROBOTS; i++) {
    if (zp.robotAnimationIndex[i] === ROBOT_DEATH_ANIM_OFFSET) continue;
    if (zp.robotVertPos[i] === 0x7f) continue;

    const dx = Math.abs(zp.playerHorizPos - zp.robotHorizPos[i]);
    const dy = Math.abs(zp.playerVertPos - zp.robotVertPos[i]);

    if (dx < H_ROBOT && dy < H_PLAYER) {
      triggerPlayerDeath(zp);
    }
  }

  // Check player vs Evil Otto (ASM: CheckPlayerOttoCollision with targeting box)
  if (zp.evilOttoHorizPos > 0 && zp.evilOttoVertPos > 0 && zp.evilOttoLaunchTimer >= 3) {
    // Only check every other frame (ASM: ror frameCount, bcs skip)
    if (zp.frameCount & 1) {
      // Skip Otto collision check, but continue to missile check below
    } else {
      const dx = Math.abs(zp.playerHorizPos - zp.evilOttoHorizPos);
      const dy = Math.abs(zp.playerVertPos - zp.evilOttoVertPos);

      // ASM targeting box: X ±7, Y: playerVertPos to playerVertPos + H_PLAYER+8
      if (dx <= 7 && zp.playerVertPos >= zp.evilOttoVertPos - (H_PLAYER - 1) &&
          zp.evilOttoVertPos <= zp.playerVertPos + H_PLAYER + 8) {
        triggerPlayerDeath(zp);
      }
    }
  }

  // Check player vs robot missile (CXM1P bit 7)
  if (zp.robotMissileDirection !== 0 && zp.robotMissileDirection !== 0x0f) {
    const dx = Math.abs(zp.playerHorizPos - zp.robotMissileHorizPos);
    const dy = Math.abs(zp.playerVertPos - zp.robotMissileVertPos);

    if (dx < H_PLAYER && dy < H_PLAYER) {
      zp.robotMissileDirection = 0;
      zp.robotMissileDelay = 0; // Reset delay so next shot can fire
      triggerPlayerDeath(zp);
    }
  }
}

/**
 * Check player missile vs robots and Evil Otto.
 */
function checkMissileCollisions(zp: ZeroPage): void {
  if (zp.playerMissileDirection === 0 || zp.playerMissileDirection === 0x0f) return;

  // Don't award points if player is dead (death animation started)
  if (zp.playerAnimationIndex === PLAYER_DEATH_ANIM_OFFSET) return;

  // Player missile vs robots (CXM0P bit 7)
  for (let i = 0; i < MAX_ROBOTS; i++) {
    if (zp.robotAnimationIndex[i] === ROBOT_DEATH_ANIM_OFFSET) continue;
    if (zp.robotVertPos[i] === 0x7f) continue;

    const dx = Math.abs(zp.playerMissileHorizPos - zp.robotHorizPos[i]);
    const dy = Math.abs(zp.playerMissileVertPos - zp.robotVertPos[i]);

    if (dx < H_ROBOT && dy < H_ROBOT) {
      zp.robotAnimationIndex[i] = ROBOT_DEATH_ANIM_OFFSET;
      zp.playerMissileDirection = 0;
      zp.playerMissileFlightTime = 0;
      zp.numberRobotsKilled++;

      incrementScore(zp, 50);

      if (zp.numberRobotsKilled % 20 === 0) {
        if (zp.gameVariation & EXTRA_LIFE_2000) {
          incrementScore(zp, 2000);
        } else if (zp.gameVariation & EXTRA_LIFE_1000) {
          incrementScore(zp, 1000);
        }
        zp.numberOfLives++;
      }
      break;
    }
  }

  // Player missile vs Evil Otto (CXM0P bit 6, if not invincible)
  if (zp.playerMissileDirection !== 0 && !(zp.gameVariation & OTTO_INVINCIBLE)) {
    if (zp.evilOttoHorizPos > 0 && zp.evilOttoVertPos > 0) {
      const dx = Math.abs(zp.playerMissileHorizPos - zp.evilOttoHorizPos);
      const dy = Math.abs(zp.playerMissileVertPos - zp.evilOttoVertPos);

      if (dx < H_ROBOT && dy < H_ROBOT) {
        zp.playerMissileDirection = 0;
        zp.playerMissileFlightTime = 0;
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Wall collision detection (ASM: CXP0FB)
// -----------------------------------------------------------------------------

/**
 * Check if a pixel position is inside a maze wall.
 * Uses the same PF0/PF1/PF2 bit decoding as the renderer.
 */
export function isPositionInWall(x: number, y: number, mazeOffset: number): boolean {
  if (y < 4 || y >= 172) return false;

  const dataIndex = (y >> 2) + mazeOffset;
  const pf0 = MazePF0Data[dataIndex] ?? 0;
  const pf1 = MazePF1Data[dataIndex] ?? 0;
  const pf2 = MazePF2Data[dataIndex] ?? 0;

  const dot = Math.floor(x / 4);
  if (dot >= 40) return false;

  const isLeft = dot < 20;
  const localDot = isLeft ? dot : (39 - dot);

  if (localDot < 4) {
    return (pf0 & (1 << (4 + localDot))) !== 0;
  } else if (localDot < 12) {
    return (pf1 & (1 << (11 - localDot))) !== 0;
  } else if (localDot < 20) {
    return (pf2 & (1 << (localDot - 12))) !== 0;
  }
  return false;
}

function isRobotPositionSafe(x: number, y: number, mazeOffset: number): boolean {
  return !(
    isPositionInWall(x, y, mazeOffset) ||
    isPositionInWall(x + 7, y, mazeOffset) ||
    isPositionInWall(x, y + 11, mazeOffset) ||
    isPositionInWall(x + 7, y + 11, mazeOffset) ||
    isPositionInWall(x, y + 5, mazeOffset) ||
    isPositionInWall(x + 7, y + 5, mazeOffset)
  );
}

/**
 * Check player collision with maze walls.
 * Checks the player's bounding box (8px wide, 12px tall).
 * If any corner is inside a wall, reverts to previous position.
 */
function checkPlayerWallCollisions(zp: ZeroPage): void {
  const mazeOffset = zp.mazeOffset ?? 0;
  const px = zp.playerHorizPos;
  const py = zp.playerVertPos;

  // Check bounding box corners and center
  const inWall =
    isPositionInWall(px, py, mazeOffset) ||
    isPositionInWall(px + 7, py, mazeOffset) ||
    isPositionInWall(px, py + 11, mazeOffset) ||
    isPositionInWall(px + 7, py + 11, mazeOffset);

  if (!inWall) return;

  // Revert movement: undo in the direction we were moving
  if (zp.playerDirection & MOVE_RIGHT) zp.playerHorizPos--;
  if (zp.playerDirection & MOVE_LEFT) zp.playerHorizPos++;
  if (zp.playerDirection & MOVE_DOWN) zp.playerVertPos--;
  if (zp.playerDirection & MOVE_UP) zp.playerVertPos++;

  // Clamp
  if (zp.playerHorizPos < XMIN) zp.playerHorizPos = XMIN;
  if (zp.playerHorizPos > XMAX_PLAYER) zp.playerHorizPos = XMAX_PLAYER;
  if (zp.playerVertPos < YMIN) zp.playerVertPos = YMIN;
  if (zp.playerVertPos > 159) zp.playerVertPos = 159;
}

// -----------------------------------------------------------------------------
// Score increment (BCD arithmetic)
// -----------------------------------------------------------------------------

function incrementScore(zp: ZeroPage, amount: number): void {
  // Extract individual BCD digits from amount.
  // amount can be > 999 (e.g. 2000), so we handle carries from hundreds → thousands.
  const ones = amount % 10;
  const tens = Math.floor((amount % 100) / 10);
  const hundreds = Math.floor(amount / 100) % 10;
  const thousands = Math.floor(amount / 1000);

  // Add ones digit
  zp.playerScore0 += ones;
  let carryTens = 0;
  if (zp.playerScore0 >= 10) {
    zp.playerScore0 -= 10;
    carryTens = 1;
  }

  // Add tens digit + carry
  zp.playerScore1 += tens + carryTens;
  let carryHundreds = 0;
  if (zp.playerScore1 >= 10) {
    zp.playerScore1 -= 10;
    carryHundreds = 1;
  }

  // Add hundreds digit + carry + thousands
  zp.playerScore2 += hundreds + carryHundreds + thousands;
  zp.playerScore2 %= 10;
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

/**
 * Reset robots for new room/board.
 * ASM: ResetRobotsForNewBoard — starts at vertical position 75,
 * subtracts H_ROBOT+1 for each robot, randomizes horizontal position,
 * and sets standing animation (random & 7).
 */
function resetRobots(zp: ZeroPage): void {
  zp.numberRobotsKilled = 0;
  zp.initRobotDelay = 0;
  zp.lastRobotVertPos = 75;
  zp.temp02 = 0;
  zp.loopCount = 135;
  for (let i = MAX_ROBOTS - 1; i >= 0; i--) {
    zp.lastRobotVertPos = i === MAX_ROBOTS - 1 ? 75 : zp.lastRobotVertPos - (H_ROBOT + 1);
    zp.robotVertPos[i] = zp.lastRobotVertPos;
    zp.robotHorizPos[i] = nextRandom(zp);
    zp.robotAnimationIndex[i] = nextRandom(zp) & 7;
  }
  // Clear missiles (ASM clears these in IncrementGameLevel before
  // SetupForPlayerExitingRoom → SetupForNewScreen)
  zp.robotMissileDirection = 0;
  zp.robotMissileFlightTime = 0;
  zp.robotMissileDelay = 0;
  zp.playerMissileDirection = 0;
  zp.playerMissileFlightTime = 0;
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

  // Room exit transition (ASM: VBLANK handles SetupForPlayerExitingRoom when gameState == $FF)
  if (zp.gameState === 0xff) {
    // Adjust playfield limits based on exit direction
    const exitDir = zp.tempPlayerExitingPos;
    if (exitDir !== PLAYER_ENTERING_SOUTH) {
      zp.upperPlayfieldLimit++;
    }
    if (exitDir !== PLAYER_ENTERING_NORTH) {
      zp.lowerPlayfieldLimit--;
    }

    // When limits meet, transition to new room
    if (zp.upperPlayfieldLimit >= zp.lowerPlayfieldLimit) {
      transitionToNewRoom(zp, exitDir);
      return; // tick is done for this frame
    }

    // Still in transition — skip normal game logic
    return;
  }

  // VBLANK: clear state, update attract timer
  // This is where the 2600 would clear the screen and handle vertical blanking.
  // In the game logic, we use this to update timers and check for state transitions.

  // Update color cycling (attract mode)
  if (zp.kernelSection === GameState.ATTRACT) {
    updateColorCycling(zp);
  }

  // Capture shooting state at the START of the tick (before missile updates clear it)
  const shootingAtStart = zp.playerMissileDirection !== 0;

  // Update player missile
  updatePlayerMissile(zp);

  // Update robot missile
  updateRobotMissile(zp, state.region);

  // Update robots (AI + movement)
  updateRobots(zp, region);

  // Robot shooting (ASM: single function picks which robot fires)
  robotShoot(zp, region);

  // Update Evil Otto
  updateEvilOtto(zp, region);

  // Update player direction from joystick (before movement)
  zp.playerDirection = state.joystickInput & 0x0f;

  // Fire player missile (on edge detection) — before updatePlayer so animation reflects shooting
  const firePressed = (state.joystickInput & 0x10) && !(state.lastJoystickInput & 0x10);
  if (firePressed) {
    firePlayerMissile(zp, state.joystickInput);
  }
  state.lastJoystickInput = state.joystickInput;

  // Determine if player is shooting: was shooting at start OR just fired this tick
  const isShooting = shootingAtStart || zp.playerMissileDirection !== 0;

  // Update player movement
  updatePlayer(zp, region, isShooting);

  // Check player vs playfield walls (ASM: CXP0FB collision)
  checkPlayerWallCollisions(zp);

  // Check missile bounds and wall collisions (ASM: DetermineToTurnOffMissiles)
  checkMissileBoundsAndCollisions(zp);

  // Check player vs robots/Otto/missiles
  checkPlayerCollisions(zp);

  // Check player missile vs robots/Otto
  checkMissileCollisions(zp);

  // Handle player death
  if (zp.playerAnimationIndex === PLAYER_DEATH_ANIM_OFFSET && zp.playerMissileDirection === 0) {
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

// Re-exports for convenience (used by tests and debug scripts)
export { createZeroPage } from "../tia/zeropage";
export { NTSC } from "../constants/index";
export { ROBOT_STAND_ANIM_OFFSET } from "../constants/index";
export { PLAYER_ENTERING_SOUTH } from "../constants/index";

// Alias for createGameStateMachine — matches the name used in test helpers
// Also accepts zp as first arg for test convenience (ignored, uses createZeroPage internally)
export function buildStateMachine(zp: ZeroPage | undefined, region: number = NTSC): GameStateMachine {
  return createGameStateMachine(region);
}
