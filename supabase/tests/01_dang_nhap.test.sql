begin;
select plan(15);

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

-- IP lock: 20 wrong PINs from one IP, then even the right PIN is refused
select set_config('request.headers', '{"x-forwarded-for":"9.9.9.9, 10.0.0.1"}', true);
do $$ begin
  for i in 1..20 loop perform public.api('{"action":"login","pin":"123"}'); end loop;
end $$;
select is((select so_lan from kk.pin_sai where khoa = '9.9.9.9'), 20, 'dem_sai_theo_ip');
select is((public.api('{"action":"login","pin":"444444"}')->>'error'),
  'Tạm khoá đăng nhập 10 phút vì nhập sai PIN quá nhiều lần', 'khoa_ip');
select set_config('request.headers', '{"x-forwarded-for":"8.8.8.8"}', true);
select is((public.api('{"action":"login","pin":"444444"}')->>'ok'), 'true', 'ip_khac_van_dang_nhap');

select ok(not has_table_privilege('anon', 'kk.dong', 'select'), 'anon_khong_doc_bang');
select ok(not has_function_privilege('anon', 'kk.a_login(kk.tai_khoan, kk.dot, jsonb)', 'execute'), 'anon_khong_goi_ham_kk');
select ok(has_function_privilege('anon', 'public.api(jsonb)', 'execute'), 'anon_goi_duoc_api');

select * from finish();
rollback;
