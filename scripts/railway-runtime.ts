import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
// INSERT_WORKER
const BUILD_ID=(Bun.env.RAILWAY_GIT_COMMIT_SHA||'').slice(0,7)||'BUILD_ID_VALUE';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const safe=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const dir=Bun.env.DATA_DIR||'/data'; mkdirSync(dir,{recursive:true});
const sql=new Database(dir+'/together.sqlite',{create:true});
sql.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
sql.exec(`CREATE TABLE IF NOT EXISTS household_state(id TEXT PRIMARY KEY,model TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS household_revision(id INTEGER PRIMARY KEY AUTOINCREMENT,revision INTEGER NOT NULL,model TEXT NOT NULL,saved_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(role TEXT PRIMARY KEY,password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,role TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS setup_links(role TEXT PRIMARY KEY,hash TEXT NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);`);
// An empty database starts as an empty budget, or from INITIAL_STATE when restoring a backup (see README).
if(!sql.query('SELECT id FROM household_state LIMIT 1').get()){
 if(Bun.env.INITIAL_STATE){const state=JSON.parse(Bun.env.INITIAL_STATE);if(!validModel(state.model))throw Error('Invalid restore data in INITIAL_STATE');
  sql.query('INSERT INTO household_state VALUES(?,?,?,?)').run('household',JSON.stringify(state.model),state.revision,state.updated_at);console.log('Restored budget from INITIAL_STATE');}
 else sql.query('INSERT INTO household_state VALUES(?,?,?,?)').run('household',JSON.stringify(seed),0,new Date().toISOString());
}
if(!Bun.env.APP_ORIGIN)console.warn('APP_ORIGIN is not set. Set it to your public address, for example https://your-app.up.railway.app, or saving will fail behind the proxy.');
if(!Bun.env.SETUP_OWNER_HASH)console.warn('SETUP_OWNER_HASH is not set. Make a setup link with: node scripts/make-setup-link.mjs <your address>');
const DB={prepare(q:string){return{bind(...v:any[]){return{async first(){return sql.query(q).get(...v)||null},async run(){return{meta:{changes:sql.query(q).run(...v).changes}}}}}}},async batch(ss:any[]){sql.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of ss)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
function page(mode:string,error=''){return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Together · Household budget</title><style>body{margin:0;background:#f7f8f4;color:#263b32;font:16px system-ui;display:grid;min-height:100vh;place-items:center}main{width:min(360px,80vw);padding:36px;background:white;border-radius:24px;box-shadow:0 10px 50px #183e3010}h1{font-size:34px;margin:0}p{color:#68766f;line-height:1.5}label{display:block;margin:20px 0 8px}input,select,button{box-sizing:border-box;width:100%;padding:14px;border:1px solid #dce2d9;border-radius:10px;font:inherit}button{background:#355c47;color:white;border:0;margin-top:24px;cursor:pointer}.error{color:#a13131}</style><main><h1>together</h1><p>${mode==='setup'?'Set your private password to open your household budget.':'A little clarity, every day. Sign in to your private household budget.'}</p>${error?'<p class="error">'+error+'</p>':''}<form method="post">${mode==='setup'?'':'<label for="role">Account</label><select id="role" name="role"><option value="owner">Owner · Full access</option><option value="viewer">Second person · Money in and out</option></select>'}<label for="password">${mode==='setup'?'New password (at least 12 characters)':'Password'}</label><input id="password" name="password" type="password" autocomplete="${mode==='setup'?'new-password':'current-password'}" ${mode==='setup'?'minlength="12"':''} maxlength="256" required>${mode==='setup'?'<label for="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="256" required>':''}<button>${mode==='setup'?'Set password & open Together':'Sign in'}</button></form></main></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'strict-origin','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"}})}
const redirect=(path:string,cookie?:string)=>new Response(null,{status:303,headers:{Location:path,...(cookie?{'Set-Cookie':cookie}:{}),'Cache-Control':'no-store'}});
const sessionCookie=(token:string,age=604800)=>`together_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
function session(req:Request){const t=(req.headers.get('cookie')||'').match(/(?:^|;\s*)together_session=([^;]+)/)?.[1];return t?sql.query('SELECT role FROM sessions WHERE token=? AND expires>?').get(hash(t),Date.now()) as {role:'owner'|'viewer'}|null:null}
function throttle(key:string,max=8){const now=Date.now();const row=sql.query('SELECT count,expires FROM attempts WHERE key=?').get(key) as any;if(row&&row.expires>now&&row.count>=max)return false;sql.query('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END').run(key,now+900000,now,now);return true}
async function serve(req:Request,ip:string){const incoming=new URL(req.url);const u=new URL(incoming.pathname+incoming.search,Bun.env.APP_ORIGIN||incoming.origin);if(u.origin!==incoming.origin)req=new Request(u,req);if(u.pathname==='/health'){try{sql.query('SELECT 1').get();return new Response('ok '+BUILD_ID,{headers:{'Cache-Control':'no-store'}})}catch{return new Response('database unavailable',{status:503})}}
 if(!['GET','HEAD'].includes(req.method)&&req.headers.get('origin')!==u.origin)return new Response('Invalid origin',{status:403});
 if(u.pathname==='/logout'&&req.method==='POST'){const t=(req.headers.get('cookie')||'').match(/together_session=([^;]+)/)?.[1];if(t)sql.query('DELETE FROM sessions WHERE token=?').run(hash(t));return redirect('/login',sessionCookie('',0))}
 if(u.pathname==='/login'||u.pathname==='/setup'){
  let role=u.pathname==='/setup'?u.searchParams.get('role'):null;
  if(u.pathname==='/setup'){
   // A reset link from Settings replaces the original setup link for that account; the original one is never accepted again.
   const given=hash(u.searchParams.get('token')||''),link=['owner','viewer'].includes(role||'')?sql.query('SELECT hash,expires,used FROM setup_links WHERE role=?').get(role) as any:null;
   const linkOk=link?!link.used&&link.expires>Date.now()&&safe(given,link.hash):safe(given,Bun.env['SETUP_'+(role||'').toUpperCase()+'_HASH']||'');
   if(!['owner','viewer'].includes(role||'')||sql.query('SELECT role FROM users WHERE role=?').get(role)||!linkOk)return new Response('This setup link is invalid or has already been used.',{status:403});
  }
  if(req.method==='GET')return page(u.pathname==='/setup'?'setup':'login');
  if(req.method!=='POST')return new Response('Method not allowed',{status:405});
  if(Number(req.headers.get('content-length')||0)>4096)return new Response('Too large',{status:413});
  if(!throttle(ip))return new Response('Too many attempts. Try again in 15 minutes.',{status:429});
  const form=await req.formData();const password=String(form.get('password')||'');
  if(u.pathname==='/setup'){
   if(password.length<12||password.length>256||password!==form.get('confirm'))return page('setup','Use matching passwords of 12–256 characters.');
   const pw=await Bun.password.hash(password,{algorithm:'argon2id',memoryCost:19456,timeCost:2});
   const created=sql.query('INSERT OR IGNORE INTO users VALUES(?,?)').run(role,pw);if(!created.changes)return new Response('Setup already completed',{status:409});sql.query('UPDATE setup_links SET used=1 WHERE role=?').run(role);
  }else{
   role=String(form.get('role'));if(!['owner','viewer'].includes(role)||!throttle('account:'+role,20))return page('login','Too many attempts on this account. Try again in 15 minutes.');const user=sql.query('SELECT password FROM users WHERE role=?').get(role) as any;
   if(password.length>256||!user||!await Bun.password.verify(password,user.password))return page('login','Account or password is incorrect.');
  }
  const token=randomBytes(32).toString('base64url');sql.query('DELETE FROM sessions WHERE expires<?').run(Date.now());sql.query('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),role,Date.now()+604800000);sql.query('DELETE FROM attempts WHERE key IN (?,?)').run(ip,'account:'+role);return redirect('/',sessionCookie(token));
 }
 const user=session(req);if(!user)return u.pathname.startsWith('/api/')?reply({error:'Please sign in.'},401):redirect('/login');
 if(u.pathname==='/api/account'||u.pathname.startsWith('/api/account/'))return account(req,u,user);
 if(u.pathname==='/api/backup'&&req.method==='GET'){if(user.role!=='owner')return reply({error:'Owner only'},403);return new Response(JSON.stringify({state:sql.query('SELECT * FROM household_state').all(),history:sql.query('SELECT * FROM household_revision ORDER BY id').all()}),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="together-full-backup.json"','Cache-Control':'no-store'}})}
 const h=new Headers(req.headers);h.delete(ROLE_HEADER);h.set(ROLE_HEADER,user.role);
 const response=await worker.fetch(new Request(req,{headers:h}),{DB});const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('Referrer-Policy','same-origin');headers.set('X-Frame-Options','DENY');headers.set('X-Content-Type-Options','nosniff');headers.set('Strict-Transport-Security','max-age=31536000');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'");return new Response(response.body,{status:response.status,headers});
}
// Display names come from the household settings the owner saved; accounts stay two fixed roles.
function people(){let st:any={};try{st=JSON.parse((sql.query('SELECT model FROM household_state WHERE id=?').get('household') as any)?.model||'{}').settings||{}}catch{}return[{role:'owner',name:st.ownerName||'Owner',access:'Full access'},{role:'viewer',name:st.partnerName||'Second person',access:'Money in and out'}]}
const sessionToken=(req:Request)=>(req.headers.get('cookie')||'').match(/(?:^|;\s*)together_session=([^;]+)/)?.[1]||'';
async function account(req:Request,u:URL,user:{role:'owner'|'viewer'}){
 const json=(d:any,status=200)=>new Response(JSON.stringify(d),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(u.pathname==='/api/account'&&req.method==='GET'){const now=Date.now();const list=people();return json({role:user.role,name:list.find(p=>p.role===user.role)!.name,people:user.role!=='owner'?[]:list.map(p=>{const link=sql.query('SELECT expires,used FROM setup_links WHERE role=?').get(p.role) as any;return{...p,hasPassword:!!sql.query('SELECT role FROM users WHERE role=?').get(p.role),linkPending:!!link&&!link.used&&link.expires>now}})})}
 if(req.method!=='POST')return json({error:'Not found'},404);
 if(Number(req.headers.get('content-length')||0)>4096)return json({error:'Too large'},413);
 let body:any;try{body=await req.json()}catch{return json({error:'Invalid request'},400)}
 if(u.pathname==='/api/account/password'){
  if(!throttle('password:'+user.role))return json({error:'Too many attempts. Try again in 15 minutes.'},429);
  const current=String(body?.current||''),next=String(body?.next||''),row=sql.query('SELECT password FROM users WHERE role=?').get(user.role) as any;
  if(current.length>256||!row||!await Bun.password.verify(current,row.password))return json({error:'Your current password is incorrect.'},400);
  if(next.length<12||next.length>256)return json({error:'Use a new password of 12 to 256 characters.'},400);
  sql.query('UPDATE users SET password=? WHERE role=?').run(await Bun.password.hash(next,{algorithm:'argon2id',memoryCost:19456,timeCost:2}),user.role);
  sql.query('DELETE FROM sessions WHERE role=? AND token<>?').run(user.role,hash(sessionToken(req)));sql.query('DELETE FROM attempts WHERE key=?').run('password:'+user.role);
  return json({ok:true})}
 if(u.pathname==='/api/account/reset'){
  if(user.role!=='owner')return json({error:'Only the owner can reset access.'},403);
  if(body?.role!=='viewer')return json({error:'Only the second person’s password can be reset here.'},400);
  const t=randomBytes(32).toString('base64url');sql.exec('BEGIN IMMEDIATE');
  try{sql.query('DELETE FROM users WHERE role=?').run('viewer');sql.query('DELETE FROM sessions WHERE role=?').run('viewer');sql.query('INSERT INTO setup_links VALUES(?,?,?,0) ON CONFLICT(role) DO UPDATE SET hash=excluded.hash,expires=excluded.expires,used=0').run('viewer',hash(t),Date.now()+7*86400000);sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}
  return json({link:u.origin+'/setup?role=viewer&token='+t})}
 return json({error:'Not found'},404)}
const server=Bun.serve({port:Number(Bun.env.PORT||3000),hostname:'0.0.0.0',maxRequestBodySize:2100000,async fetch(req,server){try{return await serve(req,(req.headers.get('x-real-ip')||'').trim()||server.requestIP(req)?.address||'unknown')}catch(e){console.error('Request failed',e instanceof Error?e.message:'error');return new Response('Please try again.',{status:500})}}});
console.log('Together listening on '+server.port);
