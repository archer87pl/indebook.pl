import Link from "next/link";
import { LogOut } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import KpiCard from "@/components/ui/KpiCard";
import { logout, superSetPlan } from "@/lib/actions";
import { addDaysISO, todayISO } from "@/lib/dates";
import { requireSuperadmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";
import { PLANS, planDef } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function SuperadminPage(props: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const admin = await requireSuperadmin();
  const sp = await props.searchParams;
  const monthAgo = new Date(`${addDaysISO(todayISO(), -30)}T00:00:00Z`);

  // groupBy poza $transaction — w tablicy transakcji Prisma gubi wąski typ _count
  const reservationCounts = await prisma.reservation.groupBy({
    by: ["unitId"],
    orderBy: { unitId: "asc" },
    _count: { _all: true },
  });
  const [users, properties, reservationsTotal, reservations30d, gmv, gmv30d] =
    await prisma.$transaction([
      prisma.user.count({ where: { isAdmin: false } }),
      prisma.property.findMany({
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
    ]);

  const unitToCount = new Map(
    reservationCounts.map((r) => [r.unitId, r._count._all ?? 0]),
  );
  const planCounts = new Map<string, number>();
  for (const p of properties) {
    planCounts.set(p.plan, (planCounts.get(p.plan) ?? 0) + 1);
  }
  // MRR wg cennika planów
  const mrrZl = properties.reduce((s, p) => s + planDef(p.plan).priceZl, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="th">Panel platformy</p>
          <h1 className="text-2xl font-bold">Superadmin</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-xs text-slate-400">{admin.email}</span>
          <form action={logout}>
            <button className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-danger-600">
              <LogOut size={13} strokeWidth={2} /> Wyloguj
            </button>
          </form>
        </div>
      </div>

      {sp.deleted && <p className="alert-success">Obiekt został trwale usunięty.</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard dark label="MRR (wg planów)" value={`${mrrZl} zł`} sub="0 zł prowizji od rezerwacji" />
        <KpiCard label="Konta właścicieli" value={users} />
        <KpiCard label="Obiekty" value={properties.length} />
        <KpiCard
          label="Rezerwacje (30 dni / łącznie)"
          value={`${reservations30d} / ${reservationsTotal}`}
        />
        <KpiCard label="GMV potwierdzone (30 dni)" value={formatPln(gmv30d._sum.totalGr ?? 0)} />
        <KpiCard label="GMV od początku" value={formatPln(gmv._sum.totalGr ?? 0)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {PLANS.map((p) => (
          <span
            key={p.key}
            className="card flex items-center gap-2 px-3.5 py-2 text-sm"
          >
            <span className="font-semibold">{p.label}</span>
            <span className="tnum rounded-full bg-slate-100 px-2 py-px text-xs font-bold text-slate-500">
              {planCounts.get(p.key) ?? 0}
            </span>
          </span>
        ))}
      </div>

      <Card>
        <CardHeader title="Obiekty" sub={`${properties.length} zarejestrowanych`} />
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
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
