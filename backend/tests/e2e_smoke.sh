#!/usr/bin/env bash
# ARIA — end-to-end smoke test
# Exercises every router with realistic flows, then prints a summary.
# Requires: backend on http://localhost:${BACKEND_PORT:-8000}, simulator running.

set -u
HOST="http://localhost:${BACKEND_PORT:-8000}"
COOKIES="$(mktemp)"
trap 'rm -f "$COOKIES"' EXIT

PASS=0
FAIL=0
declare -a FAILURES

# ── helpers ────────────────────────────────────────────────
hit() {
    # hit METHOD PATH EXPECTED_STATUS [DATA]
    local method="$1" path="$2" expected="$3" data="${4:-}"
    local args=(-s -o /tmp/_e2e_body.json -w "%{http_code}" -X "$method" "$HOST$path" -b "$COOKIES" -c "$COOKIES")
    if [ -n "$data" ]; then
        args+=(-H "Content-Type: application/json" -d "$data")
    fi
    local code
    code=$(curl "${args[@]}")
    if [ "$code" = "$expected" ]; then
        PASS=$((PASS + 1))
        printf "  \033[32mOK\033[0m  %3s  %-7s %s\n" "$code" "$method" "$path"
    else
        FAIL=$((FAIL + 1))
        FAILURES+=("$method $path → got $code expected $expected: $(head -c 200 /tmp/_e2e_body.json)")
        printf "  \033[31mFAIL\033[0m %3s  %-7s %s\n" "$code" "$method" "$path"
    fi
}

extract() { python3 -c "import json,sys;print(json.load(open('/tmp/_e2e_body.json'))$1)"; }

WS="2026-04-21T17:00:00Z"
WE="2026-04-21T19:00:00Z"

echo "=== 1. health ==="
hit GET "/health" 200

echo "=== 2. auth (anon) ==="
hit GET  "/api/v1/auth/me" 401
hit POST "/api/v1/auth/login" 401 '{"username":"admin","password":"WRONGPW"}'
hit POST "/api/v1/auth/login" 422 '{"username":"x"}'

echo "=== 3. login admin ==="
hit POST "/api/v1/auth/login" 200 '{"username":"admin","password":"admin123"}'
USER_ROLE=$(extract "['data']['user']['role']")
[ "$USER_ROLE" = "admin" ] && echo "  admin role confirmed" || { FAIL=$((FAIL+1)); FAILURES+=("admin role mismatch: $USER_ROLE"); }

echo "=== 4. auth/me + users CRUD ==="
hit GET  "/api/v1/auth/me" 200
hit GET  "/api/v1/users" 200
hit GET  "/api/v1/users/1" 200
hit GET  "/api/v1/users/9999" 404

# Create + update + delete a throwaway user
USERNAME="e2e_$(date +%s)"
hit POST "/api/v1/users" 201 "{\"username\":\"$USERNAME\",\"password\":\"pw12345\",\"role\":\"viewer\"}"
NEW_USER_ID=$(extract "['data']['id']")
hit PUT  "/api/v1/users/$NEW_USER_ID" 200 '{"full_name":"E2E user"}'
hit DELETE "/api/v1/users/$NEW_USER_ID" 200

echo "=== 5. hierarchy ==="
hit GET "/api/v1/hierarchy/tree" 200
hit GET "/api/v1/hierarchy/enterprises" 200
hit GET "/api/v1/hierarchy/sites" 200
hit GET "/api/v1/hierarchy/areas" 200
hit GET "/api/v1/hierarchy/lines" 200
hit GET "/api/v1/hierarchy/cells" 200
hit GET "/api/v1/hierarchy/cells/1" 200
hit GET "/api/v1/hierarchy/cells/9999" 404

echo "=== 6. signals ==="
hit GET "/api/v1/signals/tags?cell_id=1" 200
hit GET "/api/v1/signals/definitions?cell_id=1" 200
hit GET "/api/v1/signals/current?cell_ids=1" 200
hit GET "/api/v1/signals/types" 200
hit GET "/api/v1/signals/units" 200
DEF_ID=$(curl -s "$HOST/api/v1/signals/definitions?cell_id=1" -b "$COOKIES" | python3 -c "import json,sys;print(json.load(sys.stdin)['data'][0]['id'])")
hit GET "/api/v1/signals/data/$DEF_ID" 200

echo "=== 7. monitoring ==="
hit GET "/api/v1/monitoring/status/current" 200
hit GET "/api/v1/monitoring/events/machine-status?cell_ids=1" 200
hit GET "/api/v1/monitoring/events/production?cell_ids=1" 200

