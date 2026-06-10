// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import QuickActionsPanel, { HOME_SKILLS } from '../QuickActionsPanel';
import { useChatStore } from '../../../stores/useChatStore';

describe('QuickActionsPanel', () => {
  beforeEach(() => {
    useChatStore.setState({ inputValue: '' });
  });

  it('renders one launch tile per built-in skill without a section header', () => {
    const { container } = render(<QuickActionsPanel />);
    expect(container.textContent).not.toContain('快捷功能');
    expect(container.textContent).not.toContain('个常用任务');
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(HOME_SKILLS.length);
    expect(buttons[0].textContent).toContain(HOME_SKILLS[0].name);
  });

  it('lays the tiles out four per row', () => {
    const { container } = render(<QuickActionsPanel />);
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('grid-cols-4');
  });

  it('labels every pill with the skill name and hides type tags', () => {
    const { container } = render(<QuickActionsPanel />);
    const labels = [...container.querySelectorAll('button')].map((b) => b.textContent ?? '');
    for (const skill of HOME_SKILLS) {
      const tile = labels.find((t) => t.includes(skill.name));
      expect(tile).toBeTruthy();
    }
    expect(container.textContent).not.toContain('只读');
    expect(container.textContent).not.toContain('规划');
    expect(container.textContent).not.toContain('执行');
  });

  it('exposes accessible names for each tile', () => {
    const { container } = render(<QuickActionsPanel />);
    const buttons = [...container.querySelectorAll('button')];
    for (const skill of HOME_SKILLS) {
      expect(buttons.some((b) => b.getAttribute('aria-label')?.includes(skill.name))).toBe(true);
    }
  });

  it('fills the composer with the skill prompt for manual review', () => {
    const { container } = render(<QuickActionsPanel />);
    const first = container.querySelectorAll('button')[0];
    fireEvent.click(first);
    expect(useChatStore.getState().inputValue).toBe(HOME_SKILLS[0].instruction);
    expect(useChatStore.getState().composerFocusTick).toBeGreaterThan(0);
  });
});
