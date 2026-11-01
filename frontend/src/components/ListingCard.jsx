import { Link } from 'react-router-dom';
import Avatar from './ui/Avatar';
import Rating from './ui/Rating';
import VerifiedBadge from './ui/VerifiedBadge';
import { priceLabel } from '../utils/format';

export default function ListingCard({ listing }) {
  const image = listing.images?.[0]?.url;
  return (
    <article className="panel group relative flex flex-col overflow-hidden transition-colors hover:border-ink-300">
      <div className="aspect-[4/3] bg-ink-50">
        {image ? (
          <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center font-display text-4xl font-bold text-ink-200" aria-hidden="true">
            {listing.category?.name?.[0] ?? '·'}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-sm text-ink-600">{listing.category?.name}</p>
        <h3 className="text-lg font-semibold leading-snug">
          <Link to={`/services/${listing.id}`} className="after:absolute after:inset-0 group-hover:underline">{listing.title}</Link>
        </h3>
        <p className="font-semibold text-rose-700">{priceLabel(listing)}</p>
        <div className="mt-auto flex items-center gap-2.5 border-t border-ink-100 pt-3">
          <Avatar name={listing.provider?.displayName} src={listing.provider?.avatarUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{listing.provider?.displayName}</p>
            <div className="flex flex-wrap items-center gap-x-2"><Rating value={listing.provider?.ratingAvg} count={listing.provider?.ratingCount} /></div>
          </div>
          {listing.provider?.verified && <VerifiedBadge />}
        </div>
        {listing.location?.district && <p className="text-sm text-ink-600">{listing.location.district}</p>}
      </div>
    </article>
  );
}
