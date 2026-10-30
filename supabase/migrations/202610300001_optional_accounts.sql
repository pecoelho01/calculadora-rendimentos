-- Portfolio v1 JSON stores original orders in registration order, never derived returns.
begin;
create schema if not exists private;

create table public.account_portfolios (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(btrim(id)) between 1 and 200),
  revision bigint not null check (revision between 1 and 9007199254740991),
  -- A tombstone retains the revision, preventing stale writes after delete/recreate.
  portfolio jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table public.account_migrations (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key ~ '^[a-f0-9]{64}$'),
  payload_hash text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.account_portfolios enable row level security;
alter table public.account_migrations enable row level security;
create policy account_portfolios_owner on public.account_portfolios for select to authenticated
  using ((select auth.uid()) = user_id);
create policy account_migrations_owner on public.account_migrations for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.account_portfolios, public.account_migrations from public, anon, authenticated;
grant select on public.account_portfolios, public.account_migrations to authenticated;

-- JavaScript string bounds count UTF-16 code units, including supplementary characters.
create function private.account_text_length(value text) returns integer
language sql immutable strict set search_path = '' as $$
  select coalesce(sum(case when ascii(c)>65535 then 2 else 1 end),0)::integer
  from regexp_split_to_table(value,'') c
$$;
create function private.account_nonblank(value text) returns boolean
language sql immutable strict set search_path = '' as $$
  select value !~ U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]*$'
$$;
-- Match validation.shareUnits: positive IEEE-754 double rounded with toFixed(8).
-- Decode the binary float before rounding; casting float to decimal loses this
-- distinction for large quantities (e.g. 999999999999.1234).
create function private.account_units(value numeric) returns numeric
language plpgsql immutable strict set search_path = '' as $$
declare bits bytea := float8send(value::double precision); mantissa numeric; exponent integer; denominator numeric;
begin
  exponent := (get_byte(bits,0) & 127)*16 + (get_byte(bits,1) >> 4) - 1075;
  mantissa := 4503599627370496::numeric + (get_byte(bits,1) & 15)::numeric*281474976710656
    + get_byte(bits,2)::numeric*1099511627776 + get_byte(bits,3)::numeric*4294967296
    + get_byte(bits,4)::numeric*16777216 + get_byte(bits,5)::numeric*65536
    + get_byte(bits,6)::numeric*256 + get_byte(bits,7);
  if exponent>=0 then return mantissa*power(2::numeric,exponent)*100000000; end if;
  denominator := power(2::numeric,-exponent);
  return div(mantissa*200000000+denominator,2*denominator);
end $$;
revoke all on function private.account_text_length(text), private.account_nonblank(text), private.account_units(numeric) from public, anon, authenticated;

-- Called only by the write function. SQL validation also protects direct RPC calls.
create function private.account_validate(p jsonb) returns void
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

create function public.account_snapshot() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); result jsonb;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select jsonb_build_object('version',1,'portfolios', coalesce(jsonb_agg(
    jsonb_build_object('portfolio',p.portfolio,'revision',p.revision) order by p.created_at,p.id
  ),'[]'::jsonb)) into result
    from public.account_portfolios p where p.user_id=owner_id and p.portfolio is not null;
  return result;
end $$;

