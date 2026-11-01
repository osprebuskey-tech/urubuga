# Imbehe: deployment guide

Imbehe is two parts: a **Node/Express API** (talks to MongoDB) and a **static React app** (built with Vite). They are deployed
separately and linked by two settings: the API's `CORS_ORIGINS` and the app's `VITE_API_URL`.

```
Browser ──https──> app.example.rw   (static files: frontend/dist)
   │
   └──https──> api.example.rw  ──> Node/Express (backend)  ──> MongoDB Atlas
                                         └──> S3-compatible bucket (images)
```

Use real domains with **HTTPS everywhere**. Never commit `.env` files or credentials.

## 1. Before you start: checklist

| | |
|---|---|
| MongoDB | An Atlas cluster (or any replica set; transactions need one) |
| Secrets | A `JWT_SECRET` and a `PAYMENT_WEBHOOK_SECRET`, generated fresh for production |
| Domains | One for the app, one for the API (for example `app.example.rw` and `api.example.rw`) |
| Image storage | An S3-compatible bucket (AWS S3, Cloudflare R2, MinIO). Local disk is lost on most hosts |
| Email | An SMTP account (your host, Brevo, Mailgun, Amazon SES, Gmail app password...) with a verified sender address |

Generate secrets (run it twice, one value per secret):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 2. MongoDB Atlas

1. Create a cluster (a shared M0 is fine to start; use a dedicated tier with backups once you have real customers).
2. **Database Access:** add a user with a long random password and the `readWrite` role on the `imbehe` database only.
3. **Network Access:** allow only your API server's outbound IP address(es). Do not use `0.0.0.0/0` in production. If your host has
   no fixed IP, use its private networking or a peering/VPC option instead.
4. **Connect > Drivers:** copy the `mongodb+srv://` string. Put your database name before the `?`, and URL-encode special characters
   in the password:
   `mongodb+srv://imbehe_app:<password>@<cluster>.mongodb.net/imbehe?retryWrites=true&w=majority`
5. Turn on **backups** (Atlas: Backup tab) and decide how long you keep them. Payments and the audit log live in this database.

Indexes are created automatically when the API starts.

## 3. Backend (the API)

### Environment variables

Set these in your host's secret manager (never in the repository). Anything not listed keeps the default from `.env.example`.

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | what your host expects (often provided automatically) |
| `TRUST_PROXY` | `1` when the API sits behind one reverse proxy or load balancer (so rate limits see real client IPs) |
| `MONGODB_URI` | your Atlas string |
| `JWT_SECRET` | the generated secret (32+ characters) |
| `JWT_EXPIRES_IN` | `1h` (default): the session length for everyone, and the only one staff accounts get |
| `JWT_REMEMBER_EXPIRES_IN` | `14d` (default): how long "Keep me signed in" lasts for ordinary accounts. Logging out ends it at once |
| `CLIENT_URL` | `https://app.example.rw` |
| `CORS_ORIGINS` | `https://app.example.rw` (comma-separated exact origins; no wildcard) |
| `PUBLIC_API_URL` | `https://api.example.rw` |
| `STORAGE_PROVIDER` | `s3`, with `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL` (and `S3_ENDPOINT` for R2/MinIO) |
| `PAYMENT_GATEWAY` | `manual` (the sandbox gateway is refused in production) |
| `PAYMENT_WEBHOOK_SECRET` | the generated secret (needed once a real gateway is connected) |
| `DEFAULT_COMMISSION_BPS` | `1200` for 12% (administrators can change it later in the dashboard) |
| `EMAIL_PROVIDER` | `smtp`, with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM` (a sender address your SMTP service has verified) |
| `API_DOCS_ENABLED` | leave unset (docs are off in production); set `true` to publish `/api/docs` |

**The API refuses to start** in production if: `CORS_ORIGINS` contains `*` or a non-https origin, `CLIENT_URL` is not https,
`PUBLIC_API_URL` is missing while using local storage, `JWT_SECRET` or the webhook secret is still the example placeholder,
the sandbox payment gateway or the in-memory mailbox is selected. The message names the variable, never its value.

### Run it

Node 20 or newer.

```bash
cd backend
npm ci --omit=dev
npm start
```

Run it under a process manager so it restarts: your platform's own (Render, Railway, Fly.io...), **systemd**, or **PM2**
(`pm2 start src/server.js --name imbehe-api`). The server shuts down cleanly on `SIGTERM`.

Minimal **systemd** unit (`/etc/systemd/system/imbehe-api.service`):

```ini
[Unit]
Description=Imbehe API
After=network.target

[Service]
WorkingDirectory=/srv/imbehe/backend
EnvironmentFile=/etc/imbehe/api.env      ; chmod 600, owned by root
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
User=imbehe

