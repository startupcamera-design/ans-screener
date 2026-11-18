// Parameter Supertrend (samakan dengan setting indikator di TradingView)
export const ST_PERIOD = 10; // ATR Period
export const ST_MULT = 1.5; // ATR Multiplier
// Source = (High + Low) / 2 (hl2), ATR = RMA (Wilder)

// Indeks pembanding pasar (IHSG). Cukup sertakan baris 'COMPOSITE' di file CSV yang sama.
export const INDEX_TICKER = "COMPOSITE.JK";

// ---- Skor saham (swing 1 minggu - 1 bulan) ----
// Filter likuiditas: rata-rata nilai transaksi (harga x volume) 20 hari, dalam Rupiah.
export const MIN_AVG_VALUE = 10_000_000;

// Bobot skor, total = 100. Ini titik awal, setel ulang lewat backtest.
export const WEIGHTS = {
  proximity: 22, // kedekatan harga ke garis Supertrend (satuan ATR)
  rr: 22, // risk/reward: target high 20 hari vs stop di garis
  trendQuality: 14, // di atas EMA50, ADX, higher low
  trendAge: 8, // umur tren sejak BUY
  pullback: 8, // kedalaman koreksi dari high 20 hari
  volume: 6, // volume mengering saat koreksi
  candle: 10, // pola candle bullish di 3 bar terakhir
  relStrength: 10, // peringkat return ~3 bulan terhadap semua emiten
} as const;
