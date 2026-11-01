# Imbehe: Architecture

## 1. System architecture

```
 Browser (React + Vite SPA)
        | HTTPS, JSON, Authorization: Bearer <JWT>
        v
 Express API
   helmet -> CORS allow-list -> JSON body (10kb) -> rate limits -> routes
   routes -> validate (Zod) -> auth/role middleware -> controllers -> services -> models
   errors -> one centralized handler ({success:false,error:{code,message,details},requestId})
        |                         |                     |
        v                         v                     v
   MongoDB (Mongoose)     Storage adapter        Payment / Email / SMS adapters
                          (cloud, configurable)  (swappable providers, added later)
```

Principles
- **Backend is the security boundary.** React guards only improve UX. Roles, ownership, prices, commission and
  status transitions are always decided server-side.
- **Thin controllers, logic in services.** Business rules (state machine, commission, payments) live in services so
  they are unit-testable.
- **Roles come from the database on every request**, not from the JWT, so role changes and suspensions apply
  immediately. The JWT carries only the user id and a session version (`tv`).
- **Integer RWF** for all money. Commission stored as basis points (1200 = 12%).
- **Adapters** for storage, payments, email and SMS, so providers can be chosen or changed later.

## 2. Folder structure

```
imbehe/
  README.md
  docs/ARCHITECTURE.md
  backend/
    package.json  jest.config.js  .env.example  .gitignore
    src/
      app.js  server.js
      config/       env.js (Zod-validated), db.js, logger.js
      models/       User, AuditLog (M1) + the rest per milestone
      controllers/  authController, adminController
      routes/       index, authRoutes, adminRoutes
      middleware/   auth, validate, errorHandler, notFound, rateLimiters, asyncHandler
      services/     authService, tokenService, emailService, auditService
      validators/   authValidators, adminValidators, commonValidators
      utils/        AppError, roles, response, query
      scripts/      seed.js
      tests/        env.js, setup.js, helpers.js, *.test.js
  frontend/         (from Milestone 9)
    src/ components pages layouts features hooks services context routes utils
```

## 3. MongoDB schema design

| Model | Key fields | References | Indexes / constraints |
|---|---|---|---|
| User | fullName, email, phone, passwordHash (select:false), roles[], status, emailVerified, token hashes, tokenVersion | none | unique email; (roles,status,createdAt) |
| ProviderProfile | displayName, bio, avatar, skills[], experienceYears, location, coverage[], contactPrefs, portfolio[], documents[] (private), verificationStatus, ratingAvg, ratingCount, completedJobs | user (unique), categories[] | unique user; (verificationStatus), (categories, ratingAvg) |
| CompanyProfile | companyName, TIN (private), address, contact | owner User (unique) | unique owner |
| ServiceCategory | name, slug, parent, subcategories, status | parent | unique slug |
| ServiceListing | title, description, images[], priceFrom (RWF int), pricingType (fixed/hourly/quotation), duration, location, availability, status | provider, category | text index (title, description); (category,status,priceFrom); (location) |
| ServiceRequest | title, description, attachments[], location, preferredDate, budgetMin/Max, status | customer, category, company? | (customer,status), (category,status,createdAt) |
| Quotation | price (RWF int), description, deliverables[], duration, expiresAt, terms, status | request, provider | unique (request, provider) |
| Booking | agreedPrice, commissionBps (snapshot), commissionAmount, providerAmount, status, statusHistory[{from,to,by,at}] | request, quotation, customer, provider | unique quotation; (customer,status), (provider,status) |
| Payment | amount, method, provider, providerRef, status, idempotencyKey, refundedAmount, payoutStatus | booking, recordedBy? | unique idempotencyKey; unique (provider, providerRef) |
| Review | rating 1-5, comment, status (visible/hidden/flagged) | booking, customer, provider | unique booking |
| Notification | type, title, body, link, readAt | user | (user, readAt, createdAt) |
| Dispute | reason, evidence[], status, resolution | booking, openedBy, resolvedBy | (status, createdAt) |
| PlatformSetting | key, value | updatedBy | unique key (e.g. commission_bps) |
| AuditLog | action, entityType, entityId, metadata, ip, userAgent | actor | (action,createdAt), (entityType,entityId) |

