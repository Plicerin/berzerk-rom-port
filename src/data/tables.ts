// =============================================================================
// Data Tables
// Ported from: Berzerk (decomp).asm
// All sprite data, maze data, color tables, and animation tables.
// =============================================================================

// -----------------------------------------------------------------------------
// Maze PF0/PF1/PF2 Data
// Stored as flat arrays: 4 mazes × 42 bytes each = 168 bytes total.
// The ASM kernel indexes with: index = (scanline / 2) + mazeOffset
// where mazeOffset is from MazeOffsetTable = [0, 42, 84, 126].
// PF0 is ORed with mazePF0Value at render time.
// -----------------------------------------------------------------------------

// Maze PF0 Data (flat, 168 bytes = 4 × 42)
// Extracted byte-for-byte from ASM MazePF0Data through MazePF0Data_3.
// Each maze is exactly 42 bytes. ASM uses +1 offset when indexing.
export const MazePF0Data: number[] = [
  // Maze 0 (offset 0): 2 zeros, 13×$20, 16 zeros, 11×$20
  0x00, 0x00,
  0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
  // Maze 1 (offset 42): 15×$20, 16 zeros, $E0, 10×$20
  0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xe0, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
  // Maze 2 (offset 84): 6×$20, 3×$2F, 6×$20, 16 zeros, 11×$20
  0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x2f, 0x2f, 0x2f, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
  // Maze 3 (offset 126): 15×$20, 16 zeros, 11×$20
  0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20,
];

// Filler / missile data (not used for maze rendering)
export const MissileDataFiller: number[] = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff,
];

// Maze PF1 Data (flat, 168 bytes = 4 × 42)
export const MazePF1Data: number[] = [
  // Maze 0 (offset 0): 12 zeros, 10×$08, $0F×2, 10×$08, 8 zeros
  ...Array(12).fill(0x00),
  0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08,
  0x0f, 0x0f,
  0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08,
  ...Array(8).fill(0x00),
  // Maze 1 (offset 42): 31 zeros, $FF, 10 zeros
  ...Array(31).fill(0x00),
  0xff,
  ...Array(10).fill(0x00),
  // Maze 2 (offset 84): all zeros
  ...Array(42).fill(0x00),
  // Maze 3 (offset 126): 12 zeros, 20×$08, 10 zeros
  ...Array(12).fill(0x00),
  ...Array(20).fill(0x08),
  ...Array(10).fill(0x00),
];

// Maze PF2 Data (flat, 168 bytes = 4 × 42)
export const MazePF2Data: number[] = [
  // Maze 0 (offset 0): 22 zeros, $FF×2, 18 zeros
  ...Array(22).fill(0x00),
  0xff, 0xff,
  ...Array(18).fill(0x00),
  // Maze 1 (offset 42): 2 zeros, $04×14, 17 zeros, $07, 8 zeros
  0x00, 0x00,
  ...Array(14).fill(0x04),
  ...Array(17).fill(0x00),
  0x07,
  ...Array(8).fill(0x00),
  // Maze 2 (offset 84): 2 zeros, $04×14, 17 zeros, $04×9
  0x00, 0x00,
  ...Array(14).fill(0x04),
  ...Array(17).fill(0x00),
  ...Array(9).fill(0x04),
  // Maze 3 (offset 126): $04×2, 40 zeros
  0x04, 0x04,
  ...Array(40).fill(0x00),
];

// -----------------------------------------------------------------------------
// Number fonts (7x7 bitmap for digits 0-9 + blank)
// -----------------------------------------------------------------------------

