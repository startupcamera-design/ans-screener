# Laporan Audit Final Ketajaman Skor ANS Screener

- **Konfigurasi Aktif:** Supertrend ATR 10, Mult 1.5 | Bobot: { proximity: 18, trendQuality: 28, trendAge: 20, pullback: 16, volume: 18 } | Penalti: Varian D
- **Dataset:** 468 file, 1115 ticker, periode 2025-06-13 s/d 2026-11-20
- **Populasi Uji:** 79256 sinyal bullish & likuid (≥ Rp 500.000.000/hari), sampling tiap 1 bar
- **Pembagian Data:** TRAIN < 2026-06-24 (55561 sinyal) | TEST (Out-of-Sample) ≥ 2026-06-24 (23695 sinyal)
- **Biaya & Horizon:** Round-trip 0.40% (entry OPEN t+1), horizon utama **10 hari bursa**

## 1. Performa Top Pick Aplikasi (Periode TEST · Out-of-Sample)

Evaluasi langsung aturan eksekusi aplikasi (`Skor ≥ 86` dan filter risiko `SL ≤ 8%`) lintas horizon waktu:

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | Profit Factor | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Pembanding: Semua sinyal bullish (5h) | 22712 | -1.05% | -1.08% | 40.4% | 33.6% | -1.22% | 0.66 | -6.46% | 36.7% |
| Skor ≥ 86 tanpa filter SL (5h) | 1289 | 0.48% | -0.40% | 46.2% | 26.0% | 0.27% | 1.09 | -6.24% | 59.5% |
| **Top Pick Aplikasi: Skor ≥ 86 & SL ≤ 8% (5h)** | 942 | 1.14% | -0.40% | 48.1% | 24.5% | 0.84% | 1.36 | -4.89% | 57.6% |
| Pembanding: Semua sinyal bullish (10h) | 21789 | -0.62% | -0.99% | 43.4% | 54.9% | -1.04% | 0.77 | -8.94% | 47.8% |
| Skor ≥ 86 tanpa filter SL (10h) | 1257 | 2.03% | -0.40% | 48.9% | 47.7% | 1.08% | 1.28 | -8.51% | 71.6% |
| **Top Pick Aplikasi: Skor ≥ 86 & SL ≤ 8% (10h)** | 914 | 3.05% | 0.23% | 50.8% | 46.4% | 2.08% | 1.70 | -6.59% | 71.4% |
| Pembanding: Semua sinyal bullish (20h) | 20330 | -0.51% | -1.13% | 45.6% | 76.9% | -0.08% | 0.98 | -12.25% | 60.2% |
| Skor ≥ 86 tanpa filter SL (20h) | 1226 | 3.70% | -1.37% | 45.4% | 75.0% | 2.72% | 1.58 | -12.39% | 78.1% |
| **Top Pick Aplikasi: Skor ≥ 86 & SL ≤ 8% (20h)** | 885 | 4.40% | -0.40% | 47.5% | 75.7% | 3.11% | 1.83 | -10.08% | 78.8% |

## 2. Gradasi Ambang Skor di Periode TEST (10 hari)

Memastikan kenaikan skor berbanding lurus dengan kualitas return dan penurunan risiko:

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | Profit Factor | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Skor < 57 (Hindari / Sideways) | 11933 | -1.68% | -1.33% | 41.4% | 59.3% | -1.95% | 0.60 | -9.51% | 38.4% |
| Skor 57–70 (Cukup · Q4) | 4896 | 0.11% | -0.40% | 45.3% | 51.0% | -0.40% | 0.90 | -8.29% | 54.5% |
| Skor 71–85 (Kuat · Q5) | 3703 | 0.94% | -0.40% | 45.7% | 48.3% | 0.32% | 1.09 | -8.10% | 61.2% |
| Skor ≥ 86 & SL > 8% (Tunggu Pullback) | 343 | -0.68% | -1.81% | 44.0% | 51.0% | -1.59% | 0.74 | -13.62% | 72.0% |
| **Skor ≥ 86 & SL ≤ 8% (Top Pick Siap Beli)** | 914 | 3.05% | 0.23% | 50.8% | 46.4% | 2.08% | 1.70 | -6.59% | 71.4% |

## 3. Perbandingan Kuintil TRAIN vs TEST (10 hari)

Batas kuintil dikunci dari periode TRAIN untuk menguji konsistensi urutan (monotonisitas) di periode TEST:

