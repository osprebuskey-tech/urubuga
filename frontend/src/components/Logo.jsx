import { Link } from 'react-router-dom';

/** The Imbehe emblem (served from /public/logo.png). Decorative: the wordmark or aria-label names it. */
export function LogoMark({ className = 'h-9 w-9', ring = false }) {
  return <img src="/logo.png" alt="" aria-hidden="true" width="36" height="36" className={`${className} shrink-0 rounded-full object-contain ${ring ? 'ring-2 ring-ink-900/20' : ''}`} />;
}

/** The wordmark is dark ink on every surface of the palette (teal, sage, white). `tone` is kept so existing callers still work. */
export default function Logo({ to = '/', tone = 'light', className = '' }) {
  const onDark = tone !== 'dark';
  return (
    <Link to={to} className={`inline-flex items-center gap-2.5 ${className}`} aria-label={to === '/' ? 'Imbehe home' : 'Imbehe dashboard'}>
      <LogoMark ring={onDark} />
      <span className={`font-display text-xl font-bold leading-none tracking-tight text-ink-950`}>Imbehe</span>
    </Link>
  );
}
