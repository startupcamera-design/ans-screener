# Hasil Simulasi Portofolio SOP ANS Screener

## 1. Parameter Simulasi
- **Mode Stop Loss:** **SL-5: Hybrid + Early Breakeven (+6%)**
- **Periode Uji:** 2025-06-13 s/d 2026-11-23 (352 hari bursa)
- **Modal Awal:** Rp 1.000.000.000
- **Alokasi per Saham:** Rp 40.000.000 (IHSG Bullish) / Rp 20.000.000 (IHSG Bearish) · Maks posisi aktif: 25
- **Aturan Entry:** Skor ≥ 86, Risiko SL ≤ -8,0%, Usia Tren 5–40 bar, Limit Beli Maks +1,5% (Anti-FOMO)
- **Aturan Exit & TP:** Auto-SL Intraday (early_be6), Trailing SL, TP Parsial 50% (+12% harian / +15% total), Time-Stop 20 bar (< +4%)
- **Biaya Transaksi:** Beli 0.15% + Jual 0.25%

## 2. Kinerja Pertumbuhan Modal
- **Modal Awal:** Rp 1.000.000.000
- **Modal Akhir:** **Rp 1.349.951.608** (termasuk 8 posisi masih terbuka di akhir periode)
- **Total Pertumbuhan Modal:** **+35.00%** (Rp 349.951.608)
- **Rata-rata Pertumbuhan Tahunan (CAGR):** **+23.23% / tahun**
- **Max Drawdown Portofolio (dari puncak ekuitas):** **-7.74%**
- **Puncak Posisi Terbuka Bersamaan:** 25 saham (maks modal terpakai ~Rp 1.000.000.000)

## 3. Statistik Transaksi (Closed Trades)
- **Total Transaksi Selesai:** 449 transaksi (158 profit · 291 rugi)
- **Win Rate:** **35.19%**
- **Profit Factor:** **1.69**
- **Rata-rata Gain saat Profit (Avg Win):** **+17.09%**
- **Rata-rata Loss saat Rugi (Avg Loss):** **-5.35%**
- **Rata-rata Return per Transaksi (Expectancy):** **+2.55%**
- **Maksimal Gain (1 Transaksi):** **+145.01% (EURO.JK · 2026-02-24 → 2026-05-06)**
- **Maksimal Loss (1 Transaksi):** **-13.05% (ASPR.JK · 2026-04-16 → 2026-04-17)**
- **Rata-rata Lama Hold:** 11.8 hari bursa
- **Order Dibatalkan Anti-FOMO (Gap Up > +1,5%):** 106 kali
- **Order Terlewat karena Kas Tidak Cukup:** 0 kali

## 4. Progres Pertumbuhan Modal per Tahun
| Tahun | Saldo Awal Tahun | Saldo Akhir Tahun | Pertumbuhan | Transaksi Selesai | Win Rate | Net P&L Realized |
|---|---:|---:|---:|---:|---:|---:|
| 2025 | Rp 1.000.000.000 | Rp 1.341.927.869 | **+34.19%** | 212 | 39.2% | Rp 216.039.975 |
| 2026 | Rp 1.341.927.869 | Rp 1.349.951.608 | **+0.60%** | 237 | 31.6% | Rp 132.944.113 |

## 5. Breakdown Berdasarkan Alasan Exit
| Alasan Exit | Jumlah | Porsi | Rata-rata P&L % | Total P&L Rp |
|---|---:|---:|---:|---:|
| AUTO_SL_INTRADAY | 179 | 39.9% | -3.92% | Rp -227.135.130 |
| BEARISH_FLIP | 238 | 53.0% | +7.70% | Rp 571.495.305 |
| TIME_STOP | 32 | 7.1% | +0.36% | Rp 4.623.913 |
