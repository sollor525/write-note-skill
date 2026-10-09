# Read as needed: When to write, when to change, and how decisions flow

> The deep dive behind SKILL §4. Check against it for every significant change or review.

## Core mental model: update the owning note, never create a duplicate (Update the owning note)

A long-lived note library keeps settling into the same shape: new notes are rare, while **in-place fact corrections** to existing notes account for the vast majority of changes.
**Do not treat a note as a one-off blog post or a running log. It is "current law" that lives and dies with the code.**

A note is never rewritten into a different decision: facts (paths, symbols, default values) change in place; when a decision or its rationale flips → open a new note and cross-link. Never rewrite `## Decision` into its opposite, and never let git be the only copy of the old rationale.

---

## 1. Scenario decision matrix

| Scenario | Action | Typical pattern |
|---|---|---|
| **Code refactor, rename, package move, default-parameter change** | **Update the existing note's facts in place** | The core rationale of the Decision is unchanged; edit the path, class name, or default value directly (do not append a change log). If the rationale changed, create a new note instead of editing in place |
| **Before writing a new note** | **Audit the active notes on the spot** | Search proposed + implemented + rejected by module name/keyword; classify every hit on the spot (unrelated / partial overlap / fully absorbed / stale proposal) and land that together with the new note. Never defer it to a cleanup sweep |
| **Proposing a brand-new architecture or technology choice** | **Create a new note in `proposed/`** | Before you write code, spell out the motivation, the alternatives you genuinely considered, and the acceptance criteria |
| **Finishing development and preparing to merge to main** | **Move it to `implemented/`** | See the rewrite checklist in §3; land it in the same batch as the code (in a git workflow, the same commit/PR) |
| **A new decision partially supersedes the plan** | **Keep both notes and cross-link them** | Update only the facts that still hold. Do not archive |
| **The plan is rejected in review** | **Move it to `rejected/` or delete it** | Keep it, with the reason written out, only when that reason can stop a future repeat; otherwise delete it outright |
| **A new architecture completely replaces the old one** | **Absorb first, delete if you can, otherwise archive** | See §4. Write the pointer in the new note, not in the archived one |
| **Version tagging, a minor dependency patch, formatting** | **Exempt (Not Applicable)** | Commit the code directly; no note needed |

---

## 2. In-place fact sync (In-place Fact Sync)

When the module an existing note guards evolves, but its core decision has not been overturned:

1. **Edit directly; keep no change log**:
   - ❌ Wrong: append `### 2026-09-02 update: class renamed to X` at the end.
   - ✅ Right: replace the old class name with the new one in the body, so that whenever you open this note it reflects the absolute truth of the HEAD branch.
2. **Always keep the present tense**:
   - Always use the present tense (`the system uses SQLite as its persistence engine`); never use change narration (`the system no longer uses JSONL; it now uses SQLite`). The gate only rejects proposal-era headings; the present tense rests on this discipline, not on a lexical scan.

---

## 3. proposed → implemented rewrite checklist

Do all of this in the same change:

1. Move it to `implemented/<class>/`; the date in the filename does not change (it is the date of first proposal)
2. `Status: proposed` → `Status: implemented`
3. `## Proposal` → `## Decision`, rewritten in the present tense (facts that have landed)
4. Fold `## Acceptance criteria` / `## Risks` into `## Consequences` (or into present-tense `## Testing` / `## Verification`)
5. Delete the planning sections (`## Plan` / migration steps / open questions)

The gate catches this through the skeleton change: a leftover `## Proposal` in an implemented note fails.

---

## 4. Supersession: partial overlap vs. full absorption

**Partial overlap**: the new plan covers only part of the old one → keep both notes, add relative links in both directions, and update only the facts that still hold. Do not archive; do not defer.

**Full absorption** (the old plan is eliminated outright):

1. **Audit the old note's assets**: its unique safety boundaries, negative guarantees, failure scenarios, re-introduction conditions, and verification gaps.
2. **Move and absorb**: fold them into the new note's `## Decision` / `## Alternatives considered` / `## Consequences`.
3. **The old note gets one of two fates**:
   - **Delete**: the new note already carries every unique piece of the old one and all inbound links are fixed → delete the file physically; it never enters `archived/`.
   - **Archive**: the old note still has independent leverage (a negative guarantee, an ownership boundary, a re-introduction condition) → `archive-agent-note.ts`. Insert only the single `Archived:` line; write the cross-link in the new note.
4. **Fix inbound links**: repoint relative links that still target the old path to the new note (point at `archived/` only when citing a historical snapshot).

`--superseded-by` only verifies that the new note exists and appends a relative link to the archived path at the end of the new note.

---

## 5. Optional: back-reference comments at source entry points

If the host project already has this convention, leave one line at a core entry point:

```typescript
// Note: session persistence is managed through file handles to avoid concurrent-write conflicts — see .agents/notes/implemented/architecture/2026-08-27-handle-based-session-persistence.md
export class SessionFileHandlePool {
  // ...
}
```

This is not a gate. `check-note-anchors` only reports softly and does not run in CI.
