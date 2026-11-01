import { Link } from 'react-router-dom';
import Avatar from './ui/Avatar';
import Rating from './ui/Rating';
import VerifiedBadge from './ui/VerifiedBadge';
import { plural } from '../utils/format';

export default function ProviderCard({ provider }) {
  return (
    <article className="panel group relative flex flex-col gap-3 p-5 transition-colors hover:border-ink-300">
      <div className="flex items-start gap-4">
        <Avatar name={provider.displayName} src={provider.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold leading-snug">
            <Link to={`/providers/${provider.id}`} className="after:absolute after:inset-0 group-hover:underline">{provider.displayName}</Link>
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {provider.verified && <VerifiedBadge />}
            <Rating value={provider.ratingAvg} count={provider.ratingCount} />
          </div>
          <p className="mt-1 text-sm text-ink-700">
            {[provider.location?.district, provider.experienceYears != null && `${plural(provider.experienceYears, 'year')} experience`].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      {provider.bio && <p className="line-clamp-2 text-ink-800">{provider.bio}</p>}
      {provider.categories?.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {provider.categories.map((c) => <li key={c.id} className="rounded-full bg-ink-50 px-2.5 py-0.5 text-xs font-medium text-ink-800">{c.name}</li>)}
        </ul>
      )}
    </article>
  );
}
