# Laporan backtest skor ANS Screener

- Data: 464 file, 1115 ticker, 2025-06-13 s/d 2026-11-16
- Sinyal diuji: 78273 (saham bullish, likuid ≥ Rp 500.000.000/hari), pengambilan sampel tiap 1 bar
- Supertrend: ATR 10, multiplier 1.5. Entry = open hari berikutnya, biaya round-trip 0.40%
- Train: sebelum 2026-06-22 (54982 sinyal). Test: sejak 2026-06-22 (23291 sinyal). Batas kuintil ditentukan dari TRAIN saja.
- Horizon utama untuk analisis: 10 hari bursa.

> Catatan: sinyal harian saling tumpang-tindih (saham yang sama muncul berhari-hari, dan return 10 hari antar hari berdekatan berkorelasi), sehingga angka t/IC terlihat lebih meyakinkan daripada sebenarnya. Anggap hasil sebagai petunjuk, bukan bukti.

## 1. Seluruh sinyal (pembanding)

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Semua sinyal, 5 hari | 77479 | -0.29% | -1.15% | 40.0% | 35.0% | -0.31% | -6.64% | 38.6% |
| Semua sinyal, 10 hari | 76987 | 0.18% | -1.44% | 41.4% | 57.7% | 0.21% | -9.34% | 48.7% |
| Semua sinyal, 20 hari | 74968 | 1.33% | -1.92% | 42.7% | 80.8% | 1.44% | -12.99% | 59.5% |

## 2a. Skor per kuintil, periode TRAIN

**Horizon 5 hari**

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Q1 (skor 0–57) | 11905 | -1.13% | -1.63% | 35.8% | 39.9% | -1.00% | -6.98% | 23.7% |
| Q2 (skor 58–68) | 11064 | -0.36% | -1.26% | 38.6% | 35.7% | -0.25% | -6.63% | 34.3% |
| Q3 (skor 69–76) | 10615 | 0.13% | -1.01% | 41.0% | 34.3% | 0.12% | -6.53% | 42.2% |
| Q4 (skor 77–85) | 11254 | 0.53% | -0.90% | 42.5% | 33.7% | 0.54% | -6.68% | 50.0% |
| Q5 (skor 86–100) | 10144 | 1.36% | -0.84% | 42.9% | 31.8% | 1.25% | -6.54% | 49.8% |
| Semua | 54982 | 0.07% | -1.15% | 40.1% | 35.2% | 0.10% | -6.68% | 39.6% |

**Horizon 10 hari**

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Q1 (skor 0–57) | 11905 | -1.19% | -2.12% | 37.0% | 61.5% | -0.90% | -9.63% | 32.9% |
| Q2 (skor 58–68) | 11064 | -0.27% | -1.75% | 39.9% | 59.2% | 0.17% | -9.40% | 44.5% |
| Q3 (skor 69–76) | 10615 | 0.27% | -1.61% | 41.0% | 58.8% | 0.61% | -9.34% | 52.6% |
| Q4 (skor 77–85) | 11254 | 1.22% | -1.35% | 42.5% | 56.8% | 1.49% | -9.51% | 59.4% |
| Q5 (skor 86–100) | 10144 | 2.90% | -1.14% | 43.9% | 55.8% | 2.76% | -9.37% | 59.2% |
| Semua | 54982 | 0.53% | -1.63% | 40.8% | 58.5% | 0.77% | -9.46% | 49.3% |

**Horizon 20 hari**

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Q1 (skor 0–57) | 11905 | -0.70% | -3.03% | 37.2% | 84.4% | -0.59% | -13.43% | 44.0% |
| Q2 (skor 58–68) | 11064 | 0.09% | -2.87% | 39.2% | 83.4% | 0.69% | -13.55% | 54.4% |
| Q3 (skor 69–76) | 10615 | 1.52% | -2.31% | 41.8% | 82.1% | 1.51% | -13.34% | 62.0% |
| Q4 (skor 77–85) | 11254 | 3.28% | -1.72% | 43.9% | 81.2% | 3.39% | -13.27% | 67.9% |
| Q5 (skor 86–100) | 10144 | 5.52% | -1.47% | 44.3% | 81.1% | 4.96% | -13.02% | 68.0% |
| Semua | 54982 | 1.85% | -2.29% | 41.2% | 82.5% | 1.91% | -13.33% | 58.9% |

