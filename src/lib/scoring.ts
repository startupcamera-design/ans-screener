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

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const ramp = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
const f = (v: number | null, d = 2) => (v === null ? "–" : v.toFixed(d));

// rs = persentil return 60 bar (0..1) terhadap semua emiten; null = tidak diketahui
export function scoreMetrics(m: Metrics, rs: number | null, minValue: number = MIN_AVG_VALUE): ScoreResult {
  const parts: ScorePart[] = [];
  const add = (key: keyof typeof WEIGHTS, label: string, fraction: number, detail: string) =>
    parts.push({ key, label, weight: WEIGHTS[key] ?? 0, fraction: clamp01(fraction), detail });

  // 1) Kedekatan ke garis: 0 di <=0.2 ATR, penuh 0.5-2 ATR, turun ke 0 di 4 ATR
  const d = m.distAtr;
  add(
    "proximity",
    "Kedekatan ke garis",
    d === null ? 0 : Math.min(ramp(d, 0.2, 0.5), 1 - ramp(d, 2, 4)),
    `${f(d)} ATR di atas garis`
  );

  // 2) Risk/reward (bobot 0, tetap dihitung untuk laporan IC backtest)
  add("rr", "Risk/reward", m.rr === null ? 0 : ramp(m.rr, 0, 3), `R:R ${f(m.rr)} (target high 20 hari)`);

  // 3) Kualitas tren + Deteksi Sideways / Whipsaw
  const ema = m.aboveEma50 === null ? 0.5 : m.aboveEma50 ? 1 : 0;
  const adx = m.adx === null ? 0.5 : ramp(m.adx, 16, 28);
  const hl = m.higherLow === null ? 0.5 : m.higherLow ? 1 : 0;
  const er = m.er30 == null ? null : ramp(m.er30, 0.15, 0.4); // 0.15 = sideways, >=0.40 = tren lurus
  const flipScore = m.flips60 == null ? null : 1 - ramp(m.flips60, 2, 5); // <=2 flip = bersih, >=5 flip = choppy

  const trendComponents = [ema, adx, hl];
  if (er !== null) trendComponents.push(er);
  if (flipScore !== null) trendComponents.push(flipScore);
  const trendFraction = trendComponents.reduce((s, v) => s + v, 0) / trendComponents.length;

  const choppyFlags: string[] = [];
  if (m.aboveEma50 === false) choppyFlags.push("di bawah EMA50");
  if (m.flips60 != null && m.flips60 >= 4) choppyFlags.push(`${m.flips60}x flip/60h (whipsaw)`);
  if (m.er30 != null && m.er30 < 0.2) choppyFlags.push(`ER ${m.er30.toFixed(2)} (sideways)`);
  if (m.adx !== null && m.adx < 18) choppyFlags.push(`ADX lemah (${f(m.adx, 0)})`);

  const trendSummary =
    choppyFlags.length > 0
      ? `Waspada sideways: ${choppyFlags.join(", ")}`
      : `${m.aboveEma50 === null ? "EMA50 –" : "di atas EMA50"}, ADX ${f(m.adx, 0)}, ${
          m.higherLow === null ? "HL –" : m.higherLow ? "higher low" : "lower low"
        }${m.flips60 != null ? `, ${m.flips60}x flip` : ""}`;

  add("trendQuality", "Kualitas tren", trendFraction, trendSummary);

  // 4) Umur tren
  const age = m.barsInTrend;
  add("trendAge", "Umur tren", age < 2 ? 0.2 : age < 5 ? 0.6 : age <= 40 ? 1 : 0.6, `${age} bar sejak BUY`);

  // 5) Kedalaman koreksi (REVISI BERDASARKAN BACKTEST):
  // Saham yang bertahan dekat puncak (retrace <= 15%) menghasilkan +4.70%, jauh lebih tinggi
  // dibanding yang koreksi dalam (0.34%). Skor penuh jika retrace <= 0.15, turun ke 0 di 0.50.
  const r = m.retrace;
  add(
    "pullback",
    "Kedalaman koreksi",
    r === null ? 0 : 1 - ramp(r, 0.15, 0.5),
    `${r === null ? "–" : (r * 100).toFixed(0) + "%"} dari rentang 20 hari`
  );

  // 6) Volume mengering: rasio 5/20 <= 0.8 bagus, >= 1.3 buruk
  add(
    "volume",
    "Volume mengering",
    m.volRatio === null ? 0.5 : 1 - ramp(m.volRatio, 0.8, 1.3),
    `volume 5 hari = ${f(m.volRatio)}x rata-rata 20 hari`
  );

  // 7) Pola candle bullish (bobot 0, tetap dihitung untuk laporan IC backtest)
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

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const rawScore = parts.reduce((s, p) => s + p.weight * p.fraction, 0);
  let score = totalWeight > 0 ? (rawScore / totalWeight) * 100 : 0;

  // Penalti struktural agar saham sideways/downtrend tidak lolos ke Top Pick (>= 86)
  let structureMultiplier = 1;
  if (m.aboveEma50 === false) structureMultiplier *= 0.82; // masih di bawah rata-rata 50 hari
  if (m.ret60 !== null && m.ret60 <= 0) structureMultiplier *= 0.88; // return 3 bulan masih minus/stagnan
  if (m.flips60 != null && m.flips60 >= 4) {
    // makin sering bolak-balik BUY/SELL, makin besar pemotongan skor
    structureMultiplier *= Math.max(0.7, 1 - (m.flips60 - 3) * 0.08);
  }
  if (m.er30 != null && m.er30 < 0.18) {
    structureMultiplier *= 0.85; // gerak harga bolak-balik (efficiency ratio rendah)
  }

  const total = Math.round(score * structureMultiplier);

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