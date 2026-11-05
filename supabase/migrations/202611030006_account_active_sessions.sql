-- Enforce logout at the database boundary, including direct Data API/RPC calls.
-- Apply after 005. No account data, receipts, revisions or Auth sessions are rewritten.
begin;

create function private.account_session_active() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  session_claim jsonb := auth.jwt()->'session_id';
  session_id uuid;
begin
  if owner_id is null or jsonb_typeof(session_claim) is distinct from 'string'
    or (session_claim #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return false; end if;
  session_id := (session_claim #>> '{}')::uuid;
  return exists(select 1 from auth.sessions s where s.id=session_id and s.user_id=owner_id);
end $$;
revoke all on function private.account_session_active() from public, anon, authenticated;
-- Policies resolve this function by OID. Do not expose the private schema or auth.sessions.
grant execute on function private.account_session_active() to authenticated;

alter policy account_portfolios_owner on public.account_portfolios
  using ((select auth.uid()) = user_id and (select private.account_session_active()));
alter policy account_migrations_owner on public.account_migrations
  using ((select auth.uid()) = user_id and (select private.account_session_active()));

-- SECURITY DEFINER RPCs bypass table RLS, so both public entry points check the session.
create or replace function public.account_snapshot() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); result jsonb;
begin
  if not private.account_session_active() then
    raise exception 'Active session required' using errcode='42501';
  end if;
  select jsonb_build_object('version',1,'portfolios', coalesce(jsonb_agg(
    jsonb_build_object('portfolio',p.portfolio,'revision',p.revision) order by p.created_at,p.id
  ),'[]'::jsonb)) into result
    from public.account_portfolios p where p.user_id=owner_id and p.portfolio is not null;
  return result;
end $$;

-- Preserve the validated write implementation without duplicating its accounting,
-- quotas, CAS or idempotency logic. Only the checked public wrapper remains callable.
alter function public.account_apply(jsonb,jsonb) set schema private;
revoke all on function private.account_apply(jsonb,jsonb) from public, anon, authenticated;
create function public.account_apply(p_changes jsonb, p_migration jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.account_session_active() then
    raise exception 'Active session required' using errcode='42501';
  end if;
  return private.account_apply(p_changes,p_migration);
end $$;
revoke all on function public.account_snapshot(), public.account_apply(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.account_snapshot(), public.account_apply(jsonb,jsonb) to authenticated;
commit;
