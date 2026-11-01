import { useState } from 'react';
import Button from '../../components/ui/Button';
import { TextAreaField } from '../../components/ui/Field';
import { Alert, Badge } from '../../components/ui/feedback';
import { useToast } from '../../context/ToastContext';
import { providerApi } from '../../services/providerApi';
import { VERIFICATION_STATUS } from '../../utils/constants';
import { errorMessage } from '../../utils/errors';

export default function VerificationPanel({ profile, onUpdated }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState([]);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const status = profile.verificationStatus;
  const meta = VERIFICATION_STATUS[status];

  const request = async () => {
    setBusy(true); setError(''); setProblems([]);
    try {
      const { data } = await providerApi.requestVerification(reply.trim() ? { message: reply.trim() } : {});
      onUpdated(data.profile);
      toast.success(status === 'needs_info' ? 'Sent back for review. We’ll take another look.' : 'Verification requested. We’ll review your profile.');
      setReply('');
    } catch (err) {
      if (err.code === 'PROFILE_INCOMPLETE') setProblems(err.details || []);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel p-6" aria-labelledby="verification">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="verification" className="text-xl font-semibold">Verification</h2>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      {status === 'verified' && <p className="mt-2 text-ink-800">You’re verified. Your profile is public and your live services appear in search.</p>}
      {status === 'pending' && <p className="mt-2 text-ink-800">An administrator is reviewing your profile. You can keep editing it in the meantime.</p>}
      {status === 'needs_info' && (
        <>
          <Alert tone="warning" title="An administrator needs more information" className="mt-3">{profile.verificationNote}</Alert>
          <p className="mt-3 text-ink-800">Update your profile if needed, answer below, then send it back for review.</p>
          <div className="mt-3"><TextAreaField label="Your reply (optional)" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={500} rows={3} hint="The administrator will read this together with your updated profile." /></div>
          {error && <Alert tone="error" className="mt-3">{error}{problems.length > 0 && <ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p.field}>{p.message}</li>)}</ul>}</Alert>}
          <div className="mt-4"><Button onClick={request} loading={busy}>Send back for review</Button></div>
        </>
      )}
      {status === 'rejected' && <Alert tone="error" title="Your request wasn’t approved" className="mt-3">{profile.verificationNote || 'Update your profile and request verification again.'}</Alert>}
      {(status === 'unverified' || status === 'rejected') && (
        <>
          <p className="mt-2 text-ink-800">Verified providers are the only ones shown to customers. Add a bio (20+ characters), choose a category and set your district, then request verification.</p>
          {error && <Alert tone="error" className="mt-3">{error}{problems.length > 0 && <ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p.field}>{p.message}</li>)}</ul>}</Alert>}
          <div className="mt-4"><Button onClick={request} loading={busy}>Request verification</Button></div>
        </>
      )}
    </section>
  );
}
