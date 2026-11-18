// Parameter Supertrend (samakan dengan setting indikator di TradingView)
export const ST_PERIOD = 10; // ATR Period
export const ST_MULT = 1.5; // ATR Multiplier
// Source = (High + Low) / 2 (hl2), ATR = RMA (Wilder)

// Indeks pembanding pasar (IHSG). Cukup sertakan baris 'COMPOSITE' di file CSV yang sama.
export const INDEX_TICKER = "COMPOSITE.JK";

// ---- Skor saham (swing 1 minggu - 1 bulan) ----
// Filter likuiditas: rata-rata nilai transaksi (harga x volume) 20 hari, dalam Rupiah.
export const MIN_AVG_VALUE = 500_000_000;

// Bobot skor, total = 100. Ini titik awal, setel ulang lewat backtest.
// src/lib/config.ts
// src/lib/config.ts
// JANGAN ubah urutan key agar tetap selaras dengan array `names` di backtest.ts
export const WEIGHTS = {
  proximity: 16,    // 1) Kedekatan ke garis
  rr: 0,            // 2) Risk/reward (dinonaktifkan, terbukti negatif -2.03%)
  trendQuality: 28, // 3) Kualitas tren (faktor terkuat +2.87%)
  trendAge: 20,     // 4) Umur tren (IC paling stabil di train & test)
  pullback: 8,      // 5) Kedalaman koreksi (diubah menghargai bertahan di pucuk)
  volume: 18,       // 6) Volume mengering (IC konsisten & tekan risiko stop)
  candle: 0,        // 7) Pola candle bullish (dinonaktifkan, bull trap -1.35%)
  relStrength: 10,  // 8) Kekuatan relatif (filter pemimpin pasar +1.52%)
} as const;
