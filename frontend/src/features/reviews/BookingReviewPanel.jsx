import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import { SelectField, TextAreaField } from '../../components/ui/Field';
import { Stars } from '../../components/ui/Rating';
import { Alert, Badge } from '../../components/ui/feedback';
import { useToast } from '../../context/ToastContext';
import { reviewApi } from '../../services/reviewApi';
import { REPORT_REASONS } from '../../utils/constants';
import { errorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';
import ReviewForm from './ReviewForm';

function ReportDialog({ open, onClose, review, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('fake');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      await reviewApi.report(review.id, note.trim() ? { reason, note: note.trim() } : { reason });
      toast.success('Reported. An administrator will look at it.');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Report this review" footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Not now</Button><Button variant="secondary" onClick={send} loading={busy}>Send report</Button></>}>
      <div className="space-y-4">
        <p className="text-ink-800">Reporting doesn’t remove the review. An administrator decides whether it breaks the rules.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <SelectField label="What’s wrong with it?" value={reason} onChange={(e) => setReason(e.target.value)} options={REPORT_REASONS} />
        <TextAreaField label="Anything the administrator should know? (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={300} />
      </div>
    </Dialog>
  );
}

/** The review on a job page: customers write it, providers can report it, administrators see how often it was reported. */
export default function BookingReviewPanel({ booking, onChanged }) {
  const toast = useToast();
  const [reporting, setReporting] = useState(false);
  const { review, canReview, myRole, status } = booking;
  if (!review && !canReview && !(myRole === 'provider' && status === 'completed')) return null;

  const create = async (body) => {
    await reviewApi.create(booking.id, body);
    toast.success('Thanks for your review.');
    onChanged();
  };

  return (
    <section className="panel mt-6 p-6" aria-labelledby="review-h">
      <h2 id="review-h" className="mb-4 text-xl font-semibold">Review</h2>

      {canReview && (
        <>
          <p className="mb-4 text-ink-700">How was the work? Your review helps other customers choose, and counts towards {booking.provider.displayName}’s rating.</p>
          <ReviewForm onSubmit={create} />
        </>
      )}

      {!review && myRole === 'provider' && <p className="text-ink-700">The customer hasn’t reviewed this job yet.</p>}

      {review && (
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Stars value={review.rating} className="h-5 w-5" />
            <span className="text-sm text-ink-700">{formatDate(review.createdAt)}</span>
            {review.status === 'hidden' && <Badge tone="danger">Removed by a moderator</Badge>}
            {myRole === 'admin' && review.reportCount > 0 && <Badge tone="warning">Reported {review.reportCount}×</Badge>}
            {myRole === 'provider' && review.reported && <Badge tone="warning">You reported this</Badge>}
          </div>
          <p className="mt-2 max-w-prose whitespace-pre-line text-ink-800">{review.comment}</p>
          {review.status === 'hidden' && review.hiddenReason && <Alert tone="warning" className="mt-3">Reason: {review.hiddenReason}</Alert>}
          {myRole === 'provider' && !review.reported && <Button variant="outline" size="sm" className="mt-4" onClick={() => setReporting(true)}>Report this review</Button>}
          {myRole === 'admin' && <p className="mt-3 text-sm"><Link to="/dashboard/admin/reviews" className="font-semibold text-teal-700 underline">Open review moderation</Link></p>}
        </div>
      )}

      {review && myRole === 'provider' && <ReportDialog open={reporting} onClose={() => setReporting(false)} review={review} onDone={() => { setReporting(false); onChanged(); }} />}
    </section>
  );
}
