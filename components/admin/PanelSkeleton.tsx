import Skeleton from "@/components/ui/Skeleton";

/** Szkielet tabeli: nagłówek + `rows` wierszy o szerokościach kolumn `cols`. */
export function TableSkeleton({
  rows = 6,
  cols = ["w-20", "w-44", "w-36", "w-24", "w-20"],
}: {
  rows?: number;
  cols?: string[];
}) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
      <div className="flex items-center gap-4 border-b border-slate-200 bg-slate-50 px-[18px] py-3">
        {cols.map((w, i) => (
          <Skeleton key={i} className={`h-2.5 ${w}`} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-slate-100 px-[18px] py-3.5 last:border-0"
        >
          {cols.map((w, i) => (
            <Skeleton key={i} className={`h-3.5 ${w}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Szkielet paska akcji nad treścią (zakładki / wyszukiwarka / przyciski). */
export function ToolbarSkeleton() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1.5">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-[220px]" />
        <Skeleton className="h-9 w-20" />
      </div>
    </div>
  );
}

/** Szkielet rzędu kart KPI. */
export function KpiRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="rounded-[14px] border border-slate-200 bg-white px-4 py-[15px]"
        >
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="mt-3 h-7 w-28" />
          <Skeleton className="mt-2.5 h-2.5 w-20" />
        </div>
      ))}
    </div>
  );
}
