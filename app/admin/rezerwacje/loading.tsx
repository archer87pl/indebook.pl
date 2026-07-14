import { ToolbarSkeleton, TableSkeleton } from "@/components/admin/PanelSkeleton";

/** Lista rezerwacji: zakładki statusów + wyszukiwarka + gęsta tabela (2b). */
export default function ReservationsLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Ładowanie rezerwacji…">
      <span className="sr-only">Ładowanie rezerwacji…</span>
      <ToolbarSkeleton />
      <TableSkeleton
        rows={10}
        cols={["w-16", "w-40", "w-36", "w-24", "w-10", "w-24", "w-20", "w-24"]}
      />
    </div>
  );
}
