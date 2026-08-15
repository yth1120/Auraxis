import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';

export interface TimelineTick {
  id: string;
  title?: string;
  summary: string;
  timestamp?: number;
  /** Index into the source list (used by the scrub callback). */
  index: number;
}

interface TimelineScrubberProps {
  /** One tick per user prompt — the anchors the rail navigates between. */
  ticks: TimelineTick[];
  /** Viewport top ratio (0..1) — drives the active-prompt highlight. */
  scrollRatio?: number;
  onScrubTo: (index: number, mode: 'click' | 'drag') => void;
  className?: string;
}

const MAX_DOTS = 50;

/**
 * Prompt Timeline Dock — VS Code "Sessions" prompt-timeline dock pattern.
 * At rest it is a quiet right-edge handle: one dot per user prompt (capped at
 * 50 with an overflow marker). Hover/click/arrow keys expand a flyout that
 * lists every prompt; Enter/Space or a click smooth-scrolls the transcript,
 * Escape dismisses, and the active prompt stays highlighted as you scroll.
 */
export default function TimelineScrubber({
  ticks,
  scrollRatio = 0,
  onScrubTo,
  className,
}: TimelineScrubberProps) {
  const railRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);

  const activeIndex = useMemo(() => {
    if (ticks.length === 0) return -1;
    return Math.min(ticks.length - 1, Math.max(0, Math.round(scrollRatio * (ticks.length - 1))));
  }, [ticks.length, scrollRatio]);

  const jump = useCallback((i: number) => {
    const tick = ticks[i];
    if (!tick) return;
    onScrubTo(tick.index, 'click');
    setCursor(i);
    setOpen(false);
    railRef.current?.focus();
  }, [ticks, onScrubTo]);

  // Keep the keyboard cursor visible inside the flyout.
  useEffect(() => {
    if (!open || cursor === null) return;
    const el = panelRef.current?.querySelector<HTMLElement>(`[data-tick-index="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, cursor]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setCursor((c) => {
        const base = c ?? (activeIndex >= 0 ? activeIndex : 0);
        return e.key === 'ArrowDown'
          ? Math.min(ticks.length - 1, base + 1)
          : Math.max(0, base - 1);
      });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const target = cursor ?? activeIndex;
      if (target >= 0) jump(target);
    } else if (e.key === 'Escape') {
      setOpen(false);
      railRef.current?.focus();
    }
  };

  if (ticks.length === 0) return null;
  const dots = ticks.slice(0, MAX_DOTS);
  const overflow = ticks.length > MAX_DOTS;

  return (
    <div
      className={clsx('relative shrink-0 w-[22px] h-full z-20', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={railRef}
        type="button"
        className="absolute right-[3px] top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 p-2 rounded-lg border-none bg-transparent text-inherit cursor-pointer hover:bg-[var(--color-hover)] focus-visible:outline-1 focus-visible:outline-[var(--color-primary-border)]"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="对话提示时间轴"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
      >
        {dots.map((t, i) => (
          <span
            key={t.id}
            className={clsx(
              'w-1 h-1 rounded-full bg-[var(--color-text-muted)] transition-opacity duration-100',
              i === activeIndex ? 'opacity-100' : 'opacity-55',
            )}
          />
        ))}
        {overflow && (
          <span className="w-[2px] h-2 rounded-full bg-[var(--color-text-muted)] opacity-40" />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="listbox"
          aria-label="提示列表"
          className="absolute right-full mr-1.5 top-1/2 -translate-y-1/2 w-[260px] max-h-[calc(100%-24px)] overflow-y-auto p-1 flex flex-col bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
        >
          {ticks.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              data-tick-index={i}
              className={clsx(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-md border-none text-left text-xs cursor-pointer',
                i === activeIndex
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-text-primary)]'
                  : 'bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]',
              )}
              onClick={() => jump(i)}
              onMouseEnter={() => setCursor(i)}
            >
              <span className="flex-1 min-w-0 truncate">{t.summary || t.title || '消息'}</span>
              {t.timestamp != null && (
                <span className="shrink-0 text-2xs tabular-nums text-[var(--color-text-muted)]">
                  {new Date(t.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
