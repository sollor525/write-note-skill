#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTE_PARSER, browserParserSource } from './note-sections.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const templatePath = resolve(__dirname, '../assets/agent-notes-board.html');
const args = process.argv.slice(2);

if (!existsSync(templatePath)) {
    console.error(`❌ Template not found at: ${templatePath}`);
    process.exit(1);
}

// 解析生成模式、输出路径与显式覆盖选项。
const isInitMode = args.includes('--init');
const isForce = args.includes('--force') || args.includes('-f');
const isMetadataOnly = args.includes('--metadata-only');
const cleanArgs = args.filter((a: string) => !a.startsWith('--') && !a.startsWith('-'));

/** 防止覆盖非看板文件；只有 --force 可以跳过此检查，读取失败向上传递。 */
function checkTargetSafety(targetPath: string) {
    if (existsSync(targetPath) && !isForce) {
        const existing = readFileSync(targetPath, 'utf8');
        const isBoard = existing.includes('generator" content="agent-notes-board"') || existing.includes('id="brand-project-title"');
        if (!isBoard) {
            console.error(`❌ Refusing to overwrite: ${targetPath} already exists and is not a generated board.`);
            console.error(`💡 To avoid clobbering an existing project page (e.g. a Vite/React/Vue index.html), pass a different output path, or --force to overwrite.`);
            process.exit(1);
        }
    }
}

const TITLE_SENTINEL = 'id="brand-project-title">工程决策看板<';
const DATA_SENTINEL = 'window.__INLINE_DATA__ = null;';

/** 替换已知模板标记；标记缺失时非零退出，避免生成缺少解析器或数据的页面。 */
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

    let template = inject(readFileSync(templatePath, 'utf8'), '/* NOTE_PARSER */', browserParserSource(), 'note parser');
    template = inject(template, TITLE_SENTINEL, `id="brand-project-title">${projectName}<`, 'project title');

    writeFileSync(targetPath, template, 'utf8');
    console.log(`✅ [daily mode] Lightweight board written (only ~69KB): ${targetPath}`);
    console.log(`💡 Open it in a browser and click "connect local directory" (top right) to pick .agents/notes; new or edited notes hot-reload when you switch back to the tab.`);
    process.exit(0);
}

// 打包模式内嵌笔记数据，生成可独立打开的单文件。
const notesDir = cleanArgs[0] ? resolve(cleanArgs[0]) : resolve(process.cwd(), '.agents/notes');
const outputPath = cleanArgs[1] ? resolve(cleanArgs[1]) : resolve(process.cwd(), 'demo.html');
const projectName = cleanArgs[2] || 'Decision Board';

checkTargetSafety(outputPath);

const LIFECYCLES = ['implemented', 'proposed', 'rejected', 'archived'];

if (!existsSync(notesDir)) {
    console.error(`❌ Notes directory not found at: ${notesDir}`);
    process.exit(1);
}

/** 遍历笔记并通过共享解析器生成看板数据；无法读取的文件会报告错误。 */
function walk(dir: string, baseDir: string = dir): any[] {
    const noteFiles = new Map<string, string>(); // 相对路径到完整路径；本次生成独占

    /** 收集合法生命周期下的文件路径；中文配对文件作为看板显示版本。 */
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
            results.push(NOTE_PARSER.parseNote(raw, relPath, slugToId));
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

let template = inject(readFileSync(templatePath, 'utf8'), '/* NOTE_PARSER */', browserParserSource(), 'note parser');

// 写入项目名称。
template = inject(template, TITLE_SENTINEL, `id="brand-project-title">${projectName}<`, 'project title');

// 内嵌数据中的小于号转义，避免正文提前结束 script 标签。
const jsonSafe = JSON.stringify(notes).replace(/</g, '\\u003c');
template = inject(template, DATA_SENTINEL, `window.__INLINE_DATA__ = ${jsonSafe};`, 'inline data');

writeFileSync(outputPath, template, 'utf8');
console.log(`🎉 [bundle done] Board written: ${outputPath}`);
console.log(`💡 It inlines ${notes.length} note(s), so it can be shipped, demoed offline, or deployed as a static page.`);