export const NumberFonts: { [key: string]: number[] } = {
  zero:   [0x7e, 0x72, 0x72, 0x72, 0x72, 0x72, 0x7e],
  one:    [0x1c, 0x1c, 0x1c, 0x1c, 0x1c, 0x1c, 0x3c],
  two:    [0x7e, 0x40, 0x7e, 0x0e, 0x0e, 0x4e, 0x7e],
  three:  [0x7e, 0x4e, 0x0e, 0x1c, 0x0e, 0x4e, 0x7e],
  four:   [0x1c, 0x1c, 0x7e, 0x5c, 0x5c, 0x5c, 0x7c],
  five:   [0x7e, 0x4e, 0x0e, 0x7e, 0x40, 0x4e, 0x7e],
  six:    [0x7e, 0x4e, 0x4e, 0x7e, 0x40, 0x4e, 0x7e],
  seven:  [0x0e, 0x0e, 0x0e, 0x0e, 0x0e, 0x4e, 0x7e],
  eight:  [0x7e, 0x4e, 0x4e, 0x7e, 0x72, 0x72, 0x7e],
  nine:   [0x7e, 0x72, 0x02, 0x7e, 0x72, 0x72, 0x7e],
  blank:  [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
};

// NumberTable: index into NumberFonts for digits 0-9 + blank
export const NumberTable = [
  'zero', 'one', 'two', 'three', 'four',
  'five', 'six', 'seven', 'eight', 'nine', 'blank',
];

// -----------------------------------------------------------------------------
// Lives indicator sprite (7 rows)
// -----------------------------------------------------------------------------

export const LivesIndicator = [
  0x18, 0x18, 0x18, 0x5a, 0x3c, 0x00, 0x18,
];

// -----------------------------------------------------------------------------
// Copyright sprite data (7x5 characters)
// -----------------------------------------------------------------------------

export const CopyrightSprite: number[][] = [
  [0x79, 0x85, 0xb5, 0xa5, 0xb5, 0x85, 0x79], // C
  [0x17, 0x15, 0x15, 0x77, 0x55, 0x55, 0x77], // o
  [0x71, 0x41, 0x41, 0x71, 0x11, 0x51, 0x70], // p
  [0x49, 0x49, 0x49, 0xc9, 0x49, 0x49, 0xbe], // y
  [0x55, 0x55, 0x55, 0xd9, 0x55, 0x55, 0x99], // r
];

// -----------------------------------------------------------------------------
// Missile offset tables
// -----------------------------------------------------------------------------

// Min/max X bounds for missiles
export const MissileVerticalLimitsTable = [0, 1, 148, 149];

// Y offsets for each robot missile direction
export const InitRobotMissileYOffset = [
  0,  // not moving
  7,  // missile traveling right
  7,  // missile traveling left
  0,  // left and right (IMPOSSIBLE)
  6,  // missile traveling south
  6,  // south and right
  0,  // south and left
  0,  // south and left and right (IMPOSSIBLE)
  1,  // missile traveling north
  6,  // north and right
  0,  // north and left
];

// X offsets for each robot missile direction
export const InitRobotMissileXOffset = [
  3,  // not moving
  9,  // traveling right
  3,  // traveling left
  3,  // left and right (IMPOSSIBLE)
  4,  // traveling south
  10, // south and right
  3,  // south and left
  3,  // south and left and right (IMPOSSIBLE)
  4,  // traveling north
  3,  // north and right
  3,  // north and left
];

// -----------------------------------------------------------------------------
// Robot motion delay table (NTSC: move N out of 32 frames)
// -----------------------------------------------------------------------------

export const RobotMotionDelayTable = [
  0x20, // move 4 out of 32 frames
  0x28, // move 5 out of 32 frames
  0x30, // move 6 out of 32 frames
  0x38, // move 7 out of 32 frames
  0x40, // move 8 out of 32 frames
  0x48, // move 9 out of 32 frames
  0x50, // move 10 out of 32 frames
  0x58, // move 11 out of 32 frames
];

// Robot missile delay table (NTSC)
export const RobotMissileDelayTable = [
  0x38, // move 7 out of 32 frames
  0x40, // move 8 out of 32 frames
  0x50, // move 10 out of 32 frames
  0x60, // move 12 out of 32 frames
  0x78, // move 15 out of 32 frames
  0x90, // move 18 out of 32 frames
  0xb0, // move 22 out of 32 frames
  0xd0, // move 26 out of 32 frames
];

// -----------------------------------------------------------------------------
// Animation index tables
// -----------------------------------------------------------------------------

// Offsets into PlayerSprites for horizontal animation states
// [stationary, running0, running1, death]
export const PlayerHorizAnimationTable = [0, 1, 2, 3];

// Offsets into PlayerSprites for shooting direction
// [fireHoriz, fireUp, fireDown, fireHoriz]
// Values chosen to avoid collision with PLAYER_DEATH_ANIM_OFFSET (3)
export const PlayerShootingAnimationTable = [0, 1, 2, 0];

// Fine movement tables (pixel offsets per HMOVE step)
export const VerticalPixelOffsets = [0, -1, 1, 0, 0, -1, 1, 0, 0, -1, 1, 0, 0, 0, 0, 0];
export const HorizontalPixelOffsets = [0, 0, 0, 0, -1, -1, -1, -1, 1, 1, 1, 1, 0, 0, 0, 0];

// -----------------------------------------------------------------------------
// Color tables
// -----------------------------------------------------------------------------

// NTSC colors for 8 robots
export const RobotColorTable = [
  0x1a, // YELLOW+10
  0x36, // RED_4+6
  0x0c, // BLACK+12
  0xca, // LT_GREEN
  0x52, // RED_2+12
  0xa8, // GREEN_BLUE
  0xf0, // BROWN+12
  0xa8, // PURPLE+8
];

// Player colors for states: [standing, running, shooting, death]
export const PlayerColorTable = [0x0e, 0x0e, 0x1a, 0x0c];

// -----------------------------------------------------------------------------
// Missile init offset tables
// -----------------------------------------------------------------------------

export const InitMissileYOffsetTable = [
  0, 2, 7, 0, 5, 5, 7, 0, 5, 5, 7,
];

export const InitMissileXOffsetTable = [
  0, 7, 8, 0, 0, 0, 0, 0, 6, 6, 6,
];

// -----------------------------------------------------------------------------
// Attract mode colors
// -----------------------------------------------------------------------------

export const AttractModeColors = [0x36, 0x01, 0xf2];

// -----------------------------------------------------------------------------
// Audio frequency table
// -----------------------------------------------------------------------------

export const AudioFrequencyTable = [
  0x84, 0x00, 0x1f, 0x10, 0x02, 0x0a, 0x11, 0x18,
];

// -----------------------------------------------------------------------------
// Game variation table (14 entries)
// Flags: EXTRA_LIFE_2000=0x80, EXTRA_LIFE_1000=0x40, OTTO_INVINCIBLE=0x20,
//        OTTO_REBOUND=0x10, NO_OTTO=0x08, ROBOT_SHOOTING=0x01
// -----------------------------------------------------------------------------

export const GameVariationTable = [
  0x49, // EXTRA_LIFE_1000 | NO_OTTO | ROBOT_SHOOTING
  0x49, // EXTRA_LIFE_1000 | NO_OTTO | ROBOT_SHOOTING
  0x59, // EXTRA_LIFE_1000 | OTTO_REBOUND | ROBOT_SHOOTING
  0x61, // EXTRA_LIFE_1000 | OTTO_INVINCIBLE | ROBOT_SHOOTING
  0x81, // EXTRA_LIFE_2000 | NO_OTTO | ROBOT_SHOOTING
  0x91, // EXTRA_LIFE_2000 | OTTO_REBOUND | ROBOT_SHOOTING
  0xa1, // EXTRA_LIFE_2000 | OTTO_INVINCIBLE | ROBOT_SHOOTING
  0x09, // NO_OTTO | ROBOT_SHOOTING
  0x11, // OTTO_REBOUND | ROBOT_SHOOTING
  0x21, // OTTO_INVINCIBLE | ROBOT_SHOOTING
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // unused (BCD game selection)
  0x61, // EXTRA_LIFE_1000 | OTTO_INVINCIBLE
  0x51, // EXTRA_LIFE_1000 | OTTO_REBOUND
  0x41, // EXTRA_LIFE_1000 | NO_OTTO (children's version)
];

// -----------------------------------------------------------------------------
// Player sprites (12-14 bytes each)
// -----------------------------------------------------------------------------

export const PlayerStationary = [
  0x00, 0x18, 0x18, 0x00, 0x3c, 0x5a, 0x5a, 0x18, 0x18, 0x18, 0x1c, 0x00,
];

export const PlayerRunning0 = [
  0x00, 0x18, 0x18, 0x00, 0x38, 0x58, 0x3c, 0x18, 0x08, 0x64, 0x44, 0x00,
];

export const PlayerRunning1 = [
  0x00, 0x18, 0x18, 0x00, 0x38, 0x18, 0x3c, 0x18, 0xf4, 0x82, 0x03, 0x00, 0x00, 0x00,
];

export const PlayerDeath = [
  0x3c, 0x24, 0x24, 0x3c, 0xc3, 0xa5, 0xa5, 0xe7, 0x26, 0x22, 0x2e, 0x38,
];

export const PlayerFireHoriz = [
  0x00, 0x18, 0x18, 0x00, 0x1e, 0x18, 0x18, 0x18, 0x18, 0x18, 0x1c, 0x00,
];

export const PlayerFireDown = [
  0x00, 0x18, 0x18, 0x00, 0x3c, 0x3a, 0x3a, 0x18, 0x18, 0x18, 0x1c, 0x00,
];

export const PlayerFireUp = [
  0x00, 0x18, 0x18, 0x02, 0x1c, 0x18, 0x18, 0x18, 0x18, 0x18, 0x1c, 0x00,
];

// Player sprite data organized by animation state
export const PlayerSpriteData: { [key: string]: number[] } = {
  stationary: PlayerStationary,
  running0: PlayerRunning0,
  running1: PlayerRunning1,
  death: PlayerDeath,
  fireHoriz: PlayerFireHoriz,
  fireDown: PlayerFireDown,
  fireUp: PlayerFireUp,
};

// -----------------------------------------------------------------------------
// Evil Otto sprites
// -----------------------------------------------------------------------------

export const EvilOttoSprite0 = [
  0x00, 0x3c, 0x7e, 0xdb, 0xff, 0xbd, 0xc3, 0x7e, 0x3c, 0x00, 0x00, 0x00, 0x00,
];

export const EvilOttoSprite1 = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x3c, 0x7e, 0xdb, 0xff, 0x7f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];

