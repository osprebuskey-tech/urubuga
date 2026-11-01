import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import EmailVerifyBanner from '../components/EmailVerifyBanner';
import NotificationBell from '../components/NotificationBell';
import UserMenu from '../components/UserMenu';
import { useAuth } from '../context/AuthContext';
import { ButtonLink } from '../components/ui/Button';
import TermsGate from '../components/TermsGate';
import AnnouncementBar from '../components/AnnouncementBar';
import { ROLES } from '../utils/constants';
import { initials } from '../utils/format';

// Every link names an icon from components/Icon.jsx. A section with `roles` only shows for people who have one of them;
// the API still decides what each person may actually do.
const SECTIONS = [
  { title: 'Account', roles: null, links: [
    { to: '/dashboard', label: 'Overview', icon: 'grid', end: true },
    { to: '/dashboard/bookings', label: 'Jobs', icon: 'briefcase' },
    { to: '/dashboard/disputes', label: 'My disputes', icon: 'flag', end: true },
    { to: '/dashboard/notifications', label: 'Notifications', icon: 'bell' },
    { to: '/dashboard/settings', label: 'Settings', icon: 'cog' },
  ] },
  { title: 'Your account', roles: [ROLES.CUSTOMER, ROLES.BUSINESS, ROLES.PROVIDER], links: [
    { to: '/dashboard/documents', label: 'My documents', icon: 'document' },
    { to: '/dashboard/ratings', label: 'Rating history', icon: 'star' },
  ] },
  { title: 'Hiring', roles: [ROLES.CUSTOMER, ROLES.BUSINESS], links: [
    { to: '/dashboard/requests', label: 'My requests', icon: 'document', end: true },
    { to: '/dashboard/requests/new', label: 'New request', icon: 'plus' },
  ] },
  { title: 'Your services', roles: [ROLES.PROVIDER], links: [
    { to: '/dashboard/provider/requests', label: 'Requests for you', icon: 'document' },
    { to: '/dashboard/provider/profile', label: 'Provider profile', icon: 'user' },
    { to: '/dashboard/provider/verification', label: 'Get verified', icon: 'shield' },
    { to: '/dashboard/provider/services', label: 'My services', icon: 'pencil' },
    { to: '/dashboard/provider/reviews', label: 'My reviews', icon: 'star' },
  ] },
  { title: 'Your business', roles: [ROLES.BUSINESS], links: [{ to: '/dashboard/business/company', label: 'Company profile', icon: 'building' }] },
  { title: 'Administration', roles: [ROLES.ADMIN], links: [
    { to: '/dashboard/admin/verification', label: 'Verification review', icon: 'shield' },
    { to: '/dashboard/admin/verification-payments', label: 'Verification payments', icon: 'card' },
    { to: '/dashboard/admin/ratings', label: 'Ratings report', icon: 'star' },
    { to: '/dashboard/admin/contracts', label: 'Contracts', icon: 'document' },
    { to: '/dashboard/admin/providers', label: 'Providers list', icon: 'users' },
    { to: '/dashboard/admin/disputes', label: 'Disputes', icon: 'flag' },
    { to: '/dashboard/admin/payments', label: 'Payments', icon: 'card', end: true },
    { to: '/dashboard/admin/payments/follow-up', label: 'Payment follow-up', icon: 'clock' },
    { to: '/dashboard/admin/reports', label: 'Reports', icon: 'chart' },
    { to: '/dashboard/admin/reviews', label: 'Review moderation', icon: 'star' },
    { to: '/dashboard/admin/categories', label: 'Categories', icon: 'tag' },
    { to: '/dashboard/admin/users', label: 'Users', icon: 'users' },
  ] },
  { title: 'Payments', roles: [ROLES.FINANCE], links: [
    { to: '/dashboard/admin/payments/follow-up', label: 'Payment follow-up', icon: 'clock' },
    { to: '/dashboard/admin/payments', label: 'All payments', icon: 'card', end: true },
    { to: '/dashboard/admin/verification-payments', label: 'Verification payments', icon: 'shield' },
  ] },
  { title: 'Super administrator', roles: [ROLES.SUPER_ADMIN], links: [
    { to: '/dashboard/super/activity', label: 'Activity report', icon: 'activity' },
    { to: '/dashboard/super/users/new', label: 'Add a user', icon: 'userplus' },
    { to: '/dashboard/super/verification-fee', label: 'Verification fee', icon: 'card' },
    { to: '/dashboard/super/recommendations', label: 'Recommendations', icon: 'star' },
    { to: '/dashboard/super/terms', label: 'Terms & Conditions', icon: 'document' },
    { to: '/dashboard/super/announcements', label: 'Announcements', icon: 'bell' },
    { to: '/dashboard/super/partners', label: 'Partners & sponsors', icon: 'building' },
  ] },
];

