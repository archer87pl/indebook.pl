import { addDaysISO, todayISO } from "@/lib/dates";

export default function SearchForm({
  action,
  from,
  to,
  guests,
}: {
  action: string;
  from?: string;
  to?: string;
  guests?: number;
}) {
  const today = todayISO();
  const defaultFrom = from ?? addDaysISO(today, 1);
  const defaultTo = to ?? addDaysISO(today, 3);
  return (
    <form action={action} className="card p-4 flex flex-wrap items-end gap-4">
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
      <button type="submit" className="btn-accent">
        Szukaj terminu
      </button>
    </form>
  );
}
