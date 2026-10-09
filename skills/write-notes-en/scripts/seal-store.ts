/**
 * Seal bookkeeping for frozen archived notes, shared by the verifier and the
 * archive CLI so the two can never disagree about what is sealed.
 *
 * Two files, deliberately different in kind:
 *   archived/manifest.json     — derived index, may be rewritten freely
 *   archived/.seal-ledger.json — append-only history, each entry chained to the
 *                                one before it, so edits/removals/reordering
 *                                are detectable
 *
 * Both live in the repo, so neither can stop a determined writer. They make
 * tampering *evident*; only an external witness (a git baseline ref in CI)
 * makes it *impossible*. See references/archiving.md.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Manifest {
  version: 1;
  files: Record<string, string>;
}

export interface LedgerEntry {
  key: string;
  seal: string;
  /** hash chaining this entry to every entry before it */
  chain: string;
}

export interface Ledger {
  version: 1;
  entries: LedgerEntry[];
}

export const MANIFEST_NAME = "manifest.json";
export const LEDGER_NAME = ".seal-ledger.json";

/** Files this module owns, relative to `archived/`. Never treated as notes. */
export const BOOKKEEPING = new Set([MANIFEST_NAME, LEDGER_NAME]);

export const manifestPathIn = (archiveDir: string) => join(archiveDir, MANIFEST_NAME);
export const ledgerPathIn = (archiveDir: string) => join(archiveDir, LEDGER_NAME);

export const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

/** `sha256:` seal of one archived file, addressed from the notes root. */
export function sealFile(notesRoot: string, relFromRoot: string): string {
  return `sha256:${sha256(readFileSync(join(notesRoot, relFromRoot)))}`;
}

export function chainOf(prevChain: string, entry: Pick<LedgerEntry, "key" | "seal">): string {
  return sha256(`${prevChain}\n${entry.key}\n${entry.seal}`);
}

export function readManifest(path: string): { manifest: Manifest; exists: boolean; invalid: boolean } {
  if (!existsSync(path)) return { manifest: { version: 1, files: {} }, exists: false, invalid: false };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Manifest;
    if (!parsed.files || typeof parsed.files !== "object") {
      return { manifest: { version: 1, files: {} }, exists: true, invalid: true };
    }
    return { manifest: parsed, exists: true, invalid: false };
  } catch {
    return { manifest: { version: 1, files: {} }, exists: true, invalid: true };
  }
}

export function readLedger(path: string): { ledger: Ledger; exists: boolean; invalid: boolean } {
  if (!existsSync(path)) return { ledger: { version: 1, entries: [] }, exists: false, invalid: false };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Ledger;
    if (!Array.isArray(parsed.entries)) {
      return { ledger: { version: 1, entries: [] }, exists: true, invalid: true };
    }
    return { ledger: parsed, exists: true, invalid: false };
  } catch {
    return { ledger: { version: 1, entries: [] }, exists: true, invalid: true };
  }
}

/**
 * Walk the ledger's chain, returning the entries keyed by note, the running
 * tail, and whether the chain was intact.
 */
export function verifyChain(ledger: Ledger): {
  byKey: Map<string, LedgerEntry>;
  tail: string;
  broken: { key: string; reason: string } | null;
  duplicate: string | null;
} {
  const byKey = new Map<string, LedgerEntry>();
  let prevChain = "";
  for (const entry of ledger.entries) {
    if (typeof entry?.key !== "string" || typeof entry?.seal !== "string" || typeof entry?.chain !== "string") {
      return { byKey, tail: prevChain, broken: { key: "<malformed>", reason: "malformed entry" }, duplicate: null };
    }
    if (byKey.has(entry.key)) {
      return { byKey, tail: prevChain, broken: null, duplicate: entry.key };
    }
    if (entry.chain !== chainOf(prevChain, entry)) {
      return {
        byKey,
        tail: prevChain,
        broken: { key: entry.key, reason: "chain broken; the seal history was edited, dropped or reordered" },
        duplicate: null,
      };
    }
    byKey.set(entry.key, entry);
    prevChain = entry.chain;
  }
  return { byKey, tail: prevChain, broken: null, duplicate: null };
}

