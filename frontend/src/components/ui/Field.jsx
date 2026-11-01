import { forwardRef, useId } from 'react';

function Shell({ id, label, hint, error, required, children, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink-900">
        {label}
        {required && <span aria-hidden="true" className="text-rose-700"> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-600">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm font-medium text-rose-700">{error}</p>}
    </div>
  );
}

const aria = (id, hint, error) => ({
  'aria-invalid': error ? 'true' : undefined,
  'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
});

export const TextField = forwardRef(function TextField({ label, hint, error, required, className, ...props }, ref) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <input ref={ref} id={id} required={required} className="input" {...aria(id, hint, error)} {...props} />
    </Shell>
  );
});

export const TextAreaField = forwardRef(function TextAreaField({ label, hint, error, required, className, rows = 4, ...props }, ref) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <textarea ref={ref} id={id} rows={rows} required={required} className="input" {...aria(id, hint, error)} {...props} />
    </Shell>
  );
});

export const SelectField = forwardRef(function SelectField({ label, hint, error, required, className, options = [], placeholder, ...props }, ref) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <select ref={ref} id={id} required={required} className="input" {...aria(id, hint, error)} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
        ))}
      </select>
    </Shell>
  );
});

/** A group of checkboxes (or radios) with a visible legend. `options`: [{ value, label }] */
export function CheckGroup({ legend, hint, error, options, value, onChange, type = 'checkbox', columns = 'sm:grid-cols-2' }) {
  const id = useId();
  const toggle = (v) => {
    if (type === 'radio') return onChange([v]);
    return onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <fieldset aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}>
      <legend className="mb-1.5 text-sm font-semibold text-ink-900">{legend}</legend>
      <div className={`grid gap-2 ${columns}`}>
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-ink-100 px-3 py-2 text-sm hover:bg-ink-50 has-[:checked]:border-ink-500 has-[:checked]:bg-ink-50">
            <input
              type={type}
              checked={value.includes(o.value)}
              onChange={() => toggle(o.value)}
              className="mt-0.5 h-4 w-4 accent-rose-700"
            />
            <span>
              <span className="font-medium text-ink-900">{o.label}</span>
              {o.description && <span className="block text-ink-600">{o.description}</span>}
            </span>
          </label>
        ))}
      </div>
      {hint && !error && <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-600">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm font-medium text-rose-700">{error}</p>}
    </fieldset>
  );
}

export function CheckboxField({ label, hint, checked, onChange, ...props }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" checked={checked} onChange={onChange} className="mt-1 h-4 w-4 accent-rose-700" {...props} />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-ink-900">{label}</span>
        {hint && <span className="block text-ink-600">{hint}</span>}
      </label>
    </div>
  );
}
