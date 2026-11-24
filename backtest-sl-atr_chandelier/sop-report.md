# Hasil Simulasi Portofolio SOP ANS Screener

## 1. Parameter Simulasi
- **Mode Stop Loss:** **SL-4: Chandelier ATR (2.5x Entry / 3.0x High)**
- **Periode Uji:** 2025-06-13 s/d 2026-11-23 (352 hari bursa)
- **Modal Awal:** Rp 1.000.000.000
- **Alokasi per Saham:** Rp 40.000.000 (IHSG Bullish) / Rp 20.000.000 (IHSG Bearish) · Maks posisi aktif: 25
- **Aturan Entry:** Skor ≥ 86, Risiko SL ≤ -8,0%, Usia Tren 5–40 bar, Limit Beli Maks +1,5% (Anti-FOMO)
- **Aturan Exit & TP:** Auto-SL Intraday (atr_chandelier), Trailing SL, TP Parsial 50% (+12% harian / +15% total), Time-Stop 20 bar (< +4%)
- **Biaya Transaksi:** Beli 0.15% + Jual 0.25%

## 2. Kinerja Pertumbuhan Modal
- **Modal Awal:** Rp 1.000.000.000
- **Modal Akhir:** **Rp 1.324.750.471** (termasuk 8 posisi masih terbuka di akhir periode)
- **Total Pertumbuhan Modal:** **+32.48%** (Rp 324.750.471)
- **Rata-rata Pertumbuhan Tahunan (CAGR):** **+21.62% / tahun**
- **Max Drawdown Portofolio (dari puncak ekuitas):** **-7.37%**
- **Puncak Posisi Terbuka Bersamaan:** 25 saham (maks modal terpakai ~Rp 1.000.000.000)

## 3. Statistik Transaksi (Closed Trades)
- **Total Transaksi Selesai:** 443 transaksi (165 profit · 278 rugi)
- **Win Rate:** **37.25%**
- **Profit Factor:** **1.61**
- **Rata-rata Gain saat Profit (Avg Win):** **+16.37%**
- **Rata-rata Loss saat Rugi (Avg Loss):** **-5.87%**
- **Rata-rata Return per Transaksi (Expectancy):** **+2.42%**
- **Maksimal Gain (1 Transaksi):** **+145.01% (EURO.JK · 2026-02-24 → 2026-05-06)**
- **Maksimal Loss (1 Transaksi):** **-13.05% (ASPR.JK · 2026-04-16 → 2026-04-17)**
- **Rata-rata Lama Hold:** 11.9 hari bursa
- **Order Dibatalkan Anti-FOMO (Gap Up > +1,5%):** 107 kali
- **Order Terlewat karena Kas Tidak Cukup:** 0 kali

## 4. Progres Pertumbuhan Modal per Tahun
| Tahun | Saldo Awal Tahun | Saldo Akhir Tahun | Pertumbuhan | Transaksi Selesai | Win Rate | Net P&L Realized |
|---|---:|---:|---:|---:|---:|---:|
| 2025 | Rp 1.000.000.000 | Rp 1.315.299.810 | **+31.53%** | 212 | 41.5% | Rp 213.032.463 |
| 2026 | Rp 1.315.299.810 | Rp 1.324.750.471 | **+0.72%** | 231 | 33.3% | Rp 110.750.489 |

## 5. Breakdown Berdasarkan Alasan Exit
| Alasan Exit | Jumlah | Porsi | Rata-rata P&L % | Total P&L Rp |
|---|---:|---:|---:|---:|
| AUTO_SL_INTRADAY | 193 | 43.6% | +0.51% | Rp -7.567.947 |
| BEARISH_FLIP | 217 | 49.0% | +4.41% | Rp 325.563.189 |
| TIME_STOP | 33 | 7.4% | +0.46% | Rp 5.787.709 |
