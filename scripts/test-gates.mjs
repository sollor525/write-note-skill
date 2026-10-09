// Regression suite for the Agent Note gates.
//
// Every case builds a throwaway host project, runs the real gate scripts
// against it, and asserts the exit code. The point is the *negative* cases:
// each check here corresponds to a way the gates could silently pass while
// something was actually wrong.
//
// Run from the repository root:  npm run test-gates
// Needs only Node. Cases that exercise the git baseline guard need git on PATH;
// a missing git shows up as a failure rather than a silent skip.
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = join(REPO, "skills", "write-notes", "scripts");
// Fixtures must live OUTSIDE the repository: the archived-note verifier walks
// up looking for a git repo, so fixtures inside this repo would silently pick up
// the repo's own history as their "external baseline" and produce bogus verdicts
// (both false failures and false passes).
const BASE = join(tmpdir(), `write-notes-gates-${process.pid}`);
rmSync(BASE, { recursive: true, force: true });
mkdirSync(BASE, { recursive: true });

const results = [];
let failures = 0;

function put(host, rel, content) {
  const full = join(BASE, host, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
  return full;
}
function run(host, script, args = [], env = {}) {
  const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], {
    cwd: join(BASE, host),
    env: { ...process.env, AGENT_NOTE_ROOT: join(BASE, host, ".agents", "notes"), ...env },
    stdio: "inherit",
  });
  return r.status;
}
function check(name, actual, expected) {
  const pass = actual === expected;
  if (!pass) failures++;
  results.push(`${pass ? "PASS" : "FAIL"}  ${name}  (exit ${actual}, expected ${expected})`);
}
function git(host, ...args) {
  return spawnSync("git", args, { cwd: join(BASE, host), stdio: "pipe", encoding: "utf8" });
}

const HEAD = (t, s) => `# Agent Note: ${t}\n\nStatus: ${s}\n`;
const IMPL = (t) => `${HEAD(t, "implemented")}
## Problem

P.

## Decision

D.

## Alternatives considered

- **A** — b.

## Consequences

C.
`;
const PROP = (t) => `${HEAD(t, "proposed")}
## Problem

P.

## Proposal

X.

## Alternatives considered

- **A** — b.

## Acceptance criteria

Y.

## Risks

Z.
`;
const ARCH = (body) => `${HEAD("frozen", "implemented")}Archived: 2026-01-01

## Problem

P.

## Decision

${body}
`;

// ============ 1. an empty or misconfigured root must not be green ============
mkdirSync(join(BASE, "empty", ".agents", "notes"), { recursive: true });
check("empty root: tree fails", run("empty", "verify-agent-note-tree.ts"), 1);
check("empty root: format fails", run("empty", "verify-agent-note-format.ts"), 1);
check("empty root: archived is legitimately empty", run("empty", "verify-archived-agent-notes.ts"), 0);

// ============ 2. the documented Chinese skeleton must pass ============
put("zh", ".agents/notes/implemented/architecture/2026-01-01-zh.md", `${HEAD("中文笔记", "implemented")}
## 问题

P.

## 决策

D.

## 备选方案

- **A** — b.

## 后果

C.
`);
check("chinese skeleton passes", run("zh", "verify-agent-note-format.ts"), 0);

put("zh-bad", ".agents/notes/implemented/architecture/2026-01-01-zh.md", `${HEAD("中文笔记", "implemented")}
## 问题

P.

## 决策

D.

## 后果

C.
`);
check("chinese skeleton without alternatives fails", run("zh-bad", "verify-agent-note-format.ts"), 1);

// ============ 3. bilingual pairing ============
put("zhpair", ".agents/notes/implemented/architecture/2026-01-01-x.md", IMPL("x"));
put("zhpair", ".agents/notes/implemented/architecture/2026-01-01-x.zh.md", IMPL("x"));
check("bilingual pair passes", run("zhpair", "verify-agent-note-tree.ts"), 0);
put("zhorphan", ".agents/notes/implemented/architecture/2026-01-01-y.md", IMPL("y"));
put("zhorphan", ".agents/notes/implemented/architecture/2026-01-02-z.zh.md", IMPL("z"));
check("orphan .zh.md rejected", run("zhorphan", "verify-agent-note-tree.ts"), 1);

