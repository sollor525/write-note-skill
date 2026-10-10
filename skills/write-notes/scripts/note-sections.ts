import { createNoteParser } from "./note-parser.mjs";

/** 中英文标题别名与状态语法的唯一来源；修改时同步格式文档和对应测试。 */

/** 二级标题的只读别名表；解析时使用半角 ## 前缀。 */
export const SECTIONS = {
    /** 问题与动机的可接受标题，数组只读。 */
    problem: ['Problem', '问题'],
    /** 尚未实施的提案的可接受标题，数组只读。 */
    mandate: ['Proposal', '提议', '方案', '提案'],
    /** 当前已实现的决定的可接受标题，数组只读。 */
    decision: ['Decision', '决定', '决策'],
    /** 收益、代价与后果的可接受标题，数组只读。 */
    consequences: ['Consequences', '后果', '影响', '结果', '结果与代价', '影响与验证', '结果与影响'],
    /** 提案的验收标准的可接受标题，数组只读。 */
    acceptance: ['Acceptance criteria', '验收标准', '验收条件', '接受标准'],
    /** 提案风险的可接受标题，数组只读。 */
    risks: ['Risks', '风险'],
} as const;

/** 备选方案标题的全部合法名称，供校验器和看板共同使用。 */
export const ALTERNATIVES_NAMES = [
    'Alternatives considered',
    '替代方案',
    '已考虑的替代方案',
    '备选方案',
    '备选',
] as const;

/** 已实现笔记禁止残留的提案标题；正文中的普通词语不受限制。 */
export const PROPOSAL_ERA_HEADINGS = [
    ...SECTIONS.mandate,
    'Plan', '计划', '规划',
    'Migration plan', '迁移计划',
    ...SECTIONS.acceptance,
] as const;

export const PROBLEM_FIRST = SECTIONS.problem;

export const REQUIRED_SECTIONS: Record<string, readonly (readonly string[])[]> = {
    proposed: [SECTIONS.mandate, SECTIONS.acceptance, SECTIONS.risks],
    implemented: [SECTIONS.decision, SECTIONS.consequences],
    rejected: [SECTIONS.mandate],
};

/** 按生命周期匹配完整状态行；中文写法兼容全角冒号。 */
export const STATUS_GRAMMAR: Record<string, RegExp> = {
    proposed: /^Status: proposed$|^状态[:：] ?(?:proposed|已提议)$/,
    implemented: /^Status: implemented$|^状态[:：] ?(?:implemented|已实现)$/,
    rejected: /^Status: rejected — .+$|^状态[:：] ?(?:rejected|已否决) — .+$/,
};

/** 首次提出日在此日期及之后的笔记必须提供备选方案小节。 */
export const FORMAT_ADOPTED = '2026-07-05';

/** 仅旧格式采用日期之前的历史笔记允许使用此明确豁免标记。 */
export const GRANDFATHER_COMMENT =
    '<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->';

/** 判断去掉 ## 前缀后的标题是否为备选方案别名，不修改输入。 */
export function isAlternativesName(bareName: string): boolean {
    return (ALTERNATIVES_NAMES as readonly string[]).includes(bareName);
}

/** 返回指定生命周期的状态语法；未知状态返回 undefined。 */
export function statusGrammarFor(lifecycle: string): RegExp | undefined {
    return STATUS_GRAMMAR[lifecycle];
}

/** 判断正文行是否是合法状态行，用于检测重复状态；不修改输入。 */
export function isStatusShaped(line: string): boolean {
    const t = line.trim();
    return Object.values(STATUS_GRAMMAR).some((re) => re.test(t));
}

/** 两种看板模式和命令行共用的解析器，词汇表只从本模块提供。 */
export const NOTE_PARSER = createNoteParser({ sections: SECTIONS, alternatives: ALTERNATIVES_NAMES });

/** 返回可内嵌到单文件看板的解析器代码；无需浏览器加载外部模块。 */
export function browserParserSource(): string {
    return `const NOTE_PARSER = (${createNoteParser.toString()})(${JSON.stringify({ sections: SECTIONS, alternatives: ALTERNATIVES_NAMES })});`;
}
