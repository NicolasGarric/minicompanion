#!/usr/bin/env bash
# Validates the migrations, the seed and the RLS tests on a plain local Postgres (no Docker).
# PostGIS is emulated by prelude.sql, so geo results are approximations (haversine on text points).
# Usage: PGPORT=5499 supabase/tests/local/run.sh   (needs a Postgres superuser "postgres" on 127.0.0.1)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PSQL=(psql -h "${PGHOST:-127.0.0.1}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}" -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -d postgres -c "drop database if exists cftest" -c "create database cftest"
"${PSQL[@]}" -d cftest -f "$HERE/prelude.sql"

adapt() {
  sed -E \
    -e '/create extension if not exists postgis/d' \
    -e '/create extension if not exists pgcrypto/d' \
    -e 's/extensions\.geography\(Point, 4326\)/extensions.geography/g' \
    -e 's/using gist/using btree/g' \
    -e 's/st_setsrid\(st_makepoint\(p_lng, p_lat\), 4326\)::geography/st_setsrid(st_makepoint(p_lng, p_lat), 4326)::extensions.geography/' \
    -e 's/t\.location::geometry/t.location::extensions.geometry/g' \
    "$1"
}

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "== $(basename "$f")"
  adapt "$f" | "${PSQL[@]}" -d cftest
done
for s in "$ROOT"/supabase/seed.sql "$ROOT"/supabase/seed_games.sql "$ROOT"/supabase/seed_social.sql "$ROOT"/supabase/seed_tournament.sql "$ROOT"/supabase/seed_contest.sql; do
  echo "== $(basename "$s")"
  "${PSQL[@]}" -d cftest -f "$s"
done
for t in "$ROOT"/supabase/tests/*.sql; do
  echo "== $(basename "$t")"
  "${PSQL[@]}" -d cftest -f "$t" 2>&1 | grep -E "ok -|FAIL|ERROR|passed"
done
