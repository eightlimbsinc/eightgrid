# EightGrid

Eight Limbs' in-house, Airtable-style collaborative database. It runs as a Next.js app on Netlify with a Postgres database (Supabase or Neon).

## Features

**Bases, tables, and fields**
- Bases (each with its own color) containing multiple tables. Tables can be renamed and reordered by dragging.
- 21 field types: single line text, long text, number, currency, percent, checkbox, single select, multiple select, date (with optional time), email, URL, phone, rating, link to another record (two-way), attachment, user, formula, created time, last modified time, created by, last modified by.
- Formulas use Airtable syntax (`{Field} * 2`, `IF()`, `AND()`, `DATETIME_DIFF()`, `CONCATENATE()`, …). There are 65 functions.
- Changing a field's type converts the existing values. Select options can be colored and reordered by dragging.

**Views**
- View types: grid, kanban, calendar, gallery, and form.
- Each view saves its own filters (and/or), multi-level sorts, grouping (up to 3 levels), hidden fields, field order, and column widths.
- Creators save view changes for everyone. Editors and viewers can still sort and filter, but their changes stay in their own session.

**Grid editing**
- Keyboard navigation and inline editing.
- Copy/paste from Excel or Google Sheets. Pasting blocks of cells creates rows and select options as needed.
- Right-click to insert, duplicate, or delete records, and to bulk-select.
- Search, and CSV export of the current view.

**Records**
- An expanded record view with prev/next navigation, comments, and a full change history.

**Collaboration**
- Each base has members with one of five roles: owner, creator, editor, commenter, viewer.
- You can invite people by email before they have an account. They get access when they sign up.
- Live updates: other people's edits appear within about 3 seconds while you're using a base.

**Import and forms**
- CSV import as a new table (field types are detected automatically) or into an existing table (you map columns to fields).
- Forms can be shared publicly (no login needed) or limited to members.

**API**
- A REST API at `/api/v1` with personal API tokens.
- It's Airtable-compatible in style: field names as keys, `filterByFormula`, `typecast`, `offset` paging. Docs live at `/docs/api`.

**Auth**
- Email and password, plus optional Google sign-in.
- Sign-up can be restricted to company email domains.

## Tech stack

| Layer | Choice |
| --- | --- |
| App | Next.js 15 (App Router, TypeScript), React 19, Tailwind CSS 4 |
| Database | PostgreSQL via Drizzle ORM (`pg` driver). Works with Supabase, Neon, or local Postgres. |
| Auth | Auth.js (NextAuth v5): credentials plus Google, JWT sessions |
| Hosting | Netlify (Next.js runtime is built in). The schema migrates automatically on deploy. |

How the code is organized:
- `src/lib` holds the shared, framework-free logic: field types, the formula engine, filters/sorts/grouping. Both the browser and the API use it.
- `src/server` holds the database services and access control.
- `src/app/api` holds the route handlers.
- `src/components/base` holds the base UI.

## Local development

```bash
cp .env.example .env              # then fill in DATABASE_URL and AUTH_SECRET
npm install
npm run db:migrate                # creates the tables
npm run dev                       # http://localhost:3000
```

Generate `AUTH_SECRET` with `openssl rand -base64 32`. For a local database, run `createdb eightgrid` and use `DATABASE_URL=postgres://postgres:postgres@localhost:5432/eightgrid`.

Checks:

```bash
npm run typecheck
npm test                          # unit tests for formulas, fields, filters/sorts/groups
npm run build
```

After changing `src/db/schema.ts`, run `npm run db:generate` to create a new SQL migration in `drizzle/`, and commit it.

## Deploying to Netlify + Supabase

### 1. Create the database (Supabase)

1. Create a project at [supabase.com](https://supabase.com) and pick the region closest to your team.
2. Open **Connect**. Copy the **Transaction pooler** connection string (port `6543`) and fill in your database password. This is your `DATABASE_URL`.
3. Copy the **Session pooler** string (port `5432`) too. This is your `MIGRATION_DATABASE_URL`, because migrations shouldn't run through the transaction pooler.

EightGrid uses Supabase only as a plain Postgres database. You don't need Supabase Auth or its APIs.

> Neon works the same way: use its pooled connection string as `DATABASE_URL` and the direct one as `MIGRATION_DATABASE_URL`.

### 2. Create the Netlify site

1. In Netlify, go to **Add new site → Import an existing project** and pick the `eightgrid` GitHub repo.
2. The build settings come from `netlify.toml`, so leave them as they are. The build command runs `npm run netlify-build`, which applies database migrations and then builds.
3. Under **Site configuration → Environment variables**, add the following:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase transaction pooler URL |
| `MIGRATION_DATABASE_URL` | Supabase session pooler URL |
| `AUTH_SECRET` | output of `openssl rand -base64 32` |
| `ALLOWED_EMAIL_DOMAINS` | `8limbsinc.net` (comma-separate several) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | optional, see below |
| `DISABLE_PASSWORD_SIGNUP` | `true` once Google sign-in works (recommended) |
| `DATABASE_SSL` | set to `no-verify` only if deploys fail with a TLS "self-signed certificate" error |

4. Deploy. The first person to sign up creates the first base and becomes its owner.

### 3. Optional: Google sign-in for your company accounts

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), go to **Create credentials → OAuth client ID → Web application**.
2. Add this authorized redirect URI: `https://<your-site>.netlify.app/api/auth/callback/google`. Add your custom domain's version too if you have one.
3. Put the client ID and secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`, then redeploy.
4. Set the OAuth consent screen to **Internal** if you use Google Workspace.

**Security note:** password sign-ups don't verify email addresses. Once Google sign-in works, set `DISABLE_PASSWORD_SIGNUP=true`. Then people can only join with a real company Google account, and `ALLOWED_EMAIL_DOMAINS` still applies. Existing password accounts keep working.

### Cloudflare instead of Netlify?

The app has no Netlify-specific code. You can deploy it to Cloudflare Workers with [OpenNext for Cloudflare](https://opennext.js.org/cloudflare) (`@opennextjs/cloudflare`) and the `nodejs_compat` flag. Using Hyperdrive in front of Postgres is recommended there. Run migrations from CI or locally with `npm run db:migrate`.

## Roles

| Role | Can |
| --- | --- |
| Owner | Everything, including members, sharing, and deleting the base |
| Creator | Create and edit tables, fields, and views, plus everything below |
| Editor | Create, edit, and delete records, and import CSVs |
| Commenter | View and comment |
| Viewer | Read only |

## Known limitations / roadmap

- **Attachments** are stored as links (Google Drive, Dropbox, any URL). File upload to Supabase Storage or Netlify Blobs is the natural next step.
- **Live updates** poll a change feed (`/api/bases/:id/changes`), which works on any serverless host. Polling adapts to keep hosting costs down: every 3s while someone is active, slowing to 10s, 30s and then 2 minutes as a tab sits idle, and stopping entirely in background tabs. For instant updates, swap in Supabase Realtime or a WebSocket service.
- **Table size**: each table loads entirely into the browser, so filtering and sorting feel instant. That's comfortable up to tens of thousands of records per table.
- **Not built yet**: lookup and rollup fields, undo, automations, interfaces/dashboards, and record-level permissions.
- There's no rate limiting on public forms yet. Netlify's built-in protections or a CAPTCHA can be added if a form gets abused.
