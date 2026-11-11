-- Holders' public profiles at ctoads.xyz/@handle: a handle, a short bio and a few links.
-- Like the alerts tables, only the server reads or writes it; the page gets it through /api/profile.
create table profiles (
  account_id text primary key,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  bio text not null default '' check (char_length(bio) <= 160),
  -- [{ "label": "GitHub", "url": "https://github.com/..." }], at most 6, checked by the server.
  links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;
