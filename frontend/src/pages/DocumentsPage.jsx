import { useRef, useState } from 'react';
import Button from '../components/ui/Button';
import DocumentPreview from '../components/DocumentPreview';
import PageHeader from '../components/ui/PageHeader';
import { PageLoader } from '../components/ui/Spinner';
import { Alert, Badge, ErrorState } from '../components/ui/feedback';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { documentApi } from '../services/verificationApi';
import { errorMessage } from '../utils/errors';
import { formatDate } from '../utils/format';

const MAX_MB = 8;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

function Slot({ kind, label, required, doc, onChanged, onPreview }) {
  const toast = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const choose = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    if (!TYPES.includes(file.type)) { setError('Use a PDF, JPG or PNG file.'); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setError(`The file is too big. The limit is ${MAX_MB} MB.`); return; }
    setBusy(true);
    try { await documentApi.upload(kind, file); toast.success(`${label} uploaded.`); onChanged(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <li className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{label}</h2>
          <p className="mt-0.5 text-sm text-ink-600">{required ? 'Required' : 'Optional'} · PDF, JPG or PNG, up to {MAX_MB} MB</p>
        </div>
        {doc ? <Badge tone="success">Uploaded</Badge> : required ? <Badge tone="warning">Needed</Badge> : <Badge>Not uploaded</Badge>}
      </div>
      {doc && <p className="mt-3 text-sm text-ink-800">{doc.originalName} · {formatDate(doc.uploadedAt)}</p>}
      {error && <p role="alert" className="mt-2 text-sm font-medium text-rose-700">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" aria-label={`Choose your ${label}`} onChange={choose} tabIndex={-1} />
        <Button size="sm" loading={busy} onClick={() => input.current?.click()}>{doc ? 'Replace' : 'Upload'}</Button>
        {doc && <Button size="sm" variant="outline" onClick={() => onPreview(doc)}>Preview</Button>}
      </div>
    </li>
  );
}

/** National ID for customers; National ID + CV for individual providers; RDB certificate + the representative's ID for businesses. */
export default function DocumentsPage() {
  useDocumentTitle('My documents');
  const { data, loading, error, reload } = useAsync((signal) => documentApi.list(signal), []);
  const [preview, setPreview] = useState(null);

  if (loading) return <PageLoader label="Loading your documents" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const byKind = Object.fromEntries(data.documents.map((d) => [d.kind, d]));
  const required = new Set(Object.values(data.requirements).flatMap((r) => r.required.map((x) => x.kind)));
  const missing = Object.values(data.requirements).flatMap((r) => r.missing);

  return (
    <>
      <PageHeader title="My documents" description="We check who you are before you request or offer services. Your documents are private: only you and the staff who review your application can open them." />
      {missing.length > 0
        ? <Alert tone="warning" className="mb-6" title="Upload what is still needed">You can’t {data.requirements.hire ? 'request a service' : 'apply for verification'} until the documents marked “Needed” are uploaded.</Alert>
        : <Alert tone="success" className="mb-6">All the documents your account needs are uploaded.</Alert>}
      <ul className="grid gap-4 md:grid-cols-2">
        {data.allowedKinds.map(({ kind, label }) => (
          <Slot key={kind} kind={kind} label={label} required={required.has(kind)} doc={byKind[kind]} onChanged={reload} onPreview={setPreview} />
        ))}
      </ul>
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </>
  );
}
