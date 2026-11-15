-- Apply after 007, before publishing or rolling back the application.
-- Keep legacy public RPC names during the transition; never duplicate write logic.
begin;

create function public.account_snapshot() returns jsonb
language sql security invoker set search_path = '' as $$
  select public.get_account_portfolios();
$$;

create function public.account_apply(p_changes jsonb, p_migration jsonb default null) returns jsonb
language sql security invoker set search_path = '' as $$
  select public.apply_account_changes(p_changes, p_migration);
$$;

revoke all on function public.account_snapshot(), public.account_apply(jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.account_snapshot(), public.account_apply(jsonb,jsonb)
  to authenticated;

-- Public release metadata only: no account, session or portfolio data is queried.
create function public.get_account_schema_contract() returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select '{"version":8,"accountRpcVersion":1,"legacyRpcAliases":true}'::jsonb;
$$;
revoke all on function public.get_account_schema_contract()
  from public, anon, authenticated;
grant execute on function public.get_account_schema_contract() to anon, authenticated;

notify pgrst, 'reload schema';
commit;
