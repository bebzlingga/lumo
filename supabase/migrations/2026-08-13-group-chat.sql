-- ---------------------------------------------------------------------------
-- GROUP CHAT
--
-- One table. A group already has everything a conversation needs around it — a
-- roster, an owner, a membership function — so the messages are the only thing
-- missing, and they are deliberately the plainest rows in the schema: who, what,
-- when, and which group.
--
-- WHAT IS NOT HERE, AND WHY
--
-- No `edited_at`. An edited message in a group is a message the others may have
-- already read and answered; the honest form of a correction is another message.
--
-- No read receipts. They would need a row per member per message — the largest
-- table in the app by an order of magnitude — to tell somebody something they
-- learn anyway when the reply arrives. Unread COUNTS are a client concern: each
-- device remembers when it last looked and counts what is newer.
--
-- No attachments. A photo needs storage, a bucket policy, a thumbnailer and a
-- moderation answer; text needs none of those. It can be added without touching
-- what is here.
--
-- SAFE TO RUN TWICE: every policy is dropped first and the publication statement
-- is guarded.
-- ---------------------------------------------------------------------------

create table if not exists group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  author uuid not null references profiles(id) on delete cascade,
  /**
   * The message. Bounded in the DATABASE rather than only in the input, because
   * the limit protects the table and the input only protects the typist: 2000
   * characters is a long note and far short of anything that would make a list of
   * these expensive to read.
   *
   * Trimmed empty is rejected here as well — an empty bubble is a rendering bug
   * somebody has to explain.
   */
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table group_messages enable row level security;

-- The index the chat screen actually reads by: newest first within one group.
create index if not exists group_messages_group_idx
  on group_messages (group_id, created_at desc);

-- Members read the group's messages. `is_group_member` is the same function every
-- other group table is gated on, so joining a group opens its history and leaving
-- closes it — without this table having an opinion of its own about membership.
drop policy if exists "members read group messages" on group_messages;
create policy "members read group messages"
  on group_messages for select to authenticated
  using (is_group_member(group_id));

/**
 * A member writes as themselves, and nobody else.
 *
 * `author = auth.uid()` and `is_group_member` are both required: the first stops a
 * message being posted in somebody else's name, the second stops a stranger with
 * a group id posting into a conversation they are not in.
 *
 * NOT gated on `has_active_subscription()`, unlike `group_reactions`. Being in a
 * group is what needs Plus; once somebody is in one, being unable to answer the
 * people they are walking with would be a strange thing to sell.
 */
drop policy if exists "members post as self" on group_messages;
create policy "members post as self"
  on group_messages for insert to authenticated
  with check (author = auth.uid() and is_group_member(group_id));

-- Authors delete their own. No update policy at all: see the note on `edited_at`.
drop policy if exists "authors delete own messages" on group_messages;
create policy "authors delete own messages"
  on group_messages for delete to authenticated
  using (author = auth.uid());

-- Live, which for a chat is not a nicety: a message that waits for a refresh is
-- not a conversation.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'group_messages'
  ) then
    alter publication supabase_realtime add table group_messages;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- REPLIES
--
-- A message may answer another one. `on delete set null` rather than cascade: if
-- somebody deletes a message that was replied to, the replies are still what
-- people said and must not vanish with it — they simply stop quoting. The screen
-- reads a null target as "no quote to draw".
--
-- No depth limit and no thread table. A reply to a reply is still one row pointing
-- at another, and the screen quotes exactly one level — which is what a group chat
-- needs and the ceiling that keeps a bubble a bubble.
-- ---------------------------------------------------------------------------
alter table group_messages
  add column if not exists reply_to uuid references group_messages(id) on delete set null;

-- ---------------------------------------------------------------------------
-- VERIFY. Expected: 1 table, 3 policies, 1 publication row.
-- ---------------------------------------------------------------------------
-- select tablename from pg_tables where tablename = 'group_messages';
-- select policyname from pg_policies where tablename = 'group_messages';
-- select tablename from pg_publication_tables
--  where pubname = 'supabase_realtime' and tablename = 'group_messages';
