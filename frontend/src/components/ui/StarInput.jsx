import { useId } from 'react';

const WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/** Pick 1 to 5 stars. A real radio group underneath, so it works with a keyboard and screen readers. */
export default function StarInput({ legend = 'Your rating', value, onChange, error }) {
  const name = useId();
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-1.5 text-sm font-semibold text-ink-900">{legend}</legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer rounded-md p-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-600">
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" />
            <span className="sr-only">{n} {n === 1 ? 'star' : 'stars'}, {WORDS[n]}</span>
            <svg className={`h-9 w-9 ${n <= value ? 'text-amber-500' : 'text-ink-200 hover:text-amber-300'}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9 4.8 17.6l1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
            </svg>
          </label>
        ))}
        <span className="ml-2 text-sm font-medium text-ink-700" aria-hidden="true">{WORDS[value] || ''}</span>
      </div>
      {error && <p id={`${name}-error`} role="alert" className="mt-1.5 text-sm font-medium text-rose-700">{error}</p>}
    </fieldset>
  );
}
