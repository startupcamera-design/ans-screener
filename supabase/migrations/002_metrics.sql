-- Metrik untuk skor saham (satu baris per ticker = bar terakhir). Jalankan setelah 001.

create table if not exists screener_metrics (
  ticker        text primary key references stocks(ticker) on delete cascade,
  date          date not null,
  dist_atr      numeric,
  rr            numeric,
  bars_in_trend int,
  adx           numeric,
  above_ema50   boolean,
  higher_low    boolean,
  retrace       numeric,
  vol_ratio     numeric,
  ret60         numeric,
  avg_value20   numeric,
  atr_pct       numeric,
  pattern       text,
  pattern_age   smallint
);

alter table screener_metrics enable row level security;
create policy "read metrics" on screener_metrics for select using (true);

-- View diperbarui: kolom baru ditambahkan di AKHIR
create or replace view screener_latest
with (security_invoker = true) as
with ranked as (
  select s.ticker, s.date, s.trend, s.signal, s.lower, s.upper, s.prs, s.atr,
         p.close, p.volume,
         lag(p.close) over (partition by s.ticker order by s.date) as prev_close,
         row_number() over (partition by s.ticker order by s.date desc) as rn
  from supertrend_daily s
  join prices p on p.ticker = s.ticker and p.date = s.date
),
last_flip as (
  select ticker, max(date) as flip_date
  from supertrend_daily
  where signal is not null
  group by ticker
)
select r.ticker,
       r.date,
       r.close,
       r.volume,
       round((r.close - r.prev_close) / nullif(r.prev_close, 0) * 100, 2) as change_pct,
       r.trend,
       r.signal,
       case when r.trend = 1 then r.lower else r.upper end as line,
       r.prs,
       r.atr,
       (r.date - f.flip_date) as days_since_flip,
       m.dist_atr, m.rr, m.bars_in_trend, m.adx, m.above_ema50, m.higher_low,
       m.retrace, m.vol_ratio, m.ret60, m.avg_value20, m.atr_pct, m.pattern, m.pattern_age
from ranked r
left join last_flip f on f.ticker = r.ticker
left join screener_metrics m on m.ticker = r.ticker and m.date = r.date
where r.rn = 1;

grant select on public.screener_metrics to anon, authenticated;
grant select on public.screener_latest to anon, authenticated;
grant all on public.screener_metrics to service_role;
