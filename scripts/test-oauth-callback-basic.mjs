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
assert.doesNotMatch(code,/TTP_[A-Za-z0-9_-]{10,}/,'nenhum token real pode estar versionado');
assert.doesNotMatch(code,/console\.(log|info|debug)\([^\n]*(access_token|refresh_token|appSecret)/i,'tokens/secret não podem ser logados');
console.log('oauth-callback-basic ok');
