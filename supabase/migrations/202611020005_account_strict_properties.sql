-- Enforce the Portfolio v1 property set for direct RPC writes and imports.
-- Existing portfolios, revisions and receipts are deliberately not rewritten.
begin;
create or replace function private.account_validate(p jsonb) returns void
language plpgsql set search_path = '' as $$
declare o jsonb; d date;
begin
  if jsonb_typeof(p) is distinct from 'object'
    or jsonb_typeof(p->'id') is distinct from 'string'
    or not private.account_nonblank(p->>'id') or private.account_text_length(p->>'id') not between 1 and 200
    or jsonb_typeof(p->'name') is distinct from 'string'
    or not private.account_nonblank(p->>'name') or private.account_text_length(p->>'name') > 60
    or jsonb_typeof(p->'currency') is distinct from 'string'
    or p->>'currency' not in ('EUR','USD','GBP')
    or jsonb_typeof(p->'orders') is distinct from 'array'
    or (p - array['id','name','currency','orders']) <> '{}'::jsonb
  then raise exception 'Invalid portfolio' using errcode = '22023'; end if;
  if jsonb_array_length(p->'orders') > 5000 then raise exception 'Too many orders' using errcode='22023'; end if;
  for o in select value from jsonb_array_elements(p->'orders') loop
    if jsonb_typeof(o) is distinct from 'object'
      or jsonb_typeof(o->'id') is distinct from 'string' or not private.account_nonblank(o->>'id') or private.account_text_length(o->>'id') not between 1 and 200
      or jsonb_typeof(o->'date') is distinct from 'string' or (o->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
      or jsonb_typeof(o->'ticker') is distinct from 'string' or (o->>'ticker') !~ '^[A-Z0-9^][A-Z0-9.^=\-]{0,24}$'
      or jsonb_typeof(o->'name') is distinct from 'string' or private.account_text_length(o->>'name') > 100
      or jsonb_typeof(o->'type') is distinct from 'string' or o->>'type' not in ('buy','sell')
      or jsonb_typeof(o->'pricebuy') is distinct from 'number'
      or jsonb_typeof(o->'shares') is distinct from 'number'
      or (o - array['id','date','ticker','name','type','pricebuy','shares']) <> '{}'::jsonb
    then raise exception 'Invalid order' using errcode='22023'; end if;
    d := (o->>'date')::date;
    if to_char(d,'YYYY-MM-DD') <> o->>'date' or d < date '2000-01-01' or d > (now() at time zone 'UTC')::date
      or (o->>'pricebuy')::numeric <= 0 or (o->>'pricebuy')::numeric > 1e12
      or (o->>'pricebuy')::double precision <= 0
      or ((o->>'pricebuy')::double precision)::text::numeric <> (o->>'pricebuy')::numeric
      or ((o->>'shares')::double precision)::text::numeric <> (o->>'shares')::numeric
      or (o->>'shares')::numeric < 1e-8 or (o->>'shares')::numeric > 1e12
      or round((o->>'shares')::numeric,8) <> (o->>'shares')::numeric
    then raise exception 'Invalid order values' using errcode='22023'; end if;
  end loop;
  if (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(p->'orders'))
    or (select count(distinct value->>'ticker') > 20 from jsonb_array_elements(p->'orders'))
  then raise exception 'Duplicate order or too many tickers' using errcode='22023'; end if;
  if exists (
    select 1 from (
      select sum(case when value->>'type'='buy' then private.account_units((value->>'shares')::numeric) else -private.account_units((value->>'shares')::numeric) end)
        over (partition by value->>'ticker' order by value->>'date', position rows unbounded preceding) as held
      from jsonb_array_elements(p->'orders') with ordinality as orders(value, position)
    ) positions where held < 0
  ) then raise exception 'Sale exceeds position' using errcode='22023'; end if;
end $$;
revoke all on function private.account_validate(jsonb) from public, anon, authenticated;
commit;
