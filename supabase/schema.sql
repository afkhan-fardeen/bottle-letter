-- Run the whole file in the Supabase SQL editor. Safe to re-run.
-- Reader/sender (him): afkhan.fardeen@gmail.com
-- After this, run supabase/secret.sql (kept out of git) to set her key.

create extension if not exists pgcrypto;

-- ---------- her -> him ----------

create table if not exists messages (
  id uuid primary key,
  created_at timestamptz not null default now(),
  body text not null check (char_length(body) between 1 and 20000),
  mood text,
  starred boolean not null default false
);
alter table messages enable row level security;

-- Her device no longer inserts directly; it calls leave_message() with her key.
drop policy if exists "anyone can leave a message" on messages;
drop policy if exists "he reads" on messages;
drop policy if exists "he stars" on messages;

create policy "he reads" on messages for select to authenticated
  using ((auth.jwt() ->> 'email') = 'afkhan.fardeen@gmail.com');
create policy "he stars" on messages for update to authenticated
  using ((auth.jwt() ->> 'email') = 'afkhan.fardeen@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'afkhan.fardeen@gmail.com');

-- ---------- her key (no policies = unreachable from the API) ----------

create table if not exists app_secret (
  id int primary key default 1 check (id = 1),
  her_key text not null
);
alter table app_secret enable row level security;

create or replace function check_key(k text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from app_secret where her_key = k) then
    raise exception 'forbidden';
  end if;
end $$;

create or replace function leave_message(k text, p_id uuid, p_body text, p_mood text, p_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform check_key(k);
  insert into messages (id, created_at, body, mood)
  values (p_id, least(p_at, now()), p_body, p_mood)
  on conflict (id) do nothing;
end $$;

-- ---------- him -> her: gone 69 minutes after she opens it ----------

create table if not exists replies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  body text not null check (char_length(body) between 1 and 20000),
  opened_at timestamptz
);
alter table replies enable row level security;

drop policy if exists "he sees live replies" on replies;
drop policy if exists "he sends replies" on replies;
drop policy if exists "he unsends" on replies;

-- Expired rows are invisible even before the purge removes them.
create policy "he sees live replies" on replies for select to authenticated
  using ((auth.jwt() ->> 'email') = 'afkhan.fardeen@gmail.com'
         and (opened_at is null or opened_at > now() - interval '69 minutes'));
create policy "he sends replies" on replies for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'afkhan.fardeen@gmail.com' and opened_at is null);
create policy "he unsends" on replies for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'afkhan.fardeen@gmail.com');

create or replace function purge_replies() returns void
language sql security definer set search_path = public as $$
  delete from replies where opened_at is not null and opened_at <= now() - interval '69 minutes';
$$;

-- What she can see before opening: that something is there, never the text.
create or replace function her_replies(k text)
returns table (id uuid, created_at timestamptz, opened_at timestamptz, body text)
language plpgsql security definer set search_path = public as $$
begin
  perform check_key(k);
  perform purge_replies();
  return query
    select r.id, r.created_at, r.opened_at, case when r.opened_at is not null then r.body end
    from replies r order by r.created_at;
end $$;

create or replace function open_reply(k text, p_id uuid)
returns table (id uuid, created_at timestamptz, opened_at timestamptz, body text)
language plpgsql security definer set search_path = public as $$
begin
  perform check_key(k);
  perform purge_replies();
  update replies r set opened_at = coalesce(r.opened_at, now()) where r.id = p_id;
  return query select r.id, r.created_at, r.opened_at, r.body from replies r where r.id = p_id;
end $$;

revoke all on function check_key(text), purge_replies() from public, anon, authenticated;
revoke all on function leave_message(text, uuid, text, text, timestamptz), her_replies(text), open_reply(text, uuid) from public;
grant execute on function leave_message(text, uuid, text, text, timestamptz), her_replies(text), open_reply(text, uuid) to anon, authenticated;

-- Hard-delete on a schedule too (optional; needs pg_cron, ignored if unavailable).
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('purge-replies', '*/5 * * * *', 'select public.purge_replies()');
exception when others then
  raise notice 'pg_cron not available; expired replies are still hidden and purged on next access';
end $$;
