import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import Logo from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { buttonClasses } from '../components/ui/Button';
import NotificationBell from '../components/NotificationBell';
import UserMenu from '../components/UserMenu';
import AnnouncementBar from '../components/AnnouncementBar';

const navLink = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-ink-900/15 text-ink-950' : 'text-ink-800 hover:bg-ink-900/10 hover:text-ink-950'}`;

function Header() {
  const { user, status } = useAuth();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="on-tint relative bg-teal-400">
      <div className="brand-bar" />
      <div className="container-page flex items-center justify-between gap-4 py-3">
        <Logo to={user ? '/dashboard' : '/'} />
        <button
          type="button"
          className="rounded-md p-2 text-ink-950 hover:bg-ink-900/10 md:hidden"
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <nav id="main-nav" aria-label="Main" className={`${open ? 'flex' : 'hidden'} absolute inset-x-0 top-[3.75rem] z-30 flex-col gap-1 bg-teal-400 px-4 pb-4 md:static md:flex md:flex-1 md:flex-row md:items-center md:justify-between md:bg-transparent md:p-0`}>
          <div className="flex flex-col gap-1 md:ml-6 md:flex-row">
            {!user && <NavLink to="/" end className={navLink} onClick={close}>Home</NavLink>}
            <NavLink to="/search" end className={navLink} onClick={close}>Find services</NavLink>
            <NavLink to="/categories" className={navLink} onClick={close}>Categories</NavLink>
            {user && <NavLink to="/dashboard" className={navLink} onClick={close}>Dashboard</NavLink>}
          </div>
          <div className="mt-3 flex flex-col gap-2 md:mt-0 md:flex-row md:items-center">
            {status === 'loading' ? null : user ? (
              // Signed in: stay signed in on the public pages too, until they choose Log out.
              <div className="flex items-center gap-1" onClick={(e) => { if (e.target.closest('a')) close(); }}>
                <NotificationBell tone="dark" />
                <UserMenu tone="dark" />
              </div>
            ) : (
              <>
                <Link to="/login" onClick={close} className="rounded-md px-3 py-2 text-sm font-medium text-ink-950 hover:bg-ink-900/10">Log in</Link>
                <Link to="/register" onClick={close} className={buttonClasses({ variant: 'accent', size: 'sm' })}>Sign up</Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const { user } = useAuth();
  return (
    <footer className="on-tint mt-16 bg-sage-300 text-ink-800">
      <div className="brand-bar" />
      <div className="container-page grid gap-8 py-10 sm:grid-cols-2">
        <div>
          <Logo to={user ? '/dashboard' : '/'} />
          <p className="mt-3 max-w-sm text-sm">Hire verified local professionals across Rwanda, and grow your own skilled business.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-2 text-sm sm:justify-end">
          <Link to="/search" className="hover:text-ink-950 hover:underline">Find services</Link>
          <Link to="/categories" className="hover:text-ink-950 hover:underline">Categories</Link>
          {!user && <Link to="/register" className="hover:text-ink-950 hover:underline">Offer your services</Link>}
          {user ? <Link to="/dashboard" className="hover:text-ink-950 hover:underline">Your dashboard</Link> : <Link to="/login" className="hover:text-ink-950 hover:underline">Log in</Link>}
        </nav>
      </div>
      <p className="container-page border-t border-ink-900/15 py-4 text-xs text-ink-700">© {new Date().getFullYear()} Imbehe. Prices are in Rwandan francs (RWF).</p>
    </footer>
  );
}

export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:font-semibold">Skip to content</a>
      <AnnouncementBar />
      <Header />
      <main id="content" className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  );
}
