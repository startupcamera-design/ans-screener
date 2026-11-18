// Membuat data CSV SINTETIS (acak) untuk menguji skrip backtest.
// Pakai: node tests/gen-synthetic.mjs <folder-output> [jumlah-ticker=60] [jumlah-hari=600]
// Data acak => backtest seharusnya menunjukkan TIDAK ADA keunggulan skor (sanity check anti-kebocoran).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [out = "synthetic", nT = "60", nD = "600"] = process.argv.slice(2);
const T = +nT, D = +nD;
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

const dates = [];
for (let d = new Date(Date.UTC(2024, 0, 1)); dates.length < D; d.setUTCDate(d.getUTCDate() + 1)) {
  if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dates.push(new Date(d));
}
const fmt = (d) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

function walk(start, vol, drift) {
  const rows = [];
  let p = start;
  for (let i = 0; i < D; i++) {
    const o = p;
    const c = Math.max(50, o * (1 + drift + gauss() * vol));
    const h = Math.max(o, c) * (1 + Math.abs(gauss()) * vol * 0.4);
    const l = Math.min(o, c) * (1 - Math.abs(gauss()) * vol * 0.4);
    rows.push([fmt(dates[i]), o, h, l, c, Math.round(2e6 * (0.5 + rnd()))]);
    p = c;
  }
  return rows;
}

const series = { COMPOSITE: walk(7000, 0.008, 0.0002) };
for (let t = 0; t < T; t++) series["TST" + String(t).padStart(3, "0")] = walk(200 + rnd() * 5000, 0.015 + rnd() * 0.02, 0.0003);

mkdirSync(out, { recursive: true });
// pecah menjadi file per 3 hari terakhir-gaya pengguna (di sini: blok 60 hari)
const chunk = 60;
for (let s = 0, f = 0; s < D; s += chunk, f++) {
  const lines = ["Ticker,Date/Time,Open,High,Low,Close,Volume(Unit)"];
  for (const [tk, rows] of Object.entries(series)) {
    for (const r of rows.slice(s, s + chunk)) lines.push(`${tk},${r[0]},${r[1].toFixed(2)},${r[2].toFixed(2)},${r[3].toFixed(2)},${r[4].toFixed(2)},${r[5]}.00`);
  }
  writeFileSync(join(out, `part-${String(f).padStart(2, "0")}.csv`), lines.join("\r\n") + "\r\n");
}
console.log(`ditulis ${Math.ceil(D / chunk)} file, ${T + 1} ticker, ${D} hari -> ${out}`);
