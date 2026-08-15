/**
 * attachments.ts — durable, content-addressed attachment storage.
 *
 * Files the agent reads into the conversation (images first) are stored once
 * under userData/attachments keyed by their SHA-256. Two reads of the same
 * bytes share one file, and the id is stable across sessions so a later
 * tool call can reference the same attachment without re-uploading.
 */
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { app } from 'electron';

export interface StoredAttachment {
  id: string;
  sha256: string;
  mime: string;
  bytes: number;
  filePath: string;
}

export const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

export function attachmentMimeFor(filePath: string): string | null {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? null;
}

export function isReadableImage(filePath: string): boolean {
  const mime = attachmentMimeFor(filePath);
  return !!mime && mime.startsWith('image/');
}

function attachmentDir(): string {
  return path.join(app.getPath('userData'), 'attachments');
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export async function storeAttachment(buf: Buffer, mime: string): Promise<StoredAttachment> {
  if (buf.length === 0) throw new Error('附件为空');
  if (buf.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`附件过大（${buf.length} 字节，上限 ${MAX_ATTACHMENT_BYTES} 字节）`);
  }
  if (!mime || !mime.includes('/')) throw new Error('附件 MIME 类型无效');
  const id = sha256(buf);
  const dir = attachmentDir();
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${id}.bin`);
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, buf, { flag: 'wx' });
  }
  return { id, sha256: id, mime, bytes: buf.length, filePath };
}

export function attachmentDataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}
