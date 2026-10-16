// 模型只收到 files 与 request；期望动作和人工评审项保留在宿主之外。

/** 构造已落地的夹具笔记；调用方提供真实理由，格式与生产门禁一致。 */
function implemented(title, problem, decision, alternatives, consequences) {
    return `# Agent Note: ${title}\n\nStatus: implemented\n\n## Problem\n\n${problem}\n\n## Decision\n\n${decision}\n\n## Alternatives considered\n\n${alternatives}\n\n## Consequences\n\n${consequences}\n`;
}

/** 构造尚未落地的夹具提案；保留验收条件与风险以观察完成和拒绝的处理。 */
function proposed(title, problem, proposal, alternatives, acceptance, risks) {
    return `# Agent Note: ${title}\n\nStatus: proposed\n\n## Problem\n\n${problem}\n\n## Proposal\n\n${proposal}\n\n## Alternatives considered\n\n${alternatives}\n\n## Acceptance criteria\n\n${acceptance}\n\n## Risks\n\n${risks}\n`;
}

export const ROOT = ".agents/notes";
export const TIMEOUT_NOTE = `${ROOT}/implemented/architecture/2026-01-05-request-timeout.md`;
export const RETRY_NOTE = `${ROOT}/proposed/architecture/2026-01-06-bounded-retries.md`;
export const CACHE_NOTE = `${ROOT}/proposed/feature/2026-01-07-browser-cache.md`;
export const QUEUE_NOTE = `${ROOT}/implemented/architecture/2026-01-08-memory-queues.md`;
export const ADR = "docs/adr/0001-request-timeout.md";

const timeoutNote = implemented("Bounded request time", "A stalled upstream must not hold a worker forever.",
    "The default request timeout is 1000 ms. Callers can override it for their own latency budget.",
    "An unlimited wait avoids timeout errors but can exhaust workers when the upstream stalls.",
    "Requests may fail before a slow upstream finishes; callers handle the timeout explicitly.");

