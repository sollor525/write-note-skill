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

// 检查参数
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
            console.error(`❌ 错误：目标文件已存在 (${targetPath}) 且并非看板生成文件！`);
            console.error(`💡 为防止意外覆盖已有项目页面（如 Vite/React/Vue 项目的 index.html），请指定其他输出路径或传入 --force 确认覆盖。`);
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
    const projectName = cleanArgs[1] || '工程决策看板';

    checkTargetSafety(targetPath);

    let template = inject(readFileSync(templatePath, 'utf8'), '/* NOTE_PARSER */', browserParserSource(), 'note parser');
    template = inject(template, TITLE_SENTINEL, `id="brand-project-title">${projectName}<`, 'project title');

    writeFileSync(targetPath, template, 'utf8');
    console.log(`✅ [日常开发模式] 轻量看板已生成 (仅 ~69KB): ${targetPath}`);
    console.log(`💡 用浏览器打开后，点击右上角「连接本地目录」选择 .agents/notes，后续新建/修改笔记切回浏览器即可自动热刷新！`);
    process.exit(0);
}

// 打包模式（生成内联完整数据的单文件，如 demo.html）
const notesDir = cleanArgs[0] ? resolve(cleanArgs[0]) : resolve(process.cwd(), '.agents/notes');
const outputPath = cleanArgs[1] ? resolve(cleanArgs[1]) : resolve(process.cwd(), 'demo.html');
const projectName = cleanArgs[2] || '工程决策看板';

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

console.log(`🔍 [打包模式] 正在扫描笔记目录: ${notesDir}`);
const notes = walk(notesDir);
console.log(`✅ 解析完成，共发现 ${notes.length} 篇有效 Agent Notes。`);

if (isMetadataOnly) {
    console.log('🔒 [安全脱敏] 启用 --metadata-only 模式，已剥离所有笔记的具体正文和详细论证，仅保留决策元数据与关联拓扑。');
    for (const n of notes) {
        n.problem = '[正文已脱敏]';
        n.decision = '[正文已脱敏]';
        n.alternatives = '';
        n.consequences = '';
        n.rawBody = `# Agent Note: ${n.title}\n\nStatus: ${n.status}\n\n<!-- content redacted for public demo -->`;
    }
} else {
    console.log('⚠️ [安全提示] 正在生成包含完整正文的数据包。如需对外公开发布且避免泄露内部决策细节，请添加 --metadata-only 参数。');
}

let template = inject(readFileSync(templatePath, 'utf8'), '/* NOTE_PARSER */', browserParserSource(), 'note parser');

// 写入项目名称。
template = inject(template, TITLE_SENTINEL, `id="brand-project-title">${projectName}<`, 'project title');

// 内嵌数据中的小于号转义，避免正文提前结束 script 标签。
const jsonSafe = JSON.stringify(notes).replace(/</g, '\\u003c');
template = inject(template, DATA_SENTINEL, `window.__INLINE_DATA__ = ${jsonSafe};`, 'inline data');

writeFileSync(outputPath, template, 'utf8');
console.log(`🎉 [打包完成] 看板已生成: ${outputPath}`);
console.log(`💡 该文件内置了 ${notes.length} 篇笔记数据，可脱机分发、离线演示或部署至 GitHub Pages。`);
