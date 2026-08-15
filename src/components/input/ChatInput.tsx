import { useCallback, useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen as FolderOpenIcon,
  GlobeHemisphereWest,
  Image as ImageIcon,
  Paperclip,
  Plus,
  Microphone,
  Play,
  ArrowUp,
  X as CloseIcon,
} from '@/components/common/icons';
import { Tooltip, message } from 'antd';
import { useSmartDropdown, type DropdownPosition } from '../../hooks/useSmartDropdown';
import clsx from 'clsx';
import { useChatStore } from '../../stores/useChatStore';
import { useAppStore } from '../../stores/useAppStore';
import { useSessionStore } from '../../stores/useSessionStore';
import { useInspectorStore, selectPendingPlan } from '../../stores/useInspectorStore';
import { useAutoResize } from '../../hooks/useAutoResize';
import { useSettingsStore } from '../../stores/useSettingsStore';
import MentionDropdown from './MentionDropdown';
import SkillMentionDropdown from './SkillMentionDropdown';
import CommandDropdown from './CommandDropdown';
import InputDock from './InputDock';
import PlanApprovalPanel from './PlanApprovalPanel';
import ContextMeter from './ContextMeter';
import { ModeTrigger, ModePanelContent } from './ModeToggler';
import AccessSelector, { type AccessMode } from './AccessSelector';
import { resolveSessionRefs } from '../../utils/sessionRefs';
import { resolveFollowTarget } from '../../utils/followTarget';
import { t, useT } from '../../i18n';
import GhostToast from '../layout/GhostToast';
import { SLASH_COMMANDS, executeCommand, createAgent, type SlashCommand } from '../../constants/commands';
import { listSlashCommands, findPluginCommand, resolveSkillRefs } from '../../utils/slashCommands';
import { scrubSandboxPaths } from '../../utils/scrub';
import { useAgentStore } from '../../stores/useAgentStore';
import { AGENT_SKILLS, type AgentSkill } from '../../core/skills';
import { ACCOUNT_NAME } from '../../constants/account';
import logoPng from '../../assets/auraxis-logo.png';

function greeting(now = Date.now()): string {
  const h = new Date(now).getHours();
  if (h < 6) return t('chat.greeting.night');
  if (h < 12) return t('chat.greeting.morning');
  if (h < 18) return t('chat.greeting.afternoon');
  return t('chat.greeting.evening');
}

interface PendingImage {
  name: string;
  dataUrl: string;
  start: number;
  end: number;
}

