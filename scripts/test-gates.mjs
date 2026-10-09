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

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = join(REPO, "skills", "write-notes", "scripts");
const BASE = join(REPO, ".gates-scratch");
rmSync(BASE, { recursive: true, force: true });

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

// ============ 7. the archive CLI: CRLF, link placement, --strict ============
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
  const linkIdx = lines.findIndex((l) => l.includes("历史快照"));
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

// ============ 8. the git baseline guard ============
const gh = "gitguard";
mkdirSync(join(BASE, gh), { recursive: true });
put(gh, ".agents/notes/implemented/architecture/2026-06-01-keep.md", IMPL("keep"));
put(gh, ".agents/notes/implemented/architecture/2026-06-02-move.md", IMPL("move"));
git(gh, "init", "-q");
git(gh, "config", "user.email", "tester@example.com");
git(gh, "config", "user.name", "tester");
run(gh, "verify-archived-agent-notes.ts", ["--write"]);
git(gh, "add", "-A");
git(gh, "commit", "-qm", "baseline");
const baseline = git(gh, "rev-parse", "HEAD").stdout.trim();

run(gh, "archive-agent-note.ts", [".agents/notes/implemented/architecture/2026-06-02-move.md"]);
git(gh, "add", "-A");
git(gh, "commit", "-qm", "archive move");
check("git: legitimate archive passes against baseline", run(gh, "verify-archived-agent-notes.ts", [], { AGENT_NOTE_ARCHIVE_BASE_REF: baseline }), 0);

run(gh, "archive-agent-note.ts", [".agents/notes/implemented/architecture/2026-06-01-keep.md"]);
git(gh, "add", "-A");
git(gh, "commit", "-qm", "archive keep");
const archivedKeep = join(BASE, gh, ".agents/notes/archived/architecture/2026-06-01-keep.md");
writeFileSync(archivedKeep, readFileSync(archivedKeep, "utf8").replace("D.", "REWRITTEN."), "utf8");
run(gh, "verify-archived-agent-notes.ts", ["--reseal"]);
check("git: re-sealed tampering caught against baseline", run(gh, "verify-archived-agent-notes.ts", [], { AGENT_NOTE_ARCHIVE_BASE_REF: baseline }), 1);

const manifestPath = join(BASE, gh, ".agents/notes/archived/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
delete manifest.files["archived/architecture/2026-06-01-keep.md"];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
check("git: dropped seal caught against baseline", run(gh, "verify-archived-agent-notes.ts", [], { AGENT_NOTE_ARCHIVE_BASE_REF: baseline }), 1);

put(gh, ".agents/notes/archived/architecture/2026-06-09-forged.md", ARCH("FORGED."));
const manifest2 = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest2.files["archived/architecture/2026-06-09-forged.md"] = "sha256:" + "1".repeat(64);
writeFileSync(manifestPath, JSON.stringify(manifest2, null, 2), "utf8");
check("git: hand-dropped archived note rejected", run(gh, "verify-archived-agent-notes.ts", [], { AGENT_NOTE_ARCHIVE_BASE_REF: baseline }), 1);

console.log("\n================ RESULTS ================");
for (const r of results) console.log(r);
console.log(`\n${results.length - failures}/${results.length} passed, ${failures} failed`);
rmSync(BASE, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
