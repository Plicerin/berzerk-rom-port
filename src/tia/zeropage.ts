// =============================================================================
// Zero Page Memory Map ($85-$FE)
// Ported from: Berzerk (decomp).asm lines 292-371
//
// These are the key zero-page variable addresses used throughout the game.
// The JS port tracks these as properties of a GameMemory state object.
// =============================================================================

/**
 * All zero-page variables in one interface.
 * The JS port maintains a single GameMemory object that mirrors this layout.
 */
export interface ZeroPage {
  // $85 - colorEOR / START_GAME_RAM
  colorEOR: number;

  // $86 - selectDebounce
  selectDebounce: number;

  // $87 - attractModeTimer
  attractModeTimer: number;

  // $88 - gameVariation
  gameVariation: number;

  // $89-$8A - playerGraphicPointer (16-bit)
  playerGraphicPointerLo: number;
  playerGraphicPointerHi: number;

  // $8B - playerVertPos
  playerVertPos: number;

  // $8C - player0Scanline
  player0Scanline: number;

  // $8D - playerUpperBoundary
  playerUpperBoundary: number;

  // $8E - playerDirection
  playerDirection: number;

  // $8F-$90 - playerMissilePointer (16-bit)
  playerMissilePointerLo: number;
  playerMissilePointerHi: number;

  // $91 - playerAnimationIndex
  playerAnimationIndex: number;

  // $92 - playerMotion (fractional delay for player movement)
  playerMotion: number;

  // $93 - playerHorizPos
  playerHorizPos: number;

  // $94 - playerMissileFlightTime
  playerMissileFlightTime: number;

  // $95 - playerMissileDirection
  playerMissileDirection: number;

  // $96 - playerMissileHorizPos
  playerMissileHorizPos: number;

  // $97 - playerMissileVertPos
  playerMissileVertPos: number;

  // $98-$99 - robotMissilePointer (16-bit)
  robotMissilePointerLo: number;
  robotMissilePointerHi: number;

  // $9A - robotMissileDirection
  robotMissileDirection: number;

  // $9B - robotMissileDelay (fractional delay value for missile)
  robotMissileDelay: number;

  // $9C - robotMissileFlightTime
  robotMissileFlightTime: number;

  // $9D - robotMissileHorizPos
  robotMissileHorizPos: number;

  // $9E - robotMissileVertPos
  robotMissileVertPos: number;

  // $9F - delayRobotAnimation / robotFineHoriz (shared)
  // $9F-$A6 - robotFineHoriz (6 robots × 8 bytes each)
  robotFineHoriz: number[];

  // $A6 - upperPlayfieldLimit (upper scanline limit for screen transition)
  upperPlayfieldLimit: number;

  // $A7-$AE - robotCoarseHoriz (6 robots)
  // $AE - evilOttoHorizPos (alias)
  robotCoarseHoriz: number[];
  evilOttoHorizPos: number;

  // $AF-$B6 - robotPointers (6 robots × 2 bytes each)
  robotPointers: number[];

  // $B7 - robotMotion (fractional delay for robot movement)
  robotMotion: number;

  // $B8-$C0 - robotVertPos (6 robots)
  robotVertPos: number[];

  // $C1-$C8 - robotHorizPos (6 robots)
  robotHorizPos: number[];

  // $C8 - tempOttoVertPos (alias with robotVertPos[5])
  tempOttoVertPos: number;

  // $C9-$D0 - playerCollisions (8 entries)
  playerCollisions: number[];

  // $D0 - lowerPlayfieldLimit (alias with playerCollisions[7])
  lowerPlayfieldLimit: number;

  // $D1 - prevEvilOttoVertPos
  prevEvilOttoVertPos: number;

  // $D2-$D9 - robotAnimationIndex (6 robots)
  // $D9 - evilOttoVertPos (alias)
  robotAnimationIndex: number[];
  evilOttoVertPos: number;

  // $DA - numberOfLives
  numberOfLives: number;

  // $DB - numberRobotsKilled
  numberRobotsKilled: number;

  // $DC - gameLevel
  gameLevel: number;

  // $DD-$DF - playerScore (3 packed BCD bytes, high/mid/low = 6 display digits)
  playerScore0: number; // high byte: hundred-thousands / ten-thousands
  playerScore1: number; // middle byte: thousands / hundreds
  playerScore2: number; // low byte: tens / ones

