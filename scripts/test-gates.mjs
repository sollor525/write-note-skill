// 门禁回归测试：每项建立临时宿主并运行真实脚本，重点验证错误输入确实被拒绝。
// 从仓库根目录运行 npm run test-gates，需要 Node 和 Git；缺少 Git 会使测试失败。
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { mkdirSync, cpSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = join(REPO, "skills", "write-notes", "scripts");
// 夹具必须位于本仓库之外，避免归档校验器误用本仓库的 Git 历史作为基线。
const BASE = join(tmpdir(), `write-notes-gates-${process.pid}`);
rmSync(BASE, { recursive: true, force: true });
mkdirSync(BASE, { recursive: true });

const results = [];
let failures = 0;

/** 在临时宿主写入夹具，返回绝对路径；文件系统错误使测试直接失败。 */
function put(host, rel, content) {
    const full = join(BASE, host, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
    return full;
}
/** 执行真实脚本并返回退出码；无法启动子进程时直接抛出原因。 */
function run(host, script, args = [], env = {}) {
    const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], {
        cwd: join(BASE, host),
        env: { ...process.env, AGENT_NOTE_ROOT: join(BASE, host, ".agents", "notes"), AGENT_NOTE_ARCHIVE_BASE_REF: "", ...env },
        stdio: "inherit",
    });
    if (r.error) throw r.error;
    return r.status;
}
/** 累积断言结果；结尾汇总失败数量并以非零退出。 */
function check(name, actual, expected) {
    const pass = actual === expected;
    if (!pass) failures++;
    results.push(`${pass ? "PASS" : "FAIL"}  ${name}  (exit ${actual}, expected ${expected})`);
}
/** 准备独立 Git 夹具；任何 Git 失败均终止测试，避免在错误基线上继续断言。 */
function git(host, ...args) {
    const result = spawnSync("git", args, { cwd: join(BASE, host), stdio: "pipe", encoding: "utf8" });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
    return result;
}

/** 运行真实脚本并保留诊断；测试环境不继承外部封印基线。 */
function captured(host, script, args = [], env = {}) {
    const result = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], {
        cwd: join(BASE, host),
        env: { ...process.env, AGENT_NOTE_ROOT: join(BASE, host, ".agents/notes"), AGENT_NOTE_ARCHIVE_BASE_REF: "", ...env },
        encoding: "utf8",
    });
    if (result.error) throw result.error;
    return result;
}

/** 负向用例同时验证退出码和目标诊断，避免由其他错误代替目标检查。 */
function rejects(host, script, args, diagnostic, env = {}) {
    const result = captured(host, script, args, env);
    check(`${host}: ${diagnostic}`, result.status === 1 && diagnostic.test(result.stderr) ? 1 : 0, 1);
    if (result.status !== 1 || !diagnostic.test(result.stderr)) console.log(result.stdout, result.stderr);
}

const HEAD = (t, s) => `# Agent Note: ${t}\n\nStatus: ${s}\n`;
const IMPL = (t) => `${HEAD(t, "implemented")}
## Problem

P.

## Decision

D.

## Alternatives considered

- **A** — b.

## Consequences

C.
`;
const PROP = (t) => `${HEAD(t, "proposed")}
## Problem

P.

## Proposal

X.

## Alternatives considered

- **A** — b.

## Acceptance criteria

Y.

## Risks

Z.
`;
const ARCH = (body) => `${HEAD("frozen", "implemented")}Archived: 2026-01-01

## Problem

P.

## Decision

${body}
`;

// 空根目录或错误配置必须失败。
mkdirSync(join(BASE, "empty", ".agents", "notes"), { recursive: true });
check("empty root: tree fails", run("empty", "verify-agent-note-tree.ts"), 1);
check("empty root: format fails", run("empty", "verify-agent-note-format.ts"), 1);
check("empty root: archived is legitimately empty", run("empty", "verify-archived-agent-notes.ts"), 0);

// 文档中的中文骨架必须通过。
put("zh", ".agents/notes/implemented/architecture/2026-01-01-zh.md", `${HEAD("中文笔记", "implemented")}
## 问题

P.

## 决策

D.

## 备选方案

- **A** — b.

## 后果

C.
`);
check("chinese skeleton passes", run("zh", "verify-agent-note-format.ts"), 0);

put("zh-bad", ".agents/notes/implemented/architecture/2026-01-01-zh.md", `${HEAD("中文笔记", "implemented")}
## 问题

P.

## 决策

D.

## 后果

C.
`);
check("chinese skeleton without alternatives fails", run("zh-bad", "verify-agent-note-format.ts"), 1);

