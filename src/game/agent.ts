// =============================================================================
// AI Agent — plays Berzerk like a human
// =============================================================================

import { ZeroPage } from "../tia/zeropage";
import {
  MOVE_UP, MOVE_DOWN, MOVE_LEFT, MOVE_RIGHT,
  XMIN, XMAX_PLAYER, YMIN, H_PLAYER, H_ROBOT,
  ROBOT_DEATH_ANIM_OFFSET, PLAYER_DEATH_ANIM_OFFSET, NO_OTTO,
  MAX_ROBOTS, ROBOT_SHOOTING_UP, ROBOT_SHOOTING_DOWN,
  ROBOT_SHOOTING_LEFT, ROBOT_SHOOTING_RIGHT,
} from "../constants";
import { GameStateMachine, isPositionInWall } from "./index";
import {
  InitMissileYOffsetTable,
  InitMissileXOffsetTable,
} from "../data/tables";

const FIRE = 0x10;
const PLAYER_W = 8;
const PLAYER_H = 12;
const WALL_FEELER = 4;
const PLAYER_MAX_Y = 159;
const MISSILE_THREAT_RANGE = 45;

type RobotTarget = { index: number; x: number; y: number; dist: number };
type QueueNode = { x: number; y: number; firstMove: number };

export function agentDecide(state: GameStateMachine): number {
  const { zp } = state;

  if (zp.playerAnimationIndex === PLAYER_DEATH_ANIM_OFFSET) return 0;

  const threatMove = dodgeRobotMissile(zp);
  if (threatMove !== 0) return threatMove;

  const robots = findLiveRobots(zp);
  if (robots.length === 0) return headForExit(zp);

  const shotDir = findClearShot(zp, zp.playerHorizPos, zp.playerVertPos, robots);
  if (shotDir !== 0) {
    if (zp.playerMissileDirection === 0) {
      if (state.lastJoystickInput & FIRE) return shotDir;
      return shotDir | FIRE;
    }
    return 0;
  }

  const pathMove = findPathToShot(zp, robots);
  if (pathMove !== 0) return pathMove;

  return chaseClosestRobot(zp, robots);
}

// ---------------------------------------------------------------------------
// Threat detection
// ---------------------------------------------------------------------------

