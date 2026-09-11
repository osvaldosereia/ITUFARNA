import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir='supabase/migrations';
const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(name=>/tiktok_oauth_foundation/i.test(name)):[];
assert.ok(files.length===1,'migração TikTok OAuth foundation deve existir exatamente uma vez');
const sql=fs.readFileSync(path.join(dir,files[0]),'utf8');

for (const pattern of [
  /create table if not exists public\.tiktok_connections/i,
  /singleton_key/i,
  /access_token_ciphertext/i,
  /refresh_token_ciphertext/i,
  /granted_scopes/i,
  /create table if not exists public\.tiktok_oauth_states/i,
  /state_hash/i,
  /expires_at/i,
  /used_at/i,
  /alter table public\.tiktok_connections enable row level security/i,
  /alter table public\.tiktok_oauth_states enable row level security/i,
  /revoke all on table public\.tiktok_connections from anon, authenticated/i,
  /revoke all on table public\.tiktok_oauth_states from anon, authenticated/i,
  /grant all on table public\.tiktok_connections to service_role/i,
  /grant all on table public\.tiktok_oauth_states to service_role/i,
]) assert.match(sql,pattern);

assert.doesNotMatch(sql,/create policy/i,'OAuth tables must not expose public RLS policies');
console.log('oauth-schema ok');
