// Jalankan: node --experimental-strip-types tests/lib.test.ts [path/ke/file.csv]
import { supertrend, type Bar } from "../src/lib/supertrend.ts";
import { parseDate, normalizeTicker, validateRow, dedupe } from "../src/lib/csv.ts";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// ---- csv helpers
assert.equal(parseDate("17/11/2026"), "2026-11-17");
assert.equal(parseDate("12/06/2025 9:02:00"), "2025-06-12");
assert.equal(parseDate("2026-11-17 00:00:00"), "2026-11-17");
assert.equal(parseDate("31/02/2026"), null);
assert.equal(normalizeTicker("bbca"), "BBCA.JK");
assert.equal(normalizeTicker("MPIX-W"), "MPIX-W.JK");
assert.equal(normalizeTicker("BBCA.JK"), "BBCA.JK");
assert.equal(normalizeTicker("BB CA"), null);
assert.equal(validateRow({ Ticker: "X", "Date/Time": "10/06/2025", Open: "", High: "", Low: "", Close: "", "Volume(Unit)": "0.00" }).status, "skipped");
assert.equal(validateRow({ Ticker: "X", "Date/Time": "10/06/2025", Open: "5", High: "4", Low: "4", Close: "4", "Volume(Unit)": "1" }).status, "error");
assert.equal(dedupe([{ ticker: "A.JK", date: "2026-01-01", open: 1, high: 1, low: 1, close: 1, volume: 1 }, { ticker: "A.JK", date: "2026-01-01", open: 2, high: 2, low: 2, close: 2, volume: 2 }]).length, 1);
console.log("csv helpers OK");

// ---- CSV contoh pengguna
const file = process.argv[2];
if (file) {
  const lines = readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(",");
  let ok = 0, skipped = 0, error = 0;
  const keys = new Set<string>();
  for (const l of lines.slice(1)) {
    const c = l.split(",");
    const rec: Record<string, string> = {};
    head.forEach((h, i) => (rec[h] = c[i]));
    const r = validateRow(rec);
    if (r.status === "ok") { ok++; keys.add(r.row.ticker + r.row.date); }
    else if (r.status === "skipped") skipped++;
    else { error++; console.log(r.reason); }
  }
  console.log(`CSV: ok=${ok} skipped=${skipped} error=${error} uniqueKeys=${keys.size}`);
  assert.equal(error, 0);
}

// ---- Supertrend: bandingkan dengan implementasi referensi independen (data dari Python)
const ref = JSON.parse(readFileSync(new URL("./ref.json", import.meta.url), "utf8"));
const bars: Bar[] = ref.bars;
const out = supertrend(bars, 10, 3);
assert.equal(out.length, ref.out.length);
let maxDiff = 0, flipMismatch = 0;
out.forEach((p, i) => {
  const q = ref.out[i];
  maxDiff = Math.max(maxDiff, Math.abs(p.up - q.up), Math.abs(p.dn - q.dn), Math.abs(p.atr - q.atr));
  if (p.trend !== q.trend || p.signal !== q.signal) flipMismatch++;
});
console.log(`Supertrend: ${out.length} bar, maxDiff=${maxDiff.toExponential(2)}, mismatchTrend/Signal=${flipMismatch}, BUY=${out.filter(p=>p.signal==="BUY").length}, SELL=${out.filter(p=>p.signal==="SELL").length}`);
assert.ok(maxDiff < 1e-9);
assert.equal(flipMismatch, 0);
assert.deepEqual(supertrend(bars.slice(0, 5), 10, 3), []);
console.log("supertrend OK");
