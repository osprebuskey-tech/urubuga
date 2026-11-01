import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, ErrorState } from '../../components/ui/feedback';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { useToast } from '../../context/ToastContext';
import { useAsync, allowCode } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { companyApi } from '../../services/companyApi';
import { DISTRICTS, RW_PHONE_RE } from '../../utils/constants';
import { errorMessage, fieldErrors } from '../../utils/errors';
import { compact } from '../../utils/format';

const initial = (c) => ({
  companyName: c?.companyName ?? '',
  registrationNumber: c?.registrationNumber ?? '',
  industry: c?.industry ?? '',
  description: c?.description ?? '',
  website: c?.website ?? '',
  district: c?.address?.district ?? '',
  sector: c?.address?.sector ?? '',
  street: c?.address?.street ?? '',
  contactName: c?.contactPerson?.name ?? '',
  contactPhone: c?.contactPerson?.phone ?? '',
});

function CompanyForm({ company, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => initial(company));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = {};
    if (form.companyName.trim().length < 2) found.companyName = 'Enter your company name';
    if (form.registrationNumber.trim() && !/^[A-Za-z0-9-]{5,30}$/.test(form.registrationNumber.trim())) found.registrationNumber = '5–30 letters, numbers or dashes';
    if (form.website.trim()) { try { new URL(form.website.trim()); } catch { found.website = 'Enter a full web address, like https://example.rw'; } }
    if (form.contactPhone.trim() && !RW_PHONE_RE.test(form.contactPhone.replace(/\s/g, ''))) found['contactPerson.phone'] = 'Enter a valid Rwandan mobile number';
    setErrors(found);
    if (Object.keys(found).length) return;

    const address = compact({ district: form.district, sector: form.sector.trim(), street: form.street.trim() });
    const contactPerson = compact({ name: form.contactName.trim(), phone: form.contactPhone.replace(/\s/g, '') });
    const body = {
      ...compact({
        companyName: form.companyName.trim(),
        registrationNumber: form.registrationNumber.trim(),
        industry: form.industry.trim(),
        description: form.description.trim(),
        website: form.website.trim(),
      }),
      ...(Object.keys(address).length ? { address } : {}),
      ...(Object.keys(contactPerson).length ? { contactPerson } : {}),
    };

    setSaving(true);
    try {
      const { data } = await companyApi.saveMe(body);
      onSaved(data.company);
      toast.success('Company profile saved.');
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
      <section className="panel space-y-4 p-6" aria-labelledby="co">
        <h2 id="co" className="text-xl font-semibold">Company</h2>
        <TextField label="Company name" value={form.companyName} onChange={set('companyName')} error={errors.companyName} maxLength={150} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Registration or TIN number" value={form.registrationNumber} onChange={set('registrationNumber')} error={errors.registrationNumber} hint="Only you and administrators can see this." />
          <TextField label="Industry" value={form.industry} onChange={set('industry')} error={errors.industry} maxLength={80} />
        </div>
        <TextAreaField label="About the company" value={form.description} onChange={set('description')} error={errors.description} maxLength={1000} rows={4} />
        <TextField label="Website" type="url" value={form.website} onChange={set('website')} error={errors.website} placeholder="https://" />
      </section>
      <section className="panel space-y-4 p-6" aria-labelledby="addr">
        <h2 id="addr" className="text-xl font-semibold">Address</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField label="District" value={form.district} onChange={set('district')} placeholder="Choose" options={DISTRICTS} error={errors['address.district']} />
          <TextField label="Sector" value={form.sector} onChange={set('sector')} maxLength={60} error={errors['address.sector']} />
          <TextField label="Street" value={form.street} onChange={set('street')} maxLength={120} error={errors['address.street']} />
        </div>
      </section>
      <section className="panel space-y-4 p-6" aria-labelledby="cp">
        <h2 id="cp" className="text-xl font-semibold">Contact person</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" value={form.contactName} onChange={set('contactName')} maxLength={100} error={errors['contactPerson.name']} />
          <TextField label="Mobile number" type="tel" value={form.contactPhone} onChange={set('contactPhone')} error={errors['contactPerson.phone']} hint="Like 0788 123 456" />
        </div>
      </section>
      <Button type="submit" size="lg" loading={saving}>{company ? 'Save company profile' : 'Create company profile'}</Button>
    </form>
  );
}

export default function CompanyProfilePage() {
  useDocumentTitle('Company profile');
  const loaded = useAsync((signal) => allowCode(companyApi.getMe(signal), 'COMPANY_NOT_FOUND'), []);
  const [saved, setSaved] = useState(null);
  if (loaded.loading) return <PageLoader label="Loading your company" />;
  if (loaded.error) return <ErrorState error={loaded.error} onRetry={loaded.reload} />;
  const company = saved ?? loaded.data?.company ?? null;
  return (
    <>
      <PageHeader title="Company profile" description="Details about the business you hire services for." />
      <CompanyForm key={company?.id ?? 'new'} company={company} onSaved={setSaved} />
    </>
  );
}
