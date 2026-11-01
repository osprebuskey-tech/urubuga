import { useId, useState } from 'react';

/** Type a value and press Enter or comma to add it; click a tag's × to remove it. */
export default function TagInput({ label, hint, error, value, onChange, max = 30, maxLength = 40, placeholder }) {
  const id = useId();
  const [draft, setDraft] = useState('');

  const commit = (raw) => {
    const tag = raw.replace(/,+$/, '').trim().slice(0, maxLength);
    if (tag && value.length < max && !value.some((t) => t.toLowerCase() === tag.toLowerCase())) onChange([...value, tag]);
    setDraft('');
  };

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink-900">{label}</label>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {value.map((tag) => (
            <li key={tag} className="inline-flex items-center gap-1 rounded-full bg-ink-100 py-1 pl-3 pr-1 text-sm text-ink-900">
              {tag}
              <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} aria-label={`Remove ${tag}`} className="rounded-full px-2 text-ink-700 hover:bg-ink-200">×</button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        className="input"
        value={draft}
        placeholder={placeholder}
        disabled={value.length >= max}
        onChange={(e) => (e.target.value.endsWith(',') ? commit(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(draft); } }}
        onBlur={() => commit(draft)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      {hint && !error && <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-600">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm font-medium text-rose-700">{error}</p>}
    </div>
  );
}
