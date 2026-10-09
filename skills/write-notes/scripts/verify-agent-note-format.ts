/**
 * Enforce Agent Note headers, lifecycle-specific sections, alternatives.
 * Implemented notes may not carry proposal-era H2s; present tense in the
 * body is a prose rule, not a lexical scan.
 *
 * Aliases come from note-sections.ts so the gate and the docs cannot drift.
 *
 * Run: npx tsx <skill-dir>/scripts/verify-agent-note-format.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { agentNoteRoot, walkAgentNoteTree } from "./agent-note-tree.ts";
import {
  FORMAT_ADOPTED,
  GRANDFATHER_COMMENT,
  PROBLEM_FIRST,
  PROPOSAL_ERA_HEADINGS,
  REQUIRED_SECTIONS,
  isAlternativesName,
  isStatusShaped,
  statusGrammarFor,
} from "./note-sections.ts";

const BANNED_IMPLEMENTED = new Set(PROPOSAL_ERA_HEADINGS.map((h) => `## ${h}`.toLowerCase()));

/** `## Decision（说明）` → `Decision`; the `## ` prefix and any parenthetical are dropped. */
function headingBase(h: string): string {
  return h.replace(/^##\s+/, "").replace(/[（(].*$/, "").trimEnd();
}

interface MaskedSource {
  lines: string[];
  /** line indexes inside fenced code blocks */
  fenced: boolean[];
  /** line indexes inside HTML comments */
  commented: boolean[];
}

/** Normalize BOM/CRLF, then mask fenced code and HTML comment regions. */
function maskSource(raw: string): MaskedSource {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const fenced = new Array<boolean>(lines.length).fill(false);
  const commented = new Array<boolean>(lines.length).fill(false);
  let inFence = false;
  let inComment = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    fenced[i] = inFence;
    commented[i] = inComment;
    // A fence opens/closes only on its own line (≤3 leading spaces); fence
    // mentions inside inline code or prose never toggle state.
    if (!inComment && /^\s{0,3}```/.test(l)) {
      fenced[i] = true;
      inFence = !inFence;
    } else if (inFence) {
      fenced[i] = true;
    }
    // Fence interiors are opaque: a `<!--` in a HTML/JSX sample must not
    // leak the comment mask past the closing fence.
    if (inFence) continue;
    const openIdx = inComment ? -1 : l.indexOf("<!--");
    const closeIdx = l.indexOf("-->");
    if (inComment) {
      commented[i] = true;
      if (closeIdx !== -1) inComment = false;
    } else if (openIdx !== -1) {
      commented[i] = true;
      if (closeIdx === -1 || closeIdx < openIdx) inComment = true;
    }
  }
  return { lines, fenced, commented };
}

function isProseLine(src: MaskedSource, i: number): boolean {
  if (src.fenced[i] || src.commented[i]) return false;
  return !/^\s*>/.test(src.lines[i]);
}

const { notes, errors } = walkAgentNoteTree();

if (notes.length === 0) {
  console.error(`format: no Agent Notes found under ${agentNoteRoot} — nothing was verified.`);
  console.error("format: run from the host project root, or point AGENT_NOTE_ROOT at the notes directory.");
  process.exit(1);
}

for (const note of notes) {
  const fail = (msg: string) => { errors.push(`format: ${note.rel} — ${msg}`); };
  const src = maskSource(readFileSync(resolve(agentNoteRoot, note.rel), "utf8"));
  const { lines } = src;
  const proseIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) if (isProseLine(src, i)) proseIdx.push(i);
  const prose = proseIdx.map((i) => lines[i]);

  // Halfwidth or fullwidth colon (IME often inserts ：)
  if (!/^# Agent Note[:：] ?\S/.test(lines[0] ?? "")) fail("line 1 must be `# Agent Note: <title>`");
  if (lines[1] !== "") fail("line 2 must be blank");

  const re = statusGrammarFor(note.lifecycle);
  if (re && !re.test(lines[2] ?? "")) fail(`line 3 must match ${note.lifecycle} status grammar (${String(re)})`);
  if (lines[3] !== "") fail("line 4 must be blank");

  // Exactly one Status line. Fences, quotes and comments are immune, and only
  // status-shaped lines count, so body prose like "Status: 200 means OK" is not
  // miscounted. A malformed line 3 is already reported by the grammar check
  // above, so a zero count here is not itself an error.
  const statusCount = prose.filter(isStatusShaped).length;
  if (statusCount > 1) fail(`Status: line must appear exactly once (found ${statusCount})`);

  const h2s = prose.filter((l: string) => l.startsWith("## ")).map((l: string) => l.trimEnd());
  // `bases` are bare section names, so they compare directly against the alias
  // lists. Comparing raw headings against bare names is how the documented
  // Chinese first section (`## 问题`) used to be impossible to pass.
  const bases = h2s.map(headingBase);
  if (!PROBLEM_FIRST.some((h: string) => bases.includes(h))) {
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
  const rawText = readFileSync(resolve(agentNoteRoot, note.rel), "utf8");
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
