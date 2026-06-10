import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PERMISSION_PRESET,
  PERMISSION_PRESETS,
  isPermissionPreset,
  permissionPresetFromSandbox,
} from '../permission';
import { normalizeApprovalPolicy } from '../core';

describe('permission presets — 统一权限映射', () => {
  it('ask = workspace-write + ask + manual approval + standard profile', () => {
    expect(PERMISSION_PRESETS.ask).toEqual({
      sandboxMode: 'workspace-write',
      mode: 'ask',
      autoApprove: false,
      profileId: 'standard',
    });
  });

  it('auto = workspace-write + auto + hygiene checks retained + review gate', () => {
    expect(PERMISSION_PRESETS.auto).toEqual({
      sandboxMode: 'workspace-write',
      mode: 'auto',
      autoApprove: false,
      profileId: 'standard',
    });
  });

  it('full = full sandbox + auto + autoApprove bypass + standard profile', () => {
    expect(PERMISSION_PRESETS.full).toEqual({
      sandboxMode: 'full',
      mode: 'auto',
      autoApprove: true,
      profileId: 'standard',
    });
  });

  it('readonly = read sandbox + ask + readonly profile', () => {
    expect(PERMISSION_PRESETS.readonly).toEqual({
      sandboxMode: 'read',
      mode: 'ask',
      autoApprove: false,
      profileId: 'readonly',
    });
  });

  it('default preset is the safe ask', () => {
    expect(DEFAULT_PERMISSION_PRESET).toBe('ask');
    expect(isPermissionPreset('ask')).toBe(true);
    expect(isPermissionPreset('nope')).toBe(false);
  });

  it('legacy sandbox-only settings migrate to a matching preset', () => {
    expect(permissionPresetFromSandbox('read')).toBe('readonly');
    expect(permissionPresetFromSandbox('full')).toBe('full');
    expect(permissionPresetFromSandbox('workspace-write')).toBe('ask');
    expect(permissionPresetFromSandbox(undefined)).toBe('ask');
  });

  it('legacy afe approval values normalize to auto', () => {
    expect(normalizeApprovalPolicy('afe')).toBe('auto');
    expect(normalizeApprovalPolicy('auto')).toBe('auto');
    expect(normalizeApprovalPolicy('ask')).toBe('ask');
    expect(normalizeApprovalPolicy('plan')).toBe('plan');
    expect(normalizeApprovalPolicy(undefined)).toBe('ask');
  });
});