Money fields: gross value, commission, provider amount, refunds and payouts are stored as separate integers and never
derived from client input. Multi-document updates (accept quotation -> create booking, payment confirmation ->
booking + ledger) use transactions when the deployment is a replica set (Atlas is).

Booking state machine (validated server-side, every change appended to `statusHistory` and audited):
`REQUESTED -> QUOTED -> ACCEPTED -> IN_PROGRESS -> COMPLETED`; `CANCELLED` from REQUESTED/QUOTED/ACCEPTED
(and IN_PROGRESS by admin); `DISPUTED` from IN_PROGRESS/COMPLETED; resolution returns to COMPLETED or CANCELLED.

## 4. Milestones

1. **Backend foundation (done):** config, Mongo connection, auth (register, login, logout, me, email verification,
   password reset), roles, validation, centralized errors, rate limiting, audit log, admin users list, seed, tests.
2. Categories, provider/company profiles, service listings, uploads (storage adapter), admin verification, seed categories (done).
3. **Search and discovery: text indexes, filters, sorting, pagination, combined search box (this delivery).**
4. **Service requests, quotations, in-app notifications (done).**
5. **Bookings lifecycle (state machine, history, transactions) and reviews and ratings (done).**
6. **Payments and commission: provider abstraction, webhook signature check, idempotency, manual admin payments, ledger (done).**
7. **Disputes, admin dashboard and reports, moderation (done).**
8. **OpenAPI/Swagger docs, hardening pass, deployment guide (done).**
11. **Look and layout, stay signed in (done).**
10. **Super admin, payment follow-up role, activity report (done).**
9. **Completion pass (done):** audit of the frontend against the page list and the API, account settings (edit profile, change password), user dispute list, provider reviews page, SMTP email delivery.
9. Frontend foundation (done, grows with each milestone): Vite, Tailwind (navy/white/maroon), auth, routing, layouts.
10. Frontend marketplace: home, categories, search, provider and service pages.
11. Frontend workflows: requests, quotations, bookings, job tracking, reviews, notifications, payments.
12. Dashboards (customer, provider, company, admin), settings, accessibility and responsive polish, frontend tests, final docs.

## 5. Milestone 1 API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /api/health | public | DB status |
| POST | /api/auth/register | public | roles optional: customer/provider/business only |
| POST | /api/auth/login | public | generic error for bad credentials |
| POST | /api/auth/logout | auth | revokes all of the user's tokens |
| GET | /api/auth/me | auth | |
| PATCH | /api/auth/me | auth | name and phone only (null phone removes it); roles, status and email cannot be changed here |
| POST | /api/auth/change-password | auth | needs the current password; signs out other devices and returns a fresh token |
| POST | /api/auth/verify-email | public | single-use token |
| POST | /api/auth/resend-verification | auth | added beyond the spec list |
| POST | /api/auth/forgot-password | public | same response for unknown emails |
| POST | /api/auth/reset-password | public | single-use, revokes sessions |
| GET | /api/admin/users | admin | page, limit, role, status, search |
| POST | /api/admin/users | **super admin** | `{fullName, email, phone?, roles}`; staff roles cannot be mixed with customer/provider/business; the person gets an email to choose their own password |
| POST | /api/admin/users/:id/resend-invite | **super admin** | only while `invitePending`; the old link stops working |
| GET | /api/admin/reports/activity | **super admin** | `from`, `to` (max one year); pending work, provider activity, service delivery, staff work |
| GET | /api/admin/payments/follow-up | admin, finance | backlog size and overdue counts for the three buckets |
| GET | /api/admin/payments/follow-up/:bucket | admin, finance | `awaiting_confirmation`, `unpaid_jobs` or `payouts_due`; overdue first |
| POST | /api/admin/payments/follow-ups | admin, finance | log a contact; optional customer reminder (once a day at most) |
| GET | /api/admin/payments/follow-ups | admin, finance | the log for one job (`bookingId`) |

