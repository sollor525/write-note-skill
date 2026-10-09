#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALTERNATIVES_NAMES, SECTIONS } from './note-sections.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const templatePath = resolve(__dirname, '../assets/agent-notes-board.html');
const args = process.argv.slice(2);

if (!existsSync(templatePath)) {
  console.error(`❌ Template not found at: ${templatePath}`);
  process.exit(1);
}

// Parse arguments
const isInitMode = args.includes('--init');
const isForce = args.includes('--force') || args.includes('-f');
const isMetadataOnly = args.includes('--metadata-only');
const cleanArgs = args.filter((a: string) => !a.startsWith('--') && !a.startsWith('-'));

function checkTargetSafety(targetPath: string) {
  if (existsSync(targetPath) && !isForce) {
    try {
      const existing = readFileSync(targetPath, 'utf8');
      const isBoard = existing.includes('generator" content="agent-notes-board"') || existing.includes('id="brand-project-title"');
      if (!isBoard) {
        console.error(`❌ Refusing to overwrite: ${targetPath} already exists and is not a generated board.`);
        console.error(`💡 To avoid clobbering an existing project page (e.g. a Vite/React/Vue index.html), pass a different output path, or --force to overwrite.`);
        process.exit(1);
      }
    } catch {}
  }
}

const TITLE_SENTINEL = 'id="brand-project-title">工程决策看板<';
const DATA_SENTINEL = 'window.__INLINE_DATA__ = null;';

/** Replace a template sentinel, failing loudly instead of silently doing nothing. */
function inject(template: string, sentinel: string, replacement: string, what: string): string {
  if (!template.includes(sentinel)) {
    console.error(`❌ Template is missing the ${what} sentinel (${JSON.stringify(sentinel)}).`);
    console.error(`   ${templatePath} no longer matches what this script expects; refusing to emit a board that silently ignores it.`);
    process.exit(1);
  }
  return template.replace(sentinel, () => replacement);
}

if (isInitMode) {
  const targetPath = cleanArgs[0] ? resolve(cleanArgs[0]) : resolve(process.cwd(), 'board.html');
  const projectName = cleanArgs[1] || 'Decision Board';

  checkTargetSafety(targetPath);

  let template = readFileSync(templatePath, 'utf8');
  template = inject(template, TITLE_SENTINEL, `id="brand-project-title">${projectName}<`, 'project title');

  writeFileSync(targetPath, template, 'utf8');
  console.log(`✅ [daily mode] Lightweight board written (only ~69KB): ${targetPath}`);
  console.log(`💡 Open it in a browser and click "connect local directory" (top right) to pick .agents/notes; new or edited notes hot-reload when you switch back to the tab.`);
  process.exit(0);
}

// Bundle mode: one self-contained file with all note data inlined (e.g. demo.html)
const notesDir = cleanArgs[0] ? resolve(cleanArgs[0]) : resolve(process.cwd(), '.agents/notes');
const outputPath = cleanArgs[1] ? resolve(cleanArgs[1]) : resolve(process.cwd(), 'demo.html');
const projectName = cleanArgs[2] || 'Decision Board';

checkTargetSafety(outputPath);

const LIFECYCLES = ['implemented', 'proposed', 'rejected', 'archived'];

if (!existsSync(notesDir)) {
  console.error(`❌ Notes directory not found at: ${notesDir}`);
  process.exit(1);
}

