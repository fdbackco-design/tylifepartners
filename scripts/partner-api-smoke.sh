#!/usr/bin/env bash
# 파트너 API 스모크 (로컬 또는 배포)
# 사용: BASE=https://… PARTNER_KEY=pk_live_… ./scripts/partner-api-smoke.sh
set -euo pipefail
BASE="${BASE:-http://127.0.0.1:3000}"
BASE="${BASE%/}"

echo "1) 인증 없음 → 401"
code=$(curl -sS -o /tmp/partner_smoke.json -w "%{http_code}" "$BASE/api/partner/v1/candidates?limit=1")
grep -q '"code":"unauthorized"' /tmp/partner_smoke.json
test "$code" = "401"

if [[ -n "${PARTNER_KEY:-}" ]]; then
  echo "2) 후보자 조회"
  curl -sS -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $PARTNER_KEY" \
    "$BASE/api/partner/v1/candidates?limit=1"
  echo "3) TM002 (권한 없으면 403)"
  curl -sS -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $PARTNER_KEY" \
    "$BASE/api/partner/v1/tm002/customers?limit=1"
else
  echo "PARTNER_KEY 미설정 — 2·3단계 생략"
fi

echo "OK"
