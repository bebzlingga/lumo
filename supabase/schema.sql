-- Lumo friends schema — paste into the Supabase SQL Editor and run once.
-- Mirrors the types in lib/friends.ts. Every table has row-level security:
-- the anon key ships inside the app, so these policies are the security boundary.
--
-- Prerequisite: enable Anonymous sign-ins under
-- Authentication -> Sign In / Up before using the app against this schema.

-- ---------------------------------------------------------------------------
-- Profiles: one row per user, created on first sign-in.
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  -- Display id, e.g. "LUMO-8F3K-2Q".
  lumo_id text unique not null check (lumo_id ~ '^LUMO-[A-Z0-9]{4}-[A-Z0-9]{2}$'),
  nickname text not null default '',
  -- AvatarConfig JSON from lib/avatar.ts
  avatar jsonb,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Friend-adding works by looking up someone else's Lumo ID, so profiles are
-- readable by any signed-in user. Only the owner can create/update their row.
create policy "profiles readable by signed-in users"
  on profiles for select to authenticated using (true);
create policy "insert own profile"
  on profiles for insert to authenticated with check (auth.uid() = id);
create policy "update own profile"
  on profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Profile emails: kept OUT of profiles on purpose — profiles are readable by
-- every signed-in user (friend lookup), while the recovery email is private.
-- Only the owner can read or write their row.
-- ---------------------------------------------------------------------------
create table profile_emails (
  id uuid primary key references auth.users on delete cascade,
  email text,
  updated_at timestamptz not null default now()
);

alter table profile_emails enable row level security;

create policy "own email only"
  on profile_emails for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Device push tokens (Expo push): one row per device. The push-sending Edge
-- Function reads any user's tokens with the service-role key; the owner can
-- only read/write their own.
-- ---------------------------------------------------------------------------
create table device_tokens (
  token text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null default 'ios' check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

alter table device_tokens enable row level security;

create policy "own device tokens"
  on device_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create index device_tokens_user_idx on device_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Subscription entitlements (Friends + Feature Board, ₱29/month Apple sub).
-- Written ONLY by server-side receipt validation (an Edge Function handling
-- App Store Server Notifications, or a RevenueCat webhook) via the
-- service-role key — deliberately NO insert/update policies for
-- `authenticated`, so a patched client can't grant itself access. Expiry is
-- passive: policies compare expires_at to now().
-- ---------------------------------------------------------------------------
create table entitlements (
  user_id uuid primary key references profiles(id) on delete cascade,
  product_id text not null,
  expires_at timestamptz not null,
  original_transaction_id text unique not null,
  updated_at timestamptz not null default now()
);

alter table entitlements enable row level security;

create policy "read own entitlement"
  on entitlements for select to authenticated using (user_id = auth.uid());

-- Subscription check used by the social tables' write policies.
create function has_active_subscription()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from entitlements where user_id = auth.uid() and expires_at > now());
$$;

-- ---------------------------------------------------------------------------
-- Friendships: one row per request; status flips to accepted.
-- ---------------------------------------------------------------------------
create table friendships (
  requester uuid not null references profiles(id) on delete cascade,
  addressee uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  invited_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

alter table friendships enable row level security;

create policy "own friendships visible"
  on friendships for select to authenticated using (auth.uid() in (requester, addressee));
create policy "send requests as self"
  on friendships for insert to authenticated
  with check (auth.uid() = requester and has_active_subscription());
create policy "addressee responds"
  on friendships for update to authenticated using (auth.uid() = addressee);
-- Either side can unfriend / withdraw / reject.
create policy "either side can remove"
  on friendships for delete to authenticated using (auth.uid() in (requester, addressee));

-- ---------------------------------------------------------------------------
-- Groups: a bundle of shared habits; progress/streak derive from completions.
-- ---------------------------------------------------------------------------
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner uuid not null references profiles(id) on delete cascade,
  -- Optional weekly challenge: total completions the group aims for per week.
  weekly_target int check (weekly_target > 0),
  -- DiceBear "thumbs" seed picked at creation; falls back to the group id.
  avatar_seed text,
  created_at timestamptz not null default now()
);

