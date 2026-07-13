import Link from "next/link";
import { AlertTriangle, Search } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import KpiCard from "@/components/ui/KpiCard";
import { superSetPlan } from "@/lib/actions";
import { requireSuperadmin } from "@/lib/auth";
import { addDaysISO, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";
import { PLANS, planDef } from "@/lib/plans";

export const dynamic = "force-dynamic";

/** Klucz miesiąca YYYY-MM przesunięty o `delta` względem bieżącego. */
function monthKey(delta: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  return d.toISOString().slice(0, 7);
}

export default async function SuperadminPage(props: {
  searchParams: Promise<{ deleted?: string; q?: string }>;
}) {
  await requireSuperadmin();
  const sp = await props.searchParams;
  const q = (sp.q ?? "").trim();
  const monthAgo = new Date(`${addDaysISO(todayISO(), -30)}T00:00:00Z`);
  const sixMonthsStart = new Date(`${monthKey(-5)}-01T00:00:00Z`);

  const propertyWhere = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { slug: { contains: q, mode: "insensitive" as const } },
          { owner: { email: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {};

  // groupBy poza $transaction — w tablicy transakcji Prisma gubi wąski typ _count
  const reservationCounts = await prisma.reservation.groupBy({
    by: ["unitId"],
    orderBy: { unitId: "asc" },
    _count: { _all: true },
  });
  const [
    users,
    properties,
    reservationsTotal,
    reservations30d,
    gmv,
    gmv30d,
    trendReservations,
    trendProperties,
    brokenFeeds,
    pendingActive,
    suspendedCount,
  ] = await prisma.$transaction([
    prisma.user.count({ where: { isAdmin: false } }),
    prisma.property.findMany({
      where: propertyWhere,
      include: {
        owner: true,
        unitTypes: { include: { units: true } },
        _count: { select: { unitTypes: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.reservation.count(),
    prisma.reservation.count({ where: { createdAt: { gte: monthAgo } } }),
    prisma.reservation.aggregate({
      where: { status: "CONFIRMED" },
      _sum: { totalGr: true },
    }),
    prisma.reservation.aggregate({
      where: { status: "CONFIRMED", createdAt: { gte: monthAgo } },
      _sum: { totalGr: true },
    }),
    prisma.reservation.findMany({
      where: { createdAt: { gte: sixMonthsStart } },
      select: { createdAt: true, totalGr: true, status: true },
    }),
    prisma.property.findMany({
      where: { createdAt: { gte: sixMonthsStart } },
      select: { createdAt: true },
    }),
    prisma.icalFeed.findMany({
      where: { lastError: { not: "" } },
      include: {
        unit: { include: { unitType: { select: { propertyId: true, property: { select: { name: true } } } } } },
      },
      take: 5,
    }),
    prisma.reservation.count({
      where: { status: "PENDING", expiresAt: { gt: new Date() } },
    }),
    prisma.property.count({ where: { suspended: true } }),
  ]);

  const unitToCount = new Map(
    reservationCounts.map((r) => [r.unitId, r._count._all ?? 0]),
  );
  const planCounts = new Map<string, number>();
  for (const p of properties) {
    planCounts.set(p.plan, (planCounts.get(p.plan) ?? 0) + 1);
  }
  // MRR wg cennika planów (liczony po przefiltrowanej liście tylko gdy brak q)
  const mrrZl = properties.reduce((s, p) => s + planDef(p.plan).priceZl, 0);

  // trend 6 miesięcy: nowe rezerwacje / GMV / nowe obiekty per miesiąc
  const months = Array.from({ length: 6 }, (_, i) => monthKey(i - 5));
  const trend = months.map((m) => {
    const monthReservations = trendReservations.filter(
      (r) => r.createdAt.toISOString().slice(0, 7) === m,
    );
    return {
      month: m,
      label: new Date(`${m}-01T00:00:00`).toLocaleDateString("pl-PL", {
        month: "short",
      }),
      reservations: monthReservations.length,
      gmvGr: monthReservations
        .filter((r) => r.status === "CONFIRMED")
        .reduce((s, r) => s + r.totalGr, 0),
      newProperties: trendProperties.filter(
        (p) => p.createdAt.toISOString().slice(0, 7) === m,
      ).length,
    };
  });
  const maxGmv = Math.max(1, ...trend.map((t) => t.gmvGr));
  const maxRes = Math.max(1, ...trend.map((t) => t.reservations));

  return (
    <div className="space-y-5">
      {sp.deleted && <p className="alert-success">Obiekt został trwale usunięty.</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard dark label="MRR (wg planów)" value={`${mrrZl} zł`} sub="0 zł prowizji od rezerwacji" />
        <KpiCard label="Konta właścicieli" value={users} />
        <KpiCard label="Obiekty" value={properties.length} sub={suspendedCount > 0 ? `${suspendedCount} zawieszone` : undefined} />
        <KpiCard
          label="Rezerwacje (30 dni / łącznie)"
          value={`${reservations30d} / ${reservationsTotal}`}
        />
        <KpiCard label="GMV potwierdzone (30 dni)" value={formatPln(gmv30d._sum.totalGr ?? 0)} />
        <KpiCard label="GMV od początku" value={formatPln(gmv._sum.totalGr ?? 0)} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.4fr_1fr]">
        {/* Trend 6 miesięcy */}
        <Card>
          <CardHeader
            title="Wzrost · ostatnie 6 miesięcy"
            action={
              <span className="flex items-center gap-2.5 text-[10.5px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-[2px] bg-brand-600" /> GMV
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-[2px] bg-brand-300" /> rezerwacje
                </span>
              </span>
            }
          />
          <div className="grid grid-cols-6 gap-3 px-[18px] py-4">
            {trend.map((t) => (
              <div key={t.month} className="text-center">
                <div className="tnum mb-1 text-[10.5px] font-semibold text-slate-500">
                  {formatPln(t.gmvGr)}
                </div>
                <div className="flex h-24 items-end justify-center gap-1">
                  <div
                    className="w-4 rounded-t-[4px] bg-brand-600"
                    style={{ height: `${Math.max(3, (t.gmvGr / maxGmv) * 100)}%` }}
                    title={`GMV: ${formatPln(t.gmvGr)}`}
                  />
                  <div
                    className="w-4 rounded-t-[4px] bg-brand-300"
                    style={{ height: `${Math.max(3, (t.reservations / maxRes) * 100)}%` }}
                    title={`Rezerwacje: ${t.reservations}`}
                  />
                </div>
                <div className="mt-1.5 text-[10.5px] font-semibold text-slate-400">
                  {t.label}
                </div>
                <div className="nums text-[10.5px] text-slate-400">
                  {t.reservations} rez.
                  {t.newProperties > 0 && (
                    <span className="text-brand-600"> · +{t.newProperties} ob.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Zdrowie platformy */}
        <Card>
          <CardHeader title="Zdrowie platformy" />
          <div className="space-y-2.5 px-[18px] py-4 text-[12.5px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Oczekujące na zaliczkę (aktywne)</span>
              <Badge tone={pendingActive > 0 ? "warning" : "success"}>
                {pendingActive}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Zawieszone obiekty</span>
              <Badge tone={suspendedCount > 0 ? "danger" : "success"}>
                {suspendedCount}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Feedy iCal z błędami</span>
              <Badge tone={brokenFeeds.length > 0 ? "danger" : "success"}>
                {brokenFeeds.length}
              </Badge>
            </div>
            {brokenFeeds.length > 0 && (
              <div className="space-y-1.5 border-t border-slate-100 pt-2.5">
                {brokenFeeds.map((f) => (
                  <Link
                    key={f.id}
                    href={`/superadmin/obiekt/${f.unit.unitType.propertyId}`}
                    className="flex items-start gap-2 rounded-lg bg-danger-100 px-2.5 py-2 text-xs text-danger-600 transition-opacity hover:opacity-80"
                  >
                    <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 flex-none" />
                    <span className="min-w-0">
                      <span className="font-semibold">
                        {f.unit.unitType.property.name} · {f.name || f.channel}
                      </span>
                      <span className="block truncate">{f.lastError}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {PLANS.map((p) => (
          <span key={p.key} className="card flex items-center gap-2 px-3.5 py-2 text-sm">
            <span className="font-semibold">{p.label}</span>
            <span className="tnum rounded-full bg-slate-100 px-2 py-px text-xs font-bold text-slate-500">
              {planCounts.get(p.key) ?? 0}
            </span>
          </span>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Obiekty"
          sub={q ? `wyniki dla „${q}”` : `${properties.length} zarejestrowanych`}
          action={
            <form action="/superadmin" role="search">
              <div className="flex h-9 w-[240px] items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 text-slate-400 focus-within:border-brand-600">
                <Search size={14} strokeWidth={2} />
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Nazwa, slug, e-mail…"
                  className="w-full bg-transparent text-[12.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </form>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="th px-[18px] py-2.5">Obiekt</th>
                <th className="th px-2 py-2.5">Właściciel</th>
                <th className="th px-2 py-2.5">Plan</th>
                <th className="th px-2 py-2.5 text-center">Typy / jedn.</th>
                <th className="th px-2 py-2.5 text-center">Rezerwacje</th>
                <th className="th px-2 py-2.5">Utworzony</th>
                <th className="th px-[18px] py-2.5" />
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => {
                const units = p.unitTypes.flatMap((ut) => ut.units);
                const resCount = units.reduce(
                  (s, u) => s + (unitToCount.get(u.id) ?? 0),
                  0,
                );
                return (
                  <tr
                    key={p.id}
                    className="border-t border-slate-100 align-middle transition-colors hover:bg-slate-50"
                  >
                    <td className="px-[18px] py-2.5">
                      <span className="font-semibold">
                        {p.name}
                        {p.suspended && (
                          <Badge tone="danger" className="ml-1.5 align-middle">
                            zawieszony
                          </Badge>
                        )}
                      </span>
                      <p className="tnum text-[11px] text-slate-400">/o/{p.slug}</p>
                    </td>
                    <td className="px-2 py-2.5">
                      {p.owner.name}
                      <p className="text-[11px] text-slate-400">{p.owner.email}</p>
                    </td>
                    <td className="px-2 py-2.5">
                      <form action={superSetPlan} className="flex items-center gap-1.5">
                        <input type="hidden" name="propertyId" value={p.id} />
                        <select
                          name="plan"
                          defaultValue={p.plan}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                        >
                          {PLANS.map((pl) => (
                            <option key={pl.key} value={pl.key}>
                              {pl.label} ({pl.priceZl} zł)
                            </option>
                          ))}
                        </select>
                        <button className="text-xs font-semibold text-brand-600 hover:underline">
                          Zmień
                        </button>
                      </form>
                    </td>
                    <td className="tnum px-2 py-2.5 text-center text-slate-600">
                      {p._count.unitTypes} / {units.length}
                    </td>
                    <td className="tnum px-2 py-2.5 text-center text-slate-600">{resCount}</td>
                    <td className="tnum px-2 py-2.5 text-slate-500">
                      {p.createdAt.toLocaleDateString("pl-PL")}
                    </td>
                    <td className="px-[18px] py-2.5 text-right">
                      <Link
                        href={`/superadmin/obiekt/${p.id}`}
                        className="whitespace-nowrap text-xs font-semibold text-brand-600 hover:underline"
                      >
                        Zarządzaj →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {properties.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-[18px] py-8 text-center text-slate-400">
                    {q ? `Brak obiektów dla „${q}”` : "Brak obiektów"}
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
