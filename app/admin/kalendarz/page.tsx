import Link from "next/link";
import { adminAddBlock, adminDeleteBlock } from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { addDaysISO, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function monthRange(m: string): { first: string; days: string[] } {
  const first = `${m}-01`;
  const days: string[] = [];
  for (let d = first; d.slice(0, 7) === m; d = addDaysISO(d, 1)) days.push(d);
  return { first, days };
}

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const total = y * 12 + (mo - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export default async function CalendarPage(props: {
  searchParams: Promise<{ m?: string; error?: string; synced?: string }>;
}) {
  const { property } = await requireOwner();
  const sp = await props.searchParams;
  const today = todayISO();
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : today.slice(0, 7);
  const { days } = monthRange(month);
  const monthStart = days[0];
  const monthEnd = addDaysISO(days[days.length - 1], 1);

  const units = await prisma.unit.findMany({
    where: { unitType: { propertyId: property.id } },
    include: {
      unitType: true,
      reservations: {
        where: {
          checkIn: { lt: monthEnd },
          checkOut: { gt: monthStart },
          OR: [
            { status: "CONFIRMED" },
            { status: "PENDING", expiresAt: { gt: new Date() } },
          ],
        },
      },
      blocks: { where: { startDate: { lt: monthEnd }, endDate: { gt: monthStart } } },
    },
    orderBy: [{ unitTypeId: "asc" }, { id: "asc" }],
  });

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">Kalendarz</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/admin/kalendarz?m=${shiftMonth(month, -1)}`}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
          >
            ←
          </Link>
          <span className="font-semibold capitalize w-40 text-center">{monthLabel}</span>
          <Link
            href={`/admin/kalendarz?m=${shiftMonth(month, 1)}`}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
          >
            →
          </Link>
        </div>
      </div>

      {sp.error && (
        <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {sp.error}
        </p>
      )}
      {sp.synced && (
        <p className="alert-success">
          ✓ Synchronizacja iCal zakończona — zaimportowane terminy: {sp.synced}.
        </p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto p-4">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left pr-3 py-1 font-medium text-slate-500 whitespace-nowrap sticky left-0 bg-white">
                Jednostka
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  className={`w-7 min-w-7 text-center font-normal ${
                    d === today ? "text-brand-700 font-bold" : "text-slate-400"
                  }`}
                >
                  {Number(d.slice(8))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id}>
                <td className="pr-3 py-1 whitespace-nowrap font-medium sticky left-0 bg-white">
                  {u.name}{" "}
                  <span className="text-slate-400 font-normal">
                    {u.unitType.name}
                    {!u.active && " (wył.)"}
                  </span>
                </td>
                {days.map((d) => {
                  const dNext = addDaysISO(d, 1);
                  const reservation = u.reservations.find(
                    (r) => r.checkIn < dNext && r.checkOut > d
                  );
                  const block = u.blocks.find((b) => b.startDate < dNext && b.endDate > d);
                  const cls = reservation
                    ? reservation.status === "PENDING"
                      ? "bg-amber-300"
                      : "bg-brand-600"
                    : block
                      ? "bg-slate-400"
                      : "bg-slate-100";
                  const title = reservation
                    ? `${reservation.code} · ${reservation.guestName}`
                    : block
                      ? `Blokada${block.note ? `: ${block.note}` : ""}`
                      : "";
                  return (
                    <td key={d} className="p-0.5">
                      <div className={`h-6 w-6 rounded ${cls}`} title={title} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-4 mt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-brand-600 inline-block" /> potwierdzona
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-amber-300 inline-block" /> oczekuje na wpłatę
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-slate-400 inline-block" /> blokada
          </span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="font-semibold">Dodaj blokadę (remont, użytek własny)</h2>
          <form action={adminAddBlock} className="space-y-3 text-sm">
            <select
              name="unitId"
              required
              className="border border-slate-300 rounded-lg px-3 py-2 w-full"
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.unitType.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                name="startDate"
                required
                className="border border-slate-300 rounded-lg px-3 py-2"
              />
              <input
                type="date"
                name="endDate"
                required
                className="border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>
            <input
              name="note"
              placeholder="Notatka (opcjonalnie)"
              className="border border-slate-300 rounded-lg px-3 py-2 w-full"
            />
            <button className="bg-slate-700 hover:bg-slate-800 text-white font-semibold rounded-lg px-4 py-2">
              Zablokuj termin
            </button>
            <p className="text-xs text-slate-400">
              Data końcowa działa jak wymeldowanie — nie jest już zablokowana.
            </p>
          </form>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
          <h2 className="font-semibold">Aktywne blokady (ten miesiąc)</h2>
          {units.flatMap((u) =>
            u.blocks.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-medium">{u.name}</span> · {b.startDate} → {b.endDate}
                  {b.note && <span className="text-slate-400"> · {b.note}</span>}
                  {b.source === "ICAL" && (
                    <span className="ml-2 inline-block rounded-full bg-brand-100 text-brand-800 px-2 py-0.5 text-xs font-semibold">
                      iCal
                    </span>
                  )}
                </span>
                {b.source === "MANUAL" && (
                  <form action={adminDeleteBlock}>
                    <input type="hidden" name="id" value={b.id} />
                    <button className="text-red-600 hover:underline">Usuń</button>
                  </form>
                )}
              </div>
            ))
          )}
          {units.every((u) => u.blocks.length === 0) && (
            <p className="text-sm text-slate-400">Brak blokad w tym miesiącu.</p>
          )}
        </div>
      </div>

      <p className="text-sm text-slate-500">
        Synchronizację z Booking.com / Airbnb (import i eksport iCal) znajdziesz w
        zakładce{" "}
        <Link href="/admin/kanaly" className="text-brand-700 font-semibold hover:underline">
          Kanały →
        </Link>
      </p>
    </div>
  );
}
