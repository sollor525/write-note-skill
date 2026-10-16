// 离线测试评分器能拒绝错误文件动作；这里不调用模型，也不证明模型会遵守技能。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { cases, ROOT, TIMEOUT_NOTE, RETRY_NOTE, CACHE_NOTE, QUEUE_NOTE, ADR } from "../evals/note-behavior/cases.mjs";
import { grade, snapshot } from "../evals/note-behavior/grade.mjs";

/** 复制用例文件以隔离断言；快照中的目录由路径推导，空目录由测试显式加入。 */
function state(files) {
    const directories = new Set();
    for (const path of Object.keys(files)) {
        const parts = path.split("/");
        while (parts.length > 1) { parts.pop(); directories.add(parts.join("/")); }
    }
    return { files: { ...files }, directories: [...directories] };
}

/** 在初始夹具上应用待评分的文件变化；null 表示删除，返回完整判定用于负向断言。 */
function evaluate(id, changes = {}) {
    const item = cases.find((candidate) => candidate.id === id);
    const after = { ...item.files };
    for (const [path, value] of Object.entries(changes)) {
        if (value === null) delete after[path];
        else after[path] = value;
    }
    return grade(item, state(item.files), state(after));
}

// 不写笔记和无依据初始化空树是不同动作，不能把空目录当作成功豁免。
test("local repair needs no note and rejects empty note initialization", () => {
    assert.equal(evaluate("local-fix", { "clamp.mjs": "fixed" }).passed, true);
    const item = cases.find((candidate) => candidate.id === "local-fix");
    const before = state(item.files);
    assert.equal(grade(item, before, { ...before, directories: [ROOT] }).passed, false);
    assert.equal(evaluate("local-fix", { [TIMEOUT_NOTE]: "unnecessary note" }).passed, false);
});

// 仅在最终回复声称完成不能替代已有笔记的事实同步，也不能靠新建另一篇绕过。
test("fact updates require the owner to change without duplicates", () => {
    const item = cases.find((candidate) => candidate.id === "fact-update");
    const updated = item.files[TIMEOUT_NOTE].replace("1000", "2000");
    assert.equal(evaluate("fact-update", { [TIMEOUT_NOTE]: updated }).passed, true);
    assert.equal(evaluate("fact-update").passed, false);
    assert.equal(evaluate("fact-update", { [TIMEOUT_NOTE]: updated, [TIMEOUT_NOTE.replace("request-timeout", "new-timeout")]: updated }).passed, false);
});

// 已经落地的新选择必须有且只有一篇 implemented 记录。
test("a landed decision cannot be missing, proposed or duplicated", () => {
    assert.equal(evaluate("new-decision", { [TIMEOUT_NOTE]: "new decision" }).passed, true);
    assert.equal(evaluate("new-decision").passed, false);
    assert.equal(evaluate("new-decision", { [RETRY_NOTE]: "proposal" }).passed, false);
    assert.equal(evaluate("new-decision", { [TIMEOUT_NOTE]: "one", [QUEUE_NOTE]: "two" }).passed, false);
});

// 生命周期检查不能把完成误算成拒绝，也不能靠复制文件遗留仍有效的提案。
test("completion requires an identity-preserving move to implemented", () => {
    const target = RETRY_NOTE.replace("/proposed/", "/implemented/");
    assert.equal(evaluate("complete-proposal", { [RETRY_NOTE]: null, [target]: "Status: implemented\n" }).passed, true);
    assert.equal(evaluate("complete-proposal", { [RETRY_NOTE]: null, [target.replace("/implemented/", "/rejected/")]: "Status: rejected — done\n" }).passed, false);
    assert.equal(evaluate("complete-proposal", { [target]: "Status: implemented\n" }).passed, false);
    assert.equal(evaluate("complete-proposal", { [RETRY_NOTE]: null, [target.replace("2026-01-06", "2026-01-09")]: "Status: implemented\n" }).passed, false);
});

// 拒绝必须带理由并保留原提案，避免把历史写成当时从未提出的新方案。
test("rejection needs a verdict and preserves the original proposal", () => {
    const item = cases.find((candidate) => candidate.id === "reject-proposal");
    const target = CACHE_NOTE.replace("/proposed/", "/rejected/");
    const rejected = item.files[CACHE_NOTE].replace("Status: proposed", "Status: rejected — shared-terminal privacy");
    assert.equal(evaluate("reject-proposal", { [CACHE_NOTE]: null, [target]: rejected }).passed, true);
    assert.equal(evaluate("reject-proposal", { [CACHE_NOTE]: null, [target]: rejected.replace(" — shared-terminal privacy", "") }).passed, false);
    assert.equal(evaluate("reject-proposal", { [CACHE_NOTE]: null, [target]: rejected.replace("Persist records", "Never persist records") }).passed, false);
});

// 平铺 ADR 维持自己的头部和目录，不得为了调用本技能门禁另建一套笔记。
test("flat ADR updates retain the host convention", () => {
    const item = cases.find((candidate) => candidate.id === "existing-adr");
    const updated = item.files[ADR].replace("1000", "2000");
    assert.equal(evaluate("existing-adr", { [ADR]: updated }).passed, true);
    assert.equal(evaluate("existing-adr", { [ADR]: updated.replace("Accepted", "implemented") }).passed, false);
    assert.equal(evaluate("existing-adr", { [ADR]: updated, [TIMEOUT_NOTE]: "parallel library" }).passed, false);
});

