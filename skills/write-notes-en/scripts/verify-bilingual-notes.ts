/** 本仓库的双语笔记守卫：`<base>.md` 与 `<base>-en.md` 必须结构同步，只读运行。
 * 技能定义的 `.zh.md` 配对约定针对"变体"，不再加第二条语言规则；
 * 但本仓库自己用 `-en.md` 另存英文，这条约定需要机制兜底，否则两版会各自漂移。
 * 只比较二级标题序列、首次提出日与状态行，不比较正文语义。 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { agentNoteRoot } from "./agent-note-tree.ts";
import { NOTE_PARSER } from "./note-sections.ts";

const errors: string[] = [];

/** 递归收集笔记根目录下的 Markdown 相对路径；点目录同样纳入检查。 */
function listMd(dir: string, prefix: string): string[] {
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) out.push(...listMd(join(dir, entry.name), rel));
        else if (entry.isFile() && entry.name.endsWith(".md")) out.push(rel);
    }
    return out;
}

/** 二级标题序列，代码示例与注释由共享解析器屏蔽。 */
function headings(raw: string): string[] {
    return NOTE_PARSER.mask(raw).visible
        .filter((l: string) => l.startsWith("## "))
        .map((l: string) => l.trimEnd());
}

/** 文件名中的首次提出日；缺失时返回空串。 */
const dateOf = (name: string) => /^\d{4}-\d{2}-\d{2}/.exec(name)?.[0] ?? "";
/** 状态行；缺失时返回空串。 */
const statusOf = (raw: string) => NOTE_PARSER.mask(raw).visible.find((l: string) => /^(?:Status|状态)[:：]/.test(l.trim()))?.trim() ?? "";

const files = new Set(listMd(agentNoteRoot, "").filter((rel) => !rel.startsWith("archived/")));
let pairs = 0;

for (const rel of [...files].sort()) {
    if (!rel.endsWith("-en.md")) continue;
    const baseRel = `${rel.slice(0, -"-en.md".length)}.md`;
    if (!files.has(baseRel)) {
        errors.push(`pairing: ${rel} — English note has no base note ${baseRel}`);
        continue;
    }
    pairs++;
    const baseRaw = readFileSync(join(agentNoteRoot, baseRel), "utf8");
    const enRaw = readFileSync(join(agentNoteRoot, rel), "utf8");
    if (dateOf(rel.split("/").pop()!) !== dateOf(baseRel.split("/").pop()!)) {
        errors.push(`pairing: ${rel} — first-proposed date differs from ${baseRel}`);
    }
    if (statusOf(enRaw) !== statusOf(baseRaw)) {
        errors.push(`pairing: ${rel} — status line differs from ${baseRel} ("${statusOf(enRaw)}" vs "${statusOf(baseRaw)}")`);
    }
    const baseHeadings = headings(baseRaw);
    const enHeadings = headings(enRaw);
    if (baseHeadings.join("\n") !== enHeadings.join("\n")) {
        errors.push(`pairing: ${rel} — section skeleton differs from ${baseRel}\n  base: ${baseHeadings.join(" | ")}\n  en:   ${enHeadings.join(" | ")}`);
    }
}

if (errors.length) {
    for (const e of errors) console.error(e);
    process.exit(1);
}
console.log(`ok: ${pairs} bilingual note pair(s) in sync`);
