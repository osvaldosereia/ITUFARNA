import fs from 'node:fs';
import path from 'node:path';

const startPath = 'supabase/functions/tiktok-shop-oauth-start/index.ts';
const callbackPath = 'supabase/functions/tiktok-shop-oauth-callback/index.ts';
const migrationsDir = 'supabase/migrations';

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
};
const expect = (condition, message) => { if (!condition) fail(message); };

expect(fs.existsSync(startPath), 'OAuth V1 precisa da Edge Function tiktok-shop-oauth-start');
expect(fs.existsSync(callbackPath), 'OAuth V1 precisa manter o callback');

const start = fs.existsSync(startPath) ? fs.readFileSync(startPath, 'utf8') : '';
const callback = fs.existsSync(callbackPath) ? fs.readFileSync(callbackPath, 'utf8') : '';

expect(start.includes('TIKTOK_SHOP_SERVICE_ID'), 'start deve usar service_id server-side');
expect(start.includes('TIKTOK_SHOP_APP_SECRET'), 'start deve assinar state server-side');
expect(start.includes('services.tiktokshop.com/open/authorize'), 'start deve usar autorização seller ROW atual');
expect(/state/i.test(start) && /HMAC|hmac|crypto\.subtle/i.test(start), 'start deve gerar state assinado');

expect(callback.includes('https://auth.tiktok-shops.com/api/v2/token/get'), 'callback deve trocar auth_code pelo token oficial');
expect(callback.includes('authorized_code'), 'callback deve usar grant_type=authorized_code');
expect(callback.includes('TIKTOK_SHOP_APP_KEY'), 'callback deve ler App Key de secret');
expect(callback.includes('TIKTOK_SHOP_APP_SECRET'), 'callback deve ler App Secret de secret');
expect(/user_type[^\n]{0,80}0/.test(callback), 'callback deve aceitar somente seller user_type=0');
expect(callback.includes('/authorization/202309/shops'), 'callback deve consultar lojas autorizadas');
expect(callback.includes('x-tts-access-token'), 'callback deve enviar seller access token no header correto');
expect(/HMAC|hmac|crypto\.subtle/i.test(callback), 'callback deve validar state assinado');
expect(!callback.includes('console.log(token') && !callback.includes('console.log(data)'), 'callback não deve logar token/payload sensível');

let migrationText = '';
if (fs.existsSync(migrationsDir)) {
  for (const name of fs.readdirSync(migrationsDir).filter((n) => n.endsWith('.sql'))) {
    migrationText += `\n${fs.readFileSync(path.join(migrationsDir, name), 'utf8')}`;
  }
}
expect(/create\s+table[\s\S]*tiktok_connection/i.test(migrationText), 'migration deve criar tiktok_connection');
expect(/enable\s+row\s+level\s+security/i.test(migrationText), 'tiktok_connection deve ter RLS');
expect(/access_token/i.test(migrationText) && /refresh_token/i.test(migrationText), 'migration deve armazenar tokens no backend');
expect(/shop_cipher/i.test(migrationText), 'migration deve armazenar shop_cipher');
expect(/revoke[\s\S]*(anon|authenticated)/i.test(migrationText), 'migration deve negar acesso direto público aos tokens');

if (!process.exitCode) console.log('OAuth V1 contract: PASS');
