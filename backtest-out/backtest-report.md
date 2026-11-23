# Laporan backtest skor ANS Screener (Scoring v2 · Anti-Sideways)

- Data: 468 file, 1115 ticker, 2025-06-13 s/d 2026-11-20
- Sinyal diuji: 79236 (saham bullish, likuid ≥ Rp 500.000.000/hari), pengambilan sampel tiap 1 bar
- Supertrend: ATR 14, multiplier 2. Entry = open hari berikutnya, biaya round-trip 0.40%
- Train: sebelum 2026-06-24 (54879 sinyal). Test: sejak 2026-06-24 (24357 sinyal). Batas kuintil ditentukan dari TRAIN saja.
- Horizon utama untuk analisis: 10 hari bursa.

> Catatan: sinyal harian saling tumpang-tindih (saham yang sama muncul berhari-hari, dan return 10 hari antar hari berdekatan berkorelasi), sehingga angka t/IC terlihat lebih meyakinkan daripada sebenarnya. Anggap hasil sebagai petunjuk, bukan bukti.

## 1. Seluruh sinyal (pembanding)

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Semua sinyal, 5 hari | 78435 | -0.22% | -1.11% | 40.3% | 25.6% | -0.24% | -6.58% | 37.7% |
| Semua sinyal, 10 hari | 77711 | 0.30% | -1.34% | 42.0% | 44.5% | 0.39% | -9.24% | 47.9% |
| Semua sinyal, 20 hari | 76322 | 1.36% | -1.92% | 42.9% | 68.2% | 1.65% | -13.02% | 58.6% |

## 2a. Skor per kuintil, periode TRAIN

**Horizon 5 hari**

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Q1 (skor 0–40) | 11508 | -1.34% | -1.80% | 34.4% | 33.5% | -1.15% | -7.02% | 22.3% |
| Q2 (skor 41–52) | 11355 | -0.76% | -1.45% | 37.5% | 28.3% | -0.70% | -6.83% | 33.8% |
| Q3 (skor 53–63) | 10956 | -0.19% | -1.11% | 40.1% | 26.1% | -0.16% | -6.58% | 39.0% |
| Q4 (skor 64–75) | 10114 | 0.62% | -1.12% | 40.8% | 24.1% | 0.60% | -6.81% | 46.2% |
| Q5 (skor 76–100) | 10946 | 1.81% | -0.40% | 46.0% | 23.0% | 1.77% | -6.63% | 54.0% |
| Semua | 54879 | 0.00% | -1.19% | 39.7% | 27.1% | 0.05% | -6.78% | 38.7% |

**Horizon 10 hari**

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Q1 (skor 0–40) | 11508 | -1.66% | -2.65% | 35.3% | 53.2% | -1.27% | -9.91% | 31.4% |
| Q2 (skor 41–52) | 11355 | -0.99% | -2.29% | 37.8% | 49.4% | -0.53% | -9.74% | 43.2% |
| Q3 (skor 53–63) | 10956 | 0.35% | -1.36% | 41.3% | 45.0% | 0.63% | -9.21% | 49.7% |
| Q4 (skor 64–75) | 10114 | 1.62% | -1.28% | 42.9% | 44.8% | 1.53% | -9.54% | 56.1% |
| Q5 (skor 76–100) | 10946 | 3.93% | -0.40% | 47.7% | 42.0% | 3.83% | -9.32% | 64.0% |
| Semua | 54879 | 0.60% | -1.63% | 40.9% | 47.0% | 0.80% | -9.55% | 48.6% |

**Horizon 20 hari**

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Q1 (skor 0–40) | 11508 | -2.07% | -3.81% | 35.1% | 76.3% | -1.03% | -14.43% | 42.0% |
| Q2 (skor 41–52) | 11355 | -0.60% | -3.23% | 38.7% | 73.8% | 0.23% | -14.10% | 53.1% |
| Q3 (skor 53–63) | 10956 | 1.75% | -1.94% | 42.4% | 69.6% | 1.77% | -12.87% | 60.0% |
| Q4 (skor 64–75) | 10114 | 4.31% | -1.28% | 45.2% | 69.3% | 3.18% | -12.88% | 66.3% |
| Q5 (skor 76–100) | 10946 | 8.11% | 0.19% | 50.8% | 66.4% | 7.06% | -12.48% | 73.0% |
| Semua | 54879 | 2.20% | -2.07% | 42.3% | 71.2% | 2.18% | -13.38% | 58.5% |

## 2b. Skor per kuintil, periode TEST

