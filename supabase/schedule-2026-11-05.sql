-- Tegeta · güncel oturum programı (5 Kasım 2026)
-- Saatler ve sekme sırası güncellenir; sorular ve cevaplar değişmez.
begin;
update sessions set time='09:30–10:30', ord=0 where id='b2b-wholesale';
update sessions set time='10:30–11:30', ord=1 where id='after-sales';
update sessions set time='11:45–12:45', ord=2 where id='corporate-government';
update sessions set time='12:45–13:45', ord=3 where id='marketing';
update sessions set time='14:30–15:30', ord=4 where id='passenger-vehicles';
update sessions set time='15:30–16:30', ord=5 where id='heavy-vehicles';
update sessions set time='16:45–17:45', ord=6 where id='it-wrap-up';
commit;
select ord, time, name from sessions order by ord;