// 双语配对路径。
put("zhpair", ".agents/notes/implemented/architecture/2026-01-01-x.md", IMPL("x"));
put("zhpair", ".agents/notes/implemented/architecture/2026-01-01-x.zh.md", IMPL("x"));
check("bilingual pair passes", run("zhpair", "verify-agent-note-tree.ts"), 0);
put("zhorphan", ".agents/notes/implemented/architecture/2026-01-01-y.md", IMPL("y"));
put("zhorphan", ".agents/notes/implemented/architecture/2026-01-02-z.zh.md", IMPL("z"));
check("orphan .zh.md rejected", run("zhorphan", "verify-agent-note-tree.ts"), 1);

// 点号开头的目录和文件也必须接受校验。
put("dots", ".agents/notes/implemented/feature/2026-01-01-ok.md", IMPL("ok"));
put("dots", ".agents/notes/implemented/.feature/2026-01-02-hidden.md", "# garbage\n");
check("dot class folder caught", run("dots", "verify-agent-note-tree.ts"), 1);
put("dots2", ".agents/notes/implemented/feature/2026-01-01-ok.md", IMPL("ok"));
put("dots2", ".agents/notes/implemented/feature/.2026-01-02-hidden.md", "# garbage\n");
check("dot note file caught", run("dots2", "verify-agent-note-tree.ts"), 1);

// 归档分类采用封闭集合。
put("archclass", ".agents/notes/archived/notaclass/2026-01-01-x.md", ARCH("x"));
check("archived unknown class rejected", run("archclass", "verify-archived-agent-notes.ts", ["--write"]), 1);

put("archdeep", ".agents/notes/archived/architecture/deep/2026-01-01-x.md", ARCH("x"));
check("archived nested path rejected", run("archdeep", "verify-archived-agent-notes.ts", ["--write"]), 1);

// 首次封印需要自动建立归档目录，不能因目录缺失而失败。
mkdirSync(join(BASE, "sealfresh", ".agents", "notes"), { recursive: true });
put("sealfresh", ".agents/notes/implemented/architecture/2026-01-01-x.md", IMPL("x"));
check("seal: first --write on a repo with no archived/ succeeds", run("sealfresh", "verify-archived-agent-notes.ts", ["--write"]), 0);
check("seal: first --write created the manifest", existsSync(join(BASE, "sealfresh", ".agents/notes/archived/manifest.json")) ? 1 : 0, 1);
check("seal: first --write created the ledger", existsSync(join(BASE, "sealfresh", ".agents/notes/archived/.seal-ledger.json")) ? 1 : 0, 1);

put("seal", ".agents/notes/archived/architecture/2026-01-01-a.md", ARCH("ORIGINAL."));
check("seal: first --write establishes a baseline", run("seal", "verify-archived-agent-notes.ts", ["--write"]), 0);
check("seal: clean verify", run("seal", "verify-archived-agent-notes.ts"), 0);

put("seal", ".agents/notes/archived/architecture/2026-01-01-a.md", ARCH("TAMPERED."));
check("seal: tampering detected", run("seal", "verify-archived-agent-notes.ts"), 1);
check("seal: --write cannot re-seal edited content", run("seal", "verify-archived-agent-notes.ts", ["--write"]), 1);

rmSync(join(BASE, "seal", ".agents/notes/archived/manifest.json"), { force: true });
check("seal: lost manifest cannot be rebuilt implicitly", run("seal", "verify-archived-agent-notes.ts", ["--write"]), 1);
check("seal: --reseal adopts deliberately", run("seal", "verify-archived-agent-notes.ts", ["--reseal"]), 0);
check("seal: verify after reseal", run("seal", "verify-archived-agent-notes.ts"), 0);

// 删除账本条目。
put("seal2", ".agents/notes/archived/architecture/2026-01-01-a.md", ARCH("A."));
put("seal2", ".agents/notes/archived/architecture/2026-01-02-b.md", ARCH("B."));
run("seal2", "verify-archived-agent-notes.ts", ["--write"]);
const ledger2 = join(BASE, "seal2", ".agents/notes/archived/.seal-ledger.json");
const led2 = JSON.parse(readFileSync(ledger2, "utf8"));
led2.entries = led2.entries.slice(1);
writeFileSync(ledger2, JSON.stringify(led2, null, 2), "utf8");
check("seal: dropped ledger entry detected", run("seal2", "verify-archived-agent-notes.ts"), 1);

