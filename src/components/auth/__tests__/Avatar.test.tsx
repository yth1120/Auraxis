// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Avatar from '../Avatar';

describe('Avatar — 头像按钮', () => {
  it('renders the initial when no image', () => {
    const { getByText } = render(<Avatar name="Auraxis" size={30} />);
    expect(getByText('A')).toBeTruthy();
  });

  it('renders an image when src is provided', () => {
    const { container } = render(<Avatar name="Auraxis" src="data:image/png;base64,AA==" size={30} />);
    expect(container.querySelector('img')).toBeTruthy();
  });
});
