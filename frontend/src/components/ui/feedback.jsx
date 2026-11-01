import { errorMessage } from '../../utils/errors';
import Button from './Button';

const alertTones = {
  info: 'border-ink-300 bg-ink-50 text-ink-900',
  success: 'border-emerald-600 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-500 bg-amber-50 text-amber-950',
  error: 'border-rose-600 bg-rose-50 text-rose-900',
};

export function Alert({ tone = 'info', title, children, action, className = '' }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex flex-wrap items-start gap-x-4 gap-y-2 rounded-lg border-l-4 px-4 py-3 text-sm ${alertTones[tone]} ${className}`}>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-200 px-6 py-12 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="mx-auto mt-1.5 max-w-md text-ink-700">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'We could not load this' }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-6 py-10 text-center" role="alert">
      <h3 className="text-lg font-semibold text-rose-900">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-rose-900">{errorMessage(error)}</p>
      {onRetry && <div className="mt-5 flex justify-center"><Button variant="danger" onClick={onRetry}>Try again</Button></div>}
    </div>
  );
}

const badgeTones = {
  neutral: 'bg-ink-50 text-ink-800 ring-ink-200',
  success: 'bg-emerald-50 text-emerald-900 ring-emerald-300',
  warning: 'bg-amber-50 text-amber-950 ring-amber-300',
  danger: 'bg-rose-50 text-rose-900 ring-rose-200',
  info: 'bg-ink-900 text-white ring-ink-900',
};

export function Badge({ tone = 'neutral', children }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${badgeTones[tone]}`}>{children}</span>;
}
