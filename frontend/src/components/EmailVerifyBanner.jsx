import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { authApi } from '../services/authApi';
import { Alert } from './ui/feedback';
import Button from './ui/Button';
import { errorMessage } from '../utils/errors';

export default function EmailVerifyBanner() {
  const { user } = useAuth();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  if (!user || user.emailVerified) return null;

  const resend = async () => {
    setSending(true);
    try {
      await authApi.resendVerification();
      toast.success('Verification email sent. Check your inbox.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Alert
      tone="warning"
      title="Confirm your email address"
      action={<Button size="sm" variant="outline" onClick={resend} loading={sending}>Resend email</Button>}
      className="mb-6"
    >
      We sent a link to {user.email}. Some actions, like publishing a service, need a confirmed email.
    </Alert>
  );
}
