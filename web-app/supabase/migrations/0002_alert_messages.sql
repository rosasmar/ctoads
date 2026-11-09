-- Every alert a holder sends, for the daily limit and to look into abuse. Like
-- alert_subscribers, only the server reads or writes it.
create table alert_messages (
  id bigint generated always as identity primary key,
  account_id text not null,
  text text not null,
  recipients integer not null,
  created_at timestamptz not null default now()
);

create index alert_messages_account_created on alert_messages (account_id, created_at);

alter table alert_messages enable row level security;
