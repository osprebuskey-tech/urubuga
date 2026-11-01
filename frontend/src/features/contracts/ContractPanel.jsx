import { useState } from 'react';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import { TextAreaField, TextField } from '../../components/ui/Field';
import { Alert, Badge, ErrorState } from '../../components/ui/feedback';
import { PageLoader } from '../../components/ui/Spinner';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { contractApi } from '../../services/verificationApi';
import { errorMessage } from '../../utils/errors';
import { formatDate, formatRWF } from '../../utils/format';

const lines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);

function List({ items }) {
  return items?.length ? <ul className="list-disc space-y-1 pl-5">{items.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="text-ink-600">None listed.</p>;
}
function Clause({ title, children }) {
  return <div><h3 className="font-semibold text-ink-950">{title}</h3><div className="mt-1 text-sm text-ink-800">{children}</div></div>;
}

/**
 * The service contract of a job. Both sides read it and accept it before work can begin; the provider's acceptance is their
 * explicit acceptance of the job and is what unlocks the contact details. Changes make a new version that both accept again.
 */
export default function ContractPanel({ booking, onChanged }) {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync((signal) => contractApi.forBooking(booking.id, signal), [booking.id, booking.status]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [form, setForm] = useState({ deliverables: '', deadline: '', note: '' });
  const [formError, setFormError] = useState('');

  if (loading) return <PageLoader label="Loading contract" />;
  if (error?.status === 404) return null; // jobs from before contracts existed have none until migrated
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const c = data.contract;
  const mine = c.myRole === 'customer' || c.myRole === 'provider';
  const waiting = booking.status === 'accepted';
  const done = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast.success(ok); reload(); onChanged?.(); return true; } catch (err) { toast.error(errorMessage(err)); return false; } finally { setBusy(false); }
  };
  const openEdit = () => { setForm({ deliverables: c.content.deliverables.join('\n'), deadline: c.content.deadline ? c.content.deadline.slice(0, 10) : '', note: '' }); setFormError(''); setEditing(true); };
  const propose = async () => {
    if (form.note.trim().length < 3) { setFormError('Say briefly what you changed and why.'); return; }
    const ok = await done(() => contractApi.propose(c.id, { deliverables: lines(form.deliverables), deadline: form.deadline || null, note: form.note.trim() }), 'Changes sent. Both of you must accept the new version.');
    if (ok) setEditing(false);
  };

  const statusBadge = c.status === 'accepted' ? <Badge tone="success">Signed by both</Badge> : <Badge tone="warning">Waiting for {c.waitingFor.join(' and ')}</Badge>;

  return (
    <section className="panel mt-6 p-6" aria-labelledby="contract-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="contract-h" className="text-xl font-semibold">Service contract</h2>
          <p className="mt-0.5 text-sm text-ink-600">Version {c.version}{c.legacy ? ' (created for a job that began before contracts)' : ''}</p>
        </div>
        {statusBadge}
      </div>

      {!c.intact && <Alert tone="error" className="mt-4">This contract failed its integrity check. Contact an administrator.</Alert>}

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Clause title="The service"><p className="whitespace-pre-line">{c.content.serviceDescription}</p></Clause>
        <Clause title="Agreed price"><p className="font-display text-2xl font-bold text-teal-700">{formatRWF(c.content.agreedPrice)}</p></Clause>
        <Clause title="Deliverables"><List items={c.content.deliverables} /></Clause>
        <Clause title="Deadline and duration"><p>{c.content.deadline ? `Needed by ${formatDate(c.content.deadline)}` : 'No fixed date'}{c.content.estimatedDuration ? ` · about ${c.content.estimatedDuration}` : ''}</p></Clause>
        <Clause title="The customer will"><List items={c.content.customerResponsibilities} /></Clause>
        <Clause title="The provider will"><List items={c.content.providerResponsibilities} /></Clause>
        <Clause title="Payment"><p>{c.content.paymentTerms}</p></Clause>
        <Clause title="Cancellation"><p>{c.content.cancellationTerms}</p></Clause>
        <div className="md:col-span-2"><Clause title="If something goes wrong"><p>{c.content.disputeResolution}</p></Clause></div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink-100 pt-4">
        {mine && waiting && !c.iHaveAccepted && <Button loading={busy} onClick={() => done(() => contractApi.accept(c.id, c.version), c.myRole === 'provider' ? 'You accepted the job. Contact details are now shared.' : 'You accepted the contract.')}>{c.myRole === 'provider' ? 'Accept this job and contract' : 'Accept this contract'}</Button>}
        {mine && c.iHaveAccepted && c.status !== 'accepted' && <p className="text-sm text-ink-700">You accepted version {c.version}. Waiting for the {c.waitingFor.join(' and ')}.</p>}
        {mine && waiting && <Button variant="outline" onClick={openEdit}>Propose changes</Button>}
        {c.status === 'accepted' && <p className="text-sm text-ink-700">Signed {formatDate(c.acceptedAt)}. Work can begin.</p>}
        <button type="button" onClick={() => setShowVersions((v) => !v)} className="ml-auto text-sm font-semibold text-teal-700 underline" aria-expanded={showVersions}>{showVersions ? 'Hide' : 'Show'} version history</button>
      </div>

      {showVersions && (
        <ol className="mt-4 space-y-2 text-sm">
          {c.versions.map((v) => (
            <li key={v.number} className="rounded-lg bg-ink-50 px-3 py-2">
              <strong>Version {v.number}</strong> · {formatDate(v.createdAt)}{v.note ? ` · ${v.note}` : ''} · accepted by {v.acceptedBy.length ? v.acceptedBy.join(' and ') : 'nobody'}
              <span className="block break-all text-xs text-ink-600">Fingerprint {v.contentHash.slice(0, 16)}…</span>
            </li>
          ))}
        </ol>
      )}

      <Dialog open={editing} onClose={() => setEditing(false)} title="Propose changes" footer={<><Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button><Button loading={busy} onClick={propose}>Send changes</Button></>}>
        <div className="space-y-4">
          <p className="text-sm text-ink-700">The price and the standard clauses stay as they are. Anything you change here starts a new version that both of you must accept.</p>
          <TextAreaField label="Deliverables (one per line)" rows={4} value={form.deliverables} onChange={(e) => setForm((f) => ({ ...f, deliverables: e.target.value }))} />
          <TextField label="Deadline (optional)" type="date" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} />
          <TextField label="What did you change, and why?" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} maxLength={300} error={formError} />
        </div>
      </Dialog>
    </section>
  );
}
