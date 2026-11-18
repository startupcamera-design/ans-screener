// Skor 0-100 untuk saham bullish (swing 1 minggu - 1 bulan). Fungsi murni.
import { MIN_AVG_VALUE, WEIGHTS } from "./config";
import type { Metrics } from "./metrics";

export type ScorePart = {
  key: keyof typeof WEIGHTS;
  label: string;
  weight: number;
  fraction: number; // 0..1
  detail: string;
};

export type ScoreResult = {
  eligible: boolean; // lolos filter keras (bullish + likuiditas)
  reason: string | null; // alasan jika tidak lolos
  total: number; // 0..100
  parts: ScorePart[];
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ramp = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
const f = (v: number | null, d = 2) => (v === null ? "–" : v.toFixed(d));

// rs = persentil return 60 bar (0..1) terhadap semua emiten; null = tidak diketahui
export function scoreMetrics(m: Metrics, rs: number | null, minValue: number = MIN_AVG_VALUE): ScoreResult {
  const parts: ScorePart[] = [];
  const add = (key: keyof typeof WEIGHTS, label: string, fraction: number, detail: string) =>
    parts.push({ key, label, weight: WEIGHTS[key], fraction: clamp01(fraction), detail });

  // 1) Kedekatan ke garis: 0 di <=0.2 ATR, penuh 0.5-2 ATR, turun ke 0 di 4 ATR
  const d = m.distAtr;
  add(
    "proximity",
    "Kedekatan ke garis",
    d === null ? 0 : Math.min(ramp(d, 0.2, 0.5), 1 - ramp(d, 2, 4)),
    `${f(d)} ATR di atas garis`
  );

  // 2) Risk/reward: penuh di R:R >= 3
  add("rr", "Risk/reward", m.rr === null ? 0 : ramp(m.rr, 0, 3), `R:R ${f(m.rr)} (target high 20 hari)`);

  // 3) Kualitas tren
  const ema = m.aboveEma50 === null ? 0.5 : m.aboveEma50 ? 1 : 0;
  const adx = m.adx === null ? 0.5 : ramp(m.adx, 15, 25);
  const hl = m.higherLow === null ? 0.5 : m.higherLow ? 1 : 0;
  add(
    "trendQuality",
    "Kualitas tren",
    (ema + adx + hl) / 3,
    `${m.aboveEma50 === null ? "EMA50 –" : m.aboveEma50 ? "di atas EMA50" : "di bawah EMA50"}, ADX ${f(m.adx, 0)}, ${
      m.higherLow === null ? "HL –" : m.higherLow ? "higher low" : "lower low"
    }`
  );

  // 4) Umur tren
  const age = m.barsInTrend;
  add("trendAge", "Umur tren", age < 2 ? 0.2 : age < 5 ? 0.6 : age <= 40 ? 1 : 0.6, `${age} bar sejak BUY`);

  // 5) Kedalaman koreksi: ideal 20-60% dari rentang 20 hari
  const r = m.retrace;
  add(
    "pullback",
    "Kedalaman koreksi",
    r === null ? 0 : r < 0.2 ? ramp(r, 0, 0.2) : r <= 0.6 ? 1 : 1 - ramp(r, 0.6, 1),
    `${r === null ? "–" : (r * 100).toFixed(0) + "%"} dari rentang 20 hari`
  );

  // 6) Volume mengering: rasio 5/20 <= 0.8 bagus, >= 1.3 buruk
  add(
    "volume",
    "Volume mengering",
    m.volRatio === null ? 0.5 : 1 - ramp(m.volRatio, 0.8, 1.3),
    `volume 5 hari = ${f(m.volRatio)}x rata-rata 20 hari`
  );

  // 7) Pola candle bullish (bar terakhir 1.0, kemarin 0.6, 2 hari lalu 0.3); kurang berharga jauh dari garis
  const recency = m.patternAge === null ? 0 : [1, 0.6, 0.3][m.patternAge] ?? 0;
  const near = m.distAtr !== null && m.distAtr <= 2.5 ? 1 : 0.4;
  add(
    "candle",
    "Pola candle bullish",
    m.pattern ? recency * near : 0,
    m.pattern ? `${m.pattern} (${m.patternAge === 0 ? "hari ini" : m.patternAge + " hari lalu"})` : "tidak ada"
  );

  // 8) Kekuatan relatif
  add(
    "relStrength",
    "Kekuatan relatif",
    rs === null ? 0.5 : rs,
    rs === null ? "belum diketahui" : `peringkat ${(rs * 100).toFixed(0)} persentil (return ~3 bulan ${m.ret60 === null ? "–" : (m.ret60 * 100).toFixed(1) + "%"})`
  );

  const total = Math.round(parts.reduce((s, p) => s + p.weight * p.fraction, 0));

  let reason: string | null = null;
  if (m.trend !== 1) reason = "Tren bearish";
  else if (m.avgValue20 < minValue) reason = "Likuiditas di bawah batas";

  return { eligible: reason === null, reason, total, parts };
}

// Persentil (0..1) tiap key; tie diberi peringkat rata-rata. Nilai null diabaikan.
export function percentileMap(items: { key: string; value: number | null }[]): Map<string, number> {
  const vals = items.filter((x) => x.value !== null).map((x) => x.value as number).sort((a, b) => a - b);
  const out = new Map<string, number>();
  const n = vals.length;
  if (n === 0) return out;
  for (const it of items) {
    if (it.value === null) continue;
    if (n === 1) {
      out.set(it.key, 0.5);
      continue;
    }
    let less = 0, eq = 0;
    for (const v of vals) {
      if (v < it.value) less++;
      else if (v === it.value) eq++;
    }
    out.set(it.key, (less + (eq - 1) / 2) / (n - 1));
  }
  return out;
}
