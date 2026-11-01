import { useAsync } from '../hooks/useAsync';
import { partnerApi } from '../services/partnerApi';

function Logo({ partner: p }) {
  const card = (
    <div className="relative flex h-28 w-44 items-center justify-center rounded-lg border border-ink-100 bg-white p-4 transition-shadow group-hover:shadow-md">
      <img src={p.logoUrl} alt={p.name} loading="lazy" className="max-h-full max-w-full object-contain" />
      {p.kind === 'sponsor' && <span className="absolute right-1.5 top-1.5 rounded-full bg-sun-300 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-ink-900">Sponsor</span>}
    </div>
  );
  return p.websiteUrl
    ? <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer" className="group block" aria-label={`${p.name} (opens their website)`}>{card}</a>
    : <div className="group">{card}</div>;
}

/** The welcome page's line of partners and sponsors, managed by the super administrator. Renders nothing until there is one. */
export default function PartnersStrip() {
  const { data } = useAsync((signal) => partnerApi.list(signal), []);
  if (!data?.length) return null;
  return (
    <section className="container-page py-14" aria-labelledby="partners-h">
      <h2 id="partners-h" className="text-center text-2xl font-bold sm:text-3xl">Our Partners &amp; Sponsors</h2>
      <ul className="mt-8 flex flex-wrap justify-center gap-4">
        {data.map((p) => <li key={p.id}><Logo partner={p} /></li>)}
      </ul>
    </section>
  );
}
