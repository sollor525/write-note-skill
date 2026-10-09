# Read as needed: Note prose and leakage self-check

> Check against this list when writing or editing a note; skip it when you are only changing code and not touching notes.

## Principles

- Write only what the code cannot say: behavior, failures, ordering, ownership, consequences, and tradeoffs. Do not restate the code or your derivation.
- If an invariant can be encoded in a type, a visibility modifier, or an API error, do not leave it in a note alone.
- Write plainly: name who does what, under which conditions, with what result; avoid abstractions like "contract," "boundary," or "shape" unless that technical entity is exactly what you mean.
- Explain each fact fully in exactly one place and link to it from everywhere else; do not copy the same rule all over.
- When you finish, ask yourself: does this passage stand on its own without reading the implementation? Can a reader today verify it without having seen the chat at the time?

## Pre-writing self-check (from prose-standard)

- Every paragraph keeps its propositions complete: subject/action, condition/ordering, must/may/never, negative guarantees and exceptions, ownership/side effects/failure and consequences — none may be missing.
- `implemented` uses the present tense and describes landed facts; strip planning language and checklists.
- Keep searchable mechanism names and the key must/may/never, ordering, and negative emphasis; use decorative bold and exclamation marks sparingly.
- Within one change, apply a rule you just learned to every similar paragraph in a batch; do not fix just one spot.

## Check by location

- **Decision/Consequences**: are discrimination, throwing/refusing, side effects, ownership, ordering, cancellation, and persistence all spelled out?
- **Free-form sections** (topology/contract/schema): spell out responsibilities, dependencies, and any non-obvious choices and where they point.
- **Alternatives/Consequences**: write costs and benefits together, and name the capability given up and the re-introduction conditions.
- **Testing/Verification**: explain only *why* it is verified this way (the necessity of a fixture/assertion/real entry point); do not narrate a walkthrough.

## Leakage self-check (from trim-cot-leakage)

For every suspicious passage, ask: **is this visible only in the session/PR/draft of the moment? Can a reader at HEAD verify it independently?** If not, restate it from the repository's point of view and delete the session traces. Being parseable is not the same as being safe — verifiability only means it cleared the leakage bar; on a current-state surface such as a README or docs, a parseable change narrative is still a change narrative, so route it through category 3.

Common leaks (fix on sight):

1. Dead references: `(decision 7)`/`(audit C2)`/`§N`/`plan §1.4` — replace with a named path reference to a committed note or document; with no referent, delete the reference and restate the fact.
2. Stack/PR perspective: `a follow-up PR`/`added in this PR`/`the previous commit` — replace with a landed mechanism or extension point; for work not done, use a `TODO` or an issue reference, or collect it in a `## Deferred` section.
3. Change narration: `used to`/`no longer`/`the old X`/`this cut`/`now` — rewrite in the present tense; for regressions use a present-tense counterfactual, "without X, Y".
4. Review choreography: `rejected during review`/`reviewer confirmed`/`v5` — keep only the decision and the rationale; delete who said it and when.
5. Self-certifying correctness: `this conversion is safe because…` — replace with the invariant that makes it safe, or delete it outright (the code speaks for itself).
6. Process narration: `first X, then Y`/`a test walkthrough` — delete it and keep only the non-obvious contract.
7. Vagueness and placeholders: `should be enough`/`probably fine` — promote to `TODO/FIXME` or an explicit boundary.
8. Language bleed: working-language fragments that mix two languages — translate or delete them.

**Not leaks (keep them):** issue references such as `#1470`/`TODO(name):` (a bare `TODO` is watched by the body scan — see the exemption in the previous item), merged-PR references inside an Agent Note or postmortem, suppression rationales, present-tense counterfactuals, boundaries carrying measured values, runtime old/new states, and `§` numbers in committed documents.

## Overcorrection warning (overcorrection traps, from trim-cot-leakage)

Before deleting, list every proposition in the paragraph, then check against the four overcorrection traps:

- Cutting a must/must-not obligation down to a "you may do this" endorsement — the constraint becomes optional.
- Cutting a "planned/considered" assumption down to a landed fact — proposed treated as implemented.
- Deleting a true fact merely because it reads like process narration.
- Losing load-bearing provenance: delete the `measured` prefix, the source attribution, and the number from `measured: 512 nested ≈ 0.15s`, and the conclusion has no ground.
