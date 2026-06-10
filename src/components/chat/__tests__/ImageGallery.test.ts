import { describe, it, expect } from 'vitest';
import { extractImageUrls, stripImageBlocks } from '../ImageGallery';

describe('ImageGallery helpers', () => {
  it('extracts data-URL images and markdown images, deduped', () => {
    const data = 'data:image/png;base64,AAAA';
    const content = `【图片: a.png】\n${data}\n\n看这张图 ![alt](https://x.com/a.png) 和 ![alt](https://x.com/a.png)`;
    const urls = extractImageUrls(content);
    expect(urls).toContain(data);
    expect(urls.filter((u) => u === 'https://x.com/a.png')).toHaveLength(1);
  });

  it('strips raw image blocks from display text', () => {
    const data = 'data:image/png;base64,AAAA';
    const cleaned = stripImageBlocks(`说明文字\n【图片: a.png】\n${data}\n后续文字`);
    expect(cleaned).toContain('说明文字');
    expect(cleaned).toContain('后续文字');
    expect(cleaned).not.toContain('data:image');
  });
});
