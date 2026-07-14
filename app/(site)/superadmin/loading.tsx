import { KpiRowSkeleton, TableSkeleton } from "@/components/admin/PanelSkeleton";
import Skeleton from "@/components/ui/Skeleton";

/** Panel platformy — nagłówek i zakładki są w layoucie, ładuje się treść. */
export default function SuperadminLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Ładowanie…">
      <span className="sr-only">Ładowanie…</span>
      <KpiRowSkeleton count={6} />
      <Skeleton className="h-3 w-40" />
      <TableSkeleton rows={6} cols={["w-44", "w-40", "w-28", "w-16", "w-16", "w-20"]} />
    </div>
  );
}