## 6. Milestone 2 API

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /api/categories | public | active only; admins may pass `includeDisabled=true` |
| POST / PUT / DELETE | /api/categories(/:id) | admin | delete is blocked while the category is in use (disable it instead) |
| GET | /api/providers | public | verified providers only; `category`, `district`, `page`, `limit` |
| GET | /api/providers/:id | public | verified only; contact details only if the provider opted in |
| GET / PUT | /api/providers/me | provider | PUT changes only the fields sent; rating/verification/counters are never writable |
| POST | /api/providers/me/verification-request | provider | needs bio, a category and a district. Also used to answer an administrator's question: optional `{ message }` (max 500) and the request goes back to `pending` |
| POST | /api/providers/me/avatar | provider | multipart field `image` |
| POST / DELETE | /api/providers/me/portfolio(/:id) | provider | multipart `image` + `title`; max 20 items |
| GET | /api/providers/me/services | provider | own listings, all statuses except archived |
| GET | /api/services | public | active listings; `category`, `district`, pagination |
| POST | /api/services | provider + verified email | draft by default; going live needs a verified provider |
| GET | /api/services/:id | public if active, owner otherwise | other statuses return 404 to non-owners |
| PUT / DELETE | /api/services/:id | owner | DELETE archives; other users get 404 |
| POST / DELETE | /api/services/:id/images(/:imageId) | owner | max 8 images |
| GET / PUT | /api/companies/me | business | |
| GET | /api/admin/providers | admin | `verificationStatus` filter |
| PATCH | /api/admin/providers/:id/verification | admin | **accept** (`verified`), **reject** (`rejected`, reason required) or **ask for more information** (`needs_info`, question required; only from `pending`/`needs_info`, otherwise 409 `INVALID_TRANSITION`) / `unverified`; leaving "verified" pauses live listings. The provider is notified of every decision |

Uploads: JPEG, PNG and WebP only, detected from the file's bytes (client content type and filename are ignored), random
filenames, size limit `MAX_UPLOAD_MB`. `STORAGE_PROVIDER=local` serves files from `/uploads`; `s3` works with any
S3-compatible bucket. Provider identity documents/certificates need private storage with signed access, so they are
deferred to a later milestone rather than stored publicly.

## 7. Milestone 3: search and discovery

| Endpoint | Parameters |
|---|---|
| GET /api/services | `q`, `category`, `district`, `pricingType`, `minPrice`, `maxPrice`, `minRating`, `sort`, `page`, `limit` |
| GET /api/providers | `q`, `category`, `district`, `minRating`, `sort`, `page`, `limit` |
| GET /api/search | `q` (required). Returns up to 5 services, 5 providers and matching categories, with totals |

Sorting
- Services: `relevance` (needs `q`), `newest`, `rating` (provider rating), `price_asc`, `price_desc`. Default: relevance with `q`, otherwise newest.
  Quotation-based listings have no price, so they always sort last by price and are excluded by price filters.
- Providers: `relevance` (needs `q`), `rating`, `experience`, `newest`. Default: relevance with `q`, otherwise rating.
- `relevance` without `q` falls back to the default instead of failing, so a UI can leave the sort control on "relevance".

How it works
- MongoDB text indexes: listings weight title 5x over description; providers weight name 5, skills 3, bio 1.
  Matching is by whole (stemmed, English) words, case-insensitive. Partial words ("lapt") do not match; typo tolerance and
  prefix search would need Atlas Search, which is a possible later upgrade.
- Listing search is an aggregation that joins the provider, because ratings live on the provider profile. This avoids copying
  ratings onto every listing, which would go stale when reviews arrive in Milestone 5. It also re-checks that the provider is
  currently verified. If listing volume grows large, denormalising rating onto listings is the planned optimisation.
- Blank query-string values (`?q=`) are ignored; invalid values return 400 with field details; `limit` is capped at 100.
- Search endpoints have their own rate limit (`SEARCH_RATE_LIMIT_MAX`, per minute per IP).

