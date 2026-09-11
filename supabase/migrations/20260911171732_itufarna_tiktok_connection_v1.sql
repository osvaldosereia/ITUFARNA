create table public.tiktok_connection (
  id smallint primary key default 1 check (id = 1),
  open_id text not null,
  seller_name text,
  seller_base_region text,
  user_type smallint not null check (user_type = 0),
  granted_scopes text[] not null default '{}',
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz not null,
  shop_id text,
  shop_code text,
  shop_cipher text,
  shop_name text,
  shop_region text,
  seller_type text,
  token_request_id text,
  authorized_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tiktok_connection enable row level security;
revoke all on table public.tiktok_connection from anon, authenticated;
