// Turn a /api/backup download into the INITIAL_STATE value the server imports into an EMPTY database.
// Usage: node scripts/backup-to-initial-state.mjs together-full-backup.json > migration/restore-initial-state.json
import fs from 'node:fs';
const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/backup-to-initial-state.mjs <together-full-backup.json>'); process.exit(1); }
const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
const row = (backup.state || []).find(r => r.id === 'household');
if (!row) { console.error('No household state in this backup.'); process.exit(1); }
const model = typeof row.model === 'string' ? JSON.parse(row.model) : row.model;
if (!model || !Array.isArray(model.expenses) || !Array.isArray(model.transactions)) { console.error('Backup model looks invalid.'); process.exit(1); }
process.stdout.write(JSON.stringify({ model, revision: row.revision, updated_at: row.updated_at }));
