// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import PluginsPanel from '../PluginsPanel';
import { usePluginStore } from '@/stores/usePluginStore';

describe('PluginsPanel — 插件面板按钮', () => {
  beforeEach(() => {
    usePluginStore.setState({ installedPlugins: [], activePlugins: [] } as any);
  });

  it('renders the panel with action buttons', () => {
    const { container } = render(<PluginsPanel />);
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('插件');
  });
});
