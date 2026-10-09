/**
 * Archive one implemented Agent Note: stamp `Archived:`, move it into
 * archived/<class>/, seal it, and report who still links to it.
 *
 * Usage:
 *   npx tsx <skill-dir>/scripts/archive-agent-note.ts <note> [options]
 *
 * Options:
 *   --superseded-by <note>  link the archived snapshot from the successor note
 *                           (the link goes in the NEW note, never in the frozen one)
 *   --strict                exit non-zero if any active note still links to the
 *                           archived note, so callers cannot skip the inbound fix
 *
 * Line endings are preserved: a CRLF note stays CRLF, including the inserted
 * `Archived:` line and any link written into a successor note.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { AGENT_NOTE_CLASSES, agentNoteRoot, walkAgentNoteTree } from "./agent-note-tree.ts";
import { statusIndexOf } from "./note-sections.ts";
import { sealFile, sealOne } from "./seal-store.ts";

const args = process.argv.slice(2);
const isStrict = args.includes("--strict");
const positional = args.filter((a) => !a.startsWith("--"));
const targetArg = positional[0];
const supersededByArgIdx = args.indexOf("--superseded-by");
const supersededByArg = supersededByArgIdx !== -1 ? args[supersededByArgIdx + 1] : undefined;

const USAGE = `Usage: npx tsx <skill-dir>/scripts/archive-agent-note.ts <path-to-note> [--superseded-by <new-note-path>] [--strict]`;

if (supersededByArgIdx !== -1 && (!supersededByArg || supersededByArg.startsWith("--"))) {
  console.error("Error: --superseded-by requires a note path");
  process.exit(1);
}
if (!targetArg) {
  console.error(USAGE);
  process.exit(1);
}

/** Dominant line ending of a file, so rewriting never mixes CRLF and LF. */
const eolOf = (text: string) => ((text.match(/\r\n/g)?.length ?? 0) > (text.match(/(?<!\r)\n/g)?.length ?? 0) ? "\r\n" : "\n");

let successorPath: string | undefined;
if (supersededByArg) {
  successorPath = resolve(process.cwd(), supersededByArg);
  if (!existsSync(successorPath)) {
    console.error(`Error: --superseded-by target not found at ${successorPath}`);
    process.exit(1);
  }
}

const targetPath = resolve(process.cwd(), targetArg);
if (!existsSync(targetPath)) {
  console.error(`Error: target note not found at ${targetPath}`);
  process.exit(1);
}

const relToRoot = relative(agentNoteRoot, targetPath).replace(/\\/g, "/");
const segs = relToRoot.split("/");

if (segs[0] !== "implemented" || segs.length !== 3) {
  console.error(`Error: only notes in .agents/notes/implemented/<class>/ can be archived (got: ${relToRoot})`);
  process.exit(1);
}

const cls = segs[1]!;
const filename = segs[2]!;
if (!(AGENT_NOTE_CLASSES as readonly string[]).includes(cls)) {
  console.error(`Error: unknown class "${cls}" (allowed: ${AGENT_NOTE_CLASSES.join(", ")})`);
  process.exit(1);
}

// 1. Read the note and normalize line endings for inspection only.
const raw = readFileSync(targetPath, "utf8");
const eol = eolOf(raw);
const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");

// Match the status line with the same grammar the format gate accepts, so a
// note the gate calls implemented can always be archived. The literal
// `Status: implemented` test rejected the Chinese form (`Status: 已实现`) that
// the gate accepts.
const statusIdx = statusIndexOf(lines, "implemented");
if (statusIdx === -1) {
  console.error("Error: note must carry an implemented status line the format gate accepts (e.g. `Status: implemented`)");
  console.error("       run the format gate on this note to see what it expects.");
  process.exit(1);
}

// Local calendar date, not UTC — toISOString() would roll the archived stamp
// back one day for evening runs east of the prime meridian.
const nowLocal = new Date();
const pad2 = (n: number) => String(n).padStart(2, "0");
const today = `${nowLocal.getFullYear()}-${pad2(nowLocal.getMonth() + 1)}-${pad2(nowLocal.getDate())}`;
// Contract: `Archived:` sits immediately below `Status:` (L3/L4).
if (!lines.some((l) => l.startsWith("Archived:"))) {
  lines.splice(statusIdx + 1, 0, `Archived: ${today}`);
}

let successorRel: string | undefined;
if (successorPath) {
  successorRel = relative(agentNoteRoot, successorPath).replace(/\\/g, "/");
  const successorSegs = successorRel.split("/");
  if (successorSegs.length !== 3 || !["proposed", "implemented", "rejected"].includes(successorSegs[0] ?? "")) {
    console.error(`Error: --superseded-by target must be an active note in {lifecycle}/{class}/ (got: ${successorRel})`);
    process.exit(1);
  }
}

