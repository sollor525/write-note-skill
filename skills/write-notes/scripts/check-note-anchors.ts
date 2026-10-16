/**
 * 源码锚点软报告：核对注释中的 Note 标记与完整 Markdown 路径。
 * 报告缺路径、越界、歧义、悬空引用和无引用的 implemented 笔记；正常报告退出码为 0。
 * 从宿主根目录运行，AGENT_NOTE_ROOT 指定笔记根，默认 .agents/notes。
 * AGENT_NOTE_CODE_ROOTS 按平台路径分隔符指定扫描范围，兼容旧单数变量；默认 cwd。
 * 扫描最多深入 12 层，跳过隐藏目录、依赖和构建输出；不按单个文件名豁免。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { agentNoteRoot, walkAgentNoteTree } from "./agent-note-tree.ts";

// 扫描范围不参与仓库相对路径解析；相对路径仍以启动脚本的宿主根目录为基准。
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
// 只提取完整路径，不裁剪目录前缀；带空格的路径须加引号或反引号。
// Markdown 链接的括号和片段标识不是文件路径的一部分。
const NOTE_PATH_RE = /`([^`]+\.md)(?:#[^`]*)?`|"([^"]+\.md)(?:#[^"]*)?"|'([^']+\.md)(?:#[^']*)?'|([^\s'"`()<>\[\]]+?\.md)(?=$|[\s'"`()<>\[\]#.,;:])/;

/**
 * 将完整路径按绝对、宿主根相对或源码文件相对语义解析，返回笔记根内的候选路径。
 * 只做路径归一化与边界判断，不读取文件；越界返回空数组，同一路径只保留一次。
 */
function candidatePaths(path: string, source: string): string[] {
    const candidates = isAbsolute(path)
        ? [resolve(path)]
        : [resolve(process.cwd(), path), resolve(dirname(source), path)];
    return [...new Set(candidates)].filter((candidate) => {
        const rel = relative(agentNoteRoot, candidate);
        return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
    });
}

// 完整的根内相对路径 → 源码位置列表；不允许用同名文件替代另一个生命周期或分类。
const anchorHits = new Map<string, string[]>();
// 诊断只保存在本次进程中，每个报告小节最多输出 20 条。
const dangling: string[] = [];
const notePathRefs: string[] = [];

/**
 * 只读扫描一个源码根，记录锚点和诊断；深度超限或 I/O 失败时警告并继续其他文件。
 * 路径越界、相对路径歧义和缺失目标均不算有效引用，报告始终保留原始路径供定位。
 */
function walk(dir: string, depth: number, root: string): void {
    if (depth > 12) {
        console.warn(`warning: source depth limit reached, skipped: ${dir}`);
        return;
    }
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
        console.warn(`warning: cannot scan ${dir}: ${error}`);
        return;
    }
    for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!SKIP_DIR.has(entry.name)) walk(full, depth + 1, root);
            continue;
        }
        const dot = entry.name.lastIndexOf(".");
        if (dot === -1 || !CODE_EXT.has(entry.name.slice(dot))) continue;
        const rel = relative(root, full);
        let lines: string[];
        try {
            lines = readFileSync(full, "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
        } catch (error) {
            console.warn(`warning: cannot read ${full}: ${error}`);
            continue;
        }
        for (let i = 0; i < lines.length; i++) {
            const marker = ANCHOR_RE.exec(lines[i]);
            if (!marker) continue;
            const location = `${rel}:${i + 1}`;
            const match = NOTE_PATH_RE.exec(lines[i].slice(marker.index + marker[0].length));
            const path = match && (match[1] ?? match[2] ?? match[3] ?? match[4]);
            if (!path) {
                notePathRefs.push(`${location} — Note anchor without a path under ${agentNoteRoot}`);
                continue;
            }
            const candidates = candidatePaths(path, full);
            if (candidates.length === 0) {
                notePathRefs.push(`${location} — ${path} resolves outside notes root ${agentNoteRoot}`);
                continue;
            }
            const existing = candidates.filter((candidate) => existsSync(candidate));
            if (existing.length === 0) {
                dangling.push(`${location} — ${path} does not exist (checked: ${candidates.join(", ")})`);
                continue;
            }
            if (existing.length > 1) {
                notePathRefs.push(`${location} — ${path} is ambiguous under ${agentNoteRoot}; use an absolute path (${existing.join(", ")})`);
                continue;
            }
            const key = relative(agentNoteRoot, existing[0]).split(sep).join("/");
            const list = anchorHits.get(key) ?? [];
            list.push(location);
            anchorHits.set(key, list);
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

// 只按完整目录身份判断是否被引用；指向 proposed/ 或另一分类的同名文件不能抵消缺项。
const { notes, errors } = walkAgentNoteTree();
for (const error of errors) console.warn(`warning: ${error}`);
const implemented = notes.filter((n) => n.lifecycle === "implemented");
const unanchored = implemented.filter((n) => !anchorHits.has(n.rel)).map((n) => n.rel);

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