// 改写先前的封印。
put("seal3", ".agents/notes/archived/architecture/2026-01-01-a.md", ARCH("A."));
put("seal3", ".agents/notes/archived/architecture/2026-01-02-b.md", ARCH("B."));
run("seal3", "verify-archived-agent-notes.ts", ["--write"]);
const ledger3 = join(BASE, "seal3", ".agents/notes/archived/.seal-ledger.json");
const led3 = JSON.parse(readFileSync(ledger3, "utf8"));
led3.entries[0].seal = "sha256:" + "0".repeat(64);
writeFileSync(ledger3, JSON.stringify(led3, null, 2), "utf8");
check("seal: edited ledger seal detected", run("seal3", "verify-archived-agent-notes.ts"), 1);

// 归档顺序可以与文件名日期顺序不同；插入较早路径时必须重算链。
put("sealorder", ".agents/notes/implemented/architecture/2026-01-01-newer.md", IMPL("newer"));
put("sealorder", ".agents/notes/implemented/architecture/2025-06-01-older.md", IMPL("older"));
check("seal order: archive the newer note first", run("sealorder", "archive-agent-note.ts", [
    ".agents/notes/implemented/architecture/2026-01-01-newer.md",
]), 0);
check("seal order: archive the older note second", run("sealorder", "archive-agent-note.ts", [
    ".agents/notes/implemented/architecture/2025-06-01-older.md",
]), 0);
check("seal order: chain survives out-of-order archiving", run("sealorder", "verify-archived-agent-notes.ts"), 0);
check("seal order: ledger is stored in sorted key order", (() => {
    const led = JSON.parse(readFileSync(join(BASE, "sealorder", ".agents/notes/archived/.seal-ledger.json"), "utf8"));
    const keys = led.entries.map((e) => e.key);
    const sorted = [...keys].sort((a, b) => a.localeCompare(b));
    return keys.join("|") === sorted.join("|") ? 1 : 0;
})(), 1);

// 归档命令必须接受格式门认可的状态行写法。
put("sealzh", ".agents/notes/implemented/architecture/2025-02-02-zh.md",
    "# Agent Note: 中文笔记\n\n状态：已实现\n\n## 问题\n\nP.\n\n## 决策\n\nD.\n\n## 备选方案\n\n- **A** — b.\n\n## 后果\n\nC.\n");
check("seal zh: format gate accepts the Chinese status line", run("sealzh", "verify-agent-note-format.ts"), 0);
check("seal zh: archive CLI accepts the same note", run("sealzh", "archive-agent-note.ts", [
    ".agents/notes/implemented/architecture/2025-02-02-zh.md",
]), 0);
// 冻结快照保留原状态行；归档校验器也必须认可中文状态行。
check("seal zh: the archived note passes verify-archived", run("sealzh", "verify-archived-agent-notes.ts"), 0);

// 看板必须保留多段正文，并读取格式门认可的标题别名。
put("boardfix", ".agents/notes/implemented/architecture/2026-04-01-multi.md", `${HEAD("multi paragraph", "implemented")}
## Problem

First paragraph of the problem.

Second paragraph carries the actual reasoning.

## Decision

Decision first line.

Decision second paragraph.

## 已考虑的替代方案

- **Option A** — strong case, rejected on cost.

## Consequences

Cost first.

Benefit second.
`);
{
    const r = spawnSync(process.execPath, [join(SCRIPTS, "build-board.ts"), "--bundle", ".agents/notes", "demo.html", "Board fix"], {
        cwd: join(BASE, "boardfix"),
        env: { ...process.env, AGENT_NOTE_ROOT: join(BASE, "boardfix", ".agents", "notes") },
        stdio: "inherit",
    });
    check("board: bundle builds", r.status, 0);
    const html = readFileSync(join(BASE, "boardfix", "demo.html"), "utf8");
    const m = /window\.__INLINE_DATA__ = (\[[\s\S]*?\]);/.exec(html);
    check("board: inline data present", m ? 1 : 0, 1);
    if (m) {
        const data = JSON.parse(m[1].replace(/\\u003c/g, "<"));
        const n = data[0];
        check("board: keeps the 2nd paragraph of Problem", n.problem.includes("Second paragraph carries") ? 1 : 0, 1);
        check("board: keeps the 2nd paragraph of Decision", n.decision.includes("Decision second paragraph") ? 1 : 0, 1);
        check("board: keeps both paragraphs of Consequences", n.consequences.includes("Cost first") && n.consequences.includes("Benefit second") ? 1 : 0, 1);
        check("board: reads an alias the gate accepts (## 已考虑的替代方案)", n.alternatives.includes("Option A") ? 1 : 0, 1);
    }
}

