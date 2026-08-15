import { Modal, message } from 'antd';
import { createElement } from 'react';
import { useAgentStore } from '../stores/useAgentStore';
import { useChatStore } from '../stores/useChatStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useAppStore } from '../stores/useAppStore';
import { useSessionStore } from '../stores/useSessionStore';
import type { AgentPriority } from '../types/agent';
import type { PermissionMode } from '../types/advanced';
import { fetchModels } from '../types/chat';
import { AGENT_SKILLS, startAgentSkill } from '../core/skills';

/** Goal mode iteration ceiling used by `/goal` (single source, no magic number). */
const DEFAULT_GOAL_MAX_ROUNDS = 256;

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'clear', description: '清空当前对话', usage: '/clear' },
  { name: 'model', description: '切换 AI 模型', usage: '/model <name>' },
  { name: 'agent', description: '创建指定类型的 Agent 任务（Explore / Plan / 通用）', usage: '/agent <Explore|Plan|general-purpose>' },
  { name: 'goal', description: '进入目标模式，设置持续执行的目标', usage: '/goal <目标描述>' },
  { name: 'plan', description: '计划模式：先生成计划，批准后执行', usage: '/plan <任务描述>' },
  { name: 'review', description: '启动代码审查：只读审查 Agent + 变更面板', usage: '/review <范围>' },
  { name: 'skill', description: '启动快捷技能（代码审查 / Bug 修复 / 重构 / 测试 / 架构 / 功能）', usage: '/skill <技能名>' },
  { name: 'workflow', description: '运行脚本化多 Agent 工作流', usage: '/workflow <名称>' },
  { name: 'memories', description: '控制当前对话是否使用 / 写入记忆', usage: '/memories <on|off>' },
  { name: 'feedback', description: '记录一条本地反馈（帮助改进 Auraxis）', usage: '/feedback <内容>' },
  { name: 'theme', description: '切换界面主题', usage: '/theme <system|light|dark>' },
  { name: 'help', description: '显示帮助信息', usage: '/help' },
];

export function createAgent(params: {
  name: string;
  type: 'Explore' | 'Plan' | 'general-purpose';
  instruction?: string;
  /** UI-facing task description (user's literal words). Falls back to instruction. */
  displayText?: string;
  model?: string;
  temperature?: number;
  maxIterations?: number;
  tools?: string[];
  isDeepThink?: boolean;
  reasoningEffort?: 'high' | 'max';
  priority?: AgentPriority;
  autoApprove?: boolean;
  mode?: PermissionMode;
  sandboxMode?: 'read' | 'workspace-write' | 'full';
  goal?: { text: string; maxRounds: number } | null;
}): Promise<string | null> {
  const chatState = useChatStore.getState();
  const settingsState = useSettingsStore.getState();
  const model = params.model || chatState.selectedModel;
  const apiKey = settingsState.deepseekApiKey;
  const projectPath = chatState.currentProjectPath || settingsState.projectPath || '';

  const agentStore = useAgentStore.getState();
  // startAgent throws on backend rejection (e.g. invalid project dir) —
  // surface it as a toast and resolve null so callers stay simple.
  return agentStore
    .startAgent(
      {
        name: params.name,
        description: params.instruction || '',
        displayDescription: params.displayText,
        type: params.type,
        model,
        apiKey: apiKey || '',
        projectRoot: projectPath,
        priority: params.priority ?? 'normal',
        maxIterations: params.maxIterations ?? 200,
        customTools: params.tools as any,
        autoApprove: params.autoApprove ?? chatState.autoApprove,
        isDeepThink: params.isDeepThink ?? true,
        reasoningEffort: params.reasoningEffort ?? 'high',
        mode: params.mode,
        sandboxMode: params.sandboxMode,
        goal: params.goal,
      },
      projectPath,
    )
    .catch((err: Error) => {
      message.error(err.message || '任务启动失败');
      return null;
    });
}

