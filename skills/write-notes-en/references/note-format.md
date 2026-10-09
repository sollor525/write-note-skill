# Read as needed: Note file format

> The deep dive behind SKILL §2. Check against it when writing or editing a note; skip it when you are only changing code and not touching notes.

## Header block (first three lines; the check scripts verify it)

```markdown
# Agent Note: <Title>

Status: <status>
```

- `proposed` → `Status: proposed`
- `implemented` → `Status: implemented`
- `rejected` → `Status: rejected — <one-line reason>`

The title must carry the `Agent Note: ` prefix; the status carries no date and no parentheses; and it must match the lifecycle folder the file lives in (the script cross-checks this). The date in the filename is the date of first proposal; git carries the rest of the time information.

## Body skeleton

Every note starts with `## Problem` — the motivation must stand on its own, independently of the proposal. What follows depends on the lifecycle:

**`proposed/`**

```markdown
## Problem
## Proposal
…free-form sections…
## Alternatives considered
## Acceptance criteria
## Risks
```

`Proposal` may use the future tense; `Acceptance criteria` states which observable state counts as done; `Risks` records both the risks and the known tradeoffs.

**`implemented/`**

```markdown
## Problem
## Decision
…free-form sections…
## Alternatives considered
## Consequences
```

`Decision` describes landed facts in the present tense; the gate rejects only proposal-era headings (`## Proposal` / `## Plan` / `## Migration plan` / `## Acceptance criteria` and their Chinese aliases: `## 提议`, `## 方案`, `## 提案`, `## 计划`, `## 规划`, `## 迁移计划`, `## 验收标准`, `## 验收条件`, `## 接受标准`); record costs and benefits together with `## Consequences`; and you may add present-tense fact sections such as `## Testing` / `## Verification` as needed. The present tense is written by a human, not by a lexical scan.

**`rejected/`**

A frozen proposal shape whose verdict lives on the `Status:` line; keep the proposal's `Alternatives` and other sections and do not rewrite them into their opposite.

## Alternatives considered (required)

Every note must contain `## Alternatives considered`: why each option you **genuinely considered** was not chosen, one paragraph per option (a `### Why not <X>?` subsection works). Do not invent options you never had. Write "do nothing / reuse what exists" only if you genuinely weighed it at the time. The script only checks whether this section is present.

Chinese aliases are also accepted: `## 替代方案`, `## 已考虑的替代方案`, `## 备选方案`, `## 备选`.

## Tense and the no-rewrite rule

- `proposed` may use the future tense; `implemented` uses the present tense throughout, describing landed facts.
- A note is never rewritten into a different decision; when it is superseded, a new note takes over and the old one is handled by the archiving/merge rules.

The header title accepts a fullwidth colon (`# Agent Note：<Title>` — Chinese input methods often produce the fullwidth form); new notes should use the halfwidth form.

## Free-form sections and prose style

- Free-form sections (package topology, wire contracts, schemas, and the like) go between `Decision` and `Alternatives`.
- Keep searchable mechanism names and `must`/`may`/`never` temporal emphasis; explain each fact fully in exactly one place and link to it from everywhere else.
- Cross-note references use relative Markdown links `[topic](../../implemented/architecture/2026-…-….md)`, never bare numbers.

This edition is English-monolingual: the header `Agent Note:` and `Status:` stay in their English original so the scripts can check them, and the body is written in English.
