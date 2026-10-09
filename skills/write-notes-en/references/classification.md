# Read as needed: Class classification

> The deep dive behind SKILL §1. Check against it when choosing a class for a new note.

## Closed set (6 classes; adding one means changing the check scripts)

| Class | Scope |
|---|---|
| `feature` | Adds a capability facing users or the model |
| `bug-fix` | Fixes a defect or closes a gap a postmortem exposed |
| `simplification` | Removes code, behavior, or surface without adding a capability |
| `architecture` | Structural decisions about shipped source — how packages relate, what the runtime vocabulary is |
| `process` | Tooling, policy, and process outside the code — gates, package management, vendoring, and the like |
| `testing` | Test infrastructure and strategy |

Rules of thumb:

- `architecture` vs. `process`: the former is "what the shipped source looks like," the latter is "the toolchain and workflow around that source."
- `refactor` gets no class of its own — separate cases with the `simplification` test, "did observable behavior change?"; unchanged behavior means `simplification`, changed behavior belongs to the matching `feature`/`bug-fix`/`architecture`.
- Do not reserve `feature` for "new capability" only — **a behavior or product choice that is visible to users or the model and is not obvious, and that does not rise to architecture, also belongs to `feature`**. The test is "can a user or a downstream system observe the behavior," not "how much code changed." Only local implementation details, ordinary refactors, and behavior-preserving dependency patches get no note at all.
- When in doubt, ask who will search for this note later: capability evolution is found under `feature`, structural decisions under `architecture`, gates and releases under `process`.

Semantic requirements every note must carry (things the check scripts cannot police):

- **Alternatives records only the rival options you genuinely considered**: state an option's strongest case before rejecting it — a rejection that lists only its weak points is a straw man. Write "do nothing / reuse" only if you genuinely weighed it at the time; do not invent it.
- **A simplification must state its cost ceiling**: a `simplification`'s `## Consequences` must spell out "what the known ceiling of this tradeoff is, and what signal should trigger a revisit." A simplification with no escalation trigger quietly becomes permanent.
- **Verification must be checkable**: when you write "this is fixed," land on a surface that can be inspected (record "which path, what magnitude, which command confirms it"); with no baseline, avoid relative comparatives — "improved" or "faster" with no comparison baseline is an unverified assertion, worse than writing nothing.

## Check scripts

`scripts/agent-note-tree.ts` defines the `AGENT_NOTE_CLASSES` constant; an unknown class folder or a stray `.md` at a lifecycle root is an error. Adding a class means changing both the constant and this document, or the check goes red immediately.

The closed class set and these tests apply to note governance in any repository.