  // $E0 - robotMotionDelay
  robotMotionDelay: number;

  // $E1 - mazePF0Value
  mazePF0Value: number;

  // $E1 - mazeOffset (also stored at $E1, aliased with mazePF0Value in some contexts)
  mazeOffset: number;

  // $E2 - playerStartingLocation
  playerStartingLocation: number;

  // $E3-$E4 - random (16-bit RNG state)
  randomLo: number;
  randomHi: number;

  // $E5 - initRobotDelay (robots not active until value is 255)
  initRobotDelay: number;

  // $E6/$E7 - temp01/temp02 (used for various things)
  // $E6 is also aliased as lsbDigitPointer and robotGraphics
  temp01: number;
  temp02: number;

  // $E8 - loopCount (also aliased as randomNumberMax)
  loopCount: number;

  // $E9 - lastRobotVertPos (also aliased as tempCharHolder and compRobotToMove)
  lastRobotVertPos: number;

  // $EA-$F5 - digitPointer (6 digits for score display)
  digitPointer: number[];

  // $F6 - evilOttoLaunchTimer
  evilOttoLaunchTimer: number;

  // $F7 - audioIndex
  audioIndex: number;

  // $F8 - robotMissileSoundIndex
  robotMissileSoundIndex: number;

  // $F9 - ottoVerticalDelta
  ottoVerticalDelta: number;

  // $FC - kernelSection
  kernelSection: number;

  // $E6 - gameState (used for room exit transition: $FF = exiting room)
  gameState: number;

  // $FD - playerGraphicLSB (also aliased as player0Graphic)
  playerGraphicLSB: number;

  // $FE - robotCoarsePos (value to coarse move robot in kernel)
  robotCoarsePos: number;

  // $FF - frameCount (global frame counter, mirrored in GameStateMachine)
  frameCount: number;

  // Aliases (these point to the same memory locations)
  robotGraphics: number[];       // alias of temp01
  tempPlayerExitingPos: number;  // alias of robotGraphics
}

/**
 * Create a fresh zero-page state initialized to zero.
 */
export function createZeroPage(): ZeroPage {
  return {
    colorEOR: 0,
    selectDebounce: 0,
    attractModeTimer: 0,
    gameVariation: 0,
    playerGraphicPointerLo: 0,
    playerGraphicPointerHi: 0,
    playerVertPos: 0,
    player0Scanline: 0,
    playerUpperBoundary: 0,
    playerDirection: 0,
    playerMissilePointerLo: 0,
    playerMissilePointerHi: 0,
    playerAnimationIndex: 0,
    playerMotion: 0,
    playerHorizPos: 0,
    playerMissileFlightTime: 0,
    playerMissileDirection: 0,
    playerMissileHorizPos: 0,
    playerMissileVertPos: 0,
    robotMissilePointerLo: 0,
    robotMissilePointerHi: 0,
    robotMissileDirection: 0,
    robotMissileDelay: 0,
    robotMissileFlightTime: 0,
    robotMissileHorizPos: 0,
    robotMissileVertPos: 0,
    robotFineHoriz: new Array(6).fill(0),
    upperPlayfieldLimit: 0,
    robotCoarseHoriz: new Array(6).fill(0),
    evilOttoHorizPos: 0,
    robotPointers: new Array(6).fill(0),
    robotMotion: 0,
    robotVertPos: new Array(6).fill(0),
    robotHorizPos: new Array(6).fill(0),
    tempOttoVertPos: 0,
    playerCollisions: new Array(8).fill(0),
    lowerPlayfieldLimit: 0,
    prevEvilOttoVertPos: 0,
    robotAnimationIndex: new Array(6).fill(0),
    evilOttoVertPos: 0,
    numberOfLives: 0,
    numberRobotsKilled: 0,
    gameLevel: 0,
    playerScore0: 0,
    playerScore1: 0,
    playerScore2: 0,
    robotMotionDelay: 0,
    mazePF0Value: 0,
    mazeOffset: 0,
    playerStartingLocation: 0,
    randomLo: 0,
    randomHi: 0,
    initRobotDelay: 0,
    temp01: 0,
    temp02: 0,
    loopCount: 0,
    lastRobotVertPos: 0,
    digitPointer: new Array(6).fill(0),
    evilOttoLaunchTimer: 0,
    audioIndex: 0,
    robotMissileSoundIndex: 0,
    ottoVerticalDelta: 0,
    kernelSection: 0,
    gameState: 0,
    playerGraphicLSB: 0,
    robotCoarsePos: 0,
    frameCount: 0,
    // Aliases
    robotGraphics: [],  // will reference temp01 in actual usage
    tempPlayerExitingPos: 0,
  };
}

