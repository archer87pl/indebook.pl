import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { adminAddBlock, adminDeleteBlock } from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { addDaysISO, isValidISO, monthDays, nightsBetween, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";

export const dynamic = "force-dynamic";

const DOW = ["nd", "pon", "wt", "śr", "czw", "pt", "sob"];

type Bar = {
  key: string;
  startIdx: number;
  span: number;
  label: string;
  sub: string;
  href?: string;
  tone: "direct" | "pending" | "ota" | "block";
};

const BAR_TONE: Record<Bar["tone"], string> = {
  direct: "bg-brand-600 text-white",
  pending: "border-l-[3px] border-accent-400 bg-[#f4e2bd] text-accent-700",
  ota: "border-l-[3px] border-brand-800 bg-brand-200 text-brand-800",
  block: "border-l-[3px] border-slate-400 bg-slate-100 text-slate-500",
};
const BAR_SUB: Record<Bar["tone"], string> = {
  direct: "text-brand-200",
  pending: "text-[#9a7830]",
  ota: "text-brand-700",
  block: "text-slate-400",
};

export default async function CalendarPage(props: {
  searchParams: Promise<{ od?: string; widok?: string; error?: string; synced?: string }>;
}) {
  const { property } = await requireOwner();
  const sp = await props.searchParams;
  const today = todayISO();
  const monthView = sp.widok === "miesiac";

  let days: string[];
  let prevHref: string;
  let nextHref: string;
  if (monthView) {
    const month = /^\d{4}-\d{2}/.test(sp.od ?? "") ? sp.od!.slice(0, 7) : today.slice(0, 7);
    days = monthDays(month);
    const shift = (delta: number) => addDaysISO(`${month}-01`, delta).slice(0, 7);
    prevHref = `/admin/kalendarz?widok=miesiac&od=${shift(-1)}-01`;
    nextHref = `/admin/kalendarz?widok=miesiac&od=${shift(32)}-01`;
  } else {
    const start = isValidISO(sp.od ?? "") ? sp.od! : addDaysISO(today, -3);
    days = Array.from({ length: 14 }, (_, i) => addDaysISO(start, i));
    prevHref = `/admin/kalendarz?od=${addDaysISO(start, -14)}`;
    nextHref = `/admin/kalendarz?od=${addDaysISO(start, 14)}`;
  }
  const windowStart = days[0];
  const windowEnd = addDaysISO(days[days.length - 1], 1);
  const N = days.length;
  const colPct = 100 / N;

  const units = await prisma.unit.findMany({
    where: { unitType: { propertyId: property.id } },
    include: {
      unitType: true,
      reservations: {
        where: {
          checkIn: { lt: windowEnd },
          checkOut: { gt: windowStart },
          OR: [
            { status: "CONFIRMED" },
            { status: "PENDING", expiresAt: { gt: new Date() } },
          ],
        },
      },
      blocks: {
        where: { startDate: { lt: windowEnd }, endDate: { gt: windowStart } },
        include: { feed: { select: { name: true, channel: true } } },
      },
    },
    orderBy: [{ unitTypeId: "asc" }, { id: "asc" }],
  });

  const idx = (iso: string) => nightsBetween(windowStart, iso);
  const clamp = (from: string, to: string) => {
    const a = Math.max(0, idx(from));
    const b = Math.min(N, idx(to));
    return { startIdx: a, span: Math.max(1, b - a) };
  };

  const rows = units.map((u) => {
    const bars: Bar[] = [
      ...u.reservations.map((r): Bar => {
        const { startIdx, span } = clamp(r.checkIn, r.checkOut);
        return {
          key: `r${r.id}`,
          startIdx,
          span,
          label: r.guestName,
          sub: `${r.code} · ${r.status === "PENDING" ? "oczekuje płatności" : r.source === "MANUAL" ? "ręczna" : "bezpośr."}`,
          href: `/admin/rezerwacje/${r.id}`,
          tone: r.status === "PENDING" ? "pending" : "direct",
        };
      }),
      ...u.blocks.map((b): Bar => {
        const { startIdx, span } = clamp(b.startDate, b.endDate);
        const ical = b.source === "ICAL";
        return {
          key: `b${b.id}`,
          startIdx,
          span,
          label: ical ? (b.feed?.name || b.feed?.channel || "OTA") : "Blokada",
          sub: ical ? "iCal" : b.note || "użytek własny",
          tone: ical ? "ota" : "block",
        };
      }),
    ];
    return { unit: u, bars };
  });

  // Podsumowanie okna
  const totalUnitNights = units.length * N;
  const occupied = new Set<string>();
  let pendingCount = 0;
  let windowRevenueGr = 0;
  for (const u of units) {
    for (const r of u.reservations) {
      if (r.status === "PENDING") pendingCount++;
      const nights = nightsBetween(r.checkIn, r.checkOut);
      const { startIdx, span } = clamp(r.checkIn, r.checkOut);
      if (nights > 0) windowRevenueGr += Math.round((r.totalGr * span) / nights);
      for (let i = startIdx; i < startIdx + span; i++) occupied.add(`${u.id}:${i}`);
    }
    for (const b of u.blocks) {
      const { startIdx, span } = clamp(b.startDate, b.endDate);
      for (let i = startIdx; i < startIdx + span; i++) occupied.add(`${u.id}:${i}`);
    }
  }
  const occupancyPct =
    totalUnitNights > 0 ? Math.round((occupied.size / totalUnitNights) * 100) : 0;

  const rangeLabel = `${Number(windowStart.slice(8, 10))} ${new Date(`${windowStart}T00:00:00`).toLocaleDateString("pl-PL", { month: "short" })} – ${Number(days[N - 1].slice(8, 10))} ${new Date(`${days[N - 1]}T00:00:00`).toLocaleDateString("pl-PL", { month: "short", year: "numeric" })}`;

  return (
    <div className="space-y-4">
      {/* Pasek sterowania */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-0.5">
          <Link
            href={prevHref}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-brand-600 hover:text-brand-700"
            aria-label="Poprzedni zakres"
          >
            <ChevronLeft size={15} strokeWidth={2} />
          </Link>
          <span className="tnum px-3 text-[13px] font-bold">{rangeLabel}</span>
          <Link
            href={nextHref}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-brand-600 hover:text-brand-700"
            aria-label="Następny zakres"
          >
            <ChevronRight size={15} strokeWidth={2} />
          </Link>
        </div>
        <div className="flex gap-0.5 rounded-[9px] bg-slate-100 p-0.5">
          <Link
            href="/admin/kalendarz"
            className={`rounded-md px-3 py-1.5 text-[11.5px] font-bold ${!monthView ? "bg-white text-brand-900 shadow-sm" : "text-slate-500"}`}
          >
            2 tyg.
          </Link>
          <Link
            href="/admin/kalendarz?widok=miesiac"
            className={`rounded-md px-3 py-1.5 text-[11.5px] font-bold ${monthView ? "bg-white text-brand-900 shadow-sm" : "text-slate-500"}`}
          >
            Miesiąc
          </Link>
        </div>
        <div className="ml-auto flex items-center gap-3.5 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] bg-brand-600" /> bezpośrednia
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] border border-brand-300 bg-brand-200" /> OTA
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] border border-[#e0c07a] bg-[#f4e2bd]" /> oczekuje
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] border border-slate-300 bg-slate-100" /> blokada
          </span>
        </div>
      </div>

      {/* Siatka: jednostki × dni */}
      <Card>
        <div className="overflow-x-auto">
          <div className="min-w-[880px]">
            <div className="flex border-b border-slate-200 bg-slate-50">
              <div className="th w-[172px] flex-none border-r border-slate-200 px-3.5 py-2.5">
                Jednostka
              </div>
              <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${N},1fr)` }}>
                {days.map((d) => {
                  const dow = new Date(`${d}T00:00:00`).getDay();
                  const weekend = dow === 0 || dow === 6;
                  const isToday = d === today;
                  return (
                    <div
                      key={d}
                      className={`py-1.5 text-center ${isToday ? "bg-brand-50" : weekend ? "bg-[#fbf7ef]" : ""}`}
                    >
                      <div
                        className={`text-[9.5px] font-semibold ${isToday ? "font-bold text-brand-600" : weekend ? "text-accent-400" : "text-slate-400"}`}
                      >
                        {DOW[dow]}
                      </div>
                      <div
                        className={`nums text-[13px] font-semibold ${isToday ? "font-bold text-brand-600" : ""}`}
                      >
                        {Number(d.slice(8, 10))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {rows.map(({ unit, bars }) => (
              <div key={unit.id} className="flex border-b border-slate-100 last:border-0">
                <div className="flex w-[172px] flex-none items-center border-r border-slate-200 px-3.5">
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-semibold">
                      {unit.name}
                      {!unit.active && (
                        <span className="font-normal text-slate-400"> (wył.)</span>
                      )}
                    </div>
                    <div className="truncate text-[10.5px] text-slate-400">
                      {unit.unitType.name} · {unit.unitType.maxGuests} os · od{" "}
                      {formatPln(unit.unitType.basePriceGr)}
                    </div>
                  </div>
                </div>
                <div
                  className="relative h-[54px] flex-1"
                  style={{
                    background: `repeating-linear-gradient(to right, transparent, transparent calc(${colPct}% - 1px), #eef3f0 calc(${colPct}% - 1px), #eef3f0 ${colPct}%)`,
                  }}
                >
                  {bars.map((bar) => {
                    const style = {
                      left: `calc(${bar.startIdx * colPct}% + 3px)`,
                      width: `calc(${bar.span * colPct}% - 6px)`,
                    };
                    const inner = (
                      <>
                        <span className="truncate text-[11.5px] font-bold">{bar.label}</span>
                        <span className={`tnum truncate text-[9.5px] ${BAR_SUB[bar.tone]}`}>
                          {bar.sub}
                        </span>
                      </>
                    );
                    return bar.href ? (
                      <Link
                        key={bar.key}
                        href={bar.href}
                        title={`${bar.label} · ${bar.sub}`}
                        className={`absolute top-[9px] flex h-9 flex-col justify-center overflow-hidden rounded-lg px-2.5 transition-opacity hover:opacity-85 ${BAR_TONE[bar.tone]}`}
                        style={style}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div
                        key={bar.key}
                        title={`${bar.label} · ${bar.sub}`}
                        className={`absolute top-[9px] flex h-9 flex-col justify-center overflow-hidden rounded-lg px-2.5 ${BAR_TONE[bar.tone]}`}
                        style={style}
                      >
                        {inner}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {units.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-400">
                Najpierw dodaj pokoje i jednostki.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Podsumowanie okna */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold text-slate-500">Obłożenie w oknie</div>
          <div className="nums mt-1 text-[22px] font-bold">{occupancyPct}%</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold text-slate-500">Wolne jednostko-noce</div>
          <div className="nums mt-1 text-[22px] font-bold">
            {Math.max(0, totalUnitNights - occupied.size)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold text-slate-500">Przychód z okna</div>
          <div className="nums mt-1 text-[22px] font-bold">{formatPln(windowRevenueGr)}</div>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${pendingCount > 0 ? "border-accent-200 bg-[#fdf6ea]" : "border-slate-200 bg-white"}`}
        >
          <div
            className={`text-[11px] font-semibold ${pendingCount > 0 ? "text-[#9a7830]" : "text-slate-500"}`}
          >
            Do wyjaśnienia
          </div>
          <div
            className={`mt-1.5 text-[13px] font-bold ${pendingCount > 0 ? "text-accent-700" : "text-slate-400"}`}
          >
            {pendingCount > 0
              ? `${pendingCount} rez. oczekuje na płatność`
              : "wszystko rozliczone"}
          </div>
        </div>
      </div>

      {/* Blokady */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[15px] font-bold">Dodaj blokadę</h2>
          <p className="mt-0.5 text-xs text-slate-400">remont, użytek własny</p>
          <form action={adminAddBlock} className="mt-4 space-y-3 text-sm">
            <select name="unitId" required className="input w-full">
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.unitType.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" name="startDate" required className="input" />
              <input type="date" name="endDate" required className="input" />
            </div>
            <input name="note" placeholder="Notatka (opcjonalnie)" className="input w-full" />
            <Button type="submit" variant="quiet">
              Zablokuj termin
            </Button>
            <p className="text-xs text-slate-400">
              Data końcowa działa jak wymeldowanie — nie jest już zablokowana.
            </p>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-bold">Aktywne blokady (w oknie)</h2>
          <div className="mt-3 space-y-2">
            {units.flatMap((u) =>
              u.blocks.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-slate-600">
                    <span className="font-semibold text-slate-900">{u.name}</span> ·{" "}
                    <span className="tnum text-xs">
                      {b.startDate} → {b.endDate}
                    </span>
                    {b.note && <span className="text-slate-400"> · {b.note}</span>}
                    {b.source === "ICAL" && (
                      <span className="ml-2 inline-block rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                        iCal
                      </span>
                    )}
                  </span>
                  {b.source === "MANUAL" && (
                    <form action={adminDeleteBlock}>
                      <input type="hidden" name="id" value={b.id} />
                      <button className="text-xs font-semibold text-danger-600 hover:underline">
                        Usuń
                      </button>
                    </form>
                  )}
                </div>
              )),
            )}
            {units.every((u) => u.blocks.length === 0) && (
              <p className="text-sm text-slate-400">Brak blokad w tym zakresie.</p>
            )}
          </div>
        </Card>
      </div>

      <p className="text-sm text-slate-500">
        Synchronizację z Booking.com / Airbnb (import i eksport iCal) znajdziesz w zakładce{" "}
        <Link href="/admin/kanaly" className="font-semibold text-brand-600 hover:underline">
          Kanały →
        </Link>
      </p>
    </div>
  );
}
