/**
 * Language / extension brand colors — single source of truth.
 * Used by MentionDropdown and any other component
 * that needs to show a color badge for a file extension.
 */
const EXTENSION_COLORS: Record<string, string> = {
  ts: '#3178c6',
  tsx: '#61dafb',
  js: '#f7df1e',
  jsx: '#61dafb',
  css: '#2563eb',
  scss: '#cd6799',
  html: '#e34f26',
  json: '#f59e0b',
  md: '#6b7280',
  py: '#3776ab',
  rs: '#dea584',
  go: '#00add8',
  java: '#b07219',
  sql: '#e38c00',
  yaml: '#cb171e',
  yml: '#cb171e',
  xml: '#e34f26',
  svg: '#ff9a00',
  png: '#ec4899',
  jpg: '#f97316',
  gif: '#8b5cf6',
  ico: '#6366f1',
  pdf: '#ef4444',
  txt: '#6b7280',
};

/** Look up the brand color for a given file extension. */
export function getExtensionColor(ext: string): string {
  return EXTENSION_COLORS[ext.toLowerCase()] ?? '#6b7280';
}
