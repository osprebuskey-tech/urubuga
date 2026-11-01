import { Link } from 'react-router-dom';
import { useUnreadCount } from '../hooks/useUnreadCount';
import Icon from './Icon';

/** tone="dark" is for use on the teal header. */
export default function NotificationBell({ tone = 'light' }) {
  const count = useUnreadCount();
  return (
    <Link to="/dashboard/notifications" className={`relative rounded-full p-2 ${tone === 'dark' ? 'text-ink-950 hover:bg-ink-900/10' : 'text-ink-800 hover:bg-ink-50'}`}>
      <Icon name="bell" className="h-6 w-6" />
      <span className="sr-only">Notifications{count > 0 ? `, ${count} unread` : ''}</span>
      {count > 0 && (
        <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-xs font-bold text-white">{count > 99 ? '99+' : count}</span>
      )}
    </Link>
  );
}