// ============ 4. dot-prefixed names are no longer an invisible channel ============
put("dots", ".agents/notes/implemented/feature/2026-01-01-ok.md", IMPL("ok"));
put("dots", ".agents/notes/implemented/.feature/2026-01-02-hidden.md", "# garbage\n");
check("dot class folder caught", run("dots", "verify-agent-note-tree.ts"), 1);
put("dots2", ".agents/notes/implemented/feature/2026-01-01-ok.md", IMPL("ok"));
put("dots2", ".agents/notes/implemented/feature/.2026-01-02-hidden.md", "# garbage\n");
check("dot note file caught", run("dots2", "verify-agent-note-tree.ts"), 1);

// ============ 5. the archived class closed set ============
put("archclass", ".agents/notes/archived/notaclass/2026-01-01-x.md", ARCH("x"));
check("archived unknown class rejected", run("archclass", "verify-archived-agent-notes.ts", ["--write"]), 1);

put("archdeep", ".agents/notes/archived/architecture/deep/2026-01-01-x.md", ARCH("x"));
check("archived nested path rejected", run("archdeep", "verify-archived-agent-notes.ts", ["--write"]), 1);

// ============ 6. the seal bypass is closed ============
// Establishing a baseline in a repository that has never archived anything must
// create the archive directory itself. Regression: writing the manifest without
// creating the directory failed with ENOENT, so the very first `--write` on a
// fresh repository crashed instead of seeding the seal history.
mkdirSync(join(BASE, "sealfresh", ".agents", "notes"), { recursive: true });
put("sealfresh", ".agents/notes/implemented/architecture/2026-01-01-x.md", IMPL("x"));
check("seal: first --write on a repo with no archived/ succeeds", run("sealfresh", "verify-archived-agent-notes.ts", ["--write"]), 0);
check("seal: first --write created the manifest", existsSync(join(BASE, "sealfresh", ".agents/notes/archived/manifest.json")) ? 1 : 0, 1);
check("seal: first --write created the ledger", existsSync(join(BASE, "sealfresh", ".agents/notes/archived/.seal-ledger.json")) ? 1 : 0, 1);

put("seal", ".agents/notes/archived/architecture/2026-01-01-a.md", ARCH("ORIGINAL."));
check("seal: first --write establishes a baseline", run("seal", "verify-archived-agent-notes.ts", ["--write"]), 0);
check("seal: clean verify", run("seal", "verify-archived-agent-notes.ts"), 0);

put("seal", ".agents/notes/archived/architecture/2026-01-01-a.md", ARCH("TAMPERED."));
check("seal: tampering detected", run("seal", "verify-archived-agent-notes.ts"), 1);
check("seal: --write cannot re-seal edited content", run("seal", "verify-archived-agent-notes.ts", ["--write"]), 1);

rmSync(join(BASE, "seal", ".agents/notes/archived/manifest.json"), { force: true });
check("seal: lost manifest cannot be rebuilt implicitly", run("seal", "verify-archived-agent-notes.ts", ["--write"]), 1);
check("seal: --reseal adopts deliberately", run("seal", "verify-archived-agent-notes.ts", ["--reseal"]), 0);
check("seal: verify after reseal", run("seal", "verify-archived-agent-notes.ts"), 0);

// ledger tamper: drop an entry
put("seal2", ".agents/notes/archived/architecture/2026-01-01-a.md", ARCH("A."));
put("seal2", ".agents/notes/archived/architecture/2026-01-02-b.md", ARCH("B."));
run("seal2", "verify-archived-agent-notes.ts", ["--write"]);
const ledger2 = join(BASE, "seal2", ".agents/notes/archived/.seal-ledger.json");
const led2 = JSON.parse(readFileSync(ledger2, "utf8"));
led2.entries = led2.entries.slice(1);
writeFileSync(ledger2, JSON.stringify(led2, null, 2), "utf8");
check("seal: dropped ledger entry detected", run("seal2", "verify-archived-agent-notes.ts"), 1);

