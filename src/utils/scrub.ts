/**
 * Strip absolute agent-workspace sandbox paths from text that gets fed back
 * into a new prompt. Leaving them in lures the model into exploring the
 * agent-workspaces graveyard ("让我看看之前的项目…" → ls of dozens of dirs).
 */
export function scrubSandboxPaths(text: string): string {
  return text.replace(
    /(?:(?:[A-Za-z]:[\\/])|\/)[^\s'"，。）)]*agent-workspaces[\\/][^\s'"，。）)]*/g,
    '（沙箱内部路径）',
  );
}