// Zero page address constants for reference
export const ZP_COLOR_EOR = 0x85;
export const ZP_SELECT_DEBOUNCE = 0x86;
export const ZP_ATTRACT_MODE_TIMER = 0x87;
export const ZP_GAME_VARIATION = 0x88;
export const ZP_PLAYER_GRAPHIC_POINTER = 0x89;
export const ZP_PLAYER_VERT_POS = 0x8B;
export const ZP_PLAYER0_SCANLINE = 0x8C;
export const ZP_PLAYER_UPPER_BOUNDARY = 0x8D;
export const ZP_PLAYER_DIRECTION = 0x8E;
export const ZP_PLAYER_MISSILE_POINTER = 0x8F;
export const ZP_PLAYER_ANIMATION_INDEX = 0x91;
export const ZP_PLAYER_MOTION = 0x92;
export const ZP_PLAYER_HORIZ_POS = 0x93;
export const ZP_PLAYER_MISSILE_FLIGHT_TIME = 0x94;
export const ZP_PLAYER_MISSILE_DIRECTION = 0x95;
export const ZP_PLAYER_MISSILE_HORIZ_POS = 0x96;
export const ZP_PLAYER_MISSILE_VERT_POS = 0x97;
export const ZP_ROBOT_MISSILE_POINTER = 0x98;
export const ZP_ROBOT_MISSILE_DIRECTION = 0x9A;
export const ZP_ROBOT_MISSILE_DELAY = 0x9B;
export const ZP_ROBOT_MISSILE_FLIGHT_TIME = 0x9C;
export const ZP_ROBOT_MISSILE_HORIZ_POS = 0x9D;
export const ZP_ROBOT_MISSILE_VERT_POS = 0x9E;
export const ZP_DELAY_ROBOT_ANIMATION = 0x9F;
export const ZP_UPPER_PLAYFIELD_LIMIT = 0xA6;
export const ZP_ROBOT_COARSE_HORIZ = 0xA7;
export const ZP_EVILOTT0_HORIZ_POS = 0xAE;
export const ZP_ROBOT_POINTERS = 0xAF;
export const ZP_ROBOT_MOTION = 0xB7;
export const ZP_ROBOT_VERT_POS = 0xB8;
export const ZP_ROBOT_HORIZ_POS = 0xC1;
export const ZP_PLAYER_COLLISIONS = 0xC9;
export const ZP_LOWER_PLAYFIELD_LIMIT = 0xD0;
export const ZP_PREV_EVILOTT0_VERT_POS = 0xD1;
export const ZP_ROBOT_ANIMATION_INDEX = 0xD2;
export const ZP_EVILOTT0_VERT_POS = 0xD9;
export const ZP_NUMBER_OF_LIVES = 0xDA;
export const ZP_NUMBER_ROBOTS_KILLED = 0xDB;
export const ZP_GAME_LEVEL = 0xDC;
export const ZP_PLAYER_SCORE = 0xDD;
export const ZP_ROBOT_MOTION_DELAY = 0xE0;
export const ZP_MAZE_PF0_VALUE = 0xE1;
export const ZP_PLAYER_STARTING_LOCATION = 0xE2;
export const ZP_RANDOM = 0xE3;
export const ZP_INIT_ROBOT_DELAY = 0xE5;
export const ZP_TEMP01 = 0xE6;
export const ZP_TEMP02 = 0xE7;
export const ZP_LOOP_COUNT = 0xE8;
export const ZP_LAST_ROBOT_VERT_POS = 0xE9;
export const ZP_DIGIT_POINTER = 0xEA;
export const ZP_EVILOTT0_LAUNCH_TIMER = 0xF6;
export const ZP_AUDIO_INDEX = 0xF7;
export const ZP_ROBOT_MISSILE_SOUND_INDEX = 0xF8;
export const ZP_OTTO_VERTICAL_DELTA = 0xF9;
export const ZP_KERNEL_SECTION = 0xFC;
export const ZP_PLAYER_GRAPHIC_LSB = 0xFD;
export const ZP_ROBOT_COARSE_POS = 0xFE;
