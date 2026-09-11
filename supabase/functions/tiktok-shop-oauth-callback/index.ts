import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

Deno.serve((req: Request) => {
  if (req.method !== "GET") {
    return new Response("Método não permitido", {
      status: 405,
      headers: { "allow": "GET", "cache-control": "no-store" },
    });
  }

  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");

  if (error) {
    return html(
      "Autorização TikTok não concluída",
      "O TikTok retornou a autorização como cancelada ou recusada. Nenhuma conexão foi criada.",
      400,
    );
  }

  if (code) {
    return html(
      "Autorização recebida",
      "O TikTok retornou o código de autorização. A troca segura desse código será ativada na próxima etapa do ITUFARNA.",
    );
  }

  return html(
    "ITUFARNA TikTok Shop OAuth callback pronto",
    "Este endereço está ativo e pronto para ser cadastrado como URL de redirecionamento no TikTok Shop Partner Center.",
  );
});
