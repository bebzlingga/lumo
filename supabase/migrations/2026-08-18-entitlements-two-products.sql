-- ---------------------------------------------------------------------------
-- ENTITLEMENTS FOR TWO PRODUCTS
--
-- The table was designed when Lumo sold ONE thing. It now sells two, and they
-- are independent (see components/SubscriptionGate.tsx): the ₱49/month Friends
-- subscription and the ₱149 one-off unlock. Somebody can own either, both, or
-- neither, and the schema could not express that — `user_id` was the primary
-- key, so one row per person, so owning both was unrepresentable.
--
-- WHY THIS IS SAFE TO RUN ON THE LIVE DATABASE
--
-- The table is empty and always has been. Nothing writes it: there is no
-- receipt-validation function deployed, which is the bug this migration is the
-- first half of fixing. So there is no data to migrate, no backfill, and no
-- window where an existing row means something different than it did before.
--
-- WHAT THIS DOES NOT DO
--
-- It does not grant anybody anything. `has_active_subscription()` returned
-- false for every user before this migration and returns false for every user
-- after it, because the table is still empty until `validate-purchase` is
-- deployed and starts writing rows. Unblocking today's paying subscribers is a
-- separate, deliberately separate, decision — see the stopgap migration.
-- ---------------------------------------------------------------------------

-- One row per (person, product) instead of one row per person.
alter table entitlements drop constraint entitlements_pkey;
alter table entitlements add primary key (user_id, product_id);

-- ---------------------------------------------------------------------------
-- Expiry, and the one-time product
--
-- `expires_at` is not null and the policies all compare it to now(), which is
-- the right shape for a subscription and an awkward one for a purchase that
-- never expires. Postgres has an exact answer for "later than every possible
-- now()" — `'infinity'::timestamptz` — and it compares correctly with `>`, so
-- the one-off unlock is stored with an infinite expiry and every existing
-- policy keeps working unchanged.
--
-- The alternative, a nullable column with `(expires_at is null or expires_at >
-- now())` scattered through seven policies, is the same idea written seven
-- times with seven chances to forget the null branch.
-- ---------------------------------------------------------------------------
comment on column entitlements.expires_at is
  'When the entitlement lapses. ''infinity'' for the one-time unlock, which never does.';

-- ---------------------------------------------------------------------------
-- The product ids live here as literals, and that is deliberate
--
-- Elsewhere the rule is that the server does not keep a second copy of the
-- app''s config (see the note about challenge titles in send-push). This is the
-- exception the rule is drawn against: a product id is not app config, it is
-- the identifier the STORE issues, shared by the client, the store and the
-- receipt. The server has to know which of the two ids grants social writes,
-- and inferring it from anything else would be guessing.
-- ---------------------------------------------------------------------------

-- Now asks about the SUBSCRIPTION specifically. Before, any entitlement row
-- granted social writes — with two products that would have let somebody who
-- bought only the one-off unlock write to groups they never paid for.
create or replace function has_active_subscription()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from entitlements
    where user_id = auth.uid()
      and product_id = 'lumo.friends.monthly'
      and expires_at > now()
  );
$$;

-- The one-off unlock. Not referenced by any policy yet: the habit and journal
-- caps are enforced client-side (context/LumoContext.tsx), and there is no
-- server-side row limit to attach this to. It exists so that server-verified
-- ownership is queryable the moment something needs it, rather than being
-- reconstructed from product ids at that point.
create or replace function has_unlimited()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from entitlements
    where user_id = auth.uid()
      and product_id = 'lumo.unlimited.lifetime'
      and expires_at > now()
  );
$$;
