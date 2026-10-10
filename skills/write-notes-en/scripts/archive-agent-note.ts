/** 归档 implemented 笔记；先检查输入，再一起写入快照、封印和可选的后继链接。 */
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { AGENT_NOTE_CLASSES, agentNoteRoot, walkAgentNoteTree } from "./agent-note-tree.ts";
import { NOTE_PARSER, statusGrammarFor } from "./note-sections.ts";
import { prepareNewSeal, sha256 } from "./seal-store.ts";
import { commitFileUpdates } from "./file-updates.ts";

/** 判断主导换行符；新增行沿用现有风格，原始归档正文不重写。 */
const eolOf = (text: string) => ((text.match(/\r\n/g)?.length ?? 0) > (text.match(/(?<!\r)\n/g)?.length ?? 0) ? "\r\n" : "\n");

/** 判断相对链接是否指向目标；代码示例由共享解析器排除。 */
function linksTo(raw: string, fromPath: string, targetPath: string): boolean {
    return NOTE_PARSER.links(raw).some((target: string) => {
        if (/^(?:https?:|mailto:|#)/.test(target)) return false;
        const file = target.split("#")[0];
        return Boolean(file) && resolve(dirname(fromPath), file) === targetPath;
    });
}

/**
 * 校验参数与现有状态，准备全部内容后批量提交；失败抛出带原因的错误。
 * --strict 在存在入站链接时不写文件；普通 I/O 失败由批量更新函数恢复。
 */
function main(): void {
    const args = process.argv.slice(2);
    let targetArg: string | undefined;
    let successorArg: string | undefined;
    let strict = false;
    for (let index = 0; index < args.length; index++) {
        const arg = args[index]!;
        if (arg === "--strict") strict = true;
        else if (arg === "--superseded-by") {
            successorArg = args[++index];
            if (!successorArg || successorArg.startsWith("--")) throw new Error("--superseded-by requires a note path");
        } else if (arg.startsWith("--") || targetArg) throw new Error(`Unexpected argument: ${arg}`);
        else targetArg = arg;
    }
    if (!targetArg) throw new Error("Usage: archive-agent-note.ts <path> [--superseded-by <new-note>] [--strict]");

    const targetPath = resolve(targetArg);
    const rel = relative(agentNoteRoot, targetPath).replace(/\\/g, "/");
    const parts = rel.split("/");
    if (parts.length !== 3 || parts[0] !== "implemented" || !(AGENT_NOTE_CLASSES as readonly string[]).includes(parts[1]!)) {
        throw new Error(`Only implemented/<class>/ notes can be archived (got: ${rel})`);
    }
    const filename = parts[2]!;
    if (!/^\d{4}-\d{2}-\d{2}-.+\.md$/.test(filename)) throw new Error(`Invalid note filename: ${filename}`);
    const raw = readFileSync(targetPath, "utf8");
    const { lines } = NOTE_PARSER.mask(raw);
    if (!/^# Agent Note[:：] ?\S/.test(lines[0] ?? "") || lines[1] !== "" || !statusGrammarFor("implemented")!.test(lines[2] ?? "") || lines[3] !== "") {
        throw new Error("Source note must have a valid implemented header; run verify-agent-note-format before archiving");
    }

    const archiveDir = join(agentNoteRoot, "archived");
    const key = `archived/${parts[1]}/${filename}`;
    const archivedPath = join(agentNoteRoot, key);
    if (existsSync(archivedPath)) throw new Error(`Refusing to overwrite existing archived note: ${archivedPath}`);

    // 只在固定头部位置插入一行，正文中的 Archived 示例不会影响标记。
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const headLength = /^(?:[^\r\n]*(?:\r\n|\n|\r)){3}/.exec(raw)![0].length;
    const archived = `${raw.slice(0, headLength)}Archived: ${today}${eolOf(raw)}${raw.slice(headLength)}`;
    const updates = new Map<string, string | Buffer | null>([[archivedPath, archived]]);
    for (const entry of prepareNewSeal(archiveDir, key, `sha256:${sha256(archived)}`)) updates.set(...entry);

    if (successorArg) {
        const successorPath = resolve(successorArg);
        const successorRel = relative(agentNoteRoot, successorPath).replace(/\\/g, "/");
        const successorParts = successorRel.split("/");
        if (successorPath === targetPath || successorParts.length !== 3 || !["proposed", "implemented", "rejected"].includes(successorParts[0]!) || !(AGENT_NOTE_CLASSES as readonly string[]).includes(successorParts[1]!)) {
            throw new Error(`--superseded-by requires a different active note (got: ${successorRel})`);
        }
        const successor = readFileSync(successorPath, "utf8");
        if (!linksTo(successor, successorPath, archivedPath)) {
            const oldTitle = lines[0].replace(/^# Agent Note[:：] ?/, "").trim() || basename(filename, ".md");
            const label = /[\u4e00-\u9fff]/.test(oldTitle) ? "历史快照：" : "Historical snapshot: ";
            const link = relative(dirname(successorPath), archivedPath).replace(/\\/g, "/");
            const successorLines = successor.split(/\r\n|\r|\n/);
            const sections = NOTE_PARSER.sections(successor);
            let insertAt = sections.at(-1)?.start ?? successorLines.length;
            while (insertAt > 0 && successorLines[insertAt - 1]!.trim() === "") insertAt--;
            successorLines.splice(insertAt, 0, "", `[${label}${oldTitle}](${link})`);
            updates.set(successorPath, successorLines.join(eolOf(successor)));
        }
    }

    const inbound: string[] = [];
    for (const note of walkAgentNoteTree().notes) {
        const path = resolve(agentNoteRoot, note.rel);
        if (path !== targetPath && linksTo(readFileSync(path, "utf8"), path, targetPath)) inbound.push(note.rel);
    }
    if (strict && inbound.length) throw new Error(`--strict: inbound links remain; no files changed:\n${inbound.join("\n")}`);

    // 源文件最后删除；快照、两份封印和后继笔记任何一步失败都恢复原字节。
    updates.set(targetPath, null);
    commitFileUpdates(updates);
    console.log(`Moved: ${rel} -> ${key}`);
    console.log(`Sealed: ${key}`);
    if (inbound.length) console.log(`Update inbound links now:\n${inbound.join("\n")}`);
    else console.log("No active notes link to this archived note.");
}

try {
    main();
} catch (error) {
    console.error("Archive failed:", error);
    process.exitCode = 1;
}
