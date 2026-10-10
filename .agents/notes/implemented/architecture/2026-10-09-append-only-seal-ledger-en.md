# Agent Note: Sealing archived notes with an append-only seal history, not a single hash list

Status: implemented

## Problem

The frozen-archive contract rested on one map inside `archived/manifest.json`: `path → sha256`. The hash lives in the same writable file it protects, with no external anchor, so "tamper-proof" degraded into "self-consistent":

Delete `manifest.json`, then run the seal-backfill command the docs recommend — `verify-archived-agent-notes.ts --write` — and edited archive text **quietly receives a fresh seal** and passes from then on. The README's promise that "touch a single character in an archived note and the check fires immediately" therefore did not hold.

Worse, that bypass was **our own recommended procedure**, written into the docs under "backfilling history". Nobody following it would think they were doing something dangerous.

## Decision

Sealing uses two files that must agree entry by entry:

- `archived/manifest.json` is a derived `path → sha256` index, updated together with the ledger;
- `archived/.seal-ledger.json` stores entries sorted by path, linked by `sha256(prevChain + "\n" + key + "\n" + seal)`. Inserting a path can recompute subsequent chain values; existing path/seal pairs are the protected facts.

Verification checks the chain, manifest key set, files on disk, and content hashes together. Dropping the last entry does not break the preceding chain, so chain validation cannot replace set comparison. Read-only checks never repair the index in memory.

- `--write` only adds seals; it cannot reseal known content or rebuild a single missing metadata file;
- `--reseal` requires a valid ledger. It can deliberately adopt content changes or recover a missing manifest from a complete ledger, but cannot repair a broken chain;
- a missing ledger must be restored. Initial migration may establish seals only when both metadata files are absent;
- existing path/seal pairs at a valid Git baseline must survive. When that baseline already contains a ledger, new archives need an implemented source at that commit, resolved under `AGENT_NOTE_ROOT`;
- an explicit `AGENT_NOTE_ARCHIVE_BASE_REF` that cannot be resolved or read is an error. Without one, missing Git or an unborn HEAD produces a warning and local checks only.

Both files use `scripts/seal-store.ts` and are updated together. Preflight, recovery, and parser constraints are recorded in [validation and archive consistency](../bug-fix/2026-10-10-validation-and-archive-consistency.md).

## Alternatives considered

- **Sign seals with an HMAC or a key** — the only approach that genuinely prevents tampering, but the key either lives in the repository (which makes it worthless) or in a CI secret (which degrades local use), and it trades away the core selling point: zero configuration, runnable with plain `npx tsx`. What remains is a worse middle ground — the appearance of cryptographic protection whose value depends on key management this project does not have. Rejected.
- **Keep a single manifest but make `--write` reject any key that already exists** — this blocks re-sealing, but not "delete the whole file and rebuild it", because once deleted nothing proves what was ever sealed. Testing confirmed that path bypasses the check, so one file cannot carry the frozen contract.
- **Commit the manifest to git and skip the ledger** — git does provide an external witness, but only when CI points the baseline at the pre-change commit; locally `HEAD` is a no-op (it compares the tree against itself). And the window where changes are uncommitted has no protection at all. Git and the seal history solve different problems; both are needed.
- **Change nothing and add a warning to the docs** — this project's premise is that a rule written in prose is not a rule, so replacing the mechanism with a warning contradicts its own position.

## Consequences

- **Benefit**: a missing index entry, truncated ledger tail, missing snapshot, or changed content fails verification. A valid Git baseline also detects local seals rewritten together.
- **Cost and limit**: the index and ledger remain in the same writable repository. Local consistency cannot prove that history was not jointly rewritten. CI needs a trusted pre-change commit; seals produced by `--reseal` remain subject to the subsequent baseline check.

## Verification

- `npm run test-gates` covers initial seals, missing metadata, a deleted tail or snapshot, broken chains, deliberate resealing, invalid Git refs, custom note roots, and isolated history-tampering fixtures.
- `verifyChain()` checks chain integrity and `sealIndexErrors()` checks manifest/ledger agreement. The archiver and verifier share both implementations.
