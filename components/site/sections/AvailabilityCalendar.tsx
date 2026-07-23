"use client";

// Widget dostępności i cen zasilany na żywo z API RezOp. Gość wybiera typ
// pokoju i klika termin (start/koniec) — CTA prowadzi do finalizacji
// rezerwacji na stronie aplikacji (flow hybrydowy).

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

type Day = { date: string; free: number; priceGr: number };

const WEEKDAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
const MONTHS = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function formatZl(gr: number): string {
  return `${Math.round(gr / 100)} zł`;
}

export default function AvailabilityCalendar({
  unitTypes,
  appUrl,
}: {
  unitTypes: { id: number; name: string }[];
  appUrl: string;
}) {
  const [unitTypeId, setUnitTypeId] = useState(unitTypes[0]?.id);
  const [month, setMonth] = useState(currentMonth);
  const [days, setDays] = useState<Day[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });

  useEffect(() => {
    if (!unitTypeId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sites/availability?unitTypeId=${unitTypeId}&month=${month}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setDays(data.days);
      })
      .catch(() => {
        if (!cancelled) setDays(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unitTypeId, month]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  function clickDay(d: Day) {
    if (d.free === 0 || d.date < today) return;
    if (!range.from || (range.from && range.to)) {
      setRange({ from: d.date, to: null });
    } else if (d.date > range.from) {
      setRange({ from: range.from, to: d.date });
    } else {
      setRange({ from: d.date, to: null });
    }
  }

  const inRange = (date: string) =>
    range.from && range.to && date >= range.from && date <= range.to;

  // wyrównanie pierwszego dnia miesiąca do poniedziałku
  const offset = days?.length
    ? (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7
    : 0;

  const [y, m] = month.split("-").map(Number);
  const minMonth = currentMonth();

  return (
    <div className="rounded-2xl border border-[var(--site-text)]/10 bg-[var(--site-bg)] p-4 sm:p-6">
      {unitTypes.length > 1 && (
        <select
          value={unitTypeId}
          onChange={(e) => {
            setUnitTypeId(Number(e.target.value));
            setRange({ from: null, to: null });
          }}
          className="mb-4 w-full rounded-lg border border-[var(--site-text)]/15 bg-[var(--site-bg)] px-3 py-2 text-sm"
          aria-label="Wybierz apartament"
        >
          {unitTypes.map((ut) => (
            <option key={ut.id} value={ut.id}>
              {ut.name}
            </option>
          ))}
        </select>
      )}

      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((mo) => shiftMonth(mo, -1))}
          disabled={month <= minMonth}
          className="rounded-full p-2 hover:bg-[var(--site-text)]/5 disabled:opacity-30"
          aria-label="Poprzedni miesiąc"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="font-semibold">
          {MONTHS[m - 1]} {y}
        </span>
        <button
          type="button"
          onClick={() => setMonth((mo) => shiftMonth(mo, 1))}
          className="rounded-full p-2 hover:bg-[var(--site-text)]/5"
          aria-label="Następny miesiąc"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[var(--site-muted)]">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-[var(--site-muted)]">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : days ? (
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: offset }, (_, i) => (
            <div key={`e${i}`} />
          ))}
          {days.map((d) => {
            const past = d.date < today;
            const busy = d.free === 0;
            const selected = d.date === range.from || d.date === range.to || inRange(d.date);
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => clickDay(d)}
                disabled={past || busy}
                className={[
                  "flex flex-col items-center rounded-lg py-1.5 text-sm transition-colors",
                  past || busy
                    ? "cursor-not-allowed text-[var(--site-muted)] opacity-40 line-through"
                    : "hover:bg-[var(--site-primary)]/10",
                  selected
                    ? "bg-[var(--site-primary)] text-[var(--site-primary-text)] hover:bg-[var(--site-primary)]"
                    : "",
                ].join(" ")}
              >
                <span className="font-medium">{Number(d.date.slice(8, 10))}</span>
                {!past && !busy && (
                  <span className={`text-[10px] ${selected ? "opacity-90" : "text-[var(--site-muted)]"}`}>
                    {formatZl(d.priceGr)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-[var(--site-muted)]">
          Nie udało się pobrać dostępności. Spróbuj ponownie.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--site-muted)]">
          {range.from && !range.to && "Wybierz dzień wyjazdu"}
          {!range.from && "Kliknij dzień przyjazdu i wyjazdu"}
          {range.from && range.to && `Pobyt ${range.from} → ${range.to}`}
        </p>
        {range.from && range.to && unitTypeId && (
          <a
            href={`${appUrl}/rezerwuj/${unitTypeId}?from=${range.from}&to=${range.to}&guests=2`}
            className="rounded-full bg-[var(--site-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--site-primary-text)] transition-opacity hover:opacity-90"
          >
            Zarezerwuj ten termin
          </a>
        )}
      </div>
    </div>
  );
}
