import { describe, expect, it } from 'vitest';
import { parseExitMarker } from '../bash-session';

describe('bash-session exit marker', () => {
  it('parses a clean exit code and strips the marker', () => {
    const parsed = parseExitMarker('hello\nworld\n__AURAXIS_EXIT_0__\n');
    expect(parsed).toEqual({ exitCode: 0, text: 'hello\nworld' });
  });

  it('parses a non-zero exit code', () => {
    const parsed = parseExitMarker('boom\n__AURAXIS_EXIT_2__\n');
    expect(parsed?.exitCode).toBe(2);
    expect(parsed?.text).toBe('boom');
  });

  it('returns null when the marker is absent', () => {
    expect(parseExitMarker('no marker here')).toBeNull();
  });

  it('ignores the unexpanded marker echoed in the command line and uses the last real marker', () => {
    const parsed = parseExitMarker(
      '$ { eval \'ls\'; } 2>&1; echo -e "\\n__AURAXIS_EXIT_$?__"\nreal output\n__AURAXIS_EXIT_0__',
    );
    expect(parsed?.exitCode).toBe(0);
    expect(parsed?.text).toContain('real output');
    expect(parsed?.text).not.toContain('__AURAXIS_EXIT_0__');
  });
});
