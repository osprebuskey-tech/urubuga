import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../utils/constants';
import { initials } from '../utils/format';
import Icon from './Icon';

/** The signed-in person: who they are, a way back to the home page and dashboard, and Log out. tone="dark" is for the teal header. */
export default function UserMenu({ tone = 'light' }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);

  if (!user) return null;
  const dark = tone === 'dark';
  const close = () => setOpen(false);
  const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-900 hover:bg-ink-50';

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-2 ${dark ? 'text-ink-950 hover:bg-ink-900/10' : 'text-ink-900 hover:bg-ink-50'}`}
      >
        <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-600 text-sm font-bold text-white">{initials(user.fullName)}</span>
        <span className="hidden max-w-[10rem] truncate text-sm font-semibold sm:inline">{user.fullName}</span>
        <span className="sr-only">Account menu</span>
        <Icon name="chevron" className="h-4 w-4" />
      </button>

      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-ink-100 bg-white p-2 shadow-lg">
          <div className="border-b border-ink-100 px-3 pb-2 pt-1">
            <p className="truncate font-semibold text-ink-950">{user.fullName}</p>
            <p className="truncate text-sm text-ink-700">{user.email}</p>
            <p className="mt-1 text-xs font-semibold text-ink-600">{user.roles.map((r) => ROLE_LABELS[r] ?? r).join(' · ')}</p>
          </div>
          <div className="pt-2">
            <Link role="menuitem" to="/dashboard" onClick={close} className={item}><Icon name="grid" />Dashboard</Link>
            <Link role="menuitem" to="/dashboard/settings" onClick={close} className={item}><Icon name="cog" />Settings</Link>
            <button role="menuitem" type="button" onClick={async () => { close(); await logout(); navigate('/'); }} className={`${item} text-rose-700`}><Icon name="logout" />Log out</button>
          </div>
        </div>
      )}
    </div>
  );
}
