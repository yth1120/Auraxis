import { useEffect, useRef, useCallback } from 'react';

export function useAutoResize(minRows = 1, maxRows = 8) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    el.style.height = 'auto';
    const lineHeight = parseInt(getComputedStyle(el).lineHeight) || 24;
    const minHeight = lineHeight * minRows;
    const maxHeight = lineHeight * maxRows;

    // When the textarea is empty, skip the scrollHeight-based calc.
    // scrollHeight reports bogus values during mount if the parent flex
    // container hasn't received its width yet (placeholder text wraps and
    // inflates the reported height up to maxHeight).
    if (!el.value) {
      el.style.height = `${minHeight}px`;
      el.style.overflowY = 'hidden';
      return;
    }

    const newHeight = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = `${newHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [minRows, maxRows]);

  useEffect(() => {
    resize();
  }, [resize]);

  // Re-run resize when the textarea's container width changes (e.g.
  // sidebar collapses/expands, viewport resize). Without this the
  // textarea keeps a stale height computed against a stale parent width.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const parent = el.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(() => resize());
    ro.observe(parent);
    return () => ro.disconnect();
  }, [resize]);

  return { ref, resize };
}