## 8. Milestone 4: requests, quotations, notifications

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | /api/requests | customer / business + verified email | optional `provider` (directed request) and `onBehalfOfCompany`; notifies matching providers |
| GET | /api/requests | any user | `scope=mine` (default for customers), `incoming` (verified providers: open requests in their categories or sent to them), `all` (admin); `status`, `category`, pagination |
| GET | /api/requests/:id | owner, admin, eligible provider, or a provider who quoted | everyone else gets 404; providers see the customer's first name only |
| PATCH | /api/requests/:id | owner | `{status:"cancelled"}` or field edits while open **and without quotations** |
| POST / DELETE | /api/requests/:id/attachments(/:attachmentId) | owner | JPEG/PNG/WebP, max 5, open requests only |
| POST | /api/requests/:id/quotations | verified provider + verified email | one per provider per request; price in whole RWF; expiry date max 90 days ahead |
| GET | /api/requests/:id/quotations | owner/admin: all except withdrawn; provider: own | |
| PATCH | /api/quotations/:id | see below | `{status}` or field edits |
| GET | /api/notifications | any user | `unread=true`, pagination, `meta.unreadCount` |
| GET | /api/notifications/unread-count | any user | |
| PATCH | /api/notifications/:id/read | owner | |
| POST | /api/notifications/read-all | any user | |

Quotation changes (`PATCH /api/quotations/:id`)
- `pending -> accepted | rejected`: only the customer who owns the request.
- `pending -> withdrawn`, or editing fields while pending: only the provider who sent it.
- Anyone else gets 404 (403 if they are involved but not allowed that action). `expired` is computed (a pending quotation past
  `expiresAt`), never stored; an expired quotation cannot be accepted, but the provider can extend it.

Accepting is concurrency-safe without a transaction: the request is claimed with a guarded update
(`status: open -> accepted`), so two simultaneous accepts cannot both win; the loser gets 409 `REQUEST_CLOSED`.
The competing quotations are then rejected. Milestone 5 wraps these steps plus the booking insert in a transaction
(see section 9).

Rules enforced on the server: prices are integers; ownership, company, status and provider ids are never taken from the
client; a request with quotations is locked against edits so nobody prices a job that later changes; accepting is audited.
Creating requests and quotations has its own rate limit (`WRITE_RATE_LIMIT_MAX`, default 60 per hour per IP).
Notifications are best-effort side effects: a failure to notify is logged and never undoes the action that caused it.

## 9. Milestone 5: bookings and job tracking

A booking is created **by accepting a quotation** (there is deliberately no `POST /api/bookings`), so the agreed price, the
customer and the provider always come from the server's own records. `REQUESTED` and `QUOTED` are the states of the request and
its quotations; the booking starts at `accepted`.

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /api/bookings | any user | `scope=mine` (default) or `all` (admin; admin-only accounts default to it), `as=customer\|provider`, `status` (or `active`), pagination |
| GET | /api/bookings/:id | the two parties and admins | everyone else gets 404; includes `allowedActions` for the viewer and the full history |
| PATCH | /api/bookings/:id/status | see table | `{status, note?}`; a note (10+ characters) is required to cancel or dispute |

State machine (one table in `services/bookingService.js`, checked on every move):

| From | To | Who |
|---|---|---|
| accepted | in_progress | provider |
| accepted | cancelled | customer or provider |
| in_progress | completed | provider |
| in_progress | disputed | customer or provider |
| completed | disputed | customer or provider, within `DISPUTE_WINDOW_DAYS` (default 7) of completion |
| disputed | completed or cancelled | administrator |

Work in progress cannot simply be cancelled; a side that wants out reports a problem so an administrator reviews it.
Every move records who (user and role), when, and the note, in `history`. Moves are guarded updates
(`findOneAndUpdate` on the status that was read), so two simultaneous moves cannot both apply; the loser gets 409 `BOOKING_CHANGED`.
Admin resolutions, cancellations and disputes are written to the audit log. `ProviderProfile.completedJobs` counts a job once and
is reduced if an administrator later cancels a job that had been completed.

Accepting a quotation now changes four things together: the request closes, the quotation is accepted, competing quotations are
declined, and the booking is created. `utils/transaction.js` runs them in a MongoDB transaction when the deployment supports one
(Atlas or a replica set) and otherwise falls back to guarded updates plus a compensation step that undoes partial work. The
in-memory test server is standalone, so the tests exercise the fallback; run the suite against a local replica set
(`mongod --replSet rs0`, then `rs.initiate()`) to exercise the transaction path.

