import { useState } from 'react';
import Button from '../../components/ui/Button';
import { CheckGroup, SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { Alert } from '../../components/ui/feedback';
import { DAYS, DISTRICTS, PRICING_TYPES } from '../../utils/constants';
import { compact } from '../../utils/format';
import { errorFor, errorMessage, fieldErrors } from '../../utils/errors';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft (only you can see it)' },
  { value: 'active', label: 'Live (public in search)' },
  { value: 'paused', label: 'Paused (hidden for now)' },
];

function initialState(s) {
  return {
    title: s?.title ?? '',
    description: s?.description ?? '',
    category: s?.category?.id ?? '',
    subcategory: s?.subcategory ?? '',
    pricingType: s?.pricingType ?? 'fixed',
    priceFrom: s?.priceFrom != null ? String(s.priceFrom) : '',
    estimatedDuration: s?.estimatedDuration ?? '',
    district: s?.location?.district ?? '',
    sector: s?.location?.sector ?? '',
    days: s?.availability?.days ?? [],
    notes: s?.availability?.notes ?? '',
    status: s?.status ?? 'draft',
  };
}

/** Builds the API body. On edit, cleared optional fields are sent as "" so they can actually be cleared. */
export function buildListingBody(form, isEdit) {
  const full = {
    title: form.title.trim(),
    description: form.description.trim(),
    category: form.category,
    subcategory: form.subcategory,
    pricingType: form.pricingType,
    estimatedDuration: form.estimatedDuration.trim(),
    location: { district: form.district, sector: form.sector.trim() },
    availability: { days: form.days, notes: form.notes.trim() },
    status: form.status,
  };
  if (form.pricingType !== 'quotation') full.priceFrom = Number(form.priceFrom);
  if (isEdit) return full;
  return { ...compact({ ...full, location: undefined, availability: undefined }), location: compact(full.location), availability: compact(full.availability) };
}

export default function ListingForm({ listing, categories, onSubmit, submitLabel, blocked }) {
  const isEdit = Boolean(listing);
  const [form, setForm] = useState(() => initialState(listing));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const category = categories.find((c) => c.id === form.category);
  const subcategories = category?.subcategories ?? [];

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = {};
    if (form.title.trim().length < 3) found.title = 'Use at least 3 characters';
    if (form.description.trim().length < 10) found.description = 'Describe the service in at least 10 characters';
    if (!form.category) found.category = 'Choose a category';
    if (!form.district) found['location.district'] = 'Choose a district';
    if (form.pricingType !== 'quotation') {
      if (!/^\d+$/.test(form.priceFrom)) found.priceFrom = 'Enter a whole number of RWF, like 15000';
      else if (Number(form.priceFrom) > 1_000_000_000) found.priceFrom = 'That price is too high';
    }
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      await onSubmit(buildListingBody(form, isEdit));
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      setFormError(Object.keys(fe).length ? 'Some details need fixing. Check the highlighted fields.' : errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-8">
      {formError && <Alert tone="error">{formError}</Alert>}

      <section className="panel space-y-4 p-6" aria-labelledby="basics">
        <h2 id="basics" className="text-xl font-semibold">The service</h2>
        <TextField label="Title" value={form.title} onChange={set('title')} error={errors.title} maxLength={120} required hint="Say what you do, like “Laptop screen replacement”." />
        <TextAreaField label="Description" value={form.description} onChange={set('description')} error={errors.description} rows={6} maxLength={3000} required hint={`${form.description.length}/3000. What’s included, how you work, what customers should prepare.`} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, subcategory: '' }))} placeholder="Choose a category" options={categories.map((c) => ({ value: c.id, label: c.name }))} error={errors.category} required />
          <SelectField label="Specialty (optional)" value={form.subcategory} onChange={set('subcategory')} placeholder={category ? 'None' : 'Choose a category first'} disabled={!category} options={subcategories.map((s) => ({ value: s.slug, label: s.name }))} error={errors.subcategory} />
        </div>
      </section>

      <section className="panel space-y-4 p-6" aria-labelledby="pricing">
        <h2 id="pricing" className="text-xl font-semibold">Pricing</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="How do you charge?" value={form.pricingType} onChange={set('pricingType')} options={PRICING_TYPES} error={errors.pricingType} />
          {form.pricingType !== 'quotation' && (
            <TextField label={form.pricingType === 'hourly' ? 'Starting price per hour (RWF)' : 'Starting price (RWF)'} inputMode="numeric" value={form.priceFrom} onChange={set('priceFrom')} error={errors.priceFrom} required />
          )}
        </div>
        {form.pricingType === 'quotation' && <p className="text-ink-700">Customers will see “Price on quotation”. You’ll set the price per job.</p>}
        <TextField label="How long does it usually take? (optional)" value={form.estimatedDuration} onChange={set('estimatedDuration')} error={errors.estimatedDuration} maxLength={60} placeholder="e.g. 1–2 days" className="max-w-sm" />
      </section>

      <section className="panel space-y-4 p-6" aria-labelledby="where-when">
        <h2 id="where-when" className="text-xl font-semibold">Where and when</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="District" value={form.district} onChange={set('district')} placeholder="Choose a district" options={DISTRICTS} error={errors['location.district']} required />
          <TextField label="Sector (optional)" value={form.sector} onChange={set('sector')} maxLength={60} error={errors['location.sector']} />
        </div>
        <CheckGroup legend="Days you’re available" options={DAYS} value={form.days} onChange={(days) => setForm((f) => ({ ...f, days }))} columns="grid-cols-4 sm:grid-cols-7" error={errorFor(errors, 'availability.days')} />
        <TextField label="Availability notes (optional)" value={form.notes} onChange={set('notes')} maxLength={300} error={errors['availability.notes']} placeholder="e.g. Weekdays after 5 pm" />
      </section>

      <section className="panel space-y-4 p-6" aria-labelledby="visibility">
        <h2 id="visibility" className="text-xl font-semibold">Visibility</h2>
        <SelectField label="Status" value={form.status} onChange={set('status')} options={STATUS_OPTIONS} error={errors.status} hint="A listing only goes live once your provider profile is verified." className="max-w-sm" />
      </section>

      {blocked && <Alert tone="warning">{blocked}</Alert>}
      <Button type="submit" size="lg" loading={saving} disabled={Boolean(blocked)}>{submitLabel}</Button>
    </form>
  );
}
