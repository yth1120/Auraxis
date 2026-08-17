// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import SkillMentionDropdown from '../SkillMentionDropdown';
import { AGENT_SKILLS } from '@/core/skills';

describe('SkillMentionDropdown — 技能提及按钮', () => {
  it('selects a skill on mousedown', () => {
    const onSelect = vi.fn();
    const { getByText } = render(
      <SkillMentionDropdown skills={AGENT_SKILLS} query="bug" selected={0} onSelect={onSelect} onHover={() => {}} />,
    );
    fireEvent.mouseDown(getByText('Bug 修复'));
    expect(onSelect).toHaveBeenCalledWith(AGENT_SKILLS.find((s) => s.name === 'Bug 修复'));
  });
});
