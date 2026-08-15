import type { SlashCommand } from '../../constants/commands';
import { useT, slashCommandDescKey } from '../../i18n';

interface CommandDropdownProps {
  items: SlashCommand[];
  selected: number;
  position?: 'center' | 'bottom';
  onSelect: (item: SlashCommand) => void;
  onHover: (idx: number) => void;
}

export default function CommandDropdown({ items, selected, position, onSelect, onHover }: CommandDropdownProps) {
  const t = useT();
  if (items.length === 0) return null;

  return (
    <div className="mention-dropdown absolute bottom-[calc(100%+6px)] left-[-6px] right-[-6px] bg-[var(--color-bg-elevated)] rounded-card overflow-hidden z-[100] max-h-[260px] flex flex-col border border-[var(--color-border-dim)] shadow-[var(--shadow-md)]">
      <div className="overflow-y-auto flex-1">
        {items.map((cmd, idx) => (
          <div
            key={cmd.name}
            className={[
              'px-3 py-[9px] cursor-pointer text-text-secondary font-body text-sm flex items-center gap-[10px]',
              'transition-colors duration-150',
              idx === selected
                ? 'bg-primary-soft text-text-primary'
                : 'hover:bg-primary-soft hover:text-text-primary',
            ].join(' ')}
            onMouseDown={(e) => { e.preventDefault(); onSelect(cmd); }}
            onMouseEnter={() => onHover(idx)}
          >
            <span className="w-[18px] h-[18px] rounded-md flex items-center justify-center text-sm font-bold font-mono shrink-0 text-accent bg-accent-soft">/</span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              <strong>{cmd.name}</strong>
              <span style={{ opacity: 0.5, marginLeft: 8, fontSize: 11 }}>{t(slashCommandDescKey(cmd.name))}</span>
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {cmd.usage}
            </span>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 flex items-center gap-3 text-2xs text-text-faint border-t border-border-dim">
        <span className="flex items-center gap-1">
          <kbd className="inline-flex items-center justify-center min-w-[16px] p-1 rounded-[5px] bg-bg-inset text-xs text-text-muted border border-border-dim">↵</kbd> {t('nav.select')}
        </span>
        <span className="flex items-center gap-1">
          <kbd className="inline-flex items-center justify-center min-w-[16px] p-1 rounded-[5px] bg-bg-inset text-xs text-text-muted border border-border-dim">Esc</kbd> {t('nav.cancel')}
        </span>
      </div>
    </div>
  );
}
