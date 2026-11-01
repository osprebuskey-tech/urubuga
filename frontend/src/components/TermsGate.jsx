import { useState } from 'react';
import Button from './ui/Button';
import { Alert } from './ui/feedback';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { termsApi } from '../services/verificationApi';
import { ROLES } from '../utils/constants';
import { errorMessage } from '../utils/errors';
import { formatDate } from '../utils/format';

const STAFF = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.FINANCE];

/**
 * Customers and providers cannot request or offer services until they accept the CURRENT Terms and Conditions.
 * This covers the dashboard with the terms until they do. (The server enforces it too; this is just the friendly part.)
 */
export default function TermsGate() {
  const { user } = useAuth();
  const staffOnly = user.roles.every((r) => STAFF.includes(r));
  const status = useAsync((signal) => (staffOnly ? Promise.resolve({ data: null }) : termsApi.status(signal)), [user.id]);
  const [read, setRead] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);

  const info = status.data;
  if (staffOnly || accepted || !info || info.accepted) return null;

  const accept = async () => {
    setSaving(true);
    setError('');
    try {
      await termsApi.accept(info.terms.version);
      setAccepted(true);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="border-b border-ink-100 p-6">
          <h2 id="terms-title" className="text-xl font-semibold">{info.terms.title}</h2>
          <p className="mt-1 text-sm text-ink-700">
            Version {info.terms.version}, published {formatDate(info.terms.publishedAt)}.{' '}
            {info.previouslyAcceptedVersion ? 'The terms changed since you last accepted. ' : ''}
            Please read and accept them to request or offer services.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto whitespace-pre-line p-6 text-sm leading-relaxed text-ink-900" tabIndex={0} aria-label="Terms and Conditions text">{info.terms.body}</div>
        <div className="space-y-3 border-t border-ink-100 p-6">
          {error && <Alert tone="error">{error}</Alert>}
          <label className="flex items-start gap-2.5 text-sm font-medium">
            <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} className="mt-0.5 h-4 w-4 accent-teal-600" />
            I have read and I accept the Terms and Conditions (version {info.terms.version}).
          </label>
          <Button onClick={accept} disabled={!read} loading={saving}>Accept and continue</Button>
        </div>
      </div>
    </div>
  );
}