create table group_members (
  group_id uuid not null references groups(id) on delete cascade,
  member uuid not null references profiles(id) on delete cascade,
  -- Invited members start pending and must accept (from their profile) before
  -- they count as members; the owner's own row is accepted at creation.
  status text not null default 'accepted' check (status in ('pending', 'accepted')),
  joined_at timestamptz not null default now(),
  primary key (group_id, member)
);

-- Full habit definition shared by the group (see GroupHabit in lib/friends.ts).
-- Reminders stay personal, on each member's local copy. The id is client-made
-- text (not a uuid) so it can match the creator's local habit id.
create table group_habits (
  id text primary key,
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  icon text not null,
  -- Hex from the habit color palette (constants/theme.ts); null = theme green.
  color text,
  repeat_schedule jsonb not null,
  goal jsonb not null
);

-- One row per member/habit/day completion tick.
create table group_completions (
  group_id uuid not null references groups(id) on delete cascade,
  habit_id text not null references group_habits(id) on delete cascade,
  member uuid not null references profiles(id) on delete cascade,
  day date not null,
  count int not null default 1 check (count > 0),
  completed_at timestamptz not null default now(),
  primary key (habit_id, member, day)
);

alter table groups enable row level security;
alter table group_members enable row level security;
alter table group_habits enable row level security;
alter table group_completions enable row level security;

-- Membership check used by all group policies — ACCEPTED members only, so
-- pending invitees can't read habits/completions/reactions. SECURITY DEFINER
-- so the check itself doesn't recurse into group_members' own RLS.
create function is_group_member(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from group_members where group_id = gid and member = auth.uid() and status = 'accepted');
$$;

-- Any-status membership: lets a pending invitee read the group's name/avatar
-- for the invitation card (but nothing gated by is_group_member).
create function has_group_membership(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from group_members where group_id = gid and member = auth.uid());
$$;

create policy "members see their groups"
  on groups for select to authenticated using (owner = auth.uid() or has_group_membership(id));
create policy "create groups as self"
  on groups for insert to authenticated
  with check (owner = auth.uid() and has_active_subscription());
create policy "owner manages group"
  on groups for update to authenticated using (owner = auth.uid());
create policy "owner deletes group"
  on groups for delete to authenticated using (owner = auth.uid());

create policy "members see rosters"
  on group_members for select to authenticated
  using (member = auth.uid() or is_group_member(group_id));
-- Owner invites members; members may add themselves when accepting an invite.
create policy "owner adds members"
  on group_members for insert to authenticated
  with check (member = auth.uid() or (select owner from groups where id = group_id) = auth.uid());
-- Invitee accepts by flipping their own row to accepted.
create policy "invitee responds"
  on group_members for update to authenticated
  using (member = auth.uid()) with check (member = auth.uid());
-- Declining an invite is the same delete as leaving.
create policy "leave group or owner removes"
  on group_members for delete to authenticated
  using (member = auth.uid() or (select owner from groups where id = group_id) = auth.uid());

create policy "members read group habits"
  on group_habits for select to authenticated using (is_group_member(group_id));
create policy "owner writes group habits"
  on group_habits for all to authenticated
  using ((select owner from groups where id = group_id) = auth.uid())
  with check ((select owner from groups where id = group_id) = auth.uid());

create policy "members read completions"
  on group_completions for select to authenticated using (is_group_member(group_id));
create policy "log own completions"
  on group_completions for insert to authenticated
  with check (member = auth.uid() and is_group_member(group_id));
create policy "update own completions"
  on group_completions for update to authenticated using (member = auth.uid());
create policy "undo own completions"
  on group_completions for delete to authenticated using (member = auth.uid());

