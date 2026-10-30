begin;
select plan(26);

select is((public.api('{"action":"login","pin":"123"}')->>'error'), 'Sai mã PIN', 'pin_sai');
select is((public.api('{"action":"login","pin":"000000"}')->>'error'),
  'Tài khoản ' || (select ten from kk.tai_khoan where tk = 'TK99') || ' đang bị khoá – báo IT', 'tai_khoan_khoa');
select is((public.api('{"action":"xyz","pin":"444444"}')->>'error'), 'Không có chức năng: xyz', 'action_la');
select is((public.api('{"action":"login","pin":"444444"}')->>'role'), 'DEM', 'login_dem');
select is(jsonb_array_length(public.api('{"action":"login","pin":"444444"}')->'dots'), 1, 'dem_chi_thay_dot_mo');
select is(jsonb_array_length(public.api('{"action":"login","pin":"111111"}')->'dots'), 2, 'it_thay_ca_dot_dong');
select is((public.api('{"action":"login","pin":"111111"}')->'dots'->0->>'url'), '', 'it_co_url');
select is((public.api('{"action":"login","pin":"444444","dot":"DOT01"}')->'dotInfo'->'trangThai'->>'CHAN'), 'DANG_KIEM', 'login_kem_dot');
select is((public.api('{"action":"login","pin":"444444"}')->'khos'->0->>'tenNgan'), 'CHẴN', 'login_tra_kho');

-- disabled account: legacy message, but the attempt also counts as a failure for that IP
select set_config('request.headers', '{"x-forwarded-for":"7.7.7.7"}', true);
select public.api('{"action":"login","pin":"000000"}');
select is((public.api('{"action":"login","pin":"000000"}')->>'error'),
  'Tài khoản ' || (select ten from kk.tai_khoan where tk = 'TK99') || ' đang bị khoá – báo IT', 'khoa_van_dung_thong_bao');
select is((select so_lan from kk.pin_sai where khoa = '7.7.7.7'), 2, 'tai_khoan_khoa_tinh_lan_sai');

-- IP lock keys on the RIGHT-most x-forwarded-for entry: 20 wrong PINs, then even the right PIN is refused
select set_config('request.headers', '{"x-forwarded-for":"5.4.3.2, 10.0.0.1"}', true);
do $$ begin
  for i in 1..20 loop perform public.api('{"action":"login","pin":"123"}'); end loop;
end $$;
select is((select so_lan from kk.pin_sai where khoa = '10.0.0.1'), 20, 'dem_sai_theo_ip_phai_nhat');
select is((public.api('{"action":"login","pin":"444444"}')->>'error'),
  'Tạm khoá đăng nhập 10 phút vì nhập sai PIN quá nhiều lần', 'khoa_ip');
select set_config('request.headers', '{"x-forwarded-for":"8.8.8.8"}', true);
select is((public.api('{"action":"login","pin":"444444"}')->>'ok'), 'true', 'ip_khac_van_dang_nhap');

-- spoofing: varying the client-supplied left entry must not dodge the lock
do $$ begin
  for i in 1..20 loop
    perform set_config('request.headers', '{"x-forwarded-for":"1.1.1.' || i || ', 9.9.9.9"}', true);
    perform public.api('{"action":"login","pin":"123"}');
  end loop;
end $$;
select set_config('request.headers', '{"x-forwarded-for":"2.2.2.2, 9.9.9.9"}', true);
select is((public.api('{"action":"login","pin":"444444"}')->>'error'),
  'Tạm khoá đăng nhập 10 phút vì nhập sai PIN quá nhiều lần', 'gia_mao_xff_van_bi_khoa');
select is((select count(*)::int from kk.pin_sai where khoa like '1.1.1.%'), 0, 'gia_mao_xff_khong_them_hang');

-- cf-connecting-ip wins over x-forwarded-for
select set_config('request.headers', '{"cf-connecting-ip":"6.6.6.6","x-forwarded-for":"3.3.3.3"}', true);
select public.api('{"action":"login","pin":"123"}');
select is((select so_lan from kk.pin_sai where khoa = '6.6.6.6'), 1, 'cf_uu_tien_hon_xff');
select is((select count(*)::int from kk.pin_sai where khoa = '3.3.3.3'), 0, 'xff_bi_bo_qua_khi_co_cf');

-- key is cut to 64 chars; expired rows are purged on the next failure
select set_config('request.headers', '{"cf-connecting-ip":"' || repeat('a', 100) || '"}', true);
insert into kk.pin_sai values ('het-han', 5, now() - interval '1 hour');
select public.api('{"action":"login","pin":"123"}');
select ok(exists (select 1 from kk.pin_sai where khoa = repeat('a', 64)), 'khoa_cat_64_ky_tu');
select ok(not exists (select 1 from kk.pin_sai where khoa = 'het-han'), 'xoa_hang_het_han');

-- global cap: 60 failures across different IPs lock everyone, even a fresh IP with a correct PIN
select set_config('request.headers', '{"x-forwarded-for":"4.4.4.4"}', true);
select is((public.api('{"action":"login","pin":"444444"}')->>'ok'), 'true', 'duoi_tran_chung_van_dang_nhap');
-- top the live total up to exactly 59 (one below the cap): still open
insert into kk.pin_sai select 'g1', 59 - coalesce(sum(so_lan), 0), now() + interval '5 minutes' from kk.pin_sai where het_han > now();
select is((public.api('{"action":"login","pin":"444444"}')->>'ok'), 'true', 'duoi_tran_chung_59');
update kk.pin_sai set so_lan = so_lan + 1 where khoa = 'g1';
select is((public.api('{"action":"login","pin":"444444"}')->>'error'),
  'Tạm khoá đăng nhập 10 phút vì nhập sai PIN quá nhiều lần', 'tran_chung_60');

select ok(not has_table_privilege('anon', 'kk.dong', 'select'), 'anon_khong_doc_bang');
select ok(not has_function_privilege('anon', 'kk.a_login(kk.tai_khoan, kk.dot, jsonb)', 'execute'), 'anon_khong_goi_ham_kk');
select ok(has_function_privilege('anon', 'public.api(jsonb)', 'execute'), 'anon_goi_duoc_api');

select * from finish();
rollback;
