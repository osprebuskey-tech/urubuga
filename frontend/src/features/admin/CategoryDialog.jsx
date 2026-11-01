import { useState } from 'react';
import Dialog from '../../components/ui/Dialog';
import Button from '../../components/ui/Button';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import TagInput from '../../components/ui/TagInput';
import { Alert } from '../../components/ui/feedback';
import { adminApi } from '../../services/adminApi';
import { errorFor, errorMessage, fieldErrors } from '../../utils/errors';

/** Create (category = null) or edit a category. Mount it only while open so its form always starts fresh. */
function CategoryFormBody({ category, onSaved, onClose }) {
  const [form, setForm] = useState({
    name: category?.name ?? '',
    description: category?.description ?? '',
    subcategories: category?.subcategories?.map((s) => s.name) ?? [],
    status: category?.status ?? 'active',
    sortOrder: String(category?.sortOrder ?? 0),
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = {};
    if (form.name.trim().length < 2) found.name = 'Use at least 2 characters';
    if (!/^\d+$/.test(form.sortOrder)) found.sortOrder = 'Enter a whole number, 0 or higher';
    setErrors(found);
    if (Object.keys(found).length) return;

    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      subcategories: form.subcategories,
      status: form.status,
      sortOrder: Number(form.sortOrder),
    };
    setSaving(true);
    try {
      if (category) await adminApi.updateCategory(category.id, body);
      else await adminApi.createCategory(body);
      onSaved(category ? 'Category updated.' : 'Category created.');
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(err.code === 'CATEGORY_EXISTS' ? { name: err.message } : fe);
      setFormError(err.code === 'CATEGORY_EXISTS' || Object.keys(fe).length ? '' : errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form id="category-form" onSubmit={submit} noValidate className="space-y-4">
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField label="Name" value={form.name} onChange={set('name')} error={errors.name} maxLength={80} required />
      <TextAreaField label="Description (optional)" value={form.description} onChange={set('description')} error={errors.description} maxLength={300} rows={2} />
      <TagInput label="Specialties" value={form.subcategories} onChange={(v) => setForm((f) => ({ ...f, subcategories: v }))} maxLength={80} max={30} error={errorFor(errors, 'subcategories')} hint="Type one and press Enter, like “Logo design”." />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Status" value={form.status} onChange={set('status')} options={[{ value: 'active', label: 'Active' }, { value: 'disabled', label: 'Disabled (hidden)' }]} />
        <TextField label="Display order" inputMode="numeric" value={form.sortOrder} onChange={set('sortOrder')} error={errors.sortOrder} hint="Lower numbers come first." />
      </div>
      <div className="flex flex-wrap justify-end gap-3 pt-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>{category ? 'Save changes' : 'Create category'}</Button>
      </div>
    </form>
  );
}

export default function CategoryDialog({ open, category, onClose, onSaved }) {
  return (
    <Dialog open={open} onClose={onClose} title={category ? `Edit ${category.name}` : 'New category'}>
      {open && <CategoryFormBody category={category} onSaved={onSaved} onClose={onClose} />}
    </Dialog>
  );
}
