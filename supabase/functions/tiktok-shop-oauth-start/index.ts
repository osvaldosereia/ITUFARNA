import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const encoder = new TextEncoder();
const STATE_TTL_SECONDS = 10 * 60;

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

async function createState(secret: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(18)));
  const payload = `${timestamp}.${nonce}`;
  const signature = base64Url(await hmac(secret, payload));
  return `${payload}.${signature}`;
}

function text(message: string, status = 200) {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") {
    return new Response("Método não permitido", {
      status: 405,
      headers: { allow: "GET", "cache-control": "no-store" },
    });
  }

  const serviceId = Deno.env.get("TIKTOK_SHOP_SERVICE_ID")?.trim();
  const appSecret = Deno.env.get("TIKTOK_SHOP_APP_SECRET")?.trim();

  if (!serviceId || !appSecret) {
    return text("ITUFARNA OAuth V1 ainda não possui as credenciais TikTok configuradas no Supabase.", 503);
  }

  const state = await createState(appSecret);
  const authorizeUrl = new URL("https://services.tiktokshop.com/open/authorize");
  authorizeUrl.searchParams.set("service_id", serviceId);
  authorizeUrl.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      location: authorizeUrl.toString(),
      "cache-control": "no-store",
      "x-itufarna-state-ttl": String(STATE_TTL_SECONDS),
    },
  });
});