// 每项仅含一次场景的数据，不保存模型状态；files 的键均为临时宿主内的相对路径。
// id：报告与筛选标识；request：用户任务；action：机器检查的文件动作；files：初始文件。
// owner：可选的既有决策路径；mutable：允许修改的既有文件。
// checks：独立执行的代码断言；review：必须人工判断的语义。
export const cases = [
    {
        id: "local-fix", action: "none",
        request: "Fix clamp so negative inputs return zero, as its documented contract requires. Keep the existing upper bound behavior. Verify the fix.",
        files: {
            "README.md": "clamp(value) returns an integer between 0 and 100 inclusive for any integer input.\n",
            "clamp.mjs": "/** 将整数限制在 0 到 100 之间，无外部状态。 */\nexport function clamp(value) {\n    return Math.min(100, value);\n}\n",
        },
        mutable: ["clamp.mjs"],
        checks: ["import assert from 'node:assert/strict'; import { clamp } from './clamp.mjs'; assert.equal(clamp(-1), 0); assert.equal(clamp(0), 0); assert.equal(clamp(80), 80); assert.equal(clamp(101), 100);"],
        review: ["The fix restores the stated contract without inventing a new constraint or decision."],
    },
    {
        id: "fact-update", action: "update", owner: TIMEOUT_NOTE,
        request: "Raise DEFAULT_TIMEOUT_MS from 1000 to 2000. This is tuning within the existing bounded-wait decision; its reasons and per-call override contract still apply. Keep the repository's decision documentation accurate.",
        files: { "config.mjs": "export const DEFAULT_TIMEOUT_MS = 1000;\n", [TIMEOUT_NOTE]: timeoutNote },
        mutable: ["config.mjs", TIMEOUT_NOTE],
        checks: ["import assert from 'node:assert/strict'; import { DEFAULT_TIMEOUT_MS } from './config.mjs'; assert.equal(DEFAULT_TIMEOUT_MS, 2000);"],
        review: ["Only the timeout fact changes; the bounded-wait rationale and override contract are preserved."],
    },
    {
        id: "new-decision", action: "create",
        request: "Record the storage decision that has already landed in store.py. Two independent worker processes must commit jobs atomically without running a database service. We chose Python's bundled SQLite. We considered a JSON file because it is easy to inspect, but concurrent read-modify-write operations could lose jobs. Document the decision and its operational costs; no application code change is needed.",
        files: {
            "store.py": "import sqlite3\n\n# 每次调用独占连接；事务提交成功才返回，异常向调用方传播。\ndef add_job(path, body):\n    with sqlite3.connect(path) as connection:\n        connection.execute('CREATE TABLE IF NOT EXISTS jobs (body TEXT NOT NULL)')\n        connection.execute('INSERT INTO jobs VALUES (?)', (body,))\n",
        },
        mutable: [], checks: [],
        review: ["SQLite, concurrent writers, transactions and no resident database service explain the choice.", "The JSON alternative is treated fairly; lock contention and persistence costs are acknowledged without invented evidence."],
    },
    {
        id: "complete-proposal", action: "implement", owner: RETRY_NOTE,
        request: "The bounded-retry proposal has now been fully implemented in retry.mjs. Verify its stated acceptance criteria and update the decision record to reflect the finished implementation.",
        files: {
            [RETRY_NOTE]: proposed("Bounded retries", "An unavailable dependency must not keep a request alive forever.",
                "Try an operation at most three times, then propagate the final error.",
                "Unlimited retries can hide transient failures but never terminate during a prolonged outage.",
                "Success returns immediately. Persistent failure invokes the operation three times and propagates its last error.",
                "The caller can receive an error even if the dependency recovers later."),
            "retry.mjs": "/** 最多尝试三次；成功即返回，持续失败则传播最后一次异常。 */\nexport function retry(operation) {\n    for (let attempt = 1; attempt <= 3; attempt++) {\n        try { return operation(); } catch (error) { if (attempt === 3) throw error; }\n    }\n}\n",
        },
        mutable: [RETRY_NOTE],
        checks: ["import assert from 'node:assert/strict'; import { retry } from './retry.mjs'; let n=0; assert.equal(retry(()=>{n++; return 7;}), 7); assert.equal(n, 1); n=0; const error=new Error('offline'); assert.throws(()=>retry(()=>{n++; throw error;}), e=>e===error); assert.equal(n, 3);"],
        review: ["Completion becomes implemented, never rejected; original tradeoffs survive the move."],
    },
    {
        id: "reject-proposal", action: "reject", owner: CACHE_NOTE,
        request: "We have decided not to implement the browser-cache proposal: shared terminals could expose a previous user's private records. Keep the rejected proposal and this reason so we do not suggest it again. No application code change is needed.",
        files: {
            [CACHE_NOTE]: proposed("Cache private records in the browser", "Repeated navigation waits for the same private records to download.",
                "Persist records in browser storage across sessions to avoid repeated downloads.",
                "Fetching on each visit avoids persistent private data but adds latency and bandwidth.",
                "A later session can display previously downloaded records without a network request.",
                "Shared terminals may retain records beyond the original user's session."),
        },
        mutable: [CACHE_NOTE], checks: [],
        review: ["The rejection states the shared-terminal privacy reason and retains the original proposal, rather than rewriting it as an opposite decision."],
    },
    {
        id: "existing-adr", action: "adr", owner: ADR,
        request: "Raise DEFAULT_TIMEOUT_MS from 1000 to 2000 without changing the bounded-wait design. Keep our existing decision record accurate.",
        files: {
            "AGENTS.md": "# Contributor guide\n\nDecisions use flat docs/adr/NNNN-topic.md files with a '# NNNN. Title' heading, 'Status: Accepted', and Context / Decision / Consequences sections. Preserve existing record identities and this convention. No ADR validator is configured.\n",
            "config.mjs": "export const DEFAULT_TIMEOUT_MS = 1000;\n",
            [ADR]: "# 0001. Bound request time\n\nStatus: Accepted\n\n## Context\n\nA stalled upstream must not hold a worker forever.\n\n## Decision\n\nThe default request timeout is 1000 ms; callers may override it.\n\n## Consequences\n\nA slow upstream may time out before it finishes.\n",
        },
        mutable: ["config.mjs", ADR],
        checks: ["import assert from 'node:assert/strict'; import { DEFAULT_TIMEOUT_MS } from './config.mjs'; assert.equal(DEFAULT_TIMEOUT_MS, 2000);"],
        review: ["The model uses the flat ADR without schema migration, parallel notes or a false claim that the skill's gates checked it.", "The final report distinguishes a manual ADR review from an automated format check."],
    },
    {
        id: "partial-supersession", action: "supersede", owner: QUEUE_NOTE,
        request: "Upload jobs now use the durable SQLite queue implemented in uploads.py, because acknowledged jobs must survive a restart. The telemetry queue stays in memory and may still drop samples. Record this partial change to our queue decision. We considered retaining uploads in memory for simplicity but rejected losing acknowledged jobs on restart. The old rationale is still useful for telemetry.",
        files: {
            [QUEUE_NOTE]: implemented("Keep upload and telemetry queues in memory", "The initial service has no durability requirement for queued work.",
                "Upload jobs and telemetry samples wait in process memory. Both are lost on restart.",
                "A disk queue survives restarts but adds storage management and write overhead.",
                "No files or cleanup jobs are required. Operators accept losing pending work on restart."),
            "uploads.py": "import sqlite3\n\n# 上传确认前提交事务；重启后仍可从磁盘取回任务，连接由本次调用管理。\ndef accept(path, job):\n    with sqlite3.connect(path) as connection:\n        connection.execute('CREATE TABLE IF NOT EXISTS uploads (job TEXT NOT NULL)')\n        connection.execute('INSERT INTO uploads VALUES (?)', (job,))\n",
            "telemetry.mjs": "export const samples = [];\n",
        },
        mutable: [QUEUE_NOTE], checks: [],
        review: ["The old Problem prominently marks only uploads as superseded; telemetry and the original rationale remain readable.", "Both records link to each other, and the new decision covers restart durability and storage costs."],
    },
    {
        id: "board-generation", action: "board",
        request: "Generate board.html for browsing this project's notes locally, and demo.html as a standalone board containing the current notes. Use the title 'Fixture Decisions'.",
        files: { [TIMEOUT_NOTE]: timeoutNote },
        mutable: [], checks: [],
        review: ["Both board modes work from a host without package.json, using the installed skill's scripts."],
    },
];
