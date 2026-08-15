import type { ReactNode } from 'react';
import {
  ArrowsClockwise,
  Bug,
  Flask,
  Lightning,
  MagnifyingGlass as SearchIcon,
  TreeStructure,
} from '@/components/common/icons';
import { AGENT_SKILLS, type AgentSkillIconKey } from '../../core/skills';
import { useChatStore } from '../../stores/useChatStore';

const SKILL_ICONS: Record<AgentSkillIconKey, ReactNode> = {
  search: <SearchIcon size={20} weight="regular" />,
  bug: <Bug size={20} weight="regular" />,
  refactor: <ArrowsClockwise size={20} weight="regular" />,
  test: <Flask size={20} weight="regular" />,
  architecture: <TreeStructure size={20} weight="regular" />,
  feature: <Lightning size={20} weight="regular" />,
};

/**
 * Agent home quick-function panel: one row of centered monochrome cards
 * (icon + name + description). Clicking fills the composer with the skill's
 * prompt and focuses it — the user reviews and presses Enter to send.
 */
export default function QuickActionsPanel() {
  return (
    <section className="mb-12 last:mb-0">
      <div className="mx-auto grid max-w-[720px] grid-cols-3 gap-2.5 max-[560px]:grid-cols-2">
        {AGENT_SKILLS.map((skill) => (
          <button
            key={skill.key}
            type="button"
            className="group flex flex-col items-center justify-center gap-2.5 h-[104px] min-w-0 px-2 rounded-2xl bg-[var(--color-bg-secondary)] border border-[var(--color-border-dim)] text-center cursor-pointer transition-colors duration-150 hover:bg-[var(--color-bg-elevated)] hover:border-[var(--color-border-strong)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            onClick={() => {
              useChatStore.getState().setInputValue(skill.instruction);
              useChatStore.getState().requestComposerFocus();
            }}
            title={skill.description}
            aria-label={`${skill.name}：${skill.description}`}
          >
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--color-bg-elevated)] ring-1 ring-[var(--color-border-dim)] text-text-primary transition-colors duration-150 group-hover:ring-[var(--color-border-strong)]">
              {SKILL_ICONS[skill.icon]}
            </span>
            <span className="min-w-0 w-full">
              <span className="block text-sm font-medium text-text-primary leading-snug truncate">{skill.name}</span>
              <span className="block text-2xs text-text-muted leading-[1.4] truncate mt-0.5">{skill.description}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
