/** Collapse whitespace and clamp a single line for the collapsed header. */
export function truncateLine(line: string, max = 72): string {
  const trimmed = line.replace(/\s+/g, ' ').trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * Think-row summary: while streaming follow the latest non-empty
 * line; once settled fall back to the stable first non-empty line.
 */
export function thinkingSummary(content: string, streaming: boolean): string {
  const lines = content
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return truncateLine(content);
  return truncateLine(streaming ? lines[lines.length - 1] : lines[0]);
}
