// 两版独立安装，各自携带共享脚本；安装器会复制链接目标，不能依赖符号链接共享。
// 默认报告字节差异并非零退出；--write 从中文版复制共享文件到英文版。
// build-board.ts 包含本地化控制台文案，需要分别维护。
import { copyFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ZH = join(REPO, 'skills', 'write-notes');
const EN = join(REPO, 'skills', 'write-notes-en');

/** 必须逐字节相同的共享代码和模板路径，相对于各版本根目录。 */
const SHARED = [
    'scripts/agent-note-tree.ts',
    'scripts/archive-agent-note.ts',
    'scripts/check-note-anchors.ts',
    'scripts/note-sections.ts',
    'scripts/note-parser.mjs',
    'scripts/seal-store.ts',
    'scripts/file-updates.ts',
    'scripts/verify-agent-note-format.ts',
    'scripts/verify-agent-note-tree.ts',
    'scripts/verify-archived-agent-notes.ts',
    'assets/agent-notes-board.html',
];

/** 有意本地化的路径，不参与字节同步。 */
const INTENTIONALLY_DIFFERENT = ['scripts/build-board.ts', 'SKILL.md', 'references/', 'templates/'];

const write = process.argv.includes('--write');
let drifted = 0;
let synced = 0;

for (const rel of SHARED) {
    const src = join(ZH, rel);
    const dst = join(EN, rel);
    if (!existsSync(src) || (!existsSync(dst) && !write)) {
        console.log(`MISSING  ${rel} (${existsSync(src) ? 'en' : 'zh'})`);
        drifted++;
        continue;
    }
    if (existsSync(dst) && readFileSync(src).equals(readFileSync(dst))) {
        console.log(`ok       ${rel}`);
        continue;
    }
    drifted++;
    if (write) {
        copyFileSync(src, dst);
        synced++;
        console.log(`synced   ${rel}`);
    } else {
        console.log(`DRIFTED  ${rel}`);
    }
}

// 列出有意不同的文件，避免被误判为同步遗漏。
const board = join(ZH, 'scripts', 'build-board.ts');
const boardEn = join(EN, 'scripts', 'build-board.ts');
console.log(`\nintentionally different: ${INTENTIONALLY_DIFFERENT.join(', ')}`);
if (existsSync(board) && existsSync(boardEn)) {
    console.log(`  build-board.ts identical? ${readFileSync(board).equals(readFileSync(boardEn))} (expected false: localized console output)`);
}

// 检查本地化参考文档的文件列表是否一致。
for (const dir of ['references']) {
    const zhFiles = readdirSync(join(ZH, dir)).sort();
    const enFiles = readdirSync(join(EN, dir)).sort();
    const same = zhFiles.join('|') === enFiles.join('|');
    console.log(`  ${dir}/ file lists match? ${same}${same ? '' : ` (zh: ${zhFiles.join(', ')} | en: ${enFiles.join(', ')})`}`);
}

console.log(`\n${drifted === 0 ? 'no drift' : `${drifted} shared file(s) differ`}${write && synced ? `, ${synced} synced` : ''}`);
if (drifted > 0 && !write) {
    console.log('re-run with --write to copy the shared files across');
    process.exit(1);
}