// ledger tamper: rewrite an earlier seal in place
put("seal3", ".agents/notes/archived/architecture/2026-01-01-a.md", ARCH("A."));
put("seal3", ".agents/notes/archived/architecture/2026-01-02-b.md", ARCH("B."));
run("seal3", "verify-archived-agent-notes.ts", ["--write"]);
const ledger3 = join(BASE, "seal3", ".agents/notes/archived/.seal-ledger.json");
const led3 = JSON.parse(readFileSync(ledger3, "utf8"));
led3.entries[0].seal = "sha256:" + "0".repeat(64);
writeFileSync(ledger3, JSON.stringify(led3, null, 2), "utf8");
check("seal: edited ledger seal detected", run("seal3", "verify-archived-agent-notes.ts"), 1);

// Archiving OUT OF filename-date order must not break the ledger's own chain.
// The chain is defined over the ledger's sorted key order, so appending a note
// whose key sorts earlier has to re-chain from that position. Regression: the
// ledger used to be chained in arrival order and then sorted on write, so the
// file on disk described a chain that verification immediately rejected —
// i.e. archiving a second note could make the history report itself tampered.
put("sealorder", ".agents/notes/implemented/architecture/2026-01-01-newer.md", IMPL("newer"));
put("sealorder", ".agents/notes/implemented/architecture/2025-06-01-older.md", IMPL("older"));
check("seal order: archive the newer note first", run("sealorder", "archive-agent-note.ts", [
  ".agents/notes/implemented/architecture/2026-01-01-newer.md",
]), 0);
check("seal order: archive the older note second", run("sealorder", "archive-agent-note.ts", [
  ".agents/notes/implemented/architecture/2025-06-01-older.md",
]), 0);
check("seal order: chain survives out-of-order archiving", run("sealorder", "verify-archived-agent-notes.ts"), 0);
check("seal order: ledger is stored in sorted key order", (() => {
  const led = JSON.parse(readFileSync(join(BASE, "sealorder", ".agents/notes/archived/.seal-ledger.json"), "utf8"));
  const keys = led.entries.map((e) => e.key);
  const sorted = [...keys].sort((a, b) => a.localeCompare(b));
  return keys.join("|") === sorted.join("|") ? 1 : 0;
})(), 1);

// The archive CLI must accept every status form the format gate accepts.
put("sealzh", ".agents/notes/implemented/architecture/2025-02-02-zh.md",
  "# Agent Note: 中文笔记\n\n状态：已实现\n\n## 问题\n\nP.\n\n## 决策\n\nD.\n\n## 备选方案\n\n- **A** — b.\n\n## 后果\n\nC.\n");
check("seal zh: format gate accepts the Chinese status line", run("sealzh", "verify-agent-note-format.ts"), 0);
check("seal zh: archive CLI accepts the same note", run("sealzh", "archive-agent-note.ts", [
  ".agents/notes/implemented/architecture/2025-02-02-zh.md",
]), 0);

// ============ 7. the board: multi-paragraph sections and alias parity ============
// The board reads sections with its own regex and its own vocabulary. Both used
// to be wrong: the lookahead matched an empty line, truncating every
// multi-paragraph section to its first paragraph, and the vocabulary had drifted
// from the gate ("曾考虑的替代方案" instead of "已考虑的替代方案") while missing three
// aliases — so notes the gate accepted rendered as empty on the board.
put("boardfix", ".agents/notes/implemented/architecture/2026-04-01-multi.md", `${HEAD("multi paragraph", "implemented")}
## Problem

First paragraph of the problem.

Second paragraph carries the actual reasoning.

## Decision

Decision first line.

Decision second paragraph.

## 已考虑的替代方案

- **Option A** — strong case, rejected on cost.

## Consequences

Cost first.

Benefit second.
`);
{
  const r = spawnSync(process.execPath, [join(SCRIPTS, "build-board.ts"), "--bundle", ".agents/notes", "demo.html", "Board fix"], {
    cwd: join(BASE, "boardfix"),
    env: { ...process.env, AGENT_NOTE_ROOT: join(BASE, "boardfix", ".agents", "notes") },
    stdio: "inherit",
  });
  check("board: bundle builds", r.status, 0);
  const html = readFileSync(join(BASE, "boardfix", "demo.html"), "utf8");
  const m = /window\.__INLINE_DATA__ = (\[[\s\S]*?\]);/.exec(html);
  check("board: inline data present", m ? 1 : 0, 1);
  if (m) {
    const data = JSON.parse(m[1].replace(/\\u003c/g, "<"));
    const n = data[0];
    check("board: keeps the 2nd paragraph of Problem", n.problem.includes("Second paragraph carries") ? 1 : 0, 1);
    check("board: keeps the 2nd paragraph of Decision", n.decision.includes("Decision second paragraph") ? 1 : 0, 1);
    check("board: keeps both paragraphs of Consequences", n.consequences.includes("Cost first") && n.consequences.includes("Benefit second") ? 1 : 0, 1);
    check("board: reads an alias the gate accepts (## 已考虑的替代方案)", n.alternatives.includes("Option A") ? 1 : 0, 1);
  }
}