// 归档命令保留 CRLF，正确放置链接，并执行严格检查。
put("crlf", ".agents/notes/implemented/process/2026-05-01-crlf.md", IMPL("crlf note").replace(/\n/g, "\r\n"));
put("crlf", ".agents/notes/implemented/process/2026-05-02-succ.md", PROP("succ"));
check("archive: CRLF note archives", run("crlf", "archive-agent-note.ts", [
    ".agents/notes/implemented/process/2026-05-01-crlf.md",
    "--superseded-by", ".agents/notes/implemented/process/2026-05-02-succ.md",
]), 0);

const archivedCrlf = join(BASE, "crlf", ".agents/notes/archived/process/2026-05-01-crlf.md");
if (existsSync(archivedCrlf)) {
    const s = readFileSync(archivedCrlf, "utf8");
    const bareLf = (s.match(/(?<!\r)\n/g) || []).length;
    const crlfCount = (s.match(/\r\n/g) || []).length;
    check("archive: CRLF preserved with no bare LF", bareLf === 0 && crlfCount > 0 ? 1 : 0, 1);
    check("archive: Archived line sits right under Status", s.replace(/\r\n/g, "\n").split("\n")[2] === "Status: implemented" ? 1 : 0, 1);
} else {
    check("archive: CRLF note landed in archived/", 0, 1);
}

const succ = join(BASE, "crlf", ".agents/notes/implemented/process/2026-05-02-succ.md");
check("archive: successor link inserted before the final section", (() => {
    if (!existsSync(succ)) return 0;
    const lines = readFileSync(succ, "utf8").replace(/\r\n/g, "\n").split("\n");
    const linkIdx = lines.findIndex((l) => /Historical snapshot:|历史快照：/.test(l));
    const lastH2 = lines.reduce((acc, l, i) => (l.startsWith("## ") ? i : acc), -1);
    return linkIdx !== -1 && lastH2 !== -1 && linkIdx < lastH2 && lines[lastH2] === "## Risks" ? 1 : 0;
})(), 1);

put("strict", ".agents/notes/implemented/architecture/2026-01-01-old.md", IMPL("old"));
put("strict", ".agents/notes/implemented/architecture/2026-01-02-ref.md", `${HEAD("ref", "implemented")}
## Problem

Chains to [old](./2026-01-01-old.md).

## Decision

D.

## Alternatives considered

- **A** — b.

## Consequences

C.
`);
check("archive: --strict fails while inbound links remain", run("strict", "archive-agent-note.ts", [
    ".agents/notes/implemented/architecture/2026-01-01-old.md", "--strict",
]), 1);

// Git 基线用例需要可用的子进程；环境不满足时记录失败，不能假报全部通过。
const gitUsable = (() => {
    const probe = join(BASE, "git-probe");
    mkdirSync(probe, { recursive: true });
    const r = spawnSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: probe, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    if (r.error || r.status === null) {
        check(`git: required subprocess unavailable (${r.error?.code ?? "unknown"})`, 1, 0);
        return false;
    }
    return true;
})();

