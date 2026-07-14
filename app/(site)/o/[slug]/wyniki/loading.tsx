import Skeleton from "@/components/ui/Skeleton";

/**
 * Wyszukiwanie terminu — najcięższa publiczna operacja (sprawdzanie
 * dostępności + wycena per typ pokoju), więc loader jest tu najbardziej
 * potrzebny: gość widzi reakcję od razu po kliknięciu „Sprawdź dostępność".
 */
export default function ResultsLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Szukamy wolnych pokoi…">
      <span className="sr-only">Szukamy wolnych pokoi…</span>

      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-[86px] w-full rounded-[14px]" />
      <Skeleton className="h-7 w-72" />

      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="flex flex-wrap gap-[14px] rounded-[14px] border border-slate-200 bg-white p-3.5"
          >
            <Skeleton className="h-[88px] w-[120px] flex-none rounded-[11px]" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-full max-w-md" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <div className="flex flex-col items-end justify-between gap-2">
              <div className="text-right">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="mt-1.5 h-2.5 w-20" />
              </div>
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
