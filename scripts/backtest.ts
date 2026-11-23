// Backtest skor saham ANS Screener (dengan evaluasi filter anti-sideways & penalti struktural).
//
// Pakai:  npm run backtest -- ./data-csv [--cost 0.004] [--split 0.7] [--step 1]
// Input : folder (atau file) CSV berformat sama dengan yang diunggah ke aplikasi.
//         Semua file digabung; duplikat (ticker+tanggal) -> file terakhir menang.
//
// Aturan simulasi (semua tanpa look-ahead):
//  - Sinyal dinilai pada CLOSE hari t memakai data <= t (skor yang sama dengan aplikasi).
//  - Entry = OPEN hari t+1. Exit horizon h = CLOSE hari t+h.
//  - "Dengan stop": keluar di OPEN hari setelah Supertrend berbalik bearish.
//  - Biaya round-trip (--cost) dikurangkan dari setiap return.
//  - Skor persentil kekuatan relatif dihitung per tanggal terhadap semua emiten pada tanggal itu.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { checkHeaders, dedupe, validateRow, type PriceRow } from "../src/lib/csv";
import { supertrend } from "../src/lib/supertrend";
import { computeMetrics, type VBar } from "../src/lib/metrics";
import { percentileMap, scoreMetrics } from "../src/lib/scoring";
import { INDEX_TICKER, MIN_AVG_VALUE, ST_MULT, ST_PERIOD, WEIGHTS } from "../src/lib/config";

/* ---------------- argumen ---------------- */
const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string", default: "backtest-out" },
    "min-value": { type: "string", default: String(MIN_AVG_VALUE) },
    step: { type: "string", default: "1" },
    cost: { type: "string", default: "0.004" },
    split: { type: "string", default: "0.7" },
    horizons: { type: "string", default: "5,10,20" },
    warmup: { type: "string", default: "100" },
    dump: { type: "boolean", default: false },
  },
});
if (positionals.length === 0) {
  console.error("Pakai: npm run backtest -- <folder-atau-file.csv> [opsi]\nOpsi: --cost 0.004 --split 0.7 --step 1 --horizons 5,10,20 --min-value 10000000 --warmup 100 --out backtest-out --dump");
  process.exit(1);
}
const MIN_VALUE = Number(opt["min-value"]);
const STEP = Math.max(1, Math.floor(Number(opt.step)));
const COST = Number(opt.cost);
const SPLIT = Math.min(0.95, Math.max(0.3, Number(opt.split)));
const HORIZONS = String(opt.horizons).split(",").map((x) => Math.floor(Number(x))).filter((x) => x >= 1);
const WARMUP = Math.max(70, Math.floor(Number(opt.warmup)));
const PRIMARY = HORIZONS.includes(10) ? HORIZONS.indexOf(10) : Math.floor(HORIZONS.length / 2);
const PH = HORIZONS[PRIMARY];

/* ---------------- baca CSV ---------------- */
function listCsv(p: string): string[] {
  const s = statSync(p);
  if (s.isFile()) return [p];
  return readdirSync(p).filter((f) => f.toLowerCase().endsWith(".csv")).sort().map((f) => join(p, f));
}
const files = positionals.flatMap((p) => listCsv(resolve(p)));
if (files.length === 0) {
  console.error("Tidak ada file .csv ditemukan.");
  process.exit(1);
}

const all: PriceRow[] = [];
let rowsTotal = 0, rowsSkipped = 0, rowsError = 0;
for (const f of files) {
  const lines = readFileSync(f, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  const head = (lines[0] ?? "").split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const bad = checkHeaders(head);
  if (bad) {
    console.error(`! ${f}: ${bad} (dilewati)`);
    continue;
  }
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    rowsTotal++;
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const rec: Record<string, string> = {};
    head.forEach((h, k) => (rec[h] = cells[k]));
    const r = validateRow(rec);
    if (r.status === "ok") all.push(r.row);
    else if (r.status === "skipped") rowsSkipped++;
    else rowsError++;
  }
}
const uniq = dedupe(all);
console.error(`Membaca ${files.length} file: ${rowsTotal} baris, ${uniq.length} unik, ${rowsSkipped} dilewati, ${rowsError} error`);