if (gitUsable) {
    const gh = "gitguard";
    mkdirSync(join(BASE, gh), { recursive: true });
    put(gh, ".agents/notes/implemented/architecture/2026-06-01-keep.md", IMPL("keep"));
    put(gh, ".agents/notes/implemented/architecture/2026-06-02-move.md", IMPL("move"));
    put(gh, ".agents/notes/implemented/architecture/2026-06-03-later.md", IMPL("later"));
    git(gh, "init", "-q");
    git(gh, "config", "user.email", "tester@example.com");
    git(gh, "config", "user.name", "tester");

    // 基线必须已有封印，否则只增不改检查没有对象可供对比。
    run(gh, "archive-agent-note.ts", [".agents/notes/implemented/architecture/2026-06-02-move.md"]);
    git(gh, "add", "-A");
    git(gh, "commit", "-qm", "baseline with one sealed note");
    const baseline = git(gh, "rev-parse", "HEAD").stdout.trim();
    const manifestPath = join(BASE, gh, ".agents/notes/archived/manifest.json");

    // 插入排序靠后的新路径不改变已有链值，应当通过基线检查。
    run(gh, "archive-agent-note.ts", [".agents/notes/implemented/architecture/2026-06-03-later.md"]);
    git(gh, "add", "-A");
    git(gh, "commit", "-qm", "append a later note");
    check("git: appending a seal passes against baseline", run(gh, "verify-archived-agent-notes.ts", [], { AGENT_NOTE_ARCHIVE_BASE_REF: baseline }), 0);

    // 插入排序靠前的路径会重算后续链值；基线按路径和摘要比较，不按位置比较。
    run(gh, "archive-agent-note.ts", [".agents/notes/implemented/architecture/2026-06-01-keep.md"]);
    check("git: inserting a seal that sorts earlier passes against baseline", run(gh, "verify-archived-agent-notes.ts", [], { AGENT_NOTE_ARCHIVE_BASE_REF: baseline }), 0);

    for (const name of ["git-reseal", "git-remove", "git-forged"]) {
        cpSync(join(BASE, gh), join(BASE, name), { recursive: true });
    }
    // 每个损坏用例只引入自己的错误，并核对目标诊断。
    const archivedKeep = join(BASE, "git-reseal", ".agents/notes/archived/architecture/2026-06-02-move.md");
    const originalKeep = readFileSync(archivedKeep, "utf8");
    writeFileSync(archivedKeep, originalKeep.replace("D.", "REWRITTEN."), "utf8");
    check("git: deliberate reseal command succeeds", run("git-reseal", "verify-archived-agent-notes.ts", ["--reseal"]), 0);
    rejects("git-reseal", "verify-archived-agent-notes.ts", [], /seal history entry missing or changed relative to/, { AGENT_NOTE_ARCHIVE_BASE_REF: baseline });

    const removedManifest = join(BASE, "git-remove", ".agents/notes/archived/manifest.json");
    const manifest = JSON.parse(readFileSync(removedManifest, "utf8"));
    delete manifest.files["archived/architecture/2026-06-02-move.md"];
    writeFileSync(removedManifest, JSON.stringify(manifest), "utf8");
    rejects("git-remove", "verify-archived-agent-notes.ts", [], /missing from manifest/, { AGENT_NOTE_ARCHIVE_BASE_REF: baseline });

    put("git-forged", ".agents/notes/archived/architecture/2026-06-09-forged.md", ARCH("FORGED."));
    rejects("git-forged", "verify-archived-agent-notes.ts", ["--write"], /did not exist at/, { AGENT_NOTE_ARCHIVE_BASE_REF: baseline });

}

// 两版独立安装且各自携带共享代码，因此必须逐字节检查，防止实现漂移。
const EDITIONS = ["write-notes", "write-notes-en"];
const skillPath = (edition, ...rest) => join(REPO, "skills", edition, ...rest);

for (const edition of EDITIONS) {
    check(`${edition}: SKILL.md present`, existsSync(skillPath(edition, "SKILL.md")) ? 1 : 0, 1);
}

// frontmatter 名称必须与目录一致，防止安装冲突。
for (const edition of EDITIONS) {
    const head = readFileSync(skillPath(edition, "SKILL.md"), "utf8").split("\n").slice(0, 5).join("\n");
    check(`${edition}: frontmatter name matches directory`, new RegExp(`^name:\\s*${edition}\\s*$`, "m").test(head) ? 1 : 0, 1);
    check(`${edition}: frontmatter has a description`, /^description:\s*\S/m.test(head) ? 1 : 0, 1);
}

// 英文版文档只允许保留门禁支持的中文标题别名，其余中文说明视为漏译。
const ALLOWED_CHINESE = new Set([
    "问题", "决策", "备选方案", "已考虑的替代方案", "备选", "后果", "提议", "方案", "提案",
    "决定", "影响", "结果", "风险", "验收标准", "验收条件", "接受标准", "计划", "规划", "迁移计划",
    "替代方案",
]);
const strayChinese = (file) => {
    const text = readFileSync(skillPath("write-notes-en", file), "utf8");
    const found = new Set();
    for (const m of text.matchAll(/[\u4e00-\u9fff]+/g)) {
        if (!ALLOWED_CHINESE.has(m[0])) found.add(m[0]);
    }
    return [...found];
};
const enStraySkill = strayChinese("SKILL.md");
check("write-notes-en: SKILL.md has no untranslated Chinese", enStraySkill.length === 0 ? 1 : 0, 1);
if (enStraySkill.length) console.log(`    untranslated: ${enStraySkill.join(", ")}`);
const zhText = readFileSync(skillPath("write-notes", "SKILL.md"), "utf8");
check("write-notes: SKILL.md is in Chinese", /[\u4e00-\u9fff]/.test(zhText) ? 1 : 0, 1);

