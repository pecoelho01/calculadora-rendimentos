-- Business conflicts must not use serialization_failure (40001): PostgREST retries it.
-- PT409 returns HTTP 409 immediately and preserves the atomic rollback.
begin;
create or replace function public.account_apply(p_changes jsonb, p_migration jsonb default null) returns jsonb
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
      then raise exception 'Migration conflicts with existing portfolio' using errcode='PT409'; end if;
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
      then raise exception 'Portfolio revision conflict' using errcode='PT409'; end if;
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
commit;
