/**
 * Soft report: physical reverse anchors (`// Note: ... 见 .agents/notes/...`).
 *   A. anchors in source code pointing at notes that do not exist (dangling)
 *   B. implemented notes with zero inbound code anchors (suspected missing anchor)
 * Exit code is always 0 — this is an advisory report, not a gate.
 *
 * Env:
 *   AGENT_NOTE_CODE_ROOTS (default: cwd) — one or more source roots to scan,
 *     separated by the platform path delimiter. Use this to name the code
 *     directories explicitly. The default scans the current directory, which is
 *     often the repository root; note trees are still skipped either way,
 *     because a note is not code.
 *   AGENT_NOTE_CODE_ROOT (legacy, single root) is still honoured.
 *
 * Run: npx tsx <skill-dir>/scripts/check-note-anchors.ts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { agentNoteRoot, walkAgentNoteTree } from "./agent-note-tree.ts";

// Note trees are not code: anchors live in source files, and descending into
// `.agents/` would only re-read the notes themselves. This is deliberate, and
// it is the single place that decision lives — the walker below no longer
// carves out a `.agents` exception that the skip list immediately overrode.
const codeRoots = (process.env.AGENT_NOTE_CODE_ROOTS
  ?? process.env.AGENT_NOTE_CODE_ROOT
  ?? process.cwd())
  .split(delimiter)
  .map((p) => p.trim())
  .filter(Boolean)
  .map((p) => resolve(p));
const CODE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".kt", ".c", ".cc", ".cpp", ".h", ".hpp",
  ".cs", ".rb", ".swift", ".vue", ".svelte", ".php",
]);
const SKIP_DIR = new Set([
  "node_modules", ".git", "dist", "build", "out", "coverage", ".next",
  ".cache", ".agents", "vendor", "target",
]);
const ANCHOR_RE = /(?:\/\/|#|\/\*|\*\s*|<!--\s*)\s*Note[:：]/;
const PATH_RE = /\.agents\/notes\/([^\s'"`)>]+?\.md)/;

const anchorHits = new Map<string, string[]>(); // note rel (from notes root, lowercased basename fallback) -> [code rel:line]
const dangling: string[] = [];
const notePathRefs: string[] = [];

function walk(dir: string, depth: number, root: string) {
  if (depth > 12) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    // Skip dot-entries (node_modules, .git, .agents, editor state, …) uniformly.
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) walk(full, depth + 1, root);
      continue;
    }
    const dot = entry.name.lastIndexOf(".");
    if (dot === -1 || !CODE_EXT.has(entry.name.slice(dot))) continue;
    const rel = full.slice(root.length + 1);
    const lines = readFileSync(full, "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!ANCHOR_RE.test(l)) continue;
      const m = PATH_RE.exec(l);
      if (!m) {
        notePathRefs.push(`${rel}:${i + 1} — Note anchor without a .agents/notes path`);
        continue;
      }
      const noteRel = m[1].split("#")[0].replace(/^\.\//, "");
      const key = noteRel.replace(/\\/g, "/");
      const list = anchorHits.get(key) ?? [];
      list.push(`${rel}:${i + 1}`);
      anchorHits.set(key, list);
      if (!existsSync(join(agentNoteRoot, key))) {
        dangling.push(`${rel}:${i + 1} — .agents/notes/${key} does not exist`);
      }
    }
  }
}

for (const root of codeRoots) {
  if (!existsSync(root)) {
    console.warn(`warning: source root does not exist, skipped: ${root}`);
    continue;
  }
  walk(root, 0, root);
}

// implemented notes with zero inbound anchors
const { notes } = walkAgentNoteTree();
const implemented = notes.filter((n) => n.lifecycle === "implemented");
// basename -> note count: a slug shared by several notes is ambiguous and
// must not let one note's anchor count for another.
const slugCount = new Map<string, number>();
for (const n of notes) {
  const slug = n.rel.split("/").pop()!;
  slugCount.set(slug, (slugCount.get(slug) ?? 0) + 1);
}
const unanchored: string[] = [];
for (const n of implemented) {
  const slug = n.rel.split("/").pop()!;
  const direct = anchorHits.get(n.rel) ?? anchorHits.get(n.rel.replace(/\\/g, "/"));
  const bySlug = [...anchorHits.keys()].filter((k) => k === slug || k.endsWith("/" + slug));
  if (!direct && (bySlug.length === 0 || (slugCount.get(slug) ?? 0) > 1)) unanchored.push(n.rel);
}

console.log(`scanned: ${codeRoots.join(", ")}`);
console.log(`anchors found: ${[...anchorHits.values()].reduce((a, b) => a + b.length, 0)} across ${anchorHits.size} note(s)`);
if (notePathRefs.length) {
  console.log(`\n[anchors without note path] ${notePathRefs.length}`);
  for (const r of notePathRefs.slice(0, 20)) console.log(`  - ${r}`);
}
if (dangling.length) {
  console.log(`\n[dangling anchors] ${dangling.length}`);
  for (const d of dangling.slice(0, 20)) console.log(`  - ${d}`);
} else {
  console.log("\n[dangling anchors] none");
}
console.log(`\n[implemented notes without any code anchor] ${unanchored.length} of ${implemented.length}`);
for (const u of unanchored.slice(0, 20)) console.log(`  - ${u}`);
if (unanchored.length > 20) console.log(`  ... and ${unanchored.length - 20} more`);
