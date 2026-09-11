# ITUFARNA

Controle financeiro profissional do TikTok Shop para um único vendedor, com foco em reconciliação de pedidos, SKUs, taxas, descontos, statements e pagamentos.

## Arquitetura

- Código: este repositório.
- Banco e Edge Functions: projeto Supabase `ssbesxgaijknwsjbsbcz`.
- Integração externa: somente TikTok Shop Open API oficial.
- Segredos: somente Supabase Edge Function Secrets; nunca no GitHub ou navegador.

## OAuth TikTok Shop

Redirect URL planejada:

`https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/tiktok-shop-oauth-callback`

A função será pública apenas para receber o redirecionamento do TikTok e fará validação própria de `state`, `code`, escopos e `user_type=0`.

## Segredos esperados

- `TIKTOK_SHOP_APP_KEY`
- `TIKTOK_SHOP_APP_SECRET`
- `TIKTOK_TOKEN_ENCRYPTION_KEY_B64`
- `TIKTOK_SELLER_AUTHORIZATION_URL`

Use `.env.example` apenas como referência de nomes. Nunca grave valores reais no repositório.

## Documentação

- Design: `docs/superpowers/specs/2026-09-11-itufarna-tiktok-finance-design.md`
- Plano OAuth: `docs/superpowers/plans/2026-09-11-tiktok-oauth-bootstrap.md`
