# ITUFARNA — TikTok Shop Finance Control

Data: 2026-09-11

## Objetivo

Criar um sistema profissional de controle financeiro do TikTok Shop para um único vendedor, com foco em rastreabilidade completa entre pedido, SKU, descontos, taxas, comissões, frete, impostos, ajustes, reembolsos, statements e pagamentos.

O sistema deve permitir responder, para cada item vendido:

- quanto o cliente pagou;
- quais descontos foram financiados pelo vendedor;
- quais descontos/subsídios foram financiados pelo TikTok;
- quais taxas e comissões foram cobradas;
- quais valores de frete, impostos, ajustes e reembolsos afetaram a venda;
- qual foi o valor líquido de liquidação;
- em qual statement a venda entrou;
- em qual pagamento/payout ela foi efetivamente liquidada;
- se existe diferença entre pedido, transação, statement e pagamento.

## Escopo inicial

- Um único vendedor TikTok Shop.
- Mercado inicial: Brasil.
- Mesmo projeto Supabase já existente, mas schema/tabelas próprias com prefixo `tiktok_`.
- Código isolado no repositório GitHub `osvaldosereia/ITUFARNA`.
- Sem dependência do repositório Dona Antônia.
- Sem Make.
- Sem segredos no GitHub ou no navegador.

## Fontes oficiais TikTok Shop

A integração usará apenas TikTok Shop Open API oficial.

Escopos mínimos:

- `seller.authorization.info` — obter lojas autorizadas e `shop_cipher`;
- `seller.finance.info` — acessar transações e valores de settlement/reconciliação financeira.

O sistema deve usar a versão mais nova suportada de cada endpoint no momento da implementação. A versão do endpoint ficará isolada em configuração server-side para facilitar futuras migrações.

Endpoints funcionais previstos:

- OAuth / Get Access Token;
- Refresh Access Token;
- Get Authorized Shops;
- Get Transactions by Order;
- Get Statements;
- Get Transactions by Statement;
- Get Unsettled Transactions quando aplicável;
- Get Payments;
- endpoints de pedidos necessários para relacionar order_id, SKU e dados comerciais.

## Arquitetura

### GitHub

Repositório: `ITUFARNA`.

Responsabilidades:

- documentação;
- código das Edge Functions do módulo TikTok;
- interface administrativa/financeira;
- testes;
- migrations SQL versionadas.

O repositório é público. Portanto é proibido versionar:

- App Secret;
- access token;
- refresh token;
- chaves secretas do Supabase;
- dados bancários reais;
- payloads de produção contendo dados pessoais.

### Supabase

Usar o projeto Supabase já existente.

Responsabilidades:

- armazenamento persistente;
- segredos server-side;
- OAuth callback;
- chamadas assinadas à API do TikTok;
- atualização e rotação de tokens;
- importação/sincronização;
- reconciliação financeira;
- API interna para a interface ITUFARNA.

Todas as tabelas do módulo ficarão com RLS habilitado. O navegador nunca receberá `service_role`, App Secret ou tokens TikTok.

## OAuth e conexão da loja

### Redirect URL

URL oficial da aplicação:

`https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/tiktok-shop-oauth-callback`

### Fluxo

1. Gerar `state` criptograficamente aleatório no servidor.
2. Salvar hash/expiração do `state` antes da autorização.
3. Abrir a URL de autorização TikTok.
4. TikTok redireciona para o callback com `code` e `state`.
5. Callback valida `state` e rejeita replay/expiração.
6. Trocar `code` por `access_token` e `refresh_token` imediatamente.
7. Validar retorno do token e garantir `user_type = 0` (seller).
8. Persistir `granted_scopes`.
9. Chamar Get Authorized Shops.
10. Para a primeira versão, exigir exatamente uma loja ativa ou selecionar automaticamente a única loja retornada.
11. Persistir `shop_id`, `shop_cipher`, região e metadados mínimos.
12. Marcar conexão como ativa.

Tokens nunca são exibidos na interface.

## Segredos

Armazenar como secrets/environment server-side do Supabase:

- `TIKTOK_SHOP_APP_KEY`;
- `TIKTOK_SHOP_APP_SECRET`;
- outros segredos necessários para assinatura/criptografia.

Tokens do vendedor ficam armazenados no banco somente em estrutura privada não acessível a `anon` ou `authenticated` diretamente.

## Modelo de dados

### `tiktok_connection`

Uma linha ativa para o vendedor inicial.

Campos mínimos:

