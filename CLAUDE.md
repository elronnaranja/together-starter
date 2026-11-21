# Instructions for Claude: deploying Together for this user

The user wants their own private copy of Together live. Follow README.md "Put it live on Railway", step by step, and keep them informed in plain language.

Safety rules:

- **Ask before anything that costs money or creates an account.** Explain Railway's plans from the README table (Trial, Free, Hobby $5/month) and let the user choose. Never pick a paid plan for them. Never enter payment details.
- The user signs in to Railway and GitHub themselves. Do not type their passwords.
- If you use GitHub, the repository must be **private** and in the user's own account.
- **Never delete or replace the volume** mounted at `/data`, and keep one replica. That volume is their budget.
- The setup links from `scripts/make-setup-link.mjs` are secrets. Show them only to the user, never commit them, never paste them into variables, issues, logs or files. Only the **hashes** go into Railway (`SETUP_OWNER_HASH`, `SETUP_VIEWER_HASH`).
- `APP_ORIGIN` must be the exact public https address, with no slash at the end. Without it, saving fails.
- Do not read, print or upload budget data or backup files unless the user asks for a restore.
- Before saying it is live, check `https://<address>/health` answers `ok` and `/login` loads. Then tell the user to open the owner link themselves and fill in the welcome form. You have not tested their sign-in until they confirm it.
- Suggest turning on daily volume backups (README step 7).

To check the code before deploying:

```bash
npm test
```

```bash
npm run test:integration
```
