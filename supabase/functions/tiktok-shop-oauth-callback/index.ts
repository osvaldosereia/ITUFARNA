import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const encoder = new TextEncoder();
const STATE_TTL_SECONDS = 10 * 60;
const TIKTOK_TOKEN_URL = "https://auth.tiktok-shops.com/api/v2/token/get";
const TIKTOK_API_BASE = "https://open-api.tiktokglobalshop.com";
const AUTHORIZED_SHOPS_PATH = "/authorization/202309/shops";

const html = (title: string, message: string, status = 200) =>
  new Response(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    body{font-family:Arial,sans-serif;background:#f7f8fa;color:#202124;margin:0;padding:32px}
    main{max-width:620px;margin:10vh auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px}
    h1{font-size:24px;margin:0 0 12px}p{font-size:16px;line-height:1.5;margin:0}
  </style>
</head>
<body><main><h1>${title}</h1><p>${message}</p></main></body>
</html>`, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function validState(state: string, secret: string) {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [timestampText, nonce, signatureText] = parts;
  const timestamp = Number(timestampText);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(timestamp) || !nonce || timestamp > now + 60 || now - timestamp > STATE_TTL_SECONDS) return false;

  let supplied: Uint8Array;
  try {
    supplied = decodeBase64Url(signatureText);
  } catch {
    return false;
  }
  const expected = await hmac(secret, `${timestampText}.${nonce}`);
  return constantTimeEqual(supplied, expected);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signTikTokGet(appSecret: string, path: string, appKey: string, timestamp: string) {
  const sorted = `app_key${appKey}timestamp${timestamp}`;
  const message = `${appSecret}${path}${sorted}${appSecret}`;
  return bytesToHex(await hmac(appSecret, message));
}

function normalizeScopes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function getSupabaseAdminKey() {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys);
      if (typeof parsed.default === "string" && parsed.default) return { key: parsed.default, legacy: false };
    } catch {
      // Fall through to the legacy service role key when present.
    }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  return legacy ? { key: legacy, legacy: true } : null;
}

async function persistConnection(payload: Record<string, unknown>) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const admin = getSupabaseAdminKey();
  if (!supabaseUrl || !admin) throw new Error("supabase_backend_not_configured");

  const headers: Record<string, string> = {
    apikey: admin.key,
    "content-type": "application/json",
    prefer: "resolution=merge-duplicates,return=minimal",
  };
  if (admin.legacy) headers.authorization = `Bearer ${admin.key}`;

  const response = await fetch(`${supabaseUrl}/rest/v1/tiktok_connection?on_conflict=id`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`connection_persist_failed_${response.status}`);
}

async function exchangeToken(appKey: string, appSecret: string, authCode: string) {
  const url = new URL(TIKTOK_TOKEN_URL);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("app_secret", appSecret);
  url.searchParams.set("auth_code", authCode);
  url.searchParams.set("grant_type", "authorized_code");

  const response = await fetch(url, { headers: { accept: "application/json" } });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.code !== 0 || !body.data) throw new Error("token_exchange_failed");
  if (Number(body.data.user_type) !== 0) throw new Error("seller_token_required_user_type_0");
  if (!body.data.access_token || !body.data.refresh_token || !body.data.open_id) throw new Error("token_response_incomplete");
  return { data: body.data, requestId: String(body.request_id || "") };
}

async function getAuthorizedShop(appKey: string, appSecret: string, accessToken: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign = await signTikTokGet(appSecret, AUTHORIZED_SHOPS_PATH, appKey, timestamp);
  const url = new URL(`${TIKTOK_API_BASE}${AUTHORIZED_SHOPS_PATH}`);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("timestamp", timestamp);
  url.searchParams.set("sign", sign);

  const response = await fetch(url, {
    headers: {
      "content-type": "application/json",
      "x-tts-access-token": accessToken,
    },
  });
  const body = await response.json().catch(() => null);
  const shops = body?.data?.shops;
  if (!response.ok || !body || body.code !== 0 || !Array.isArray(shops)) throw new Error("authorized_shops_failed");
  if (shops.length !== 1) throw new Error(shops.length === 0 ? "no_authorized_shop" : "multiple_shops_not_supported_v1");
  return shops[0];
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") {
    return new Response("Método não permitido", {
      status: 405,
      headers: { allow: "GET", "cache-control": "no-store" },
    });
  }

  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (error) {
    return html("Autorização TikTok não concluída", "O TikTok retornou a autorização como cancelada ou recusada. Nenhuma conexão foi criada.", 400);
  }

  if (!code) {
    return html("ITUFARNA TikTok Shop OAuth callback pronto", "Este endereço está ativo. Para conectar a loja, inicie pelo endpoint tiktok-shop-oauth-start.");
  }

  const appKey = Deno.env.get("TIKTOK_SHOP_APP_KEY")?.trim();
  const appSecret = Deno.env.get("TIKTOK_SHOP_APP_SECRET")?.trim();
  if (!appKey || !appSecret) {
    return html("Configuração incompleta", "Cadastre App Key e App Secret do TikTok nos Secrets do Supabase antes de autorizar a loja.", 503);
  }

  if (!state || !(await validState(state, appSecret))) {
    return html("Autorização inválida", "O state da autorização é inválido ou expirou. Inicie a conexão novamente.", 400);
  }

  try {
    const token = await exchangeToken(appKey, appSecret, code);
    const data = token.data;
    const shop = await getAuthorizedShop(appKey, appSecret, String(data.access_token));

    const accessExpires = Number(data.access_token_expire_in);
    const refreshExpires = Number(data.refresh_token_expire_in);
    if (!Number.isFinite(accessExpires) || !Number.isFinite(refreshExpires)) throw new Error("token_expiry_invalid");

    await persistConnection({
      id: 1,
      open_id: String(data.open_id),
      seller_name: data.seller_name ? String(data.seller_name) : null,
      seller_base_region: data.seller_base_region ? String(data.seller_base_region) : null,
      user_type: 0,
      granted_scopes: normalizeScopes(data.granted_scopes),
      access_token: String(data.access_token),
      refresh_token: String(data.refresh_token),
      access_token_expires_at: new Date(accessExpires * 1000).toISOString(),
      refresh_token_expires_at: new Date(refreshExpires * 1000).toISOString(),
      shop_id: shop.id ? String(shop.id) : null,
      shop_code: shop.code ? String(shop.code) : null,
      shop_cipher: shop.cipher ? String(shop.cipher) : null,
      shop_name: shop.name ? String(shop.name) : null,
      shop_region: shop.region ? String(shop.region) : null,
      seller_type: shop.seller_type ? String(shop.seller_type) : null,
      token_request_id: token.requestId || null,
      authorized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return html("TikTok Shop conectado", `A loja ${shop.name ? String(shop.name) : "autorizada"} foi conectada ao ITUFARNA com sucesso.`);
  } catch (err) {
    const code = err instanceof Error ? err.message : "oauth_failed";
    const known: Record<string, string> = {
      token_exchange_failed: "O TikTok não aceitou o código de autorização. Gere uma nova autorização.",
      seller_token_required_user_type_0: "A autorização recebida não pertence a um vendedor TikTok Shop.",
      token_response_incomplete: "A resposta de autorização do TikTok veio incompleta.",
      authorized_shops_failed: "Não foi possível confirmar a loja autorizada no TikTok Shop.",
      no_authorized_shop: "Nenhuma loja autorizada foi retornada pelo TikTok Shop.",
      multiple_shops_not_supported_v1: "A V1 aceita somente uma loja. Foram retornadas várias lojas autorizadas.",
      token_expiry_invalid: "O TikTok retornou uma validade de token inválida.",
      supabase_backend_not_configured: "O backend Supabase não está configurado para salvar a conexão.",
    };
    return html("Não foi possível concluir a conexão", known[code] || "A conexão falhou com segurança. Nenhum token foi exibido.", 502);
  }
});
