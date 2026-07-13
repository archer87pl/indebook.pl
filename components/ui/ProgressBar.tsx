/** Pasek postępu (obłożenie, płatność): tor #e9efec, wypełnienie #1f7a4d. */
export default function ProgressBar({
  value,
  className = "",
  tone = "primary",
}: {
  value: number; // 0–100
  className?: string;
  tone?: "primary" | "mint" | "warning";
}) {
  const fill =
    tone === "mint" ? "bg-brand-400" : tone === "warning" ? "bg-accent-400" : "bg-brand-600";
  return (
    <div className={`h-[5px] overflow-hidden rounded-[3px] bg-[#e9efec] ${className}`}>
      <div
        className={`h-full rounded-[3px] ${fill}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
