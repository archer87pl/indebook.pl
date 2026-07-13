import type { ReactNode } from "react";
import ProgressBar from "@/components/ui/ProgressBar";

/**
 * Karta KPI wg 1c. Wariant jasny (biała karta) i ciemny hero (#123829)
 * z mintową pigułką trendu.
 */
export default function KpiCard({
  label,
  value,
  sub,
  trend,
  progress,
  dark = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** np. "▲ 18%" — mintowa pigułka (tylko wariant ciemny ma pełny efekt hero) */
  trend?: string;
  /** 0–100 — pasek postępu pod wartością */
  progress?: number;
  dark?: boolean;
}) {
  if (dark) {
    return (
      <div className="relative overflow-hidden rounded-[14px] bg-brand-900 px-[18px] py-4 text-white">
        <div className="text-xs font-semibold text-[#8fb5a2]">{label}</div>
        <div className="nums mt-2 text-[28px] font-bold leading-none tracking-[-0.02em]">
          {value}
        </div>
        {(trend || sub) && (
          <div className="mt-2.5 flex items-center gap-2">
            {trend && (
              <span className="rounded-full bg-brand-400 px-2 py-0.5 text-[11.5px] font-bold text-brand-950">
                {trend}
              </span>
            )}
            {sub && <span className="text-[11.5px] text-[#8fb5a2]">{sub}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-slate-200 bg-white px-4 py-[15px]">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="nums mt-2 text-[26px] font-bold leading-none tracking-[-0.02em]">
        {value}
      </div>
      {progress != null ? (
        <ProgressBar value={progress} className="mt-2.5" />
      ) : (
        sub && <div className="mt-1.5 text-[11.5px] text-slate-400">{sub}</div>
      )}
    </div>
  );
}
