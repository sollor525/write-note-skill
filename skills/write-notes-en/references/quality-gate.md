# Read as needed: Semantic self-check (run through it after writing a note)

> The scripts govern structure; this list governs meaning. Self-check after writing, then report only the gaps and the strong points to the user — do not recite it line by line.
> Scope: this is a self-check for the agent, not a rule set for the scripts — every checkpoint below is a semantic judgment and never enters a verify script.

## Before you start: look it up yourself, then ask the user

- [ ] Is this "problem" really a decision? — Facts you can find yourself with the four §3 retrieval methods (entry-point comments if present / the class tree / rg / module docs) must not be thrown at the user. Finding facts is your job; only tradeoffs and calls take the user's time.

## Problem

- [ ] The motivation stands on its own apart from the proposal — delete the Decision and read it again; is it still the same problem?
- [ ] The trigger is clear: what broke, what must change, what happens if you do nothing.

## Decision / Proposal

- [ ] Specific enough to act on: not "use a better database" but "use SQLite for session storage".
- [ ] The rationale is forced out by a "vs" — writing "we chose X" obliges a line on "X vs Y: why X".

## Alternatives considered

- [ ] ≥2 real alternatives; do not invent options you never weighed. "Do nothing / reuse" counts as a slot only if you genuinely considered it at the time; it is not a required slot.
- [ ] For each rejected option, state its strongest case first, then why it was rejected — a rejection that lists only its weak points is a straw man.
- [ ] The reason for rejection lands on a concrete driving condition, not "it doesn't work in practice".

## Consequences

- [ ] Write both costs and benefits. Ask "what got harder? What is the maintenance cost?" — consequences with only benefits have been cherry-picked.
- [ ] A simplification states its known ceiling and when to revisit. A simplification with no escalation trigger quietly becomes permanent.
- [ ] With no baseline, do not use relative comparatives — when "improved/faster" cannot name a baseline, demote it to a statement of fact.

## Verification / Testing (implemented)

- [ ] Land on a checkable surface: which path, what magnitude, which command to run.
- [ ] Do not write "looks like it works" — acceptance criteria are either checkable or explicitly deferred.

## Reporting shape

After the self-check, report like this (one line per gap; if there are no gaps, close out):

```markdown
**Semantic self-check: <filename>**
✅ Solid: motivation stands alone / 2 real alternatives / consequences cover both cost and benefit
⚠️ Gaps:
- Alternatives — a "do it vs. don't" straw man; add a real option parallel to the current plan
- Consequences — "performance improvement" must land on which path and what magnitude
Verdict: fix those 2 and land it / acceptable gaps, ship it
```

If the user accepts the gaps, it ships; if not, fix them and land it. A judgment about meaning is not a script — do not prop it up into another gate.

## Is this self-check working? (observable criteria)

Look back periodically: the signals below mean the self-check is working; when they disappear, it is spinning idle:

- In the questions you put to the user, **factual questions no longer appear** that a glance at the note tree or a single `rg` would answer.
- Every gap in the report carries a **concrete fix** (which section to change, what to add) rather than "consider polishing it further".
- Routes rejected in `rejected/` and in Alternatives are **never proposed again by a fresh session** — that is exactly why the whole system exists.
