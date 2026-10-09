# Read as needed: Archiving, lifecycle governance, and the freeze mechanism

> Check against it when wrapping up, running a retrospective, or making a major-version jump; day-to-day changes carry zero overhead beyond replacing the nearest note in passing.

**Contents**: §0 Execution frequency (daily in-passing vs. spring cleaning) | §1 Staleness criteria and keep redlines (1.1 Redlines exempt from inspection / 1.2 Archiving criteria / 1.3 Garbage collection / 1.4 Calibration examples) | §2 The standard archiving procedure (CLI, including 2.1 What sealing can and cannot prove) | §3 The permanent frozen contract

---

## 0. Execution frequency: daily in-passing vs. milestone spring cleaning

You do not need a full scan on every code change. Tier the work by scenario:

1. **Daily commits (90% of scenarios: zero full-scan mental load)**:
   - **In-place edits (80%)**: after changing a module, update the facts in the existing note that owns that decision, in passing.
   - **On-the-spot audit (10%)**: when adding a note, search active notes by module name/keyword and classify every hit on the spot (unrelated / partial overlap → cross-link / fully absorbed → delete or archive / stale proposal → reject or delete). Never defer a known match to a spring cleaning.
2. **Milestone spring cleaning (10% of scenarios: governance on demand)**:
   - Handle only the ones you could not find at the time: a quarterly retrospective, a major release, or active notes piling up enough to hurt retrieval — then scan once, in a focused pass.

---

## 1. Staleness criteria and keep redlines

Whether something is stale is judged **neither by word count nor by how long it has existed**, but strictly by its "future guardrail value":

### 1.1 Active-area redlines: exempt from inspection (must stay in `implemented/` even if ancient)
Meet any one of the following and the note is never stale; it must never be archived:
- **Ownership boundaries**: it defines module call permissions and the architectural division of responsibility (e.g., "the UI layer must never connect to the DB directly").
- **Negative guarantees**: it explicitly promises to "never provide a capability" or "never be backward compatible with an old protocol."
- **Security and compliance floors**: hard constraints that prevent injection, auth bypass, or data leakage.
- **Tempting rejected options (Alternatives considered)**: it records a wrong path that is highly seductive but has been proven in practice to cause deadlocks or crashes.

### 1.2 Archiving criteria (move into `archived/`)
Archive only records in `implemented/` that meet one of these conditions:
- **Completely superseded by a new architecture but still carrying independent leverage**: a later note has absorbed the core logic, yet the old note still holds a negative guarantee / ownership boundary / re-introduction condition — archive it, and write the cross-link in the new note. Delete it if you can; see `references/when-to-write.md` §4.
- **One-off designs and narrow details**: a one-off UI margin tweak, a narrow single-point adapter for a retired platform, a simple bug fix that is fully closed out.

### 1.3 Garbage-collection rules (never enter the archive tree)
- **`proposed/` is never archived**: for a proposal whose premise disappeared (e.g., a dependency upgrade now ships the capability) or that is no longer being pursued, flip it straight to `Status: rejected — <one-line reason>`; if it was absorbed into another plan, just close it.
- **Worthless `rejected/` notes are deleted outright**: if the old technology/API the rejected plan depended on has been removed entirely, so that no future agent could possibly propose that wrong path again, delete the file outright and leave no dead weight.

### 1.4 Calibration examples (to set the bar; the word counts show that length is not the criterion)

When judging, calibrate against the **structure of the rationale** in these examples, not against word counts.

**implemented notes that should be archived (the decision is done; the rationale is unlikely to guide future work):**

- A collapsible sidebar control bar (~530 words) — a minor UI behavior, fully closed out;
- A CLI flag adapter (~1,500 words) — heavy on implementation detail, but almost no leverage over future design;
- A docs-generation pipeline (~920 words) — the machinery has served its purpose; the current generator is itself the authority.

**implemented notes that should be kept (the rationale still owns or constrains something):**

- Event-sourced session storage (~250 words) — foundational authority and a persistence boundary;
- Cross-product ownership resolution rules (~600 words) — one piece of ownership-boundary legislation;
- The project session directory policy (~630 words) — durable storage and identity policy;
- The parallel pre-push gate (~400 words) — an edge case, but it still governs gate scheduling;
- The retired image content block (~330 words) — keep it until multimodality lands: it records the coordinated re-introduction conditions.

**Kept vs. deleted rejected notes:**

- Keep "merged-archive splitting" (~430 words) — the temptation to merge is still there, so the anti-repeat value remains;
- Delete "streaming progress pushed through tool calls" (~970 words) — its ACP/UI premise is obsolete;
- Delete "dropping ACP terminal metadata" (~360 words) — a later automated decision already answered the question.

---

## 2. The standard archiving procedure

Use the CLI directly (physical move + seal + inbound dead-link report in one shot, **with no dependency on git**):