const linkClass = ({ isActive }) =>
  `relative flex items-center gap-4 rounded-lg px-3 py-2.5 text-[0.95rem] font-medium transition-colors ${
    isActive
      ? 'bg-ink-900/15 text-ink-950 before:absolute before:inset-y-1.5 before:-left-3 before:w-1 before:rounded-r before:bg-rose-600'
      : 'text-ink-800 hover:bg-ink-900/10 hover:text-ink-950'
  }`;

export default function DashboardLayout() {
  const { user, hasRole } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const sections = SECTIONS.filter((s) => !s.roles || hasRole(...s.roles));

  // The menu is a slide-over on small screens: close it when a link is followed, and on Escape.
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-paper">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:font-semibold">Skip to content</a>

      {menuOpen && <div className="fixed inset-0 z-30 bg-ink-950/60 lg:hidden" aria-hidden="true" onClick={() => setMenuOpen(false)} />}

      <aside id="dashboard-menu" className={`on-tint fixed inset-y-0 left-0 z-40 w-64 flex-col bg-teal-400 text-ink-950 ${menuOpen ? 'flex' : 'hidden'} lg:flex`}>
        <div className="brand-bar" />
        <div className="flex items-center justify-between px-5 py-4">
          <Logo to="/dashboard" />
          <button type="button" onClick={() => setMenuOpen(false)} className="rounded-md p-1.5 text-ink-950 hover:bg-ink-900/10 lg:hidden"><Icon name="close" /><span className="sr-only">Close menu</span></button>
        </div>

        {user && (
          <div className="px-5 pb-4 pt-1 text-center">
            <div aria-hidden="true" className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-teal-600/30 ring-4 ring-white/50">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white font-display text-2xl font-bold text-ink-900">{initials(user.fullName)}</span>
            </div>
            <p className="mt-3 truncate font-display text-lg font-bold uppercase tracking-wide">{user.fullName}</p>
            <p className="truncate text-sm text-ink-800">{user.email}</p>
          </div>
        )}

        <nav aria-label="Dashboard" className="flex-1 space-y-6 overflow-y-auto px-3 pb-6 pt-2">
          <ul className="divide-y divide-ink-900/15">
            <li><NavLink to="/search" className={linkClass}><Icon name="search" />Find services</NavLink></li>
          </ul>
          {sections.map((s) => (
            <div key={s.title}>
              <p className="mb-1 px-3 text-xs font-bold uppercase tracking-wider text-ink-800">{s.title}</p>
              <ul className="divide-y divide-ink-900/15">
                {s.links.map((l) => (
                  <li key={l.to + l.label}><NavLink to={l.to} end={l.end} className={linkClass}><Icon name={l.icon} />{l.label}</NavLink></li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <AnnouncementBar />
        <header className="sticky top-0 z-20 border-b border-ink-100 bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <div className="flex items-center gap-2">
              <button type="button" aria-expanded={menuOpen} aria-controls="dashboard-menu" onClick={() => setMenuOpen(true)} className="rounded-md p-2 text-ink-900 hover:bg-ink-50 lg:hidden">
                <Icon name="menu" className="h-6 w-6" /><span className="sr-only">Open menu</span>
              </button>
              <Link to="/search" className="hidden items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-800 hover:bg-ink-50 sm:inline-flex"><Icon name="search" className="h-4 w-4" />Find services</Link>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              {hasRole(ROLES.CUSTOMER, ROLES.BUSINESS) && <ButtonLink to="/dashboard/requests/new" size="sm" variant="accent" className="mr-1"><Icon name="plus" className="h-4 w-4" />Get a service</ButtonLink>}
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
        </header>

        <main id="content" className="min-w-0 px-4 py-6 sm:px-6 lg:py-8">
          <div className="mx-auto max-w-6xl">
            <EmailVerifyBanner />
            <TermsGate />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
