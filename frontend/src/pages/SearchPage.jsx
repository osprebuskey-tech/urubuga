import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SearchBar from '../components/SearchBar';
import ListingCard from '../components/ListingCard';
import ProviderCard from '../components/ProviderCard';
import Pagination from '../components/ui/Pagination';
import { PageLoader } from '../components/ui/Spinner';
import { EmptyState, ErrorState } from '../components/ui/feedback';
import FilterPanel from '../features/search/FilterPanel';
import { useAsync } from '../hooks/useAsync';
import { useCategories } from '../hooks/useCategories';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { catalogApi } from '../services/catalogApi';
import { PROVIDER_SORTS, SERVICE_SORTS } from '../utils/constants';
import { plural } from '../utils/format';

const KEYS = ['q', 'category', 'district', 'minRating', 'sort', 'pricingType', 'minPrice', 'maxPrice'];
const PAGE_SIZE = 12;

// Anything that would fail the API's validation is dropped here, so a hand-edited URL never shows an error page.
const clean = {
  q: (v) => (v.trim().length >= 2 ? v.trim() : ''),
  category: (v) => (/^[a-fA-F0-9]{24}$/.test(v) ? v : ''),
  minPrice: (v) => (/^\d+$/.test(v) ? v : ''),
  maxPrice: (v) => (/^\d+$/.test(v) ? v : ''),
  minRating: (v) => (/^\d(\.\d)?$/.test(v) && Number(v) <= 5 ? v : ''),
};

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const { categories } = useCategories();

  const type = params.get('type') === 'providers' ? 'providers' : 'services';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const rawQ = params.get('q') || '';
  const filters = useMemo(
    () => Object.fromEntries(KEYS.map((k) => [k, (clean[k] ? clean[k](params.get(k) || '') : params.get(k) || '')])),
    [params],
  );
  const filterKey = JSON.stringify(filters);

  useDocumentTitle(filters.q ? `“${filters.q}”: search` : 'Find services and providers');

  const update = (changes, { resetPage = true } = {}) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === '' || v === undefined || v === null) next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete('page');
    setParams(next);
  };

  const query = useMemo(() => {
    const base = { q: filters.q, category: filters.category, district: filters.district, minRating: filters.minRating, sort: filters.sort || (filters.q ? '' : 'top'), page, limit: PAGE_SIZE };
    return type === 'services'
      ? { ...base, pricingType: filters.pricingType, minPrice: filters.minPrice, maxPrice: filters.maxPrice }
      : base;
  }, [filters, page, type]);

  const results = useAsync(
    (signal) => (type === 'services' ? catalogApi.listServices(query, signal) : catalogApi.listProviders(query, signal)),
    [type, JSON.stringify(query)],
  );
  const matches = useAsync((signal) => (filters.q ? catalogApi.search(filters.q, signal) : Promise.resolve({ data: null })), [filters.q]);

  const sorts = type === 'services' ? SERVICE_SORTS : PROVIDER_SORTS;
  const sort = sorts.some((s) => s.value === filters.sort) ? filters.sort : filters.q ? 'relevance' : 'top';
  const tabParams = new URLSearchParams(params);
  tabParams.delete('page');
  tabParams.delete('sort');
  const tabHref = (t) => { const p = new URLSearchParams(tabParams); if (t === 'providers') p.set('type', 'providers'); else p.delete('type'); return `/search?${p}`; };

  const clearFilters = () => update({ category: '', district: '', minRating: '', pricingType: '', minPrice: '', maxPrice: '' });
  const total = results.meta?.total ?? 0;

  return (
    <>
      <section className="on-tint bg-teal-400 py-8">
        <div className="container-page">
          <h1 className="mb-4 text-2xl font-bold text-ink-950 sm:text-3xl">{type === 'services' ? 'Find a service' : 'Find a provider'}</h1>
          <SearchBar key={`${rawQ}|${filters.district}|${type}`} initialQ={filters.q} initialDistrict={filters.district} type={type} />
        </div>
      </section>

      <div className="container-page grid gap-8 py-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside aria-label="Filters">
          <details className="panel p-4 lg:hidden">
            <summary className="cursor-pointer font-semibold">Filters</summary>
            <div className="mt-4"><FilterPanel key={filterKey} type={type} filters={filters} categories={categories} onApply={(f) => update(f)} onClear={clearFilters} /></div>
          </details>
          <div className="hidden lg:block"><FilterPanel key={filterKey} type={type} filters={filters} categories={categories} onApply={(f) => update(f)} onClear={clearFilters} /></div>
        </aside>

        <section aria-live="polite">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Result type" className="flex gap-1 rounded-lg bg-ink-50 p-1">
              {['services', 'providers'].map((t) => (
                <Link key={t} to={tabHref(t)} aria-current={type === t ? 'page' : undefined} className={`rounded-md px-4 py-1.5 text-sm font-semibold capitalize ${type === t ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-700 hover:text-ink-950'}`}>{t}</Link>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <label htmlFor="sort" className="text-sm font-medium">Sort by</label>
              <select id="sort" value={sort} onChange={(e) => update({ sort: e.target.value })} className="input !w-auto !py-1.5">
                {sorts.map((s) => <option key={s.value} value={s.value} disabled={s.value === 'relevance' && !filters.q}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {rawQ.trim().length === 1 && <p className="mb-3 text-sm text-ink-700">Searches need at least 2 characters, so showing everything instead.</p>}

          {matches.data?.categories?.length > 0 && (
            <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-700">Matching categories:</span>
              {matches.data.categories.map((c) => (
                <button key={c.id} type="button" onClick={() => update({ category: c.id })} className="rounded-full border border-ink-200 px-3 py-1 font-medium hover:bg-ink-50">{c.name}</button>
              ))}
            </p>
          )}

          {results.loading && <PageLoader label="Searching" />}
          {results.error && <ErrorState error={results.error} onRetry={results.reload} title="Search didn’t work" />}
          {!results.loading && !results.error && (
            <>
              <p className="mb-4 text-sm text-ink-700">{plural(total, type === 'services' ? 'service' : 'provider')} found{filters.q ? ` for “${filters.q}”` : ''}</p>
              {results.data?.length === 0 ? (
                <EmptyState title="Nothing matches yet" description="Try fewer filters, a different word, or a nearby district. Searches match whole words, so “laptop” finds laptop repair but “lapt” doesn’t." />
              ) : type === 'services' ? (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{results.data.map((l) => <ListingCard key={l.id} listing={l} />)}</div>
              ) : (
                <div className="grid gap-5 xl:grid-cols-2">{results.data.map((p) => <ProviderCard key={p.id} provider={p} />)}</div>
              )}
              <Pagination meta={results.meta} onPage={(p) => { update({ page: String(p) }, { resetPage: false }); window.scrollTo({ top: 0 }); }} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
