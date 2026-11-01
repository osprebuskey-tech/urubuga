import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/feedback';
import { BOOKING_STATUS } from '../../utils/constants';
import { formatDate, formatRWF } from '../../utils/format';

export default function BookingCard({ booking: b }) {
  const st = BOOKING_STATUS[b.status];
  const other = b.myRole === 'customer' ? `with ${b.provider.displayName}` : b.myRole === 'provider' ? `for ${b.customer.name}` : `${b.customer.name} and ${b.provider.displayName}`;
  return (
    <li className="panel relative p-5 hover:border-ink-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold"><Link to={`/dashboard/bookings/${b.id}`} className="after:absolute after:inset-0 hover:underline">{b.title}</Link></h3>
          <p className="mt-1 text-sm text-ink-700">{[other, b.category.name, b.location.district, `Booked ${formatDate(b.createdAt)}`].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-xl font-bold text-rose-700">{formatRWF(b.agreedPrice)}</p>
          <div className="mt-1 flex flex-wrap justify-end gap-2">
            {b.allowedActions.length > 0 && b.myRole !== 'admin' && <Badge tone="info">Action available</Badge>}
            <Badge tone={st.tone}>{st.label}</Badge>
          </div>
        </div>
      </div>
    </li>
  );
}
