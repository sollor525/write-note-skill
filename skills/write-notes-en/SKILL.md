---
name: write-notes-en
description: Use when a change is non-trivial (behavior, architecture, cross-file contracts, process/tooling, testing strategy, or on-disk/wire/config formats), when choosing between technical alternatives, superseding a decision, or writing a postmortem. Records the why and rejected options in .agents/notes/ with script-enforced gates; skips purely mechanical edits (CRUD, styling, patches, tagging, formatting). English edition.
---

# Write Notes (English edition)

> The chat agent breaks work down and sequences it; this skill does exactly one thing: keep *why this change*, *what was given up*, and *how we know it works* in one place, for whoever edits this code next.

## Hard gate: decide whether to write at all, before deciding how

Models have a completionist streak and reach for a note far too readily. Pass this gate first.

**Quick return — the following are "purely mechanical or local" changes. Do not write a note. Just change the code:**

- Pure reformatting, typo fixes, unambiguous renames
- Style-only changes (no behavior change)
- Dependency patches (no behavior change), release tagging (RC/Release tags)
- Routine CRUD, and explicit logic fixes within one module that are obvious from the diff (no cross-file impact)

**The bar: non-trivial changes must be written down.** Hitting *any* of the following makes a change non-trivial — it changes **behavior**, changes **architecture**, changes a **cross-file contract**, changes **process or tooling**, changes **testing strategy**, or changes an **on-disk / wire / config format** — or it is a decision other maintainers will plausibly revisit later.

**Before writing, work out which direction this note guards:**

1. **Looking forward (laying down a rule)** — a new cross-module communication contract, state-transition rule, access boundary, runtime invariant. Unrecorded, later agents each invent their own and punch through module boundaries.
2. **Looking back (recording a compromise)** — a mainstream or intuitive solution given up for a constraint nobody can see. Unrecorded, the rejected path gets walked again.
3. **Subtracting (narrowing)** — breaking refactors, code removal, shrinking a public surface. Unrecorded, nobody knows the exit conditions or migration boundary, so the subtraction stalls — or overshoots.

One line to remember: **intent, boundaries and trade-offs that code and unit tests cannot express are what make a change non-trivial.** When you cannot tell, err toward writing.

> To an AI, a rule written in prose is not a rule. Every discipline that *can* be checked mechanically has a script behind it (see §6). Decision reversals, auditing on the spot, and present-tense prose ride on the operating procedure, not on lexical scanning.
> Precedence: the host project's `AGENTS.md` / `CLAUDE.md` and direct user instructions **outrank this skill**. This skill is a default contract, not a higher law.

| The excuse | The reality |
|---|---|
| "It's just a default value / a rename" | Defaults and names are decision facts; updating the owning note in place takes 30 seconds |
| "Merge now, backfill later" | Later means never; rot starts with every "backfill later" |
| "The code is the documentation" | Code says **what**, never **why** or **what was given up** |
| "It's too small to matter" | Small ≠ exempt; one retry parameter once took down a whole service |
| "I'm not sure it needs a note" | Check the non-trivial list above: it hits, you write; it doesn't, you don't. Don't hide behind this sentence |

- **Prefer updating in place; create a file only when you must.** These note trees evolve the same way everywhere: few new notes, and the bulk of change is correcting facts (paths, class names, default values) in existing notes rather than opening new files. If a note already owns the decision, update that one.
- **Never rewrite a note into a different decision.** Facts (paths, symbols, defaults) are edited in place; when the decision or the reasoning flips → open a new note and cross-link. Never rewrite `## Decision` into its opposite, and never let git be the only copy of the old reasoning.
- **Audit the moment you write a new note; never defer it.** Search proposed + implemented + rejected by module name and keywords; classify every hit on the spot: unrelated / partially overlapping (cross-link) / fully absorbed (delete or archive) / stale proposal (reject or delete). The classification lands with the new note.
- **No junk in the archive.** A stale proposal becomes `Status: rejected — <reason>` (never archive it); a rejected record with no trap value gets physically deleted.

