import { memo, useMemo, useCallback, useState } from 'react';
import {
  ArrowClockwise as ReloadOutlined,
  WarningCircle as ExclamationCircleOutlined,
  Copy as CopyOutlined,
  Check as CheckOutlined,
  ThumbsUp,
  ThumbsDown,
} from '@/components/common/icons'
import clsx from 'clsx';
import { useT } from '../../i18n';
import type { Message } from '../../types/chat';
import { getContentText } from '../../types/chat';
import { cleanOutput, cleanStreamChunk } from '../../utils/output-cleaner';
import { useChatStore } from '../../stores/useChatStore';
import { useInspectorStore } from '../../stores/useInspectorStore';
import { useSessionStore } from '../../stores/useSessionStore';
import { useMessageFeedbackStore } from '../../stores/useMessageFeedbackStore';
import { formatTime } from '../../utils/time';
import MarkdownRenderer from './MarkdownRenderer';
import StreamRenderer from './StreamRenderer';
import ThinkingBlock from './ThinkingBlock';
import ToolCallTimeline from './ToolCallTimeline';
import ImageGallery from './ImageGallery';

interface AssistantMessageProps {
  message: Message;
  searchQuery?: string;
  isLastAssistant?: boolean;
}

export default memo(function AssistantMessage({ message, searchQuery, isLastAssistant }: AssistantMessageProps) {
  const t = useT();
  const contentText = getContentText(message.content);
  const { cleanedText, thinkingBlocks: extractedBlocks } = useMemo(
    () => message.isStreaming
      ? { cleanedText: cleanStreamChunk(contentText), thinkingBlocks: [] as string[] }
      : cleanOutput(contentText),
    [contentText, message.isStreaming],
  );
  const thinkingBlocks = (message.thinkingBlocks && message.thinkingBlocks.length > 0)
    ? message.thinkingBlocks
    : extractedBlocks.map((c) => ({ content: c }));

  const retryLastMessage = useChatStore((s) => s.retryLastMessage);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const activeToolCount = useInspectorStore((s) => s.activeToolCount);
  const rating = useMessageFeedbackStore((s) => s.ratings[message.id]);
  const [copied, setCopied] = useState(false);

  const hasSearch = !!(searchQuery && searchQuery.trim());
  const highlightText = useCallback((text: string) => {
    if (!hasSearch) return text;
    const q = searchQuery!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${q})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === searchQuery!.toLowerCase()
        ? <mark key={i} style={{ background: 'var(--color-accent)', color: '#fff', borderRadius: 5, padding: '0 1px' }}>{part}</mark>
        : part,
    );
  }, [searchQuery, hasSearch]);

  const handleRetry = useCallback(() => {
    if (!isStreaming) retryLastMessage();
  }, [retryLastMessage, isStreaming]);

  const hasError = message.tags?.includes('error');
  const hasWarning = message.tags?.includes('warning');
  const isCompleted = !message.isStreaming;

  return (
    <div className="ax-assistant">
      <div
        className={clsx(
          'max-w-full w-full bg-transparent relative',
          isCompleted && 'pr-9 pb-1',
        )}
        style={{ color: 'var(--color-text-primary)' }}
      >
        {hasError && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm mb-3 bg-[var(--color-danger-soft)] text-[var(--color-danger)] border border-[var(--color-danger-border)]"
          >
          <ExclamationCircleOutlined /> {t('msg.errorRetry')}
          </div>
        )}
        {hasWarning && !hasError && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm mb-3 bg-[var(--color-warning-soft)] text-text-secondary border border-[var(--color-warning-border)]"
          >
          <ExclamationCircleOutlined /> {t('msg.adjusted')}
          </div>
        )}

        {thinkingBlocks.length > 0 && <ThinkingBlock blocks={thinkingBlocks} isStreaming={message.isStreaming} />}

        {/* Tool execution timeline — rendered BEFORE text content to match "act first, then conclude" chronology */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallTimeline toolCalls={message.toolCalls} />
        )}

        <div>
          {message.isStreaming ? (
            <StreamRenderer content={cleanedText} />
          ) : (
            <>
              {cleanedText && <MarkdownRenderer content={cleanedText} />}
              <ImageGallery content={contentText} onlyDataUrls />
            </>
          )}
        </div>

        {/* Actions: always visible */}
        {!message.isStreaming && (
        <div className="ax-message-actions absolute bottom-[2px] right-0 z-[2]">
          <button
            className={clsx('ax-message-action', rating === 'up' && '!text-primary')}
            onClick={() => {
              const sid = useSessionStore.getState().currentSessionId;
              if (sid) void useMessageFeedbackStore.getState().rate(message.id, sid, 'up');
            }}
            title={t('msg.helpful')}
          >
            <ThumbsUp size={14} weight={rating === 'up' ? 'fill' : 'regular'} />
          </button>
          <button
            className={clsx('ax-message-action', rating === 'down' && '!text-danger')}
            onClick={() => {
              const sid = useSessionStore.getState().currentSessionId;
              if (sid) void useMessageFeedbackStore.getState().rate(message.id, sid, 'down');
            }}
            title={t('msg.problem')}
          >
            <ThumbsDown size={14} weight={rating === 'down' ? 'fill' : 'regular'} />
          </button>
          {isLastAssistant && (
            <button
              className="ax-message-action"
              onClick={handleRetry}
          title={t('msg.regenerate')}
            >
              <ReloadOutlined />
            </button>
          )}
          <button
            className="ax-message-action"
            onClick={() => {
              navigator.clipboard.writeText(contentText);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          title={t('msg.copyAll')}
          >
            {copied ? <CheckOutlined style={{ color: 'var(--color-success)' }} /> : <CopyOutlined />}
          </button>
        </div>
        )}
      </div>
      <span className="ax-message-time">
        {formatTime(message.timestamp)}
      </span>
    </div>
  );
});
