import { describe, expect, it } from 'vitest';
import { parseAnsiLines } from '../ansi';

describe('parseAnsiLines', () => {
  it('keeps plain output as single uncolored spans', () => {
    const lines = parseAnsiLines('hello\nworld\n');
    expect(lines.map((l) => l.map((s) => s.text).join(''))).toEqual(['hello', 'world', '']);
    expect(lines[0][0]?.style).toBeUndefined();
  });

  it('resolves SGR colors into inline styles', () => {
    const lines = parseAnsiLines('\x1b[31mred\x1b[0m plain');
    expect(lines[0].map((s) => s.text)).toEqual(['red', ' plain']);
    expect(lines[0][0]?.style?.color).toBe('#F87171');
  });

  it('replays carriage returns like a terminal', () => {
    const lines = parseAnsiLines('100%\rOK\n');
    expect(lines[0].map((s) => s.text).join('')).toBe('OK0%');
  });

  it('strips OSC sequences', () => {
    const lines = parseAnsiLines('\x1b]0;title\x07visible\n');
    expect(lines[0].map((s) => s.text).join('')).toBe('visible');
  });

  it('drops an empty trailing newline line', () => {
    const lines = parseAnsiLines('a\nb\n\n');
    // The parser keeps empty lines; the consumer (TerminalBlock) trims the terminator.
    expect(lines.length).toBe(4);
    expect(lines[3]).toEqual([]);
  });
});
