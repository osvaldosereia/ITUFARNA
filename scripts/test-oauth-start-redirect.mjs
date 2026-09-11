import fs from 'node:fs';
import assert from 'node:assert/strict';

const path = 'supabase/functions/tiktok-shop-oauth-start/index.ts';
assert.ok(fs.existsSync(path), 'OAuth start function must exist');
const code = fs.readFileSync(path, 'utf8');

// Response.redirect() returns a response whose headers are immutable in Fetch runtimes.
// The start endpoint must construct the 302 response with headers in the constructor.
assert.doesNotMatch(
  code,
  /Response\.redirect\([\s\S]*?headers\.set\(/,
  'OAuth start must not mutate headers on a Response.redirect() response',
);

assert.match(code, /status\s*:\s*302/);
assert.match(code, /location\s*:/i);
console.log('oauth-start-redirect ok');
