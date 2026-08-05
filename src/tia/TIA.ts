// =============================================================================
// TIA Hardware Simulation
// Ported from: Berzerk (decomp).asm
// Original: Atari 1984, Programmer: Dan Hitchens
// Decomp: Dennis Debro
//
// Simulates the Atari 2600 TIA (Television Interface Adaptor) hardware:
// - Playfield registers (PF0, PF1, PF2)
// - Player registers (GRP0, GRP1)
// - Missile registers (ENAM0, ENAM1)
// - Collision registers (CXM0P, CXM1P, CXP0FB, CXP1FB, CXPPMM)
// - Color registers (COLUP0, COLUP1, COLUPF, COLUBK)
// - Size/reflect registers (NUSIZ0, NUSIZ1, REF0, REF1)
// - HMove register
// - Audio (AUDF0, AUDC0, AUDV0)
// =============================================================================

import { ZeroPage } from "./zeropage";

// TIA Register addresses (from constants)
const TIA_BASE = 0x00;

// =============================================================================
// TIA State
// =============================================================================

export interface TIAState {
  // Playfield registers (write-only, read via P0)
  pf0: number;
  pf1: number;
  pf2: number;

  // Player graphics (write-only, read via P0)
  grp0: number;
  grp1: number;

  // Missile enable (write-only)
  enaMissile0: number;
  enaMissile1: number;

  // Player colors
  colup0: number;
  colup1: number;

  // Playfield color
  colupf: number;

  // Background color
  colubk: number;

  // Player size
  nusiz0: number;
  nusiz1: number;

  // Player reflect
  ref0: number;
  ref1: number;

  // HMove (horizontal move)
  hmove: boolean;

  // Collision flags
  collisionPlayer0Missile: boolean;
  collisionPlayer1Missile: boolean;
  collisionPlayer0Playfield: boolean;
  collisionPlayer1Playfield: boolean;
  collisionPlayer0Player1: boolean;
  collisionMissilePlayfield: boolean;

  // Audio
  audioFreq0: number;
  audioConfig0: number;
  audioVolume0: number;

  // Vertical blank / vsync
  inVerticalBlank: boolean;
  inVerticalSync: boolean;

  // Ball (not used in Berzerk)
  ballEnabled: boolean;

  // Playfield configuration
  config: PlayfieldConfig;
}

/**
 * Create a new TIA state with default values.
 */
export function createTIAState(): TIAState {
  return {
    pf0: 0x00,
    pf1: 0x00,
    pf2: 0x00,
    grp0: 0x00,
    grp1: 0x00,
    enaMissile0: 0x00,
    enaMissile1: 0x00,
    colup0: 0x0e, // white
    colup1: 0x0e, // white
    colupf: 0x88, // blue
    colubk: 0x00, // black
    nusiz0: 0x01,
    nusiz1: 0x01,
    ref0: 0x00,
    ref1: 0x00,
    hmove: false,
    collisionPlayer0Missile: false,
    collisionPlayer1Missile: false,
    collisionPlayer0Playfield: false,
    collisionPlayer1Playfield: false,
    collisionPlayer0Player1: false,
    collisionMissilePlayfield: false,
    audioFreq0: 0x01,
    audioConfig0: 0x0d,
    audioVolume0: 0x00,
    inVerticalBlank: false,
    inVerticalSync: false,
    ballEnabled: false,
    config: DEFAULT_PF_CONFIG,
  };
}

// =============================================================================
// Playfield Configuration
// =============================================================================

export interface PlayfieldConfig {
  width: number; // 3, 4, or 5 bits wide
  reflect: boolean;
  doubleDensity: boolean;
}

const DEFAULT_PF_CONFIG: PlayfieldConfig = {
  width: 5,
  reflect: true,
  doubleDensity: false,
};

// =============================================================================
// TIA Engine
// =============================================================================

export interface TIAEngine {
  state: TIAState;
  config: PlayfieldConfig;

  // Write to TIA registers
  writePF0(value: number): void;
  writePF1(value: number): void;
  writePF2(value: number): void;
  writeGRP0(value: number): void;
  writeGRP1(value: number): void;
  writeENA0(value: number): void;
  writeENA1(value: number): void;
  writeCOLUP0(value: number): void;
  writeCOLUP1(value: number): void;
  writeCOLUPF(value: number): void;
  writeCOLUBK(value: number): void;
  writeNUSIZ0(value: number): void;
  writeNUSIZ1(value: number): void;
  writeREF0(value: number): void;
  writeREF1(value: number): void;
  writeHMOVE(): void;
  writeAUDF0(value: number): void;
  writeAUDC0(value: number): void;
  writeAUDV0(value: number): void;

  // Read collision registers
  readCollision(): CollisionResult;

  // Set playfield configuration
  setPFConfig(config: PlayfieldConfig): void;

  // Reset TIA state
  reset(): void;
}

export interface CollisionResult {
  player0Missile: boolean;
  player1Missile: boolean;
  player0Playfield: boolean;
  player1Playfield: boolean;
  player0Player1: boolean;
  missilePlayfield: boolean;
}

/**
 * Create a TIA engine instance.
 */
