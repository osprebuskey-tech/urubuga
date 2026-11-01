import { useState } from 'react';
import Button, { ButtonLink } from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import { TextAreaField } from '../../components/ui/Field';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../utils/errors';
import { useAuth } from '../../context/AuthContext';
import VerifiedBadge from '../../components/ui/VerifiedBadge';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { PageLoader } from '../../components/ui/Spinner';
import { Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import { useAsync } from '../../hooks/useAsync';
import { useDebounce } from '../../hooks/useDebounce';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi } from '../../services/adminApi';
import { ROLE_LABELS, ROLES, STAFF_ROLES } from '../../utils/constants';
import { formatDate } from '../../utils/format';

export function validateSuspension(reason) {
  return reason.trim().length >= 5 ? '' : 'Give a reason of at least 5 characters. It is kept in the audit log.';
}

function VerificationDialog({ target, onClose, onDone }) {
  const toast = useToast();
  const verifying = target.action === 'verify';
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!verifying && note.trim().length < 5) { setError('Give a reason of at least 5 characters. It is kept in the audit log.'); return; }
    setBusy(true);
    try {
      await adminApi.setUserVerification(target.user.id, { verified: verifying, ...(note.trim() ? { note: note.trim() } : {}) });
      toast.success(verifying ? `${target.user.fullName} is verified.` : `Verification removed from ${target.user.fullName}.`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-ink-800">
        {verifying
          ? `${target.user.fullName} gets a Verified badge and is told by notification. Verify only after you have checked who they are (for example their National ID).`
          : `${target.user.fullName} loses the Verified badge and is told by notification, with your reason.`}
      </p>
      <TextAreaField label={verifying ? 'Note (optional)' : 'Reason'} value={note} onChange={(e) => setNote(e.target.value)} error={error} rows={3} maxLength={500} required={!verifying} hint={verifying ? 'For example how you checked. Only staff see it.' : undefined} />
      <div className="flex justify-end gap-3"><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button variant={verifying ? 'primary' : 'secondary'} onClick={submit} loading={busy}>{verifying ? 'Verify account' : 'Remove verification'}</Button></div>
    </div>
  );
}

