#!/usr/bin/env python3
"""Integration checks against ephemeral LOCAL Supabase GoTrue + PostgREST only.

No real users, production connection strings, financial figures or cloud APIs.
The script must never print tokens, API keys, database URLs or passwords.
"""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from uuid import UUID, uuid4
from pathlib import Path

COMPANY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
COMPANY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

def check(condition, label):
    if not condition:
        raise AssertionError(label)
    print("PASS:", label)

def load_local_status(file):
    with open(file, encoding="utf-8") as handle:
        raw = json.load(handle)
    data = {str(key).upper(): value for key, value in raw.items()}
    def field(*keys):
        return next((data[k] for k in keys if data.get(k)), None)
    api = field("API_URL")
    db = field("DB_URL")
    key = field("ANON_KEY", "PUBLISHABLE_KEY", "PUBLISHABLE_KEY_DEFAULT")
    if not all((api, db, key)):
        raise RuntimeError("Local Supabase status is missing API_URL, DB_URL or a public API key. "
                           "Available keys: " + ", ".join(sorted(data.keys())))
    host = urllib.parse.urlparse(api).hostname
    check(host in ("127.0.0.1", "localhost", "::1"), "Only localhost Supabase is eligible")
    db_host = urllib.parse.urlparse(db).hostname
    check(db_host in ("127.0.0.1", "localhost", "::1"), "Only localhost Postgres is eligible")
    return api.rstrip("/"), db, key