// 部分替代保留仍有效的原记录；只写文件名或单向链接不能满足双向可追溯性。
test("partial supersession keeps both records with prominent resolved links", () => {
    const item = cases.find((candidate) => candidate.id === "partial-supersession");
    const successor = `${ROOT}/implemented/architecture/2026-01-09-durable-uploads.md`;
    const original = item.files[QUEUE_NOTE].replace("## Problem\n", "## Problem\n\nUploads: [successor](2026-01-09-durable-uploads.md).\n");
    const next = "## Problem\n\n[Original](2026-01-08-memory-queues.md)\n";
    assert.equal(evaluate("partial-supersession", { [QUEUE_NOTE]: original, [successor]: next }).passed, true);
    assert.equal(evaluate("partial-supersession", { [QUEUE_NOTE]: null, [successor]: next }).passed, false);
    assert.equal(evaluate("partial-supersession", { [QUEUE_NOTE]: original, [successor]: "No link" }).passed, false);
    assert.equal(evaluate("partial-supersession", { [QUEUE_NOTE]: original.replace("2026-01-09-durable-uploads.md", "elsewhere/2026-01-09-durable-uploads.md"), [successor]: next }).passed, false);
});

// 两种看板必须有对应数据模式，且不能为了 npm 别名给宿主新增 package.json。
test("board generation checks both modes without adding package metadata", () => {
    const html = '<meta name="generator" content="agent-notes-board"><h1 id="brand-project-title">Fixture Decisions</h1>';
    const board = `${html}window.__INLINE_DATA__ = null;`;
    const demo = `${html}window.__INLINE_DATA__ = [{title: "Bounded request time", body: "1000"}];`;
    assert.equal(evaluate("board-generation", { "board.html": board, "demo.html": demo }).passed, true);
    assert.equal(evaluate("board-generation", { "board.html": board, "demo.html": board }).passed, false);
    assert.equal(evaluate("board-generation", { "board.html": board, "demo.html": demo, "package.json": "{}" }).passed, false);
});

// 模型不得改动加载的技能或评分外的输入文件来制造通过。
test("unexpected fixture changes are rejected", () => {
    assert.equal(evaluate("local-fix", { ".agents/skills/write-notes-en/SKILL.md": "replacement" }).passed, false);
    assert.equal(evaluate("complete-proposal", { "retry.mjs": null }).passed, false);
});

// 快照不遍历指向宿主外的链接，且保留空目录供“不初始化笔记树”断言使用。
test("snapshots preserve empty directories and do not follow symbolic links", () => {
    const root = mkdtempSync(join(tmpdir(), "note-eval-snapshot-"));
    try {
        mkdirSync(join(root, ".git"));
        writeFileSync(join(root, ".git", "internal"), "ignored");
        mkdirSync(join(root, ROOT), { recursive: true });
        symlinkSync("/outside-fixture", join(root, "link"));
        const result = snapshot(root);
        assert.deepEqual(result.files, { link: "SYMLINK: /outside-fixture" });
        assert(result.directories.includes(ROOT));
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

// 在读取内容前检查容量，防止异常模型输出耗尽评分进程的内存。
test("snapshots reject oversized output before reading it", () => {
    const root = mkdtempSync(join(tmpdir(), "note-eval-limit-"));
    try {
        const path = join(root, "oversized");
        writeFileSync(path, "");
        truncateSync(path, 17 * 1024 * 1024);
        assert.throws(() => snapshot(root), /16 MiB snapshot limit/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

/** 用无网络的 CLI 替身测试运行器错误分类；绝不把替身结果记作模型行为证据。 */
function runWithFakeCli(mode) {
    const root = mkdtempSync(join(tmpdir(), "note-eval-runner-"));
    try {
        const binary = join(root, "codex");
        // 替身消费完整 stdin 后才退出，避免管道关闭错误掩盖要检查的分类。
        writeFileSync(binary, `#!${process.execPath}\nconst fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('codex-test-double'); process.exit(0); }
process.stdin.resume();
process.stdin.on('end', () => {
    if (process.env.NOTE_EVAL_FAKE_MODE === 'failure') {
        console.log(JSON.stringify({type: 'error', message: 'fixture service unavailable'}));
        process.exitCode = 1;
    } else {
        const output = process.argv[process.argv.indexOf('--output-last-message') + 1];
        fs.writeFileSync(output, 'All requested changes are complete.');
        console.log(JSON.stringify({type: 'turn.completed', usage: {input_tokens: 0, output_tokens: 0}}));
    }
});\n`);
        chmodSync(binary, 0o755);
        const output = join(root, "results");
        const result = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "eval-note-behavior.mjs"), "--case", "fact-update,complete-proposal", "--output", output], {
            env: { ...process.env, PATH: `${root}${delimiter}${process.env.PATH}`, NOTE_EVAL_FAKE_MODE: mode },
            encoding: "utf8", timeout: 30000,
        });
        if (result.error) throw result.error;
        return { exitCode: result.status, report: JSON.parse(readFileSync(join(output, "report.json"), "utf8")), diagnostic: result.stderr };
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

// 服务不可用必须与模型做错区分，未执行的剩余用例不能伪装成通过。
test("runner classifies CLI failure and stops remaining cases", () => {
    const result = runWithFakeCli("failure");
    assert.equal(result.exitCode, 2, result.diagnostic);
    assert.equal(result.report.cases.length, 1);
    assert.equal(result.report.cases[0].status, "infrastructure-error");
    assert.deepEqual(result.report.notRun, ["complete-proposal"]);
});

// 完成事件和成功宣称均不足以通过：没有实际文件动作就应报行为失败。
test("runner rejects successful CLI claims without actual changes", () => {
    const result = runWithFakeCli("complete");
    assert.equal(result.exitCode, 1, result.diagnostic);
    assert.equal(result.report.cases.length, 2);
    assert(result.report.cases.every((entry) => entry.status === "behavior-fail"));
    assert.deepEqual(result.report.notRun, []);
});
