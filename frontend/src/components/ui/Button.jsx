import { Link } from 'react-router-dom';
import Spinner from './Spinner';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';
const variants = {
  primary: 'bg-teal-600 text-white hover:bg-teal-700',
  secondary: 'bg-sage-700 text-white hover:bg-sage-800',
  accent: 'bg-sun-300 text-ink-950 hover:bg-sun-400',
  outline: 'border border-ink-300 bg-white text-ink-900 hover:bg-ink-50',
  ghost: 'text-ink-800 hover:bg-ink-50',
  danger: 'bg-white text-rose-700 border border-rose-300 hover:bg-rose-50',
};
const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3 text-base' };

export const buttonClasses = ({ variant = 'primary', size = 'md', className = '' } = {}) =>
  `${base} ${variants[variant]} ${sizes[size]} ${className}`;

export default function Button({ variant, size, loading = false, disabled, className, children, type = 'button', ...props }) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClasses({ variant, size, className })} {...props}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, className, children, ...props }) {
  return (
    <Link className={buttonClasses({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}
