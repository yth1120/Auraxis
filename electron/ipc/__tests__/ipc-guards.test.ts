import { describe, it, expect } from 'vitest';
import { assertString, assertObject } from '../shared';

// These guards run at the renderer→main IPC trust boundary. On bad input they
// throw, and each handler's try/catch turns that into IpcResponse{ ok:false }.

describe('assertString', () => {
  it('accepts a non-empty string', () => {
    expect(() => assertString('hello', 'x')).not.toThrow();
  });

  it('rejects an empty string by default', () => {
    expect(() => assertString('', 'x')).toThrow(/非空字符串/);
  });

  it('accepts an empty string when allowEmpty is set (e.g. file content)', () => {
    expect(() => assertString('', 'content', true)).not.toThrow();
  });

  it('rejects non-string values', () => {
    expect(() => assertString(42 as unknown, 'x')).toThrow();
    expect(() => assertString(null as unknown, 'x')).toThrow();
    expect(() => assertString(undefined as unknown, 'x')).toThrow();
    expect(() => assertString({} as unknown, 'x')).toThrow();
    expect(() => assertString(['a'] as unknown, 'x')).toThrow();
  });

  it('includes the parameter name in the error', () => {
    expect(() => assertString(undefined as unknown, 'filePath')).toThrow(/filePath/);
  });
});

describe('assertObject', () => {
  it('accepts a plain object', () => {
    expect(() => assertObject({ a: 1 }, 'p')).not.toThrow();
  });

  it('rejects arrays (a common malformed-payload case)', () => {
    expect(() => assertObject([], 'p')).toThrow();
  });

  it('rejects null and undefined', () => {
    expect(() => assertObject(null, 'p')).toThrow();
    expect(() => assertObject(undefined, 'p')).toThrow();
  });

  it('rejects primitives', () => {
    expect(() => assertObject('x', 'p')).toThrow();
    expect(() => assertObject(7, 'p')).toThrow();
  });

  it('includes the parameter name in the error', () => {
    expect(() => assertObject(null, 'payload')).toThrow(/payload/);
  });
});
