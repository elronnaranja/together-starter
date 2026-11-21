-- Together: run this once in your Supabase project (SQL Editor > New query > paste > Run).
-- Everything goes in a private schema called "together". It is not exposed by Supabase's Data API,
-- row level security is on with no policies, and the public "anon" and "authenticated" roles get no access.
-- Only the server (connecting with your database password through DATABASE_URL) can read or write it.
-- Safe to run again: it never deletes anything.

create schema if not exists together;

create table if not exists together.household_state (
  id text primary key,
  model text not null,
  revision integer not null default 0,
  updated_at text not null
);
create table if not exists together.household_revision (
  id bigint generated always as identity primary key,
  revision integer not null,
  model text not null,
  saved_at text not null
);
create table if not exists together.users (
  role text primary key check (role in ('owner', 'viewer')),
  password text not null
);
create table if not exists together.sessions (
  token text primary key,
  role text not null,
  expires bigint not null
);
create table if not exists together.attempts (
  key text primary key,
  count integer not null,
  expires bigint not null
);
create table if not exists together.setup_links (
  role text primary key,
  hash text not null,
  expires bigint not null,
  used boolean not null default false
);

alter table together.household_state enable row level security;
alter table together.household_revision enable row level security;
alter table together.users enable row level security;
alter table together.sessions enable row level security;
alter table together.attempts enable row level security;
alter table together.setup_links enable row level security;

revoke all on schema together from public, anon, authenticated;
revoke all on all tables in schema together from public, anon, authenticated;
revoke all on all sequences in schema together from public, anon, authenticated;
