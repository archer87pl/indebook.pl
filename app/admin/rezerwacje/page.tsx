import Link from "next/link";
import { Download, MessageSquare, Plus, Search } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import Tabs from "@/components/ui/Tabs";
import { adminSetStatus } from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
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

export default async function ReservationsPage(props: {
  searchParams: Promise<{ status?: string; error?: string; page?: string; q?: string }>;
}) {
  const { property } = await requireOwner();
  const sp = await props.searchParams;
  const status = sp.status ?? "";
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const searchWhere = q
    ? {
        OR: [
          { code: { contains: q, mode: "insensitive" as const } },
          { guestName: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const baseWhere = {
    unit: { unitType: { propertyId: property.id } },
    ...searchWhere,
  };
  const where = { ...baseWhere, ...(status ? { status } : {}) };

  // groupBy poza $transaction — w tablicy transakcji Prisma gubi wąski typ _count
  const byStatus = await prisma.reservation.groupBy({
    by: ["status"],
    where: baseWhere,
    orderBy: { status: "asc" },
    _count: { _all: true },
  });
  const [total, reservations] = await prisma.$transaction([
    prisma.reservation.count({ where }),
    prisma.reservation.findMany({
      where,
      include: {
        unit: { include: { unitType: true } },
        _count: {
          select: { messages: { where: { sender: "GUEST", readAt: null } } },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const countFor = (key: string) =>
    key === ""
      ? byStatus.reduce((sum, s) => sum + s._count._all, 0)
      : (byStatus.find((s) => s.status === key)?._count._all ?? 0);

  const pageHref = (p: number) =>
    `/admin/rezerwacje?${new URLSearchParams({
      ...(q ? { q } : {}),
      ...(status ? { status } : {}),
      ...(p > 1 ? { page: String(p) } : {}),
    })}`;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {sp.error && <p className="alert-error">{sp.error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={FILTERS.map((f) => ({
            href: f.key
              ? `/admin/rezerwacje?${new URLSearchParams({ ...(q ? { q } : {}), status: f.key })}`
              : `/admin/rezerwacje${q ? `?q=${encodeURIComponent(q)}` : ""}`,
            label: f.label,
            count: countFor(f.key),
            active: status === f.key,
          }))}
        />
        <div className="flex items-center gap-2">
          <form action="/admin/rezerwacje" role="search" className="hidden sm:block">
            {status && <input type="hidden" name="status" value={status} />}
            <div className="flex h-9 w-[220px] items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 text-slate-400 focus-within:border-brand-600">
              <Search size={14} strokeWidth={2} />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Kod, gość, e-mail…"
                className="w-full bg-transparent text-[12.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </form>
          <Button variant="quiet" size="md" href="/api/admin/export">
            <Download size={14} strokeWidth={2} /> CSV
          </Button>
          <Button href="/admin/rezerwacje/nowa">
            <Plus size={14} strokeWidth={2.4} /> Nowa
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="th px-[18px] py-2.5">Kod</th>
                <th className="th px-2 py-2.5">Gość</th>
                <th className="th px-2 py-2.5">Jednostka</th>
                <th className="th px-2 py-2.5">Termin</th>
                <th className="th px-2 py-2.5 text-center">Noce</th>
                <th className="th px-2 py-2.5">Kanał</th>
                <th className="th px-2 py-2.5 text-right">Kwota</th>
                <th className="th px-2 py-2.5 text-right">Status</th>
                <th className="th px-[18px] py-2.5 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-slate-100 align-middle transition-colors hover:bg-slate-50"
                >
                  <td className="px-[18px] py-2.5">
                    <Link
                      href={`/admin/rezerwacje/${r.id}`}
                      className="tnum text-[11px] font-semibold text-brand-600 hover:underline"
                    >
                      {r.code}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="font-semibold">{r.guestName}</span>
                    {r._count.messages > 0 && (
                      <Link
                        href={`/admin/rezerwacje/${r.id}#czat`}
                        className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-accent-100 px-1.5 py-px align-middle text-[10.5px] font-bold text-accent-500"
                        title="Nieprzeczytane wiadomości od gościa"
                      >
                        <MessageSquare size={10} strokeWidth={2.4} />
                        {r._count.messages}
                      </Link>
                    )}
                    <p className="text-[11px] text-slate-400">
                      {r.guests} os.
                      {r.checkInStatus === "COMPLETED" && (
                        <span
                          className="ml-1 font-semibold text-info-600"
                          title="Karta meldunkowa wypełniona online"
                        >
                          · meldunek ✓
                        </span>
                      )}
                    </p>
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
                  <td className="px-2 py-2.5 text-slate-600">
                    {r.source === "MANUAL" ? "Ręczna" : "Bezpośrednia"}
                  </td>
                  <td className="tnum px-2 py-2.5 text-right font-semibold">
                    {formatPln(r.totalGr)}
                    {r.discountGr > 0 && (
                      <p className="text-[10.5px] font-normal text-brand-600">
                        rabat {formatPln(r.discountGr)}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {r.status === "CONFIRMED" ? (
                      <Badge tone="success">Potwierdzona</Badge>
                    ) : r.status === "PENDING" ? (
                      <Badge tone="warning">Oczekuje</Badge>
                    ) : (
                      <Badge tone="danger">Anulowana</Badge>
                    )}
                  </td>
                  <td className="px-[18px] py-2.5">
                    <div className="flex items-center justify-end gap-2.5 text-xs font-semibold">
                      <Link
                        href={`/admin/rezerwacje/${r.id}`}
                        className="text-brand-600 hover:underline"
                      >
                        Szczegóły
                      </Link>
                      {r.status !== "CONFIRMED" && (
                        <form action={adminSetStatus}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value="CONFIRMED" />
                          <button className="text-brand-700 hover:underline">Potwierdź</button>
                        </form>
                      )}
                      {r.status !== "CANCELLED" && (
                        <form action={adminSetStatus}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value="CANCELLED" />
                          <button className="text-danger-600 hover:underline">Anuluj</button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {reservations.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-[18px] py-8 text-center text-slate-400">
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
            <Button variant="quiet" size="sm" href={pageHref(page - 1)}>
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
            <Button variant="quiet" size="sm" href={pageHref(page + 1)}>
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
