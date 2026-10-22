-- =============================================================================================
-- Fix: organisers could not create a tournament through the API.
--
-- PostgREST inserts with RETURNING, so the new row must also pass the SELECT policy. That policy
-- relied on is_organiser(id), a function that queries the table again: inside the same statement
-- it cannot see the row being inserted, so the check failed for drafts.
-- The SELECT policy now checks the owner column directly first. Idempotent: safe to run again.
-- =============================================================================================

drop policy if exists "published tournaments are public" on public.tournaments;

create policy "published tournaments are public" on public.tournaments
  for select using (
    organiser_id = auth.uid()
    or (status <> 'draft' and not is_hidden)
    or public.is_organiser(id)
  );
