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
import { gameLogger } from "./logger";

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
  zp.upperPlayfieldLimit = 0;
  zp.lowerPlayfieldLimit = H_KERNEL / 2;
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

function removeRobotAt(zp: ZeroPage, robotIndex: number): void {
  for (let i = robotIndex; i < MAX_ROBOTS - 1; i++) {
    zp.robotAnimationIndex[i] = zp.robotAnimationIndex[i + 1];
    zp.robotHorizPos[i] = zp.robotHorizPos[i + 1];
    zp.robotVertPos[i] = zp.robotVertPos[i + 1];
    zp.robotFineHoriz[i] = zp.robotFineHoriz[i + 1] ?? 0;
    zp.playerCollisions[i + 1] = zp.playerCollisions[i + 2] ?? 0;
  }

  const last = MAX_ROBOTS - 1;
  zp.robotAnimationIndex[last] = ROBOT_DEATH_ANIM_OFFSET + 4;
  zp.robotHorizPos[last] = 0;
  zp.robotVertPos[last] = 0x7f;
  zp.robotFineHoriz[last] = 0;
  zp.playerCollisions[last + 1] = 0;

  // ASM SortRobotVariables speeds remaining robots up when one leaves the list.
  zp.robotMotionDelay = (zp.robotMotionDelay + 2) & 0xff;
  zp.robotMissileSoundIndex = 0x0f;
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
function setupRoomExit(zp: ZeroPage, exitDir: number, frame: number): void {
  // Save the exiting position (used by SetupForPlayerExitingRoom in ASM)
  zp.tempPlayerExitingPos = exitDir;
  zp.gameState = 0xFF;

  // Start the room-close transition from a fully open playfield.
  // Without this, the transition can complete immediately or from stale limits.
  zp.upperPlayfieldLimit = 0;
  zp.lowerPlayfieldLimit = H_KERNEL / 2;

  gameLogger.log("ROOM_EXIT_SETUP", {
    room: zp.gameLevel,
    playerX: zp.playerHorizPos,
    playerY: zp.playerVertPos,
    exitDir,
  }, frame);

  // Hide player (ASM: set playerVertPos to $7F)
  zp.playerVertPos = 0x7f;
  zp.playerAnimationIndex = 0;

  // Reset robot/missile motion state; keep numberRobotsKilled for transition bonus.
  zp.initRobotDelay = 0;
  zp.robotMotionDelay = 0;
  zp.robotMissileDirection = 0;
  zp.robotMissileFlightTime = 0;
  zp.playerMissileDirection = 0;
  zp.playerMissileFlightTime = 0;
  zp.evilOttoLaunchTimer = 0;
}

function getRoomExitDirection(zp: ZeroPage): number | null {
  const doorwayX = InitHorizontalPosition[PLAYER_ENTERING_NORTH];
  const doorwayY = InitVerticalPosition[PLAYER_ENTERING_WEST];
  const horizontalDoorMin = doorwayX - 4;
  const horizontalDoorMax = doorwayX + 4;
  const verticalDoorMin = doorwayY - 4;
  const verticalDoorMax = doorwayY + 4;

  if (zp.playerHorizPos === XMIN &&
      zp.playerVertPos >= verticalDoorMin &&
      zp.playerVertPos <= verticalDoorMax) {
    return PLAYER_ENTERING_WEST;
  }
  if (zp.playerHorizPos >= XMAX_PLAYER &&
      zp.playerVertPos >= verticalDoorMin &&
      zp.playerVertPos <= verticalDoorMax) {
    return PLAYER_ENTERING_EAST;
  }
  if (zp.playerVertPos < YMIN + 2 &&
      zp.playerHorizPos >= horizontalDoorMin &&
      zp.playerHorizPos <= horizontalDoorMax) {
    return PLAYER_ENTERING_NORTH;
  }
  if (zp.playerVertPos >= H_KERNEL - H_PLAYER * 2 &&
      zp.playerHorizPos >= horizontalDoorMin &&
      zp.playerHorizPos <= horizontalDoorMax) {
    return PLAYER_ENTERING_SOUTH;
  }

  return null;
}

/**
 * Setup a new room when the player exits through a doorway.
 * ASM: SetupForNewScreen + ResetRobotsForNewBoard
 */
function transitionToNewRoom(zp: ZeroPage, exitDir: number, frame: number): void {
  const fromRoom = zp.gameLevel;
  zp.gameLevel++;
  zp.gameState = 0;
  zp.kernelSection = GameState.PLAY;
  if (zp.robotVertPos[0] === 0x7f) {
    incrementScoreBCD(zp, (zp.numberRobotsKilled << 4) & 0xff);
  }
  zp.numberRobotsKilled = 0;
  zp.initRobotDelay = 0;
  zp.robotMotionDelay = RobotMotionDelayTable[(zp.gameLevel >> 1) & 7] ?? RobotMotionDelayTable[0];
  zp.mazePF0Value = 0;

  // Reset playfield limits; they will be collapsed again below to create
  // a directional room-open reveal from the incoming doorway.
  zp.upperPlayfieldLimit = 0;
  zp.lowerPlayfieldLimit = H_KERNEL / 2;

  // Pick a new maze (different from current)
  nextRandom(zp);
  let newMaze = zp.randomHi & 3;
  if (newMaze === (zp.mazeOffset / 42 | 0)) {
    newMaze = (newMaze + 2) & 3; // ensure different maze
  }
  zp.mazeOffset = MazeOffsetTable[newMaze];

  const entryDir = StartingLocationValues[exitDir] ?? PLAYER_ENTERING_NORTH;
  zp.playerStartingLocation = entryDir;
  zp.playerHorizPos = InitHorizontalPosition[entryDir];
  zp.playerVertPos = InitVerticalPosition[entryDir];

  // Start the next room collapsed so it opens from the player's incoming side.
  switch (entryDir) {
    case PLAYER_ENTERING_NORTH:
      zp.upperPlayfieldLimit = 0;
      zp.lowerPlayfieldLimit = 0;
      break;
    case PLAYER_ENTERING_SOUTH:
      zp.upperPlayfieldLimit = H_KERNEL / 2;
      zp.lowerPlayfieldLimit = H_KERNEL / 2;
      break;
    case PLAYER_ENTERING_WEST:
      zp.upperPlayfieldLimit = 0;
      zp.lowerPlayfieldLimit = 0;
      break;
    case PLAYER_ENTERING_EAST:
      zp.upperPlayfieldLimit = H_KERNEL / 2;
      zp.lowerPlayfieldLimit = H_KERNEL / 2;
      break;
  }
  zp.playerDirection = NO_MOVE;
  zp.playerAnimationIndex = PLAYER_STAND_ANIM_OFFSET;
  zp.playerMissileDirection = 0;

  // Reset robots (ASM: ResetRobotsForNewBoard)
  resetRobots(zp);

  gameLogger.log("ROOM_CHANGE", {
    fromRoom,
    toRoom: zp.gameLevel,
    exitDir,
    entryDir: zp.playerStartingLocation,
    playerX: zp.playerHorizPos,
    playerY: zp.playerVertPos,
  }, frame);
}

export function updateRobots(zp: ZeroPage, region: number): void {
  // ASM: sec / ror initRobotDelay — rotate right through carry (carry always set,
  // so a 1 bit is always inserted at bit 7). Starting value is $AA in attract mode,
  // or $00 on reset (which then becomes $80 on first tick via sec+ror).
  if (zp.initRobotDelay !== 0xff) {
    zp.initRobotDelay = (zp.initRobotDelay >>> 1 | 0x80) & 0xff;
    return;
  }

  const mazeOffset = zp.mazeOffset ?? 0;

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
      const nextAnim = animIdx + 1;
      if (nextAnim < ROBOT_DEATH_ANIM_OFFSET + 4) {
        zp.robotAnimationIndex[i] = nextAnim;
      } else {
        removeRobotAt(zp, i);
        i--;
      }
      continue;
    }

    // Only animate if the fractional accumulator fired
    if (!shouldAnimate) continue;

    let currentAnim = animIdx & 0x1f;

    // If robot is standing (anim < ROBOT_LEFT_ANIM_OFFSET = 9)
    if (currentAnim < ROBOT_LEFT_ANIM_OFFSET) {
      // ASM only chooses a chase direction from the final standing frame.
      if (currentAnim !== ROBOT_LEFT_ANIM_OFFSET - 1) {
        advanceRobotAnimation(zp, i);
        continue;
      }

      // This robot was selected to move — decide direction for a future frame.
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
            setRobotWalkingDirection(zp, i, ROBOT_UP_ANIM_OFFSET + 1);
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
        zp.robotAnimationIndex[i] = RobotAnimationTableFlat[ROBOT_STAND_ANIM_OFFSET] ?? ROBOT_STAND_ANIM_OFFSET;
      }
      continue;
    }

    // Execute movement based on current walking direction.
    if (currentAnim >= ROBOT_LEFT_ANIM_OFFSET && currentAnim < ROBOT_RIGHT_ANIM_OFFSET) {
      // Walking left — if robot x > player x, move left; otherwise stand
      if (zp.robotHorizPos[i] > zp.playerHorizPos) {
        const nextX = zp.robotHorizPos[i] - 1;
        if (isRobotPositionSafe(nextX, zp.robotVertPos[i], mazeOffset)) {
          zp.robotHorizPos[i] = nextX;
          advanceRobotAnimation(zp, i);
        } else {
          setRobotStanding(zp, i);
        }
      } else {
        setRobotStanding(zp, i);
      }
    } else if (currentAnim >= ROBOT_RIGHT_ANIM_OFFSET && currentAnim < ROBOT_UP_ANIM_OFFSET) {
      // Walking right — if robot x < player x, move right; otherwise stand
      if (zp.robotHorizPos[i] < zp.playerHorizPos) {
        const nextX = zp.robotHorizPos[i] + 1;
        if (isRobotPositionSafe(nextX, zp.robotVertPos[i], mazeOffset)) {
          zp.robotHorizPos[i] = nextX;
          advanceRobotAnimation(zp, i);
        } else {
          setRobotStanding(zp, i);
        }
      } else {
        setRobotStanding(zp, i);
      }
    } else if (currentAnim >= ROBOT_UP_ANIM_OFFSET && currentAnim < ROBOT_DOWN_ANIM_OFFSET) {
      const playerYTarget = (zp.playerVertPos >> 1) + 3;
      if (playerYTarget === zp.robotVertPos[i]) {
        setRobotStanding(zp, i);
        continue;
      }
      if (playerYTarget > zp.robotVertPos[i]) {
        if (zp.robotHorizPos[i] > zp.playerHorizPos) {
          setRobotWalkingDirection(zp, i, ROBOT_LEFT_ANIM_OFFSET);
        } else {
          setRobotWalkingDirection(zp, i, ROBOT_RIGHT_ANIM_OFFSET);
        }
        continue;
      }
      if (currentAnim === ROBOT_UP_ANIM_OFFSET || currentAnim === ROBOT_UP_ANIM_OFFSET + 2) {
        advanceRobotAnimation(zp, i);
        continue;
      }

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
        const nextY = zp.robotVertPos[i] - 1;
        if (isRobotPositionSafe(zp.robotHorizPos[i], nextY, mazeOffset)) {
          zp.robotVertPos[i] = nextY;
          advanceRobotAnimation(zp, i);
        } else {
          setRobotStanding(zp, i);
        }
      }
    } else if (currentAnim >= ROBOT_DOWN_ANIM_OFFSET && currentAnim < ROBOT_DEATH_ANIM_OFFSET) {
      const playerYHalf = zp.playerVertPos >> 1;
      if (playerYHalf <= zp.robotVertPos[i]) {
        if (zp.robotHorizPos[i] > zp.playerHorizPos) {
          setRobotWalkingDirection(zp, i, ROBOT_LEFT_ANIM_OFFSET);
        } else {
          setRobotWalkingDirection(zp, i, ROBOT_RIGHT_ANIM_OFFSET);
        }
        continue;
      }

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
          const nextY = zp.robotVertPos[i] + 1;
          if (isRobotPositionSafe(zp.robotHorizPos[i], nextY, mazeOffset)) {
            zp.robotVertPos[i] = nextY;
            advanceRobotAnimation(zp, i);
          } else {
            setRobotStanding(zp, i);
          }
        }
      }
    }

    // Clamp position
    if (zp.robotHorizPos[i] < XMIN) zp.robotHorizPos[i] = XMIN;
    if (zp.robotHorizPos[i] > XMAX) zp.robotHorizPos[i] = XMAX;
    if (zp.robotVertPos[i] < YMIN) zp.robotVertPos[i] = YMIN;
    if (zp.robotVertPos[i] > 159) zp.robotVertPos[i] = 159;
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
    launchRobotMissile(zp, robotIdx, dir, region);
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
    launchRobotMissile(zp, robotIdx, dir, region);
  }
}

