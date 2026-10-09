// Copy the shared, language-neutral skill files from the Chinese edition to the
// English one.
//
// The two editions ship one copy of each gate script on purpose (the installer
// copies through symlinks, so "shared via link" does not survive installation).
// The cost of duplication is drift, and this script plus the byte-identity
// assertions in scripts/test-gates.mjs are what keep it honest:
//
//   node scripts/sync-editions.mjs          # report differences
//   node scripts/sync-editions.mjs --write  # copy shared files across
//
// `build-board.ts` is deliberately excluded: it prints user-facing console
// output, so the English edition carries translated messages.
import { copyFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ZH = join(REPO, 'skills', 'write-notes');
const EN = join(REPO, 'skills', 'write-notes-en');

/** Files that must stay byte-identical across editions: shared code, not prose. */
const SHARED = [
  'scripts/agent-note-tree.ts',
  'scripts/archive-agent-note.ts',
  'scripts/check-note-anchors.ts',
  'scripts/note-sections.ts',
  'scripts/seal-store.ts',
  'scripts/verify-agent-note-format.ts',
  'scripts/verify-agent-note-tree.ts',
  'scripts/verify-archived-agent-notes.ts',
  'assets/agent-notes-board.html',
];

/** Localized counterparts that are expected to differ, listed for visibility. */
const INTENTIONALLY_DIFFERENT = ['scripts/build-board.ts', 'SKILL.md', 'references/', 'templates/'];

const write = process.argv.includes('--write');
let drifted = 0;
let synced = 0;

for (const rel of SHARED) {
  const src = join(ZH, rel);
  const dst = join(EN, rel);
  if (!existsSync(src) || !existsSync(dst)) {
    console.log(`MISSING  ${rel} (${existsSync(src) ? 'en' : 'zh'})`);
    drifted++;
    continue;
  }
  if (readFileSync(src).equals(readFileSync(dst))) {
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

// Report the localized files so a reader can see they are not oversights.
const board = join(ZH, 'scripts', 'build-board.ts');
const boardEn = join(EN, 'scripts', 'build-board.ts');
console.log(`\nintentionally different: ${INTENTIONALLY_DIFFERENT.join(', ')}`);
if (existsSync(board) && existsSync(boardEn)) {
  console.log(`  build-board.ts identical? ${readFileSync(board).equals(readFileSync(boardEn))} (expected false: localized console output)`);
}

// A quick structural parity check on the localized markdown trees.
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
