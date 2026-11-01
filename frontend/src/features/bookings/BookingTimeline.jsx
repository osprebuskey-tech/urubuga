import { BOOKING_STATUS } from '../../utils/constants';
import { formatDate } from '../../utils/format';

const WHO = { customer: 'the customer', provider: 'the provider', admin: 'an administrator' };

export default function BookingTimeline({ history }) {
  return (
    <ol className="space-y-5 border-l-2 border-ink-100 pl-5">
      {[...history].reverse().map((h, i) => (
        <li key={`${h.at}-${h.to}-${i}`} className="relative">
          <span aria-hidden="true" className="absolute -left-[1.62rem] top-1.5 h-3 w-3 rounded-full bg-teal-600 ring-4 ring-white" />
          <p className="font-semibold">{BOOKING_STATUS[h.to].label}</p>
          <p className="text-sm text-ink-700">By {WHO[h.role]} · {formatDate(h.at, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          {h.note && <p className="mt-1 max-w-prose whitespace-pre-line rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-900">{h.note}</p>}
        </li>
      ))}
    </ol>
  );
}
