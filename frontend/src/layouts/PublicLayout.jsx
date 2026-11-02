import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import Logo from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { buttonClasses } from '../components/ui/Button';
import NotificationBell from '../components/NotificationBell';
import UserMenu from '../components/UserMenu';
import AnnouncementBar from '../components/AnnouncementBar';

const navLink = ({ isActive }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'text-ink-950' : 'text-ink-600 hover:text-ink-950'}`;

function Header() {
  const { user, status } = useAuth();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="relative border-b border-ink-100 bg-white">
      <div className="brand-bar" />
      <div className="container-page flex items-center justify-between gap-4 py-3">
        <Logo to={user ? '/dashboard' : '/'} tone="dark" />
        <button
          type="button"
          className="rounded-md p-2 text-ink-950 hover:bg-ink-50 md:hidden"
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <nav id="main-nav" aria-label="Main" className={`${open ? 'flex' : 'hidden'} absolute inset-x-0 top-full z-30 flex-col gap-1 border-b border-ink-100 bg-white px-4 pb-4 shadow-md md:static md:flex md:flex-1 md:flex-row md:items-center md:justify-end md:gap-6 md:border-0 md:bg-transparent md:p-0 md:shadow-none`}>
          <div className="flex flex-col gap-1 md:flex-row md:gap-2">
            {!user && <NavLink to="/" end className={navLink} onClick={close}>Home</NavLink>}
            <NavLink to="/search" end className={navLink} onClick={close}>Find services</NavLink>
            <NavLink to="/categories" className={navLink} onClick={close}>Categories</NavLink>
            {user && <NavLink to="/dashboard" className={navLink} onClick={close}>Dashboard</NavLink>}
          </div>
          <div className="mt-3 flex flex-col gap-2 md:mt-0 md:flex-row md:items-center">
            {status === 'loading' ? null : user ? (
              // Signed in: stay signed in on the public pages too, until they choose Log out.
              <div className="flex items-center gap-1" onClick={(e) => { if (e.target.closest('a')) close(); }}>
                <NotificationBell />
                <UserMenu />
              </div>
            ) : (
              <>
                <Link to="/login" onClick={close} className="rounded-md px-3 py-2 text-sm font-medium text-ink-800 hover:text-ink-950">Sign in</Link>
                <Link to="/register" onClick={close} className={buttonClasses({ variant: 'primary', size: 'md' })}>Create an account</Link>
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
  const link = 'text-ink-800 hover:text-ink-950 hover:underline';
  return (
    <footer className="mt-0 bg-sage-300 text-ink-800">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <Logo to={user ? '/dashboard' : '/'} tone="dark" />
          <p className="mt-4 max-w-sm text-ink-800">Hire verified local professionals across Rwanda, and grow your own skilled business.</p>
        </div>
        <nav aria-label="Platform">
          <h2 className="font-display text-base font-bold text-ink-950">Platform</h2>
          <ul className="mt-4 space-y-3">
            <li><Link to="/search" className={link}>Find services</Link></li>
            <li><Link to="/categories" className={link}>Categories</Link></li>
          </ul>
        </nav>
        <nav aria-label="Get started">
          <h2 className="font-display text-base font-bold text-ink-950">Get started</h2>
          <ul className="mt-4 space-y-3">
            {!user && <li><Link to="/register" className={link}>Offer your services</Link></li>}
            <li><Link to="/search" className={link}>Hire a professional</Link></li>
            <li>{user ? <Link to="/dashboard" className={link}>Your dashboard</Link> : <Link to="/login" className={link}>Sign in</Link>}</li>
          </ul>
        </nav>
      </div>
      <div className="container-page border-t border-ink-900/15 py-5 text-sm text-ink-700">© {new Date().getFullYear()} Imbehe. Prices are in Rwandan francs (RWF).</div>
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
