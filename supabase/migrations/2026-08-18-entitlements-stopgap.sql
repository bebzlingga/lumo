-- ---------------------------------------------------------------------------
-- STOPGAP: STOP BLOCKING PAYING SUBSCRIBERS
--
-- ## The bug this fixes
--
-- `has_active_subscription()` gates the INSERT policy on friendships, groups,
-- group_reactions, group_messages, feature posts, feature votes and
-- move_challenges. It reads the `entitlements` table. Nothing has ever written
-- that table — there is no deployed receipt-validation function — so it returns
-- false for every user, including every paying one.
--
-- Meanwhile the CLIENT reads its entitlement from the App Store's own restore
-- (context/LumoContext.tsx: `server === true || store === true`), which works.
--
-- The two together are the worst possible combination: somebody pays ₱49, the
-- app unlocks the Friends UI because the store says they own it, and then every
-- single write they attempt is refused by the database. Not a degraded feature
-- — a feature that looks available and does nothing.
--
-- ## Why the whole function rather than the seven policies
--
-- Seven policy rewrites are seven chances to reintroduce the gate incorrectly
-- when it comes back. Redefining the function leaves every policy untouched and
-- makes the revert a single statement, printed at the bottom of this file.
--
-- ## THIS IS TEMPORARY
--
-- With this applied, the only paywall on social writes is the client's own UI
-- gate, which a patched client can bypass. That is a real if modest exposure,
-- and it is the correct trade against charging people for a feature that
-- refuses to work. Revert it the day `validate-purchase` is deployed and
-- verified to be writing rows.
-- ---------------------------------------------------------------------------

create or replace function has_active_subscription()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  -- STOPGAP: always true. See the revert block at the foot of this file.
  select true;
$$;

-- ---------------------------------------------------------------------------
-- REVERT — run this once `validate-purchase` is live and writing entitlements.
-- Check first that it actually is:
--
--   select count(*) from entitlements;   -- must be > 0 before reverting
--
-- Then:
--
--   create or replace function has_active_subscription()
--   returns boolean
--   language sql
--   security definer
--   set search_path = public
--   stable
--   as $revert$
--     select exists (
--       select 1 from entitlements
--       where user_id = auth.uid()
--         and product_id = 'lumo.friends.monthly'
--         and expires_at > now()
--     );
--   $revert$;
--
-- ---------------------------------------------------------------------------
