import { adminCreateReservation } from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { addDaysISO, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewReservationPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { property } = await requireOwner();
  const sp = await props.searchParams;
  const unitTypes = await prisma.unitType.findMany({
    where: { propertyId: property.id },
    orderBy: { id: "asc" },
  });
  const input = "border border-slate-300 rounded-lg px-3 py-2 w-full";
  const label = "flex flex-col gap-1 text-sm font-medium";

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Nowa rezerwacja (telefoniczna / osobista)</h1>
      {sp.error && (
        <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {sp.error}
        </p>
      )}
      <form
        action={adminCreateReservation}
        className="bg-white rounded-xl border border-slate-200 p-6 space-y-4"
      >
        <label className={label}>
          Typ pokoju
          <select name="unitTypeId" required className={input}>
            {unitTypes.map((ut) => (
              <option key={ut.id} value={ut.id}>
                {ut.name} (do {ut.maxGuests} os.)
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className={label}>
            Przyjazd
            <input type="date" name="from" required defaultValue={todayISO()} className={input} />
          </label>
          <label className={label}>
            Wyjazd
            <input
              type="date"
              name="to"
              required
              defaultValue={addDaysISO(todayISO(), 1)}
              className={input}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className={label}>
            Liczba gości
            <input type="number" name="guests" min={1} defaultValue={2} className={input} />
          </label>
          <label className={label}>
            Cena łączna (zł, puste = z cennika)
            <input name="totalZl" placeholder="np. 1200" className={input} />
          </label>
        </div>
        <label className={label}>
          Imię i nazwisko *
          <input name="guestName" required minLength={3} className={input} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className={label}>
            Telefon
            <input name="phone" className={input} />
          </label>
          <label className={label}>
            E-mail
            <input type="email" name="email" className={input} />
          </label>
        </div>
        <label className={label}>
          Uwagi
          <textarea name="notes" rows={2} className={input} />
        </label>
        <button
          type="submit"
          className="w-full bg-brand-700 hover:bg-brand-800 text-white font-semibold rounded-lg px-6 py-2.5"
        >
          Zapisz rezerwację (potwierdzona)
        </button>
      </form>
    </div>
  );
}
