-- Foundation: schema kk (not exposed), tables, public.api gateway, PIN login.

create schema kk;
revoke all on schema kk from public, anon, authenticated;
-- Postgres grants EXECUTE to PUBLIC on every new function; the schema-scoped form cannot remove that built-in
-- default, so revoke it globally for this role (public.api re-grants to anon explicitly below).
alter default privileges revoke execute on functions from public;
alter default privileges in schema kk revoke execute on functions from public;

-- ---------------------------------------------------------------- tables
create table kk.kho (
  ma text primary key check (ma ~ '^[A-Z0-9_]{1,10}$'),
  ten text not null,
  ten_ngan text not null,
  thu_tu int not null default 0,
  hoat_dong bool not null default true
);
insert into kk.kho (ma, ten, ten_ngan, thu_tu) values
  ('CHAN', 'Kho chẵn', 'CHẴN', 1),
  ('LE',   'Kho lẻ',    'LẺ',   2);

create table kk.tai_khoan (
  tk text primary key,
  ten text not null,
  pin text not null unique check (pin ~ '^\d{4,8}$'),
  vai_tro text not null check (vai_tro in ('DEM', 'TO_TRUONG', 'IT', 'TAP')),
  hoat_dong bool not null default true,
  ghi_chu text not null default ''
);

create table kk.thuoc (
  ma text primary key,
  ten text not null,
  dvt_nhap text not null default '',
  quy_cach numeric,
  dvt text not null,
  kho_mac_dinh text references kk.kho,
  gtin text[] not null default '{}',
  nguon text not null default '',
  cap_nhat timestamptz not null default now()
);

create table kk.cau_hinh (
  khoa text primary key,
  gia_tri jsonb not null
);
insert into kk.cau_hinh (khoa, gia_tri) values
  ('LO_MAC_DINH', '"KHONGLO"'),
  ('HSD_MAC_DINH', '"31/12/2099"'),
  ('HSD_CANH_BAO_NGAY', '90'),
  ('DVT_LIST', '["Viên","Gói","Ống","Chai","Lọ","Tuýp","Hộp","Vỉ","Miếng","Cái","Bịch","Túi","Tép","Que","Bộ","Hũ","Bình","Can","Máy","Cuộn","Đôi","Liều"]'),
  ('LO_NGHI', '["MFG","MFD","NSX","EXP","HSD","LOT","BATCH"]');

create table kk.dot (
  id text primary key,
  ten text unique not null,
  trang_thai text not null default 'MO' check (trang_thai in ('MO', 'DONG')),
  kho text[] not null,
  ngay_tao timestamptz not null default now(),
  nguoi_tao text not null default '',
  so_voi text not null default '',
  ghi_chu text not null default '',
  so_dong int not null default 0,
  so_thuoc_moi int not null default 0
);

create table kk.dot_kho (
  dot_id text references kk.dot,
  kho text references kk.kho,
  trang_thai text not null default 'DANG_KIEM' check (trang_thai in ('DANG_KIEM', 'DA_CHOT')),
  cap_nhat text not null default '',
  primary key (dot_id, kho)
);

create table kk.dong (
  dot_id text references kk.dot,
  so int,
  tap bool not null,
  tg timestamptz not null default now(),
  kho text not null,
  ma text not null,
  ten text not null,
  lo text not null default '',
  hsd date,
  hoc text not null,
  hop numeric,
  qc numeric,
  le numeric,
  sl numeric not null,
  dvt text not null,
  nguoi text not null,
  tk text not null,
  thao_tac text not null,
  trang_thai text not null check (trang_thai in ('HIEU_LUC', 'THAY_THE', 'HUY', 'CHO_DUYET', 'TU_CHOI')),
  thay_boi int,
  ghi text not null default '',
  canh_bao text not null default '',
  req_id text,
  cap_nhat text not null default '',
  se_thay int[] not null default '{}',
  primary key (dot_id, so),
  unique (dot_id, req_id)
);
create index on kk.dong (dot_id, tap, kho, ma);
create index on kk.dong (dot_id, tap, tk, so desc);

create table kk.hoc (
  dot_id text references kk.dot,
  tap bool,
  kho text,
  hoc text,
  trang_thai text not null default 'CHUA_NHAN' check (trang_thai in ('CHUA_NHAN', 'DANG_DEM', 'XONG')),
  nguoi text not null default '',
  bat_dau timestamptz,
  xong_luc timestamptz,
  nguoi_xong text not null default '',
  ghi text not null default '',
  primary key (dot_id, tap, kho, hoc)
);

