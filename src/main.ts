// =============================================================================
// Berzerk Game Entry Point
// Ported from: Berzerk (decomp).asm
// Original: Atari 1984, Programmer: Dan Hitchens
// Decomp: Dennis Debro
//
// Entry point that ties together:
// - ZeroPage (game state)
// - TIA Engine (hardware simulation)
// - Game logic (core mechanics)
// - Canvas Renderer (visual output)
// =============================================================================

import { createZeroPage, ZeroPage } from "./tia/zeropage";
import { createTIAEngine, TIAEngine } from "./tia/TIA";
import { initGame, tick, GameStateMachine } from "./game";
import { render, setupCanvas } from "./render/renderer";
import { MOVE_UP, MOVE_DOWN, MOVE_LEFT, MOVE_RIGHT } from "./constants";

// Canvas element
let canvas: HTMLCanvasElement;

// Game state
let zp: ZeroPage;
let tia: TIAEngine;
let gameState: GameStateMachine;

// Active keys for held-down input
const keys = new Set<string>();
const FIRE = 0x10;

function updateJoystick(): void {
  let input = 0;
  if (keys.has("ArrowUp") || keys.has("w")) input |= MOVE_UP;
  if (keys.has("ArrowDown") || keys.has("s")) input |= MOVE_DOWN;
  if (keys.has("ArrowLeft") || keys.has("a")) input |= MOVE_LEFT;
  if (keys.has("ArrowRight") || keys.has("d")) input |= MOVE_RIGHT;
  if (keys.has(" ")) input |= FIRE;
  gameState.joystickInput = input;
}

function setupInput(): void {
  document.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
      e.preventDefault();
      keys.add(e.key);
      updateJoystick();
    }
  });

  document.addEventListener("keyup", (e) => {
    keys.delete(e.key);
    updateJoystick();
  });
}

/**
 * Initialize the game and start the render loop.
 */
export function init(container: HTMLElement): void {
  // Create zero page (game state)
  zp = createZeroPage();

  // Create TIA engine
  tia = createTIAEngine();

  // Initialize game logic
  initGame(zp, 0, 0);

  // Create game state machine
  gameState = {
    zp,
    region: 0,
    joystickInput: 0,
    lastJoystickInput: 0,
    frameCount: 0,
    vblankCount: 0,
    overscanCount: 0,
    colorCycleIndex: 0,
  };

  // Setup canvas
  canvas = setupCanvas(container);

  // Setup keyboard input
  setupInput();

  // Start render loop
  requestAnimationFrame(renderLoop);
}

/**
 * Main render loop.
 * Calls tick() to update game state, then renders.
 */
function renderLoop(_timestamp: number): void {
  // Update game state
  tick(gameState);

  // Render to canvas
  render(zp, canvas);

  // Continue loop
  requestAnimationFrame(renderLoop);
}

// Auto-init if called directly in a browser context
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("berzerk-container");
    if (container) {
      init(container);
    }
  });
}