/**
 * Sealing is expressed as one operation that always leaves the same invariant
 * behind: **the ledger's stored order is its chain order**, sorted by key.
 *
 * That invariant is the whole point. If entries are chained in arrival order and
 * then sorted on write, the file on disk no longer describes a valid chain, and
 * the next verification reports its own history as tampered. Archiving two notes
 * out of filename-date order — an entirely ordinary thing to do, since the
 * filename date is the day a decision was first proposed, not the day it was
 * archived — used to trigger exactly that.
 *
 * So nothing here ever chains "the entries I just touched"; the chain is always
 * recomputed across the complete, sorted ledger.
 */

/** Merge seals into an existing ledger, preserving the sort-then-chain invariant. */
function mergeAndRechain(ledger: Ledger, seals: Iterable<readonly [string, string]>): LedgerEntry[] {
  const touched: LedgerEntry[] = [];
  for (const [key, seal] of seals) {
    const existing = ledger.entries.find((e) => e.key === key);
    if (existing) {
      existing.seal = seal;
      touched.push(existing);
    } else {
      const entry: LedgerEntry = { key, seal, chain: "" };
      ledger.entries.push(entry);
      touched.push(entry);
    }
  }
  ledger.entries.sort((a, b) => a.key.localeCompare(b.key));
  rechainInPlace(ledger);
  return touched;
}

/**
 * Record one or more seals and write both files. Idempotent for seals that have
 * not changed. Returns the resulting ledger entries for the given keys.
 */
export function sealEntries(
  archiveDir: string,
  manifest: Manifest,
  seals: Iterable<readonly [string, string]>,
): LedgerEntry[] {
  const ledgerRead = readLedger(ledgerPathIn(archiveDir));
  const ledger = ledgerRead.invalid ? { version: 1, entries: [] } : ledgerRead.ledger;

  const list = [...seals];
  // A corrupt ledger is a hard error, not something to quietly regenerate: the
  // callers verify before they get here.
  if (ledgerRead.invalid) {
    throw new Error("archived/.seal-ledger.json exists but is not valid JSON; refusing to rebuild the seal history");
  }

  const touched = mergeAndRechain(ledger, list);
  for (const [key, seal] of list) manifest.files[key] = seal;
  writeLedgerAndManifest(archiveDir, manifest, ledger);
  return touched;
}

/** Convenience wrapper for the single-note case (the archive CLI). */
export function sealOne(archiveDir: string, key: string, seal: string): LedgerEntry {
  const manifestRead = readManifest(manifestPathIn(archiveDir));
  if (manifestRead.invalid) {
    throw new Error("archived/manifest.json exists but is not valid JSON; refusing to rebuild the seal index");
  }
  return sealEntries(archiveDir, manifestRead.manifest, [[key, seal]])[0]!;
}

/**
 * Recompute every entry's chain link in place for the ledger's *current* order.
 * Callers that reorder or edit seals must call this — or better, go through
 * `sealEntries`, which cannot forget.
 */
export function rechainInPlace(ledger: Ledger): string {
  let prev = "";
  for (const entry of ledger.entries) {
    entry.chain = chainOf(prev, entry);
    prev = entry.chain;
  }
  return prev;
}

/** Write both files. The ledger must already be sorted and chained. */
export function writeLedgerAndManifest(archiveDir: string, manifest: Manifest, ledger: Ledger): void {
  const sortedKeys = [...ledger.entries].sort((a, b) => a.key.localeCompare(b.key)).map((e) => e.key);
  const actualKeys = ledger.entries.map((e) => e.key);
  if (sortedKeys.join("\u0000") !== actualKeys.join("\u0000")) {
    throw new Error("internal: ledger entries are not in sorted key order; the chain would not match the file on disk");
  }
  // The archive directory may not exist yet: `--write` on a repository with no
  // archived notes establishes the baseline, and that is the first thing to
  // create the directory. Writing without this used to fail with ENOENT.
  mkdirSync(archiveDir, { recursive: true });
  const files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(manifestPathIn(archiveDir), JSON.stringify({ version: 1, files }, null, 2) + "\n", "utf8");
  writeFileSync(ledgerPathIn(archiveDir), JSON.stringify({ version: 1, entries: ledger.entries }, null, 2) + "\n", "utf8");
}
