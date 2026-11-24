# Hasil Simulasi Portofolio SOP ANS Screener

## 1. Parameter Simulasi
- **Mode Stop Loss:** **SL-3: Hybrid (Hard -8% + BE +10% + EOD Flip)**
- **Periode Uji:** 2025-06-13 s/d 2026-11-23 (352 hari bursa)
- **Modal Awal:** Rp 1.000.000.000
- **Alokasi per Saham:** Rp 40.000.000 (IHSG Bullish) / Rp 20.000.000 (IHSG Bearish) · Maks posisi aktif: 25
- **Aturan Entry:** Skor ≥ 86, Risiko SL ≤ -8,0%, Usia Tren 5–40 bar, Limit Beli Maks +1,5% (Anti-FOMO)
- **Aturan Exit & TP:** Auto-SL Intraday (eod_hybrid), Trailing SL, TP Parsial 50% (+12% harian / +15% total), Time-Stop 20 bar (< +4%)
- **Biaya Transaksi:** Beli 0.15% + Jual 0.25%

## 2. Kinerja Pertumbuhan Modal
- **Modal Awal:** Rp 1.000.000.000
- **Modal Akhir:** **Rp 1.355.015.789** (termasuk 8 posisi masih terbuka di akhir periode)
- **Total Pertumbuhan Modal:** **+35.50%** (Rp 355.015.789)
- **Rata-rata Pertumbuhan Tahunan (CAGR):** **+23.55% / tahun**
- **Max Drawdown Portofolio (dari puncak ekuitas):** **-7.17%**
- **Puncak Posisi Terbuka Bersamaan:** 25 saham (maks modal terpakai ~Rp 1.000.000.000)

## 3. Statistik Transaksi (Closed Trades)
- **Total Transaksi Selesai:** 433 transaksi (164 profit · 269 rugi)
- **Win Rate:** **37.88%**
- **Profit Factor:** **1.70**
- **Rata-rata Gain saat Profit (Avg Win):** **+16.74%**
- **Rata-rata Loss saat Rugi (Avg Loss):** **-5.74%**
- **Rata-rata Return per Transaksi (Expectancy):** **+2.77%**
- **Maksimal Gain (1 Transaksi):** **+145.01% (EURO.JK · 2026-02-24 → 2026-05-06)**
- **Maksimal Loss (1 Transaksi):** **-13.05% (ASPR.JK · 2026-04-16 → 2026-04-17)**
- **Rata-rata Lama Hold:** 12.3 hari bursa
- **Order Dibatalkan Anti-FOMO (Gap Up > +1,5%):** 102 kali
- **Order Terlewat karena Kas Tidak Cukup:** 0 kali

## 4. Progres Pertumbuhan Modal per Tahun
| Tahun | Saldo Awal Tahun | Saldo Akhir Tahun | Pertumbuhan | Transaksi Selesai | Win Rate | Net P&L Realized |
|---|---:|---:|---:|---:|---:|---:|
| 2025 | Rp 1.000.000.000 | Rp 1.335.175.966 | **+33.52%** | 206 | 41.3% | Rp 225.203.954 |
| 2026 | Rp 1.335.175.966 | Rp 1.355.015.789 | **+1.49%** | 227 | 34.8% | Rp 128.844.314 |

## 5. Breakdown Berdasarkan Alasan Exit
| Alasan Exit | Jumlah | Porsi | Rata-rata P&L % | Total P&L Rp |
|---|---:|---:|---:|---:|
| AUTO_SL_INTRADAY | 147 | 33.9% | -4.81% | Rp -231.629.408 |
| BEARISH_FLIP | 253 | 58.4% | +7.48% | Rp 579.609.125 |
| TIME_STOP | 33 | 7.6% | +0.49% | Rp 6.068.551 |
