-- Top-ups started by text (TOPUP 10 USDC): the deposit address 1Click gave, so we can text the
-- number back when the NEAR arrives and answer STATUS. Like the other tables, only the server
-- reads or writes these.

create table text_topups (
  deposit_address text primary key,
  phone text not null,
  account_id text not null,
  -- What to send, as it was texted back, e.g. "10 USDC on Base".
  label text not null,
  created_at timestamptz not null default now(),
  -- When we texted the outcome (arrived, refunded or failed), so it's only texted once.
  done_at timestamptz
);

create index text_topups_phone_created on text_topups (phone, created_at desc);

alter table text_topups enable row level security;
