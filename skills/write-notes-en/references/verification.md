# Read as needed: Verification scripts

> The deep dive behind SKILL §6. Check against it when wiring up CI; skip it for lightweight local use.

## Check scripts (all tsx, zero new dependencies, each runnable standalone with `npx tsx`)

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
   - Scans source code (root given by the env var `AGENT_NOTE_CODE_ROOT`, default cwd; node_modules/.git/dist and the like are skipped automatically) for physical `// Note:` / `# Note:` anchors: it reports dangling anchors, implemented notes that no anchor points at, and anchor lines missing their path. If the host does not use anchors, there is no need to run it.

## An empty root does not pass

`verify-agent-note-tree` and `verify-agent-note-format` exit non-zero when **they find zero notes**. This looks redundant, but it is actually the most common accident: an agent path written wrong, the wrong cwd, or a misdirected `AGENT_NOTE_ROOT`. Older versions printed `ok: 0 note(s) verified` and exited 0 — so the report said "verification passed" while nothing had been checked.

## Adoption advice

- Lightweight (solo / no git): the first two scripts are enough, and archiving seals take effect naturally after the first archive; but without git there is no external witness, and a seal can only leave a trace.
- Full (team): wire the three scripts of `npm run verify-notes` into CI and commit `manifest.json` and `.seal-ledger.json` alongside (this skill's `templates/verify-notes.yml` works as a template — copy it to `.github/workflows/` at the host root, verify the script paths, and enable it).

The gates check base notes and their optional `.zh.md` counterparts independently; they do not require translations to exist or check semantic equivalence. There is no migration-to-another-repository exemption. The anchor checkup is an optional soft report, not a gate.

## Script paths

`scripts/` in this document is relative to the skill's install directory. When running commands, keep the current directory at the host project root and invoke the scripts with the actual skill path; the install itself does not create host npm scripts.

## Consistency and failure rules

- Paired `.zh.md` files receive their own header, structure, and link checks; pairing does not exempt their contents.
- Links inside fences, inline code, quotations, or HTML comments are examples, not references. The first real H2 must be Problem or an accepted alias.
- Local-directory and bundled boards share `scripts/note-parser.mjs`; generated HTML embeds the same parser and vocabulary.
- The manifest, ledger, and archived files must agree entry by entry. Read-only verification never repairs missing entries. A lost ledger must be restored; a missing manifest can be explicitly recovered from a complete ledger with `--reseal`.
- With an explicit `AGENT_NOTE_ARCHIVE_BASE_REF`, unavailable Git, an unresolved ref, or a failed baseline read is an error. Without it, missing Git or an unborn HEAD produces a warning and only local checks. A valid commit without seal files represents the initial archive setup.
- Git source checks honor `AGENT_NOTE_ROOT`. `--reseal` does not exempt changes to seals already present at the comparison baseline; CI still rejects rewritten history.
