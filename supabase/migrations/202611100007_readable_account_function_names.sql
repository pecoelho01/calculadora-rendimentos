-- Apply after 006 and coordinate with the API update: old RPC names are removed.
-- Rename in place to preserve OIDs, owners, grants and policy dependencies.
-- No portfolios, revisions, receipts, counters or sessions are rewritten.
begin;

alter function public.account_snapshot() rename to get_account_portfolios;
alter function public.account_apply(jsonb,jsonb) rename to apply_account_changes;
alter function private.account_apply(jsonb,jsonb) rename to apply_account_changes;
alter function private.account_session_active() rename to is_account_session_active;

-- RLS policies follow function OIDs, but PL/pgSQL calls are stored as text.
-- Update only qualified call names in the installed definitions, preserving the
-- validated transactional implementation instead of copying its business logic.
do $$
declare
  signature text;
  definition text;
begin
  foreach signature in array array[
    'public.get_account_portfolios()',
    'public.apply_account_changes(jsonb,jsonb)',
    'private.apply_account_changes(jsonb,jsonb)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    definition := replace(definition, 'public.account_snapshot()', 'public.get_account_portfolios()');
    definition := replace(definition, 'private.account_apply(', 'private.apply_account_changes(');
    definition := replace(definition, 'private.account_session_active()', 'private.is_account_session_active()');
    execute definition;
  end loop;
end $$;

-- Refresh PostgREST's RPC schema after the transaction commits.
notify pgrst, 'reload schema';
commit;