const oldTitle = (lines[0] ?? "").replace(/^# Agent Note[:：] ?/, "").trim() || basename(filename, ".md");

/**
 * The cross-link label follows the archived note's own language, not the
 * tool's. A blanket Chinese label used to be written into English notes, which
 * no document mentioned. Punctuation follows the language too.
 */
const linkLabel = /[\u4e00-\u9fff]/.test(oldTitle) ? "历史快照：" : "Historical snapshot: ";

// 2. Destination, refusing to clobber an existing archived note.
const archivedDir = join(agentNoteRoot, "archived", cls);
mkdirSync(archivedDir, { recursive: true });
const archivedPath = join(archivedDir, filename);

if (existsSync(archivedPath)) {
  console.error(`Error: target archived note already exists at ${archivedPath}`);
  console.error("Refusing to overwrite existing archived note. Please inspect and resolve name collision manually.");
  process.exit(1);
}

writeFileSync(targetPath, lines.join(eol), "utf8");
renameSync(targetPath, archivedPath);
console.log(`Moved: ${relToRoot} -> archived/${cls}/${filename}`);

// 3. Seal it through the shared store, so manifest and append-only ledger can
// never disagree about what was frozen.
const key = `archived/${cls}/${filename}`;
const entry = sealOne(join(agentNoteRoot, "archived"), key, sealFile(agentNoteRoot, key));
console.log(`Sealed ${key} with ${entry.seal.slice(0, 16)}… (history entry ${entry.chain.slice(0, 16)}…)`);

// 4. Inbound links, resolved as real markdown links relative to each note.
const { notes } = walkAgentNoteTree();
const inboundFound: string[] = [];
const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
for (const note of notes) {
  const noteFullPath = resolve(agentNoteRoot, note.rel);
  const content = readFileSync(noteFullPath, "utf8");
  let match: RegExpExecArray | null;
  LINK_REGEX.lastIndex = 0;
  while ((match = LINK_REGEX.exec(content)) !== null) {
    const rawTarget = match[2]?.trim();
    if (!rawTarget || rawTarget.startsWith("http://") || rawTarget.startsWith("https://") || rawTarget.startsWith("#") || rawTarget.startsWith("mailto:")) continue;
    const fileTarget = rawTarget.split("#")[0];
    if (!fileTarget) continue;
    const resolvedTarget = resolve(dirname(noteFullPath), fileTarget);
    if (resolvedTarget === targetPath) {
      inboundFound.push(note.rel);
      break;
    }
  }
}

if (inboundFound.length > 0) {
  console.log("\n[Notice] The following active notes link to the archived note:");
  for (const rel of inboundFound) console.log(`  - ${rel}`);
  console.log("Fix these relative links now: verify-agent-note-tree reports them as dangling until you do.");
  if (isStrict) {
    console.error(`\nError: --strict — ${inboundFound.length} inbound link(s) still point at the archived note; nothing is committed until they are updated.`);
    process.exit(1);
  }
} else {
  console.log("\nNo active notes link to this archived note.");
}

// 5. Optional cross-link, written into the successor note only.
if (successorPath) {
  const relLink = relative(dirname(successorPath), archivedPath).replace(/\\/g, "/");
  const successorRaw = readFileSync(successorPath, "utf8");
  const successorEol = eolOf(successorRaw);
  const alreadyLinked = [...successorRaw.matchAll(LINK_REGEX)]
    .map((m) => m[2]?.split("#")[0]?.trim())
    .filter((t): t is string => Boolean(t))
    .some((t) => resolve(dirname(successorPath), t) === archivedPath);

  if (alreadyLinked) {
    console.log(`Already linked from ${successorRel}; left unchanged.`);
  } else {
    const successorLines = successorRaw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
    // Land the link before the final H2 so the note keeps its section order
    // (appending at EOF would strand it after ## Consequences).
    let lastH2 = -1;
    for (let i = 0; i < successorLines.length; i++) {
      if (successorLines[i]!.startsWith("## ")) lastH2 = i;
    }
    const anchor = lastH2 > 0 ? lastH2 : successorLines.length;
    let insertAt = anchor;
    while (insertAt > 0 && successorLines[insertAt - 1]!.trim() === "") insertAt--;
    successorLines.splice(insertAt, 0, "", `[${linkLabel}${oldTitle}](${relLink})`);

    while (successorLines.length > 0 && successorLines[successorLines.length - 1]!.trim() === "") successorLines.pop();
    writeFileSync(successorPath, `${successorLines.join(successorEol)}${successorEol}`, "utf8");
    console.log(`Linked from ${successorRel}: [${linkLabel}${oldTitle}](${relLink})`);
  }
}
