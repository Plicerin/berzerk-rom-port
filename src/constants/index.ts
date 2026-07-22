// =============================================================================
// Berzerk Constants
// Ported from: Berzerk (decomp).asm
// Original: Atari 1984, Programmer: Dan Hitchens
// Decomp: Dennis Debro
// =============================================================================

// -----------------------------------------------------------------------------
// TIA Constants
// -----------------------------------------------------------------------------

export const H_KERNEL = 176; // kernel horizontal width in scanlines
export const H_FONT = 7;
export const H_ROBOT = 9;
export const H_PLAYER = 12;

export const XMIN = 0;
export const XMAX = 149;
export const XMAX_PLAYER = XMAX - 3; // 146

export const YMIN = 0;

// NUSIZ values
export const ONE_COPY = 0b000;
export const TWO_COPIES = 0b001;
export const TWO_WIDE_COPIES = 0b010;
export const THREE_COPIES = 0b011;
export const DOUBLE_SIZE = 0b101;
export const THREE_MED_COPIES = 0b110;
export const QUAD_SIZE = 0b111;

export const VERTICAL_DELAY = 1;

// REFPx values
export const NO_REFLECT = 0b0000;
export const REFLECT = 0b1000;

// SWCHA joystick bits
export const MOVE_RIGHT = 0b1000;
export const MOVE_LEFT = 0b0100;
export const MOVE_DOWN = 0b0010;
export const MOVE_UP = 0b0001;
export const NO_MOVE = 0b0000;

// SWCHB mask
export const BW_MASK = 0b1000;
export const SELECT_MASK = 0b010;
export const RESET_MASK = 0b001;

// -----------------------------------------------------------------------------
// User Constants
// -----------------------------------------------------------------------------

export const NTSC = 0;
export const PAL = 1;
export const DEFAULT_REGION = NTSC; // default to NTSC

// Frame timing (NTSC)
export const VBLANK_TIME = 0x2c; // 44 frames
export const OVERSCAN_TIME = 0x24; // 36 frames

// NTSC color constants
export const BLACK = 0x00;
export const WHITE = 0x0e;
export const YELLOW = 0x10;
export const RED = 0x30;
export const RED_2 = 0x40;
export const RED_3 = RED_2;
export const RED_4 = RED;
export const PURPLE = 0x50;
export const BLUE = 0x88;
export const GREEN_BLUE = 0xa8;
export const LT_GREEN = 0xca;
export const BROWN = 0xf0;
export const BROWN_2 = BROWN;

// NTSC-specific timing
export const PLAYER_FRACTIONAL_DELAY_NTSC = 0x70; // move 7 out of 16 frames
export const ROBOT_MOVE_DELAY_NTSC = [
  0x20, // move 4 out of 32 frames
  0x28, // move 5 out of 32 frames
  0x30, // move 6 out of 32 frames
  0x38, // move 7 out of 32 frames
  0x40, // move 8 out of 32 frames
  0x48, // move 9 out of 32 frames
  0x50, // move 10 out of 32 frames
  0x58, // move 11 out of 32 frames
];
export const ROBOT_MISSILE_DELAY_NTSC = [
  0x38, // move 7 out of 32 frames
  0x40, // move 8 out of 32 frames
  0x50, // move 10 out of 32 frames
  0x60, // move 12 out of 32 frames
  0x78, // move 15 out of 32 frames
  0x90, // move 18 out of 32 frames
  0xb0, // move 22 out of 32 frames
  0xd0, // move 26 out of 32 frames
];

// PAL frame timing
export const VBLANK_TIME_PAL = 0x36; // 54 frames
export const OVERSCAN_TIME_PAL = 0x2b; // 43 frames
export const PLAYER_FRACTIONAL_DELAY_PAL = 0x86; // move 7 out of 16 frames
export const ROBOT_MOVE_DELAY_PAL = [
  0x26, 0x30, 0x3a, 0x43, 0x4d, 0x56, 0x60, 0x6a,
];
export const ROBOT_MISSILE_DELAY_PAL = [
  0x43, 0x4d, 0x60, 0x73, 0x90, 0xad, 0xd3, 0xfa,
];

export const COLOR_LIGHT_LUM = 0xf7;

// Game constants
export const MAX_GAME_SELECTION = 0x12; // BCD
export const SELECT_DELAY = 26;
export const MAX_ROBOTS = 6;
export const INIT_NUM_LIVES = 3;
export const SHOOTING_ROBOT_SCORE = 0x50; // BCD

// Robot animation offsets (in RobotGraphics array)
export const ROBOT_STAND_ANIM_OFFSET = 0;
export const ROBOT_LEFT_ANIM_OFFSET = 9;
export const ROBOT_RIGHT_ANIM_OFFSET = 12;
export const ROBOT_UP_ANIM_OFFSET = 15;
export const ROBOT_DOWN_ANIM_OFFSET = 19;
export const ROBOT_DEATH_ANIM_OFFSET = 23;

// Player animation offsets
export const PLAYER_STAND_ANIM_OFFSET = 0;
export const PLAYER_RUN_ANIM_OFFSET = 1;
export const PLAYER_DEATH_ANIM_OFFSET = 3;

// Game variation flags
export const EXTRA_LIFE_2000 = 0b10000000;
export const EXTRA_LIFE_1000 = 0b01000000;
export const OTTO_INVINCIBLE = 0b00100000;
export const OTTO_REBOUND = 0b00010000;
export const NO_OTTO = 0b00001000;
export const ROBOT_SHOOTING = 0b00000001;

// Player starting location values
export const PLAYER_ENTERING_NORTH = 0;
export const PLAYER_ENTERING_SOUTH = 1;
export const PLAYER_ENTERING_WEST = 2;
export const PLAYER_ENTERING_EAST = 3;

// Robot shooting directions
export const ROBOT_SHOOTING_RIGHT = 0b0001;
export const ROBOT_SHOOTING_LEFT = 0b0010;
export const ROBOT_SHOOTING_DOWN = 0b0100;
export const ROBOT_SHOOTING_UP = 0b1000;

export const XROBOT_MISSILE_BOX = 20;
export const YROBOT_MISSILE_BOX = 15;

// -----------------------------------------------------------------------------
// Helper: get region-specific values
// -----------------------------------------------------------------------------

export function getFractionalDelay(region: number): number {
  return region === PAL ? PLAYER_FRACTIONAL_DELAY_PAL : PLAYER_FRACTIONAL_DELAY_NTSC;
}

export function getRobotMoveDelay(region: number): number[] {
  return region === PAL ? ROBOT_MOVE_DELAY_PAL : ROBOT_MOVE_DELAY_NTSC;
}

export function getRobotMissileDelay(region: number): number[] {
  return region === PAL ? ROBOT_MISSILE_DELAY_PAL : ROBOT_MISSILE_DELAY_NTSC;
}

export function getVBlankTime(region: number): number {
  return region === PAL ? VBLANK_TIME_PAL : VBLANK_TIME;
}

export function getOverscanTime(region: number): number {
  return region === PAL ? OVERSCAN_TIME_PAL : OVERSCAN_TIME;
}

// -----------------------------------------------------------------------------
// Re-export tables needed by tests
// -----------------------------------------------------------------------------

export { RobotMotionDelayTable } from "../data/tables";
