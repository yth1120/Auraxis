import { useLayoutEffect, useRef, useState } from 'react';
import { ChatCircle, Code } from '@/components/common/icons';
import { Tooltip } from 'antd';
import clsx from 'clsx';
import { useAppStore } from '../../stores/useAppStore';
import { useT } from '../../i18n';

interface Props {
  collapsed?: boolean;
}

/**
 * Work-mode switcher (Chat ↔ Agent). Segmented control with a sliding
 * thumb that fills the whole track height — no gap between thumb and rail.
 */
export default function HeaderModeSwitcher({ collapsed }: Props) {
  const t = useT();
  const sidebarMode = useAppStore((s) => s.sidebarMode);
  const setSidebarMode = useAppStore((s) => s.setSidebarMode);

  // ── Sliding thumb position (measured from real buttons) ──
  const trackRef = useRef<HTMLDivElement>(null);
  const chatBtnRef = useRef<HTMLButtonElement>(null);
  const agentBtnRef = useRef<HTMLButtonElement>(null);
  const [thumbRect, setThumbRect] = useState<{ left: number; width: number } | null>(null);

  const recalcThumb = () => {
    const track = trackRef.current;
    const targetBtn = sidebarMode === 'chat' ? chatBtnRef.current : agentBtnRef.current;
    if (!track || !targetBtn) return;

    const trackRect = track.getBoundingClientRect();
    const btnRect = targetBtn.getBoundingClientRect();

    setThumbRect({
      left: btnRect.left - trackRect.left,
      width: btnRect.width,
    });
  };

  // ── Slide thumb on mode switch ──
  useLayoutEffect(() => {
    recalcThumb();
  }, [sidebarMode]);

  // ── Re-measure on sidebar drag / window resize ──
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(() => recalcThumb());
    ro.observe(track);
    return () => ro.disconnect();
  }, []);

  // ── Collapsed: icon-only vertical stack ──
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1" role="tablist" aria-label="工作模式">
        <Tooltip title={t('mode.switchToChat')} placement="right">
          <button
            role="tab"
            aria-selected={sidebarMode === 'chat'}
            className={clsx(
              'w-9 h-8 flex items-center justify-center border-none rounded-full cursor-pointer text-base transition-[background,color] duration-150',
              sidebarMode === 'chat'
                ? 'bg-primary-soft text-primary'
                : 'bg-transparent text-text-muted hover:bg-[var(--color-hover)] hover:text-text-secondary',
            )}
            onClick={() => {
              setSidebarMode('chat');
              useAppStore.getState().setActiveToolView('none');
            }}
          >
            <ChatCircle />
          </button>
        </Tooltip>
        <Tooltip title={t('mode.switchToAgent')} placement="right">
          <button
            role="tab"
            aria-selected={sidebarMode === 'code'}
            className={clsx(
              'w-9 h-8 flex items-center justify-center border-none rounded-full cursor-pointer text-base transition-[background,color] duration-150',
              sidebarMode === 'code'
                ? 'bg-primary-soft text-primary'
                : 'bg-transparent text-text-muted hover:bg-[var(--color-hover)] hover:text-text-secondary',
            )}
            onClick={() => {
              setSidebarMode('code');
              useAppStore.getState().setActiveToolView('none');
            }}
          >
            <Code />
          </button>
        </Tooltip>
      </div>
    );
  }

  // ── Expanded: track with sliding thumb that fills the whole rail ──
  return (
    <div ref={trackRef} className="relative flex w-[172px] h-8 bg-bg-tertiary rounded-full" role="tablist" aria-label="工作模式">
      {thumbRect && (
        <span
          className="absolute inset-y-0 h-full bg-[var(--color-bg-elevated)] rounded-full shadow-sm transition-all duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: thumbRect.left, width: thumbRect.width }}
          aria-hidden
        />
      )}
      <Tooltip title={t('mode.chatTip')} placement="bottom">
        <button
          ref={chatBtnRef}
          role="tab"
          aria-selected={sidebarMode === 'chat'}
          className={clsx(
            'relative z-[1] flex-1 flex items-center justify-center gap-[5px] border-none bg-transparent font-body text-sm font-medium cursor-pointer rounded-full transition-[color] duration-200 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
            sidebarMode === 'chat' ? 'text-text-primary font-semibold' : 'text-text-muted hover:text-text-secondary',
          )}
          onClick={() => {
            setSidebarMode('chat');
            useAppStore.getState().setActiveToolView('none');
          }}
        >
          <ChatCircle /> {t('mode.chat')}
        </button>
      </Tooltip>
      <Tooltip title={t('mode.agentTip')} placement="bottom">
        <button
          ref={agentBtnRef}
          role="tab"
          aria-selected={sidebarMode === 'code'}
          className={clsx(
            'relative z-[1] flex-1 flex items-center justify-center gap-[5px] border-none bg-transparent font-body text-sm font-medium cursor-pointer rounded-full transition-[color] duration-200 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
            sidebarMode === 'code' ? 'text-text-primary font-semibold' : 'text-text-muted hover:text-text-secondary',
          )}
          onClick={() => {
            setSidebarMode('code');
            useAppStore.getState().setActiveToolView('none');
          }}
        >
          <Code /> {t('mode.agent')}
        </button>
      </Tooltip>
    </div>
  );
}
