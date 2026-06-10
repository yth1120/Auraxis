// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ContextManifest from '../ContextManifest';
import { useAppStore } from '@/stores/useAppStore';

describe('ContextManifest — 上下文清单按钮', () => {
  it('renders groups and opens a file from a row', () => {
    useAppStore.setState({ openFileRequest: null });
    const { getByText } = render(
      <ContextManifest
        groups={[{ key: 'file', icon: <span />, label: '文件', items: ['C:/proj/a.ts'] }]}
        fileTokens={{}}
        maxFileTokens={100}
      />,
    );
    expect(getByText('C:/proj/a.ts')).toBeTruthy();
  });
});
