import { useState, useEffect, useMemo, useCallback } from 'react';
import { Input, Tag, Rate, Button, Space, Tooltip, Modal, message } from 'antd';
import {
  MagnifyingGlass as SearchOutlined,
  Tray as InboxOutlined,
  Lightbulb as BulbOutlined,
  WarningCircle as ExclamationCircleOutlined,
  TreeStructure as ApartmentOutlined,
  Star as StarOutlined,
  ArrowsClockwise as SyncOutlined,
  FileText as FileTextOutlined,
  Export as ExportOutlined,
} from '@/components/common/icons'
import { useMemoryStore } from '../../stores/useMemoryStore';
import { useChatStore } from '../../stores/useChatStore';
import clsx from 'clsx';
import EmptyState from '../common/EmptyState';
import { useT, type I18nKey } from '../../i18n';

const TYPE_CONFIG: Record<string, { labelKey: I18nKey; color: string; chip: string; icon: React.ReactNode }> = {
  decision: {
    labelKey: 'mem.type.decision', color: 'var(--color-violet)',
    chip: 'bg-[var(--color-violet-soft)] text-[var(--color-violet)] border-[var(--color-violet-border)]', icon: <StarOutlined />,
  },
  problem: {
    labelKey: 'mem.type.problem', color: 'var(--color-danger)',
    chip: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger-border)]', icon: <ExclamationCircleOutlined />,
  },
  architecture: {
    labelKey: 'mem.type.architecture', color: 'var(--color-primary)',
    chip: 'bg-[var(--color-primary-soft)] text-[var(--color-primary)] border-[var(--color-primary-border)]', icon: <ApartmentOutlined />,
  },
  preference: {
    labelKey: 'mem.type.preference', color: 'var(--color-warning)',
    chip: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning-border)]', icon: <BulbOutlined />,
  },
  progress: {
    labelKey: 'mem.type.progress', color: 'var(--color-success)',
    chip: 'bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success-border)]', icon: <SyncOutlined />,
  },
  context: {
    labelKey: 'mem.type.context', color: 'var(--color-text-faint)',
    chip: 'bg-[var(--color-bg-secondary)] text-text-secondary border-[var(--color-border-dim)]', icon: <FileTextOutlined />,
  },
};

const FILTER_KEYS = ['all', 'decision', 'problem', 'architecture', 'preference', 'progress', 'context'] as const;
type FilterKey = typeof FILTER_KEYS[number];
const FILTER_LABELS: Record<FilterKey, I18nKey> = {
  all: 'mem.filter.all', decision: 'mem.type.decision', problem: 'mem.type.problem', architecture: 'mem.type.architecture',
  preference: 'mem.type.preference', progress: 'mem.type.progress', context: 'mem.type.context',
};

