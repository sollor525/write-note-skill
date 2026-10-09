/**
 * Shared vocabulary for Agent Note sections.
 *
 * A single source of truth so the format gate and the human-facing docs cannot
 * drift apart: every section the gate accepts, and every heading it forbids in
 * an implemented note, is listed here — including the Chinese/English pairs.
 * Adding an alias without updating `references/note-format.md` is a bug, and so
 * is the reverse.
 */

/** Section heading aliases, halfwidth `## ` prefix. */
export const SECTIONS = {
  problem: ['Problem', '问题'],
  mandate: ['Proposal', '提议', '方案', '提案'],
  decision: ['Decision', '决定', '决策'],
  consequences: ['Consequences', '后果', '影响', '结果', '结果与代价', '影响与验证', '结果与影响'],
  acceptance: ['Acceptance criteria', '验收标准', '验收条件', '接受标准'],
  risks: ['Risks', '风险'],
} as const;

/** Section names that satisfy the `## Alternatives considered` requirement. */
export const ALTERNATIVES_NAMES = [
  'Alternatives considered',
  '替代方案',
  '已考虑的替代方案',
  '备选方案',
  '备选',
] as const;

/** Proposal-era headings that must not survive into an implemented note. */
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

/** Status line grammars, keyed by lifecycle. Fullwidth colon is accepted. */
export const STATUS_GRAMMAR: Record<string, RegExp> = {
  proposed: /^Status: proposed$|^状态[:：] ?(?:proposed|已提议)$/,
  implemented: /^Status: implemented$|^状态[:：] ?(?:implemented|已实现)$/,
  rejected: /^Status: rejected — .+$|^状态[:：] ?(?:rejected|已否决) — .+$/,
};

/**
 * After this date a new note must carry `## Alternatives considered`.
 * Earlier notes may instead carry `GRANDFATHER_COMMENT`.
 */
export const FORMAT_ADOPTED = '2026-07-05';

/** Escape hatch for pre-format notes, only valid before FORMAT_ADOPTED. */
export const GRANDFATHER_COMMENT =
  '<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->';

/**
 * Tests a *bare* section name (no `## ` prefix) against the alternatives
 * vocabulary. Matching bare names keeps this consistent with how every other
 * section is compared.
 */
export function isAlternativesName(bareName: string): boolean {
  return (ALTERNATIVES_NAMES as readonly string[]).includes(bareName);
}

/**
 * Index of the note's status line, matching the same grammar the format gate
 * accepts (English or Chinese, halfwidth or fullwidth colon).
 *
 * The archive tool used to test `line === "Status: implemented"` literally. A
 * note written with the Chinese form passed the format gate but could never be
 * archived — the gate and the archiver disagreed about what a valid note is.
 */
export function statusIndexOf(lines: readonly string[], lifecycle: string): number {
  const grammar = statusGrammarFor(lifecycle);
  if (!grammar) return -1;
  return lines.findIndex((line) => grammar.test(line.trimEnd()));
}

export function statusGrammarFor(lifecycle: string): RegExp | undefined {
  return STATUS_GRAMMAR[lifecycle];
}

export function isStatusShaped(line: string): boolean {
  const t = line.trim();
  return Object.values(STATUS_GRAMMAR).some((re) => re.test(t));
}