const series = new Map<string, VBar[]>();
for (const r of uniq) {
  const a = series.get(r.ticker) ?? [];
  a.push({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume });
  series.set(r.ticker, a);
}
for (const a of series.values()) a.sort((x, y) => x.date.localeCompare(y.date));

/* ---------------- util ---------------- */
const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (x: number, d = 2) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : "–");
const quant = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];

/* ---------------- hasil per sinyal ---------------- */
type Out = { ret: number; retStop: number; stop: boolean; mae: number; target: boolean };
type Sig = {
  ticker: string;
  date: string;
  score: number;
  rawScore: number;
  penalized: boolean;
  fr: number[];
  distAtr: number | null;
  slRiskPct: number | null;
  rr: number | null;
  flips60: number | null;
  er30: number | null;
  aboveEma50: boolean | null;
  regime: 1 | -1 | null;
  out: (Out | null)[];
};
type Cand = Omit<Sig, "score" | "rawScore" | "penalized" | "fr"> & { m: NonNullable<ReturnType<typeof computeMetrics>> };

function outcome(bars: VBar[], st: ReturnType<typeof supertrend>, off: number, e: number, h: number, target: number): Out | null {
  const x = e + h;
  if (x >= bars.length) return null;
  const entry = bars[e + 1].open;
  if (!(entry > 0)) return null;
  if (dayNum(bars[x].date) - dayNum(bars[e].date) > h * 2 + 6) return null; // celah data (suspensi) terlalu besar
  let low = Infinity, high = -Infinity, stopIdx = -1;
  for (let j = e + 1; j <= x; j++) {
    low = Math.min(low, bars[j].low);
    high = Math.max(high, bars[j].high);
    if (stopIdx < 0 && st[j - off]?.trend === -1) stopIdx = j;
  }
  const exitStop = stopIdx < 0 ? bars[x].close : stopIdx + 1 < bars.length ? bars[stopIdx + 1].open : bars[stopIdx].close;
  return {
    ret: bars[x].close / entry - 1 - COST,
    retStop: exitStop / entry - 1 - COST,
    stop: stopIdx >= 0,
    mae: low / entry - 1,
    target: high >= target,
  };
}

/* ---------------- rezim IHSG ---------------- */
const regimeByDate = new Map<string, 1 | -1>();
const idx = series.get(INDEX_TICKER);
if (idx && idx.length >= 30) {
  const ist = supertrend(idx, ST_PERIOD, ST_MULT);
  const off = idx.length - ist.length;
  for (let i = 0; i < ist.length; i++) regimeByDate.set(idx[i + off].date, ist[i].trend);
}

/* ---------------- pass 1: kandidat + return 60 bar ---------------- */
const cands: Cand[] = [];
const ret60ByDate = new Map<string, { ticker: string; value: number }[]>();
let done = 0;
for (const [ticker, bars] of series) {
  done++;
  if (done % 100 === 0) console.error(`  ${done}/${series.size} ticker…`);
  if (ticker === INDEX_TICKER || bars.length < WARMUP + 30) continue;
  const st = supertrend(bars, ST_PERIOD, ST_MULT);
  const off = bars.length - st.length;

  for (let e = 60; e < bars.length; e++) {
    const base = bars[e - 60].close;
    if (base > 0) {
      const arr = ret60ByDate.get(bars[e].date) ?? [];
      arr.push({ ticker, value: bars[e].close / base - 1 });
      ret60ByDate.set(bars[e].date, arr);
    }
  }

  for (let e = Math.max(WARMUP, off); e < bars.length - 1; e++) {
    if (e % STEP !== 0) continue;
    if (st[e - off].trend !== 1 || bars[e].volume <= 0) continue;
    if (bars[e + 1].volume <= 0) continue; // tidak bisa dibeli besok
    if (dayNum(bars[e + 1].date) - dayNum(bars[e].date) > 7) continue;
    const m = computeMetrics(bars, st, e);
    if (!m || m.trend !== 1 || m.avgValue20 < MIN_VALUE) continue;
    const high20 = Math.max(...bars.slice(Math.max(0, e - 19), e + 1).map((b) => b.high));
    cands.push({
      ticker,
      date: bars[e].date,
      distAtr: m.distAtr,
      slRiskPct: m.slRiskPct,
      rr: m.rr,
      flips60: m.flips60 ?? null,
      er30: m.er30 ?? null,
      aboveEma50: m.aboveEma50,
      m,
      regime: regimeByDate.get(bars[e].date) ?? null,
      out: HORIZONS.map((h) => outcome(bars, st, off, e, h, high20)),
    });
  }
}

