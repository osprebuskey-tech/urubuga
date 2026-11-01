import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Pagination from '../components/ui/Pagination';
import { PageLoader } from '../components/ui/Spinner';
import { EmptyState, ErrorState } from '../components/ui/feedback';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { notifyChanged } from '../hooks/useUnreadCount';
import { notificationApi } from '../services/notificationApi';
import { errorMessage } from '../utils/errors';
import { formatDate } from '../utils/format';

export default function NotificationsPage() {
  useDocumentTitle('Notifications');
  const navigate = useNavigate();
  const toast = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const list = useAsync((signal) => notificationApi.list({ unread: unreadOnly ? 'true' : undefined, page, limit: 20 }, signal), [unreadOnly, page]);
  const unread = list.meta?.unreadCount ?? 0;

  const open = async (n) => {
    if (!n.readAt) {
      try { await notificationApi.markRead(n.id); notifyChanged(); } catch { /* opening the link still matters more than the read mark */ }
    }
    if (n.link) navigate(n.link);
    else list.reload();
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await notificationApi.markAllRead();
      notifyChanged();
      list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Notifications" description={unread ? `${unread} unread` : 'You’re all caught up.'} actions={unread > 0 ? <Button variant="outline" onClick={markAll} loading={busy}>Mark all as read</Button> : null} />
      <div className="mb-5 flex gap-2" role="group" aria-label="Filter notifications">
        {[{ v: false, l: 'All' }, { v: true, l: 'Unread' }].map((f) => (
          <button key={f.l} type="button" aria-pressed={unreadOnly === f.v} onClick={() => { setUnreadOnly(f.v); setPage(1); }} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${unreadOnly === f.v ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 hover:bg-ink-50'}`}>{f.l}</button>
        ))}
      </div>
      {list.loading && <PageLoader label="Loading notifications" />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data?.length === 0 && <EmptyState title={unreadOnly ? 'No unread notifications' : 'No notifications yet'} description="New requests, quotations and decisions will show up here." />}
      {list.data?.length > 0 && (
        <>
          <ul className="panel divide-y divide-ink-100 overflow-hidden">
            {list.data.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => open(n)} className={`flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-ink-50 ${n.readAt ? '' : 'bg-teal-50/50'}`}>
                  <span aria-hidden="true" className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-teal-700'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block ${n.readAt ? 'font-medium' : 'font-bold'}`}>{n.title}{!n.readAt && <span className="sr-only"> (unread)</span>}</span>
                    {n.body && <span className="block text-sm text-ink-700">{n.body}</span>}
                    <span className="mt-1 block text-xs text-ink-600">{formatDate(n.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Pagination meta={list.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}