- `id`;
- `open_id`;
- `user_type`;
- `shop_id`;
- `shop_cipher`;
- `shop_name`;
- `region`;
- `granted_scopes`;
- `access_token_encrypted` ou armazenamento equivalente protegido;
- `refresh_token_encrypted` ou armazenamento equivalente protegido;
- `access_token_expires_at`;
- `refresh_token_expires_at`;
- `status`;
- `authorized_at`;
- `last_refresh_at`;
- `last_sync_at`;
- timestamps.

### `tiktok_oauth_states`

Uso temporário e de segurança.

- `state_hash`;
- `expires_at`;
- `used_at`;
- `created_at`.

States usados/expirados devem ser descartados periodicamente.

### `tiktok_orders`

Snapshot do pedido TikTok.

- `order_id`;
- status;
- create/update timestamps TikTok;
- moeda;
- valores comerciais relevantes;
- buyer/shipping somente se estritamente necessário para reconciliação;
- `raw_hash` para auditoria de mudanças;
- `last_synced_at`.

Evitar persistir dados pessoais que não sejam necessários ao objetivo financeiro.

### `tiktok_order_items`

Uma linha por SKU/item do pedido.

- `order_id`;
- `sku_id`;
- `seller_sku`;
- nome snapshot;
- quantidade;
- preço bruto;
- descontos conhecidos;
- moeda;
- identificadores necessários à reconciliação.

### `tiktok_order_transactions`

Fonte financeira detalhada por pedido/SKU.

Persistir campos da API oficial sem achatar prematuramente informações financeiras importantes.

Categorias lógicas:

- vendas;
- seller discounts;
- TikTok discounts/subsidies;
- fees;
- commissions;
- shipping;
- taxes;
- adjustments;
- refunds;
- settlement/net amount.

Armazenar também o payload bruto normalizado em JSONB para auditoria e compatibilidade com novos campos da API.

### `tiktok_statements`

- statement id;
- período/data;
- status de pagamento;
- settlement amount;
- currency;
- totais disponíveis na API;
- timestamps.

### `tiktok_statement_transactions`

Relaciona cada transação detalhada ao statement correspondente.

### `tiktok_payments`

Representa pagamentos/payouts efetivamente processados.

- payment id;
- status;
- amount;
- settlement_amount;
- currency;
- paid_time;
- informações bancárias somente no nível estritamente necessário para conferência;
- campos de câmbio quando aplicável;
- versão da API de origem.

### `tiktok_sync_runs`

Auditoria de todas as sincronizações.

- tipo de sync;
- início/fim;
- cursor/período;
- registros lidos/criados/alterados;
- status;
- erro sanitizado;
- retry count.

## Reconciliação financeira

A unidade fundamental de auditoria será:

`pedido -> SKU -> transações -> statement -> payment`

O sistema não deve calcular o líquido somente pela diferença `venda - taxas`. Sempre deve guardar os componentes oficiais retornados pelo TikTok e calcular uma visão derivada auditável.

Para cada SKU/pedido, produzir:

- receita bruta;
- descontos do vendedor;
- descontos/subsídios TikTok;
- reembolsos;
- comissões;
- demais fees;
- frete e ajustes;
- impostos quando retornados;
- settlement esperado;
- settlement informado pelo TikTok;
- diferença calculada;
- statement;
- status de pagamento;
- pagamento efetivo associado.

Diferenças acima de tolerância monetária configurável devem gerar `reconciliation_status = divergent`.

## Sincronização

### Inicial

Após OAuth:

1. validar loja;
2. buscar pedidos dentro da janela máxima suportada e necessária;
3. buscar transações financeiras por pedido;
4. importar statements;
5. importar transações de statements;
6. importar payments;
7. executar reconciliação.

### Incremental

A primeira versão pode rodar por rotina agendada em intervalos moderados, respeitando rate limits e evitando custo desnecessário.

Estratégia:

- pedidos recentes com janela sobreposta para capturar alterações tardias;
- statements por data/status;
- payments por create/paid time;
- transações financeiras reconsultadas quando pedido/statement mudar;
- operações idempotentes com upsert por IDs oficiais TikTok.

Nenhum job deve duplicar transações ou sobrescrever histórico sem rastreabilidade.

## Tokens e renovação

- Nunca aguardar o access token expirar para só então reagir.
- Refresh preventivo antes da expiração.
- Após refresh, atualizar token, expiração e `granted_scopes` de forma atômica.
- Se refresh falhar por revogação, marcar conexão como `reauthorization_required`.
- Nunca apagar tokens anteriores antes de confirmar persistência segura do novo conjunto.