create table kk.thuoc_moi (
  dot_id text references kk.dot,
  so int,
  tg timestamptz not null default now(),
  ma_de_xuat text not null default '',
  ten text not null,
  dvt_nhap text not null default '',
  qc_goc numeric,
  dvt text not null,
  kho text not null,
  nguoi text not null,
  trang_thai text not null default 'CHO_DUYET',
  ma_chinh_thuc text not null default '',
  ghi_chu text not null default '',
  primary key (dot_id, so)
);

-- replaces the old LAN1 sheet
create table kk.so_sanh (
  dot_id text references kk.dot,
  kho text,
  ma text,
  ten text,
  lo text,
  hsd date,
  sl numeric,
  dvt text,
  hoc text,
  nguoi text
);

create table kk.nhat_ky (
  id bigint generated always as identity primary key,
  tg timestamptz not null default now(),
  dot_id text,
  tk text,
  ten text,
  hanh_dong text,
  chi_tiet text
);

create table kk.pin_sai (
  khoa text primary key,
  so_lan int not null,
  het_han timestamptz not null
);

-- ---------------------------------------------------------------- helpers
-- Returns the account for a PIN, or null for a wrong PIN (never raises for that:
-- the caller must be able to persist the fail counter). Raises only when the IP is locked.
create function kk.xac_thuc(pin text, ip text) returns kk.tai_khoan
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
declare u kk.tai_khoan;
begin
  -- per-IP limit 20, plus a global cap of 60 failures so rotating IPs cannot brute-force PINs
  if exists (select 1 from kk.pin_sai p where p.khoa = ip and p.so_lan >= 20 and p.het_han > now())
     or (select coalesce(sum(p.so_lan), 0) from kk.pin_sai p where p.het_han > now()) >= 60 then
    raise exception 'Tạm khoá đăng nhập 10 phút vì nhập sai PIN quá nhiều lần';
  end if;
  select * into u from kk.tai_khoan t where t.pin = trim(coalesce(xac_thuc.pin, ''));
  return u;
end $$;

-- Like useDot_: picks the đợt, optionally refusing when it is closed.
create function kk.dung_dot(id text, u kk.tai_khoan, ghi bool) returns kk.dot
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
declare d kk.dot;
begin
  select * into d from kk.dot x where x.id = dung_dot.id;
  if not found then
    if coalesce(id, '') = '' then
      raise exception 'Chưa chọn đợt kiểm – chọn đợt (☰ → Đổi đợt kiểm)';
    end if;
    raise exception 'Không thấy đợt kiểm % – chọn lại đợt (☰ → Đổi đợt kiểm)', id;
  end if;
  if d.trang_thai <> 'MO' and ghi then
    raise exception 'Đợt "%" đã đóng – chỉ xem được. Cần nhập thêm thì báo IT mở lại đợt', d.ten;
  end if;
  return d;
end $$;

create function kk.ghi_nhat_ky(u kk.tai_khoan, dot_id text, hanh_dong text, chi_tiet text) returns void
language sql security definer set search_path = kk, extensions, pg_temp as $$
  insert into kk.nhat_ky (dot_id, tk, ten, hanh_dong, chi_tiet) values (dot_id, u.tk, u.ten, hanh_dong, chi_tiet);
$$;

