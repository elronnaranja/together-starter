# Instructions for Claude: deploying Together for this user

The user wants their own private copy of Together live, for free, on **Vercel (Hobby plan)** for the app and **Supabase (Free plan)** for the data. Follow README.md "Put it live" step by step and keep them informed in plain language.

## Safety rules

- **Free plans only.** Never choose, start or accept a paid plan, a "Pro trial" or anything that asks for a card. Never enter payment details. If a screen asks for a card, stop and tell the user Together does not need one.
- **Ask before creating any account or project.** Say what you are about to create (a Supabase project, a Vercel project) and wait for a yes. The user signs up and signs in to Supabase, Vercel and GitHub themselves; never type their passwords.
- Tell the user, before they start, the two limits from the README: Vercel Hobby is for personal, non-commercial use, and Supabase pauses a free project after about a week with no use (restored free from the dashboard).
- If you use GitHub, the repository must be **private** and in the user's own account.
- **Secrets:** the Supabase database password, `DATABASE_URL` and the two setup links are secrets. Show the setup links only to the user. Never commit, log, paste into issues, or write any of them to a file in this folder. `DATABASE_URL` goes only into Vercel's environment variables (dashboard, or `npx vercel env add DATABASE_URL production`, which prompts for the value). Only the **hashes** from `scripts/make-setup-link.mjs` go into `SETUP_OWNER_HASH` / `SETUP_VIEWER_HASH`.
- Do not use or ask for Supabase's anon, publishable, service_role or secret API keys. Together does not need them; it connects with `DATABASE_URL` only.
- **Never delete or reset the Supabase project or the `together` schema.** That is their budget. `supabase/schema.sql` is safe to run again.
- Do not read, print or upload budget data or backup files unless the user asks for a restore.

## Steps (details in README.md)

1. **Supabase project.** After the user's yes, they create a free project (or you do it with a Supabase connector or CLI they have already connected). Use the generated database password and keep it out of files. Region: one near the user; *East US (North Virginia)* matches Vercel's default region.
2. **Schema.** Run `supabase/schema.sql` once in the SQL Editor (or through the user's Supabase connector). Expect "Success. No rows returned".
3. **Deploy to Vercel.** `npm install`, then `npx vercel --prod` in this folder (the user signs in when asked; Hobby plan), or import their private GitHub repository in the Vercel dashboard. `vercel.json` already sets the build; do not change it.
4. **Address.** Read the production address (`https://<name>.vercel.app`) from the deploy output or the project's Domains.
5. **Setup links.** `node scripts/make-setup-link.mjs https://<name>.vercel.app`. Hashes go into Vercel; links go only to the user.
6. **Variables** (Production): `DATABASE_URL` = Supabase **Connect → Transaction pooler** address (port 6543) with the password filled in. If the password has characters such as `@ : / ? # %`, URL-encode them. Plus `SETUP_OWNER_HASH`, and `SETUP_VIEWER_HASH` unless they are alone. `APP_ORIGIN` is optional (only for a custom domain).
7. **Redeploy** (`npx vercel --prod`, or Deployments → Redeploy), because variables apply only to new deploys.
8. **Check** that `https://<address>/health` answers `ok` and `/login` loads. Then tell the user to open the owner link themselves and fill in the welcome form. You have not tested their sign-in until they confirm it.
9. Remind them to use **Export backup** now and then, and how to wake a paused Supabase project.

## To check the code before deploying

```bash
npm test
```

```bash
npm install
```

```bash
npm run test:integration
```

The integration test needs a local Postgres (`initdb`, `pg_ctl`, `psql`). If there is none, skip it and say so; do not install software without asking.