**Horizon 5 hari**

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Q1 (skor 0–40) | 5368 | -1.29% | -0.81% | 42.3% | 27.5% | -1.37% | -6.56% | 23.6% |
| Q2 (skor 41–52) | 5173 | -1.01% | -0.80% | 42.4% | 22.9% | -1.16% | -5.90% | 29.0% |
| Q3 (skor 53–63) | 4490 | -0.93% | -1.17% | 39.6% | 22.0% | -1.05% | -5.91% | 34.6% |
| Q4 (skor 64–75) | 4300 | -0.37% | -0.88% | 40.8% | 19.6% | -0.56% | -6.02% | 45.5% |
| Q5 (skor 76–100) | 4225 | 0.08% | -0.69% | 43.2% | 17.6% | -0.16% | -6.11% | 48.5% |
| Semua | 23556 | -0.75% | -0.86% | 41.7% | 22.2% | -0.90% | -6.11% | 35.3% |

**Horizon 10 hari**

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Q1 (skor 0–40) | 5110 | -1.45% | -0.85% | 43.7% | 43.6% | -1.48% | -9.16% | 34.8% |
| Q2 (skor 41–52) | 4943 | -0.74% | -0.40% | 45.5% | 37.2% | -0.75% | -8.12% | 39.9% |
| Q3 (skor 53–63) | 4381 | -0.39% | -0.80% | 44.7% | 37.8% | -0.47% | -8.15% | 45.5% |
| Q4 (skor 64–75) | 4210 | 0.05% | -0.92% | 43.7% | 37.3% | -0.28% | -8.38% | 55.3% |
| Q5 (skor 76–100) | 4188 | 0.70% | -0.76% | 45.1% | 35.8% | 0.24% | -8.53% | 60.1% |
| Semua | 22832 | -0.42% | -0.75% | 44.5% | 38.5% | -0.59% | -8.48% | 46.4% |

**Horizon 20 hari**

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Q1 (skor 0–40) | 4577 | -1.06% | -0.40% | 48.0% | 59.7% | 0.13% | -12.18% | 49.4% |
| Q2 (skor 41–52) | 4434 | -0.18% | -0.40% | 48.2% | 55.5% | 1.02% | -11.42% | 56.9% |
| Q3 (skor 53–63) | 4173 | -1.27% | -1.67% | 43.9% | 60.5% | 0.19% | -12.06% | 57.7% |
| Q4 (skor 64–75) | 4113 | -1.10% | -2.56% | 41.1% | 62.0% | -0.13% | -12.29% | 64.1% |
| Q5 (skor 76–100) | 4146 | -0.31% | -2.75% | 40.4% | 65.4% | 0.22% | -12.66% | 67.6% |
| Semua | 21443 | -0.78% | -1.48% | 44.4% | 60.5% | 0.29% | -12.11% | 58.9% |

## 3. Ambang tetap aplikasi & Top Pick (periode TEST, 10 hari)

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Skor ≥ 60 | 10052 | 0.18% | -0.94% | 44.0% | 36.7% | -0.14% | -8.42% | 56.0% |
| Skor ≥ 70 | 6229 | 0.67% | -0.71% | 45.0% | 36.1% | 0.26% | -8.42% | 59.4% |
| Skor ≥ 78 | 3556 | 0.68% | -0.87% | 45.0% | 35.8% | 0.24% | -8.59% | 61.0% |
| Skor ≥ 86 | 1535 | 1.45% | -0.40% | 47.7% | 34.9% | 0.96% | -8.73% | 66.6% |
| **Top Pick Aplikasi (Skor ≥ 86 & SL ≤ 8%)** | 800 | 1.26% | -0.40% | 48.4% | 35.5% | 1.04% | -6.14% | 64.9% |

## 4. Daya prediksi tiap faktor (Spearman IC terhadap return 10 hari)

IC = korelasi peringkat antar saham pada hari yang sama, dirata-ratakan lintas hari. **t\*** = t dibagi akar(horizon) untuk mengoreksi return yang tumpang-tindih. Faktor layak dipercaya bila tanda IC sama di TRAIN dan TEST, |IC| > 0,02, dan |t\*| > 2 di keduanya.

| Faktor | Bobot | IC train | t* | IC test | t* | Konsisten? |
|---|---:|---:|---:|---:|---:|---|
| Kedekatan ke garis | 16 | 0.020 | 1.1 | 0.021 | 0.8 | tidak |
| Risk/reward | 0 | -0.024 | -1.0 | -0.024 | -0.6 | tidak |
| Kualitas tren | 34 | 0.040 | 2.1 | 0.047 | 1.5 | tidak |
| Umur tren | 20 | 0.016 | 0.8 | 0.052 | 1.7 | tidak |
| Kedalaman koreksi | 12 | 0.025 | 1.0 | 0.029 | 0.7 | tidak |
| Volume mengering | 18 | 0.046 | 2.2 | 0.055 | 1.4 | tidak |
| Pola candle bullish | 0 | 0.005 | 0.3 | 0.003 | 0.1 | tidak |
| Kekuatan relatif | 0 | -0.011 | -0.4 | -0.048 | -1.1 | tidak |
| *Metrik baru: Frekuensi Flip 60h* | – | -0.060 | -2.7 | -0.045 | -1.8 | (negatif = whipsaw buruk) |
| *Metrik baru: Efficiency Ratio 30h* | – | 0.005 | 0.3 | 0.082 | 2.3 | (positif = tren lurus unggul) |
| **Skor total (setelah penalti)** | 100 | 0.064 | 3.1 | 0.069 | 2.0 | |

