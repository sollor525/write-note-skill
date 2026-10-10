/** 验证归档头部、分类、磁盘内容、索引、账本及可用的 Git 基线。
 * --write 仅新增封印；--reseal 显式采纳正文改动，不能修复损坏的账本或绕过历史对比。
 * 显式 AGENT_NOTE_ARCHIVE_BASE_REF 无法读取时失败；未配置且无 Git 时警告降级。 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { AGENT_NOTE_ARCHIVE, AGENT_NOTE_CLASSES, agentNoteRoot } from "./agent-note-tree.ts";
import { statusGrammarFor } from "./note-sections.ts";
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
    sealIndexErrors,
    verifyChain,
} from "./seal-store.ts";

const isWrite = process.argv.includes("--write");
const isReseal = process.argv.includes("--reseal");
const sealMode = isWrite || isReseal;
const errors: string[] = [];
const warnings: string[] = [];
/** 累积可定位错误，全部验证结束后统一非零退出。 */
const fail = (msg: string) => { errors.push(msg); };

const archivedDir = join(agentNoteRoot, AGENT_NOTE_ARCHIVE);
const manifestPath = manifestPathIn(archivedDir);
const ledgerPath = ledgerPathIn(archivedDir);

// 收集归档文件；封印元数据不作为笔记处理。
const files: string[] = [];
/** 递归收集归档 Markdown 的相对路径；读取失败直接抛出，不忽略目录。 */
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

// 归档笔记仍须位于封闭分类集合内，且路径深度固定。
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

// 归档头部依次是标题、空行、状态、归档日期、空行。
const TITLE_RE = /^# Agent Note[:：] ?\S/;
const ARCHIVED_RE = /^Archived: \d{4}-\d{2}-\d{2}$/;
const IMPLEMENTED_STATUS = statusGrammarFor("implemented")!;
for (const rel of files) {
    const lines = readFileSync(join(archivedDir, rel), "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
    if (!TITLE_RE.test(lines[0] ?? "")) fail(`${rel} — line 1 must be \`# Agent Note: <title>\``);
    if (lines[1] !== "") fail(`${rel} — line 2 must be blank`);
    // 与格式门和归档命令共用状态语法，中文状态行归档后仍然有效。
    if (!IMPLEMENTED_STATUS.test((lines[2] ?? "").trimEnd())) fail(`${rel} — line 3 must carry an implemented status line the format gate accepts (e.g. \`Status: implemented\`)`);
    if (!ARCHIVED_RE.test(lines[3] ?? "")) fail(`${rel} — line 4 must be \`Archived: YYYY-MM-DD\` immediately below Status`);
    if (lines[4] !== "") fail(`${rel} — line 5 must be blank after Archived`);
}

// 两份元数据分别读取；只读校验绝不修补读入内容。
const manifestRead = readManifest(manifestPath);
const ledgerRead = readLedger(ledgerPath);
const manifest: Manifest = manifestRead.manifest;
const ledger: Ledger = ledgerRead.ledger;
if (manifestRead.invalid) fail("archived/manifest.json has invalid JSON or schema");
if (ledgerRead.invalid) fail("archived/.seal-ledger.json has invalid JSON or schema");
if (manifestRead.exists && !ledgerRead.exists) fail("archived/.seal-ledger.json missing — restore seal history before continuing");
if (!manifestRead.exists && ledgerRead.exists) {
    if (isReseal && !ledgerRead.invalid) {
        // 唯一的恢复入口是显式 --reseal；索引先从旧账本恢复，仍需验证链及基线。
        manifest.files = Object.fromEntries(ledger.entries.map((entry) => [entry.key, entry.seal]));
    } else fail("archived/manifest.json missing while seal history exists — restore it, or use --reseal deliberately");
}
if (!manifestRead.exists && !ledgerRead.exists && files.length && !sealMode) {
    fail("Archive seal files missing — use --write only to establish the first baseline");
}
errors.push(...sealIndexErrors(manifest, ledger));
const diskSeals = new Map<string, string>();
for (const rel of files) {
    const key = `${AGENT_NOTE_ARCHIVE}/${rel}`;
    const actual = sealFile(agentNoteRoot, key);
    diskSeals.set(key, actual);
    const reference = manifest.files[key];
    if (reference === undefined) {
        if (!sealMode) fail(`${key} — missing seal (run --write to seal a newly archived note)`);
    } else if (reference !== actual) {
        if (isReseal) warnings.push(`${key} — re-adopting edited content as the new seal (${reference.slice(0, 16)}… → ${actual.slice(0, 16)}…)`);
        else fail(`${key} — seal mismatch: archived content changed; --write cannot re-seal it`);
    }
}
// 索引和账本中的每个条目都必须仍对应文件，不能只从磁盘单向检查。
for (const key of new Set([...Object.keys(manifest.files), ...ledger.entries.map((entry) => entry?.key)])) {
    if (!diskSeals.has(key)) fail(`${key} — sealed entry has no archived file on disk`);
}

// 与 Git 提交中的基线比较；显式配置的基线不可用时必须失败。
/** Git 执行结果；ok 为成功标志，out 为原始输出，reason 保留失败原因。 */
type GitRun = { ok: true; out: string } | { ok: false; reason: string };
/** 只读调用 Git，保留失败原因供基线检查决定报错或警告。 */
const gitAt = (cwd: string, args: string[]): GitRun => {
    try {
        return { ok: true, out: execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }) };
    } catch (e) {
        const err = e as { code?: string | number; status?: number; stderr?: string };
        // 区分子进程无法启动和 Git 返回失败，保留可定位的执行原因。
        if (err.code === "EPERM" || err.code === "EACCES" || err.code === "ENOENT") {
            return { ok: false, reason: `could not execute git (${String(err.code)})` };
        }
        return { ok: false, reason: `git ${args[0]} exited ${err.status ?? "non-zero"}: ${err.stderr?.toString().trim() ?? String(e)}` };
    }
};

