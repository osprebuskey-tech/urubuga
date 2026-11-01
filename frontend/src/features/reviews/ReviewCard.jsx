import { Stars } from '../../components/ui/Rating';
import { formatDate } from '../../utils/format';

/** A public review: stars, comment, first name, date. */
export default function ReviewCard({ review }) {
  return (
    <article className="border-b border-ink-100 py-5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars value={review.rating} />
        <p className="text-sm text-ink-700"><span className="font-semibold text-ink-900">{review.reviewer.name}</span> · {formatDate(review.createdAt)}</p>
      </div>
      <p className="mt-2 max-w-prose whitespace-pre-line text-ink-800">{review.comment}</p>
    </article>
  );
}
