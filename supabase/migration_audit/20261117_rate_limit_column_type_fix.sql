alter table public.rate_limit_buckets alter column last_refill drop default;
alter table public.rate_limit_buckets alter column last_refill type timestamptz using last_refill::timestamptz;
alter table public.rate_limit_buckets alter column last_refill set default now();
alter table public.rate_limit_buckets alter column tokens type double precision using tokens::double precision;