**Periode TRAIN (10 hari)**

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | Profit Factor | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Q1 (skor 0–39) | 11932 | -1.28% | -2.22% | 37.4% | 62.2% | -0.83% | 0.81 | -9.77% | 28.6% |
| Q2 (skor 40–49) | 10693 | -0.86% | -2.09% | 38.1% | 59.8% | -0.42% | 0.90 | -9.45% | 41.4% |
| Q3 (skor 50–59) | 10974 | -0.35% | -1.99% | 38.4% | 59.6% | -0.02% | 0.99 | -9.61% | 51.2% |
| Q4 (skor 60–73) | 11502 | 1.38% | -1.39% | 41.7% | 58.0% | 1.37% | 1.32 | -9.48% | 57.3% |
| Q5 (skor 74–100) | 10460 | 3.78% | -0.40% | 47.9% | 52.8% | 3.64% | 1.91 | -9.04% | 68.4% |
| Semua sinyal | 55561 | 0.49% | -1.65% | 40.6% | 58.6% | 0.70% | 1.16 | -9.48% | 49.0% |

**Periode TEST (10 hari)**

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | Profit Factor | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Q1 (skor 0–39) | 4977 | -2.48% | -2.00% | 38.8% | 63.3% | -2.53% | 0.53 | -10.59% | 29.9% |
| Q2 (skor 40–49) | 4013 | -1.36% | -1.18% | 42.4% | 58.1% | -1.80% | 0.62 | -9.10% | 41.1% |
| Q3 (skor 50–59) | 4130 | -0.62% | -0.75% | 44.4% | 53.6% | -1.04% | 0.75 | -8.26% | 49.9% |
| Q4 (skor 60–73) | 4648 | 0.45% | -0.40% | 46.0% | 49.8% | -0.13% | 0.97 | -8.22% | 57.2% |
| Q5 (skor 74–100) | 4021 | 1.20% | -0.40% | 46.3% | 48.5% | 0.51% | 1.13 | -8.27% | 63.7% |
| Semua sinyal | 21789 | -0.62% | -0.99% | 43.4% | 54.9% | -1.04% | 0.77 | -8.94% | 47.8% |

## 4. Daya Prediksi Tiap Faktor Aktif (Spearman IC · 10 hari)

| Faktor | Bobot | IC Train | t* Train | IC Test | t* Test | Status |
|---|---:|---:|---:|---:|---:|---|
| Kedekatan ke garis | 18 | 0.025 | 1.3 | 0.035 | 1.1 | Positif konsisten |
| Kualitas tren | 28 | 0.046 | 2.4 | 0.045 | 1.3 | Positif konsisten |
| Umur tren | 20 | 0.041 | 2.1 | 0.067 | 1.9 | Positif konsisten |
| Kedalaman koreksi | 16 | 0.028 | 1.1 | 0.041 | 1.0 | Positif konsisten |
| Volume mengering | 18 | 0.048 | 2.3 | 0.049 | 1.3 | Positif konsisten |
| **Skor Total Final (setelah penalti)** | **100** | **0.073** | **3.6** | **0.077** | **2.0** | **Unggul** |

## 5. Efektivitas Filter Anti-Sideways & Rezim IHSG (10 hari)

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | Profit Factor | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Struktur tren bersih (tanpa penalti) | 16364 | 2.65% | -0.40% | 46.3% | 54.7% | 2.32% | 1.54 | -9.62% | 60.6% |
| Terkena penalti (sideways / < EMA50 / ret60≤0) | 60986 | -0.48% | -1.63% | 40.1% | 58.3% | -0.35% | 0.92 | -9.25% | 45.4% |
| IHSG Bullish — Semua sinyal | 52999 | 0.14% | -1.77% | 39.4% | 58.8% | 0.21% | 1.05 | -9.20% | 50.5% |
| IHSG Bullish — Top Pick (≥86 & SL≤8%) | 2388 | 4.90% | 0.11% | 50.8% | 52.0% | 4.54% | 2.56 | -7.06% | 73.7% |
| IHSG Bearish — Semua sinyal | 24351 | 0.26% | -0.40% | 45.7% | 54.8% | 0.22% | 1.05 | -9.59% | 44.7% |
| IHSG Bearish — Top Pick (≥86 & SL≤8%) | 1052 | 4.69% | 0.66% | 53.4% | 46.7% | 4.36% | 2.36 | -7.52% | 70.2% |

## 6. Kesimpulan Audit Final

- **Spread Q5 − Q1 (10 hari):** TRAIN **5.06%** | TEST **3.68%**.
- **Keunggulan Top Pick Aplikasi (Skor ≥ 86 & SL ≤ 8%) di TEST:** rata-rata **3.05%** (dengan stop: **2.08%**, Profit Factor **1.70**) vs **-0.62%** untuk rata-rata pasar bullish.
- **Kontrol Risiko:** Win rate **50.8%**, kena stop **46.4%**, dan MAE rata-rata terjaga di **-6.59%** (dari 914 sinyal uji).
- **Information Coefficient (IC) Skor Total:** TRAIN **0.073** → TEST **0.077** (stabil dan tidak mengalami degradasi out-of-sample).
