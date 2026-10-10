/** 检查目录结构及活跃笔记之间的相对链接；只读运行，任何错误均以非零退出。 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { agentNoteRoot, walkAgentNoteTree } from "./agent-note-tree.ts";
import { NOTE_PARSER } from "./note-sections.ts";

const { notes, errors } = walkAgentNoteTree();

// 共享解析器忽略代码示例，只检查实际引用。

for (const note of notes) {
    const noteFullPath = resolve(agentNoteRoot, note.rel);
    const content = readFileSync(noteFullPath, "utf8");
    for (const rawTarget of NOTE_PARSER.links(content)) {
        if (!rawTarget) continue;

        // 外链、页内锚点和明确示意用的省略号不参与文件存在性检查。
        if (rawTarget.startsWith("http://") || rawTarget.startsWith("https://") || rawTarget.startsWith("#") || rawTarget.startsWith("mailto:") || rawTarget.includes("…")) {
            continue;
        }

        // 先去掉页内锚点，再检查目标文件。
        const fileTarget = rawTarget.split("#")[0];
        if (!fileTarget) continue;

        const resolvedTarget = resolve(dirname(noteFullPath), fileTarget);

        // 只检查笔记根目录以内的路径，目录分隔符用于排除同前缀的相邻目录。
        if (!resolvedTarget.startsWith(agentNoteRoot + sep)) {
            continue;
        }

        if (!existsSync(resolvedTarget)) {
            errors.push(`link: ${note.rel} -> "${rawTarget}" target file does not exist`);
        }
    }
}

if (errors.length) {
    for (const e of errors) console.error(e);
    process.exit(1);
}

// 没有发现任何活跃笔记时拒绝报告成功，提示检查工作目录或根目录配置。
if (notes.length === 0) {
    console.error(`tree: no Agent Notes found under ${agentNoteRoot} — nothing was verified.`);
    console.error("tree: run from the host project root, or point AGENT_NOTE_ROOT at the notes directory.");
    process.exit(1);
}

console.log(`ok: ${notes.length} note(s) tree and relative links verified`);
