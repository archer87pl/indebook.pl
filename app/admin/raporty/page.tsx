import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import KpiCard from "@/components/ui/KpiCard";
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

  const [unitTypes, reservations, channelBlocks] = await prisma.$transaction([
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
      addChannel("MANUAL", "Recepcja (ręczne)", inMonth, revenueInMonth, false);
    } else {
      addChannel("DIRECT", "Strona obiektu (online)", inMonth, revenueInMonth, false);
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
    addChannel(def.key, def.label, nightsBetween(from, to), estGr, true);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="quiet"
          size="sm"
          href={`/admin/raporty?m=${shiftMonth(month, -1)}`}
          aria-label="Poprzedni miesiąc"
        >
          <ChevronLeft size={14} strokeWidth={2} />
        </Button>
        <span className="w-40 text-center text-[13px] font-bold capitalize">
          {monthLabel}
        </span>
        <Button
          variant="quiet"
          size="sm"
          href={`/admin/raporty?m=${shiftMonth(month, 1)}`}
          aria-label="Następny miesiąc"
        >
          <ChevronRight size={14} strokeWidth={2} />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          dark
          label="Przychód bezpośredni"
          value={formatPln(directRevenueGr)}
          sub="0 zł prowizji"
        />
        <KpiCard
          label="Obłożenie (z kanałami)"
          value={`${occupancy.toFixed(0)}%`}
          progress={occupancy}
        />
        <KpiCard
          label="ADR — sprzedaż bezpośrednia"
          value={formatPln(adrGr)}
        />
        <KpiCard
          label="Śr. długość pobytu"
          value={avgStay > 0 ? `${avgStay.toFixed(1)} nocy` : "—"}
        />
      </div>

      <Card>
        <CardHeader
          title="Według kanału sprzedaży"
          sub="zajęte noce i przychód wg źródła rezerwacji"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="th px-[18px] py-2.5">Kanał</th>
                <th className="th px-2 py-2.5 text-right">Zajęte noce</th>
                <th className="th w-1/3 px-2 py-2.5">Udział w obłożeniu</th>
                <th className="th px-[18px] py-2.5 text-right">Przychód</th>
              </tr>
            </thead>
            <tbody className="text-slate-600">
              {channelRows.map((c) => {
                const share = totalOccupied > 0 ? (c.nights / totalOccupied) * 100 : 0;
                return (
                  <tr
                    key={c.key}
                    className="border-t border-slate-100 transition-colors hover:bg-slate-50"
                  >
                    <td className="px-[18px] py-2.5 font-semibold text-slate-900">
                      {c.label}
                    </td>
                    <td className="nums px-2 py-2.5 text-right">{c.nights}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-[5px] bg-[#e9efec]">
                          <div
                            className={`h-full rounded-[5px] ${c.estimated ? "bg-brand-300" : "bg-brand-600"}`}
                            style={{ width: `${share.toFixed(1)}%` }}
                          />
                        </div>
                        <span className="nums w-9 text-right text-[11px] text-slate-500">
                          {share.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="tnum whitespace-nowrap px-[18px] py-2.5 text-right font-semibold text-slate-900">
                      {c.estimated ? (
                        <span title="Szacunek wg cennika — iCal nie przekazuje cen">
                          ~{formatPln(c.revenueGr)}{" "}
                          <span className="text-[11px] font-normal text-slate-400">
                            (szacunek)
                          </span>
                        </span>
                      ) : (
                        formatPln(c.revenueGr)
                      )}
                    </td>
                  </tr>
                );
              })}
              {channelRows.length === 0 && (
                <tr className="border-t border-slate-100">
                  <td colSpan={4} className="px-[18px] py-6 text-center text-slate-400">
                    Brak danych w tym miesiącu
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-[18px] py-3 text-[11px] text-slate-400">
          Noce z kanałów iCal (Booking.com, Airbnb…) liczone z importowanych
          kalendarzy; ich przychód to szacunek według Twojego cennika — portale nie
          przekazują cen w iCal.
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Według typu pokoju"
          sub="sprzedaż bezpośrednia"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="th px-[18px] py-2.5">Typ</th>
                <th className="th px-2 py-2.5 text-right">Jednostki aktywne</th>
                <th className="th px-2 py-2.5 text-right">Zajęte noce</th>
                <th className="th px-2 py-2.5 text-right">Obłożenie</th>
                <th className="th px-[18px] py-2.5 text-right">Przychód</th>
              </tr>
            </thead>
            <tbody className="text-slate-600">
              {unitTypes.map((ut) => {
                const row = perType.get(ut.id)!;
                const cap = ut.units.length * days.length;
                const pct = cap > 0 ? (row.nights / cap) * 100 : null;
                return (
                  <tr
                    key={ut.id}
                    className="border-t border-slate-100 transition-colors hover:bg-slate-50"
                  >
                    <td className="px-[18px] py-2.5 font-semibold text-slate-900">
                      {ut.name}
                    </td>
                    <td className="nums px-2 py-2.5 text-right">{ut.units.length}</td>
                    <td className="nums px-2 py-2.5 text-right">{row.nights}</td>
                    <td className="nums px-2 py-2.5 text-right">
                      {pct != null ? (
                        <span
                          className={`font-bold ${pct >= 80 ? "text-brand-600" : "text-slate-600"}`}
                        >
                          {pct.toFixed(0)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="tnum whitespace-nowrap px-[18px] py-2.5 text-right font-semibold text-slate-900">
                      {formatPln(row.revenueGr)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-[18px] py-3 text-[11px] text-slate-400">
          Przychód liczony proporcjonalnie do nocy przypadających w miesiącu, tylko z
          rezerwacji potwierdzonych. Obłożenie względem jednostek aktywnych w sprzedaży.
        </p>
      </Card>
    </div>
  );
}
