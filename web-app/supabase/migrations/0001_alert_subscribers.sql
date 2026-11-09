-- One alert subscription per NEAR account. Only the web app's server reads and writes this
-- table, with the service role key, so row level security is on with no policies: the public
-- anon key can't see any phone number.
create table alert_subscribers (
  account_id text primary key,
  phone text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table alert_subscribers enable row level security;
