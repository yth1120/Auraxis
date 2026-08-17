import { describe, it, expect, beforeEach } from 'vitest';
import { approvalFatigue } from '../approval-fatigue';

describe('ApprovalFatigueTracker（Oversight Has a Capacity）', () => {
  beforeEach(() => approvalFatigue.reset());

  it('空状态默认严格升级', () => {
    const s = approvalFatigue.state('s1');
    expect(s.fatigueScore).toBe(0);
    expect(s.suggestion).toBe('escalate');
    expect(approvalFatigue.suggest('s1', 'high').escalate).toBe(true);
  });

  it('高风险操作始终升级人工', () => {
    for (let i = 0; i < 20; i++) approvalFatigue.record('s1', 'Bash', 'auto');
    const r = approvalFatigue.suggest('s1', 'high');
    expect(r.escalate).toBe(true);
    expect(r.reason).toContain('高风险');
  });

  it('高疲劳 + 低拒绝率时中风险自动放行（倒 U 型）', () => {
    for (let i = 0; i < 15; i++) approvalFatigue.record('s1', 'Write', 'approved');
    for (let i = 0; i < 2; i++) approvalFatigue.record('s1', 'Write', 'rejected');
    const state = approvalFatigue.state('s1');
    expect(state.fatigueScore).toBeGreaterThanOrEqual(0.7);
    expect(state.rejectionRate).toBeLessThanOrEqual(0.15);
    const r = approvalFatigue.suggest('s1', 'medium');
    expect(r.escalate).toBe(false);
    expect(r.reason).toContain('倒 U 型');
  });

  it('拒绝率上升时恢复严格升级', () => {
    for (let i = 0; i < 10; i++) approvalFatigue.record('s1', 'Write', 'approved');
    for (let i = 0; i < 6; i++) approvalFatigue.record('s1', 'Write', 'rejected');
    const r = approvalFatigue.suggest('s1', 'medium');
    expect(r.escalate).toBe(true);
  });

  it('窗口只统计最近 N 条决策', () => {
    for (let i = 0; i < 30; i++) approvalFatigue.record('s1', 'Bash', 'auto');
    const s = approvalFatigue.state('s1');
    expect(s.auto).toBe(20);
    expect(s.windowSize).toBe(20);
  });

  it('reset 清空状态', () => {
    approvalFatigue.record('s1', 'Write', 'approved');
    approvalFatigue.reset('s1');
    expect(approvalFatigue.state('s1').escalations).toBe(0);
  });

  it('低风险在疲劳且低拒绝率时自动放行', () => {
    for (let i = 0; i < 12; i++) approvalFatigue.record('s1', 'Write', 'approved');
    approvalFatigue.record('s1', 'Write', 'rejected');
    const r = approvalFatigue.suggest('s1', 'low');
    expect(r.escalate).toBe(false);
    expect(r.reason).toContain('自动放行');
  });

  it('低风险在审查者未校准时保持升级', () => {
    approvalFatigue.record('s1', 'Write', 'approved');
    approvalFatigue.record('s1', 'Write', 'approved');
    expect(approvalFatigue.suggest('s1', 'low').escalate).toBe(true);
  });

  it('不同 scope 的疲劳状态互不串扰', () => {
    for (let i = 0; i < 15; i++) approvalFatigue.record('a', 'Write', 'approved');
    expect(approvalFatigue.state('b').escalations).toBe(0);
    expect(approvalFatigue.suggest('b', 'medium').escalate).toBe(true);
  });

  it('空 scope 归一到 default', () => {
    approvalFatigue.record('', 'Bash', 'approved');
    expect(approvalFatigue.state('default').approvals).toBe(1);
    expect(approvalFatigue.state('').approvals).toBe(1);
  });
});