-- Like dotPublic_
create function kk.dot_json(d kk.dot, u kk.tai_khoan) returns jsonb
language sql stable security definer set search_path = kk, extensions, pg_temp as $$
  select jsonb_build_object('id', d.id, 'ten', d.ten, 'st', d.trang_thai, 'kho', to_jsonb(d.kho),
           'ngay', to_char(d.ngay_tao at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY'), 'soVoi', d.so_voi)
    || case when u.vai_tro = 'IT' then jsonb_build_object('url', '', 'nguoi', d.nguoi_tao, 'ghi', d.ghi_chu) else '{}' end;
$$;

-- Like dotInfo_, for every kho of the đợt
create function kk.dot_info(d kk.dot, u kk.tai_khoan) returns jsonb
language sql stable security definer set search_path = kk, extensions, pg_temp as $$
  select kk.dot_json(d, u) || jsonb_build_object('trangThai',
    (select coalesce(jsonb_object_agg(k, coalesce(dk.trang_thai, 'DANG_KIEM')), '{}')
       from unnest(d.kho) k left join kk.dot_kho dk on dk.dot_id = d.id and dk.kho = k));
$$;

-- ---------------------------------------------------------------- actions
create function kk.a_login(u kk.tai_khoan, d kk.dot, req jsonb) returns jsonb
language plpgsql stable security definer set search_path = kk, extensions, pg_temp as $$
declare vis kk.dot[]; x kk.dot; picked kk.dot; info jsonb;
begin
  select coalesce(array_agg(t order by t.id), '{}') into vis from kk.dot t
   where t.trang_thai = 'MO' or u.vai_tro in ('TO_TRUONG', 'IT');
  foreach x in array vis loop
    if x.id = req->>'dot' then picked := x; end if;
  end loop;
  if picked.id is not null then info := kk.dot_info(picked, u); end if;
  return jsonb_build_object(
    'tk', u.tk, 'ten', u.ten, 'role', u.vai_tro,
    'roleTen', case u.vai_tro when 'DEM' then 'Người đếm' when 'TO_TRUONG' then 'Tổ trưởng' when 'IT' then 'IT' else 'Tập (không tính)' end,
    'tap', u.vai_tro = 'TAP',
    'loMacDinh', (select gia_tri from kk.cau_hinh where khoa = 'LO_MAC_DINH'),
    'hsdMacDinh', (select gia_tri from kk.cau_hinh where khoa = 'HSD_MAC_DINH'),
    'hsdCanhBao', (select gia_tri from kk.cau_hinh where khoa = 'HSD_CANH_BAO_NGAY'),
    'loNghi', (select gia_tri from kk.cau_hinh where khoa = 'LO_NGHI'),
    'dvt', (select gia_tri from kk.cau_hinh where khoa = 'DVT_LIST'),
    'khos', (select coalesce(jsonb_agg(jsonb_build_object('ma', ma, 'ten', ten, 'tenNgan', ten_ngan) order by thu_tu, ma), '[]')
               from kk.kho where hoat_dong),
    'dots', (select coalesce(jsonb_agg(kk.dot_json(v, u) order by v.id), '[]') from unnest(vis) v),
    'dotInfo', info,
    'dot', coalesce(info->>'ten', ''),
    'trangThai', coalesce(info->'trangThai', '{}'),
    'hubUrl', '');
end $$;

-- ---------------------------------------------------------------- gateway
create function public.api(req jsonb) returns jsonb
language plpgsql security definer set search_path = kk, extensions, pg_temp as $$
declare
  hdr text; xff text[]; ip text; act text; u kk.tai_khoan; d kk.dot; r jsonb;
  -- actions that need no đợt (lower-case: kk.a_<name> functions are folded to lower case)
  hub text[] := '{login,danhmuc,dstaikhoan,dsdot,taodot,dattrangthaidot,luutaikhoan,datlaipin,luuthuoc,nhapthuoc,luukho,luucauhinh}';
  wr text[] := '{luu,hoantac,thuocmoi,nhanhoc,xonghoc,duyetdong,duyetthuocmoi,goplo,dattrangthaikho,luuhoc,nhapsosanh}';
begin
  -- Client IP: cf-connecting-ip, else the RIGHT-most x-forwarded-for entry (the left ones are client-supplied).
  hdr := nullif(current_setting('request.headers', true), '');
  xff := string_to_array(coalesce(hdr::json->>'x-forwarded-for', ''), ',');
  ip := left(coalesce(nullif(trim(hdr::json->>'cf-connecting-ip'), ''),
                      nullif(trim(xff[array_length(xff, 1)]), ''), 'unknown'), 64);

  u := kk.xac_thuc(req->>'pin', ip);
  if u.tk is null or not u.hoat_dong then
    delete from kk.pin_sai where het_han < now();
    insert into kk.pin_sai as p (khoa, so_lan, het_han) values (ip, 1, now() + interval '10 minutes')
    on conflict (khoa) do update
      set so_lan = case when p.het_han > now() then p.so_lan + 1 else 1 end,
          het_han = now() + interval '10 minutes';
    if u.tk is null then
      return jsonb_build_object('ok', false, 'error', 'Sai mã PIN');
    end if;
    return jsonb_build_object('ok', false, 'error', 'Tài khoản ' || u.ten || ' đang bị khoá – báo IT');
  end if;

  act := coalesce(req->>'action', '');
  if act !~ '^[A-Za-z]+$' or to_regprocedure('kk.a_' || act || '(kk.tai_khoan,kk.dot,jsonb)') is null then
    return jsonb_build_object('ok', false, 'error', 'Không có chức năng: ' || act);
  end if;
  act := lower(act);

  if not act = any (hub) then
    d := kk.dung_dot(req->>'dot', u, act = any (wr));
  end if;
  execute format('select kk.%I($1,$2,$3)', 'a_' || act) into r using u, d, req;
  return jsonb_build_object('ok', true) || coalesce(r, '{}');
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

revoke execute on function public.api(jsonb) from public;
grant execute on function public.api(jsonb) to anon;
