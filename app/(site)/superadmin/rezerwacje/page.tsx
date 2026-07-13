import Link from "next/link";
import { Search } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import Tabs from "@/components/ui/Tabs";
import { requireSuperadmin } from "@/lib/auth";
import { formatRangeShortPl, nightsBetween } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "", label: "Wszystkie" },
  { key: "PENDING", label: "Oczekujące" },
  { key: "CONFIRMED", label: "Potwierdzone" },
  { key: "CANCELLED", label: "Anulowane" },
];

const PAGE_SIZE = 50;

/** Globalny podgląd rezerwacji całej platformy (wszystkie obiekty). */
export default async function SuperadminReservationsPage(props: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; pid?: string }>;
}) {
  await requireSuperadmin();
  const sp = await props.searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.status ?? "";
  const propertyId = Number(sp.pid) || 0;
  const page = Math.max(1, Number(sp.page) || 1);

  const where = {
    ...(propertyId ? { unit: { unitType: { propertyId } } } : {}),
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" as const } },
            { guestName: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            {
              unit: {
                unitType: {
                  property: { name: { contains: q, mode: "insensitive" as const } },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [total, reservations, filteredProperty] = await prisma.$transaction([
    prisma.reservation.count({ where }),
    prisma.reservation.findMany({
      where,
      include: {
        unit: { include: { unitType: { include: { property: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.property.findUnique({
      where: { id: propertyId || -1 },
      select: { name: true },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (extra: Record<string, string>) =>
    `/superadmin/rezerwacje?${new URLSearchParams({
      ...(q ? { q } : {}),
      ...(status ? { status } : {}),
      ...(propertyId ? { pid: String(propertyId) } : {}),
      ...extra,
    })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={FILTERS.map((f) => ({
            href: `/superadmin/rezerwacje?${new URLSearchParams({
              ...(q ? { q } : {}),
              ...(propertyId ? { pid: String(propertyId) } : {}),
              ...(f.key ? { status: f.key } : {}),
            })}`,
            label: f.label,
            active: status === f.key,
          }))}
        />
        <form action="/superadmin/rezerwacje" role="search">
          {status && <input type="hidden" name="status" value={status} />}
          {propertyId > 0 && <input type="hidden" name="pid" value={propertyId} />}
          <div className="flex h-9 w-[260px] items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 text-slate-400 focus-within:border-brand-600">
            <Search size={14} strokeWidth={2} />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Kod, gość, e-mail, obiekt…"
              className="w-full bg-transparent text-[12.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
        </form>
      </div>

      {filteredProperty && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          Filtr: obiekt <span className="font-semibold">{filteredProperty.name}</span>
          <Link
            href="/superadmin/rezerwacje"
            className="text-xs font-semibold text-brand-600 hover:underline"
          >
            wyczyść ×
          </Link>
        </p>
      )}

      <Card>
        <CardHeader
          title="Rezerwacje platformy"
          sub={`${total} ${total === 1 ? "rezerwacja" : "rezerwacji"} · wszystkie obiekty`}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="th px-[18px] py-2.5">Kod</th>
                <th className="th px-2 py-2.5">Obiekt</th>
                <th className="th px-2 py-2.5">Gość</th>
                <th className="th px-2 py-2.5">Termin</th>
                <th className="th px-2 py-2.5 text-center">Noce</th>
                <th className="th px-2 py-2.5 text-right">Kwota</th>
                <th className="th px-2 py-2.5">Utworzona</th>
                <th className="th px-[18px] py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-slate-100 transition-colors hover:bg-slate-50"
                >
                  <td className="px-[18px] py-2.5">
                    <Link
                      href={`/r/${r.code}`}
                      className="tnum text-[11px] font-semibold text-brand-600 hover:underline"
                      title="Strona rezerwacji gościa"
                    >
                      {r.code}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5">
                    <Link
                      href={`/superadmin/obiekt/${r.unit.unitType.propertyId}`}
                      className="font-semibold hover:underline"
                    >
                      {r.unit.unitType.property.name}
                    </Link>
                    <p className="text-[11px] text-slate-400">
                      {r.unit.unitType.name} ({r.unit.name})
                    </p>
                  </td>
                  <td className="px-2 py-2.5">
                    {r.guestName}
                    <p className="text-[11px] text-slate-400">{r.email}</p>
                  </td>
                  <td className="tnum px-2 py-2.5 text-slate-600">
                    {formatRangeShortPl(r.checkIn, r.checkOut)}
                  </td>
                  <td className="tnum px-2 py-2.5 text-center text-slate-600">
                    {nightsBetween(r.checkIn, r.checkOut)}
                  </td>
                  <td className="tnum px-2 py-2.5 text-right font-semibold">
                    {formatPln(r.totalGr)}
                  </td>
                  <td className="tnum px-2 py-2.5 text-slate-500">
                    {r.createdAt.toLocaleDateString("pl-PL")}
                  </td>
                  <td className="px-[18px] py-2.5 text-right">
                    {r.status === "CONFIRMED" ? (
                      <Badge tone="success">Potwierdzona</Badge>
                    ) : r.status === "PENDING" ? (
                      <Badge tone="warning">Oczekuje</Badge>
                    ) : (
                      <Badge tone="danger">Anulowana</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {reservations.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-[18px] py-8 text-center text-slate-400">
                    {q ? `Brak wyników dla „${q}”` : "Brak rezerwacji"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Button variant="quiet" size="sm" href={href({ page: String(page - 1) })}>
              ← Poprzednia
            </Button>
          ) : (
            <span className="btn-quiet pointer-events-none px-3 py-1.5 text-xs opacity-40">
              ← Poprzednia
            </span>
          )}
          <span className="tnum text-slate-500">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Button variant="quiet" size="sm" href={href({ page: String(page + 1) })}>
              Następna →
            </Button>
          ) : (
            <span className="btn-quiet pointer-events-none px-3 py-1.5 text-xs opacity-40">
              Następna →
            </span>
          )}
        </div>
      )}
    </div>
  );
}
