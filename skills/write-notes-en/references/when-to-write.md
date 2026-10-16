# Read as needed: When to write, when to change, and how decisions flow

> The decision procedure behind SKILL §1 and lifecycle details behind §4. Read when deciding whether to write or how to update a record.

## Core mental model: update the owning note, never create a duplicate (Update the owning note)

A long-lived note library keeps settling into the same shape: new notes are rare, while **in-place fact corrections** to existing notes account for the vast majority of changes.
**Do not treat a note as a one-off blog post or a running log. It is "current law" that lives and dies with the code.**

A note is never rewritten into a different decision: facts (paths, symbols, default values) change in place; when a decision or its rationale flips → open a new note and cross-link. Never rewrite `## Decision` into its opposite, and never let git be the only copy of the old rationale.

---

## 1. Ordered decision procedure

First read the host convention and search for an owning decision. Apply the first matching case below; classification comes afterwards.

| Situation | Action | Example |
|---|---|---|
| Existing decision, same rationale, changed facts | Update the owning record | A renamed module or adjusted timeout must stay accurate; no duplicate note |
| Existing decision or its rationale is reversed | Create a successor and preserve the old reasoning | A durability requirement replaces an in-memory-only queue |
| No owner, but a new lasting constraint, contract, or non-obvious tradeoff | Create a note | Other services must now honor a new wire version or consistency boundary |
| No affected decision facts and no new rationale beyond code/tests | No new note | Fix an off-by-one error to restore an already documented limit |

Behavior changes prompt this judgment; they do not automatically require a note. Routine CRUD, formatting, styling, a straightforward rename, and a behavior-preserving dependency patch need no new record unless they affect existing decision facts. A tiny change with a consequential operational compromise still deserves a record. A postmortem warrants a note when it identifies a lasting constraint or prevention rule, not merely because an error happened.

Before creating, classify related records as unrelated, partially overlapping, fully absorbed, or an unimplemented proposal deliberately abandoned. Cross-link partial overlaps; do not silently rewrite an old choice.

## Host formats and authorized work

For existing ADRs, keep the host's layout, status vocabulary and checks. The guidance above applies without importing this skill's header, folder, index or archive rules. Changing `AGENT_NOTE_ROOT` is not a schema migration; see [verification](verification.md).

Inspect facts yourself. Ask together only about unresolved material choices, such as an unauthorized migration or compatibility boundary. Already authorized work proceeds without another confirmation. Write a proposal before a new implementation when a new decision is needed; completing it moves that same record to implemented. Do not create a second record merely to mark completion.

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

Choose status by whether the proposal was implemented: no remaining work after completion means `implemented`; only an unimplemented, deliberately abandoned proposal becomes `rejected`.

Do all of this in the same change:

1. Move it to `implemented/<class>/`; the date in the filename does not change (it is the date of first proposal)
2. `Status: proposed` → `Status: implemented`
3. `## Proposal` → `## Decision`, rewritten in the present tense (facts that have landed)
4. Fold `## Acceptance criteria` / `## Risks` into `## Consequences` (or into present-tense `## Testing` / `## Verification`)
5. Delete the planning sections (`## Plan` / migration steps / open questions)

The gate catches this through the skeleton change: a leftover `## Proposal` in an implemented note fails.

---

## 4. Supersession: partial overlap vs. full absorption

**Partial overlap**: the new plan covers only part of the old one → keep both notes and add relative links in both directions. At the start of the old note's `Problem`, prominently identify the superseded portion and its successor. Preserve the original rationale and the still-valid decision; update facts only within that surviving scope. Do not archive the still-active record.

**Full absorption** (the old plan is eliminated outright):

1. **Audit the old note's assets**: its unique safety boundaries, negative guarantees, failure scenarios, re-introduction conditions, and verification gaps.
2. **Move and absorb**: fold them into the new note's `## Decision` / `## Alternatives considered` / `## Consequences`.
3. **The old note gets one of two fates**:
   - **Delete**: the new note already carries every unique piece of the old one and all inbound links are fixed → delete the file physically; it never enters `archived/`.
   - **Archive**: the old note still has independent leverage (a negative guarantee, an ownership boundary, a re-introduction condition) → `archive-agent-note.ts`. Insert only the single `Archived:` line; write the cross-link in the new note.
4. **Fix inbound links**: repoint relative links that still target the old path to the new note (point at `archived/` only when citing a historical snapshot).

`--superseded-by` requires a different active note and inserts a relative archive link before its last section. An equivalent link already present is not duplicated.

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
