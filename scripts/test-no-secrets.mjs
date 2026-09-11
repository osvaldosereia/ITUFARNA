import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

for (const required of ['.gitignore','.env.example','deno.json','supabase/config.toml','.github/workflows/test.yml','README.md']) {
  assert.ok(fs.existsSync(required),`arquivo obrigatório ausente: ${required}`);
}

const banned = [
  /TTP_[A-Za-z0-9_-]{12,}/,
  /sb_secret_[A-Za-z0-9_-]{12,}/,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^<\s]/,
  /TIKTOK_SHOP_APP_SECRET\s*=\s*[^<\s]/,
];
const skipDirs = new Set(['.git','node_modules','coverage']);
function walk(dir='.') {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    if (entry.isDirectory() && skipDirs.has(entry.name)) return [];
    const p=path.join(dir,entry.name);
    return entry.isDirectory()?walk(p):[p];
  });
}
for (const file of walk()) {
  const text=fs.readFileSync(file,'utf8');
  for (const pattern of banned) assert.doesNotMatch(text,pattern,`secret pattern in ${file}`);
}
console.log('no-secrets ok');
