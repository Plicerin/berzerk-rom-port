# ASM Porting Procedure

This project ports the annotated `Berzerk (decomp).asm` into TypeScript while keeping the browser implementation practical to test and debug. Treat the ASM as the source of truth for game state, cadence, table data, collision order, and weird edge cases.

## Working Loop

1. Start from a concrete symptom or missing behavior.
2. Find the relevant ASM labels with `rg -n`.
3. Read the whole local ASM block around the label, not just the matching line.
4. Identify the zero-page variables, constants, tables, and carry/branch behavior used by that block.
5. Compare the TypeScript implementation against the ASM in the same execution order.
6. Add a failing regression before or alongside the fix.
7. Make the smallest scoped change that restores ASM behavior.
8. Run focused tests, then full regression checks.
9. Commit the successful change immediately.

Useful search patterns:

```powershell
rg -n "LabelName|zeroPageName|tableName" "Berzerk (decomp).asm" src
rg -n "playerMissile|robotVertPos|evilOtto|gameState" src src/tests
```

## Reading ASM

Use labels as behavioral boundaries. The most useful blocks are usually complete routines such as `DetermineEvilOttoParameters`, `DeterminePlayerMissileActive`, `SetupForPlayerExitingRoom`, `SetupForNewScreen`, `CheckForRobotDieing`, and `SortRobotVariables`.

When reading a routine, track:

- Register meaning: `A`, `X`, `Y`, and carry are often part of the logic.
- Branch polarity: `bcc`, `bcs`, `bmi`, `bpl`, `beq`, and `bne` usually encode timing or state gates.
- Fall-through behavior: many missile and movement routines intentionally continue into the next label.
- Aliased zero-page storage: some addresses are reused under different names.
- Table indexing: joystick direction nibbles and entry-direction constants are often raw table indices.

Do not translate comments alone. Confirm the instructions and tables.

## State And Tables

Port constants and tables exactly first. Behavior that looks wrong in TypeScript is often caused by one swapped table entry or a silently changed sentinel.

Common sentinels and domains:

- `0x7f` means off-screen for robots/player in several routines.
- `playerMissileDirection === 0` means no active player missile.
- `robotMissileDirection === 0` or `0x0f` may both represent inactive robot missile states, depending on path.
- `ROBOT_DEATH_ANIM_OFFSET` is the start of death frames, not the only death state.
- Robot Y and missile Y are stored in 2-line-kernel coordinates. Player Y and Evil Otto Y are full-height coordinates.

If a port uses a hand-coded switch to avoid a table, treat that as a smell. Prefer the decoded ROM table once the table is verified against ASM.

## Timing And Carry

The Atari code often uses accumulator overflow as the scheduler. Preserve carry semantics instead of replacing them with frame counters.

Examples:

- Player movement uses `playerMotion + PLAYER_FRACTIONAL_DELAY`, moving only on overflow.
- Robot movement uses `robotMotion + robotMotionDelay`, and the carry controls animation/movement.
- Robot missile movement uses `robotMissileDelay + delayTable[level] + carryFromLevelParity`.
- Evil Otto movement may depend on carry from `robotMotionDelay ASL` plus `robotMotion`.

In TypeScript, model this explicitly:

```ts
const sum = oldValue + delay + carryIn;
state.value = sum & 0xff;
const carried = sum > 0xff;
```

Avoid approximate timers unless the ASM uses one.

## Coordinate Domains

This is the easiest place to introduce visual regressions.

Use these domains:

- Player position: full-height game coordinates.
- Evil Otto position: full-height game coordinates.
- Robot position: 2-line-kernel Y coordinates.
- Player missile position: X in normal coordinates, Y in 2-line-kernel coordinates.
- Robot missile position: X in normal coordinates, Y in 2-line-kernel coordinates.
- Maze table row: 2-line-kernel row index.
- Renderer screen Y for robots and missiles: `stateY * 2 * SCALE_Y`.
- Renderer screen Y for player and Otto: `stateY * SCALE_Y`.

When comparing entities from mixed domains, convert at the boundary. For example, player-vs-robot collision compares `playerVertPos` to `robotVertPos * 2`, while player-missile-vs-robot collision compares both in 2LK space.

## Collision And Cleanup

Collision code should match the ROM's state order closely:

1. Move/update missiles.
2. Move/update robots.
3. Update Evil Otto.
4. Update player movement.
5. Check wall and missile bounds.
6. Check harmful player collisions.
7. Check player missile hits.
8. Advance death/reset state.

Important details:

- Dying robots must not block new bullets.
- Completed robot death animations must be removed/compacted like `SortRobotVariables`.
- Do not reset `numberRobotsKilled` before the room-clear bonus is awarded.
- Player room exits must be constrained to real doorway windows, not any wall edge.
- If the renderer and collision disagree, verify coordinate domains before changing collision thresholds.

## Regression Tests

Every port fix should add a regression at the behavioral boundary where the bug appeared.

Use focused tests first:

```powershell
npx vitest run src/tests/game-logic.test.ts
npx vitest run src/tests/renderer.test.ts
npx vitest run src/tests/player-missile-cadence.test.ts
```

Then run the full gate:

```powershell
npm test
npx tsc --noEmit
npm run test:visual
```

Use visual tests when changing renderer coordinates, palette, clipping, viewport, sprite reflection, or anything visible on the playfield.

Good regressions are specific:

- "player cannot exit through a sealed wall away from a doorway"
- "Evil Otto launches from the player's entry doorway"
- "dying robots do not absorb later player missiles"
- "player missile and robot render in the same 2LK vertical domain"

Avoid tests that merely duplicate implementation constants without proving behavior.

## Debugging Tips

- Reproduce using `tick()` where possible. Directly mutating state can miss ordering bugs.
- Disable unrelated hazards in tests by moving robots/missiles off-screen with `0x7f`.
- Set `mazeOffset = 9999` in missile cadence tests if wall collisions are not under test.
- Set `initRobotDelay = 0xff` when testing active robot behavior.
- Control `frameCount` carefully. `tick()` increments `state.frameCount` before copying it into zero-page state.
- Preserve dirty-worktree boundaries. Read `git status --short` before editing.
- Stage only the files involved in the verified fix.

## Commit Discipline

After every successful change:

1. Run focused tests.
2. Run `npm test`.
3. Run `npx tsc --noEmit`.
4. Run `npm run test:visual` for rendering or gameplay-visible changes.
5. Inspect `git diff`.
6. Stage only the intended files.
7. Commit with a concise behavior-oriented message.

Leave local artifacts untracked unless they are intentionally part of the project. Current examples are the manual PDF, imported session HTML, and generated `tmp/` renders.

