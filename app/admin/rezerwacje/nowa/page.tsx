import { Info } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { adminCreateReservation } from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { addDaysISO, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function NewReservationPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { property } = await requireOwner();
  const sp = await props.searchParams;
  const unitTypes = await prisma.unitType.findMany({
    where: { propertyId: property.id },
    orderBy: { id: "asc" },
    include: { units: { where: { active: true }, select: { id: true } } },
  });
  const input = "input w-full";

  return (
    <div className="space-y-4">
      {sp.error && <p className="alert-error">{sp.error}</p>}

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader
            title="Nowa rezerwacja"
            sub="telefoniczna / osobista — zapisywana od razu jako potwierdzona"
          />
          <form action={adminCreateReservation}>
            <CardBody className="max-w-xl space-y-4">
              <label className="label">
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
                <label className="label">
                  Przyjazd
                  <input type="date" name="from" required defaultValue={todayISO()} className={input} />
                </label>
                <label className="label">
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
                <label className="label">
                  Liczba gości
                  <input type="number" name="guests" min={1} defaultValue={2} className={input} />
                </label>
                <label className="label">
                  Cena łączna (zł, puste = z cennika)
                  <input name="totalZl" placeholder="np. 1200" className={input} />
                </label>
              </div>
              <label className="label">
                Imię i nazwisko *
                <input name="guestName" required minLength={3} className={input} />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="label">
                  Telefon
                  <input name="phone" className={input} />
                </label>
                <label className="label">
                  E-mail
                  <input type="email" name="email" className={input} />
                </label>
              </div>
              <label className="label">
                Uwagi
                <textarea name="notes" rows={2} className={input} />
              </label>
              <Button type="submit" size="lg" className="w-full">
                Utwórz rezerwację (potwierdzona)
              </Button>
            </CardBody>
          </form>
        </Card>

        {/* Podsumowanie cennika */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-2.5 text-[13.5px] font-bold">Cennik bazowy</div>
            <div className="space-y-1.5">
              {unitTypes.map((ut) => (
                <div
                  key={ut.id}
                  className="flex items-baseline justify-between gap-2 text-[12.5px] text-slate-600"
                >
                  <span className="min-w-0 truncate">
                    {ut.name}
                    <span className="text-slate-400"> · {ut.units.length} jedn.</span>
                  </span>
                  <span className="tnum flex-none font-semibold text-slate-900">
                    {formatPln(ut.basePriceGr)} / noc
                  </span>
                </div>
              ))}
              {unitTypes.length === 0 && (
                <p className="text-xs text-slate-400">Najpierw dodaj pokoje.</p>
              )}
            </div>
          </Card>
          <div className="flex gap-2.5 rounded-[14px] border border-brand-200 bg-brand-50 p-4 text-[11.5px] leading-relaxed text-slate-600">
            <Info size={15} strokeWidth={2} className="mt-0.5 flex-none text-brand-600" />
            <p>
              Jeśli zostawisz cenę pustą, system policzy ją z cennika (sezony i ceny
              dynamiczne). Gość z podanym e-mailem dostanie potwierdzenie i link do
              meldunku online.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
