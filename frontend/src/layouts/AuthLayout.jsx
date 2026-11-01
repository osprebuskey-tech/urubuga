import { Outlet } from 'react-router-dom';
import Logo from '../components/Logo';
import AnnouncementBar from '../components/AnnouncementBar';

export default function AuthLayout() {
  return (
    <>
    <AnnouncementBar />
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="on-tint relative hidden flex-col justify-between overflow-hidden bg-teal-400 p-10 text-ink-950 lg:flex">
        <div className="absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
        {/* soft glows in the palette's butter and sage */}
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-sun-300/60 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-16 top-1/3 h-72 w-72 rounded-full bg-sage-300/70 blur-3xl" />
        <div className="relative"><Logo /></div>
        <div className="relative">
          <p className="font-display text-4xl font-bold leading-tight text-ink-950">Skilled people, <span className="mark-accent">one trusted place.</span></p>
          <p className="mt-4 max-w-md text-ink-800">
            Providers are checked by our team before their services go live, so you can hire with confidence, and good work gets found.
          </p>
        </div>
        <p className="relative text-sm text-ink-800">Kigali · Rwanda</p>
      </aside>
      <main id="content" className="flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="mb-8 lg:hidden"><Logo tone="dark" /></div>
        <div className="mx-auto w-full max-w-md"><Outlet /></div>
      </main>
    </div>
    </>
  );
}
