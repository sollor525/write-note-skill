# Agent Note: One vocabulary for the gates and the archiver; the seal chain is defined by sorted order

Status: implemented

## Problem

An external review (another agent, on Linux) reported twelve issues against this project. Verified one by one: nine were real, two did not hold, one was a wording gap. The real defects clustered into two root causes, and neither was "a line written wrong" — both were **the same piece of knowledge copied into two places**:

**Root cause one: several places kept their own copy of a vocabulary that should exist once.**

- `archive-agent-note.ts` tested the status line as the literal `line === "Status: implemented"`, while the format gate also accepts the Chinese form. So a note could **pass the gate and still be impossible to archive** — the gate called it a valid implemented note, the archiver did not recognise it.
- `build-board.ts` kept its own section-name list, which had already drifted to a Chinese alias the gate does not accept, and was missing three aliases the gate does. So **a note the gate accepted rendered as empty on the board**. That directly contradicted the "single source of truth" claim in the comment on `note-sections.ts`.
- The board's section regex ended with `(?=^## |\s*$)`. Under the `m` flag `\s*$` matches at any line end, so **every multi-paragraph section was truncated to its first paragraph** — normally the paragraph carrying the actual reasoning.

**Root cause two: the seal chain's semantics were never pinned down.**

The ledger used to chain entries in arrival order and then sort them by key when writing. Whenever those two orders differ, the file on disk no longer describes a valid chain, and the next verification **reports the project's own history as tampered**. The trigger is utterly ordinary: **archiving notes out of filename-date order** — the filename date is the day a decision was first proposed, which has nothing to do with when it was archived. Reproduced: archive `2026-01-01-newer.md`, then `2025-06-01-older.md`, and `verify-archived` immediately reports `chain broken` and exits 1.

The remaining real defects: the archive CLI wrote the Chinese link label `[历史快照：…]` into English notes (the docs only ever said the board's UI was Chinese); in `check-note-anchors` the carve-out `entry.name !== ".agents"` was completely overridden by `.agents` sitting in the very next `SKIP_DIR` check, making it dead code; the `{lifecycle}/AGENTS.md` exemption was undocumented and semantically incoherent (`AGENTS.md` is a repository-level file); both language editions of `SKILL.md` listed one alias fewer than the gate accepts; and the English `note-format.md` claimed status lines "stay English" when the gate accepts the Chinese forms.

## Decision

**Exactly one vocabulary.** Section names and status-line grammars are exported from `scripts/note-sections.ts`, and anything needing them must import them:

- the archive CLI uses `statusGrammarFor()` to validate line three of the fixed header, so examples cannot replace the status line;
- `note-parser.mjs` provides a self-contained parser with aliases supplied by `note-sections.ts`; format and link gates also share its example filtering;
- `build-board.ts` uses that parser for bundling and embeds it with its vocabulary into browser pages. Real H2 headings delimit complete sections, including multiple paragraphs and code examples.

**Stored order is chain order, sorted by key.** `seal-store.ts` merges, sorts, and recomputes the chain before `sealFileUpdates()` validates manifest agreement and ordering and prepares complete file contents. The verifier's `sealEntries()` and archiver's `prepareNewSeal()` share this process. `commitFileUpdates()` applies the batch and restores modified files after ordinary I/O failures. See [validation and archive consistency](2026-10-10-validation-and-archive-consistency.md) for its limits.

**Everything else is a minimal fix.** The cross-note link label follows **the archived note's own language**, punctuation included (a halfwidth colon in English). `check-note-anchors` drops the overridden `.agents` carve-out in favour of a comment explaining that notes are not code, and gains `AGENT_NOTE_CODE_ROOTS` (multiple roots, split on the platform delimiter) so the scan range can be stated explicitly. The dead `ROOT_ALLOWLIST` exemption is deleted. Both `SKILL.md` editions list the missing alias. Both `note-format.md` editions state accurately that the gate accepts Chinese status lines and that this edition simply does not use them.

**Added `scripts/sync-editions.mjs`** (`npm run sync-editions`): byte-compares the shared files across editions, copies them with `--write`, and explicitly lists the intentionally-different files so localization is never mistaken for an omission.

## Alternatives considered

- **Make the archiver accept only the English status line, and document "archiving requires an English status line"** — this promotes a contradiction between two modules into a specification. A note that passes the gate should be archivable; that contract is more fundamental than the archiver's convenience, and documenting the restriction just makes the user carry the inconsistency.
- **Keep the board's private vocabulary and add a test asserting the two lists match** — a test detects drift, it does not prevent it, and the lesson here is that two lists *will* drift (this one already had, unnoticed). Removing the second list is more complete than monitoring it.
- **Give seal entries an arrival sequence number so out-of-order archiving is representable** — this makes the chain's validity depend on a field unrelated to content, and no reader can tell from the file whether the order is correct. Tying the chain to sorted order keeps the stronger property: whatever is on disk is valid.
- **Constrain archiving to ascending key order and document it as a rule** — that turns an internal invariant into user discipline. Users can and will archive a newer note first; the tool should not care.
- **Keep truncating the board to the first paragraph, on the grounds that a board only needs a summary** — then truncation is a feature and must be designed as one (deliberately take the opening paragraph and say so). What exists today is an unintended regex side effect that discards exactly the reasoning.

## Consequences

- **Benefit**: format gates, the archiver, and both board modes share vocabulary and parsing rules. Out-of-order archives retain a valid chain and sections retain all paragraphs.
- **Cost and limit**: parser and vocabulary modules are shared dependencies that installations must deliver together. Seal writes sort by path and recompute the chain. Changing the sort rule is a storage-format decision; `--reseal` cannot repair a broken older chain. Corrupt history needs trusted backups or separate verification; no automatic migration command is provided.

## Verification

- `npm run test-gates` covers out-of-order insertion, initial writes, Chinese status lines, multiple paragraphs, aliases, example filtering, parity between embedded browser parsing and bundling, and legitimate versus invalid changes against a Git baseline.
- `scripts/sync-editions.mjs` and the regression suite byte-compare shared files. `npm run test-skill-install` exercises the delivered entry points and resources.
- Parser parity executes actual generated-page code in a Node VM. It does not replace browser interaction tests, and manual migration of a corrupt historical repository has not been exercised.
