# Repository Guidelines

## Project Structure & Module Organization

`skills/write-notes/` and `skills/write-notes-en/` are independently installable Chinese and English skills. Each contains `SKILL.md`, TypeScript `scripts/`, `references/`, `templates/`, and a board template in `assets/`. Root `scripts/` holds maintenance utilities and tests; root `assets/` holds README illustrations. Decisions live in `.agents/notes/`; CI is `.github/workflows/verify.yml`.

## Build, Test, and Development Commands

Use Node.js 24 (matching CI), npm, and Git; run commands from the repository root. Scripts execute directly; `npx tsx` may download its runner.

- `npm run verify-notes`: validate note paths, structure, and archive seals.
- `npm run test-gates`: run offline regression tests and edition consistency checks.
- `npm run test-skill-install`: exercise real installation using `skills@1.7.1`; requires network access.
- `node scripts/sync-editions.mjs`: detect shared-file differences; `npm run sync-editions` copies Chinese-edition shared files into English.
- `npm run init-board`: generate `board.html`; `npm run bundle-board`: create standalone `demo.html`. Open either in a browser.
- `npm run export-assets`: regenerate PNGs from SVG sources; requires `rsvg-convert` or Inkscape.

## Coding Style & Naming Conventions

Use four spaces, never tabs. Align separately placed braces with their owning statement; preserve formatter-generated output. Use kebab-case filenames and ES modules. No formatter or linter is configured. Write handwritten comments in Chinese; document function behavior, failures, resource limits, and data ownership and constraints.

Edit shared files in `skills/write-notes/`, then synchronize. Maintain localized `SKILL.md`, references, templates, and `build-board.ts` separately.

## Testing Guidelines

Tests use Node built-ins, exit-code checks, and `node:assert/strict`; no coverage threshold is configured. Add descriptive cases to `scripts/test-gates.mjs`, including invalid-input rejection. Keep fixtures outside the repository in `os.tmpdir()` to isolate Git history. Run installation tests for packaging or installation changes.

## Commit & Pull Request Guidelines

History uses short imperative English subjects, such as `Add English edition; choose language at install time`, without mandatory prefixes. Keep commits focused. PRs should explain behavior, rationale, and verification; link relevant issues and notes, and include screenshots for board changes.

For nontrivial changes, update decision notes with the code using `{status}/{category}/yyyy-mm-dd-topic.md` under `.agents/notes/`. Preserve archived snapshots and commit archive seal files together. Exclude generated `board.html` and `demo.html`.
