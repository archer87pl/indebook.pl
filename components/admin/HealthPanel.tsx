import Link from "next/link";
import { AlertTriangle, Check, ChevronRight, Circle } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import type { HealthReport } from "@/lib/health";

/**
 * Postęp uzupełnienia obiektu. Panel ma odpowiadać na jedno pytanie: „czego mi
 * jeszcze brakuje i gdzie to kliknąć". Dlatego każda niezrobiona pozycja jest
 * ODNOŚNIKIEM do właściwego ekranu, a zrobione schodzą do roli potwierdzenia.
 * Lista rozwija się sama, dopóki czegoś brakuje — po komplecie zwija się, żeby
 * nie zabierać miejsca na pulpicie w nieskończoność.
 */
export default function HealthPanel({ report }: { report: HealthReport }) {
  const complete = report.done === report.total;

  return (
    <Card>
      <CardHeader
        title="Gotowość obiektu"
        sub={`${report.done} z ${report.total} pozycji uzupełnionych`}
        action={
          <Badge tone={complete ? "success" : report.criticalMissing > 0 ? "warning" : "info"}>
            {report.percent}%
          </Badge>
        }
      />
      <div className="px-[18px] pt-3.5">
        <div
          role="progressbar"
          aria-label="Postęp uzupełnienia obiektu"
          aria-valuenow={report.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className={`h-full rounded-full transition-[width] ${
              report.criticalMissing > 0 ? "bg-accent-400" : "bg-brand-500"
            }`}
            style={{ width: `${report.percent}%` }}
          />
        </div>

        {report.criticalMissing > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-[11px] bg-accent-100 px-3 py-2 text-[12.5px] text-accent-500">
            <AlertTriangle size={15} strokeWidth={2.2} className="mt-px flex-none" />
            <span>
              {report.criticalMissing === 1
                ? "Jedna pozycja blokuje przyjmowanie rezerwacji."
                : `${report.criticalMissing} pozycje blokują przyjmowanie rezerwacji.`}
            </span>
          </p>
        )}
        {complete && (
          <p className="mt-3 text-[12.5px] text-slate-500">
            Wszystko uzupełnione — obiekt jest gotowy do sprzedaży.
          </p>
        )}
      </div>

      <details open={!complete} className="group">
        <summary className="cursor-pointer list-none px-[18px] py-3 text-[12.5px] font-semibold text-slate-500 hover:text-brand-700">
          <span className="group-open:hidden">Pokaż listę ({report.total})</span>
          <span className="hidden group-open:inline">Ukryj listę</span>
        </summary>
        <div className="space-y-4 px-[18px] pb-[18px]">
          {report.groups.map((group) => (
            <section key={group.key}>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                {group.title}
              </h3>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.key}>
                    {item.done ? (
                      <div className="flex items-center gap-2 py-1 text-[13px] text-slate-400">
                        <Check
                          size={15}
                          strokeWidth={2.6}
                          className="flex-none text-brand-500"
                          aria-label="gotowe"
                        />
                        <span>{item.label}</span>
                      </div>
                    ) : (
                      <Link
                        href={item.href}
                        className="flex items-start gap-2 rounded-[9px] px-1 py-1 text-[13px] text-slate-700 transition-colors hover:bg-brand-50 hover:text-brand-700"
                      >
                        <Circle
                          size={15}
                          strokeWidth={2}
                          className={`mt-0.5 flex-none ${
                            item.critical ? "text-accent-500" : "text-slate-300"
                          }`}
                          aria-label="do uzupełnienia"
                        />
                        <span className="min-w-0">
                          <span className="font-semibold">{item.label}</span>
                          {item.critical && (
                            <span className="ml-1.5 align-middle text-[10.5px] font-bold uppercase text-accent-500">
                              wymagane
                            </span>
                          )}
                          <span className="block text-[11.5px] text-slate-400">{item.hint}</span>
                        </span>
                        <ChevronRight size={15} strokeWidth={2} className="ml-auto flex-none text-slate-300" />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </details>
    </Card>
  );
}
