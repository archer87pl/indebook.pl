import { ToolbarSkeleton, TableSkeleton } from "@/components/admin/PanelSkeleton";

/**
 * Domyślny stan ładowania panelu — pokazuje się natychmiast po kliknięciu
 * pozycji w nawigacji (rail/drawer i topbar zostają interaktywne, bo są
 * w layoucie). Szkielet jest celowo neutralny: obsługuje /admin i wszystkie
 * podstrony, które nie mają własnego loading.tsx.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Ładowanie…">
      <span className="sr-only">Ładowanie…</span>
      <ToolbarSkeleton />
      <TableSkeleton rows={7} />
    </div>
  );
}
