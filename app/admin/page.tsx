import Link from "next/link";
import {
  AlertTriangle,
  BedDouble,
  CreditCard,
  MessageSquare,
  Plus,
  RefreshCw,
  Star,
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import KpiCard from "@/components/ui/KpiCard";
import { requireOwner } from "@/lib/auth";
import { addDaysISO, formatRangeShortPl, nightsBetween, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";
import { findChannelConflicts } from "@/lib/ical";

export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  ONLINE: "Bezpośrednia",
  MANUAL: "Ręczna",
};

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export default async function AdminDashboard() {
  const { property } = await requireOwner();
  const today = todayISO();
  const horizon = addDaysISO(today, 14);
  const monthStart = `${today.slice(0, 7)}-01`;
  const prevMonthStart = addDaysISO(monthStart, -1).slice(0, 7) + "-01";
  const inProperty = { unit: { unitType: { propertyId: property.id } } };
  const activePending = { status: "PENDING", expiresAt: { gt: new Date() } } as const;

  // $transaction zamiast Promise.all — pula połączeń (pgbouncer) ma limit 1,
  // równoległe zapytania kolejkują się i wpadają w timeout P2024.
  const [
    unitTypesCount,
    unitsCount,
    arrivals,
    departures,
    monthReservations,
    prevMonthReservations,
    window14,
    blocks14,
    upcoming,
    unreadMessages,
    recentReservations,
    recentReviews,
    lastSync,
  ] = await prisma.$transaction([
    prisma.unitType.count({ where: { propertyId: property.id } }),
    prisma.unit.count({
      where: { unitType: { propertyId: property.id }, active: true },
    }),
    prisma.reservation.findMany({
      where: {
        ...inProperty,
        checkIn: today,
        OR: [{ status: "CONFIRMED" }, activePending],
      },
      include: { unit: { include: { unitType: true } } },
      orderBy: { status: "asc" },
    }),
    prisma.reservation.findMany({
      where: { ...inProperty, status: "CONFIRMED", checkOut: today },
      include: { unit: { include: { unitType: true } } },
    }),
    prisma.reservation.findMany({
      where: {
        ...inProperty,
        status: "CONFIRMED",
        checkIn: { gte: monthStart, lt: addDaysISO(monthStart, 32).slice(0, 7) + "-01" },
      },
      select: { totalGr: true, checkIn: true, checkOut: true },
    }),
    prisma.reservation.findMany({
      where: {
        ...inProperty,
        status: "CONFIRMED",
        checkIn: { gte: prevMonthStart, lt: monthStart },
      },
      select: { totalGr: true },
    }),
    prisma.reservation.findMany({
      where: {
        ...inProperty,
        checkIn: { lt: horizon },
        checkOut: { gt: today },
        OR: [{ status: "CONFIRMED" }, activePending],
      },
      select: { checkIn: true, checkOut: true, status: true },
    }),
    prisma.block.findMany({
      where: {
        unit: { unitType: { propertyId: property.id } },
        startDate: { lt: horizon },
        endDate: { gt: today },
      },
      select: { startDate: true, endDate: true },
    }),
    prisma.reservation.findMany({
      where: { ...inProperty, status: { not: "CANCELLED" }, checkOut: { gte: today } },
      include: { unit: { include: { unitType: true } } },
      orderBy: { checkIn: "asc" },
      take: 6,
    }),
    prisma.message.count({
      where: { sender: "GUEST", readAt: null, reservation: inProperty },
    }),
    prisma.reservation.findMany({
      where: inProperty,
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { unit: { include: { unitType: true } } },
    }),
    prisma.review.findMany({
      where: { propertyId: property.id, hidden: false },
      orderBy: { createdAt: "desc" },
      take: 2,
    }),
    prisma.icalFeed.findFirst({
      where: { unit: { unitType: { propertyId: property.id } }, lastSyncAt: { not: null } },
      orderBy: { lastSyncAt: "desc" },
      select: { lastSyncAt: true, name: true, channel: true },
    }),
  ]);
  const conflicts = await findChannelConflicts(property.id);

  if (unitTypesCount === 0) {
    return (
      <Card>
        <EmptyState
          icon={<BedDouble size={26} strokeWidth={2} />}
          title="Witaj w Rezio! Zacznij od dodania pokoi."
          description="Dodaj typy pokoi (np. „Pokój Standard”, „Apartament”), liczbę jednostek i ceny — Twoja strona rezerwacji ruszy od razu."
          action={
            <Button href="/admin/pokoje">
              <Plus size={14} strokeWidth={2.4} /> Dodaj pierwszy typ pokoju
            </Button>
          }
        />
      </Card>
    );
  }

  // KPI: przychód bieżącego miesiąca + trend m/m
  const revenue = monthReservations.reduce((sum, r) => sum + r.totalGr, 0);
  const prevRevenue = prevMonthReservations.reduce((sum, r) => sum + r.totalGr, 0);
  const trendPct = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null;
  const nightsSold = monthReservations.reduce(
    (sum, r) => sum + nightsBetween(r.checkIn, r.checkOut),
    0,
  );
  const adr = nightsSold > 0 ? Math.round(revenue / nightsSold) : 0;

  // Obłożenie: najbliższe 14 dni, per doba (bezpośrednie / oczekujące / OTA)
  const days = Array.from({ length: 14 }, (_, i) => addDaysISO(today, i));
  const occupancy = days.map((day) => {
    const next = addDaysISO(day, 1);
    const confirmed = window14.filter(
      (r) => r.status === "CONFIRMED" && r.checkIn <= day && r.checkOut > day,
    ).length;
    const pending = window14.filter(
      (r) => r.status === "PENDING" && r.checkIn <= day && r.checkOut > day,
    ).length;
    const blocked = blocks14.filter((b) => b.startDate < next && b.endDate > day).length;
    return { day, confirmed, pending, blocked };
  });
  const occupiedNights = occupancy.reduce(
    (sum, d) => sum + Math.min(unitsCount, d.confirmed + d.pending + d.blocked),
    0,
  );
  const occupancyPct = pct(occupiedNights, unitsCount * 14);
  const monthLabel = new Date().toLocaleDateString("pl-PL", { month: "long", year: "numeric" });

  // Plan dnia: wyjazdy (do godz. wymeldowania) + przyjazdy (od godz. zameldowania)
  const plan = [
    ...departures.map((r) => ({ kind: "out" as const, time: property.checkOutTo, r })),
    ...arrivals.map((r) => ({ kind: "in" as const, time: property.checkInFrom, r })),
  ];

  // Feed aktywności
  const feed = [
    ...recentReservations.map((r) => ({
      at: r.createdAt,
      icon: "plus" as const,
      title: (
        <>
          Nowa rezerwacja <span className="tnum text-[11px] text-brand-600">{r.code}</span>
        </>
      ),
      sub: r.unit.unitType.name,
    })),
    ...recentReviews.map((rv) => ({
      at: rv.createdAt,
      icon: "star" as const,
      title: <>Nowa opinia {"★".repeat(rv.rating)}</>,
      sub: rv.comment ? `„${rv.comment.slice(0, 40)}${rv.comment.length > 40 ? "…" : ""}”` : rv.authorName,
    })),
    ...(lastSync?.lastSyncAt
      ? [
          {
            at: lastSync.lastSyncAt,
            icon: "sync" as const,
            title: <>iCal zsynchronizowany</>,
            sub: lastSync.name || lastSync.channel,
          },
        ]
      : []),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 4);

  const FEED_ICON = {
    plus: { el: <Plus size={14} strokeWidth={2} />, cls: "bg-brand-100 text-brand-600" },
    star: { el: <Star size={14} strokeWidth={2} />, cls: "bg-accent-100 text-accent-400" },
    sync: { el: <RefreshCw size={14} strokeWidth={2} />, cls: "bg-info-100 text-info-600" },
    pay: { el: <CreditCard size={14} strokeWidth={2} />, cls: "bg-brand-100 text-brand-600" },
  };

  return (
    <div className="space-y-4">
      {unreadMessages > 0 && (
        <Link
          href="/admin/rezerwacje"
          className="flex items-center gap-2.5 rounded-[11px] border border-accent-200 bg-accent-100 px-4 py-2.5 text-sm font-semibold text-accent-500 transition-colors hover:bg-accent-100/60"
        >
          <MessageSquare size={15} strokeWidth={2} />
          {unreadMessages}{" "}
          {unreadMessages === 1
            ? "nieprzeczytana wiadomość od gościa"
            : "nieprzeczytane wiadomości od gości"}{" "}
          — zobacz w Rezerwacjach →
        </Link>
      )}

      {conflicts.length > 0 && (
        <Link
          href="/admin/kanaly"
          className="flex items-center gap-2.5 rounded-[11px] border border-danger-600/30 bg-danger-100 px-4 py-2.5 text-sm font-semibold text-danger-600 transition-colors hover:bg-danger-100/60"
        >
          <AlertTriangle size={15} strokeWidth={2} />
          {conflicts.length}{" "}
          {conflicts.length === 1
            ? "możliwa podwójna rezerwacja"
            : "możliwe podwójne rezerwacje"}{" "}
          między kanałem a rezerwacją bezpośrednią — zobacz w Kanałach →
        </Link>
      )}

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <KpiCard
          dark
          label={`Przychód · ${monthLabel}`}
          value={formatPln(revenue)}
          trend={
            trendPct == null ? undefined : `${trendPct >= 0 ? "▲" : "▼"} ${Math.abs(trendPct)}%`
          }
          sub="0 zł prowizji"
        />
        <KpiCard
          label="Przyjazdy dziś"
          value={arrivals.length}
          sub={`${departures.length} ${departures.length === 1 ? "wyjazd" : "wyjazdy"}`}
        />
        <KpiCard label="Obłożenie · 14 dni" value={`${occupancyPct}%`} progress={occupancyPct} />
        <KpiCard
          label="ADR"
          value={formatPln(adr)}
          sub={`RevPAR ${formatPln(unitsCount > 0 ? Math.round(occupancyPct / 100 * adr) : 0)}`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Plan dnia */}
        <Card>
          <CardHeader
            title="Plan dnia · dziś"
            action={
              <>
                <Badge tone="success">
                  {arrivals.length}{" "}
                  {arrivals.length === 1 ? "przyjazd" : arrivals.length < 5 ? "przyjazdy" : "przyjazdów"}
                </Badge>
                <Badge tone="neutral">
                  {departures.length}{" "}
                  {departures.length === 1 ? "wyjazd" : departures.length < 5 ? "wyjazdy" : "wyjazdów"}
                </Badge>
              </>
            }
          />
          <div className="px-[18px] pb-3.5 pt-1.5">
            {plan.length === 0 && (
              <p className="py-6 text-center text-[13px] text-slate-400">
                Dziś nie ma zaplanowanych przyjazdów ani wyjazdów.
              </p>
            )}
            {plan.map(({ kind, time, r }) => {
              const pendingItem = r.status === "PENDING";
              return (
                <div
                  key={`${kind}-${r.id}`}
                  className="flex gap-3.5 border-b border-slate-100 py-2.5 last:border-0"
                >
                  <div
                    className={`tnum w-[46px] flex-none pt-0.5 text-[12.5px] font-bold ${
                      kind === "out" ? "text-slate-500" : "text-slate-900"
                    }`}
                  >
                    {time}
                  </div>
                  <Link
                    href={`/admin/rezerwacje/${r.id}`}
                    className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-r-[10px] border-l-[3px] px-3 py-2 transition-opacity hover:opacity-80 ${
                      kind === "out"
                        ? "border-slate-300 bg-slate-50"
                        : pendingItem
                          ? "border-accent-400 bg-[#fdf6ea]"
                          : "border-brand-600 bg-brand-50"
                    }`}
                  >
                    <span
                      className={`flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] text-xs font-bold ${
                        kind === "out"
                          ? "bg-[#e9efec] text-slate-500"
                          : pendingItem
                            ? "bg-accent-400 text-white"
                            : "bg-brand-600 text-white"
                      }`}
                    >
                      {r.guestName
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase())
                        .join("")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">
                        {r.guestName}
                        {kind === "out" && (
                          <span className="text-[11px] font-semibold text-slate-400"> · wyjazd</span>
                        )}
                      </span>
                      <span className="block truncate text-[11.5px] text-slate-500">
                        {r.unit.unitType.name} ({r.unit.name})
                        {kind === "in" && ` · ${r.guests} os · ${CHANNEL_LABEL[r.source] ?? r.source}`}
                        {kind === "out" && " · wymeldowanie"}
                      </span>
                    </span>
                    {kind === "in" &&
                      (r.checkInStatus === "COMPLETED" ? (
                        <Badge tone="info">Meldunek ✓</Badge>
                      ) : pendingItem ? (
                        <Badge tone="warning">Oczekuje</Badge>
                      ) : (
                        <Badge tone="success">Opłacona</Badge>
                      ))}
                  </Link>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          {/* Obłożenie 14 dni */}
          <Card>
            <CardHeader
              title="Obłożenie · 14 dni"
              action={
                <span className="flex items-center gap-2.5 text-[10.5px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-[2px] bg-brand-600" /> bezpośr.
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-[2px] bg-accent-200" /> oczekuje
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-[2px] bg-brand-300" /> kanały
                  </span>
                </span>
              }
            />
            <div className="grid grid-cols-14 gap-1.5 px-4 py-3.5">
              {occupancy.map(({ day, confirmed, pending, blocked }, i) => {
                const a = pct(confirmed, unitsCount);
                const b = Math.min(100, a + pct(pending, unitsCount));
                const c = Math.min(100, b + pct(blocked, unitsCount));
                const weekend = [0, 6].includes(new Date(`${day}T00:00:00`).getDay());
                return (
                  <div key={day} className="text-center" title={`${day}: ${confirmed + pending + blocked}/${unitsCount} zajęte`}>
                    <div
                      className={`text-[9.5px] font-semibold ${
                        i === 0 ? "text-brand-600" : weekend ? "text-accent-400" : "text-slate-400"
                      }`}
                    >
                      {Number(day.slice(8, 10))}
                    </div>
                    <div
                      className={`mt-1 h-10 rounded-[5px] ${i === 0 ? "outline outline-2 outline-offset-1 outline-brand-600" : ""}`}
                      style={{
                        background: `linear-gradient(to bottom, #1f7a4d ${a}%, #f4e2bd ${a}% ${b}%, #8fc7a9 ${b}% ${c}%, #e9efec ${c}%)`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Aktywność */}
          <Card className="flex-1">
            <div className="px-[18px] pb-2 pt-3.5 text-[15px] font-bold">Aktywność</div>
            <div className="px-2 pb-2">
              {feed.length === 0 && (
                <p className="px-3 py-4 text-[12.5px] text-slate-400">
                  Brak ostatniej aktywności.
                </p>
              )}
              {feed.map((item, i) => (
                <div key={i} className="flex gap-2.5 px-2.5 py-2">
                  <span
                    className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg ${FEED_ICON[item.icon].cls}`}
                  >
                    {FEED_ICON[item.icon].el}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-semibold">{item.title}</div>
                    <div className="truncate text-[11px] text-slate-400">
                      {item.sub} ·{" "}
                      {item.at.toLocaleString("pl-PL", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Najbliższe rezerwacje */}
      <Card>
        <CardHeader
          title="Najbliższe rezerwacje"
          action={
            <Button size="sm" variant="quiet" href="/admin/rezerwacje">
              Wszystkie →
            </Button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="th px-[18px] py-2">Kod</th>
                <th className="th px-2 py-2">Gość</th>
                <th className="th px-2 py-2">Jednostka</th>
                <th className="th px-2 py-2">Termin</th>
                <th className="th px-2 py-2 text-center">Noce</th>
                <th className="th px-2 py-2">Kanał</th>
                <th className="th px-2 py-2 text-right">Kwota</th>
                <th className="th px-[18px] py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                  <td className="px-[18px] py-2.5">
                    <Link href={`/admin/rezerwacje/${r.id}`} className="tnum text-[11px] font-semibold text-brand-600 hover:underline">
                      {r.code}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5 font-semibold">
                    {r.guestName}
                    {r.checkInStatus === "COMPLETED" && (
                      <span className="ml-1.5 text-[10.5px] font-bold text-info-600" title="Karta meldunkowa wypełniona online">
                        meldunek ✓
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-slate-600">
                    {r.unit.unitType.name} ({r.unit.name})
                  </td>
                  <td className="tnum px-2 py-2.5 text-slate-600">
                    {formatRangeShortPl(r.checkIn, r.checkOut)}
                  </td>
                  <td className="tnum px-2 py-2.5 text-center text-slate-600">
                    {nightsBetween(r.checkIn, r.checkOut)}
                  </td>
                  <td className="px-2 py-2.5 text-slate-600">{CHANNEL_LABEL[r.source] ?? r.source}</td>
                  <td className="tnum px-2 py-2.5 text-right font-semibold">{formatPln(r.totalGr)}</td>
                  <td className="px-[18px] py-2.5 text-right">
                    {r.status === "CONFIRMED" ? (
                      <Badge tone="success">Opłacona</Badge>
                    ) : r.status === "PENDING" ? (
                      <Badge tone="warning">Oczekuje</Badge>
                    ) : (
                      <Badge tone="danger">Anulowana</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {upcoming.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-[18px] py-6 text-center text-slate-400">
                    Brak nadchodzących pobytów
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