export default function MemoryPanel() {
  const t = useT();
  const activeMemories = useMemoryStore((s) => s.activeMemories);
  const loadMemories = useMemoryStore((s) => s.loadMemories);
  const searchMemories = useMemoryStore((s) => s.searchMemories);
  const archiveMemory = useMemoryStore((s) => s.archiveMemory);
  const deleteMemory = useMemoryStore((s) => s.deleteMemory);
  const searchResults = useMemoryStore((s) => s.searchResults);
  const searchQuery = useMemoryStore((s) => s.searchQuery);

  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const projectPath = useChatStore((s) => s.currentProjectPath)
    || 'default';

  useEffect(() => {
    loadMemories(projectPath);
  }, [projectPath, loadMemories]);

  const handleSearch = useCallback((val: string) => {
    setSearchText(val);
    if (val.trim()) {
      searchMemories(projectPath, val);
    }
  }, [projectPath, searchMemories]);

  const displayList = useMemo(() => {
    const source = searchText.trim() ? searchResults : activeMemories;
    return filter === 'all' ? source : source.filter((m) => m.type === filter);
  }, [searchText, searchResults, activeMemories, filter]);

  const handleArchive = useCallback((id: string) => {
    Modal.confirm({
      title: t('mem.archiveTitle'),
      content: t('mem.archiveBody'),
      okText: t('mem.archive'),
      cancelText: t('mem.cancel'),
      onOk: () => archiveMemory(id),
    });
  }, [archiveMemory]);

  const handleDelete = useCallback((id: string) => {
    Modal.confirm({
      title: t('mem.deleteTitle'),
      content: t('mem.deleteBody'),
      okText: t('mem.confirmDelete'),
      cancelText: t('mem.cancel'),
      okButtonProps: { danger: true },
      onOk: () => deleteMemory(id),
    });
  }, [deleteMemory]);

  const handleExportAll = useCallback(() => {
    const data = JSON.stringify(activeMemories, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memories-${projectPath.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
      message.success(t('mem.exported'));
  }, [activeMemories, projectPath]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-dim)] shrink-0">
        <span className="text-sm font-medium text-text-primary flex items-center gap-2">
    <InboxOutlined /> {t('mem.projectMemory')}
        </span>
        <Space size={4}>
    <Tooltip title={t('mem.exportAll')}>
            <Button type="text" size="small" icon={<ExportOutlined />} onClick={handleExportAll} />
          </Tooltip>
        </Space>
      </div>

      <div className="px-3 py-2 shrink-0">
        <Input
          prefix={<SearchOutlined className="text-muted" />}
      placeholder={t('mem.searchPlaceholder')}
          value={searchText}
          onChange={(e) => handleSearch(e.target.value)}
          allowClear
          size="small"
          className="text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-1 px-3 pb-2 shrink-0">
        {FILTER_KEYS.map((key) => (
          <button
            key={key}
            className={clsx(
              'px-2 py-1 border border-dim rounded-full bg-transparent text-secondary text-xs cursor-pointer transition-colors duration-150 hover:border-primary hover:text-text-primary',
              filter === key && 'bg-accent-soft border-primary text-text-primary font-semibold'
            )}
            onClick={() => setFilter(key)}
          >
            {t(FILTER_LABELS[key])}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {displayList.length === 0 ? (
          <EmptyState
      title={searchText.trim() ? t('mem.emptyTitle') : t('mem.emptyNoData')}
      description={searchText.trim() ? t('mem.emptyHintSearch') : t('mem.emptyHintDefault')}
          />
        ) : (
          displayList.map((m) => {
            const cfg = TYPE_CONFIG[m.type] || TYPE_CONFIG.context;
            const isExpanded = expandedId === m.id;
            const tags: string[] = (() => { try { return JSON.parse(m.tags || '[]'); } catch { return []; } })();

            return (
              <div
                key={m.id}
                className={clsx(
                  'px-3 py-2 rounded-md mb-2 bg-secondary border border-dim cursor-pointer transition-colors duration-fast hover:bg-accent-soft',
                  isExpanded && 'border-primary'
                )}
                onClick={() => toggleExpand(m.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={clsx('inline-flex items-center gap-1 rounded-full h-[18px] px-1.5 text-2xs font-medium border', cfg.chip)}>
                      {cfg.icon} {t(cfg.labelKey)}
                    </span>
                    <span className="text-sm font-medium text-text-primary truncate">{m.title}</span>
                  </div>
                  <div className="shrink-0 ml-2">
                    <Rate disabled value={m.importance} count={5} style={{ fontSize: 10 }} />
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-2 pt-2 border-t border-[var(--color-border-dim)]">
                    <p className="m-0 mb-2 text-xs leading-[1.6] text-secondary whitespace-pre-wrap break-word">{m.content}</p>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {tags.map((t) => (
                          <Tag key={t} style={{ fontSize: 10 }}>{t}</Tag>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-muted mb-1">
                      {new Date(m.timestamp).toLocaleString()}
                    </div>
                    <div className="flex gap-1">
                      <Button size="small" type="text" onClick={(e) => { e.stopPropagation(); handleArchive(m.id); }}>
      {t('mem.archiveAction')}
                      </Button>
                      <Button size="small" type="text" danger onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}>
      {t('mem.deleteAction')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
