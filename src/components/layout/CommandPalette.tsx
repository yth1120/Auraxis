import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Input, Modal } from 'antd';
import {
  MagnifyingGlass as SearchOutlined,
  Lightning as ThunderboltOutlined,
  Stop as StopOutlined,
  SidebarSimple as MenuFoldOutlined,
  PlusCircle as PlusCircleOutlined,
  ArrowUUpLeft as UndoOutlined,
} from '@/components/common/icons'
import clsx from 'clsx';
import { useT } from '../../i18n';
import { useChatStore } from '../../stores/useChatStore';
import { useAppStore } from '../../stores/useAppStore';
import { useAgentStore } from '../../stores/useAgentStore';
import { useUndoStore } from '../../stores/useUndoStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { executeCommand, createAgent } from '../../constants/commands';
import { listSlashCommands, findPluginCommand } from '../../utils/slashCommands';

interface CommandItem {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  shortcut?: string;
  searchText: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<any>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Esc must close the palette even before the input gains focus — the global
  // app shortcut handler skips Escape while an input is focused, so relying on
  // antd's panel-level keydown alone is timing-dependent.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const items = useMemo((): CommandItem[] => {
    const all: CommandItem[] = [];

    // ── Slash commands (read from the unified registry) ──
    for (const cmd of listSlashCommands()) {
      all.push({
        id: `cmd-${cmd.name}`,
        icon: <ThunderboltOutlined />,
        title: `/${cmd.name}`,
        description: cmd.description,
        searchText: `${cmd.name} ${cmd.description}`,
        action: () => {
          const execCtx = {
            clearMessages: () => useChatStore.getState().clearMessages(),
            setSelectedModel: (model: string) => useChatStore.getState().setSelectedModel(model),
            setInputValue: (value: string) => useChatStore.getState().setInputValue(value),
            toggleTheme: () => useAppStore.getState().toggleTheme(),
            theme: useAppStore.getState().theme,
          };
          let executed = executeCommand(cmd.name, '', execCtx);
          if (!executed) {
            const pluginCmd = findPluginCommand(cmd.name);
            try { if (pluginCmd) executed = pluginCmd.execute('', execCtx); } catch { /* surface as fill-in */ }
          }
          if (!executed) {
            useChatStore.getState().setInputValue(`/${cmd.name} `);
            useChatStore.getState().requestComposerFocus();
          }
          onClose();
        },
      });
    }

    // ── Agent actions (hidden in chat mode — pure conversation surface) ──
    if (useAppStore.getState().sidebarMode !== 'chat') {
      all.push(
        { id: 'agent-create-explore', icon: <PlusCircleOutlined />, title: '创建 Agent (Explore)', description: '浏览和搜索代码', searchText: 'agent 创建 explore 探索 搜索', action: () => { void createAgent({ name: 'Explore Agent', type: 'Explore' }).then((id) => { if (id) useAgentStore.getState().setCurrentAgent(id); }); onClose(); } },
        { id: 'agent-create-plan', icon: <PlusCircleOutlined />, title: '创建 Agent (Plan)', description: '设计实现方案', searchText: 'agent 创建 plan 计划 方案', action: () => { void createAgent({ name: 'Plan Agent', type: 'Plan' }).then((id) => { if (id) useAgentStore.getState().setCurrentAgent(id); }); onClose(); } },
        { id: 'agent-create-gp', icon: <PlusCircleOutlined />, title: '创建 Agent (General)', description: '全功能执行', searchText: 'agent 创建 general 通用', action: () => { void createAgent({ name: 'General Agent', type: 'general-purpose' }).then((id) => { if (id) useAgentStore.getState().setCurrentAgent(id); }); onClose(); } },
      );
    }

    // ── Keyboard shortcuts ──
    all.push(
      { id: 'shortcut-clear', icon: <ThunderboltOutlined />, title: '清空对话', description: '清除所有消息', shortcut: 'Ctrl+L', searchText: '清空 对话 清除', action: () => { useChatStore.getState().clearMessages(); onClose(); } },
      { id: 'shortcut-sidebar', icon: <MenuFoldOutlined />, title: '切换侧边栏', description: '展开/收起侧边栏', shortcut: 'Ctrl+B', searchText: '侧边栏 切换 展开', action: () => { useAppStore.getState().toggleSidebar(); onClose(); } },
      { id: 'shortcut-undo', icon: <UndoOutlined />, title: '撤销操作', description: '撤销最近一次文件修改或消息删除', shortcut: 'Ctrl+Z', searchText: '撤销 undo 恢复', action: () => { const { undoLast, undos } = useUndoStore.getState(); if (undos.length > 0) undoLast(); onClose(); } },
      { id: 'shortcut-stop', icon: <StopOutlined />, title: '停止生成', description: '中止当前流式输出', shortcut: 'Esc', searchText: '停止 中止 生成', action: () => { useChatStore.getState().stopStreaming(); onClose(); } },
    );

    return all;
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items
      .map((item) => {
        let score = 0;
        const title = item.title.toLowerCase();
        const desc = item.description.toLowerCase();
        const search = item.searchText.toLowerCase();
        if (title === q) score += 100;
        else if (title.startsWith(q)) score += 60;
        else if (title.includes(q)) score += 40;
        else if (search.includes(q)) score += 20;
        else if (desc.includes(q)) score += 10;
        return { item, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }, [items, query]);

  useEffect(() => {
    setSelected(0);
  }, [filtered]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((p) => Math.min(p + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((p) => Math.max(p - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[selected]?.action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [filtered, selected, onClose]);

  const modal = (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={560}
      centered
      className="command-palette-modal"
      styles={{ mask: { background: 'rgba(0,0,0,0.45)' }, body: { padding: 0 } }}
    >
      <div className="pt-4 px-4">
        <Input
          ref={inputRef}
          prefix={<SearchOutlined className="text-muted" />}
          placeholder={t('palette.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          bordered={false}
          size="large"
          className="text-lg"
        />
      </div>
      <div className="max-h-[320px] overflow-y-auto p-2 pb-4">
        {filtered.length === 0 ? (
          <div className="text-center p-6 text-muted text-sm">
            {t('palette.empty')}
          </div>
        ) : (
          filtered.map((item, i) => (
            <div
              key={item.id}
              onClick={item.action}
              onMouseEnter={() => setSelected(i)}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors duration-fast ease-out',
                i === selected ? 'bg-accent-soft' : 'hover:bg-accent-soft',
              )}
            >
              <span className="text-lg text-secondary w-[22px] text-center shrink-0">
                {item.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary">
                  {item.title}
                </div>
                <div className="text-2xs text-muted mt-1">
                  {item.description}
                </div>
              </div>
              {item.shortcut && (
                <span className="font-mono text-2xs text-muted bg-primary-soft py-1 px-2 rounded-md whitespace-nowrap">
                  {item.shortcut}
                </span>
              )}
            </div>
          ))
        )}
      </div>
      <div className="border-t border-dim p-2 px-4 flex gap-4 text-2xs text-muted">
        <span><kbd className="bg-primary-soft px-1.5 py-0.5 rounded-md">↑↓</kbd> 导航</span>
        <span><kbd className="bg-primary-soft px-1.5 py-0.5 rounded-md">Enter</kbd> 选择</span>
        <span><kbd className="bg-primary-soft px-1.5 py-0.5 rounded-md">Esc</kbd> 关闭</span>
      </div>
    </Modal>
  );

  return createPortal(modal, document.body);
}
