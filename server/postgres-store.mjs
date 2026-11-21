// Every database call the app makes, for Postgres (Supabase on the live app, a throwaway local Postgres in tests).
// `sql` is a client from the `postgres` package. Tables live in the private `together` schema (supabase/schema.sql).
export function postgresStore(sql) {
  return {
    ping: () => sql`select 1`,
    // Budget state and saved versions
    async getState() { const [row] = await sql`select model, revision, updated_at from together.household_state where id = 'household'`; return row || null; },
    initState: (model, now) => sql`insert into together.household_state (id, model, revision, updated_at) values ('household', ${model}, 0, ${now}) on conflict (id) do nothing`,
    // Saves only if nobody saved since `revision`; keeps the previous version and about the last 300.
    saveState: (revision, model, now) => sql.begin(async t => {
      const [row] = await t`select model, revision from together.household_state where id = 'household' for update`;
      if (!row || row.revision !== revision) return false;
      await t`insert into together.household_revision (revision, model, saved_at) values (${row.revision}, ${row.model}, ${now})`;
      await t`update together.household_state set model = ${model}, revision = revision + 1, updated_at = ${now} where id = 'household'`;
      await t`delete from together.household_revision where id <= (select max(id) from together.household_revision) - 300`;
      return true;
    }),
    async backup() {
      return {
        state: await sql`select id, model, revision, updated_at from together.household_state`,
        history: await sql`select id::int as id, revision, model, saved_at from together.household_revision order by id`,
      };
    },
    // Accounts
    async getPassword(role) { const [row] = await sql`select password from together.users where role = ${role}`; return row?.password || null; },
    // First password for an account; marks its reset link used. False if the account already has one.
    completeSetup: (role, password) => sql.begin(async t => {
      const done = await t`insert into together.users (role, password) values (${role}, ${password}) on conflict (role) do nothing`;
      if (!done.count) return false;
      await t`update together.setup_links set used = true where role = ${role}`;
      return true;
    }),
    setPassword: (role, password) => sql`update together.users set password = ${password} where role = ${role}`,
    async getLink(role) { const [row] = await sql`select hash, expires, used from together.setup_links where role = ${role}`; return row ? {hash: row.hash, expires: Number(row.expires), used: row.used} : null; },
    // Removes the second person's password and sessions and stores a new one-time link, all at once.
    resetAccount: (role, hash, expires) => sql.begin(async t => {
      await t`delete from together.users where role = ${role}`;
      await t`delete from together.sessions where role = ${role}`;
      await t`insert into together.setup_links (role, hash, expires, used) values (${role}, ${hash}, ${expires}, false)
        on conflict (role) do update set hash = excluded.hash, expires = excluded.expires, used = false`;
    }),
    // Sessions (only hashes of the cookie tokens are stored)
    async newSession(hash, role, expires, now) {
      await sql`delete from together.sessions where expires < ${now}`;
      await sql`insert into together.sessions (token, role, expires) values (${hash}, ${role}, ${expires})`;
    },
    async sessionRole(hash, now) { const [row] = await sql`select role from together.sessions where token = ${hash} and expires > ${now}`; return row?.role || null; },
    deleteSession: hash => sql`delete from together.sessions where token = ${hash}`,
    deleteOtherSessions: (role, keepHash) => sql`delete from together.sessions where role = ${role} and token <> ${keepHash}`,
    // Sign-in limit: counts attempts per key in a window; true while the count is within `max`.
    async attempt(key, max, now, windowMs) {
      const [row] = await sql`insert into together.attempts (key, count, expires) values (${key}, 1, ${now + windowMs})
        on conflict (key) do update set
          count = case when together.attempts.expires < ${now} then 1 else together.attempts.count + 1 end,
          expires = case when together.attempts.expires < ${now} then excluded.expires else together.attempts.expires end
        returning count`;
      return row.count <= max;
    },
    clearAttempts: keys => sql`delete from together.attempts where key = any(${keys})`,
  };
}
