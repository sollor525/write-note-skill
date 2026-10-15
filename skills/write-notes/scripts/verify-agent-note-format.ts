/** 验证活跃笔记的头部、首节、必需小节及禁止标题；失败以非零退出，不修改文件。
 * 正文规则由 note-sections.ts 的 validateNoteContent 提供，归档命令共用同一份实现。 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { agentNoteRoot, walkAgentNoteTree } from "./agent-note-tree.ts";
import { validateNoteContent } from "./note-sections.ts";

const { notes, errors } = walkAgentNoteTree();

if (notes.length === 0) {
    console.error(`format: no Agent Notes found under ${agentNoteRoot} — nothing was verified.`);
    console.error("format: run from the host project root, or point AGENT_NOTE_ROOT at the notes directory.");
    process.exit(1);
}

for (const note of notes) {
    const rawText = readFileSync(resolve(agentNoteRoot, note.rel), "utf8");
    for (const issue of validateNoteContent({ raw: rawText, lifecycle: note.lifecycle, date: note.date })) {
        errors.push(`format: ${note.rel} — ${issue.message}`);
    }
}

if (errors.length) {
    for (const e of errors) console.error(e);
    process.exit(1);
}

console.log(`ok: ${notes.length} note(s) verified`);