> A "decision" is not heavy. On a personal project it is just "why A and not B". Choices, trade-offs, and pitfalls you hit are all worth writing down.

## 0. Probe the repository before landing anything

Do not open with creating a full directory tree. Choose based on what this repository already looks like:

1. If there is an `AGENTS.md` / `CLAUDE.md` / contributing guide → read it. If decisions are already recorded somewhere (`docs/adr/`, `docs/decisions/`, an issue template) → follow that convention; only the statuses and classes come from this skill.
2. If there is no existing decision log → create the standard structure: `.agents/notes/{proposed,implemented,rejected,archived} × 6 classes`. Create directories as you need them; do not pre-create empty ones — and even for a solo project with no git, build the full structure rather than collapsing it to a single directory.
3. For a long-lived team repository → layer process on the same structure: add "significant changes must ship with a note" to `CONTRIBUTING.md` and the PR template, and wire the verification scripts into CI.

## 1. The path is the classification

A note's path *is* its identity: `{lifecycle}/{class}/yyyy-mm-dd-topic.md`

**Lifecycle (first-level folder — how far this note has got):**

- `proposed` — still an idea; a plan exists but is not implemented
- `implemented` — landed, kept in sync with the code in the same change
- `rejected` — deliberately turned down; keep only while it prevents a repeat, otherwise delete the whole thing
- `archived` — implemented records that are done and have little future reference value; frozen and immutable

**Class (second-level folder — exactly these 6; adding more means editing the checking scripts):**

- `feature` — new capability: choices visible to users or the model (non-obvious behavior counts)
- `bug-fix` — defects fixed, or gaps exposed by a postmortem and then closed
- `simplification` — subtract only: no new capability, just removing code, behavior or surface
- `architecture` — how the shipped source is organized: packages, boundaries, dependencies
- `process` — tooling and workflow around the code: checks, releases, collaboration
- `testing` — test strategy and infrastructure

> `refactor` is not a class of its own: if observable behavior changed, it belongs to the matching class; if nothing changed, it is `simplification`. Do not create an `INDEX.md`. Detailed judgment calls are in `references/classification.md`.

## 2. File format (the checking scripts verify this)

The first three lines are fixed:

```markdown
# Agent Note: <title>

Status: <status>
```

The status must match the lifecycle folder the note sits in (`rejected` carries a one-line reason), and the date in the filename is the day it was **first proposed**. Body skeleton:

- `proposed`: `## Problem` → `## Proposal` → …free sections… → `## Alternatives considered` → `## Acceptance criteria` → `## Risks`
- `implemented`: `## Problem` → `## Decision` (present tense) → …free sections… → `## Alternatives considered` → `## Consequences`
- `rejected`: the frozen proposal shape, with the verdict on the `Status:` line

> Alternatives are mandatory: record only the rival options genuinely considered, and state each one's strongest case before rejecting it. Never invent an option that was not on the table. "Do nothing / keep the status quo" counts only if it was actually weighed. The script only checks that the section exists (`## Alternatives considered`, or the accepted Chinese aliases `## 备选方案` / `## 已考虑的替代方案` / `## 备选`).
> The first section must be `## Problem` (Chinese `## 问题` is also accepted, and a fully Chinese skeleton passes the gate: `## 问题` / `## 决策` / `## 备选方案` / `## 后果`). `## Decision` in an `implemented` note is present tense. The gate rejects only proposal-era headings (`## Proposal` / `## Plan` / `## Migration plan` / `## Acceptance criteria` and their Chinese aliases). Details in `references/note-format.md`.

Templates are in `templates/`.

## 3. Look up past decisions before you start (four decentralized moves)

Before a refactor or a technology choice, check the historical constraints so you neither repeat a pitfall nor break a predecessor's compromise:

