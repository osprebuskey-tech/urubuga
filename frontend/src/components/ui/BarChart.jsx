/**
 * A small accessible bar chart. The bars are decorative; the same numbers are always available as a table
 * (the `data` rows), so nothing is conveyed by the picture alone.
 */
export default function BarChart({ title, data, format = (v) => String(v), color = 'bg-ink-700' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-semibold">{title}</figcaption>
      <div className="flex h-32 items-end gap-0.5" aria-hidden="true">
        {data.map((d) => (
          <div key={d.label} className="flex h-full flex-1 items-end" title={`${d.label}: ${format(d.value)}`}>
            <div className={`w-full rounded-t ${d.value ? color : 'bg-ink-100'}`} style={{ height: d.value ? `${Math.max((d.value / max) * 100, 3)}%` : '2px' }} />
          </div>
        ))}
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-medium text-rose-700">Show the numbers</summary>
        <div className="mt-2 max-h-60 overflow-auto rounded-lg border border-ink-100">
          <table className="w-full text-left">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-ink-50"><tr><th scope="col" className="px-3 py-1.5">Day</th><th scope="col" className="px-3 py-1.5">Value</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.label} className="border-t border-ink-100"><td className="px-3 py-1">{d.label}</td><td className="px-3 py-1">{format(d.value)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
