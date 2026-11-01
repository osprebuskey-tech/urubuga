import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Button, { ButtonLink } from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import FileButton from '../../components/ui/FileButton';
import { TextAreaField } from '../../components/ui/Field';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { checkImage } from '../../features/providers/AvatarUploader';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { disputeApi } from '../../services/disputeApi';
import { DISPUTE_STATUS } from '../../utils/constants';
import { errorMessage } from '../../utils/errors';
import { formatDate, formatRWF } from '../../utils/format';

const WHO = { customer: 'Customer', provider: 'Provider', admin: 'Administrator' };

export function validateResolution({ outcome, note }) {
  const e = {};
  if (!outcome) e.outcome = 'Choose what happens to the job';
  if (note.trim().length < 10) e.note = 'Explain the decision in at least 10 characters. Both sides see it.';
  return e;
}

function ResolveDialog({ open, onClose, dispute, onDone }) {
  const toast = useToast();
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const found = validateResolution({ outcome, note });
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setFormError('');
    try {
      await disputeApi.resolve(dispute.id, outcome, note.trim());
      toast.success('Dispute resolved. Both sides have been told.');
      onDone();
    } catch (err) {
      setFormError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Resolve this dispute" footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy}>Save decision</Button></>}>
      <div className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <fieldset aria-describedby={errors.outcome ? 'outcome-error' : undefined}>
          <legend className="mb-1.5 text-sm font-semibold">What happens to the job?</legend>
          {[{ v: 'completed', t: 'Mark it completed', d: 'In the provider’s favour. The job counts as done.' }, { v: 'cancelled', t: 'Cancel it', d: 'In the customer’s favour. The job is closed.' }].map((o) => (
            <label key={o.v} className="mb-2 flex cursor-pointer items-start gap-2.5 rounded-lg border border-ink-100 px-3 py-2.5 hover:bg-ink-50 has-[:checked]:border-ink-500 has-[:checked]:bg-ink-50">
              <input type="radio" name="outcome" value={o.v} checked={outcome === o.v} onChange={() => setOutcome(o.v)} className="mt-1 h-4 w-4 accent-rose-700" />
              <span><span className="font-medium">{o.t}</span><span className="block text-sm text-ink-700">{o.d}</span></span>
            </label>
          ))}
          {errors.outcome && <p id="outcome-error" role="alert" className="text-sm font-medium text-rose-700">{errors.outcome}</p>}
        </fieldset>
        <TextAreaField label="Decision and reasons" value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} rows={4} maxLength={500} required hint="Both the customer and the provider see this." />
        <p className="text-sm text-ink-700">If money should go back to the customer, record the refund on the job’s payment after you decide.</p>
      </div>
    </Dialog>
  );
}