// ============ 8. the archive CLI: CRLF, link placement, --strict ============
put("crlf", ".agents/notes/implemented/process/2026-05-01-crlf.md", IMPL("crlf note").replace(/\n/g, "\r\n"));
put("crlf", ".agents/notes/implemented/process/2026-05-02-succ.md", PROP("succ"));
check("archive: CRLF note archives", run("crlf", "archive-agent-note.ts", [
  ".agents/notes/implemented/process/2026-05-01-crlf.md",
  "--superseded-by", ".agents/notes/implemented/process/2026-05-02-succ.md",
]), 0);

const archivedCrlf = join(BASE, "crlf", ".agents/notes/archived/process/2026-05-01-crlf.md");
if (existsSync(archivedCrlf)) {
  const s = readFileSync(archivedCrlf, "utf8");
  const bareLf = (s.match(/(?<!\r)\n/g) || []).length;
  const crlfCount = (s.match(/\r\n/g) || []).length;
  check("archive: CRLF preserved with no bare LF", bareLf === 0 && crlfCount > 0 ? 1 : 0, 1);
  check("archive: Archived line sits right under Status", s.replace(/\r\n/g, "\n").split("\n")[2] === "Status: implemented" ? 1 : 0, 1);
} else {
  check("archive: CRLF note landed in archived/", 0, 1);
}

const succ = join(BASE, "crlf", ".agents/notes/implemented/process/2026-05-02-succ.md");
check("archive: successor link inserted before the final section", (() => {
  if (!existsSync(succ)) return 0;
  const lines = readFileSync(succ, "utf8").replace(/\r\n/g, "\n").split("\n");
  const linkIdx = lines.findIndex((l) => /Historical snapshot:|历史快照：/.test(l));
  const lastH2 = lines.reduce((acc, l, i) => (l.startsWith("## ") ? i : acc), -1);
  return linkIdx !== -1 && lastH2 !== -1 && linkIdx < lastH2 && lines[lastH2] === "## Risks" ? 1 : 0;
})(), 1);

put("strict", ".agents/notes/implemented/architecture/2026-01-01-old.md", IMPL("old"));
put("strict", ".agents/notes/implemented/architecture/2026-01-02-ref.md", `${HEAD("ref", "implemented")}
## Problem

Chains to [old](./2026-01-01-old.md).

## Decision

D.

## Alternatives considered

- **A** — b.

## Consequences

C.
`);
check("archive: --strict fails while inbound links remain", run("strict", "archive-agent-note.ts", [
  ".agents/notes/implemented/architecture/2026-01-01-old.md", "--strict",
]), 1);

// ============ 9. the git baseline guard ============
// These cases need the verifier to run `git` as a subprocess. Some sandboxes
// block that (piped child stdio), and "git not executable here" is an
// environment fact, not a code defect — so probe first and skip loudly rather
// than reporting a failure that means nothing.
const gitUsable = (() => {
  const probe = join(BASE, "git-probe");
  mkdirSync(probe, { recursive: true });
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: probe, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.error || r.status === null) {
    console.log(`\nSKIP  git baseline cases: cannot execute git from a subprocess here (${r.error?.code ?? "unknown"})`);
    return false;
  }
  return true;
})();

