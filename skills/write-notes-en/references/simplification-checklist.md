# Read as needed: Simplification-opportunity self-check

> Scan it when wrapping up or refactoring; do not cram unrelated simplifications into a feature change.

## Signals that something should be deleted, merged, or downgraded

- A public method, event, config key, package, persisted event, or test artifact has no production consumer (tests/docs are the only consumers and the behavior is not critical).
- Two places represent the same fact (especially a persisted event and a transient event each holding a copy).
- Every implementation of a capability must implement some method, but no consumer calls it.
- A package exists only for tests/demo/support and adds release and dependency cost.
- Generality built for "we might need it later": multi-session support, a background-task ledger, a mid-year pivot, a built-in tool UI, and the like, with no current owner.
- Invariants, rollbacks, snapshots, or special cases prepared for an API that does not exist.
- Hand-rolled capability that an established package or the same Node version already provides; swapping it out yields a net deletion of implementation and its tests.

## How to confirm it

- Search symbols/events/config keys/package names with `rg` and check whether production code (`packages/*/src`, `examples` runtime, `loader/config` paths) actually uses them.
- Separate production, non-production, and ambiguous corpora — an occurrence in tests or docs is not production evidence; `knip` helps but does not replace reading the call sites.
- Note small, certain cleanups with `TODO/FIXME/XXX` instead of opening a note for them; only a durable tradeoff deserves a proposed note.
- Hand-rolled vs. dependency: weigh net deletion (implementation + tests + docs), health, and how well the boundary fits; swap only if you really delete code — wrapping it at the same complexity is not a win.

## How this connects to notes

- It matches a signal and this tradeoff needs to be preserved → write a `proposed/simplification` note (Problem/Proposal/Alternatives/Acceptance/Risks).
- A landed simplification → `implemented/simplification`, with Consequences recording the cost of what was deleted and the burden it saves.
- When the note tree starts to bloat, decide whether to archive using the "future reference value" test in `archiving.md`, not word count or age.
