import Skeleton from "@/components/ui/Skeleton";

/** Kalendarz obłożenia (2d): pasek sterowania + siatka jednostki × dni. */
export default function CalendarLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Ładowanie kalendarza…">
      <span className="sr-only">Ładowanie kalendarza…</span>

      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-8" />
        <Skeleton className="ml-2 h-9 w-36" />
        <Skeleton className="ml-auto h-3 w-64" />
      </div>

      <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
        {/* nagłówek dni */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <div className="w-[172px] flex-none border-r border-slate-200 px-3.5 py-2.5">
            <Skeleton className="h-2.5 w-20" />
          </div>
          <div className="grid flex-1 grid-cols-14">
            {Array.from({ length: 14 }, (_, i) => (
              <div key={i} className="flex flex-col items-center gap-1 py-2">
                <Skeleton className="h-2 w-5" />
                <Skeleton className="h-3 w-4" />
              </div>
            ))}
          </div>
        </div>
        {/* wiersze jednostek z paskami rezerwacji */}
        {Array.from({ length: 6 }, (_, r) => (
          <div key={r} className="flex border-b border-slate-100 last:border-0">
            <div className="w-[172px] flex-none border-r border-slate-200 px-3.5 py-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-1.5 h-2 w-28" />
            </div>
            <div className="relative h-[54px] flex-1">
              {/* pasek rezerwacji — deterministyczne rozmieszczenie per wiersz */}
              <div
                className="absolute top-[9px] h-9 animate-pulse rounded-lg bg-slate-200/80"
                style={{
                  left: `${((r * 17) % 50) + 3}%`,
                  width: `${((r * 13) % 25) + 15}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="mt-2 h-6 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
