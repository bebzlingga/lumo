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
