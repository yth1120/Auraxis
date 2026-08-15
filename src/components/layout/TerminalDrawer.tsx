import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import TerminalPanel from '../tools/TerminalPanel';
import { useT } from '../../i18n';

const MIN_H = 160;
const MAX_H = 560;

/**
 * Bottom terminal drawer: slides up over the main surface and can be dragged
 * taller/shorter with the grabber handle at its top edge.
 */
export default function TerminalDrawer({
  height,
  onChange,
  onClose,
}: {
  height: number;
  onChange: (h: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: height };
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const next = Math.min(MAX_H, Math.max(MIN_H, d.startH + (d.startY - ev.clientY)));
      onChange(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      className="shrink-0 flex flex-col bg-[var(--color-glass-panel)] border-t border-[var(--color-border-dim)]"
      style={{ height }}
    >
      <div
        className="group h-3 shrink-0 flex items-center justify-center cursor-row-resize select-none"
        onPointerDown={onPointerDown}
        title={t('terminal.dragHint')}
        aria-label={t('terminal.dragHint')}
      >
        <span className="w-10 h-1 rounded-full bg-[var(--color-border-default)] transition-colors duration-150 group-hover:bg-[var(--color-border-strong)]" />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <TerminalPanel onClose={onClose} />
      </div>
    </div>
  );
}