1. **Entry-point comments, if the host has them.** If a code entry point already carries `// Note: ... see .agents/notes/...`, follow it. If not, use the three moves below — do not add anchors just to make searching work.
2. **Slice the tree physically.** Do not scan everything; cut straight to the directory your intent implies (architecture → `implemented/architecture/`, pitfalls → `rejected/`).
3. **Precise global search.** Use ripgrep for the mechanism or keyword name, **always with `--hidden` and excluding `archived/`**:
   ```bash
   rg --hidden --glob '!.agents/notes/archived/**' "<mechanism or keyword>" .agents/notes/
   ```
4. **Drill down through module docs.** When a submodule README discusses design rationale, follow its relative markdown links to the note.

**Look it up yourself before asking the user.** Facts the four moves can answer are not the user's problem; only real decisions deserve their time.

## 4. When to write, and when to update

**Triggers in conversation** — when the user or you say something like this, it is time to pick up the pen (excluding the mechanical list in the hard gate at the top; do not use these phrases as an excuse to over-record):

- Settling on a direction: "let's go with X", "we'll use X", "we'll run X for now" → write a note
- Mid-comparison: "X or Y", "why do you lean X" → record the alternatives
- The same reasoning explained a second time → it should have been written down

Judgment and operating procedure:

- **Refactoring existing architecture / moving paths / changing parameters** → **update in place first**: correct the facts (code path, method signature, default value) inside the note that already owns the decision. Do not open a new note, and do not append a changelog to the body. If `## Decision`'s core reasoning is unchanged, edit in place; if the reasoning changed, open a new note.
- **Before writing a new note** → search the active notes by module name and keyword and classify on the spot (see "audit on the spot" above). Deferring this to a later cleanup is forbidden.
- **A new idea, not yet built** → write `proposed` first (why this approach, which alternatives were considered), then build once it has been reviewed. Interaction discipline below.
- **After building (proposed → implemented)**, in the same change: ① move it to `implemented/<class>/`, keeping the filename date; ② `Status: proposed` → `Status: implemented`; ③ `## Proposal` → present-tense `## Decision`; ④ fold `## Acceptance criteria` / `## Risks` into `## Consequences` (or a present-tense `## Testing`); ⑤ delete the planning sections. Land it together with the code — **with git, that means the same commit/PR**.
- **A new decision partially supersedes this one** → keep both, cross-link them both ways, and update only the facts that still hold. Archiving is forbidden here.
- **A new decision fully supersedes it** → the new note takes over and absorbs every unique piece of reasoning, alternative, consequence and verification gap; once inbound links are fixed, delete the old note if you can, and only run `archive-agent-note.ts` if it still carries independent leverage. The pointer goes in the new note, never in the archived one.
- **Exempt cases**: the hard gate at the top — anything in the quick-return list is committed as code and nothing else.

**Interaction protocol (when you need to ask the user):**

1. **Separate facts from decisions first.** Facts available in the environment (code, the note tree, ripgrep) are yours to find; only genuine calls on the merits cost the user time.
2. **Ask everything in one round.** List every open question with a number, one per line, each with a recommended answer `➡️ <recommendation>`; the user answers in bulk by number ("1 yes, 2 the second option"). Do not drip-feed questions or feel your way along.
3. **Converge with a confirmation gate, not a question limit.** Before writing or building, restate every decision and get the user's agreement; anything they defaulted on silently, they correct at that point. No confirmation, no action.
4. **More than five open decisions is a signal, not a quota.** It means the change is too large — split it into several notes, or submit a `proposed` draft for review. Do not force it into one conversation.

> Judgment details are in `references/when-to-write.md`; archiving and deletion in `references/archiving.md`.

## 5. How to write it well

- `## Consequences` records **costs and benefits**, not just "what was given up".
- Free sections (package topology, wire contracts, schemas) go between `Decision` and `Alternatives`, keeping searchable mechanism names and `must / may / never` timing emphasis.
- Cross-note references use relative markdown links `[topic](../../implemented/architecture/2026-…-….md)`, never bare numbers, so they can be checked mechanically.
- If the host already has the convention, a core entry point may carry one line `// Note: ... see .agents/notes/...`; this is not a gate. When a decision is superseded, those comments are part of the code checklist to update.
- Voice and de-jargoning: `references/prose-checklist.md`; simplification opportunities: `references/simplification-checklist.md`.
- When the note is written, run `references/quality-gate.md`'s semantic self-check and report **only the gaps and what is solid** to the user (≤5 lines), giving a concrete fix for each gap. Structure is the script's job; meaning needs a human nod.