function StatusDialog({ target, onClose, onDone }) {
  const toast = useToast();
  const suspending = target.action === 'suspended';
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (suspending) {
      const problem = validateSuspension(reason);
      if (problem) { setError(problem); return; }
    }
    setBusy(true);
    try {
      await adminApi.setUserStatus(target.user.id, suspending ? { status: 'suspended', reason: reason.trim() } : { status: 'active' });
      toast.success(suspending ? `${target.user.fullName} is suspended.` : `${target.user.fullName} can log in again.`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {suspending ? (
        <>
          <p className="text-ink-800">{target.user.fullName} is signed out straight away and can’t log in. If they are a provider, they also disappear from search and their live services are paused. Their jobs and requests are left as they are for you to deal with.</p>
          <TextAreaField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} error={error} rows={3} maxLength={500} required />
        </>
      ) : (
        <>
          <p className="text-ink-800">{target.user.fullName} will be able to log in again. A provider has to be verified again before appearing in search.</p>
          {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
        </>
      )}
      <div className="flex justify-end gap-3"><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button variant={suspending ? 'secondary' : 'primary'} onClick={submit} loading={busy}>{suspending ? 'Suspend account' : 'Reinstate account'}</Button></div>
    </div>
  );
}

export default function AdminUsersPage() {
  useDocumentTitle('Users');
  const { user: me, hasRole } = useAuth();
  const toast = useToast();
  const isSuper = hasRole(ROLES.SUPER_ADMIN);
  const [resending, setResending] = useState(null);
  const [target, setTarget] = useState(null);
  const [verifyTarget, setVerifyTarget] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [verified, setVerified] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search.trim());
  const term = debounced.length >= 1 ? debounced : '';

  const resend = async (u) => {
    setResending(u.id);
    try {
      const res = await adminApi.resendInvite(u.id);
      if (res.data.inviteSent) toast.success(`A new invitation was sent to ${u.email}.`);
      else toast.error('The invitation could not be sent. Check the email settings.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setResending(null);
    }
  };

  const confirmEmail = async (u) => {
    setConfirming(u.id);
    try {
      await adminApi.confirmUserEmail(u.id);
      toast.success(`${u.email} is confirmed.`);
      list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setConfirming(null);
    }
  };

  const list = useAsync((signal) => adminApi.users({ page, limit: 20, role, status, search: term, verified }, signal), [page, role, status, term, verified]);

  return (
    <>
      <PageHeader title="Users" description="Everyone registered on the platform. Suspend an account that breaks the rules; it can be reinstated later. The super administrator can also verify an account once they have checked who the person is." actions={isSuper && <ButtonLink to="/dashboard/super/users/new">Add a user</ButtonLink>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TextField label="Search name or email" type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <SelectField label="Role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} placeholder="All roles" options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))} />
        <SelectField label="Account status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="Any status" options={[{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]} />
        <SelectField label="Verification" value={verified} onChange={(e) => { setVerified(e.target.value); setPage(1); }} placeholder="Verified or not" options={[{ value: 'yes', label: 'Verified' }, { value: 'no', label: 'Not verified' }]} />
      </div>

      {list.loading && <PageLoader label="Loading users" />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data?.length === 0 && <EmptyState title="No users match" description="Try a different search or clear the filters." />}
      {list.data?.length > 0 && (
        <>
          <p className="mb-2 text-sm text-ink-700">{list.meta.total} user{list.meta.total === 1 ? '' : 's'}</p>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <caption className="sr-only">Registered users</caption>
              <thead className="border-b border-ink-100 bg-ink-50 text-ink-800">
                <tr><th scope="col" className="px-4 py-3 font-semibold">Name</th><th scope="col" className="px-4 py-3 font-semibold">Roles</th><th scope="col" className="px-4 py-3 font-semibold">Status</th><th scope="col" className="px-4 py-3 font-semibold">Joined</th><th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {list.data.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3"><p className="flex flex-wrap items-center gap-2 font-medium">{u.fullName}{u.accountVerified && <VerifiedBadge />}</p><p className="break-all text-ink-700">{u.email}{!u.emailVerified && <span className="ml-2 text-amber-800">(unconfirmed)</span>}</p></td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r} tone={STAFF_ROLES.includes(r) ? 'info' : 'neutral'}>{ROLE_LABELS[r] ?? r}</Badge>)}</div></td>
                    <td className="px-4 py-3"><Badge tone={u.status === 'active' ? 'success' : 'danger'}>{u.status === 'active' ? 'Active' : 'Suspended'}</Badge>{u.invitePending && <span className="ml-1"><Badge tone="warning">Invitation not accepted</Badge></span>}{u.suspensionReason && <p className="mt-1 max-w-[14rem] text-xs text-ink-700">{u.suspensionReason}</p>}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(u.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {isSuper && !u.emailVerified && <Button variant="outline" size="sm" className="mr-2" loading={confirming === u.id} onClick={() => confirmEmail(u)}>Confirm email<span className="sr-only"> for {u.fullName}</span></Button>}
                      {isSuper && u.id !== me.id && u.status === 'active' && (u.accountVerified
                        ? <Button variant="outline" size="sm" className="mr-2" onClick={() => setVerifyTarget({ user: u, action: 'unverify' })}>Remove verification<span className="sr-only"> from {u.fullName}</span></Button>
                        : <Button size="sm" className="mr-2" onClick={() => setVerifyTarget({ user: u, action: 'verify' })}>Verify<span className="sr-only"> {u.fullName}</span></Button>)}
                      {isSuper && u.invitePending && u.status === 'active' && <Button variant="outline" size="sm" className="mr-2" loading={resending === u.id} onClick={() => resend(u)}>Resend invitation<span className="sr-only"> to {u.fullName}</span></Button>}
                      {u.id !== me.id && (isSuper || !u.roles.some((r) => STAFF_ROLES.includes(r))) && (u.status === 'active'
                        ? <Button variant="danger" size="sm" onClick={() => setTarget({ user: u, action: 'suspended' })}>Suspend<span className="sr-only"> {u.fullName}</span></Button>
                        : <Button variant="outline" size="sm" onClick={() => setTarget({ user: u, action: 'active' })}>Reinstate<span className="sr-only"> {u.fullName}</span></Button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={list.meta} onPage={setPage} />
        </>
      )}

      <Dialog open={Boolean(verifyTarget)} onClose={() => setVerifyTarget(null)} title={verifyTarget?.action === 'verify' ? 'Verify this account?' : 'Remove this verification?'}>
        {verifyTarget && <VerificationDialog target={verifyTarget} onClose={() => setVerifyTarget(null)} onDone={() => { setVerifyTarget(null); list.reload(); }} />}
      </Dialog>

      <Dialog open={Boolean(target)} onClose={() => setTarget(null)} title={target?.action === 'suspended' ? 'Suspend this account?' : 'Reinstate this account?'}>
        {target && <StatusDialog target={target} onClose={() => setTarget(null)} onDone={() => { setTarget(null); list.reload(); }} />}
      </Dialog>
    </>
  );
}
