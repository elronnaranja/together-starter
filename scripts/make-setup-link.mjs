// Makes the one-time setup links for the two accounts.
// Usage: node scripts/make-setup-link.mjs https://your-app.up.railway.app
// It prints two links (keep them private) and two hashes. Put the hashes in Railway as
// SETUP_OWNER_HASH and SETUP_VIEWER_HASH. The server only stores the hashes, never the links.
import {randomBytes, createHash} from 'node:crypto';
const origin = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\/[^/]+$/.test(origin)) { console.error('Usage: node scripts/make-setup-link.mjs https://your-app.up.railway.app'); process.exit(1); }
const out = {};
for (const role of ['owner', 'viewer']) {
  const token = randomBytes(32).toString('base64url');
  out[role] = {link: `${origin}/setup?role=${role}&token=${token}`, hash: createHash('sha256').update(token).digest('hex')};
}
console.log(`
Railway variables (service > Variables):
  SETUP_OWNER_HASH=${out.owner.hash}
  SETUP_VIEWER_HASH=${out.viewer.hash}

Private links (each works once; open after the variables are saved and the app has redeployed):
  Owner (full access):          ${out.owner.link}
  Second person (money in/out): ${out.viewer.link}

Do not commit or post these links. If one leaks before it is used, run this again and replace both variables.
`);
