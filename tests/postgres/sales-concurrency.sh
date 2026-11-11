#!/usr/bin/env bash
set -euo pipefail
# Runs ONLY against disposable PostgreSQL service in GitHub Actions.
# Two independent authenticated connections race to replace the SAME month.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

psql -X -At -v ON_ERROR_STOP=1 <<'SQL' >"$tmp/base.log"
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.sales_month_version('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-06-01');
SQL
initial="$(tail -n 1 "$tmp/base.log" | tr -d '[:space:]')"
if [[ ! "$initial" =~ ^[a-f0-9]{32}$ ]]; then
  echo "Invalid synthetic initial version" >&2
  exit 1
fi

race() {
  local request="$1"
  local name="$2"
  psql -X -v ON_ERROR_STOP=1 -v baseline="$initial" -v request="$request" -v seller="$name" <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.sales_month_commit(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-06-01','2026-06-30',
  :'baseline', :'request'::uuid,
  jsonb_build_array(jsonb_build_object(
    'sellerName', :'seller',
    'sellerCode', null,
    'netAmountCents', 99999,
    'returnsCents', 0,
    'costCents', 44444,
    'itemsQty', 5,
    'salesQty', 3
  )),
  'synthetic-race.pdf'
);
SQL
}

set +e
race "10101010-1010-4010-8010-101010101010" "Racer A" >"$tmp/a.log" 2>&1 &
a=$!
race "20202020-2020-4020-8020-202020202020" "Racer B" >"$tmp/b.log" 2>&1 &
b=$!
wait "$a"; a_result=$?
wait "$b"; b_result=$?
set -e

if ! { [[ "$a_result" -eq 0 && "$b_result" -ne 0 ]] ||
       [[ "$a_result" -ne 0 && "$b_result" -eq 0 ]]; }; then
  echo "Exactly one of two competing transactions must succeed" >&2
  cat "$tmp/a.log" "$tmp/b.log" >&2
  exit 1
fi

if ! grep -q 'O mês mudou depois da prévia' "$tmp/a.log" &&
   ! grep -q 'O mês mudou depois da prévia' "$tmp/b.log"; then
  echo "Loser was not rejected for a stale version" >&2
  cat "$tmp/a.log" "$tmp/b.log" >&2
  exit 1
fi

# Verify one and only one month set and exactly one audit revision.
actual="$(psql -X -At -v ON_ERROR_STOP=1 -c "
  select count(*) from public.sales
  where company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and period_start='2026-06-01'
")"
revisions="$(psql -X -At -v ON_ERROR_STOP=1 -c "
  select count(*) from finance_internal.sales_month_revisions
  where company_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and period_start='2026-06-01' and action='replace'
")"
if [[ "$actual" != "1" || "$revisions" != "1" ]]; then
  echo "Concurrency violation: rows=$actual revisions=$revisions" >&2
  exit 1
fi
echo "PASS: one transaction committed and one was rejected, with one audited month."
