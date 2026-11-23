// Parameter Supertrend (samakan dengan setting indikator di TradingView)
export const ST_PERIOD = 10; // ATR Period
export const ST_MULT = 1.5;  // ATR Multiplier
// Source = (High + Low) / 2 (hl2), ATR = RMA (Wilder)

// Indeks pembanding pasar (IHSG). Cukup sertakan baris 'COMPOSITE' di file CSV yang sama.
export const INDEX_TICKER = "COMPOSITE.JK";

// ---- Skor saham (swing 1 minggu - 1 bulan) ----
// Filter likuiditas: rata-rata nilai transaksi (harga x volume) 20 hari, dalam Rupiah.
export const MIN_AVG_VALUE = 500_000_000;

// Bobot skor, total = 100. Hasil kalibrasi Grid Search v2 (Skema W4: Seimbang + Varian D).
// JANGAN ubah urutan key agar tetap selaras dengan array `names` di backtest.ts
export const WEIGHTS = {
  proximity: 18,    // 1) Kedekatan ke garis (naik dari 16 -> timing entry dekat garis SL)
  rr: 0,            // 2) Risk/reward (dinonaktifkan, terbukti negatif -1.88%)
  trendQuality: 28, // 3) Kualitas tren (disesuaikan dari 34 -> mencegah skor terlalu berat di tren yang sudah lari jauh)
  trendAge: 20,     // 4) Umur tren (IC terkuat di test +0.067)
  pullback: 16,     // 5) Kedalaman koreksi (naik dari 12 -> apresiasi struktur koreksi sehat)
  volume: 18,       // 6) Volume mengering (IC konsisten +0.048 / +0.049)
  candle: 0,        // 7) Pola candle bullish (dinonaktifkan, bull trap -0.85%)
  relStrength: 0,   // 8) Kekuatan relatif (dinonaktifkan, IC negatif -0.014 / -0.046)
} as const;