import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { channelDef } from "@/lib/channels";
import { eachNight, monthDays, nightsBetween, shiftMonth, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Liczba nocy rezerwacji przypadających w przedziale [start, end). */
function nightsWithin(checkIn: string, checkOut: string, start: string, end: string) {
  const from = checkIn > start ? checkIn : start;
  const to = checkOut < end ? checkOut : end;
  return to > from ? nightsBetween(from, to) : 0;
}

type ChannelRow = {
  key: string;
  label: string;
  nights: number;
  revenueGr: number;
  estimated: boolean;
};

export default async function ReportsPage(props: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { property } = await requireOwner();
  const sp = await props.searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : todayISO().slice(0, 7);
  const days = monthDays(month);
  const monthStart = days[0];
  const monthEnd = `${shiftMonth(month, 1)}-01`;

  const [unitTypes, reservations, channelBlocks] = await Promise.all([
    prisma.unitType.findMany({
      where: { propertyId: property.id },
      include: { units: { where: { active: true } } },
      orderBy: { id: "asc" },
    }),
    prisma.reservation.findMany({
      where: {
        unit: { unitType: { propertyId: property.id } },
        status: "CONFIRMED",
        checkIn: { lt: monthEnd },
        checkOut: { gt: monthStart },
      },
      include: { unit: true },
    }),
    prisma.block.findMany({
      where: {
        source: "ICAL",
        unit: { unitType: { propertyId: property.id } },
        startDate: { lt: monthEnd },
        endDate: { gt: monthStart },
      },
      include: {
        feed: true,
        unit: { include: { unitType: { include: { seasons: true } } } },
      },
    }),
  ]);

  // ---- przychód i noce wg typu pokoju (rezerwacje bezpośrednie) ----
  type Row = { revenueGr: number; nights: number };
  const perType = new Map<number, Row>(
    unitTypes.map((ut) => [ut.id, { revenueGr: 0, nights: 0 }])
  );
  let stayNightsSum = 0;

  // ---- rozbicie wg kanału ----
  const channels = new Map<string, ChannelRow>();
  const addChannel = (key: string, label: string, nights: number, revenueGr: number, estimated: boolean) => {
    const row = channels.get(key) ?? { key, label, nights: 0, revenueGr: 0, estimated };
    row.nights += nights;
    row.revenueGr += revenueGr;
    row.estimated = row.estimated || estimated;
    channels.set(key, row);
  };

  for (const r of reservations) {
    const totalNights = nightsBetween(r.checkIn, r.checkOut);
    const inMonth = nightsWithin(r.checkIn, r.checkOut, monthStart, monthEnd);
    if (inMonth === 0 || totalNights === 0) continue;
    const revenueInMonth = Math.round((r.totalGr / totalNights) * inMonth);
    const row = perType.get(r.unit.unitTypeId);
    if (row) {
      row.revenueGr += revenueInMonth;
      row.nights += inMonth;
    }
    stayNightsSum += totalNights;
    if (r.source === "MANUAL") {
      addChannel("MANUAL", "🖊️ Recepcja (ręczne)", inMonth, revenueInMonth, false);
    } else {
      addChannel("DIRECT", "🌐 Strona obiektu (online)", inMonth, revenueInMonth, false);
    }
  }

  // kanały iCal: noce zajęte + przychód szacowany wg cennika (iCal nie niesie cen)
  for (const b of channelBlocks) {
    const from = b.startDate > monthStart ? b.startDate : monthStart;
    const to = b.endDate < monthEnd ? b.endDate : monthEnd;
    if (to <= from) continue;
    const ut = b.unit.unitType;
    let estGr = 0;
    for (const night of eachNight(from, to)) {
      const season = ut.seasons.find((s) => s.startDate <= night && night <= s.endDate);
      estGr += season?.priceGr ?? ut.basePriceGr;
    }
    const def = channelDef(b.feed?.channel ?? "OTHER");
    addChannel(def.key, `${def.emoji} ${def.label}`, nightsBetween(from, to), estGr, true);
  }

  const channelRows = [...channels.values()].sort((a, b) => b.nights - a.nights);
  const directRevenueGr = channelRows
    .filter((c) => !c.estimated)
    .reduce((s, c) => s + c.revenueGr, 0);
  const totalOccupied = channelRows.reduce((s, c) => s + c.nights, 0);
  const directOccupied = [...perType.values()].reduce((s, r) => s + r.nights, 0);

  const activeUnits = unitTypes.reduce((s, ut) => s + ut.units.length, 0);
  const capacity = activeUnits * days.length;
  const occupancy = capacity > 0 ? (totalOccupied / capacity) * 100 : 0;
  const adrGr = directOccupied > 0 ? Math.round(directRevenueGr / directOccupied) : 0;
  const avgStay = reservations.length > 0 ? stayNightsSum / reservations.length : 0;

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  });

  const stats = [
    { label: "Przychód bezpośredni", value: formatPln(directRevenueGr) },
    { label: "Obłożenie (z kanałami)", value: `${occupancy.toFixed(0)}%` },
    { label: "ADR — sprzedaż bezpośrednia", value: formatPln(adrGr) },
    {
      label: "Śr. długość pobytu",
      value: avgStay > 0 ? `${avgStay.toFixed(1)} nocy` : "—",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">Raporty</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/admin/raporty?m=${shiftMonth(month, -1)}`}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
          >
            ←
          </Link>
          <span className="font-semibold capitalize w-40 text-center">{monthLabel}</span>
          <Link
            href={`/admin/raporty?m=${shiftMonth(month, 1)}`}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
          >
            →
          </Link>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <h2 className="font-semibold px-5 pt-4">Według kanału sprzedaży</h2>
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="px-5 py-2 font-medium">Kanał</th>
              <th className="px-5 py-2 font-medium">Zajęte noce</th>
              <th className="px-5 py-2 font-medium w-1/3">Udział w obłożeniu</th>
              <th className="px-5 py-2 font-medium">Przychód</th>
            </tr>
          </thead>
          <tbody>
            {channelRows.map((c) => {
              const share = totalOccupied > 0 ? (c.nights / totalOccupied) * 100 : 0;
              return (
                <tr key={c.key} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-2 font-medium">{c.label}</td>
                  <td className="px-5 py-2">{c.nights}</td>
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div
                          className={`h-3 rounded-full ${c.estimated ? "bg-accent-400" : "bg-brand-600"}`}
                          style={{ width: `${share.toFixed(1)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 w-10 text-right">
                        {share.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-2">
                    {c.estimated ? (
                      <span title="Szacunek wg cennika — iCal nie przekazuje cen">
                        ~{formatPln(c.revenueGr)}{" "}
                        <span className="text-xs text-slate-400">(szacunek)</span>
                      </span>
                    ) : (
                      formatPln(c.revenueGr)
                    )}
                  </td>
                </tr>
              );
            })}
            {channelRows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-slate-400">
                  Brak danych w tym miesiącu
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="px-5 py-3 text-xs text-slate-400">
          Noce z kanałów iCal (Booking.com, Airbnb…) liczone z importowanych
          kalendarzy; ich przychód to szacunek według Twojego cennika — portale nie
          przekazują cen w iCal.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <h2 className="font-semibold px-5 pt-4">Według typu pokoju (sprzedaż bezpośrednia)</h2>
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="px-5 py-2 font-medium">Typ</th>
              <th className="px-5 py-2 font-medium">Jednostki aktywne</th>
              <th className="px-5 py-2 font-medium">Zajęte noce</th>
              <th className="px-5 py-2 font-medium">Obłożenie</th>
              <th className="px-5 py-2 font-medium">Przychód</th>
            </tr>
          </thead>
          <tbody>
            {unitTypes.map((ut) => {
              const row = perType.get(ut.id)!;
              const cap = ut.units.length * days.length;
              return (
                <tr key={ut.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-2 font-medium">{ut.name}</td>
                  <td className="px-5 py-2">{ut.units.length}</td>
                  <td className="px-5 py-2">{row.nights}</td>
                  <td className="px-5 py-2">
                    {cap > 0 ? `${((row.nights / cap) * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-5 py-2">{formatPln(row.revenueGr)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-5 py-3 text-xs text-slate-400">
          Przychód liczony proporcjonalnie do nocy przypadających w miesiącu, tylko z
          rezerwacji potwierdzonych. Obłożenie względem jednostek aktywnych w sprzedaży.
        </p>
      </div>
    </div>
  );
}
