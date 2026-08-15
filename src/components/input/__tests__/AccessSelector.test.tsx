// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';
import AccessSelector from '../AccessSelector';

describe('AccessSelector — 访问权限面板', () => {
  it('renders the current access level on the compact pill', () => {
    const { getByRole } = render(<AccessSelector accessMode="workspace-write" onChangeAccess={() => {}} />);
    expect(getByRole('button', { name: '访问权限' }).textContent).toContain('工作区写入');
  });

  it('opens a radio-style panel and selects a non-full level immediately', async () => {
    const onChange = vi.fn();
    const { getByRole } = render(<AccessSelector accessMode="read" onChangeAccess={onChange} />);
    fireEvent.click(getByRole('button', { name: '访问权限' }));

    await waitFor(() => {
      expect(document.body.querySelectorAll('[role="menuitemradio"]')).toHaveLength(3);
    });
    expect(document.body.textContent).toContain('仅读取项目与安全命令，不能写入文件');
    expect(document.body.textContent).toContain('可写任意文件、执行任意命令，无沙箱边界');

    const writeRow = [...document.querySelectorAll('[role="menuitemradio"]')].find(
      (b) => b.textContent?.includes('工作区写入'),
    )!;
    fireEvent.click(writeRow);
    expect(onChange).toHaveBeenCalledWith('workspace-write');
  });

  it('requires risk confirmation before switching to full access', async () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <App>
        <AccessSelector accessMode="workspace-write" onChangeAccess={onChange} />
      </App>,
    );
    fireEvent.click(getByRole('button', { name: '访问权限' }));

    await waitFor(() => {
      expect(document.body.querySelectorAll('[role="menuitemradio"]')).toHaveLength(3);
    });
    const fullRow = [...document.querySelectorAll('[role="menuitemradio"]')].find(
      (b) => b.textContent?.includes('完全访问'),
    )!;
    fireEvent.click(fullRow);

    await waitFor(() => {
      expect(document.body.textContent).toContain('我已了解风险，继续');
    });
    expect(onChange).not.toHaveBeenCalled();

    const ackBtn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('我已了解风险，继续'),
    )!;
    fireEvent.click(ackBtn);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('full');
    });
  });
});