-- ---------------------------------------------------------------------------
-- Group fun: cheers/nudges between members + an optional weekly challenge
-- target per group. Rate limits: nudges are capped at one per sender →
-- recipient per day by a partial unique index; the cheer cap (3/day) is
-- client-side only (soft limit, worst case someone gets extra cheers).
-- ---------------------------------------------------------------------------
-- Already ran the groups block? Apply just this:
-- alter table groups add column weekly_target int check (weekly_target > 0);
-- alter table groups add column avatar_seed text;
-- alter table group_habits add column color text;
-- alter table group_members add column status text not null default 'accepted' check (status in ('pending', 'accepted'));
-- (then re-run the is_group_member/has_group_membership functions, the
--  "members see their groups" policy, and add the "invitee responds" policy.)

create table group_reactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  sender uuid not null references profiles(id) on delete cascade,
  recipient uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('cheer', 'nudge')),
  day date not null,
  created_at timestamptz not null default now(),
  check (sender <> recipient)
);

alter table group_reactions enable row level security;

create policy "members read reactions"
  on group_reactions for select to authenticated using (is_group_member(group_id));
create policy "react as self"
  on group_reactions for insert to authenticated
  with check (sender = auth.uid() and is_group_member(group_id) and has_active_subscription());

create unique index one_nudge_per_day
  on group_reactions (group_id, sender, recipient, day)
  where kind = 'nudge';
create index group_reactions_day_idx on group_reactions (group_id, day);

-- ---------------------------------------------------------------------------
-- Roll-call check-ins: one row per member/day when they open the group page.
-- Separate from completions — this is just "showed up", and powers the group's
-- roll-call streak (consecutive days every member visited).
-- ---------------------------------------------------------------------------
create table group_checkins (
  group_id uuid not null references groups(id) on delete cascade,
  member uuid not null references profiles(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (group_id, member, day)
);

alter table group_checkins enable row level security;

create policy "members read checkins"
  on group_checkins for select to authenticated using (is_group_member(group_id));
create policy "log own checkin"
  on group_checkins for insert to authenticated
  with check (member = auth.uid() and is_group_member(group_id));

create index group_checkins_day_idx on group_checkins (group_id, day);

-- ---------------------------------------------------------------------------
-- Feature request board: requests + one-vote-per-user, photos in Storage.
-- Status changes (planned/in_progress/done) are made by you in the dashboard;
-- users can only create requests and vote.
-- ---------------------------------------------------------------------------
create table feature_requests (
  id uuid primary key default gen_random_uuid(),
  author uuid not null references profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text,
  -- "feature" idea or "bug" report — the board shows them on separate tabs.
  type text not null default 'feature' check (type in ('feature', 'bug')),
  -- Path inside the feature-photos storage bucket (one optional photo).
  photo_path text,
  status text not null default 'open' check (status in ('open', 'planned', 'in_progress', 'done')),
  created_at timestamptz not null default now()
);

-- Already ran the feature board block before `type` existed? Apply just this:
-- alter table feature_requests add column type text not null default 'feature' check (type in ('feature', 'bug'));

create table feature_votes (
  request_id uuid not null references feature_requests(id) on delete cascade,
  voter uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, voter)
);

alter table feature_requests enable row level security;
alter table feature_votes enable row level security;

create policy "board readable by signed-in users"
  on feature_requests for select to authenticated using (true);
create policy "submit requests as self"
  on feature_requests for insert to authenticated
  with check (author = auth.uid() and has_active_subscription());
create policy "authors remove own requests"
  on feature_requests for delete to authenticated using (author = auth.uid());
-- Owners may edit freely ONLY until someone else votes — a vote endorses the
-- exact words, so after that the text is immutable and owners append
-- request_updates instead. Enforced here, not in the client.
create policy "author edits before outside votes"
  on feature_requests for update to authenticated
  using (
    author = auth.uid()
    and not exists (
      select 1 from feature_votes
      where request_id = feature_requests.id and voter <> auth.uid()
    )
  )
  with check (author = auth.uid());

create policy "votes readable by signed-in users"
  on feature_votes for select to authenticated using (true);
create policy "vote as self"
  on feature_votes for insert to authenticated
  with check (voter = auth.uid() and has_active_subscription());