function launchRobotMissile(zp: ZeroPage, robotIdx: number, direction: number, region: number): void {
  // Set robot back to standing when it fires
  if (zp.robotAnimationIndex[robotIdx] >= ROBOT_LEFT_ANIM_OFFSET) {
    zp.robotAnimationIndex[robotIdx] = ROBOT_STAND_ANIM_OFFSET;
  }

  // Rate-limit: don't allow another shot until missile is gone and delay has passed
  // ASM: RobotMissileDelay counts down from 0xff; robots can't fire while it's > 0
  // This prevents machine-gun shooting
  if (zp.robotMissileDelay > 0) return;

  zp.robotMissileDelay = 0xff;
  zp.robotMissileSoundIndex = 0xff;
  zp.robotMissileDirection = direction;
  zp.robotMissileFlightTime = 1;

  // Set missile starting position from robot position
  zp.robotMissileVertPos = zp.robotVertPos[robotIdx] + InitRobotMissileYOffset[direction];
  zp.robotMissileHorizPos = zp.robotHorizPos[robotIdx] + InitRobotMissileXOffset[direction];

  // LaunchRobotMissile falls through to DetermineMoveRobotMissile in the ROM,
  // so a newly launched missile can move during the launch frame.
  updateRobotMissile(zp, region);
}

