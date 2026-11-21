// Runs the same function Vercel runs (api/index.mjs) as a plain local web server, for the tests.
// Needs `npm install`, `npm run build` and a Postgres in DATABASE_URL. Usage: PORT=4337 node scripts/local-server.mjs
// It trusts the X-Real-IP header, like Vercel's edge does; never expose it to the internet.
import http from 'node:http';
import handler from '../api/index.mjs';
const port = Number(process.env.PORT || 3000);
http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    if (!headers.has('x-real-ip')) headers.set('x-real-ip', req.socket.remoteAddress || '');
    const request = new Request('http://localhost:' + port + req.url, {method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks)});
    const response = await handler.fetch(request);
    const out = {}; response.headers.forEach((v, k) => { if (k !== 'set-cookie') out[k] = v; });
    const cookies = response.headers.getSetCookie(); if (cookies.length) out['set-cookie'] = cookies;
    res.writeHead(response.status, out); res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) { res.writeHead(500); res.end('Local server error'); console.error(e); }
}).listen(port, '127.0.0.1', () => console.log('Together (local test server) on http://localhost:' + port));
