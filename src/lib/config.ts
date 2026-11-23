// Parameter Supertrend (samakan dengan setting indikator di TradingView)
export const ST_PERIOD = 10; // ATR Period (sebelumnya 10)
export const ST_MULT = 1.5;  // ATR Multiplier (sebelumnya 1.5)
// Source = (High + Low) / 2 (hl2), ATR = RMA (Wilder)

// Indeks pembanding pasar (IHSG). Cukup sertakan baris 'COMPOSITE' di file CSV yang sama.
export const INDEX_TICKER = "COMPOSITE.JK";

// ---- Skor saham (swing 1 minggu - 1 bulan) ----
// Filter likuiditas: rata-rata nilai transaksi (harga x volume) 20 hari, dalam Rupiah.
export const MIN_AVG_VALUE = 500_000_000;

// Bobot skor, total = 100. Hasil kalibrasi backtest v2.
// JANGAN ubah urutan key agar tetap selaras dengan array `names` di backtest.ts
export const WEIGHTS = {
  proximity: 16,    // 1) Kedekatan ke garis (IC konsisten +0.025 / +0.035, tekan risiko stop)
  rr: 0,            // 2) Risk/reward (dinonaktifkan, terbukti negatif -1.88%)
  trendQuality: 34, // 3) Kualitas tren (faktor terkuat +3.51%, IC +0.043 / +0.045)
  trendAge: 20,     // 4) Umur tren (IC terkuat di test +0.067)
  pullback: 12,     // 5) Kedalaman koreksi (selisih +2.06%, IC +0.028 / +0.041)
  volume: 18,       // 6) Volume mengering (IC konsisten +0.048 / +0.049)
  candle: 0,        // 7) Pola candle bullish (dinonaktifkan, bull trap -0.85%)
  relStrength: 0,   // 8) Kekuatan relatif (dinonaktifkan, IC negatif -0.014 / -0.046)
} as const;