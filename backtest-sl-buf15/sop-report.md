# Hasil Simulasi Portofolio SOP ANS Screener

## 1. Parameter Simulasi
- **Mode Stop Loss:** **SL-2: Buffer ST -1.5% (Max Risk ~9.0%)**
- **Periode Uji:** 2025-06-13 s/d 2026-11-23 (352 hari bursa)
- **Modal Awal:** Rp 1.000.000.000
- **Alokasi per Saham:** Rp 40.000.000 (IHSG Bullish) / Rp 20.000.000 (IHSG Bearish) · Maks posisi aktif: 25
- **Aturan Entry:** Skor ≥ 86, Risiko SL ≤ -8,0%, Usia Tren 5–40 bar, Limit Beli Maks +1,5% (Anti-FOMO)
- **Aturan Exit & TP:** Auto-SL Intraday (buf15), Trailing SL, TP Parsial 50% (+12% harian / +15% total), Time-Stop 20 bar (< +4%)
- **Biaya Transaksi:** Beli 0.15% + Jual 0.25%

## 2. Kinerja Pertumbuhan Modal
- **Modal Awal:** Rp 1.000.000.000
- **Modal Akhir:** **Rp 1.304.634.638** (termasuk 6 posisi masih terbuka di akhir periode)
- **Total Pertumbuhan Modal:** **+30.46%** (Rp 304.634.638)
- **Rata-rata Pertumbuhan Tahunan (CAGR):** **+20.33% / tahun**
- **Max Drawdown Portofolio (dari puncak ekuitas):** **-7.98%**
- **Puncak Posisi Terbuka Bersamaan:** 25 saham (maks modal terpakai ~Rp 1.000.000.000)

## 3. Statistik Transaksi (Closed Trades)
- **Total Transaksi Selesai:** 462 transaksi (167 profit · 295 rugi)
- **Win Rate:** **36.15%**
- **Profit Factor:** **1.57**
- **Rata-rata Gain saat Profit (Avg Win):** **+15.76%**
- **Rata-rata Loss saat Rugi (Avg Loss):** **-5.51%**
- **Rata-rata Return per Transaksi (Expectancy):** **+2.18%**
- **Maksimal Gain (1 Transaksi):** **+136.34% (RMKE.JK · 2025-08-12 → 2025-10-20)**
- **Maksimal Loss (1 Transaksi):** **-12.85% (ERAA.JK · 2026-09-17 → 2026-10-16)**
- **Rata-rata Lama Hold:** 11.2 hari bursa
- **Order Dibatalkan Anti-FOMO (Gap Up > +1,5%):** 114 kali
- **Order Terlewat karena Kas Tidak Cukup:** 0 kali

## 4. Progres Pertumbuhan Modal per Tahun
| Tahun | Saldo Awal Tahun | Saldo Akhir Tahun | Pertumbuhan | Transaksi Selesai | Win Rate | Net P&L Realized |
|---|---:|---:|---:|---:|---:|---:|
| 2025 | Rp 1.000.000.000 | Rp 1.311.183.206 | **+31.12%** | 222 | 40.5% | Rp 217.285.314 |
| 2026 | Rp 1.311.183.206 | Rp 1.304.634.638 | **-0.50%** | 240 | 32.1% | Rp 85.807.066 |

## 5. Breakdown Berdasarkan Alasan Exit
| Alasan Exit | Jumlah | Porsi | Rata-rata P&L % | Total P&L Rp |
|---|---:|---:|---:|---:|
| AUTO_SL_INTRADAY | 299 | 64.7% | +3.06% | Rp 277.716.839 |
| BEARISH_FLIP | 131 | 28.4% | +0.54% | Rp 17.931.719 |
| TIME_STOP | 32 | 6.9% | +0.66% | Rp 7.443.822 |