if (gitUsable) {
  const gh = "gitguard";
  mkdirSync(join(BASE, gh), { recursive: true });
  put(gh, ".agents/notes/implemented/architecture/2026-06-01-keep.md", IMPL("keep"));
  put(gh, ".agents/notes/implemented/architecture/2026-06-02-move.md", IMPL("move"));
  put(gh, ".agents/notes/implemented/architecture/2026-06-03-later.md", IMPL("later"));
  git(gh, "init", "-q");
  git(gh, "config", "user.email", "tester@example.com");
  git(gh, "config", "user.name", "tester");

  // The baseline must contain a sealed note, otherwise the append-only
  // comparison has nothing to compare and these cases would assert nothing.
  run(gh, "archive-agent-note.ts", [".agents/notes/implemented/architecture/2026-06-02-move.md"]);
  git(gh, "add", "-A");
  git(gh, "commit", "-qm", "baseline with one sealed note");
  const baseline = git(gh, "rev-parse", "HEAD").stdout.trim();
  const manifestPath = join(BASE, gh, ".agents/notes/archived/manifest.json");

  // Appending a seal whose key sorts AFTER every existing key is the legitimate
  // growth path: earlier entries keep their exact chain links, so the baseline
  // comparison must stay quiet. (Archiving a note whose key sorts earlier is an
  // insertion that necessarily re-chains the tail — that is what the
  // out-of-order case above covers.)
  run(gh, "archive-agent-note.ts", [".agents/notes/implemented/architecture/2026-06-03-later.md"]);
  git(gh, "add", "-A");
  git(gh, "commit", "-qm", "append a later note");
  check("git: appending a seal passes against baseline", run(gh, "verify-archived-agent-notes.ts", [], { AGENT_NOTE_ARCHIVE_BASE_REF: baseline }), 0);

  // Re-writing a sealed note and re-sealing it changes one baseline seal.
  const archivedKeep = join(BASE, gh, ".agents/notes/archived/architecture/2026-06-02-move.md");
  const originalKeep = readFileSync(archivedKeep, "utf8");
  writeFileSync(archivedKeep, originalKeep.replace("D.", "REWRITTEN."), "utf8");
  run(gh, "verify-archived-agent-notes.ts", ["--reseal"]);
  check("git: re-sealed tampering caught against baseline", run(gh, "verify-archived-agent-notes.ts", [], { AGENT_NOTE_ARCHIVE_BASE_REF: baseline }), 1);

  // Dropping a key that the baseline has must be caught as a removal.
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  delete manifest.files["archived/architecture/2026-06-03-later.md"];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  check("git: dropped seal caught against baseline", run(gh, "verify-archived-agent-notes.ts", [], { AGENT_NOTE_ARCHIVE_BASE_REF: baseline }), 1);

  // A note dropped straight into archived/ has no implemented/ source at the
  // baseline, so it cannot obtain a legitimate seal.
  put(gh, ".agents/notes/archived/architecture/2026-06-09-forged.md", ARCH("FORGED."));
  const manifest2 = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest2.files["archived/architecture/2026-06-09-forged.md"] = "sha256:" + "1".repeat(64);
  writeFileSync(manifestPath, JSON.stringify(manifest2, null, 2), "utf8");
  check("git: hand-dropped archived note rejected", run(gh, "verify-archived-agent-notes.ts", [], { AGENT_NOTE_ARCHIVE_BASE_REF: baseline }), 1);
}

// ============ 10. the two language editions ============
// Both editions ship inside this repository, so they must be installable
// independently and must not drift apart. Shared code is duplicated on purpose
// (the skills CLI copies through symlinks); these checks are what keeps the two
// copies honest.
const EDITIONS = ["write-notes", "write-notes-en"];
const skillPath = (edition, ...rest) => join(REPO, "skills", edition, ...rest);

for (const edition of EDITIONS) {
  check(`${edition}: SKILL.md present`, existsSync(skillPath(edition, "SKILL.md")) ? 1 : 0, 1);
}

// frontmatter name must match the edition's directory name, or installs collide
for (const edition of EDITIONS) {
  const head = readFileSync(skillPath(edition, "SKILL.md"), "utf8").split("\n").slice(0, 5).join("\n");
  check(`${edition}: frontmatter name matches directory`, new RegExp(`^name:\\s*${edition}\\s*$`, "m").test(head) ? 1 : 0, 1);
  check(`${edition}: frontmatter has a description`, /^description:\s*\S/m.test(head) ? 1 : 0, 1);
}

