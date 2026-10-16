# Read as needed: Verification scripts

> Read when adopting gates, locating installed scripts, generating a board, or configuring CI.

## Existing ADRs versus this skill's format

The supplied gates and board parser require `{lifecycle}/{class}/yyyy-mm-dd-topic.md` and the Agent Note header and sections. `AGENT_NOTE_ROOT=docs/adr` changes only the root; it does not make `docs/adr/0001-database.md` compatible. Keep the host's naming, status vocabulary, index and validation commands when it already has a different convention. If it has no validator, inspect its records against the host template and report that review; do not claim the bundled gates passed or run them against an incompatible collection.

Adopting the strict format is a separate, authorized migration: establish the target root, path/date/status mapping, preserved reasoning, and incoming-link changes first. Do not silently reorganize history or create a parallel note library. Empty-root checks remain errors; a host-format review is not an exception inside those checks.

## Locate and run the installed scripts

Use the directory of the loaded `SKILL.md`; installations can be project-local or global. Keep cwd at the host root. Set `NOTE_SKILL_DIR` to that actual directory, not to the host's `scripts/`. Node.js 24 runs the TypeScript scripts directly without a host `package.json`:

```sh
# Example only: substitute the actual installed skill path.
NOTE_SKILL_DIR="$HOME/.codex/skills/write-notes-en"
node "$NOTE_SKILL_DIR/scripts/verify-agent-note-tree.ts"
node "$NOTE_SKILL_DIR/scripts/verify-agent-note-format.ts"
node "$NOTE_SKILL_DIR/scripts/verify-archived-agent-notes.ts"
```

If the host already uses `tsx`, `npx tsx <script>` is also supported; npx may download the runner. Installing the skill does not add npm commands. Use `npm run verify-notes` or `npm run init-board` only after confirming that the host's `package.json` defines them. Do not create a package manifest solely to run these scripts.

## Check scripts

1. **`verify-agent-note-tree`** (`scripts/agent-note-tree.ts` + `scripts/verify-agent-note-tree.ts`)
   - Verifies the closed lifecycle set `proposed/implemented/rejected` + `archived`, the 6-class closed set, the path depth `{lifecycle}/{class}/file.md`, the filename form `yyyy-mm-dd-topic.md`, the ban on `INDEX.md`, and the validity of relative Markdown links among active notes.

2. **`verify-agent-note-format`** (`scripts/verify-agent-note-format.ts`)
   - Header: line 1 is the `# Agent Note:` title (both halfwidth and fullwidth colons are accepted; Chinese input methods often produce the fullwidth form), lines 2 and 4 are blank, and line 3 is `Status:`, consistent with the lifecycle and unique in the file.
   - Skeleton: the first section must be `## Problem` (Chinese alias also accepted: `## 问题`); the per-lifecycle required sections match their English or Chinese aliases (`## Decision`/`## 决策`/`## 决定`, `## Consequences`/`## 后果`/`## 影响`, and so on; a parenthetical suffix like `## Decision (note)` is stripped before matching); `implemented` forbids proposal-era headings (`## Proposal`/`## Plan`/`## Migration plan`/`## Acceptance criteria` and their Chinese aliases). The present tense is a prose discipline; the body is not scanned.
   - Alternatives: one of the aliases `## Alternatives considered` / `## 替代方案` / `## 已考虑的替代方案` / `## 备选方案` / `## 备选` is mandatory. Only historical notes dated before `FORMAT_ADOPTED` may use the explicit `GRANDFATHER_COMMENT` marker defined in `scripts/note-sections.ts`; newer notes cannot use it as an exemption. The script does not impose a minimum number of alternatives.
   - Compatibility: CRLF/BOM are normalized automatically.

3. **`verify-archived`** (`scripts/verify-archived-agent-notes.ts` + `scripts/seal-store.ts`, shipped as standard)
   - For each archived note: the header layout is verified line by line (L3 `Status: implemented` / L4 `Archived: YYYY-MM-DD` immediately adjacent / L5 blank); the path must be `archived/<class>/`, and the class closed set matches the active area. It does not recognize a `Superseded-by:` field.
   - `archived/manifest.json`: every file has a seal entry, every entry has a matching file, and the sha256 matches the on-disk content.
   - `archived/.seal-ledger.json`: a seal history sorted by path, with each entry linked to the previous one by a hash. The chain, manifest agreement, on-disk files, and Git baseline are checked together. Existing path/seal pairs cannot change; inserting a new path may recompute later chain values.
   - append-only: compares entry by entry against the baseline ref (env `AGENT_NOTE_ARCHIVE_BASE_REF`, default HEAD). CI must point at the pre-change commit (the template workflow uses `pull_request.base.sha` for PRs and `github.event.before` for pushes); using HEAD is the same as not checking at all. It also rejects a new seal with no corresponding implemented note in the baseline — a note dropped into `archived/` by hand cannot obtain a legitimate seal.
   - `--write`: **append only**. If a sealed file's content has changed, it refuses to write (no resealing). If a seal history exists but `manifest.json` is missing, it also refuses an implicit rebuild.
   - `--reseal`: explicitly adopts the current content as the new baseline and prints each changed entry. This is the declaration "I know I am rewriting the frozen zone."
   - **Degraded mode must be loud**: without an explicit baseline, when git is absent or cannot run (sandbox, permissions), it prints an explicit "external witness missing" warning instead of passing silently. The seal history lives inside this repo; only an external baseline can truly prove that nobody changed it.

