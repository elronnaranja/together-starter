// The same store as server/postgres-store.mjs, kept in memory. For unit tests and the local preview only;
// everything is lost when the process stops.
export function memoryStore() {
  let state = null, nextId = 1;
  const history = [], users = new Map(), sessions = new Map(), attempts = new Map(), links = new Map();
  return {
    history,
    ping: async () => true,
    getState: async () => state && {...state},
    async initState(model, now) { if (!state) state = {model, revision: 0, updated_at: now}; },
    async saveState(revision, model, now) {
      if (!state || state.revision !== revision) return false;
      history.push({id: nextId++, revision: state.revision, model: state.model, saved_at: now});
      state = {model, revision: revision + 1, updated_at: now};
      const max = history.at(-1).id;
      while (history.length && history[0].id <= max - 300) history.shift();
      return true;
    },
    backup: async () => ({state: state ? [{id: 'household', ...state}] : [], history: history.map(h => ({...h}))}),
    getPassword: async role => users.get(role) || null,
    async completeSetup(role, password) { if (users.has(role)) return false; users.set(role, password); if (links.has(role)) links.get(role).used = true; return true; },
    async setPassword(role, password) { if (users.has(role)) users.set(role, password); },
    getLink: async role => links.has(role) ? {...links.get(role)} : null,
    async resetAccount(role, hash, expires) { users.delete(role); for (const [t, s] of sessions) if (s.role === role) sessions.delete(t); links.set(role, {hash, expires, used: false}); },
    async newSession(hash, role, expires, now) { for (const [t, s] of sessions) if (s.expires < now) sessions.delete(t); sessions.set(hash, {role, expires}); },
    async sessionRole(hash, now) { const s = sessions.get(hash); return s && s.expires > now ? s.role : null; },
    async deleteSession(hash) { sessions.delete(hash); },
    async deleteOtherSessions(role, keepHash) { for (const [t, s] of sessions) if (s.role === role && t !== keepHash) sessions.delete(t); },
    async attempt(key, max, now, windowMs) {
      const a = attempts.get(key);
      if (!a || a.expires < now) attempts.set(key, {count: 1, expires: now + windowMs}); else a.count++;
      return attempts.get(key).count <= max;
    },
    async clearAttempts(keys) { for (const k of keys) attempts.delete(k); },
  };
}
