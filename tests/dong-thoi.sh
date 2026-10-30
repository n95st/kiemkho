#!/usr/bin/env bash
# Race checks. 1) two people press "Đếm lại hộc" on the same lô + hộc at the same moment:
# exactly one HIEU_LUC line must remain and exactly one of them must get a conflict. 2) hoanTac vs đếm lại. 3) duyệt thuốc mới vs lưu.
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

# Runs two api calls (JSON strings) at the same instant; results land in $TMP/r1 and $TMP/r2.
race2() {
  local at; at=$(q "select extract(epoch from clock_timestamp()) + 0.5")
  local i=0 j
  for j in "$1" "$2"; do
    i=$((i + 1))
    psql "$DB" -XAtq -v ON_ERROR_STOP=1 \
      -c "select pg_sleep(greatest(0, $at - extract(epoch from clock_timestamp())))" \
      -c "select public.api('$j')" > "$TMP/r$i" &
  done
  wait
}

# hoanTac of the newest line vs a second "Đếm lại hộc" that saw that line: exactly one HIEU_LUC must remain.
for i in $(seq 1 20); do
  q "delete from kk.dong where dot_id = 'DOT01'" >/dev/null
  r1=$(q "select public.api('{\"action\":\"luu\",\"pin\":\"444444\",\"dot\":\"DOT01\",\"kho\":\"CHAN\",\"ma\":\"TT-0001\",\"hoc\":\"A 1\",\"le\":5,\"lo\":\"A1\",\"hsd\":\"15/03/2027\"}')->>'id'")
  r2=$(q "select public.api('{\"action\":\"luu\",\"pin\":\"444444\",\"dot\":\"DOT01\",\"kho\":\"CHAN\",\"ma\":\"TT-0001\",\"hoc\":\"A 1\",\"le\":6,\"lo\":\"A1\",\"hsd\":\"15/03/2027\",\"thaoTac\":\"DEM_LAI_HOC\",\"seen\":[\"$r1\"]}')->>'id'")
  race2 "{\"action\":\"hoantac\",\"pin\":\"444444\",\"dot\":\"DOT01\",\"id\":\"$r2\"}" \
        "{\"action\":\"luu\",\"pin\":\"444444\",\"dot\":\"DOT01\",\"kho\":\"CHAN\",\"ma\":\"TT-0001\",\"hoc\":\"A 1\",\"le\":9,\"lo\":\"A1\",\"hsd\":\"15/03/2027\",\"thaoTac\":\"DEM_LAI_HOC\",\"seen\":[\"$r2\"]}"
  con=$(q "select count(*) from kk.dong where dot_id = 'DOT01' and hoc = 'A 1' and trang_thai = 'HIEU_LUC'")
  if [ "$con" != 1 ]; then echo "FAIL hoanTac vs đếm lại, lần $i: $con dòng HIEU_LUC"; cat "$TMP/r1" "$TMP/r2"; exit 1; fi
done

# IT approves a new-drug proposal while someone saves a count under the same MOI code (same kho, then another kho):
# no MOI-% line may stay CHO_DUYET once the proposal is DA_DUYET.
for kho in CHAN LE; do
  for i in $(seq 1 20); do
    q "delete from kk.dong where dot_id = 'DOT01'; delete from kk.thuoc_moi where dot_id = 'DOT01'; delete from kk.thuoc where ma = 'TT-0100'; update kk.dot set so_thuoc_moi = 0 where id = 'DOT01'" >/dev/null
    q "select public.api('{\"action\":\"thuocmoi\",\"pin\":\"444444\",\"dot\":\"DOT01\",\"kho\":\"CHAN\",\"ten\":\"Thuoc la 10mg\",\"dvt\":\"Viên\",\"hoc\":\"M 1\",\"le\":2,\"lo\":\"M1\",\"hsd\":\"15/03/2027\"}')" >/dev/null
    race2 '{"action":"duyetthuocmoi","pin":"111111","dot":"DOT01","id":"M001","chapNhan":true,"ma":"TT-0100"}' \
          "{\"action\":\"luu\",\"pin\":\"555555\",\"dot\":\"DOT01\",\"kho\":\"$kho\",\"ma\":\"MOI-M001\",\"dvt\":\"Viên\",\"hoc\":\"M 2\",\"le\":1,\"lo\":\"M2\",\"hsd\":\"15/03/2027\"}"
    st=$(q "select trang_thai from kk.thuoc_moi where dot_id = 'DOT01' and so = 1")
    stuck=$(q "select count(*) from kk.dong where dot_id = 'DOT01' and ma like 'MOI-%' and trang_thai = 'CHO_DUYET'")
    if [ "$st" != DA_DUYET ] || [ "$stuck" != 0 ]; then
      echo "FAIL duyệt thuốc mới vs lưu (kho $kho), lần $i: đề xuất $st, $stuck dòng MOI- kẹt chờ duyệt"; cat "$TMP/r1" "$TMP/r2"; exit 1
    fi
  done
done
# IT closes a kho (DA_CHOT) while someone saves a count without a reason: the save must wait for the commit and then be refused,
# never slip in as a plain HIEU_LUC line after the kho is closed. Session 1 holds the closing transaction open for 2 s.
q "delete from kk.dong where dot_id = 'DOT01'; update kk.dot_kho set trang_thai = 'DANG_KIEM' where dot_id = 'DOT01'" >/dev/null
psql "$DB" -XAtq -v ON_ERROR_STOP=1 > "$TMP/chot" <<'SQL' &
begin;
select public.api('{"action":"dattrangthaikho","pin":"111111","dot":"DOT01","kho":"CHAN","trangThai":"DA_CHOT"}');
select pg_sleep(2);
commit;
SQL
sleep 1
res=$(q "select public.api('{\"action\":\"luu\",\"pin\":\"444444\",\"dot\":\"DOT01\",\"kho\":\"CHAN\",\"ma\":\"TT-0001\",\"hoc\":\"A 1\",\"le\":5,\"lo\":\"A1\",\"hsd\":\"15/03/2027\"}')")
wait
n=$(q "select count(*) from kk.dong where dot_id = 'DOT01' and trang_thai = 'HIEU_LUC'")
if [ "$n" != 0 ] || ! echo "$res" | grep -q 'đã chốt'; then
  echo "FAIL chốt kho vs lưu: $n dòng HIEU_LUC, trả lời: $res"; exit 1
fi
q "delete from kk.dong where dot_id = 'DOT01'; update kk.dot_kho set trang_thai = 'DANG_KIEM' where dot_id = 'DOT01'" >/dev/null
q "delete from kk.dong where dot_id = 'DOT01'; delete from kk.thuoc_moi where dot_id = 'DOT01'; delete from kk.thuoc where ma = 'TT-0100'; update kk.dot set so_thuoc_moi = 0 where id = 'DOT01'" >/dev/null
echo OK