create function public.account_apply(p_changes jsonb, p_migration jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid(); change jsonb; item jsonb; prior public.account_portfolios%rowtype;
  wanted bigint; record_id text; migration_key text; fingerprint text; receipt text;
  result jsonb; size_bytes bigint;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  -- Covers concurrent creations, capacity checks, CAS batches and migration retries.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes)>60
  then raise exception 'Invalid changes' using errcode='22023'; end if;
  if octet_length(p_changes::text)>3100000 then raise exception 'Payload too large' using errcode='22023'; end if;
  if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p_changes))
  then raise exception 'Duplicate changes' using errcode='22023'; end if;

  if p_migration is not null then
    if jsonb_array_length(p_changes)<>0 or jsonb_typeof(p_migration) is distinct from 'object'
      or jsonb_typeof(p_migration->'key') is distinct from 'string' or (p_migration->>'key') !~ '^[a-f0-9]{64}$'
      or jsonb_typeof(p_migration->'portfolios') is distinct from 'array'
    then raise exception 'Invalid migration' using errcode='22023'; end if;
    if jsonb_array_length(p_migration->'portfolios') not between 1 and 30
      or octet_length((p_migration->'portfolios')::text)>3100000
    then raise exception 'Invalid migration size' using errcode='22023'; end if;
    migration_key := p_migration->>'key';
    fingerprint := encode(sha256(convert_to((p_migration->'portfolios')::text,'UTF8')),'hex');
    select m.payload_hash into receipt from public.account_migrations m where m.user_id=owner_id and m.key=migration_key;
    if found then
      if receipt<>fingerprint then raise exception 'Migration key reused' using errcode='22023'; end if;
      return public.account_snapshot();
    end if;
    if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p_migration->'portfolios'))
    then raise exception 'Duplicate migration portfolios' using errcode='22023'; end if;
    for item in select value from jsonb_array_elements(p_migration->'portfolios') loop
      perform private.account_validate(item);
      record_id := 'import-'||encode(sha256(convert_to(migration_key||':'||(item->>'id'),'UTF8')),'hex');
      if exists(select 1 from public.account_portfolios p where p.user_id=owner_id and p.id=record_id)
      then raise exception 'Migration conflicts with existing portfolio' using errcode='40001'; end if;
      insert into public.account_portfolios(user_id,id,revision,portfolio)
        values(owner_id,record_id,1,jsonb_set(item,'{id}',to_jsonb(record_id)));
    end loop;
    insert into public.account_migrations(user_id,key,payload_hash) values(owner_id,migration_key,fingerprint);
  else
    for change in select value from jsonb_array_elements(p_changes) loop
      if jsonb_typeof(change) is distinct from 'object'
        or jsonb_typeof(change->'id') is distinct from 'string' or not private.account_nonblank(change->>'id') or private.account_text_length(change->>'id') not between 1 and 200
        or not (change ? 'expectedRevision') or not (change ? 'portfolio')
      then raise exception 'Invalid change' using errcode='22023'; end if;
      record_id:=change->>'id';
      if change->'expectedRevision'='null'::jsonb then wanted:=null;
      else
        if jsonb_typeof(change->'expectedRevision') is distinct from 'number'
          or (change->>'expectedRevision')::numeric not between 1 and 9007199254740991
          or trunc((change->>'expectedRevision')::numeric)<>(change->>'expectedRevision')::numeric
        then raise exception 'Invalid revision' using errcode='22023'; end if;
        wanted:=(change->>'expectedRevision')::bigint;
      end if;
      select * into prior from public.account_portfolios p where p.user_id=owner_id and p.id=record_id;
      if (wanted is null and prior.portfolio is not null)
        or (wanted is not null and (prior.id is null or prior.portfolio is null or prior.revision<>wanted))
      then raise exception 'Portfolio revision conflict' using errcode='40001'; end if;
      if change->'portfolio'='null'::jsonb then
        if wanted is null then raise exception 'Deletion requires revision' using errcode='22023'; end if;
        update public.account_portfolios set portfolio=null,revision=revision+1 where user_id=owner_id and id=record_id;
      else
        item:=change->'portfolio';
        perform private.account_validate(item);
        if item->>'id'<>record_id then raise exception 'Portfolio id mismatch' using errcode='22023'; end if;
        insert into public.account_portfolios(user_id,id,revision,portfolio) values(owner_id,record_id,1,item)
          on conflict(user_id,id) do update set portfolio=excluded.portfolio, revision=account_portfolios.revision+1;
      end if;
    end loop;
  end if;
  if (select count(*) from public.account_portfolios p where p.user_id=owner_id and p.portfolio is not null)>30
  then raise exception 'Too many portfolios' using errcode='22023'; end if;
  -- JSONB adds formatting whitespace; compact JSON from the API has the same 3 MB budget.
  select coalesce(sum(octet_length(p.portfolio::text)),0) into size_bytes
    from public.account_portfolios p where p.user_id=owner_id and p.portfolio is not null;
  if size_bytes>3000000 then raise exception 'Account too large' using errcode='22023'; end if;
  result:=public.account_snapshot();
  return result;
end $$;
revoke all on function public.account_snapshot() from public, anon, authenticated;
revoke all on function public.account_apply(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.account_snapshot() to authenticated;
grant execute on function public.account_apply(jsonb,jsonb) to authenticated;
commit;
