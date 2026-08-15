import { Wrench } from '@/components/common/icons';
import type { AgentSkill } from '@/core/skills';
import { useT } from '../../i18n';

interface SkillMentionDropdownProps {
  skills: AgentSkill[];
  query: string;
  selected: number;
  onSelect: (skill: AgentSkill) => void;
  onHover: (idx: number) => void;
}

/** `$`-mention 技能下拉。 */
export default function SkillMentionDropdown({ skills, query, selected, onSelect, onHover }: SkillMentionDropdownProps) {
  const t = useT();
  const q = query.trim().toLowerCase();
  const visible = skills.filter(
    (s) => !q || s.name.toLowerCase().includes(q) || s.key.includes(q),
  );

  if (visible.length === 0) return null;

  return (
    <div className="absolute bottom-[calc(100%+6px)] left-[-6px] right-[-6px] bg-[var(--color-bg-elevated)] rounded-card overflow-hidden z-[100] max-h-[260px] flex flex-col border border-[var(--color-border-dim)] shadow-[var(--shadow-md)]">
      <div className="overflow-y-auto flex-1">
        {visible.map((skill, idx) => (
          <div
            key={skill.key}
              className={[
                'px-3 py-[9px] cursor-pointer text-text-secondary font-body text-sm flex items-center gap-[10px]',
                'transition-colors duration-150',
                idx === selected
                  ? 'bg-primary-soft text-text-primary'
                  : 'hover:bg-primary-soft hover:text-text-primary',
              ].join(' ')}
            onMouseDown={(e) => { e.preventDefault(); onSelect(skill); }}
            onMouseEnter={() => onHover(idx)}
          >
            <span className="w-[18px] h-[18px] rounded-md flex items-center justify-center text-2xs shrink-0 bg-[var(--color-primary-soft)] text-primary">
              <Wrench size={12} weight="fill" />
            </span>
            <span className="min-w-0 flex flex-col gap-[1px]">
              <strong className="overflow-hidden text-ellipsis whitespace-nowrap">{skill.name}</strong>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-2xs opacity-60">{skill.description}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 flex items-center gap-3 text-2xs text-text-faint border-t border-border-dim">
        <span className="flex items-center gap-1">
          <kbd className="inline-flex items-center justify-center min-w-[16px] p-1 rounded-[5px] bg-bg-inset text-xs text-text-muted border border-border-dim">↑↓</kbd> {t('nav.navigate')}
        </span>
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
