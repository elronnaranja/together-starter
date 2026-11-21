// Starts a throwaway local Postgres for the tests and loads supabase/schema.sql, the same file users run in Supabase.
// Needs the Postgres programs (initdb, pg_ctl, psql) on PATH, for example from Homebrew (`brew install postgresql`).
// It also creates Supabase's public roles (anon, authenticated) so the tests can prove they cannot read anything.
import {spawn, spawnSync, execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';

export function startPostgres(port) {
  const env = {...process.env, LC_ALL: 'C'}; // Postgres on macOS refuses to start without a valid locale.
  const dir = mkdtempSync(tmpdir() + '/together-pg-');
  if (spawnSync('initdb', ['--version']).status !== 0) throw Error('These tests need a local Postgres (initdb, pg_ctl, psql on PATH).');
  execFileSync('initdb', ['-D', dir + '/data', '-U', 'postgres', '-A', 'trust', '--no-sync'], {stdio: 'ignore', env});
  execFileSync('pg_ctl', ['-D', dir + '/data', '-l', dir + '/log', '-w', '-o', `-p ${port} -k ${dir} -c listen_addresses=127.0.0.1 -c fsync=off`, 'start'], {stdio: 'ignore', env});
  const psql = (db, args, opts = {}) => execFileSync('psql', ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', ...args], {stdio: ['ignore', 'pipe', 'pipe'], env, ...opts}).toString();
  psql('postgres', ['-c', 'create role anon nologin; create role authenticated nologin;']);
  const createDb = name => { psql('postgres', ['-c', `create database ${name}`]); psql(name, ['-f', 'supabase/schema.sql']); return `postgres://postgres@127.0.0.1:${port}/${name}`; };
  return {
    url: createDb('together'),
    createDb,
    psql,
    stop() { spawnSync('pg_ctl', ['-D', dir + '/data', '-m', 'immediate', 'stop'], {stdio: 'ignore', env}); rmSync(dir, {recursive: true, force: true}); },
  };
}

export function startServer(port, env) {
  return spawn('node', ['scripts/local-server.mjs'], {env: {...process.env, PORT: String(port), DATABASE_SSL: 'off', ...env}, stdio: ['ignore', 'pipe', 'inherit']});
}
