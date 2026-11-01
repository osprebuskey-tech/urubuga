import { useState } from 'react';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import { TextAreaField } from '../../components/ui/Field';
import { Alert } from '../../components/ui/feedback';
import { useToast } from '../../context/ToastContext';
import { bookingApi } from '../../services/bookingApi';
import { BOOKING_ACTIONS } from '../../utils/constants';
import { errorMessage, fieldErrors } from '../../utils/errors';

const MIN_NOTE = 10;

/** The API requires a reason (10+ characters) to cancel or report a problem, and so do administrators resolving one. */
export function needsNote(status, role) {
  return BOOKING_ACTIONS[status].needsNote || role === 'admin';
}
export function validateNote(status, role, note) {
  return needsNote(status, role) && note.trim().length < MIN_NOTE ? `Give a reason of at least ${MIN_NOTE} characters` : '';
}

function copy(status, role, windowDays) {
  if (role === 'admin') {
    return {
      label: status === 'completed' ? 'Resolve: mark as completed' : 'Resolve: cancel the job',
      title: status === 'completed' ? 'Resolve in the provider’s favour?' : 'Resolve by cancelling the job?',
      text: 'Both sides will be told, with your note. Explain what you found.',
      confirm: 'Save decision',
    };
  }
  return {
    in_progress: { label: 'Start work', title: 'Start this job?', text: 'The customer will be told that work has started.', confirm: 'Yes, start work' },
    completed: { label: 'Mark as complete', title: 'Mark this job as complete?', text: `The customer will be told and can report a problem for ${windowDays} days.`, confirm: 'Yes, mark complete' },
    cancelled: { label: 'Cancel job', title: 'Cancel this job?', text: 'You can only cancel before work starts. The other side will see your reason, and this can’t be undone.', confirm: 'Yes, cancel job' },
    disputed: { label: 'Report a problem', title: 'Report a problem?', text: 'An administrator will review the job. Explain clearly what went wrong.', confirm: 'Report problem' },
  }[status];
}

/** Buttons for exactly the moves the server says this person can make, each confirmed in a dialog. */
export default function BookingActions({ booking, onChanged, disputeWindowDays = 7 }) {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (booking.allowedActions.length === 0) return null;
  const role = booking.myRole;
  const text = status ? copy(status, role, disputeWindowDays) : null;
  const close = () => { setStatus(null); setNote(''); setError(''); };

  const confirm = async () => {
    const problem = validateNote(status, role, note);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError('');
    try {
      await bookingApi.setStatus(booking.id, status, note.trim());
      toast.success('Job updated.');
      close();
      onChanged();
    } catch (err) {
      setError(fieldErrors(err).note || errorMessage(err));
      if (err.code === 'BOOKING_CHANGED' || err.code === 'INVALID_STATUS_TRANSITION') onChanged(); // someone else moved it: show the new state
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {booking.allowedActions.map((s) => (
          <Button key={s} variant={BOOKING_ACTIONS[s].variant} onClick={() => setStatus(s)}>{copy(s, role, disputeWindowDays).label}</Button>
        ))}
      </div>
      <Dialog
        open={Boolean(status)}
        onClose={close}
        title={text?.title}
        footer={
          <>
            <Button variant="outline" onClick={close} disabled={busy}>Not now</Button>
            <Button variant={status && BOOKING_ACTIONS[status].variant === 'danger' ? 'secondary' : 'primary'} onClick={confirm} loading={busy}>{text?.confirm}</Button>
          </>
        }
      >
        {status && (
          <div className="space-y-4">
            <p className="text-ink-800">{text.text}</p>
            {error && <Alert tone="error">{error}</Alert>}
            {needsNote(status, role) && (
              <TextAreaField label="Reason" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={500} required hint={`${note.length}/500, at least ${MIN_NOTE} characters`} />
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
