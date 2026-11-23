"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchAll, supabaseBrowser } from "@/lib/supabase-browser";
import { INDEX_TICKER, MIN_AVG_VALUE, ST_MULT, ST_PERIOD } from "@/lib/config";
import { Metrics, metricsFromDb } from "@/lib/metrics";
import { percentileMap, scoreMetrics } from "@/lib/scoring";
import {
  buildMorningActionText,
  ceilToIdxTick,
  computePositionSizing,
  DEFAULT_TRADING_PREFS,
  floorToIdxTick,
  loadTradingPrefs,
  saveTradingPrefs,
  type MorningBuyCandidate,
  type PositionRow,
  type TradingPrefs,
} from "@/lib/portfolio-advisor";
import MarketBanner from "./MarketBanner";
import { scoreTone } from "./ScoreBreakdown";

type Row = {
  ticker: string;
  date: string;
  close: number;
  volume: number;
  change_pct: number | null;
  trend: 1 | -1;
  signal: "BUY" | "SELL" | null;
  days_since_flip: number | null;
  stale: boolean;
  score: number | null;
  eligible: boolean;
  ineligibleReason: string | null;
  distAtr: number | null;
  stLine: number | null;
  slTickPrice: number | null; // garis SL sudah dibulatkan 1 tick BEI ke bawah
  maxBuyPrice: number; // batas limit beli +1.5% dibulatkan ke fraksi BEI
  slRiskPct: number | null;
  rsPct: number | null;
  barsInTrend: number | null;
  avgValue: number | null;
  hasMetrics: boolean;
};

type HeldInfo = {
  lots: number;
  isZeroRisk: boolean; // SL terpasang atau garis ST sudah di atas harga beli
};

type SortKey =
  | "ticker"
  | "score"
  | "close"
  | "change_pct"
  | "avgValue"
  | "trend"
  | "distAtr"
  | "slRiskPct"
  | "days_since_flip";
type Preset = "prime" | "all" | "pullback" | "newbuy";
type TrendFilter = "all" | "bull" | "bear";
type Filters = {
  preset: Preset;
  trend: TrendFilter;
  liquidOnly: boolean;
  hideNoVol: boolean;
  hideStale: boolean;
  minScore: string;
  minPrice: string;
  maxPrice: string;
  maxDist: string;
  maxSlPct: string;
};

const DEFAULTS: Filters = {
  preset: "prime",
  trend: "bull",
  liquidOnly: true,
  hideNoVol: true,
  hideStale: true,
  minScore: "",
  minPrice: "",
  maxPrice: "",
  maxDist: "",
  maxSlPct: "",
};
const DEFAULT_SORT: { key: SortKey; dir: 1 | -1 } = { key: "score", dir: -1 };
const STORE_KEY = "ans-screener-v3";
const SORT_KEYS: SortKey[] = [
  "ticker",
  "score",
  "close",
  "change_pct",
  "avgValue",
  "trend",
  "distAtr",
  "slRiskPct",
  "days_since_flip",
];

const SORTS: { id: string; label: string; key: SortKey; dir: 1 | -1 }[] = [
  { id: "score", label: "Skor setup tertinggi", key: "score", dir: -1 },
  { id: "sl", label: "Risiko SL terkecil", key: "slRiskPct", dir: -1 },
  { id: "dist", label: "Paling dekat ke garis", key: "distAtr", dir: 1 },
  { id: "up", label: "Naik terbesar", key: "change_pct", dir: -1 },
  { id: "down", label: "Turun terbesar", key: "change_pct", dir: 1 },
  { id: "value", label: "Nilai transaksi terbesar", key: "avgValue", dir: -1 },
  { id: "az", label: "Ticker A–Z", key: "ticker", dir: 1 },
];

const PRESETS: { id: Preset; label: string; hint: string }[] = [
  {
    id: "prime",
    label: "Top Pick (≥ 86)",
    hint: "Kuintil teratas hasil backtest (skor ≥ 86) & bullish. Prioritaskan yang berstatus Risiko SL ≤ 8%; jika > 8%, pantau untuk entry saat pullback.",
  },
  { id: "all", label: "Semua", hint: "Semua emiten sesuai filter di bawah." },
  {
    id: "pullback",
    label: "Dekat garis SL",
    hint: "Bullish, jarak ke garis Supertrend ≤ 2 ATR, dan tren sudah berjalan ≥ 5 bar (terkonfirmasi). Risiko stop loss pendek.",
  },
  {
    id: "newbuy",
    label: "Sinyal BUY baru",
    hint: "Supertrend baru berbalik menjadi bullish pada bar terakhir (hati-hati false breakout; ideal tunggu ≥ 5 bar).",
  },
];

const PAGE_SIZE = 40;
const idNum = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const idPrice = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const idCompact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

// Tab Top Pick menampilkan semua saham bullish skor >= 86 agar tidak ada kandidat elite yang tersembunyi diam-diam;
// peringatan SL > 8% ditampilkan jelas di kolom Risiko SL, sedangkan Morning Action Sheet tetap menyaring ketat SL <= 8%.
const matchPreset = (r: Row, p: Preset) =>
  p === "all"
    ? true
    : p === "prime"
    ? r.trend === 1 && (r.score ?? 0) >= 86
    : p === "pullback"
    ? r.trend === 1 && r.distAtr !== null && r.distAtr <= 2 && (r.barsInTrend ?? 0) >= 5
    : r.signal === "BUY";

const isWideSl = (r: Row) => r.slRiskPct !== null && r.slRiskPct < -8;

