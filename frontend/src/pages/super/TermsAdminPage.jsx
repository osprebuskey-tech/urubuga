import { useState } from 'react';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/ui/PageHeader';
import { TextAreaField, TextField } from '../../components/ui/Field';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, ErrorState } from '../../components/ui/feedback';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { termsApi } from '../../services/verificationApi';
import { errorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';

/** Super administrator only: publish a new version of the Terms and Conditions. Everyone must accept it before their next request or offer. */
export default function TermsAdminPage() {
  useDocumentTitle('Terms and Conditions');
  const toast = useToast();
  const versions = useAsync((signal) => termsApi.versions(signal), []);
  const current = useAsync((signal) => termsApi.current(signal), []);
  const [form, setForm] = useState({ title: '', body: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  if (versions.loading || current.loading) return <PageLoader label="Loading" />;
  if (versions.error) return <ErrorState error={versions.error} onRetry={versions.reload} />;
  const cur = current.data?.terms;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const publish = async (e) => {
    e.preventDefault();
    const found = {};
    if (form.title.trim().length < 5) found.title = 'Give the terms a title.';
    if (form.body.trim().length < 200) found.body = 'The terms must be at least 200 characters.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try { await termsApi.publish({ title: form.title.trim(), body: form.body.trim() }); toast.success('Published. Everyone will be asked to accept it.'); setForm({ title: '', body: '' }); setPrefilled(false); versions.reload(); current.reload(); } catch (err) { setErrors({ body: errorMessage(err) }); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Terms and Conditions" description="Every customer and provider must accept the current version before requesting or offering services. Publishing a new version asks everyone to accept again." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <form onSubmit={publish} noValidate className="panel space-y-4 p-6">
          <h2 className="text-lg font-semibold">Publish a new version</h2>
          {cur && !prefilled && <Button type="button" variant="outline" size="sm" onClick={() => { setForm({ title: cur.title, body: cur.body }); setPrefilled(true); }}>Start from the current text (version {cur.version})</Button>}
          <TextField label="Title" value={form.title} onChange={set('title')} error={errors.title} maxLength={150} />
          <TextAreaField label="Full text" rows={16} value={form.body} onChange={set('body')} error={errors.body} />
          <Alert tone="warning">Published versions cannot be edited. To fix something, publish a new version.</Alert>
          <Button type="submit" loading={busy}>Publish new version</Button>
        </form>
        <aside className="panel p-5" aria-labelledby="ver-h">
          <h2 id="ver-h" className="mb-3 text-lg font-semibold">Versions</h2>
          <ol className="space-y-3 text-sm">
            {versions.data.map((v) => <li key={v.version}><strong>Version {v.version}</strong>{v.version === cur?.version ? ' (current)' : ''}<br /><span className="text-ink-700">{formatDate(v.publishedAt)} · accepted by {v.acceptedBy}</span></li>)}
          </ol>
        </aside>
      </div>
    </>
  );
}