echo "=== 8. KPI ==="
hit GET "/api/v1/kpi/oee?cell_ids=1&window_start=$WS&window_end=$WE" 200
hit GET "/api/v1/kpi/oee/trend?cell_ids=1&window_start=$WS&window_end=$WE&bucket=15min" 200
hit GET "/api/v1/kpi/oee/trend?cell_ids=1&window_start=$WS&window_end=$WE&bucket=1+hour" 200
hit GET "/api/v1/kpi/maintenance?cell_ids=1&window_start=$WS&window_end=$WE" 200
hit GET "/api/v1/kpi/production-stats?cell_ids=1&window_start=$WS&window_end=$WE" 200
hit GET "/api/v1/kpi/quality/by-cell?cell_ids=1&window_start=$WS&window_end=$WE" 200
hit GET "/api/v1/kpi/oee" 422   # missing required params

echo "=== 9. mapping ==="
hit GET "/api/v1/mapping/status-codes" 200
hit GET "/api/v1/mapping/quality-codes" 200
hit GET "/api/v1/mapping/status-labels" 200
hit GET "/api/v1/mapping/quality-labels" 200
hit GET "/api/v1/mapping/status?cell_id=1" 200
hit GET "/api/v1/mapping/quality?cell_id=1" 200

echo "=== 10. logbook ==="
hit GET  "/api/v1/logbook?cell_id=1" 200
hit POST "/api/v1/logbook" 201 '{"cell_id":1,"category":"observation","severity":"info","content":"E2E test entry"}'
ENTRY_ID=$(extract "['data']['id']")
hit GET  "/api/v1/logbook/$ENTRY_ID" 200

echo "=== 11. shifts ==="
hit GET "/api/v1/shifts" 200
hit GET "/api/v1/shifts/current" 200
hit GET "/api/v1/shifts/assignments" 200

echo "=== 12. work orders ==="
hit POST "/api/v1/work-orders" 201 '{"cell_id":1,"title":"E2E test WO","priority":"medium","required_parts":["partA","partB"],"required_skills":["mech"]}'
WO_ID=$(extract "['data']['id']")
PARTS=$(extract "['data']['required_parts']")
[ "$PARTS" = "['partA', 'partB']" ] && echo "  json field round-trip OK" || { FAIL=$((FAIL+1)); FAILURES+=("WO required_parts: $PARTS"); }
hit GET    "/api/v1/work-orders" 200
hit GET    "/api/v1/work-orders/$WO_ID" 200
hit PUT    "/api/v1/work-orders/$WO_ID" 200 '{"status":"in_progress","priority":"high"}'
hit DELETE "/api/v1/work-orders/$WO_ID" 200
hit GET    "/api/v1/work-orders/$WO_ID" 404

echo "=== 13. KB ==="
hit GET "/api/v1/kb/equipment" 200
hit GET "/api/v1/kb/equipment/1" 200
hit PUT "/api/v1/kb/equipment" 201 '{"cell_id":1,"manufacturer":"FlowTech","model":"CP-3200","structured_data":{"thresholds":{"flow_m3h":{"nominal":32,"alert":40,"unit":"m3/h","confidence":0.9}}}}'
if python3 -c "import json;d=json.load(open('/tmp/_e2e_body.json'));exit(0 if d['data']['structured_data']['thresholds']['flow_m3h']['nominal']==32 else 1)"; then
    echo "  KB JSON round-trip OK"
else
    FAIL=$((FAIL+1)); FAILURES+=("KB structured_data round-trip mismatch")
fi
hit GET "/api/v1/kb/failures?cell_id=1" 200

echo "=== 14. RBAC: viewer cannot write ==="
curl -s -o /dev/null -X POST "$HOST/api/v1/auth/login" -H "Content-Type: application/json" \
    -d '{"username":"viewer","password":"viewer123"}' -c "$COOKIES" -b "$COOKIES"
hit POST   "/api/v1/users" 403 '{"username":"hack","password":"pwd1234","role":"admin"}'
hit POST   "/api/v1/work-orders" 403 '{"cell_id":1,"title":"hack"}'
hit POST   "/api/v1/logbook" 403 '{"cell_id":1,"category":"observation","severity":"info","content":"x"}'

echo "=== 15. operator can write logbook + WO ==="
curl -s -o /dev/null -X POST "$HOST/api/v1/auth/login" -H "Content-Type: application/json" \
    -d '{"username":"operator","password":"operator123"}' -c "$COOKIES" -b "$COOKIES"
hit POST   "/api/v1/logbook" 201 '{"cell_id":1,"category":"observation","severity":"info","content":"by operator"}'
hit POST   "/api/v1/work-orders" 201 '{"cell_id":1,"title":"by operator"}'
hit POST   "/api/v1/users" 403 '{"username":"hack","password":"pwd1234"}'

echo "=== 16. logout invalidates session ==="
hit POST "/api/v1/auth/logout" 200
# Old refresh token should now fail (token_version bumped)
hit POST "/api/v1/auth/refresh" 401

echo
echo "════════════════════════════════════════════════════════"
printf "  Passed: %d   Failed: %d\n" "$PASS" "$FAIL"
echo "════════════════════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
    echo
    echo "FAILURES:"
    for f in "${FAILURES[@]}"; do echo "  - $f"; done
    exit 1
fi
