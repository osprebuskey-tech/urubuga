import { useRouteError } from 'react-router-dom';
import Logo from '../components/Logo';

/** Shown when a page crashes or a page chunk fails to load. Details stay in the console, never on screen. */
export default function ErrorPage() {
  const error = useRouteError();
  if (error) console.error(error); // eslint-disable-line no-console
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo tone="dark" />
      <h1 className="mt-10 text-3xl font-bold">Something went wrong</h1>
      <p className="mt-2 max-w-md text-ink-700">This page failed to load. Reloading usually fixes it. If it keeps happening, please try again later.</p>
      <div className="mt-8 flex gap-3">
        <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700">Reload page</button>
        <a href="/" className="rounded-lg border border-ink-300 px-5 py-2.5 font-semibold hover:bg-ink-50">Go home</a>
      </div>
    </div>
  );
}
