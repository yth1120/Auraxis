import clsx from 'clsx';

/**
 * Account avatar: custom image when set, otherwise the name's first letter.
 * Used on the login screen and in the account settings pane.
 */
export default function Avatar({
  name,
  src,
  size = 40,
  className,
}: {
  name?: string;
  src?: string;
  size?: number;
  className?: string;
}) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center rounded-full overflow-hidden select-none shrink-0 bg-[var(--color-bg-inset)] text-text-secondary',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="font-medium leading-none">{initial}</span>
      )}
    </span>
  );
}
