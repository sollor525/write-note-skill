/** 验证活跃笔记的头部、首节、必需小节及禁止标题；失败以非零退出，不修改文件。 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { agentNoteRoot, walkAgentNoteTree } from "./agent-note-tree.ts";
import {
    FORMAT_ADOPTED,
    NOTE_PARSER,
    GRANDFATHER_COMMENT,
    PROBLEM_FIRST,
    PROPOSAL_ERA_HEADINGS,
    REQUIRED_SECTIONS,
    isAlternativesName,
    isStatusShaped,
    statusGrammarFor,
} from "./note-sections.ts";

const BANNED_IMPLEMENTED = new Set(PROPOSAL_ERA_HEADINGS.map((h) => `## ${h}`.toLowerCase()));

const { notes, errors } = walkAgentNoteTree();

if (notes.length === 0) {
    console.error(`format: no Agent Notes found under ${agentNoteRoot} — nothing was verified.`);
    console.error("format: run from the host project root, or point AGENT_NOTE_ROOT at the notes directory.");
    process.exit(1);
}

for (const note of notes) {
    const fail = (msg: string) => { errors.push(`format: ${note.rel} — ${msg}`); };
    const rawText = readFileSync(resolve(agentNoteRoot, note.rel), "utf8");
    const { lines, visible: prose } = NOTE_PARSER.mask(rawText);

    // 标题兼容半角与全角冒号。
    if (!/^# Agent Note[:：] ?\S/.test(lines[0] ?? "")) fail("line 1 must be `# Agent Note: <title>`");
    if (lines[1] !== "") fail("line 2 must be blank");

    const re = statusGrammarFor(note.lifecycle);
    if (re && !re.test(lines[2] ?? "")) fail(`line 3 must match ${note.lifecycle} status grammar (${String(re)})`);
    if (lines[3] !== "") fail("line 4 must be blank");

    // 仅统计真实正文中的合法状态行；代码、引用、注释不参与，非法头部另行报告。
    const statusCount = prose.filter(isStatusShaped).length;
    if (statusCount > 1) fail(`Status: line must appear exactly once (found ${statusCount})`);

    const h2s = prose.filter((l: string) => l.startsWith("## ")).map((l: string) => l.trimEnd());
    // 先去掉标题前缀和括号说明，再与共享别名比较，保证中文标题也能匹配。
    const bases = h2s.map(NOTE_PARSER.headingBase);
    if (!PROBLEM_FIRST.some((h: string) => bases[0] === h)) {
        fail(`first section must be one of ${JSON.stringify(PROBLEM_FIRST.map((h) => `## ${h}`))} (got ${JSON.stringify(h2s[0] ?? "<none>")})`);
    }

    for (const group of REQUIRED_SECTIONS[note.lifecycle] ?? []) {
        if (!group.some((h: string) => bases.includes(h))) {
            fail(`missing one of ${JSON.stringify(group.map((h) => `## ${h}`))}`);
        }
    }

    if (note.lifecycle === "implemented") {
        for (const h of bases.filter((x: string) => BANNED_IMPLEMENTED.has(`## ${x}`.toLowerCase()))) {
            fail(`banned in implemented: ## ${h}`);
        }
    }

    const hasSection = bases.some((h: string) => isAlternativesName(h));
    const hasGrandfather = rawText.includes(GRANDFATHER_COMMENT);
    if (hasSection && hasGrandfather) fail("carries both ## Alternatives considered and grandfather comment — drop the comment");
    if (!hasSection && !hasGrandfather) {
        fail("missing ## Alternatives considered / ## 备选方案");
    }
    if (hasGrandfather && note.date >= FORMAT_ADOPTED) fail(`grandfather comment only valid before ${FORMAT_ADOPTED}`);
}

if (errors.length) {
    for (const e of errors) console.error(e);
    process.exit(1);
}

console.log(`ok: ${notes.length} note(s) verified`);
