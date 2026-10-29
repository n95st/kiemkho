#!/usr/bin/env bash
# Two people press "Đếm lại hộc" on the same lô + hộc at the same moment:
# exactly one HIEU_LUC line must remain and exactly one of them must get a conflict.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
q() { psql "$DB" -XAtq -v ON_ERROR_STOP=1 -c "$1"; }

supabase db reset >/dev/null

for i in $(seq 1 20); do
  q "delete from kk.dong where dot_id = 'DOT01'" >/dev/null
  id=$(q "select public.api('{\"action\":\"luu\",\"pin\":\"444444\",\"dot\":\"DOT01\",\"kho\":\"CHAN\",\"ma\":\"TT-0001\",\"hoc\":\"A 1\",\"le\":5,\"lo\":\"A1\",\"hsd\":\"15/03/2027\"}')->>'id'")
  # both sessions sleep until the same instant, then call the API (separate statements, so no open transaction while waiting)
  at=$(q "select extract(epoch from clock_timestamp()) + 0.5")
  for pin in 444444 222222; do
    psql "$DB" -XAtq -v ON_ERROR_STOP=1 \
      -c "select pg_sleep(greatest(0, $at - extract(epoch from clock_timestamp())))" \
      -c "select public.api('{\"action\":\"luu\",\"pin\":\"$pin\",\"dot\":\"DOT01\",\"kho\":\"CHAN\",\"ma\":\"TT-0001\",\"hoc\":\"A 1\",\"le\":7,\"lo\":\"A1\",\"hsd\":\"15/03/2027\",\"thaoTac\":\"DEM_LAI_HOC\",\"seen\":[\"$id\"]}')" \
      > "$TMP/$pin" &
  done
  wait
  con=$(q "select count(*) from kk.dong where dot_id = 'DOT01' and hoc = 'A 1' and trang_thai = 'HIEU_LUC'")
  xd=$(cat "$TMP/444444" "$TMP/222222" | grep -c '"conflict": true' || true)
  if [ "$con" != 1 ] || [ "$xd" != 1 ]; then
    echo "FAIL lần $i: $con dòng HIEU_LUC, $xd lệnh nhận conflict"
    cat "$TMP/444444" "$TMP/222222"
    exit 1
  fi
done
echo OK
