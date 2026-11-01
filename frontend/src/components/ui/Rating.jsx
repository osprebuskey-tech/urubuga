export default function Rating({ value = 0, count = 0, size = 'sm' }) {
  if (!count) return <span className="text-sm text-ink-600">No reviews yet</span>;
  const dim = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <span className="inline-flex items-center gap-1.5 text-sm" title={`${value.toFixed(1)} out of 5`}>
      <svg className={`${dim} text-amber-500`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9 4.8 17.6l1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
      </svg>
      <span className="font-semibold text-ink-900">{value.toFixed(1)}</span>
      <span className="text-ink-600">({count})</span>
      <span className="sr-only">average rating out of 5 from {count} reviews</span>
    </span>
  );
}

/** Five stars for one review's rating (1 to 5). */
export function Stars({ value, className = 'h-4 w-4' }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} className={`${className} ${n <= value ? 'text-amber-500' : 'text-ink-200'}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9 4.8 17.6l1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}
