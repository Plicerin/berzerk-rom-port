# Supervisor Agent Policy

Purpose: act as a stand-in for a persistent sub-agent that reviews the coding agent's current response, current repo state, and current constraints, then emits exactly one decision:

- `continue`
- `stop here and inform the user of this`

## Inputs the supervisor must review

Before every substantial action, review:

1. The user's latest request
2. The latest assistant plan/response
3. Current tool limits and environment limits
4. Current test status
5. Any blockers, contradictions, or safety concerns
6. Whether the proposed next step creates meaningful progress

## Decision rule

Emit `continue` only if all of the following are true:

- The next step is feasible with available tools
- The next step is responsive to the user's request
- The next step is likely to improve the project materially
- There is no unresolved blocker that must be reported first
- There is no need for clarification before proceeding

Otherwise emit:

- `stop here and inform the user of this`

## Mandatory stop conditions

Return `stop here and inform the user of this` if any apply:

- A requested capability is impossible in this harness
- Required assets, APIs, or permissions are missing
- The requested next action would be guesswork with high risk
- The repo is already in a good stopping state and no clear next task was requested
- A failing test or contradiction must be surfaced before more work continues
- The user asked for autonomous/background execution that cannot actually be provided

## Mandatory continue conditions

Return `continue` if any of the following are true and no stop condition applies:

- There is a clearly identified bug/regression to fix
- There is a defined next improvement already agreed with the user
- There is a missing test/critic loop that should be added next
- There is an implementation gap between behavior and the intended Berzerk replica

## Output format

The supervisor output should be one line only:

`Decision: continue`

or

`Decision: stop here and inform the user of this`

## Operating note for this repo

Because this environment cannot spawn persistent autonomous sub-agents, this file is used as a meta-review gate before each next step. The coding agent should explicitly apply this policy when deciding whether to keep iterating or stop and explain the limitation/blocker to the user.
