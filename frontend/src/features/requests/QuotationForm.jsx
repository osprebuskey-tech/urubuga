import { useState } from 'react';
import Button from '../../components/ui/Button';
import { TextAreaField, TextField } from '../../components/ui/Field';
import TagInput from '../../components/ui/TagInput';
import { Alert } from '../../components/ui/feedback';
import { errorFor, errorMessage, fieldErrors } from '../../utils/errors';
import { isoDay } from '../../utils/format';

export function validateQuotation(form) {
  const e = {};
  if (!/^\d+$/.test(form.price) || Number(form.price) < 1) e.price = 'Enter a whole number of RWF, like 35000';
  else if (Number(form.price) > 1_000_000_000) e.price = 'That price is too high';
  if (form.description.trim().length < 10) e.description = 'Describe the work in at least 10 characters';
  if (!form.estimatedDuration.trim()) e.estimatedDuration = 'Say how long the work will take';
  if (!form.expiresAt) e.expiresAt = 'Choose the last day this price is valid';
  else if (form.expiresAt < isoDay()) e.expiresAt = 'Choose today or a later date';
  else if (form.expiresAt > isoDay(90)) e.expiresAt = 'Choose a date within 90 days';
  return e;
}

/** Create (quotation = null) or edit a pending quotation. onSubmit(body) may throw an ApiError. */
export default function QuotationForm({ quotation, onSubmit, onCancel, submitLabel = 'Send quotation' }) {
  const isEdit = Boolean(quotation);
  const stillValid = quotation && quotation.expiresAt.slice(0, 10) >= isoDay();
  const [form, setForm] = useState({
    price: quotation ? String(quotation.price) : '',
    description: quotation?.description ?? '',
    deliverables: quotation?.deliverables ?? [],
    estimatedDuration: quotation?.estimatedDuration ?? '',
    expiresAt: quotation ? (stillValid ? quotation.expiresAt.slice(0, 10) : '') : isoDay(14),
    terms: quotation?.terms ?? '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = validateQuotation(form);
    setErrors(found);
    if (Object.keys(found).length) return;

    const body = {
      price: Number(form.price),
      description: form.description.trim(),
      deliverables: form.deliverables,
      estimatedDuration: form.estimatedDuration.trim(),
      expiresAt: form.expiresAt,
      // On create an empty "terms" is left out; on edit it is sent so it can be cleared.
      ...(isEdit || form.terms.trim() ? { terms: form.terms.trim() } : {}),
    };
    setSaving(true);
    try {
      await onSubmit(body);
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      setFormError(Object.keys(fe).length ? 'Some details need fixing. Check the highlighted fields.' : errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {isEdit && !stillValid && <Alert tone="warning">This quotation has expired. Choose a new last day to make it available again.</Alert>}
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Your price (RWF)" inputMode="numeric" value={form.price} onChange={set('price')} error={errors.price} required />
        <TextField label="How long will it take?" value={form.estimatedDuration} onChange={set('estimatedDuration')} error={errors.estimatedDuration} maxLength={60} placeholder="e.g. 2 days" required />
      </div>
      <TextAreaField label="What you will do" value={form.description} onChange={set('description')} error={errors.description} rows={5} maxLength={3000} required />
      <TagInput label="What the customer gets (optional)" value={form.deliverables} onChange={(v) => setForm((f) => ({ ...f, deliverables: v }))} max={10} maxLength={200} error={errorFor(errors, 'deliverables')} hint="Type an item and press Enter, like “Written diagnosis”." />
      <TextField label="Price valid until" type="date" min={isoDay()} max={isoDay(90)} value={form.expiresAt} onChange={set('expiresAt')} error={errors.expiresAt} className="max-w-xs" required />
      <TextAreaField label="Terms (optional)" value={form.terms} onChange={set('terms')} error={errors.terms} rows={3} maxLength={2000} hint="Payment, materials, warranty, anything the customer should agree to." />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={saving}>{submitLabel}</Button>
        {onCancel && <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>}
      </div>
    </form>
  );
}
