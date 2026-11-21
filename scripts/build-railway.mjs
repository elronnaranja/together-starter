import fs from 'node:fs';
let worker=fs.readFileSync('dist/server/index.js','utf8').replace('export default {async fetch','const worker = {async fetch');
import {execSync} from 'node:child_process';
const build=(()=>{try{return execSync('git rev-parse --short HEAD',{stdio:['ignore','pipe','ignore']}).toString().trim()+(execSync('git status --porcelain -- web worker scripts',{stdio:['ignore','pipe','ignore']}).toString().trim()?'-dirty':'')}catch{return 'unknown'}})();
const runtime=fs.readFileSync('scripts/railway-runtime.ts','utf8').replace('// INSERT_WORKER',()=>worker).replace('BUILD_ID_VALUE',()=>build);
fs.writeFileSync('dist/server.ts',runtime);
console.log('Built dist/server.ts (run it with: bun dist/server.ts)');
