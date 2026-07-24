// Panel „Log synchronizacji": ostatnie zdarzenia iCal/Channex danego obiektu.
import { prisma } from "@/lib/db";

export default async function SyncLog({ propertyId }: { propertyId: number }) {
  const logs = await prisma.eventLog.findMany({
    where: { propertyId, kind: { in: ["ICAL", "CHANNEX"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  if (logs.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Brak zdarzeń synchronizacji. Pojawią się tu po pierwszym imporcie/pushu.
      </p>
    );
  }
  return (
    <div className="card divide-y divide-slate-100">
      {logs.map((l) => (
        <div key={l.id} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
          <span
            className={`mt-1 h-2 w-2 flex-none rounded-full ${
              l.level === "ERROR"
                ? "bg-red-500"
                : l.level === "WARN"
                  ? "bg-amber-500"
                  : "bg-brand-500"
            }`}
          />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{l.message}</span>
            {l.meta && <span className="block truncate text-xs text-slate-400">{l.meta}</span>}
          </span>
          <time className="flex-none text-xs text-slate-400">
            {new Date(l.createdAt).toLocaleString("pl-PL")}
          </time>
        </div>
      ))}
    </div>
  );
}
