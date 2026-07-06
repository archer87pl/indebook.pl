const STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-slate-200 text-slate-500",
};

export const STATUS_LABELS: Record<string, string> = {
  PENDING: "Oczekuje na wpłatę",
  CONFIRMED: "Potwierdzona",
  CANCELLED: "Anulowana",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status] ?? ""}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
