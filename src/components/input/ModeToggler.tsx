import { forwardRef, memo, useEffect } from 'react';
import { Brain, CaretDown, Check as CheckIcon, Gauge } from '@/components/common/icons';
import { useChatStore } from '../../stores/useChatStore';
import { BUILT_IN_MODELS } from '../../types/chat';
import clsx from 'clsx';
import { useT, type I18nKey } from '../../i18n';
import type { ReactNode } from 'react';

type ThinkingLevel = 'low' | 'medium' | 'high';

const THINKING_LEVELS: { key: ThinkingLevel; labelKey: I18nKey; descKey: I18nKey }[] = [
  { key: 'low', labelKey: 'think.low', descKey: 'think.low.desc' },
  { key: 'medium', labelKey: 'think.medium', descKey: 'think.medium.desc' },
  { key: 'high', labelKey: 'think.high', descKey: 'think.high.desc' },
];

function modelName(modelId: string): string {
  return BUILT_IN_MODELS.find((m) => m.id === modelId)?.name ?? modelId;
}

function modelDescriptionKey(modelId: string): I18nKey {
  return modelId === 'deepseek-v4-flash' ? 'model.desc.flash' : 'model.desc.pro';
}

const ChevronDown = ({ open }: { open?: boolean }) => (
  <CaretDown
    size={12}
    className={clsx('shrink-0 text-text-muted transition-transform duration-200 ease-out', open && 'rotate-180')}
  />
);

const Check = () => (
  <CheckIcon size={16} className="shrink-0 text-text-primary" />
);

/* ── Trigger button (28px 胶囊按钮) ── */

interface ModeTriggerProps {
  onClick: (e: React.MouseEvent) => void;
  open?: boolean;
}

export const ModeTrigger = memo(
  forwardRef<HTMLButtonElement, ModeTriggerProps>(function ModeTrigger({ onClick, open }, ref) {
    const t = useT();
    const selectedModel = useChatStore((s) => s.selectedModel);
    const reasoningEffort = useChatStore((s) => s.reasoningEffort);
    const effort = THINKING_LEVELS.find((l) => l.key === reasoningEffort);

    return (
      <button
        ref={ref}
        className="inline-flex items-center gap-1 h-8 max-w-[220px] pl-2 pr-1 border-none rounded-full bg-transparent text-text-secondary font-body text-sm leading-5 font-medium cursor-pointer whitespace-nowrap transition-colors duration-150 ease-out hover:bg-[var(--color-hover)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
        onClick={onClick}
        type="button"
        aria-label={t('model.switch')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{modelName(selectedModel)}</span>
        <span className="shrink-0 text-text-muted">/ {effort ? t(effort.labelKey) : t('think.medium')}</span>
        <ChevronDown open={open} />
      </button>
    );
  }),
);

/* ── Single-pane dropdown panel: all models + thinking depth ── */

interface ModePanelProps {
  contentOnly?: boolean;
  onSelect?: () => void;
}

export const ModePanelContent = memo(function ModePanelContent({ onSelect }: { onSelect?: () => void }) {
  const t = useT();
  const selectedModel = useChatStore((s) => s.selectedModel);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);
  const reasoningEffort = useChatStore((s) => s.reasoningEffort);
  const setReasoningEffort = useChatStore((s) => s.setReasoningEffort);

  // Escape closes the whole menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onSelect?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSelect]);

  const optionCls = 'flex items-center gap-2 w-full min-h-[32px] px-2 py-[4px] border-none rounded-lg bg-transparent text-left cursor-pointer transition-colors duration-150 hover:bg-[var(--color-hover)]';

  const sectionHeader = (icon: ReactNode, label: string) => (
    <div className="flex items-center gap-1.5 px-2 pt-[4px] pb-[3px] text-text-muted">
      {icon && <span className="flex flex-none items-center justify-center">{icon}</span>}
      <span className="text-xs leading-[18px] font-medium">{label}</span>
    </div>
  );

  return (
    <div className="flex flex-col min-h-0">
      {/* ── Model selection (header icon only; model names stay clean) ── */}
      {sectionHeader(<Brain size={14} />, t('model.title'))}
      {BUILT_IN_MODELS.map((m) => {
        const selected = m.id === selectedModel;
        return (
          <button
            key={m.id}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            className={optionCls}
            onClick={() => {
              setSelectedModel(m.id);
              onSelect?.();
            }}
          >
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm leading-5 font-medium text-text-primary">{m.name}</span>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-[17px] text-text-muted">{t(modelDescriptionKey(m.id))}</span>
            </span>
            <span className="flex flex-none w-[18px] items-center justify-center">{selected ? <Check /> : null}</span>
          </button>
        );
      })}

      {/* ── Thinking depth: full-track segmented control + current desc ── */}
      {sectionHeader(<Gauge size={14} />, t('think.title'))}
      <div className="flex gap-1 p-0.5 w-full mt-[2px] bg-bg-tertiary rounded-lg" role="radiogroup" aria-label={t('think.title')}>
        {THINKING_LEVELS.map((level) => {
          const selected = level.key === reasoningEffort;
          return (
            <button
              key={level.key}
              type="button"
              role="radio"
              aria-checked={selected}
              title={t(level.descKey)}
              className={clsx(
                'flex-1 min-w-0 h-7 px-1 rounded-lg border-none text-xs font-medium cursor-pointer transition-[background,color,box-shadow] duration-150',
                selected
                  ? 'bg-[var(--color-bg-elevated)] shadow-sm text-text-primary font-semibold'
                  : 'bg-transparent text-text-muted hover:text-text-secondary',
              )}
              onClick={() => {
                setReasoningEffort(level.key);
                onSelect?.();
              }}
            >
              {t(level.labelKey)}
            </button>
          );
        })}
      </div>
      <div className="px-2 pt-1.5 pb-0.5 text-xs leading-[18px] text-text-muted">
        {t(THINKING_LEVELS.find((l) => l.key === reasoningEffort)?.descKey ?? 'think.medium.desc')}
      </div>
    </div>
  );
});

// Legacy wrapper for backward compatibility (used in tests)
export const ModePanel = memo(function ModePanel({ contentOnly, onSelect }: ModePanelProps) {
  if (contentOnly) return <ModePanelContent onSelect={onSelect} />;
  return (
    <div className="w-[320px] p-1.5 bg-[var(--color-bg-elevated)] rounded-xl z-50 flex flex-col shadow-[var(--shadow-md)]">
      <ModePanelContent onSelect={onSelect} />
    </div>
  );
});
