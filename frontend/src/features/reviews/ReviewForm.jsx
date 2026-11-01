import { useState } from 'react';
import Button from '../../components/ui/Button';
import StarInput from '../../components/ui/StarInput';
import { TextAreaField } from '../../components/ui/Field';
import { Alert } from '../../components/ui/feedback';
import { errorMessage, fieldErrors } from '../../utils/errors';

export function validateReview({ rating, comment }) {
  const e = {};
  if (!(rating >= 1 && rating <= 5)) e.rating = 'Choose a rating from 1 to 5 stars';
  if (comment.trim().length < 10) e.comment = 'Tell others about the work in at least 10 characters';
  return e;
}

/** onSubmit({ rating, comment }) may throw an ApiError. Reviews can’t be edited afterwards, so the form says so. */
export default function ReviewForm({ onSubmit }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = validateReview({ rating, comment });
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      await onSubmit({ rating, comment: comment.trim() });
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      setFormError(Object.keys(fe).length ? 'Some details need fixing.' : errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {formError && <Alert tone="error">{formError}</Alert>}
      <StarInput value={rating} onChange={setRating} error={errors.rating} />
      <TextAreaField label="Your review" value={comment} onChange={(e) => setComment(e.target.value)} error={errors.comment} rows={4} maxLength={1000} required hint={`${comment.length}/1000. Be honest and specific. Reviews are public and can’t be edited later.`} />
      <Button type="submit" loading={saving}>Post review</Button>
    </form>
  );
}