create policy "unvote as self"
  on feature_votes for delete to authenticated using (voter = auth.uid());

-- Append-only owner updates ("Update — also happens on Android"). These are
-- the visible change history once a request's original text is locked.
create table request_updates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references feature_requests(id) on delete cascade,
  author uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table request_updates enable row level security;

create policy "updates readable by signed-in users"
  on request_updates for select to authenticated using (true);
create policy "request author appends updates"
  on request_updates for insert to authenticated
  with check (
    author = auth.uid()
    and (select fr.author from feature_requests fr where fr.id = request_id) = auth.uid()
  );
create policy "author deletes own updates"
  on request_updates for delete to authenticated using (author = auth.uid());

-- Public bucket for the one optional screenshot per request.
insert into storage.buckets (id, name, public) values ('feature-photos', 'feature-photos', true);

create policy "feature photos upload"
  on storage.objects for insert to authenticated with check (bucket_id = 'feature-photos');
create policy "feature photos read"
  on storage.objects for select to public using (bucket_id = 'feature-photos');
-- Lets the uploader clean up their own photo when editing/replacing it.
create policy "feature photos delete own"
  on storage.objects for delete to authenticated using (bucket_id = 'feature-photos' and owner = auth.uid());

-- ---------------------------------------------------------------------------
-- Walks. Owner-only in every direction: a route is precise location history,
-- which is the most sensitive thing this app stores. There is deliberately no
-- policy letting friends, group members or anyone else read these rows — walk
-- SUMMARIES may be shared some day, routes never.
--
-- `id` is CLIENT-generated (expo-crypto randomUUID, see lib/walkTracking.ts).
-- That is what makes an offline-recorded walk safe to sync later: the device
-- already knows the walk's identity, so a retried upload is an upsert on a key
-- the server has rather than a second copy of the same walk.
--
-- Ungated by `has_active_subscription()` on purpose — recording your own walks
-- is free, and only the group features built on top of them are not.
-- ---------------------------------------------------------------------------
create table walk_sessions (
  id uuid primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  -- Milliseconds actually walked, paused time excluded. Not derivable from the
  -- two timestamps above, which is why it is stored.
  active_ms bigint not null check (active_ms >= 0),
  -- Covered ON FOOT. This is the only distance a challenge is ever credited
  -- with; the client classifies legs by speed and never lets vehicle travel
  -- into this column.
  distance_m double precision not null default 0 check (distance_m >= 0),
  -- What was thrown out as a car or a bike. Reported so the app can say why the
  -- route drawn is longer than the distance counted, never added to anything.
  vehicle_m double precision not null default 0 check (vehicle_m >= 0),
  -- NULL means the device had no pedometer. Distinct from 0, which means it had
  -- one and the outing registered no steps.
  steps integer check (steps is null or steps >= 0),
  -- No target column of any kind. An outing is not recorded against anything:
  -- milestones are markers PASSED, derived from the sum of `distance_m` on
  -- read, so there is nothing per-outing to store and nothing to migrate when
  -- the ladder in `constants/milestones.ts` changes.
  mood text check (mood is null or mood in ('easy', 'good', 'tough')),
  note text,
  habit_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table walk_sessions enable row level security;

create policy "own walks only"
  on walk_sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create index walk_sessions_user_started_idx on walk_sessions (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Route points, uploaded in batches rather than as one blob so a long walk on a
-- poor connection makes progress instead of failing whole.
--
-- `(walk_id, seq)` is the primary key, which is what makes a retried batch a
-- no-op upsert rather than a duplicate — the client numbers its batches and can
-- resend any of them safely.
-- ---------------------------------------------------------------------------
create table walk_route_batches (
  walk_id uuid not null references walk_sessions(id) on delete cascade,
  seq integer not null check (seq >= 0),
  -- [{ lat, lon, at, accuracy }] — the simplified route, not every raw fix.
  points jsonb not null,
  created_at timestamptz not null default now(),
  primary key (walk_id, seq)
);

alter table walk_route_batches enable row level security;

-- Ownership is inherited from the walk. A route batch has no user_id of its own
-- so there is no way for the two to disagree.
create policy "own route batches only"
  on walk_route_batches for all to authenticated
  using (exists (select 1 from walk_sessions w where w.id = walk_id and w.user_id = auth.uid()))
  with check (exists (select 1 from walk_sessions w where w.id = walk_id and w.user_id = auth.uid()));


-- ---------------------------------------------------------------------------
-- Lumo Move: the tracked-activity columns.
--
-- Added to `walk_sessions` rather than a second table. An activity IS a walk —
-- same client id, same ownership, same route batches — and splitting it would
-- have meant two tables to join, two RLS policies to keep in step, and a
-- migration for every walk already recorded.
--
-- Additive and re-runnable: `add column if not exists` throughout, so this file
-- can be applied over a database that already has some of it.
--
-- WHY NO ROW-PER-POINT TABLE. The obvious model is one row per GPS fix, and it
-- is the wrong one here. An hour's walk is ~3,600 fixes; a daily walker
-- produces well over a million rows a year, for data that is only ever read
-- back as a whole route. The points ride in `walk_route_batches.points` as
-- jsonb instead — one row per hundred fixes, already keyed for idempotent
-- retries — which is the same information at a hundredth of the row count.
-- ---------------------------------------------------------------------------
alter table walk_sessions add column if not exists activity_type text not null default 'walk'
  check (activity_type in ('walk', 'run'));

-- Wall clock from start to finish, INCLUDING pauses. `active_ms` above is the
-- moving half; neither is derivable from the other once a walk has been paused,
-- which is why both are stored.
alter table walk_sessions add column if not exists elapsed_ms bigint not null default 0 check (elapsed_ms >= 0);
alter table walk_sessions add column if not exists paused_ms bigint not null default 0 check (paused_ms >= 0);

-- Derived on the client and stored anyway, so a summary list does not have to
-- fetch a route to show a pace. Nullable: a walk too short to divide has none.
alter table walk_sessions add column if not exists average_pace_ms_per_km double precision
  check (average_pace_ms_per_km is null or average_pace_ms_per_km > 0);
alter table walk_sessions add column if not exists average_speed_ms double precision
  check (average_speed_ms is null or average_speed_ms >= 0);

-- An ESTIMATE, and named so. Never presented as measured.
alter table walk_sessions add column if not exists calories_estimate integer
  check (calories_estimate is null or calories_estimate >= 0);

-- How many tracking segments the activity was recorded in. More than one means
-- it was paused or lost signal — which is why its route has gaps.
alter table walk_sessions add column if not exists segment_count integer not null default 1
  check (segment_count >= 0);

/**
 * Whether the activity was plausible enough to count toward a challenge.
 *
 * Written by the client today (`checkIntegrity` in lib/move/tracking/bridge.ts)
 * and deliberately stored rather than only acted on: when server-side checking
 * arrives it needs somewhere to disagree, and a column that already exists is
 * far easier to start trusting than one that has to be backfilled.
 */
alter table walk_sessions add column if not exists integrity_ok boolean not null default true;
alter table walk_sessions add column if not exists integrity_reason text;

-- ---------------------------------------------------------------------------
-- Route batches gain a KIND.
--
-- 'route' is the accepted line — what the map draws and what the distance was
-- measured from. 'diagnostic' is the rejected fixes, kept so a bad recording
-- can be explained after the fact, and safe to prune on any schedule without
-- touching a single route.
-- ---------------------------------------------------------------------------
alter table walk_route_batches add column if not exists kind text not null default 'route'
  check (kind in ('route', 'diagnostic'));

-- Diagnostics are the first thing to delete when this table gets large.
create index if not exists walk_route_batches_kind_idx on walk_route_batches (kind, created_at);

-- ---------------------------------------------------------------------------
-- Lumo Move: challenges.
--
-- A challenge is a MILESTONE plus a VARIANT — "10 km", "10 km in 7 days",
-- "10 km with a friend". The definitions live in the app
-- (`lib/move/challengeDefs.ts`) and ship with it, so only the id is stored
-- here: a device on an older build must still be able to record what it did.
--
-- ## Team challenges are parallel, not pooled
--
-- Every participant covers the FULL distance and the challenge is done when
-- everyone has. Pooling would mean four people walking a quarter each and all
-- taking the same badge as someone who walked the lot — the badge would mean
-- something different depending on how many friends you have.
-- ---------------------------------------------------------------------------

-- Accepted friendship in either direction. Move challenges run on the friend
-- graph directly — no Group required.
create or replace function is_friend_of(other uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from friendships f
    where f.status = 'accepted'
      and ((f.requester = auth.uid() and f.addressee = other)
        or (f.addressee = auth.uid() and f.requester = other))
  );
$$;

create table move_challenges (
  id uuid primary key default gen_random_uuid(),
  -- e.g. "10k-timed". Not a foreign key: the ladder is client-side config.
  variant_id text not null,
  milestone_id text not null,
  owner uuid not null references profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled', 'expired')),
  started_at timestamptz not null default now(),
  -- Null for an open-ended challenge. Team challenges always have one.
  ends_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table move_challenges enable row level security;

create index move_challenges_owner_idx on move_challenges (owner, status);

create table move_challenge_participants (
  challenge_id uuid not null references move_challenges(id) on delete cascade,
  member uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  -- Set when someone walks away. Their contribution stays: the rest of the
  -- group carries on from where it got to, and nobody's kilometres vanish.
  left_at timestamptz,
  -- Metres covered on foot since the challenge started, recomputed on each sync
  -- and UPSERT-ed. One row per member, so a device syncing ten times writes the
  -- same row ten times rather than adding ten contributions.
  contribution_m double precision not null default 0 check (contribution_m >= 0),
  updated_at timestamptz not null default now(),
  primary key (challenge_id, member)
);

alter table move_challenge_participants enable row level security;

-- ---------------------------------------------------------------------------
-- THE single-active rule, enforced by the database.
--
-- `user_id` is the PRIMARY KEY, so one row per person is a structural fact
-- rather than a check two devices could race past. The app checks first so it
-- can explain (MOVE_CHALLENGE_ALREADY_ACTIVE); this is what makes the check
-- true.
--
-- Its existence also IS the "already busy" flag the invite list reads, which is
-- why there is no separate status table: a friend either has a row here or does
-- not, and that is all an inviter is allowed to learn.
-- ---------------------------------------------------------------------------
create table move_active_challenge (
  user_id uuid primary key references profiles(id) on delete cascade,
  challenge_id uuid not null references move_challenges(id) on delete cascade,
  started_at timestamptz not null default now()
);

alter table move_active_challenge enable row level security;

-- Readable by friends, so an invite list can grey out whoever is already busy.
-- Not by the world, and not by a group member who is not a friend.
create policy "read own and friends active challenge"
  on move_active_challenge for select to authenticated
  using (user_id = auth.uid() or is_friend_of(user_id));

create policy "write own active challenge"
  on move_active_challenge for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A challenge is visible to everyone taking part in it.
create policy "participants read challenge"
  on move_challenges for select to authenticated
  using (
    owner = auth.uid()
    or exists (select 1 from move_challenge_participants p where p.challenge_id = id and p.member = auth.uid())
  );

-- Creating one is a social action and sits behind the same gate as creating a
-- group. Taking part is NOT gated: someone invited must never be unable to pull
-- their weight.
create policy "owner creates challenge"
  on move_challenges for insert to authenticated
  with check (owner = auth.uid() and has_active_subscription());
create policy "owner updates challenge"
  on move_challenges for update to authenticated using (owner = auth.uid());
create policy "owner deletes challenge"
  on move_challenges for delete to authenticated using (owner = auth.uid());

create policy "participants read each other"
  on move_challenge_participants for select to authenticated
  using (exists (select 1 from move_challenge_participants mine where mine.challenge_id = challenge_id and mine.member = auth.uid()));

-- Writable only for yourself. This is what stops a patched client inflating
-- someone else's contribution, or adding a member who never agreed.
create policy "write own participation"
  on move_challenge_participants for all to authenticated
  using (member = auth.uid()) with check (member = auth.uid());

-- Fast Lumo ID lookups when adding friends.
create index profiles_lumo_id_idx on profiles (lumo_id);
create index friendships_addressee_idx on friendships (addressee, status);
create index group_completions_day_idx on group_completions (group_id, day);
create index feature_requests_created_idx on feature_requests (created_at desc);

-- ---------------------------------------------------------------------------
-- Realtime: broadcast row changes so the app can show live in-app banners for
-- incoming friend requests, group invites, and cheers/nudges (lib/realtime.ts).
-- RLS still applies to realtime, so each client only receives its own rows.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table friendships;
alter publication supabase_realtime add table group_members;
alter publication supabase_realtime add table group_reactions;

-- ---------------------------------------------------------------------------
-- HOW A TEAM SPLITS THE DISTANCE
--
-- `each` — everybody covers the full target. Four people, 100 km, four hundred
-- kilometres between them. This was the only behaviour before the column
-- existed, which is why it is the default and why an older row reads correctly
-- without a backfill.
--
-- `shared` — the target is one pot the team fills together. Four people, 100 km,
-- a hundred kilometres between them.
--
-- Fixed once the challenge starts. Changing it mid-run would move the finish
-- line under everybody, so there is no update path for it — the column is
-- written at insert and never again.
--
-- The BADGE does not follow from this column; the client decides that (see
-- `ChallengeProgress.earnsBadge`) and a shared challenge files no route. Kept
-- server-side anyway so every member's device agrees on what they signed up to,
-- rather than each holding its own copy of the rule.
-- ---------------------------------------------------------------------------
alter table move_challenges
  add column if not exists team_goal text not null default 'each'
  check (team_goal in ('each', 'shared'));


-- ---------------------------------------------------------------------------
-- MOVED FROM ABOVE. This block alters `move_challenges` and re-declares a
-- policy on `move_challenge_participants`, and it used to sit ~130 lines
-- BEFORE either table was created — so applying this file to a fresh database
-- failed on the first statement of it. It only ever worked because the tables
-- already existed everywhere it had been run.
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Lumo Move: the Pro rungs.
--
-- 25K and above need a subscription. The rung list itself lives in the app
-- (`lib/move/challengeDefs.ts`) and ships with it, so the server is told which
-- kind of challenge this is rather than deriving it — a new rung must not
-- require a migration to be sellable.
--
-- THE POINT OF DOING THIS SERVER-SIDE. The app already refuses on the card and
-- again on the milestone screen, and both of those are a build a determined
-- person can replace. This is the one that holds. It also covers the case the
-- client CANNOT check: a friend being added to a team challenge, whose
-- subscription the inviting device has no way to see.
-- ---------------------------------------------------------------------------
alter table move_challenges add column if not exists is_pro boolean not null default false;

-- Creating a Pro challenge takes a subscription. The free rungs stay free, so
-- the check is conditional rather than a blanket gate on the table.
drop policy if exists "own move challenges" on move_challenges;

create policy "own move challenges"
  on move_challenges for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and (is_pro = false or has_active_subscription()));

/**
 * And joining one takes a subscription of your own.
 *
 * This is the rule the client cannot enforce: an inviting device cannot see
 * whether a friend has paid. The invitee's own row is written by the invitee's
 * session, so `has_active_subscription()` here is asking about the right
 * person.
 */
drop policy if exists "own participation" on move_challenge_participants;

create policy "own participation"
  on move_challenge_participants for all to authenticated
  using (member = auth.uid())
  with check (
    member = auth.uid()
    and (
      not exists (select 1 from move_challenges c where c.id = challenge_id and c.is_pro)
      or has_active_subscription()
    )
  );