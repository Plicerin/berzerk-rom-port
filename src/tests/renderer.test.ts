// =============================================================================
// Tests for Renderer and TIA Engine
// =============================================================================

import { describe, it, expect, vi } from "vitest";
import { createZeroPage } from "../tia/zeropage";
import { createTIAEngine, computeCollisions } from "../tia/TIA";
import { render, setupCanvas } from "../render/renderer";
import { initGame, GameStateMachine, tick, GameState } from "../game";
import {
  NTSC,
  PLAYER_FRACTIONAL_DELAY_NTSC,
  MAX_ROBOTS,
  PLAYER_ENTERING_WEST,
  PLAYER_ENTERING_EAST,
  PLAYER_ENTERING_NORTH,
  MOVE_LEFT,
  MOVE_RIGHT,
} from "../constants";

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
    zp.robotVertPos[0] = 41;

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
  function createMockContext() {
    const gradient = { addColorStop: vi.fn() };
    const drawCalls: Array<{ fillStyle: string; args: number[] }> = [];
    const transformStack: Array<{ x: number; y: number }> = [];
    let fillStyle = "";
    let translateX = 0;
    let translateY = 0;
    const ctx = {
      strokeStyle: "",
      shadowColor: "",
      shadowBlur: 0,
      lineWidth: 1,
      font: "",
      fillRect: vi.fn((x: number, y: number, width: number, height: number) => {
        const args = [x + translateX, y + translateY, width, height];
        drawCalls.push({ fillStyle, args });
      }),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(() => {
        transformStack.push({ x: translateX, y: translateY });
      }),
      restore: vi.fn(() => {
        const previous = transformStack.pop();
        translateX = previous?.x ?? 0;
        translateY = previous?.y ?? 0;
      }),
      translate: vi.fn((x: number, y: number) => {
        translateX += x;
        translateY += y;
      }),
      createRadialGradient: vi.fn().mockReturnValue(gradient),
      gradient,
      drawCalls,
    };
    Object.defineProperty(ctx, "fillStyle", {
      get: () => fillStyle,
      set: (value: string) => { fillStyle = value; },
    });
    return ctx;
  }

  it("setupCanvas creates a responsive canvas element", () => {
    const container = { appendChild: vi.fn() } as unknown as HTMLElement;
    const canvas = setupCanvas(container);

    expect(canvas).toBeDefined();
    expect(canvas.width).toBe(320); // matched to the 320×224 Atari reference frame
    expect(canvas.height).toBe(224);
    expect(canvas.getAttribute("aria-label")).toBe("Berzerk game screen");
    expect(canvas.style.width).toBe("320px");
    expect(canvas.style.maxWidth).toBe("100%");
    expect(canvas.style.height).toBe("224px");
    expect(canvas.style.aspectRatio).toBe("10 / 7");
    expect(container.appendChild).toHaveBeenCalled();
  });

  it("setupCanvas reuses an existing canvas instead of appending a duplicate", () => {
    const existing = document.createElement("canvas");
    const container = {
      querySelector: vi.fn().mockReturnValue(existing),
      appendChild: vi.fn(),
    } as unknown as HTMLElement;

    const canvas = setupCanvas(container);

    expect(canvas).toBe(existing);
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(224);
    expect(container.appendChild).not.toHaveBeenCalled();
  });

  it("render draws a faithful black backdrop and non-obscuring HUD", () => {
    const ctx = createMockContext();
    const canvas = {
      getContext: vi.fn().mockReturnValue(ctx),
      width: 320,
      height: 224,
    } as unknown as HTMLCanvasElement;
    const zp = createZeroPage();
    initGame(zp, 0, 0);

    render(zp, canvas, 0, { comparisonMode: true });

    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 320, 224);
    expect(ctx.createRadialGradient).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(ctx.translate).toHaveBeenCalledWith(8, 14);
    expect(ctx.fillRect).toHaveBeenCalledWith(128, 193, 1, 1);
    expect(ctx.drawCalls.some(call => call.fillStyle === "#9591ff")).toBe(true);
    expect(ctx.drawCalls.some(call => call.fillStyle === "#ffa7b3")).toBe(true);
    expect(ctx.drawCalls.some(call => call.fillStyle === "#c1a739")).toBe(true);
    expect(ctx.drawCalls.some(call => call.fillStyle === "#e7cc5b")).toBe(true);
    expect(ctx.drawCalls.some(call => call.fillStyle === "#ffffff")).toBe(false);
    expect(ctx.fillRect).not.toHaveBeenCalledWith(0, 0, 320, 44);
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it("clips maze rendering to the active transition band during room close/open", () => {
    const ctx = createMockContext();
    const canvas = {
      getContext: vi.fn().mockReturnValue(ctx),
      width: 320,
      height: 224,
    } as unknown as HTMLCanvasElement;
    const zp = createZeroPage();
    initGame(zp, 0, 0);
    zp.upperPlayfieldLimit = 20;
    zp.lowerPlayfieldLimit = 40;

    render(zp, canvas, 0, { comparisonMode: true });

    const blueRects = ctx.drawCalls.filter(call => call.fillStyle === "#9591ff");
    expect(blueRects.length).toBeGreaterThan(0);
    const minY = Math.min(...blueRects.map(call => call.args[1]));
    const maxY = Math.max(...blueRects.map(call => call.args[1] + call.args[3] - 1));

    expect(minY).toBeGreaterThanOrEqual(14 + Math.round(40 * (185 / 176)) - 1);
    expect(maxY).toBeLessThanOrEqual(14 + Math.round(80 * (185 / 176)) + 1);
  });

  it("clips sprites and missiles to the active transition band during room close/open", () => {
    const ctx = createMockContext();
    const canvas = {
      getContext: vi.fn().mockReturnValue(ctx),
      width: 320,
      height: 224,
    } as unknown as HTMLCanvasElement;
    const zp = createZeroPage();
    initGame(zp, 0, 0);
    zp.upperPlayfieldLimit = 20;
    zp.lowerPlayfieldLimit = 40;

    zp.playerHorizPos = 40;
    zp.playerVertPos = 10; // above visible band
    for (let i = 0; i < 6; i++) {
      zp.robotVertPos[i] = 0x7f;
    }
    zp.robotHorizPos[0] = 50;
    zp.robotVertPos[0] = 10; // above visible band
    zp.evilOttoHorizPos = 60;
    zp.evilOttoVertPos = 10; // above visible band
    zp.playerMissileFlightTime = 1;
    zp.playerMissileHorizPos = 30;
    zp.playerMissileVertPos = 10; // above visible band
    zp.robotMissileFlightTime = 1;
    zp.robotMissileDirection = 1;
    zp.robotMissileHorizPos = 70;
    zp.robotMissileVertPos = 10; // above visible band

    render(zp, canvas, 0, { comparisonMode: true });

    expect(ctx.drawCalls.some(call => call.fillStyle === "#ffa7b3" && call.args[1] >= 14 + Math.round(40 * (185 / 176)) - 1)).toBe(false);
    expect(ctx.drawCalls.some(call => call.fillStyle === "#c1a739" && call.args[1] >= 14 + Math.round(40 * (185 / 176)) - 1)).toBe(false);
    expect(ctx.drawCalls.some(call => call.fillStyle === "#ff3030" && call.args[1] >= 14 + Math.round(40 * (185 / 176)) - 1)).toBe(false);
    expect(ctx.drawCalls.some(call => call.fillStyle === "#ffffff")).toBe(false);
  });

  it("clips the room horizontally for east/west doorway transitions instead of only using a vertical band", () => {
    const ctx = createMockContext();
    const canvas = {
      getContext: vi.fn().mockReturnValue(ctx),
      width: 320,
      height: 224,
    } as unknown as HTMLCanvasElement;
    const zp = createZeroPage();
    initGame(zp, 0, 0);
    zp.gameState = 0xff;
    zp.tempPlayerExitingPos = PLAYER_ENTERING_WEST;
    zp.upperPlayfieldLimit = 20;
    zp.lowerPlayfieldLimit = 88;

    render(zp, canvas, 0, { comparisonMode: true });

    const nonBlack = ctx.drawCalls.filter(call => call.fillStyle !== "#000000");
    const minX = Math.min(...nonBlack.map(call => call.args[0]));
    expect(minX).toBeGreaterThanOrEqual(8 + Math.round((20 / 88) * 304) - 1);
  });

  it("opens the room from the entry doorway direction on the next screen", () => {
    const ctx = createMockContext();
    const canvas = {
      getContext: vi.fn().mockReturnValue(ctx),
      width: 320,
      height: 224,
    } as unknown as HTMLCanvasElement;
    const zp = createZeroPage();
    initGame(zp, 0, 0);
    zp.playerStartingLocation = PLAYER_ENTERING_EAST;
    zp.upperPlayfieldLimit = 70;
    zp.lowerPlayfieldLimit = 88;

    render(zp, canvas, 0, { comparisonMode: true });

    const clippedRoom = ctx.drawCalls.filter(call =>
      ["#9591ff", "#c1a739", "#ffa7b3", "#ff3030", "#ffffff"].includes(call.fillStyle)
    );
    const minX = Math.min(...clippedRoom.map(call => call.args[0]));
    expect(minX).toBeGreaterThanOrEqual(8 + Math.round((70 / 88) * 304) - 1);

    ctx.drawCalls.length = 0;
    zp.playerStartingLocation = PLAYER_ENTERING_NORTH;
    zp.upperPlayfieldLimit = 0;
    zp.lowerPlayfieldLimit = 18;

    render(zp, canvas, 0, { comparisonMode: true });

    const clippedRoomNorth = ctx.drawCalls.filter(call =>
      ["#9591ff", "#c1a739", "#ffa7b3", "#ff3030", "#ffffff"].includes(call.fillStyle)
    );
    const maxY = Math.max(...clippedRoomNorth.map(call => call.args[1] + call.args[3] - 1));
    expect(maxY).toBeLessThanOrEqual(14 + Math.round(36 * (185 / 176)) + 1);
  });

  it("comparison render stays within the sampled Atari reference active bounds and palette", () => {
    const ctx = createMockContext();
    const canvas = {
      getContext: vi.fn().mockReturnValue(ctx),
      width: 320,
      height: 224,
    } as unknown as HTMLCanvasElement;
    const zp = createZeroPage();
    initGame(zp, 0, 0);

    render(zp, canvas, 0, { comparisonMode: true });

    const nonBlack = ctx.drawCalls.filter(call => call.fillStyle !== "#000000");
    const bounds = nonBlack.reduce((acc, call) => {
      const [x, y, width, height] = call.args;
      return {
        minX: Math.min(acc.minX, Math.floor(x)),
        minY: Math.min(acc.minY, Math.floor(y)),
        maxX: Math.max(acc.maxX, Math.ceil(x + width) - 1),
        maxY: Math.max(acc.maxY, Math.ceil(y + height) - 1),
      };
    }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const palette = new Set(nonBlack.map(call => call.fillStyle));

    expect(bounds.minX).toBeGreaterThanOrEqual(8);
    expect(bounds.minY).toBeGreaterThanOrEqual(14);
    expect(bounds.maxX).toBeLessThanOrEqual(312);
    expect(bounds.maxY).toBeLessThanOrEqual(201);
    expect(palette).toEqual(new Set(["#9591ff", "#c1a739", "#ffa7b3", "#e7cc5b"]));
  });

  it("default gameplay render keeps state-driven score and lives instead of copyright-only comparison HUD", () => {
    const ctx = createMockContext();
    const canvas = {
      getContext: vi.fn().mockReturnValue(ctx),
    } as unknown as HTMLCanvasElement;
    const zp = createZeroPage();
    initGame(zp, 0, 0);

    render(zp, canvas);

    expect(ctx.fillRect).not.toHaveBeenCalledWith(127, 193, 1, 1); // comparison copyright
    expect(ctx.drawCalls.some(call => call.fillStyle === "#ffa7b3" && call.args[1] === 8)).toBe(true);
  });

  it("default gameplay render suppresses leading zero score digits like the ASM", () => {
    const ctx = createMockContext();
    const canvas = {
      getContext: vi.fn().mockReturnValue(ctx),
    } as unknown as HTMLCanvasElement;
    const zp = createZeroPage();
    initGame(zp, 0, 0);
    zp.playerScore0 = 0x00;
    zp.playerScore1 = 0x00;
    zp.playerScore2 = 0x50;

    render(zp, canvas);

    expect(ctx.fillRect).not.toHaveBeenCalledWith(11, 8, 1, 1); // hidden leading zero
    expect(ctx.fillRect).toHaveBeenCalledWith(34, 8, 1, 1); // visible 5 in the tens place
  });

  it("default gameplay render extracts six digits from three packed BCD score bytes", () => {
    const ctx = createMockContext();
    const canvas = {
      getContext: vi.fn().mockReturnValue(ctx),
    } as unknown as HTMLCanvasElement;
    const zp = createZeroPage();
    initGame(zp, 0, 0);
    zp.playerScore0 = 0x12;
    zp.playerScore1 = 0x34;
    zp.playerScore2 = 0x56;

    render(zp, canvas);

    expect(ctx.fillRect).toHaveBeenCalledWith(12, 8, 1, 1); // digit 1
    expect(ctx.fillRect).toHaveBeenCalledWith(41, 8, 1, 1); // digit 6
  });

  it("render draws hard-edged player and robot missiles when missiles are active", () => {
    const ctx = createMockContext();
    const canvas = {
      getContext: vi.fn().mockReturnValue(ctx),
    } as unknown as HTMLCanvasElement;
    const zp = createZeroPage();
    initGame(zp, 0, 0);
    zp.playerMissileFlightTime = 1;
    zp.playerMissileHorizPos = 20;
    zp.playerMissileVertPos = 30;
    zp.robotMissileFlightTime = 1;
    zp.robotMissileDirection = 1;
    zp.robotMissileHorizPos = 40;
    zp.robotMissileVertPos = 50;

    render(zp, canvas);

    expect(ctx.drawCalls.some(call => call.args[0] === 38.4 && call.args[2] === 9.5)).toBe(false);
    expect(ctx.drawCalls.some(call => Math.abs(call.args[0] - 46) < 0.001 && Math.abs(call.args[1] - 77.068) < 0.001 && Math.abs(call.args[2] - 1.9) < 0.001 && Math.abs(call.args[3] - 2.102) < 0.001)).toBe(true);
    expect(ctx.drawCalls.some(call => call.args[0] === 76.5 && call.args[2] === 9.5)).toBe(false);
    expect(ctx.drawCalls.some(call => Math.abs(call.args[0] - 84) < 0.001 && Math.abs(call.args[1] - 119.114) < 0.001 && Math.abs(call.args[2] - 1.9) < 0.001 && Math.abs(call.args[3] - 2.102) < 0.001)).toBe(true);
  });

  it("mirrors asymmetric player sprites when facing left", () => {
    const ctx = createMockContext();
    const canvas = {
      getContext: vi.fn().mockReturnValue(ctx),
    } as unknown as HTMLCanvasElement;
    const zp = createZeroPage();
    initGame(zp, 0, 0);
    zp.playerHorizPos = 50;
    zp.playerVertPos = 80;
    zp.playerMissileFlightTime = 1;
    zp.playerMissileDirection = MOVE_RIGHT;
    zp.playerDirection = MOVE_RIGHT;

    render(zp, canvas, 0, { comparisonMode: true });
    const rightPink = ctx.drawCalls.filter(call => call.fillStyle === "#ffa7b3");
    const rightMinX = Math.min(...rightPink.map(call => call.args[0]));
    const rightMaxX = Math.max(...rightPink.map(call => call.args[0] + call.args[2]));

    ctx.drawCalls.length = 0;
    zp.playerMissileDirection = MOVE_LEFT;
    zp.playerDirection = MOVE_LEFT;

    render(zp, canvas, 0, { comparisonMode: true });
    const leftPink = ctx.drawCalls.filter(call => call.fillStyle === "#ffa7b3");
    const leftMinX = Math.min(...leftPink.map(call => call.args[0]));
    const leftMaxX = Math.max(...leftPink.map(call => call.args[0] + call.args[2]));

    expect(leftMinX).toBeLessThan(rightMinX);
    expect(leftMaxX).toBeLessThan(rightMaxX);
  });

  it("renders the player's 2LK missile Y coordinate beside the full-height player position", () => {
    const ctx = createMockContext();
    const canvas = {
      getContext: vi.fn().mockReturnValue(ctx),
    } as unknown as HTMLCanvasElement;
    const zp = createZeroPage();
    initGame(zp, 0, 0);
    zp.playerHorizPos = 50;
    zp.playerVertPos = 80;
    zp.playerMissileFlightTime = 1;
    zp.playerMissileDirection = MOVE_RIGHT;
    zp.playerMissileHorizPos = 58;
    zp.playerMissileVertPos = 45;

    render(zp, canvas);

    const playerRects = ctx.drawCalls.filter(call => call.fillStyle === "#ffa7b3");
    const missileRects = ctx.drawCalls.filter(call => call.fillStyle === "#ffffff");
    const playerMinY = Math.min(...playerRects.map(call => call.args[1]));
    const playerMaxY = Math.max(...playerRects.map(call => call.args[1] + call.args[3]));
    const missileY = missileRects[0].args[1];

    expect(missileY).toBeGreaterThanOrEqual(playerMinY);
    expect(missileY).toBeLessThanOrEqual(playerMaxY);
  });

  it("renders player missiles and robots in the same 2LK vertical coordinate domain", () => {
    const ctx = createMockContext();
    const canvas = {
      getContext: vi.fn().mockReturnValue(ctx),
    } as unknown as HTMLCanvasElement;
    const zp = createZeroPage();
    initGame(zp, 0, 0);
    for (let i = 0; i < 6; i++) {
      zp.robotVertPos[i] = 0x7f;
    }
    zp.robotHorizPos[0] = 58;
    zp.robotVertPos[0] = 45;
    zp.robotAnimationIndex[0] = 0;
    zp.playerMissileFlightTime = 1;
    zp.playerMissileDirection = MOVE_RIGHT;
    zp.playerMissileHorizPos = 58;
    zp.playerMissileVertPos = 45;

    render(zp, canvas);

    const robotMinY = Math.min(...ctx.drawCalls.filter(call => call.fillStyle === "#c1a739").map(call => call.args[1]));
    const missileY = ctx.drawCalls.find(call => call.fillStyle === "#ffffff")!.args[1];

    expect(Math.abs(missileY - robotMinY)).toBeLessThanOrEqual(2);
  });

  it("does not render a robot missile for the inactive 0x0f sentinel direction", () => {
    const ctx = createMockContext();
    const canvas = {
      getContext: vi.fn().mockReturnValue(ctx),
    } as unknown as HTMLCanvasElement;
    const zp = createZeroPage();
    initGame(zp, 0, 0);
    zp.robotMissileFlightTime = 1;
    zp.robotMissileDirection = 0x0f;
    zp.robotMissileHorizPos = 40;
    zp.robotMissileVertPos = 50;

    render(zp, canvas);

    expect(ctx.fillRect).not.toHaveBeenCalledWith(76.5, 65.50568181818181, 9.5, 3.153409090909091);
    expect(ctx.fillRect).not.toHaveBeenCalledWith(84, 66.55681818181817, 1.9, 1.0511363636363635);
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

    // Fire missile while the button is held.
    tick(state);
    expect(zp.playerMissileDirection).toBeGreaterThan(0);
    expect(zp.playerMissileFlightTime).toBe(1);

    // Continuous press keeps the active missile moving; it does not relaunch
    // until playerMissileFlightTime is cleared.
    state.lastJoystickInput = state.joystickInput;
    const prevDirection = zp.playerMissileDirection;
    const prevX = zp.playerMissileHorizPos;
    tick(state);
    expect(zp.playerMissileDirection).toBe(prevDirection);
    expect(zp.playerMissileFlightTime).toBe(1);
    expect(zp.playerMissileHorizPos).toBeGreaterThan(prevX);
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
