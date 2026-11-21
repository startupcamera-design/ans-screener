import type { ScoreResult } from "@/lib/scoring";

/**
 * Pewarnaan skor selaras dengan batas kuintil hasil backtest (ATR 14, Mult 2.0):
 * - >= 86 : Q5 (Top Pick / Kuintil Teratas — layak eksekusi utama)
 * - 78-85 : Q4 (Kuat — kandidat cadangan)
 * - 60-77 : Q2-Q3 (Netral / Menengah)
 * - < 60  : Q1 (Lemah — hindari)
 */
export function scoreTone(total: number) {
  if (total >= 86) return "bg-emerald-600 text-white shadow-sm";
  if (total >= 78) return "bg-emerald-100 text-emerald-800";
  if (total >= 60) return "bg-amber-100 text-amber-800";
  return "bg-rose-50 text-rose-700";
}

function scoreVerdict(total: number) {
  if (total >= 86) {
    return {
      badge: "Top Pick · Q5",
      cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
      desc: "Masuk kuintil teratas (≥ 86). Layak diprioritaskan jika jarak SL ≤ 8% dan tidak gap up > 1,5%.",
    };
  }
  if (total >= 78) {
    return {
      badge: "Kuat · Q4",
      cls: "bg-slate-50 text-slate-700 border-slate-200",
      desc: "Setup cukup solid (78–85), cocok sebagai cadangan bila kandidat Top Pick (≥ 86) kosong.",
    };
  }
  if (total >= 60) {
    return {
      badge: "Menengah · Q2–Q3",
      cls: "bg-amber-50/70 text-amber-800 border-amber-200",
      desc: "Momentum belum optimal. Sebaiknya tunggu konsolidasi atau cari skor yang lebih tinggi.",
    };
  }
  return {
    badge: "Lemah · Q1",
    cls: "bg-rose-50/70 text-rose-800 border-rose-200",
    desc: "Kuintil terbawah pada backtest (rata-rata return negatif). Hindari untuk posisi baru.",
  };
}

export default function ScoreBreakdown({ result }: { result: ScoreResult }) {
  if (!result.eligible) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
        <h2 className="text-sm font-semibold text-slate-700">Skor setup</h2>
        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2.5 text-slate-600">
          Tidak diberi skor: <b>{result.reason}</b>. Skor hanya dihitung untuk saham bullish dengan likuiditas ≥ batas minimal.
        </p>
      </div>
    );
  }

  const verdict = scoreVerdict(result.total);
  // Pisahkan faktor aktif (weight > 0) dan urutkan dari bobot terbesar
  const activeParts = result.parts
    .filter((p) => p.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const infoParts = result.parts.filter((p) => p.weight === 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Skor setup</h2>
          <span className="mt-0.5 inline-block text-xs font-medium text-slate-500">
            {verdict.badge}
          </span>
        </div>
        <span className={`rounded-full px-3.5 py-1 text-lg font-bold tabular-nums ${scoreTone(result.total)}`}>
          {result.total}
          <span className="text-xs font-normal opacity-80"> / 100</span>
        </span>
      </div>

      {/* Ringkasan keputusan */}
      <p className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-relaxed ${verdict.cls}`}>
        {verdict.desc}
      </p>

      {/* Rincian faktor aktif */}
      <ul className="mt-4 space-y-3">
        {activeParts.map((p) => {
          const earned = p.weight * p.fraction;
          const pct = Math.round(p.fraction * 100);
          const barColor =
            pct >= 75 ? "bg-emerald-500" : pct >= 45 ? "bg-amber-400" : "bg-rose-400";

          return (
            <li key={p.key}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-slate-700">{p.label}</span>
                <span className="tabular-nums text-slate-600">
                  <b>{earned.toFixed(1)}</b>
                  <span className="text-slate-400"> / {p.weight}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">{p.detail}</div>
            </li>
          );
        })}
      </ul>

      {/* Catatan faktor non-aktif (bobot 0) sebagai referensi visual saja */}
      {infoParts.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Info tambahan (bobot 0)
          </div>
          <div className="mt-1.5 space-y-1 text-xs text-slate-500">
            {infoParts.map((p) => (
              <div key={p.key} className="flex justify-between gap-2">
                <span>{p.label}:</span>
                <span className="text-right font-medium text-slate-600">{p.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}