const STYLES: Record<string, string> = {
  PENDING: "bg-accent-100 text-accent-500",
  CONFIRMED: "bg-brand-100 text-brand-600",
  CANCELLED: "bg-danger-100 text-danger-600",
};

export const STATUS_LABELS: Record<string, string> = {
  PENDING: "Oczekuje na wpłatę",
  CONFIRMED: "Potwierdzona",
  CANCELLED: "Anulowana",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status] ?? "bg-slate-100 text-slate-500"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
