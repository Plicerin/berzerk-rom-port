// Game activity logger
// Captures all significant game events for debugging room transitions and other issues.

export interface GameLogEntry {
  frame: number;
  type:
    | "PLAYER_MOVE"
    | "WALL_COLLISION"
    | "EXIT_CHECK"
    | "ROOM_EXIT_SETUP"
    | "ROOM_EXIT_TRANSITION"
    | "ROOM_CHANGE"
    | "ROBOT_MOVE"
    | "ROBOT_COLLISION"
    | "MISSILE_FIRE"
    | "MISSILE_HIT"
    | "PLAYER_COLLISION"
    | "PLAYER_DEATH"
    | "JOYSTICK";
  details: Record<string, unknown>;
}

/**
 * Circular buffer for game log entries.
 * Default max size: 10000 entries.
 */
export class GameLogger {
  private entries: GameLogEntry[];
  private maxSize: number;
  private enabled: boolean;

  constructor(maxSize = 10000) {
    this.entries = [];
    this.maxSize = maxSize;
    this.enabled = true;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  /** Log a single game event. */
  log(type: GameLogEntry["type"], details: Record<string, unknown>, frame: number): void {
    if (!this.enabled) return;
    this.entries.push({ frame, type, details });
    if (this.entries.length > this.maxSize) {
      this.entries.shift();
    }
  }

  /** Get all logged entries. */
  getEntries(): readonly GameLogEntry[] {
    return this.entries;
  }

  /** Get entries of a specific type. */
  getEntriesByType(type: GameLogEntry["type"]): readonly GameLogEntry[] {
    return this.entries.filter((e) => e.type === type);
  }

  /** Get entries for a specific room number. */
  getEntriesForRoom(room: number): readonly GameLogEntry[] {
    return this.entries.filter((e) => (e.details as Record<string, unknown>)?.room === room);
  }

  /** Clear all logged entries. */
  clear(): void {
    this.entries = [];
  }

  /**
   * Summarize the log: count by type, show room changes, etc.
   */
  summarize(): string {
    const counts = new Map<string, number>();
    for (const entry of this.entries) {
      counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
    }

    const lines: string[] = [];
    lines.push(`=== Game Log Summary (${this.entries.length} entries) ===`);
    for (const [type, count] of counts) {
      lines.push(`  ${type}: ${count}`);
    }

    // Find room changes
    const roomChanges = this.entries.filter((e) => e.type === "ROOM_CHANGE");
    if (roomChanges.length > 0) {
      lines.push("\nRoom changes:");
      for (const rc of roomChanges) {
        const d = rc.details as Record<string, unknown>;
        lines.push(
          `  Frame ${rc.frame}: room ${d.fromRoom} → ${d.toRoom} via ${d.exitDir}`
        );
      }
    }

    // Find exit checks that triggered
    const exitChecks = this.entries.filter((e) => e.type === "EXIT_CHECK");
    const triggeredExits = exitChecks.filter((e) => (e.details as Record<string, unknown>).triggered);
    if (triggeredExits.length > 0) {
      lines.push(`\nExit checks that triggered: ${triggeredExits.length}`);
      for (const ec of triggeredExits.slice(-10)) {
        const d = ec.details as Record<string, unknown>;
        lines.push(
          `  Frame ${ec.frame}: pos=(${d.playerX},${d.playerY}), exit=${d.exitSide}`
        );
      }
    }

    // Find wall collisions
    const wallCollisions = this.entries.filter((e) => e.type === "WALL_COLLISION");
    if (wallCollisions.length > 0) {
      lines.push(`\nWall collisions: ${wallCollisions.length}`);
    }

    return lines.join("\n");
  }

  /**
   * Get the last N log entries.
   */
  getRecent(n: number): readonly GameLogEntry[] {
    return this.entries.slice(-n);
  }
}

// Global logger instance (can be replaced per-game if needed)
export const gameLogger = new GameLogger();
