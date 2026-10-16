#!/usr/bin/env node
// 联网模型评测与离线门禁分开运行；每次调用使用独立临时仓库，报告保留供人工复核。
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cases, ROOT } from "../evals/note-behavior/cases.mjs";
import { grade, snapshot } from "../evals/note-behavior/grade.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 解析有限选项；未知参数、未知场景或非法时限直接失败，不静默回退。 */
function options(argv) {
    // edition：技能语言；timeout：单次模型调用秒数；selected：所选场景；prepare：只准备。
    // 可选 model 为显式模型名，output 为尚不存在的报告目录，二者不改变宿主文件契约。
    const result = { edition: "en", timeout: 300, selected: cases, prepare: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--help") {
            console.log("Usage: npm run eval-notes -- [--case id[,id]] [--edition en|zh] [--model name] [--timeout seconds] [--output new-directory] [--prepare]\nWithout --prepare this calls Codex and consumes model usage. Reports include file checks and separate, pending human review items.");
            console.log(`Cases: ${cases.map((item) => item.id).join(", ")}`);
            process.exit(0);
        }
        if (arg === "--prepare") { result.prepare = true; continue; }
        if (!["--case", "--edition", "--model", "--timeout", "--output"].includes(arg) || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Invalid option: ${arg}`);
        const value = argv[++i];
        if (arg === "--case") {
            const ids = value.split(",");
            if (ids.some((id) => !cases.some((item) => item.id === id))) throw new Error(`Unknown case: ${value}`);
            result.selected = cases.filter((item) => ids.includes(item.id));
        } else if (arg === "--timeout") {
            result.timeout = Number(value);
            if (!Number.isInteger(result.timeout) || result.timeout < 10 || result.timeout > 1800) throw new Error("Timeout must be 10–1800 seconds");
        } else {
            result[arg.slice(2)] = value;
        }
    }
    if (!["en", "zh"].includes(result.edition)) throw new Error("Edition must be en or zh");
    return result;
}

/** 执行短命令并保留退出码；启动失败抛错，普通检查失败由调用方分类。 */
function run(command, args, cwd, env = process.env) {
    const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    if (result.error) throw result.error;
    return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** 为夹具建立独立 Git 基线；禁用签名与提交钩子，不继承维护仓库的历史。 */
function git(host, ...args) {
    const result = run("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=Note Eval", "-c", "user.email=notes@example.invalid", ...args], host);
    if (result.exitCode !== 0) throw new Error(`git ${args[0]}: ${result.stderr}`);
    return result.stdout;
}

/** 写入本次夹具文件；调用方只传固定的相对路径，不读模型生成的目标路径。 */
function put(root, path, text) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
}

/** 只记录模型相关的顶层配置提示；不保存鉴权、端点、环境变量或完整配置。 */
function modelHints() {
    const path = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "config.toml");
    if (!existsSync(path)) return {};
    const top = readFileSync(path, "utf8").split(/^\s*\[/m)[0];
    return Object.fromEntries([...top.matchAll(/^(model|model_reasoning_effort|model_provider)\s*=\s*"([^"\n]+)"/gm)].map((match) => [match[1], match[2]]));
}

/** 对完整技能快照求摘要，确保报告能对应实际被测入口、参考文件与脚本。 */
function digestSkill(skill) {
    const files = snapshot(skill).files;
    const hash = createHash("sha256");
    for (const path of Object.keys(files).sort()) hash.update(path).update("\0").update(files[path]).update("\0");
    return hash.digest("hex");
}

/** 调用真实 Codex；超时终止其进程组，日志写在宿主外，不向模型暴露评分规则。 */
async function invoke(host, prompt, artifact, settings) {
    const stdout = openSync(join(artifact, "events.jsonl"), "w");
    const stderr = openSync(join(artifact, "stderr.log"), "w");
    const args = ["exec", "--ephemeral", "--json", "--sandbox", "workspace-write", "-C", host,
        "--add-dir", join(host, ".agents"), "--output-last-message", join(artifact, "response.md")];
    if (settings.model) args.push("--model", settings.model);
    args.push("-");
    try {
        return await new Promise((resolveResult) => {
            // 清除父进程的笔记根与封印基线，保证被测记录属于当前夹具。
            const env = { ...process.env };
            delete env.AGENT_NOTE_ROOT;
            delete env.AGENT_NOTE_ARCHIVE_BASE_REF;
            const child = spawn("codex", args, { cwd: host, env, stdio: ["pipe", stdout, stderr], detached: process.platform !== "win32" });
            let timedOut = false;
            let launchError = null;
            /** 只终止本次调用的进程；已退出视为成功清理，其他错误保留到报告。 */
            function stop(signal) {
                try {
                    if (process.platform === "win32") child.kill(signal);
                    else if (child.pid) process.kill(-child.pid, signal);
                } catch (error) {
                    if (error.code !== "ESRCH") launchError = error.message;
                }
            }
            /** 用户中断时同时停止模型进程组；按未完成调用报告，不留下后台任务。 */
            function interrupt() {
                launchError = "Evaluation interrupted";
                stop("SIGKILL");
            }
            process.once("SIGINT", interrupt);
            process.once("SIGTERM", interrupt);
            const timer = setTimeout(() => {
                timedOut = true;
                // 超时的临时任务直接终止整个进程组，避免残留子进程继续改夹具。
                stop("SIGKILL");
            }, settings.timeout * 1000);
            child.on("error", (error) => { launchError = error.message; });
            child.stdin.on("error", (error) => { launchError = `stdin: ${error.message}`; });
            child.on("close", (exitCode, signal) => {
                clearTimeout(timer);
                process.removeListener("SIGINT", interrupt);
                process.removeListener("SIGTERM", interrupt);
                resolveResult({ exitCode, signal, timedOut, launchError });
            });
            child.stdin.end(prompt);
        });
    } finally {
        closeSync(stdout);
        closeSync(stderr);
    }
}

/** 提取完成事件与用量；无完成事件、错误或退出失败均不能算作行为通过。 */
function eventsAt(path) {
    const events = readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const completed = events.filter((event) => event.type === "turn.completed");
    return {
        completed: completed.length > 0,
        usage: completed.at(-1)?.usage || null,
        errors: events.filter((event) => ["error", "turn.failed"].includes(event.type)),
    };
}

/** 顺序执行所选场景；基础设施失败即停止，失败和未执行的场景不计通过。 */
async function main() {
    const settings = options(process.argv.slice(2));
    const skillName = settings.edition === "en" ? "write-notes-en" : "write-notes";
    const skill = join(REPO, "skills", skillName);
    const output = settings.output ? resolve(settings.output) : mkdtempSync(join(tmpdir(), "write-notes-eval-"));
    // 解析父目录链接，防止表面位于 /tmp 的路径实际落回维护仓库。
    const rel = relative(realpathSync(REPO), join(realpathSync(dirname(output)), basename(output)));
    if (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) throw new Error("Evaluation output must be outside this repository");
    if (settings.output) mkdirSync(output);
    const cli = settings.prepare ? null : run("codex", ["--version"], REPO);
    if (cli && cli.exitCode !== 0) throw new Error(cli.stderr);
    // 报告只含可公开的配置提示，服务端最终配置可能不同；不读取密钥。
    // startedAt/finishedAt：UTC 时间；edition/skillSha256：被测语言与完整内容摘要。
    // cliVersion/requestedModel/configurationHints：版本、显式模型与本机配置提示。
    // timeoutSeconds：每例上限；preparedOnly：未调用模型；cases/notRun：已处理和未执行场景。
    const report = {
        startedAt: new Date().toISOString(), edition: settings.edition, skillSha256: digestSkill(skill),
        cliVersion: cli?.stdout.trim() || null, requestedModel: settings.model || null, configurationHints: modelHints(),
        timeoutSeconds: settings.timeout, preparedOnly: settings.prepare, cases: [],
    };
    const reportPath = join(output, "report.json");
    /** 每例完成即持久化报告；被中断时仍能区分已执行和未执行的场景。 */
    function save() {
        report.notRun = settings.selected.filter((testCase) => !report.cases.some((item) => item.id === testCase.id)).map((item) => item.id);
        writeFileSync(reportPath, `${JSON.stringify(report, null, 4)}\n`);
    }
    console.log(`Artifacts: ${output}`);
    save();
    for (const testCase of settings.selected) {
        const artifact = join(output, testCase.id);
        const host = join(artifact, "host");
        mkdirSync(host, { recursive: true });
        const loadedSkill = join(host, ".agents/skills", skillName);
        cpSync(skill, loadedSkill, { recursive: true });
        for (const [path, content] of Object.entries(testCase.files)) put(host, path, content);
        if (!existsSync(join(host, "AGENTS.md"))) put(host, "AGENTS.md", "# Contributor guide\n\nUse Node.js 24 for .mjs files and installed TypeScript utilities. No package manager is needed. Keep handwritten code comments in Chinese and use four spaces. Decision records are in English.\n");
        git(host, "init", "--quiet");
        git(host, "add", ".");
        git(host, "commit", "--quiet", "-m", "Prepare behavior fixture");
        const before = snapshot(host);
        const prompt = `Use $${skillName} from ${loadedSkill}/SKILL.md for this task. Read that local snapshot, not another installed copy. Work only in this project; do not inspect parent directories, use the network, invoke other agents, commit or push. Implement the requested work and report what you verified.\n\n${testCase.request}\n`;
        put(artifact, "prompt.txt", prompt);
        // id/expectedAction 仅供报告；status 区分执行阶段，humanReview/review 保留人工评审状态与问题。
        // 执行后追加调用结果 invocation、秒数 elapsedSeconds、事件 events、文件断言 fileChecks、
        // 独立检查 checks；失败原因存 failure。自动通过不改变 humanReview。
        const entry = { id: testCase.id, expectedAction: testCase.action, status: "prepared", humanReview: "pending", review: testCase.review };
        report.cases.push(entry);
        save();
        if (settings.prepare) continue;
        console.log(`Running ${testCase.id} ...`);
        entry.status = "running";
        save();
        try {
            const started = Date.now();
            entry.invocation = await invoke(host, prompt, artifact, settings);
            entry.elapsedSeconds = Math.round((Date.now() - started) / 1000);
            entry.events = eventsAt(join(artifact, "events.jsonl"));
            const after = snapshot(host);
            entry.fileChecks = grade(testCase, before, after);
            // intent-to-add 仅用于纳入新文件的补丁；不创建模型输出提交。
            git(host, "add", "--intent-to-add", ".");
            put(artifact, "changes.diff", git(host, "diff", "--no-ext-diff", "HEAD", "--", "."));
            if (entry.invocation.exitCode !== 0 || entry.invocation.timedOut || entry.invocation.launchError || !entry.events.completed || entry.events.errors.length) {
                entry.status = "infrastructure-error";
                save();
                console.error(`${testCase.id}: infrastructure error; remaining cases not run. See ${artifact}`);
                process.exitCode = 2;
                break;
            }
            const env = { ...process.env, AGENT_NOTE_ROOT: join(host, ROOT), AGENT_NOTE_ARCHIVE_BASE_REF: "" };
            entry.checks = testCase.checks.map((code) => run(process.execPath, ["--input-type=module", "--eval", code], host, env));
            if (!["none", "adr"].includes(testCase.action)) {
                for (const script of ["verify-agent-note-tree.ts", "verify-agent-note-format.ts", "verify-archived-agent-notes.ts"]) {
                    entry.checks.push({ script, ...run(process.execPath, [join(skill, "scripts", script)], host, env) });
                }
            }
            entry.status = entry.fileChecks.passed && entry.checks.every((check) => check.exitCode === 0) ? "automated-pass" : "behavior-fail";
            console.log(`${testCase.id}: ${entry.status} (${entry.elapsedSeconds}s); semantic review pending`);
            save();
        } catch (error) {
            entry.status = "infrastructure-error";
            entry.failure = error.message;
            save();
            console.error(`${testCase.id}: ${error.message}; remaining cases not run. See ${artifact}`);
            process.exitCode = 2;
            break;
        }
    }
    report.finishedAt = new Date().toISOString();
    save();
    console.log(`Report: ${reportPath}`);
    if (!process.exitCode && report.cases.some((entry) => entry.status === "behavior-fail")) process.exitCode = 1;
}

main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 2;
});
