-- ANS Stock Screener : skema database (jalankan di Supabase > SQL Editor)

create table if not exists stocks (
  ticker     text primary key,              -- contoh: 'BBCA.JK'
  name       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Data OHLCV harian
create table if not exists prices (
  ticker  text    not null references stocks(ticker) on delete cascade,
  date    date    not null,
  open    numeric(18,4) not null check (open  > 0),
  high    numeric(18,4) not null check (high  > 0),
  low     numeric(18,4) not null check (low   > 0),
  close   numeric(18,4) not null check (close > 0),
  volume  bigint  not null default 0 check (volume >= 0),
  primary key (ticker, date)                -- kunci untuk upsert
);
create index if not exists prices_date_idx on prices (date desc);

-- Hasil Supertrend per hari (diisi oleh /api/recompute)
create table if not exists supertrend_daily (
  ticker  text not null,
  date    date not null,
  atr     numeric(18,6),
  lower   numeric(18,4),        -- garis "up"  (support, aktif saat bullish)
  upper   numeric(18,4),        -- garis "dn"  (resistance, aktif saat bearish)
  trend   smallint not null check (trend in (1, -1)),   -- 1 bullish, -1 bearish
  signal  text check (signal in ('BUY', 'SELL')),       -- null = tidak ada pergantian
  prs     numeric(10,4),        -- (close - garis aktif) / close * 100
  primary key (ticker, date),
  foreign key (ticker, date) references prices(ticker, date) on delete cascade
);

-- Log upload
create table if not exists upload_logs (
  id          uuid primary key default gen_random_uuid(),
  filename    text,
  rows_total  int,
  rows_ok     int,
  rows_failed int,
  date_min    date,
  date_max    date,
  created_at  timestamptz not null default now()
);

-- View untuk halaman screener: baris terakhir tiap ticker
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
       (r.date - f.flip_date) as days_since_flip
from ranked r
left join last_flip f on f.ticker = r.ticker
where r.rn = 1;

-- Keamanan: baca publik, tulis hanya lewat service role (API server)
alter table stocks           enable row level security;
alter table prices           enable row level security;
alter table supertrend_daily enable row level security;
alter table upload_logs      enable row level security;

create policy "read stocks" on stocks           for select using (true);
create policy "read prices" on prices           for select using (true);
create policy "read st"     on supertrend_daily for select using (true);
-- upload_logs: tanpa policy = hanya service role yang bisa akses

-- Hak akses (proyek Supabase baru tidak lagi memberi grant otomatis)
grant usage on schema public to anon, authenticated;
grant select on public.stocks, public.prices, public.supertrend_daily to anon, authenticated;
grant select on public.screener_latest to anon, authenticated;
grant all on public.stocks, public.prices, public.supertrend_daily, public.upload_logs to service_role;