// the English edition must actually be English
// The English edition must be English — except for the Chinese section-name
// aliases, which are real identifiers the gates accept and which the English
// docs must therefore name. Those are allowed; anything else means a missed
// translation.
const ALLOWED_CHINESE = new Set([
  "问题", "决策", "备选方案", "已考虑的替代方案", "备选", "后果", "提议", "方案", "提案",
  "决定", "影响", "结果", "风险", "验收标准", "验收条件", "接受标准", "计划", "规划", "迁移计划",
  "替代方案",
]);
const strayChinese = (file) => {
  const text = readFileSync(skillPath("write-notes-en", file), "utf8");
  const found = new Set();
  for (const m of text.matchAll(/[\u4e00-\u9fff]+/g)) {
    if (!ALLOWED_CHINESE.has(m[0])) found.add(m[0]);
  }
  return [...found];
};
const enStraySkill = strayChinese("SKILL.md");
check("write-notes-en: SKILL.md has no untranslated Chinese", enStraySkill.length === 0 ? 1 : 0, 1);
if (enStraySkill.length) console.log(`    untranslated: ${enStraySkill.join(", ")}`);
const zhText = readFileSync(skillPath("write-notes", "SKILL.md"), "utf8");
check("write-notes: SKILL.md is in Chinese", /[\u4e00-\u9fff]/.test(zhText) ? 1 : 0, 1);

// Shared, language-neutral files must be byte-identical across editions.
// build-board.ts is deliberately excluded: it prints user-facing console output,
// so the English edition carries translated messages.
const SHARED = [
  "scripts/agent-note-tree.ts",
  "scripts/archive-agent-note.ts",
  "scripts/check-note-anchors.ts",
  "scripts/note-sections.ts",
  "scripts/seal-store.ts",
  "scripts/verify-agent-note-format.ts",
  "scripts/verify-agent-note-tree.ts",
  "scripts/verify-archived-agent-notes.ts",
  "assets/agent-notes-board.html",
];
for (const rel of SHARED) {
  const a = existsSync(skillPath("write-notes", rel));
  const b = existsSync(skillPath("write-notes-en", rel));
  if (!a || !b) {
    check(`shared file present in both editions: ${rel}`, 0, 1);
    continue;
  }
  const same = readFileSync(skillPath("write-notes", rel)).equals(readFileSync(skillPath("write-notes-en", rel)));
  check(`shared file identical across editions: ${rel}`, same ? 1 : 0, 1);
}

// every relative link inside either SKILL.md must resolve
for (const edition of EDITIONS) {
  const text = readFileSync(skillPath(edition, "SKILL.md"), "utf8");
  const missing = [];
  for (const m of text.matchAll(/\]\(([^)#\s]+\.md)\)/g)) {
    const target = m[1];
    if (/^https?:/.test(target) || target.includes("…")) continue;
    if (!existsSync(join(REPO, "skills", edition, target))) missing.push(target);
  }
  check(`${edition}: all relative links in SKILL.md resolve`, missing.length === 0 ? 1 : 0, 1);
  if (missing.length) console.log(`    missing: ${missing.join(", ")}`);
}

// the English edition's own gates must work on an English note
put("en", ".agents/notes/implemented/architecture/2026-01-01-en.md", `${HEAD("english edition", "implemented")}
## Problem

The English edition must pass its own gates.

## Decision

Notes in English use the English section names.

## Alternatives considered

- **Ship one bilingual skill** — the installer copies through symlinks and has no language dimension, so this cannot work.

## Consequences

- **Benefit**: the gate is exercised for this edition.
- **Cost**: shared code is duplicated and must be kept identical.
`);
check("write-notes-en: english note passes the format gate", (() => {
  const r = spawnSync(process.execPath, [join(REPO, "skills", "write-notes-en", "scripts", "verify-agent-note-format.ts")], {
    cwd: join(BASE, "en"),
    env: { ...process.env, AGENT_NOTE_ROOT: join(BASE, "en", ".agents", "notes") },
    stdio: "inherit",
  });
  return r.status;
})(), 0);
check("write-notes-en: tree gate runs from its own scripts dir", (() => {
  const r = spawnSync(process.execPath, [join(REPO, "skills", "write-notes-en", "scripts", "verify-agent-note-tree.ts")], {
    cwd: join(BASE, "en"),
    env: { ...process.env, AGENT_NOTE_ROOT: join(BASE, "en", ".agents", "notes") },
    stdio: "inherit",
  });
  return r.status;
})(), 0);

console.log("\n================ RESULTS ================");
for (const r of results) console.log(r);
console.log(`\n${results.length - failures}/${results.length} passed, ${failures} failed`);
rmSync(BASE, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);