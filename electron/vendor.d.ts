/**
 * Ambient declarations for dependency packages that do not ship TypeScript
 * types (main process only). Kept intentionally minimal.
 */
declare module 'mammoth' {
  const mammoth: {
    extractRawText(input: { buffer: Buffer }): Promise<{ value: string }>;
    convertToHtml(input: { buffer: Buffer }): Promise<{ value: string }>;
  };
  export default mammoth;
}