const explicitBase = process.env.AGENT_NOTE_ARCHIVE_BASE_REF?.trim();
const discovered = gitAt(agentNoteRoot, ["rev-parse", "--show-toplevel"]);
const repoRoot = discovered.ok ? discovered.out.trim() : null;

if (!repoRoot) {
    if (explicitBase) fail(`Cannot verify configured archive baseline ${explicitBase}: ${discovered.ok ? "no repository" : discovered.reason}`);
    else warnings.push(`append-only check skipped (${discovered.ok ? "no repository" : discovered.reason}); no external baseline is available`);
} else {
    const baseRef = explicitBase || "HEAD";
    const resolvedBase = gitAt(repoRoot, ["rev-parse", "--verify", "--end-of-options", `${baseRef}^{commit}`]);
    if (!resolvedBase.ok) {
        if (explicitBase) fail(`Cannot resolve configured archive baseline ${baseRef}: ${resolvedBase.reason}`);
        else warnings.push("HEAD has no readable commit; only local archive consistency was checked");
    } else {
        // 先取得有效提交中的路径清单，区分文件从未存在与读取操作失败。
        const commit = resolvedBase.out.trim();
        const notesRel = relative(repoRoot, agentNoteRoot).replace(/\\/g, "/");
        const tree = gitAt(repoRoot, ["ls-tree", "-r", "-z", "--name-only", commit, "--", notesRel || "."]);
        if (!tree.ok) fail(`Cannot read archive baseline ${baseRef}: ${tree.reason}`);
        else {
            const paths = new Set(tree.out.split("\0").filter(Boolean));
            /** 只读取基线中确实存在的文件；读取失败保留原因并使本次校验失败。 */
            const showAtBase = (path: string): string | null => {
                const rel = relative(repoRoot, path).replace(/\\/g, "/");
                if (!paths.has(rel)) return null;
                const result = gitAt(repoRoot, ["show", `${commit}:${rel}`]);
                if (!result.ok) {
                    fail(`Cannot read ${rel} at ${baseRef}: ${result.reason}`);
                    return null;
                }
                return result.out;
            };
            const baselineManifestRaw = showAtBase(manifestPath);
            if (baselineManifestRaw !== null) {
                try {
                    const baseline = JSON.parse(baselineManifestRaw) as Manifest;
                    if (baseline.version !== 1 || !baseline.files || Array.isArray(baseline.files)) throw new Error("invalid manifest schema");
                    for (const [key, seal] of Object.entries(baseline.files)) {
                        if (manifest.files[key] === seal) continue;
                        fail(`${key} — seal missing or changed relative to ${baseRef}; archived seals are append-only`);
                    }
                } catch (error) {
                    fail(`Invalid manifest at ${baseRef}: ${String(error)}`);
                }
            }
            const baselineLedgerRaw = showAtBase(ledgerPath);
            if (baselineLedgerRaw !== null) {
                try {
                    const baseline = JSON.parse(baselineLedgerRaw) as Ledger;
                    if (baseline.version !== 1 || !Array.isArray(baseline.entries)) throw new Error("invalid ledger schema");
                    const chain = verifyChain(baseline);
                    if (chain.broken || chain.duplicate) throw new Error("invalid baseline seal chain");
                    const current = new Map(ledger.entries.map((entry) => [entry.key, entry]));
                    for (const was of baseline.entries) {
                        if (current.get(was.key)?.seal !== was.seal) fail(`${was.key} — seal history entry missing or changed relative to ${baseRef}`);
                    }
                    // 新归档的来源必须位于实际配置的笔记根目录，而非固定的 .agents/notes。
                    for (const rel of files) {
                        if (chain.byKey.has(`${AGENT_NOTE_ARCHIVE}/${rel}`)) continue;
                        const source = [notesRel, "implemented", withBase(rel)].filter(Boolean).join("/");
                        if (!paths.has(source)) fail(`${rel} — ${source} did not exist at ${baseRef}; new archives must come from implemented notes`);
                    }
                } catch (error) {
                    fail(`Invalid seal history at ${baseRef}: ${String(error)}`);
                }
            }
        }
    }
}

if (errors.length) {
    for (const e of errors) console.error(`archived: ${e}`);
    process.exit(1);
}

// 全部检查通过后才写封印；按路径排序并重算链，支持任意归档次序。
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
