import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Pagination from '../../components/ui/Pagination';
import { PageLoader } from '../../components/ui/Spinner';
import { Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import Dialog, { ConfirmDialog } from '../../components/ui/Dialog';
import { TextAreaField } from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi } from '../../services/adminApi';
import { ROLES, PROFILE_VERIFICATION_STATUS } from '../../utils/constants';
import { errorMessage } from '../../utils/errors';
import { formatDate, plural } from '../../utils/format';

const TABS = ['pending', 'needs_info', 'verified', 'rejected', 'unverified'];
const TAB_LABELS = { pending: 'Waiting for review', needs_info: 'Waiting for provider' };

// Two decisions need a message the provider will read: rejecting (why) and asking for more information (what).
const DECISIONS = {
  rejected: {
    title: 'Reject verification',
    label: (name) => `Why isn’t ${name} approved?`,
    hint: 'The provider sees this note, so say what they should fix.',
    submit: 'Reject request',
    variant: 'secondary',
    toast: 'Request rejected.',
    error: 'Give a reason of at least 5 characters. The provider will see it.',
  },
  needs_info: {
    title: 'Ask for more information',
    label: (name) => `What do you need to know from ${name}?`,
    hint: 'The provider is notified and sees this question. They can reply and send the request back to you.',
    submit: 'Send question',
    variant: 'primary',
    toast: 'Question sent. The provider has been notified.',
    error: 'Say what you need in at least 5 characters. The provider will see it.',
  },
};

function DecisionDialog({ mode, target, onClose, onDone }) {
  const toast = useToast();
  const cfg = DECISIONS[mode];
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (note.trim().length < 5) { setError(cfg.error); return; }
    setBusy(true);
    try {
      await adminApi.setVerification(target.id, { status: mode, note: note.trim() });
      toast.success(cfg.toast);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form id="decision-form" onSubmit={submit} noValidate>
      <TextAreaField label={cfg.label(target.displayName)} value={note} onChange={(e) => setNote(e.target.value)} error={error} maxLength={500} rows={4} hint={cfg.hint} required />
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" variant={cfg.variant} loading={busy}>{cfg.submit}</Button>
      </div>
    </form>
  );
}

export default function AdminProvidersPage() {
  useDocumentTitle('Provider verification');
  const toast = useToast();
  const { hasRole } = useAuth();
  const [tab, setTab] = useState('pending');
  const [page, setPage] = useState(1);
  const [deciding, setDeciding] = useState(null); // { mode: 'rejected' | 'needs_info', provider }
  const [revoking, setRevoking] = useState(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const list = useAsync((signal) => adminApi.providers({ verificationStatus: tab, page, limit: 10 }, signal), [tab, page]);

  const revoke = async () => {
    setRevokeBusy(true);
    try {
      await adminApi.setVerification(revoking.id, { status: 'unverified' });
      toast.success('Verification removed. Their live services were paused.');
      setRevoking(null);
      list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRevokeBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Provider verification" description="Only verified providers appear in search. Review each profile, then accept it, reject it with a reason, or ask the provider for more information." />
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {TABS.map((t) => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => { setTab(t); setPage(1); }} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${tab === t ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 hover:bg-ink-50'}`}>
            {TAB_LABELS[t] || PROFILE_VERIFICATION_STATUS[t].label}
          </button>
        ))}
      </div>

      {list.loading && <PageLoader label="Loading providers" />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data?.length === 0 && <EmptyState title="Nothing here" description={tab === 'pending' ? 'No providers are waiting for review.' : tab === 'needs_info' ? 'You are not waiting for any provider to answer a question.' : 'No providers have this status.'} />}
      {list.data?.length > 0 && (
        <>
          <ul className="space-y-4">
            {list.data.map((p) => {
              const st = PROFILE_VERIFICATION_STATUS[p.verificationStatus];
              return (
                <li key={p.id} className="panel p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2"><span className="text-lg font-semibold">{p.displayName}</span><Badge tone={st.tone}>{st.label}</Badge></p>
                      <p className="text-sm text-ink-700">{p.user?.fullName} · {p.user?.email}{p.user?.phone ? ` · ${p.user.phone}` : ''}</p>
                      {p.bio ? <p className="mt-2 max-w-prose text-ink-800">{p.bio}</p> : <p className="mt-2 text-ink-600">No bio yet.</p>}
                      <p className="mt-2 text-sm text-ink-700">
                        {[p.categories.map((c) => c.name).join(', ') || 'No categories', p.location?.district || 'No district', p.experienceYears != null && `${plural(p.experienceYears, 'year')} experience`, plural(p.portfolio.length, 'portfolio item'), `Updated ${formatDate(p.updatedAt)}`].filter(Boolean).join(' · ')}
                      </p>
                      {p.skills.length > 0 && <p className="mt-1 text-sm text-ink-700">Skills: {p.skills.join(', ')}</p>}
                      {p.verificationNote && p.verificationStatus === 'rejected' && <p className="mt-1 text-sm text-rose-700">Reason given: {p.verificationNote}</p>}
                      {p.verificationNote && (p.verificationStatus === 'needs_info' || (p.verificationStatus === 'pending' && p.verificationResponse)) && <p className="mt-2 text-sm text-ink-800"><span className="font-semibold">You asked:</span> {p.verificationNote}</p>}
                      {p.verificationResponse && p.verificationStatus === 'pending' && <p className="mt-1 rounded-md bg-ink-50 px-3 py-2 text-sm text-ink-900"><span className="font-semibold">Provider replied:</span> {p.verificationResponse}</p>}
                      {p.verificationStatus === 'needs_info' && <p className="mt-1 text-sm text-ink-700">Waiting for the provider to reply.</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {p.verificationStatus === 'verified' && <Link to={`/providers/${p.id}`} className="px-3 py-1.5 text-sm font-semibold text-teal-700 underline">View public profile</Link>}
                      {['pending', 'needs_info'].includes(p.verificationStatus) && <Link to="/dashboard/admin/verification" className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-700">Open verification review<span className="sr-only"> for {p.displayName}</span></Link>}
                      {p.verificationStatus === 'pending' && <Button size="sm" variant="outline" onClick={() => setDeciding({ mode: 'needs_info', provider: p })}>Ask for more info<span className="sr-only"> from {p.displayName}</span></Button>}
                      {['pending', 'needs_info'].includes(p.verificationStatus) && <Button size="sm" variant="outline" onClick={() => setDeciding({ mode: 'rejected', provider: p })}>Reject<span className="sr-only"> {p.displayName}</span></Button>}
                      {p.verificationStatus === 'verified' && hasRole(ROLES.SUPER_ADMIN) && <Button size="sm" variant="danger" onClick={() => setRevoking(p)}>Remove verification<span className="sr-only"> from {p.displayName}</span></Button>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination meta={list.meta} onPage={setPage} />
        </>
      )}

      <Dialog open={Boolean(deciding)} onClose={() => setDeciding(null)} title={deciding ? DECISIONS[deciding.mode].title : ''}>
        {deciding && <DecisionDialog key={deciding.mode} mode={deciding.mode} target={deciding.provider} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); list.reload(); }} />}
      </Dialog>
      <ConfirmDialog open={Boolean(revoking)} onClose={() => setRevoking(null)} onConfirm={revoke} loading={revokeBusy} title="Remove verification?" confirmLabel="Remove verification" danger>
        <p>{revoking?.displayName} will disappear from public search and all of their live services will be paused.</p>
      </ConfirmDialog>
    </>
  );
}