export function executeCommand(
  name: string,
  args: string,
  ctx: {
    clearMessages: () => void;
    setSelectedModel: (model: string) => void;
    setInputValue: (value: string) => void;
    toggleTheme: () => void;
    theme: string;
  },
): boolean {
  const trimmedArgs = args.trim();

  switch (name) {
    case 'clear':
      ctx.clearMessages();
      return true;

    case 'model': {
      if (!trimmedArgs) {
        ctx.setInputValue('/model ');
        return false;
      }
      void fetchModels().then((models) => {
        const match = models.find((m) => m.id === trimmedArgs || m.name === trimmedArgs);
        if (!match) {
          message.error(`模型不存在：${trimmedArgs}`);
          ctx.setInputValue('');
          return;
        }
        ctx.setSelectedModel(match.id);
        ctx.setInputValue('');
      });
      return true;
    }

    case 'agent': {
      if (!trimmedArgs) {
        ctx.setInputValue('/agent ');
        return false;
      }
      const agentType = trimmedArgs as 'Explore' | 'Plan' | 'general-purpose';
      if (!['Explore', 'Plan', 'general-purpose'].includes(agentType)) {
        ctx.setInputValue(`/agent `);
        return false;
      }
      useAppStore.getState().setSidebarMode('code');
      void createAgent({ name: `${agentType} Agent`, type: agentType }).then((id) => {
        if (id) useAgentStore.getState().setCurrentAgent(id);
      });
      ctx.setInputValue('');
      return true;
    }

    case 'goal': {
      if (!trimmedArgs) {
        ctx.setInputValue('/goal ');
        return false;
      }
      const goal = {
        text: trimmedArgs,
        status: 'running' as const,
        startedAt: Date.now(),
      };
      useChatStore.getState().setGoal(goal);
      const sessionId = useSessionStore.getState().currentSessionId;
      if (sessionId && window.electronAPI?.goal) {
        void window.electronAPI.goal.create(sessionId, trimmedArgs, DEFAULT_GOAL_MAX_ROUNDS);
      }
      ctx.setInputValue('');
      message.success('目标模式已启动');
      return true;
    }

    case 'skill': {
      const skill = AGENT_SKILLS.find((s) =>
        s.name === trimmedArgs || s.key === trimmedArgs
        || s.name.toLowerCase() === trimmedArgs.toLowerCase()
        || s.key.toLowerCase() === trimmedArgs.toLowerCase());
      if (!skill) {
        // Fall through to the real SKILL.md registry before asking for more input.
        void (async () => {
          const list = await window.electronAPI?.skills?.list();
          const match = (list?.data?.skills ?? []).find((s) =>
            s.name === trimmedArgs || s.name.toLowerCase() === trimmedArgs.toLowerCase());
          if (!match) {
            message.error(`技能不存在：${trimmedArgs}`);
            return;
          }
          const read = await window.electronAPI?.skills?.read(match.name);
          const body = read?.ok && read.data?.body ? read.data.body : '';
          const id = await createAgent({
            name: match.name,
            type: 'general-purpose',
            instruction: body || match.description || match.name,
            displayText: `${match.name}：${match.description || ''}`,
          });
          if (id) useAgentStore.getState().setCurrentAgent(id);
        })();
        ctx.setInputValue('');
        return true;
      }
      useAppStore.getState().setSidebarMode('code');
      startAgentSkill(skill);
      ctx.setInputValue('');
      return true;
    }

    case 'plan': {
      const chat = useChatStore.getState();
      useAppStore.getState().setSidebarMode('code');
      if (trimmedArgs) {
        chat.setPendingPlanMode(false);
        void createAgent({
          name: trimmedArgs.length > 24 ? trimmedArgs.slice(0, 24) + '…' : trimmedArgs,
          type: 'general-purpose',
          instruction: trimmedArgs,
          displayText: trimmedArgs,
          mode: 'plan',
          autoApprove: false,
        }).then((id) => {
          if (id) {
            useAgentStore.getState().setCurrentAgent(id);
            message.success('计划任务已启动 — 先生成计划，批准后执行');
          }
        });
      } else {
        chat.setPendingPlanMode(true);
        message.success('已进入计划模式：输入任务后发送，将先生成计划并审批');
      }
      ctx.setInputValue('');
      return true;
    }

    case 'review': {
      const scope = trimmedArgs || '未提交的变更';
      void createAgent({
        name: '代码审查',
        type: 'Explore',
        instruction: `请对当前项目的「${scope}」进行代码审查：检查逻辑错误、安全漏洞、性能问题与边界条件。对每个问题给出文件路径、行号和修复建议，最后按严重程度排序输出。只读分析，不要修改任何文件。`,
        displayText: `审查：${scope}`,
        mode: 'ask',
        autoApprove: false,
        sandboxMode: 'read',
      }).then((id) => {
        if (id) {
          useAgentStore.getState().setCurrentAgent(id);
          useAppStore.getState().setSidebarMode('code');
          useAppStore.getState().setRightPanelView('review');
          if (!useAppStore.getState().showRightPanel) useAppStore.getState().toggleRightPanel();
          ctx.setInputValue('');
          message.success('审查 Agent 已启动');
        }
      });
      return true;
    }

    case 'workflow': {
      if (!trimmedArgs) {
        ctx.setInputValue('/workflow ');
        return false;
      }
      const projectRoot = useSettingsStore.getState().projectPath;
      if (!projectRoot) {
        ctx.setInputValue('');
        message.warning('请先在设置中配置项目路径');
        return true;
      }
      void (async () => {
        const list = await window.electronAPI?.workflow?.list(projectRoot);
        const def = (list?.data || []).find((d) => d.id === trimmedArgs || d.name === trimmedArgs);
        if (!def) { message.error(`工作流不存在: ${trimmedArgs}`); return; }
        const r = await window.electronAPI?.workflow?.run({ workflowId: def.id, projectRoot });
        if (r?.ok) message.success(`工作流已启动：${r.data?.runId}`);
        else message.error(r?.error || '启动失败');
      })();
      ctx.setInputValue('');
      return true;
    }

    case 'memories': {
      if (!trimmedArgs || !['on', 'off'].includes(trimmedArgs)) {
        ctx.setInputValue('/memories ');
        return false;
      }
      useChatStore.getState().setMemoriesEnabled(trimmedArgs === 'on');
      ctx.setInputValue('');
      message.success(`已${trimmedArgs === 'on' ? '开启' : '关闭'}当前对话的记忆`);
      return true;
    }

    case 'feedback': {
      if (!trimmedArgs) {
        ctx.setInputValue('/feedback ');
        return false;
      }
      void window.electronAPI?.feedback?.submit(trimmedArgs).then((r) => {
        if (r?.ok) message.success('反馈已记录，感谢！');
        else message.error(r?.error || '反馈记录失败');
      });
      ctx.setInputValue('');
      return true;
    }

    case 'theme': {
      if (!trimmedArgs || !['system', 'dark', 'light'].includes(trimmedArgs)) {
        ctx.setInputValue('/theme ');
        return false;
      }
      const appState = useAppStore.getState();
      appState.setTheme(trimmedArgs as 'system' | 'dark' | 'light');
      ctx.setInputValue('');
      return true;
    }

    case 'help':
      ctx.setInputValue('');
      Modal.info({
        title: '可用命令',
        width: 520,
        content: createElement(
          'div',
          { className: 'flex flex-col gap-1' },
          SLASH_COMMANDS.map((c) => createElement(
            'div',
            { key: c.name, className: 'text-xs text-text-secondary' },
            createElement('span', { className: 'font-mono text-primary' }, c.usage),
            ' — ',
            c.description,
          )),
        ),
      });
      return true;

    default:
      return false;
  }
}