4. **`check-note-anchors`** (`scripts/check-note-anchors.ts`, soft report, exit code always 0, **not in CI**)
   - Scans source code for physical `// Note:` / `# Note:` anchors. `AGENT_NOTE_CODE_ROOTS` accepts paths separated by the platform path delimiter; the legacy singular `AGENT_NOTE_CODE_ROOT` is still honoured, defaulting to cwd. Hidden directories, node_modules, dist and similar output directories are skipped; individual filenames receive no exemption. The first Markdown path after each marker is resolved in full: absolute paths directly, relative paths against both the host root (cwd) and the source file's directory. A normalized path must stay inside `AGENT_NOTE_ROOT` and identify exactly one existing target. If the two bases identify different files, the report asks for an absolute path. Reports missing paths, paths outside the root, ambiguity, dangling references, and unanchored implemented notes; never substitutes a matching filename or suffix.
   - With `AGENT_NOTE_ROOT=docs/adr`, both the repo-relative `docs/adr/implemented/architecture/2026-01-02-example.md` and the file-relative `adr/implemented/architecture/2026-01-02-example.md` inside `docs/code.ts` are valid. Quote paths containing spaces, using quotes or backticks. Markdown links are supported and `#fragment` is ignored. This is a line-based text scan, not a language parser; construct fixture markers from separate strings to avoid treating examples as real comments. If the host does not use anchors, there is no need to run it.

5. **`verify-bilingual-notes`** (`scripts/verify-bilingual-notes.ts`, optional, used by this repository itself)
   - A project that keeps its own bilingual notes outside the `<base>.md` + `<base>.zh.md` convention can compare the two sides mechanically: this script checks that an English note sharing a base filename agrees with its base note on the `## ` heading sequence, the first-proposed date and the status line. It does not compare prose meaning. Wire it into your own pipeline only if you adopt such a convention; the three gates above stay the host's contract.

## An empty root does not pass

`verify-agent-note-tree` and `verify-agent-note-format` exit non-zero when **they find zero notes**. This looks redundant, but it is actually the most common accident: an agent path written wrong, the wrong cwd, or a misdirected `AGENT_NOTE_ROOT`. Older versions printed `ok: 0 note(s) verified` and exited 0 — so the report said "verification passed" while nothing had been checked.

## Adoption advice

- Lightweight (solo / no git): the first two scripts are enough, and archiving seals take effect naturally after the first archive; but without git there is no external witness, and a seal can only leave a trace.
- Full (team): wire the three scripts of `npm run verify-notes` into CI and commit `manifest.json` and `.seal-ledger.json` alongside (this skill's `templates/verify-notes.yml` works as a template — copy it to `.github/workflows/` at the host root, verify the script paths, and enable it).

The gates check base notes and their optional `.zh.md` counterparts independently; they do not require translations to exist or check semantic equivalence. There is no migration-to-another-repository exemption. The anchor checkup is an optional soft report, not a gate.

## Script paths

`scripts/` in this document is relative to the skill's install directory. When running commands, keep the current directory at the host project root and invoke the scripts with the actual skill path; the install itself does not create host npm scripts.

## Board and archive commands

For a compatible note tree, use the same `NOTE_SKILL_DIR` from above:

```sh
node "$NOTE_SKILL_DIR/scripts/build-board.ts" --init board.html "Decision Board"
node "$NOTE_SKILL_DIR/scripts/build-board.ts" --bundle .agents/notes demo.html "Decision Board"
node "$NOTE_SKILL_DIR/scripts/check-note-anchors.ts"
node "$NOTE_SKILL_DIR/scripts/archive-agent-note.ts" .agents/notes/implemented/architecture/2026-01-01-example.md --strict
node "$NOTE_SKILL_DIR/scripts/verify-archived-agent-notes.ts" --reseal
```

Choose only the command needed; resealing explicitly adopts edited archive content and is not routine validation. Archive eligibility, `--superseded-by`, incoming links and deletion are covered in [archiving](archiving.md).

`--init` emits a viewer; open it and select the note directory. `--bundle` embeds the specified tree, so replace `.agents/notes` for a custom compatible root. It includes full note bodies by default; `--metadata-only` omits bodies and reasoning. Neither mode converts flat ADRs or needs npm initialization. The board UI is Chinese in both editions. Existing generated boards may be regenerated; an unrelated output file is rejected unless `--force` is explicitly requested.

For CI, copy `templates/verify-notes.yml` into the host's `.github/workflows/`, adjust the installed paths, and commit the referenced skill files. The template has no effect inside the skill directory. Optional npm shortcuts wrap these scripts. Configure `AGENT_NOTE_ARCHIVE_BASE_REF` to the pre-change commit and commit both seal files together. Local seals in a writable repository cannot independently establish that history was never rewritten.

## Consistency and failure rules

- Paired `.zh.md` files receive their own header, structure, and link checks; pairing does not exempt their contents.
- Links inside fences, inline code, quotations, or HTML comments are examples, not references. The first real H2 must be Problem or an accepted alias.
- Local-directory and bundled boards share `scripts/note-parser.mjs`; generated HTML embeds the same parser and vocabulary.
- The manifest, ledger, and archived files must agree entry by entry. Read-only verification never repairs missing entries. A lost ledger must be restored; a missing manifest can be explicitly recovered from a complete ledger with `--reseal`.
- With an explicit `AGENT_NOTE_ARCHIVE_BASE_REF`, unavailable Git, an unresolved ref, or a failed baseline read is an error. Without it, missing Git or an unborn HEAD produces a warning and only local checks. A valid commit without seal files represents the initial archive setup.
- Git source checks honor `AGENT_NOTE_ROOT`. `--reseal` does not exempt changes to seals already present at the comparison baseline; CI still rejects rewritten history.
