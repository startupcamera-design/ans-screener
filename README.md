<<<<<<< HEAD
# ANS Screener – Supertrend Saham BEI

Next.js 14 (App Router) + TypeScript + Tailwind + Supabase. Screener saham BEI berbasis Supertrend
(ATR 10, multiplier 1.5, source (H+L)/2, ATR = RMA; ubah di `src/lib/config.ts`), dengan skor swing 0–100,
pola candle bullish, grafik candlestick, banner kondisi IHSG, dan skrip backtest.

## Setup

1. **Supabase**: buat project → SQL Editor → jalankan **berurutan** `supabase/migrations/001_init.sql` lalu `002_metrics.sql`.
2. **Akun admin**: Authentication → Users → *Add user* (centang *Auto Confirm User*).
3. `cp .env.example .env.local`, isi URL, publishable key (`sb_publishable_…`), secret key (`sb_secret_…`), dan `ADMIN_EMAIL`.
4. `npm install` → `npm run dev` → http://localhost:3000.
5. Buka **/admin/upload**, login, pilih file CSV.

## Alur data

- **Backfill awal (sekali):** pilih semua file CSV 2 tahun sekaligus, **centang "Rebuild riwayat 120 bar"**. Urutan file bebas
  (upsert berdasarkan `ticker + date`).
- **Harian:** unggah 1 file CSV baru tanpa centang.
- **IHSG:** sertakan baris `COMPOSITE` di CSV yang sama. Ticker itu tampil di banner IHSG (bukan di daftar saham) dan
  dipakai sebagai rezim pasar di backtest. Nama ticker diatur lewat `INDEX_TICKER` di `src/lib/config.ts`.
- Supertrend dihitung dari 400 bar terakhir per ticker agar ATR (RMA) konvergen mendekati TradingView.

## Tampilan

- **Banner IHSG:** harga, perubahan harian, status Bullish/Bearish (Supertrend parameter sama), mini-grafik 60 hari,
  dan persentase saham yang bullish (breadth).
- **Screener:** preset (Pullback ke garis, Sinyal BUY baru, Pola candle bullish) dengan jumlah hasil, pencarian,
  filter lanjutan (bottom-sheet di mobile), urutan lewat header tabel (desktop) atau dropdown (mobile/tablet),
  kartu di layar kecil dan tabel di layar lebar. Pilihan filter tersimpan di browser.
- **Detail saham `/stock/BBCA.JK`:** candlestick (lightweight-charts), volume, garis Supertrend, penanda BUY/SELL dan pola,
  harian/mingguan, rincian skor.

## Skor saham (swing 1 minggu – 1 bulan)

Hanya saham **bullish** dengan rata-rata nilai transaksi 20 hari ≥ `MIN_AVG_VALUE` (Rp 10 juta) yang diberi skor.
Bobot (total 100) di `src/lib/config.ts`: kedekatan ke garis (ATR) 22, risk/reward 22, kualitas tren 14, umur tren 8,
kedalaman koreksi 8, volume mengering 6, pola candle bullish 10, kekuatan relatif 10.
**Bobot adalah titik awal, belum terbukti oleh backtest pada data Anda.**

Pola candle bullish: Hammer, Bullish Engulfing, Piercing Line, Bullish Harami, Morning Star, Three White Soldiers
(pola reversal hanya dihitung bila harga turun sebelumnya).

## Backtest

```bash
npm run backtest -- ./folder-csv-anda            # butuh `npm install` (memakai tsx)
npm run backtest:node -- ./folder-csv-anda       # alternatif tanpa tsx: Node 22.6+
# opsi: --cost 0.004 --split 0.7 --step 1 --horizons 5,10,20 --min-value 10000000 --warmup 100 --out backtest-out --dump
```

Input: folder berisi semua file CSV Anda (2 tahun, banyak file). Keluaran di `backtest-out/`:
`backtest-report.md` (laporan), `backtest-buckets.csv`, dan `backtest-signals.csv` bila memakai `--dump`.

Yang dilaporkan: hasil per kuintil skor (train dan test terpisah; batas kuintil hanya dari train), rata-rata/median return,
persentase menang, persentase kena stop (Supertrend berbalik), MAE, daya prediksi tiap faktor (Spearman IC, dikoreksi
tumpang-tindih), dan hasil menurut rezim IHSG.

Aturan simulasi: sinyal dinilai di close hari t, entry di open hari t+1, biaya round-trip 0,4%, tanpa look-ahead
(dijaga tes `tests/metrics.test.ts`). Tidak memodelkan ARA/ARB, slippage, atau corporate action.
Uji coba tanpa data asli: `node tests/gen-synthetic.mjs ./syn` lalu jalankan backtest ke `./syn`. Data acak itu
seharusnya menunjukkan **tidak ada** keunggulan skor.

## Struktur

```
supabase/migrations/001_init.sql, 002_metrics.sql   skema, view screener_latest, RLS, grant
scripts/backtest.ts                                  backtest
src/lib/{supertrend,csv,candles,metrics,scoring,timeframe,config}.ts   logika murni (diuji)
src/app/api/{upload,recompute}/route.ts              tulis harga; hitung Supertrend + metrik (hanya admin)
src/components/{Screener,MarketBanner,StockChart,ScoreBreakdown,UploadClient}.tsx
tests/                                               `npm test`
```

## Catatan

- Kolom **Jarak (ATR)** = (harga − garis Supertrend) / ATR. **R:R** = (high 20 hari − harga) / (harga − garis).
- "Sinyal BUY/SELL baru" = Supertrend berbalik pada bar terakhir emiten tersebut.
- Emiten yang tidak ikut file terakhir ditandai data lama dan disembunyikan secara default; tidak diberi skor.
- Keamanan: secret key hanya dipakai di route handler server dan penulisan data diverifikasi terhadap `ADMIN_EMAIL`.
- Alat bantu analisis teknikal, bukan rekomendasi investasi.
=======
# ans-screener
>>>>>>> eab0b634213a0800670894e800aba41b0b3b5d4b
