// End-to-end install test: what the installer actually produces for each
// harness, and whether the installed skill works from the host project.
//
// This is the only place that exercises the real `skills` CLI, so it asserts
// the things the README tells users to expect:
//   - the universal directory for agents that share it (.agents/skills/)
//   - Claude Code's own directory, which the installer links to the universal one
//   - that --skill picks exactly one language edition
//   - that the delivered tree is byte-identical to the source
//   - that the gates, the archive CLI and the board all run from the host root
//
// It needs network access (npx fetches skills@1.7.1 and tsx) and is therefore
// NOT part of `npm run test-gates`, which stays offline-only.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'notes-skill-install-')));
const env = { ...process.env, DISABLE_TELEMETRY: '1' };
delete env.AGENT_NOTE_ROOT;
delete env.AGENT_NOTE_ARCHIVE_BASE_REF;

const CLI = 'skills@1.7.1';

const isWindows = process.platform === 'win32';

/** Quote one argument so the shell hands it over as a single argv entry. */
function quoteArg(value) {
  const s = String(value);
  if (s === '') return '""';
  if (!/[\s"]/.test(s)) return s;
  return `"${s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`;
}

/**
 * Run `npx --yes <args>` and return its output.
 *
 * On Windows `npx` is a shell script, so spawnSync('npx') gives ENOENT and
 * spawnSync('npx.cmd') gives EINVAL (Node refuses to spawn .cmd without a
 * shell). Running through the shell is therefore required — but a shell splits
 * arguments on whitespace, which silently truncated a board title
 * ("Install check" arrived as "Install"). So arguments are quoted explicitly.
 * Every argument is a literal or a repo-controlled absolute path.
 */
function run(cwd, args, success = true) {
  const command = ['npx', '--yes', ...args].map(quoteArg).join(' ');
  const result = spawnSync(command, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    shell: isWindows ? true : '/bin/sh',
  });
  if (result.error) throw result.error;
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  assert.equal(result.status === 0, success, `\`${command}\`\n${out}`);
  return out;
}

/** Walk a directory and return posix-relative file paths. */
function filesUnder(root, rel = '') {
  const out = [];
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...filesUnder(root, r));
    else out.push(r);
  }
  return out;
}

/** Every delivered file must match the source byte for byte. */
function assertDeliveredTree(installed, edition) {
  const source = join(repo, 'skills', edition);
  const expected = filesUnder(source).sort();
  const actual = filesUnder(installed).sort();
  assert.deepEqual(actual, expected, `${installed}: delivered file list differs from ${edition}`);
  for (const rel of expected) {
    const a = readFileSync(join(source, rel));
    const b = readFileSync(join(installed, rel));
    assert.ok(a.equals(b), `${installed}/${rel}: content differs from source`);
  }
}

/**
 * Assert the harness layout for one install.
 * `expectLink` is true when the installer is expected to link the agent-specific
 * directory to the universal one (symlink/junction), false when it copies.
 */
function assertLayout(host, edition, expectLink) {
  const universal = join(host, '.agents', 'skills', edition);
  const claude = join(host, '.claude', 'skills', edition);
  assert.ok(existsSync(universal), `missing universal install: ${universal}`);
  assert.ok(existsSync(claude), `missing Claude Code install: ${claude}`);
  assertDeliveredTree(universal, edition);
  // Reading through the Claude Code path must work regardless of link or copy.
  assert.equal(
    readFileSync(join(claude, 'SKILL.md'), 'utf8'),
    readFileSync(join(repo, 'skills', edition, 'SKILL.md'), 'utf8'),
    'Claude Code path must expose the same SKILL.md',
  );
  if (expectLink) {
    const st = lstatSync(claude);
    assert.ok(st.isSymbolicLink(), `expected ${claude} to be a link to the universal directory, got a real ${st.isDirectory() ? 'directory' : 'entry'}`);
    assert.equal(realpathSync(claude), realpathSync(universal), 'link must resolve to the universal directory');
  }
}

