/**
 * Verify frozen archived Agent Notes: head layout, class closed set, sealed
 * content, and the append-only seal history.
 *
 * What this can and cannot prove
 * ------------------------------
 * A seal is `sha256(archived file)`, recorded in an append-only ledger whose
 * entries chain into one another. That makes silent edits, dropped entries and
 * reordered history detectable — but the ledger lives in the same repository,
 * so it is *tamper-evident*, not tamper-proof. Only an external witness settles
 * that: set `AGENT_NOTE_ARCHIVE_BASE_REF` in CI and the append-only rule is
 * enforced against a commit the working tree cannot rewrite.
 *
 * Usage:
 *   npx tsx <skill-dir>/scripts/verify-archived-agent-notes.ts           # verify only
 *   npx tsx <skill-dir>/scripts/verify-archived-agent-notes.ts --write   # verify, then seal newly archived files
 *   npx tsx <skill-dir>/scripts/verify-archived-agent-notes.ts --reseal  # verify, then re-adopt an edited manifest as the new baseline
 *
 * `--write` never re-seals content the ledger already knows about; `--reseal`
 * does, loudly. Neither records anything on top of an already-failing run.
 *
 * Env:
 *   AGENT_NOTE_ARCHIVE_BASE_REF (<ref>, default HEAD) — commit the seal files are
 *     compared against. In CI point this at the pre-change commit
 *     (`pull_request.base.sha`, or `github.event.before` on push). With HEAD it
 *     becomes a no-op as soon as the seal files are committed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { AGENT_NOTE_ARCHIVE, AGENT_NOTE_CLASSES, agentNoteRoot } from "./agent-note-tree.ts";
import {
  BOOKKEEPING,
  type Ledger,
  type Manifest,
  ledgerPathIn,
  manifestPathIn,
  readLedger,
  readManifest,
  sealEntries,
  sealFile,
  verifyChain,
} from "./seal-store.ts";

const isWrite = process.argv.includes("--write");
const isReseal = process.argv.includes("--reseal");
const sealMode = isWrite || isReseal;
const errors: string[] = [];
const warnings: string[] = [];
const fail = (msg: string) => { errors.push(msg); };

const archivedDir = join(agentNoteRoot, AGENT_NOTE_ARCHIVE);
const manifestPath = manifestPathIn(archivedDir);
const ledgerPath = ledgerPathIn(archivedDir);

// --- collect archived notes, excluding this verifier's own bookkeeping
const files: string[] = [];
function scan(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) scan(full);
    else if (entry.isFile() && entry.name.endsWith(".md")) {
      const rel = relative(archivedDir, full).split("\\").join("/");
      if (!BOOKKEEPING.has(rel)) files.push(rel);
    }
  }
}
if (existsSync(archivedDir)) scan(archivedDir);

// --- class closed set: an archived note lives in archived/<class>/
const withBase = (rel: string) => rel.replace(/\.zh\.md$/, ".md");
for (const rel of files) {
  const segs = withBase(rel).split("/");
  if (segs.length !== 2) {
    fail(`${rel} — expected archived/{class}/file.md (got ${segs.length} path segment(s))`);
    continue;
  }
  if (!(AGENT_NOTE_CLASSES as readonly string[]).includes(segs[0]!)) {
    fail(`${rel} — unknown class folder "${segs[0]}" (allowed: ${AGENT_NOTE_CLASSES.join(", ")})`);
  }
}

// --- head layout: L1 title / L2 blank / L3 Status / L4 Archived / L5 blank
const TITLE_RE = /^# Agent Note[:：] ?\S/;
const ARCHIVED_RE = /^Archived: \d{4}-\d{2}-\d{2}$/;
for (const rel of files) {
  const lines = readFileSync(join(archivedDir, rel), "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  if (!TITLE_RE.test(lines[0] ?? "")) fail(`${rel} — line 1 must be \`# Agent Note: <title>\``);
  if (lines[1] !== "") fail(`${rel} — line 2 must be blank`);
  if (lines[2] !== "Status: implemented") fail(`${rel} — line 3 must be \`Status: implemented\``);
  if (!ARCHIVED_RE.test(lines[3] ?? "")) fail(`${rel} — line 4 must be \`Archived: YYYY-MM-DD\` immediately below Status`);
  if (lines[4] !== "") fail(`${rel} — line 5 must be blank after Archived`);
}

// --- seal files
const manifestRead = readManifest(manifestPath);
const ledgerRead = readLedger(ledgerPath);
let manifest: Manifest = manifestRead.invalid ? { version: 1, files: {} } : manifestRead.manifest;
const ledger: Ledger = ledgerRead.invalid ? { version: 1, entries: [] } : ledgerRead.ledger;

if (manifestRead.invalid) fail("archived/manifest.json exists but is not valid JSON");
if (ledgerRead.invalid) fail("archived/.seal-ledger.json exists but is not valid JSON");
if (!manifestRead.exists && files.length > 0 && !sealMode) {
  fail("archived/manifest.json missing — run with --write to seal existing archived notes");
}

const chained = verifyChain(ledger);
if (chained.broken) {
  fail(`archived/.seal-ledger.json — chain broken at ${chained.broken.key}: ${chained.broken.reason}`);
}
if (chained.duplicate) {
  fail(`archived/.seal-ledger.json — duplicate entry for ${chained.duplicate}`);
}
const ledgerByKey = chained.byKey;

// --- compare every archived note against history, then against the manifest
const diskSeals = new Map<string, string>();
for (const rel of files) {
  const key = `${AGENT_NOTE_ARCHIVE}/${rel}`;
  const actual = sealFile(agentNoteRoot, key);
  diskSeals.set(key, actual);

  const historic = ledgerByKey.get(key);
  // The ledger is authoritative when it knows the key; the manifest is only a
  // fallback for repositories older than the ledger.
  const reference = historic?.seal ?? (manifestRead.exists ? manifest.files[key] : undefined);

  if (reference === undefined) {
    if (!sealMode) fail(`${key} — missing seal (run --write to seal a newly archived note)`);
  } else if (reference !== actual) {
    if (isReseal) {
      warnings.push(`${key} — re-adopting edited content as the new seal (${reference.slice(0, 16)}… → ${actual.slice(0, 16)}…)`);
    } else if (historic) {
      fail(`${key} — seal mismatch against the append-only history: the archived note was modified after sealing. Adopt the edit deliberately with --reseal, and say why in the commit message`);
    } else {
      fail(`${key} — seal mismatch: archived note was modified after sealing (frozen notes must never change)`);
    }
  }

  // Keep the manifest aligned with history even on a read-only run, so a later
  // `--write` cannot launder an edit by trusting a stale manifest.
  if (historic) manifest.files[key] = actual;
}

for (const key of Object.keys(manifest.files)) {
  if (!existsSync(join(agentNoteRoot, key))) fail(`${key} — sealed entry has no file on disk`);
}

// --- nothing may be recorded implicitly on top of a partly-lost history
// A ledger that survives while the manifest is gone is the dangerous case:
// rebuilding the manifest then would re-seal whatever is on disk right now.
// With neither file present this is simply the first run, and --write may
// establish the baseline; a truly lost ledger is caught against the git
// baseline below, which is the only witness that cannot be deleted locally.
if (sealMode && !isReseal && ledgerRead.exists && !manifestRead.exists && files.length > 0) {
  fail("archived/manifest.json is missing while archived/.seal-ledger.json is present — refusing to rebuild the manifest implicitly, because that is exactly how an edited frozen note gets a fresh seal. Restore it from git, or re-run with --reseal to adopt the current content deliberately.");
}

// --- append-only vs an external baseline (needs git; degrades loudly without it)
type GitRun = { ok: true; out: string } | { ok: false; reason: string };
const gitAt = (cwd: string, args: string[]): GitRun => {
  try {
    return { ok: true, out: execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }) };
  } catch (e) {
    const err = e as { code?: string | number; status?: number; stderr?: string };
    // A non-zero exit is an ordinary "no such ref" answer; a spawn failure
    // (EPERM/EACCES under a restrictive sandbox) means git never ran at all and
    // the guard is not merely "not applicable".
    if (err.code === "EPERM" || err.code === "EACCES" || err.code === "ENOENT") {
      return { ok: false, reason: `could not execute git (${String(err.code)})` };
    }
    return { ok: false, reason: `git ${args[0]} exited ${err.status ?? "non-zero"}` };
  }
};

const discovered = gitAt(agentNoteRoot, ["rev-parse", "--show-toplevel"]);
const repoRoot = discovered.ok ? discovered.out.trim() : null;

if (repoRoot) {
  const baseRef = process.env.AGENT_NOTE_ARCHIVE_BASE_REF || "HEAD";
  const showAtBase = (path: string): string | null => {
    const rel = relative(repoRoot, path).split("\\").join("/");
    const run = gitAt(repoRoot, ["show", `${baseRef}:${rel}`]);
    return run.ok ? run.out : null;
  };

  const baselineManifestRaw = showAtBase(manifestPath);
  if (baselineManifestRaw === null) {
    warnings.push(`no archived/manifest.json at ${baseRef} — append-only comparison skipped`);
  } else {
    try {
      const baseline = JSON.parse(baselineManifestRaw) as Manifest;
      for (const [key, seal] of Object.entries(baseline.files ?? {})) {
        if (manifest.files[key] === seal) continue;
        if (isReseal && key in manifest.files) continue; // deliberately re-adopted
        if (!(key in manifest.files)) {
          fail(`${key} — seal present at ${baseRef} but absent now; seals may be added, never removed`);
        } else {
          fail(`${key} — seal changed relative to ${baseRef}; archived seals are append-only`);
        }
      }
    } catch {
      fail(`archived/manifest.json at ${baseRef} was not valid JSON`);
    }
  }

  const baselineLedgerRaw = showAtBase(ledgerPath);
  let baselineLedgerKeys: Set<string> | null = null;
  if (baselineLedgerRaw !== null) {
    try {
      const baselineLedger = JSON.parse(baselineLedgerRaw) as Ledger;
      const baseEntries = Array.isArray(baselineLedger.entries) ? baselineLedger.entries : [];
      baselineLedgerKeys = new Set(baseEntries.map((e) => e.key));
      for (let i = 0; i < baseEntries.length; i++) {
        const was = baseEntries[i]!;
        const now = ledger.entries[i];
        if (!now || now.key !== was.key || now.seal !== was.seal || now.chain !== was.chain) {
          fail(`archived/.seal-ledger.json entry ${i + 1} (${was.key}) differs from ${baseRef}; the seal history is append-only`);
          break;
        }
      }
    } catch {
      fail(`archived/.seal-ledger.json at ${baseRef} was not valid JSON`);
    }
  } else if (!ledgerRead.exists) {
    warnings.push(`no archived/.seal-ledger.json on disk — cannot check the seal chain against ${baseRef}`);
  }

  // A seal added since the baseline must correspond to an implemented note that
  // existed at the baseline: archiving is a move, so the source has to be there.
  // Without this, a hand-edited note dropped straight into archived/ would get a
  // perfectly valid seal from --write and look like any other frozen note.
  if (baselineLedgerKeys) {
    const treeRun = gitAt(repoRoot, ["ls-tree", "-r", "--name-only", baseRef, "--", ".agents/notes/implemented"]);
    const implementedAtBase = treeRun.ok
      ? new Set(treeRun.out.split("\n").map((l) => l.trim()).filter(Boolean))
      : null;

    if (implementedAtBase) {
      for (const rel of files) {
        const key = `${AGENT_NOTE_ARCHIVE}/${rel}`;
        if (baselineLedgerKeys.has(key)) continue;
        const source = `.agents/notes/implemented/${withBase(rel)}`;
        if (!implementedAtBase.has(source)) {
          fail(`${key} — sealed since ${baseRef} but ${source} did not exist there: archived notes must be moved from implemented/ with archive-agent-note.ts, not dropped in by hand`);
        }
      }
    }
  }
} else {
  warnings.push(
    `append-only check skipped (${discovered.ok ? "no git repository here" : discovered.reason}) — seal hashes and the seal chain are still verified against disk, but nothing is anchoring them to a commit`,
  );
  if (!discovered.ok) {
    warnings.push("if this runs in CI, the external anchor is missing: an archived note could be edited and re-sealed without the run noticing");
  }
}

if (errors.length) {
  for (const e of errors) console.error(`archived: ${e}`);
  process.exit(1);
}

// --- record new seals
// Recording goes through `sealEntries`, which sorts the ledger and rebuilds the
// whole chain from that sorted order. Chaining only the entries touched here
// would leave a file on disk whose chain disagrees with its own order — which
// happens as soon as a note is archived out of filename-date order.
if (sealMode) {
  const toSeal = new Map<string, string>();
  for (const rel of files) {
    const key = `${AGENT_NOTE_ARCHIVE}/${rel}`;
    const seal = diskSeals.get(key)!;
    const existing = ledger.entries.find((e) => e.key === key);
    if (existing && existing.seal === seal) continue;
    toSeal.set(key, seal);
  }
  const added = [...toSeal.keys()].filter((k) => !ledger.entries.some((e) => e.key === k)).length;
  const changed = toSeal.size - added;

  const touched = sealEntries(archivedDir, manifest, toSeal);
  for (const entry of touched) manifest.files[entry.key] = entry.seal;

  if (added > 0) console.log(`sealed ${added} new history entr${added === 1 ? "y" : "ies"}`);
  if (changed > 0) console.log(`re-adopted ${changed} existing entr${changed === 1 ? "y" : "ies"} (history rewritten deliberately)`);
}

for (const w of warnings) console.warn(`warning: ${w}`);
console.log(`ok: ${files.length} archived note(s) verified, ${Object.keys(manifest.files).length} seal(s) in manifest, ${ledger.entries.length} in seal history`);