function dodgeRobotMissile(zp: ZeroPage): number {
  if (zp.robotMissileDirection === 0 || zp.robotMissileDirection === 0x0f) return 0;

  const mx = zp.robotMissileHorizPos;
  const my = zp.robotMissileVertPos;
  const px = zp.playerHorizPos;
  const py = zp.playerVertPos;
  const dx = mx - px;
  const dy = my - py;

  if (Math.abs(dx) + Math.abs(dy) > MISSILE_THREAT_RANGE) return 0;

  let candidates: number[] = [];
  switch (zp.robotMissileDirection) {
    case ROBOT_SHOOTING_LEFT:
      if (mx > px && Math.abs(dy) < H_PLAYER) candidates = [MOVE_UP, MOVE_DOWN];
      break;
    case ROBOT_SHOOTING_RIGHT:
      if (mx < px && Math.abs(dy) < H_PLAYER) candidates = [MOVE_UP, MOVE_DOWN];
      break;
    case ROBOT_SHOOTING_UP:
      if (my > py && Math.abs(dx) < H_PLAYER) candidates = [MOVE_LEFT, MOVE_RIGHT];
      break;
    case ROBOT_SHOOTING_DOWN:
      if (my < py && Math.abs(dx) < H_PLAYER) candidates = [MOVE_LEFT, MOVE_RIGHT];
      break;
  }

  for (const dir of candidates) {
    if (canMove(zp, dir)) return dir;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Robot detection
// ---------------------------------------------------------------------------

function findLiveRobots(zp: ZeroPage): RobotTarget[] {
  const robots: RobotTarget[] = [];

  for (let i = 0; i < MAX_ROBOTS; i++) {
    if (zp.robotAnimationIndex[i] >= ROBOT_DEATH_ANIM_OFFSET) continue;
    if (zp.robotVertPos[i] === 0x7f) continue;

    const dx = zp.robotHorizPos[i] - zp.playerHorizPos;
    const dy = zp.robotVertPos[i] - zp.playerVertPos;
    robots.push({
      index: i,
      x: zp.robotHorizPos[i],
      y: zp.robotVertPos[i],
      dist: Math.abs(dx) + Math.abs(dy),
    });
  }

  robots.sort((a, b) => a.dist - b.dist || a.index - b.index);
  return robots;
}

// ---------------------------------------------------------------------------
// Shooting lanes
// ---------------------------------------------------------------------------

function findClearShot(zp: ZeroPage, playerX: number, playerY: number, robots: RobotTarget[]): number {
  for (const robot of robots) {
    const dir = getClearShotDirection(zp, playerX, playerY, robot);
    if (dir !== 0 && canFireNow(zp, playerX, playerY, robot, dir)) return directionToJoystick(dir);
  }
  return 0;
}

function getClearShotDirection(zp: ZeroPage, playerX: number, playerY: number, robot: RobotTarget): number {
  const horizontalDir = robot.x >= playerX ? ROBOT_SHOOTING_RIGHT : ROBOT_SHOOTING_LEFT;
  const horizontalY = playerY + InitMissileYOffsetTable[horizontalDir];
  if (Math.abs(horizontalY - robot.y) < H_PLAYER && hasClearLine(zp, playerX, playerY, robot, horizontalDir)) {
    return horizontalDir;
  }

  const verticalDir = robot.y >= playerY ? ROBOT_SHOOTING_DOWN : ROBOT_SHOOTING_UP;
  const verticalX = playerX + InitMissileXOffsetTable[verticalDir];
  if (Math.abs(verticalX - robot.x) < H_ROBOT && hasClearLine(zp, playerX, playerY, robot, verticalDir)) {
    return verticalDir;
  }

  return 0;
}

function directionToJoystick(dir: number): number {
  switch (dir) {
    case ROBOT_SHOOTING_RIGHT: return MOVE_RIGHT;
    case ROBOT_SHOOTING_LEFT: return MOVE_LEFT;
    case ROBOT_SHOOTING_DOWN: return MOVE_DOWN;
    case ROBOT_SHOOTING_UP: return MOVE_UP;
  }
  return 0;
}

function canFireNow(zp: ZeroPage, playerX: number, playerY: number, robot: RobotTarget, dir: number): boolean {
  return zp.playerMissileDirection === 0;
}

function hasClearLine(zp: ZeroPage, playerX: number, playerY: number, robot: RobotTarget, dir: number): boolean {
  const mazeOff = zp.mazeOffset ?? 0;
  const startX = playerX + InitMissileXOffsetTable[dir];
  const startY = playerY + InitMissileYOffsetTable[dir];

  if (dir === ROBOT_SHOOTING_LEFT || dir === ROBOT_SHOOTING_RIGHT) {
    const step = dir === ROBOT_SHOOTING_RIGHT ? 1 : -1;
    const endX = robot.x;
    for (let x = startX; step > 0 ? x < endX : x > endX; x += step) {
      if (isPositionInWall(x, startY, mazeOff)) return false;
    }
    return true;
  }

  const step = dir === ROBOT_SHOOTING_DOWN ? 1 : -1;
  const endY = robot.y;
  for (let y = startY; step > 0 ? y < endY : y > endY; y += step) {
    if (isPositionInWall(startX, y, mazeOff)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Pathing to a firing position
// ---------------------------------------------------------------------------

function findPathToShot(zp: ZeroPage, robots: RobotTarget[]): number {
  if ((zp.gameVariation & NO_OTTO) !== 0 && zp.numberRobotsKilled > 0) return 0;

  const startX = zp.playerHorizPos;
  const startY = zp.playerVertPos;
  const startKey = key(startX, startY);
  const visited = new Set<number>([startKey]);
  const queue: QueueNode[] = [{ x: startX, y: startY, firstMove: 0 }];
  let head = 0;

  while (head < queue.length) {
    const node = queue[head++];

    if (node.firstMove !== 0) {
      for (const robot of robots) {
        if (getClearShotDirection(zp, node.x, node.y, robot) !== 0) return node.firstMove;
      }
    }

    for (const dir of preferredMoves(zp, node.x, node.y, robots[0])) {
      const next = stepFrom(node.x, node.y, dir);
      if (!isPlayerPositionSafe(zp, next.x, next.y)) continue;

      const nextKey = key(next.x, next.y);
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      queue.push({ x: next.x, y: next.y, firstMove: node.firstMove || dir });
    }
  }

  return 0;
}

function preferredMoves(zp: ZeroPage, x: number, y: number, robot: RobotTarget): number[] {
  const dx = robot.x - x;
  const dy = robot.y - y;
  const horizontal = dx > 0 ? MOVE_RIGHT : MOVE_LEFT;
  const vertical = dy > 0 ? MOVE_DOWN : MOVE_UP;
  const ordered = Math.abs(dx) >= Math.abs(dy)
    ? [horizontal, vertical, opposite(vertical), opposite(horizontal)]
    : [vertical, horizontal, opposite(horizontal), opposite(vertical)];

  return ordered.filter((dir, index) => ordered.indexOf(dir) === index && canMoveFrom(zp, x, y, dir));
}

function chaseClosestRobot(zp: ZeroPage, robots: RobotTarget[]): number {
  const robot = robots[0];
  for (const dir of preferredMoves(zp, zp.playerHorizPos, zp.playerVertPos, robot)) {
    return dir;
  }
  return 0;
}

function findPathToPoint(zp: ZeroPage, targetX: number, targetY: number): number {
  const startX = zp.playerHorizPos;
  const startY = zp.playerVertPos;
  const startKey = key(startX, startY);
  const visited = new Set<number>([startKey]);
  const queue: QueueNode[] = [{ x: startX, y: startY, firstMove: 0 }];
  let head = 0;

  while (head < queue.length) {
    const node = queue[head++];
    if (node.x === targetX && node.y === targetY) return node.firstMove;

    const dirs = [
      targetX > node.x ? MOVE_RIGHT : MOVE_LEFT,
      targetY > node.y ? MOVE_DOWN : MOVE_UP,
      targetY > node.y ? MOVE_UP : MOVE_DOWN,
      targetX > node.x ? MOVE_LEFT : MOVE_RIGHT,
    ];

    for (const dir of dirs.filter((dir, index) => dirs.indexOf(dir) === index)) {
      const next = stepFrom(node.x, node.y, dir);
      if (!isPlayerPositionSafe(zp, next.x, next.y)) continue;

      const nextKey = key(next.x, next.y);
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      queue.push({ x: next.x, y: next.y, firstMove: node.firstMove || dir });
    }
  }

  return 0;
}

function stepFrom(x: number, y: number, dir: number): { x: number; y: number } {
  if (dir & MOVE_RIGHT) return { x: x + 1, y };
  if (dir & MOVE_LEFT) return { x: x - 1, y };
  if (dir & MOVE_DOWN) return { x, y: y + 1 };
  if (dir & MOVE_UP) return { x, y: y - 1 };
  return { x, y };
}

function opposite(dir: number): number {
  if (dir === MOVE_RIGHT) return MOVE_LEFT;
  if (dir === MOVE_LEFT) return MOVE_RIGHT;
  if (dir === MOVE_DOWN) return MOVE_UP;
  return MOVE_DOWN;
}

function key(x: number, y: number): number {
  return y * 256 + x;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headForExit(zp: ZeroPage): number {
  const exits = [
    { x: XMIN, y: 76 },
    { x: XMAX_PLAYER, y: 76 },
    { x: 73, y: YMIN },
    { x: 73, y: PLAYER_MAX_Y },
  ];

  const ordered = exits
    .map((exit) => ({
      ...exit,
      dist: Math.abs(exit.x - zp.playerHorizPos) + Math.abs(exit.y - zp.playerVertPos),
    }))
    .sort((a, b) => a.dist - b.dist);

  for (const exit of ordered) {
    const move = findPathToPoint(zp, exit.x, exit.y);
    if (move !== 0) return move;
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Wall awareness
// ---------------------------------------------------------------------------

function canMove(zp: ZeroPage, dir: number): boolean {
  return canMoveFrom(zp, zp.playerHorizPos, zp.playerVertPos, dir);
}

function canMoveFrom(zp: ZeroPage, x: number, y: number, dir: number): boolean {
  const next = stepFrom(x, y, dir);
  return isPlayerPositionSafe(zp, next.x, next.y);
}

function isPlayerPositionSafe(zp: ZeroPage, x: number, y: number): boolean {
  if (x < XMIN || x > XMAX_PLAYER || y < YMIN || y > PLAYER_MAX_Y) return false;

  if (x === XMIN || x === XMAX_PLAYER || y === YMIN || y === PLAYER_MAX_Y) {
    return true;
  }

  const mazeOff = zp.mazeOffset ?? 0;
  return !(
    isPositionInWall(x, y, mazeOff) ||
    isPositionInWall(x + PLAYER_W - 1, y, mazeOff) ||
    isPositionInWall(x, y + PLAYER_H - 1, mazeOff) ||
    isPositionInWall(x + PLAYER_W - 1, y + PLAYER_H - 1, mazeOff) ||
    isPositionInWall(x, y + WALL_FEELER, mazeOff) ||
    isPositionInWall(x + PLAYER_W - 1, y + WALL_FEELER, mazeOff) ||
    isPositionInWall(x + WALL_FEELER, y, mazeOff) ||
    isPositionInWall(x + WALL_FEELER, y + PLAYER_H - 1, mazeOff)
  );
}
