# Agent Note: Resolve complete note anchor paths within the configured root

Status: implemented

## Problem

The suffix matcher introduced at `10437fa` could treat a nonexistent absolute path as a reference to a different existing note. It also missed short repo-relative and file-relative paths. Excluding every `test-gates.mjs` hid genuine host references, while the basename fallback could let a wrong lifecycle or class suppress an unanchored-note warning.

## Decision

Extract the first Markdown path after a source comment's Note marker without discarding its prefix. Resolve absolute paths directly and relative paths against the host working directory and the source file's directory. Normalize dot segments, require containment within `AGENT_NOTE_ROOT`, and accept only one existing candidate. Missing, outside-root and ambiguous paths produce advisory diagnostics and never satisfy a note's incoming reference. Counts include resolved references only; identity is the complete root-relative path.

Scan supported source filenames uniformly, including `test-gates.mjs`. Construct fixture markers from separate strings so the repository's own examples do not require a host-wide exemption. Keep the soft report and existing source-root environment variables.

## Ownership audit

This partially supersedes the anchor rationale in [archive body validation and anchor roots](2026-10-15-archive-body-gate-and-anchor-root.md). That note retains the rejected suffix rationale and remains authoritative for archive validation, so it is neither deleted nor archived. The [review disposition](../process/2026-10-15-write-notes-en-review-findings.md) remains the completed checklist. Earlier parser, archive and seal notes retain their separate scope; no archive semantics change here.

## Alternatives considered

- **Keep suffix matching and broaden the regex**: a smaller patch would recognize short paths, but could still substitute an existing note for an unrelated path. Full path resolution is needed to preserve identity.
- **Exclude this repository's test filename**: removes fixture noise cheaply, but the installed checker then misses real host references under that name. Constructing the fixture marker locally avoids that leak.
- **Parse each source language**: would distinguish comments from strings, but introduces language-specific dependencies for an optional report. Keep the documented text scan and avoid claiming syntax-level precision.

## Consequences

Custom note roots and all three path bases work without suffix substitution. Relative paths resolving to two existing targets require an explicit absolute path. Paths containing spaces require quotes or backticks. The checker reads one source file at a time, limits traversal to 12 levels, warns on scan/read errors and shows at most 20 entries per diagnostic group.

This remains a lexical path and line-based advisory check, not a filesystem security boundary or a language parser. It does not infer references from filenames or force hosts to add anchors.

## Verification

`npm run test-gates` passes 130 assertions, including 19 added cases for short and parent-relative paths, absolute paths, normalization, Markdown fragments, quoted spaces, outside-root targets, prefix collisions, wrong lifecycle/class, ordinary `test-gates.mjs` files, ambiguity, multiple source roots and the legacy variable. Ten new scenarios failed against the prior implementation before this fix. Shared files are synchronized between both editions.
