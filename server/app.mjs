// Together's server logic: setup links, sign-in, sessions, the owner/second-person role, accounts and backups.
// Runs as one Vercel Function (api/index.mjs) with Supabase Postgres as `store`. Budget reads and saves go to
// worker/api.mjs with the role in ROLE_HEADER; any copy of that header sent by a browser is removed first.
import {randomBytes, createHash, timingSafeEqual} from 'node:crypto';
import {argon2id, argon2Verify} from 'hash-wasm';
import {ROLE_HEADER, reply} from '../worker/api.mjs';

const hash = s => createHash('sha256').update(s).digest('hex');
const safe = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
// Argon2id with the same cost as before (19 MiB, 2 passes).
const hashPassword = password => argon2id({password, salt: randomBytes(16), parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32, outputType: 'encoded'});
const checkPassword = (password, encoded) => argon2Verify({password, hash: encoded}).catch(() => false);
const ROLES = ['owner', 'viewer'], WEEK = 604800000, WINDOW = 900000;

function page(mode, error = '') {
  const setup = mode === 'setup';
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Together · Household budget</title><style>body{margin:0;background:#f7f8f4;color:#263b32;font:16px system-ui;display:grid;min-height:100vh;place-items:center}main{width:min(360px,80vw);padding:36px;background:white;border-radius:24px;box-shadow:0 10px 50px #183e3010}h1{font-size:34px;margin:0}p{color:#68766f;line-height:1.5}label{display:block;margin:20px 0 8px}input,select,button{box-sizing:border-box;width:100%;padding:14px;border:1px solid #dce2d9;border-radius:10px;font:inherit}button{background:#355c47;color:white;border:0;margin-top:24px;cursor:pointer}.error{color:#a13131}</style><main><h1>together</h1><p>${setup ? 'Set your private password to open your household budget.' : 'A little clarity, every day. Sign in to your private household budget.'}</p>${error ? '<p class="error">' + error + '</p>' : ''}<form method="post">${setup ? '' : '<label for="role">Account</label><select id="role" name="role"><option value="owner">Owner · Full access</option><option value="viewer">Second person · Money in and out</option></select>'}<label for="password">${setup ? 'New password (at least 12 characters)' : 'Password'}</label><input id="password" name="password" type="password" autocomplete="${setup ? 'new-password' : 'current-password'}" ${setup ? 'minlength="12"' : ''} maxlength="256" required>${setup ? '<label for="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="256" required>' : ''}<button>${setup ? 'Set password &amp; open Together' : 'Sign in'}</button></form></main></html>`,
    {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Strict-Transport-Security': 'max-age=31536000', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"}});
}
const redirect = (path, cookie) => new Response(null, {status: 303, headers: {Location: path, ...(cookie ? {'Set-Cookie': cookie} : {}), 'Cache-Control': 'no-store'}});
const sessionCookie = (token, age = 604800) => `together_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
const sessionToken = req => (req.headers.get('cookie') || '').match(/(?:^|;\s*)together_session=([^;]+)/)?.[1] || '';
const json = (d, status = 200) => new Response(JSON.stringify(d), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});

export function createApp({store, env, worker}) {
  // The public address: APP_ORIGIN if set, otherwise the project's production address that Vercel provides.
  const origin = (env.APP_ORIGIN || (env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + env.VERCEL_PROJECT_PRODUCTION_URL : '')).replace(/\/+$/, '');
  const buildId = (env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || env.BUILD_ID || 'local';
  const attempt = (key, max = 8) => store.attempt(key, max, Date.now(), WINDOW);
  const workerEnv = {store};

  async function people() {
    let st = {};
    try { st = JSON.parse((await store.getState())?.model || '{}').settings || {}; } catch {}
    return [{role: 'owner', name: st.ownerName || 'Owner', access: 'Full access'}, {role: 'viewer', name: st.partnerName || 'Second person', access: 'Money in and out'}];
  }

  async function account(req, u, user) {
    if (u.pathname === '/api/account' && req.method === 'GET') {
      const now = Date.now(), list = await people();
      const out = user.role !== 'owner' ? [] : await Promise.all(list.map(async p => {
        const link = await store.getLink(p.role);
        return {...p, hasPassword: !!await store.getPassword(p.role), linkPending: !!link && !link.used && link.expires > now};
      }));
      return json({role: user.role, name: list.find(p => p.role === user.role).name, people: out});
    }
    if (req.method !== 'POST') return json({error: 'Not found'}, 404);
    if (Number(req.headers.get('content-length') || 0) > 4096) return json({error: 'Too large'}, 413);
    let body; try { body = await req.json(); } catch { return json({error: 'Invalid request'}, 400); }
    if (u.pathname === '/api/account/password') {
      if (!await attempt('password:' + user.role)) return json({error: 'Too many attempts. Try again in 15 minutes.'}, 429);
      const current = String(body?.current || ''), next = String(body?.next || ''), stored = await store.getPassword(user.role);
      if (current.length > 256 || !stored || !await checkPassword(current, stored)) return json({error: 'Your current password is incorrect.'}, 400);
      if (next.length < 12 || next.length > 256) return json({error: 'Use a new password of 12 to 256 characters.'}, 400);
      await store.setPassword(user.role, await hashPassword(next));
      await store.deleteOtherSessions(user.role, hash(sessionToken(req)));
      await store.clearAttempts(['password:' + user.role]);
      return json({ok: true});
    }
    if (u.pathname === '/api/account/reset') {
      if (user.role !== 'owner') return json({error: 'Only the owner can reset access.'}, 403);
      if (body?.role !== 'viewer') return json({error: 'Only the second person’s password can be reset here.'}, 400);
      const t = randomBytes(32).toString('base64url');
      await store.resetAccount('viewer', hash(t), Date.now() + 7 * 86400000);
      return json({link: u.origin + '/setup?role=viewer&token=' + t});
    }
    return json({error: 'Not found'}, 404);
  }

  async function serve(req, ip) {
    const incoming = new URL(req.url);
    const u = new URL(incoming.pathname + incoming.search, origin || incoming.origin);
    if (u.origin !== incoming.origin) req = new Request(u, req);
    if (u.pathname === '/health') {
      try { await store.ping(); return new Response('ok ' + buildId, {headers: {'Cache-Control': 'no-store'}}); }
      catch { return new Response('database unavailable', {status: 503, headers: {'Cache-Control': 'no-store'}}); }
    }
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.get('origin') !== u.origin) return new Response('Invalid origin', {status: 403});
    if (u.pathname === '/logout' && req.method === 'POST') {
      const t = sessionToken(req); if (t) await store.deleteSession(hash(t));
      return redirect('/login', sessionCookie('', 0));
    }
    if (u.pathname === '/login' || u.pathname === '/setup') {
      const isSetup = u.pathname === '/setup';
      let role = isSetup ? u.searchParams.get('role') : null;
      if (isSetup) {
        // A reset link from Settings replaces the original setup link for that account; the original is never accepted again.
        if (!ROLES.includes(role || '')) return new Response('This setup link is invalid or has already been used.', {status: 403});
        const given = hash(u.searchParams.get('token') || ''), link = await store.getLink(role);
        const linkOk = link ? !link.used && link.expires > Date.now() && safe(given, link.hash) : safe(given, env['SETUP_' + role.toUpperCase() + '_HASH'] || '');
        if (await store.getPassword(role) || !linkOk) return new Response('This setup link is invalid or has already been used.', {status: 403});
      }
      if (req.method === 'GET') return page(isSetup ? 'setup' : 'login');
      if (req.method !== 'POST') return new Response('Method not allowed', {status: 405});
      if (Number(req.headers.get('content-length') || 0) > 4096) return new Response('Too large', {status: 413});
      if (!await attempt(ip)) return new Response('Too many attempts. Try again in 15 minutes.', {status: 429});
      const form = await req.formData(), password = String(form.get('password') || '');
      if (isSetup) {
        if (password.length < 12 || password.length > 256 || password !== form.get('confirm')) return page('setup', 'Use matching passwords of 12–256 characters.');
        if (!await store.completeSetup(role, await hashPassword(password))) return new Response('Setup already completed', {status: 409});
      } else {
        role = String(form.get('role'));
        if (!ROLES.includes(role) || !await attempt('account:' + role, 20)) return page('login', 'Too many attempts on this account. Try again in 15 minutes.');
        const stored = await store.getPassword(role);
        if (password.length > 256 || !stored || !await checkPassword(password, stored)) return page('login', 'Account or password is incorrect.');
      }
      const token = randomBytes(32).toString('base64url');
      await store.newSession(hash(token), role, Date.now() + WEEK, Date.now());
      await store.clearAttempts([ip, 'account:' + role]);
      return redirect('/', sessionCookie(token));
    }
    const t = sessionToken(req), role = t ? await store.sessionRole(hash(t), Date.now()) : null;
    if (!role) return u.pathname.startsWith('/api/') ? reply({error: 'Please sign in.'}, 401) : redirect('/login');
    const user = {role};
    if (u.pathname === '/api/account' || u.pathname.startsWith('/api/account/')) return account(req, u, user);
    if (u.pathname === '/api/backup' && req.method === 'GET') {
      if (role !== 'owner') return reply({error: 'Owner only'}, 403);
      return new Response(JSON.stringify(await store.backup()), {headers: {'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="together-full-backup.json"', 'Cache-Control': 'no-store'}});
    }
    const h = new Headers(req.headers); h.delete(ROLE_HEADER); h.set(ROLE_HEADER, role);
    const response = await worker.fetch(new Request(req, {headers: h}), workerEnv);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store'); headers.set('Referrer-Policy', 'same-origin'); headers.set('X-Frame-Options', 'DENY');
    headers.set('X-Content-Type-Options', 'nosniff'); headers.set('Strict-Transport-Security', 'max-age=31536000');
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'");
    return new Response(response.body, {status: response.status, headers});
  }

  return {
    async handle(req, ip = 'unknown') {
      try { return await serve(req, ip); }
      catch (e) { console.error('Request failed', e instanceof Error ? e.message : 'error'); return new Response('Please try again.', {status: 500}); }
    },
  };
}
