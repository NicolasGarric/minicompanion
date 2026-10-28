#!/usr/bin/env bash
# Builds resources/supabase/: every SQL file the owner may have to paste into the Supabase SQL
# Editor, numbered in the order to run them, in plain ASCII (copies cleanly to the clipboard).
# The sources of truth stay in supabase/; run this again after adding a migration.
# Usage: scripts/build-sql-resources.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/resources/supabase"
SETUP="$ROOT/scripts/copy-setup-sql.sh"

# Comment and demo-text punctuation only: the SQL itself is already ASCII.
ascii() { sed -e 's/→/->/g' -e 's/—/-/g' -e 's/–/-/g' -e 's/§/section /g' "$@"; }
check_ascii() { if grep -nP '[^\x00-\x7F]' "$1"; then echo "Non-ASCII left in $1" >&2; exit 1; fi; }

rm -rf "$OUT/migrations" "$OUT/demo"
mkdir -p "$OUT/migrations" "$OUT/demo"

for f in "$ROOT"/supabase/migrations/*.sql; do
  name="$(basename "$f")"
  n=$((10#$(echo "${name%%_*}" | tail -c 7)))
  ascii "$f" > "$OUT/migrations/$(printf '%02d' "$n")_${name#*_}"
done

ascii <(bash "$SETUP" --print --status) > "$OUT/0_check_status.sql"
ascii <(bash "$SETUP" --print --no-seed) > "$OUT/1_apply_all_migrations.sql"
last=$(ls "$ROOT"/supabase/migrations/*.sql | tail -1 | xargs basename)
ascii <(bash "$SETUP" --print --no-seed --from "$((10#$(echo "${last%%_*}" | tail -c 7)))") > "$OUT/2_apply_latest_migration.sql"

i=1
for s in seed seed_games seed_social seed_contest seed_tournament; do
  ascii "$ROOT/supabase/$s.sql" > "$OUT/demo/$i-$s.sql"
  i=$((i + 1))
done
ascii "$ROOT/supabase/fixes/fix_demo_friday_table3.sql" > "$OUT/demo/fix_demo_friday_table3.sql"
ascii "$ROOT/supabase/cleanup_demo_data.sql" > "$OUT/demo/cleanup_demo_data.sql"
ascii "$ROOT/supabase/checks/security_check.sql" > "$OUT/3_security_check.sql"
ascii "$ROOT/supabase/checks/campaign_check.sql" > "$OUT/4_campaign_check.sql"

for f in "$OUT"/*.sql "$OUT"/migrations/*.sql "$OUT"/demo/*.sql; do check_ascii "$f"; done
echo "Written to ${OUT#$ROOT/}: $(ls "$OUT"/migrations | wc -l) migrations, $(ls "$OUT"/demo | wc -l) demo files."
