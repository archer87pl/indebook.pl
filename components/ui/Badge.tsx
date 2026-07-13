import type { ReactNode } from "react";

export type BadgeTone =
  | "success"
  | "warning"
  | "info"
  | "danger"
  | "neutral"
  | "mint"
  | "dark";

const TONES: Record<BadgeTone, string> = {
  success: "bg-brand-100 text-brand-600",
  warning: "bg-accent-100 text-accent-500",
  info: "bg-info-100 text-info-600",
  danger: "bg-danger-100 text-danger-600",
  neutral: "bg-slate-100 text-slate-500",
  mint: "bg-brand-400 text-brand-950",
  dark: "bg-brand-900 text-white",
};

/** Pigułka statusu (pełny promień) wg tabeli statusów 1c. */
export default function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