export function createTIAEngine(config: PlayfieldConfig = DEFAULT_PF_CONFIG): TIAEngine {
  const state = createTIAState();
  state.config = config;

  return {
    state,
    config,

    writePF0(value: number): void {
      this.state.pf0 = value;
    },

    writePF1(value: number): void {
      this.state.pf1 = value;
    },

    writePF2(value: number): void {
      this.state.pf2 = value;
    },

    writeGRP0(value: number): void {
      this.state.grp0 = value;
    },

    writeGRP1(value: number): void {
      this.state.grp1 = value;
    },

    writeENA0(value: number): void {
      this.state.enaMissile0 = value;
    },

    writeENA1(value: number): void {
      this.state.enaMissile1 = value;
    },

    writeCOLUP0(value: number): void {
      this.state.colup0 = value;
    },

    writeCOLUP1(value: number): void {
      this.state.colup1 = value;
    },

    writeCOLUPF(value: number): void {
      this.state.colupf = value;
    },

    writeCOLUBK(value: number): void {
      this.state.colubk = value;
    },

    writeNUSIZ0(value: number): void {
      this.state.nusiz0 = value;
    },

    writeNUSIZ1(value: number): void {
      this.state.nusiz1 = value;
    },

    writeREF0(value: number): void {
      this.state.ref0 = value;
    },

    writeREF1(value: number): void {
      this.state.ref1 = value;
    },

    writeHMOVE(): void {
      this.state.hmove = true;
    },

    writeAUDF0(value: number): void {
      this.state.audioFreq0 = value;
    },

    writeAUDC0(value: number): void {
      this.state.audioConfig0 = value;
    },

    writeAUDV0(value: number): void {
      this.state.audioVolume0 = value;
    },

    readCollision(): CollisionResult {
      // In the ASM, collisions are computed in the kernel by reading
      // CXP1FB, CXM0P, CXPPMM, and checking CXM1FB via bit test.
      // Here we compute a simplified collision result based on
      // the current game state.
      const result: CollisionResult = {
        player0Missile: this.state.collisionPlayer0Missile,
        player1Missile: this.state.collisionPlayer1Missile,
        player0Playfield: this.state.collisionPlayer0Playfield,
        player1Playfield: this.state.collisionPlayer1Playfield,
        player0Player1: this.state.collisionPlayer0Player1,
        missilePlayfield: this.state.collisionMissilePlayfield,
      };
      return result;
    },

    setPFConfig(config: PlayfieldConfig): void {
      this.config = config;
    },

    reset(): void {
      const newState = createTIAState();
      Object.assign(this.state, newState);
      this.state.config = this.config;
    },
  };
}

// =============================================================================
// Collision Detection Helper
// =============================================================================

/**
 * Compute collisions between game entities based on their positions.
 * This is a simplified version of the TIA hardware collision detection.
 * The ASM reads collision registers directly; this function mirrors that
 * logic for the Canvas renderer's benefit.
 */
export function computeCollisions(
  zp: ZeroPage,
  playerX: number,
  playerY: number,
): CollisionResult {
  const result: CollisionResult = {
    player0Missile: false,
    player1Missile: false,
    player0Playfield: false,
    player1Playfield: false,
    player0Player1: false,
    missilePlayfield: false,
  };

  // Player missile collision
  if (zp.playerMissileFlightTime > 0) {
    const missileX = zp.playerMissileHorizPos;
    const missileY = zp.playerMissileVertPos;

    // Check if missile is near any robot
    for (let i = 0; i < 6; i++) {
      const robotX = zp.robotHorizPos[i];
      const robotY = zp.robotVertPos[i];
      if (robotX >= 127) continue; // off-screen

      if (
        Math.abs(missileX - robotX) <= 4 &&
        Math.abs(missileY - robotY) <= 8
      ) {
        result.player0Missile = true;
      }
    }
  }

  // Player-robot collision
  for (let i = 0; i < 6; i++) {
    const robotX = zp.robotHorizPos[i];
    const robotY = zp.robotVertPos[i] * 2;
    if (robotX >= 127) continue;

    if (
      Math.abs(playerX - robotX) <= 8 &&
      Math.abs(playerY - robotY) <= 10
    ) {
      result.player0Player1 = true;
    }
  }

  // Evil Otto collision
  if (
    zp.evilOttoHorizPos > 0 &&
    zp.evilOttoVertPos > 0 &&
    Math.abs(playerX - zp.evilOttoHorizPos) <= 8 &&
    Math.abs(playerY - zp.evilOttoVertPos) <= 10
  ) {
    result.player0Player1 = true;
  }

  return result;
}

// =============================================================================
// Audio Engine (simplified)
// =============================================================================

/**
 * Generate audio output for the current frame.
 * Berzerk uses a single audio channel (channel 0) for:
 * - Robot shooting sound (frequency sweep)
 * - Player shooting sound
 * - Evil Otto sound
 * - Game over sound
 */
export interface AudioSample {
  left: number;
  right: number;
}

/**
 * Generate a single audio sample based on the TIA audio state.
 */
export function generateAudioSample(state: TIAState): AudioSample {
  if (state.audioVolume0 === 0) {
    return { left: 0, right: 0 };
  }

  // Simple square wave generation
  const frequency = state.audioFreq0 & 0x0f;
  if (frequency === 0) {
    return { left: 0, right: 0 };
  }

  // Phase-based square wave (simplified)
  const phase = (state.audioFreq0 >> 4) & 0x07;
  const amplitude = (state.audioVolume0 & 0x0f) / 15;
  const sample = phase % 2 === 0 ? amplitude : -amplitude;

  return { left: sample, right: sample };
}
