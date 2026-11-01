import { useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { announcementApi } from '../services/announcementApi';

function Items({ items, hidden = false }) {
  return (
    <ul className="flex min-w-full shrink-0 items-center justify-around gap-10 pr-10" aria-hidden={hidden || undefined}>
      {items.map((a) => (
        <li key={a.id} className="flex shrink-0 items-center gap-10 whitespace-nowrap">
          {a.linkUrl
            ? <a href={a.linkUrl} target="_blank" rel="noopener noreferrer" tabIndex={hidden ? -1 : undefined} className="font-semibold underline underline-offset-2 hover:no-underline">{a.message}<span className="sr-only"> (opens in a new tab)</span></a>
            : <span className="font-semibold">{a.message}</span>}
          <span aria-hidden="true" className="text-sun-300">◆</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The moving bar at the top of every page: the short announcements the super administrator has published.
 * Renders nothing when there are none (or if they cannot be loaded: a notice bar must never break a page).
 * It pauses on hover and keyboard focus and has a Pause button; with "reduce motion" on it does not move and can be scrolled instead.
 */
export default function AnnouncementBar() {
  const { data } = useAsync((signal) => announcementApi.list(signal), []);
  const [paused, setPaused] = useState(false);
  if (!data?.length) return null;

  const chars = data.reduce((n, a) => n + a.message.length, 0);
  const seconds = Math.max(20, Math.round(chars * 0.22));

  return (
    <section aria-label="Announcements" className="on-rose group flex items-center bg-rose-600 text-sm text-white">
      <button
        type="button"
        aria-pressed={paused}
        onClick={() => setPaused((p) => !p)}
        className="z-10 shrink-0 self-stretch bg-rose-700 px-3 text-xs font-bold uppercase tracking-wide hover:bg-rose-800 motion-reduce:hidden"
      >
        <span aria-hidden="true" className="mr-1">{paused ? '▶' : '❚❚'}</span>
        <span className="sr-only">{paused ? 'Play' : 'Pause'} announcements</span>
        <span aria-hidden="true">News</span>
      </button>
      <div className="min-w-0 flex-1 overflow-hidden py-2 motion-reduce:overflow-x-auto">
        <div
          className="flex w-max animate-marquee motion-reduce:animate-none group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]"
          style={{ '--marquee-duration': `${seconds}s`, animationPlayState: paused ? 'paused' : undefined }}
        >
          <Items items={data} />
          <Items items={data} hidden />
        </div>
      </div>
    </section>
  );
}
