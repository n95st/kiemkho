-- Cần xem: the server returns raw data, canxem.js analyses it in the browser (like API.canXem in legacy/Code.gs).

create function kk.a_canxemdulieu(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
declare
  v_tap bool := u.vai_tro = 'TAP';
  v_kho text;
  v_live jsonb; v_ss jsonb;
begin
  perform kk.can_vai(u, '{TO_TRUONG,IT}');
  v_kho := kk.kiem_kho(d, req->>'kho');
  v_live := coalesce((select jsonb_agg(kk.dong_json(x) order by x.so) from kk.dong x
                       where x.dot_id = d.id and x.tap = v_tap and x.kho = v_kho and x.trang_thai = 'HIEU_LUC'), '[]'::jsonb);
  -- like lan1Totals_: rows without a ma are skipped; dvt of the first row (physical order) wins
  v_ss := coalesce((select jsonb_object_agg(g.ma, jsonb_build_object('sl', g.sl, 'dvt', g.dvt))
                      from (select s.ma, sum(coalesce(s.sl, 0)) as sl, (array_agg(s.dvt order by s.ctid))[1] as dvt
                              from kk.so_sanh s where s.dot_id = d.id and s.kho = v_kho and coalesce(s.ma, '') <> ''
                             group by s.ma) g), '{}'::jsonb);
  return jsonb_build_object(
    'live', v_live,
    'soSanh', v_ss,
    'dm', coalesce((select jsonb_object_agg(t.ma, jsonb_build_object('ten', t.ten,
                      'qc', coalesce(to_jsonb(nullif(t.quy_cach, 0)), '""'::jsonb), 'kho', coalesce(t.kho_mac_dinh, '')))
                      from kk.thuoc t
                     where t.ma in (select e->>'ma' from jsonb_array_elements(v_live) e union select k from jsonb_object_keys(v_ss) k)), '{}'::jsonb),
    'soVoi', d.so_voi,
    'choDuyet', (select count(*) from kk.dong x
                  where x.dot_id = d.id and x.tap = v_tap and x.kho = v_kho and x.trang_thai = 'CHO_DUYET'));
end $$;
