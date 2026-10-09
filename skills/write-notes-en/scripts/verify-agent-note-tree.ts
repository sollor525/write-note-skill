/**
 * Verify tree: lifecycle/class/filename/INDEX and internal relative markdown links.
 * Run: npx tsx <skill-dir>/scripts/verify-agent-note-tree.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { agentNoteRoot, walkAgentNoteTree } from "./agent-note-tree.ts";

const { notes, errors } = walkAgentNoteTree();

// Check relative markdown links inside active notes
const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;

for (const note of notes) {
  const noteFullPath = resolve(agentNoteRoot, note.rel);
  const content = readFileSync(noteFullPath, "utf8");
  let match: RegExpExecArray | null;

  while ((match = LINK_REGEX.exec(content)) !== null) {
    const rawTarget = match[2]?.trim();
    if (!rawTarget) continue;

    // Ignore web links, intra-page anchors and ellipsis placeholders
    if (rawTarget.startsWith("http://") || rawTarget.startsWith("https://") || rawTarget.startsWith("#") || rawTarget.startsWith("mailto:") || rawTarget.includes("…")) {
      continue;
    }

    // Strip anchor fragment if present
    const fileTarget = rawTarget.split("#")[0];
    if (!fileTarget) continue;

    const resolvedTarget = resolve(dirname(noteFullPath), fileTarget);

    // Only verify internal links within agentNoteRoot (boundary-aware: a
    // sibling like .agents/notes-backup/ must not prefix-match)
    if (!resolvedTarget.startsWith(agentNoteRoot + sep)) {
      continue;
    }

    if (!existsSync(resolvedTarget)) {
      errors.push(`link: ${note.rel} -> "${rawTarget}" target file does not exist`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(e);
  process.exit(1);
}

// A green gate on an empty or misconfigured root is worse than a red one: it
// tells an agent "verified" while nothing was ever checked.
if (notes.length === 0) {
  console.error(`tree: no Agent Notes found under ${agentNoteRoot} — nothing was verified.`);
  console.error("tree: run from the host project root, or point AGENT_NOTE_ROOT at the notes directory.");
  process.exit(1);
}

console.log(`ok: ${notes.length} note(s) tree and relative links verified`);
