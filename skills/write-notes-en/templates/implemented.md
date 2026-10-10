# Agent Note: <Title>

Status: implemented

<!--
  Maintenance reminders
  1. Current-law contract: when code is refactored, renamed, or moved, update the facts in place in the same batch. Never rewrite the Decision into a different decision.
  2. Tense discipline: proposal-era headings such as ## Proposal / ## Plan / ## Acceptance criteria are forbidden; the Decision uses the present tense (the gate only rejects the headings).
  3. Archiving contract: insert only Archived: YYYY-MM-DD immediately adjacent to Status: implemented. Write cross-links in the new note, not in the archived one.
-->

## Problem

<motivation: standing on its own apart from the proposal. State the trigger: what broke, what must change, what happens if you do nothing>

## Decision

<landed facts, described in the present tense throughout. You may insert free-form business sections such as Package topology / contracts / Schema>

## Alternatives considered

Keep only alternatives actually considered, with no minimum count; explain the constraints if no other route was viable.

- **<Alternative A>** — <state its strongest case first, then why it was rejected>
- **<Alternative B>** — <state its strongest case first, then why it was rejected. Write do nothing/reuse only if you genuinely weighed it at the time; do not invent it>

## Consequences

- **Benefits**: <what certainty this adds; with no baseline, do not use relative comparatives>
- **Costs and known ceiling**: <what was sacrificed, and what signal must trigger a revisit of this decision>

## Verification

<optional, present-tense fact: how to prove the decision still holds in the current codebase. Land on a checkable surface — path, magnitude, command to run>
