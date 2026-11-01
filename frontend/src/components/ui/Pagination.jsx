import Button from './Button';

/** meta: { page, totalPages, total } from the API. */
export default function Pagination({ meta, onPage }) {
  if (!meta || meta.totalPages <= 1) return null;
  const { page, totalPages } = meta;
  return (
    <nav className="mt-8 flex items-center justify-between gap-4" aria-label="Pagination">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <p className="text-sm text-ink-700">Page {page} of {totalPages}</p>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</Button>
    </nav>
  );
}
