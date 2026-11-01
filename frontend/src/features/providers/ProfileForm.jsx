import { useMemo, useState } from 'react';
import Button from '../../components/ui/Button';
import { CheckGroup, CheckboxField, SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import TagInput from '../../components/ui/TagInput';
import { Alert } from '../../components/ui/feedback';
import { useToast } from '../../context/ToastContext';
import { providerApi } from '../../services/providerApi';
import { DISTRICTS } from '../../utils/constants';
import { errorFor, errorMessage, fieldErrors } from '../../utils/errors';
import { compact } from '../../utils/format';

const CHANNELS = [
  { value: 'in_app', label: 'Through Imbehe' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
];

function initialState(p, activeIds) {
  return {
    displayName: p?.displayName ?? '',
    bio: p?.bio ?? '',
    // A category an administrator has since disabled would make the whole save fail, so drop it here.
    categories: (p?.categories ?? []).map((c) => c.id).filter((id) => activeIds.has(id)),
    skills: p?.skills ?? [],
    experienceYears: p?.experienceYears != null ? String(p.experienceYears) : '',
    district: p?.location?.district ?? '',
    sector: p?.location?.sector ?? '',
    coverage: p?.coverage ?? [],
    providerType: p?.providerType ?? 'individual',
    preferredChannel: p?.contactPreferences?.preferredChannel ?? 'in_app',
  };
}

export default function ProfileForm({ profile, categories, onSaved }) {
  const toast = useToast();
  const activeIds = useMemo(() => new Set(categories.map((c) => c.id)), [categories]);
  const [form, setForm] = useState(() => initialState(profile, activeIds));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setVal = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = {};
    if (form.displayName.trim().length < 2) found.displayName = 'Enter your name or business name';
    if (form.experienceYears !== '' && !/^\d{1,2}$/.test(form.experienceYears)) found.experienceYears = 'Enter whole years, from 0 to 60';
    if (form.sector.trim() && !form.district) found.district = 'Choose a district to go with the sector';
    setErrors(found);
    if (Object.keys(found).length) return;

    const body = {
      displayName: form.displayName.trim(),
      bio: form.bio.trim(),
      categories: form.categories,
      skills: form.skills,
      coverage: form.coverage,
      providerType: form.providerType,
      contactPreferences: { showPhone: false, showEmail: false, preferredChannel: form.preferredChannel }, // never public: shared only after you accept a job
      ...(form.experienceYears !== '' ? { experienceYears: Number(form.experienceYears) } : {}),
      ...(form.district ? { location: compact({ district: form.district, sector: form.sector.trim() }) } : {}),
    };

    setSaving(true);
    try {
      const { data } = await providerApi.saveMe(body);
      onSaved(data.profile);
      toast.success(profile ? 'Profile saved.' : 'Profile created. Next, request verification.');
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

      <section className="panel space-y-4 p-6" aria-labelledby="about-you">
        <h2 id="about-you" className="text-xl font-semibold">About you</h2>
        <TextField label="Name or business name" value={form.displayName} onChange={set('displayName')} error={errors.displayName} maxLength={100} required />
        <TextAreaField label="Short bio" value={form.bio} onChange={set('bio')} error={errors.bio} maxLength={1000} rows={5} hint={`${form.bio.length}/1000. Say what you do, who you work with and what makes you reliable.`} />
        <TextField label="Years of experience" inputMode="numeric" value={form.experienceYears} onChange={set('experienceYears')} error={errors.experienceYears} className="max-w-[12rem]" />
      </section>

      <section className="panel space-y-4 p-6" aria-labelledby="work">
        <h2 id="work" className="text-xl font-semibold">Your work</h2>
        <CheckGroup legend="Categories" hint="Choose up to 10." options={categories.map((c) => ({ value: c.id, label: c.name }))} value={form.categories} onChange={(v) => setVal('categories')(v.slice(0, 10))} error={errorFor(errors, 'categories')} />
        <TagInput label="Skills" value={form.skills} onChange={setVal('skills')} error={errorFor(errors, 'skills')} hint="Type a skill and press Enter. Up to 30." placeholder="e.g. Laptop repair" />
      </section>

      <section className="panel space-y-4 p-6" aria-labelledby="where">
        <h2 id="where" className="text-xl font-semibold">Where you work</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Home district" value={form.district} onChange={set('district')} placeholder="Choose a district" options={DISTRICTS} error={errors['location.district'] || errors.district} />
          <TextField label="Sector (optional)" value={form.sector} onChange={set('sector')} maxLength={60} error={errors['location.sector']} />
        </div>
        <details className="rounded-lg border border-ink-100 p-3">
          <summary className="cursor-pointer text-sm font-semibold">Districts you travel to ({form.coverage.length} selected)</summary>
          <div className="mt-3">
            <CheckGroup legend="Service coverage" options={DISTRICTS.map((d) => ({ value: d, label: d }))} value={form.coverage} onChange={setVal('coverage')} columns="grid-cols-2 sm:grid-cols-3" error={errorFor(errors, 'coverage')} />
          </div>
        </details>
      </section>

      <section className="panel space-y-4 p-6" aria-labelledby="contact">
        <h2 id="contact" className="text-xl font-semibold">How people can reach you</h2>
        <p className="text-ink-700">Your phone and email are never shown publicly. They are shared with a customer only after you accept their job.</p>
        <SelectField label="I offer services as" value={form.providerType} onChange={set('providerType')} options={[{ value: 'individual', label: 'An individual (National ID and CV needed)' }, { value: 'business', label: 'A registered business (RDB certificate and representative\'s ID needed)' }]} hint="This decides which documents we ask you for when you apply for verification." className="max-w-md" />
        <SelectField label="Preferred way to be contacted" value={form.preferredChannel} onChange={set('preferredChannel')} options={CHANNELS} className="max-w-xs" />
      </section>

      <div><Button type="submit" size="lg" loading={saving}>{profile ? 'Save profile' : 'Create profile'}</Button></div>
    </form>
  );
}
