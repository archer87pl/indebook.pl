import Link from "next/link";
import { logout, superSetPlan } from "@/lib/actions";
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
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [users, properties, reservationsTotal, reservations30d, gmv, gmv30d] =
    await Promise.all([
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

  const reservationCounts = await prisma.reservation.groupBy({
    by: ["unitId"],
    _count: true,
  });
  const unitToCount = new Map(reservationCounts.map((r) => [r.unitId, r._count]));
  const planCounts = new Map<string, number>();
  for (const p of properties) {
    planCounts.set(p.plan, (planCounts.get(p.plan) ?? 0) + 1);
  }
  // MRR wg cennika planów
  const mrrZl = properties.reduce((s, p) => s + planDef(p.plan).priceZl, 0);

  const stats = [
    { label: "Konta właścicieli", value: String(users) },
    { label: "Obiekty", value: String(properties.length) },
    { label: "MRR (wg planów)", value: `${mrrZl} zł` },
    { label: "Rezerwacje (30 dni)", value: `${reservations30d} / ${reservationsTotal}` },
    { label: "GMV potwierdzone (30 dni)", value: formatPln(gmv30d._sum.totalGr ?? 0) },
    { label: "GMV od początku", value: formatPln(gmv._sum.totalGr ?? 0) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Panel platformy
          </p>
          <h1 className="text-2xl font-bold">Superadmin</h1>
        </div>
        <div className="text-right text-sm">
          <p className="text-xs text-slate-400">{admin.email}</p>
          <form action={logout}>
            <button className="text-sm text-slate-400 hover:text-red-600">Wyloguj</button>
          </form>
        </div>
      </div>

      {sp.deleted && (
        <p className="alert-success">✓ Obiekt został trwale usunięty.</p>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        {PLANS.map((p) => (
          <span key={p.key} className="card px-4 py-2">
            <span className="font-semibold">{p.label}</span>:{" "}
            {planCounts.get(p.key) ?? 0} obiektów
          </span>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold px-5 pt-4">Obiekty</h2>
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="px-5 py-2 font-medium">Obiekt</th>
              <th className="px-5 py-2 font-medium">Właściciel</th>
              <th className="px-5 py-2 font-medium">Plan</th>
              <th className="px-5 py-2 font-medium">Typy / jednostki</th>
              <th className="px-5 py-2 font-medium">Rezerwacje</th>
              <th className="px-5 py-2 font-medium">Utworzony</th>
              <th className="px-5 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => {
              const units = p.unitTypes.flatMap((ut) => ut.units);
              const resCount = units.reduce(
                (s, u) => s + (unitToCount.get(u.id) ?? 0),
                0
              );
              return (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-2">
                    <span className="font-medium">
                      {p.name}
                      {p.suspended && (
                        <span className="ml-1.5 rounded bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px] font-bold align-middle">
                          ZAWIESZONY
                        </span>
                      )}
                    </span>
                    <p className="text-xs text-slate-400">/o/{p.slug}</p>
                  </td>
                  <td className="px-5 py-2">
                    {p.owner.name}
                    <p className="text-xs text-slate-400">{p.owner.email}</p>
                  </td>
                  <td className="px-5 py-2">
                    <form action={superSetPlan} className="flex items-center gap-1">
                      <input type="hidden" name="propertyId" value={p.id} />
                      <select
                        name="plan"
                        defaultValue={p.plan}
                        className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
                      >
                        {PLANS.map((pl) => (
                          <option key={pl.key} value={pl.key}>
                            {pl.label} ({pl.priceZl} zł)
                          </option>
                        ))}
                      </select>
                      <button className="text-brand-700 text-xs hover:underline">Zmień</button>
                    </form>
                  </td>
                  <td className="px-5 py-2">
                    {p._count.unitTypes} / {units.length}
                  </td>
                  <td className="px-5 py-2">{resCount}</td>
                  <td className="px-5 py-2 text-slate-500">
                    {p.createdAt.toLocaleDateString("pl-PL")}
                  </td>
                  <td className="px-5 py-2">
                    <Link
                      href={`/superadmin/obiekt/${p.id}`}
                      className="text-brand-700 text-xs font-semibold hover:underline whitespace-nowrap"
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
    </div>
  );
}
