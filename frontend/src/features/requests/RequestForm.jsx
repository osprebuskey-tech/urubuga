import { useState } from 'react';
import Button from '../../components/ui/Button';
import { CheckboxField, SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { Alert } from '../../components/ui/feedback';
import { DISTRICTS } from '../../utils/constants';
import { errorMessage, fieldErrors } from '../../utils/errors';
import { compact, isoDay } from '../../utils/format';

const initial = (r, defaults) => ({
  title: r?.title ?? '',
  description: r?.description ?? '',
  category: r?.category?.id ?? defaults?.category ?? '',
  subcategory: r?.subcategory ?? '',
  district: r?.location?.district ?? '',
  sector: r?.location?.sector ?? '',
  preferredDate: r?.preferredDate ? r.preferredDate.slice(0, 10) : '',
  budgetMin: r?.budgetMin != null ? String(r.budgetMin) : '',
  budgetMax: r?.budgetMax != null ? String(r.budgetMax) : '',
  onBehalfOfCompany: false,
});

const isRwf = (v) => /^\d+$/.test(v) && Number(v) <= 1_000_000_000;

export function validateRequest(form) {
  const e = {};
  if (form.title.trim().length < 3) e.title = 'Use at least 3 characters';
  if (form.description.trim().length < 10) e.description = 'Describe the job in at least 10 characters';
  if (!form.category) e.category = 'Choose a category';
  if (!form.district) e['location.district'] = 'Choose a district';
  if (form.budgetMin && !isRwf(form.budgetMin)) e.budgetMin = 'Enter a whole number of RWF';
  if (form.budgetMax && !isRwf(form.budgetMax)) e.budgetMax = 'Enter a whole number of RWF';
  if (!e.budgetMin && !e.budgetMax && form.budgetMin && form.budgetMax && Number(form.budgetMin) > Number(form.budgetMax)) e.budgetMin = 'The lowest budget can’t be higher than the highest';
  if (form.preferredDate && form.preferredDate < isoDay()) e.preferredDate = 'Choose today or a later date';
  return e;
}

/** Create (request = null) or edit a request. `provider` ({ id, displayName }) makes it a directed request. */
export default function RequestForm({ request, categories, provider, canUseCompany, defaults, onSubmit, submitLabel }) {
  const isEdit = Boolean(request);
  const [form, setForm] = useState(() => initial(request, defaults));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const category = categories.find((c) => c.id === form.category);

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = validateRequest(form);
    setErrors(found);
    if (Object.keys(found).length) return;

    const body = {
      ...compact({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        subcategory: form.subcategory,
        preferredDate: form.preferredDate,
        budgetMin: form.budgetMin === '' ? '' : Number(form.budgetMin),
        budgetMax: form.budgetMax === '' ? '' : Number(form.budgetMax),
      }),
      location: compact({ district: form.district, sector: form.sector.trim() }),
      ...(!isEdit && provider ? { provider: provider.id } : {}),
      ...(!isEdit && canUseCompany && form.onBehalfOfCompany ? { onBehalfOfCompany: true } : {}),
    };

    setSaving(true);
    try {
      await onSubmit(body);
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      setFormError(Object.keys(fe).length ? 'Some details need fixing. Check the highlighted fields.' : errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-8">
      {provider && !isEdit && <Alert tone="info">This request will be sent only to <strong>{provider.displayName}</strong>. To hear from several providers, leave them out and just choose a category.</Alert>}
      {formError && <Alert tone="error">{formError}</Alert>}

      <section className="panel space-y-4 p-6" aria-labelledby="job">
        <h2 id="job" className="text-xl font-semibold">The job</h2>
        <TextField label="Title" value={form.title} onChange={set('title')} error={errors.title} maxLength={120} required hint="A short summary, like “Set up Wi-Fi for a 10-person office”." />
        <TextAreaField label="Details" value={form.description} onChange={set('description')} error={errors.description} rows={6} maxLength={3000} required hint={`${form.description.length}/3000. What needs doing, what you have already, and anything a provider should know.`} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, subcategory: '' }))} placeholder="Choose a category" options={categories.map((c) => ({ value: c.id, label: c.name }))} error={errors.category} required />
          <SelectField label="Type of work (optional)" value={form.subcategory} onChange={set('subcategory')} placeholder={category ? 'Not sure' : 'Choose a category first'} disabled={!category} options={(category?.subcategories ?? []).map((s) => ({ value: s.slug, label: s.name }))} error={errors.subcategory} />
        </div>
      </section>

      <section className="panel space-y-4 p-6" aria-labelledby="where-when">
        <h2 id="where-when" className="text-xl font-semibold">Where and when</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="District" value={form.district} onChange={set('district')} placeholder="Choose a district" options={DISTRICTS} error={errors['location.district']} required />
          <TextField label="Sector (optional)" value={form.sector} onChange={set('sector')} maxLength={60} error={errors['location.sector']} />
        </div>
        <TextField label="Preferred date (optional)" type="date" min={isoDay()} value={form.preferredDate} onChange={set('preferredDate')} error={errors.preferredDate} className="max-w-xs" />
      </section>

      <section className="panel space-y-4 p-6" aria-labelledby="budget">
        <h2 id="budget" className="text-xl font-semibold">Budget (optional)</h2>
        <p className="text-ink-700">A range helps providers send a realistic quotation. It isn’t a promise to pay that much.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Lowest (RWF)" inputMode="numeric" value={form.budgetMin} onChange={set('budgetMin')} error={errors.budgetMin} />
          <TextField label="Highest (RWF)" inputMode="numeric" value={form.budgetMax} onChange={set('budgetMax')} error={errors.budgetMax} />
        </div>
        {canUseCompany && !isEdit && <CheckboxField label="This is for my company" hint="Providers will see your company name." checked={form.onBehalfOfCompany} onChange={(e) => setForm((f) => ({ ...f, onBehalfOfCompany: e.target.checked }))} />}
      </section>

      <Button type="submit" size="lg" loading={saving}>{submitLabel}</Button>
    </form>
  );
}
