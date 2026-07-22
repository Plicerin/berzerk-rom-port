// =============================================================================
// Tests for Renderer and TIA Engine
// =============================================================================

import { describe, it, expect, vi } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { createTIAEngine, computeCollisions } from "../tia/TIA";
import { render, setupCanvas } from "../render/renderer";
import { initGame, GameStateMachine, tick, GameState } from "../game";
import { NTSC, PLAYER_FRACTIONAL_DELAY_NTSC, MAX_ROBOTS } from "../constants";

describe("ZeroPage", () => {
  it("creates zero page with correct defaults", () => {
    const zp = createZeroPage();

    // numberOfLives is set to 3 by initGame, not createZeroPage
    expect(zp.numberOfLives).toBe(0);
    expect(zp.playerScore0).toBe(0);
    expect(zp.playerScore1).toBe(0);
    expect(zp.playerScore2).toBe(0);
    expect(zp.robotVertPos.length).toBe(6);
    expect(zp.robotHorizPos.length).toBe(6);
    expect(zp.robotAnimationIndex.length).toBe(6);
    expect(zp.digitPointer.length).toBe(6);
  });

  it("initializes robot positions correctly after initGame", () => {
    const zp = createZeroPage();
    initGame(zp, 0, 0);

    // After initGame, robots should have valid positions
    for (let i = 0; i < 6; i++) {
      expect(zp.robotVertPos[i]).toBeGreaterThanOrEqual(0);
      // Robot vertical positions in the ROM can go up to ~130 (TIA scanline range)
      expect(zp.robotVertPos[i]).toBeLessThanOrEqual(142);
    }
  });
});

describe("TIA Engine", () => {
  it("creates TIA engine with correct defaults", () => {
    const tia = createTIAEngine();

    expect(tia.state.pf0).toBe(0x00);
    expect(tia.state.pf1).toBe(0x00);
    expect(tia.state.pf2).toBe(0x00);
    expect(tia.state.colup0).toBe(0x0e);
    expect(tia.state.colubk).toBe(0x00);
  });

  it("updates TIA registers on write", () => {
    const tia = createTIAEngine();

    tia.writePF0(0xff);
    expect(tia.state.pf0).toBe(0xff);

    tia.writePF1(0xaa);
    expect(tia.state.pf1).toBe(0xaa);

    tia.writePF2(0x55);
    expect(tia.state.pf2).toBe(0x55);

    tia.writeGRP0(0x7f);
    expect(tia.state.grp0).toBe(0x7f);

    tia.writeGRP1(0x3f);
    expect(tia.state.grp1).toBe(0x3f);
  });

  it("updates colors on write", () => {
    const tia = createTIAEngine();

    tia.writeCOLUP0(0x10);
    expect(tia.state.colup0).toBe(0x10);

    tia.writeCOLUPF(0x88);
    expect(tia.state.colupf).toBe(0x88);

    tia.writeCOLUBK(0x0e);
    expect(tia.state.colubk).toBe(0x0e);
  });

  it("updates audio on write", () => {
    const tia = createTIAEngine();

    tia.writeAUDF0(0x01);
    expect(tia.state.audioFreq0).toBe(0x01);

    tia.writeAUDC0(0x0d);
    expect(tia.state.audioConfig0).toBe(0x0d);

    tia.writeAUDV0(0x0f);
    expect(tia.state.audioVolume0).toBe(0x0f);
  });

  it("returns correct collision result when no collisions", () => {
    const tia = createTIAEngine();
    const result = tia.readCollision();

    expect(result.player0Missile).toBe(false);
    expect(result.player1Missile).toBe(false);
    expect(result.player0Playfield).toBe(false);
    expect(result.player1Playfield).toBe(false);
    expect(result.player0Player1).toBe(false);
    expect(result.missilePlayfield).toBe(false);
  });

  it("detects player-missile collision with robot", () => {
    const zp = createZeroPage();
    zp.playerMissileFlightTime = 10;
    zp.playerMissileHorizPos = 73;
    zp.playerMissileVertPos = 80;
    zp.robotHorizPos[0] = 75;
    zp.robotVertPos[0] = 82;

    const result = computeCollisions(zp, 73, 80);

    expect(result.player0Missile).toBe(true);
  });

  it("detects player-robot collision", () => {
    const zp = createZeroPage();
    zp.robotHorizPos[0] = 75;
    zp.robotVertPos[0] = 82;

    const result = computeCollisions(zp, 73, 80);

    expect(result.player0Player1).toBe(true);
  });

  it("does not detect collision with off-screen robot", () => {
    const zp = createZeroPage();
    zp.robotHorizPos[0] = 127; // off-screen
    zp.robotVertPos[0] = 82;

    const result = computeCollisions(zp, 73, 80);

    expect(result.player0Player1).toBe(false);
  });

  it("detects Evil Otto collision", () => {
    const zp = createZeroPage();
    zp.evilOttoHorizPos = 75;
    zp.evilOttoVertPos = 82;

    const result = computeCollisions(zp, 73, 80);

    expect(result.player0Player1).toBe(true);
  });

  it("does not detect collision with inactive Evil Otto", () => {
    const zp = createZeroPage();
    zp.evilOttoHorizPos = 0;
    zp.evilOttoVertPos = 0;

    const result = computeCollisions(zp, 73, 80);

    expect(result.player0Player1).toBe(false);
  });
});

