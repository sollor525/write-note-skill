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

- `statusIndexOf(lines, lifecycle)` matches against `STATUS_GRAMMAR`, so the archive CLI no longer compares literals;
- `build-board.ts` takes its section names from `SECTIONS` and `ALTERNATIVES_NAMES`, and its private list is gone;
- the section regex keeps only the `(?=^## )` lookahead; the empty-line branch is deleted.

**The chain's semantics are fixed as: stored order is chain order, sorted by key.** A single write path, `sealEntries()`, merges, sorts by key, recomputes the entire chain, and only then writes. `writeLedgerAndManifest()` asserts that the ledger it is handed is already sorted and throws if not. "Forgot to re-chain" is therefore no longer possible: the invariant is enforced by the function that writes, not by callers remembering.

**Everything else is a minimal fix.** The cross-note link label follows **the archived note's own language**, punctuation included (a halfwidth colon in English). `check-note-anchors` drops the overridden `.agents` carve-out in favour of a comment explaining that notes are not code, and gains `AGENT_NOTE_CODE_ROOTS` (multiple roots, split on the platform delimiter) so the scan range can be stated explicitly. The dead `ROOT_ALLOWLIST` exemption is deleted. Both `SKILL.md` editions list the missing alias. Both `note-format.md` editions state accurately that the gate accepts Chinese status lines and that this edition simply does not use them.

**Added `scripts/sync-editions.mjs`** (`npm run sync-editions`): byte-compares the shared files across editions, copies them with `--write`, and explicitly lists the intentionally-different files so localization is never mistaken for an omission.

## Alternatives considered

- **Make the archiver accept only the English status line, and document "archiving requires an English status line"** — this promotes a contradiction between two modules into a specification. A note that passes the gate should be archivable; that contract is more fundamental than the archiver's convenience, and documenting the restriction just makes the user carry the inconsistency.
- **Keep the board's private vocabulary and add a test asserting the two lists match** — a test detects drift, it does not prevent it, and the lesson here is that two lists *will* drift (this one already had, unnoticed). Removing the second list is more complete than monitoring it.
- **Give seal entries an arrival sequence number so out-of-order archiving is representable** — this makes the chain's validity depend on a field unrelated to content, and no reader can tell from the file whether the order is correct. Tying the chain to sorted order keeps the stronger property: whatever is on disk is valid.
- **Constrain archiving to ascending key order and document it as a rule** — that turns an internal invariant into user discipline. Users can and will archive a newer note first; the tool should not care.
- **Keep truncating the board to the first paragraph, on the grounds that a board only needs a summary** — then truncation is a feature and must be designed as one (deliberately take the opening paragraph and say so). What exists today is an unintended regex side effect that discards exactly the reasoning.

## Consequences

- **Benefit**: the gate, the archiver and the board finally agree on what a valid note is; out-of-order archiving no longer wounds the history; multi-paragraph sections render completely. The regression suite grew from 50 to 65 cases, each new one corresponding to a real defect above (out-of-order archiving, the first `--write` in a repository with no `archived/`, archiving a Chinese-status note, multi-paragraph extraction, alias parity, and four baseline-comparison behaviours: append passes, re-seal caught, removal caught, hand-dropped caught).
- **Cost and known limits**: `note-sections.ts` becomes a hard dependency of several entry points — the deliberate price of centralising. `sealEntries()` recomputes the whole chain per write (O(n)); negligible at thousands of notes. The real limit is that chain order is decided by `localeCompare` over keys, so **any change to the sort rule changes the historical chain** — that is a breaking change which must go through `--reseal`, and the baseline comparison catches it. Also note this fix **changes the meaning of existing seal histories**: a ledger produced by out-of-order archiving before this change will report `chain broken` and needs one `--reseal` to adopt. That upgrade note is not yet in the README.

## Verification

- `npm run test-gates` 65/65, including: the chain survives out-of-order archiving; the ledger is stored in sorted key order; the first `--write` on a repository with no `archived/` succeeds and creates both files; a note the format gate accepts with a Chinese status line can also be archived; the board keeps multi-paragraph sections; the board reads an alias the gate accepts; and the four baseline-comparison behaviours.
- Shared scripts are byte-compared across editions by `npm run sync-editions`, with independent assertions in `scripts/test-gates.mjs`.
- Not verified: the upgrade path (an old out-of-order ledger plus `--reseal`) was exercised only on synthetic fixtures, never on a real historical repository.