try {
  // ---- pass 1: default mode, both agents, Chinese edition only ----
  {
    const host = join(scratch, 'default');
    mkdirSync(host);
    const output = run(host, [CLI, 'add', repo, '--skill', 'write-notes', '--agent', 'codex', 'claude-code', '-y']);
    assert.match(output, /write-notes/);
    // --skill must select one edition: the other must not appear.
    assert.ok(!existsSync(join(host, '.agents/skills/write-notes-en')), '--skill write-notes must not install the English edition');

    assertLayout(host, 'write-notes', /* expectLink */ true);

    // The gates must read the HOST project's notes, not the skill's own files.
    const noteDir = join(host, '.agents/notes/implemented/process');
    mkdirSync(noteDir, { recursive: true });
    const note = join(noteDir, '2026-10-07-install-check.md');
    const goodNote = '# Agent Note: Install check\n\nStatus: implemented\n\n## Problem\nValidate installed paths.\n\n## Decision\nRun from the host project.\n\n## Alternatives considered\nRunning from the skill directory targets the wrong notes.\n\n## Consequences\nHost notes are checked.\n';
    writeFileSync(note, goodNote, 'utf8');

    const canonical = join(host, '.agents', 'skills', 'write-notes');
    const script = (name) => join(canonical, 'scripts', `${name}.ts`);
    for (const name of ['verify-agent-note-tree', 'verify-agent-note-format', 'verify-archived-agent-notes']) {
      run(host, ['tsx', script(name)]);
    }

    // A broken host note must fail, even though the installed skill has no notes of its own.
    writeFileSync(note, goodNote.replace('Status: implemented', 'Status: proposed'), 'utf8');
    run(host, ['tsx', join(host, '.claude', 'skills', 'write-notes', 'scripts', 'verify-agent-note-format.ts')], false);
    writeFileSync(note, goodNote, 'utf8');

    // Boards, in both modes. The template carries the Chinese default title as
    // the sentinel the build script replaces, so assert the requested title is
    // present and that default is gone — the board's own UI is still Chinese, so
    // looking for English copy inside it would prove nothing.
    const boardPath = join(host, 'board.html');
    run(host, ['tsx', script('build-board'), '--init', 'board.html', 'Install check']);
    const board = readFileSync(boardPath, 'utf8');
    const titleIdx = board.indexOf('brand-project-title');
    const context = titleIdx === -1 ? board.slice(0, 300) : board.slice(Math.max(0, titleIdx - 60), titleIdx + 120);
    assert.ok(
      board.includes('Install check'),
      `board must carry the injected project name; length=${board.length} titleIdx=${titleIdx} context=${JSON.stringify(context)}`,
    );
    assert.match(board, /id="brand-project-title"/, 'board must keep its title element');
    assert.ok(!/id="brand-project-title">工程决策看板</.test(board), 'default title sentinel must have been replaced');

    const demoPath = join(host, 'demo.html');
    run(host, ['tsx', script('build-board'), '--bundle', '.agents/notes', 'demo.html', 'Install check']);
    const demo = readFileSync(demoPath, 'utf8');
    assert.ok(!demo.includes('window.__INLINE_DATA__ = null;'), 'bundle must have inlined the note data');
    assert.match(demo, /Host notes are checked/, 'bundle must contain the host note body');

    // Archive, then re-verify the sealed archive.
    run(host, ['tsx', script('archive-agent-note'), note]);
    run(host, ['tsx', script('verify-archived-agent-notes')]);
    assert.ok(existsSync(join(host, '.agents/notes/archived/process/2026-10-07-install-check.md')));
    assert.ok(existsSync(join(host, '.agents/notes/archived/manifest.json')));
    assert.ok(existsSync(join(host, '.agents/notes/archived/.seal-ledger.json')));

    console.log('ok: default mode — universal + Claude Code link, host gates, boards, archive');
  }

  // ---- pass 2: --copy, English edition, asserted byte-for-byte ----
  {
    const host = join(scratch, 'copy');
    mkdirSync(host);
    run(host, [CLI, 'add', repo, '--skill', 'write-notes-en', '--agent', 'codex', 'claude-code', '-y', '--copy']);
    assert.ok(!existsSync(join(host, '.agents/skills/write-notes')), '--skill write-notes-en must not install the Chinese edition');

    assertLayout(host, 'write-notes-en', /* expectLink */ false);
    // With --copy the Claude Code path is a real directory, so the tree must be
    // complete there too (that is the whole point of recommending --copy).
    assertDeliveredTree(join(host, '.claude', 'skills', 'write-notes-en'), 'write-notes-en');

    console.log('ok: --copy — English edition, both paths hold a complete real tree');
  }

  // ---- pass 3: both editions and the universal-only agent set ----
  {
    const host = join(scratch, 'multi');
    mkdirSync(host);
    const output = run(host, [CLI, 'add', repo, '--skill', 'write-notes', 'write-notes-en', '--agent', 'codex', 'gemini-cli', 'github-copilot', '--copy', '-y']);
    for (const edition of ['write-notes', 'write-notes-en']) {
      assertDeliveredTree(join(host, '.agents', 'skills', edition), edition);
    }
    assert.match(output, /write-notes-en/);
    console.log('ok: multiple editions and multiple harnesses share the universal directory');
  }

  console.log('\nall install checks passed');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