// 共享文件逐字节相同；build-board.ts 保留本地化控制台文案。
const SHARED = [
    "scripts/agent-note-tree.ts",
    "scripts/archive-agent-note.ts",
    "scripts/check-note-anchors.ts",
    "scripts/note-sections.ts",
    "scripts/note-parser.mjs",
    "scripts/seal-store.ts",
    "scripts/file-updates.ts",
    "scripts/verify-agent-note-format.ts",
    "scripts/verify-agent-note-tree.ts",
    "scripts/verify-archived-agent-notes.ts",
    "assets/agent-notes-board.html",
];
for (const rel of SHARED) {
    const a = existsSync(skillPath("write-notes", rel));
    const b = existsSync(skillPath("write-notes-en", rel));
    if (!a || !b) {
        check(`shared file present in both editions: ${rel}`, 0, 1);
        continue;
    }
    const same = readFileSync(skillPath("write-notes", rel)).equals(readFileSync(skillPath("write-notes-en", rel)));
    check(`shared file identical across editions: ${rel}`, same ? 1 : 0, 1);
}

// 两版 SKILL.md 的相对链接必须存在。
for (const edition of EDITIONS) {
    const text = readFileSync(skillPath(edition, "SKILL.md"), "utf8");
    const missing = [];
    for (const m of text.matchAll(/\]\(([^)#\s]+\.md)\)/g)) {
        const target = m[1];
        if (/^https?:/.test(target) || target.includes("…")) continue;
        if (!existsSync(join(REPO, "skills", edition, target))) missing.push(target);
    }
    check(`${edition}: all relative links in SKILL.md resolve`, missing.length === 0 ? 1 : 0, 1);
    if (missing.length) console.log(`    missing: ${missing.join(", ")}`);
}

// 英文版随附的门禁必须能校验英文笔记。
put("en", ".agents/notes/implemented/architecture/2026-01-01-en.md", `${HEAD("english edition", "implemented")}
## Problem

The English edition must pass its own gates.

## Decision

Notes in English use the English section names.

## Alternatives considered

- **Ship one bilingual skill** — the installer copies through symlinks and has no language dimension, so this cannot work.

## Consequences

- **Benefit**: the gate is exercised for this edition.
- **Cost**: shared code is duplicated and must be kept identical.
`);
check("write-notes-en: english note passes the format gate", (() => {
    const r = spawnSync(process.execPath, [join(REPO, "skills", "write-notes-en", "scripts", "verify-agent-note-format.ts")], {
        cwd: join(BASE, "en"),
        env: { ...process.env, AGENT_NOTE_ROOT: join(BASE, "en", ".agents", "notes") },
        stdio: "inherit",
    });
    return r.status;
})(), 0);
check("write-notes-en: tree gate runs from its own scripts dir", (() => {
    const r = spawnSync(process.execPath, [join(REPO, "skills", "write-notes-en", "scripts", "verify-agent-note-tree.ts")], {
        cwd: join(BASE, "en"),
        env: { ...process.env, AGENT_NOTE_ROOT: join(BASE, "en", ".agents", "notes") },
        stdio: "inherit",
    });
    return r.status;
})(), 0);


// 配对文件也要检查实际内容和链接，不能只确认基础文件存在。
put("variant-invalid", ".agents/notes/implemented/architecture/2026-01-01-a.md", IMPL("base"));
put("variant-invalid", ".agents/notes/implemented/architecture/2026-01-01-a.zh.md", "# invalid\n\n[missing](2026-01-02-missing.md)\n");
rejects("variant-invalid", "verify-agent-note-format.ts", [], /line 1/);
rejects("variant-invalid", "verify-agent-note-tree.ts", [], /target file does not exist/);
put("section-order", ".agents/notes/implemented/architecture/2026-01-01-a.md", IMPL("order").replace("## Problem", "## Decision").replace("## Decision\n\nD.", "## Problem\n\nD."));
rejects("section-order", "verify-agent-note-format.ts", [], /first section/);

// 示例中的标题和链接不能改变真实结构；普通链接仍需报告断链。
const examples = '\n## Verification\n\n````markdown\n```\n## Proposal\n[example](missing.md)\n```\n````\n\n~~~\n## Plan\n[example](missing.md)\n~~~\n\n`[inline](missing.md)`\n';
put("examples", ".agents/notes/implemented/architecture/2026-01-01-a.md", IMPL("examples") + examples);
check("examples: format ignores fenced headings", run("examples", "verify-agent-note-format.ts"), 0);
check("examples: tree ignores example links", run("examples", "verify-agent-note-tree.ts"), 0);
put("examples-real", ".agents/notes/implemented/architecture/2026-01-01-a.md", IMPL("examples") + examples + '\n[real](missing.md)\n');
rejects("examples-real", "verify-agent-note-tree.ts", [], /target file does not exist/);

// 归档仅插入真实头部行，保留 BOM、CRLF 以及正文中的同名示例。
const markerRaw = '\uFEFF' + (IMPL("marker") + '\n## Verification\n\n```text\nArchived: 2020-01-01\n```\n').replace(/\n/g, '\r\n');
const markerSource = put("archive-marker", ".agents/notes/implemented/architecture/2026-01-01-a.md", markerRaw);
check("archive marker: source passes format", run("archive-marker", "verify-agent-note-format.ts"), 0);
check("archive marker: command succeeds", run("archive-marker", "archive-agent-note.ts", [markerSource]), 0);
check("archive marker: result passes verification", run("archive-marker", "verify-archived-agent-notes.ts"), 0);
const markerArchived = readFileSync(join(BASE, "archive-marker", ".agents/notes/archived/architecture/2026-01-01-a.md"), 'utf8');
check("archive marker: only the header insertion changed", markerArchived.replace(/^(.*\r\n\r\nStatus: implemented\r\n)Archived: \d{4}-\d{2}-\d{2}\r\n/, '$1') === markerRaw ? 1 : 0, 1);

// 删除末条不会破坏前面的哈希链，因此必须另查账本和索引的条目集合。
for (const name of ["tail", "lost-ledger", "lost-file"]) {
    put(name, ".agents/notes/archived/architecture/2026-01-01-a.md", ARCH("A."));
    put(name, ".agents/notes/archived/architecture/2026-01-02-b.md", ARCH("B."));
    assert.equal(captured(name, "verify-archived-agent-notes.ts", ["--write"]).status, 0);
}
const tailPath = join(BASE, "tail", ".agents/notes/archived/.seal-ledger.json");
const tail = JSON.parse(readFileSync(tailPath, "utf8"));
tail.entries.pop();
writeFileSync(tailPath, JSON.stringify(tail));
rejects("tail", "verify-archived-agent-notes.ts", [], /missing from seal history/);
rmSync(join(BASE, "lost-ledger", ".agents/notes/archived/.seal-ledger.json"));
rejects("lost-ledger", "verify-archived-agent-notes.ts", ["--write"], /seal-ledger.json missing/);
rmSync(join(BASE, "lost-file", ".agents/notes/archived/architecture/2026-01-01-a.md"));
rejects("lost-file", "verify-archived-agent-notes.ts", [], /no archived file on disk/);

// 输入已损坏或严格检查失败时，不留下已移动或已改写的源文件。
const preflightSource = put("archive-preflight", ".agents/notes/implemented/architecture/2026-01-01-a.md", IMPL("preflight"));
put("archive-preflight", ".agents/notes/archived/.seal-ledger.json", "{broken");
rejects("archive-preflight", "archive-agent-note.ts", [preflightSource], /Invalid archive manifest or seal history/);
check("archive preflight: source unchanged", readFileSync(preflightSource, "utf8") === IMPL("preflight") ? 1 : 0, 1);
check("archive preflight: no snapshot written", existsSync(join(BASE, "archive-preflight", ".agents/notes/archived/architecture/2026-01-01-a.md")) ? 1 : 0, 0);
check("archive strict: source retained", existsSync(join(BASE, "strict", ".agents/notes/implemented/architecture/2026-01-01-old.md")) ? 1 : 0, 1);

// 直接执行生成页面实际内嵌的解析代码，验证本地模式与打包模式结果相同。
const boardRaw = readFileSync(join(BASE, "boardfix", ".agents/notes/implemented/architecture/2026-04-01-multi.md"), "utf8");
assert.equal(captured("boardfix", "build-board.ts", ["--init", "board.html", "Parser parity"]).status, 0);
const liveHtml = readFileSync(join(BASE, "boardfix", "board.html"), "utf8");
const parserCode = liveHtml.slice(liveHtml.indexOf("const NOTE_PARSER ="), liveHtml.indexOf("const parseNote ="));
const liveRecord = runInNewContext(`${parserCode}\nNOTE_PARSER.parseNote(${JSON.stringify(boardRaw)}, 'implemented/architecture/2026-04-01-multi.md')`);
const bundleHtml = readFileSync(join(BASE, "boardfix", "demo.html"), "utf8");
const bundleRecord = JSON.parse(/window\.__INLINE_DATA__ = (\[[\s\S]*?\]);/.exec(bundleHtml)[1])[0];
check("board: live and bundled parsing are identical", JSON.stringify(liveRecord) === JSON.stringify(bundleRecord) ? 1 : 0, 1);
check("board: local view retains alternatives", liveRecord.alternatives.includes("Option A") ? 1 : 0, 1);

if (gitUsable) {
    // 自定义根目录和不存在的显式基线分别使用完整的独立 Git 仓库。
    const custom = "custom-root";
    const root = join(BASE, custom, "docs/adr");
    const env = { AGENT_NOTE_ROOT: root };
    for (const name of ["a", "b"]) put(custom, `docs/adr/implemented/architecture/2026-01-01-${name}.md`, IMPL(name));
    assert.equal(captured(custom, "archive-agent-note.ts", [join(root, "implemented/architecture/2026-01-01-a.md")], env).status, 0);
    for (const args of [["init", "-q"], ["config", "user.email", "tester@example.com"], ["config", "user.name", "tester"], ["add", "-A"], ["-c", "commit.gpgsign=false", "commit", "-qm", "clean baseline"]]) {
        assert.equal(git(custom, ...args).status, 0);
    }
    assert.equal(captured(custom, "archive-agent-note.ts", [join(root, "implemented/architecture/2026-01-01-b.md")], env).status, 0);
    check("custom root: legitimate archive passes baseline", captured(custom, "verify-archived-agent-notes.ts", [], { ...env, AGENT_NOTE_ARCHIVE_BASE_REF: "HEAD" }).status, 0);
    rejects(custom, "verify-archived-agent-notes.ts", [], /Cannot resolve configured archive baseline/, { ...env, AGENT_NOTE_ARCHIVE_BASE_REF: "missing-ref" });
    rejects(custom, "verify-archived-agent-notes.ts", ["--reseal"], /Cannot resolve configured archive baseline/, { ...env, AGENT_NOTE_ARCHIVE_BASE_REF: "missing-ref" });
}

// 在封印写入中途注入一次 I/O 故障，检查快照和已写索引均被恢复。
put("rollback", ".agents/notes/archived/architecture/2026-01-01-old.md", ARCH("old"));
assert.equal(captured("rollback", "verify-archived-agent-notes.ts", ["--write"]).status, 0);
const rollbackSource = put("rollback", ".agents/notes/implemented/architecture/2026-01-02-new.md", IMPL("new"));
const rollbackManifest = join(BASE, "rollback", ".agents/notes/archived/manifest.json");
const rollbackLedger = join(BASE, "rollback", ".agents/notes/archived/.seal-ledger.json");
const beforeManifest = readFileSync(rollbackManifest);
const beforeLedger = readFileSync(rollbackLedger);
const faultScript = put("rollback", "fault.mjs", `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const rename = fs.renameSync;
let injected = false;
// 仅在本夹具的一次账本提交上失败，恢复路径继续使用真实文件系统。
fs.renameSync = (from, to) => {
    if (to === ${JSON.stringify(rollbackLedger)} && !injected) {
        injected = true;
        throw new Error('injected ledger write failure');
    }
    return rename(from, to);
};
syncBuiltinESMExports();
process.argv = [process.execPath, ${JSON.stringify(join(SCRIPTS, "archive-agent-note.ts"))}, ${JSON.stringify(rollbackSource)}];
await import(${JSON.stringify(pathToFileURL(join(SCRIPTS, "archive-agent-note.ts")).href)});
`);
const fault = spawnSync(process.execPath, [faultScript], { cwd: join(BASE, "rollback"), env: { ...process.env, AGENT_NOTE_ROOT: join(BASE, "rollback", ".agents/notes") }, encoding: "utf8" });
check("rollback: reports injected write failure", fault.status === 1 && /injected ledger write failure/.test(fault.stderr) ? 1 : 0, 1);
check("rollback: source retained byte for byte", readFileSync(rollbackSource, "utf8") === IMPL("new") ? 1 : 0, 1);
check("rollback: manifest restored", readFileSync(rollbackManifest).equals(beforeManifest) ? 1 : 0, 1);
check("rollback: ledger retained", readFileSync(rollbackLedger).equals(beforeLedger) ? 1 : 0, 1);
check("rollback: new snapshot removed", existsSync(join(BASE, "rollback", ".agents/notes/archived/architecture/2026-01-02-new.md")) ? 1 : 0, 0);

console.log("\n================ RESULTS ================");
for (const r of results) console.log(r);
console.log(`\n${results.length - failures}/${results.length} passed, ${failures} failed`);
rmSync(BASE, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