```bash
npx tsx .agents/skills/write-notes-en/scripts/archive-agent-note.ts \
  .agents/notes/implemented/<class>/<filename>.md \
  [--superseded-by .agents/notes/implemented/<class>/<new-note>.md] \
  [--strict]
```

The CLI does the following, in order:

1. **Write the header marker**: insert `Archived: YYYY-MM-DD` **immediately adjacent to** `Status: implemented` (no blank line between L3 and L4 — this is a hard contract, and the seal verifier checks it line by line):
   ```markdown
   # Agent Note: xxx

   Status: implemented
   Archived: 2026-08-31

   ## Problem
   ...
   ```
2. **Move the file**: `implemented/<class>/...` → `archived/<class>/...` (in a git workflow, prefer `git mv` to preserve history; the CLI implements it as a plain file move, which works just as well without git). The file's line-ending style is preserved verbatim — a CRLF note is still CRLF after archiving and never picks up bare LF.
3. **Seal**: write two files —
   - `archived/manifest.json`: a derived `path → sha256` index that may be rewritten;
   - `archived/.seal-ledger.json`: an **append-only seal history**, where each entry carries a chained hash linking to the previous one. Editing, deleting, or reordering any entry is caught on the spot by `verify-archived`.
4. **Inbound dead-link report**: scan active notes for Markdown relative links pointing at this note (exact link parsing, not text substring matching) and print the list that needs manual repair. With `--strict`, the CLI exits non-zero as long as any inbound link remains — the caller cannot treat it as "done" and skip it.
5. **Optional `--superseded-by`**: verify that the new note exists and append a relative link to the archived path in the **new note**. The link is inserted before the last section, so it never lands after `## Consequences`; an equivalent link that already exists is not inserted twice. The archived note is not touched.

Apart from the single `Archived:` header line, **no other character of an archived note's body may be changed**.

### 2.1 What sealing can and cannot prove

Stating this plainly matters more than adding one more check:

- **It can**: silent edits, deleting a seal, reordering history, dropping a note straight into `archived/` by hand — all of these turn red at the next `verify-archived`.
- **It cannot**: `manifest.json` and the seal history both live in the same repo, so anyone with write access can rewrite them together. **A local seal is tamper-evident, not tamper-proof.** The only real witness is an external baseline: set `AGENT_NOTE_ARCHIVE_BASE_REF` in CI to the pre-change commit, and the append-only rule is then backed by a commit that the working tree cannot rewrite.

Hence two hard rules:

1. **`manifest.json` and `.seal-ledger.json` must be committed to git, and must fall inside the CI comparison range**. While they are uncommitted, the seal history does not exist outside this repo, and whoever deletes it can simply rebuild it.
2. **`--write` only appends; it never reseals.** When the content of an already-sealed file has changed, `--write` refuses to write and demands an explicit `--reseal`:

   ```bash
   npx tsx .agents/skills/write-notes-en/scripts/verify-archived-agent-notes.ts --reseal
   ```

   `--reseal` adopts the current content as the new baseline and prints every entry it changed. It is the declaration "I know I am rewriting the frozen zone," and the commit message should explain why; unless the file is deleted or `--reseal` is used, an edited archived note does **not** receive a new seal.

> Backfilling legacy content: if `archived/` already holds notes but has no seal files yet (for example, after migrating from an existing corpus), run
> `npx tsx .agents/skills/write-notes-en/scripts/verify-archived-agent-notes.ts --write` to establish a baseline — it does so only while the directory has no seal history at all; once a seal history exists, a missing `manifest.json` must be restored from git, or explicitly re-adopted with `--reseal`.

---

## 3. Permanent frozen contract (Frozen Immutable Contract)

Once a note is in `archived/`:
- **Permanently read-only**: never edit, translate, reflow, update, move, or delete it.
- **Mechanically enforced**: `verify-archived` checks the header layout, the closed set of classes under `archived/<class>/`, agreement between on-disk content and the seal history, the chain integrity of that history, and an append-only comparison against the baseline ref (`AGENT_NOTE_ARCHIVE_BASE_REF`, default HEAD). A changed or deleted sealed entry is an error.
- **Degraded mode must be loud**: when git is absent, or git cannot run, the script prints an explicit degradation warning ("external witness missing") instead of passing quietly. A missing witness makes an edited and resealed note look perfectly normal.
- **Exempt from daily scans**: `verify-agent-note-tree` and `verify-agent-note-format` skip the `archived/` directory by default, so a broken outbound link in an archived file never blocks a daily build.
- **Never the basis for current behavior**: in a code conflict or architecture review, `implemented/` is authoritative and `archived/` serves only as historical evidence; supersession is settled by the cross-links in the new notes and by the inbound rewrites.

Run the commands above from the host project root; if the skill is installed elsewhere, replace `.agents/skills/write-notes-en` with the actual path.