const parseNum = (s: string) => {
  const t = s.trim();
  if (t === "") return null;
  const v = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

export default function Screener() {
  const router = useRouter();
  const listTop = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [openPositions, setOpenPositions] = useState<PositionRow[]>([]);
  const [ihsgBullish, setIhsgBullish] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pengaturan Modal, Risiko/Trade, & Maks Slot Portofolio
  const [prefs, setPrefs] = useState<TradingPrefs>(DEFAULT_TRADING_PREFS);
  const [showSizingBar, setShowSizingBar] = useState(false);
  const [capInput, setCapInput] = useState(String(DEFAULT_TRADING_PREFS.capitalRp));
  const [riskInput, setRiskInput] = useState(String(DEFAULT_TRADING_PREFS.riskPerTradePct));
  const [slotInput, setSlotInput] = useState(String(DEFAULT_TRADING_PREFS.maxPositions));

  // Modal Morning Action Sheet
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [copiedSheet, setCopiedSheet] = useState(false);

  const [f, setFState] = useState<Filters>(DEFAULTS);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const setF = (patch: Partial<Filters>) => setFState((s) => ({ ...s, ...patch }));

  /* ---- simpan / pulihkan pilihan filter & preferensi modal di browser ---- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === "object") {
          setFState({ ...DEFAULTS, ...(p.f ?? {}) });
          if (p.sort && SORT_KEYS.includes(p.sort.key) && (p.sort.dir === 1 || p.sort.dir === -1)) setSort(p.sort);
        }
      }
      const loadedPrefs = loadTradingPrefs();
      setPrefs(loadedPrefs);
      setCapInput(String(loadedPrefs.capitalRp));
      setRiskInput(String(loadedPrefs.riskPerTradePct));
      setSlotInput(String(loadedPrefs.maxPositions));
    } catch {
      /* storage tidak tersedia: abaikan */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ f, sort }));
    } catch {
      /* abaikan */
    }
  }, [f, sort, hydrated]);

  function handleSavePrefs(e: React.FormEvent) {
    e.preventDefault();
    const cap = parseNum(capInput);
    const risk = parseNum(riskInput);
    const slots = parseInt(slotInput, 10);
    const updated: TradingPrefs = {
      capitalRp: cap && cap > 0 ? Math.round(cap) : DEFAULT_TRADING_PREFS.capitalRp,
      riskPerTradePct: risk && risk > 0 && risk <= 10 ? risk : DEFAULT_TRADING_PREFS.riskPerTradePct,
      maxPositions: Number.isInteger(slots) && slots >= 1 && slots <= 20 ? slots : DEFAULT_TRADING_PREFS.maxPositions,
    };
    setPrefs(updated);
    saveTradingPrefs(updated);
    setShowSizingBar(false);
  }

  /* ---- kunci scroll saat panel filter (mobile) terbuka ---- */
  useEffect(() => {
    if (!showFilters) return;
    const prev = document.body.style.overflow;
    if (window.matchMedia("(max-width: 767px)").matches) document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setShowFilters(false);
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", esc);
    };
  }, [showFilters]);

  /* ---- ambil data screener & posisi portofolio aktif ---- */
  useEffect(() => {
    (async () => {
      try {
        const db = supabaseBrowser();
        const [rawScreener, openPosRes] = await Promise.all([
          fetchAll<any>((from, to) => db.from("screener_latest").select("*").range(from, to)),
          db.from("portfolio_positions").select("*").eq("status", "OPEN"),
        ]);

        if (!openPosRes.error && openPosRes.data) {
          setOpenPositions(
            openPosRes.data.map((d: any) => ({
              id: d.id,
              ticker: d.ticker,
              buy_date: d.buy_date,
              buy_price: Number(d.buy_price),
              lots: Number(d.lots),
              sl_installed: d.sl_installed === null ? null : Number(d.sl_installed),
              notes: d.notes ?? null,
              status: d.status,
              sell_date: d.sell_date ?? null,
              sell_price: d.sell_price === null ? null : Number(d.sell_price),
              exit_reason: d.exit_reason ?? null,
            }))
          );
        }

        const data = rawScreener.filter((d) => d.ticker !== INDEX_TICKER);
        const latest = data.reduce((mx, d) => (d.date > mx ? d.date : mx), "");
        const metrics = data.map((d) => metricsFromDb(d));
        const pm = percentileMap(
          data.map((d, i) => ({ key: d.ticker, value: d.date === latest ? metrics[i]?.ret60 ?? null : null }))
        );

        setRows(
          data.map((d, i) => {
            const m: Metrics | null = metrics[i];
            const stale = d.date < latest;
            const rsVal = pm.get(d.ticker);
            const res = m && !stale ? scoreMetrics(m, rsVal ?? null) : null;
            const close = Number(d.close);
            const trend = Number(d.trend) as 1 | -1;
            const stLine = m?.stLine ?? (d.line !== null && d.line !== undefined ? Number(d.line) : null);
            const slTickPrice = trend === 1 && stLine !== null ? floorToIdxTick(stLine, 1) : null;
            const maxBuyPrice = floorToIdxTick(close * 1.015, 0);
            const slRiskPct =
              slTickPrice !== null && close > 0
                ? ((slTickPrice - close) / close) * 100
                : m?.slRiskPct ?? null;

            return {
              ticker: d.ticker,
              date: d.date,
              close,
              volume: Number(d.volume),
              change_pct: d.change_pct === null ? null : Number(d.change_pct),
              trend,
              signal: d.signal,
              days_since_flip: d.days_since_flip === null ? null : Number(d.days_since_flip),
              stale,
              // Tampilkan skor untuk semua emiten bullish yang punya metrik (selaras dengan halaman detail StockChart)
              score: res && trend === 1 ? res.total : null,
              eligible: res?.eligible ?? false,
              ineligibleReason: res?.reason ?? null,
              distAtr: m?.distAtr ?? null,
              stLine,
              slTickPrice,
              maxBuyPrice,
              slRiskPct,
              rsPct: rsVal !== undefined ? Math.round(rsVal * 100) : null,
              barsInTrend: m?.barsInTrend ?? null,
              avgValue: m?.avgValue20 ?? null,
              hasMetrics: !!m,
            };
          })
        );
      } catch (e: any) {
        setError(e.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rowByTicker = useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of rows) m.set(r.ticker, r);
    return m;
  }, [rows]);

  // Peta saham yang sedang dipegang beserta status Zero Risk (untuk badge SUDAH DIPEGANG vs SIAP ADD-ON)
const heldMap = useMemo(() => {
    const map: Record<string, HeldInfo> = {};
    for (const p of openPositions) {
      const r = rowByTicker.get(p.ticker);
      const slActive = p.sl_installed ?? r?.slTickPrice ?? null;
      const netBreakeven = ceilToIdxTick(p.buy_price * 1.004);
      const isZeroRisk =
        slActive !== null &&
        slActive >= netBreakeven &&
        r !== undefined &&
        r.trend === 1 &&
        (r.distAtr === null || (r.distAtr >= 0.5 && r.distAtr <= 2.2));

      if (!map[p.ticker]) {
        map[p.ticker] = { lots: p.lots, isZeroRisk };
      } else {
        map[p.ticker].lots += p.lots;
        map[p.ticker].isZeroRisk = map[p.ticker].isZeroRisk && isZeroRisk;
      }
    }
    return map;
  }, [openPositions, rowByTicker]);

  const latestDate = useMemo(() => rows.reduce((mx, r) => (r.date > mx ? r.date : mx), ""), [rows]);
  const heldTickerCount = useMemo(() => Object.keys(heldMap).length, [heldMap]);
  const freeSlots = Math.max(0, prefs.maxPositions - heldTickerCount);

  const summary = useMemo(() => {
    const live = rows.filter((r) => !r.stale);
    return {
      live: live.length,
      bull: live.filter((r) => r.trend === 1).length,
      bear: live.filter((r) => r.trend === -1).length,
      buy: live.filter((r) => r.signal === "BUY").length,
      sell: live.filter((r) => r.signal === "SELL").length,
      stale: rows.length - live.length,
      noMetrics: live.filter((r) => !r.hasMetrics).length,
    };
  }, [rows]);

  /* ---- penyaringan ---- */
  const base = useMemo(() => {
    const pMin = parseNum(f.minPrice),
      pMax = parseNum(f.maxPrice),
      dMax = parseNum(f.maxDist),
      sMin = parseNum(f.minScore),
      slMax = parseNum(f.maxSlPct);
    const needle = q.trim().toUpperCase();
    return rows.filter((r) => {
      if (needle && !r.ticker.includes(needle)) return false;
      if (f.hideStale && r.stale) return false;
      if (f.hideNoVol && r.volume === 0) return false;
      if (f.liquidOnly && r.avgValue !== null && r.avgValue < MIN_AVG_VALUE) return false;
      if (f.trend === "bull" && r.trend !== 1) return false;
      if (f.trend === "bear" && r.trend !== -1) return false;
      if (pMin !== null && r.close < pMin) return false;
      if (pMax !== null && r.close > pMax) return false;
      if (dMax !== null && (r.distAtr === null || r.distAtr > dMax)) return false;
      if (sMin !== null && (r.score === null || r.score < sMin)) return false;
      if (slMax !== null && (r.slRiskPct === null || Math.abs(r.slRiskPct) > slMax)) return false;
      return true;
    });
  }, [rows, q, f]);

  const presetCounts = useMemo(() => {
    const c = {} as Record<Preset, number>;
    for (const p of PRESETS) c[p.id] = base.filter((r) => matchPreset(r, p.id)).length;
    return c;
  }, [base]);

  const filtered = useMemo(() => {
    const list = base.filter((r) => matchPreset(r, f.preset));
    const { key, dir } = sort;
    return list.sort((a, b) => {
      // Pada tab Top Pick & default sort skor, utamakan yang SL <= 8% lebih dulu bila skornya sama/tinggi
      const av = a[key],
        bv = b[key];
      if (av === null && bv === null) return a.ticker.localeCompare(b.ticker);
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      const cmp = ((av as number) - (bv as number)) * dir;
      if (cmp !== 0) return cmp;
      return Number(isWideSl(a)) - Number(isWideSl(b));
    });
  }, [base, f.preset, sort]);

  // Kandidat antrean beli untuk Morning Action Sheet (ketat: Top Pick >= 86, likuid, SL <= 8%, belum dipegang)
  const morningBuyCandidates: MorningBuyCandidate[] = useMemo(() => {
    return rows
      .filter(
        (r) =>
          !r.stale &&
          r.volume > 0 &&
          r.eligible &&
          r.trend === 1 &&
          (r.score ?? 0) >= 86 &&
          r.slTickPrice !== null &&
          (r.slRiskPct === null || r.slRiskPct >= -8) &&
          !heldMap[r.ticker]
      )
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .map((r) => {
        const sizing = computePositionSizing({
          entryPrice: r.close,
          stopLossPrice: r.slTickPrice!,
          prefs,
          ihsgBullish,
        });
        return {
          ticker: r.ticker,
          score: r.score!,
          close: r.close,
          maxBuyLimit: r.maxBuyPrice,
          orderSl: r.slTickPrice!,
          lots: sizing.lots,
          estimatedCostRp: sizing.estimatedCostRp,
        };
      })
      .filter((c) => c.lots > 0);
  }, [rows, heldMap, prefs, ihsgBullish]);

  // Teks Morning Action Sheet dari Screener
  const actionSheetText = useMemo(() => {
    const pseudoAdvices = openPositions.map((pos) => {
      const r = rowByTicker.get(pos.ticker);
      if (!r) return { pos, advice: null };
      const isBearish = r.trend !== 1;
      const closeBreachedSl = pos.sl_installed !== null && r.close <= pos.sl_installed;
      const needsSl =
        !isBearish &&
        r.slTickPrice !== null &&
        (pos.sl_installed === null || r.slTickPrice > pos.sl_installed);

return {
        pos,
        advice: {
          code: isBearish || closeBreachedSl ? ("EXIT_STOP" as const) : needsSl ? ("RAISE_SL" as const) : ("HOLD" as const),
          badge: isBearish || closeBreachedSl ? "JUAL BESOK · Sinyal Keluar" : needsSl ? "NAIKKAN TRAILING SL" : "HOLD",
          badgeCls: "",
          borderCls: "",
          cardTintCls: "",
          healthScore: isBearish || closeBreachedSl ? 8 : 75,
          healthLabel: "",
          healthColorCls: "",
          healthReasons: [],
          headline: "",
          detail: "",
          suggestedSl: r.slTickPrice,
          holdingBars: 1,
          daysToTimeStop: 19,
          currentPrice: r.close,
          netBreakevenPrice: ceilToIdxTick(pos.buy_price * 1.004),
          stLine: r.stLine ?? r.close,
          pnlRp: (r.close - pos.buy_price) * pos.lots * 100,
          pnlPct: ((r.close - pos.buy_price) / pos.buy_price) * 100,
          marketValue: r.close * pos.lots * 100,
          slRiskFromCurrentPct: r.slRiskPct ?? 0,
          lockedPnlRp:
            r.slTickPrice !== null ? (r.slTickPrice - pos.buy_price) * pos.lots * 100 : null,
          lockedPnlPct:
            r.slTickPrice !== null ? ((r.slTickPrice - pos.buy_price) / pos.buy_price) * 100 : null,
          isBreakevenOrBetter: (r.slTickPrice ?? 0) >= pos.buy_price,
          currentSetupScore: r.score,
          addOnReady: false,
          addOnSuggestedLots: 0,
        },
      };
    });

    return buildMorningActionText({
      dateLabel: latestDate ? fmtDate(latestDate) : undefined,
      ihsgBullish,
      openAdvices: pseudoAdvices,
      buyCandidates: morningBuyCandidates,
      maxPositions: prefs.maxPositions,
    });
  }, [openPositions, rowByTicker, latestDate, ihsgBullish, morningBuyCandidates, prefs.maxPositions]);

  async function copyActionSheet() {
    try {
      await navigator.clipboard.writeText(actionSheetText);
      setCopiedSheet(true);
      setTimeout(() => setCopiedSheet(false), 2500);
    } catch {
      /* abaikan */
    }
  }

  useEffect(() => setPage(0), [q, f, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const view = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const open = (t: string) => router.push(`/stock/${encodeURIComponent(t)}`);
  const goPage = (p: number) => {
    setPage(p);
    listTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const activeCount = (
    ["trend", "liquidOnly", "hideNoVol", "hideStale", "minScore", "minPrice", "maxPrice", "maxDist", "maxSlPct"] as (keyof Filters)[]
  ).filter((k) => f[k] !== DEFAULTS[k]).length;
  const reset = () => {
    setFState(DEFAULTS);
    setQ("");
    setSort(DEFAULT_SORT);
  };

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "ticker" || key === "distAtr" ? 1 : -1 }
    );
  }

  if (loading) return <Skeleton />;
  if (error) {
    return (
      <div className="space-y-4">
        <MarketBanner bull={0} total={0} onRegimeChange={setIhsgBullish} />
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <div className="font-semibold">Gagal memuat data</div>
          <div className="mt-1">{error}</div>
          <div className="mt-2 text-rose-600">Pastikan migrasi SQL 001 dan 002 sudah dijalankan dan .env.local sudah diisi.</div>
        </div>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">
        Belum ada hasil Supertrend. Unggah data lewat halaman{" "}
        <a className="font-medium text-emerald-700 underline" href="/admin/upload">
          Upload data
        </a>
        .
      </div>
    );
  }

  const panel = <FilterPanel f={f} setF={setF} staleCount={summary.stale} />;
  const sortId = SORTS.find((s) => s.key === sort.key && s.dir === sort.dir)?.id ?? "";
  const presetHint = PRESETS.find((p) => p.id === f.preset)!.hint;

  return (
    <div className="space-y-5">
      <MarketBanner bull={summary.bull} total={summary.bull + summary.bear} onRegimeChange={setIhsgBullish} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Screener saham</h1>
          <p className="text-xs text-slate-500 md:text-sm">
            Data per {fmtDate(latestDate)} · Supertrend ATR {ST_PERIOD}, multiplier {ST_MULT.toFixed(1)} · {summary.live} emiten aktif
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="hidden text-slate-600 sm:inline">
            <b className="text-emerald-600">{summary.buy}</b> BUY · <b className="text-rose-600">{summary.sell}</b> SELL
          </span>

          <button
            onClick={() => setShowSizingBar((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
            title="Atur modal, batas risiko per trade, dan batas jumlah posisi portofolio"
          >
            <span>Modal: Rp {idCompact.format(prefs.capitalRp)}</span>
            <span className="text-slate-400">·</span>
            <span>Risk {prefs.riskPerTradePct}%</span>
            {ihsgBullish === false && (
              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                Porsi 50%
              </span>
            )}
          </button>

          <button
            onClick={() => setShowActionSheet(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-800"
          >
            Morning Action Sheet
          </button>

          <a
            href="/portfolio"
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50/70 px-3 py-1.5 font-semibold text-emerald-900 hover:bg-emerald-100/70"
          >
            <span>Portofolio</span>
            <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {heldTickerCount}/{prefs.maxPositions}
            </span>
            <span>→</span>
          </a>
        </div>
      </div>

      {/* Bar Pengaturan Modal & Risk Sizing */}
      {showSizingBar && (
        <form onSubmit={handleSavePrefs} className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Pengaturan Position Sizing & Slot Portofolio</h2>
              <p className="text-xs text-slate-500">
                Digunakan untuk menghitung Lot Ideal otomatis di Screener, Detail Saham, dan Morning Action Sheet.
              </p>
            </div>
            {ihsgBullish === false && (
              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
                IHSG Bearish Aktif: Lot otomatis dikali 50%
              </span>
            )}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Total Modal (Rp)</span>
              <input
                required
                inputMode="numeric"
                value={capInput}
                onChange={(e) => setCapInput(e.target.value)}
                placeholder="100000000"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Maks Risiko / Trade (%)</span>
              <input
                required
                inputMode="decimal"
                value={riskInput}
                onChange={(e) => setRiskInput(e.target.value)}
                placeholder="1.0"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Maks Slot Saham Aktif</span>
              <input
                required
                inputMode="numeric"
                value={slotInput}
                onChange={(e) => setSlotInput(e.target.value)}
                placeholder="5"
                className={inputCls}
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Simpan Pengaturan
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Indikator Slot Portofolio */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-slate-700">
          <span className="font-semibold text-slate-900">
            Slot Portofolio Terisi: {heldTickerCount} / {prefs.maxPositions} posisi
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 font-bold ${
              freeSlots > 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {freeSlots > 0 ? `Sisa ${freeSlots} slot belanja besok` : "Slot penuh · Tunggu exit dulu"}
          </span>
        </div>
        <div className="text-slate-500">
          Batas rugi per posisi:{" "}
          <b className="tabular-nums text-slate-800">
            Rp {idPrice.format(prefs.capitalRp * (prefs.riskPerTradePct / 100) * (ihsgBullish === false ? 0.5 : 1))}
          </b>{" "}
          ({ihsgBullish === false ? `${prefs.riskPerTradePct * 0.5}% defensif` : `${prefs.riskPerTradePct}% standar`})
        </div>
      </div>

      {summary.noMetrics > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {summary.noMetrics} emiten belum punya skor setup. Jalankan upload dengan “Rebuild riwayat” agar terhitung.
        </div>
      )}

      {/* ---- Kontrol ---- */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 md:p-4">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Preset">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={f.preset === p.id}
              onClick={() => setF({ preset: p.id })}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium ${
                f.preset === p.id
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {p.label}
              <span className={`ml-1.5 text-xs tabular-nums ${f.preset === p.id ? "text-slate-300" : "text-slate-400"}`}>
                {presetCounts[p.id]}
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{presetHint}</p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari ticker, mis. BBCA"
              aria-label="Cari ticker"
              autoCapitalize="characters"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 pr-9 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                aria-label="Hapus pencarian"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <label className="flex-1 sm:flex-none lg:hidden">
              <span className="sr-only">Urutkan</span>
              <select
                value={sortId}
                onChange={(e) => {
                  const s = SORTS.find((x) => x.id === e.target.value);
                  if (s) setSort({ key: s.key, dir: s.dir });
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                {sortId === "" && <option value="">Urutan kustom</option>}
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium ${
                showFilters
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Filter
              {activeCount > 0 && (
                <span className="rounded-full bg-emerald-500 px-1.5 text-xs font-bold text-white">{activeCount}</span>
              )}
            </button>
          </div>
        </div>

        {/* panel inline (desktop/tablet) */}
        {showFilters && (
          <div className="hidden border-t border-slate-100 pt-3 md:block">
            {panel}
            <div className="mt-3 flex justify-end">
              <button onClick={reset} className="text-sm text-slate-500 hover:text-slate-800">
                Reset semua
              </button>
            </div>
          </div>
        )}
      </div>

      {/* bottom-sheet (mobile) */}
      {showFilters && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Filter">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowFilters(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-base font-semibold">Filter</h2>
              <button onClick={reset} className="text-sm text-slate-500">
                Reset
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-4">{panel}</div>
            <div className="border-t border-slate-100 p-3">
              <button
                onClick={() => setShowFilters(false)}
                className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white"
              >
                Tampilkan {filtered.length} emiten
              </button>
            </div>
          </div>
        </div>
      )}

      <div ref={listTop} className="flex items-center justify-between scroll-mt-16">
        <div className="text-sm text-slate-600">
          <b className="tabular-nums text-slate-900">{filtered.length}</b> emiten · ketuk baris untuk grafik dan rincian skor
        </div>
      </div>

      <details className="group rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <summary className="cursor-pointer select-none font-medium text-slate-700">
          Panduan eksekusi EOD & cara membaca kolom
        </summary>
        <dl className="mt-3 grid gap-x-8 gap-y-2.5 text-slate-600 md:grid-cols-2">
          <Def t="Skor (0–100)">
            Teruji backtest untuk swing 10–20 hari bursa. Fokus utama pada kuintil teratas (Skor ≥ 86) dan urutkan dari skor
            tertinggi.
          </Def>
          <Def t="Order SL (Fraksi BEI)">
            Otomatis dibulatkan 1 tick BEI di bawah garis Supertrend ATR {ST_PERIOD} (mult {ST_MULT}) agar siap langsung dipasang di
            sekuritas. Hindari entry langsung jika risiko SL lebih dalam dari -8% (tunggu pullback).
          </Def>
          <Def t="Lot Ideal (Position Sizing)">
            Dihitung otomatis dari batas risiko modal Anda per trade dan jarak ke Order SL (otomatis dipotong 50% jika IHSG
            Bearish).
          </Def>
          <Def t="Batas Beli (+1,5%)">
            Harga limit order beli maksimal (sudah sesuai fraksi BEI). Jika harga pembukaan gap up di atas batas ini, lewati
            kandidat tersebut.
          </Def>
          <Def t="Usia Tren (Bar)">
            Tren paling optimal di rentang 5–40 bar sejak sinyal BUY. Sinyal 1–4 bar masih rawan false breakout, sedangkan di atas
            40 bar sudah matang.
          </Def>
          <Def t="RS % & Nilai/hari">
            Peringkat kekuatan relatif 3 bulan (0–100%) dan rata-rata likuiditas 20 hari (minimal Rp {idNum.format(MIN_AVG_VALUE)}
            /hari).
          </Def>
        </dl>
        <p className="mt-3 text-xs text-slate-500">Alat bantu analisis teknikal, bukan rekomendasi investasi.</p>
      </details>

      {/* ---- Tabel (layar lebar) ---- */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white lg:block">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <Th k="ticker" label="Ticker" sort={sort} onSort={toggleSort} />
              <Th
                k="score"
                label="Skor"
                sort={sort}
                onSort={toggleSort}
                tip="Kuintil teratas ≥ 86 teruji unggul pada backtest"
              />
              <Th k="close" label="Close" right sort={sort} onSort={toggleSort} />
              <Th k="change_pct" label="Chg %" right sort={sort} onSort={toggleSort} />
              <th
                className="px-3 py-2.5 text-right font-medium"
                title="Batas maksimal limit order beli (+1,5% dibulatkan ke fraksi BEI)"
              >
                Beli Maks
              </th>
              <th
                className="px-3 py-2.5 text-right font-medium"
                title="Harga auto-SL (1 tick BEI di bawah garis Supertrend)"
              >
                Order SL
              </th>
              <Th
                k="slRiskPct"
                label="Risiko SL"
                right
                sort={sort}
                onSort={toggleSort}
                tip="Persentase rugi dari close jika kena Order SL (maksimal ideal -8%)"
              />
              <th
                className="px-3 py-2.5 text-right font-medium"
                title="Ukuran lot ideal sesuai batas risiko modal & rezim IHSG"
              >
                Lot Ideal
              </th>
              <Th
                k="days_since_flip"
                label="Usia tren"
                sort={sort}
                onSort={toggleSort}
                tip="Ideal pada 5–40 bar sejak sinyal BUY"
              />
              <th className="px-3 py-2.5 text-right font-medium" title="Peringkat kekuatan relatif 60 bar (0–100)">
                RS
              </th>
              <Th
                k="avgValue"
                label="Nilai/hari"
                right
                sort={sort}
                onSort={toggleSort}
                tip="Rata-rata nilai transaksi 20 hari"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.map((r) => {
              const held = heldMap[r.ticker];
              const wideSl = isWideSl(r);
              const sizing =
                r.trend === 1 && r.slTickPrice !== null && !wideSl
                  ? computePositionSizing({
                      entryPrice: r.close,
                      stopLossPrice: r.slTickPrice,
                      prefs,
                      ihsgBullish,
                    })
                  : null;

              return (
                <tr
                  key={r.ticker}
                  onClick={() => open(r.ticker)}
                  className={`cursor-pointer hover:bg-emerald-50/50 ${r.stale ? "text-slate-400" : ""} ${
                    held ? (held.isZeroRisk ? "bg-emerald-50/35" : "bg-sky-50/35") : ""
                  }`}
                >
                  <td className="px-3 py-2.5 font-semibold">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>
                        {r.ticker.replace(/\.JK$/, "")}
                        <span className="text-xs font-normal text-slate-400">.JK</span>
                      </span>
                      {held &&
                        (held.isZeroRisk ? (
                          <span
                            title={`Posisi ${held.lots} Lot sudah Zero Risk (SL >= harga beli), memenuhi syarat add-on`}
                            className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800"
                          >
                            SIAP ADD-ON ({held.lots}L)
                          </span>
                        ) : (
                          <span
                            title={`Saham ini sudah ada di Portofolio Saya (${held.lots} Lot)`}
                            className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800"
                          >
                            SUDAH DIPEGANG ({held.lots}L)
                          </span>
                        ))}
                      {!r.eligible && r.ineligibleReason && (
                        <span
                          title={r.ineligibleReason}
                          className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                        >
                          {r.ineligibleReason}
                        </span>
                      )}
                      {r.stale && <span className="text-[10px] font-normal">({fmtDate(r.date)})</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <ScoreBadge score={r.score} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{idNum.format(r.close)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${chgCls(r.change_pct)}`}>{fmtPct(r.change_pct, true)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                    {r.trend === 1 ? idPrice.format(r.maxBuyPrice) : "–"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-rose-600">
                    {r.slTickPrice === null ? "–" : idPrice.format(r.slTickPrice)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                      r.slRiskPct === null ? "text-slate-400" : wideSl ? "text-rose-600" : "text-emerald-700"
                    }`}
                  >
                    {r.slRiskPct === null ? (
                      "–"
                    ) : (
                      <div className="leading-tight">
                        <span>{r.slRiskPct.toFixed(1)}%</span>
                        {wideSl && (
                          <span className="block text-[10px] font-semibold text-rose-600">Tunggu pullback</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {wideSl ? (
                      <span
                        className="text-[11px] font-medium text-rose-500"
                        title="Jarak SL > 8%, tunggu harga pullback mendekati garis Supertrend"
                      >
                        SL &gt; 8%
                      </span>
                    ) : sizing && sizing.lots > 0 ? (
                      <div className="leading-tight">
                        <span className="font-bold text-slate-900">{sizing.lots} L</span>
                        <span className="block text-[10px] text-slate-400">{idCompact.format(sizing.estimatedCostRp)}</span>
                      </div>
                    ) : (
                      <span className="text-slate-300">–</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <SignalCell r={r} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs tabular-nums text-slate-600">
                    {r.rsPct === null ? "–" : `${r.rsPct}%`}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                    {r.avgValue === null ? "–" : idCompact.format(r.avgValue)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---- Kartu (mobile dan tablet) ---- */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:hidden">
        {view.map((r) => {
          const held = heldMap[r.ticker];
          const wideSl = isWideSl(r);
          const sizing =
            r.trend === 1 && r.slTickPrice !== null && !wideSl
              ? computePositionSizing({
                  entryPrice: r.close,
                  stopLossPrice: r.slTickPrice,
                  prefs,
                  ihsgBullish,
                })
              : null;

          return (
            <button
              key={r.ticker}
              onClick={() => open(r.ticker)}
              className={`flex w-full items-stretch gap-3 rounded-2xl border p-3.5 text-left active:bg-slate-50 ${
                held
                  ? held.isZeroRisk
                    ? "border-emerald-300 bg-emerald-50/30"
                    : "border-sky-200 bg-sky-50/30"
                  : "border-slate-200 bg-white"
              } ${r.stale ? "opacity-60" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-base font-bold">{r.ticker.replace(/\.JK$/, "")}</span>
                  <TrendBadge trend={r.trend} />
                  {held &&
                    (held.isZeroRisk ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        SIAP ADD-ON ({held.lots}L)
                      </span>
                    ) : (
                      <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                        DIPEGANG ({held.lots}L)
                      </span>
                    ))}
                  {wideSl && (
                    <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                      SL &gt; 8% · Tunggu pullback
                    </span>
                  )}
                  {r.rsPct !== null && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      RS {r.rsPct}%
                    </span>
                  )}
                  {r.stale && <span className="text-[10px] text-slate-400">({fmtDate(r.date)})</span>}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-semibold tabular-nums">{idNum.format(r.close)}</span>
                  <span className={`text-sm font-medium tabular-nums ${chgCls(r.change_pct)}`}>{fmtPct(r.change_pct, true)}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <SignalCell r={r} />
                  {r.slTickPrice !== null && (
                    <span>
                      SL <b className="tabular-nums text-rose-600">{idPrice.format(r.slTickPrice)}</b>{" "}
                      {r.slRiskPct !== null && (
                        <b className={`tabular-nums ${wideSl ? "text-rose-600" : "text-emerald-700"}`}>
                          ({r.slRiskPct.toFixed(1)}%)
                        </b>
                      )}
                    </span>
                  )}
                  {r.trend === 1 && (
                    <span>
                      Beli ≤ <b className="tabular-nums text-emerald-700">{idPrice.format(r.maxBuyPrice)}</b>
                    </span>
                  )}
                  {sizing && sizing.lots > 0 && (
                    <span>
                      Ideal <b className="tabular-nums text-slate-800">{sizing.lots} Lot</b> ({idCompact.format(sizing.estimatedCostRp)})
                    </span>
                  )}
                </div>
              </div>
              <ScoreCircle score={r.score} />
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <p className="font-medium text-slate-700">Tidak ada emiten yang cocok</p>
          <p className="mt-1 text-sm text-slate-500">Coba longgarkan filter atau pilih preset &ldquo;Semua&rdquo;.</p>
          <button onClick={reset} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Reset filter
          </button>
        </div>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Halaman">
          <button disabled={page === 0} onClick={() => goPage(page - 1)} className={pageBtn}>
            ← Sebelumnya
          </button>
          <span className="text-slate-600">
            Halaman {page + 1} / {pages}
          </span>
          <button disabled={page >= pages - 1} onClick={() => goPage(page + 1)} className={pageBtn}>
            Berikutnya →
          </button>
        </nav>
      )}

      {/* Modal Morning Action Sheet */}
      {showActionSheet && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setShowActionSheet(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Morning Action Sheet · Rencana Besok Pagi</h3>
                <p className="text-xs text-slate-500">
                  Gabungan prioritas Jual/Exit, Update Auto-SL, dan Antrean Beli Top Pick sesuai sisa slot ({freeSlots}/
                  {prefs.maxPositions}).
                </p>
              </div>
              <button
                onClick={() => setShowActionSheet(false)}
                className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100">
              {actionSheetText}
            </pre>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <a href="/portfolio" className="text-xs font-semibold text-emerald-700 hover:underline">
                Buka detail evaluasi di Portofolio →
              </a>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowActionSheet(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Tutup
                </button>
                <button
                  onClick={copyActionSheet}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  {copiedSheet ? "✓ Tersalin ke Clipboard!" : "Salin Semua Order Besok"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- panel filter ---------- */

function FilterPanel({ f, setF, staleCount }: { f: Filters; setF: (p: Partial<Filters>) => void; staleCount: number }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-5">
        <Field label="Status tren">
          <Segmented
            value={f.trend}
            onChange={(v) => setF({ trend: v as TrendFilter })}
            options={[
              ["bull", "Bullish"],
              ["bear", "Bearish"],
              ["all", "Semua"],
            ]}
          />
        </Field>
        <Field label="Skor setup minimal">
          <input
            value={f.minScore}
            onChange={(e) => setF({ minScore: e.target.value })}
            inputMode="numeric"
            placeholder="mis. 86"
            className={inputCls}
          />
        </Field>
        <Field label="Risiko SL maks (%)" hint="Jarak dari close ke Order SL">
          <input
            value={f.maxSlPct}
            onChange={(e) => setF({ maxSlPct: e.target.value })}
            inputMode="decimal"
            placeholder="mis. 8"
            className={inputCls}
          />
        </Field>
        <Field label="Jarak maks (ATR)" hint="1 ATR ≈ gerak harian">
          <input
            value={f.maxDist}
            onChange={(e) => setF({ maxDist: e.target.value })}
            inputMode="decimal"
            placeholder="mis. 2"
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Harga min">
            <input
              value={f.minPrice}
              onChange={(e) => setF({ minPrice: e.target.value })}
              inputMode="numeric"
              placeholder="0"
              className={inputCls}
            />
          </Field>
          <Field label="Harga maks">
            <input
              value={f.maxPrice}
              onChange={(e) => setF({ maxPrice: e.target.value })}
              inputMode="numeric"
              placeholder="bebas"
              className={inputCls}
            />
          </Field>
        </div>
      </div>
      <div className="grid gap-1 text-sm text-slate-700 md:grid-cols-3">
        <Check checked={f.liquidOnly} onChange={(v) => setF({ liquidOnly: v })}>
          Hanya saham likuid (≥ Rp {idNum.format(MIN_AVG_VALUE)}/hari)
        </Check>
        <Check checked={f.hideNoVol} onChange={(v) => setF({ hideNoVol: v })}>
          Sembunyikan yang tidak ada transaksi hari ini
        </Check>
        <Check checked={f.hideStale} onChange={(v) => setF({ hideStale: v })}>
          Sembunyikan data lama ({staleCount})
        </Check>
      </div>
    </div>
  );
}

/* ---------- komponen kecil ---------- */

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500";
const pageBtn = "rounded-xl border border-slate-300 bg-white px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-40";

function Skeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Memuat data">
      <div className="h-44 animate-pulse rounded-2xl bg-slate-200/70" />
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200/70" />
      <div className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />
      ))}
    </div>
  );
}

function Th({
  k,
  label,
  right,
  sort,
  onSort,
  tip,
}: {
  k: SortKey;
  label: string;
  right?: boolean;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  tip?: string;
}) {
  const active = sort.key === k;
  return (
    <th
      scope="col"
      title={tip}
      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
      className={`px-3 py-2.5 font-medium ${right ? "text-right" : "text-left"}`}
    >
      <button onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-slate-900 ${active ? "text-slate-900" : ""}`}>
        {label}
        <span className="w-2 text-[10px]">{active ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg py-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
      />
      <span>{children}</span>
    </label>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex overflow-hidden rounded-xl border border-slate-300 text-sm">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`flex-1 px-2 py-2.5 ${value === v ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Def({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-slate-800">{t}</dt>
      <dd className="mt-0.5 leading-relaxed">{children}</dd>
    </div>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null)
    return (
      <span className="text-xs text-slate-300" title="Tidak diberi skor (bearish atau data lama)">
        –
      </span>
    );
  return (
    <span className={`inline-block min-w-[2.25rem] rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums ${scoreTone(score)}`}>
      {score}
    </span>
  );
}

function ScoreCircle({ score }: { score: number | null }) {
  return score === null ? (
    <div
      className="flex h-12 w-12 shrink-0 flex-col items-center justify-center self-center rounded-full border border-dashed border-slate-300 text-xs text-slate-400"
      title="Tanpa skor"
    >
      –
    </div>
  ) : (
    <div className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center self-center rounded-full ${scoreTone(score)}`}>
      <span className="text-base font-bold leading-none tabular-nums">{score}</span>
      <span className="mt-0.5 text-[9px] font-medium uppercase leading-none opacity-70">skor</span>
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
    return (
      <span
        className={`rounded px-1.5 py-0.5 text-xs font-bold text-white ${r.signal === "BUY" ? "bg-emerald-600" : "bg-rose-600"}`}
      >
        {r.signal} baru
      </span>
    );
  }
  const bars = r.barsInTrend ?? r.days_since_flip;
  if (bars === null) return <span className="text-xs text-slate-400">–</span>;
  const ideal = r.trend === 1 && bars >= 5 && bars <= 40;
  const early = r.trend === 1 && bars < 5;
  const mature = r.trend === 1 && bars > 40;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span>{bars} bar</span>
      {ideal && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Ideal</span>}
      {early && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Dini</span>}
      {mature && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Tua</span>}
    </span>
  );
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