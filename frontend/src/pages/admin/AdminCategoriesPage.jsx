import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import { PageLoader } from '../../components/ui/Spinner';
import { Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { ConfirmDialog } from '../../components/ui/Dialog';
import CategoryDialog from '../../features/admin/CategoryDialog';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { invalidateCategories } from '../../hooks/useCategories';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi } from '../../services/adminApi';
import { catalogApi } from '../../services/catalogApi';
import { errorMessage } from '../../utils/errors';

export default function AdminCategoriesPage() {
  useDocumentTitle('Manage categories');
  const toast = useToast();
  const list = useAsync((signal) => catalogApi.categories({ includeDisabled: true, signal }), []);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = edit
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toggleId, setToggleId] = useState(null);

  const changed = (message) => {
    invalidateCategories(); // other pages must see the change
    toast.success(message);
    setEditing(undefined);
    list.reload();
  };

  const toggle = async (c) => {
    setToggleId(c.id);
    try {
      await adminApi.updateCategory(c.id, { status: c.status === 'active' ? 'disabled' : 'active' });
      changed(c.status === 'active' ? `${c.name} is now hidden.` : `${c.name} is now active.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setToggleId(null);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await adminApi.deleteCategory(deleting.id);
      setDeleting(null);
      changed('Category deleted.');
    } catch (err) {
      toast.error(err.code === 'CATEGORY_IN_USE' ? 'This category is in use. Disable it instead of deleting it.' : errorMessage(err));
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Categories" description="The trades customers browse and providers list under." actions={<Button onClick={() => setEditing(null)}>New category</Button>} />
      {list.loading && <PageLoader label="Loading categories" />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data?.length === 0 && <EmptyState title="No categories yet" description="Add the first one to get the marketplace started." action={<Button onClick={() => setEditing(null)}>New category</Button>} />}
      {list.data?.length > 0 && (
        <ul className="space-y-3">
          {list.data.map((c) => (
            <li key={c.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2"><span className="text-lg font-semibold">{c.name}</span><Badge tone={c.status === 'active' ? 'success' : 'neutral'}>{c.status === 'active' ? 'Active' : 'Hidden'}</Badge></p>
                  {c.description && <p className="mt-1 text-ink-700">{c.description}</p>}
                  {c.subcategories.length > 0 && <p className="mt-2 text-sm text-ink-700">{c.subcategories.map((s) => s.name).join(', ')}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(c)}>Edit<span className="sr-only"> {c.name}</span></Button>
                  <Button variant="outline" size="sm" loading={toggleId === c.id} onClick={() => toggle(c)}>{c.status === 'active' ? 'Hide' : 'Show'}<span className="sr-only"> {c.name}</span></Button>
                  <Button variant="danger" size="sm" onClick={() => setDeleting(c)}>Delete<span className="sr-only"> {c.name}</span></Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CategoryDialog open={editing !== undefined} category={editing ?? null} onClose={() => setEditing(undefined)} onSaved={changed} />
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={remove} loading={busy} title="Delete this category?" confirmLabel="Delete" danger>
        <p>“{deleting?.name}” will be deleted. Categories already used by providers or listings can’t be deleted. Hide them instead.</p>
      </ConfirmDialog>
    </>
  );
}
