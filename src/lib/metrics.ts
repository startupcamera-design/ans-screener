// Metrik per ticker pada satu bar (biasanya bar terakhir). Fungsi murni.
import type { Bar, STPoint } from "./supertrend";
import { detectBullishPatterns } from "./candles";

export type VBar = Bar & { volume: number };

export type Metrics = {
  trend: 1 | -1;
  distAtr: number | null; // (close - garis) / ATR, hanya saat bullish
  rr: number | null; // (high20 - close) / (close - garis), hanya saat bullish
  barsInTrend: number; // jumlah bar berurutan di tren saat ini
  adx: number | null;
  aboveEma50: boolean | null;
  higherLow: boolean | null; // low 10 bar terakhir > low 10 bar sebelumnya
  retrace: number | null; // (high20 - close) / (high20 - low20)
  volRatio: number | null; // rata-rata volume 5 bar / 20 bar
  ret60: number | null; // return 60 bar (desimal)
  avgValue20: number; // rata-rata nilai transaksi 20 bar (Rp)
  atrPct: number; // ATR / close * 100
  pattern: string | null; // pola candle bullish terbaru (<= 2 bar lalu)
  patternAge: number | null; // 0 = bar terakhir
};

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function emaAt(values: number[], end: number, n: number): number | null {
  if (end + 1 < n) return null;
  let e = avg(values.slice(0, n));
  const k = 2 / (n + 1);
  for (let i = n; i <= end; i++) e += k * (values[i] - e);
  return e;
}

// ADX Wilder (14) pada bar `end`
export function adxAt(bars: Bar[], end: number, n = 14): number | null {
  if (end < 2 * n) return null;
  let trS = 0, pS = 0, mS = 0;
  const dx: number[] = [];
  for (let i = 1; i <= end; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const dn = bars[i - 1].low - bars[i].low;
    const pdm = up > dn && up > 0 ? up : 0;
    const mdm = dn > up && dn > 0 ? dn : 0;
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    if (i <= n) {
      trS += tr; pS += pdm; mS += mdm;
    } else {
      trS = trS - trS / n + tr;
      pS = pS - pS / n + pdm;
      mS = mS - mS / n + mdm;
    }
    if (i >= n) {
      const pdi = trS === 0 ? 0 : (100 * pS) / trS;
      const mdi = trS === 0 ? 0 : (100 * mS) / trS;
      dx.push(pdi + mdi === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / (pdi + mdi));
    }
  }
  if (dx.length < n) return null;
  let adx = avg(dx.slice(0, n));
  for (let j = n; j < dx.length; j++) adx = (adx * (n - 1) + dx[j]) / n;
  return adx;
}

// `st` = keluaran supertrend(bars) (sejajar dengan bar-bar terakhir).
export function computeMetrics(bars: VBar[], st: STPoint[], end = bars.length - 1): Metrics | null {
  const off = bars.length - st.length;
  const k = end - off;
  if (end < 0 || k < 0 || k >= st.length) return null;

  const b = bars[end];
  const p = st[k];
  const bullish = p.trend === 1;

  let barsInTrend = 0;
  for (let j = k; j >= 0 && st[j].trend === p.trend; j--) barsInTrend++;

  const w20 = bars.slice(Math.max(0, end - 19), end + 1);
  const high20 = Math.max(...w20.map((x) => x.high));
  const low20 = Math.min(...w20.map((x) => x.low));

  const risk = b.close - p.up;
  const distAtr = bullish && p.atr > 0 ? risk / p.atr : null;
  const rr = bullish && risk > 0 ? Math.max(high20 - b.close, 0) / risk : null;
  const retrace = high20 > low20 ? (high20 - b.close) / (high20 - low20) : null;

  const closes = bars.map((x) => x.close);
  const ema50 = emaAt(closes, end, 50);

  let higherLow: boolean | null = null;
  if (end >= 19) {
    const lastLow = Math.min(...bars.slice(end - 9, end + 1).map((x) => x.low));
    const prevLow = Math.min(...bars.slice(end - 19, end - 9).map((x) => x.low));
    higherLow = lastLow > prevLow;
  }

  const vol20 = avg(w20.map((x) => x.volume));
  const vol5 = avg(bars.slice(Math.max(0, end - 4), end + 1).map((x) => x.volume));

  const pats = detectBullishPatterns(bars.slice(Math.max(0, end - 8), end + 1));
  const base = Math.max(0, end - 8);
  const recent = pats.filter((x) => base + x.index >= end - 2).pop();

  return {
    trend: p.trend,
    distAtr,
    rr,
    barsInTrend,
    adx: adxAt(bars, end),
    aboveEma50: ema50 === null ? null : b.close > ema50,
    higherLow,
    retrace,
    volRatio: vol20 > 0 ? vol5 / vol20 : null,
    ret60: end >= 60 && bars[end - 60].close > 0 ? b.close / bars[end - 60].close - 1 : null,
    avgValue20: avg(w20.map((x) => x.close * x.volume)),
    atrPct: (p.atr / b.close) * 100,
    pattern: recent ? recent.name : null,
    patternAge: recent ? end - (base + recent.index) : null,
  };
}

// Baris dari view screener_latest (snake_case) -> Metrics
export function metricsFromDb(d: any): Metrics | null {
  if (!d || d.avg_value20 === null || d.avg_value20 === undefined) return null;
  const n = (v: any) => (v === null || v === undefined ? null : Number(v));
  return {
    trend: Number(d.trend) as 1 | -1,
    distAtr: n(d.dist_atr),
    rr: n(d.rr),
    barsInTrend: Number(d.bars_in_trend ?? 0),
    adx: n(d.adx),
    aboveEma50: d.above_ema50 ?? null,
    higherLow: d.higher_low ?? null,
    retrace: n(d.retrace),
    volRatio: n(d.vol_ratio),
    ret60: n(d.ret60),
    avgValue20: Number(d.avg_value20),
    atrPct: Number(d.atr_pct ?? 0),
    pattern: d.pattern ?? null,
    patternAge: n(d.pattern_age),
  };
}
