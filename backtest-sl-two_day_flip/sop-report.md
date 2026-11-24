# Hasil Simulasi Portofolio SOP ANS Screener

## 1. Parameter Simulasi
- **Mode Stop Loss:** **SL-7: Hybrid + 2-Day Bearish Flip Confirm**
- **Periode Uji:** 2025-06-13 s/d 2026-11-23 (352 hari bursa)
- **Modal Awal:** Rp 1.000.000.000
- **Alokasi per Saham:** Rp 40.000.000 (IHSG Bullish) / Rp 20.000.000 (IHSG Bearish) · Maks posisi aktif: 25
- **Aturan Entry:** Skor ≥ 86, Risiko SL ≤ -8,0%, Usia Tren 5–40 bar, Limit Beli Maks +1,5% (Anti-FOMO)
- **Aturan Exit & TP:** Auto-SL Intraday (two_day_flip), Trailing SL, TP Parsial 50% (+12% harian / +15% total), Time-Stop 20 bar (< +4%)
- **Biaya Transaksi:** Beli 0.15% + Jual 0.25%

## 2. Kinerja Pertumbuhan Modal
- **Modal Awal:** Rp 1.000.000.000
- **Modal Akhir:** **Rp 1.392.933.294** (termasuk 8 posisi masih terbuka di akhir periode)
- **Total Pertumbuhan Modal:** **+39.29%** (Rp 392.933.294)
- **Rata-rata Pertumbuhan Tahunan (CAGR):** **+25.94% / tahun**
- **Max Drawdown Portofolio (dari puncak ekuitas):** **-7.90%**
- **Puncak Posisi Terbuka Bersamaan:** 25 saham (maks modal terpakai ~Rp 1.000.000.000)

## 3. Statistik Transaksi (Closed Trades)
- **Total Transaksi Selesai:** 420 transaksi (157 profit · 263 rugi)
- **Win Rate:** **37.38%**
- **Profit Factor:** **1.81**
- **Rata-rata Gain saat Profit (Avg Win):** **+17.52%**
- **Rata-rata Loss saat Rugi (Avg Loss):** **-5.66%**
- **Rata-rata Return per Transaksi (Expectancy):** **+3.00%**
- **Maksimal Gain (1 Transaksi):** **+130.36% (SRAJ.JK · 2025-06-19 → 2025-11-19)**
- **Maksimal Loss (1 Transaksi):** **-13.05% (ASPR.JK · 2026-04-16 → 2026-04-17)**
- **Rata-rata Lama Hold:** 12.9 hari bursa
- **Order Dibatalkan Anti-FOMO (Gap Up > +1,5%):** 97 kali
- **Order Terlewat karena Kas Tidak Cukup:** 0 kali

## 4. Progres Pertumbuhan Modal per Tahun
| Tahun | Saldo Awal Tahun | Saldo Akhir Tahun | Pertumbuhan | Transaksi Selesai | Win Rate | Net P&L Realized |
|---|---:|---:|---:|---:|---:|---:|
| 2025 | Rp 1.000.000.000 | Rp 1.381.348.343 | **+38.13%** | 197 | 40.1% | Rp 258.052.314 |
| 2026 | Rp 1.381.348.343 | Rp 1.392.933.294 | **+0.84%** | 223 | 35.0% | Rp 133.913.459 |

## 5. Breakdown Berdasarkan Alasan Exit
| Alasan Exit | Jumlah | Porsi | Rata-rata P&L % | Total P&L Rp |
|---|---:|---:|---:|---:|
| AUTO_SL_INTRADAY | 169 | 40.2% | -4.10% | Rp -225.313.172 |
| BEARISH_FLIP | 215 | 51.2% | +8.96% | Rp 609.998.176 |
| TIME_STOP | 36 | 8.6% | +0.83% | Rp 7.280.770 |
