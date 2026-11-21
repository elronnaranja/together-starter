# Together

A private budget for a household of one or two people. You host it yourself, for free, so your numbers stay with you.

- **Home:** cash right now, upcoming bills, and how much you need to earn per day to cover them.
- **Expenses:** bills that repeat (monthly, twice a month, yearly…), one-time payments and monthly spending budgets.
- **Money in / Money out:** record what you receive and pay. Partial payments and reversals are handled.
- **Two accounts:** the **owner** can change everything. The optional **second person** can record money in and money out, but cannot change bills, budgets or settings.
- It starts **empty**. On first open, the owner types the household name, the two names, the currency symbol (₱ by default), the time zone and the cash you have today.

There is no sign-up page. Each of the two accounts gets a private one-time link to set its password.

---

## What it costs: nothing

Together is free (MIT license). It runs on two free services:

| Service | What it does for Together | Free plan, in the services' own words (checked 21 November 2026) |
|---|---|---|
| **[Vercel](https://vercel.com/pricing)** (Hobby plan) | Runs the app and gives you a web address | "$0/mo." Includes "1M / month" function invocations and "100 GB / month" of data transfer, far more than a household uses. Its terms say: "You shall only use the Services under a Hobby plan for your personal or non-commercial use." If an account ever goes over the free limits, Vercel pauses it; it does not bill you. |
| **[Supabase](https://supabase.com/pricing)** (Free plan) | Keeps your budget in a database | "Free - from $0/month", "500 MB database size" (years of entries) and a "Limit of 2 active projects". "Free projects are paused after 1 week of inactivity." |

- **No paid plan, no trial.** You only need the free plans. Neither pricing page mentions a card. If a sign-up screen ever asks you for a card or offers a paid plan or "Pro trial", stop: Together does not need one.
- **Personal use only on Vercel.** Hobby is for personal, non-commercial use. A household budget is that. Do not run it for a business.
- **The weekly pause.** If nobody opens Together for about a week, Supabase pauses the database and the app shows that it cannot load your budget. Your data is kept. To wake it, sign in to [supabase.com/dashboard](https://supabase.com/dashboard), open the project and click **Restore project**. It is free and takes a few minutes. Supabase says a paused free project can be restored "with a single button click" within "a 1-year window".

Vercel and Supabase can change their plans. Check the two pricing pages before you start.

---

## Put it live (about 30 minutes)

You can do this yourself, or open this folder with Claude (Claude Code or Claude desktop) and say:
**"Read CLAUDE.md and README.md and put Together live for me on Vercel and Supabase, on the free plans."**
Claude asks before it creates any account, and never picks a paid plan.

You need [Node.js](https://nodejs.org) 22 or newer on your computer, for step 4.

### 1. Make the database (Supabase)

1. Sign up at [supabase.com](https://supabase.com) (free plan).
2. **New project.** Name it `together`. For **Database password**, click **Generate a password** and save it somewhere private; you need it in step 5. For **Region**, pick one near you. *East US (North Virginia)* is closest to Vercel's default region, so it is the fastest choice if you do not change Vercel's region.
3. When the project is ready, open **SQL Editor → New query**, paste the whole contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It should say *Success. No rows returned*.

This makes the tables in a private area called `together`. It is not reachable through Supabase's public API keys, so you never need those keys.

### 2. Put the app on Vercel

Pick one:

- **A. From your computer (no GitHub needed).** In this folder, run:
  ```bash
  npm install
  ```
  ```bash
  npx vercel --prod
  ```
  The first time, it asks you to sign in or sign up (choose the free **Hobby** plan) and asks a few questions; the answers it suggests are fine.
- **B. From your own GitHub repository.** Put this folder in a **private** repository on your GitHub account. In Vercel: **Add New → Project**, import that repository and click **Deploy**. Leave the build settings as they are; `vercel.json` sets them.

The first deploy works, but the app cannot open your budget until steps 3 to 6 are done.

### 3. Get your address

In Vercel, open the project. Under **Domains** you see an address like `https://together-abc.vercel.app`. Copy it.

### 4. Make the two setup links

On your computer, in this folder:

```bash
node scripts/make-setup-link.mjs https://together-abc.vercel.app
```

It prints two **hashes** and two **links**. Keep the links private, like passwords.

### 5. Set the variables

In Supabase, click **Connect** at the top of the project and copy the **Transaction pooler** address (it ends in `:6543/postgres`). Replace `[YOUR-PASSWORD]` in it with the database password from step 1.

In Vercel: project → **Settings → Environment Variables**, add these for **Production**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Transaction pooler address from Supabase, with your password in it |
| `SETUP_OWNER_HASH` | the owner hash from step 4 |
| `SETUP_VIEWER_HASH` | the second-person hash from step 4 (leave it out if you are alone) |

`DATABASE_URL` holds your database password. It goes only into Vercel's variables, never into a file, chat or repository.

### 6. Redeploy and check

Vercel uses new variables only after a new deploy: run `npx vercel --prod` again (option A), or in Vercel open **Deployments**, then the latest one, then **⋯ → Redeploy** (option B).

Open `https://your-address/health`. It should say `ok`. If it says `database unavailable`, check `DATABASE_URL`.

### 7. Open your budget

1. Open the **owner link**, choose a password (12+ characters). You land in the app.
2. Fill in the welcome form: household name, your name, the second person's name (optional), currency, time zone, cash you have today and the date.
3. Send the **second link** to the other person in a private message. It works once.

Each link stops working once used. If a link leaks before it is used, run step 4 again, replace both hash variables and redeploy.

---

## Everyday use

- **Settings → Household:** change names, currency, time zone, opening balance and date, and an optional **hourly rate**. With a rate, Home also shows how many billable hours per day you need. Leave it blank to hide that line.
- **Settings → Password:** change your password (signs out your other devices).
- **Settings → Who has access** (owner): reset the second person's password. You get a new one-time link (valid 7 days) to send them.
- **Export backup** (top of every page): downloads your budget as a file. Keep it somewhere private.
- The owner can also download a fuller backup with all saved versions at `https://your-address/api/backup`.
- **Back up yourself.** Download a backup now and then and keep it somewhere private. Do not count on the free plans for backups.
- **After a quiet week**, if the app says it cannot load your budget, restore the Supabase project (see "The weekly pause" above).

Changing the **opening balance or date** changes your cash right away. Entries dated before the opening date are not counted.

---

## Update to a newer version

1. Replace the files in this folder with the new version (keep your own changes, if any).
2. Run `npm install` and `npx vercel --prod` (option A), or push to your GitHub repository (option B).
3. If the new version's notes say so, run `supabase/schema.sql` again in the SQL Editor. It is safe to run again; it never deletes anything.

Your budget lives in Supabase, so updates do not touch it. Never delete the Supabase project.

---

## Restore a backup file

From `together-full-backup.json` (from `/api/backup`):

1. Make a **new** Supabase project and run `supabase/schema.sql` in it (step 1 above).
2. Turn the backup into SQL:
   ```bash
   node scripts/backup-to-sql.mjs together-full-backup.json > restore.sql
   ```
3. Open `restore.sql`, copy all of it into **SQL Editor → New query** of the new project and click **Run**. It refuses to run on a project that already has a budget.
4. In Vercel, change `DATABASE_URL` to the new project's Transaction pooler address.
5. Passwords are not in backups. Make new setup links (step 4), update both hash variables, redeploy, and set the passwords again.
6. Delete `restore.sql` from your computer afterwards. It contains your budget.

---

## For developers

- One Vercel Function (`api/index.mjs`) runs everything; `vercel.json` sends every path to it. Sign-in, sessions, roles and accounts are in `server/app.mjs`, budget reads and saves in `worker/api.mjs`, database calls in `server/postgres-store.mjs` (Supabase Postgres through the transaction pooler, `prepare: false`). The front end is plain JavaScript in `web/`; `npm run build` bundles it into `dist/server/index.js`.
- The only dependencies are `postgres` and `hash-wasm` (Argon2id), both without dependencies of their own.
- `npm test`: unit tests (no install needed, Node 22+).
- `npm run test:integration`: needs `npm install` and a local Postgres (`initdb`, `pg_ctl`, `psql` on your PATH, for example from Homebrew). It starts a throwaway Postgres, loads `supabase/schema.sql`, runs `api/index.mjs` through `scripts/local-server.mjs`, and checks setup links, sign-in, roles, first-run settings, conflicts (including simultaneous saves), restarts, backups, the 300-version cap, login limits, restore from SQL, that Supabase's `anon` and `authenticated` roles cannot read any table, and the database-down answer.
- `npm run test:ui`: the same setup plus a browser check with Playwright (see the comment at the top of `tests/ui-flow.mjs`).
- `node scripts/preview.mjs` after a build: a local look without passwords, data in memory. Development only; never expose it.
- Variables: `DATABASE_URL`, `SETUP_OWNER_HASH`, `SETUP_VIEWER_HASH`; optional `APP_ORIGIN` (the public address; by default Vercel's production address). `DATABASE_SSL=off` is only for a local test database.

Security: passwords are Argon2id hashes; sessions are random tokens stored hashed, in `HttpOnly; Secure; SameSite=Strict` cookies; sign-in is rate-limited per address and per account; changes must come from your own address; pages send CSP, HSTS and no-sniff headers; the server keeps the last 300 saved versions. The database tables sit in a private schema with row level security on and no access for Supabase's public roles; only the server, with the database password, can read them.

## License

MIT. See [LICENSE](LICENSE).
