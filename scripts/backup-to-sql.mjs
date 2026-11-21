// Turns a full backup (together-full-backup.json from /api/backup) into SQL you paste into the Supabase SQL Editor
// of a NEW, EMPTY project, after supabase/schema.sql. It refuses to run on a project that already has a budget.
// Usage: node scripts/backup-to-sql.mjs together-full-backup.json > restore.sql
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {validModel} from '../worker/api.mjs';
const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/backup-to-sql.mjs <together-full-backup.json> > restore.sql'); process.exit(1); }
const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
const row = (backup.state || []).find(r => r.id === 'household');
if (!row) { console.error('No household state in this backup.'); process.exit(1); }
const model = typeof row.model === 'string' ? JSON.parse(row.model) : row.model;
if (!validModel(model)) { console.error('Backup model looks invalid.'); process.exit(1); }
const history = (backup.history || []).filter(h => Number.isInteger(h.revision) && typeof h.model === 'string' && typeof h.saved_at === 'string');
const tag = '$r' + randomBytes(8).toString('hex') + '$';
const text = v => { const s = String(v); if (s.includes(tag)) throw Error('Unexpected text in backup'); return tag + s + tag; };
const int = v => { if (!Number.isInteger(v) || v < 0) throw Error('Invalid revision in backup'); return String(v); };
const out = ['-- Together restore. Run supabase/schema.sql first, in a new, empty project.', 'begin;',
  "do $check$ begin if exists (select 1 from together.household_state) then raise exception 'This project already has a budget. Restore only into a new, empty Supabase project.'; end if; end $check$;",
  `insert into together.household_state (id, model, revision, updated_at) values ('household', ${text(JSON.stringify(model))}, ${int(row.revision)}, ${text(row.updated_at)});`];
for (const h of history) out.push(`insert into together.household_revision (revision, model, saved_at) values (${int(h.revision)}, ${text(h.model)}, ${text(h.saved_at)});`);
out.push('commit;');
process.stdout.write(out.join('\n') + '\n');
