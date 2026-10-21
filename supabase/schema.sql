-- Run in the Supabase SQL editor.
-- Replace his@example.com with his real email (the only account allowed to read).

create table if not exists messages (
  id uuid primary key,
  created_at timestamptz not null default now(),
  body text not null check (char_length(body) between 1 and 20000),
  mood text,
  starred boolean not null default false
);

alter table messages enable row level security;

-- She writes without logging in (anon key). Insert only, never read.
create policy "anyone can leave a message" on messages
  for insert to anon with check (starred = false);

-- Only he can read and star.
create policy "he reads" on messages
  for select to authenticated
  using ((auth.jwt() ->> 'email') = 'his@example.com');

create policy "he stars" on messages
  for update to authenticated
  using ((auth.jwt() ->> 'email') = 'his@example.com')
  with check ((auth.jwt() ->> 'email') = 'his@example.com');