/** Blank out fenced code-block lines so `## ` headings and [](.md) links inside them are never parsed as note structure. */
function stripFencedBlocks(raw: string): string {
  let inFence = false;
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => {
      if (/^\s{0,3}```/.test(l)) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : l;
    })
    .join("\n");
}

function parseNoteContent(raw: string, relPath: string, slugToId: Map<string, string>) {
  const parseable = stripFencedBlocks(raw);
  const slug = relPath.split('/').pop()!.replace(/\.md$/, '');
  const parts = relPath.split('/');
  const lifecycle = parts[0];
  const cls = parts[1] || 'architecture';

  let title = slug;
  let status = lifecycle;
  let date = '';

  const dMatch = /^(\d{4}-\d{2}-\d{2})/.exec(slug);
  if (dMatch) date = dMatch[1];

  const h1Match = /^# Agent Note[^:：]*[:：]\s*(.*)$/m.exec(parseable);
  if (h1Match) title = h1Match[1].trim();

  /**
   * Extract a whole section: everything from the heading to the next `## `
   * heading (or end of note).
   *
   * The lookahead must NOT include an empty-line alternative. `\s*$` under the
   * `m` flag matches at every line end, so the old pattern stopped at the first
   * blank line — every multi-paragraph section was silently truncated to its
   * opening paragraph, which is usually the paragraph carrying the actual
   * reasoning.
   */
  function extractSection(names: readonly string[]): string {
    const alternatives = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const re = new RegExp(`^## (?:${alternatives})[（(]?[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm');
    const m = re.exec(parseable);
    return m ? m[1]!.trim() : '';
  }

  // Section names come from the shared registry, so the board can never drift
  // from the format gate. It used to keep its own list, which had already
  // diverged ("曾考虑的替代方案" vs the gate's "已考虑的替代方案") and was missing
  // three aliases outright — notes the gate accepted rendered as empty on the board.
  const problem = extractSection([...SECTIONS.problem]);
  const decision = extractSection([...SECTIONS.decision, ...SECTIONS.mandate]);
  const alternatives = extractSection([...ALTERNATIVES_NAMES]);
  const consequences = extractSection([...SECTIONS.consequences]);

  const links: string[] = [];
  for (const m of parseable.matchAll(/\]\(([^)]+\.md)\)/g)) {
    let targetHref = m[1].split('#')[0].trim();
    if (targetHref.includes('://')) continue;
    targetHref = targetHref.replace(/\.zh\.md$/, '.md');
    const segs = `${lifecycle}/${cls}/${targetHref}`.split('/');
    const resolved: string[] = [];
    for (const s of segs) {
      if (!s || s === '.') continue;
      if (s === '..') resolved.pop();
      else resolved.push(s);
    }
    const cleanTarget = resolved.join('/');

    let finalTarget = '';
    if (slugToId.has(cleanTarget)) {
      finalTarget = slugToId.get(cleanTarget)!;
    } else {
      const targetSlug = targetHref.split('/').pop()!.replace(/\.md$/, '');
      if (slugToId.has(targetSlug)) {
        finalTarget = slugToId.get(targetSlug)!;
      }
    }
    if (finalTarget && finalTarget !== relPath) {
      links.push(finalTarget);
    }
  }

  return {
    id: relPath,
    slug,
    lifecycle,
    cls,
    date,
    title,
    status,
    problem,
    decision,
    alternatives,
    consequences,
    outLinks: [...new Set(links)],
    rawBody: raw,
  };
}

function walk(dir: string, baseDir: string = dir): any[] {
  const noteFiles = new Map<string, string>(); // relPath -> fullPath

  function scan(currentDir: string) {
    const items = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of items) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const isZh = entry.name.endsWith('.zh.md');
        const relPath = relative(baseDir, fullPath).replace(/\\/g, '/');
        const cleanRel = isZh ? relPath.replace(/\.zh\.md$/, '.md') : relPath;
        const parts = cleanRel.split('/');

        if (parts.length >= 3 && LIFECYCLES.includes(parts[0])) {
          if (!noteFiles.has(cleanRel) || isZh) {
            noteFiles.set(cleanRel, fullPath);
          }
        }
      }
    }
  }

  scan(dir);

  const slugToId = new Map<string, string>();
  for (const relPath of noteFiles.keys()) {
    const slug = relPath.split('/').pop()!.replace(/\.md$/, '');
    slugToId.set(slug, relPath);
    slugToId.set(relPath, relPath);
  }

  const results: any[] = [];
  for (const [relPath, fullPath] of noteFiles.entries()) {
    try {
      const raw = readFileSync(fullPath, 'utf8');
      results.push(parseNoteContent(raw, relPath, slugToId));
    } catch (err) {
      console.warn(`⚠️ Error reading ${relPath}:`, err);
    }
  }

  return results;
}

console.log(`🔍 [bundle mode] Scanning notes directory: ${notesDir}`);
const notes = walk(notesDir);
console.log(`✅ Parsed ${notes.length} valid Agent Note(s).`);

if (isMetadataOnly) {
  console.log('🔒 [redaction] --metadata-only is on: note bodies and reasoning are stripped, leaving decision metadata and the link topology.');
  for (const n of notes) {
    n.problem = '[body redacted]';
    n.decision = '[body redacted]';
    n.alternatives = '';
    n.consequences = '';
    n.rawBody = `# Agent Note: ${n.title}\n\nStatus: ${n.status}\n\n<!-- content redacted for public demo -->`;
  }
} else {
  console.log('⚠️ [safety] This bundle contains full note bodies. Before publishing it, add --metadata-only to avoid exposing internal reasoning.');
}

let template = readFileSync(templatePath, 'utf8');

// Inject the project name
template = inject(template, TITLE_SENTINEL, `id="brand-project-title">${projectName}<`, 'project title');

// Inject the data
const jsonSafe = JSON.stringify(notes).replace(/</g, '\\u003c');
template = inject(template, DATA_SENTINEL, `window.__INLINE_DATA__ = ${jsonSafe};`, 'inline data');

writeFileSync(outputPath, template, 'utf8');
console.log(`🎉 [bundle done] Board written: ${outputPath}`);
console.log(`💡 It inlines ${notes.length} note(s), so it can be shipped, demoed offline, or deployed as a static page.`);
