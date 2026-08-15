import clsx from 'clsx';
import executingGif from '../../assets/executing.gif';

interface ExecutingIndicatorProps {
  size?: number;
  className?: string;
}

/**
 * Live executing indicator — the user-provided monochrome loop (transparent
 * GIF). Inverts in dark theme so the black glyph stays visible on dark
 * surfaces; default size matches the status-dot rhythm.
 */
export default function ExecutingIndicator({ size = 14, className }: ExecutingIndicatorProps) {
  return (
    <img
      src={executingGif}
      alt=""
      aria-hidden
      width={size}
      height={size}
      draggable={false}
      className={clsx('executing-indicator shrink-0 object-contain select-none dark:invert', className)}
    />
  );
}
