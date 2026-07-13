import Link from "next/link";
import { ScrollText } from "lucide-react";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { requireSuperadmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EVENT_KINDS } from "@/lib/log";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const LEVEL_TONE: Record<string, BadgeTone> = {
  INFO: "neutral",
  WARN: "warning",
  ERROR: "danger",
};

const KIND_TONE: Record<string, BadgeTone> = {
  RESERVATION: "success",
  PAYMENT: "mint",
  MAIL: "info",
  SMS: "info",
  ICAL: "neutral",
  ADMIN: "dark",
  AUTH: "warning",
};

function timePl(d: Date) {
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Dziennik zdarzeń platformy: rezerwacje, płatności, wysyłki, sync, admin. */
export default async function SuperadminLogsPage(props: {
  searchParams: Promise<{ kind?: string; poziom?: string; page?: string }>;
}) {
  await requireSuperadmin();
  const sp = await props.searchParams;
  const kind = EVENT_KINDS.some((k) => k.key === sp.kind) ? sp.kind! : "";
  const level = ["WARN", "ERROR"].includes(sp.poziom ?? "") ? sp.poziom! : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const where = {
    ...(kind ? { kind } : {}),
    ...(level === "WARN" ? { level: { in: ["WARN", "ERROR"] } } : {}),
    ...(level === "ERROR" ? { level: "ERROR" } : {}),
  };

  const [total, logs, propertyRows] = await prisma.$transaction([
    prisma.eventLog.count({ where }),
    prisma.eventLog.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.property.findMany({ select: { id: true, name: true } }),
  ]);
  const propertyName = new Map(propertyRows.map((p) => [p.id, p.name]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (extra: Record<string, string>) =>
    `/superadmin/logi?${new URLSearchParams({
      ...(kind ? { kind } : {}),
      ...(level ? { poziom: level } : {}),
      ...extra,
    })}`;
  const filterHref = (params: { kind?: string; poziom?: string }) =>
    `/superadmin/logi?${new URLSearchParams({
      ...(params.kind ? { kind: params.kind } : {}),
      ...(params.poziom ? { poziom: params.poziom } : {}),
    })}`;

  const pill = (active: boolean) =>
    `rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
      active
        ? "border border-brand-600 bg-brand-50 text-brand-700"
        : "border border-transparent text-slate-500 hover:bg-slate-100"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1">
          <Link href={filterHref({ poziom: level })} className={pill(kind === "")}>
            Wszystkie
          </Link>
          {EVENT_KINDS.map((k) => (
            <Link
              key={k.key}
              href={filterHref({ kind: k.key, poziom: level })}
              className={pill(kind === k.key)}
            >
              {k.label}
            </Link>
          ))}
        </div>
        <span className="hidden h-5 w-px bg-slate-200 sm:block" />
        <div className="flex items-center gap-1">
          <Link href={filterHref({ kind })} className={pill(level === "")}>
            Każdy poziom
          </Link>
          <Link
            href={filterHref({ kind, poziom: "WARN" })}
            className={pill(level === "WARN")}
          >
            Ostrzeżenia+
          </Link>
          <Link
            href={filterHref({ kind, poziom: "ERROR" })}
            className={pill(level === "ERROR")}
          >
            Błędy
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Dziennik zdarzeń"
          sub={`${total} ${total === 1 ? "wpis" : total < 5 ? "wpisy" : "wpisów"} · retencja 90 dni`}
        />
        {logs.length === 0 ? (
          <EmptyState
            icon={<ScrollText size={26} strokeWidth={2} />}
            title="Brak wpisów dla wybranych filtrów"
            description="Zdarzenia pojawiają się przy rezerwacjach, płatnościach, wysyłkach e-mail/SMS, synchronizacjach iCal i akcjach administratora."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="th px-[18px] py-2.5">Czas</th>
                  <th className="th px-2 py-2.5">Rodzaj</th>
                  <th className="th px-2 py-2.5">Zdarzenie</th>
                  <th className="th px-2 py-2.5">Obiekt</th>
                  <th className="th px-[18px] py-2.5 text-right">Poziom</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-t border-slate-100 align-top transition-colors hover:bg-slate-50"
                  >
                    <td className="tnum whitespace-nowrap px-[18px] py-2.5 text-slate-500">
                      {timePl(log.createdAt)}
                    </td>
                    <td className="px-2 py-2.5">
                      <Badge tone={KIND_TONE[log.kind] ?? "neutral"}>
                        {EVENT_KINDS.find((k) => k.key === log.kind)?.label ?? log.kind}
                      </Badge>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="font-medium text-slate-900">{log.message}</span>
                      {log.meta && (
                        <span className="block text-[11px] text-slate-400">{log.meta}</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      {log.propertyId ? (
                        propertyName.has(log.propertyId) ? (
                          <Link
                            href={`/superadmin/obiekt/${log.propertyId}`}
                            className="text-xs font-semibold text-brand-600 hover:underline"
                          >
                            {propertyName.get(log.propertyId)}
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">usunięty</span>
                        )
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-[18px] py-2.5 text-right">
                      <Badge tone={LEVEL_TONE[log.level] ?? "neutral"}>{log.level}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Button variant="quiet" size="sm" href={href({ page: String(page - 1) })}>
              ← Nowsze
            </Button>
          ) : (
            <span className="btn-quiet pointer-events-none px-3 py-1.5 text-xs opacity-40">
              ← Nowsze
            </span>
          )}
          <span className="tnum text-slate-500">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Button variant="quiet" size="sm" href={href({ page: String(page + 1) })}>
              Starsze →
            </Button>
          ) : (
            <span className="btn-quiet pointer-events-none px-3 py-1.5 text-xs opacity-40">
              Starsze →
            </span>
          )}
        </div>
      )}
    </div>
  );
}