## 5. Faktor tinggi vs rendah & Uji Filter Anti-Sideways (seluruh data, 10 hari)

Tinggi = fraksi faktor ≥ 0,67 (untuk pola candle: ada pola). Rendah = ≤ 0,33 (pola candle: tidak ada).

| Faktor | n tinggi | Rata-rata tinggi | Stop tinggi | n rendah | Rata-rata rendah | Stop rendah | Selisih |
|---|---:|---:|---:|---:|---:|---:|---:|
| Kedekatan ke garis | 67853 | 0.45% | 41% | 5232 | -1.01% | 74% | 1.46% |
| Risk/reward | 24552 | -0.65% | 58% | 35345 | 1.12% | 38% | -1.77% |
| Kualitas tren | 37196 | 1.64% | 44% | 7027 | -1.38% | 46% | 3.02% |
| Umur tren | 52787 | 0.46% | 45% | 3985 | -1.41% | 41% | 1.87% |
| Kedalaman koreksi | 28799 | 1.29% | 41% | 35096 | -0.52% | 48% | 1.81% |
| Volume mengering | 35243 | 0.78% | 43% | 31464 | -0.08% | 47% | 0.87% |
| Pola candle bullish | 10787 | -0.26% | 46% | 66924 | 0.39% | 44% | -0.65% |
| Kekuatan relatif | 37289 | 0.70% | 46% | 16027 | -0.51% | 45% | 1.20% |

### 5b. Dampak Filter Anti-Sideways (seluruh data, 10 hari)

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Struktur tren bersih (tanpa penalti) | 22818 | 2.18% | -0.96% | 45.1% | 43.9% | 1.99% | -9.77% | 59.7% |
| Terkena penalti (sideways / < EMA50 / ret60≤0) | 54893 | -0.48% | -1.49% | 40.7% | 44.7% | -0.28% | -9.01% | 43.0% |
| Tren mulus (flips60 ≤ 2) | 38073 | 0.83% | -0.96% | 43.8% | 42.6% | 0.69% | -8.53% | 49.1% |
| Pasar choppy/whipsaw (flips60 ≥ 4) | 20391 | -0.42% | -1.89% | 40.3% | 48.0% | -0.08% | -10.35% | 48.4% |
| Efficiency Ratio tinggi (er30 ≥ 0.35) | 15508 | 2.50% | -0.40% | 47.3% | 47.2% | 2.34% | -11.34% | 65.2% |
| Efficiency Ratio rendah / sideways (er30 < 0.18) | 37791 | -0.54% | -1.44% | 40.4% | 43.9% | -0.31% | -8.35% | 41.4% |

## 6. Rezim IHSG saat sinyal (10 hari)

Rezim = arah Supertrend COMPOSITE.JK (parameter sama) pada tanggal sinyal. Kolom kedua = hanya skor di kuintil teratas (batas dari train).

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| IHSG bullish — semua sinyal | 56236 | 0.48% | -1.49% | 40.7% | 44.7% | 0.53% | -8.96% | 49.6% |
| IHSG bullish — kuintil teratas | 11502 | 3.01% | -0.70% | 46.1% | 40.9% | 2.93% | -8.94% | 63.5% |
| IHSG bearish — semua sinyal | 21475 | -0.17% | -0.85% | 45.2% | 43.9% | 0.03% | -9.95% | 43.4% |
| IHSG bearish — kuintil teratas | 3632 | 3.12% | -0.07% | 49.6% | 38.3% | 2.54% | -9.64% | 61.1% |

## Ringkasan

- Selisih kuintil teratas − terendah (10 hari): train 5.59%, test 2.15%.
- Kuintil teratas vs seluruh sinyal di periode test: 1.12% (n=4188).
- Top Pick Aplikasi (Skor ≥ 86 & SL ≤ 8%) di periode test: rata-rata 1.26%, kena stop 36% (n=800).
- Kuintil teratas: kena stop 36% vs 39% untuk seluruh sinyal (periode test).
- **Kesimpulan awal:** Skor tinggi lebih baik daripada skor rendah di train DAN test. Itu pertanda baik, tetapi belum bukti: periksa tabel IC per faktor dan rezim IHSG sebelum menyetel bobot.

Keterbatasan: tidak memodelkan batas ARA/ARB, antrean order, slippage pada saham tidak likuid, atau corporate action (split) pada data. Return 'dengan stop' keluar di open setelah Supertrend berbalik, sehingga bisa lebih buruk bila terjadi gap.