describe("Renderer", () => {
  it("setupCanvas creates a canvas element", () => {
    const container = { appendChild: vi.fn() } as unknown as HTMLElement;
    const canvas = setupCanvas(container);

    expect(canvas).toBeDefined();
    expect(canvas.width).toBe(640); // 4:3 display output for 160×192 TIA
    expect(canvas.height).toBe(480);
    expect(container.appendChild).toHaveBeenCalled();
  });

  it("render does not throw with zero page", () => {
    const container = {
      appendChild: vi.fn(),
      querySelector: vi.fn().mockReturnValue(null),
    } as unknown as HTMLElement;
    const canvas = setupCanvas(container);
    const zp = createZeroPage();

    expect(() => render(zp, canvas)).not.toThrow();
  });

  it("render draws when game is initialized", () => {
    const container = {
      appendChild: vi.fn(),
      querySelector: vi.fn().mockReturnValue(null),
    } as unknown as HTMLElement;
    const canvas = setupCanvas(container);
    const zp = createZeroPage();
    initGame(zp, 0, 0);

    expect(() => render(zp, canvas)).not.toThrow();
  });
});

describe("GameStateMachine tick", () => {
  it("ticks without throwing in attract mode", () => {
    const zp = createZeroPage();
    zp.kernelSection = GameState.ATTRACT;
    zp.numberOfLives = 3;
    zp.evilOttoHorizPos = 0;
    zp.evilOttoVertPos = 0;
    zp.playerMissileHorizPos = 0;
    zp.playerMissileVertPos = 0;
    zp.playerMissileFlightTime = 0;
    zp.playerMissileDirection = 0;
    zp.playerMotion = 0;
    zp.playerAnimationIndex = 0;
    zp.playerHorizPos = 10;
    zp.playerVertPos = 10;

    const state: GameStateMachine = {
      zp,
      region: NTSC,
      joystickInput: 0,
      lastJoystickInput: 0,
      frameCount: 0,
      vblankCount: 0,
      overscanCount: 0,
      colorCycleIndex: 0,
    };

    expect(() => tick(state)).not.toThrow();
  });

  it("increments frameCount on tick", () => {
    const zp = createZeroPage();
    zp.kernelSection = GameState.ATTRACT;
    zp.numberOfLives = 3;
    zp.evilOttoHorizPos = 0;
    zp.evilOttoVertPos = 0;
    zp.playerMissileHorizPos = 0;
    zp.playerMissileVertPos = 0;
    zp.playerMissileFlightTime = 0;
    zp.playerMissileDirection = 0;
    zp.playerMotion = 0;
    zp.playerAnimationIndex = 0;
    zp.playerHorizPos = 10;
    zp.playerVertPos = 10;

    const state: GameStateMachine = {
      zp,
      region: NTSC,
      joystickInput: 0,
      lastJoystickInput: 0,
      frameCount: 0,
      vblankCount: 0,
      overscanCount: 0,
      colorCycleIndex: 0,
    };

    tick(state);
    expect(state.frameCount).toBe(1);

    tick(state);
    expect(state.frameCount).toBe(2);
  });

  it("processes joystick fire input", () => {
    const zp = createZeroPage();
    initGame(zp, 0, 0);
    // Move robots far away so missile doesn't instantly hit one
    for (let i = 0; i < MAX_ROBOTS; i++) {
      zp.robotHorizPos[i] = 0;
      zp.robotVertPos[i] = 0;
    }

    const state: GameStateMachine = {
      zp,
      region: NTSC,
      joystickInput: 0x10 | 0x08, // fire + right
      lastJoystickInput: 0,
      frameCount: 0,
      vblankCount: 0,
      overscanCount: 0,
      colorCycleIndex: 0,
    };

    // Fire missile on edge detection (0 -> 0x10|0x08)
    tick(state);
    expect(zp.playerMissileDirection).toBeGreaterThan(0);
    expect(zp.playerMissileFlightTime).toBe(0);

    // No fire on continuous press (no edge)
    state.lastJoystickInput = state.joystickInput;
    const prevDirection = zp.playerMissileDirection;
    const prevFlightTime = zp.playerMissileFlightTime;
    tick(state);
    expect(zp.playerMissileDirection).toBe(prevDirection);
    expect(zp.playerMissileFlightTime).toBeGreaterThan(prevFlightTime);
  });

  it("processes joystick direction input", () => {
    const zp = createZeroPage();
    initGame(zp, 0, 0);
    zp.kernelSection = GameState.GAME;
    const startYPos = zp.playerVertPos;

    const state: GameStateMachine = {
      zp,
      region: NTSC,
      joystickInput: 0x01, // up
      lastJoystickInput: 0,
      frameCount: 0,
      vblankCount: 0,
      overscanCount: 0,
      colorCycleIndex: 0,
    };

    // Pre-set playerMotion so fractional accumulator overflows on tick
    // sum = playerMotion + 112 > 255 → playerMotion > 143
    zp.playerMotion = 0xff;

    tick(state);
    expect(zp.playerVertPos).toBeLessThan(startYPos); // moved up
  });
});
