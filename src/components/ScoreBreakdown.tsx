import type { ScoreResult } from "@/lib/scoring";

export function scoreTone(total: number) {
  if (total >= 70) return "bg-emerald-100 text-emerald-700";
  if (total >= 50) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default function ScoreBreakdown({ result }: { result: ScoreResult }) {
  if (!result.eligible) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h2 className="text-sm font-semibold text-slate-700">Skor saham</h2>
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-slate-600">
          Tidak diberi skor: <b>{result.reason}</b>. Skor hanya dihitung untuk saham bullish dengan transaksi harian yang cukup likuid.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Skor saham</h2>
        <span className={`rounded-full px-3 py-1 text-lg font-bold tabular-nums ${scoreTone(result.total)}`}>
          {result.total}
          <span className="text-xs font-medium"> / 100</span>
        </span>
      </div>
      <ul className="mt-3 space-y-3">
        {result.parts.map((p) => (
          <li key={p.key}>
            <div className="flex justify-between text-xs">
              <span className="font-medium text-slate-700">{p.label}</span>
              <span className="tabular-nums text-slate-500">
                {(p.weight * p.fraction).toFixed(1)} / {p.weight}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-emerald-500" style={{ width: `${p.fraction * 100}%` }} />
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">{p.detail}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
