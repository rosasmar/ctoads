-- Text commands: a holder links their phone to their account by texting a code to the app's
-- number, then can text commands like "set x @name" or "buy 1". Like the other tables, only the
-- server reads or writes these.

-- One row per account: a pending code (only its hash, for 15 minutes) until the number texts it,
-- then the linked number.
create table text_numbers (
  account_id text primary key,
  phone text unique,
  code_hash text unique,
  code_expires_at timestamptz,
  linked_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Every text received, so a redelivered webhook isn't handled twice, and to limit how many
-- replies a number gets.
create table text_commands (
  message_id text primary key,
  phone text not null,
  command text not null,
  created_at timestamptz not null default now()
);

create index text_commands_phone_created on text_commands (phone, created_at);

alter table text_numbers enable row level security;
alter table text_commands enable row level security;
