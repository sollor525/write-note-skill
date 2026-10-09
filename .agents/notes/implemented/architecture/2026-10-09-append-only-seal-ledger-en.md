# Agent Note: Sealing archived notes with an append-only seal history, not a single hash list

Status: implemented

## Problem

The frozen-archive contract rested on one map inside `archived/manifest.json`: `path → sha256`. The hash lives in the same writable file it protects, with no external anchor, so "tamper-proof" degraded into "self-consistent":

Delete `manifest.json`, then run the seal-backfill command the docs recommend — `verify-archived-agent-notes.ts --write` — and edited archive text **quietly receives a fresh seal** and passes from then on. The README's promise that "touch a single character in an archived note and the check fires immediately" therefore did not hold.

Worse, that bypass was **our own recommended procedure**, written into the docs under "backfilling history". Nobody following it would think they were doing something dangerous.

## Decision

Sealing splits into two files with different jobs:

- `archived/manifest.json` — a derived index, `path → sha256`, freely rewritable;
- `archived/.seal-ledger.json` — the **append-only seal history**, where each entry carries a hash chaining it to the entry before it: `sha256(prevChain + "\n" + key + "\n" + seal)`.

Verification order is fixed: **first** validate the ledger's own integrity via the chain (editing, dropping or reordering any entry breaks it), **then** compare the ledger's values against the content on disk. When the ledger knows a key, the manifest is only a fallback for older repositories — it can never override the ledger.

Writing is tightened to match:

- `--write` **only adds**; it never re-seals content the history already knows;
- adopting an edit requires the explicit `--reseal`, which prints every changed entry;
- when the ledger exists but `manifest.json` is gone, the script refuses to rebuild it implicitly;
- against a git baseline, a newly added seal must correspond to an `implemented/` note that **existed** at that baseline — a note dropped straight into `archived/` cannot obtain a legitimate seal.

Both files go through `scripts/seal-store.ts`, so the archive CLI and the verifier cannot each implement their own version.

## Alternatives considered

- **Sign seals with an HMAC or a key** — the only approach that genuinely prevents tampering, but the key either lives in the repository (which makes it worthless) or in a CI secret (which degrades local use), and it trades away the core selling point: zero configuration, runnable with plain `npx tsx`. What remains is a worse middle ground — the appearance of cryptographic protection whose value depends on key management this project does not have. Rejected.
- **Keep a single manifest but make `--write` reject any key that already exists** — this blocks re-sealing, but not "delete the whole file and rebuild it", because once deleted nothing proves what was ever sealed. Testing confirmed that path bypasses the check, so one file cannot carry the frozen contract.
- **Commit the manifest to git and skip the ledger** — git does provide an external witness, but only when CI points the baseline at the pre-change commit; locally `HEAD` is a no-op (it compares the tree against itself). And the window where changes are uncommitted has no protection at all. Git and the seal history solve different problems; both are needed.
- **Change nothing and add a warning to the docs** — this project's premise is that a rule written in prose is not a rule, so replacing the mechanism with a warning contradicts its own position.

## Consequences

- **Benefit**: tampering, deleting seals, reordering history and hand-placing archived notes all fail the next verification; `--reseal` turns "I know I am rewriting frozen ground" into an explicit act that belongs in the commit message. Covered by tests: `--write` refuses to rebuild after the manifest is deleted, dropping a ledger entry reports a broken chain, rewriting an earlier seal in place reports a broken chain, and re-sealing tampered content is caught against the baseline.
- **Cost and known limit**: the ledger and the manifest both live inside the same repository, so anyone with write access can rewrite them together. **A local seal leaves evidence; it does not prevent tampering.** Real proof comes from an external witness — a CI baseline pointed at the pre-change commit. That limit is written into `references/archiving.md`, the README and both `SKILL.md` files, and the scripts print an explicit warning when the git witness is unavailable instead of passing silently.

## Verification

- The seal cases in `npm run test-gates` cover: establishing a baseline, detecting tampering, `--write` refusing to re-seal, refusing to rebuild a lost manifest, `--reseal` adopting deliberately, a dropped ledger entry, an edited ledger seal, and three attack shapes against a git baseline.
- Chain integrity lives in one place, `verifyChain()`, shared by `seal-store.ts` between the archive CLI and the verifier, so the two cannot drift.