export default function DisputePage() {
  const { id } = useParams();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync((signal) => disputeApi.get(id, signal), [id]);
  const d = data?.dispute;
  useDocumentTitle(d ? `Dispute: ${d.booking.title}` : 'Dispute');
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [taking, setTaking] = useState(false);
  const [problem, setProblem] = useState('');

  if (loading && !d) return <PageLoader label="Loading dispute" />;
  if (error?.status === 404) return <EmptyState title="Dispute not found" description="It may not be one you’re part of." action={<ButtonLink to="/dashboard/bookings">Back to your jobs</ButtonLink>} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const st = DISPUTE_STATUS[d.status];
  const isAdmin = d.myRole === 'admin';

  const post = async (e) => {
    e.preventDefault();
    if (!text.trim()) { setProblem('Write a message first'); return; }
    setPosting(true);
    setProblem('');
    try {
      await disputeApi.addMessage(d.id, text.trim());
      setText('');
      reload();
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  const upload = async (file) => {
    const bad = checkImage(file);
    if (bad) { setProblem(bad); return; }
    setUploading(true);
    setProblem('');
    try {
      await disputeApi.addEvidence(d.id, file);
      toast.success('Photo added.');
      reload();
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const take = async () => {
    setTaking(true);
    try {
      await disputeApi.startReview(d.id);
      toast.success('You’re now reviewing this dispute. Both sides were told.');
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setTaking(false);
    }
  };

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-700">
        <Link to={isAdmin ? '/dashboard/admin/disputes' : '/dashboard/bookings'} className="underline">{isAdmin ? 'Disputes' : 'Jobs'}</Link> / {d.booking.title}
      </nav>
      <PageHeader
        title={d.booking.title}
        description={`${d.customer.name} and ${d.provider.name} · ${formatRWF(d.booking.agreedPrice)}`}
        actions={isAdmin && d.status !== 'resolved' ? (
          <>
            {d.status === 'open' && <Button variant="outline" onClick={take} loading={taking}>Take for review</Button>}
            <Button onClick={() => setResolving(true)}>Resolve</Button>
          </>
        ) : null}
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={st.tone}>{st.label}</Badge>
        <Link to={`/dashboard/bookings/${d.booking.id}`} className="text-sm font-semibold text-teal-700 underline">Open the job{isAdmin ? ' and its payment' : ''}</Link>
      </div>

      {d.resolution && (
        <Alert tone="success" title={d.resolution.outcome === 'completed' ? 'Resolved: the job was marked completed' : 'Resolved: the job was cancelled'} className="mb-6">
          {d.resolution.note} <span className="text-sm">({formatDate(d.resolution.at)})</span>
        </Alert>
      )}

      <section className="panel mb-6 p-6" aria-labelledby="reason-h">
        <h2 id="reason-h" className="text-xl font-semibold">What was reported</h2>
        <p className="mt-1 text-sm text-ink-700">By the {d.openerRole} · {formatDate(d.createdAt)}</p>
        <p className="mt-2 max-w-prose whitespace-pre-line text-ink-800">{d.reason}</p>
      </section>

      <section className="panel mb-6 p-6" aria-labelledby="evidence-h">
        <h2 id="evidence-h" className="mb-3 text-xl font-semibold">Photos</h2>
        {d.evidence.length === 0 ? <p className="text-ink-700">No photos yet.</p> : (
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {d.evidence.map((e) => (
              <li key={e.id}><a href={e.url} target="_blank" rel="noreferrer"><img src={e.url} alt={`Photo added by the ${e.role}`} loading="lazy" className="aspect-[4/3] w-full rounded-lg object-cover" /></a><p className="mt-1 text-xs text-ink-600">{WHO[e.role]} · {formatDate(e.at)}</p></li>
            ))}
          </ul>
        )}
        {d.canPost && d.evidence.length < 10 && <div className="mt-4"><FileButton onFile={upload} disabled={uploading}>{uploading ? 'Uploading…' : 'Add a photo'}</FileButton></div>}
      </section>

      <section className="panel p-6" aria-labelledby="thread-h">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="thread-h" className="text-xl font-semibold">Conversation</h2>
          <Button variant="ghost" size="sm" onClick={reload}>Refresh</Button>
        </div>
        {d.messages.length === 0 ? <p className="text-ink-700">No messages yet.</p> : (
          <ol className="space-y-3">
            {d.messages.map((m, i) => (
              <li key={i} className={`max-w-prose rounded-xl px-4 py-3 ${m.role === d.myRole ? 'ml-auto bg-ink-900 text-white' : m.role === 'admin' ? 'bg-rose-50' : 'bg-ink-50'}`}>
                <p className={`text-xs ${m.role === d.myRole ? 'text-ink-200' : 'text-ink-600'}`}>{m.role === d.myRole ? 'You' : WHO[m.role]} · {formatDate(m.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                <p className="mt-0.5 whitespace-pre-line">{m.text}</p>
              </li>
            ))}
          </ol>
        )}
        {problem && <Alert tone="error" className="mt-4">{problem}</Alert>}
        {d.canPost ? (
          <form onSubmit={post} noValidate className="mt-5 space-y-3">
            <TextAreaField label="Add a message" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} hint="Everyone in this dispute, including the administrator, can read it." />
            <Button type="submit" loading={posting}>Send message</Button>
          </form>
        ) : <p className="mt-4 text-sm text-ink-700">This dispute is resolved, so the conversation is closed.</p>}
      </section>

      <ResolveDialog open={resolving} onClose={() => setResolving(false)} dispute={d} onDone={() => { setResolving(false); reload(); }} />
    </>
  );
}
