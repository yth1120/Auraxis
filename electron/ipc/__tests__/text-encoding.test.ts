import { describe, it, expect } from 'vitest';
import * as iconv from 'iconv-lite';
import { createOutputDecoder } from '../../text-encoding';

describe('createOutputDecoder — UTF-8 / GBK 智能解码', () => {
  it('decodes pure UTF-8 streams without mojibake', () => {
    const d = createOutputDecoder();
    expect(d.decode(Buffer.from('结果: 22 通过, 0 失败', 'utf8'))).toBe('结果: 22 通过, 0 失败');
    expect(d.flush()).toBe('');
  });

  it('decodes pure GBK streams (cmd.exe built-ins)', () => {
    const d = createOutputDecoder();
    expect(d.decode(iconv.encode('结果: 22 通过', 'gbk'))).toBe('结果: 22 通过');
    expect(d.flush()).toBe('');
  });

  it('reassembles UTF-8 characters split across chunks', () => {
    const d = createOutputDecoder();
    const buf = Buffer.from('你好 Auraxis', 'utf8');
    const first = d.decode(buf.subarray(0, 2)); // splits 你 (E4 BD A0)
    const rest = d.decode(buf.subarray(2));
    expect(first + rest).toBe('你好 Auraxis');
    expect(d.flush()).toBe('');
  });

  it('reassembles GBK characters split across chunks', () => {
    const d = createOutputDecoder();
    const buf = iconv.encode('结果', 'gbk'); // 4 bytes, split at 1
    const first = d.decode(buf.subarray(0, 1));
    const rest = d.decode(buf.subarray(1));
    // Short GBK streams stay buffered until the encoding is decided; the
    // final output arrives on the end-of-stream flush.
    expect(first + rest + d.flush()).toBe('结果');
  });

  it('flush decides the encoding and decodes buffered output at end-of-stream', () => {
    const d = createOutputDecoder();
    const out = d.decode(iconv.encode('测', 'gbk'));
    expect(out + d.flush()).toBe('测');
  });
});
