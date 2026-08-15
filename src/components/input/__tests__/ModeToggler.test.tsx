// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useChatStore } from '../../../stores/useChatStore';
import { ModeTrigger, ModePanel, ModePanelContent } from '../ModeToggler';

beforeEach(() => {
  useChatStore.setState({ selectedModel: 'deepseek-v4-pro' });
});

describe('ModeTrigger', () => {
  it('shows the current model name (DeepSeek V4 Pro by default)', () => {
    render(<ModeTrigger onClick={() => {}} />);
    expect(screen.getByText((content) => content.includes('DeepSeek V4 Pro'))).toBeDefined();
  });

  it('fires onClick when clicked', () => {
    let clicked = false;
    render(<ModeTrigger onClick={() => { clicked = true; }} />);
    fireEvent.click(screen.getByText((content) => content.includes('DeepSeek V4 Pro')));
    expect(clicked).toBe(true);
  });

  it('shows DeepSeek V4 Flash when the flash model is selected', () => {
    useChatStore.setState({ selectedModel: 'deepseek-v4-flash' });
    render(<ModeTrigger onClick={() => {}} />);
    expect(screen.getByText((content) => content.includes('DeepSeek V4 Flash'))).toBeDefined();
  });
});

describe('ModePanel', () => {
  it('renders all models and thinking depth directly', () => {
    render(<ModePanel />);
    expect(screen.getByText('DeepSeek V4 Flash')).toBeDefined();
    expect(screen.getByText('DeepSeek V4 Pro')).toBeDefined();
    expect(screen.getByText('思考深度')).toBeDefined();
    expect(screen.getByText('轻度思考')).toBeDefined();
    expect(screen.getByText('深度思考')).toBeDefined();
  });

  it('clicking DeepSeek V4 Flash switches model', () => {
    render(<ModePanel />);
    fireEvent.click(screen.getByText('DeepSeek V4 Flash'));
    expect(useChatStore.getState().selectedModel).toBe('deepseek-v4-flash');
  });

  it('clicking DeepSeek V4 Pro switches model', () => {
    useChatStore.setState({ selectedModel: 'deepseek-v4-flash' });
    render(<ModePanel />);
    fireEvent.click(screen.getByText('DeepSeek V4 Pro'));
    expect(useChatStore.getState().selectedModel).toBe('deepseek-v4-pro');
  });

  it('clicking a thinking-depth pill switches effort', () => {
    render(<ModePanel />);
    fireEvent.click(screen.getByText('轻度思考'));
    expect(useChatStore.getState().reasoningEffort).toBe('low');
  });

  it('renders content via ModePanelContent', () => {
    render(<ModePanelContent />);
    expect(screen.getByText('DeepSeek V4 Flash')).toBeDefined();
    expect(screen.getByText('DeepSeek V4 Pro')).toBeDefined();
    expect(screen.getByText('思考深度')).toBeDefined();
  });
});