## 2b. Skor per kuintil, periode TEST

**Horizon 5 hari**

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Q1 (skor 0–57) | 5116 | -2.41% | -2.02% | 35.7% | 43.9% | -2.35% | -7.72% | 21.0% |
| Q2 (skor 58–68) | 4777 | -1.35% | -1.35% | 39.3% | 36.9% | -1.54% | -6.71% | 31.1% |
| Q3 (skor 69–76) | 4564 | -0.93% | -1.07% | 41.3% | 31.8% | -1.16% | -6.27% | 39.1% |
| Q4 (skor 77–85) | 4376 | -0.67% | -0.89% | 41.2% | 30.7% | -0.89% | -5.94% | 46.3% |
| Q5 (skor 86–100) | 3664 | -0.03% | -0.40% | 43.6% | 25.2% | -0.24% | -5.75% | 47.4% |
| Semua | 22497 | -1.16% | -1.14% | 39.9% | 34.4% | -1.31% | -6.54% | 36.0% |

**Horizon 10 hari**

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Q1 (skor 0–57) | 4987 | -2.64% | -2.61% | 36.3% | 66.1% | -2.81% | -11.01% | 30.6% |
| Q2 (skor 58–68) | 4702 | -0.99% | -1.15% | 42.2% | 58.1% | -1.51% | -9.29% | 41.9% |
| Q3 (skor 69–76) | 4446 | -0.18% | -0.40% | 45.1% | 51.7% | -0.80% | -8.54% | 50.9% |
| Q4 (skor 77–85) | 4306 | 0.06% | -0.40% | 45.8% | 51.0% | -0.46% | -8.07% | 58.7% |
| Q5 (skor 86–100) | 3564 | 0.82% | -0.40% | 46.4% | 47.4% | 0.14% | -7.91% | 59.3% |
| Semua | 22005 | -0.70% | -1.10% | 42.9% | 55.5% | -1.19% | -9.07% | 47.2% |

**Horizon 20 hari**

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Q1 (skor 0–57) | 3905 | -2.01% | -1.70% | 43.8% | 81.6% | -0.81% | -13.95% | 47.6% |
| Q2 (skor 58–68) | 4195 | -0.17% | -0.40% | 49.5% | 78.2% | -0.09% | -12.37% | 57.5% |
| Q3 (skor 69–76) | 4208 | 0.83% | -0.03% | 50.0% | 72.5% | 0.59% | -11.45% | 63.9% |
| Q4 (skor 77–85) | 4184 | -0.01% | -0.72% | 46.8% | 75.5% | 0.19% | -11.00% | 68.9% |
| Q5 (skor 86–100) | 3494 | 0.90% | -1.30% | 44.8% | 73.4% | 0.93% | -11.54% | 68.8% |
| Semua | 19986 | -0.10% | -0.40% | 47.1% | 76.3% | 0.15% | -12.05% | 61.3% |

## 3. Skor tinggi saja (periode TEST, 10 hari)

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Skor ≥ 50 | 19263 | -0.35% | -0.80% | 44.2% | 53.6% | -0.92% | -8.73% | 50.0% |
| Skor ≥ 60 | 16244 | -0.10% | -0.46% | 44.8% | 52.1% | -0.68% | -8.48% | 52.7% |
| Skor ≥ 70 | 11849 | 0.17% | -0.40% | 45.9% | 50.2% | -0.44% | -8.18% | 56.2% |
| Skor ≥ 80 | 6247 | 0.38% | -0.40% | 45.7% | 49.5% | -0.19% | -8.08% | 59.4% |

## 4. Daya prediksi tiap faktor (Spearman IC terhadap return 10 hari)

IC = korelasi peringkat antar saham pada hari yang sama, dirata-ratakan lintas hari. **t\*** = t dibagi akar(horizon) untuk mengoreksi return yang tumpang-tindih; pada data acak murni, t mentah pun bisa mencapai ±4. Faktor baru layak dipercaya bila tanda IC sama di TRAIN dan TEST, |IC| > 0,02, dan |t\*| > 2 di keduanya.

