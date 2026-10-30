begin;
select plan(3);

-- đợt codes past DOT99 must still sort as numbers: DOT10 < DOT99 < DOT100 (text order puts DOT100 before DOT11)
insert into kk.dot (id, ten, trang_thai, kho) values
  ('DOT100', 'Đợt một trăm', 'MO', '{CHAN}'), ('DOT99', 'Đợt chín chín', 'MO', '{CHAN}'), ('DOT10', 'Đợt mười', 'DONG', '{CHAN}');

select is((select array_agg(e->>'id' order by o) from jsonb_array_elements(public.api('{"action":"login","pin":"111111"}')->'dots') with ordinality t(e, o)),
  array['DOT01', 'DOT02', 'DOT10', 'DOT99', 'DOT100'], 'login_dots_thu_tu_tu_nhien');
select is((select array_agg(e->>'id' order by o) from jsonb_array_elements(public.api('{"action":"dsDot","pin":"111111"}')->'list') with ordinality t(e, o)),
  array['DOT01', 'DOT02', 'DOT10', 'DOT99', 'DOT100'], 'dsdot_thu_tu_tu_nhien');
-- a counter sees open đợt only; the phone and the desktop page both take the last one as the newest
select is((select array_agg(e->>'id' order by o) from jsonb_array_elements(public.api('{"action":"login","pin":"444444"}')->'dots') with ordinality t(e, o)),
  array['DOT01', 'DOT99', 'DOT100'], 'login_dem_thu_tu_tu_nhien');

select * from finish();
rollback;
