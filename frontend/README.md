# Imbehe: frontend

React 18 + Vite + Tailwind CSS, talking to the Express API in `../backend`.

## What's built

This frontend covers every feature the backend currently exposes (through bookings and job tracking):

| Area | Screens |
|---|---|
| Public | Home with search, category directory, search results (services and providers, filters, sorting, pagination), provider profile with portfolio, service details |
| Accounts | Register (customer / provider / business), log in, log out, forgot and reset password, email confirmation, settings |
| Providers | Profile editor (skills, categories, districts, contact preferences), photo, portfolio, verification request, listings (create, edit, photos, publish / pause / archive) |
| Business | Company profile |
| Hiring (customers and businesses) | Request a quotation (to everyone in a category, or to one provider), my requests, request details with photos, compare quotations (sort by price or rating) and accept or decline, edit or cancel a request |
| Providers, requests | Requests for you (open jobs in your categories and ones sent directly to you), send, edit and withdraw a quotation |
| Jobs (everyone) | Job list with status filters, job page with progress timeline, start / complete / cancel / report a problem (only the moves the server allows), counterpart phone number while the job is live, admin dispute resolution |
| Reviews | Customers rate a completed job (stars + comment); public ratings summary and reviews on provider profiles; providers can report a review; administrators moderate (hide with a reason, restore) |
| Payments | Customers pay a job (manual method confirmed by an administrator, or the test-mode gateway in development) and see a receipt; providers see price, commission and their share and payouts; administrators record verified payments, refunds and payouts, see gross value kept apart from platform revenue, and set the commission rate |
| Administration | Dashboard on the admin home page (needs-attention list, people and work, money with gross value apart from revenue, recent activity), daily reports with charts, disputes (read both sides, take for review, resolve), suspend and reinstate users |
| Disputes | Report a problem on a job to open one; both sides and the administrator add messages and photos; the decision is shown to everyone |
| Everyone | Notification bell with unread count, notifications page |
| Administrators | Provider verification queue (verify / reject with reason / remove), category management, user list |

API documentation (Swagger) and the hardening pass are the remaining planned milestone; every feature the backend has is on screen.

## Run it

```bash
# 1. backend (in another terminal)
cd backend && cp .env.example .env   # set JWT_SECRET
npm install && npm run seed && npm run dev      # http://localhost:5000

# 2. frontend
cd frontend
cp .env.example .env                 # VITE_API_URL=http://localhost:5000
npm install
npm run dev                          # http://localhost:5173
```

The dev server must run on port **5173**: the backend's `CORS_ORIGINS` allows only that origin by default
(`strictPort` is on, so Vite fails loudly instead of silently picking another port).

Seeded logins (password `ChangeMe123!`, or your `SEED_PASSWORD`):

| Email | Role |
|---|---|
| `admin@imbehe.test` | administrator |
| `provider@imbehe.test` | provider (verified, one live listing) |
| `customer@imbehe.test` | customer |
| `business@imbehe.test` | business |
| `both@imbehe.test` | customer + provider |

Emails (verification, password reset) are printed in the **backend console** with `EMAIL_PROVIDER=console`.
Copy the link from there. Links point to `CLIENT_URL` (`http://localhost:5173`).

## Scripts

```bash
npm run dev          # dev server
npm run build        # production build into dist/
npm run preview      # serve the production build locally
npm test             # run the tests once (Vitest + Testing Library)
```

## Structure

```
src/
  components/   reusable UI (ui/ = buttons, fields, dialog...), cards, search bar, logo (the Imbehe emblem is `public/logo.png`)
  context/      AuthContext (session), ToastContext
  features/     feature-specific pieces: providers/, listings/, search/, admin/
  hooks/        useAsync, useCategories, useDebounce, useDocumentTitle
  layouts/      PublicLayout, AuthLayout, DashboardLayout
  pages/        one file per screen (provider/, business/, admin/ for dashboard screens)
  routes/       router config (lazy-loaded pages) and ProtectedRoute
  services/     api.js (fetch wrapper) + one small module per API area
  utils/        constants, formatting, error helpers
```

## How it works

- **API client** (`services/api.js`): one `request()` function. It unwraps the `{ success, data, meta }` envelope, throws an
  `ApiError` with the server's `code`, `message` and field `details`, and sends the Bearer token. A network failure becomes a
  friendly `NETWORK_ERROR`.
- **Sessions**: the access token is kept in `sessionStorage` (survives a refresh, not a closed tab). The API has no refresh
  token, so the app logs the user out at the token's expiry time (default 1 hour) and on any 401 about the session, then shows
  a notice on the login page. Logging out calls `POST /auth/logout`, which revokes the token on the server.
- **Authorization**: `ProtectedRoute` only improves the experience by hiding screens. The API checks roles and ownership on
  every request, so nothing here is a security boundary.
- **Forms**: client checks mirror the API's rules for quick feedback; the API's field errors (`details[].field`) are mapped
  back onto the matching inputs. Optional fields are omitted rather than sent empty.
- **Uploads**: multipart with field name `image`; JPEG, PNG or WebP up to 5 MB (matches the backend default `MAX_UPLOAD_MB`).
  If you raise that limit on the server, update `MAX_IMAGE_MB` in `features/providers/AvatarUploader.jsx`.
- **Accessibility**: labelled inputs with linked error text, skip links, keyboard-operable menus, native `<dialog>` for
  modals, visible focus, `prefers-reduced-motion` respected.

## Known limits (they come from the current API, not the UI)

- Search matches whole words ("laptop" finds "laptop repair"; "lapt" does not).
- Provider profiles can't show a provider's listings, because `GET /api/services` has no provider filter yet.
- Optional text fields on the company profile, provider profile and requests (budget, preferred date) can be changed but not
  cleared back to empty (the API treats "" as invalid for some of them).
- Notifications refresh once a minute (and when you open them); there is no push or live socket yet. Email and SMS
  notifications are not built.
- A request with quotations is locked against edits by design. Cancel it and post a new one to change the details.
- The admin user list is read-only: there are no suspend / role-change endpoints yet.
- Provider identity documents and certificates are deferred on the backend, so there is no upload for them.

## Adding the next features

Disputes follow the pattern used for jobs (`services/bookingApi.js`, `features/bookings/`, `pages/bookings/`): one API module, one folder of
pages, routes under `/dashboard`, a nav entry in `layouts/DashboardLayout.jsx`.

## Deploying

`npm run build` produces static files in `dist/`. Host them anywhere (Netlify, Vercel, Cloudflare Pages, Nginx).
- Set `VITE_API_URL` **at build time** to the public HTTPS API URL.
- Add the site's origin to the backend's `CORS_ORIGINS` and set the backend's `CLIENT_URL` to it (email links use it).
- Configure the host to serve `index.html` for unknown paths (single-page-app fallback), otherwise refreshing `/dashboard`
  gives a 404. Nginx: `try_files $uri /index.html;`
- Serve everything over HTTPS.