Privacy: while a job is live (accepted or in progress) each side sees the other's phone number so they can arrange the work;
it is hidden again once the job ends. Email addresses are never shared. Administrators see jobs but not phone numbers.

Not in this milestone: payments, commission and payouts (Milestone 6); dispute records, evidence and a resolution queue
(Milestone 7; for now a dispute is a booking status with a reason, resolved by an administrator through the status endpoint);
reviews (next). If a booking is cancelled the request stays closed; the customer posts a new request to hire someone else.

## 10. Milestone 5b: reviews and ratings

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | /api/bookings/:id/reviews | the customer of a **completed** booking | `{rating: 1-5 integer, comment: 10-1000 chars}`; one review per booking (unique index) |
| GET | /api/providers/:id/reviews | public (verified providers only) | published reviews, newest first, `rating` filter, pagination; `meta.summary` = average, count, distribution |
| POST | /api/reviews/:id/report | the reviewed provider | `{reason: fake\|abusive\|unrelated\|other, note?}`; one report each; reporting never hides a review by itself |
| GET | /api/admin/reviews | admin | `status`, `reported=true`, pagination; shows each report |
| PATCH | /api/admin/reviews/:id | admin | `{status: hidden\|published, reason}`; a reason (5+ characters) is required to hide, the author is notified, and the action is audited |
| GET | /api/bookings/:id | (existing) | now includes `review` and `canReview` for the viewer |

Rules: a review needs a completed job and its own customer; the provider, customer and booking come from the server, never the
body. `ProviderProfile.ratingAvg` / `ratingCount` are **recomputed from published reviews** on every create, hide and restore
(not adjusted with +1/-1), so concurrent changes cannot leave them wrong; the average is rounded to two decimals. Hidden reviews
leave public view and the average. Providers never see hidden reviews; the author sees them with the moderator's reason. The
public list shows only the reviewer's first name. Authors cannot edit or delete a review (an administrator can hide it), and a
hidden review cannot be replaced by a new one for the same job.

## 11. Milestone 6: payments and commission

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /api/payments/options | any user | payment methods available, and the default |
| POST | /api/payments/checkout | the customer of a payable job + verified email | `{bookingId, gateway?}` only; amount and commission are computed on the server. Repeating it returns the same payment |
| GET | /api/payments, /api/payments/:id | the two parties; admins by id | each viewer sees only the money facts that concern them (customers never see the commission split) |
| POST | /api/payments/:id/cancel | the customer | pending payments only |
| POST | /api/payments/webhook, /webhook/:gateway | **signature only** (no login) | verified, idempotent, amount-checked |
| POST | /api/payments/:id/sandbox/:outcome | the customer; dev only | runs a signed event through the real webhook pipeline; 404 in production |
| POST | /api/admin/payments | admin | record a payment verified outside the app (bank / mobile money); confirms a pending manual payment or creates a succeeded one |
| POST | /api/admin/payments/:id/refund | admin | `{amount, reason}`; recorded after the admin has sent the refund |
| POST | /api/admin/payments/:id/payout | admin | `{amount?, reference}`; only for completed jobs; recorded after the admin has sent the money |
| GET | /api/admin/payments, /payments/summary | admin | list with filters; platform-wide money report |
| GET / PUT | /api/admin/settings, /settings/commission | admin | commission in basis points (1200 = 12.00%), 0 to 5000 |

Money rules
- Everything is a whole number of RWF. Commission = `round(gross * rateBps / 10000)`; 100,000 at 12% = 12,000 commission and 88,000
  for the provider. Rates are basis points so there is no floating point. Refund splits use BigInt (products can exceed 2^53).
- The amount is the booking's agreed price. The rate in force is **snapshotted on each payment**; changing the platform rate
  affects only payments created afterwards.
- Gross value, commission, refunds and payouts are stored and reported separately. `platformRevenue` (commission minus
  refunded commission) is revenue, not profit: gateway fees, hosting, tax and costs are not subtracted anywhere, and the API has
  no "profit" field.
