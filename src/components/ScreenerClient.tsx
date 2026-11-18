"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAll, supabaseBrowser } from "@/lib/supabase-browser";
import TickerDetail from "./TickerDetail";
import { ST_MULT, ST_PERIOD } from "@/lib/config";

type Row = {
  ticker: string;
  date: string;
  close: number;
  volume: number;
  change_pct: number | null;
  trend: 1 | -1;
  signal: "BUY" | "SELL" | null;
  line: number | null;
  prs: number | null;
  days_since_flip: number | null;
};

type SortKey = "ticker" | "close" | "change_pct" | "volume" | "trend" | "days_since_flip" | "line" | "prs";
type TrendFilter = "all" | "bull" | "bear";
type SignalFilter = "all" | "BUY" | "SELL";

const PAGE_SIZE = 50;
const idNum = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const idCompact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

export default function ScreenerClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [trend, setTrend] = useState<TrendFilter>("all");
  const [signal, setSignal] = useState<SignalFilter>("all");
  const [hideStale, setHideStale] = useState(true);
  const [hideNoVol, setHideNoVol] = useState(true);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minVol, setMinVol] = useState("");
  const [maxDist, setMaxDist] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "ticker", dir: 1 });
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = supabaseBrowser();
        const data = await fetchAll<any>((from, to) =>
          db.from("screener_latest").select("*").order("ticker").range(from, to)
        );
        setRows(
          data.map((d) => ({
            ticker: d.ticker,
            date: d.date,
            close: Number(d.close),
            volume: Number(d.volume),
            change_pct: d.change_pct === null ? null : Number(d.change_pct),
            trend: Number(d.trend) as 1 | -1,
            signal: d.signal,
            line: d.line === null ? null : Number(d.line),
            prs: d.prs === null ? null : Number(d.prs),
            days_since_flip: d.days_since_flip === null ? null : Number(d.days_since_flip),
          }))
        );
      } catch (e: any) {
        setError(e.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const latestDate = useMemo(() => rows.reduce((m, r) => (r.date > m ? r.date : m), ""), [rows]);
  const isStale = (r: Row) => r.date < latestDate;

  // Kartu ringkasan: semua emiten yang ikut update terakhir
  const summary = useMemo(() => {
    const live = rows.filter((r) => !isStale(r));
    return {
      bull: live.filter((r) => r.trend === 1).length,
      bear: live.filter((r) => r.trend === -1).length,
      buy: live.filter((r) => r.signal === "BUY").length,
      sell: live.filter((r) => r.signal === "SELL").length,
      stale: rows.length - live.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, latestDate]);

  const filtered = useMemo(() => {
    const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/\./g, "").replace(",", ".")));
    const pMin = num(minPrice), pMax = num(maxPrice), vMin = num(minVol), dMax = num(maxDist);
    const needle = q.trim().toUpperCase();

    const list = rows.filter((r) => {
      if (needle && !r.ticker.includes(needle)) return false;
      if (hideStale && isStale(r)) return false;
      if (hideNoVol && r.volume === 0) return false;
      if (trend === "bull" && r.trend !== 1) return false;
      if (trend === "bear" && r.trend !== -1) return false;
      if (signal !== "all" && r.signal !== signal) return false;
      if (pMin !== null && r.close < pMin) return false;
      if (pMax !== null && r.close > pMax) return false;
      if (vMin !== null && r.volume < vMin) return false;
      if (dMax !== null && (r.prs === null || Math.abs(r.prs) > dMax)) return false;
      return true;
    });

    const { key, dir } = sort;
    return list.sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av === null && bv === null) return 0;
      if (av === null) return 1; // null selalu di bawah
      if (bv === null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, latestDate, q, trend, signal, hideStale, hideNoVol, minPrice, maxPrice, minVol, maxDist, sort]);

  useEffect(() => setPage(0), [q, trend, signal, hideStale, hideNoVol, minPrice, maxPrice, minVol, maxDist, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const view = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "ticker" ? 1 : -1 }));
  }

  if (loading) return <p className="py-20 text-center text-slate-500">Memuat data…</p>;
  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Gagal memuat data: {error}
        <div className="mt-1 text-rose-600">Pastikan migrasi SQL sudah dijalankan dan .env.local sudah diisi.</div>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-600">
        Belum ada hasil Supertrend. Unggah data lewat halaman <a className="text-emerald-700 underline" href="/admin/upload">Upload data</a>.
      </div>
    );
  }

  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th scope="col" className={`px-3 py-2 font-medium ${right ? "text-right" : "text-left"}`}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-slate-900">
        {label}
        <span className="text-[10px] text-slate-400">{sort.key === k ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Screener Supertrend</h1>
          <p className="text-sm text-slate-500">
            Data per {fmtDate(latestDate)} · ATR {ST_PERIOD} · Multiplier {ST_MULT.toFixed(1)} · {rows.length} emiten
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Bullish" value={summary.bull} tone="emerald" />
        <Card label="Bearish" value={summary.bear} tone="rose" />
        <Card label="Sinyal BUY baru" value={summary.buy} tone="emerald" />
        <Card label="Sinyal SELL baru" value={summary.sell} tone="rose" />
      </div>

      {/* Filter */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Cari ticker">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="mis. BBCA" className={inputCls} />
          </Field>
          <Field label="Status">
            <Segmented
              value={trend}
              onChange={(v) => setTrend(v as TrendFilter)}
              options={[["all", "Semua"], ["bull", "Bullish"], ["bear", "Bearish"]]}
            />
          </Field>
          <Field label="Sinyal hari ini">
            <Segmented
              value={signal}
              onChange={(v) => setSignal(v as SignalFilter)}
              options={[["all", "Semua"], ["BUY", "BUY"], ["SELL", "SELL"]]}
            />
          </Field>
          <Field label="Jarak ke garis ≤ (%)">
            <input value={maxDist} onChange={(e) => setMaxDist(e.target.value)} inputMode="decimal" placeholder="mis. 5" className={inputCls} />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Harga min">
            <input value={minPrice} onChange={(e) => setMinPrice(e.target.value)} inputMode="numeric" placeholder="0" className={inputCls} />
          </Field>
          <Field label="Harga maks">
            <input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} inputMode="numeric" placeholder="tanpa batas" className={inputCls} />
          </Field>
          <Field label="Volume min (lembar)">
            <input value={minVol} onChange={(e) => setMinVol(e.target.value)} inputMode="numeric" placeholder="mis. 1000000" className={inputCls} />
          </Field>
          <div className="flex flex-col justify-end gap-1 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={hideNoVol} onChange={(e) => setHideNoVol(e.target.checked)} />
              Sembunyikan volume 0
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={hideStale} onChange={(e) => setHideStale(e.target.checked)} />
              Sembunyikan data lama ({summary.stale})
            </label>
          </div>
        </div>
      </div>

      <div className="text-sm text-slate-600">{filtered.length} emiten ditemukan</div>

      {/* Tabel (desktop) */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <Th k="ticker" label="Ticker" />
              <Th k="close" label="Harga" right />
              <Th k="change_pct" label="Chg %" right />
              <Th k="volume" label="Volume" right />
              <Th k="trend" label="Status" />
              <Th k="days_since_flip" label="Sinyal terakhir" />
              <Th k="line" label="Garis ST" right />
              <Th k="prs" label="Jarak %" right />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.map((r) => (
              <tr
                key={r.ticker}
                onClick={() => setDetail(r.ticker)}
                className={`cursor-pointer hover:bg-slate-50 ${isStale(r) ? "text-slate-400" : ""}`}
              >
                <td className="px-3 py-2 font-semibold">
                  {r.ticker}
                  {isStale(r) && <span className="ml-2 text-[10px] font-normal">({fmtDate(r.date)})</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{idNum.format(r.close)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${chgCls(r.change_pct)}`}>{fmtPct(r.change_pct, true)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{idCompact.format(r.volume)}</td>
                <td className="px-3 py-2"><TrendBadge trend={r.trend} /></td>
                <td className="px-3 py-2"><SignalCell r={r} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{r.line === null ? "–" : idNum.format(r.line)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtPct(r.prs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Kartu (mobile) */}
      <div className="space-y-2 md:hidden">
        {view.map((r) => (
          <button
            key={r.ticker}
            onClick={() => setDetail(r.ticker)}
            className={`w-full rounded-xl border border-slate-200 bg-white p-3 text-left ${isStale(r) ? "opacity-60" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{r.ticker}</span>
              <TrendBadge trend={r.trend} />
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-lg font-semibold tabular-nums">{idNum.format(r.close)}</span>
              <span className={`text-sm tabular-nums ${chgCls(r.change_pct)}`}>{fmtPct(r.change_pct, true)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>Vol {idCompact.format(r.volume)}</span>
              <SignalCell r={r} />
              <span>Jarak {fmtPct(r.prs)}</span>
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && <p className="py-10 text-center text-slate-500">Tidak ada emiten yang cocok dengan filter.</p>}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className={pageBtn}>← Sebelumnya</button>
          <span className="text-slate-600">Halaman {page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className={pageBtn}>Berikutnya →</button>
        </div>
      )}

      {detail && <TickerDetail ticker={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

/* ---------- komponen kecil ---------- */

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500";
const pageBtn =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Segmented({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="inline-flex w-full overflow-hidden rounded-lg border border-slate-300 text-sm">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex-1 px-3 py-2 ${value === v ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: number; tone: "emerald" | "rose" }) {
  const c = tone === "emerald" ? "text-emerald-600" : "text-rose-600";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${c}`}>{value}</div>
    </div>
  );
}

function TrendBadge({ trend }: { trend: 1 | -1 }) {
  return trend === 1 ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Bullish</span>
  ) : (
    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">Bearish</span>
  );
}

function SignalCell({ r }: { r: Row }) {
  if (r.signal) {
    const buy = r.signal === "BUY";
    return (
      <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${buy ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
        {r.signal} baru
      </span>
    );
  }
  if (r.days_since_flip === null) return <span className="text-xs text-slate-400">–</span>;
  return <span className="text-xs text-slate-500">{r.days_since_flip} hari lalu</span>;
}

function chgCls(v: number | null) {
  if (v === null || v === 0) return "text-slate-500";
  return v > 0 ? "text-emerald-600" : "text-rose-600";
}
function fmtPct(v: number | null, sign = false) {
  if (v === null) return "–";
  return `${sign && v > 0 ? "+" : ""}${idNum.format(v)}%`;
}
function fmtDate(iso: string) {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
