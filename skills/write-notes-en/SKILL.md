---
name: write-notes-en
description: Record durable engineering decisions, constraints, and rejected alternatives; maintain existing decision notes as code changes. Use for new or revised technical choices, cross-module contracts, postmortems, explicit note maintenance, and decision-note boards. Ordinary local fixes need no new note unless they introduce a lasting constraint or tradeoff. English edition.
---

# Write Notes

Keep why a decision exists, what was rejected, and how it was verified discoverable beside the code. Follow the user's instructions and the host's `AGENTS.md` or `CLAUDE.md` first.

## 0. Establish the host convention

Read the host guide and find its existing decision records before creating directories.

- **Existing ADR or other decision format:** preserve its location, filenames, headers, statuses, indexes, and validation commands. Apply this skill's decision-writing guidance within that format. Do not impose the skill's directory tree, gates, archive seals, or board parser on incompatible records.
- **Already using this skill's format:** keep the configured note root and run its checks.
- **No existing convention:** use `.agents/notes/` when a note is actually needed; create only the directories used. A routine fix does not initialize an empty note tree.

`AGENT_NOTE_ROOT` changes the root directory only; it does not adapt flat ADRs or other schemas. Migrate an existing collection only within an explicitly authorized migration scope. See [verification and adoption](references/verification.md).

## 1. Choose no note, update, or create

Search for the owning decision before choosing an action. Apply these rules in order:

| Situation | Action |
|---|---|
| An existing note owns the choice; only facts such as paths, symbols, or parameter values change | Update that note in place, even for an otherwise mechanical edit |
| The decision or its rationale changes | Create a new decision and link it to the old one; preserve the old reasoning |
| No owning note; the change introduces a durable constraint, contract, or tradeoff that code and tests do not explain | Create a note |
| No affected decision facts and no new lasting rationale | Change the code without a new note |

**A behavior change alone does not require a note.** A local bug fix restoring the documented contract, routine CRUD, formatting, styling, an obvious rename, or a dependency patch needs no new note when the diff and tests explain it. A one-line retry default can still need a note when it encodes a consequential operational compromise. File count and change size are not thresholds.

For a new decision, capture the hidden constraint or rejected alternative, a boundary other modules must follow, or the conditions for removing an old capability. Do not turn a task log into a decision record. Examples and interaction guidance are in [when to write](references/when-to-write.md).

## 2. Use the applicable format

For the skill's own format, identity is `{lifecycle}/{class}/yyyy-mm-dd-topic.md` under the note root. Keep the first-proposed date across moves. Do not create a centralized `INDEX.md` in this format.

- Lifecycle: `proposed` = not implemented; `implemented` = in effect; `rejected` = deliberately declined; `archived` = an immutable implemented snapshot.
- Class: `feature`, `bug-fix`, `simplification`, `architecture`, `process`, or `testing`. Choose a class only after deciding a note is needed; see [classification](references/classification.md).

The first three lines are `# Agent Note: <title>`, a blank line, and `Status: <status>`, followed by a blank line. Status must match the directory; rejected status includes a reason.

- Proposed: `Problem`, `Proposal`, `Alternatives considered`, `Acceptance criteria`, `Risks`.
- Implemented: `Problem`, `Decision`, `Alternatives considered`, `Consequences`; optional verification and design sections.
- Rejected: retain the proposal and put the verdict on the status line.

Use H2 headings. `Problem` comes first. Use present tense for implemented decisions; remove proposal-era sections. See [format and supported aliases](references/note-format.md) and `templates/`. Host ADRs keep their own skeleton instead.

## 3. Retrieve and reconcile

Follow existing source anchors or module-document links, slice the lifecycle/class tree, then search relevant keywords with `rg --hidden`, excluding the root's `archived/` directory. For a custom root, use that actual path in both the search and exclusion. Read supersession links before treating an old decision as current.

Before creating a note, classify related records: unrelated; partial overlap requiring links; fully absorbed; or an unimplemented proposal deliberately abandoned. Record relevant overlap handling with the new decision. Do not add source anchors just to enable retrieval.

## 4. Keep lifecycle and reasoning accurate

- When authorized implementation completes, move the proposal to `implemented`, preserve its date, rewrite `Proposal` as `Decision`, and fold acceptance criteria and risks into consequences or verification. Ship this with the code.
- No remaining work after implementation means **implemented**, not rejected. Use rejected only for an unimplemented choice actually declined; keep it only if its rationale prevents a repeat.
- Partial replacement: keep both records, cross-link, and prominently identify the superseded portion and its successor at the start of `Problem`. Preserve the still-valid decision and old rationale.
- Full replacement: absorb unique reasoning, alternatives, consequences, and verification limits; fix incoming links. Delete the old active record when fully absorbed, or archive only if independent historical value remains.
- Archive only implemented notes through `scripts/archive-agent-note.ts`. Never rewrite a frozen snapshot. Local seals show consistency; CI needs a pre-change Git baseline to detect rewritten history. Read [archiving](references/archiving.md) before archive, delete, or reseal operations.

## 5. Write and review the substance

Record only alternatives actually considered; there is no minimum count. Give each its strongest case before explaining the rejection. Explain benefits, costs, limits, and concrete verification. Use relative Markdown links between notes.

Ask only about unresolved material choices; inspect available facts yourself and proceed with work already authorized. A new note does not create another approval requirement.

After editing notes, use the host's applicable checks and the [semantic self-check](references/quality-gate.md). Report results and remaining gaps briefly. Use [prose guidance](references/prose-checklist.md) or [simplification guidance](references/simplification-checklist.md) only when relevant.

## 6. Run checks or generate a board

Run scripts from the **host root**, using the directory of the loaded `SKILL.md` as `NOTE_SKILL_DIR`. Node.js 24 runs them directly; a host `package.json` is not required. Only run the following gates for records adopting this skill's format:

```sh
node "$NOTE_SKILL_DIR/scripts/verify-agent-note-tree.ts"
node "$NOTE_SKILL_DIR/scripts/verify-agent-note-format.ts"
node "$NOTE_SKILL_DIR/scripts/verify-archived-agent-notes.ts"
```

For an explicitly requested decision board, use the same installed scripts:

```sh
node "$NOTE_SKILL_DIR/scripts/build-board.ts" --init board.html "Decision Board"
node "$NOTE_SKILL_DIR/scripts/build-board.ts" --bundle .agents/notes demo.html "Decision Board"
```

`--init` creates a local-directory viewer; `--bundle` embeds the selected note tree. Substitute the actual root for custom layouts compatible with this format. The shared board UI is Chinese in both editions. Installation paths, optional npm shortcuts, CI, overwrite behavior, archive commands, and bundle options are in [verification](references/verification.md).