- A refund comes out of commission and provider share in proportion to the original split, summing exactly (the final refund takes
  the remainder). A refund after a payout shows `providerOwes`. A payout can never exceed what is due.
- No card details are ever stored or accepted. Customers pay a gateway or pay outside the app.

Payment abstraction (`services/payments/`)
- A gateway is a module with `createCheckout(payment)` and (for online gateways) `verifyWebhook({rawBody, headers})` returning a
  normalised event. `manual` (an administrator confirms money they have seen) is always available. `sandbox` is a **fake gateway**
  that moves no money; config validation refuses it when `NODE_ENV=production`.
- To add a real mobile money gateway: write its provider module (its own signature scheme and API calls), register it, add its
  name to `GATEWAYS` (models/Payment.js) and `PAYMENT_GATEWAY` (config/env.js), and point the gateway's webhook at
  `/api/payments/webhook/<name>`. `paymentService` does not change.

Webhooks (never pretend a payment succeeded)
1. The signature (`HMAC-SHA256(secret, timestamp + "." + rawBody)`, constant-time compare, 5 minute timestamp window) is checked
   on the exact bytes received, before anything in the body is read.
2. The event id is claimed in `PaymentEvent` (unique per gateway). A re-delivery stops there; an event that crashed half way
   (still `received`) is safely applied again because each step is a guarded update.
3. The amount and currency must equal the payment's own; a mismatch is ignored, logged and audited, never applied.
4. Success moves `pending -> succeeded` once. A late success for a payment the customer cancelled is still honoured (the money
   arrived) unless the booking already has another live payment, in which case it is flagged `payment.needs_attention` for an admin.
5. Once the signature is valid the response is always 200, so the gateway stops retrying even for ignored events.
At most one live (pending or succeeded) payment exists per booking (partial unique index on `active`).

Audit: manual payments, refunds, payouts and commission changes are written with `strict: true` and, on MongoDB with
transactions, in the same transaction as the money change. On a standalone server the audit entry is written immediately after
the change and a failure is raised loudly rather than swallowed.

Not in this milestone: online refunds or payouts through a gateway (administrators send money themselves and record it);
automatic refunds when a job is cancelled (an admin records them); holding payments in escrow until completion is a policy,
not enforced in code (a provider can start work before payment). Booking and payment are separate.

## 12. Milestone 7: admin dashboard, disputes, moderation

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /api/admin/dashboard | admin | users (by role, suspended, new this week), providers by verification status, requests, jobs, reviews, disputes, **finance** (gross value, refunds, platform revenue, payouts), a "needs attention" list, 15 recent audit entries (no sign-in noise) |
| GET | /api/admin/reports | admin | `from`, `to` (YYYY-MM-DD, at most 366 days, default last 30): per-day new users, requests, completed jobs, gross value, commission, refunds; every day present |
| PATCH | /api/admin/users/:id/status | admin | `{status: suspended\|active, reason}`; a reason (5+ characters) is needed to suspend |
| GET | /api/admin/disputes | admin | `status` filter, open ones first |
| PATCH | /api/admin/disputes/:id | admin | `{status:"under_review"}` to take it, or `{outcome: completed\|cancelled, note}` to resolve |
| GET | /api/disputes, /api/disputes/:id | the two parties and admins | everyone else gets 404; messages carry roles, never user ids |
| POST | /api/disputes/:id/messages | parties and admins | 1-1000 characters, up to 100 per dispute, not after resolution |
| POST | /api/disputes/:id/evidence | parties and admins | one image per request, up to 10, not after resolution |

Disputes
- A dispute is **opened by reporting a problem on a job** (`PATCH /api/bookings/:id/status` to `disputed`), never created directly.
  The booking move and the dispute record are kept together: if the record cannot be created, the booking is put back as it was.
  Every active administrator is notified. A booking has at most one active dispute (partial unique index on `active`) but may be
  disputed again after a resolution.
