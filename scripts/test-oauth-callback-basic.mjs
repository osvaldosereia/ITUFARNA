import fs from 'node:fs';
import assert from 'node:assert/strict';

const path='supabase/functions/tiktok-shop-oauth-callback/index.ts';
assert.ok(fs.existsSync(path),'callback OAuth básico deve existir');
const code=fs.readFileSync(path,'utf8');

assert.match(code,/Deno\.serve/);
assert.match(code,/req\.method\s*!==\s*['"]GET['"]/);
assert.match(code,/ITUFARNA TikTok Shop OAuth callback pronto/i);
assert.match(code,/searchParams\.get\(['"]code['"]\)/);
assert.match(code,/searchParams\.get\(['"]error['"]\)/);
assert.doesNotMatch(code,/TIKTOK_SHOP_APP_SECRET\s*=\s*['"][^'"]+/);
assert.doesNotMatch(code,/access_token/i);
assert.doesNotMatch(code,/refresh_token/i);
console.log('oauth-callback-basic ok');
