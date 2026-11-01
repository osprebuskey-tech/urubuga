import { Link } from 'react-router-dom';
import Avatar from '../../components/ui/Avatar';
import Rating from '../../components/ui/Rating';
import VerifiedBadge from '../../components/ui/VerifiedBadge';
import { Badge } from '../../components/ui/feedback';
import { QUOTATION_STATUS } from '../../utils/constants';
import { formatDate, formatRWF, plural } from '../../utils/format';

export default function QuotationCard({ quotation: q, actions, highlight, showProvider = true }) {
  const st = QUOTATION_STATUS[q.status];
  return (
    <article className={`panel p-5 ${q.status === 'accepted' ? 'border-emerald-500' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        {showProvider ? (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={q.provider.displayName} src={q.provider.avatarUrl} />
            <div className="min-w-0">
              <h3 className="font-semibold"><Link to={`/providers/${q.provider.id}`} className="underline-offset-2 hover:underline">{q.provider.displayName}</Link></h3>
              <div className="flex flex-wrap items-center gap-2">
                {q.provider.verified && <VerifiedBadge />}
                <Rating value={q.provider.ratingAvg} count={q.provider.ratingCount} />
                <span className="text-sm text-ink-600">{plural(q.provider.completedJobs, 'job')} done</span>
              </div>
            </div>
          </div>
        ) : <h3 className="font-semibold">Your quotation</h3>}
        <div className="text-right">
          <p className="font-display text-2xl font-bold text-rose-700">{formatRWF(q.price)}</p>
          <div className="mt-1 flex flex-wrap justify-end gap-2">
            {highlight && <Badge tone="info">{highlight}</Badge>}
            <Badge tone={st.tone}>{st.label}</Badge>
          </div>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-ink-600">Time needed</dt><dd className="font-medium">{q.estimatedDuration}</dd></div>
        <div><dt className="text-ink-600">{q.status === 'expired' ? 'Expired on' : 'Price valid until'}</dt><dd className="font-medium">{formatDate(q.expiresAt)}</dd></div>
      </dl>
      <p className="mt-4 max-w-prose whitespace-pre-line text-ink-800">{q.description}</p>
      {q.deliverables.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold">You get</p>
          <ul className="mt-1 list-disc pl-5 text-ink-800">{q.deliverables.map((d) => <li key={d}>{d}</li>)}</ul>
        </div>
      )}
      {q.terms && <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Terms</summary><p className="mt-1 whitespace-pre-line text-ink-800">{q.terms}</p></details>}
      {actions && <div className="mt-5 flex flex-wrap gap-3 border-t border-ink-100 pt-4">{actions}</div>}
    </article>
  );
}
