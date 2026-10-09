# Agent Note: <Title>

Status: proposed

<!--
  Maintenance reminders
  1. Rewrite contract when landing and moving to implemented: ## Proposal becomes a present-tense ## Decision;
     fold ## Acceptance criteria / ## Risks into ## Consequences (or present-tense ## Testing / ## Verification).
  2. Premise gone or no longer pursued → flip to Status: rejected — <reason>; never archive a proposed note.
  3. Alternatives is required: record only the rival options you genuinely considered; write "do nothing / reuse" only if you genuinely weighed it at the time.
-->

## Problem

<motivation, standing on its own apart from the proposal; state the background, constraints, and failure conditions>

## Proposal

<the proposed change, in the future tense if you like; include the key design, migration steps, and open questions>

## Alternatives considered

Required. Write only the options you genuinely weighed at the time (do not invent ones you never had). "Do nothing / reuse what exists" may be one slot, but it is not a required slot.

One candidate per paragraph, or a `### Why not <X>?` subsection:

- **<Alternative A>** — <why it was not chosen: state its strongest case first, then the reason for rejecting it; one paragraph per alternative>
- **<Alternative B>** — <same as above>

When you need a structured comparison of several options, use a criterion × option matrix (Fit / operational complexity / team skills / cost / lock-in risk / time to implement) and score each cell ✓/⚠️/✗. Every rejected option must carry a "why not".

## Acceptance criteria

<which observable state counts as done; include the verification surface and the gates>

## Risks

<what could go wrong, the known tradeoffs, and the rollback conditions>
