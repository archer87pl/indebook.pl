import { addDaysISO, todayISO } from "@/lib/dates";

/**
 * Formularz wyszukiwania terminu.
 * variant="inline" — poziomy pasek (wyniki, listy);
 * variant="widget" — pionowy widget rezerwacji wg 16a (sticky sidebar).
 */
export default function SearchForm({
  action,
  from,
  to,
  guests,
  variant = "inline",
}: {
  action: string;
  from?: string;
  to?: string;
  guests?: number;
  variant?: "inline" | "widget";
}) {
  const today = todayISO();
  const defaultFrom = from ?? addDaysISO(today, 1);
  const defaultTo = to ?? addDaysISO(today, 3);

  if (variant === "widget") {
    return (
      <form action={action}>
        <div className="mb-3 overflow-hidden rounded-xl border border-slate-300">
          <div className="flex">
            <label className="flex-1 border-r border-slate-200 px-3 py-2">
              <span className="th block">Przyjazd</span>
              <input
                type="date"
                name="from"
                required
                min={today}
                defaultValue={defaultFrom}
                className="mt-0.5 w-full bg-transparent text-[13px] font-semibold focus:outline-none"
              />
            </label>
            <label className="flex-1 px-3 py-2">
              <span className="th block">Wyjazd</span>
              <input
                type="date"
                name="to"
                required
                min={addDaysISO(today, 1)}
                defaultValue={defaultTo}
                className="mt-0.5 w-full bg-transparent text-[13px] font-semibold focus:outline-none"
              />
            </label>
          </div>
          <label className="block border-t border-slate-200 px-3 py-2">
            <span className="th block">Goście</span>
            <input
              type="number"
              name="guests"
              min={1}
              max={12}
              defaultValue={guests ?? 2}
              className="mt-0.5 w-full bg-transparent text-[13px] font-semibold focus:outline-none"
            />
          </label>
        </div>
        <button type="submit" className="btn-primary h-12 w-full text-sm">
          Sprawdź dostępność
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="card flex flex-wrap items-end gap-4 p-4">
      <label className="label">
        Przyjazd
        <input
          type="date"
          name="from"
          required
          min={today}
          defaultValue={defaultFrom}
          className="input"
        />
      </label>
      <label className="label">
        Wyjazd
        <input
          type="date"
          name="to"
          required
          min={addDaysISO(today, 1)}
          defaultValue={defaultTo}
          className="input"
        />
      </label>
      <label className="label">
        Goście
        <input
          type="number"
          name="guests"
          min={1}
          max={12}
          defaultValue={guests ?? 2}
          className="input w-24"
        />
      </label>
      <button type="submit" className="btn-primary">
        Szukaj terminu
      </button>
    </form>
  );
}
