CREATE TABLE public.rate_limit_buckets (
  key text PRIMARY KEY,
  tokens double precision NOT NULL,
  last_refill timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.rate_limit_buckets TO service_role;

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only" ON public.rate_limit_buckets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _key text,
  _capacity integer,
  _refill_per_sec double precision,
  _cost integer DEFAULT 1
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
  _row public.rate_limit_buckets%ROWTYPE;
  _new_tokens double precision;
BEGIN
  INSERT INTO public.rate_limit_buckets(key, tokens, last_refill, updated_at)
  VALUES (_key, _capacity, _now, _now)
  ON CONFLICT (key) DO NOTHING;

  SELECT * INTO _row FROM public.rate_limit_buckets WHERE key = _key FOR UPDATE;

  _new_tokens := LEAST(
    _capacity::double precision,
    _row.tokens + EXTRACT(EPOCH FROM (_now - _row.last_refill)) * _refill_per_sec
  );

  IF _new_tokens < _cost THEN
    UPDATE public.rate_limit_buckets
       SET tokens = _new_tokens, last_refill = _now, updated_at = _now
     WHERE key = _key;
    RETURN false;
  END IF;

  UPDATE public.rate_limit_buckets
     SET tokens = _new_tokens - _cost, last_refill = _now, updated_at = _now
   WHERE key = _key;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, double precision, integer) TO service_role;