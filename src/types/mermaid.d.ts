declare module 'mermaid' {
  export function initialize(config: Record<string, unknown>): void;
  export function render(id: string, code: string): Promise<{ svg: string }>;
  export function run(options?: { nodes?: Element[] }): Promise<void>;
  export default { initialize, render, run };
}
