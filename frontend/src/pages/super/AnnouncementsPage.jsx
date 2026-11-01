import { useState } from 'react';
import Button from '../../components/ui/Button';
import Dialog, { ConfirmDialog } from '../../components/ui/Dialog';
import PageHeader from '../../components/ui/PageHeader';
import { TextField } from '../../components/ui/Field';
import { Alert, Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { PageLoader } from '../../components/ui/Spinner';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { announcementApi } from '../../services/announcementApi';
import { errorMessage, fieldErrors } from '../../utils/errors';
import { formatDate } from '../../utils/format';

const EMPTY = { message: '', linkUrl: '', expiresAt: '' };
const MAX = 200;

// <input type="datetime-local"> works in local time without a zone; the API wants a real instant.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toIso = (local) => (local ? new Date(local).toISOString() : '');

function validate(form) {
  const e = {};
  const text = form.message.trim();
  if (text.length < 3) e.message = 'Write at least a few words';
  else if (text.length > MAX) e.message = `Keep it short: ${MAX} characters at most`;
  if (form.linkUrl.trim() && !/^https?:\/\/\S+\.\S+/i.test(form.linkUrl.trim())) e.linkUrl = 'Use a link that starts with http:// or https://';
  if (form.expiresAt && !(new Date(form.expiresAt).getTime() > Date.now())) e.expiresAt = 'The end time must be in the future';
  return e;
}

const isExpired = (a) => a.expiresAt && new Date(a.expiresAt).getTime() <= Date.now();

function Fields({ form, set, errors }) {
  return (
    <div className="space-y-4">
      <TextField label="Announcement" value={form.message} onChange={set('message')} error={errors.message} maxLength={MAX} required hint={`${form.message.trim().length}/${MAX} characters. Short lines read best in a moving bar.`} />
      <TextField label="Link (optional)" value={form.linkUrl} onChange={set('linkUrl')} error={errors.linkUrl} placeholder="https://" hint="Makes the announcement clickable." />
      <TextField label="Stop showing after (optional)" type="datetime-local" value={form.expiresAt} onChange={set('expiresAt')} error={errors.expiresAt} hint="Leave empty to keep it until you hide or remove it." />
    </div>
  );
}

function Row({ item: a, onChange }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ message: a.message, linkUrl: a.linkUrl ?? '', expiresAt: toLocalInput(a.expiresAt) });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const run = async (fn, done) => {
    setBusy(true);
    try { await fn(); toast.success(done); onChange(); return true; } catch (err) { toast.error(errorMessage(err)); setErrors(fieldErrors(err)); return false; } finally { setBusy(false); }
  };

  const save = async () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    const ok = await run(() => announcementApi.update(a.id, { message: form.message.trim(), linkUrl: form.linkUrl.trim(), expiresAt: toIso(form.expiresAt) || null }), 'Saved.');
    if (ok) setEditing(false);
  };

  const live = a.status === 'active' && !isExpired(a);
  return (
    <li className="panel flex flex-wrap items-center gap-4 p-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{a.message}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-700">
          <Badge tone={live ? 'success' : 'neutral'}>{isExpired(a) ? 'Expired' : a.status === 'active' ? 'Showing' : 'Hidden'}</Badge>
          <span>Published {formatDate(a.createdAt)}</span>
          {a.expiresAt && <span>· ends {formatDate(a.expiresAt)}</span>}
          {a.linkUrl && <span className="truncate">· {a.linkUrl}</span>}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>Edit</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => announcementApi.update(a.id, { status: a.status === 'active' ? 'hidden' : 'active' }), a.status === 'active' ? 'Hidden from the top bar.' : 'Showing in the top bar.')}>{a.status === 'active' ? 'Hide' : 'Show'}</Button>
        <Button size="sm" variant="danger" disabled={busy} onClick={() => setRemoving(true)}>Remove</Button>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit announcement" footer={<><Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
        <Fields form={form} set={set} errors={errors} />
      </Dialog>
      <ConfirmDialog open={removing} onClose={() => setRemoving(false)} danger loading={busy} title="Remove this announcement?" confirmLabel="Remove" onConfirm={async () => { if (await run(() => announcementApi.remove(a.id), 'Removed.')) setRemoving(false); }}>
        It disappears from the top bar for everyone. To keep it for later, use Hide instead.
      </ConfirmDialog>
    </li>
  );
}

/** Super administrator only: the short announcements that scroll in the bar at the top of every page. */
export default function AnnouncementsPage() {
  useDocumentTitle('Announcements');
  const toast = useToast();
  const list = useAsync((signal) => announcementApi.manage(signal), []);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const publish = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await announcementApi.create({ message: form.message.trim(), linkUrl: form.linkUrl.trim(), expiresAt: toIso(form.expiresAt) });
      toast.success('Published. It now scrolls at the top of every page.');
      setForm(EMPTY);
      list.reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Announcements" description="Short messages that scroll in a bar at the top of every page, for everyone who visits." />

      <form onSubmit={publish} noValidate className="panel mb-8 space-y-4 p-6" aria-labelledby="publish-h">
        <h2 id="publish-h" className="text-xl font-semibold">Publish one</h2>
        {formError && <Alert tone="error">{formError}</Alert>}
        <Fields form={form} set={set} errors={errors} />
        <Button type="submit" loading={busy}>Publish</Button>
      </form>

      {list.loading ? <PageLoader label="Loading" /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} />
        : list.data.length === 0 ? <EmptyState title="Nothing published yet" description="Publish a short message above and it scrolls at the top of every page straight away." />
          : <ul className="space-y-3">{list.data.map((a) => <Row key={a.id} item={a} onChange={list.reload} />)}</ul>}
    </>
  );
}