[Install]
WantedBy=multi-user.target
```

### HTTPS and the reverse proxy

Terminate HTTPS in front of the API. Managed hosts do this for you. On your own server use Nginx with a free Let's Encrypt
certificate (`certbot --nginx -d api.example.rw`):

```nginx
server {
  server_name api.example.rw;
  client_max_body_size 6m;                 # images are limited to 5 MB by the API
  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  listen 443 ssl;                          # certbot fills in the certificate lines
}
server { listen 80; server_name api.example.rw; return 301 https://$host$request_uri; }
```

Set `TRUST_PROXY=1` when you do this. Redirect all http to https and consider adding an HSTS header at the proxy once you are
sure https works.

### First-time data

The seed script's test users are **refused** in production. Instead, once, from a machine that has the production environment:

```bash
npm run seed:categories        # the starting service categories (safe to repeat)

ADMIN_NAME="Your Name" ADMIN_EMAIL=you@example.rw ADMIN_PASSWORD='a-long-passphrase-1' npm run create-super-admin
```

The password must be 12+ characters with a letter and a number. It is read from the environment, not the command line, and the
account creation is written to the audit log. Staff accounts cannot be created through the public API.

**Create a super administrator first.** From then on, create everyone else in the app (sidebar: *Super administrator > Add a user*):
administrators, payment follow-up staff, and providers. Each person receives an email (valid 72 hours) to choose their own password,
so nobody, not even the super admin, ever sees or sets it. This needs a working email provider (section 3). `npm run create-admin`
still exists for a plain administrator.

Who can do what:

| Role | Can do |
|---|---|
| Super administrator | Everything an administrator can, plus: create users of any role, suspend staff accounts, read the activity report |
| Administrator | Verify providers, moderate reviews, resolve disputes, manage categories, users (not staff accounts), payments and the commission rate |
| Payment follow-up | See payments, chase unpaid jobs and payouts due, log follow-ups (and remind customers), record payments, refunds and payouts. Cannot change the commission rate or reach anything else |

Keep at least two super administrators so one lost account does not lock you out of staff management.

### Check it works

```bash
curl https://api.example.rw/api/health        # {"success":true,"data":{"status":"ok","db":true}}
```

Use `/api/health` for your host's health check. Then sign in as the administrator in the app and confirm: categories appear,
a test provider can register, upload a photo (checks the bucket and `S3_PUBLIC_BASE_URL`), and the browser shows no CORS errors.

## 4. Frontend (the React app)

```bash
cd frontend
echo "VITE_API_URL=https://api.example.rw" > .env.production
npm ci
npm run build            # output in frontend/dist
```

`VITE_API_URL` is read at **build time** (no trailing slash, no `/api`). Upload `dist/` to any static host (Netlify, Vercel,
Cloudflare Pages, S3 + CDN, or Nginx). Because the app uses browser routing, configure the host to serve `index.html` for every path
that is not a file:

- Netlify: a `_redirects` file containing `/*  /index.html  200`
- Nginx: `location / { try_files $uri /index.html; }`

Everything the browser loads must be https, including images (`S3_PUBLIC_BASE_URL`) and the API.

## 5. Updating

1. Deploy the new backend, wait for `/api/health` to answer.
2. Build and deploy the frontend.
3. Roll back by redeploying the previous version. The data model is additive between milestones, so older code ignores new fields.

## 6. Security checklist

- [ ] `NODE_ENV=production` and the API started (the guards in section 3 passed)
- [ ] HTTPS on both domains; http redirects to https
- [ ] Atlas: dedicated database user, IP allow-list (no `0.0.0.0/0`), backups on
- [ ] Secrets only in the host's secret store; `.env` files not in git; secrets rotated if ever shared
- [ ] `CORS_ORIGINS` lists only your app's exact origin(s)
- [ ] Super administrator accounts use long unique passwords; there are at least two of them, and no more than you need
- [ ] Payment follow-up and administrator accounts are suspended the day a person leaves (Users > Suspend)
- [ ] `/api/docs` off unless you mean to publish it
- [ ] Logs are collected and kept somewhere you can search (they contain request ids, and redact tokens and passwords)
- [ ] Restore from a backup has been tried at least once

## 7. Known limits (be honest with your users)

- **Email:** set `EMAIL_PROVIDER=smtp` (section 3). Without it, verification and password-reset emails are only logged and nobody
  receives them; the API prints a warning at start-up while that is the case. If the mail server is down, the account is still created
  and the user can use "Resend confirmation email". Email bodies (which contain secret links) are never logged.
- **Payments:** only `manual` is available in production: customers pay outside the app (for example MTN MoMo or Airtel Money) and an
  administrator confirms it, which is recorded in the audit log. Connecting a real gateway means adding one provider module and its
  webhook secret; nothing in the platform pretends a payment succeeded without confirmation.
- **Revenue is not profit.** The dashboard shows gross transaction value and commission revenue separately; costs, taxes and
  payout fees are not tracked.
