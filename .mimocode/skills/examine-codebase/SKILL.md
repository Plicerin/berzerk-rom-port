---
name: examine-codebase
description: "Examine and analyze a codebase or folder structure. Reads source files, identifies architecture patterns, discovers bugs/issues, and delivers a structured analysis summary."
---

# Examine Codebase

Systematic codebase examination workflow. Given a directory path, produces a structured analysis covering architecture, patterns, issues, and key findings.

## When to use

- User asks to "examine this code", "explore this project", "analyze this codebase"
- User shares a folder path and wants to understand what's in it
- Starting work on an unfamiliar project and need orientation

## Procedure

### Phase 1: Discover structure

1. **Glob for source files** — Find all code files with common patterns:
   - `**/*.ts`, `**/*.js`, `**/*.py`, `**/*.java`, `**/*.rs`, `**/*.go`
   - `**/package.json`, `**/Cargo.toml`, `**/build.gradle`, `**/pom.xml`
   - `**/*.md` (README, docs)
2. **Read entry points** — Identify and read the main entry file(s) and configuration
3. **Map dependencies** — Check package manifests for frameworks, libraries, build tools

### Phase 2: Read core source

4. **Read key source files** — Prioritize by importance:
   - Entry point / main module
   - Core business logic / game logic / domain logic
   - Data models / state management
   - Configuration / constants
5. **For each file**, note:
   - Purpose and responsibility
   - Key classes/functions/exports
   - External dependencies
   - Anything unusual (debug artifacts, TODOs, potential bugs)

### Phase 3: Pattern analysis

6. **Grep for patterns** — Search for:
   - Error handling patterns (`try/catch`, `Result`, `panic`, `unwrap`)
   - Debug artifacts (`console.log`, `print`, `debugger`, `TODO`, `FIXME`, `HACK`)
   - Configuration values (magic numbers, hardcoded strings)
   - API boundaries (exports, public methods, route handlers)

### Phase 4: Synthesize

7. **Produce structured analysis** with these sections:

```
## Overview
- What is this project? (1-2 sentences)
- Language, framework, build system
- Entry point(s)

## Architecture
- Layer/module breakdown (table format)
- Data flow direction
- Key abstractions

## Key Findings
- Notable patterns (good or concerning)
- Potential bugs or issues
- Debug artifacts or tech debt

## File Map
- Critical files with one-line purpose each
```

## Tips

- Read files in dependency order: constants → models → logic → entry point
- For large codebases, focus on the "spine" — the main execution path
- Note but don't fix issues — the goal is analysis, not modification
- If the project has tests, read them for additional context on intended behavior
- Check for `.env`, `config.*`, or `settings.*` files for runtime configuration
