import { mkdtempSync, readdirSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { vi, describe, it, expect, afterAll } from 'vitest';

const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'auraxis-att-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
}));

import {
  attachmentMimeFor,
  isReadableImage,
  storeAttachment,
  attachmentDataUrl,
  MAX_ATTACHMENT_BYTES,
} from '../attachments';

describe('attachments — 内容寻址附件存储', () => {
  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('按扩展名识别 MIME，只把 image/* 视为可读图片', () => {
    expect(attachmentMimeFor('a.png')).toBe('image/png');
    expect(attachmentMimeFor('A.JPEG')).toBe('image/jpeg');
    expect(attachmentMimeFor('doc.pdf')).toBe('application/pdf');
    expect(attachmentMimeFor('main.ts')).toBeNull();
    expect(isReadableImage('shot.png')).toBe(true);
    expect(isReadableImage('doc.pdf')).toBe(false);
  });

  it('相同字节只落一份文件（内容寻址去重）', async () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const a = await storeAttachment(buf, 'image/png');
    const b = await storeAttachment(buf, 'image/png');
    expect(a.id).toBe(b.id);
    expect(a.bytes).toBe(buf.length);
    const files = readdirSync(path.join(tmpRoot, 'attachments'));
    expect(files).toEqual([`${a.id}.bin`]);
  });

  it('拒绝超大附件', async () => {
    const big = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 1);
    await expect(storeAttachment(big, 'image/png')).rejects.toThrow(/过大/);
  });

  it('生成 data URL', () => {
    const url = attachmentDataUrl(Buffer.from('hi', 'utf8'), 'text/plain');
    expect(url).toBe(`data:text/plain;base64,${Buffer.from('hi', 'utf8').toString('base64')}`);
  });
});