/* ---------------- pass 2: skor ---------------- */
const rsByDate = new Map<string, Map<string, number>>();
for (const [d, arr] of ret60ByDate) rsByDate.set(d, percentileMap(arr.map((x) => ({ key: x.ticker, value: x.value }))));

const sigs: Sig[] = [];
let partMeta: { key: keyof typeof WEIGHTS; label: string; weight: number }[] = [];

for (const c of cands) {
  const res = scoreMetrics(c.m, rsByDate.get(c.date)?.get(c.ticker) ?? null, MIN_VALUE);
  if (!res.eligible) continue;
  if (partMeta.length === 0) {
    partMeta = res.parts.map((p) => ({ key: p.key, label: p.label, weight: p.weight }));
  }
  const tw = res.parts.reduce((s, p) => s + p.weight, 0);
  const rawScore = tw > 0 ? Math.round((res.parts.reduce((s, p) => s + p.weight * p.fraction, 0) / tw) * 100) : res.total;
  sigs.push({
    ticker: c.ticker,
    date: c.date,
    score: res.total,
    rawScore,
    penalized: res.total < rawScore,
    fr: res.parts.map((p) => p.fraction),
    distAtr: c.distAtr,
    slRiskPct: c.slRiskPct,
    rr: c.rr,
    flips60: c.flips60,
    er30: c.er30,
    aboveEma50: c.aboveEma50,
    regime: c.regime,
    out: c.out,
  });
}
if (sigs.length < 200) {
  console.error(`Hanya ${sigs.length} sinyal yang memenuhi syarat. Data terlalu pendek untuk backtest yang bermakna (butuh riwayat beberapa ratus hari).`);
  process.exit(2);
}

/* ---------------- statistik ---------------- */
type Stat = { n: number; tickers: number; avg: number; med: number; win: number; stop: number; avgStop: number; mae: number; target: number };
function stats(rows: Sig[], hi: number): Stat {
  const os = rows.map((r) => r.out[hi]).filter((o): o is Out => o !== null);
  const tk = new Set(rows.filter((r) => r.out[hi]).map((r) => r.ticker));
  return {
    n: os.length, tickers: tk.size,
    avg: mean(os.map((o) => o.ret)), med: median(os.map((o) => o.ret)),
    win: os.length ? os.filter((o) => o.ret > 0).length / os.length : NaN,
    stop: os.length ? os.filter((o) => o.stop).length / os.length : NaN,
    avgStop: mean(os.map((o) => o.retStop)),
    mae: mean(os.map((o) => o.mae)),
    target: os.length ? os.filter((o) => o.target).length / os.length : NaN,
  };
}
const row = (label: string, s: Stat) =>
  `| ${label} | ${s.n} | ${pct(s.avg)} | ${pct(s.med)} | ${pct(s.win, 1)} | ${pct(s.stop, 1)} | ${pct(s.avgStop)} | ${pct(s.mae)} | ${pct(s.target, 1)} |`;
const HEAD =
  "| Kelompok | n | Rata-rata | Median | Menang | Kena stop | Rata-rata (dgn stop) | MAE rata-rata | Capai target |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|";

const dates = [...new Set(sigs.map((s) => s.date))].sort();
const splitDate = dates[Math.floor(dates.length * SPLIT)];
const train = sigs.filter((s) => s.date < splitDate);
const test = sigs.filter((s) => s.date >= splitDate);

