import { handleApi } from './api.mjs';
// BUILD_ASSETS
export default {async fetch(request,env){const path=new URL(request.url).pathname;if(path.startsWith('/api/'))return handleApi(request,env,seed);const key=path==='/'?'index.html':path.slice(1);if(!Object.hasOwn(assets,key))return new Response('Not found',{status:404});const type=key.endsWith('.html')?'text/html':key.endsWith('.js')?'text/javascript':'text/plain';return new Response(assets[key],{headers:{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}})}};
