import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectBullishPatterns } from "../src/lib/candles.ts";
import { computeMetrics, adxAt, type VBar } from "../src/lib/metrics.ts";
import { scoreMetrics, percentileMap } from "../src/lib/scoring.ts";
import { toWeekly } from "../src/lib/timeframe.ts";
import { supertrend } from "../src/lib/supertrend.ts";
import { WEIGHTS } from "../src/lib/config.ts";

const B = (o: number, h: number, l: number, c: number) => ({ open: o, high: h, low: l, close: c });
const down = [B(101, 101, 99, 100), B(100, 100, 97, 98), B(98, 98, 95, 96), B(96, 96, 93, 94)];

// ---- pola candle
let p = detectBullishPatterns([...down, B(93.5, 94, 88, 93.8)]);
assert.equal(p.at(-1)?.name, "Hammer");
p = detectBullishPatterns([...down, B(94, 94, 91, 92), B(91.5, 95, 91, 94.5)]);
assert.equal(p.at(-1)?.name, "Bullish Engulfing");
// tanpa penurunan sebelumnya, hammer tidak dihitung
assert.equal(detectBullishPatterns([B(100, 101, 99, 100.5), B(100.5, 101, 100, 100.8), B(100.8, 101.5, 100, 101), B(101, 102, 100.5, 101.5), B(101.6, 102, 96, 101.8)]).length, 0);
console.log("candles OK");

// ---- weekly
const d = (date: string, o: number, h: number, l: number, c: number, v: number): VBar => ({ date, open: o, high: h, low: l, close: c, volume: v });
const w = toWeekly([
  d("2026-11-09", 10, 12, 9, 11, 100), d("2026-11-10", 11, 15, 10, 14, 200), d("2026-11-13", 14, 14, 8, 9, 300),
  d("2026-11-16", 9, 10, 8, 9.5, 50), d("2026-11-17", 9.5, 11, 9, 10.5, 70),
]);
assert.equal(w.length, 2);
assert.deepEqual([w[0].date, w[0].open, w[0].high, w[0].low, w[0].close, w[0].volume], ["2026-11-09", 10, 15, 8, 9, 600]);
assert.deepEqual([w[1].date, w[1].volume, w[1].close], ["2026-11-16", 120, 10.5]);
console.log("weekly OK");

// ---- metrik pada data acak (ref.json) + volume sintetis
const ref = JSON.parse(readFileSync(new URL("./ref.json", import.meta.url), "utf8"));
const bars: VBar[] = ref.bars.map((b: any, i: number) => ({ ...b, volume: 1_000_000 + (i % 7) * 100_000 }));
const st = supertrend(bars, 10, 1.5);
let n = 0;
for (let e = 100; e < bars.length; e += 7) {
  const m = computeMetrics(bars, st, e)!;
  assert.ok(m && Number.isFinite(m.avgValue20) && m.barsInTrend >= 1);
  if (m.trend === 1) { assert.ok(m.distAtr! > -1e-9 && m.rr! >= 0); } else { assert.equal(m.distAtr, null); }
  const s = scoreMetrics(m, 0.5);
  assert.ok(s.total >= 0 && s.total <= 100);
  n++;
}
const adx = adxAt(bars, bars.length - 1)!;
assert.ok(adx > 0 && adx < 100);
console.log(`metrics OK (${n} titik, ADX akhir ${adx.toFixed(1)})`);

// ---- skor
assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
const ideal = { trend: 1 as const, distAtr: 1, rr: 3, barsInTrend: 10, adx: 30, aboveEma50: true, higherLow: true, retrace: 0.4, volRatio: 0.6, ret60: 0.2, avgValue20: 5e9, atrPct: 3, pattern: "Hammer", patternAge: 0 };
const s1 = scoreMetrics(ideal, 1);
assert.equal(s1.total, 100); assert.ok(s1.eligible);
assert.ok(!scoreMetrics({ ...ideal, avgValue20: 1e6 }, 1).eligible);
assert.ok(!scoreMetrics({ ...ideal, trend: -1, distAtr: null, rr: null }, 1).eligible);
assert.ok(scoreMetrics({ ...ideal, distAtr: 0.1 }, 1).total < s1.total);
const pm = percentileMap([{ key: "a", value: 1 }, { key: "b", value: 2 }, { key: "c", value: 3 }, { key: "d", value: null }]);
assert.deepEqual([pm.get("a"), pm.get("b"), pm.get("c"), pm.has("d")], [0, 0.5, 1, false]);
console.log("scoring OK");

// ---- anti look-ahead: skor pada bar e tidak boleh berubah bila bar setelah e dihapus
for (const e of [120, 250, 400, 560]) {
  const cut = bars.slice(0, e + 1);
  const a = computeMetrics(bars, supertrend(bars, 10, 1.5), e);
  const b = computeMetrics(cut, supertrend(cut, 10, 1.5));
  assert.deepEqual(a, b, `look-ahead terdeteksi pada bar ${e}`);
}
console.log("anti look-ahead OK");
