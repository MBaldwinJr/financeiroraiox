-- Server-only rate limiter, matching original RPC API.
-- Browser roles intentionally cannot call this privileged function.
create or replace function public.consume_rate_limit(
 _key text,_capacity integer,_refill_per_sec double precision,_cost integer default 1
) returns boolean language plpgsql security definer set search_path='' as $$
declare
 now_at timestamptz := now();
 current_bucket public.rate_limit_buckets%rowtype;
 tokens_now double precision;
begin
 if _key is null or length(_key)>512 or _capacity<1 or _capacity>100000
    or _cost<1 or _cost>_capacity or _refill_per_sec<=0 or _refill_per_sec>10000 then
   return false;
 end if;
 insert into public.rate_limit_buckets(key,tokens,last_refill,updated_at)
 values (_key,_capacity,now_at,now_at) on conflict(key) do nothing;
 select * into current_bucket from public.rate_limit_buckets where key=_key for update;
 tokens_now:=least(_capacity::double precision,
  current_bucket.tokens+greatest(0,extract(epoch from (now_at-current_bucket.last_refill)))::double precision*_refill_per_sec);
 update public.rate_limit_buckets
 set tokens=greatest(0,tokens_now-case when tokens_now>=_cost then _cost else 0 end),
 last_refill=now_at,updated_at=now_at where key=_key;
 return tokens_now>=_cost;
end $$;
revoke all on function public.consume_rate_limit(text,integer,double precision,integer) from public,anon,authenticated;
grant execute on function public.consume_rate_limit(text,integer,double precision,integer) to service_role;