| Faktor | Bobot | IC train | t* | IC test | t* | Konsisten? |
|---|---:|---:|---:|---:|---:|---|
| Kedekatan ke garis | 16 | 0.025 | 1.3 | 0.031 | 1.0 | tidak |
| Risk/reward | 0 | -0.017 | -0.7 | -0.015 | -0.4 | tidak |
| Kualitas tren | 28 | 0.027 | 1.4 | 0.007 | 0.2 | tidak |
| Umur tren | 20 | 0.041 | 2.1 | 0.064 | 1.8 | tidak |
| Kedalaman koreksi | 8 | 0.029 | 1.2 | 0.035 | 0.8 | tidak |
| Volume mengering | 18 | 0.048 | 2.3 | 0.049 | 1.2 | tidak |
| Pola candle bullish | 0 | -0.002 | -0.1 | 0.002 | 0.1 | tidak |
| Kekuatan relatif | 10 | -0.014 | -0.5 | -0.048 | -1.3 | tidak |
| **Skor total** | 100 | 0.062 | 2.8 | 0.043 | 1.2 | |

## 5. Faktor tinggi vs rendah (seluruh data, 10 hari)

Tinggi = fraksi faktor ≥ 0,67 (untuk pola candle: ada pola). Rendah = ≤ 0,33 (pola candle: tidak ada).

| Faktor | n tinggi | Rata-rata tinggi | Stop tinggi | n rendah | Rata-rata rendah | Stop rendah | Selisih |
|---|---:|---:|---:|---:|---:|---:|---:|
| Kedekatan ke garis | 67148 | 0.29% | 55% | 6316 | -0.61% | 80% | 0.90% |
| Risk/reward | 28991 | -0.79% | 66% | 29844 | 1.10% | 53% | -1.89% |
| Kualitas tren | 40333 | 1.47% | 58% | 5697 | -1.56% | 57% | 3.03% |
| Umur tren | 51346 | 0.41% | 58% | 5646 | -1.51% | 54% | 1.93% |
| Kedalaman koreksi | 29284 | 1.28% | 56% | 33659 | -0.79% | 60% | 2.07% |
| Volume mengering | 34085 | 0.60% | 55% | 31826 | -0.11% | 60% | 0.71% |
| Pola candle bullish | 9888 | -0.57% | 57% | 67099 | 0.29% | 58% | -0.86% |
| Kekuatan relatif | 35497 | 0.69% | 58% | 17973 | -0.62% | 60% | 1.31% |

## 6. Rezim IHSG saat sinyal (10 hari)

Rezim = arah Supertrend COMPOSITE.JK (parameter sama) pada tanggal sinyal. Kolom kedua = hanya skor di kuintil teratas (batas dari train).

| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| IHSG bullish — semua sinyal | 52999 | 0.14% | -1.77% | 39.4% | 58.8% | 0.21% | -9.20% | 50.5% |
| IHSG bullish — kuintil teratas | 9697 | 2.59% | -1.14% | 43.6% | 55.2% | 2.26% | -8.86% | 60.6% |
| IHSG bearish — semua sinyal | 23988 | 0.26% | -0.40% | 45.6% | 55.2% | 0.21% | -9.66% | 44.8% |
| IHSG bearish — kuintil teratas | 4011 | 1.80% | -0.40% | 46.7% | 50.0% | 1.64% | -9.31% | 55.9% |

## Ringkasan

- Selisih kuintil teratas − terendah (10 hari): train 4.09%, test 3.46%.
- Kuintil teratas vs seluruh sinyal di periode test: 1.52% (n=3564).
- Kuintil teratas: kena stop 47% vs 56% untuk seluruh sinyal (periode test).
- **Kesimpulan awal:** Skor tinggi lebih baik daripada skor rendah di train DAN test. Itu pertanda baik, tetapi belum bukti: periksa tabel IC per faktor dan rezim IHSG sebelum menyetel bobot.

Keterbatasan: tidak memodelkan batas ARA/ARB, antrean order, slippage pada saham tidak likuid, atau corporate action (split) pada data. Return 'dengan stop' keluar di open setelah Supertrend berbalik, sehingga bisa lebih buruk bila terjadi gap.