export const EvilOttoSpriteData: { [key: string]: number[] } = {
  frame0: EvilOttoSprite0,
  frame1: EvilOttoSprite1,
};

// -----------------------------------------------------------------------------
// Robot sprite data (9 bytes per frame)
// -----------------------------------------------------------------------------

export const RobotSpriteData: { [key: string]: number[][] } = {
  standing: [
    [0x3c, 0x7e, 0xff, 0xbd, 0xbd, 0x24, 0x24, 0x66, 0x00], // StandingAnimation0
    [0x3c, 0x3e, 0xff, 0xbd, 0xbd, 0x24, 0x24, 0x66, 0x00], // StandingAnimation1
    [0x3c, 0x1e, 0xff, 0xbd, 0xbd, 0x24, 0x24, 0x66, 0x00], // StandingAnimation2
    [0x3c, 0x4e, 0xff, 0xbd, 0xbd, 0x24, 0x24, 0x66, 0x00], // StandingAnimation3
    [0x3c, 0x66, 0xff, 0xbd, 0xbd, 0x24, 0x24, 0x66, 0x00], // StandingAnimation4
    [0x3c, 0x72, 0xff, 0xbd, 0xbd, 0x24, 0x24, 0x66, 0x00], // StandingAnimation5
    [0x3c, 0x78, 0xff, 0xbd, 0xbd, 0x24, 0x24, 0x66, 0x00], // StandingAnimation6
    [0x3c, 0x7c, 0xff, 0xbd, 0xbd, 0x24, 0x24, 0x66, 0x00], // StandingAnimation7
  ],
  walkingLeft: [
    [0x3c, 0x3e, 0xff, 0xbd, 0xbd, 0x24, 0x24, 0x6c, 0x00], // WalkingLeftAnimation0
    [0x3c, 0x3e, 0xff, 0xbd, 0xbd, 0x18, 0x18, 0x38, 0x00], // WalkingLeftAnimation1
  ],
  walkingRight: [
    [0x3c, 0x7c, 0xff, 0xbd, 0xbd, 0x24, 0x24, 0x36, 0x00], // WalkingRightAnimation0
    [0x3c, 0x7c, 0xff, 0xbd, 0xbd, 0x18, 0x18, 0x1c, 0x00], // WalkingRightAnimation1
  ],
  walkingUp: [
    [0x3c, 0x7e, 0xff, 0xbd, 0xbd, 0x24, 0x24, 0x64, 0x06], // WalkingUpAnimation0
    [0x3c, 0x7e, 0xff, 0xbd, 0xbd, 0x24, 0x24, 0x26, 0x60], // WalkingUpAnimation1
  ],
  walkingDown: [
    [0x3c, 0x66, 0xff, 0xbd, 0xbd, 0x24, 0x24, 0x64, 0x06], // WalkingDownAnimation0
    [0x3c, 0x66, 0xff, 0xbd, 0xbd, 0x24, 0x24, 0x26, 0x60], // WalkingDownAnimation1
  ],
  death: [
    [0x00, 0x00, 0x00, 0x24, 0x18, 0x00, 0x00, 0x00, 0x00], // DeathAnimation0
    [0x14, 0x42, 0x81, 0x24, 0x00, 0x00, 0x52, 0x24, 0x00], // DeathAnimation1
    [0x42, 0x81, 0x24, 0x00, 0x42, 0x3c, 0x81, 0x42, 0x00], // DeathAnimation2
  ],
};

