# Hasil Simulasi Portofolio SOP ANS Screener

## 1. Parameter Simulasi
- **Mode Stop Loss:** **SL-1: Buffer ST -1.0% (Max Risk ~8.5%)**
- **Periode Uji:** 2025-06-13 s/d 2026-11-23 (352 hari bursa)
- **Modal Awal:** Rp 1.000.000.000
- **Alokasi per Saham:** Rp 40.000.000 (IHSG Bullish) / Rp 20.000.000 (IHSG Bearish) · Maks posisi aktif: 25
- **Aturan Entry:** Skor ≥ 86, Risiko SL ≤ -8,0%, Usia Tren 5–40 bar, Limit Beli Maks +1,5% (Anti-FOMO)
- **Aturan Exit & TP:** Auto-SL Intraday (buf1), Trailing SL, TP Parsial 50% (+12% harian / +15% total), Time-Stop 20 bar (< +4%)
- **Biaya Transaksi:** Beli 0.15% + Jual 0.25%

## 2. Kinerja Pertumbuhan Modal
- **Modal Awal:** Rp 1.000.000.000
- **Modal Akhir:** **Rp 1.286.558.879** (termasuk 6 posisi masih terbuka di akhir periode)
- **Total Pertumbuhan Modal:** **+28.66%** (Rp 286.558.879)
- **Rata-rata Pertumbuhan Tahunan (CAGR):** **+19.17% / tahun**
- **Max Drawdown Portofolio (dari puncak ekuitas):** **-7.36%**
- **Puncak Posisi Terbuka Bersamaan:** 25 saham (maks modal terpakai ~Rp 1.000.000.000)

## 3. Statistik Transaksi (Closed Trades)
- **Total Transaksi Selesai:** 475 transaksi (167 profit · 308 rugi)
- **Win Rate:** **35.16%**
- **Profit Factor:** **1.54**
- **Rata-rata Gain saat Profit (Avg Win):** **+15.45%**
- **Rata-rata Loss saat Rugi (Avg Loss):** **-5.34%**
- **Rata-rata Return per Transaksi (Expectancy):** **+1.97%**
- **Maksimal Gain (1 Transaksi):** **+136.34% (RMKE.JK · 2025-08-12 → 2025-10-20)**
- **Maksimal Loss (1 Transaksi):** **-12.85% (ERAA.JK · 2026-09-17 → 2026-10-16)**
- **Rata-rata Lama Hold:** 10.7 hari bursa
- **Order Dibatalkan Anti-FOMO (Gap Up > +1,5%):** 113 kali
- **Order Terlewat karena Kas Tidak Cukup:** 0 kali

## 4. Progres Pertumbuhan Modal per Tahun
| Tahun | Saldo Awal Tahun | Saldo Akhir Tahun | Pertumbuhan | Transaksi Selesai | Win Rate | Net P&L Realized |
|---|---:|---:|---:|---:|---:|---:|
| 2025 | Rp 1.000.000.000 | Rp 1.305.513.134 | **+30.55%** | 229 | 40.2% | Rp 211.679.796 |
| 2026 | Rp 1.305.513.134 | Rp 1.286.558.879 | **-1.45%** | 246 | 30.5% | Rp 73.336.825 |

## 5. Breakdown Berdasarkan Alasan Exit
| Alasan Exit | Jumlah | Porsi | Rata-rata P&L % | Total P&L Rp |
|---|---:|---:|---:|---:|
| AUTO_SL_INTRADAY | 338 | 71.2% | +2.67% | Rp 279.766.032 |
| BEARISH_FLIP | 106 | 22.3% | +0.13% | Rp -2.477.280 |
| TIME_STOP | 31 | 6.5% | +0.70% | Rp 7.727.869 |
