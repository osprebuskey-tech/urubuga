import { useState } from 'react';
import Button from '../../components/ui/Button';
import FileButton from '../../components/ui/FileButton';
import Dialog, { ConfirmDialog } from '../../components/ui/Dialog';
import PageHeader from '../../components/ui/PageHeader';
import { SelectField, TextField } from '../../components/ui/Field';
import { Alert, Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { PageLoader } from '../../components/ui/Spinner';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { partnerApi } from '../../services/partnerApi';
import { errorMessage, fieldErrors } from '../../utils/errors';

const KINDS = [{ value: 'partner', label: 'Partner' }, { value: 'sponsor', label: 'Sponsor' }];
const EMPTY = { name: '', kind: 'partner', websiteUrl: '', sortOrder: '' };

function validate(form, file, needsFile) {
  const e = {};
  if (form.name.trim().length < 2) e.name = 'Enter the name';
  if (form.websiteUrl.trim() && !/^https?:\/\/\S+\.\S+/i.test(form.websiteUrl.trim())) e.websiteUrl = 'Use a link that starts with http:// or https://';
  if (form.sortOrder !== '' && !/^\d{1,5}$/.test(String(form.sortOrder))) e.sortOrder = 'Use a whole number, 0 or more';
  if (needsFile && !file) e.logo = 'Choose a logo (JPEG, PNG or WebP)';
  return e;
}

function Row({ partner: p, onChange }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: p.name, kind: p.kind, websiteUrl: p.websiteUrl ?? '', sortOrder: String(p.sortOrder ?? 0) });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const run = async (fn, done) => {
    setBusy(true);
    try { await fn(); toast.success(done); onChange(); return true; } catch (err) { toast.error(errorMessage(err)); setErrors(fieldErrors(err)); return false; } finally { setBusy(false); }
  };

  const save = async () => {
    const found = validate(form, null, false);
    setErrors(found);
    if (Object.keys(found).length) return;
    const ok = await run(() => partnerApi.update(p.id, { name: form.name.trim(), kind: form.kind, websiteUrl: form.websiteUrl.trim(), sortOrder: Number(form.sortOrder || 0) }), 'Saved.');
    if (ok) setEditing(false);
  };

  return (
    <li className="panel flex flex-wrap items-center gap-4 p-4">
      <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-lg border border-ink-100 bg-white p-2"><img src={p.logoUrl} alt={`${p.name} logo`} className="max-h-full max-w-full object-contain" /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{p.name}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-700">
          <Badge tone={p.kind === 'sponsor' ? 'warning' : 'neutral'}>{p.kind === 'sponsor' ? 'Sponsor' : 'Partner'}</Badge>
          <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>{p.status === 'active' ? 'Shown' : 'Hidden'}</Badge>
          <span>Order {p.sortOrder}</span>
          {p.websiteUrl && <span className="truncate">{p.websiteUrl}</span>}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>Edit</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => partnerApi.update(p.id, { status: p.status === 'active' ? 'hidden' : 'active' }), p.status === 'active' ? 'Hidden from the welcome page.' : 'Shown on the welcome page.')}>{p.status === 'active' ? 'Hide' : 'Show'}</Button>
        <FileButton size="sm" disabled={busy} onFile={(f) => run(() => partnerApi.replaceLogo(p.id, f), 'Logo replaced.')}>Change logo</FileButton>
        <Button size="sm" variant="danger" disabled={busy} onClick={() => setRemoving(true)}>Remove</Button>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title={`Edit ${p.name}`} footer={<><Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
        <div className="space-y-4">
          <TextField label="Name" value={form.name} onChange={set('name')} error={errors.name} maxLength={100} required />
          <SelectField label="Listed as" value={form.kind} onChange={set('kind')} options={KINDS} />
          <TextField label="Website (optional)" value={form.websiteUrl} onChange={set('websiteUrl')} error={errors.websiteUrl} placeholder="https://" />
          <TextField label="Order" inputMode="numeric" value={form.sortOrder} onChange={set('sortOrder')} error={errors.sortOrder} hint="Smaller numbers come first. Sponsors always come before partners." />
        </div>
      </Dialog>
      <ConfirmDialog open={removing} onClose={() => setRemoving(false)} danger loading={busy} title={`Remove ${p.name}?`} confirmLabel="Remove" onConfirm={async () => { if (await run(() => partnerApi.remove(p.id), 'Removed.')) setRemoving(false); }}>
        It disappears from the welcome page and its logo file is deleted. To keep it for later, use Hide instead.
      </ConfirmDialog>
    </li>
  );
}

/** Super administrator only: the partners and sponsors shown in a line on the welcome page. */
export default function PartnersPage() {
  useDocumentTitle('Partners and sponsors');
  const toast = useToast();
  const list = useAsync((signal) => partnerApi.manage(signal), []);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const add = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = validate(form, file, true);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await partnerApi.create({ name: form.name.trim(), kind: form.kind, websiteUrl: form.websiteUrl.trim(), sortOrder: form.sortOrder }, file);
      toast.success(`${form.name.trim()} added to the welcome page.`);
      setForm(EMPTY);
      setFile(null);
      list.reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Partners and sponsors" description="Their logos appear in a line on the welcome page, sponsors first." />

      <form onSubmit={add} noValidate className="panel mb-8 space-y-4 p-6" aria-labelledby="add-h">
        <h2 id="add-h" className="text-xl font-semibold">Add one</h2>
        {formError && <Alert tone="error">{formError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" value={form.name} onChange={set('name')} error={errors.name} maxLength={100} required />
          <SelectField label="Listed as" value={form.kind} onChange={set('kind')} options={KINDS} />
          <TextField label="Website (optional)" value={form.websiteUrl} onChange={set('websiteUrl')} error={errors.websiteUrl} placeholder="https://" />
          <TextField label="Order (optional)" inputMode="numeric" value={form.sortOrder} onChange={set('sortOrder')} error={errors.sortOrder} hint="Smaller numbers come first." />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FileButton onFile={setFile}>{file ? 'Choose a different logo' : 'Choose logo'}</FileButton>
          <span className="text-sm text-ink-700">{file ? file.name : 'JPEG, PNG or WebP. A wide logo on a plain background looks best.'}</span>
        </div>
        {errors.logo && <p role="alert" className="text-sm font-medium text-rose-700">{errors.logo}</p>}
        <Button type="submit" loading={busy}>Add to the welcome page</Button>
      </form>

      {list.loading ? <PageLoader label="Loading" /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} />
        : list.data.length === 0 ? <EmptyState title="Nobody listed yet" description="Add a partner or sponsor above and it appears on the welcome page straight away." />
          : <ul className="space-y-3">{list.data.map((p) => <Row key={p.id} partner={p} onChange={list.reload} />)}</ul>}
    </>
  );
}
