# Agent Note: Ordered note decisions and host-owned record formats

Status: implemented

## Problem

The entry exempts ordinary local repairs while its broad behavior-change trigger can require a note for the same repair. The existing [fact-sync decision](../bug-fix/2026-10-10-validation-and-archive-consistency.md) still applies, but needs a deterministic ordering that separates fact maintenance from new rationale. Format checks cannot detect a model choosing the wrong action, as the [completed-review status error](2026-10-15-write-notes-en-review-findings.md) demonstrates.

A host may already keep flat ADRs. `AGENT_NOTE_ROOT` changes the root searched by the scripts; it does not adapt filenames, statuses or body schemas. Claiming those records can directly use the gates would either cause failure or encourage a second, conflicting note library. The long entry also repeats conditional installation and archive details despite having reference documents.

## Decision

The skill first discovers the host convention and the owning decision. Unchanged rationale with changed facts updates its owner; a changed decision or rationale creates a successor; otherwise only a durable constraint or tradeoff beyond code and tests warrants a new record. A local repair restoring a documented contract can change behavior without requiring a new note. Change size and file count are not thresholds.

Existing ADRs retain their own paths, statuses, structure, indexes and checks. The skill contributes writing and decision-maintenance guidance within that convention. Its strict gates, seals and board parser apply only to compatible Agent Notes. Migration requires an authorized scope covering identities, reasoning and incoming links. This does not weaken the [empty-root failure rule](2026-10-09-empty-note-root-must-fail.md).

Both entries retain the essential action and lifecycle rules plus direct Node.js 24 commands. Installation choices, CI, board options and archive operations live in existing references. Both board modes remain available without requiring a host package manifest. Partial supersession is identified at the start of the old Problem with a successor link, preserving the still-valid choice and original rationale.

`evals/note-behavior/` supplies isolated requests and file-based assertions. `scripts/eval-note-behavior.mjs` invokes real Codex against a local skill snapshot in temporary Git repositories, following the existing [fixture isolation decision](../testing/2026-10-09-fixtures-outside-the-repository.md). It observes no note, fact update, new decision, completion, rejection, flat ADR maintenance, partial supersession and both board modes. Model calls are explicit; CI runs only the offline grader regression suite.

## Alternatives considered

- **Keep the broad behavior trigger with more exemption examples:** concise at first, but competing rules still cover the same repair. An ordered procedure makes the owning record and lasting rationale decisive.
- **Automatically migrate existing ADRs or introduce a generic adapter:** would permit uniform validation, but creates schema mapping and history-rewriting responsibilities outside ordinary note maintenance. Host checks remain authoritative unless migration is requested.
- **Use prompt keywords or the model's final claim as the behavior oracle:** cheap and deterministic, but cannot prove that the correct file moved or that the old rationale survived. Independent file and code checks are combined with explicit human review items.
- **Run live model evaluations on every CI change:** could reveal behavior drift sooner, but requires credentials, incurs usage and depends on service availability. Maintainers invoke it when changing instruction behavior; offline grader checks remain in CI.

## Consequences

The model gets a single action order and cannot infer ADR compatibility from a root setting. Smaller entries make conditional guidance cheaper to retrieve without removing the board or archive tools. Maintaining two localized entries still requires shared-script and translation checks.

Automated behavior checks verify observable file actions, relevant code assertions and compatible format gates. They do not prove that alternatives are fair or rationale is preserved in meaning. Reports therefore keep semantic review pending, distinguish infrastructure failures from behavior failures, and retain prompts, responses and diffs for review. The suite explicitly invokes the skill; it does not measure automatic discovery. Results depend on the model, inherited local instructions and configuration, and a single run is not a reliability estimate.

## Verification

The 130-case offline gate suite and real installation checks pass for both editions, including both board modes. The 13-test offline grader suite passes, covering correct file actions, duplicates, completion-as-rejection, proposal rewrites, ADR migration, broken links and runner failure classification. Eight English model scenarios and two Chinese spot checks pass their automated checks; the maintenance assistant reviews the resulting diffs and claims separately. See the [dated evaluation results](../../../../evals/results/2026-10-16.md) for configuration, evidence and limits. Human acceptance remains pending in raw reports, which stay outside the repository. Both note-validation commands pass for all 14 active notes.