const trainScores = train.map((s) => s.score).sort((a, b) => a - b);
const cuts = [0.2, 0.4, 0.6, 0.8].map((q) => quant(trainScores, q)); // dari data TRAIN saja
const bucketOf = (sc: number) => (sc <= cuts[0] ? 0 : sc <= cuts[1] ? 1 : sc <= cuts[2] ? 2 : sc <= cuts[3] ? 3 : 4);
const bucketLabel = (b: number) => {
  const lo = b === 0 ? 0 : cuts[b - 1] + 1;
  const hi = b === 4 ? 100 : cuts[b];
  return `Q${b + 1} (skor ${lo}–${hi})`;
};
const byBucket = (rows: Sig[]) => [0, 1, 2, 3, 4].map((b) => rows.filter((r) => bucketOf(r.score) === b));

const csv: string[] = ["periode,kelompok,horizon,n,rata2,median,menang,kena_stop,rata2_dgn_stop,mae,capai_target"];
const addCsv = (per: string, label: string, hz: number, s: Stat) =>
  csv.push([per, `"${label}"`, hz, s.n, s.avg, s.med, s.win, s.stop, s.avgStop, s.mae, s.target].join(","));

/* ---------------- Spearman IC ---------------- */
function ranks(a: number[]): number[] {
  const idxs = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
  const r = new Array<number>(a.length);
  for (let i = 0; i < idxs.length; ) {
    let j = i;
    while (j + 1 < idxs.length && idxs[j + 1][0] === idxs[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idxs[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
function spearman(x: number[], y: number[]): number | null {
  const rx = ranks(x), ry = ranks(y), n = x.length;
  const mx = mean(rx), my = mean(ry);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (rx[i] - mx) * (ry[i] - my);
    sxx += (rx[i] - mx) ** 2;
    syy += (ry[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}
function icOf(rows: Sig[], get: (s: Sig) => number | null) {
  const byDate = new Map<string, Sig[]>();
  for (const r of rows) {
    if (r.out[PRIMARY] && get(r) !== null) {
      (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(r);
    }
  }
  const ics: number[] = [];
  for (const g of byDate.values()) {
    if (g.length < 20) continue;
    const v = spearman(g.map((x) => get(x) as number), g.map((r) => r.out[PRIMARY]!.ret));
    if (v !== null) ics.push(v);
  }
  if (ics.length < 10) return { ic: NaN, t: NaN, days: ics.length };
  const m = mean(ics);
  const sd = Math.sqrt(mean(ics.map((x) => (x - m) ** 2)));
  return { ic: m, t: sd > 0 ? (m / sd) * Math.sqrt(ics.length) : NaN, days: ics.length };
}

/* ---------------- laporan ---------------- */
const L: string[] = [];
const w = (s = "") => L.push(s);

w("# Laporan backtest skor ANS Screener (Scoring v2 · Anti-Sideways)");
w();
w(`- Data: ${files.length} file, ${series.size} ticker, ${dates[0]} s/d ${dates[dates.length - 1]}`);
w(`- Sinyal diuji: ${sigs.length} (saham bullish, likuid ≥ Rp ${MIN_VALUE.toLocaleString("id-ID")}/hari), pengambilan sampel tiap ${STEP} bar`);
w(`- Supertrend: ATR ${ST_PERIOD}, multiplier ${ST_MULT}. Entry = open hari berikutnya, biaya round-trip ${pct(COST, 2)}`);
w(`- Train: sebelum ${splitDate} (${train.length} sinyal). Test: sejak ${splitDate} (${test.length} sinyal). Batas kuintil ditentukan dari TRAIN saja.`);
w(`- Horizon utama untuk analisis: ${PH} hari bursa.`);
w();
w("> Catatan: sinyal harian saling tumpang-tindih (saham yang sama muncul berhari-hari, dan return 10 hari antar hari berdekatan berkorelasi), sehingga angka t/IC terlihat lebih meyakinkan daripada sebenarnya. Anggap hasil sebagai petunjuk, bukan bukti.");
w();

w("## 1. Seluruh sinyal (pembanding)");
w();
w(HEAD);
for (let i = 0; i < HORIZONS.length; i++) {
  const s = stats(sigs, i);
  w(row(`Semua sinyal, ${HORIZONS[i]} hari`, s));
  addCsv("semua", "Semua sinyal", HORIZONS[i], s);
}
w();

for (const [per, rows] of [["TRAIN", train], ["TEST", test]] as const) {
  w(`## 2${per === "TRAIN" ? "a" : "b"}. Skor per kuintil, periode ${per}`);
  w();
  for (let i = 0; i < HORIZONS.length; i++) {
    w(`**Horizon ${HORIZONS[i]} hari**`);
    w();
    w(HEAD);
    const bs = byBucket(rows);
    for (let b = 0; b < 5; b++) {
      const s = stats(bs[b], i);
      w(row(bucketLabel(b), s));
      addCsv(per.toLowerCase(), bucketLabel(b), HORIZONS[i], s);
    }
    const sBase = stats(rows, i);
    w(row("Semua", sBase));
    addCsv(per.toLowerCase(), "Semua", HORIZONS[i], sBase);
    w();
  }
}

// Ambang tetap aplikasi (Top Pick >= 86 & SL <= 8%) di periode TEST
w(`## 3. Ambang tetap aplikasi & Top Pick (periode TEST, ${PH} hari)`);
w();
w(HEAD);
for (const th of [60, 70, 78, 86]) {
  const sel = test.filter((s) => s.score >= th);
  const s = stats(sel, PRIMARY);
  w(row(`Skor ≥ ${th}`, s));
  addCsv("test", `Skor >= ${th}`, PH, s);
}
const topPickStrict = test.filter((s) => s.score >= 86 && (s.slRiskPct === null || s.slRiskPct >= -8));
const sTopStrict = stats(topPickStrict, PRIMARY);
w(row("**Top Pick Aplikasi (Skor ≥ 86 & SL ≤ 8%)**", sTopStrict));
addCsv("test", "Top Pick Aplikasi (>=86 & SL<=8%)", PH, sTopStrict);
w();

w(`## 4. Daya prediksi tiap faktor (Spearman IC terhadap return ${PH} hari)`);
w();
w("IC = korelasi peringkat antar saham pada hari yang sama, dirata-ratakan lintas hari. **t\\*** = t dibagi akar(horizon) untuk mengoreksi return yang tumpang-tindih. Faktor layak dipercaya bila tanda IC sama di TRAIN dan TEST, |IC| > 0,02, dan |t\\*| > 2 di keduanya.");
w();
w("| Faktor | Bobot | IC train | t* | IC test | t* | Konsisten? |\n|---|---:|---:|---:|---:|---:|---|");
for (let k = 0; k < partMeta.length; k++) {
  const pm = partMeta[k];
  const a = icOf(train, (s) => s.fr[k]);
  const b = icOf(test, (s) => s.fr[k]);
  const same =
    Number.isFinite(a.ic) && Number.isFinite(b.ic) && Math.sign(a.ic) === Math.sign(b.ic) &&
    Math.abs(a.ic) > 0.02 && Math.abs(b.ic) > 0.02 && Math.abs(a.t) / Math.sqrt(PH) > 2 && Math.abs(b.t) / Math.sqrt(PH) > 2;
  w(`| ${pm.label} | ${pm.weight} | ${a.ic.toFixed(3)} | ${(a.t / Math.sqrt(PH)).toFixed(1)} | ${b.ic.toFixed(3)} | ${(b.t / Math.sqrt(PH)).toFixed(1)} | ${same ? (a.ic > 0 ? "ya, positif" : "ya, NEGATIF") : "tidak"} |`);
}
// Tambahan IC khusus metrik anti-sideways baru (negatif pada flips60 berarti makin banyak flip makin buruk return-nya)
const flipTr = icOf(train, (s) => s.flips60), flipTe = icOf(test, (s) => s.flips60);
w(`| *Metrik baru: Frekuensi Flip 60h* | – | ${flipTr.ic.toFixed(3)} | ${(flipTr.t / Math.sqrt(PH)).toFixed(1)} | ${flipTe.ic.toFixed(3)} | ${(flipTe.t / Math.sqrt(PH)).toFixed(1)} | (negatif = whipsaw buruk) |`);
const erTr = icOf(train, (s) => s.er30), erTe = icOf(test, (s) => s.er30);
w(`| *Metrik baru: Efficiency Ratio 30h* | – | ${erTr.ic.toFixed(3)} | ${(erTr.t / Math.sqrt(PH)).toFixed(1)} | ${erTe.ic.toFixed(3)} | ${(erTe.t / Math.sqrt(PH)).toFixed(1)} | (positif = tren lurus unggul) |`);
const sa = icOf(train, (s) => s.score), sb = icOf(test, (s) => s.score);
w(`| **Skor total (setelah penalti)** | 100 | ${sa.ic.toFixed(3)} | ${(sa.t / Math.sqrt(PH)).toFixed(1)} | ${sb.ic.toFixed(3)} | ${(sb.t / Math.sqrt(PH)).toFixed(1)} | |`);
w();

w(`## 5. Faktor tinggi vs rendah & Uji Filter Anti-Sideways (seluruh data, ${PH} hari)`);
w();
w("Tinggi = fraksi faktor ≥ 0,67 (untuk pola candle: ada pola). Rendah = ≤ 0,33 (pola candle: tidak ada).");
w();
w("| Faktor | n tinggi | Rata-rata tinggi | Stop tinggi | n rendah | Rata-rata rendah | Stop rendah | Selisih |\n|---|---:|---:|---:|---:|---:|---:|---:|");
for (let k = 0; k < partMeta.length; k++) {
  const pm = partMeta[k];
  const isCandle = pm.key === "candle";
  const hi = sigs.filter((s) => (isCandle ? s.fr[k] > 0 : s.fr[k] >= 0.67));
  const lo = sigs.filter((s) => (isCandle ? s.fr[k] === 0 : s.fr[k] <= 0.33));
  const a = stats(hi, PRIMARY), b = stats(lo, PRIMARY);
  w(`| ${pm.label} | ${a.n} | ${pct(a.avg)} | ${pct(a.stop, 0)} | ${b.n} | ${pct(b.avg)} | ${pct(b.stop, 0)} | ${pct(a.avg - b.avg)} |`);
}
w();

// Uji langsung efektivitas penalti struktural & filter anti-sideways
w(`### 5b. Dampak Filter Anti-Sideways (seluruh data, ${PH} hari)`);
w();
w(HEAD);
w(row("Struktur tren bersih (tanpa penalti)", stats(sigs.filter((s) => !s.penalized), PRIMARY)));
w(row("Terkena penalti (sideways / < EMA50 / ret60≤0)", stats(sigs.filter((s) => s.penalized), PRIMARY)));
w(row("Tren mulus (flips60 ≤ 2)", stats(sigs.filter((s) => s.flips60 !== null && s.flips60 <= 2), PRIMARY)));
w(row("Pasar choppy/whipsaw (flips60 ≥ 4)", stats(sigs.filter((s) => s.flips60 !== null && s.flips60 >= 4), PRIMARY)));
w(row("Efficiency Ratio tinggi (er30 ≥ 0.35)", stats(sigs.filter((s) => s.er30 !== null && s.er30 >= 0.35), PRIMARY)));
w(row("Efficiency Ratio rendah / sideways (er30 < 0.18)", stats(sigs.filter((s) => s.er30 !== null && s.er30 < 0.18), PRIMARY)));
w();

const hasRegime = sigs.some((s) => s.regime !== null);
if (hasRegime) {
  w(`## 6. Rezim IHSG saat sinyal (${PH} hari)`);
  w();
  w(`Rezim = arah Supertrend ${INDEX_TICKER} (parameter sama) pada tanggal sinyal. Kolom kedua = hanya skor di kuintil teratas (batas dari train).`);
  w();
  w(HEAD);
  for (const [label, r] of [["IHSG bullish", 1], ["IHSG bearish", -1]] as const) {
    const g = sigs.filter((s) => s.regime === r);
    const top = g.filter((s) => bucketOf(s.score) === 4);
    const s1 = stats(g, PRIMARY), s2 = stats(top, PRIMARY);
    w(row(`${label} — semua sinyal`, s1));
    w(row(`${label} — kuintil teratas`, s2));
    addCsv("semua", `${label} semua`, PH, s1);
    addCsv("semua", `${label} Q5`, PH, s2);
  }
  w();
}

// ringkasan
const q = (rows: Sig[], b: number) => stats(byBucket(rows)[b], PRIMARY);
const trQ5 = q(train, 4), trQ1 = q(train, 0), teQ5 = q(test, 4), teQ1 = q(test, 0), teAll = stats(test, PRIMARY);
const spreadTrain = trQ5.avg - trQ1.avg, spreadTest = teQ5.avg - teQ1.avg, edgeTest = teQ5.avg - teAll.avg;
w("## Ringkasan");
w();
w(`- Selisih kuintil teratas − terendah (${PH} hari): train ${pct(spreadTrain)}, test ${pct(spreadTest)}.`);
w(`- Kuintil teratas vs seluruh sinyal di periode test: ${pct(edgeTest)} (n=${teQ5.n}).`);
w(`- Top Pick Aplikasi (Skor ≥ 86 & SL ≤ 8%) di periode test: rata-rata ${pct(sTopStrict.avg)}, kena stop ${pct(sTopStrict.stop, 0)} (n=${sTopStrict.n}).`);
w(`- Kuintil teratas: kena stop ${pct(teQ5.stop, 0)} vs ${pct(teAll.stop, 0)} untuk seluruh sinyal (periode test).`);
let verdict: string;
if (teQ5.n < 300) verdict = "Sampel kuintil teratas di periode test masih kecil (n < 300); kesimpulan belum bisa dipercaya. Tambah riwayat data.";
else if (spreadTrain > 0 && spreadTest > 0 && edgeTest > 0) verdict = "Skor tinggi lebih baik daripada skor rendah di train DAN test. Itu pertanda baik, tetapi belum bukti: periksa tabel IC per faktor dan rezim IHSG sebelum menyetel bobot.";
else if (spreadTrain > 0 && spreadTest <= 0) verdict = "Skor tampak berguna di train tetapi TIDAK bertahan di test — ciri khas overfitting/kebetulan. Jangan percaya skor ini apa adanya.";
else verdict = "Skor tidak memisahkan hasil yang baik dari yang buruk. Bobot saat ini belum punya bukti keunggulan; sederhanakan atau ganti faktor.";
w(`- **Kesimpulan awal:** ${verdict}`);
w();
w("Keterbatasan: tidak memodelkan batas ARA/ARB, antrean order, slippage pada saham tidak likuid, atau corporate action (split) pada data. Return 'dengan stop' keluar di open setelah Supertrend berbalik, sehingga bisa lebih buruk bila terjadi gap.");

const outDir = resolve(String(opt.out));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "backtest-report.md"), L.join("\n") + "\n");
writeFileSync(join(outDir, "backtest-buckets.csv"), csv.join("\n") + "\n");
if (opt.dump) {
  const lines = ["ticker,date,score,raw_score,penalized,flips60,er30,regime," + HORIZONS.flatMap((h) => [`ret${h}`, `retstop${h}`, `stop${h}`, `mae${h}`]).join(",")];
  for (const s of sigs) {
    lines.push([s.ticker, s.date, s.score, s.rawScore, s.penalized ? 1 : 0, s.flips60 ?? "", s.er30 ?? "", s.regime ?? "", ...s.out.flatMap((o) => (o ? [o.ret, o.retStop, o.stop ? 1 : 0, o.mae] : ["", "", "", ""]))].join(","));
  }
  writeFileSync(join(outDir, "backtest-signals.csv"), lines.join("\n") + "\n");
}
console.log(L.join("\n"));
console.error(`\nLaporan disimpan di ${join(outDir, "backtest-report.md")}`);