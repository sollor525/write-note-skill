/**
 * Soft report: physical reverse anchors (a source comment carrying `Note:`
 * followed by a path under the notes root).
 * Anchors are recognised by the notes root's own directory name plus the
 * `{lifecycle}/{class}/file.md` triple, both taken from AGENT_NOTE_ROOT, so
 * hosts that keep their notes outside `.agents/notes/` (for example
 * `docs/adr/`) are scanned with their real prefix instead of a hard-coded one.
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

/** 把路径片段转成可嵌入正则的字面量。 */
const escapePath = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 锚点里的笔记路径锚定在笔记自身的 `{lifecycle}/{class}/file.md` 三段上，
 * 不再假设前缀写法：绝对路径、相对仓库根、相对书写文件三种写法都得到同一结果，
 * 也不需要把 AGENT_NOTE_ROOT 之外的绝对前缀写进正则。
 * 三段之前必须出现笔记根目录自身的最后一段（`.agents/notes` → notes，`docs/adr` → adr），
 * 否则 `src/implemented/foo/bar.md` 这类用户代码路径会被误报成悬空锚点。
 * 该段同样以分隔符或字符串起始为界，避免把 `notnotes/` 之类的片段当成笔记根目录。
 */
const notesRootTail = escapePath(agentNoteRoot.split(/[\\/]/).filter(Boolean).pop() ?? "");
const NOTE_PATH_RE = new RegExp(`(?:^|[\\\\/])${notesRootTail}[\\\\/](proposed|implemented|rejected)[\\\\/]([^\\s'"\`)>\\\\/]+?)[\\\\/]([^\\s'"\`)>\\\\/]+?\\.md)`);

/**
 * 从锚点行取出笔记根目录内的相对路径；匹配不到时返回 null，
 * 便于调用方区分"缺路径的锚点"与"指向不存在笔记的悬空锚点"。
 */
function noteKeyFrom(line: string): string | null {
    const m = NOTE_PATH_RE.exec(line);
    if (!m) return null;
    // 三段固定，不含 .. 或绝对前缀，join(agentNoteRoot, key) 可直接拼路径。
    return `${m[1]}/${m[2]}/${m[3]}`;
}

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
    // 门禁回归测试里内嵌锚点夹具（含刻意缺路径的样例），不是真实引用。
    if (entry.name === "test-gates.mjs") continue;
    const rel = full.slice(root.length + 1);
    const lines = readFileSync(full, "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!ANCHOR_RE.test(l)) continue;
      const key = noteKeyFrom(l);
      if (!key) {
        // 锚点行没有指向任何笔记根目录下的路径，提示实际使用的根目录而不是写死的 .agents/notes。
        notePathRefs.push(`${rel}:${i + 1} — Note anchor without a path under ${agentNoteRoot}`);
        continue;
      }
      const list = anchorHits.get(key) ?? [];
      list.push(`${rel}:${i + 1}`);
      anchorHits.set(key, list);
      if (!existsSync(join(agentNoteRoot, key))) {
        dangling.push(`${rel}:${i + 1} — ${key} does not exist under ${agentNoteRoot}`);
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
