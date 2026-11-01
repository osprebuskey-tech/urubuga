import { useEffect, useState } from 'react';
import Dialog from './ui/Dialog';
import Button from './ui/Button';
import { Alert } from './ui/feedback';
import { PageLoader } from './ui/Spinner';
import { documentApi } from '../services/verificationApi';

/**
 * A secure preview of a private document. The file is fetched with the person's token into memory, shown in a sandboxed frame
 * (PDF) or an image, and released when the dialog closes. There is no public link to share or leak.
 */
export default function DocumentPreview({ doc, onClose }) {
  const [state, setState] = useState({ url: null, error: '', loading: true });

  useEffect(() => {
    if (!doc) return undefined;
    let url;
    let cancelled = false;
    setState({ url: null, error: '', loading: true });
    documentApi.blob(doc.id)
      .then((blob) => { if (!cancelled) { url = URL.createObjectURL(blob); setState({ url, error: '', loading: false }); } })
      .catch((err) => { if (!cancelled) setState({ url: null, error: err.message || 'This document could not be opened.', loading: false }); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [doc]);

  return (
    <Dialog open={Boolean(doc)} onClose={onClose} title={doc ? `${doc.label}` : ''} footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      {state.loading && <PageLoader label="Opening document" />}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.url && (doc.mime === 'application/pdf'
        ? <iframe title={doc.label} src={state.url} sandbox="" className="h-[60vh] w-full rounded border border-ink-100" />
        : <img src={state.url} alt={doc.label} className="max-h-[60vh] w-full rounded border border-ink-100 object-contain" />)}
      {doc && <p className="mt-3 text-xs text-ink-600">Private file: {doc.originalName}. Only you and the staff reviewing your application can open it.</p>}
    </Dialog>
  );
}