/** Parse `【图片: name】\n<dataUrl>` blocks currently sitting in the composer. */
function parsePendingImages(text: string): PendingImage[] {
  const out: PendingImage[] = [];
  const re = /【图片: ([^\n】]*)】\s*\n?(data:image\/[^\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ name: m[1] || t('chat.image'), dataUrl: m[2], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

interface ChatInputProps {
  position?: 'center' | 'bottom';
}

/** Access → background-agent config (type + permission mode + auto-approve).
 *  read / workspace-write = Confirm: 直接执行，风险操作按沙箱与确认流处理。
 *  full                   = Execute: 直接执行，完全访问，无中断。
 *  Plan mode is armed separately via /plan and resolved at send time. */
function resolveAgentConfig(access: AccessMode): {
  type: 'general-purpose';
  mode: 'ask' | 'afe';
  autoApprove: boolean;
} {
  if (access === 'full') {
    return { type: 'general-purpose', mode: 'afe', autoApprove: true };
  }
  return { type: 'general-purpose', mode: 'ask', autoApprove: false };
}

const PLAN_TASK_CONFIG = {
  type: 'general-purpose' as const,
  mode: 'plan' as const,
  autoApprove: false,
};
function parseTreePaths(treeText: string): string[] {
  const lines = treeText.split('\n').filter(Boolean);
  const paths: string[] = [];
  const dirStack: { name: string; depth: number }[] = [];

  for (const line of lines) {
    const stripped = line.replace(/^[│\s]+/, '');
    const depth = (line.match(/^(?:│   |    )*/)?.[0]?.length ?? 0) / 4;
    const name = stripped.replace(/^[├└]── /, '');

    if (!name) continue;

    while (dirStack.length > 0 && dirStack[dirStack.length - 1].depth >= depth) {
      dirStack.pop();
    }

    if (name.endsWith('/')) {
      dirStack.push({ name: name.slice(0, -1), depth });
    } else {
      const dirPath = dirStack.map((d) => d.name).join('/');
      const fullPath = dirPath ? `${dirPath}/${name}` : name;
      paths.push(fullPath);
    }
  }

  return paths;
}

export default function ChatInput({ position }: ChatInputProps) {
  const t = useT();
  // Re-render every minute so the greeting follows the real clock across
  // morning / afternoon / evening boundaries while the app stays open.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setClockTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const messagesLen = useChatStore((s) => s.messages.length);
  const resolvedPosition = position ?? (messagesLen === 0 ? 'center' : 'bottom');
  const isCenter = resolvedPosition === 'center';
  const inputValue = useChatStore((s) => s.inputValue);
  const setInputValue = useChatStore((s) => s.setInputValue);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const isWebSearch = useChatStore((s) => s.isWebSearch);
  const toggleWebSearch = useChatStore((s) => s.toggleWebSearch);
  const selectedModel = useChatStore((s) => s.selectedModel);
  const isDeepThink = useChatStore((s) => s.isDeepThink);
  const reasoningEffort = useChatStore((s) => s.reasoningEffort);
  const projectPath = useSettingsStore((s) => s.projectPath);
  const sidebarMode = useAppStore((s) => s.sidebarMode);
  const { ref: textareaRef, resize } = useAutoResize(1, isCenter ? 10 : 8);

  const isCode = sidebarMode === 'code';
  /** Work / Agent share the agent-capable surface; chat is pure conversation. */
  const isAgentSurface = sidebarMode !== 'chat';
  const currentAgentId = useAgentStore((s) => s.currentAgentId);
  const currentAgentStatus = useAgentStore((s) => {
    if (!s.currentAgentId) return null;
    return s.agents.find((x) => x.id === s.currentAgentId)?.status ?? null;
  });
  const currentAgentRunning = useAgentStore((s) => {
    if (!s.currentAgentId) return false;
    const a = s.agents.find((x) => x.id === s.currentAgentId);
    return a?.status === 'running' || a?.status === 'paused' || a?.status === 'queued';
  });
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  // Code-mode launcher config — store-backed (persisted, survives remounts).
  const pendingPlanMode = useChatStore((s) => s.pendingPlanMode);
  const accessMode = useSettingsStore((s) => s.sandboxMode);
  const setAccessMode = useSettingsStore((s) => s.setSandboxMode);
  const taskPriority = useChatStore((s) => s.taskPriority);
  const plans = useInspectorStore((s) => s.plans);
  const pendingPlan = useMemo(() => selectPendingPlan(plans, currentAgentId), [plans, currentAgentId]);
  // ── Smart dropdown refs & hooks ──
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const modeTriggerRef = useRef<HTMLButtonElement>(null);
  const smartMore = useSmartDropdown(moreTriggerRef, { panelHeight: 180, gap: 10 });

  // ── Mode panel (direct state, no useSmartDropdown middleman) ──
  const [modePanelOpen, setModePanelOpen] = useState(false);
  const [modePanelPos, setModePanelPos] = useState<DropdownPosition | null>(null);
  const modePanelRef = useRef<HTMLDivElement>(null);
  // Refs for stable callbacks — avoids useCallback dance with changing deps
  const modePanelOpenRef = useRef(false);
  const isStreamingRef = useRef(isStreaming);
  const messagesLenRef = useRef(messagesLen);
  const smartMoreCloseRef = useRef(smartMore.close);
  smartMoreCloseRef.current = smartMore.close;

  // Keep refs in sync (no re-render side effect) — batched + layout for zero-delay
  useLayoutEffect(() => {
    modePanelOpenRef.current = modePanelOpen;
    isStreamingRef.current = isStreaming;
    messagesLenRef.current = messagesLen;
  });

  /* ── Panel mutual exclusion ── */
  const closeModePanel = useCallback(() => setModePanelOpen(false), []);

  // Wrap more-menu toggle with mutual exclusion
  const toggleMoreMenu = useCallback((e: React.MouseEvent) => {
    if (!smartMore.open) setModePanelOpen(false);
    smartMore.toggle(e);
  }, [smartMore]);

  // STABLE callback — refs bypass stale-closure, functional update avoids !isOpen
  const toggleModePanel = useCallback((e: React.MouseEvent) => {
    // 防御1: 斩断事件冒泡，防止触发全局 ClickOutside
    e.stopPropagation();
    e.preventDefault();

    if (!modePanelOpenRef.current) smartMoreCloseRef.current();

    // 防御2: 函数式更新，永不依赖过期的闭包值
    setModePanelOpen((prev) => {
      const next = !prev;
      return next;
    });
  }, []); // ← 空依赖！永不重建，永不触发 ModeTrigger 重渲染

  // Recalc mode panel position when it opens
  const recalcModePanelPos = useCallback(() => {
    const trigger = modeTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelH = 400;
    const gap = 10;
    // Code mode input is pinned to the bottom — always pop up.
    // Chat mode start page has the input centered — pop down.
    const dropUp = isCode || messagesLenRef.current > 0;
    setModePanelPos({
      left: rect.left,
      direction: dropUp ? 'up' : 'down',
      ...(dropUp
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    });
  }, [isCode]);

  useEffect(() => {
    if (modePanelOpen) {
      recalcModePanelPos();
      window.addEventListener('resize', recalcModePanelPos);
      window.addEventListener('scroll', recalcModePanelPos, true);
    }
    return () => {
      window.removeEventListener('resize', recalcModePanelPos);
      window.removeEventListener('scroll', recalcModePanelPos, true);
    };
  }, [modePanelOpen, recalcModePanelPos]);

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [mentionItems, setMentionItems] = useState<string[]>([]);
  const [mentionSessions, setMentionSessions] = useState<{ id: string; title: string }[]>([]);
  const [mentionSelected, setMentionSelected] = useState(0);
  const [allFilePaths, setAllFilePaths] = useState<string[]>([]);
  const allSessions = useSessionStore((s) => s.sessions);
  const mentionFetchRef = useRef(0);
  const mentionDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandIndex, setCommandIndex] = useState(-1);
  const [commandItems, setCommandItems] = useState<SlashCommand[]>([]);
  const [commandSelected, setCommandSelected] = useState(0);

  // `$`-mention — 技能调用入口（目前仅前端）。
  const [dollarOpen, setDollarOpen] = useState(false);
  const [dollarIndex, setDollarIndex] = useState(-1);
  const [dollarQuery, setDollarQuery] = useState('');
  const [dollarSelected, setDollarSelected] = useState(0);

  const [backendSkills, setBackendSkills] = useState<AgentSkill[]>([]);
  useEffect(() => {
    let cancelled = false;
    void window.electronAPI?.skills?.list().then((r) => {
      if (cancelled || !r?.ok || !r.data) return;
      setBackendSkills(r.data.skills.map((s) => ({
        key: s.name,
        name: s.name,
        description: s.description,
        type: 'general-purpose' as const,
        icon: 'feature' as const,
        instruction: s.whenToUse ? `${s.description}\n\n何时使用：${s.whenToUse}` : s.description,
      })));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const allSkills = useMemo(() => {
    const seen = new Set(AGENT_SKILLS.map((s) => s.name).concat(AGENT_SKILLS.map((s) => s.key)));
    return [...AGENT_SKILLS, ...backendSkills.filter((s) => !seen.has(s.name) && !seen.has(s.key))];
  }, [backendSkills]);

  const dollarSkills = useMemo(() => {
    const q = dollarQuery.trim().toLowerCase();
    return allSkills.filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.key.includes(q),
    );
  }, [dollarQuery, allSkills]);

  const hasInput = inputValue.trim().length > 0;

  useEffect(() => {
    resize();
  }, [inputValue, resize, isCenter]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!projectPath || !api?.context) {
      setAllFilePaths([]);
      return;
    }
    const fetchId = ++mentionFetchRef.current;
    void (async () => {
      const [tree, plans] = await Promise.all([
        api.context.getFileStructure(projectPath),
        api.plan?.list(projectPath) ?? Promise.resolve({ ok: false as const }),
      ]);
      if (fetchId !== mentionFetchRef.current) return;
      const paths = tree.ok && tree.data ? parseTreePaths(tree.data) : [];
      if (plans?.ok && plans.data) {
        for (const p of plans.data) {
          const rel = p.relative || p.name;
          if (rel) paths.push(rel);
        }
      }
      setAllFilePaths(paths);
    })();
  }, [projectPath]);

  useEffect(() => {
    clearTimeout(mentionDebounceRef.current);
    mentionDebounceRef.current = setTimeout(() => {
      const cursorPos = textareaRef.current?.selectionStart ?? inputValue.length;
      const textBefore = inputValue.slice(0, cursorPos);
      const lastAtIndex = textBefore.lastIndexOf('@');
      const lastSlashIdx = textBefore.lastIndexOf('/');
      const lastDollarIdx = textBefore.lastIndexOf('$');

      // Slash autocomplete works in both modes; Agent-only commands are
      // rejected at execution time instead of disappearing from discovery.
      if (lastSlashIdx > lastAtIndex && lastSlashIdx > lastDollarIdx) {
        const query = textBefore.slice(lastSlashIdx + 1);
        if (!query.includes(' ') && !query.includes('\n') && !query.includes('/')) {
          setCommandIndex(lastSlashIdx);
          setCommandQuery(query);
          const allCommands = listSlashCommands();
          const filtered = allCommands
            .filter((c) => c.name.startsWith(query.toLowerCase()))
            .slice(0, 6);
          setCommandItems(filtered);
          setCommandSelected(0);
          setCommandOpen(filtered.length > 0);
        } else {
          setCommandOpen(false);
        }
        setMentionOpen(false);
        setDollarOpen(false);
      } else if (lastDollarIdx > lastAtIndex && isCode) {
        // `$`-mention: skill invocation entry (skills engine lands later).
        const query = textBefore.slice(lastDollarIdx + 1);
        if (!query.includes(' ') && !query.includes('\n') && !query.includes('$')) {
          setDollarIndex(lastDollarIdx);
          setDollarQuery(query);
          setDollarSelected(0);
          setDollarOpen(true);
        } else {
          setDollarOpen(false);
        }
        setMentionOpen(false);
        setCommandOpen(false);
      } else if (lastAtIndex >= 0) {
        const query = textBefore.slice(lastAtIndex + 1);
        if (!query.includes(' ') && !query.includes('\n') && !query.includes('@')) {
          setMentionIndex(lastAtIndex);
          setMentionQuery(query);
          const filtered = allFilePaths
            .filter((p) => p.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 8);
          const sessionMatches = allSessions
            .filter((s) => (s.title || '').toLowerCase().includes(query.toLowerCase()))
            .slice(0, 4)
            .map((s) => ({ id: s.id, title: s.title }));
          setMentionItems(filtered);
          setMentionSessions(sessionMatches);
          setMentionSelected(0);
          setMentionOpen(filtered.length > 0 || sessionMatches.length > 0);
        } else {
          setMentionOpen(false);
        }
        setCommandOpen(false);
        setDollarOpen(false);
      } else {
        setMentionOpen(false);
        setCommandOpen(false);
        setDollarOpen(false);
      }
    }, 60);
    return () => clearTimeout(mentionDebounceRef.current);
  }, [inputValue, allFilePaths, allSessions, isCode]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.target.value);
    },
    [setInputValue],
  );

  // Right-panel actions (diff 继续改 / 质量门错误修复) ask the composer to focus
  // after backfilling the input — this effect reacts to that request.
  const composerFocusTick = useChatStore((s) => s.composerFocusTick);
  useEffect(() => {
    if (composerFocusTick > 0) textareaRef.current?.focus();
  }, [composerFocusTick]);

  // Code mode: each send launches a new parallel Agent task (via the
  // background agent engine), instead of a plain chat turn.
  const startCodeTask = useCallback(async (instruction: string, opts?: { clearInput?: boolean }) => {
    const trimmed = instruction.trim();
    if (!trimmed) return;
    const withSkills = resolveSkillRefs(trimmed, allSkills);
    const resolved = resolveSessionRefs(withSkills, useSessionStore.getState().sessions);
    const instructionText = resolved.text;
    // Resolve the follow-up target FRESH at send time — never trust a captured
    // closure: the task may have settled (or been replaced) between renders.
    const chatState = useChatStore.getState();
    const agentState = useAgentStore.getState();
    const selectedAgent = agentState.currentAgentId
      ? agentState.agents.find((a) => a.id === agentState.currentAgentId) ?? null
      : null;
    const follow = resolveFollowTarget({
      selected: selectedAgent,
      agents: agentState.agents,
      pendingNewTask: chatState.pendingNewTask,
    });
    // A "start fresh" intent is consumed by this send (or skipped when an
    // explicit continuation target outranked it).
    if (chatState.pendingNewTask) chatState.setPendingNewTask(false);
    const isFollow = !!follow;
    const name = isFollow
      ? '↳ ' + (trimmed.length > 20 ? trimmed.slice(0, 20) + '…' : trimmed)
      : (trimmed.length > 24 ? trimmed.slice(0, 24) + '…' : trimmed);
    // Follow-up: seed the new agent with the prior task's goal + result so it
    // continues the thread. (Completed tasks free their worktree, so a fresh
    // agent with carried context is the sound way to continue.)
    // Sandbox paths in the prior result would lure the model into ls-ing the
    // agent-workspaces graveyard ("看看之前的项目") — scrub them out.
    const priorResult = scrubSandboxPaths(follow?.result || '（无结果记录）').slice(0, 2000);
    const finalInstruction = isFollow
      ? `请继续当前任务，在前序工作的基础上推进。\n\n【任务背景】\n${follow!.description || follow!.name}\n\n【当前进展】\n${priorResult}\n\n【现在请继续】\n${instructionText}\n\n请继续在同一个工作目录内工作，不要访问历史任务的沙箱目录。`
      : instructionText;
    // Same-task continuation: reuse the settled agent (id / workspace /
    // transcript) instead of spawning a NEW task.
    if (follow) {
      const cont = await useAgentStore.getState().continueAgent(follow.id, finalInstruction, instructionText);
      if (cont.ok) {
        if (opts?.clearInput !== false) useChatStore.getState().setInputValue('');
        useAgentStore.getState().setCurrentAgent(follow.id);
        return follow.id;
      }
      message.error(cont.error || t('composer.continueFailed'));
      return null;
    }
    const activeProjectPath = useChatStore.getState().currentProjectPath
      || useSettingsStore.getState().projectPath
      || '';
    if (!activeProjectPath) {
      message.error(t('composer.needProject'));
      return null;
    }
    // /plan arms the next send in plan mode; resolve fresh at send time.
    const planNext = useChatStore.getState().pendingPlanMode;
    if (planNext) useChatStore.getState().setPendingPlanMode(false);
    const cfg = planNext ? PLAN_TASK_CONFIG : resolveAgentConfig(accessMode);
    const activeGoal = useChatStore.getState().goal;
    const id = await createAgent({
      name,
      type: cfg.type,
      instruction: finalInstruction,
      // UI shows the user's literal words — the follow-up wrapper above is
      // backend prompt material and must never render in the task header.
      displayText: trimmed,
      model: selectedModel,
      isDeepThink,
      // Map UI 3-level → API 2-level: low/medium → high, high → max
      reasoningEffort: (reasoningEffort === 'low' || reasoningEffort === 'medium') ? 'high' as const : 'max' as const,
      priority: taskPriority,
      autoApprove: cfg.autoApprove,
      mode: cfg.mode,
      goal: activeGoal ? { text: activeGoal.text, maxRounds: 256 } : null,
    });
    if (id) {
      if (opts?.clearInput !== false) useChatStore.getState().setInputValue('');
      useAgentStore.getState().setCurrentAgent(id);
      // Goal-sourced turn: advance the durable round counter （目标状态）.
      const sessionId = useSessionStore.getState().currentSessionId;
      if (activeGoal && sessionId && window.electronAPI?.goal) {
        void window.electronAPI.goal.round(sessionId);
      }
    } else {
      message.error(t('composer.createFailed'));
    }
  }, [selectedModel, accessMode, taskPriority, isDeepThink, reasoningEffort, allSkills]);

  /** Executes a leading slash command when the user presses Enter directly. */
  const tryExecuteLeadingCommand = useCallback((raw: string): boolean => {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('/')) return false;
    const spaceIdx = trimmed.indexOf(' ');
    const name = (spaceIdx >= 0 ? trimmed.slice(1, spaceIdx) : trimmed.slice(1)).toLowerCase();
    const args = spaceIdx >= 0 ? trimmed.slice(spaceIdx + 1).trim() : '';
    const agentOnly = ['agent', 'goal', 'plan', 'memories', 'skill', 'review', 'workflow'];
    if (useAppStore.getState().sidebarMode === 'chat' && agentOnly.includes(name)) {
      message.info(t('composer.agentOnly'));
      return true;
    }
    const execCtx = {
      clearMessages: () => useChatStore.getState().clearMessages(),
      setSelectedModel: (model: string) => useChatStore.getState().setSelectedModel(model),
      setInputValue,
      toggleTheme: () => useAppStore.getState().toggleTheme(),
      theme: useAppStore.getState().theme,
    };
    const known = listSlashCommands().find((c) => c.name === name);
    if (known) {
      const executed = executeCommand(known.name, args, execCtx);
      if (executed) recordCommand(name, args);
      // Incomplete commands already set a `/name ` prompt in the composer;
      // consume the Enter either way so the text never reaches the model.
      return true;
    }
    const pluginCmd = findPluginCommand(name);
    if (pluginCmd) {
      try {
        const executed = pluginCmd.execute(args, execCtx);
        if (executed) recordCommand(name, args);
        return true;
      } catch (e: any) {
        message.error(t('composer.commandFailed', { name, error: e?.message || e }));
        return true;
      }
    }
    // Unknown or invalid command must never fall through to the model.
    message.error(t('composer.unknownCommand', { name }));
    setInputValue('');
    return true;
  }, [setInputValue]);

  const recordCommand = (name: string, args: string) => {
    const sessionId = useSessionStore.getState().currentSessionId;
    const ts = Date.now();
    useChatStore.getState().appendCommand({ name, args, ts });
    if (!sessionId) return;
    void window.electronAPI?.chatLog?.append(sessionId, [{
      type: 'command',
      ts,
      data: { name, args },
    }]);
  };

  const handleSend = useCallback(() => {
    // In code mode the send button becomes a STOP control while the current
    // task is busy — this must win over slash commands / typing state.
    if (isCode && currentAgentRunning && currentAgentId) {
      useAgentStore.getState().stopAgent(currentAgentId);
      return;
    }
    // Leading slash commands run in both modes before anything else.
    if (tryExecuteLeadingCommand(inputValue)) return;
    if (isStreaming) {
      stopStreaming();
      return;
    }
    if (!inputValue.trim()) return;
    if (sidebarMode === 'code') {
      startCodeTask(inputValue);
      return;
    }
    sendMessage();
  }, [inputValue, isStreaming, sendMessage, stopStreaming, sidebarMode, startCodeTask, tryExecuteLeadingCommand]);

  /** Guards the auto-drain effect against explicit "interrupt & send now" flows. */
  const explicitInterruptRef = useRef(false);

  /** Queue action: interrupt the current task and send a queued/typed message now. */
  const sendQueueNow = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (isCode && currentAgentRunning && currentAgentId) {
        // The settle transition from this explicit stop would otherwise trip
        // the auto-drain effect and fire the NEXT queued message as well.
        explicitInterruptRef.current = true;
        await useAgentStore.getState().stopAgent(currentAgentId);
        setToastMsg(t('composer.toast.interrupted'));
        setShowToast(true);
      }
      void startCodeTask(trimmed, { clearInput: false });
    },
    [currentAgentId, currentAgentRunning, isCode, startCodeTask],
  );

  const agentQueue = useChatStore((s) => s.agentQueue);
  const clearAgentQueue = useChatStore((s) => s.clearAgentQueue);
  const queueLen = agentQueue.length;

  /** Send one queued message immediately (interrupts the running task). */
  const sendQueuedNow = useCallback(
    async (id: string) => {
      const item = useChatStore.getState().agentQueue.find((q) => q.id === id);
      if (!item) return;
      useChatStore.getState().dequeueAgentMessage(id);
      if (isCode && currentAgentRunning && currentAgentId) {
        // Same guard as sendQueueNow: this explicit send owns the next run,
        // so the stop it causes must not auto-drain the queue too.
        explicitInterruptRef.current = true;
        await useAgentStore.getState().stopAgent(currentAgentId);
        setToastMsg(t('composer.toast.interrupted'));
        setShowToast(true);
      }
      void startCodeTask(item.text, { clearInput: false });
    },
    [currentAgentId, currentAgentRunning, isCode, startCodeTask],
  );

  // Auto-continue: a message queued while the task was busy dispatches as a
  // follow-up once the current task settles. One at a time — the next queued
  // message waits for the next terminal transition, so 续写 runs sequentially.
  const prevAgentStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevAgentStatusRef.current;
    prevAgentStatusRef.current = currentAgentStatus;
    if (!isCode || !currentAgentId) return;
    const wasBusy = prev === 'running' || prev === 'queued' || prev === 'paused';
    const settled = currentAgentStatus === 'completed'
      || currentAgentStatus === 'error'
      || currentAgentStatus === 'stopped';
    if (!wasBusy) {
      // A stale guard (explicit stop that never produced a busy→settled
      // transition) must not suppress a later real drain.
      explicitInterruptRef.current = false;
      return;
    }
    if (explicitInterruptRef.current) {
      // The explicit "send now" flow already launched the next run.
      explicitInterruptRef.current = false;
      return;
    }
    if (!settled) return;
    const next = useChatStore.getState().agentQueue[0];
    if (!next) return;
    useChatStore.getState().dequeueAgentMessage(next.id);
    void startCodeTask(next.text, { clearInput: false });
  }, [currentAgentStatus, currentAgentId, isCode, startCodeTask]);

  const handleMentionSelect = useCallback(
    (filePath: string) => {
      if (mentionIndex < 0) return;
      const cursorPos = textareaRef.current?.selectionStart ?? inputValue.length;
      const textBefore = inputValue.slice(0, mentionIndex);
      const textAfter = inputValue.slice(cursorPos);
      const newValue = textBefore + '@' + filePath + textAfter;
      setInputValue(newValue);
      setMentionOpen(false);
      setMentionIndex(-1);
      setTimeout(() => {
        const pos = mentionIndex + filePath.length + 1;
        textareaRef.current?.setSelectionRange(pos, pos);
        textareaRef.current?.focus();
      }, 0);
    },
    [inputValue, mentionIndex, setInputValue, textareaRef],
  );

  const handleMentionSessionSelect = useCallback(
    (sessionId: string) => {
      if (mentionIndex < 0) return;
      const cursorPos = textareaRef.current?.selectionStart ?? inputValue.length;
      const textBefore = inputValue.slice(0, mentionIndex);
      const textAfter = inputValue.slice(cursorPos);
      const token = `@session:${sessionId}`;
      const newValue = textBefore + token + textAfter;
      setInputValue(newValue);
      setMentionOpen(false);
      setMentionIndex(-1);
      setTimeout(() => {
        const pos = mentionIndex + token.length;
        textareaRef.current?.setSelectionRange(pos, pos);
        textareaRef.current?.focus();
      }, 0);
    },
    [inputValue, mentionIndex, setInputValue, textareaRef],
  );

  const handleDollarSelect = useCallback(
    (skill: AgentSkill) => {
      if (dollarIndex < 0) return;
      const cursorPos = textareaRef.current?.selectionStart ?? inputValue.length;
      const textBefore = inputValue.slice(0, dollarIndex);
      const textAfter = inputValue.slice(cursorPos);
      const newValue = `${textBefore}$${skill.name} ${textAfter}`;
      setInputValue(newValue);
      setDollarOpen(false);
      setDollarIndex(-1);
      setTimeout(() => {
        const pos = dollarIndex + skill.name.length + 2;
        textareaRef.current?.setSelectionRange(pos, pos);
        textareaRef.current?.focus();
      }, 0);
    },
    [inputValue, dollarIndex, setInputValue, textareaRef],
  );

  const handleCommandSelect = useCallback(
    (cmd: SlashCommand) => {
      if (commandIndex < 0) return;
      const cursorPos = textareaRef.current?.selectionStart ?? inputValue.length;
      const textBefore = inputValue.slice(0, commandIndex);
      const textAfter = inputValue.slice(cursorPos);
      const execCtx = {
        clearMessages: () => useChatStore.getState().clearMessages(),
        setSelectedModel: (model: string) => useChatStore.getState().setSelectedModel(model),
        setInputValue,
        toggleTheme: () => useAppStore.getState().toggleTheme(),
        theme: useAppStore.getState().theme,
      };
      let executed = executeCommand(cmd.name, commandQuery.slice(cmd.name.length).trim(), execCtx);
      if (!executed) {
        const pluginCmd = findPluginCommand(cmd.name);
        if (pluginCmd) {
          try {
            executed = pluginCmd.execute(commandQuery.slice(cmd.name.length).trim(), execCtx);
          } catch (e: any) {
            message.error(t('composer.commandFailed', { name: cmd.name, error: e?.message || e }));
            executed = true;
          }
        }
      }
      if (executed) {
        recordCommand(cmd.name, commandQuery.slice(cmd.name.length).trim());
        const newValue = textBefore + textAfter.trimStart();
        setInputValue(newValue);
      } else {
        const newValue = textBefore + '/' + cmd.name + ' ';
        setInputValue(newValue);
        setTimeout(() => {
          const pos = (textBefore + '/' + cmd.name + ' ').length;
          textareaRef.current?.setSelectionRange(pos, pos);
          textareaRef.current?.focus();
        }, 0);
      }
      setCommandOpen(false);
      setCommandIndex(-1);
    },
    [inputValue, commandIndex, commandQuery, setInputValue, textareaRef],
  );

  const handleKeyDownWithMention = useCallback(
    (e: React.KeyboardEvent) => {
      if (commandOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setCommandSelected((prev) => (prev + 1) % commandItems.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setCommandSelected((prev) => (prev - 1 + commandItems.length) % commandItems.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          handleCommandSelect(commandItems[commandSelected] || SLASH_COMMANDS[0]);
          return;
        }
        if (e.key === 'Escape') {
          setCommandOpen(false);
          return;
        }
      }

      if (mentionOpen) {
        const total = mentionSessions.length + mentionItems.length;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionSelected((prev) => (prev + 1) % Math.max(1, total));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionSelected((prev) => (prev - 1 + total) % Math.max(1, total));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          if (mentionSelected < mentionSessions.length) {
            handleMentionSessionSelect(mentionSessions[mentionSelected].id);
          } else {
            handleMentionSelect(mentionItems[mentionSelected - mentionSessions.length] || mentionQuery);
          }
          return;
        }
        if (e.key === 'Escape') {
          setMentionOpen(false);
          return;
        }
      }

      if (dollarOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setDollarSelected((prev) => (prev + 1) % Math.max(1, dollarSkills.length));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setDollarSelected((prev) => (prev - 1 + dollarSkills.length) % Math.max(1, dollarSkills.length));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          handleDollarSelect(dollarSkills[dollarSelected] || AGENT_SKILLS[0]);
          return;
        }
        if (e.key === 'Escape') {
          setDollarOpen(false);
          return;
        }
      }

      // Enter → send; Shift+Enter → newline
      if (e.key === 'Enter') {
        // IME composition Enter (confirming a candidate, e.g. Chinese pinyin)
        // must NOT send — without this guard one input session fires twice:
        // once on candidate-confirm, once on the real send.
        if ((e.nativeEvent as KeyboardEvent).isComposing || e.keyCode === 229) {
          return;
        }
        if (e.shiftKey) {
          // Let the browser insert a newline naturally
          return;
        }
        e.preventDefault();
        // Busy Agent: Enter → queue; Ctrl/Cmd+Enter → interrupt & send now.
        if (isCode && currentAgentRunning && currentAgentId) {
          const text = inputValue.trim();
          if (!text) {
            handleSend();
            return;
          }
          if (e.ctrlKey || e.metaKey) {
            sendQueueNow(text);
          } else {
            useChatStore.getState().enqueueAgentMessage(text);
            useChatStore.getState().setInputValue('');
            setToastMsg(t('composer.toast.queued'));
            setShowToast(true);
          }
          return;
        }
        handleSend();
      }
    },
    [commandOpen, commandItems, commandSelected, handleCommandSelect,
      mentionOpen, mentionSessions, mentionItems, mentionSelected, mentionQuery, handleMentionSelect, handleMentionSessionSelect, handleSend,
      dollarOpen, dollarSkills, dollarSelected, handleDollarSelect,
      isCode, currentAgentRunning, currentAgentId, inputValue, sendQueueNow],
  );

  /* ── Click outside → close custom panels ── */
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // 触发按钮已在 container 内 → 放行
      if (containerRef.current?.contains(target)) return;
      // Portal 面板自身 DOM → 放行（防止菜单项点击被误杀）
      if (modePanelRef.current?.contains(target)) return;
      if (smartMore.panelRef.current?.contains(target)) return;
      setModePanelOpen(false);
      smartMore.close();
      setDollarOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [smartMore.close, smartMore.panelRef]);

  const handleBlur = useCallback(() => {
    requestAnimationFrame(() => {
      const activeEl = document.activeElement;
      if (containerRef.current?.contains(activeEl)) return;
      // 焦点在 Portal 面板内（面板在 body 上，不在 container 内）→ 放行
      if (modePanelRef.current?.contains(activeEl)) return;
      if (smartMore.panelRef.current?.contains(activeEl)) return;
      setIsFocused(false);
      smartMore.close();
      setMentionOpen(false);
      setCommandOpen(false);
      setDollarOpen(false);
    });
  }, [smartMore.close, smartMore.panelRef]);

  // ── Image draft rail: live thumbnails for picked images in the composer ──
  const pendingImages = useMemo(() => parsePendingImages(inputValue), [inputValue]);
  const removePendingImage = useCallback((index: number) => {
    const target = pendingImages[index];
    if (!target) return;
    const next = (inputValue.slice(0, target.start) + inputValue.slice(target.end)).replace(/^\n+/, '');
    setInputValue(next);
  }, [pendingImages, inputValue, setInputValue]);

  const pickFiles = useCallback((accept: string) => {
    const isImage = accept === 'image/*';
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = accept;
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      if (files.length === 0) return;
      const parts: string[] = [];
      for (const file of files) {
        if (isImage) {
          // Image upload: convert to base64 data URL
          if (file.size > 5 * 1024 * 1024) { parts.push(t('composer.imageTooLarge', { name: file.name })); continue; }
          try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
            });
            parts.push(`【图片: ${file.name}】\n${dataUrl}`);
          } catch { parts.push(t('composer.imageReadFailed', { name: file.name })); }
        } else {
          // File upload: inline as text
          if (file.size > 100 * 1024) { parts.push(t('composer.attachmentTooLarge', { name: file.name })); continue; }
          try {
            const text = await file.text();
            const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
            parts.push(`【附件: ${file.name}】\n\`\`\`${ext || ''}\n${text}\n\`\`\``);
          } catch { parts.push(t('composer.attachmentReadFailed', { name: file.name })); }
        }
      }
      if (parts.length > 0) {
        const { inputValue: iv, setInputValue: sv } = useChatStore.getState();
        sv(iv + (iv.trim() ? '\n\n' : '') + parts.join('\n\n'));
      }
    };
    input.click();
  }, []);

  const handleMicClick = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      message.info(t('composer.micUnavailable'));
      return;
    }
    try {
      const rec = new SR();
      rec.lang = 'zh-CN';
      rec.interimResults = false;
      rec.onerror = () => {
        message.error(t('composer.micPermission'));
      };
      rec.onresult = (e: any) => {
        const t = e.results[0][0].transcript?.trim();
        if (t) { const { inputValue: iv, setInputValue: sv } = useChatStore.getState(); sv(iv + (iv.trim() ? ' ' : '') + t); }
      };
      rec.start();
      message.success(t('composer.listening'));
    } catch {
      message.error(t('composer.micFailed'));
    }
  }, []);

  /** Pick a project directory and keep every consumer in sync (settings +
   *  chat store). Shared by the hero chip and the composer toolbar pill. */
  const pickProjectDirectory = useCallback(async () => {
    const result = await window.electronAPI?.project.selectDirectory();
    if (result?.ok && result.data) {
      useSettingsStore.getState().setProjectPath(result.data);
      useChatStore.getState().setCurrentProjectPath(result.data);
      message.success(t('composer.projectDirSet', { path: result.data }));
    }
  }, []);

  const inputCard = (
    <div className="relative w-full max-w-[var(--content-max-width)] z-10">
      <div className="flex flex-col items-start w-full max-w-[var(--content-max-width)] mx-auto">
        <InputDock onSendNow={sendQueueNow} />
        {/* Project directory — Agent mode only, always sits ABOVE the composer
            (start screen and running state), never inside the toolbar. */}
        {isAgentSurface && (
          <button
            type="button"
            className="flex items-center gap-1.5 h-7 px-2.5 mb-2 min-w-0 border-none bg-transparent text-xs text-text-secondary rounded-full cursor-pointer transition-[background,color] duration-fast hover:bg-[var(--color-hover)] hover:text-text-primary"
            aria-label={t('composer.selectProjectDir')}
            title={projectPath ?? t('composer.selectProjectDir')}
            onClick={pickProjectDirectory}
          >
            <FolderOpenIcon size={14} />
            <span className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap">
              {projectPath ? projectPath.split(/[\\/]/).pop() : t('composer.selectProjectDir')}
            </span>
          </button>
        )}
        {pendingPlan ? (
          <PlanApprovalPanel plan={pendingPlan} />
        ) : (
        <div
          className="ax-composer relative flex flex-col w-full max-w-[var(--content-max-width)] mx-auto"
          data-focused={isFocused || undefined}
        >
        {pendingImages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 pt-2">
            {pendingImages.map((img, i) => (
              <span key={`${img.name}-${i}`} className="flex items-center gap-1.5 h-12 pl-1 pr-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border-dim)] rounded-lg">
                <img src={img.dataUrl} alt={img.name} className="h-10 w-10 object-cover rounded-md" />
                <span className="max-w-[120px] truncate text-2xs text-text-secondary">{img.name}</span>
                <button
                  type="button"
                  className="flex items-center justify-center w-5 h-5 rounded-full text-text-muted cursor-pointer border-none bg-transparent hover:bg-[var(--color-hover)] hover:text-text-primary"
                  onClick={() => removePendingImage(i)}
                  aria-label={`${t('composer.removeImage')} ${img.name}`}
                  title={t('composer.removeImage')}
                >
                  <CloseIcon size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        {/* Row 1: transparent textarea — full width, multi-line */}
        <div className={clsx('w-full relative flex border-none bg-transparent outline-none shadow-none pl-4 pr-3 pt-1', isCenter ? 'min-h-[52px]' : 'min-h-[40px]')}>
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDownWithMention}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
            className={clsx(
              'ax-composer-textarea',
              isCenter ? 'text-lg leading-[30px] max-h-[240px] px-1' : 'text-lg leading-[30px] max-h-[160px] px-1',
            )}
            placeholder={
              sidebarMode === 'code'
                ? (pendingPlanMode
                    ? t('composer.placeholder.plan')
                    : t('composer.placeholder.agent'))
                : t('composer.placeholder.chat')
            }
            rows={1}
            disabled={isStreaming}
          />
          {commandOpen && (
            <CommandDropdown items={commandItems} selected={commandSelected} onSelect={handleCommandSelect} onHover={setCommandSelected} position={resolvedPosition} />
          )}
          {mentionOpen && (
            <MentionDropdown
              items={mentionItems}
              sessions={mentionSessions}
              selected={mentionSelected}
              onSelect={handleMentionSelect}
              onSelectSession={handleMentionSessionSelect}
              onHover={setMentionSelected}
              position={resolvedPosition}
            />
          )}
          {dollarOpen && dollarSkills.length > 0 && (
            <SkillMentionDropdown
              skills={dollarSkills}
              query={dollarQuery}
              selected={dollarSelected}
              onSelect={handleDollarSelect}
              onHover={setDollarSelected}
            />
          )}
        </div>

        {/* Queue status — visible while an agent is busy */}
        {isCode && queueLen > 0 && (
          <div className="flex items-center gap-2 px-4 pb-1 -mt-0.5">
            <span className="inline-flex items-center gap-1.5 min-w-0 max-w-[58%] h-5 px-2 rounded-full bg-border-dim text-2xs text-text-secondary">
              <span className="shrink-0 text-text-muted">{t('composer.queued', { n: queueLen })}</span>
              <span className="truncate" title={agentQueue[0].text}>{agentQueue[0].text}</span>
            </span>
            <button
              type="button"
              className="shrink-0 border-none bg-transparent p-0 text-2xs text-primary cursor-pointer hover:opacity-75"
              onClick={() => sendQueuedNow(agentQueue[0].id)}
            >
              {t('composer.sendNow')}
            </button>
            <button
              type="button"
              className="shrink-0 border-none bg-transparent p-0 text-2xs text-text-muted cursor-pointer hover:text-text-secondary"
              onClick={clearAgentQueue}
            >
              {t('composer.cancel')}
            </button>
          </div>
        )}

        {/* Row 2: toolbar — attach/tools on the left, model · mic · send on the right */}
        <div className="ax-composer-toolbar">
        {/* Left: attach button + dropdown */}
        <div className="relative shrink-0">
          <button
            ref={moreTriggerRef}
            className={clsx('ax-icon-button', smartMore.open && '!bg-primary-soft !text-primary')}
            onClick={toggleMoreMenu}
            aria-label={t('composer.attach')}
          >
            <Plus size={16} />
          </button>

          {smartMore.open && smartMore.position && createPortal(
            <div ref={smartMore.panelRef} className="z-[1050] w-[168px] p-1 bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border-dim)] shadow-[var(--shadow-md)] flex flex-col opacity-0 translate-y-1 animate-[smartPanelIn_0.18s_ease_forwards]" style={{
              position: 'fixed',
              left: `${smartMore.position.left}px`,
              ...(smartMore.position.direction === 'up'
                ? { bottom: `${smartMore.position.bottom}px` }
                : { top: `${smartMore.position.top}px` }),
            }}>
              <button className="flex items-center gap-2 w-full min-h-8 px-2 py-1.5 border-none rounded-lg bg-transparent text-left cursor-pointer transition-colors duration-150 hover:bg-[var(--color-hover)]" onClick={() => { pickFiles('*/*'); smartMore.close(); }} type="button">
                <span className="flex items-center justify-center w-4 h-4 shrink-0 text-text-muted"><Paperclip size={16} /></span>
                <span className="flex-1 min-w-0 text-sm leading-[20px] text-text-primary">{t('composer.uploadFile')}</span>
              </button>
              <button className="flex items-center gap-2 w-full min-h-8 px-2 py-1.5 border-none rounded-lg bg-transparent text-left cursor-pointer transition-colors duration-150 hover:bg-[var(--color-hover)]" onClick={() => { pickFiles('image/*'); smartMore.close(); }} type="button">
                <span className="flex items-center justify-center w-4 h-4 shrink-0 text-text-muted"><ImageIcon size={16} /></span>
                <span className="flex-1 min-w-0 text-sm leading-[20px] text-text-primary">{t('composer.uploadImage')}</span>
              </button>
            </div>,
            document.body,
          )}
        </div>

        {/* Code-mode task settings — access pill; plan mode is armed via /plan */}
        {isCode && (
          <>
            {pendingPlanMode && (
              <span className="inline-flex items-center gap-[3px] self-center h-6 px-2 pl-2.5 text-xs font-medium text-primary bg-primary-soft rounded-full" title={t('runmode.planTip')}>
                {t('runmode.plan')}
                <button
                  type="button"
                  className="shrink-0 border-none bg-transparent cursor-pointer text-text-muted w-[20px] h-[20px] rounded-full flex items-center justify-center text-2xs leading-none hover:bg-[var(--color-hover)] hover:text-text-secondary"
                  onClick={() => useChatStore.getState().setPendingPlanMode(false)}
                  aria-label={t('runmode.cancelPlan')}
                >✕</button>
              </span>
            )}
            <AccessSelector
              accessMode={accessMode}
              onChangeAccess={setAccessMode}
            />
          </>
        )}

        {/* Spacer — pushes the model · mic · send cluster to the right */}
        <div className="flex-1" />

        {/* Right: model selector + mic + send — ml-auto keeps it right-aligned
            even when the toolbar wraps onto a second line. */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <ContextMeter />
          <ModeTrigger ref={modeTriggerRef} onClick={toggleModePanel} open={modePanelOpen} />

          {/* Web search toggle is chat-only: Agent mode already has the
              WebSearch/WebFetch tools, so the model searches on its own. */}
          {!isCode && (
            <Tooltip title={isWebSearch ? t('composer.webSearchOn') : t('composer.webSearch')} placement="top">
              <button
                className={clsx('ax-icon-button', isWebSearch && '!bg-primary-soft !text-primary')}
                onClick={toggleWebSearch}
                aria-label={t('composer.webSearch')}
                aria-pressed={isWebSearch}
              >
                <GlobeHemisphereWest size={16} weight={isWebSearch ? 'fill' : 'regular'} />
              </button>
            </Tooltip>
          )}

          <Tooltip title={t('composer.mic')}>
            <button className="ax-icon-button" onClick={handleMicClick} aria-label={t('composer.mic')}>
              <Microphone size={16} />
            </button>
          </Tooltip>

          <button
            type="button"
            className={clsx(
              'ax-send-button',
              (isStreaming || currentAgentRunning) && 'send-btn-stop',
            )}
            onClick={handleSend}
            disabled={!hasInput && !isStreaming && !currentAgentRunning}
            title={currentAgentRunning ? t('composer.stopTask') : isStreaming ? t('composer.stopGenerate') : isCode ? t('composer.startTask') : t('composer.send')}
            aria-label={currentAgentRunning ? t('composer.stopTask') : isStreaming ? t('composer.stopGenerate') : isCode ? t('composer.startTask') : t('composer.send')}
          >
            {(isStreaming || currentAgentRunning) ? (
              <span className="inline-flex items-center justify-center w-[18px] h-[18px]">
                <span className="inline-block w-[10px] h-[10px] bg-current rounded-md" />
              </span>
            ) : isCode ? (
              // Launch a parallel agent task — a "play/run" glyph
              <Play size={16} weight="fill" />
            ) : (
              <ArrowUp size={16} weight="bold" />
            )}
          </button>
        </div>
        </div>{/* /toolbar row */}

        {modePanelOpen && modePanelPos && createPortal(
            <div
              ref={modePanelRef}
              className={clsx(
                'z-[1050] p-1 gap-1 w-[232px] bg-[var(--color-bg-elevated)] rounded-xl flex flex-col',
                'shadow-[var(--shadow-md)]',
                modePanelPos.direction === 'up'
                  ? 'animate-[smartPanelInUp_0.18s_ease_forwards]'
                  : 'animate-[smartPanelInDown_0.18s_ease_forwards]',
              )}
              style={{
                position: 'fixed',
                left: `${modePanelPos.left}px`,
                width: '232px',
                ...(modePanelPos.direction === 'up'
                  ? { bottom: `${modePanelPos.bottom}px` }
                  : { top: `${modePanelPos.top}px` }),
              }}
            >
              <ModePanelContent onSelect={closeModePanel} />
            </div>,
            document.body,
          )}

      </div>
        )}
      </div>{/* /inputGroup */}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={clsx(
        'chat-input svg-center w-full flex flex-col items-center',
        isCenter
          ? 'absolute inset-0 flex items-center justify-center p-5 z-15 pointer-events-none'
          : 'px-6 pb-5 shrink-0 relative z-20',
      )}
    >
      <GhostToast message={toastMsg} visible={showToast} onHide={() => setShowToast(false)} />

      {isCenter ? (
        <div className="ax-hero w-full pointer-events-auto">
          <div className="ax-hero-glow" />
          <div className="ax-hero-headline flex flex-col items-start w-full">
            <span className="flex items-center gap-2">
              <img src={logoPng} alt="Auraxis" className="w-9 h-9 object-contain" />
              {ACCOUNT_NAME ? `${ACCOUNT_NAME}${t('chat.greetingComma')}` : ''}{greeting()}{t('chat.greetingComma')}
            </span>
            <span className="mt-1 text-md font-semibold leading-6 text-[var(--color-text-muted)]">
              {t('chat.heroPrompt')}
            </span>
          </div>
          {inputCard}
        </div>
      ) : (
        inputCard
      )}
    </div>
  );
}
