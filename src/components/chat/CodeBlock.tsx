import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { message, Modal, Input } from 'antd';
import { useT } from '../../i18n';
import {
  Copy as CopyOutlined,
  Check as CheckOutlined,
} from '@/components/common/icons'
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import markdown from 'highlight.js/lib/languages/markdown';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import { useSettingsStore } from '../../stores/useSettingsStore';

// Register only commonly used languages for bundle size
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('scss', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('go', go);
hljs.registerLanguage('java', java);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);

interface CodeBlockProps {
  language: string;
  code: string;
  onApply?: (code: string) => void;
  onPreview?: (code: string) => void;
}

function CodeBlock({ language, code, onApply, onPreview }: CodeBlockProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const projectPath = useSettingsStore((s) => s.projectPath);

  // Listen for postMessage from the sandboxed preview iframe.
  // Without allow-same-origin the iframe's origin is null — we only accept
  // messages from null-origin iframes when the preview modal is open.
  useEffect(() => {
    if (!previewVisible) return;
    const handler = (e: MessageEvent) => {
      // Sandboxed iframe without allow-same-origin has origin null
      if (e.origin !== 'null') return;
      const { type, payload } = e.data || {};
      if (type === 'apply-code' && typeof payload === 'string') {
        setFileName(language);
        setApplyModalOpen(true);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [previewVisible, language]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      message.success(t('code.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      console.debug('[CodeBlock] 复制到剪贴板失败:', err?.message || err);
      message.error(t('code.copyFailed'));
    }
  }, [code, t]);

  const extMap: Record<string, string> = {
    typescript: '.ts', ts: '.ts', tsx: '.tsx',
    javascript: '.js', js: '.js', jsx: '.jsx',
    css: '.css', html: '.html', json: '.json', md: '.md',
    py: '.py', rs: '.rs', go: '.go', java: '.java',
    vue: '.vue', svelte: '.svelte', scss: '.scss', less: '.less',
  };

  const defaultExt = extMap[language.toLowerCase()] || `.${language}`;

  const handleApplyClick = useCallback(() => {
    if (onApply) {
      onApply(code);
      setApplied(true);
      message.success(t('code.applied'));
      return;
    }
    if (!projectPath) {
      message.warning(t('code.noProject'));
      return;
    }
    setFileName(`generated-${Date.now()}${defaultExt}`);
    setApplyModalOpen(true);
  }, [code, onApply, projectPath, defaultExt, t]);

  const handleApplyConfirm = useCallback(async () => {
    const api = window.electronAPI;
    if (api && projectPath) {
      setApplying(true);
      setApplyModalOpen(false);
      try {
        const result = await api.project.applyCode({
          filePath: fileName,
          code,
          projectRoot: projectPath,
        });

        if (result.ok) {
          setApplied(true);
          message.success(t('code.appliedAction', { action: result.action === 'created' ? t('code.created') : t('code.overwritten'), file: fileName }));
        } else {
          message.error(result.error || t('code.applyFailed'));
        }
      } catch (err: any) {
        message.error(err.message || t('code.applyFailed'));
      } finally {
        setApplying(false);
      }
    }
  }, [code, fileName, projectPath, t]);

  const handlePreview = useCallback(async () => {
    if (onPreview) {
      onPreview(code);
      return;
    }

    // Try IPC-based preview
    const api = window.electronAPI;
    if (api) {
      const extMap: Record<string, string> = {
        typescript: '.tsx', ts: '.tsx', tsx: '.tsx',
        javascript: '.jsx', js: '.jsx', jsx: '.jsx',
        html: '.html', css: '.css',
      };
      const ext = extMap[language.toLowerCase()];
      if (!ext) {
        message.warning(t('code.previewUnsupported'));
        return;
      }

      try {
        const result = await api.project.previewCode({
          filePath: `preview${ext}`,
          code,
          projectRoot: '',
        });
        if (result.ok) {
          setPreviewVisible(true);
        } else {
          message.error(result.error || t('code.previewFailed'));
        }
      } catch (err: any) {
        message.error(err.message || t('code.previewFailed'));
      }
      return;
    }

    setPreviewVisible(true);
  }, [code, language, onPreview]);

  const previewHtml = language === 'html'
    ? code
    : `<html><body><pre><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre></body></html>`;

  return (
    <div className="my-4 rounded-xl overflow-hidden bg-[var(--color-code-bg)]">
      <div className="flex items-center justify-between px-3 py-1.5 font-mono text-xs text-[var(--color-text-muted)] select-none bg-[var(--color-bg-tertiary)]">
        <span className="font-medium lowercase tracking-wide">{language}</span>
        <button className="inline-flex items-center gap-1 border-none bg-transparent text-[var(--color-text-muted)] text-2xs cursor-pointer px-1.5 py-0.5 rounded-md hover:text-[var(--color-text-secondary)] hover:bg-white/8 transition-colors duration-150" onClick={handleCopy} type="button">
          {copied ? <CheckOutlined /> : <CopyOutlined />}
          <span>{copied ? t('code.copiedShort') : t('code.copy')}</span>
        </button>
      </div>
      <HighlightedCode language={language} code={code} />

      <Modal
        title={t('code.applyTip')}
        open={applyModalOpen}
        onOk={handleApplyConfirm}
        onCancel={() => setApplyModalOpen(false)}
        okText={t('code.confirmApply')}
        cancelText={t('common.cancel')}
        width={480}
        transitionName=""
        maskTransitionName=""
      >
        <div className="mb-2">
          <label className="text-primary font-body text-sm">
            {t('code.targetPath')}
          </label>
        </div>
        <Input
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          placeholder="src/components/NewComponent.tsx"
          autoFocus
        />
      </Modal>

      <Modal
        title={t('code.preview')}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width="80%"
        style={{ top: 20 }}
        transitionName=""
        maskTransitionName=""
      >
        <iframe
          srcDoc={previewHtml}
          className="w-full h-[60vh] border-none rounded-md"
          title={t('code.preview')}
          // allow-scripts only — no allow-same-origin.
          // Without allow-same-origin the iframe's origin is null, preventing
          // AI-generated code from accessing the parent window's DOM, cookies,
          // or localStorage. postMessage still works; the listener below
          // validates origin === null for sandboxed iframe communication.
          sandbox="allow-scripts"
        />
      </Modal>
    </div>
  );
}

function HighlightedCode({ language, code }: { language: string; code: string }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const html = useMemo(() => {
    if (!isVisible) {
      return code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    const lang = hljs.getLanguage(language);
    if (lang) {
      return hljs.highlight(code, { language }).value;
    }
    return code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }, [code, language, isVisible]);

  return (
    <pre ref={ref} className="m-0 px-4 py-3 overflow-x-auto font-mono text-sm leading-[22px] text-[var(--color-text-secondary)] tab-2 bg-[var(--color-code-bg)] [&_code]:bg-transparent [&_code]:p-0 [&_code]:border-none [&_code]:text-inherit">
      <code
        className={`language-${language} hljs`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </pre>
  );
}
const CodeBlockMemo = memo(CodeBlock);
export default CodeBlockMemo;
