import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { adminSetStatus } from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { formatDateShortPl } from "@/lib/dates";
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
  searchParams: Promise<{ status?: string; error?: string; page?: string }>;
}) {
  const { property } = await requireOwner();
  const sp = await props.searchParams;
  const status = sp.status ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const where = {
    unit: { unitType: { propertyId: property.id } },
    ...(status ? { status } : {}),
  };
  const [total, reservations] = await Promise.all([
    prisma.reservation.count({ where }),
    prisma.reservation.findMany({
      where,
      include: { unit: { include: { unitType: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) =>
    `/admin/rezerwacje?${new URLSearchParams({ ...(status ? { status } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          Rezerwacje <span className="text-slate-400 text-base font-normal">({total})</span>
        </h1>
        <div className="flex gap-2">
          <a href="/api/admin/export" className="btn-quiet text-sm">
            ⬇ Eksport CSV
          </a>
          <Link
            href="/admin/rezerwacje/nowa"
            className="bg-brand-700 hover:bg-brand-800 text-white font-semibold rounded-lg px-4 py-2 text-sm"
          >
            + Nowa rezerwacja
          </Link>
        </div>
      </div>

      {sp.error && (
        <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {sp.error}
        </p>
      )}

      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/admin/rezerwacje?status=${f.key}` : "/admin/rezerwacje"}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              status === f.key
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Kod</th>
              <th className="px-4 py-3 font-medium">Gość</th>
              <th className="px-4 py-3 font-medium">Kontakt</th>
              <th className="px-4 py-3 font-medium">Pokój</th>
              <th className="px-4 py-3 font-medium">Termin</th>
              <th className="px-4 py-3 font-medium">Kwota</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 align-top">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={`/r/${r.code}`} className="hover:underline">
                    {r.code}
                  </Link>
                  <p className="text-slate-400">{r.source === "MANUAL" ? "ręczna" : "online"}</p>
                </td>
                <td className="px-4 py-3">
                  {r.guestName}
                  <p className="text-slate-400">{r.guests} os.</p>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {r.email}
                  {r.phone && <p>{r.phone}</p>}
                </td>
                <td className="px-4 py-3">
                  {r.unit.unitType.name} ({r.unit.name})
                </td>
                <td className="px-4 py-3">
                  {formatDateShortPl(r.checkIn)} → {formatDateShortPl(r.checkOut)}
                </td>
                <td className="px-4 py-3">{formatPln(r.totalGr)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link href={`/admin/rezerwacje/${r.id}`} className="text-brand-700 hover:underline">
                      Edytuj
                    </Link>
                    {r.status !== "CONFIRMED" && (
                      <form action={adminSetStatus}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="CONFIRMED" />
                        <button className="text-emerald-700 hover:underline">Potwierdź</button>
                      </form>
                    )}
                    {r.status !== "CANCELLED" && (
                      <form action={adminSetStatus}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="CANCELLED" />
                        <button className="text-red-600 hover:underline">Anuluj</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {reservations.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Brak rezerwacji
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="btn-quiet py-1.5">
              ← Poprzednia
            </Link>
          ) : (
            <span className="btn-quiet py-1.5 opacity-40 pointer-events-none">← Poprzednia</span>
          )}
          <span className="text-slate-500">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={pageHref(page + 1)} className="btn-quiet py-1.5">
              Następna →
            </Link>
          ) : (
            <span className="btn-quiet py-1.5 opacity-40 pointer-events-none">Następna →</span>
          )}
        </div>
      )}
    </div>
  );
}
