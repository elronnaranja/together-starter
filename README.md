# Together

A private budget for a household of one or two people. You host it yourself, so your numbers stay with you.

- **Home:** cash right now, upcoming bills, and how much you need to earn per day to cover them.
- **Expenses:** bills that repeat (monthly, twice a month, yearly…), one-time payments and monthly spending budgets.
- **Money in / Money out:** record what you receive and pay. Partial payments and reversals are handled.
- **Two accounts:** the **owner** can change everything. The optional **second person** can record money in and money out, but cannot change bills, budgets or settings.
- It starts **empty**. On first open, the owner types the household name, the two names, the currency symbol (₱ by default), the time zone and the cash you have today.

There is no sign-up page. Each of the two accounts gets a private one-time link to set its password.

---

## What it costs

Together is free (MIT license). It needs a small server. These steps use **[Railway](https://railway.com)**. Railway is not free forever, so check its pricing page before you start. As of November 2026:

| Railway plan | Price | What it means for Together |
|---|---|---|
| Trial | $0, one-time $5 credit for 30 days | Enough to try it. When the trial ends the app stops until you pick a plan. |
| Free | $0, $1 of usage per month, no card | Volumes up to 0.5 GB (plenty for years of entries). The app sleeps when nobody uses it and wakes on the next visit (a few seconds' wait). If the $1 runs out, the app stops until next month; your data is kept. |
| Hobby | $5 per month (includes $5 of usage) | Always on. The cheapest plan that will not stop for usage. |

Railway can change these prices. Money you spend goes to Railway, not to the makers of Together.

---

## Put it live on Railway (about 20 minutes)

You can do this yourself, or open this folder with Claude (Claude Code or Claude desktop) and say:
**"Read CLAUDE.md and README.md and put Together live for me on Railway."**
Claude will ask before anything that costs money or creates an account.

### 1. Get the code onto Railway

Pick one:

- **A. Railway CLI (no GitHub needed).** Install the [Railway CLI](https://docs.railway.com/cli), then in this folder run:
  ```bash
  railway login
  ```
  ```bash
  railway init
  ```
  ```bash
  railway up
  ```
- **B. Your own GitHub repository.** Put this folder in a **private** repository on your GitHub account, then in Railway: **New Project → Deploy from GitHub repo**.

Railway finds the `Dockerfile` and builds it. The first build may fail to start properly until steps 2–4 are done. That is fine.

### 2. Add a volume (this is where your budget is saved)

In the Railway project, right-click the service (or use the command palette) → **Add Volume**, and set the **mount path to `/data`**.

Without a volume, every update erases your budget. Keep **one replica** only.

### 3. Get your public address

Service → **Settings → Networking → Generate Domain**. You get an address like `https://together-production-1234.up.railway.app`. Copy it.

### 4. Make the two setup links

On your computer, in this folder (needs [Node.js](https://nodejs.org) 20 or newer):

```bash
node scripts/make-setup-link.mjs https://together-production-1234.up.railway.app
```

It prints two **hashes** and two **links**. Keep the links private, like passwords.

### 5. Set the variables

Service → **Variables**, add:

| Variable | Value |
|---|---|
| `APP_ORIGIN` | your public address from step 3, e.g. `https://together-production-1234.up.railway.app` (no slash at the end) |
| `SETUP_OWNER_HASH` | the owner hash from step 4 |
| `SETUP_VIEWER_HASH` | the second-person hash from step 4 (leave it out if you are alone) |

Railway redeploys. Open `https://your-address/health`. It should say `ok`.

### 6. Open your budget

1. Open the **owner link**, choose a password (12+ characters). You land in the app.
2. Fill in the welcome form: household name, your name, the second person's name (optional), currency, time zone, cash you have today and the date.
3. Send the **second link** to the other person in a private message. It works once.

Each link stops working once used. If a link leaks before it is used, run step 4 again and replace both hash variables.

### 7. Turn on automatic backups (recommended)

Service → **Volume → Backups → Daily**. Railway keeps daily backups for 6 days, weekly for 27 days and monthly for 89 days. Backups may count toward your Railway usage.

---

## Everyday use

- **Settings → Household:** change names, currency, time zone, opening balance and date, and an optional **hourly rate**. With a rate, Home also shows how many billable hours per day you need. Leave it blank to hide that line.
- **Settings → Password:** change your password (signs out your other devices).
- **Settings → Who has access** (owner): reset the second person's password. You get a new one-time link (valid 7 days) to send them.
- **Export backup** (top of every page): downloads your budget as a file. Keep it somewhere private.
- The owner can also download a fuller backup with all saved versions at `https://your-address/api/backup`.

Changing the **opening balance or date** changes your cash right away. Entries dated before the opening date are not counted.

---

## Update to a newer version

1. Replace the files in this folder with the new version (keep your own changes, if any).
2. Run `railway up` again (option A) or push to your GitHub repository (option B).

The volume keeps your budget. Never delete the volume when you update.

---

## Restore a backup

**From a Railway volume backup:** Service → Volume → Backups → pick one → **Restore**. Railway creates a fresh volume from it. Redeploy and check `/health`.

**From a backup file** (`together-full-backup.json` from `/api/backup`):

1. Turn it into a restore value:
   ```bash
   node scripts/backup-to-initial-state.mjs together-full-backup.json > restore-initial-state.json
   ```
2. Give the service a **new, empty volume** at `/data` (the restore only runs on an empty database).
3. Paste the contents of `restore-initial-state.json` into a variable named `INITIAL_STATE`, and deploy.
4. Passwords are not in backups. Make new setup links (step 4 above), update both hash variables, and set the passwords again.
5. After it works, delete the `INITIAL_STATE` variable and the local `restore-initial-state.json`.

Very large backups may hit Railway's variable size limit; this has not been tested.

---

## For developers

- Bun server with SQLite (`scripts/railway-runtime.ts`), plain JavaScript front end (`web/`), shared API code (`worker/api.mjs`).
- `npm run build` writes `dist/server.ts`. `bun dist/server.ts` runs it (`PORT`, `DATA_DIR`, `APP_ORIGIN`, `SETUP_*_HASH`).
- `npm test`: unit tests (no install needed, Node 22+).
- `npm run test:integration`: starts the real server on a temporary database and checks setup links, sign-in, roles, first-run settings, conflicts, backups and restore (uses `bun`, or `npx --yes bun`).
- `tests/ui-flow.mjs`: optional browser check with Playwright (see the comment at the top).
- `node scripts/preview.mjs` after a build: a local look without passwords. Development only; never expose it.

Security: passwords are Argon2id hashes; sessions are random tokens stored hashed, in `HttpOnly; Secure; SameSite=Strict` cookies; sign-in is rate-limited per address and per account; changes must come from your own address; pages send CSP, HSTS and no-sniff headers; the server keeps the last 300 saved versions.

## License

MIT. See [LICENSE](LICENSE).