/**
 * Update robot missile.
 */
function updateRobotMissile(zp: ZeroPage, region: number): void {
  if (zp.robotMissileDirection === 0) {
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
    const sum = zp.robotMissileDelay + delayValue + (gameLevel & 1);
    zp.robotMissileDelay = sum & 0xff;
    if (sum <= 0xff) {
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
      zp.robotMissileVertPos += 1;
      break;
    case ROBOT_SHOOTING_UP:
      zp.robotMissileVertPos -= 1;
      break;
  }
}

// -----------------------------------------------------------------------------
// Evil Otto logic
// -----------------------------------------------------------------------------

/**
 * Update Evil Otto — matches ASM CheckPlayerOttoCollision + DetermineEvilOttoParameters
 * + DetermineEvilOttoMovement.
 *
 * ASM mapping:
 * - CheckPlayerOttoCollision, lines 840-866: active when timer >= 3; even frames only;
 *   horizontal box is Otto+7/player+7 and vertical box is Otto+H_PLAYER-1/player+H_PLAYER+8.
 * - DetermineEvilOttoParameters, lines 1031-1056: even frames only; launch logic is gated by
 *   robotVertPos+MAX_ROBOTS-2 == $7F and OTTO_INVINCIBLE|OTTO_REBOUND; timer increments only
 *   when frameCount == 0, then Otto spawn/prev/temp/horiz are initialized from spawn tables.
 * - DetermineEvilOttoMovement, lines 1059-1131: move only when robotVertPos[0] == $7F or
 *   (robotMotionDelay ASL, ADC robotMotion) carries; bounce only after reaching tempOttoVertPos;
 *   prev tracks player by net -2/+2; horizontal movement is one pixel toward player.
 */
function updateEvilOtto(zp: ZeroPage, region: number): void {
  // Skip if NO_OTTO flag is set
  if (zp.gameVariation & NO_OTTO) {
    return;
  }

  // ---- Launch sequence (ASM lines 1031-1056) ----
  if ((zp.frameCount & 1) === 0 &&
      zp.robotVertPos[MAX_ROBOTS - 2] === 0x7f &&
      (zp.gameVariation & (OTTO_INVINCIBLE | OTTO_REBOUND))) {
    if (zp.evilOttoLaunchTimer < 3) {
      if (zp.frameCount === 0) {
        zp.evilOttoLaunchTimer++;
        zp.ottoVerticalDelta = 1;
        const spawnLoc = zp.playerStartingLocation;
        zp.evilOttoVertPos = InitVerticalPosition[spawnLoc];
        zp.prevEvilOttoVertPos = zp.evilOttoVertPos;
        zp.tempOttoVertPos = zp.evilOttoVertPos + 16;
        zp.evilOttoHorizPos = InitHorizontalPosition[spawnLoc];
      }
      return;
    }

    // ---- Otto movement (ASM DetermineEvilOttoMovement, lines 1059-1131) ----
    const firstRobotOffScreen = zp.robotVertPos[0] === 0x7f;
    const doubledDelay = (zp.robotMotionDelay << 1) & 0xff;
    const carryFromAsl = zp.robotMotionDelay >= 0x80 ? 1 : 0;
    const robotMotionSum = doubledDelay + zp.robotMotion + carryFromAsl;
    const shouldMoveOtto = firstRobotOffScreen || robotMotionSum > 0xff;

    if (shouldMoveOtto) {
      zp.evilOttoVertPos += zp.ottoVerticalDelta;

      if (zp.evilOttoVertPos >= zp.prevEvilOttoVertPos) {
        if (zp.evilOttoVertPos >= zp.tempOttoVertPos) {
          zp.ottoVerticalDelta = -4;

          if (zp.prevEvilOttoVertPos < zp.playerVertPos) {
            zp.prevEvilOttoVertPos += 4;
          }
          zp.prevEvilOttoVertPos -= 2;

          let tempVert = zp.prevEvilOttoVertPos + 20;
          const maxTemp = H_KERNEL - (H_PLAYER - 1) * 2;
          if (tempVert > maxTemp) tempVert = maxTemp;
          zp.tempOttoVertPos = tempVert;
        }
      } else {
        zp.ottoVerticalDelta = 3;

        if (zp.prevEvilOttoVertPos >= zp.playerVertPos) {
          zp.ottoVerticalDelta = -4;
        } else {
          zp.prevEvilOttoVertPos += 4;
        }
        zp.prevEvilOttoVertPos -= 2;

        let tempVert = zp.prevEvilOttoVertPos + 20;
        const maxTemp = H_KERNEL - (H_PLAYER - 1) * 2;
        if (tempVert > maxTemp) tempVert = maxTemp;
        zp.tempOttoVertPos = tempVert;
      }

      // DetermineOttoPosition (ASM lines 1095-1103)
      if (zp.ottoVerticalDelta >= 0 && zp.prevEvilOttoVertPos + 5 < zp.evilOttoVertPos) {
        zp.evilOttoVertPos = zp.tempOttoVertPos;
      }

      // DetermineOttoHorizPosition (ASM lines 1107-1115)
      if (zp.evilOttoHorizPos < zp.playerHorizPos) {
        zp.evilOttoHorizPos++;
      } else if (zp.evilOttoHorizPos > zp.playerHorizPos) {
        zp.evilOttoHorizPos--;
      }
    }
  }

  // ---- Otto collision check (ASM lines 840-870) ----
  // Only check if Otto has launched
  if (zp.evilOttoLaunchTimer >= 3) {
    // Only check on even frames (ASM: frameCount ror → branch if odd)
    if ((zp.frameCount & 1) === 0) {
      // Check if Otto overlaps player in 7px box
      const playerTop = zp.playerVertPos - (H_PLAYER - 1);
      const playerBottom = zp.playerVertPos + H_PLAYER + 8;

      if (zp.evilOttoHorizPos >= zp.playerHorizPos - 7 &&
          zp.evilOttoHorizPos <= zp.playerHorizPos + 7 &&
          zp.evilOttoVertPos >= playerTop &&
          zp.evilOttoVertPos <= playerBottom) {
        // Otto collision — kill player
        triggerPlayerDeath(zp);
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Player logic
// -----------------------------------------------------------------------------

function updatePlayer(
  zp: ZeroPage,
  region: number,
  wasShooting: boolean,
  frame: number,
  movementInput: number,
): void {
  // Skip if player is dying or exiting
  if (
    zp.playerAnimationIndex >= PLAYER_DEATH_ANIM_OFFSET ||
    zp.playerAnimationIndex === PlayerAnimState.EXITING
  ) {
    return;
  }

  // Determine player animation state.
  // ROM behavior:
  // - no movement: force standing and reset fractional motion
  // - firing: reset fractional motion, but visual firing pose is derived at render time
  // - movement animation advances only when the fractional accumulator overflows
  const isShooting = wasShooting;
  const isMoving =
    (movementInput & (MOVE_UP | MOVE_DOWN | MOVE_LEFT | MOVE_RIGHT)) !== 0;

  if (!isMoving) {
    zp.playerAnimationIndex = PLAYER_STAND_ANIM_OFFSET;
    zp.playerMotion = 0;
  } else if (isShooting) {
    zp.playerMotion = 0;
  }

  // Player movement — ASM fractional accumulator:
  //   lda playerMotion / adc playerMotionDelay / sta playerMotion / bcc skip
  //   Accumulator overflows ~26 times/sec at NTSC (112/256).
  const fractionalDelay = getFractionalDelay(region);
  const sum = zp.playerMotion + fractionalDelay;
  zp.playerMotion = sum & 0xff;

  if (sum > 0xff) {
    zp.playerAnimationIndex--;
    if (zp.playerAnimationIndex < 0) {
      zp.playerAnimationIndex = PLAYER_RUN_ANIM_OFFSET + 1;
    }

    // Horizontal movement
    if (movementInput & MOVE_RIGHT) {
      zp.playerHorizPos += 1;
    }
    if (movementInput & MOVE_LEFT) {
      zp.playerHorizPos -= 1;
    }

    // Vertical movement
    if (movementInput & MOVE_DOWN) {
      zp.playerVertPos += 1;
    }
    if (movementInput & MOVE_UP) {
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
    const exitDirection = getRoomExitDirection(zp);
    const atLeftExit = exitDirection === PLAYER_ENTERING_WEST && !isPositionInWall(0, zp.playerVertPos, mazeOff);
    const atRightExit = exitDirection === PLAYER_ENTERING_EAST && !isPositionInWall(XMAX_PLAYER, zp.playerVertPos, mazeOff);
    const atTopExit = exitDirection === PLAYER_ENTERING_NORTH && !isPositionInWall(zp.playerHorizPos, 0, mazeOff);
    const atBottomExit = exitDirection === PLAYER_ENTERING_SOUTH && !isPositionInWall(zp.playerHorizPos, 159, mazeOff);

    const triggered = exitDirection !== null && (atLeftExit || atRightExit || atTopExit || atBottomExit);
    gameLogger.log("EXIT_CHECK", {
      room: zp.gameLevel,
      playerX: zp.playerHorizPos,
      playerY: zp.playerVertPos,
      atLeftExit,
      atRightExit,
      atTopExit,
      atBottomExit,
      triggered,
      exitSide: atLeftExit ? "LEFT" : atRightExit ? "RIGHT" : atTopExit ? "TOP" : atBottomExit ? "BOTTOM" : "NONE",
    }, frame);

    if (triggered) {
      setupRoomExit(zp, exitDirection, frame);
      return;
    }
  }
}

// -----------------------------------------------------------------------------
// Player missile logic
// -----------------------------------------------------------------------------

function firePlayerMissile(zp: ZeroPage): void {
  if (zp.playerMissileFlightTime !== 0) {
    return; // already firing
  }

  const direction = zp.playerDirection & 0x0f;
  if (direction === 0) return;

  // ASM launch path: NextRandom, inc playerMissileFlightTime, store the raw
  // playerDirection nibble, then seed X and 2LK Y positions from direction tables.
  nextRandom(zp);
  zp.playerMissileFlightTime = 1;
  zp.playerMissileDirection = direction;
  zp.playerMissileHorizPos = zp.playerHorizPos + (InitMissileXOffsetTable[direction] ?? 0);
  zp.playerMissileVertPos = (zp.playerVertPos >> 1) + (InitMissileYOffsetTable[direction] ?? 0);
  zp.audioIndex = 0xff;
}

function updatePlayerMissile(zp: ZeroPage): void {
  if (zp.playerMissileFlightTime === 0 || zp.playerMissileDirection === 0) {
    return;
  }

  const direction = zp.playerMissileDirection & 0x0f;
  zp.playerMissileVertPos += VerticalPixelOffsets[direction] ?? 0;
  zp.playerMissileHorizPos += (HorizontalPixelOffsets[direction] ?? 0) * 2;
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
  if (zp.playerAnimationIndex >= PLAYER_DEATH_ANIM_OFFSET) return; // already dying
  zp.playerAnimationIndex = PLAYER_DEATH_ANIM_OFFSET;
  zp.audioIndex = 8;
  // Sentinel so the newly-triggered death state does not advance until next tick.
  zp.playerMotion = 0xff;
}

/**
 * Check player vs robots and Evil Otto.
 * ASM: CheckPlayerHarmfulCollisions
 */
function checkPlayerCollisions(zp: ZeroPage): void {
  // Check player vs robots (CXPPMM bit 7)
  for (let i = 0; i < MAX_ROBOTS; i++) {
    if (zp.robotAnimationIndex[i] >= ROBOT_DEATH_ANIM_OFFSET) continue;
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
  if (zp.playerAnimationIndex >= PLAYER_DEATH_ANIM_OFFSET) return;

  // Player missile vs robots (CXM0P bit 7)
  for (let i = 0; i < MAX_ROBOTS; i++) {
    if (zp.robotAnimationIndex[i] >= ROBOT_DEATH_ANIM_OFFSET) continue;
    if (zp.robotVertPos[i] === 0x7f) continue;

    const dx = Math.abs(zp.playerMissileHorizPos - zp.robotHorizPos[i]);
    const dy = Math.abs(zp.playerMissileVertPos - zp.robotVertPos[i]);

    if (dx < H_ROBOT && dy < H_ROBOT) {
      zp.robotAnimationIndex[i] = ROBOT_DEATH_ANIM_OFFSET;
      zp.playerMissileDirection = 0;
      zp.playerMissileFlightTime = 0;
      zp.numberRobotsKilled++;

      incrementScoreBCD(zp, SHOOTING_ROBOT_SCORE);
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
function checkPlayerWallCollisions(zp: ZeroPage, frame: number): void {
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

  // Log wall collision before reverting
  gameLogger.log("WALL_COLLISION", {
    room: zp.gameLevel,
    playerX: px,
    playerY: py,
    playerDir: zp.playerDirection,
  }, frame);

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

function bcdAddByte(value: number, amount: number, carryIn: number): { value: number; carry: number } {
  let low = (value & 0x0f) + (amount & 0x0f) + carryIn;
  let carry = 0;
  if (low > 9) {
    low -= 10;
    carry = 1;
  }

  let high = ((value >> 4) & 0x0f) + ((amount >> 4) & 0x0f) + carry;
  carry = 0;
  if (high > 9) {
    high -= 10;
    carry = 1;
  }

  return { value: ((high << 4) | low) & 0xff, carry };
}

/**
 * Increment score by a one-byte BCD value using the ASM's 3-byte packed BCD layout.
 * playerScore0/playerScore1/playerScore2 mirror playerScore/playerScore+1/playerScore+2.
 */
function incrementScoreBCD(zp: ZeroPage, bcdAmount: number): void {
  const oldMiddleScoreByte = zp.playerScore1;
  const score = [zp.playerScore0, zp.playerScore1, zp.playerScore2];
  let amount = bcdAmount & 0xff;
  let carry = 0;

  for (let y = 2; y >= 0; y--) {
    const result = bcdAddByte(score[y], amount, carry);
    score[y] = result.value;
    carry = result.carry;
    amount = 0;
  }

  zp.playerScore0 = score[0];
  zp.playerScore1 = score[1];
  zp.playerScore2 = score[2];

  if (zp.gameVariation & EXTRA_LIFE_1000) {
    if ((oldMiddleScoreByte & 0x0f) === 0x09 && oldMiddleScoreByte !== zp.playerScore1) {
      zp.gameState = 0x03;
      zp.numberOfLives++;
    }
  } else if (zp.gameVariation & EXTRA_LIFE_2000) {
    if ((oldMiddleScoreByte & 0x1f) === 0x19 &&
        (oldMiddleScoreByte & 0x0f) === 0x09 &&
        oldMiddleScoreByte !== zp.playerScore1) {
      zp.gameState = 0x03;
      zp.numberOfLives++;
    }
  }
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
  const zp = createZeroPage();
  initGame(zp, 0, region);

  return {
    zp,
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
  zp.frameCount = state.frameCount & 0xff;

  // Keep the ROM-style RNG advancing every frame so robot selection,
  // room changes, and AI axis choices do not get stuck on a stale seed.
  nextRandom(zp);

  // Room exit transition (ASM: VBLANK handles SetupForPlayerExitingRoom when gameState == $FF)
  if (zp.gameState === 0xff) {
    const fromRoom = zp.gameLevel;
    // Adjust playfield limits based on exit direction.
    // North/south use vertical close; west/east use horizontal close.
    const exitDir = zp.tempPlayerExitingPos;
    if (exitDir === PLAYER_ENTERING_NORTH || exitDir === PLAYER_ENTERING_WEST) {
      zp.upperPlayfieldLimit++;
    }
    if (exitDir === PLAYER_ENTERING_SOUTH || exitDir === PLAYER_ENTERING_EAST) {
      zp.lowerPlayfieldLimit--;
    }

    // When limits meet, transition to new room
    if (zp.upperPlayfieldLimit >= zp.lowerPlayfieldLimit) {
      gameLogger.log("ROOM_EXIT_TRANSITION", {
        room: fromRoom,
        playerX: zp.playerHorizPos,
        playerY: zp.playerVertPos,
        upperPlayfieldLimit: zp.upperPlayfieldLimit,
        lowerPlayfieldLimit: zp.lowerPlayfieldLimit,
      }, state.frameCount);
      transitionToNewRoom(zp, exitDir, state.frameCount);
      return; // tick is done for this frame
    }

    // Still in transition — skip normal game logic
    return;
  }

  // Room opening reveal for the newly entered screen.
  if (zp.upperPlayfieldLimit !== 0 || zp.lowerPlayfieldLimit !== H_KERNEL / 2) {
    const entryDir = zp.playerStartingLocation;
    if (entryDir === PLAYER_ENTERING_NORTH || entryDir === PLAYER_ENTERING_WEST) {
      zp.lowerPlayfieldLimit = Math.min(H_KERNEL / 2, zp.lowerPlayfieldLimit + 1);
    }
    if (entryDir === PLAYER_ENTERING_SOUTH || entryDir === PLAYER_ENTERING_EAST) {
      zp.upperPlayfieldLimit = Math.max(0, zp.upperPlayfieldLimit - 1);
    }

    if (zp.upperPlayfieldLimit > zp.lowerPlayfieldLimit) {
      zp.upperPlayfieldLimit = zp.lowerPlayfieldLimit;
    }
  }

  // VBLANK: clear state, update attract timer
  // This is where the 2600 would clear the screen and handle vertical blanking.
  // In the game logic, we use this to update timers and check for state transitions.

  // Log joystick input changes (only during PLAY state)
  if (zp.kernelSection === GameState.PLAY) {
    const joystickChanged = state.joystickInput !== state.lastJoystickInput;
    if (joystickChanged || state.frameCount % 30 === 0) {
      const dirBits = state.joystickInput & 0x0f;
      const dirNames: string[] = [];
      if (dirBits & MOVE_UP) dirNames.push("UP");
      if (dirBits & MOVE_DOWN) dirNames.push("DOWN");
      if (dirBits & MOVE_LEFT) dirNames.push("LEFT");
      if (dirBits & MOVE_RIGHT) dirNames.push("RIGHT");
      if (dirBits) {
        gameLogger.log("JOYSTICK", {
          room: zp.gameLevel,
          direction: dirNames.join("+"),
          fire: !!(state.joystickInput & 0x10),
          playerX: zp.playerHorizPos,
          playerY: zp.playerVertPos,
        }, state.frameCount);
      }
    }
  }

  // Update color cycling (attract mode)
  if (zp.kernelSection === GameState.ATTRACT) {
    updateColorCycling(zp);
  }

  // ASM ReadJoystickValues only writes playerDirection when movement bits are
  // pressed. Releasing the stick preserves facing for fire pose/missile launch.
  const joystickDirection = state.joystickInput & 0x0f;
  if (joystickDirection !== 0) {
    zp.playerDirection = joystickDirection;
  }

  const fireHeld = (state.joystickInput & 0x10) !== 0;
  const shootingAtStart = zp.playerMissileFlightTime !== 0;
  if (fireHeld) {
    firePlayerMissile(zp);
  }

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

  state.lastJoystickInput = state.joystickInput;

  // Determine if player is shooting: was shooting at start OR just fired this tick
  const isShooting = shootingAtStart || fireHeld || zp.playerMissileFlightTime !== 0;

  // Update player movement
  updatePlayer(zp, region, isShooting, state.frameCount, joystickDirection);

  // Check player vs playfield walls (ASM: CXP0FB collision)
  checkPlayerWallCollisions(zp, state.frameCount);

  // Check missile bounds and wall collisions (ASM: DetermineToTurnOffMissiles)
  checkMissileBoundsAndCollisions(zp);

  // Check player vs robots/Otto/missiles
  checkPlayerCollisions(zp);

  // Check player missile vs robots/Otto
  checkMissileCollisions(zp);

  // Handle player death using the ROM-style animation counter.
  // While the value is >= PLAYER_DEATH_ANIM_OFFSET and still positive signed,
  // the death animation advances. Once bit 7 is set, the next frame consumes a life.
  if (zp.playerAnimationIndex >= PLAYER_DEATH_ANIM_OFFSET) {
    if (zp.playerMotion === 0xff) {
      zp.playerMotion = 0;
    } else if ((zp.playerAnimationIndex & 0x80) === 0) {
      zp.playerAnimationIndex = (zp.playerAnimationIndex + 1) & 0xff;
    } else {
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
