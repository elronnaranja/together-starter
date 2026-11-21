// Runs the real Vercel function (api/index.mjs, through scripts/local-server.mjs) on a throwaway local Postgres
// loaded with supabase/schema.sql, and checks it end to end. Needs `npm install` and the Postgres programs
// (initdb, pg_ctl, psql). Run with: npm run test:integration
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {startPostgres,startServer} from './local-postgres.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const dir=mkdtempSync(tmpdir()+'/together-test-'),base='http://localhost:4337',publicOrigin='https://together.example';
const pg=startPostgres(54337);
const run=(url,extra={})=>startServer(4337,{APP_ORIGIN:publicOrigin,DATABASE_URL:url,SETUP_OWNER_HASH:hash('test-owner'),SETUP_VIEWER_HASH:hash('test-viewer'),...extra});
async function waitUp(){for(let i=0;i<150;i++){try{if((await fetch(base+'/health')).ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw Error('Server did not start')}
let child;
async function start(){child=run(pg.url);await waitUp()}
const today=new Date().toISOString().slice(0,10);
const household={setupDone:true,householdName:'Test home',ownerName:'Sam',partnerName:'Alex',currency:'$',openingBalance:1000,openingDate:today,timeZone:'UTC'};
const request=(path,opts={})=>fetch(base+path,{redirect:'manual',...opts});
async function setup(role){const path='/setup?role='+role+'&token=test-'+role;let r=await request(path);assert.equal(r.status,200);r=await request(path,{method:'POST',headers:{Origin:publicOrigin},body:new URLSearchParams({password:'test-password-123!',confirm:'test-password-123!'})});assert.equal(r.status,303);const cookie=r.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.equal((await request(path)).status,403);return cookie.split(';')[0]}
try{
 await start();assert.equal((await request('/api/state',{headers:{'x-together-role':'owner'}})).status,401,'a forged role header is ignored');
 const loginPage=await(await request('/login')).text();assert.match(loginPage,/Owner · Full access/);
 const owner=await setup('owner'),viewer=await setup('viewer');
 // Empty start: no bills, no entries, setup not done.
 const state=await(await request('/api/state',{headers:{Cookie:owner}})).json();assert.equal(state.revision,0);assert.deepEqual(state.model.expenses,[]);assert.deepEqual(state.model.transactions,[]);assert.equal(state.model.settings.setupDone,false);
 const ownerPut=(revision,m,origin=publicOrigin)=>request('/api/state',{method:'PUT',headers:{Cookie:owner,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({revision,model:m})});
 const viewerPut=(revision,m)=>request('/api/state',{method:'PUT',headers:{Cookie:viewer,Origin:publicOrigin,'Content-Type':'application/json'},body:JSON.stringify({revision,model:m})});
 const setUp=structuredClone(state.model);setUp.settings=household;
 assert.equal((await viewerPut(0,setUp)).status,403,'only the owner finishes setup');
 let r=await ownerPut(0,setUp);assert.equal(r.status,200);assert.equal((await r.json()).revision,1);
 const model=structuredClone(setUp);model.expenses.push({id:'rent',name:'Rent',kind:'scheduled',amount:1200,frequency:'monthly',start:today,end:'',notes:'',active:true});model.transactions.push({id:'pay1',type:'in',name:'Salary',amount:500,date:today});
 assert.equal((await ownerPut(1,model,'https://evil.example')).status,403);
 r=await ownerPut(1,model);assert.equal(r.status,200);assert.equal((await r.json()).revision,2);
 assert.equal((await ownerPut(1,model)).status,409);
 for(const change of [m=>{m.expenses[0].amount+=1},m=>{m.goal.extra+=1},m=>{m.overrides.test={amount:1}},m=>{m.transactions.pop()},m=>{m.settings.openingBalance=5},m=>{m.settings.partnerName='Changed'}]){const m=structuredClone(model);change(m);assert.equal((await viewerPut(2,m)).status,403)}
 const entry=structuredClone(model);entry.transactions.push({id:'viewer-test',type:'out',name:'Rent',amount:300,date:today,expenseId:'rent',occurrence:'rent@'+today});
 r=await viewerPut(2,entry);assert.equal(r.status,200);assert.equal((await r.json()).revision,3);assert.equal((await viewerPut(2,entry)).status,409);
 child.kill();await new Promise(r=>child.once('exit',r));await start();
 const after=await(await request('/api/state',{headers:{Cookie:owner}})).json();assert.equal(after.revision,3);assert.deepEqual(after.model,entry);
 const backup=await(await request('/api/backup',{headers:{Cookie:owner}})).json();assert.equal(backup.history.length,3);
 assert.equal((await request('/api/backup',{headers:{Cookie:viewer}})).status,403);
 r=await request('/logout',{method:'POST',headers:{Cookie:owner,Origin:publicOrigin}});assert.equal(r.status,303);assert.equal((await request('/api/state',{headers:{Cookie:owner}})).status,401);
 r=await request('/login',{method:'POST',headers:{Origin:publicOrigin},body:new URLSearchParams({role:'owner',password:'test-password-123!'})});assert.equal(r.status,303);
 // Settings: household settings are owner-only, password change, reset link for the second person.
 const login=async(role,password)=>{const x=await request('/login',{method:'POST',headers:{Origin:publicOrigin},body:new URLSearchParams({role,password})});return x.status===303?x.headers.get('set-cookie').split(';')[0]:null};
 const post=(path,cookie,body,origin=publicOrigin)=>request(path,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const owner2=await login('owner','test-password-123!');const ownerB=await login('owner','test-password-123!');let viewer2=await login('viewer','test-password-123!');assert.ok(owner2&&ownerB&&viewer2);
 const rated=structuredClone(entry);rated.settings={...household,hourlyRate:30};
 assert.equal((await viewerPut(3,rated)).status,403);
 r=await request('/api/state',{method:'PUT',headers:{Cookie:owner2,Origin:publicOrigin,'Content-Type':'application/json'},body:JSON.stringify({revision:3,model:rated})});assert.equal(r.status,200);
 for(const s of [{...household,hourlyRate:-1},{...household,timeZone:'Nowhere/City'},{...household,openingDate:'2026-13-01'},{...household,ownerName:''},{...household,rateUsd:25}]){const bad=structuredClone(rated);bad.settings=s;assert.equal((await request('/api/state',{method:'PUT',headers:{Cookie:owner2,Origin:publicOrigin,'Content-Type':'application/json'},body:JSON.stringify({revision:4,model:bad})})).status,400,JSON.stringify(s))}
 let acct=await(await request('/api/account',{headers:{Cookie:owner2}})).json();assert.equal(acct.name,'Sam');assert.equal(acct.people.length,2);assert.equal(acct.people[1].name,'Alex');assert.equal(acct.people[1].hasPassword,true);
 acct=await(await request('/api/account',{headers:{Cookie:viewer2}})).json();assert.equal(acct.name,'Alex');assert.equal(acct.people.length,0);
 assert.equal((await request('/api/account')).status,401);
 assert.equal((await post('/api/account/password',owner2,{current:'wrong-password-1',next:'new-owner-pass-456'})).status,400);
 assert.equal((await post('/api/account/password',owner2,{current:'test-password-123!',next:'short'})).status,400);
 assert.equal((await post('/api/account/password',owner2,{current:'test-password-123!',next:'new-owner-pass-456'},'https://evil.example')).status,403);
 assert.equal((await post('/api/account/password',owner2,{current:'test-password-123!',next:'new-owner-pass-456'})).status,200);
 assert.equal((await request('/api/state',{headers:{Cookie:owner2}})).status,200);assert.equal((await request('/api/state',{headers:{Cookie:ownerB}})).status,401);
 assert.equal(await login('owner','test-password-123!'),null);assert.ok(await login('owner','new-owner-pass-456'));
 assert.equal((await post('/api/account/reset',viewer2,{role:'viewer'})).status,403);
 assert.equal((await post('/api/account/reset',owner2,{role:'owner'})).status,400);
 r=await post('/api/account/reset',owner2,{role:'viewer'});assert.equal(r.status,200);const link=new URL((await r.json()).link);assert.equal(link.origin,publicOrigin);
 assert.equal((await request('/api/state',{headers:{Cookie:viewer2}})).status,401);assert.equal(await login('viewer','test-password-123!'),null);
 assert.equal((await request('/setup?role=viewer&token=test-viewer')).status,403);
 acct=await(await request('/api/account',{headers:{Cookie:owner2}})).json();assert.equal(acct.people[1].hasPassword,false);assert.equal(acct.people[1].linkPending,true);
 const lp=link.pathname+link.search;assert.equal((await request(lp)).status,200);
 r=await request(lp,{method:'POST',headers:{Origin:publicOrigin},body:new URLSearchParams({password:'second-new-pass-789',confirm:'second-new-pass-789'})});assert.equal(r.status,303);
 assert.equal((await request(lp)).status,403);assert.ok(await login('viewer','second-new-pass-789'));
 acct=await(await request('/api/account',{headers:{Cookie:owner2}})).json();assert.equal(acct.people[1].hasPassword,true);assert.equal(acct.people[1].linkPending,false);
 // Audit fixes: health, headers, strict dates, history limit, per-account login limit, restore drill.
 r=await request('/health');assert.equal(r.status,200);assert.match(await r.text(),/^ok /);
 r=await request('/',{headers:{Cookie:owner2}});assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy')||'',/script-src 'self'/);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.match(r.headers.get('strict-transport-security')||'',/max-age/);
 let cur=await(await request('/api/state',{headers:{Cookie:owner2}})).json();const feb=structuredClone(cur.model);feb.transactions.push({id:'feb31',type:'in',name:'Bad date',amount:1,date:'2026-02-31'});
 assert.equal((await request('/api/state',{method:'PUT',headers:{Cookie:owner2,Origin:publicOrigin,'Content-Type':'application/json'},body:JSON.stringify({revision:cur.revision,model:feb})})).status,400);
 let rev=cur.revision;for(let i=0;i<305;i++){const res=await request('/api/state',{method:'PUT',headers:{Cookie:owner2,Origin:publicOrigin,'Content-Type':'application/json'},body:JSON.stringify({revision:rev,model:cur.model})});assert.equal(res.status,200);rev=(await res.json()).revision}
 const race=await Promise.all([0,1,2].map(()=>request('/api/state',{method:'PUT',headers:{Cookie:owner2,Origin:publicOrigin,'Content-Type':'application/json'},body:JSON.stringify({revision:rev,model:cur.model})})));assert.deepEqual(race.map(x=>x.status).sort(),[200,409,409],'only one of three simultaneous saves wins');
 const big=await(await request('/api/backup',{headers:{Cookie:owner2}})).json();assert.ok(big.history.length<=301,'history kept to about 300, got '+big.history.length);
 for(let i=0;i<20;i++)await request('/login',{method:'POST',headers:{Origin:publicOrigin,'X-Real-IP':'198.51.100.'+i},body:new URLSearchParams({role:'viewer',password:'wrong-password-'+i})});
 r=await request('/login',{method:'POST',headers:{Origin:publicOrigin,'X-Real-IP':'198.51.100.99'},body:new URLSearchParams({role:'viewer',password:'second-new-pass-789'})});assert.equal(r.status,200,'account limit holds even from a new address');
 r=await request('/login',{method:'POST',headers:{Origin:publicOrigin,'X-Real-IP':'203.0.113.7'},body:new URLSearchParams({role:'owner',password:'new-owner-pass-456'})});assert.equal(r.status,303,'the owner is not locked out by guesses at the second account');
 // The public Supabase roles cannot read or change any table, even with the app running.
 for(const role of ['anon','authenticated'])for(const table of ['household_state','household_revision','users','sessions','attempts','setup_links'])assert.throws(()=>pg.psql('together',['-c',`set role ${role}; select * from together.${table}`]),/permission denied/,role+' must not read '+table);
 assert.throws(()=>pg.psql('together',['-c',"set role anon; insert into together.users values ('owner','x')"]),/permission denied/);
 const rls=pg.psql('together',['-At','-c',"select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='together' and c.relkind='r' and c.relrowsecurity"]).trim();assert.equal(rls,'6','row level security on all 6 tables');
 // Restore drill: backup file -> SQL -> a new, empty database -> same budget.
 writeFileSync(dir+'/backup.json',JSON.stringify(big));const restoreSql=execFileSync('node',['scripts/backup-to-sql.mjs',dir+'/backup.json']).toString();writeFileSync(dir+'/restore.sql',restoreSql);
 assert.throws(()=>pg.psql('together',['-f',dir+'/restore.sql']),/already has a budget/,'restore refuses a database that has a budget');
 child.kill();await new Promise(r=>child.once('exit',r));const restoredUrl=pg.createDb('restored');pg.psql('restored',['-f',dir+'/restore.sql']);
 child=run(restoredUrl);await waitUp();
 const restoredOwner=await setup('owner');const restored=await(await request('/api/state',{headers:{Cookie:restoredOwner}})).json();assert.deepEqual(restored.model,JSON.parse(big.state[0].model));assert.equal(restored.revision,big.state[0].revision);
 const restoredBackup=await(await request('/api/backup',{headers:{Cookie:restoredOwner}})).json();assert.equal(restoredBackup.history.length,big.history.length,'saved versions restored too');
 // A database that cannot be reached answers 503 on /health and a calm error page, without crashing.
 child.kill();await new Promise(r=>child.once('exit',r));child=run('postgres://postgres@127.0.0.1:1/none');let down;for(let i=0;i<150&&!down;i++){try{down=await fetch(base+'/health')}catch{await new Promise(r=>setTimeout(r,100))}}assert.equal(down.status,503);assert.equal((await request('/login',{method:'POST',headers:{Origin:publicOrigin},body:new URLSearchParams({role:'owner',password:'x'})})).status,500);
 console.log('PASS: audit fixes (health with build id, security headers, Feb 31 rejected, history capped near 300, simultaneous saves (one wins), per-account login limit, restore from a backup file into a fresh database incl. saved versions, anon/authenticated roles denied on every table, RLS on).');
 console.log('PASS: settings (owner-only household settings, validation, names from settings, password change signs out other sessions, reset link one-time, old setup link refused).');
 console.log('PASS: empty start, first-run setup (owner only), private setup links, login, forged-header rejection, second person entries-only (entry saved; bill, goal, override, settings and removal denied), origin checks, save conflicts, persistent restart, backups, logout.');
}finally{child?.kill();await new Promise(r=>setTimeout(r,200));pg.stop();rmSync(dir,{recursive:true,force:true})}
