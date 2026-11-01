import { useState } from 'react';
import Button from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/Field';
import { DISTRICTS, MIN_RATINGS, PRICING_TYPES } from '../../utils/constants';

/**
 * Filters are edited locally and applied together (one request, one URL change).
 * The parent re-mounts this panel (via `key`) when the URL changes, so the form always matches the URL.
 */
export default function FilterPanel({ type, filters, categories, onApply, onClear }) {
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState('');
  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (draft.minPrice && draft.maxPrice && Number(draft.minPrice) > Number(draft.maxPrice)) {
      setError('The lowest price can’t be higher than the highest price.');
      return;
    }
    setError('');
    onApply(draft);
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Filters">
      <SelectField label="Category" value={draft.category} onChange={set('category')} placeholder="All categories" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
      <SelectField label="District" value={draft.district} onChange={set('district')} placeholder="Anywhere in Rwanda" options={DISTRICTS} />
      <SelectField label="Provider rating" value={draft.minRating} onChange={set('minRating')} options={MIN_RATINGS} />
      {type === 'services' && (
        <>
          <SelectField label="Pricing" value={draft.pricingType} onChange={set('pricingType')} placeholder="Any pricing" options={PRICING_TYPES} />
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">Starting price (RWF)</legend>
            <div className="grid grid-cols-2 gap-2">
              <input aria-label="Lowest price" inputMode="numeric" pattern="[0-9]*" placeholder="Min" value={draft.minPrice} onChange={set('minPrice')} className="input" />
              <input aria-label="Highest price" inputMode="numeric" pattern="[0-9]*" placeholder="Max" value={draft.maxPrice} onChange={set('maxPrice')} className="input" />
            </div>
            <p className="mt-1.5 text-sm text-ink-600">Price filters skip services priced by quotation.</p>
          </fieldset>
        </>
      )}
      {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">Apply filters</Button>
        <Button variant="outline" onClick={onClear}>Clear</Button>
      </div>
    </form>
  );
}
