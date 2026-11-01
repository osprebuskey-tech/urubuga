import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/feedback';
import { QUOTATION_STATUS, REQUEST_STATUS } from '../../utils/constants';
import { budgetLabel, formatDate, plural } from '../../utils/format';

/** One row in a list of requests. Shows the viewer's own quotation status (providers) or the quotation count (owners). */
export default function RequestCard({ request: r }) {
  const st = REQUEST_STATUS[r.status];
  return (
    <li className="panel relative p-5 hover:border-ink-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold">
            <Link to={`/dashboard/requests/${r.id}`} className="after:absolute after:inset-0 hover:underline">{r.title}</Link>
          </h3>
          <p className="mt-1 text-sm text-ink-700">
            {[r.category.name, [r.location.sector, r.location.district].filter(Boolean).join(', '), budgetLabel(r), `Posted ${formatDate(r.createdAt)}`].filter(Boolean).join(' · ')}
          </p>
          {!r.isOwner && <p className="mt-1 text-sm text-ink-600">From {r.customer.name}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {r.directed && !r.isOwner && <Badge tone="info">Sent to you</Badge>}
          {r.myQuotation && <Badge tone={QUOTATION_STATUS[r.myQuotation].tone}>You quoted: {QUOTATION_STATUS[r.myQuotation].label.toLowerCase()}</Badge>}
          {r.quotationCount !== undefined && <Badge tone={r.quotationCount > 0 ? 'warning' : 'neutral'}>{plural(r.quotationCount, 'quotation')}</Badge>}
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
      </div>
    </li>
  );
}