## Assinatura das APIs

Todas as chamadas TikTok serão assinadas server-side conforme algoritmo oficial.

Criar um único módulo de cliente TikTok responsável por:

- parâmetros comuns;
- versão/endpoint;
- timestamp;
- assinatura;
- token header;
- shop_cipher;
- paginação;
- retries controlados;
- normalização de erros;
- observabilidade.

Nenhuma Edge Function específica deve implementar assinatura manual duplicada.

## Interface ITUFARNA

A primeira interface deve ser simples e focada em auditoria.

### Painel

- vendas brutas;
- descontos vendedor;
- descontos/subsídios TikTok;
- comissões;
- outras taxas;
- reembolsos;
- líquido previsto;
- líquido informado pelo TikTok;
- total pago;
- total ainda não liquidado;
- divergências.

### Vendas

Uma linha por pedido, expansível até SKU.

Campos prioritários:

- pedido;
- data;
- SKU/produto;
- bruto;
- descontos;
- taxas;
- líquido;
- statement;
- pagamento;
- status da reconciliação.

### Pedido detalhado

Mostrar toda a composição financeira sem esconder linhas:

- cada fee;
- cada discount;
- cada refund;
- cada adjustment;
- origem do valor;
- valor TikTok;
- valor calculado;
- diferença.

### Statements

Lista de statements, valores e status pago/não pago.

### Pagamentos

Lista de payouts/pagamentos com valor e data efetiva.

### Divergências

Fila separada para casos em que os números não fecham.

## Auditoria e precisão

Regras obrigatórias:

- valores monetários persistidos como `numeric`, nunca float para cálculo financeiro;
- moeda persistida junto com o valor;
- IDs oficiais TikTok como chaves únicas quando possível;
- payload financeiro bruto mantido para auditoria;
- `source_api_version` em entidades financeiras;
- timestamps originais TikTok preservados;
- upserts idempotentes;
- logs sem tokens ou dados sensíveis;
- nenhuma exclusão silenciosa de histórico financeiro.

## Segurança

- RLS habilitado nas tabelas expostas;
- tabelas de tokens sem acesso público;
- service role somente server-side;
- callback OAuth com validação de `state` e proteção contra replay;
- App Secret somente em secret server-side;
- tokens nunca logados;
- payloads de erro sanitizados;
- minimização de PII;
- rate limit em endpoints próprios quando necessário.

## Estágio de desenvolvimento TikTok

Enquanto o app estiver em Development, lojas reais podem não conseguir autorizar. Para teste, usar Development Shop/test account conforme o Partner Center. O sistema deve estar preparado para receber a autorização real assim que o app estiver em estágio elegível.

## Primeira entrega técnica

A implementação será dividida em fases:

1. Bootstrap profissional do repositório ITUFARNA e CI.
2. Migrations das tabelas privadas TikTok.
3. Secrets necessários no Supabase.
4. OAuth state endpoint + callback.
5. Troca e refresh de tokens.
6. Get Authorized Shops e persistência do `shop_cipher`.
7. Cliente TikTok centralizado com assinatura.
8. Health/status da conexão.
9. Importador de pedidos.
10. Importador Finance API.
11. Statements e Payments.
12. Motor de reconciliação.
13. Interface financeira.
14. Testes com Development Shop.
15. Autorização da loja real e backfill.

## Critérios de aceite da conexão OAuth

- Redirect URL responde por HTTPS;
- `state` inválido/expirado é rejeitado;
- callback sem `code` não cria conexão;
- seller token exige `user_type = 0`;
- tokens não aparecem em response/log;
- `granted_scopes` persistido;
- loja autorizada e `shop_cipher` persistidos;
- refresh testado;
- conexão pode ser marcada como revogada/reauthorization_required;
- nenhum secret presente no GitHub.

## Critérios de aceite financeiro

- cada pedido pode ser rastreado até seus SKUs;
- cada SKU pode ser rastreado até componentes financeiros oficiais;
- cada statement pode ser rastreado até suas transações;
- cada payment pode ser relacionado aos settlements correspondentes quando a API fornecer os vínculos necessários;
- sistema distingue valor calculado, valor informado pelo TikTok e valor efetivamente pago;
- divergências são explícitas;
- reimportar o mesmo período não duplica registros;
- a origem e versão da API de cada dado financeiro são auditáveis.