- Resolving goes through the **booking state machine** (`disputed -> completed | cancelled` by an admin), so the same rules,
  audit entries, completed-job counts and notifications apply whether an admin resolves from the dispute page or the job page.
  Any refund is recorded separately on the job's payment.
- Evidence files get unguessable names, but the default local storage serves them from a public folder, so anyone holding the
  exact link can open one. For sensitive material use the S3 adapter with a private bucket and signed links.

Moderation
- Suspension is enforced on every request (the auth middleware checks status each time) and ends the user's sessions at once.
  A suspended **provider** is also taken off public search: their verification is withdrawn, which pauses their live listings.
  Reinstating does not restore verification; an administrator verifies them again on purpose.
- Administrator accounts and your own account cannot be suspended through this endpoint. Suspension and reinstatement are audited
  (`strict`) in the same transaction as the change where the database supports it.
- Open requests and active jobs of a suspended user are left alone; an administrator handles them (cancel, dispute, refund).

The dashboard shows gross transaction value and platform revenue as separate figures; neither is profit, and there is no profit
field anywhere in the API.


### Provider verification flow (Imbehe)

`unverified -> pending` (provider requests) then the administrator chooses one of:

- **Accept:** `verified` (public, can publish services).
- **Reject:** `rejected` with a reason the provider can read; they may fix things and request again.
- **Ask for more information:** `needs_info` with a question. The provider is notified, updates their profile, optionally writes a
  reply, and resubmits (`needs_info -> pending`). The administrator then sees the question and the reply together.

`needs_info` profiles are not public. Every decision and resubmission is written to the audit log, and the provider receives an
in-app notification (`provider.verification`).

## Milestone 8: documentation, hardening, deployment

**API documentation.** `GET /api/docs` (Swagger UI) and `GET /api/openapi.json`. The document is *generated at start-up* from the real
Express routers and the Zod validators on each route (`src/docs/`): request bodies, query parameters, path parameters, who may call
each endpoint (from the auth and role middleware) and upload fields cannot drift from the code. The only hand-written part is
`src/docs/summaries.js` (one line per endpoint); a test fails if a route has no summary, or a summary has no route.
Disabled in production unless `API_DOCS_ENABLED=true`.

**Hardening pass.** What was reviewed and what changed:

| Area | Result |
|---|---|
| Controllers reading raw `req.body/params/query` | none: everything goes through validators |
| Regexes built from user input | both escape the input first |
| NoSQL operator injection | validators accept strings only (tested with `{ "$gt": "" }`) |
| Error output | no stack traces outside development (tested) |
| Caching | **new:** `Cache-Control: no-store` on every API response |
| Production configuration | **new:** refuses to start with wildcard/http CORS origins, non-https client URL, placeholder secrets, sandbox payments, in-memory mailbox, local storage without `PUBLIC_API_URL` |
| Process safety | **new:** `uncaughtException` handler; webhook signature header redacted from logs |
| First administrator in production | **new:** `npm run create-admin` (seed refuses production); `npm run seed:categories` is production-safe |

## Milestone 9: completion pass

Every backend endpoint was compared with what the frontend calls, and every page in the original list was checked. Gaps found and closed:

| Gap | Fix |
|---|---|
| Settings was read-only: no way to edit your name or phone or change your password | `PATCH /api/auth/me`, `POST /api/auth/change-password` (current password required, other sessions revoked) and two forms on the Settings page |
| Users had no list of their disputes (the API existed, no page) | `/dashboard/disputes` with status filter, in the sidebar |
| "Reviews" had no page of its own for providers | `/dashboard/provider/reviews` (rating summary and reviews, as the public sees them) |
| Emails were only logged | `EMAIL_PROVIDER=smtp` via nodemailer, with timeouts; bodies with secret links are never logged |

Not done on purpose: changing your email address (needs a confirm-the-new-address flow), and adding a role after sign-up.

## Milestone 10: super admin, payment follow-up, activity report

### Roles

| Role | Reaches |
|---|---|
| `super_admin` | Everything `admin` reaches (a route that admits admins admits super admins), plus creating users, suspending staff and the activity report |
| `admin` | The admin area, except the three super-admin routes. Cannot suspend staff accounts |
| `finance` (payment follow-up) | Only the payment routes under `/admin/payments`: backlog, follow-up log, record a payment, refund, payout. Not the commission rate, users, providers, reviews, disputes or settings. Has no customer or provider side |
| customer, provider, business | As before |

