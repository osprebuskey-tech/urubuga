import { useCallback, useEffect, useState } from 'react';
import { notificationApi } from '../services/notificationApi';

const CHANGED = 'sb:notifications-changed';
const POLL_MS = 60_000;

/** Call after reading notifications so the bell updates straight away. */
export const notifyChanged = () => window.dispatchEvent(new Event(CHANGED));

/** Unread notification count, refreshed every minute while the tab is visible, and on demand. */
export function useUnreadCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const { data } = await notificationApi.unreadCount();
      setCount(data.unreadCount);
    } catch { /* the bell is a convenience; a failed poll just keeps the last number */ }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    window.addEventListener(CHANGED, refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener(CHANGED, refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [refresh]);

  return count;
}
