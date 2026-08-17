// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import MentionDropdown from '../MentionDropdown';

describe('MentionDropdown — 提及按钮列表', () => {
  it('renders file items and selects on click', () => {
    const onSelect = vi.fn();
    const { getByText } = render(
      <MentionDropdown items={['src/app.ts', 'src/main.ts']} selected={0} onSelect={onSelect} onHover={() => {}} />,
    );
    fireEvent.mouseDown(getByText('app.ts'));
    expect(onSelect).toHaveBeenCalledWith('src/app.ts');
  });
});