Staff roles are never self-assignable and cannot be mixed with marketplace roles (someone who verifies providers or handles money must not also be a party to jobs).

`src/routes/adminRoutes.js` is ordered on purpose: payment routes (admin + finance) come first, then `router.use(adminOnly)`, then the super-admin routes with their own guard. A route added without a guard falls under the next `router.use` below it, so it defaults to the *stricter* group. A test generates every `/admin` route from the real router and checks each against customer, provider, finance and admin sessions, so a route that is too open fails the suite.

### Creating users

A super admin creates the account (`emailVerified: true`, `invitePending: true`) with an unguessable placeholder password and the person receives a single-use link, valid 72 hours, to choose their own. It reuses the password-reset token mechanism. Nobody sees or sets another person's password. The first super admin comes from `npm run create-super-admin`.

### Payment follow-up

Three buckets, each with a number of days after which it counts as overdue:

| Bucket | What it is | Overdue after |
|---|---|---|
| `awaiting_confirmation` | a manual payment was started and nobody has confirmed it | 1 day |
| `unpaid_jobs` | job in progress or complete and no payment started | 3 days |
| `payouts_due` | paid, job complete, provider not yet paid | 3 days |

Every contact is logged in `PaymentFollowUp` (append-only: who, when, outcome, note, optional next look). Until the chosen "look again" date an item is not overdue. A customer reminder is an in-app notification, at most one per job per day. Lists look at the 500 oldest items per bucket.

### Activity report (super admin)

For a chosen period (default 30 days, at most a year): **provider activity** (quotations sent and accepted, jobs won, completed and cancelled, value completed, reviews, disputes, one row per active provider; providers who did nothing are only counted), **service delivery** (job outcomes, completion rate, average days to start and finish, request-to-job funnel, by category), **staff work** (every staff member's actions from the audit log; people who did nothing are listed too, and signing in is not counted as work) and **pending work** (what is waiting right now, with how many and since when, whatever the period). The screen can download each section as CSV; cells that start with `=`, `+`, `-` or `@` are neutralised so a provider's name cannot become a spreadsheet formula.

## Milestone 11: look, dashboard layout, staying signed in

**Look.** The palette now comes from the logo: its own deep blue (`navy-900` = `#000080`) for headers, sidebar and primary buttons, and its violet-to-pink-to-orange gradient (`brand-violet`, `brand-pink`, `brand-orange`) for accents: a thin rule on the headers, the active-item marker in the sidebar, avatars and highlighted words on dark backgrounds. The gradient is never used behind text (the orange end is too light for white lettering). The pink of the gradient replaces the old maroon for links, errors and secondary actions (token name `maroon` kept so no screen had to change). Primary buttons are navy, secondary are pink.

**Dashboard layout.** A fixed sidebar (a slide-over menu on phones, closed with Escape or by tapping outside) with icons and sections that depend on the person's roles, and a sticky top bar with *Home page*, *Find services*, notifications and an account menu (home page, dashboard, settings, log out). The sidebar's menu is a UX convenience only: the API still decides who may do what.

**Home page while signed in.** Logging in or registering now lands on the home page (or on the page you were sent from). The public header keeps you signed in on every public page (Dashboard link, notifications, account menu) and the home page greets you by name with shortcuts for your role. You stay signed in until you log out.

**Staying signed in.** "Keep me signed in on this device" (ticked by default) gives an ordinary account a `JWT_REMEMBER_EXPIRES_IN` session (14 days) stored in `localStorage`; otherwise the session lasts `JWT_EXPIRES_IN` and lives in `sessionStorage`. Administrators, super admins and payment follow-up staff never get a long session, whatever the request says (the server decides and tells the browser whether it was granted, so the browser never stores a token for longer than the server allows). Logging out and changing the password revoke the token on the server, so a long session is never a way around them. Anything in web storage can be read by an injected script, so the app never renders untrusted HTML.
