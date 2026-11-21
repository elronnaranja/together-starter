// The one Vercel Function. vercel.json sends every path here; server/app.mjs routes it.
// Needs DATABASE_URL (Supabase transaction pooler) and SETUP_OWNER_HASH / SETUP_VIEWER_HASH. See README.md.
import postgres from 'postgres';
import worker from '../dist/server/index.js';
import {createApp} from '../server/app.mjs';
import {postgresStore} from '../server/postgres-store.mjs';

let app;
function getApp() {
  if (app) return app;
  if (!process.env.DATABASE_URL) console.warn('DATABASE_URL is not set. Copy the Transaction pooler address from Supabase (Connect button) into the Vercel environment variables.');
  if (!process.env.SETUP_OWNER_HASH) console.warn('SETUP_OWNER_HASH is not set. Make the setup links with: node scripts/make-setup-link.mjs <your address>');
  // prepare:false is required by Supabase's transaction pooler. DATABASE_SSL=off is only for a local test database.
  const sql = postgres(process.env.DATABASE_URL || 'postgres://missing-database-url@127.0.0.1:1/none', {
    prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10,
    ssl: process.env.DATABASE_SSL === 'off' ? false : 'require',
  });
  app = createApp({store: postgresStore(sql), env: process.env, worker});
  return app;
}

// Vercel sets x-real-ip / x-forwarded-for to the visitor's address; it is only used for the sign-in limit.
const clientIp = req => (req.headers.get('x-real-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || '').trim() || 'unknown';

export default {
  fetch(request) { return getApp().handle(request, clientIp(request)); },
};
