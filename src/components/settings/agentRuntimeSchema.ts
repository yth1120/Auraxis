import type { SchemaField } from './SchemaPanel';

export interface ModelOption {
  id: string;
  name: string;
}

/**
 * Agent runtime preferences — rendered generically by SchemaPanel.
 * Model selects are built from the live model list so a new model only needs
 * to be registered in model-config to show up here.
 */
export function buildAgentRuntimeFields(models: ModelOption[]): SchemaField[] {
  const modelOptions = models.map((m) => ({ value: m.id, label: m.name }));
  const fallbackPlan = { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' };
  const fallbackExecute = { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' };
  return [
    {
      key: 'agentMaxIterations',
      label: '最大执行轮数',
      description: '单个 Agent 任务的迭代上限，达到后自动总结收尾。',
      type: 'number',
      min: 10,
      max: 1000,
      step: 10,
      default: 200,
    },
    {
      key: 'timeContext',
      label: '时间上下文',
      description: '每步执行前向模型注入当前时间与会话已运行时长。',
      type: 'boolean',
      default: true,
    },
    {
      key: 'planModel',
      label: '规划模型',
      description: '计划生成阶段使用的模型（强推理优先）。',
      type: 'select',
      options: modelOptions,
      default: modelOptions[0]?.value ?? fallbackPlan.value,
    },
    {
      key: 'executeModel',
      label: '执行模型',
      description: '计划批准后执行步骤使用的模型（快 / 便宜优先）。',
      type: 'select',
      options: modelOptions,
      default: modelOptions[1]?.value ?? fallbackExecute.value,
    },
  ];
}
