-- ---------------------------------------------------------------------------
-- MOVE: SHARED WALKS — the outstanding half of the Move invitation work.
--
-- Run this whole file. It is the same content as the last two blocks of
-- `schema.sql`, rewritten to be SAFE TO RUN TWICE: every policy is dropped
-- before it is created, every table and column is `if not exists`, and the two
-- publication statements are guarded by a lookup. Nothing here is destructive —
-- no table is dropped and no row is touched.
--
-- WHAT IT FIXES
-- Walk invitations do not work without it. `move_walk_invites` needs three new
-- columns; the app selects `status` and reads `session_id`, and PostgREST fails
-- the whole query when a column is missing — so the invite list comes back empty
-- and no card ever appears. And with no `move_walk_sessions` table there is
-- nothing to join, so an invitation cannot carry a walk to share.
--
-- HOW TO CHECK IT WORKED
-- The verification queries are at the foot of this file.
-- ---------------------------------------------------------------------------

-- 1 ── The shared walk itself -------------------------------------------------

create table if not exists move_walk_sessions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references profiles(id) on delete cascade,
  activity_type text not null default 'walk',
  started_at timestamptz not null default now(),
  -- Stamped when the owner finishes. Sessions are not deleted: a joiner's device
  -- may still be publishing its last distance, and a row that vanishes underneath
  -- it turns a finished walk into an error.
  ended_at timestamptz
);

alter table move_walk_sessions enable row level security;

create table if not exists move_walk_participants (
  session_id uuid not null references move_walk_sessions(id) on delete cascade,
  member uuid not null references profiles(id) on delete cascade,
  -- Metres this member has covered on THIS walk, upserted as it runs. One row per
  -- member, so a device publishing every ten seconds writes the same row rather
  -- than adding to it.
  distance_m double precision not null default 0 check (distance_m >= 0),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (session_id, member)
);

alter table move_walk_participants enable row level security;

create index if not exists move_walk_participants_session_idx
  on move_walk_participants (session_id);

-- 2 ── The invite grows a session, an answer, and a timestamp ----------------
--
-- Added rather than rebuilt: the table is already live, and an invite sent before
-- this migration stays readable — `session_id` is null on it, which the app reads
-- as "nothing to join", exactly what that row meant.

alter table move_walk_invites
  add column if not exists session_id uuid references move_walk_sessions(id) on delete cascade;

alter table move_walk_invites
  add column if not exists status text not null default 'pending';

alter table move_walk_invites
  add column if not exists responded_at timestamptz;

-- Separate from the column so a re-run does not trip over an existing constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'move_walk_invites_status_check'
  ) then
    alter table move_walk_invites
      add constraint move_walk_invites_status_check
      check (status in ('pending', 'accepted', 'declined'));
  end if;
end
$$;

-- 3 ── Policies ---------------------------------------------------------------

-- The invitee answers their own invite. Accepting also writes a participant row,
-- which is governed separately below — so a status of 'accepted' on its own puts
-- nobody on a walk.
drop policy if exists "recipient answers walk invite" on move_walk_invites;
create policy "recipient answers walk invite"
  on move_walk_invites for update to authenticated
  using (recipient = auth.uid()) with check (recipient = auth.uid());

-- A session is visible to its owner, to everyone on it, and to anyone holding an
-- invite to it — the last one is what lets a card describe the walk before it has
-- been joined.
drop policy if exists "read sessions you are part of" on move_walk_sessions;
create policy "read sessions you are part of"
  on move_walk_sessions for select to authenticated
  using (
    owner = auth.uid()
    or exists (select 1 from move_walk_participants p where p.session_id = id and p.member = auth.uid())
    or exists (select 1 from move_walk_invites i where i.session_id = id and i.recipient = auth.uid())
  );

/**
 * Opening one is not gated by a subscription, and closing it is the owner's.
 *
 * No `has_active_subscription()` here, unlike `move_challenges`: this is an
 * ordinary walk. The paid feature is the INVITING — which happens through
 * `move_walk_invites`, whose insert policy is where the company gate belongs —
 * and a session with nobody else on it is just a walk somebody recorded.
 */
drop policy if exists "own walk sessions" on move_walk_sessions;
create policy "own walk sessions"
  on move_walk_sessions for insert to authenticated
  with check (owner = auth.uid());

drop policy if exists "owner updates walk session" on move_walk_sessions;
create policy "owner updates walk session"
  on move_walk_sessions for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

-- Everyone on a session sees everyone else on it. This is the read that makes
-- "you are both out" true on both phones.
drop policy if exists "participants read each other on a walk" on move_walk_participants;
create policy "participants read each other on a walk"
  on move_walk_participants for select to authenticated
  using (exists (select 1 from move_walk_participants mine where mine.session_id = session_id and mine.member = auth.uid()));

/**
 * You may only write your OWN row, and only onto a session you were asked to.
 *
 * The second half is what stops a patched client walking into a stranger's
 * session with an id: an insert has to be either your own session or one you hold
 * an invite to. Note it does not check the invite's STATUS — accepting is exactly
 * the act of writing this row, so requiring 'accepted' first would be a rule that
 * has to be satisfied before it can be satisfied.
 */
drop policy if exists "write own walk participation" on move_walk_participants;
create policy "write own walk participation"
  on move_walk_participants for all to authenticated
  using (member = auth.uid())
  with check (
    member = auth.uid()
    and (
      exists (select 1 from move_walk_sessions s where s.id = session_id and s.owner = auth.uid())
      or exists (select 1 from move_walk_invites i where i.session_id = session_id and i.recipient = auth.uid())
    )
  );

-- 4 ── Realtime ---------------------------------------------------------------
--
-- `add table` errors if the table is already a member, so both are guarded. The
-- participants table carries a joiner's distance as it is covered; the sessions
-- table is how the other phone hears a walk END, which is what takes a finished
-- walk's invitation off the Move tab without waiting for a refresh.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'move_walk_participants'
  ) then
    alter publication supabase_realtime add table move_walk_participants;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'move_walk_sessions'
  ) then
    alter publication supabase_realtime add table move_walk_sessions;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- VERIFY. Expected: 2 rows, then 3 rows, then 6 rows, then 2 rows.
-- ---------------------------------------------------------------------------
-- select tablename from pg_tables
--  where tablename in ('move_walk_sessions', 'move_walk_participants');
--
-- select column_name from information_schema.columns
--  where table_name = 'move_walk_invites'
--    and column_name in ('session_id', 'status', 'responded_at');
--
-- select tablename, policyname from pg_policies
--  where tablename in ('move_walk_sessions', 'move_walk_participants')
--     or policyname = 'recipient answers walk invite';
--
-- select tablename from pg_publication_tables
--  where pubname = 'supabase_realtime'
--    and tablename in ('move_walk_participants', 'move_walk_sessions');

-- ---------------------------------------------------------------------------
-- 5 ── LIVE CHALLENGE ROSTERS (added after the above; run it too)
--
-- `move_challenge_participants` carries each member's metres, and it was not
-- published — so a teammate joining, or their distance landing, was only ever
-- seen by the next 30-second poll. On a walk somebody is taking right now, half a
-- minute of a frozen number is the difference between "we are out together" and
-- "this is broken".
--
-- The poll stays as the floor. A socket that drops is invisible, and the failure
-- mode of trusting only the socket is a number that silently stops moving.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'move_challenge_participants'
  ) then
    alter publication supabase_realtime add table move_challenge_participants;
  end if;
end
$$;