def http(api, key, path, method="GET", token=None, payload=None):
    headers = {"apikey": key, "Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload).encode()
    else:
        body = None
    request = urllib.request.Request(api + path, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read()
            try:
                data = json.loads(body) if body else None
            except ValueError:
                data = body.decode()
            return response.status, data
    except urllib.error.HTTPError as err:
        body = err.read()
        try:
            data = json.loads(body) if body else None
        except ValueError:
            data = None
        return err.code, data

def signed_up_user(api, key, suffix):
    identity = suffix + "-finance-sandbox@example.test"
    status, response = http(api, key, "/auth/v1/signup", "POST", payload={
        "email": identity, "password": "Temporary-Lab-Only-Password-" + suffix + "!2026"
    })
    if status not in (200, 201) or not response or not response.get("access_token"):
        raise RuntimeError("Local Auth signup failed for role " + suffix +
                           " (HTTP " + str(status) + ", no token logged)")
    user_id = response["user"]["id"]
    UUID(user_id)
    return user_id, response["access_token"]

def seed_memberships(db, identities):
    data = [
        (COMPANY_A, identities["owner"][0], "owner"),
        (COMPANY_A, identities["admin"][0], "admin"),
        (COMPANY_A, identities["member"][0], "member"),
        (COMPANY_B, identities["foreign"][0], "owner"),
    ]
    values = ",".join(
        "('%s'::uuid,'%s'::uuid,'%s'::public.app_role)" % item
        for item in data
    )
    # These identities are synthetic; the Auth user UUIDs come from local GoTrue.
    sql = (
        "insert into public.companies (id,name,owner_id) values "
        "('%s'::uuid,'Empresa Sintética A','%s'::uuid),"
        "('%s'::uuid,'Empresa Sintética B','%s'::uuid);" %
        (COMPANY_A, identities["owner"][0], COMPANY_B, identities["foreign"][0])
    )
    sql += "insert into public.company_members(company_id,user_id,role) values " + values + ";"
    sql += (
        "insert into public.sales (company_id,period_start,period_end,seller_name,"
        "net_amount_cents,cost_cents,source_file) values "
        "('%s'::uuid,'2026-05-01','2026-05-31','Vendedor Sintético A',100000,60000,'synthetic-a.pdf'),"
        "('%s'::uuid,'2026-05-01','2026-05-31','Vendedor Sintético B',90000,40000,'synthetic-b.pdf');"
    ) % (COMPANY_A, COMPANY_B)
    subprocess.run(["psql", "-X", "-v", "ON_ERROR_STOP=1", "-q", db,
                    "-c", sql], check=True, stdout=subprocess.DEVNULL)

def rpc(api, key, token, action, body):
    return http(api, key, "/rest/v1/rpc/" + action, "POST", token=token, payload=body)

def ensure_forbidden(status, label):
    check(status in (401, 403, 404), label + " (blocked)")

def main(status_path):
    api, db, key = load_local_status(status_path)
    repo_root = Path(__file__).resolve().parents[2]
    # Safety guard above verifies that DB_URL resolves to localhost before
    # any schema change can be executed. Never connect to hosted projects.
    for relative in (
        "tests/supabase/sales-auth-fixture.sql",
        "docs/sql/SALES_MONTH_ATOMIC_REPLACE_HOMOLOGATION_DRAFT.sql",
        "tests/supabase/sales-schema-contract.sql",
    ):
        command = ["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
                   db, "-f", str(repo_root / relative)]
        executed = subprocess.run(command, capture_output=True, text=True)
        if executed.returncode != 0:
            raise RuntimeError("Local schema step failed (" + relative + "): " +
                               executed.stderr[-2400:])
        print("PASS: applied synthetic local-only SQL:", relative)
    ids = {name: signed_up_user(api, key, name)
           for name in ("owner", "admin", "member", "foreign", "outsider")}
    seed_memberships(db, ids)
    print("Created five synthetic GoTrue sessions with real signed JWTs.")
    owner = ids["owner"][1]
    admin = ids["admin"][1]
    member = ids["member"][1]
    foreign = ids["foreign"][1]
    outsider = ids["outsider"][1]

    path = "/rest/v1/sales?select=company_id,seller_name&period_start=eq.2026-05-01"
    for token, role in ((owner, "owner"), (admin, "admin"), (member, "member")):
        status, rows = http(api, key, path, token=token)
        check(status == 200 and isinstance(rows, list) and len(rows) == 1
              and rows[0]["company_id"] == COMPANY_A,
              "Same-company %s can read only company A" % role)
    for token, role in ((foreign, "foreign tenant"), (outsider, "unassociated")):
        status, rows = http(api, key, path, token=token)
        check(status == 200 and len(rows) == (1 if role == "foreign tenant" else 0)
              and all(row["company_id"] == COMPANY_B for row in rows),
              role + " cannot read company A")
    status, anon_rows = http(api, key, path)
    check(status in (200, 401, 403) and
          (status != 200 or anon_rows == []), "Anonymous user cannot read records")

    for method, extra, payload in (
        ("POST", "/rest/v1/sales", {
            "company_id": COMPANY_A, "period_start": "2026-05-01",
            "period_end": "2026-05-31", "seller_name": "Unauthorized Insert"
        }),
        ("PATCH", "/rest/v1/sales?company_id=eq." + COMPANY_A, {"cost_cents": 1}),
        ("DELETE", "/rest/v1/sales?company_id=eq." + COMPANY_A, None),
    ):
        status, _ = http(api, key, extra, method, token=owner, payload=payload)
        ensure_forbidden(status, "Direct " + method + " is denied even for owner")

    version_req = {"p_company_id": COMPANY_A, "p_period_start": "2026-05-01"}
    for token, label in ((member, "member"), (foreign, "foreign company"),
                         (outsider, "unassociated")):
        status, _ = rpc(api, key, token, "sales_month_version", version_req)
        ensure_forbidden(status, label + " cannot read fingerprint")
    status, _ = rpc(api, key, None, "sales_month_version", version_req)
    ensure_forbidden(status, "Anonymous cannot read fingerprint")
    status, version = rpc(api, key, owner, "sales_month_version", version_req)
    check(status == 200 and isinstance(version, str)
          and re.fullmatch(r"[a-f0-9]{32}", version) is not None,
          "Owner gets an authenticated month fingerprint")
    status, admin_version = rpc(api, key, admin, "sales_month_version", version_req)
    check(status == 200 and version == admin_version, "Admin reads same fingerprint")

    rows = [{
        "sellerName": "Vendedor Sintético A", "sellerCode": "01",
        "netAmountCents": 165000, "returnsCents": 10000, "costCents": 92000,
        "itemsQty": 14, "salesQty": 8,
    }, {
        "sellerName": "Vendedor Sintético B", "sellerCode": "02",
        "netAmountCents": 72000, "returnsCents": 0, "costCents": 37000,
        "itemsQty": 5, "salesQty": 4,
    }]
    body = {**version_req,
        "p_period_end": "2026-05-31", "p_expected_version": version,
        "p_request_id": str(uuid4()), "p_rows": rows, "p_source_file": "synthetic-ci.pdf"}
    for token, label in ((member, "member"), (foreign, "cross-tenant"),
                         (outsider, "unassociated")):
        status, _ = rpc(api, key, token, "sales_month_commit", body)
        ensure_forbidden(status, label + " cannot replace month")

    status, updated = rpc(api, key, owner, "sales_month_commit", body)
    check(status == 200 and updated.get("saved") == 2 and not updated.get("replayed"),
          "Owner replaces full month through authenticated PostgREST RPC")
    status, replayed = rpc(api, key, owner, "sales_month_commit", body)
    check(status == 200 and replayed.get("replayed") is True
          and replayed["revisionId"] == updated["revisionId"],
          "Duplicate request id is idempotent")
    status, actual = http(api, key,
        "/rest/v1/sales?select=seller_name,cost_cents&company_id=eq." + COMPANY_A,
        token=member)
    check(status == 200 and len(actual) == 2
          and sum(row["cost_cents"] for row in actual) == 129000,
          "Member sees exactly the new sales cost after commit")

    restore = {"p_company_id": COMPANY_A, "p_period_start": "2026-05-01",
               "p_revision_id": updated["revisionId"],
               "p_expected_version": updated["version"], "p_request_id": str(uuid4())}
    status, _ = rpc(api, key, member, "sales_month_restore", restore)
    ensure_forbidden(status, "Member cannot restore original")
    status, restored = rpc(api, key, admin, "sales_month_restore", restore)
    check(status == 200 and restored["version"] == version
          and not restored.get("replayed"),
          "Admin restores exact original month in a single transaction")

    status, revision_table = http(api, key, "/rest/v1/sales_month_revisions?select=id", token=owner)
    ensure_forbidden(status, "Private audit table is not exposed through public Data API")
    status, unchanged = http(api, key,
        "/rest/v1/sales?select=company_id,cost_cents&company_id=eq." + COMPANY_B,
        token=foreign)
    check(status == 200 and len(unchanged) == 1 and unchanged[0]["cost_cents"] == 40000,
          "Other company's sales remain untouched")
    print("PASS: real local GoTrue JWT -> Kong -> PostgREST -> RLS/RPC checks complete.")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: test_auth_rls.py /path/to/local-supabase-status.json")
    main(sys.argv[1])