// -----------------------------------------------------------------------------
// Robot animation pointer table
// This table is indexed by robot direction state to get the correct
// sub-table of animation indices.
//
// Layout: standing(8) + walkingLeft(3) + walkingRight(3) + walkingUp(4) + walkingDown(4) + death(4) = 26 entries
// Each entry is an offset into the corresponding RobotSpriteData sub-array.
// -----------------------------------------------------------------------------

export const RobotAnimationTable: number[][] = [
  // Standing (8 robots) - offset into StandingAnimation array
  [0, 1, 2, 3, 4, 5, 6, 7, 0],
  // Walking Left (3 entries)
  [0, 1, 1],
  // Walking Right (3 entries)
  [0, 1, 1],
  // Walking Up (4 entries)
  [0, 0, 1, 0],
  // Walking Down (4 entries)
  [4, 1, 4, 0],
];

// Flat animation table indexed by animation index (0-25).
// ASM: lda RobotAnimationTable,y / sta robotAnimationIndex,x
// Maps current anim index → next anim index.
export const RobotAnimationTableFlat: number[] = [
  // Standing: 0-8 → cycle through standing frames
  1, 2, 3, 4, 5, 6, 7, 8, 0,
  // Walking Left: 9-11 → cycle through left frames
  10, 11, 10,
  // Walking Right: 12-14 → cycle through right frames
  13, 14, 13,
  // Walking Up: 15-17 → cycle through up frames
  16, 17, 15,
  // Walking Down: 18-21 → cycle through down frames
  19, 20, 21, 18,
  // Death: 22-25 → advance through death frames, stay at last
  23, 24, 25, 25,
];
// Each entry = offset * ((H_KERNEL/2) - 4) / 2 = offset * 40
// For 4 mazes: [0, 40, 80, 120]
// -----------------------------------------------------------------------------

export const MazeOffsetTable = [0, 42, 84, 126];

// -----------------------------------------------------------------------------
// Player starting location values, indexed by tempPlayerExitingPos.
// ASM: [SOUTH, NORTH, EAST, WEST]
// -----------------------------------------------------------------------------

export const StartingLocationValues = [1, 0, 3, 2];

// -----------------------------------------------------------------------------
// Initial positions for player spawn
// -----------------------------------------------------------------------------

// X positions: [XMAX_PLAYER/2, XMAX_PLAYER/2, XMIN+6, XMAX_PLAYER-7]
export const InitHorizontalPosition = [73, 73, 6, 142];

// Y positions: [YMIN+8, 142, (H_KERNEL/2)-(H_PLAYER+2), (H_KERNEL/2)-(H_PLAYER+2)]
export const InitVerticalPosition = [8, 142, 76, 76];
