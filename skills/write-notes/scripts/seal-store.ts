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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

/** Append `key` to the ledger (idempotent) and write both files deterministically. */
export function sealOne(notesRoot: string, archiveDir: string, key: string, seal: string): LedgerEntry {
  const manifestRead = readManifest(manifestPathIn(archiveDir));
  const ledgerRead = readLedger(ledgerPathIn(archiveDir));
  const manifest = manifestRead.invalid ? { version: 1, files: {} } : manifestRead.manifest;
  const ledger = ledgerRead.invalid ? { version: 1, entries: [] } : ledgerRead.ledger;

  manifest.files[key] = seal;

  const { byKey } = verifyChain(ledger);
  const existing = byKey.get(key);
  if (existing && existing.seal === seal) {
    writeLedgerAndManifest(archiveDir, manifest, ledger);
    return existing;
  }

  // Replacing an entry changes the chain of everything after it, so rebuild the
  // chain rather than leaving stale links behind.
  ledger.entries = ledger.entries.filter((e) => e.key !== key);
  ledger.entries.push({ key, seal, chain: "" });
  const tail = rechainInPlace(ledger);
  void tail;
  writeLedgerAndManifest(archiveDir, manifest, ledger);
  return ledger.entries.find((e) => e.key === key)!;
}

/**
 * Recompute every entry's chain link in place, after any change to keys, seals
 * or ordering. Returns the resulting tail.
 */
export function rechainInPlace(ledger: Ledger): string {
  let prev = "";
  for (const entry of ledger.entries) {
    entry.chain = chainOf(prev, entry);
    prev = entry.chain;
  }
  return prev;
}

export function writeLedgerAndManifest(archiveDir: string, manifest: Manifest, ledger: Ledger): void {
  ledger.entries.sort((a, b) => a.key.localeCompare(b.key));
  const files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(manifestPathIn(archiveDir), JSON.stringify({ version: 1, files }, null, 2) + "\n", "utf8");
  writeFileSync(ledgerPathIn(archiveDir), JSON.stringify({ version: 1, entries: ledger.entries }, null, 2) + "\n", "utf8");
}