## 6. Verification and maintenance commands

Run these from the repository root (once the npm scripts are configured):

```sh
npm run verify-agent-note-tree     # directory legality, classes, filenames, relative links (fails on an empty root)
npm run verify-agent-note-format   # head block, status, required sections, alternatives, proposal headings banned in implemented
npm run verify-archived            # archived notes: head layout, classes, seals and the append-only seal history
npm run verify-notes               # all three in sequence (use this in CI)
npm run archive-agent-note -- <path> [--superseded-by <new note>] [--strict]  # move + seal + inbound link report
npm run reseal-notes               # deliberately re-adopt edited archived content (prints what changed)
npm run check-anchors              # soft report: if code carries // Note: anchors, cross-check both directions; not a CI gate
npm run init-board                 # generate the lightweight board.html (recommended for daily use)
npm run bundle-board               # pack a self-contained demo.html with all note data inlined
```

> Language editions: this repository ships a Chinese edition (`write-notes`) and this English one (`write-notes-en`). Both share the same verification logic — note format, directory layout and status words are English identifiers, independent of the language you write notes in. **The board's UI wording is currently Chinese only**: the English edition reuses the same `assets/agent-notes-board.html`. To get an English board, localize that single file — both editions reference it, so the change applies to both.

**The limits of a seal (do not mistake it for tamper-proofing)**: `manifest.json` and `.seal-ledger.json` live inside the same repository, so anyone with write access can rewrite them along with the content. A local seal only *leaves evidence*. Real proof comes from an external witness — point `AGENT_NOTE_ARCHIVE_BASE_REF` at the pre-change commit in CI. That is why both seal files must be committed and must fall inside CI's comparison range. `--write` only ever adds; it never re-seals already-sealed content. Adopting an edit requires the explicit `--reseal`, and the commit message should say why.

The scripts live in this skill's `scripts/` and are invoked from the **host project root**; by default they check `.agents/notes/` under the current directory. Determine the skill's location from the loaded `SKILL.md` path; do not assume the host root has a `scripts/`, and do not `cd` into the skill directory. Installing the skill does not configure the host's npm scripts.

With a project-level install under `.agents/skills/`, you can call them directly:

```sh
npx tsx .agents/skills/write-notes-en/scripts/verify-agent-note-tree.ts
npx tsx .agents/skills/write-notes-en/scripts/verify-agent-note-format.ts
npx tsx .agents/skills/write-notes-en/scripts/verify-archived-agent-notes.ts
npx tsx .agents/skills/write-notes-en/scripts/build-board.ts --init board.html "Decision board"
```

If the skill is installed under `.claude/skills/` or a global directory, substitute the real path. Board packing takes `--bundle <notes-dir> <output.html> "<name>"`; flags and the immunity rules are in `references/verification.md`.

For a team, copy this skill's `templates/verify-notes.yml` into the host repository's `.github/workflows/verify-notes.yml`, adjust the paths to the real install location, and commit the project-level skill files alongside it; the template does nothing while it sits inside the skill directory. You can also add "significant changes must ship with a note" to `CONTRIBUTING.md` or the PR template.

## References

Load on demand:

- `references/note-format.md` — head block and body skeleton in detail
- `references/classification.md` — the 6 classes and their boundaries
- `references/when-to-write.md` — when to create / update / transition
- `references/archiving.md` — archiving and merge-then-delete (including the "future reference value" test)
- `references/prose-checklist.md` — voice and de-leaking self-check
- `references/simplification-checklist.md` — simplification opportunity self-check
- `references/quality-gate.md` — post-write semantic self-check: Problem / Alternatives / Consequences / Verification, plus the reporting format
- `references/verification.md` — what each checking script verifies, and why
