import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import { PageLoader } from '../components/ui/Spinner';
import { ErrorState, EmptyState } from '../components/ui/feedback';
import { ButtonLink } from '../components/ui/Button';
import { useCategories } from '../hooks/useCategories';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function CategoriesPage() {
  useDocumentTitle('Service categories');
  const { categories, loading, error } = useCategories();

  return (
    <div className="container-page py-10">
      <PageHeader title="Service categories" description="Pick a trade to see the verified providers and services in it." />
      {loading && <PageLoader label="Loading categories" />}
      {error && <ErrorState error={error} onRetry={() => window.location.reload()} />}
      {!loading && !error && categories.length === 0 && <EmptyState title="No categories yet" description="Categories appear here once an administrator adds them." />}
      <ul className="grid gap-5 md:grid-cols-2">
        {categories.map((c) => (
          <li key={c.id} className="panel flex flex-col p-6">
            <h2 className="text-xl font-semibold">{c.name}</h2>
            {c.description && <p className="mt-1.5 text-ink-700">{c.description}</p>}
            {c.subcategories.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {c.subcategories.map((s) => <li key={s.slug} className="rounded-full bg-ink-50 px-3 py-1 text-sm text-ink-800">{s.name}</li>)}
              </ul>
            )}
            <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold">
              <Link to={`/search?category=${c.id}`} className="text-teal-700 underline">Browse services</Link>
              <Link to={`/search?type=providers&category=${c.id}`} className="text-teal-700 underline">Browse providers</Link>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-10"><ButtonLink to="/search" variant="outline">Search everything</ButtonLink></div>
    </div>
  );
}
