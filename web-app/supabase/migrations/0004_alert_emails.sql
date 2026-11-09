-- Email alerts. A subscriber can have a phone number, a verified email, or both, and picks which
-- of them alerts go to.
alter table alert_subscribers alter column phone drop not null;
alter table alert_subscribers add column email text unique;
alter table alert_subscribers
  add column channels text not null default 'text' check (channels in ('text', 'email', 'both'));

-- The pending code for an email being verified, one per account. Only its hash is stored.
create table alert_email_codes (
  account_id text primary key,
  email text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null
);

alter table alert_email_codes enable row level security;
